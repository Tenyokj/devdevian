// Bump this whenever a migration changes. Requests check one version record;
// migrations run explicitly before a hosted release, never on a cold start.
export const SCHEMA_VERSION = 7;
export function inspectSchema(db, { allowPreparedWorkspaces = false } = {}) {
  const table = db
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='app_schema'",
    )
    .get();
  const version = table
    ? db.prepare("SELECT version FROM app_schema WHERE id=1").get()?.version
    : null;
  if (Number.isFinite(version) && version > SCHEMA_VERSION)
    throw Error(
      "Database schema is newer than this release. Refusing to downgrade it.",
    );
  db.schemaCurrent = version === SCHEMA_VERSION;
  // Prepare additive tables while v6 remains live; advance the global marker
  // only after all instances have moved. Request startup never runs DDL.
  if (!db.schemaCurrent && version === 6 && allowPreparedWorkspaces) {
    const tables = db
      .prepare(
        "SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name IN ('project_work_requests','review_revisions','workspace_schema')",
      )
      .get().n;
    const anchor =
      tables === 3 &&
      db
        .prepare("PRAGMA table_info(code_reviews)")
        .all()
        .some((c) => c.name === "snapshot_id");
    const guards =
      !!anchor &&
      db
        .prepare(
          "SELECT COUNT(*) n FROM sqlite_master WHERE (type='trigger' AND name='review_revisions_immutable') OR (type='index' AND name IN ('project_work_requests_project','code_reviews_snapshot'))",
        )
        .get().n === 3;
    db.schemaCurrent =
      !!guards &&
      db.prepare("SELECT version FROM workspace_schema WHERE id=1").get()
        ?.version === 1;
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
