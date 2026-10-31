import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { startTestServer } from "./http-fixture.mjs";
import { snippetHash } from "../code-reviews.mjs";
import { awaitingReviewSQL } from "../review-queue.mjs";

test("review queue and summaries respect participation, last visible author, private access, status and filtered targets", async () => {
  const f = await startTestServer();
  const owner = f.client(),
    peer = f.client(),
    outsider = f.client();
  let db;
  try {
    for (const [client, name] of [
      [owner, "owner"],
      [peer, "peer"],
      [outsider, "outsider"],
    ])
      assert.equal(
        (
          await client("/register", {
            name,
            email: name + "@queue.test",
            password: "Fixture-password123",
          })
        ).status,
        200,
      );
    db = new DatabaseSync(f.path);
    const users = Object.fromEntries(
      db
        .prepare("SELECT id,name FROM users")
        .all()
        .map((r) => [r.name, r.id]),
    );
    const group = (
      await owner("/communities", {
        name: "Review queue private team",
        description: "Private fixture.",
      })
    ).data;
    const created = await owner("/posts", {
      title: "Review queue fixture",
      body: "Check this bounded retry.",
      kind: "review",
      topic: "web",
      code: "const retry = 1;\nreturn retry;",
      review_focus: "Check the retry limit.",
      community_id: group.id,
    });
    assert.equal(created.status, 201);
    const post = created.data.id,
      hash = snippetHash("const retry = 1;\nreturn retry;");
    const add = db.prepare(
      "INSERT INTO code_reviews(post_id,user_id,snippet_hash,start_line,end_line,quote,body,resolved) VALUES(?,?,?,1,1,?,?,?)",
    );
    const note = Number(
      add.run(
        post,
        users.peer,
        hash,
        "const retry = 1;",
        "Please bound retries.",
        0,
      ).lastInsertRowid,
    );
    const queue = async (client, section = "awaiting") => {
      const result = await client(
        "/posts?review_queue=" + section + "&limit=12",
      );
      assert.equal(result.status, 200, JSON.stringify(result.data));
      return Array.isArray(result.data) ? [...result.data] : result.data.items;
    };
    assert.equal((await f.client()("/posts?review_queue=open")).status, 401);
    assert.equal((await owner("/posts?review_queue=all")).status, 400);
    assert.deepEqual(
      (await queue(owner)).map((p) => p.id),
      [post],
    );
    assert.equal((await queue(owner))[0].review_target, note);
    assert.deepEqual(
      await queue(peer),
      [],
      "lost/private access is checked before participation",
    );
    assert.deepEqual(await queue(outsider, "open"), []);
    db.prepare("INSERT INTO memberships VALUES(?,'group',?)").run(
      users.peer,
      group.id,
    );
    assert.deepEqual(
      (await queue(peer, "open")).map((p) => p.id),
      [post],
    );
    const reply = db.prepare(
      "INSERT INTO code_review_replies(review_id,user_id,body) VALUES(?,?,?)",
    );
    const ownReply = Number(
      reply.run(note, users.owner, "Will add a deadline.").lastInsertRowid,
    );
    assert.deepEqual(await queue(owner), [], "own last answer clears awaiting");
    assert.equal((await queue(peer))[0].review_reply_target, ownReply);
    const peerReply = Number(
      reply.run(note, users.peer, "Please cover it with a test.")
        .lastInsertRowid,
    );
    assert.equal((await queue(owner))[0].review_reply_target, peerReply);
    db.prepare(
      "UPDATE code_review_replies SET deleted_at=CURRENT_TIMESTAMP WHERE id=?",
    ).run(peerReply);
    assert.deepEqual(
      await queue(owner),
      [],
      "deleted last replies do not affect awaiting",
    );
    db.prepare("UPDATE code_reviews SET resolved=1 WHERE id=?").run(note);
    assert.deepEqual(await queue(peer), []);
    // Earlier-version totals are disjoint from current open/resolved; deleted remarks excluded.
    for (let i = 0; i < 12; i++)
      add.run(
        post,
        users.peer,
        hash,
        "const retry = 1;",
        "Current fixture " + i,
        0,
      );
    const old = Number(
      add.run(
        post,
        users.peer,
        "f".repeat(64),
        "old code",
        "Earlier fixture",
        0,
      ).lastInsertRowid,
    );
    const deleted = Number(
      add.run(post, users.peer, hash, "code", "Deleted fixture", 0)
        .lastInsertRowid,
    );
    db.prepare(
      "UPDATE code_reviews SET deleted_at=CURRENT_TIMESTAMP WHERE id=?",
    ).run(deleted);
    const notes = (
      await owner(
        "/posts/" +
          post +
          "/code-reviews?status=open&version=current&target_id=" +
          (note + 1),
      )
    ).data;
    assert.deepEqual(notes.summary, { open: 12, resolved: 1, earlier: 1 });
    assert.equal(notes.pagination.page, 2);
    assert.ok(
      notes.items.some((n) => n.id === note + 1),
      "target pagination counts only matching remarks",
    );
    const earlier = (
      await owner("/posts/" + post + "/code-reviews?version=earlier")
    ).data;
    assert.deepEqual(
      earlier.items.map((n) => n.id),
      [old],
    );
    assert.equal(earlier.items[0].outdated, true);
    assert.equal(
      (await outsider("/posts/" + post + "/code-reviews")).status,
      404,
    );
    for (const column of ["archived_at", "locked_at", "removed_at"]) {
      db.prepare(`UPDATE posts SET ${column}=CURRENT_TIMESTAMP WHERE id=?`).run(
        post,
      );
      assert.deepEqual(await queue(owner, "open"), []);
      assert.deepEqual(await queue(owner), []);
      db.prepare(`UPDATE posts SET ${column}=NULL WHERE id=?`).run(post);
    }
    db.prepare(
      "DELETE FROM memberships WHERE user_id=? AND kind='group' AND item=?",
    ).run(users.peer, group.id);
    assert.deepEqual(await queue(peer), []);
    assert.deepEqual(await queue(peer, "open"), []);
    const publicPost = (
      await owner("/posts", {
        title: "Public review participant fixture",
        body: "Check the shared retry deadline.",
        kind: "review",
        topic: "web",
        code: "const retry = 1;",
        review_focus: "Check this deadline.",
      })
    ).data.id;
    const publicNote = Number(
      add.run(
        publicPost,
        users.peer,
        snippetHash("const retry = 1;"),
        "const retry = 1;",
        "Please check the deadline.",
        0,
      ).lastInsertRowid,
    );
    assert.deepEqual(
      await queue(outsider),
      [],
      "nonparticipants are not assigned a reply",
    );
    reply.run(publicNote, users.outsider, "I can help test this.");
    assert.deepEqual(
      await queue(outsider),
      [],
      "your own last reply clears the queue",
    );
    const answer = Number(
      reply.run(publicNote, users.owner, "Please add a regression test.")
        .lastInsertRowid,
    );
    assert.equal(
      (await queue(outsider))[0].review_reply_target,
      answer,
      "reply participation is recognized",
    );
    db.prepare("UPDATE posts SET status='solved' WHERE id=?").run(publicPost);
    assert.deepEqual(await queue(outsider), []);
    assert.throws(() => awaitingReviewSQL("1 OR 1=1"));
  } finally {
    db?.close();
    await f.close();
  }
});
