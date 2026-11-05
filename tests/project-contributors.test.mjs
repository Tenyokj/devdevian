import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./http-fixture.mjs";
test("contributors attribute readable work without exposing private work or approval lists", async (t) => {
  const f = await startTestServer();
  t.after(() => f.close());
  const people = [];
  for (const name of ["credit_owner", "credit_peer", "credit_private"]) {
    const api = f.client();
    const r = await api("/register", {
      name,
      username: name,
      email: name + "@fixture.test",
      password: "Fixture-password123",
    });
    assert.equal(r.status, 200);
    people.push({ api, id: r.data.user.id, name });
  }
  const [a, b, c] = people;
  const p = await a.api("/projects", {
    name: "Contributor Orbit",
    description: "A project with visible work and private requests.",
    topic: "web",
    stage: "Prototype",
    help: "Inspect cancellation and retry handling.",
  });
  assert.equal(p.status, 201);
  const post = await a.api("/posts", {
    title: "Public retry discussion",
    body: "Inspect the cancellation boundary.",
    topic: "web",
    kind: "question",
  });
  assert.equal(post.status, 201);
  assert.equal(
    (
      await a.api(
        `/projects/${p.data.id}/work-requests/${post.data.id}`,
        { state: "open", expected_version: 0 },
        "PUT",
      )
    ).status,
    201,
  );
  assert.equal(
    (
      await b.api(`/posts/${post.data.id}/replies`, {
        body: "Check idempotency before retrying.",
      })
    ).status,
    201,
  );
  const list = await f.client()(`/projects/${p.data.id}/contributors`);
  assert.equal(list.status, 200, JSON.stringify(list.data));
  assert.deepEqual(
    list.data.items.map((x) => x.id),
    [a.id, b.id],
  );
  assert.match(list.data.items[1].roles, /Discussion/);
  assert.equal(
    list.data.items.some((x) => "email" in x || "members" in x),
    false,
  );
  const group = await a.api("/communities", {
    name: "Private credits",
    description: "A private project workspace for the fixture.",
  });
  assert.equal(group.status, 201);
  const privatePost = await a.api("/posts", {
    title: "Secret contributor request",
    body: "Private task details remain private.",
    topic: "web",
    kind: "question",
    community_id: group.data.id,
  });
  assert.equal(privatePost.status, 201);
  assert.equal(
    (
      await a.api(
        `/projects/${p.data.id}/work-requests/${privatePost.data.id}`,
        { state: "open", expected_version: 0 },
        "PUT",
      )
    ).status,
    201,
  );
  const db = new DatabaseSync(f.path);
  db.prepare("INSERT INTO replies(user_id,post_id,body) VALUES(?,?,?)").run(
    c.id,
    privatePost.data.id,
    "Only members can read this reply.",
  );
  db.close();
  const ownerCredits = await a.api(`/projects/${p.data.id}/contributors`);
  assert.ok(ownerCredits.data.items.some((u) => u.id === c.id));
  const privateProject = await a.api("/projects", {
    name: "Private project",
    description: "A separate private contributor project.",
    topic: "web",
    stage: "Prototype",
    help: "Inspect only with current membership.",
    community_id: group.data.id,
  });
  assert.equal(privateProject.status, 201);
  assert.equal(
    (await b.api(`/projects/${privateProject.data.id}/contributors`)).status,
    404,
  );
  const again = await b.api(
    `/projects/${p.data.id}/contributors?limit=1&page=2`,
  );
  assert.equal(again.status, 200);
  assert.equal(again.data.pagination.total, 2);
  assert.equal(again.data.items[0].id, b.id);
});
