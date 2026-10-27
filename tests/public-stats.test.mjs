import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { startTestServer } from "./http-fixture.mjs";
test("public activity counts public conversations only and exposes no session or private metrics", async () => {
  const f = await startTestServer(),
    user = f.client();
  try {
    await user("/register", {
      name: "Stats Author",
      username: "stats_author",
      email: "author@stats.test",
      password: "Fixture-password123",
    });
    const community = (
      await user("/communities", {
        name: "Private stats space",
        description: "A private team for the activity counter test.",
      })
    ).data;
    const ids = [];
    for (let i = 0; i < 3; i++) {
      const r = await user("/posts", {
        title: "Public activity example " + i,
        body: "A useful public discussion about software design.",
        topic: "web",
        kind: "discussion",
      });
      assert.equal(r.status, 201);
      ids.push(r.data.id);
    }
    const privatePost = await user("/posts", {
      title: "Private activity stays private",
      body: "This discussion must never contribute to a public statistic.",
      topic: "web",
      kind: "discussion",
      community_id: community.id,
    });
    assert.equal(privatePost.status, 201);
    const db = new DatabaseSync(f.path);
    db.prepare("UPDATE posts SET removed_at=CURRENT_TIMESTAMP WHERE id=?").run(
      ids[0],
    );
    db.close();
    const response = await fetch(f.base + "/api/public-stats", {
      headers: { Authorization: "Bearer invalid", Cookie: "session=invalid" },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.match(response.headers.get("cache-control"), /s-maxage=15/);
    const data = await response.json();
    assert.deepEqual(Object.keys(data).sort(), ["conversations", "updated_at"]);
    assert.equal(data.conversations, 2);
    assert.ok(Number.isFinite(Date.parse(data.updated_at)));
    assert.deepEqual(
      await (await fetch(f.base + "/api/public-stats")).json(),
      data,
      "bounded cache avoids repeating counts on every visit",
    );
  } finally {
    await f.close();
  }
});
