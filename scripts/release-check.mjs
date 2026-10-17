import { loadEnvFile } from "node:process";
import { readFileSync, existsSync } from "node:fs";
import { assertRuntime, storageKeys } from "../runtime-config.mjs";
try {
  loadEnvFile();
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const required = [
  "APP_URL",
  "TURSO_DATABASE_URL",
  "TURSO_AUTH_TOKEN",
  ...storageKeys,
];
const missing = required.filter((key) => !process.env[key]);
if (process.env.UPLOAD_DRIVER !== "s3") missing.push("UPLOAD_DRIVER=s3");
const google = process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET;
const github = process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET;
if (!google && !github) missing.push("Google or GitHub OAuth credentials");
if (missing.length) {
  console.error("Missing production configuration: " + missing.join(", "));
  process.exit(1);
}
assertRuntime({ ...process.env, NODE_ENV: "production", VERCEL: "1" });
const media = JSON.parse(
  readFileSync(new URL("../src/landing-media.json", import.meta.url), "utf8"),
);
for (const file of Object.values(media))
  if (!file || !existsSync(new URL("../public" + file, import.meta.url)))
    throw Error("Missing landing screenshot");
console.log(
  "Configuration and screenshot checks passed. No live service connection was attempted.",
);
if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM)
  console.log(
    "Email registration remains disabled until a verified email sender is configured. OAuth can be tested separately.",
  );
console.log(
  "Before launch, verify remote persistence, private uploads and real OAuth callbacks on a stable preview.",
);
