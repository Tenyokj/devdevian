import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createBackup, restoreBackup } from "../backup.mjs";
import { openDatabase } from "../database.mjs";
import { objectStorage } from "../object-storage.mjs";
const command = process.argv[2] || "create";
try {
  const key = process.env.BACKUP_ENCRYPTION_KEY;
  if (command === "create") {
    await mkdir("backups", { recursive: true, mode: 0o700 });
    const output = resolve(
      process.argv[3] ||
        `backups/devdevian-${new Date().toISOString().replaceAll(":", "-")}.ddb`,
    );
    const db = await openDatabase();
    let result;
    try {
      result = await createBackup({
        db,
        storage: objectStorage(),
        output,
        key,
        maxBytes: Number(process.env.BACKUP_MAX_BYTES) || 50 * 1024 * 1024,
      });
    } finally {
      db.close();
    }
    const temp = await mkdtemp(join(tmpdir(), "devdevian-restore-check-"));
    try {
      await restoreBackup({
        input: output,
        key,
        target: join(temp, "restored"),
      });
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
    console.log(
      JSON.stringify({ event: "backup_verified", ...result, output }),
    );
  } else if (command === "verify" || command === "restore") {
    if (!process.argv[3]) throw Error("Provide the encrypted archive path.");
    if (command === "restore" && !process.argv[4])
      throw Error("Provide a NEW, empty target directory path.");
    const temp =
      command === "verify"
        ? await mkdtemp(join(tmpdir(), "devdevian-restore-check-"))
        : null;
    try {
      const result = await restoreBackup({
        input: resolve(process.argv[3]),
        key,
        target: temp ? join(temp, "restored") : resolve(process.argv[4]),
      });
      console.log(
        JSON.stringify({
          event:
            command === "verify"
              ? "restore_verified"
              : "restored_to_new_directory",
          ...result,
        }),
      );
    } finally {
      if (temp) await rm(temp, { recursive: true, force: true });
    }
  } else throw Error("Use create, verify or restore.");
} catch (error) {
  // Native database errors may contain connection details. Keep workflow logs private-data free.
  const message = String(error.message || "");
  const reason = /BACKUP_MAX_BYTES|too large/.test(message)
    ? "backup_budget_exceeded"
    : /BACKUP_ENCRYPTION_KEY/.test(message)
      ? "invalid_encryption_key"
      : /unexpected size|missing/.test(message)
        ? "object_missing_or_changed"
        : "source_or_verification_failure";
  console.error(
    JSON.stringify({
      event: "backup_failed",
      reason,
      error:
        "Backup or restore verification failed. No production data was changed.",
    }),
  );
  process.exitCode = 1;
}
