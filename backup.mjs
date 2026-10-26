import { DatabaseSync } from "node:sqlite";
import {
  mkdtemp,
  mkdir,
  open,
  readFile,
  writeFile,
  rm,
  stat,
} from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createHash,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { createGzip, createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
const MAGIC = Buffer.from("DEVBACKUP1\n");
const ephemeral = new Set([
  "sessions",
  "cli_devices",
  "cli_tokens",
  "device_accounts",
  "registrations",
  "password_resets",
  "oauth_states",
  "oauth_link_challenges",
  "auth_rate_limits",
  "upload_reservations",
]);
const identifier = (value) => '"' + value.replaceAll('"', '""') + '"';
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const validPath = (path) =>
  path === "database.sqlite" || /^uploads\/[a-f0-9-]{36}$/.test(path);
function encryptionKey(value) {
  if (!/^[a-f0-9]{64}$/i.test(value || ""))
    throw Error(
      "BACKUP_ENCRYPTION_KEY must be a separately stored 32-byte hexadecimal key.",
    );
  return Buffer.from(value, "hex");
}
async function fileHash(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
// A read transaction pins one database snapshot; it never changes the source.
// We reconstruct SQLite instead of copying a potentially incomplete WAL file.
export function snapshotDatabase(source, destination, maxBytes) {
  const copy = new DatabaseSync(destination);
  const counts = {};
  source.exec("BEGIN");
  try {
    const schema = source
      .prepare(
        "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name",
      )
      .all();
    copy.exec("PRAGMA foreign_keys=OFF; BEGIN");
    for (const table of schema.filter((s) => s.type === "table")) {
      copy.exec(table.sql);
      counts[table.name] = 0;
      if (ephemeral.has(table.name)) continue;
      const columns = source
        .prepare(`PRAGMA table_xinfo(${identifier(table.name)})`)
        .all()
        .filter((c) => !c.hidden)
        .map((c) => c.name);
      const names = columns.map(identifier).join(",");
      const insert = copy.prepare(
        `INSERT INTO ${identifier(table.name)}(${names}) VALUES(${columns.map(() => "?")})`,
      );
      for (let offset = 0; ; offset += 250) {
        const rows = source
          .prepare(
            `SELECT ${names} FROM ${identifier(table.name)} LIMIT 250 OFFSET ?`,
          )
          .all(offset);
        for (const row of rows) insert.run(...columns.map((c) => row[c]));
        counts[table.name] += rows.length;
        const pages = copy.prepare("PRAGMA page_count").get().page_count;
        const size = copy.prepare("PRAGMA page_size").get().page_size;
        if (pages * size > maxBytes)
          throw Error(
            "Backup exceeds BACKUP_MAX_BYTES. Increase the storage budget before retrying.",
          );
        if (rows.length < 250) break;
      }
    }
    for (const entry of schema.filter((s) => s.type !== "table"))
      copy.exec(entry.sql);
    // Preserve sequences even when the largest previously allocated ID was deleted.
    if (schema.some((s) => /AUTOINCREMENT/i.test(s.sql))) {
      for (const row of source
        .prepare("SELECT name,seq FROM sqlite_sequence")
        .all()) {
        copy.prepare("DELETE FROM sqlite_sequence WHERE name=?").run(row.name);
        copy
          .prepare("INSERT INTO sqlite_sequence(name,seq) VALUES(?,?)")
          .run(row.name, row.seq);
      }
    }
    copy.exec("COMMIT");
    source.exec("COMMIT");
    return counts;
  } catch (error) {
    try {
      source.exec("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    copy.close();
  }
}
export async function createBackup({
  db,
  storage,
  output,
  key,
  maxBytes = 50 * 1024 * 1024,
}) {
  const secret = encryptionKey(key);
  const folder = await mkdtemp(join(tmpdir(), "devdevian-backup-"));
  try {
    const database = join(folder, "database.sqlite");
    const tables = snapshotDatabase(db, database, maxBytes);
    const files = [
      {
        path: "database.sqlite",
        size: (await stat(database)).size,
        sha256: await fileHash(database),
      },
    ];
    const snapshot = new DatabaseSync(database, { readOnly: true });
    let uploads;
    try {
      uploads =
        tables.uploads === undefined
          ? []
          : snapshot.prepare("SELECT id,size FROM uploads ORDER BY id").all();
    } finally {
      snapshot.close();
    }
    await mkdir(join(folder, "uploads"), { mode: 0o700 });
    let bytes = files[0].size;
    for (const row of uploads) {
      const path = "uploads/" + row.id;
      if (!validPath(path))
        throw Error("Unexpected upload identifier in database.");
      bytes += row.size;
      if (bytes > maxBytes)
        throw Error(
          "Backup exceeds BACKUP_MAX_BYTES. No files were silently omitted.",
        );
      const body = await storage.get(row.id);
      if (body.length !== row.size)
        throw Error("An uploaded object is missing or has an unexpected size.");
      await writeFile(join(folder, path), body, { mode: 0o600, flag: "wx" });
      files.push({ path, size: body.length, sha256: sha(body) });
    }
    const manifest = {
      format: 1,
      created: new Date().toISOString(),
      tables,
      files,
    };
    const metadata = Buffer.from(JSON.stringify(manifest));
    const length = Buffer.alloc(4);
    length.writeUInt32BE(metadata.length);
    const nonce = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", secret, nonce);
    cipher.setAAD(MAGIC);
    const target = createWriteStream(output, { flags: "wx", mode: 0o600 });
    target.write(Buffer.concat([MAGIC, nonce]));
    async function* contents() {
      yield length;
      yield metadata;
      for (const file of files)
        yield* createReadStream(join(folder, file.path));
    }
    await pipeline(Readable.from(contents()), createGzip(), cipher, target);
    const handle = await open(output, "a");
    try {
      await handle.write(cipher.getAuthTag());
    } finally {
      await handle.close();
    }
    return { tables: Object.keys(tables).length, files: uploads.length, bytes };
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
function exactReader(stream) {
  const iterator = stream[Symbol.asyncIterator]();
  let pending = Buffer.alloc(0);
  return async function read(size) {
    const chunks = [];
    let remaining = size;
    while (remaining) {
      if (!pending.length) {
        const next = await iterator.next();
        if (next.done) throw Error("Truncated backup.");
        pending = next.value;
      }
      const n = Math.min(remaining, pending.length);
      chunks.push(pending.subarray(0, n));
      pending = pending.subarray(n);
      remaining -= n;
    }
    return Buffer.concat(chunks, size);
  };
}
// Restore only into a NEW directory. There is deliberately no overwrite flag
// and no automatic write-back to the production database or object bucket.
export async function restoreBackup({
  input,
  key,
  target,
  maxBytes = 1024 * 1024 * 1024,
}) {
  const secret = encryptionKey(key);
  const temp = await mkdtemp(join(tmpdir(), "devdevian-verify-"));
  let created = false,
    contents;
  try {
    const handle = await open(input, "r");
    let header, tag, size;
    try {
      size = (await handle.stat()).size;
      header = Buffer.alloc(MAGIC.length + 12);
      await handle.read(header, 0, header.length, 0);
      tag = Buffer.alloc(16);
      await handle.read(tag, 0, 16, size - 16);
    } finally {
      await handle.close();
    }
    if (
      !header.subarray(0, MAGIC.length).equals(MAGIC) ||
      size < header.length + 17
    )
      throw Error("Invalid backup format.");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      secret,
      header.subarray(MAGIC.length),
    );
    decipher.setAAD(MAGIC);
    decipher.setAuthTag(tag);
    const compressed = join(temp, "authenticated.gz");
    // Authenticate before parsing/extracting any contents.
    await pipeline(
      createReadStream(input, { start: header.length, end: size - 17 }),
      decipher,
      createWriteStream(compressed, { mode: 0o600, flags: "wx" }),
    );
    contents = createReadStream(compressed).pipe(createGunzip());
    const read = exactReader(contents);
    const metadataSize = (await read(4)).readUInt32BE();
    if (metadataSize > 1024 * 1024) throw Error("Invalid backup manifest.");
    const manifest = JSON.parse((await read(metadataSize)).toString());
    if (
      manifest.format !== 1 ||
      !Array.isArray(manifest.files) ||
      !manifest.files.length ||
      manifest.files.length > 10000 ||
      !manifest.tables
    )
      throw Error("Invalid backup manifest.");
    const seen = new Set();
    let total = 0;
    for (const file of manifest.files) {
      if (
        !validPath(file.path) ||
        seen.has(file.path) ||
        !Number.isSafeInteger(file.size) ||
        file.size < 0 ||
        !/^[a-f0-9]{64}$/.test(file.sha256)
      )
        throw Error("Invalid backup file entry.");
      seen.add(file.path);
      total += file.size;
    }
    if (!seen.has("database.sqlite") || total > maxBytes)
      throw Error("Backup is too large or incomplete.");
    await mkdir(target, { mode: 0o700 });
    created = true;
    await mkdir(join(target, "uploads"), { mode: 0o700 });
    for (const file of manifest.files) {
      const output = await open(join(target, file.path), "wx", 0o600),
        digest = createHash("sha256");
      try {
        for (let remaining = file.size; remaining; ) {
          const chunk = await read(Math.min(65536, remaining));
          await output.writeFile(chunk);
          digest.update(chunk);
          remaining -= chunk.length;
        }
      } finally {
        await output.close();
      }
      if (digest.digest("hex") !== file.sha256)
        throw Error("Backup file checksum failed.");
    }
    const restored = new DatabaseSync(join(target, "database.sqlite"), {
      readOnly: true,
    });
    try {
      if (
        restored.prepare("PRAGMA integrity_check").get().integrity_check !==
          "ok" ||
        restored.prepare("PRAGMA foreign_key_check").all().length
      )
        throw Error("Restored database integrity failed.");
      for (const [table, count] of Object.entries(manifest.tables))
        if (
          restored.prepare(`SELECT COUNT(*) n FROM ${identifier(table)}`).get()
            .n !== count
        )
          throw Error("Restored row count mismatch.");
      if ("uploads" in manifest.tables) {
        const uploads = restored.prepare("SELECT id,size FROM uploads").all();
        if (
          uploads.length + 1 !== manifest.files.length ||
          uploads.some(
            (row) =>
              !manifest.files.some(
                (file) =>
                  file.path === "uploads/" + row.id && file.size === row.size,
              ),
          )
        )
          throw Error("Restored uploads do not match the database.");
      }
      for (const table of ephemeral)
        if (
          table in manifest.tables &&
          restored.prepare(`SELECT COUNT(*) n FROM ${identifier(table)}`).get()
            .n
        )
          throw Error("Restored backup contains live authentication tokens.");
    } finally {
      restored.close();
    }
    return {
      tables: Object.keys(manifest.tables).length,
      files: manifest.files.length - 1,
      bytes: total,
    };
  } catch (error) {
    if (created) await rm(target, { recursive: true, force: true });
    throw error;
  } finally {
    contents?.destroy();
    await rm(temp, { recursive: true, force: true });
  }
}
