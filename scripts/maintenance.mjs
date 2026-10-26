import { openDatabase } from "../database.mjs";
import { objectStorage } from "../object-storage.mjs";
import { inspectSchema } from "../schema.mjs";
import { reportFailure } from "../observability.mjs";
let db;
try {
  db = await openDatabase();
  if (!inspectSchema(db)) throw Error("Database schema requires migration.");
  const now = Date.now();
  for (const table of [
    "sessions",
    "cli_devices",
    "registrations",
    "password_resets",
    "oauth_states",
    "oauth_link_challenges",
  ])
    db.prepare(`DELETE FROM ${table} WHERE expires<?`).run(now);
  db.prepare(
    "DELETE FROM cli_tokens WHERE NOT EXISTS(SELECT 1 FROM sessions WHERE token=cli_tokens.session_token)",
  ).run();
  db.prepare(
    "DELETE FROM device_accounts WHERE NOT EXISTS(SELECT 1 FROM sessions WHERE token=device_accounts.token)",
  ).run();
  db.prepare("DELETE FROM usage_limits WHERE window_start<?").run(
    now - 172800000,
  );
  db.prepare("DELETE FROM auth_rate_limits WHERE window_start<?").run(
    now - 86400000,
  );
  const storage = objectStorage();
  const abandoned = db
    .prepare("SELECT id FROM upload_reservations WHERE created<?")
    .all(now - 3600000);
  for (const row of abandoned) {
    // These are failed/incomplete writes only, never published files.
    if (db.prepare("SELECT 1 FROM uploads WHERE id=?").get(row.id)) continue;
    await storage.remove(row.id);
    db.prepare("DELETE FROM upload_reservations WHERE id=?").run(row.id);
  }
  console.log(
    JSON.stringify({
      event: "maintenance_completed",
      abandoned_uploads: abandoned.length,
    }),
  );
} catch (error) {
  reportFailure(error, { event: "maintenance_failed" });
  process.exitCode = 1;
} finally {
  db?.close();
}
