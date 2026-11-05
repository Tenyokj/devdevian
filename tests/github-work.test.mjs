import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { randomUUID } from "node:crypto";
import { openDatabase } from "../database.mjs";
import {
  prepareGitHubWork,
  registerGitHubWork,
  githubWorkReady,
} from "../github-work.mjs";
import { githubError } from "../github-app-core.mjs";
import { githubWorkPlan } from "../packages/cli/lib/github-work.mjs";
async function fixture() {
  const db = await openDatabase({
    DB_PATH: ":memory:",
    DB_DRIVER: process.env.DB_DRIVER || "",
  });
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY);INSERT INTO users VALUES(1),(2),(3);
 CREATE TABLE memberships(user_id INTEGER,kind TEXT,item TEXT);INSERT INTO memberships VALUES(1,'group','team'),(2,'group','team');
 CREATE TABLE posts(id INTEGER PRIMARY KEY,user_id INTEGER,title TEXT,body TEXT,kind TEXT,topic TEXT,stack TEXT,community_id TEXT,code TEXT,review_focus TEXT,repo_url TEXT,demo_url TEXT,removed_at TEXT,archived_at TEXT,locked_at TEXT);
 INSERT INTO posts(id,user_id,title,community_id) VALUES(1,1,'Private project','team'),(2,1,'Public project',NULL);
 CREATE TABLE projects(id INTEGER PRIMARY KEY,user_id INTEGER,post_id INTEGER,repo TEXT,topic TEXT,stack TEXT);
 INSERT INTO projects VALUES(1,1,1,'https://github.com/example/repo','web','TypeScript'),(2,1,2,'https://github.com/example/repo','web','');
 CREATE TABLE github_project_repos(project_id INTEGER PRIMARY KEY,repository TEXT);
 CREATE TABLE project_work_requests(post_id INTEGER PRIMARY KEY,project_id INTEGER,state TEXT,created_by INTEGER,linked INTEGER DEFAULT 1,version INTEGER DEFAULT 1);
 CREATE TABLE room_assignments(post_id INTEGER PRIMARY KEY,project_id INTEGER,user_id INTEGER);
 CREATE TABLE room_events(id INTEGER PRIMARY KEY,project_id INTEGER,post_id INTEGER,actor_id INTEGER,type TEXT,target_id INTEGER,state TEXT);
 CREATE TABLE usage_limits(key TEXT PRIMARY KEY,window_start INTEGER,used INTEGER);
 CREATE TABLE contributions(id INTEGER PRIMARY KEY,project_id INTEGER,post_id INTEGER,user_id INTEGER,revision INTEGER,state TEXT);`);
  db.roomsReady = true;
  db.contributionsReady = true;
  let issueBody = "Make retry bounded.",
    denied = false,
    moved = false,
    closed = false,
    hook = null;
  const repository = async (req) => {
    if (denied || req.user.id === 3)
      throw githubError("No repository access.", 404);
    return { private: true, repository: "https://github.com/example/repo" };
  };
  const get = async (req, path) => {
    if (hook) await hook(path);
    if (path.endsWith("/issues/4"))
      return {
        data: {
          number: 4,
          title: "Bound retry",
          body: issueBody,
          state: closed ? "closed" : "open",
          updated_at: "2026-11-04T00:00:00Z",
          html_url: "https://github.com/example/repo/issues/4",
        },
      };
    if (path.endsWith("/pulls/5"))
      return {
        data: {
          number: 5,
          title: "Fix retry",
          body: "One exact patch",
          state: closed ? "closed" : "open",
          merged: closed,
          updated_at: "2026-11-04T00:00:00Z",
          html_url: "https://github.com/example/repo/pull/5",
          head: { sha: (moved ? "c" : "a").repeat(40) },
          base: { sha: "b".repeat(40) },
        },
      };
    if (path.endsWith("/reviews?per_page=20&page=1"))
      return {
        data: [
          {
            user: { id: 100 },
            commit_id: "a".repeat(40),
            state: "CHANGES_REQUESTED",
          },
        ],
      };
    if (path.includes("/check-runs"))
      return {
        data: {
          total_count: 1,
          check_runs: [
            { name: "tests", status: "completed", conclusion: "success" },
          ],
        },
      };
    if (path.endsWith("/status")) return { data: { state: "success" } };
    throw githubError("Unexpected fixture resource.", 404);
  };
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    const id = Number(req.headers["x-user"]);
    if (id) req.user = { id };
    next();
  });
  registerGitHubWork(
    app,
    db,
    (req, res, next) =>
      req.user ? next() : res.status(401).json({ error: "Sign in" }),
    { get, repository, ready: (req, res, next) => next() },
  );
  app.use((e, req, res, next) =>
    res.status(e.status || 500).json({ error: e.message }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const call = async (path, body, user = 1, method = body ? "POST" : "GET") => {
    const r = await fetch(
      "http://127.0.0.1:" + server.address().port + "/api" + path,
      {
        method,
        headers: {
          "content-type": "application/json",
          ...(user ? { "x-user": String(user) } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      },
    );
    return { status: r.status, data: await r.json() };
  };
  const api = async (path, opts = {}) => {
    const r = await call(path, opts.body, 1, opts.method);
    if (r.status >= 400)
      throw Object.assign(Error(r.data.error), { status: r.status });
    return r.data;
  };
  return {
    db,
    call,
    api,
    change: (v) => {
      if (v.body) issueBody = v.body;
      if (v.denied !== undefined) denied = v.denied;
      if (v.moved !== undefined) moved = v.moved;
      if (v.closed !== undefined) closed = v.closed;
      if (v.hook !== undefined) hook = v.hook;
    },
    close: async () => {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
      db.close();
    },
  };
}
const issue = "https://github.com/example/repo/issues/4",
  pull = "https://github.com/example/repo/pull/5",
  issues = "/projects/1/github/issues";
async function imported(f) {
  const preview = (await f.call(issues + "/preview", { url: issue })).data;
  const b = {
    url: issue,
    fingerprint: preview.ticket.fingerprint,
    operation_key: randomUUID(),
    share_private: true,
  };
  const r = await f.call(issues + "/import", b);
  assert.equal(r.status, 201);
  return { post: r.data.post_id, b };
}
test("GitHub Issue import preserves private audience, requires consent, deduplicates retries and freezes source text", async () => {
  const f = await fixture();
  try {
    assert.equal(
      (await f.call(issues + "/preview", { url: issue }, null)).status,
      401,
    );
    assert.equal(
      (await f.call(issues + "/preview", { url: issue }, 2)).status,
      403,
    );
    assert.equal(
      (await f.call(issues + "/preview", { url: issue }, 3)).status,
      404,
    );
    assert.equal(
      (await f.call("/projects/2/github/issues/preview", { url: issue }))
        .status,
      409,
    );
    const p = (await f.call(issues + "/preview", { url: issue })).data,
      b = {
        url: issue,
        fingerprint: p.ticket.fingerprint,
        operation_key: randomUUID(),
      };
    assert.equal((await f.call(issues + "/import", b)).status, 400);
    f.change({ body: "Changed after preview" });
    assert.equal(
      (await f.call(issues + "/import", { ...b, share_private: true })).status,
      409,
    );
    const { post, b: sent } = await imported(f);
    assert.equal((await f.call(issues + "/import", sent)).status, 200);
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM github_issue_tasks").get().n,
      1,
    );
    const saved = f.db.prepare("SELECT * FROM posts WHERE id=?").get(post);
    assert.equal(saved.community_id, "team");
    assert.match(saved.body, /Changed after preview/);
    f.change({ body: "Later GitHub edit" });
    assert.equal(
      f.db.prepare("SELECT body FROM posts WHERE id=?").get(post).body,
      saved.body,
    );
    assert.equal(
      f.db
        .prepare("SELECT state FROM project_work_requests WHERE post_id=?")
        .get(post).state,
      "open",
    );
  } finally {
    await f.close();
  }
});
test("Task PR binding pins contribution revision; per-viewer live checks never accept a contribution or change task state", async () => {
  const f = await fixture();
  try {
    const { post } = await imported(f),
      root = `/projects/1/room/tasks/${post}/github`;
    f.db.prepare("INSERT INTO room_assignments VALUES(?,1,2)").run(post);
    f.db
      .prepare("INSERT INTO contributions VALUES(1,1,?,2,1,'submitted')")
      .run(post);
    const p = (await f.call(root + "/preview", { url: pull }, 2)).data;
    const b = {
      url: pull,
      fingerprint: p.ticket.fingerprint,
      expected_version: p.expected_version,
      task_version: p.task_version,
      operation_key: randomUUID(),
      share_private: true,
      contribution_id: 1,
      contribution_revision: 1,
    };
    assert.equal((await f.call(root, b, 2)).status, 200);
    assert.equal((await f.call(root, b, 2)).status, 200);
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM github_task_pull_history").get().n,
      1,
    );
    assert.equal(
      (await f.call(root, { ...b, operation_key: randomUUID() }, 2)).status,
      409,
    );
    f.change({ closed: true });
    const live = await f.call(root, null, 2);
    assert.equal(live.data.live.merged, true);
    assert.equal(live.data.live.checks.runs[0].conclusion, "success");
    assert.equal(
      f.db.prepare("SELECT state FROM contributions WHERE id=1").get().state,
      "submitted",
    );
    assert.equal(
      f.db
        .prepare("SELECT state FROM project_work_requests WHERE post_id=?")
        .get(post).state,
      "open",
    );
    assert.equal((await f.call(root, null, 3)).status, 404);
    f.change({ denied: true });
    assert.equal((await f.call(root, null, 2)).status, 404);
  } finally {
    await f.close();
  }
});
test("GitHub writes recheck membership, assignment and audience after network waits; stale commit checks are refused", async () => {
  const f = await fixture();
  try {
    const { post } = await imported(f),
      root = `/projects/1/room/tasks/${post}/github`;
    f.db.prepare("INSERT INTO room_assignments VALUES(?,1,2)").run(post);
    const p = (await f.call(root + "/preview", { url: pull }, 2)).data,
      b = {
        url: pull,
        fingerprint: p.ticket.fingerprint,
        expected_version: 0,
        task_version: 1,
        operation_key: randomUUID(),
        share_private: true,
      };
    f.change({
      hook: async (path) => {
        if (path.endsWith("/pulls/5"))
          f.db.prepare("DELETE FROM memberships WHERE user_id=2").run();
      },
    });
    assert.equal((await f.call(root, b, 2)).status, 404);
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM github_task_pulls").get().n,
      0,
    );
    f.change({ hook: null });
    assert.equal((await f.call(root, b)).status, 200);
    f.change({
      hook: async (path) => {
        if (path.endsWith("/status")) f.change({ moved: true });
      },
    });
    assert.equal((await f.call(root)).status, 409);
    assert.throws(
      () =>
        f.db
          .prepare("UPDATE github_task_pull_history SET head='changed'")
          .run(),
      /immutable/,
    );
  } finally {
    await f.close();
  }
});
test("CLI GitHub work plans require explicit private sharing and use exact preview metadata; future schema stays untouched", async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      githubWorkPlan(f.api, 1, null, issue),
      /explicitly confirm/,
    );
    const plan = await githubWorkPlan(f.api, 1, null, issue, {
      sharePrivate: true,
    });
    assert.equal(plan.payload.fingerprint, plan.ticket.fingerprint);
    assert.equal(plan.payload.share_private, true);
    assert.equal((await f.call(plan.url, plan.payload)).status, 201);
    assert.equal(githubWorkReady(f.db), true);
    f.db.exec("UPDATE github_work_schema SET version=2");
    assert.throws(() => prepareGitHubWork(f.db), /newer/);
    assert.equal(
      f.db.prepare("SELECT version FROM github_work_schema").get().version,
      2,
    );
  } finally {
    await f.close();
  }
});

test("GitHub PR publication rechecks contributor approval after provider waits", async () => {
  const f = await fixture();
  try {
    const { post } = await imported(f),
      root = `/projects/1/room/tasks/${post}/github`;
    f.db.prepare("INSERT INTO room_assignments VALUES(?,1,2)").run(post);
    f.db.exec(
      "CREATE TABLE entity_details(kind TEXT,entity_id TEXT,data TEXT,PRIMARY KEY(kind,entity_id))",
    );
    f.db
      .prepare("INSERT INTO entity_details VALUES('project_access','1',?)")
      .run(JSON.stringify({ mode: "approved", members: [2], version: 1 }));
    const p = (await f.call(root + "/preview", { url: pull }, 2)).data;
    f.change({
      hook: async (path) => {
        if (path.endsWith("/pulls/5"))
          f.db
            .prepare(
              "UPDATE entity_details SET data=? WHERE kind='project_access'",
            )
            .run(JSON.stringify({ mode: "approved", members: [], version: 2 }));
      },
    });
    const r = await f.call(
      root,
      {
        url: pull,
        fingerprint: p.ticket.fingerprint,
        expected_version: p.expected_version,
        task_version: p.task_version,
        operation_key: randomUUID(),
        share_private: true,
      },
      2,
    );
    assert.equal(r.status, 403);
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM github_task_pulls").get().n,
      0,
    );
  } finally {
    await f.close();
  }
});
