import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import { startTestServer } from "./http-fixture.mjs";
import {
  participationReady,
  prepareParticipation,
} from "../project-participation-schema.mjs";
import { createBackup, restoreBackup } from "../backup.mjs";
async function setup(t) {
  const f = await startTestServer();
  t.after(() => f.close());
  const users = [];
  for (const name of ["access_owner", "access_peer", "access_observer"]) {
    const api = f.client(),
      r = await api("/register", {
        name,
        username: name,
        email: name + "@fixture.test",
        password: "Fixture-password123",
      });
    assert.equal(r.status, 200);
    users.push({ api, id: r.data.user.id, name });
  }
  return { f, owner: users[0], peer: users[1], observer: users[2] };
}
async function project(api, mode = "approved", community = null) {
  const r = await api("/projects", {
    name: "Participation fixture",
    description: "A shared place for bounded and careful work.",
    topic: "web",
    stage: "Prototype",
    help: "Verify the retry boundary.",
    participation_mode: mode,
    community_id: community,
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data;
}
async function task(api, p) {
  const r = await api("/posts", {
    title: "Check cancellation",
    body: "Check the cancellation guard and permanent failures.",
    kind: "review",
    topic: "web",
    code: "const retry = () => false;",
    review_focus: "Check the cancellation boundary.",
    ...(p.community_id ? { community_id: p.community_id } : {}),
  });
  assert.equal(r.status, 201);
  const post = r.data;
  assert.equal(
    (
      await api(
        `/projects/${p.id}/work-requests/${post.id}`,
        { state: "open", expected_version: 0 },
        "PUT",
      )
    ).status,
    201,
  );
  return post;
}
const policy = (api, p, version, members, mode = "approved") =>
  api(
    `/projects/${p.id}/participation`,
    { mode, members, expected_version: version },
    "PUT",
  );
test("Approved projects separate read visibility from working rights; revocation releases assignments and retains results", async (t) => {
  const { f, owner, peer, observer } = await setup(t),
    p = await project(owner.api),
    post = await task(owner.api, p),
    root = `/projects/${p.id}`;
  assert.equal(
    (await f.client()(root + "/participation")).data.mode,
    "approved",
  );
  assert.equal(
    (await observer.api("/posts/" + post.id)).data.participation.read_only,
    true,
  );
  assert.equal(
    (
      await observer.api(root + "/room/tasks/" + post.id, {
        action: "claim",
        expected_version: 1,
      })
    ).status,
    403,
  );
  for (const [path, body] of [
    [`/posts/${post.id}/replies`, { body: "Should be refused." }],
    [`/posts/${post.id}/vote`, {}],
    [`/details/post/${post.id}`, { links: [] }],
    [
      root + "/contributions",
      {
        post_id: post.id,
        body: "No admission",
        operation_key: randomUUID(),
        expected_version: 0,
      },
    ],
  ])
    assert.equal(
      (
        await observer.api(
          path,
          body,
          path.startsWith("/details") ? "PUT" : "POST",
        )
      ).status,
      403,
      path,
    );
  assert.equal((await policy(observer.api, p, 1, [observer.name])).status, 403);
  assert.equal((await policy(owner.api, p, 0, [peer.name])).status, 409);
  let r = await policy(owner.api, p, 1, [peer.name]);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.version, 2);
  assert.equal(
    (await peer.api(root + "/participation")).data.can_participate,
    true,
  );
  assert.equal(
    "members" in (await observer.api(root + "/participation")).data,
    false,
  );
  assert.equal(
    (
      await peer.api(root + "/room/tasks/" + post.id, {
        action: "claim",
        expected_version: 1,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await peer.api(`/posts/${post.id}/replies`, {
        body: "An approved response.",
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await peer.api(root + "/contributions", {
        post_id: post.id,
        body: "Verified bounded cancellation in the retry test.",
        operation_key: randomUUID(),
        expected_version: 0,
      })
    ).status,
    201,
  );
  r = await policy(owner.api, p, 2, []);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const row = (await owner.api(root + "/room/tasks/" + post.id)).data.task;
  assert.equal(row.assignee_id, null);
  assert.equal(row.work_version, 3);
  assert.equal(
    (
      await peer.api(root + "/room/tasks/" + post.id, {
        action: "claim",
        expected_version: 3,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await peer.api(`/posts/${post.id}/replies`, {
        body: "No longer allowed.",
      })
    ).status,
    403,
  );
  assert.equal((await peer.api(root + "/contributions")).data.items.length, 1);
  assert.equal((await peer.api("/posts/" + post.id)).status, 200);
  assert.equal(
    (
      await owner.api(root + "/room/tasks/" + post.id, {
        action: "assign",
        username: observer.name,
        expected_version: 3,
      })
    ).status,
    409,
  );
  assert.equal((await policy(owner.api, p, 3, [], "open")).status, 200);
  assert.equal(
    (
      await observer.api(root + "/room/tasks/" + post.id, {
        action: "claim",
        expected_version: 3,
      })
    ).status,
    200,
  );
  assert.equal(
    (await observer.api("/posts/" + post.id)).data.participation.read_only,
    false,
  );
});
test("Private audiences remain independent; policy CAS, invalid usernames and presentation details cannot grant access", async (t) => {
  const { f, owner, peer, observer } = await setup(t),
    group = (
      await owner.api("/communities", {
        name: "Private access team",
        description: "Private fixture.",
      })
    ).data,
    p = await project(owner.api, "approved", group.id),
    root = `/projects/${p.id}`;
  assert.equal((await peer.api(root + "/participation")).status, 404);
  assert.equal((await policy(owner.api, p, 1, [peer.name])).status, 400);
  const db = new DatabaseSync(join(f.directory, "fixture.sqlite"));
  t.after(() => db.close());
  db.prepare(
    "INSERT INTO memberships(user_id,kind,item) VALUES(?,'group',?)",
  ).run(peer.id, group.id);
  const races = await Promise.all([
    policy(owner.api, p, 1, [peer.name]),
    policy(owner.api, p, 1, []),
  ]);
  assert.deepEqual(races.map((x) => x.status).sort(), [200, 409]);
  let current = (await owner.api(root + "/participation")).data;
  assert.equal(
    (await policy(owner.api, p, current.version, ["not_here"])).status,
    400,
  );
  assert.equal(
    (await policy(owner.api, p, current.version, [peer.name, peer.name]))
      .status,
    400,
  );
  assert.equal(
    (
      await observer.api(
        `/details/project_access/${p.id}`,
        { mode: "open" },
        "PUT",
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await owner.api(
        `/details/project/${p.id}`,
        { team: [{ user_id: observer.id, role: "Credit" }], mode: "open" },
        "PUT",
      )
    ).status,
    200,
  );
  assert.equal(
    (await owner.api(root + "/participation")).data.mode,
    "approved",
  );
  current = (await owner.api(root + "/participation")).data;
  assert.equal(
    (await policy(owner.api, p, current.version, [peer.name])).status,
    200,
  );
  db.prepare("DELETE FROM memberships WHERE user_id=? AND item=?").run(
    peer.id,
    group.id,
  );
  assert.equal((await peer.api(root + "/participation")).status, 404);
  assert.equal((await peer.api(root)).status, 404);
});
test("Database barriers reject legacy inserts, preserve policy on restore and refuse future preparation", async (t) => {
  const { f, owner, peer } = await setup(t),
    p = await project(owner.api, "open"),
    post = await task(owner.api, p);
  const path = join(f.directory, "fixture.sqlite"),
    db = new DatabaseSync(path);
  t.after(() => db.close());
  assert.equal(participationReady(db), true);
  prepareParticipation(db);
  assert.equal(
    (
      await peer.api(`/projects/${p.id}/room/tasks/${post.id}`, {
        action: "claim",
        expected_version: 1,
      })
    ).status,
    200,
  );
  const reply = db
    .prepare("INSERT INTO replies(user_id,post_id,body) VALUES(?,?,?)")
    .run(peer.id, post.id, "Original response");
  assert.equal((await policy(owner.api, p, 0, [])).status, 200);
  assert.throws(
    () =>
      db
        .prepare("INSERT INTO replies(user_id,post_id,body) VALUES(?,?,?)")
        .run(peer.id, post.id, "Legacy bypass"),
    /approval required/,
  );
  assert.throws(
    () =>
      db
        .prepare("INSERT INTO votes(user_id,post_id) VALUES(?,?)")
        .run(peer.id, post.id),
    /approval required/,
  );
  assert.throws(
    () =>
      db
        .prepare("UPDATE room_assignments SET user_id=? WHERE post_id=?")
        .run(peer.id, post.id),
    /approval required/,
  );
  assert.throws(
    () =>
      db
        .prepare("UPDATE replies SET body=? WHERE id=?")
        .run("A forbidden change", reply.lastInsertRowid),
    /approval required/,
  );
  assert.doesNotThrow(() =>
    db
      .prepare("UPDATE posts SET body=? WHERE id=?")
      .run("Owner can still edit", post.id),
  );
  const key = randomBytes(32).toString("hex"),
    archive = join(f.directory, "access.ddb"),
    restore = join(f.directory, "restored");
  await createBackup({
    db,
    storage: {
      get: async () => {
        throw Error("No fixture files expected");
      },
    },
    output: archive,
    key,
  });
  await restoreBackup({ input: archive, key, target: restore });
  const recovered = new DatabaseSync(join(restore, "database.sqlite"));
  try {
    assert.equal(participationReady(recovered), true);
  } finally {
    recovered.close();
  }
  const restoredServer = await startTestServer({
    databasePath: join(restore, "database.sqlite"),
  });
  try {
    const r = await restoredServer.client()(`/projects/${p.id}/participation`);
    assert.equal(r.status, 200);
    assert.equal(r.data.mode, "approved");
    assert.equal(r.data.capabilities.project_participation, 1);
  } finally {
    await restoredServer.close();
  }
  db.exec("UPDATE participation_schema SET version=2");
  assert.throws(() => prepareParticipation(db), /newer/);
  assert.equal(
    db.prepare("SELECT version FROM participation_schema").get().version,
    2,
  );
});
