import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { startTestServer } from "./http-fixture.mjs";
test("feedback threads preserve replies, notify exact targets and route moderation by scope", async () => {
  const fixtureServer = await startTestServer();
  const { path } = fixtureServer;
  const author = fixtureServer.client(),
    other = fixtureServer.client(),
    legacy = fixtureServer.client();
  try {
    const a = await author("/register", {
      name: "Feedback Author",
      username: "feedback_author",
      email: "author@fixture.test",
      password: "Fixture-password123",
    });
    const authorId = a.data.user.id;
    assert.equal(a.status, 200);
    assert.equal(
      (
        await other("/register", {
          name: "Feedback Reviewer",
          username: "feedback_reviewer",
          email: "reviewer@fixture.test",
          password: "Fixture-password123",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await legacy("/register", {
          name: "Platform Moderator",
          username: "platform_moderator",
          email: "moderator@fixture.test",
          password: "Fixture-password123",
        })
      ).status,
      200,
    );
    const community = await author("/communities", {
      name: "Private feedback team",
      description: "A private test community for scoped moderation.",
    });
    assert.equal(community.status, 201);
    const privateSpace = community.data.id;

    const created = await author("/posts", {
      title: "Feedback lifecycle fixture",
      body: "Review the failure handling in this small worker.",
      kind: "review",
      topic: "web",
      code: "async function work() { return request(); }",
      review_focus: "Check retries and error handling.",
    });
    assert.equal(created.status, 201);
    const endpoint = `/posts/${created.data.id}/code-reviews`;
    const hash = (await other(endpoint)).data.snippet_hash;
    const note = await other(endpoint, {
      snippet_hash: hash,
      start_line: 1,
      end_line: 1,
      body: "Please handle network errors here.",
    });
    assert.equal(note.status, 201);
    const root = endpoint + "/" + note.data.id;
    let item = (await other(endpoint)).data.items[0];
    assert.equal(
      (
        await author(
          root,
          { body: "An unauthorized edit", revision: item.revision },
          "PATCH",
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await other(
          root,
          {
            body: "Please handle timeouts as well.",
            revision: item.revision,
          },
          "PATCH",
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await other(
          root,
          { body: "A stale edit attempt", revision: item.revision },
          "PATCH",
        )
      ).status,
      409,
    );
    const reply = await author(root + "/replies", {
      body: "Would a timeout and bounded retry solve this?",
    });
    assert.equal(reply.status, 201);
    const notice = (await other("/notifications")).data.items.find(
      (n) => n.feedback_reply_id === reply.data.id,
    );
    assert.equal(notice.code_review_id, note.data.id);
    item = (await author(endpoint)).data.items[0];
    assert.equal(
      (await author(root, { resolved: true, revision: item.revision }, "PATCH"))
        .status,
      200,
    );
    assert.ok(
      (await other("/notifications")).data.items.some(
        (n) =>
          n.type === "feedback_resolved" && n.code_review_id === note.data.id,
      ),
    );
    let child = (await other(root + "/replies")).data[0];
    const childUrl = root + "/replies/" + child.id;
    assert.equal(
      (await other(childUrl, { revision: child.revision }, "DELETE")).status,
      403,
    );
    assert.equal(
      (
        await author(
          childUrl,
          {
            body: "Updated: use a bounded retry with backoff.",
            revision: child.revision,
          },
          "PATCH",
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await other(root + "/report", {
          reply_id: child.id,
          reason: "This reply contains spam links.",
        })
      ).status,
      201,
    );
    const queue = (await legacy("/moderation/code-feedback?scope=public")).data;
    const report = queue.find((r) => r.review_id === note.data.id);
    assert.ok(report);
    assert.equal(
      (await other("/moderation/code-feedback?scope=public")).status,
      403,
    );
    assert.equal(
      (
        await legacy(
          "/moderation/code-feedback/" + report.id,
          {
            status: "resolved",
            remove: true,
            note: "Removed the reported spam reply.",
          },
          "PATCH",
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await legacy(
          "/moderation/code-feedback/" + report.id,
          { status: "dismissed", note: "A conflicting second decision." },
          "PATCH",
        )
      ).status,
      409,
    );
    child = (await other(root + "/replies")).data[0];
    assert.equal(child.body, "");
    assert.ok(child.deleted_at);
    item = (await other(endpoint)).data.items[0];
    assert.equal(
      (await other(root, { revision: item.revision }, "DELETE")).status,
      200,
    );
    item = (await other(endpoint)).data.items[0];
    assert.ok(item.deleted_at);
    assert.equal(item.body, "");
    assert.equal((await other(root + "/replies")).data.length, 1);
    const fixture = new DatabaseSync(path);
    for (let i = 0; i < 12; i++)
      fixture
        .prepare(
          "INSERT INTO code_review_replies(review_id,user_id,body) VALUES(?,?,?)",
        )
        .run(note.data.id, authorId, "Paginated feedback answer " + i);
    const target = fixture
      .prepare("SELECT MAX(id) id FROM code_review_replies WHERE review_id=?")
      .get(note.data.id).id;
    fixture.close();
    const linked = await other(root + "/replies?target_id=" + target);
    assert.equal(linked.data.pagination.page, 2);
    assert.ok(linked.data.some((r) => r.id === target));
    const privatePost = await author("/posts", {
      title: "Private feedback fixture",
      body: "This code belongs to a private community.",
      kind: "review",
      topic: "web",
      community_id: privateSpace,
      code: "function run() { return 1; }",
      review_focus: "Check correctness and edge cases.",
    });
    assert.equal(privatePost.status, 201);
    const privateUrl = `/posts/${privatePost.data.id}/code-reviews`;
    const privateHash = (await author(privateUrl)).data.snippet_hash;
    const privateNote = await author(privateUrl, {
      snippet_hash: privateHash,
      start_line: 1,
      end_line: 1,
      body: "A private remark on this implementation.",
    });
    assert.equal(privateNote.status, 201);
    assert.equal(
      (await other(privateUrl + "/" + privateNote.data.id + "/replies")).status,
      404,
    );
    assert.equal(
      (
        await other(privateUrl + "/" + privateNote.data.id + "/report", {
          reason: "A malicious cross-community report.",
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await author(privateUrl + "/" + privateNote.data.id + "/report", {
          reason: "Please review this private feedback.",
        })
      ).status,
      201,
    );
    assert.ok(
      !(await legacy("/moderation/code-feedback?scope=public")).data.some(
        (r) => r.post_id === privatePost.data.id,
      ),
    );
    const privateQueue = await author(
      "/moderation/code-feedback?scope=communities",
    );
    const privateReport = privateQueue.data.find(
      (r) => r.post_id === privatePost.data.id,
    );
    assert.ok(privateReport);
    assert.equal(
      (
        await legacy(
          "/moderation/code-feedback/" + privateReport.id,
          {
            status: "dismissed",
            note: "An unauthorized public moderator decision.",
          },
          "PATCH",
        )
      ).status,
      404,
    );
  } finally {
    await fixtureServer.close();
  }
});
