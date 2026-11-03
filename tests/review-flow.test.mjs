import { createBackup, restoreBackup } from "../backup.mjs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { startTestServer } from "./http-fixture.mjs";
import { prepareReviewFlow, reviewFlowReady } from "../review-flow.mjs";
const signup = async (f, name) => {
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
const create = async (api, extra = {}) =>
  (
    await api("/posts", {
      kind: "review",
      topic: "web",
      title: "Review the retry boundary",
      body: "Please inspect retry behavior and its failure path.",
      code: "export const retry = () => true;",
      review_focus: "Check retries and cancellation boundaries.",
      ...extra,
    })
  ).data;
const jsonItems = (data) => data.items || data;
test("assigned reviews preserve version identity, notify the right accounts, enforce roles and keep outcomes separate from resolutions", async () => {
  const f = await startTestServer();
  try {
    const a = await signup(f, "flow_author"),
      b = await signup(f, "flow_reviewer"),
      c = await signup(f, "flow_other");
    const p = await create(a.api),
      root = `/posts/${p.id}`;
    let flow = (await a.api(root + "/review-flow")).data;
    assert.equal(flow.capabilities.review_flow, 1);
    const invite = {
      username: b.name,
      revision_id: flow.current_revision_id,
      expected_revision: flow.post_revision,
      message: "Please check this retry boundary.",
    };
    assert.equal((await b.api(root + "/review-flow", invite)).status, 403);
    assert.equal(
      (await a.api(root + "/review-flow", { ...invite, username: a.name }))
        .status,
      400,
    );
    const races = await Promise.all([
      a.api(root + "/review-flow", invite),
      a.api(root + "/review-flow", invite),
    ]);
    assert.deepEqual(races.map((x) => x.status).sort(), [201, 409]);
    const q = races.find((x) => x.status === 201).data;
    assert.equal((await c.api("/review-flow")).data.pagination.total, 0);
    assert.equal((await b.api("/review-flow")).data.items[0].id, q.id);
    assert.equal(
      (await b.api("/notifications")).data.items.filter(
        (n) => n.type === "review_requested",
      ).length,
      1,
    );
    assert.equal(
      (
        await c.api(
          root + "/review-flow/" + q.id,
          { action: "accept", expected_version: 1 },
          "PATCH",
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await a.api(
          root + "/review-flow/" + q.id,
          { action: "accept", expected_version: 1 },
          "PATCH",
        )
      ).status,
      409,
    );
    const accepted = await b.api(
      root + "/review-flow/" + q.id,
      { action: "accept", expected_version: 1 },
      "PATCH",
    );
    assert.equal(accepted.status, 200);
    assert.equal(accepted.data.state, "accepted");
    assert.equal(
      (
        await b.api(
          root + "/review-flow/" + q.id,
          { action: "decline", expected_version: 1 },
          "PATCH",
        )
      ).status,
      409,
    );
    const meta = (await b.api(root + "/code-reviews")).data;
    const note = await b.api(root + "/code-reviews", {
      body: "Consider permanent failures before retrying.",
      start_line: 1,
      end_line: 1,
      revision_id: flow.current_revision_id,
      snippet_hash: meta.snippet_hash,
    });
    assert.equal(note.status, 201);
    const newer = await a.api(root + "/revisions", {
      base_revision_id: flow.current_revision_id,
      expected_revision: flow.post_revision,
      files: [{ path: "retry.ts", code: "export const retry = () => false;" }],
      review_focus: "Check the new permanent failure guard.",
    });
    assert.equal(newer.status, 201);
    assert.equal(
      (await b.api("/notifications")).data.items.some(
        (n) => n.type === "review_revision",
      ),
      true,
    );
    const bad = await b.api(root + `/review-flow/${q.id}/outcome`, {
      expected_version: 2,
      revision_id: newer.data.id,
      verdict: "no_objections",
      body: "The new guard looks good.",
    });
    assert.equal(bad.status, 409);
    const outcome = await b.api(root + `/review-flow/${q.id}/outcome`, {
      expected_version: 2,
      revision_id: flow.current_revision_id,
      verdict: "changes_requested",
      body: "The original revision needs a permanent failure guard.",
    });
    assert.equal(outcome.status, 201);
    const again = await b.api(root + `/review-flow/${q.id}/outcome`, {
      expected_version: 2,
      revision_id: flow.current_revision_id,
      verdict: "no_objections",
      body: "Duplicate verdict must not replace it.",
    });
    assert.equal(again.status, 409);
    flow = (await a.api(root + "/review-flow")).data;
    assert.equal(flow.items[0].outdated, true);
    assert.equal(flow.items[0].verdict, "changes_requested");
    assert.equal(
      Boolean((await b.api(root + "/code-reviews")).data.items[0].resolved),
      false,
    );
    assert.equal((await a.api(root)).data.accepted_reply_id, null);
    const linked = await a.api(root + "/revision-links", {
      snapshot_id: newer.data.id,
      review_id: note.data.id,
      body: "The guard is now explicit.",
    });
    assert.equal(linked.status, 201);
    assert.equal(
      (
        await b.api(root + "/revision-links", {
          snapshot_id: newer.data.id,
          review_id: note.data.id,
        })
      ).status,
      403,
    );
    assert.equal(
      Boolean((await b.api(root + "/code-reviews")).data.items[0].resolved),
      false,
    );
    assert.equal(
      (
        await a.api(root + "/revision-links", {
          snapshot_id: invite.revision_id,
          review_id: note.data.id,
        })
      ).status,
      409,
    );
    assert.equal(
      (await a.api(root + "/revision-links")).data.items[0].snapshot_id,
      newer.data.id,
    );
    const repeat = await a.api(root + "/review-flow", {
      ...invite,
      revision_id: newer.data.id,
      expected_revision: newer.data.post_revision,
    });
    assert.equal(repeat.status, 201);
    const declined = await b.api(
      root + `/review-flow/${repeat.data.id}`,
      { action: "decline", expected_version: 1 },
      "PATCH",
    );
    assert.equal(declined.status, 200);
    assert.equal(
      (
        await a.api(root + "/review-flow", {
          ...invite,
          revision_id: newer.data.id,
          expected_revision: newer.data.post_revision,
        })
      ).status,
      409,
      "Declined invitations have a cooldown",
    );
    const db = new DatabaseSync(f.path);
    assert.throws(
      () => db.exec("UPDATE review_outcomes SET body='tampered'"),
      /immutable/,
    );
    assert.throws(
      () => db.exec("UPDATE review_revision_links SET body='tampered'"),
      /immutable/,
    );
    assert.throws(
      () => db.exec("UPDATE review_flow_events SET type='tampered'"),
      /immutable/,
    );
    const output = join(f.directory, "flow.ddb"),
      target = join(f.directory, "restored-flow"),
      key = randomBytes(32).toString("hex");
    await createBackup({
      db,
      storage: {
        get: async () => {
          throw Error("Unexpected fixture upload");
        },
      },
      output,
      key,
    });
    await restoreBackup({ input: output, key, target });
    const restored = new DatabaseSync(join(target, "database.sqlite"));
    assert.equal(
      restored
        .prepare("SELECT verdict FROM review_outcomes WHERE request_id=?")
        .get(q.id).verdict,
      "changes_requested",
    );
    assert.equal(
      restored.prepare("SELECT COUNT(*) n FROM review_revision_links").get().n,
      1,
    );
    assert.equal(
      restored.prepare("SELECT COUNT(*) n FROM sessions").get().n,
      0,
    );
    assert.throws(
      () => restored.exec("UPDATE review_outcomes SET body='wrong'"),
      /immutable/,
    );
    assert.equal(reviewFlowReady(restored), true);
    restored.close();
    db.close();
  } finally {
    await f.close();
  }
});
test("private requests, notifications, outcomes and project activity lose visibility on membership revocation", async () => {
  const f = await startTestServer();
  try {
    const a = await signup(f, "flow_private_owner"),
      b = await signup(f, "flow_private_peer"),
      c = await signup(f, "flow_private_outsider");
    const community = (
      await a.api("/communities", {
        name: "Private review team",
        description: "Private assignment boundaries must stay intact.",
      })
    ).data;
    const pr = (
      await a.api("/projects", {
        name: "Flow Orbit",
        description: "A public project with a private work request.",
        topic: "web",
        stage: "Prototype",
        help: "Keep private work and its activity private.",
      })
    ).data;
    const p = await create(a.api, { community_id: community.id }),
      root = `/posts/${p.id}`;
    await a.api(
      `/projects/${pr.id}/work-requests/${p.id}`,
      { state: "open", expected_version: 0 },
      "PUT",
    );
    const flow = (await a.api(root + "/review-flow")).data,
      invite = {
        username: b.name,
        revision_id: flow.current_revision_id,
        expected_revision: flow.post_revision,
      };
    assert.equal((await a.api(root + "/review-flow", invite)).status, 404);
    const db = new DatabaseSync(f.path);
    db.prepare(
      "INSERT INTO memberships(user_id,kind,item) VALUES(?,'group',?)",
    ).run(b.id, community.id);
    const q = await a.api(root + "/review-flow", invite);
    assert.equal(q.status, 201);
    assert.equal(
      (await b.api(`/projects/${pr.id}/review-activity`)).data.pagination.total,
      1,
    );
    assert.equal(
      (await c.api(`/projects/${pr.id}/review-activity`)).data.pagination.total,
      0,
    );
    db.prepare("DELETE FROM memberships WHERE user_id=? AND kind='group'").run(
      b.id,
    );
    for (const suffix of ["/review-flow", "/revision-links"])
      assert.equal((await b.api(root + suffix)).status, 404);
    assert.equal((await b.api("/review-flow")).data.pagination.total, 0);
    assert.equal(
      (await b.api("/notifications")).data.items.some(
        (n) => n.type === "review_requested",
      ),
      false,
    );
    assert.equal(
      (
        await b.api(
          root + `/review-flow/${q.data.id}`,
          { action: "accept", expected_version: 1 },
          "PATCH",
        )
      ).status,
      404,
    );
    assert.equal(
      (await b.api(`/projects/${pr.id}/review-activity`)).data.pagination.total,
      0,
    );
    db.close();
  } finally {
    await f.close();
  }
});
test("optional Review Flow preparation is additive, repeatable and leaves the active schema marker intact", async () => {
  const f = await startTestServer();
  try {
    const db = new DatabaseSync(f.path);
    assert.equal(reviewFlowReady(db), true);
    const marker = db.prepare("SELECT version FROM app_schema").get().version;
    prepareReviewFlow(db);
    prepareReviewFlow(db);
    assert.equal(
      db.prepare("SELECT version FROM app_schema").get().version,
      marker,
    );
    db.exec("DROP TRIGGER review_outcomes_immutable");
    assert.equal(reviewFlowReady(db), false);
    prepareReviewFlow(db);
    assert.equal(reviewFlowReady(db), true);
    db.close();
  } finally {
    await f.close();
  }
});

test("old v7 servers fail only optional Flow routes until explicit preparation; future Flow schemas are never downgraded", async () => {
  const f = await startTestServer();
  let old;
  try {
    const a = await signup(f, "flow_readiness");
    const p = await create(a.api);
    const db = new DatabaseSync(f.path);
    db.exec("DROP TRIGGER review_outcomes_immutable");
    db.close();
    old = await startTestServer({ databasePath: f.path });
    assert.equal((await old.client()("/health")).status, 200);
    assert.equal((await old.client()(`/posts/${p.id}`)).status, 200);
    const disabled = await old.client()(`/posts/${p.id}/review-flow`);
    assert.equal(disabled.status, 503);
    assert.equal(disabled.data.capabilities.review_flow, 0);
    const damaged = new DatabaseSync(f.path);
    assert.equal(reviewFlowReady(damaged), false); // startup did not repair DDL
    prepareReviewFlow(damaged);
    damaged.exec("UPDATE review_flow_schema SET version=2");
    assert.throws(() => prepareReviewFlow(damaged), /newer than this release/);
    assert.equal(
      damaged.prepare("SELECT version FROM review_flow_schema").get().version,
      2,
    );
    assert.equal(reviewFlowReady(damaged), false);
    damaged.close();
  } finally {
    await old?.close();
    await f.close();
  }
});

test("notification opt-out, paused reviews, target pagination stay bounded", async () => {
  const f = await startTestServer();
  try {
    const a = await signup(f, "flow_bounds_author"),
      b = await signup(f, "flow_bounds_peer");
    const p = await create(a.api),
      root = `/posts/${p.id}`;
    const flow = (await a.api(root + "/review-flow")).data;
    assert.equal(
      (
        await b.api(
          "/account/preferences",
          { preferences: { notify_reviews: false } },
          "PATCH",
        )
      ).status,
      200,
    );
    const q = await a.api(root + "/review-flow", {
      username: b.name,
      revision_id: flow.current_revision_id,
      expected_revision: flow.post_revision,
    });
    assert.equal(q.status, 201);
    assert.equal(
      (await b.api("/notifications")).data.items.some(
        (n) => n.type === "review_requested",
      ),
      false,
    );
    const db = new DatabaseSync(f.path);
    db.prepare("UPDATE posts SET locked_at=CURRENT_TIMESTAMP WHERE id=?").run(
      p.id,
    );
    assert.equal(
      (await a.api(root + "/review-flow")).data.permissions.invite,
      false,
    );
    assert.equal(
      (
        await b.api(
          root + `/review-flow/${q.data.id}`,
          { action: "accept", expected_version: 1 },
          "PATCH",
        )
      ).status,
      409,
    );
    db.prepare("UPDATE posts SET locked_at=NULL WHERE id=?").run(p.id);
    // Fixture-only history exercises real pagination without creating 13 accounts.
    for (let i = 0; i < 13; i++) {
      // Use a unique historical reviewer/snapshot pair, as required by the schema.
      const columns = db
        .prepare("PRAGMA table_info(review_revisions)")
        .all()
        .map((c) => c.name);
      const keep = columns.filter((c) => !["id", "number"].includes(c));
      const revision = db
        .prepare(
          `INSERT INTO review_revisions(number,${keep.join(",")}) SELECT ?,${keep.join(",")} FROM review_revisions WHERE id=?`,
        )
        .run(i + 2, flow.current_revision_id).lastInsertRowid;
      db.prepare(
        "INSERT INTO review_requests(post_id,reviewer_id,requester_id,snapshot_id,state) VALUES(?,?,?,?,'completed')",
      ).run(p.id, b.id, a.id, revision);
    }
    const targeted = await a.api(
      root + `/review-flow?target_id=${q.data.id}&limit=3`,
    );
    assert.equal(targeted.data.pagination.page, 5);
    assert.equal(
      targeted.data.items.some((row) => row.id === q.data.id),
      true,
    );
    assert.equal(
      (await a.api(root + "/review-flow?target_id=999999")).status,
      404,
    );
    db.close();
  } finally {
    await f.close();
  }
});
