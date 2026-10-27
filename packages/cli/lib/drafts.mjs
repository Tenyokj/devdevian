import {
  mkdir,
  lstat,
  readdir,
  readFile,
  writeFile,
  rename,
  unlink,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { configFile } from "./client.mjs";
const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const MAX = 128 * 1024,
  TTL = 30 * 86400000;
export function draftIdentity(form) {
  return /^[a-f0-9]{64}$/.test(form.draftId || "")
    ? form.draftId
    : digest([
        form.kind,
        form.postId || "",
        form.url || "",
        form.parentId || "",
      ]);
}
export class DraftStore {
  constructor({ origin, userId, root, env = process.env }) {
    this.scope = digest([origin, userId, root]);
    this.directory = join(dirname(configFile(env)), "drafts", this.scope);
    this.root = root;
  }
  async ensure() {
    const base = dirname(dirname(this.directory));
    await mkdir(base, { recursive: true, mode: 0o700 });
    for (const directory of [base, dirname(this.directory), this.directory]) {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const info = await lstat(directory);
      if (!info.isDirectory() || info.isSymbolicLink())
        throw Error("The draft directory must be a real directory.");
    }
  }
  async read(id) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw Error("Invalid draft ID.");
    const file = join(this.directory, id + ".json");
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX)
      throw Error("Invalid draft file.");
    if (process.platform !== "win32" && info.mode & 0o077)
      throw Error("Draft file permissions must be 600.");
    const record = JSON.parse(await readFile(file, "utf8"));
    if (
      !Number.isFinite(record.savedAt) ||
      record.version !== 1 ||
      record.scope !== this.scope ||
      record.id !== id ||
      Date.now() - record.savedAt > TTL ||
      record.savedAt > Date.now() + 60000 ||
      !["publication", "reply", "line", "edit", "community"].includes(
        record.form?.kind,
      ) ||
      !record.form?.values ||
      typeof record.form.values !== "object" ||
      Array.isArray(record.form.values)
    )
      throw Error("Draft expired or is invalid.");
    return record;
  }
  async list() {
    await this.ensure();
    const names = await readdir(this.directory),
      rows = [];
    for (const name of names) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
      try {
        rows.push(await this.read(name.slice(0, -5)));
      } catch {
        /* A corrupt or expired local draft never prevents opening the workspace. */
      }
    }
    return rows.sort((a, b) => b.savedAt - a.savedAt).slice(0, 20);
  }
  async save(form) {
    if (
      ["open", "report"].includes(form.kind) ||
      !["title", "body", "name", "description", "file", "review_focus"].some(
        (key) => String(form.values[key] || "").trim(),
      )
    )
      return;
    await this.ensure();
    const id = draftIdentity(form),
      record = { version: 1, id, scope: this.scope, savedAt: Date.now(), form };
    const body = JSON.stringify(record);
    if (Buffer.byteLength(body) > MAX)
      throw Error("This draft is too large to save locally.");
    const temp = join(this.directory, "." + randomBytes(12).toString("hex"));
    try {
      await writeFile(temp, body, { mode: 0o600, flag: "wx" });
      await rename(temp, join(this.directory, id + ".json"));
    } finally {
      await unlink(temp).catch((e) => {
        if (e.code !== "ENOENT") throw e;
      });
    }
    const rows = await this.list();
    const keep = new Set(rows.map((row) => row.id));
    for (const file of await readdir(this.directory))
      if (/^[a-f0-9]{64}\.json$/.test(file) && !keep.has(file.slice(0, -5)))
        await this.remove(file.slice(0, -5));
    return id;
  }
  async remove(id) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw Error("Invalid draft ID.");
    await unlink(join(this.directory, id + ".json")).catch((e) => {
      if (e.code !== "ENOENT") throw e;
    });
  }
}
