import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { startTestServer } from "./http-fixture.mjs";
import { prepareRooms, roomsReady } from "../rooms.mjs";
import { createBackup, restoreBackup } from "../backup.mjs";
const account = async (f, name) => {
  const api = f.client();
  const r = await api("/register", {
    name,
    username: name,
    email: name + "@fixture.test",
    password: "Fixture-password123",
  });
  assert.equal(r.status, 200);
  return { api, id: r.data.user.id, name };
};
async function setup(f) {
  const owner = await account(f, "room_owner"),
    peer = await account(f, "room_peer"),
    other = await account(f, "room_other");
  const pr = await owner.api("/projects", {
    name: "Orbit room",
    description: "A tiny queue with a shared next step.",
    topic: "web",
    stage: "Prototype",
    help: "Make retries predictable and easy to review.",
  });
  assert.equal(pr.status, 201);
  const p = await owner.api("/posts", {
    kind: "review",
    topic: "web",
    title: "Handle permanent failures",
    body: "Inspect the retry boundary.",
    code: "const retry = true;",
    review_focus: "Check permanent failures.",
  });
  assert.equal(p.status, 201);
  const project = pr.data.id,
    post = p.data.id;
  assert.equal(
    (
      await owner.api(
        `/projects/${project}/work-requests/${post}`,
        { state: "open", expected_version: 0 },
        "PUT",
      )
    ).status,
    201,
  );
  return {
    owner,
    peer,
    other,
    project,
    post,
    root: `/projects/${project}/room`,
  };
}
test("Rooms claims are atomic, assignees can move tasks without editing content, and every write checks versions and pause state", async () => {
  const f = await startTestServer();
  try {
    const { owner, peer, other, post, root } = await setup(f);
    assert.equal((await f.client()(root + "/tasks?mine=1")).status, 401);
    const race = await Promise.all([
      peer.api(root + "/tasks/" + post, {
        action: "claim",
        expected_version: 1,
      }),
      other.api(root + "/tasks/" + post, {
        action: "claim",
        expected_version: 1,
      }),
    ]);
    assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
    const winner = race[0].status === 200 ? peer : other,
      loser = winner === peer ? other : peer;
    assert.equal(
      (
        await loser.api(root + "/tasks/" + post, {
          action: "state",
          state: "ready",
          expected_version: 2,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await winner.api(root + "/tasks/" + post, {
          action: "state",
          state: "in_progress",
          expected_version: 2,
        })
      ).status,
      200,
    );
    assert.equal(
      (await winner.api(root + "/tasks?mine=1")).data.items[0].state,
      "in_progress",
    );
    assert.equal(
      (await loser.api(root + "/tasks?mine=1")).data.pagination.total,
      0,
    );
    assert.equal(
      (
        await winner.api(
          "/posts/" + post,
          { title: "Take over content" },
          "PATCH",
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await winner.api(root + "/tasks/" + post, {
          action: "release",
          expected_version: 2,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await owner.api(root + "/tasks/" + post, {
          action: "assign",
          username: loser.name,
          expected_version: 3,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await winner.api(root + "/tasks/" + post, {
          action: "state",
          state: "ready",
          expected_version: 4,
        })
      ).status,
      409,
    );
    const db = new DatabaseSync(f.path);
    db.prepare("UPDATE posts SET locked_at=CURRENT_TIMESTAMP WHERE id=?").run(
      post,
    );
    assert.equal(
      (
        await loser.api(root + "/tasks/" + post, {
          action: "state",
          state: "ready",
          expected_version: 4,
        })
      ).status,
      409,
    );
    db.close();
    assert.ok(
      (await owner.api(root + "/activity")).data.items.some(
        (e) => e.type === "task_assigned",
      ),
    );
  } finally {
    await f.close();
  }
});
test("Rooms decisions preserve immutable edit history, idempotent pinning and original private audience across every aggregate", async () => {
  const f = await startTestServer();
  try {
    const { owner, peer, other, project, root } = await setup(f);
    const group = (
      await owner.api("/communities", {
        name: "Room private work",
        description: "Keep private tasks and decisions private.",
      })
    ).data;
    const post = (
      await owner.api("/posts", {
        kind: "question",
        topic: "web",
        title: "Private deployment choice",
        body: "Which region is appropriate?",
        community_id: group.id,
      })
    ).data.id;
    await owner.api(
      `/projects/${project}/work-requests/${post}`,
      { state: "open", expected_version: 0 },
      "PUT",
    );
    const db = new DatabaseSync(f.path);
    db.prepare(
      "INSERT INTO memberships(user_id,kind,item) VALUES(?,'group',?)",
    ).run(peer.id, group.id);
    assert.equal(
      (
        await owner.api(root + "/tasks/" + post, {
          action: "assign",
          username: other.name,
          expected_version: 1,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await owner.api(root + "/tasks/" + post, {
          action: "assign",
          username: peer.name,
          expected_version: 1,
        })
      ).status,
      200,
    );
    const pin = {
      title: "Keep one retry owner",
      body: "Permanent failures stop immediately.",
      post_id: post,
      expected_version: 0,
      operation_key: randomUUID(),
    };
    assert.equal((await peer.api(root + "/decisions", pin)).status, 403);
    const first = await owner.api(root + "/decisions", pin);
    assert.equal(first.status, 201);
    const repeat = await owner.api(root + "/decisions", pin);
    assert.equal(repeat.data.id, first.data.id);
    assert.equal(repeat.data.recovered, true);
    assert.equal(
      (
        await owner.api(root + "/decisions", {
          ...pin,
          body: "Different retry policy.",
        })
      ).status,
      409,
    );
    assert.equal(
      (await other.api(root + "/decisions")).data.pagination.total,
      0,
    );
    const path = root + "/decisions/" + first.data.id;
    assert.equal((await peer.api(path + "/history")).data.pagination.total, 1);
    assert.equal(
      (
        await owner.api(
          path,
          {
            title: pin.title,
            body: "Changed reasoning.",
            post_id: null,
            expected_version: 1,
          },
          "PUT",
        )
      ).status,
      409,
      "Cannot expose earlier private history by changing audience",
    );
    assert.equal(
      (
        await owner.api(
          path,
          {
            ...pin,
            title: "A bounded retry owner",
            body: "Changed reasoning.",
            expected_version: 1,
          },
          "PUT",
        )
      ).status,
      200,
    );
    assert.equal(
      (await owner.api(path, { ...pin, expected_version: 1 }, "PUT")).status,
      409,
    );
    assert.equal((await owner.api(path + "/history")).data.pagination.total, 2);
    assert.throws(
      () => db.exec("UPDATE room_decision_history SET body='wrong'"),
      /immutable/,
    );
    db.prepare("DELETE FROM memberships WHERE user_id=? AND kind='group'").run(
      peer.id,
    );
    assert.equal(
      (await peer.api(root + "/decisions")).data.pagination.total,
      0,
    );
    assert.equal((await peer.api(path + "/history")).status, 404);
    assert.equal((await peer.api(root + "/tasks/" + post)).status, 404);
    assert.equal(
      (await peer.api(root + "/activity")).data.items.some(
        (e) => e.post_id === post,
      ),
      false,
    );
    assert.equal(
      (
        await peer.api(root + "/tasks/" + post, {
          action: "release",
          expected_version: 2,
        })
      ).status,
      409,
    );
    const key = randomBytes(32).toString("hex"),
      output = join(f.directory, "room.ddb"),
      target = join(f.directory, "restored-room");
    await createBackup({
      db,
      storage: {
        get: async () => {
          throw Error("No fixture uploads expected");
        },
      },
      output,
      key,
    });
    await restoreBackup({ input: output, key, target });
    const restored = new DatabaseSync(join(target, "database.sqlite"));
    assert.equal(roomsReady(restored), true);
    assert.equal(
      restored.prepare("SELECT COUNT(*) n FROM room_decision_history").get().n,
      2,
    );
    assert.equal(
      restored
        .prepare(
          "SELECT COUNT(*) n FROM room_assignments WHERE user_id IS NOT NULL",
        )
        .get().n,
      1,
    );
    assert.throws(
      () => restored.exec("UPDATE room_events SET type='wrong'"),
      /immutable/,
    );
    restored.close();
    db.close();
  } finally {
    await f.close();
  }
});
test("Rooms optional preparation repairs only explicitly and refuses future feature markers", async () => {
  const f = await startTestServer();
  let old;
  try {
    const { owner, root } = await setup(f);
    const db = new DatabaseSync(f.path);
    const marker = db.prepare("SELECT version FROM app_schema").get().version;
    db.exec("DROP TRIGGER room_events_immutable");
    assert.equal(roomsReady(db), false);
    old = await startTestServer({ databasePath: f.path });
    assert.equal((await old.client()(root)).status, 503);
    assert.equal((await old.client()("/health")).status, 200);
    assert.equal(roomsReady(db), false);
    prepareRooms(db);
    prepareRooms(db);
    assert.equal(roomsReady(db), true);
    assert.equal(
      db.prepare("SELECT version FROM app_schema").get().version,
      marker,
    );
    db.exec("UPDATE rooms_schema SET version=2");
    assert.throws(() => prepareRooms(db), /newer/);
    db.close();
  } finally {
    await old?.close();
    await f.close();
  }
});
