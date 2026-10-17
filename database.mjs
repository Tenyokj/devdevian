import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { portableQuery } from "./search-sql.mjs";
export async function openDatabase(env = process.env) {
  const cloud = !!env.TURSO_DATABASE_URL;
  if (!cloud && env.DB_DRIVER !== "libsql") {
    const path = env.DB_PATH || "data/arc.sqlite";
    mkdirSync(dirname(path), { recursive: true });
    return new DatabaseSync(path);
  }
  const { default: LibSQL } = await import("libsql");
  const db = new LibSQL(
    cloud ? env.TURSO_DATABASE_URL : env.DB_PATH || "data/arc.sqlite",
    cloud ? { authToken: env.TURSO_AUTH_TOKEN } : {},
  );
  // libSQL offers the synchronous SQLite API, including real remote transactions.
  // Portable SQL replaces the two local-only JavaScript search functions.
  return {
    prepare(sql) {
      return Object.fromEntries(
        ["get", "all", "run"].map((method) => [
          method,
          (...values) => {
            const query = portableQuery(sql, values);
            const result = db.prepare(query.sql)[method](...query.args);
            if (method === "run")
              return {
                ...result,
                lastInsertRowid: Number(result.lastInsertRowid),
              };
            return result;
          },
        ]),
      );
    },
    exec(sql) {
      return db.exec(
        cloud ? sql.replace(/PRAGMA journal_mode=WAL;?/gi, "") : sql,
      );
    },
    function(name) {
      if (!["dev_search", "dev_has_technology"].includes(name))
        throw Error("Unsupported SQL function " + name);
    },
    close() {
      db.close();
    },
    get isTransaction() {
      return db.inTransaction;
    },
  };
}
