import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./http-fixture.mjs";
import { workQuery } from "../packages/cli/lib/my-work.mjs";

test("My work uses existing account and private visibility rules for owned reviews, bookmarks and subscriptions", async () => {
  const f = await startTestServer(),
    owner = f.client(),
    other = f.client();
  try {
    for (const [client, name] of [
      [owner, "owner"],
      [other, "other"],
    ])
      await client("/register", {
        name,
        email: name + "@mywork.test",
        password: "Fixture-password123",
      });
    const post = {
      title: "My work question",
      body: "A useful question for the fixture.",
      topic: "web",
      kind: "question",
    };
    const question = (await owner("/posts", post)).data;
    const group = (
      await owner("/communities", {
        name: "Private review team",
        description: "Private review scope.",
      })
    ).data;
    const review = (
      await owner("/posts", {
        ...post,
        title: "Private owned review",
        kind: "review",
        code: "const retry = 1;",
        review_focus: "Check retries",
        community_id: group.id,
      })
    ).data;
    const another = (
      await other("/posts", {
        ...post,
        title: "Someone else's public question",
      })
    ).data;
    await owner("/membership", { kind: "post", item: String(another.id) });
    await owner(
      "/subscriptions/post/" + another.id,
      { following: true },
      "PUT",
    );
    const ids = (data) =>
      (Array.isArray(data) ? data : data.items).map((p) => p.id);
    const mine = await owner(workQuery("mine"));
    assert.equal(mine.status, 200);
    assert.deepEqual(
      new Set(ids(mine.data)),
      new Set([question.id, review.id]),
    );
    assert.deepEqual(ids((await owner(workQuery("reviews"))).data), [
      review.id,
    ]);
    assert.deepEqual(ids((await owner(workQuery("saved"))).data), [another.id]);
    assert.deepEqual(ids((await owner(workQuery("following"))).data), [
      another.id,
    ]);
    assert.deepEqual(ids((await other(workQuery("mine"))).data), [another.id]);
    assert.deepEqual(ids((await other(workQuery("reviews"))).data), []);
    assert.notEqual((await other("/posts/" + review.id)).status, 200);
    assert.deepEqual(ids((await other(workQuery("saved"))).data), []);
  } finally {
    await f.close();
  }
});
