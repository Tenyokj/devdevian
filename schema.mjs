// Bump this whenever a migration changes. Requests check one version record;
// migrations run explicitly before a hosted release, never on a cold start.
export const SCHEMA_VERSION = 3;
export function inspectSchema(db, { allowPreparedSubscriptions = false } = {}) {
  const table = db
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='app_schema'",
    )
    .get();
  const version = table
    ? db.prepare("SELECT version FROM app_schema WHERE id=1").get()?.version
    : null;
  db.schemaCurrent = version === SCHEMA_VERSION;
  // v3 adds only subscriptions. During a rolling v2 -> v3 deployment the
  // prepared table allows both releases to run without cold-start DDL/writes.
  if (
    !db.schemaCurrent &&
    SCHEMA_VERSION === 3 &&
    version === 2 &&
    allowPreparedSubscriptions
  ) {
    db.schemaCurrent = !!db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='subscriptions'",
      )
      .get();
  }
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
