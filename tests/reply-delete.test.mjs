import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { startTestServer } from "./http-fixture.mjs";
test(
  "authors can delete ordinary replies without deleting branches, accepted solutions or access checks",
  { timeout: 20000 },
  async () => {
    const f = await startTestServer(),
      a = f.client(),
      b = f.client(),
      c = f.client();
    let db;
    try {
      const register = async (client, name) => {
        const r = await client("/register", {
          name,
          username: name.toLowerCase(),
          email: name + "@delete.test",
          password: "Fixture-password123",
        });
        assert.equal(r.status, 200);
        return r.data.user.id;
      };
      const aid = await register(a, "DeleteOwner"),
        bid = await register(b, "DeleteAuthor");
      await register(c, "DeleteOther");
      const post = (
        await a("/posts", {
          title: "Delete an ordinary reply safely",
          kind: "question",
          topic: "web",
          body: "How should this reply be deleted without losing the discussion?",
        })
      ).data;
      const reply = (
        await b(`/posts/${post.id}/replies`, {
          body: "An original solution that must disappear after deletion.",
        })
      ).data;
      const child = (
        await c(`/posts/${post.id}/replies`, {
          body: "My nested reply must survive.",
          parent_id: reply.id,
        })
      ).data;
      db = new DatabaseSync(f.path);
      db.prepare(
        "INSERT INTO uploads(id,user_id,post_id,reply_id,name,mime,size) VALUES(?,?,?,?,?,?,?)",
      ).run(
        "reply-attachment",
        bid,
        post.id,
        reply.id,
        "reply.txt",
        "text/plain",
        15,
      );
      await writeFile(
        join(f.directory, "uploads", "reply-attachment"),
        "attachment text",
      );
      assert.equal(
        (await fetch(f.base + "/api/uploads/reply-attachment")).status,
        200,
      );
      assert.equal(
        (await c(`/replies/${reply.id}`, { revision: 0 }, "DELETE")).status,
        403,
      );
      assert.equal(
        (await b(`/replies/${reply.id}`, { revision: 99 }, "DELETE")).status,
        409,
      );
      assert.equal(
        (await b(`/replies/${reply.id}`, { revision: -1 }, "DELETE")).status,
        400,
      );
      assert.equal(
        (await a(`/posts/${post.id}/solution`, { reply_id: reply.id }, "PATCH"))
          .status,
        200,
      );
      assert.equal(
        (await b(`/replies/${reply.id}`, { revision: 0 }, "DELETE")).status,
        200,
      );
      const updated = (await a("/posts/" + post.id)).data,
        r = updated.replies.find((r) => r.id === reply.id);
      assert.ok(r.deleted_at);
      assert.equal(r.body, "[deleted by author]");
      assert.equal(r.revision, 1);
      assert.equal(r.children_count, 1);
      assert.deepEqual(r.attachments, []);
      assert.equal(updated.accepted_reply_id, null);
      assert.equal(updated.status, "open");
      assert.equal(
        (await fetch(f.base + "/api/uploads/reply-attachment")).status,
        404,
      );
      assert.equal(
        (await c(`/posts/${post.id}/replies?parent_id=${reply.id}`)).data[0].id,
        child.id,
      );
      assert.equal(
        (
          await b(
            `/replies/${reply.id}`,
            { body: "Cannot resurrect deleted text.", revision: 1 },
            "PATCH",
          )
        ).status,
        409,
      );
      assert.equal(
        (await a(`/posts/${post.id}/solution`, { reply_id: reply.id }, "PATCH"))
          .status,
        400,
      );
      assert.equal(
        (await b(`/replies/${reply.id}`, { revision: 0 }, "DELETE")).status,
        200,
      );
      assert.equal(
        (await c(`/replies/${child.id}`, { revision: 0 }, "DELETE")).status,
        200,
      );
      const space = (
        await a("/communities", {
          name: "Private delete fixture",
          description: "Only approved members may read and write here.",
        })
      ).data;
      await b(`/communities/${space.id}/request`, {});
      const request = (await a(`/communities/${space.id}/requests`)).data[0];
      assert.equal(
        (
          await a(
            `/communities/${space.id}/requests/${request.id}`,
            { action: "approve" },
            "PATCH",
          )
        ).status,
        200,
      );
      const privatePost = (
        await a("/posts", {
          title: "Private reply deletion",
          kind: "discussion",
          topic: "web",
          community_id: space.id,
          body: "A members-only reply deletion fixture.",
        })
      ).data;
      const privateReply = (
        await b(`/posts/${privatePost.id}/replies`, {
          body: "My private reply text.",
        })
      ).data;
      assert.equal(
        (await c(`/replies/${privateReply.id}`, { revision: 0 }, "DELETE"))
          .status,
        404,
      );
      db.prepare(
        "DELETE FROM memberships WHERE user_id=? AND kind='group' AND item=?",
      ).run(bid, space.id);
      assert.equal(
        (await b(`/replies/${privateReply.id}`, { revision: 0 }, "DELETE"))
          .status,
        404,
      );
      assert.equal(
        (
          await b(
            `/replies/${privateReply.id}`,
            { revision: 0, body: "Cannot edit after losing private access." },
            "PATCH",
          )
        ).status,
        404,
      );
    } finally {
      db?.close();
      await f.close();
    }
  },
);
