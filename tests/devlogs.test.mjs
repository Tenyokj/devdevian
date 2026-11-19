import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { startTestServer } from "./http-fixture.mjs";
import { prepareDevlogs, devlogsReady } from "../devlogs.mjs";
async function setup(t) {
  const f = await startTestServer();
  t.after(() => f.close());
  const users = [];
  for (const name of ["devlog_owner", "devlog_peer"]) {
    const api = f.client();
    const r = await api("/register", {
      name,
      username: name,
      email: name + "@fixture.test",
      password: "Fixture-password123",
    });
    assert.equal(r.status, 200);
    users.push({ api, id: r.data.user.id });
  }
  const [owner, peer] = users;
  const r = await owner.api("/projects", {
    name: "Orbit journal",
    description: "Building reliable queues, one useful change at a time.",
    topic: "web",
    stage: "Prototype",
    help: "Help inspect retry boundaries.",
  });
  assert.equal(r.status, 201);
  return { f, owner, peer, p: r.data, guest: f.client() };
}
const payload = (status = "draft") => ({
  title: "A clearer retry boundary",
  body: "We separated transient and permanent failures. [Review](https://github.com/example/orbit/pull/1)",
  status,
  operation_key: randomUUID(),
});
test("Devlogs preserve drafts, isolate owners, publish once and reject stale edits", async (t) => {
  const { owner, peer, p, guest } = await setup(t);
  const root = `/projects/${p.id}/devlogs`;
  assert.equal((await peer.api(root, payload())).status, 403);
  const draft = payload();
  const created = await owner.api(root, draft);
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const d = created.data.devlog;
  assert.equal((await guest(root)).data.items.length, 0);
  assert.equal((await guest(root + "/" + d.id)).status, 404);
  assert.equal((await peer.api(root + "?status=draft")).status, 403);
  assert.equal((await guest("/posts/" + p.post_id)).data.updates.length, 0);
  assert.equal((await owner.api(root, draft)).data.replayed, true);
  assert.equal(
    (await owner.api(root, { ...draft, body: "Different retry content." }))
      .status,
    409,
  );
  assert.equal((await owner.api(root + "?status=draft")).data.items.length, 1);
  assert.equal(
    (
      await peer.api(
        "/subscriptions/post/" + p.post_id,
        { following: true },
        "PUT",
      )
    ).status,
    200,
  );
  const write = { ...draft, status: "published", expected_version: 1 };
  const responses = await Promise.all([
    owner.api(root + "/" + d.id, write, "PUT"),
    owner.api(root + "/" + d.id, write, "PUT"),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await guest(root)).data.items[0].version, 2);
  assert.equal(
    (await guest("/posts/" + p.post_id)).data.updates[0].id,
    (await guest(root)).data.items[0].legacy_id,
  );
  const notifications = (await peer.api("/notifications")).data.items.filter(
    (n) => n.type === "project_update",
  );
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].project_id, p.id);
  assert.equal(
    (
      await owner.api(
        root + "/" + d.id,
        { ...write, expected_version: 2, title: "An edited progress update" },
        "PUT",
      )
    ).status,
    200,
  );
  assert.equal(
    (await peer.api("/notifications")).data.items.filter(
      (n) => n.type === "project_update",
    ).length,
    1,
  );
  assert.equal(
    (
      await owner.api(
        root + "/" + d.id,
        { ...write, status: "draft", expected_version: 3 },
        "PUT",
      )
    ).status,
    409,
  );
  await peer.api(
    "/account/preferences",
    { preferences: { notify_projects: false } },
    "PATCH",
  );
  const legacy = await owner.api(`/projects/${p.id}/updates`, {
    title: "Legacy updates still work",
    body: "The original update composer remains compatible.",
  });
  assert.equal(legacy.status, 201);
  assert.equal(
    (await peer.api("/notifications")).data.items.filter(
      (n) => n.type === "project_update",
    ).length,
    1,
  );
  // Rollback-era readers use this unfiltered table. It must never contain drafts.
  const legacyRows = (await guest("/posts/" + p.post_id)).data.updates;
  assert.equal(legacyRows.length, 2);
});
test("Devlogs inherit private project audience and pause restrictions", async (t) => {
  const { f, owner, peer, p, guest } = await setup(t);
  const c = await owner.api("/communities", {
    name: "Private journal",
    description: "A private project audience.",
  });
  assert.equal(c.status, 201);
  const pr = await owner.api("/projects", {
    name: "Private project",
    description: "Only approved members may read the story.",
    topic: "web",
    stage: "Prototype",
    help: "Review the queue.",
    community_id: c.data.id,
  });
  assert.equal(pr.status, 201, JSON.stringify(pr.data));
  const root = `/projects/${pr.data.id}/devlogs`;
  const r = await owner.api(root, payload("published"));
  assert.equal(r.status, 201);
  for (const api of [guest, peer.api]) {
    assert.equal((await api(root)).status, 404);
    assert.equal((await api(root + "/" + r.data.id)).status, 404);
  }
  const db = new DatabaseSync(f.path);
  db.prepare("UPDATE posts SET archived_at=CURRENT_TIMESTAMP WHERE id=?").run(
    p.post_id,
  );
  db.close();
  assert.equal(
    (await owner.api(`/projects/${p.id}/devlogs`, payload())).status,
    409,
  );
  assert.equal((await guest(`/projects/${p.id}/devlogs`)).status, 200);
});
test("Devlog migration preserves legacy updates and is repeatable", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE projects(id INTEGER PRIMARY KEY);CREATE TABLE users(id INTEGER PRIMARY KEY);CREATE TABLE project_updates(id INTEGER PRIMARY KEY,project_id INTEGER,user_id INTEGER,title TEXT,body TEXT,created TEXT DEFAULT CURRENT_TIMESTAMP);INSERT INTO project_updates(project_id,user_id,title,body) VALUES(1,1,'Original update','Preserve this text')",
  );
  prepareDevlogs(db);
  prepareDevlogs(db);
  assert.equal(devlogsReady(db), true);
  assert.equal(
    db.prepare("SELECT title FROM project_updates").get().title,
    "Original update",
  );
  assert.equal(db.prepare("SELECT COUNT(*) n FROM project_devlogs").get().n, 0);
  db.close();
});
test("server drafts can be discarded only by their owner with the current version", async (t) => {
  const { owner, peer, p } = await setup(t),
    root = `/projects/${p.id}/devlogs`;
  const d = (await owner.api(root, payload())).data.devlog;
  assert.equal(
    (await peer.api(root + "/" + d.id, { expected_version: 1 }, "DELETE"))
      .status,
    403,
  );
  assert.equal(
    (await owner.api(root + "/" + d.id, { expected_version: 2 }, "DELETE"))
      .status,
    409,
  );
  assert.equal(
    (await owner.api(root + "/" + d.id, { expected_version: 1 }, "DELETE"))
      .status,
    200,
  );
  assert.equal((await owner.api(root + "/" + d.id)).status, 404);
  const pub = (await owner.api(root, payload("published"))).data.devlog;
  assert.equal(
    (await owner.api(root + "/" + pub.id, { expected_version: 1 }, "DELETE"))
      .status,
    409,
  );
});
test("Devlogs enforce daily publication quota while allowing saved drafts and exact retries", async (t) => {
  const { owner, p } = await setup(t),
    root = `/projects/${p.id}/devlogs`;
  const first = payload("published");
  for (let i = 0; i < 5; i++)
    assert.equal(
      (await owner.api(root, i ? payload("published") : first)).status,
      201,
    );
  assert.equal((await owner.api(root, first)).status, 200);
  assert.equal((await owner.api(root, payload("published"))).status, 429);
  assert.equal((await owner.api(root, payload())).status, 201);
});
test("encrypted backup restores Devlog drafts, published records and version checks", async (t) => {
  const { createBackup, restoreBackup } = await import("../backup.mjs");
  const { join } = await import("node:path");
  const { randomBytes } = await import("node:crypto");
  const { f, owner, p } = await setup(t),
    root = `/projects/${p.id}/devlogs`;
  await owner.api(root, payload());
  await owner.api(root, payload("published"));
  const db = new DatabaseSync(f.path),
    key = randomBytes(32).toString("hex"),
    output = join(f.directory, "devlogs.ddb"),
    target = join(f.directory, "restored-devlogs");
  try {
    await createBackup({
      db,
      storage: {
        get: async () => {
          throw Error("No uploads expected");
        },
      },
      output,
      key,
    });
    await restoreBackup({ input: output, key, target });
    const restored = new DatabaseSync(join(target, "database.sqlite"));
    try {
      assert.equal(devlogsReady(restored), true);
      assert.deepEqual(
        restored
          .prepare("SELECT status,version FROM project_devlogs ORDER BY id")
          .all()
          .map((r) => ({ ...r })),
        [
          { status: "draft", version: 1 },
          { status: "published", version: 1 },
        ],
      );
    } finally {
      restored.close();
    }
  } finally {
    db.close();
  }
});

test("legacy writers and readers coexist without exposing drafts or duplicating published entries", async (t) => {
  const { f, owner, p, guest } = await setup(t),
    root = `/projects/${p.id}/devlogs`;
  const draft = (await owner.api(root, payload())).data.devlog;
  const db = new DatabaseSync(f.path);
  db.prepare(
    "INSERT INTO project_updates(project_id,user_id,title,body) VALUES(?,?,?,?)",
  ).run(
    p.id,
    owner.id,
    "Older server publication",
    "This legacy update must stay visible during rollout.",
  );
  assert.equal(db.prepare("SELECT COUNT(*) n FROM project_updates").get().n, 1);
  db.close();
  const visible = (await guest(root)).data.items;
  assert.equal(visible.length, 1);
  assert.equal(visible[0].title, "Older server publication");
  const edited = await owner.api(
    root + "/" + visible[0].id,
    {
      title: "An adopted legacy update",
      body: "New clients can edit legacy entries without creating another publication.",
      status: "published",
      expected_version: 1,
    },
    "PUT",
  );
  assert.equal(edited.status, 200);
  assert.equal((await guest(root)).data.items.length, 1);
  assert.equal((await guest("/posts/" + p.post_id)).data.updates.length, 1);
  assert.equal(
    (await owner.api(root + "?status=draft")).data.items[0].id,
    draft.id,
  );
});
