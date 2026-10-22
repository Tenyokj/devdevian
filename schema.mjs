// Bump this whenever a migration changes. Requests check one version record;
// migrations run explicitly before a hosted release, never on a cold start.
export const SCHEMA_VERSION = 2;
export function inspectSchema(db) {
  const table = db
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='app_schema'",
    )
    .get();
  db.schemaCurrent =
    !!table &&
    db.prepare("SELECT version FROM app_schema WHERE id=1").get()?.version ===
      SCHEMA_VERSION;
  return db.schemaCurrent;
}
export function completeSchema(db) {
  if (db.schemaCurrent) return;
  db.exec(
    "CREATE TABLE IF NOT EXISTS app_schema(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL)",
  );
  db.prepare(
    "INSERT INTO app_schema VALUES(1,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version",
  ).run(SCHEMA_VERSION);
  db.schemaCurrent = true;
}
