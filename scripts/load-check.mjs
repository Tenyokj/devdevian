import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
const folder = await mkdtemp(join(tmpdir(), "devdevian-load-"));
const probe = createServer();
await new Promise((r) => probe.listen(0, "127.0.0.1", r));
const port = probe.address().port;
await new Promise((r) => probe.close(r));
const env = {
  ...process.env,
  TURSO_DATABASE_URL: "",
  TURSO_AUTH_TOKEN: "",
  DB_PATH: join(folder, "fixture.sqlite"),
  UPLOAD_DRIVER: "local",
  VERCEL: "",
  NODE_ENV: "test",
  DEMO_MODE: "1",
  AUTH_TEST_UNVERIFIED: "",
  PORT: String(port),
};
const run = (file) =>
  spawn(process.execPath, [file], { env, stdio: ["ignore", "pipe", "pipe"] });
let server;
try {
  const migration = run("scripts/migrate.mjs");
  let logs = "";
  migration.stdout.on("data", (c) => (logs += c));
  migration.stderr.on("data", (c) => (logs += c));
  assert.equal(await new Promise((r) => migration.once("exit", r)), 0, logs);
  const db = new DatabaseSync(env.DB_PATH);
  db.exec(
    "BEGIN; INSERT INTO users(id,email,password,name,username,email_verified) VALUES(1,'load@fixture.test','unused','Load fixture','load_fixture',1)",
  );
  const post = db.prepare(
    "INSERT INTO posts(id,user_id,title,body,topic,kind) VALUES(?,1,?,?,'web','question')",
  );
  const reply = db.prepare(
    "INSERT INTO replies(user_id,post_id,body) VALUES(1,?,?)",
  );
  for (let i = 1; i <= 500; i++) {
    post.run(
      i,
      "Load-test question " + i,
      "Deterministic isolated fixture content. ".repeat(8),
    );
    for (let j = 0; j < 3; j++) reply.run(i, "An answer with enough context.");
  }
  db.prepare("INSERT INTO sessions VALUES(?,1,?)").run(
    "load-test-session",
    Date.now() + 600000,
  );
  db.exec("COMMIT");
  db.close();
  server = run("server.mjs");
  logs = "";
  server.stdout.on("data", (c) => (logs += c));
  server.stderr.on("data", (c) => (logs += c));
  const base = "http://127.0.0.1:" + port;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null)
      throw Error("Isolated load-test server exited.");
    if (logs.includes("Devdevian is ready")) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.match(logs, /Devdevian is ready/);
  const endpoints = [
    "/posts?limit=12",
    "/posts?limit=12&page=20",
    "/posts/250",
    "/topics",
    "/me",
    "/events?limit=12",
    "/communities?limit=12",
  ];
  const times = [];
  let counter = 0;
  const worker = async () => {
    for (;;) {
      const index = counter++;
      if (index >= 210) return;
      const started = performance.now();
      const response = await fetch(
        base + "/api" + endpoints[index % endpoints.length],
        {
          headers: { Cookie: "devdevian_demo_session=load-test-session" },
          signal: AbortSignal.timeout(5000),
        },
      );
      assert.equal(response.status, 200, "Load request must succeed");
      await response.json();
      times.push(performance.now() - started);
    }
  };
  const started = performance.now();
  await Promise.all(Array.from({ length: 10 }, worker));
  times.sort((a, b) => a - b);
  const report = {
    environment: "isolated local database; not a production capacity guarantee",
    requests: times.length,
    concurrency: 10,
    posts: 500,
    replies: 1500,
    errors: 0,
    p50_ms: Math.round(times[Math.floor(times.length * 0.5)]),
    p95_ms: Math.round(times[Math.floor(times.length * 0.95)]),
    elapsed_ms: Math.round(performance.now() - started),
  };
  console.log(JSON.stringify(report));
  assert.ok(
    report.p95_ms < 2000,
    "Local p95 regression: investigate before shipping",
  );
} finally {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((r) => server.once("exit", r));
  }
  await rm(folder, { recursive: true, force: true });
}
