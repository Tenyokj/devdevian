import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { readFileSync } from "node:fs";
import { openDatabase } from "../database.mjs";
import { createHmac, randomUUID } from "node:crypto";
import {
  registerGitHubApp,
  prepareGitHubApp,
  githubAppReady,
} from "../github-app.mjs";
import {
  sealToken,
  openToken,
  validWebhook,
  allowedRead,
  githubError,
} from "../github-app-core.mjs";
const config = {
  id: "Iv_fixture",
  secret: "fixture-app-secret",
  slug: "fixture-app",
  key: "a".repeat(64),
  webhook: "fixture-webhook-secret".repeat(3),
  origin: "https://fixture.test",
};
const responseToken = {
  access_token: "ghu_refreshed",
  refresh_token: "ghr_rotated",
  expires_in: 28800,
  refresh_token_expires_in: 15897600,
};
async function fixture({ get, exchange } = {}) {
  const db = await openDatabase({
    DB_PATH: ":memory:",
    DB_DRIVER: process.env.DB_DRIVER || "",
  });
  db.exec(
    `CREATE TABLE users(id INTEGER PRIMARY KEY,deleted_at TEXT);INSERT INTO users VALUES(1,NULL),(2,NULL);CREATE TABLE usage_limits(key TEXT PRIMARY KEY,window_start INTEGER NOT NULL,used INTEGER NOT NULL);CREATE TABLE oauth_accounts(provider TEXT,subject TEXT,user_id INTEGER);CREATE TABLE projects(id INTEGER PRIMARY KEY,user_id INTEGER,post_id INTEGER,repo TEXT);CREATE TABLE posts(id INTEGER PRIMARY KEY,user_id INTEGER,community_id TEXT,removed_at TEXT,locked_at TEXT,archived_at TEXT);CREATE TABLE memberships(user_id INTEGER,kind TEXT,item TEXT);INSERT INTO posts VALUES(1,1,NULL,NULL,NULL,NULL),(2,1,'private-fixture',NULL,NULL,NULL);INSERT INTO projects(id,user_id,post_id) VALUES(1,1,1),(2,1,2);INSERT INTO memberships VALUES(1,'group','private-fixture');`,
  );
  const calls = [];
  const defaultGet = async (path, token) => {
    calls.push({ path, token });
    if (path === "/user") return { data: { id: 100, login: "fixture-owner" } };
    if (path === "/repos/fixture/private") {
      if (token !== "ghu_owner" && token !== "ghu_refreshed")
        throw githubError("Not available.", 404);
      return {
        data: {
          id: 7,
          html_url: "https://github.com/fixture/private",
          private: true,
          full_name: "fixture/private",
          default_branch: "main",
        },
      };
    }
    if (path === "/repos/fixture/private/pulls?per_page=20&page=1")
      return {
        data: [{ id: 1, number: 1, title: "Private fixture PR" }],
        hasNext: false,
      };
    throw githubError("Not available.", 404);
  };
  const app = express();
  app.use(
    express.json({
      verify: (req, res, bytes) => (req.githubRawBody = Buffer.from(bytes)),
    }),
  );
  app.use((req, res, next) => {
    const id = Number(req.headers["x-fixture-user"]);
    if (id === 1 || id === 2) req.user = { id };
    next();
  });
  const required = (req, res, next) =>
    req.user ? next() : res.status(401).json({ error: "Sign in." });
  registerGitHubApp(app, db, required, {
    config,
    get: get || defaultGet,
    exchange: exchange || (async () => responseToken),
  });
  app.use((e, req, res, next) =>
    res.status(e.status || 500).json({ error: "Unexpected fixture error" }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const api = async (
    path,
    { user = 1, body, method = body ? "POST" : "GET", headers = {} } = {},
  ) => {
    const r = await fetch(base + "/api" + path, {
      method,
      redirect: "manual",
      headers: {
        "Content-Type": "application/json",
        ...(user ? { "x-fixture-user": String(user) } : {}),
        ...headers,
      },
      body:
        body === undefined
          ? undefined
          : typeof body === "string"
            ? body
            : JSON.stringify(body),
    });
    return {
      status: r.status,
      data: r.headers.get("content-type")?.includes("application/json")
        ? await r.json()
        : null,
      headers: r.headers,
    };
  };
  const seed = (
    user = 1,
    value = user === 1 ? "ghu_owner" : "ghu_peer",
    expires = Date.now() + 600000,
  ) =>
    db
      .prepare(
        "INSERT INTO github_connections(user_id,subject,login,access,refresh,expires,refresh_expires) VALUES(?,?,?,?,?,?,?)",
      )
      .run(
        user,
        user === 1 ? 100 : 200,
        "fixture",
        sealToken(value, user, config.key),
        sealToken("ghr_fixture", user, config.key),
        expires,
        Date.now() + 3600000,
      );
  return {
    db,
    calls,
    api,
    seed,
    close: async () => {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
      db.close();
    },
  };
}
test("GitHub App tokens are encrypted, audience bound and reads cannot become arbitrary authenticated requests", () => {
  const encrypted = sealToken("ghu_secret", 1, config.key);
  assert.ok(!encrypted.includes("ghu_secret"));
  assert.equal(openToken(encrypted, 1, config.key), "ghu_secret");
  assert.throws(() => openToken(encrypted, 2, config.key));
  for (const path of [
    "https://evil.test/repos/a/b/pulls",
    "//evil.test",
    "/repos/a/b/contents/secret",
    "/repos/a/b/pulls?access_token=leak",
    "/repos/a/b/pulls?per_page=100",
    "/repos/a/b/pulls?state=open&state=all",
    "/repos/a/b/pulls?page=151",
  ])
    assert.throws(() => allowedRead(path));
  assert.equal(
    allowedRead("/repos/fixture/private/pulls/1/files?per_page=20&page=1")
      .repository,
    "https://github.com/fixture/private",
  );
});
test("Vercel API rewrite parameters preserve the GitHub resource query for organization repositories", async () => {
  const deployment = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  const rewrite = deployment.rewrites.find((r) => r.source.startsWith("/api/:") && r.destination === "/api");
  const capture = rewrite.source.match(/:([A-Za-z_]+)\*/)[1];
  const query = new URLSearchParams({ path: "/repos/fixture/private/pulls?per_page=20&page=1" });
  // Unused source captures are forwarded as query parameters by the host.
  // Using `path` for both the route and GitHub resource loses the resource.
  query.set(capture, "github/read");
  const f = await fixture();
  try {
    f.seed(1);
    const result = await f.api("/github/read?" + query);
    assert.equal(result.status, 200);
    assert.equal(result.data.private, true);
    assert.equal(result.data.data[0].title, "Private fixture PR");
  } finally {
    await f.close();
  }
});
test("GitHub App reads reauthorize each viewer, never expose tokens and enforce private project bindings", async () => {
  const f = await fixture();
  try {
    f.seed(1);
    f.seed(2);
    const path =
      "/github/read?" +
      new URLSearchParams({
        path: "/repos/fixture/private/pulls?per_page=20&page=1",
      });
    assert.equal((await f.api(path, { user: null })).status, 401);
    const owner = await f.api(path);
    assert.equal(owner.status, 200);
    assert.equal(owner.data.private, true);
    assert.equal(owner.data.data[0].title, "Private fixture PR");
    assert.ok(!JSON.stringify(owner.data).includes("ghu_"));
    assert.equal((await f.api(path, { user: 2 })).status, 404);
    assert.equal(
      (
        await f.api("/projects/1/github", {
          body: {
            repository: "https://github.com/fixture/private",
            expected_version: 0,
          },
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await f.api("/projects/2/github", {
          body: {
            repository: "https://github.com/fixture/private",
            expected_version: 0,
          },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await f.api("/projects/2/github", {
          body: {
            repository: "https://github.com/fixture/private",
            expected_version: 0,
          },
        })
      ).status,
      409,
    );
    assert.equal((await f.api("/projects/2/github", { user: 2 })).status, 404);
    const status = await f.api("/github/status");
    assert.equal(status.data.connected, true);
    assert.ok(!JSON.stringify(status.data).includes("refresh"));
    assert.equal(
      (await f.api("/github/connection", { method: "DELETE" })).status,
      200,
    );
    assert.equal((await f.api(path)).status, 409);
  } finally {
    await f.close();
  }
});
test("OAuth state is cookie/account bound, one-use, PKCE protected and a disconnect cancels an in-flight callback", async () => {
  let release, started;
  const gate = new Promise((r) => (release = r)),
    running = new Promise((r) => (started = r));
  const f = await fixture({
    exchange: async () => {
      started();
      await gate;
      return responseToken;
    },
  });
  try {
    const begin = await f.api("/github/connect", { body: {} }),
      url = new URL(begin.data.url),
      cookie = begin.headers.getSetCookie()[0].split(";")[0];
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    assert.equal(url.searchParams.get("scope"), "offline_access");
    const path =
      "/github/callback?" +
      new URLSearchParams({
        state: url.searchParams.get("state"),
        code: "fixture-code",
      });
    assert.equal(
      (await f.api(path, { user: 2, headers: { cookie } })).status,
      400,
    );
    assert.equal((await f.api(path)).status, 400);
    const callback = f.api(path, { headers: { cookie } });
    await running;
    await f.api("/github/connection", { method: "DELETE" });
    release();
    assert.equal((await callback).status, 409);
    assert.equal((await f.api("/github/status")).data.connected, false);
    assert.equal((await f.api(path, { headers: { cookie } })).status, 400);
  } finally {
    release();
    await f.close();
  }
});
test("Refresh rotation has a durable lease and cannot resurrect a disconnected connection", async () => {
  let release, started;
  const gate = new Promise((r) => (release = r)),
    running = new Promise((r) => (started = r));
  const f = await fixture({
    exchange: async () => {
      started();
      await gate;
      return responseToken;
    },
  });
  try {
    f.seed(1, "ghu_owner", Date.now() - 1);
    const path =
      "/github/repository?repository=https://github.com/fixture/private";
    const first = f.api(path);
    await running;
    assert.ok(
      f.db.prepare("SELECT lease_until FROM github_connections").get()
        .lease_until > Date.now(),
    );
    await f.api("/github/connection", { method: "DELETE" });
    release();
    assert.equal((await first).status, 409);
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM github_connections").get().n,
      0,
    );
  } finally {
    release();
    await f.close();
  }
});
test("Signed webhooks are idempotent, reject tampering, record no private content and revoke authorization", async () => {
  const f = await fixture();
  try {
    f.seed();
    const id = randomUUID(),
      payload = JSON.stringify({
        action: "opened",
        repository: { html_url: "https://github.com/fixture/private" },
        pull_request: { body: "Private fixture body must not be retained." },
      }),
      signature =
        "sha256=" +
        createHmac("sha256", config.webhook).update(payload).digest("hex");
    const headers = {
      "x-github-delivery": id,
      "x-github-event": "pull_request",
      "x-hub-signature-256": signature,
    };
    assert.equal(
      validWebhook(Buffer.from(payload), signature, config.webhook),
      true,
    );
    assert.equal(
      (
        await f.api("/github/webhook", {
          user: null,
          body: payload,
          headers: {
            ...headers,
            "x-hub-signature-256": "sha256=" + "0".repeat(64),
          },
        })
      ).status,
      401,
    );
    assert.equal(
      (await f.api("/github/webhook", { user: null, body: payload, headers }))
        .status,
      200,
    );
    assert.equal(
      (await f.api("/github/webhook", { user: null, body: payload, headers }))
        .data.duplicate,
      true,
    );
    assert.equal(
      f.db.prepare("SELECT generation FROM github_repo_events").get()
        .generation,
      1,
    );
    assert.ok(
      !JSON.stringify(
        f.db.prepare("SELECT * FROM github_deliveries").all(),
      ).includes("Private fixture"),
    );
    const revoke = JSON.stringify({ action: "revoked", sender: { id: 100 } });
    assert.equal(
      (
        await f.api("/github/webhook", {
          user: null,
          body: revoke,
          headers: {
            "x-github-delivery": randomUUID(),
            "x-github-event": "github_app_authorization",
            "x-hub-signature-256":
              "sha256=" +
              createHmac("sha256", config.webhook).update(revoke).digest("hex"),
          },
        })
      ).status,
      200,
    );
    assert.equal((await f.api("/github/status")).data.connected, false);
    f.db.exec("UPDATE github_app_schema SET version=2");
    assert.equal(githubAppReady(f.db), false);
    assert.throws(() => prepareGitHubApp(f.db), /newer/);
  } finally {
    await f.close();
  }
});

test("Successful App authorization and refresh retain only encrypted credentials and never change sign-in links", async () => {
  const f = await fixture();
  try {
    const begin = await f.api("/github/connect", { body: {} }),
      url = new URL(begin.data.url),
      cookie = begin.headers.getSetCookie()[0].split(";")[0];
    const path =
      "/github/callback?" +
      new URLSearchParams({
        state: url.searchParams.get("state"),
        code: "fixture-code",
      });
    const result = await f.api(path, { headers: { cookie } });
    assert.equal(result.status, 302);
    assert.equal(
      result.headers.get("location"),
      "https://fixture.test/app#github",
    );
    const row = f.db
      .prepare("SELECT * FROM github_connections WHERE user_id=1")
      .get();
    assert.equal(row.subject, 100);
    assert.ok(!row.access.includes("ghu_"));
    assert.equal(
      openToken(row.access, 1, config.key),
      responseToken.access_token,
    );
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM oauth_accounts").get().n,
      0,
    );
    assert.equal((await f.api(path, { headers: { cookie } })).status, 400);
    f.db
      .prepare("UPDATE github_connections SET expires=0 WHERE user_id=1")
      .run();
    assert.equal(
      (
        await f.api(
          "/github/repository?repository=https://github.com/fixture/private",
        )
      ).status,
      200,
    );
    assert.equal(
      f.db.prepare("SELECT version FROM github_connections").get().version,
      2,
    );
  } finally {
    await f.close();
  }
});
