// Explicit local reset with an atomic backup of databases and upload files.
import { existsSync, mkdirSync, renameSync } from "node:fs";
import { createConnection, createServer } from "node:net";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
if (
  !process.argv.includes("--empty-local-data") ||
  process.env.NODE_ENV === "production" ||
  process.env.VERCEL
)
  throw Error(
    "Local use only: stop local servers and pass --empty-local-data.",
  );
for (const port of [4173, 4174]) {
  const busy = await new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
  if (busy)
    throw Error("Stop the local server on " + port + " before resetting.");
}
const backup =
  "backups/before-empty-release-" +
  new Date().toISOString().replace(/[:.]/g, "-");
mkdirSync(backup, { recursive: true });
if (existsSync("data")) renameSync("data", backup + "/data");
mkdirSync("data", { recursive: true });
try {
  for (const name of ["arc", "acceptance"]) {
    const probe = createServer();
    await new Promise((r) => probe.listen(0, "127.0.0.1", r));
    const port = probe.address().port;
    await new Promise((r) => probe.close(r));
    const child = spawn(process.execPath, ["server.mjs"], {
      env: {
        ...process.env,
        TURSO_DATABASE_URL: "",
        TURSO_AUTH_TOKEN: "",
        UPLOAD_DRIVER: "local",
        DB_DRIVER: "",
        VERCEL: "",
        NODE_ENV: "development",
        DEMO_MODE: "1",
        AUTH_TEST_UNVERIFIED: "0",
        DB_PATH: `data/${name}.sqlite`,
        PORT: String(port),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(Error("Schema initialization timed out: " + output)),
          10000,
        );
        child.stdout.on("data", (chunk) => {
          output += chunk;
          if (output.includes("Devdevian is ready")) {
            clearTimeout(timer);
            resolve();
          }
        });
        child.stderr.on("data", (chunk) => (output += chunk));
        child.once("exit", (code) => {
          clearTimeout(timer);
          reject(Error("Schema initialization failed " + code + ": " + output));
        });
      });
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = new Promise((r) => child.once("exit", r));
        child.kill("SIGTERM");
        await exited;
      }
    }
    const db = new DatabaseSync(`data/${name}.sqlite`);
    for (const table of [
      "users",
      "sessions",
      "device_accounts",
      "posts",
      "replies",
      "projects",
      "events",
      "private_communities",
      "memberships",
      "uploads",
      "reports",
      "notifications",
      "oauth_accounts",
      "oauth_states",
      "registrations",
    ])
      if (db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n !== 0)
        throw Error("Reset did not clear " + table);
    if (db.prepare("PRAGMA quick_check").get().quick_check !== "ok")
      throw Error("Database integrity failed");
    db.close();
    console.log(`data/${name}.sqlite: empty, schema ready, integrity OK`);
  }
} catch (error) {
  renameSync("data", backup + "/failed-attempt");
  if (existsSync(backup + "/data")) renameSync(backup + "/data", "data");
  throw error;
}
console.log("Previous records and uploads archived at " + backup + "/data");
console.log(
  "No accounts or demo content created. Use npm run dev, not npm run demo.",
);
