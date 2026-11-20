import { openDatabase } from "../database.mjs";
import { sealToken } from "../github-app-core.mjs";
export async function seedWritebackConnection(f, id) {
  const db = await openDatabase({
    DB_PATH: f.path,
    DB_DRIVER: process.env.DB_DRIVER || "",
  });
  try {
    db.prepare(
      "INSERT INTO github_connections(user_id,subject,login,access,refresh,expires,refresh_expires) VALUES(?,?,?,?,?,?,?)",
    ).run(
      id,
      100,
      "fixture-owner",
      sealToken("ghu_fixture", id, "a".repeat(64)),
      sealToken("ghr_fixture", id, "a".repeat(64)),
      Date.now() + 3600000,
      Date.now() + 7200000,
    );
  } finally {
    db.close();
  }
}
