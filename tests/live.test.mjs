import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import { startTestServer } from "./http-fixture.mjs";
import { seedInsights } from "./insights-fixture.mjs";
import { openDatabase } from "../database.mjs";
import { prepareLive, liveDocument } from "../live.mjs";
async function setup(t) {
  const f = await startTestServer();
  t.after(() => f.close());
  const s = await seedInsights(f);
  const db = await openDatabase({
    DB_PATH: f.path,
    DB_DRIVER: process.env.DB_DRIVER,
  });
  t.after(() => db.close());
  s.memberId = db
    .prepare("SELECT id FROM users WHERE email='communitymember@insights.test'")
    .get().id;
  for (const [id, username] of [
    [s.id, "liveauthor"],
    [s.other, "livepeer"],
    [s.memberId, "livemember"],
  ])
    db.prepare("UPDATE users SET username=? WHERE id=?").run(username, id);
  const people = db
    .prepare("SELECT id,username FROM users WHERE id IN(?,?,?)")
    .all(s.id, s.other, s.memberId);
  return { f, s, db, people };
}
const create = (a, post, operation_key = crypto.randomUUID()) =>
  a(`/posts/${post}/live`, {
    title: "Let’s solve the retry problem",
    code: "const retry = 1;\n",
    language: "typescript",
    operation_key,
  });
const sync = (a, id, doc, update) =>
  a(`/live/${id}/sync`, {
    client_id: String(doc.clientID),
    revision: 0,
    after: 0,
    heartbeat: true,
    ...(update ? { update: Buffer.from(update).toString("base64") } : {}),
  });
test("Live merges concurrent code edits, syncs chat once, freezes a result and publishes exactly one ordinary reply", async (t) => {
  const { s, db, people } = await setup(t);
  const op = crypto.randomUUID(),
    created = await create(s.a, s.publicId, op);
  assert.equal(created.status, 201);
  const id = created.data.id;
  assert.equal((await create(s.a, s.publicId, op)).data.id, id);
  assert.equal(
    (
      await s.a(`/posts/${s.publicId}/live`, {
        title: "Changed title",
        code: "x",
        language: "typescript",
        operation_key: op,
      })
    ).status,
    409,
  );
  const invite = await s.a(
    `/live/${id}/members`,
    { username: people.find((p) => p.id === s.other).username, role: "editor" },
    "PATCH",
  );
  assert.equal(invite.status, 200, JSON.stringify(invite.data));
  const initial = (await s.a("/live/" + id)).data;
  const a = new Y.Doc(),
    b = new Y.Doc();
  t.after(() => {
    a.destroy();
    b.destroy();
  });
  for (const d of [a, b])
    Y.applyUpdate(d, Buffer.from(initial.state, "base64"));
  const stateA = Y.encodeStateVector(a),
    stateB = Y.encodeStateVector(b);
  a.getText("code").insert(0, "// first\n");
  b.getText("code").insert(b.getText("code").length, "// second\n");
  const results = await Promise.all([
    sync(s.a, id, a, Y.encodeStateAsUpdate(a, stateA)),
    sync(s.b, id, b, Y.encodeStateAsUpdate(b, stateB)),
  ]);
  assert.deepEqual(
    results.map((x) => x.status),
    [200, 200],
  );
  const read = (await s.a("/live/" + id)).data;
  Y.applyUpdate(a, Buffer.from(read.state, "base64"));
  Y.applyUpdate(b, Buffer.from(read.state, "base64"));
  assert.equal(a.getText("code").toString(), b.getText("code").toString());
  assert.match(a.getText("code").toString(), /first/);
  assert.match(a.getText("code").toString(), /second/);
  const key = crypto.randomUUID(),
    message = { body: "We should preserve cancellation.", operation_key: key };
  const m1 = await s.b(`/live/${id}/messages`, message),
    m2 = await s.b(`/live/${id}/messages`, message);
  assert.equal(m1.data.id, m2.data.id);
  assert.equal((await sync(s.a, id, a)).data.messages.length, 1);
  assert.equal(
    (
      await s.b(`/live/${id}/close`, {
        summary: "Outcome.",
        expected_revision: read.session.revision,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await s.a(`/live/${id}/close`, {
        summary: "Outcome.",
        expected_revision: 1,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await s.a(`/live/${id}/close`, {
        summary: "Preserved both edits and cancellation.",
        expected_revision: read.session.revision,
      })
    ).status,
    200,
  );
  assert.equal((await sync(s.b, id, b, Y.encodeStateAsUpdate(b))).status, 403);
  assert.equal((await s.a(`/live/${id}/publish`, {})).status, 400);
  const published = await Promise.all([
    s.a(`/live/${id}/publish`, { confirm: true }),
    s.a(`/live/${id}/publish`, { confirm: true }),
  ]);
  assert.equal(published[0].data.reply_id, published[1].data.reply_id);
  assert.equal(published[0].status, 200, JSON.stringify(published[0].data));
  const reply = db
    .prepare("SELECT body FROM replies WHERE id=?")
    .get(published[0].data.reply_id);
  assert.match(reply.body, /first/);
  assert.match(reply.body, /second/);
  assert.equal(
    db.prepare("SELECT accepted_reply_id FROM posts WHERE id=?").get(s.publicId)
      .accepted_reply_id,
    null,
  );
});
test("Live enforces invitations, source audience, read-only project participation and immediate revocation", async (t) => {
  const { f, s, db, people } = await setup(t);
  const guest = f.client(),
    id = (await create(s.a, s.publicId)).data.id;
  assert.equal((await guest("/live/" + id)).status, 401);
  assert.equal((await s.b("/live/" + id)).status, 404);
  const other = people.find((p) => p.id === s.other).username;
  assert.equal(
    (
      await s.a(
        `/live/${id}/members`,
        { username: other, role: "viewer" },
        "PATCH",
      )
    ).status,
    200,
  );
  const data = (await s.b("/live/" + id)).data,
    d = new Y.Doc();
  t.after(() => d.destroy());
  Y.applyUpdate(d, Buffer.from(data.state, "base64"));
  d.getText("code").insert(0, "forbidden");
  assert.equal((await sync(s.b, id, d, Y.encodeStateAsUpdate(d))).status, 403);
  assert.equal(
    (
      await s.b(
        `/live/${id}/members`,
        { username: other, role: "editor" },
        "PATCH",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await s.a(
        `/live/${id}/members`,
        { username: other, role: "remove" },
        "PATCH",
      )
    ).status,
    200,
  );
  assert.equal((await s.b("/live/" + id)).status, 404);
  const privateSession = (await create(s.a, s.privateId)).data.id;
  assert.equal(
    (
      await s.a(
        `/live/${privateSession}/members`,
        { username: other, role: "editor" },
        "PATCH",
      )
    ).status,
    404,
  );
  const member = people.find((p) => p.id === s.memberId).username;
  assert.equal(
    (
      await s.a(
        `/live/${privateSession}/members`,
        { username: member, role: "editor" },
        "PATCH",
      )
    ).status,
    200,
  );
  db.prepare("DELETE FROM memberships WHERE user_id=? AND kind='group'").run(
    s.memberId,
  );
  assert.equal((await s.member("/live/" + privateSession)).status, 404);
  db.prepare("UPDATE posts SET removed_at=CURRENT_TIMESTAMP WHERE id=?").run(
    s.publicId,
  );
  assert.equal((await s.a("/live/" + id)).status, 404);
  assert.ok(!(await s.a("/live")).data.items.some((x) => x.id === id));
});
test("Live rejects malformed/oversized CRDT content, keeps source code unchanged and checks future schemas", async (t) => {
  const { s, db } = await setup(t),
    id = (await create(s.a, s.publicId)).data.id;
  assert.equal(
    (await s.a(`/live/${id}/sync`, { client_id: "1", update: "not-base64!" }))
      .status,
    400,
  );
  const doc = new Y.Doc();
  t.after(() => doc.destroy());
  doc.getMap("unwanted").set("key", "value");
  assert.throws(() =>
    liveDocument(
      null,
      Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"),
    ),
  );
  assert.equal(
    (await sync(s.a, id, doc, Y.encodeStateAsUpdate(doc))).status,
    400,
  );
  const huge = new Y.Doc();
  huge.getText("code").insert(0, "a".repeat(20001));
  assert.throws(() =>
    liveDocument(
      null,
      Buffer.from(Y.encodeStateAsUpdate(huge)).toString("base64"),
    ),
  );
  huge.destroy();
  assert.equal(
    db.prepare("SELECT code FROM posts WHERE id=?").get(s.publicId).code,
    "",
  );
  prepareLive(db);
  db.prepare("UPDATE live_schema SET version=2 WHERE id=1").run();
  assert.throws(() => prepareLive(db), /newer/);
});

test("Live respects approved-project revocation while retaining a readable session", async (t) => {
  const { s, db } = await setup(t);
  const id = (await create(s.a, s.publicId)).data.id;
  const policy = (members) =>
    db
      .prepare(
        "INSERT INTO entity_details(kind,entity_id,data) VALUES('project_access',?,?) ON CONFLICT(kind,entity_id) DO UPDATE SET data=excluded.data",
      )
      .run(
        String(s.publicProject),
        JSON.stringify({ mode: "approved", members, version: 1 }),
      );
  policy([]);
  assert.equal((await create(s.b, s.publicId)).status, 403);
  assert.equal(
    (
      await s.a(
        `/live/${id}/members`,
        { username: "livepeer", role: "editor" },
        "PATCH",
      )
    ).status,
    409,
  );
  policy([s.other]);
  assert.equal(
    (
      await s.a(
        `/live/${id}/members`,
        { username: "livepeer", role: "editor" },
        "PATCH",
      )
    ).status,
    200,
  );
  policy([]);
  const read = await s.b(`/live/${id}`);
  assert.equal(read.status, 200);
  assert.equal(read.data.session.can_edit, false);
  assert.equal(
    (
      await s.b(`/live/${id}/messages`, {
        body: "No longer allowed",
        operation_key: crypto.randomUUID(),
      })
    ).status,
    403,
  );
  const doc = new Y.Doc();
  t.after(() => doc.destroy());
  Y.applyUpdate(doc, Buffer.from(read.data.state, "base64"));
  doc.getText("code").insert(0, "forbidden");
  assert.equal(
    (await sync(s.b, id, doc, Y.encodeStateAsUpdate(doc))).status,
    403,
  );
});
test("Live code, membership and chat survive encrypted restore; presence and sign-in do not", async (t) => {
  const { f, s, db } = await setup(t);
  const id = (await create(s.a, s.publicId)).data.id;
  await s.a(
    `/live/${id}/members`,
    { username: "livepeer", role: "editor" },
    "PATCH",
  );
  await s.b(`/live/${id}/messages`, {
    body: "Retained session message",
    operation_key: crypto.randomUUID(),
  });
  await s.a(`/live/${id}/sync`, {
    client_id: "123",
    heartbeat: true,
    revision: 0,
    after: 0,
  });
  assert.equal(db.prepare("SELECT count(*) n FROM live_presence").get().n, 1);
  const { createBackup, restoreBackup } = await import("../backup.mjs");
  const { join } = await import("node:path");
  const { randomBytes } = await import("node:crypto");
  const output = join(f.directory, "live.ddb"),
    target = join(f.directory, "restored"),
    key = randomBytes(32).toString("hex");
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
  const restored = await openDatabase({
    DB_PATH: join(target, "database.sqlite"),
    DB_DRIVER: process.env.DB_DRIVER || "",
  });
  try {
    assert.equal(
      liveDocument(
        restored.prepare("SELECT state FROM live_sessions WHERE id=?").get(id)
          .state,
      ).code,
      "const retry = 1;\n",
    );
    assert.equal(
      restored
        .prepare("SELECT count(*) n FROM live_members WHERE session_id=?")
        .get(id).n,
      2,
    );
    assert.equal(
      restored
        .prepare("SELECT body FROM live_messages WHERE session_id=?")
        .get(id).body,
      "Retained session message",
    );
    assert.equal(
      restored.prepare("SELECT count(*) n FROM live_presence").get().n,
      0,
    );
    assert.equal(
      restored.prepare("SELECT count(*) n FROM sessions").get().n,
      0,
    );
  } finally {
    restored.close();
  }
});

test("Deleting an account removes its hosted Live sessions and revokes its invitations elsewhere", async (t) => {
  const { s, db } = await setup(t);
  const hosted = (await create(s.b, s.publicId)).data.id;
  const shared = (await create(s.a, s.publicId)).data.id;
  await s.a(
    `/live/${shared}/members`,
    { username: "livepeer", role: "editor" },
    "PATCH",
  );
  await s.b(`/live/${hosted}/messages`, {
    body: "Host-only retained context",
    operation_key: crypto.randomUUID(),
  });
  const result = await s.b("/account", { confirm: "livepeer" }, "DELETE");
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(
    db.prepare("SELECT count(*) n FROM live_sessions WHERE id=?").get(hosted).n,
    0,
  );
  assert.equal(
    db
      .prepare("SELECT count(*) n FROM live_members WHERE user_id=?")
      .get(s.other).n,
    0,
  );
  assert.equal(
    db
      .prepare("SELECT count(*) n FROM live_messages WHERE session_id=?")
      .get(hosted).n,
    0,
  );
  assert.equal((await s.a(`/live/${shared}`)).status, 200);
});
