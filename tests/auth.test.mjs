import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { registerAuth } from "../auth.mjs";
test("verified registration and provider sign-in use real challenges and bound OAuth state", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT UNIQUE,password TEXT,name TEXT,username TEXT,deleted_at TEXT)",
  );
  const env = { ...process.env },
    originalFetch = globalThis.fetch;
  let providerEmail = "provider@example.test";
  let sent = [],
    calls = [];
  process.env.NODE_ENV = "test";
  delete process.env.AUTH_TEST_UNVERIFIED;
  process.env.RESEND_API_KEY = "test-only-key";
  process.env.MAIL_FROM = "test@example.test";
  process.env.APP_URL = "http://localhost:7777";
  process.env.GITHUB_CLIENT_ID = "test-client";
  process.env.GITHUB_CLIENT_SECRET = "test-secret";
  globalThis.fetch = async (url, options) => {
    calls.push([String(url), options]);
    if (url === "https://api.resend.com/emails") {
      sent.push(JSON.parse(options.body));
      return Response.json({ id: "test-delivery" });
    }
    if (url === "https://github.com/login/oauth/access_token")
      return Response.json({ access_token: "test-provider-token" });
    if (url === "https://api.github.com/user")
      return Response.json({ id: 901, name: "OAuth developer" });
    if (url === "https://api.github.com/user/emails")
      return Response.json([
        { email: providerEmail, primary: true, verified: true },
      ]);
    throw Error("Unexpected remote request " + url);
  };
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    if (req.headers["x-test-user"])
      req.user = db
        .prepare("SELECT * FROM users WHERE id=?")
        .get(Number(req.headers["x-test-user"]));
    next();
  });
  registerAuth(app, db, {
    required: (q, r, n) => n(),
    rate: (q, r, n) => n(),
    session: (r, id) =>
      r.cookie("test_session", String(id), { httpOnly: true }),
    profile: (u) => ({
      id: u.id,
      email: u.email,
      email_verified: u.email_verified,
    }),
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const request = async (path, body, headers = {}) => {
    const r = await originalFetch(base + "/api" + path, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", ...headers },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
    return r;
  };
  try {
    let r = await request("/register", {
      name: "Verified builder",
      username: "verified_builder",
      email: "verify@example.test",
      password: "Long-password123",
    });
    assert.equal(r.status, 202);
    assert.equal(r.headers.get("set-cookie"), null);
    const challenge = await r.json();
    assert.equal(db.prepare("SELECT COUNT(*) n FROM users").get().n, 0);
    assert.equal(sent.length, 1);
    const code = sent[0].text.match(/\b\d{6}\b/)[0];
    const record = db
      .prepare("SELECT * FROM registrations WHERE id=?")
      .get(challenge.challenge);
    assert.notEqual(record.code_hash, code);
    assert.ok(record.password.includes(":"));
    r = await request("/auth/verify", {
      challenge: challenge.challenge,
      code: code === "000000" ? "000001" : "000000",
    });
    assert.equal(r.status, 400);
    r = await request("/auth/resend", { challenge: challenge.challenge });
    assert.equal(r.status, 429);
    r = await request("/auth/verify", { challenge: challenge.challenge, code });
    assert.equal(r.status, 200);
    assert.match(r.headers.get("set-cookie"), /HttpOnly/);
    assert.equal((await r.json()).user.email_verified, 1);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM registrations").get().n, 0);
    assert.equal(
      (await request("/auth/verify", { challenge: challenge.challenge, code }))
        .status,
      400,
    );
    const pending = {
      id: "expired",
      email: "later@example.test",
      password: "hash",
      name: "Later",
      code_hash: createHash("sha256").update("expired123456").digest("hex"),
    };
    db.prepare(
      "INSERT INTO registrations(id,email,password,name,code_hash,expires,last_sent) VALUES(?,?,?,?,?,?,?)",
    ).run(...Object.values(pending), Date.now() - 1000, Date.now() - 120000);
    assert.equal(
      (await request("/auth/verify", { challenge: "expired", code: "123456" }))
        .status,
      400,
    );
    let start = await request("/auth/github/start");
    assert.equal(start.status, 302);
    const redirect = new URL(start.headers.get("location")),
      state = redirect.searchParams.get("state");
    assert.equal(redirect.searchParams.get("code_challenge_method"), "S256");
    const cookie = start.headers.getSetCookie()[0].split(";")[0];
    const before = calls.length;
    assert.equal(
      (
        await request(
          "/auth/github/callback?state=" + state + "&code=auth-code",
        )
      ).status,
      400,
    );
    assert.equal(calls.length, before);
    r = await request(
      "/auth/github/callback?state=" + state + "&code=auth-code",
      undefined,
      { Cookie: cookie },
    );
    assert.equal(r.status, 302);
    assert.equal(r.headers.get("location"), "/#profile");
    assert.equal(
      db
        .prepare(
          "SELECT email_verified FROM users WHERE email='provider@example.test'",
        )
        .get().email_verified,
      1,
    );
    const tokenCall = calls.find(([u]) => u.includes("access_token"));
    assert.ok(tokenCall[1].body.get("code_verifier"));
    assert.ok(!tokenCall[1].body.get("code_verifier").includes("undefined"));
    assert.equal(
      (
        await request(
          "/auth/github/callback?state=" + state + "&code=auth-code",
          undefined,
          { Cookie: cookie },
        )
      ).status,
      400,
    );
    // A verified provider email does not silently take over an existing password account.
    db.prepare("DELETE FROM oauth_accounts").run();
    providerEmail = "verify@example.test";
    start = await request("/auth/github/start");
    const state2 = new URL(start.headers.get("location")).searchParams.get(
      "state",
    );
    r = await request(
      "/auth/github/callback?state=" + state2 + "&code=code",
      undefined,
      { Cookie: start.headers.getSetCookie()[0].split(";")[0] },
    );
    assert.equal(r.headers.get("location"), "/app?auth_link=1#feed");
    assert.ok(
      !r.headers.getSetCookie().some((c) => c.startsWith("test_session=")),
    );
    const linkCookie = r.headers
      .getSetCookie()
      .find((c) => c.startsWith("devdevian_link="))
      .split(";")[0];
    const confirmation = sent.at(-1).text.match(/\b\d{6}\b/)[0];
    assert.equal((await request("/auth/link/pending")).status, 400);
    assert.equal(
      (await request("/auth/link/verify", { code: confirmation })).status,
      400,
    );
    const pendingLink = await request("/auth/link/pending", undefined, {
      Cookie: linkCookie,
    });
    assert.equal(pendingLink.status, 200);
    assert.deepEqual(await pendingLink.json(), {
      email: "v***@example.test",
      provider: "github",
    });
    const wrong = await request(
      "/auth/link/verify",
      { code: confirmation === "000000" ? "000001" : "000000" },
      { Cookie: linkCookie },
    );
    assert.equal(wrong.status, 400);
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM oauth_accounts").get().n,
      0,
    );
    assert.equal(
      (await request("/auth/link/resend", {}, { Cookie: linkCookie })).status,
      429,
    );
    const linkedLogin = await request(
      "/auth/link/verify",
      { code: confirmation },
      { Cookie: linkCookie },
    );
    assert.equal(linkedLogin.status, 200);
    assert.equal((await linkedLogin.json()).user.id, 1);
    assert.ok(
      linkedLogin.headers
        .getSetCookie()
        .some((c) => c.startsWith("test_session=1;")),
    );
    assert.equal(db.prepare("SELECT COUNT(*) n FROM users").get().n, 2);
    assert.equal(
      db
        .prepare(
          "SELECT user_id FROM oauth_accounts WHERE provider='github' AND subject='901'",
        )
        .get().user_id,
      1,
    );
    assert.equal(
      db.prepare("SELECT username_locked FROM users WHERE id=1").get()
        .username_locked,
      1,
    );
    assert.equal(
      (
        await request(
          "/auth/link/verify",
          { code: confirmation },
          { Cookie: linkCookie },
        )
      ).status,
      400,
    );
    const repeatStart = await request("/auth/github/start");
    const repeatState = new URL(
      repeatStart.headers.get("location"),
    ).searchParams.get("state");
    const sentBefore = sent.length;
    const repeatLogin = await request(
      "/auth/github/callback?state=" + repeatState + "&code=repeat",
      undefined,
      { Cookie: repeatStart.headers.getSetCookie()[0].split(";")[0] },
    );
    assert.equal(repeatLogin.headers.get("location"), "/#profile");
    assert.ok(
      repeatLogin.headers
        .getSetCookie()
        .some((c) => c.startsWith("test_session=1;")),
    );
    assert.equal(sent.length, sentBefore);
    // Connecting an identity to an existing account must never unlock its handle.
    const linking = await request("/auth/github/start?link=1", undefined, {
      "x-test-user": "1",
    });
    const linkState = new URL(linking.headers.get("location")).searchParams.get(
      "state",
    );
    const linked = await request(
      "/auth/github/callback?state=" + linkState + "&code=link-code",
      undefined,
      {
        "x-test-user": "1",
        Cookie: linking.headers.getSetCookie()[0].split(";")[0],
      },
    );
    assert.equal(linked.headers.get("location"), "/#profile");
    assert.equal(
      db.prepare("SELECT username_locked FROM users WHERE id=1").get()
        .username_locked,
      1,
    );
    const duplicate = await request("/register", {
      name: "Another builder",
      username: "VERIFIED_BUILDER",
      email: "another@example.test",
      password: "Another-password-123",
    });
    assert.equal(duplicate.status, 409);
    assert.match((await duplicate.json()).error, /already taken/);
    delete process.env.RESEND_API_KEY;
    assert.equal(
      (
        await request("/register", {
          name: "No mail",
          username: "nomail_builder",
          email: "nomail@example.test",
          password: "Long-password123",
        })
      ).status,
      503,
    );
    assert.equal((await request("/auth/google/start")).status, 503);
  } finally {
    globalThis.fetch = originalFetch;
    for (const k of Object.keys(process.env))
      if (!(k in env)) delete process.env[k];
    Object.assign(process.env, env);
    await new Promise((r) => server.close(r));
    db.close();
  }
});
