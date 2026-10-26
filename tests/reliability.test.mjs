import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm, readFile, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import { createBackup, restoreBackup } from "../backup.mjs";
import { openDatabase } from "../database.mjs";
import { initializeLimits, consumeBudget, QuotaError } from "../limits.mjs";
import { registerAuth } from "../auth.mjs";
import { readAPIResponse, api } from "../src/data.js";
import { createHandler } from "../api/index.mjs";
import { failureKind } from "../observability.mjs";
import { inspectSchema, completeSchema } from "../schema.mjs";

test("quota reservations are durable and atomic across buckets", () => {
  const db = new DatabaseSync(":memory:");
  initializeLimits(db);
  const buckets = [
    { key: "global", max: 3, window: 100 },
    { key: "recipient", max: 1, window: 100 },
  ];
  consumeBudget(db, buckets, 1000);
  assert.throws(() => consumeBudget(db, buckets, 1001), QuotaError);
  assert.equal(
    db.prepare("SELECT used FROM usage_limits WHERE key='global'").get().used,
    1,
  );
  consumeBudget(db, buckets, 1100);
  assert.equal(
    db.prepare("SELECT used FROM usage_limits WHERE key='recipient'").get()
      .used,
    1,
  );
  db.close();
});

test("database and binary objects round-trip through authenticated encrypted backups; sessions do not", async () => {
  const folder = await mkdtemp(join(tmpdir(), "devdevian-backup-test-"));
  const db = await openDatabase({
    DB_DRIVER: process.env.DB_DRIVER,
    DB_PATH: join(folder, "source.sqlite"),
  });
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT); INSERT INTO users VALUES(1,'Private name');
    CREATE TABLE sessions(token TEXT PRIMARY KEY,user_id INTEGER); INSERT INTO sessions VALUES('private-session-token',1);
    CREATE TABLE uploads(id TEXT PRIMARY KEY,size INTEGER); CREATE INDEX file_sizes ON uploads(size);`);
  const id = "12345678-1234-1234-1234-123456789012",
    body = Buffer.from([0, 1, 2, 255, 32, 10]),
    key = randomBytes(32).toString("hex");
  db.prepare("INSERT INTO uploads VALUES(?,?)").run(id, body.length);
  const storage = {
    get: async (object) => {
      assert.equal(object, id);
      return body;
    },
  };
  try {
    const output = join(folder, "backup.ddb");
    const report = await createBackup({ db, storage, output, key });
    assert.equal(report.files, 1);
    const encrypted = await readFile(output);
    assert.equal(encrypted.includes(Buffer.from("Private name")), false);
    assert.equal((await stat(output)).mode & 0o777, 0o600);
    const target = join(folder, "restored");
    await restoreBackup({ input: output, key, target });
    assert.deepEqual(await readFile(join(target, "uploads", id)), body);
    const restored = new DatabaseSync(join(target, "database.sqlite"));
    assert.equal(
      restored.prepare("SELECT name FROM users").get().name,
      "Private name",
    );
    assert.equal(
      restored.prepare("SELECT COUNT(*) n FROM sessions").get().n,
      0,
    );
    assert.ok(
      restored
        .prepare("SELECT 1 FROM sqlite_master WHERE name='file_sizes'")
        .get(),
    );
    restored.close();
    assert.equal(db.prepare("SELECT COUNT(*) n FROM sessions").get().n, 1);
    await assert.rejects(
      restoreBackup({ input: output, key, target }),
      /EEXIST/,
    );
    await assert.rejects(
      restoreBackup({
        input: output,
        key: randomBytes(32).toString("hex"),
        target: join(folder, "wrong"),
      }),
    );
    const tampered = Buffer.from(encrypted);
    tampered[tampered.length - 20] ^= 1;
    await writeFile(join(folder, "tampered.ddb"), tampered);
    await assert.rejects(
      restoreBackup({
        input: join(folder, "tampered.ddb"),
        key,
        target: join(folder, "tampered"),
      }),
    );
    await assert.rejects(
      createBackup({
        db,
        storage: { get: async () => Buffer.alloc(0) },
        key,
        output: join(folder, "missing.ddb"),
      }),
      /unexpected size/,
    );
    await assert.rejects(
      createBackup({
        db,
        storage,
        key,
        output: join(folder, "oversize.ddb"),
        maxBytes: 1,
      }),
      /exceeds/,
    );
  } finally {
    db.close();
    await rm(folder, { recursive: true, force: true });
  }
});

test("password recovery proves mailbox ownership, expires, rejects replays and revokes every saved session", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT UNIQUE,password TEXT,name TEXT,username TEXT,deleted_at TEXT,email_verified INTEGER);
    CREATE TABLE sessions(token TEXT PRIMARY KEY,user_id INTEGER); CREATE TABLE device_accounts(device TEXT,user_id INTEGER,token TEXT);`);
  const salt = randomBytes(16).toString("hex"),
    encoded = salt + ":" + scryptSync("old-password", salt, 64).toString("hex");
  db.prepare(
    "INSERT INTO users VALUES(1,'private@example.test',?,'Person','person',NULL,1)",
  ).run(encoded);
  db.exec(
    "INSERT INTO sessions VALUES('old-session',1); INSERT INTO device_accounts VALUES('device',1,'old-session')",
  );
  const env = { ...process.env },
    originalFetch = globalThis.fetch,
    sent = [];
  process.env.MAIL_PROVIDER = "resend";
  process.env.RESEND_API_KEY = "test-only";
  process.env.MAIL_FROM = "app@example.test";
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.resend.com/emails");
    sent.push(JSON.parse(options.body));
    return Response.json({ id: "fixture" });
  };
  const app = express();
  app.use(express.json());
  registerAuth(app, db, {
    required: (q, r, n) => n(),
    rate: (q, r, n) => n(),
    session: () => assert.fail("Reset must not sign in"),
    profile: (u) => u,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const request = (path, body) =>
    originalFetch(
      "http://127.0.0.1:" +
        server.address().port +
        "/api/auth/password/" +
        path,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
  try {
    const known = await request("request", { email: "private@example.test" }),
      unknown = await request("request", { email: "unknown@example.test" });
    assert.equal(known.status, 202);
    assert.equal(unknown.status, 202);
    const challenge = await known.json(),
      absent = await unknown.json();
    assert.equal(challenge.message, absent.message);
    assert.equal(challenge.challenge.length, absent.challenge.length);
    assert.equal(sent.length, 1);
    const code = sent[0].text.match(/\b\d{6}\b/)[0];
    assert.ok(
      !JSON.stringify(
        db.prepare("SELECT * FROM password_resets").get(),
      ).includes('"' + code + '"'),
    );
    assert.equal(
      (await request("request", { email: "private@example.test" })).status,
      429,
    );
    const reset = {
      challenge: challenge.challenge,
      code,
      password: "new-password-123",
    };
    assert.equal(
      (
        await request("reset", {
          ...reset,
          code: code === "000000" ? "000001" : "000000",
        })
      ).status,
      400,
    );
    const done = await request("reset", reset);
    assert.equal(done.status, 200);
    assert.equal(done.headers.get("set-cookie"), null);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM sessions").get().n, 0);
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM device_accounts").get().n,
      0,
    );
    assert.equal((await request("reset", reset)).status, 400);
    const saved = db
      .prepare("SELECT password FROM users")
      .get()
      .password.split(":");
    assert.equal(
      scryptSync(reset.password, saved[0], 64).toString("hex"),
      saved[1],
    );
    db.prepare("DELETE FROM usage_limits WHERE key LIKE 'reset-email:%'").run();
    const second = await (
      await request("request", { email: "private@example.test" })
    ).json();
    db.prepare("UPDATE password_resets SET expires=?").run(Date.now() - 1);
    const secondCode = sent.at(-1).text.match(/\b\d{6}\b/)[0];
    assert.equal(
      (
        await request("reset", {
          ...reset,
          challenge: second.challenge,
          code: secondCode,
        })
      ).status,
      400,
    );
    db.prepare("DELETE FROM usage_limits WHERE key LIKE 'reset-email:%'").run();
    const third = await (
      await request("request", { email: "private@example.test" })
    ).json();
    const thirdCode = sent.at(-1).text.match(/\b\d{6}\b/)[0];
    for (let i = 0; i < 5; i++)
      assert.equal(
        (
          await request("reset", {
            ...reset,
            challenge: third.challenge,
            code: thirdCode === "000000" ? "000001" : "000000",
          })
        ).status,
        400,
      );
    assert.equal(
      (
        await request("reset", {
          ...reset,
          challenge: third.challenge,
          code: thirdCode,
        })
      ).status,
      400,
    );
  } finally {
    globalThis.fetch = originalFetch;
    process.env = env;
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
});

test("plain-text function failures are readable; private API responses are only deduplicated while in flight", async () => {
  await assert.rejects(
    readAPIResponse(
      new Response("A server error has occurred", { status: 500 }),
    ),
    (e) => e.status === 500 && !e.message.includes("JSON"),
  );
  await assert.rejects(
    readAPIResponse(new Response("<html>proxy error</html>", { status: 200 })),
    (e) => e.status === 502,
  );
  const original = globalThis.fetch;
  let reads = 0,
    release;
  globalThis.fetch = async () => {
    reads++;
    await new Promise((resolve) => {
      release = resolve;
    });
    return Response.json({ user: { id: reads } });
  };
  try {
    const first = api("/me"),
      second = api("/me");
    assert.equal(reads, 1);
    release();
    assert.deepEqual(await first, await second);
    const third = api("/me");
    assert.equal(reads, 2);
    release();
    assert.equal((await third).user.id, 2);
  } finally {
    globalThis.fetch = original;
  }
});

test("failed startup returns JSON 503 and throttles initialization retries", async () => {
  let calls = 0;
  const handler = createHandler(async () => {
    calls++;
    throw Error("Hrana: Server database capacity temporarily exceeded");
  });
  const server = (await import("node:http")).createServer(handler);
  server.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const url = "http://127.0.0.1:" + server.address().port + "/api/me";
    const results = await Promise.all([fetch(url), fetch(url)]);
    assert.equal(calls, 1);
    for (const result of results) {
      assert.equal(result.status, 503);
      assert.equal(result.headers.get("retry-after"), "15");
      assert.ok((await result.json()).request_id);
    }
    assert.equal(
      failureKind(Error("Server database capacity temporarily exceeded")),
      "database_busy",
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("schema marker is recorded only explicitly after successful initialization", () => {
  const db = new DatabaseSync(":memory:");
  assert.equal(inspectSchema(db), false);
  completeSchema(db);
  assert.equal(inspectSchema(db), true);
  db.prepare("UPDATE app_schema SET version=0").run();
  assert.equal(inspectSchema(db), false);
  db.close();
});

test("prepared code reviews keep v3 and v4 requests compatible until migration finalization", async () => {
  const { prepareCodeReviews } = await import("../code-reviews.mjs");
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE app_schema(id INTEGER PRIMARY KEY,version INTEGER); INSERT INTO app_schema VALUES(1,3)",
  );
  assert.equal(inspectSchema(db, { allowPreparedCodeReviews: true }), false);
  prepareCodeReviews(db);
  assert.equal(db.prepare("SELECT version FROM app_schema").get().version, 3);
  assert.equal(inspectSchema(db), false);
  assert.equal(inspectSchema(db, { allowPreparedCodeReviews: true }), true);
  // Explicit migration runs strictly and marks completion; request inspection never writes.
  inspectSchema(db);
  completeSchema(db);
  assert.equal(db.prepare("SELECT version FROM app_schema").get().version, 4);
  assert.equal(inspectSchema(db), true);
  db.close();
});

test("parallel uploads reserve storage before network writes and enforce a global byte cap", async () => {
  const { registerUploads } = await import("../uploads.mjs");
  const folder = await mkdtemp(join(tmpdir(), "devdevian-quota-test-"));
  const db = new DatabaseSync(":memory:");
  const originalEnv = { ...process.env };
  process.env.UPLOAD_DRIVER = "local";
  process.env.DB_PATH = join(folder, "fixture.sqlite");
  process.env.STORAGE_MAX_BYTES = "10";
  const app = express();
  registerUploads(app, db, (req, res, next) => {
    req.user = { id: 1 };
    next();
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  try {
    const upload = () =>
      fetch("http://127.0.0.1:" + server.address().port + "/api/uploads", {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Filename": "code.txt",
        },
        body: "12345678",
      });
    const results = await Promise.all([upload(), upload()]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 429]);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM uploads").get().n, 1);
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM upload_reservations").get().n,
      0,
    );
    const row = db.prepare("SELECT * FROM uploads").get();
    assert.equal(
      (await readFile(join(folder, "uploads", row.id))).toString(),
      "12345678",
    );
    const before = await readFile(join(folder, "uploads", row.id));
    assert.equal((await upload()).status, 429);
    assert.deepEqual(await readFile(join(folder, "uploads", row.id)), before);
  } finally {
    process.env = originalEnv;
    await new Promise((r) => server.close(r));
    db.close();
    await rm(folder, { recursive: true, force: true });
  }
});

test("UTC mail buckets reset at the calendar boundary, not at the first send time", () => {
  const db = new DatabaseSync(":memory:");
  initializeLimits(db);
  const buckets = [{ key: "mail", max: 1, window: 86400000, calendar: true }];
  consumeBudget(db, buckets, 86399000);
  assert.throws(() => consumeBudget(db, buckets, 86399999), QuotaError);
  consumeBudget(db, buckets, 86400000);
  assert.throws(() => consumeBudget(db, buckets, 86401000), QuotaError);
  db.close();
});

test("hosted wrapper awaits asynchronous response completion and reuses the initialized app", async () => {
  let initialized = 0,
    completed = 0;
  const handler = createHandler(async () => {
    initialized++;
    return (req, res) => {
      setTimeout(() => res.end("delivered"), 10);
    };
  });
  const server = (await import("node:http")).createServer(async (req, res) => {
    await handler(req, res);
    assert.equal(res.writableEnded, true);
    completed++;
  });
  server.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const url = "http://127.0.0.1:" + server.address().port;
    for (let i = 0; i < 2; i++)
      assert.equal(await (await fetch(url)).text(), "delivered");
    assert.equal(initialized, 1);
    assert.equal(completed, 2);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
