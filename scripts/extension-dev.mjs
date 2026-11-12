import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, scryptSync } from "node:crypto";
import { buildExtension } from "./extension-build.mjs";
if (!process.argv[2])
  throw Error("Usage: npm run extension:dev -- path/to/extension");
const directory = resolve(process.argv[2]);
await buildExtension(directory);
// This dedicated sandbox never uses production database or file credentials.
for (const key of Object.keys(process.env))
  if (
    /^(TURSO_|S3_|GOOGLE_|GITHUB_|BREVO_|SMTP_|AUTH_|SESSION_|MODERATOR_|PLATFORM_OWNER_|EXTENSION_REVIEWER_)/.test(
      key,
    )
  )
    delete process.env[key];
Object.assign(process.env, {
  VERCEL: "",
  DEVDEVIAN_EXPLICIT_ENV: "1",
  UPLOAD_DIR: resolve(".test-data/extension-dev/uploads"),
  DB_PATH: resolve(".test-data/extension-dev/sandbox.sqlite"),
  UPLOAD_DRIVER: "local",
  NODE_ENV: "development",
  DEMO_MODE: "1",
  PORT: process.env.EXTENSION_DEV_PORT || "4188",
  DEVDEVIAN_EXTENSION_PATH: directory,
});
await mkdir(".test-data/extension-dev", { recursive: true });
const db = new DatabaseSync(process.env.DB_PATH);
db.exec(
  "CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,name TEXT NOT NULL,bio TEXT DEFAULT '',location TEXT DEFAULT '',role TEXT DEFAULT 'Builder')",
);
const email = "developer@extensions.test",
  password = "Devdevian-Local-Extensions!";
if (!db.prepare("SELECT 1 FROM users WHERE email=?").get(email)) {
  const salt = randomBytes(16).toString("hex");
  db.prepare("INSERT INTO users(name,email,password) VALUES(?,?,?)").run(
    "Extension Developer",
    email,
    salt + ":" + scryptSync(password, salt, 64).toString("hex"),
  );
}
db.close();
console.log(`Local-only login: ${email} / ${password}`);
console.log(
  `Local extension sandbox: http://127.0.0.1:${process.env.PORT}/app#extensions — sign in with the local-only account, then Upload extension → Load local build.`,
);
await import("../server.mjs");
