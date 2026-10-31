import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { snapshotDatabase } from "../backup.mjs";
import { prepareWorkspaces, validRevisionFiles } from "../review-revisions.mjs";
import { inspectSchema, completeSchema } from "../schema.mjs";
import { startTestServer } from "./http-fixture.mjs";
const signup = async (f, name) => {
  const client = f.client();
  const r = await client("/register", {
    name,
    username: name,
    email: name + "@fixture.test",
    password: "Fixture-password123",
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return { client, id: r.data.user.id };
};
const request = (extra = {}) => ({
  title: "Review retry boundaries",
  body: "Please review how we handle a permanent failure.",
  kind: "review",
  topic: "web",
  code: "export function retry() {\n  return request();\n}",
  review_focus: "Check idempotency and permanent failures.",
  ...extra,
});
const projectInput = {
  name: "Orbit Queue",
  description: "A small retry queue for testing workspaces.",
  topic: "web",
  stage: "Prototype",
  help: "Please help review retries and failure handling.",
};

test("workspace links, workflow CAS and every aggregate respect the parent conversation ACL", async () => {
  const f = await startTestServer();
  try {
    const a = await signup(f, "workspace_owner"),
      b = await signup(f, "workspace_other");
    const guest = f.client(),
      owner = a.client,
      other = b.client;
    const pr = await owner("/projects", projectInput);
    assert.equal(pr.status, 201);
    const root = `/projects/${pr.data.id}`;
    const community = await owner("/communities", {
      name: "Workspace private team",
      description: "Private requests must never leak through a public project.",
    });
    assert.equal(community.status, 201);
    const publicPost = await owner("/posts", request());
    const privatePost = await owner(
      "/posts",
      request({
        community_id: community.data.id,
        title: "Invisible secret project work",
      }),
    );
    const unrelated = await other("/posts", request());
    for (const post of [publicPost, privatePost, unrelated])
      assert.equal(post.status, 201);
    const link = (p) => root + "/work-requests/" + p.data.id;
    assert.equal(
      (
        await other(
          link(publicPost),
          { state: "open", expected_version: 0 },
          "PUT",
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await owner(
          link(unrelated),
          { state: "open", expected_version: 0 },
          "PUT",
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await owner(
          root + "/work-requests/" + pr.data.post_id,
          { state: "open", expected_version: 0 },
          "PUT",
        )
      ).status,
      400,
    );
    for (const post of [publicPost, privatePost])
      assert.equal(
        (await owner(link(post), { state: "open", expected_version: 0 }, "PUT"))
          .status,
        201,
      );
    assert.equal(
      (
        await owner(
          link(publicPost),
          { state: "ready", expected_version: 0 },
          "PUT",
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await owner(
          link(publicPost),
          { state: "in_progress", expected_version: 1 },
          "PATCH",
        )
      ).data.version,
      2,
    );
    assert.equal(
      (
        await owner(
          link(publicPost),
          { state: "ready", expected_version: 1 },
          "PATCH",
        )
      ).status,
      409,
    );
    const page = (await guest(root + "/work-requests?limit=1")).data;
    assert.equal(page.pagination.total, 1);
    assert.equal(page.items[0].id, publicPost.data.id);
    assert.equal((await guest(root + "/workspace")).data.counts.total, 1);
    assert.equal((await owner(root + "/workspace")).data.counts.total, 2);
    assert.equal(
      (await other(root + "/work-requests?q=Invisible")).data.pagination.total,
      0,
    );
    assert.equal(
      (await guest(root + "/work-requests?state=bogus")).status,
      400,
    );
    assert.equal(
      (await other(`/posts/${privatePost.data.id}/revisions`)).status,
      404,
    );
    // Team credit deliberately grants neither edit nor private read authority.
    const db = new DatabaseSync(f.path);
    db.prepare(
      "INSERT OR REPLACE INTO entity_details VALUES('project',?,?)",
    ).run(String(pr.data.id), JSON.stringify({ team: [b.id] }));
    assert.equal(
      (await other(root + "/workspace")).data.permissions.manage_requests,
      false,
    );
    assert.equal(
      (await owner(link(publicPost), { expected_version: 2 }, "DELETE")).status,
      200,
    );
    assert.equal((await owner(`/posts/${publicPost.data.id}`)).status, 200);
    assert.equal((await guest(root + "/workspace")).data.counts.total, 0);
    const detached = (await owner(link(publicPost))).data;
    assert.equal(detached.linked, false);
    assert.equal(detached.version, 3);
    assert.equal(
      (
        await owner(
          link(publicPost),
          { state: "ready", expected_version: detached.version },
          "PUT",
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await owner(
          link(publicPost),
          { state: "open", expected_version: 2 },
          "PATCH",
        )
      ).status,
      409,
    );
    assert.equal(
      (await owner(link(publicPost), { expected_version: 4 }, "DELETE")).status,
      200,
    );
    db.prepare("UPDATE posts SET removed_at=CURRENT_TIMESTAMP WHERE id=?").run(
      privatePost.data.id,
    );
    assert.equal((await owner(root + "/workspace")).data.counts.total, 0);
    db.prepare("UPDATE posts SET removed_at=CURRENT_TIMESTAMP WHERE id=?").run(
      pr.data.post_id,
    );
    assert.equal((await owner(root + "/workspace")).status, 404);
    db.close();
  } finally {
    await f.close();
  }
});

test("immutable multi-file revisions preserve old feedback, exact quotes, old clients and optimistic writes", async () => {
  const f = await startTestServer();
  try {
    const { client: author } = await signup(f, "revision_owner");
    const { client: reader } = await signup(f, "revision_reader");
    const created = await author("/posts", request());
    assert.equal(created.status, 201);
    const root = `/posts/${created.data.id}`;
    const first = (await author(root + "/revisions")).data;
    assert.equal(first.capabilities.review_revisions, 1);
    assert.equal(first.items.length, 1);
    const v1 = first.items[0],
      initial = (await author(root + "/revisions/" + v1.id)).data;
    const note = await reader(root + "/code-reviews", {
      snippet_hash: v1.snippet_hash,
      revision_id: v1.id,
      start_line: 2,
      end_line: 2,
      body: "What about permanent errors?",
    });
    assert.equal(note.status, 201);
    const noteUrl = root + "/code-reviews/" + note.data.id;
    const discussion = await author(noteUrl + "/replies", {
      body: "I will address this in another revision.",
    });
    assert.equal(discussion.status, 201);
    const input = {
      expected_revision: first.post_revision,
      base_revision_id: v1.id,
      files: [
        {
          path: "src/retry.ts",
          code: "export function retry(error) {\n  if (error.permanent) throw error;\n  return request();\n}",
        },
        {
          path: "test/retry.test.ts",
          code: "assert.equal(retriesForPermanentError(), 0);",
        },
      ],
      review_focus: "Check the permanent-error regression test.",
    };
    assert.equal((await reader(root + "/revisions", input)).status, 403);
    for (const path of [
      "../secret",
      "/etc/passwd",
      "a/../b",
      "C:config",
      "a\\b",
    ]) {
      assert.equal(
        (
          await author(root + "/revisions", {
            ...input,
            files: [{ path, code: "some test code here" }],
          })
        ).status,
        400,
      );
    }
    const v2 = await author(root + "/revisions", input);
    assert.equal(v2.status, 201, JSON.stringify(v2.data));
    assert.equal(v2.data.number, 2);
    assert.equal(v2.data.files[1].start_line, 5);
    assert.equal(v2.data.code, input.files.map((f) => f.code).join("\n"));
    assert.equal((await author(root + "/revisions", input)).status, 409);
    const current = (await reader(root + "/code-reviews")).data;
    assert.deepEqual(current.summary, { open: 0, resolved: 0, earlier: 1 });
    assert.equal(current.items[0].quote, "  return request();");
    assert.equal(current.items[0].snapshot_id, v1.id);
    assert.equal(current.items[0].resolved, 0);
    assert.equal(current.items[0].outdated, true);
    assert.deepEqual(
      (await reader(root + "/revisions/" + v1.id)).data,
      initial,
    );
    assert.equal(
      (await reader(noteUrl + "/replies")).data[0].id,
      discussion.data.id,
    );
    assert.equal(
      (
        await reader(root + "/code-reviews", {
          snippet_hash: v1.snippet_hash,
          revision_id: v1.id,
          start_line: 2,
          end_line: 2,
          body: "Stale feedback must fail",
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await reader(root + "/code-reviews", {
          snippet_hash: v2.data.snippet_hash,
          revision_id: v2.data.id,
          start_line: 5,
          end_line: 5,
          body: "Current test feedback",
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await reader(root + "/code-reviews", {
          snippet_hash: v2.data.snippet_hash,
          revision_id: v2.data.id,
          start_line: 4,
          end_line: 5,
          body: "Do not span two files",
        })
      ).status,
      400,
    );
    assert.equal(
      (await reader(root + "/code-reviews")).data.items[0].file_path,
      "test/retry.test.ts",
    );
    assert.equal((await author(root)).data.code, v2.data.code);
    assert.equal((await author(root)).data.accepted_reply_id, null);
    // Return to the exact v1 bytes: its old note must remain on v1, not move to v3.
    const v3 = await author(root + "/revisions", {
      ...input,
      expected_revision: v2.data.post_revision,
      base_revision_id: v2.data.id,
      files: [{ path: "src/retry.ts", code: initial.code }],
    });
    assert.equal(v3.status, 201);
    assert.equal(
      (await reader(root + "/code-reviews?version=current")).data.items.length,
      0,
    );
    assert.equal(
      (await reader(root + "/code-reviews?version=earlier")).data.items.length,
      2,
    );
    assert.equal(
      (
        await reader(root + "/code-reviews", {
          snippet_hash: v1.snippet_hash,
          revision_id: v1.id,
          start_line: 2,
          end_line: 2,
          body: "Same bytes, wrong snapshot",
        })
      ).status,
      409,
    );
    // Existing clients omit the new identity and still publish against current code.
    assert.equal(
      (
        await reader(root + "/code-reviews", {
          snippet_hash: v3.data.snippet_hash,
          start_line: 2,
          end_line: 2,
          body: "Legacy-client current remark",
        })
      ).status,
      201,
    );
    let post = (await author(root)).data;
    const edit = {
      title: post.title,
      body: post.body,
      revision: post.revision,
      code: "export function saferRetry() { return boundedRetry(); }",
    };
    assert.equal((await author(root, edit, "PATCH")).status, 200);
    const v4 = (await author(root + "/revisions")).data;
    assert.equal(v4.items[0].number, 4);
    assert.equal(v4.items.length, 4);
    assert.equal((await author(root, edit, "PATCH")).status, 409);
    post = (await author(root)).data;
    assert.equal(
      (
        await author(
          root,
          {
            ...edit,
            code: post.code,
            title: "Rename without a new snapshot",
            revision: post.revision,
          },
          "PATCH",
        )
      ).status,
      200,
    );
    assert.equal((await author(root + "/revisions")).data.items.length, 4);
    assert.equal((await author(root + "/revisions/999999")).status, 404);
    const db = new DatabaseSync(f.path);
    assert.throws(
      () =>
        db
          .prepare("UPDATE review_revisions SET code='tampered' WHERE id=?")
          .run(v1.id),
      /immutable/,
    );
    db.exec(
      `CREATE TRIGGER fail_test_snapshot BEFORE INSERT ON review_revisions BEGIN SELECT RAISE(ABORT,'fixture failure'); END`,
    );
    const before = (await author(root)).data;
    const failed = await author(root + "/revisions", {
      ...input,
      expected_revision: before.revision,
      base_revision_id: v4.items[0].id,
    });
    assert.equal(failed.status, 500);
    assert.equal((await author(root)).data.code, before.code);
    assert.equal((await author(root)).data.revision, before.revision);
    db.exec("DROP TRIGGER fail_test_snapshot");
    // Recovery copies the immutable snapshots and anchors, then reinstalls guards.
    const destination = join(f.directory, "restored.sqlite");
    snapshotDatabase(db, destination, 10 * 1024 * 1024);
    const restored = new DatabaseSync(destination);
    assert.equal(
      restored.prepare("SELECT COUNT(*) n FROM review_revisions").get().n,
      4,
    );
    assert.equal(
      restored
        .prepare("SELECT snapshot_id FROM code_reviews WHERE id=?")
        .get(note.data.id).snapshot_id,
      v1.id,
    );
    assert.throws(
      () =>
        restored
          .prepare("UPDATE review_revisions SET code='tampered' WHERE id=?")
          .run(v1.id),
      /immutable/,
    );
    restored.close();
    db.close();
  } finally {
    await f.close();
  }
});

test("v6 preparation is repeatable, retains the marker and never fabricates lost historical code", async () => {
  const f = await startTestServer();
  try {
    const { client: author, id } = await signup(f, "migration_owner");
    const created = await author("/posts", request());
    const postId = created.data.id;
    const db = new DatabaseSync(f.path);
    db.prepare("DELETE FROM review_revisions WHERE post_id=?").run(postId);
    db.prepare(
      "INSERT INTO code_reviews(post_id,user_id,snippet_hash,start_line,end_line,quote,body) VALUES(?,?,?,?,?,?,?)",
    ).run(
      postId,
      id,
      "lost-historical-hash",
      1,
      1,
      "exact lost line",
      "Keep this old remark.",
    );
    const currentHash = (await author(`/posts/${postId}/code-reviews`)).data
      .snippet_hash;
    db.prepare(
      "INSERT INTO code_reviews(post_id,user_id,snippet_hash,start_line,end_line,quote,body) VALUES(?,?,?,?,?,?,?)",
    ).run(
      postId,
      id,
      currentHash,
      2,
      2,
      "  return request();",
      "Retained current remark.",
    );
    db.exec(
      "UPDATE app_schema SET version=6; DROP TABLE workspace_schema; DROP TABLE project_work_requests; DROP TABLE review_revisions; DROP INDEX code_reviews_snapshot; ALTER TABLE code_reviews DROP COLUMN snapshot_id",
    );
    assert.equal(inspectSchema(db, { allowPreparedWorkspaces: true }), false);
    prepareWorkspaces(db);
    prepareWorkspaces(db);
    assert.equal(inspectSchema(db, { allowPreparedWorkspaces: true }), true);
    assert.equal(db.prepare("SELECT version FROM app_schema").get().version, 6);
    const rows = db
      .prepare("SELECT * FROM code_reviews WHERE post_id=? ORDER BY id")
      .all(postId);
    assert.equal(rows[0].snapshot_id, null);
    assert.equal(rows[0].quote, "exact lost line");
    assert.ok(rows[1].snapshot_id);
    assert.equal(
      db
        .prepare("SELECT COUNT(*) n FROM review_revisions WHERE post_id=?")
        .get(postId).n,
      1,
    );
    const notes = (await author(`/posts/${postId}/code-reviews`)).data;
    assert.equal(
      notes.items.find((n) => n.id === rows[0].id).snapshot_available,
      false,
    );
    assert.deepEqual(notes.summary, { open: 1, resolved: 0, earlier: 1 });
    assert.equal(inspectSchema(db), false);
    completeSchema(db);
    assert.equal(inspectSchema(db), true);
    db.close();
  } finally {
    await f.close();
  }
});

test("file validation keeps exact CRLF/trailing lines and bounds paths, volume and duplicates", () => {
  const code = "const value = 1;\r\n\r\n";
  const result = validRevisionFiles([
    { path: "src/a.ts", code },
    { path: "empty.txt", code: "" },
  ]);
  assert.equal(result.code, code + "\n");
  assert.equal(result.files[0].end_line, 3);
  assert.equal(result.files[1].start_line, 4);
  assert.throws(() =>
    validRevisionFiles([
      { path: "a", code },
      { path: "a", code },
    ]),
  );
  assert.throws(() =>
    validRevisionFiles([{ path: "a", code: "x".repeat(20001) }]),
  );
  assert.throws(() =>
    validRevisionFiles(
      Array.from({ length: 11 }, (_, i) => ({ path: String(i), code })),
    ),
  );
});

test("revision reads and writes follow private membership revocation and paused state", async () => {
  const f = await startTestServer();
  try {
    const a = await signup(f, "private_revision_author"),
      b = await signup(f, "private_revision_reader");
    const community = await a.client("/communities", {
      name: "Private revision team",
      description:
        "Check that each snapshot remains in its parent private community.",
    });
    const p = await a.client(
      "/posts",
      request({ community_id: community.data.id }),
    );
    const root = `/posts/${p.data.id}`;
    const first = (await a.client(root + "/revisions")).data;
    const db = new DatabaseSync(f.path);
    db.prepare(
      "INSERT INTO memberships(user_id,kind,item) VALUES(?,'group',?)",
    ).run(b.id, community.data.id);
    assert.equal(
      (await b.client(root + "/revisions/" + first.current_revision_id)).status,
      200,
    );
    db.prepare("DELETE FROM memberships WHERE user_id=? AND kind='group'").run(
      b.id,
    );
    for (const suffix of [
      "/revisions",
      "/revisions/" + first.current_revision_id,
      "/code-reviews",
    ])
      assert.equal((await b.client(root + suffix)).status, 404);
    const input = {
      expected_revision: first.post_revision,
      base_revision_id: first.current_revision_id,
      files: [
        { path: "a.ts", code: "function boundedRetry() { return true; }" },
      ],
      review_focus: "Check the private revision boundary.",
    };
    assert.equal((await b.client(root + "/revisions", input)).status, 404);
    db.prepare("UPDATE posts SET archived_at=CURRENT_TIMESTAMP WHERE id=?").run(
      p.data.id,
    );
    assert.equal((await a.client(root + "/revisions", input)).status, 409);
    assert.equal(
      (
        await a.client(
          root,
          {
            title: p.data.title,
            body: p.data.body,
            revision: first.post_revision,
            code: input.files[0].code,
          },
          "PATCH",
        )
      ).status,
      409,
    );
    assert.equal((await a.client(root + "/revisions")).data.items.length, 1);
    db.close();
  } finally {
    await f.close();
  }
});

test("revision storage has both a per-author publication budget and a per-review cap", async () => {
  const f = await startTestServer();
  try {
    const { client: author } = await signup(f, "revision_limits");
    const p = await author("/posts", request());
    const root = `/posts/${p.data.id}`;
    let state = (await author(root + "/revisions")).data;
    let base = state.current_revision_id,
      expected = state.post_revision;
    for (let i = 0; i < 5; i++) {
      const r = await author(root + "/revisions", {
        base_revision_id: base,
        expected_revision: expected,
        files: [{ path: "a.ts", code: `export const iteration = ${i};` }],
        review_focus: "Check revision publication limits.",
      });
      assert.equal(r.status, 201);
      base = r.data.id;
      expected = r.data.post_revision;
    }
    assert.equal(
      (
        await author(root + "/revisions", {
          base_revision_id: base,
          expected_revision: expected,
          files: [{ path: "a.ts", code: "export const iteration = 6;" }],
          review_focus: "This should be rate limited.",
        })
      ).status,
      429,
    );
    const db = new DatabaseSync(f.path);
    db.prepare(
      "DELETE FROM usage_limits WHERE key LIKE 'review-revision:%'",
    ).run();
    const row = db
      .prepare("SELECT * FROM review_revisions WHERE id=?")
      .get(base);
    for (let number = 7; number <= 100; number++)
      db.prepare(
        "INSERT INTO review_revisions(post_id,number,user_id,code,snippet_hash,files_json,context_json,review_focus) VALUES(?,?,?,?,?,?,?,?)",
      ).run(
        row.post_id,
        number,
        row.user_id,
        row.code,
        row.snippet_hash,
        row.files_json,
        row.context_json,
        row.review_focus,
      );
    base = db
      .prepare(
        "SELECT id FROM review_revisions WHERE post_id=? ORDER BY number DESC LIMIT 1",
      )
      .get(p.data.id).id;
    assert.equal(
      (
        await author(root + "/revisions", {
          base_revision_id: base,
          expected_revision: expected,
          files: [{ path: "a.ts", code: "export const iteration = 101;" }],
          review_focus: "Check the hard revision cap.",
        })
      ).status,
      409,
    );
    assert.equal(
      (await author(root + "/revisions?limit=100")).data.pagination.limit,
      30,
    );
    db.close();
  } finally {
    await f.close();
  }
});

test("GitHub multi-file provenance stays frozen with the exact revision and rejects stale patch boundaries", async () => {
  const { combinePRSelections } = await import(
    "../packages/cli/lib/pr-diff.mjs"
  );
  const f = await startTestServer();
  try {
    const { client: author } = await signup(f, "provenance_owner");
    const context = {
      repository: "https://github.com/example/project",
      commit: "a".repeat(40),
      base_commit: "b".repeat(40),
      path: "src/retry.ts",
      mode: "pr",
      pull_request: "https://github.com/example/project/pull/42",
      hunk_start: 1,
      hunk_end: 1,
    };
    const firstCode =
      '--- "a/src/retry.ts"\n+++ "b/src/retry.ts"\n@@ -1 +1 @@\n-old\n+new';
    const secondCode = '--- /dev/null\n+++ "b/test.ts"\n@@ -0,0 +1 @@\n+test';
    const multi = combinePRSelections([
      { code: firstCode, context },
      { code: secondCode, context: { ...context, path: "test.ts" } },
    ]);
    const p = await author(
      "/posts",
      request({ code: multi.code, details: { github_context: multi.context } }),
    );
    assert.equal(p.status, 201);
    const root = `/posts/${p.data.id}`;
    const initial = (await author(root + "/revisions")).data;
    const v1 = (
      await author(root + "/revisions/" + initial.current_revision_id)
    ).data;
    assert.deepEqual(
      v1.files.map((f) => f.path),
      ["src/retry.ts", "test.ts"],
    );
    assert.equal(v1.context.github_context.commit, context.commit);
    const input = {
      expected_revision: initial.post_revision,
      base_revision_id: v1.id,
      files: [
        { path: context.path, code: firstCode },
        { path: "test.ts", code: secondCode },
      ],
      review_focus: "Check the selected GitHub changes.",
      github_context: { ...multi.context, commit: "c".repeat(40) },
    };
    assert.equal(
      (
        await author(root + "/revisions", {
          ...input,
          files: [{ path: context.path, code: "not a complete patch" }],
        })
      ).status,
      400,
    );
    const v2 = await author(root + "/revisions", input);
    assert.equal(v2.status, 201, JSON.stringify(v2.data));
    assert.equal(v2.data.context.github_context.commit, "c".repeat(40));
    assert.equal(
      (await author(root + "/revisions/" + v1.id)).data.context.github_context
        .commit,
      context.commit,
    );
    const post = (await author(root)).data;
    assert.equal(post.github_context.commit, "c".repeat(40));
  } finally {
    await f.close();
  }
});
