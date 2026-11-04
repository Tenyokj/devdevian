import { createBackup, restoreBackup } from "../backup.mjs";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { startTestServer } from "./http-fixture.mjs";
import { publicPull, fetchPublicPull } from "../github-pulls.mjs";
import { prepareContributions, contributionsReady } from "../contributions.mjs";
async function setup(f) {
  const users = [];
  for (const name of ["submit_owner", "submit_peer", "submit_other"]) {
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
  const [owner, peer, other] = users;
  const p = await owner.api("/projects", {
    name: "Contribution room",
    description: "Make small improvements easy to review.",
    topic: "web",
    stage: "Prototype",
    help: "Review reliable retries.",
  });
  assert.equal(p.status, 201);
  const t = await owner.api("/posts", {
    kind: "question",
    topic: "web",
    title: "Fix the retry boundary",
    body: "Can we make permanent failures stop immediately?",
  });
  assert.equal(t.status, 201);
  const project = p.data.id,
    post = t.data.id,
    root = `/projects/${project}/contributions`;
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
  assert.equal(
    (
      await peer.api(`/projects/${project}/room/tasks/${post}`, {
        action: "claim",
        expected_version: 1,
      })
    ).status,
    200,
  );
  return { owner, peer, other, project, post, root };
}
test("Contributions bind decisions to a revision, preserve history and recover identical submissions", async () => {
  const f = await startTestServer();
  try {
    const { owner, peer, other, project, post, root } = await setup(f);
    const payload = {
      post_id: post,
      expected_version: 0,
      body: "Stopped retrying permanent failures. Run the retry tests.",
      operation_key: randomUUID(),
    };
    assert.equal((await other.api(root, payload)).status, 409);
    assert.equal((await f.client()(root, payload)).status, 401);
    const r = await peer.api(root, payload);
    assert.equal(r.status, 201);
    const id = r.data.id;
    assert.equal((await peer.api(root, payload)).data.id, id);
    assert.equal(
      (
        await peer.api(root, {
          ...payload,
          body: "Different result with reused operation key",
        })
      ).status,
      409,
    );
    const verdict = {
      state: "changes_requested",
      expected_version: 1,
      expected_revision: 1,
      body: "Please cover HTTP 401 too.",
    };
    assert.equal((await other.api(root + "/" + id, verdict)).status, 409);
    assert.equal((await peer.api(root + "/" + id, verdict)).status, 409);
    assert.equal((await owner.api(root + "/" + id, verdict)).status, 200);
    assert.equal((await owner.api(root + "/" + id, verdict)).status, 409);
    const second = {
      ...payload,
      expected_version: 2,
      operation_key: randomUUID(),
      body: "Added the HTTP 401 test and reran the suite.",
    };
    assert.equal((await peer.api(root, second)).status, 201);
    assert.equal(
      (
        await owner.api(root + "/" + id, {
          ...verdict,
          state: "accepted",
          expected_version: 3,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await owner.api(root + "/" + id, {
          ...verdict,
          state: "accepted",
          expected_version: 3,
          expected_revision: 2,
          body: "Verified both permanent failures. Thank you.",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await peer.api(root, {
          ...second,
          expected_version: 4,
          operation_key: randomUUID(),
        })
      ).status,
      409,
    );
    const history = await owner.api(root + "/" + id + "/history");
    assert.equal(history.data.items.length, 2);
    assert.equal(history.data.events.length, 4);
    assert.ok(!JSON.stringify(history.data).includes("operation_key"));
    assert.equal(
      (await peer.api(`/projects/${project}/room/tasks/${post}`)).data.task
        .state,
      "open",
    );
    const db = new DatabaseSync(f.path);
    assert.throws(
      () => db.exec("UPDATE contribution_revisions SET body='tamper'"),
      /immutable/,
    );
    assert.throws(
      () => db.exec("UPDATE contribution_events SET body='tamper'"),
      /immutable/,
    );
    const encryptionKey = randomBytes(32).toString("hex"),
      output = join(f.directory, "contribution.ddb"),
      target = join(f.directory, "restored-contributions");
    await createBackup({
      db,
      storage: {
        get: async () => {
          throw Error("No fixture uploads expected");
        },
      },
      output,
      key: encryptionKey,
    });
    await restoreBackup({ input: output, key: encryptionKey, target });
    const restored = new DatabaseSync(join(target, "database.sqlite"));
    assert.equal(contributionsReady(restored), true);
    assert.equal(
      restored.prepare("SELECT COUNT(*) n FROM contribution_revisions").get().n,
      2,
    );
    assert.equal(
      restored.prepare("SELECT COUNT(*) n FROM contribution_events").get().n,
      4,
    );
    restored.close();
    db.close();
  } finally {
    await f.close();
  }
});
test("Contributions hide unlinked, locked and private task data and expire PR preview tokens", async () => {
  const f = await startTestServer();
  try {
    const { owner, peer, other, project, post, root } = await setup(f),
      db = new DatabaseSync(f.path);
    const payload = {
      post_id: post,
      expected_version: 0,
      body: "A bounded and tested implementation.",
      operation_key: randomUUID(),
    };
    assert.equal(
      (await peer.api(root, { ...payload, pull_token: "expired" })).status,
      409,
    );
    const pull = {
      url: "https://github.com/test/repo/pull/1",
      repository: "https://github.com/test/repo",
      head: "a".repeat(40),
      base: "b".repeat(40),
      title: "Bounded retry",
      number: 1,
      state: "open",
      fetched_at: new Date().toISOString(),
    };
    const token = randomUUID();
    db.prepare("INSERT INTO contribution_pulls VALUES(?,?,?,?)").run(
      token,
      pull.url,
      JSON.stringify(pull),
      Date.now(),
    );
    const cached = await peer.api(root + "/github", { url: pull.url });
    assert.equal(cached.status, 200);
    assert.equal(cached.data.cached, true);
    assert.equal(cached.data.token, token);
    assert.equal((await peer.api(root + "?post=1&post=2")).status, 400);
    const r = await peer.api(root, { ...payload, pull_token: token });
    assert.equal(r.status, 201);
    const id = r.data.id;
    assert.equal(
      (await owner.api(root + "/" + id)).data.contribution.pull.head,
      pull.head,
    );
    const changedToken = randomUUID(),
      changed = { ...pull, head: "c".repeat(40) };
    db.prepare("INSERT INTO contribution_pulls VALUES(?,?,?,?)").run(
      changedToken,
      pull.url,
      JSON.stringify(changed),
      Date.now() + 1,
    );
    assert.equal(
      (await peer.api(root + "/github", { url: pull.url })).data.pull.head,
      changed.head,
    );
    assert.equal(
      (await owner.api(root + "/" + id)).data.contribution.pull.head,
      pull.head,
    );
    db.prepare("UPDATE posts SET locked_at=CURRENT_TIMESTAMP WHERE id=?").run(
      post,
    );
    assert.equal(
      (
        await owner.api(root + "/" + id, {
          state: "accepted",
          expected_version: 1,
          expected_revision: 1,
          body: "Verified.",
        })
      ).status,
      409,
    );
    db.prepare(
      "UPDATE posts SET locked_at=NULL,community_id='hidden-fixture' WHERE id=?",
    ).run(post);
    assert.equal((await other.api(root + "/" + id)).status, 404);
    assert.equal((await f.client()(root)).data.pagination.total, 0);
    assert.equal((await owner.api(root + "/" + id + "/history")).status, 404);
    db.prepare("UPDATE posts SET community_id=NULL WHERE id=?").run(post);
    db.prepare("UPDATE project_work_requests SET linked=0 WHERE post_id=?").run(
      post,
    );
    assert.equal((await owner.api(root + "/" + id)).status, 404);
    assert.equal((await owner.api(root)).data.pagination.total, 0);
    db.close();
  } finally {
    await f.close();
  }
});
test("GitHub PR reads use a strict fixed public endpoint, bounded responses and safe errors", async () => {
  for (const v of [
    "http://github.com/a/b/pull/1",
    "https://evil.test/a/b/pull/1",
    "https://github.com/a/b/pull/1?token=x",
    "https://github.com/../b/pull/1",
    "https://github.com/a/b/pull/0",
  ])
    assert.equal(publicPull(v), null);
  const ref = publicPull("https://github.com/example/project/pull/12");
  assert.equal(ref.number, 12);
  let captured;
  const p = await fetchPublicPull(ref, {
    fetcher: async (url, options) => {
      captured = { url, options };
      return new Response(
        JSON.stringify({
          number: 12,
          title: "A fix",
          state: "open",
          head: { sha: "a".repeat(40) },
          base: { sha: "b".repeat(40), repo: { html_url: ref.repository } },
        }),
      );
    },
  });
  assert.equal(p.state, "open");
  assert.equal(
    captured.url,
    "https://api.github.com/repos/example/project/pulls/12",
  );
  assert.equal(captured.options.redirect, "manual");
  assert.equal(captured.options.headers.Authorization, undefined);
  await assert.rejects(
    fetchPublicPull(ref, {
      fetcher: async () =>
        new Response("secret upstream body", { status: 403 }),
    }),
    /unavailable or rate limited/,
  );
  await assert.rejects(
    fetchPublicPull(ref, {
      fetcher: async () => new Response("x".repeat(262145)),
    }),
    /too large/,
  );
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=OFF");
  prepareContributions(db);
  assert.equal(contributionsReady(db), true);
  prepareContributions(db);
  db.exec("UPDATE contributions_schema SET version=2");
  assert.equal(contributionsReady(db), false);
  assert.throws(() => prepareContributions(db), /newer/);
  db.close();
});
test("Old v7 servers keep working without Contributions DDL until explicit preparation", async () => {
  const f = await startTestServer();
  let old;
  try {
    const { root } = await setup(f),
      db = new DatabaseSync(f.path);
    const version = db
      .prepare("SELECT version FROM app_schema WHERE id=1")
      .get().version;
    db.exec("DROP INDEX contribution_events_parent");
    assert.equal(contributionsReady(db), false);
    old = await startTestServer({ databasePath: f.path });
    assert.equal((await old.client()(root)).status, 503);
    assert.equal((await old.client()("/health")).status, 200);
    assert.equal(contributionsReady(db), false);
    prepareContributions(db);
    assert.equal(contributionsReady(db), true);
    assert.equal(
      db.prepare("SELECT version FROM app_schema WHERE id=1").get().version,
      version,
    );
    db.exec("UPDATE contributions_schema SET version=2");
    assert.throws(() => prepareContributions(db), /newer/);
    db.close();
  } finally {
    await old?.close();
    await f.close();
  }
});
