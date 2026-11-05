import {
  mkdir,
  lstat,
  readFile,
  writeFile,
  rename,
  unlink,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { configFile } from "./client.mjs";
const ttl = 30 * 86400000;
export class RecentStore {
  constructor({ origin, userId, root, env = process.env }) {
    this.scope = createHash("sha256")
      .update(JSON.stringify([origin, userId, root]))
      .digest("hex");
    this.directory = join(dirname(configFile(env)), "recent", this.scope);
    this.file = join(this.directory, "history.json");
    this.queue = Promise.resolve();
  }
  async ensure() {
    // Validate each parent before creating children: never follow a local symlink.
    const base = dirname(dirname(this.directory));
    for (const p of [base, dirname(this.directory), this.directory]) {
      await mkdir(p, { recursive: p === base, mode: 0o700 }).catch((e) => {
        if (e.code !== "EEXIST") throw e;
      });
      const s = await lstat(p);
      if (
        !s.isDirectory() ||
        s.isSymbolicLink() ||
        (p !== base && process.platform !== "win32" && s.mode & 0o077)
      )
        throw Error("Recent history needs a private directory.");
    }
  }

  async list() {
    try {
      await this.ensure();
      const s = await lstat(this.file);
      if (
        !s.isFile() ||
        s.isSymbolicLink() ||
        s.size > 4096 ||
        (process.platform !== "win32" && s.mode & 0o077)
      )
        throw Error("Invalid local history file.");
      const d = JSON.parse(await readFile(this.file, "utf8"));
      if (d.version !== 1 || d.scope !== this.scope || !Array.isArray(d.items))
        return [];
      const seen = new Set();
      return d.items
        .filter(
          (r) =>
            Number.isSafeInteger(r?.id) &&
            r.id > 0 &&
            Number.isFinite(r.at) &&
            r.at <= Date.now() + 60000 &&
            Date.now() - r.at < ttl &&
            !seen.has(r.id) &&
            seen.add(r.id),
        )
        .slice(0, 12);
    } catch (e) {
      if (e.code === "ENOENT") return [];
      throw e;
    }
  }
  record(id) {
    if (!Number.isSafeInteger(id) || id < 1) return Promise.resolve();
    const save = async () => {
      await this.ensure();
      const rows = await this.list();
      const body = JSON.stringify({
          version: 1,
          scope: this.scope,
          items: [
            { id, at: Date.now() },
            ...rows.filter((r) => r.id !== id),
          ].slice(0, 12),
        }),
        temp = join(this.directory, "." + randomBytes(12).toString("hex"));
      try {
        await writeFile(temp, body, { flag: "wx", mode: 0o600 });
        await rename(temp, this.file);
      } finally {
        await unlink(temp).catch((e) => {
          if (e.code !== "ENOENT") throw e;
        });
      }
    };
    this.queue = this.queue.catch(() => {}).then(save);
    return this.queue;
  }
}
