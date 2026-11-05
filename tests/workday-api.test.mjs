import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { openDatabase } from "../database.mjs";
import { registerMyWork } from "../my-work.mjs";
async function fixture(t) {
  const db = await openDatabase({
    DB_PATH: ":memory:",
    DB_DRIVER: process.env.DB_DRIVER || "",
  });
  db.exec(`CREATE TABLE memberships(user_id INTEGER,kind TEXT,item TEXT);
 INSERT INTO memberships VALUES(1,'group','team'),(2,'group','team');
 CREATE TABLE posts(id INTEGER PRIMARY KEY,user_id INTEGER,title TEXT,kind TEXT,community_id TEXT,created TEXT,removed_at TEXT,archived_at TEXT,locked_at TEXT);
 INSERT INTO posts(id,user_id,title,kind,community_id,created) VALUES(1,1,'Project','project','team','2026-11-05'),(2,1,'Task','question','team','2026-11-05'),(3,1,'Review','review',NULL,'2026-11-05'),(4,3,'Other','question',NULL,'2026-11-05');
 CREATE TABLE projects(id INTEGER PRIMARY KEY,user_id INTEGER,post_id INTEGER,name TEXT);INSERT INTO projects VALUES(1,1,1,'Project');
 CREATE TABLE project_work_requests(post_id INTEGER,project_id INTEGER,linked INTEGER,state TEXT,updated_at TEXT);INSERT INTO project_work_requests VALUES(2,1,1,'in_progress','2026-11-05');
 CREATE TABLE room_assignments(post_id INTEGER,project_id INTEGER,user_id INTEGER);INSERT INTO room_assignments VALUES(2,1,2);
 CREATE TABLE review_revisions(id INTEGER PRIMARY KEY,post_id INTEGER,number INTEGER);INSERT INTO review_revisions VALUES(1,3,1);
 CREATE TABLE review_requests(id INTEGER PRIMARY KEY,post_id INTEGER,snapshot_id INTEGER,reviewer_id INTEGER,state TEXT,updated_at TEXT);INSERT INTO review_requests VALUES(1,3,1,2,'pending','2026-11-05');
 CREATE TABLE review_outcomes(id INTEGER PRIMARY KEY,request_id INTEGER,verdict TEXT,created TEXT);
 CREATE TABLE code_reviews(id INTEGER PRIMARY KEY,post_id INTEGER,user_id INTEGER,created TEXT,deleted_at TEXT,resolved INTEGER);INSERT INTO code_reviews VALUES(1,3,2,'2026-11-05',NULL,0);
 CREATE TABLE code_review_replies(id INTEGER PRIMARY KEY,review_id INTEGER,user_id INTEGER,created TEXT,deleted_at TEXT);
 CREATE TABLE contributions(id INTEGER PRIMARY KEY,project_id INTEGER,post_id INTEGER,user_id INTEGER,revision INTEGER,state TEXT,updated_at TEXT);INSERT INTO contributions VALUES(1,1,2,2,1,'submitted','2026-11-05');`);
  db.roomsReady = db.reviewFlowReady = db.contributionsReady = true;
  const app = express();
  app.use((req, res, next) => {
    if (req.headers["x-user"]) req.user = { id: Number(req.headers["x-user"]) };
    next();
  });
  registerMyWork(app, db, (req, res, next) =>
    req.user ? next() : res.status(401).json({ error: "Sign in" }),
  );
  app.use((e, req, res, next) => res.status(500).json({ error: e.message }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    db.close();
  });
  const call = async (path, user = 1) => {
    const r = await fetch(
      `http://127.0.0.1:${server.address().port}/api/my-work${path}`,
      { headers: user ? { "x-user": String(user) } : {} },
    );
    return { status: r.status, data: await r.json() };
  };
  return { db, call };
}
test("My work scopes next actions to the viewer and tracks exact review snapshots", async (t) => {
  const { db, call } = await fixture(t);
  assert.equal((await call("", null)).status, 401);
  assert.equal((await call("?section=invalid")).status, 400);
  let r = await call("?user_id=2");
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.items.map((x) => x.type).sort(), [
    "remark",
    "result",
  ]);
  r = await call("", 2);
  assert.deepEqual(
    r.data.items.map((x) => x.type),
    ["request"],
  );
  assert.equal(r.data.items[0].action, "Review invitation");
  db.exec("UPDATE review_requests SET state='accepted'");
  assert.equal((await call("", 2)).data.items[0].action, "Finish review");
  db.exec(
    "UPDATE review_requests SET state='completed';INSERT INTO review_outcomes VALUES(1,1,'changes_requested','2026-11-05')",
  );
  assert.ok((await call("")).data.items.some((x) => x.type === "outcome"));
  db.exec("INSERT INTO review_revisions VALUES(2,3,2)");
  assert.ok(!(await call("")).data.items.some((x) => x.type === "outcome"));
  db.exec("INSERT INTO code_review_replies VALUES(1,1,1,'2026-11-05',NULL)");
  assert.ok(!(await call("")).data.items.some((x) => x.type === "remark"));
  assert.ok((await call("", 2)).data.items.some((x) => x.type === "remark"));
  db.exec("UPDATE code_reviews SET resolved=1");
  assert.ok(!(await call("", 2)).data.items.some((x) => x.type === "remark"));
});
test("My work requires task and parent access; assignment and contribution transitions stay independent", async (t) => {
  const { db, call } = await fixture(t);
  assert.equal((await call("?section=tasks", 2)).data.items.length, 1);
  assert.equal((await call("?section=tasks", 1)).data.items.length, 0);
  assert.equal((await call("?section=tasks", 3)).data.items.length, 0);
  assert.equal((await call("?section=results", 1)).data.items.length, 1);
  assert.equal((await call("?section=results", 2)).data.items.length, 1);
  assert.equal((await call("?section=results", 3)).data.items.length, 0);
  db.exec("UPDATE contributions SET state='changes_requested'");
  assert.ok((await call("", 2)).data.items.some((x) => x.type === "result"));
  assert.ok(!(await call("")).data.items.some((x) => x.type === "result"));
  db.exec("UPDATE contributions SET state='accepted'");
  assert.ok(!(await call("", 2)).data.items.some((x) => x.type === "result"));
  assert.equal((await call("?section=tasks", 2)).data.items.length, 1);
  db.exec("UPDATE posts SET locked_at='now' WHERE id=1");
  assert.equal((await call("?section=tasks", 2)).data.items.length, 0);
  assert.equal((await call("?section=results", 2)).data.items.length, 1);
  db.exec(
    "UPDATE posts SET community_id=NULL WHERE id=2;DELETE FROM memberships WHERE user_id=2",
  );
  assert.equal((await call("?section=results", 2)).data.items.length, 0);
  db.exec("UPDATE posts SET removed_at='now' WHERE id=1");
  assert.equal((await call("?section=results", 1)).data.items.length, 0);
});
test("Recent conversations recheck permissions and expose only bounded metadata in supplied order", async (t) => {
  const { db, call } = await fixture(t);
  let r = await call("/recent?ids=3,2,4", 2);
  assert.deepEqual(
    r.data.items.map((x) => x.id),
    [3, 2, 4],
  );
  assert.ok(r.data.items.every((x) => !("body" in x)));
  db.exec("DELETE FROM memberships WHERE user_id=2");
  assert.deepEqual(
    (await call("/recent?ids=3,2,4", 2)).data.items.map((x) => x.id),
    [3, 4],
  );
  db.exec("UPDATE posts SET removed_at='now' WHERE id=3");
  assert.deepEqual(
    (await call("/recent?ids=3,4", 2)).data.items.map((x) => x.id),
    [4],
  );
  for (const ids of [
    "1,1",
    "1 OR 1=1",
    "0",
    "-1",
    Array.from({ length: 13 }, (_, i) => i + 1).join(","),
  ])
    assert.equal(
      (await call("/recent?ids=" + encodeURIComponent(ids))).status,
      400,
    );
  assert.equal((await call("/recent?ids=")).data.items.length, 0);
});
test("Selected page is bounded and unavailable optional sources are explicit", async (t) => {
  const { db, call } = await fixture(t);
  let r = await call("?limit=1");
  assert.equal(r.data.items.length, 1);
  assert.equal(r.data.pagination.total, 2);
  assert.notEqual(
    (await call("?limit=1&page=2")).data.items[0].id,
    r.data.items[0].id,
  );
  db.roomsReady = db.reviewFlowReady = db.contributionsReady = false;
  r = await call("");
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.unavailable, [
    "Named reviews",
    "Room tasks",
    "Contributions",
  ]);
  assert.deepEqual(
    r.data.items.map((x) => x.type),
    ["remark"],
  );
  assert.equal((await call("?section=tasks")).data.items.length, 0);
});
