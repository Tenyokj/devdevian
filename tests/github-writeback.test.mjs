import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { openDatabase } from "../database.mjs";
import {
  registerWriteback,
  prepareWriteback,
  writebackInput,
} from "../github-writeback.mjs";
import { githubPOST, githubError } from "../github-app-core.mjs";
async function fixture() {
  const db = await openDatabase({
    DB_PATH: ":memory:",
    DB_DRIVER: process.env.DB_DRIVER || "",
  });
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY);INSERT INTO users VALUES(1),(2);
 CREATE TABLE posts(id INTEGER PRIMARY KEY,user_id INTEGER,title TEXT,body TEXT,community_id TEXT,removed_at TEXT,locked_at TEXT,archived_at TEXT);
 INSERT INTO posts VALUES(1,1,'A retry strategy','Useful discussion context',NULL,NULL,NULL,NULL),(2,1,'Private title','Private context','private',NULL,NULL,NULL);
 CREATE TABLE memberships(user_id INTEGER,kind TEXT,item TEXT);INSERT INTO memberships VALUES(1,'group','private');
 CREATE TABLE usage_limits(key TEXT PRIMARY KEY,window_start INTEGER,used INTEGER);
 CREATE TABLE github_connections(user_id INTEGER PRIMARY KEY,subject INTEGER,login TEXT);INSERT INTO github_connections VALUES(1,101,'author'),(2,202,'peer');`);
  let calls = 0,
    failure = null,
    privateRepo = false,
    delay = null;
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = { id: Number(req.headers["x-user"] || 1) };
    next();
  });
  registerWriteback(app, db, (req, res, next) => next(), {
    ready: (req, res, next) => next(),
    origin: "https://fixture.test",
    repository: async () => ({ private: privateRepo }),
    get: async (req, path) => ({
      data:
        path === "/user"
          ? { id: req.user.id === 1 ? 101 : 202, login: "author" }
          : { html_url: "https://github.com/fixture/repo/issues/2" },
    }),
    write: async (req, path, body) => {
      calls++;
      if (delay) await delay;
      if (failure) throw failure;
      return { data: { html_url: "https://github.com/fixture/repo/issues/3" } };
    },
  });
  app.use((e, req, res, next) =>
    res.status(e.status || 500).json({ error: e.message }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const api = async (path, body, user = 1) => {
    const r = await fetch(
      `http://127.0.0.1:${server.address().port}/api/github/writeback${path}`,
      {
        method: body ? "POST" : "GET",
        headers: { "Content-Type": "application/json", "x-user": String(user) },
        body: body ? JSON.stringify(body) : undefined,
      },
    );
    return { status: r.status, data: await r.json() };
  };
  const preview = (extra = {}) =>
    api("/preview", {
      kind: "issue",
      post_id: 1,
      target: "https://github.com/fixture/repo",
      title: "A useful issue",
      body: "Our agreed outcome",
      ...extra,
    });
  return {
    db,
    api,
    preview,
    get calls() {
      return calls;
    },
    setFailure: (v) => (failure = v),
    setPrivate: (v) => (privateRepo = v),
    setDelay: (v) => (delay = v),
    close: async () => {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
      db.close();
    },
  };
}
test("writeback preview binds identity, source and exact content; confirmation and duplicate sends", async () => {
  const f = await fixture();
  try {
    const p = await f.preview();
    assert.equal(p.status, 200);
    assert.equal(p.data.actor, "author");
    assert.match(
      p.data.body,
      /Source: https:\/\/fixture.test\/conversation\/1/,
    );
    assert.equal(f.calls, 0);
    assert.equal((await f.api("/" + p.data.id + "/send", {})).status, 400);
    const sent = await f.api("/" + p.data.id + "/send", {
      confirm: true,
      body: "tampered",
    });
    assert.equal(sent.status, 200);
    assert.equal(sent.data.state, "sent");
    assert.match(sent.data.body, /Our agreed outcome/);
    assert.equal(
      (await f.api("/" + p.data.id + "/send", { confirm: true })).status,
      200,
    );
    assert.equal(f.calls, 1);
    assert.equal((await f.api("/" + p.data.id, undefined, 2)).status, 404);
    assert.equal((await f.api("", undefined, 2)).data.items.length, 0);
  } finally {
    await f.close();
  }
});
test("writeback private source cannot reach a public repo and needs explicit consent", async () => {
  const f = await fixture();
  try {
    assert.equal(
      (await f.preview({ post_id: 2, share_private: true })).status,
      409,
    );
    f.setPrivate(true);
    assert.equal((await f.preview({ post_id: 2 })).status, 409);
    const p = await f.preview({ post_id: 2, share_private: true });
    assert.equal(p.status, 200);
    assert.doesNotMatch(p.data.body, /Source:/);
    f.setPrivate(false);
    assert.equal(
      (await f.api("/" + p.data.id + "/send", { confirm: true })).status,
      409,
    );
    assert.equal(f.calls, 0);
    assert.equal(
      (
        await f.api(
          "/preview",
          {
            kind: "issue",
            post_id: 2,
            target: "https://github.com/fixture/repo",
            title: "Test title",
            body: "Test body long",
          },
          2,
        )
      ).status,
      404,
    );
  } finally {
    await f.close();
  }
});
test("writeback refuses stale, removed, paused and foreign sources and changed GitHub account", async () => {
  const f = await fixture();
  try {
    const p = await f.preview();
    f.db.prepare("UPDATE posts SET body='changed' WHERE id=1").run();
    assert.equal(
      (await f.api("/" + p.data.id + "/send", { confirm: true })).status,
      409,
    );
    const p2 = await f.preview();
    f.db
      .prepare("UPDATE github_connections SET subject=999 WHERE user_id=1")
      .run();
    assert.equal(
      (await f.api("/" + p2.data.id + "/send", { confirm: true })).status,
      409,
    );
    f.db.prepare("UPDATE posts SET locked_at='now' WHERE id=1").run();
    assert.equal((await f.preview()).status, 409);
    assert.equal(f.calls, 0);
  } finally {
    await f.close();
  }
});
test("writeback uncertain response and concurrent submissions never resend", async () => {
  const f = await fixture();
  try {
    const p = await f.preview();
    let release;
    f.setDelay(new Promise((r) => (release = r)));
    const first = f.api("/" + p.data.id + "/send", { confirm: true });
    while (!f.calls) await new Promise((r) => setTimeout(r, 5));
    assert.equal(
      (await f.api("/" + p.data.id + "/send", { confirm: true })).status,
      409,
    );
    release();
    assert.equal((await first).status, 200);
    assert.equal(f.calls, 1);
    f.setDelay(null);
    f.setFailure(Error("connection lost"));
    const p2 = await f.preview();
    assert.equal(
      (await f.api("/" + p2.data.id + "/send", { confirm: true })).status,
      409,
    );
    assert.equal((await f.api("/" + p2.data.id)).data.state, "uncertain");
    assert.equal(
      (await f.api("/" + p2.data.id + "/send", { confirm: true })).status,
      409,
    );
    assert.equal(f.calls, 2);
    f.setFailure(
      Object.assign(githubError("denied", 403), { definitelyRejected: true }),
    );
    const p3 = await f.preview();
    await f.api("/" + p3.data.id + "/send", { confirm: true });
    assert.equal((await f.api("/" + p3.data.id)).data.state, "rejected");
    prepareWriteback(f.db);
    assert.equal((await f.api("/" + p2.data.id)).data.state, "uncertain");
  } finally {
    await f.close();
  }
});
test("write transport rejects arbitrary targets, redirects and untrusted input", async () => {
  assert.throws(() => writebackInput({ kind: "merge" }));
  assert.throws(() =>
    writebackInput({
      kind: "comment",
      target: "https://evil.test/fixture/repo/issues/2",
      body: "A useful message",
    }),
  );
  let calls = 0;
  await assert.rejects(
    githubPOST("//evil.test", "secret", {}, { fetcher: async () => calls++ }),
  );
  assert.equal(calls, 0);
  await assert.rejects(
    githubPOST(
      "/repos/fixture/repo/issues",
      "secret",
      {},
      {
        fetcher: async (url, opts) => {
          assert.equal(url, "https://api.github.com/repos/fixture/repo/issues");
          assert.equal(opts.redirect, "manual");
          return new Response("", { status: 403 });
        },
      },
    ),
    (e) => e.definitelyRejected,
  );
});
