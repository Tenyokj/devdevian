// Local acceptance workspace. Keeps the real development database untouched.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { randomBytes, scryptSync } from "node:crypto";
mkdirSync("data", { recursive: true });
process.env.DB_PATH = "data/acceptance.sqlite";
process.env.PORT = process.env.DEMO_PORT || "4174";
process.env.MODERATOR_EMAILS = "moderator@devdevian.test";
process.env.DEMO_MODE = "1";
process.env.NODE_ENV = "development";
const db = new DatabaseSync(process.env.DB_PATH);
db.exec(
  "CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,name TEXT NOT NULL,bio TEXT DEFAULT '',location TEXT DEFAULT '',role TEXT DEFAULT 'Builder')",
);
const password = "Devdevian-Test-2026!";
for (const [name, email, role] of [
  ["Alex Builder", "author@devdevian.test", "Full-stack developer"],
  ["Riley Reviewer", "reviewer@devdevian.test", "Software engineer"],
  ["Casey Moderator", "moderator@devdevian.test", "Community moderator"],
]) {
  if (!db.prepare("SELECT 1 FROM users WHERE email=?").get(email)) {
    const salt = randomBytes(16).toString("hex");
    db.prepare(
      "INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)",
    ).run(
      name,
      email,
      salt + ":" + scryptSync(password, salt, 64).toString("hex"),
      role,
    );
  }
}
db.close();
console.log(
  "Acceptance workspace: data/acceptance.sqlite (separate from your development data).",
);
console.log(
  "Test accounts: author@devdevian.test · reviewer@devdevian.test · moderator@devdevian.test",
);
console.log("Test-only password: " + password);
await import("../server.mjs");
