import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { JSDOM } from "jsdom";
import { createServer } from "node:http";
import { startTestServer } from "./http-fixture.mjs";
import { conversationPath, conversationId } from "../conversation-url.mjs";
import { createHandler } from "../api/index.mjs";
import { validConversationReturn } from "../src/auth-return.js";

test("conversation links and sign-in returns are bounded local paths", () => {
  assert.equal(
    conversationPath({ id: 12, title: "Review <retry> & café?" }),
    "/conversation/12/review-retry-cafe",
  );
  assert.equal(
    conversationPath({
      id: 12,
      title: "Secret title",
      community_id: "private",
    }),
    "/app#post/12",
  );
  for (const value of [
    "01",
    "1e2",
    "-1",
    "1/2",
    "9007199254740992",
    "<script>",
  ])
    assert.equal(conversationId(value), null);
  assert.ok(
    validConversationReturn("/conversation/12/review-retry-cafe?reply=1#reply"),
  );
  for (const path of [
    "https://evil.test/",
    "//evil.test/",
    "/conversation/12/a%2fb?reply=1#reply",
    "/conversation/12/a%0d%0ab?reply=1#reply",
    "/app#profile",
    "/conversation/0/a?reply=1#reply",
  ])
    assert.equal(validConversationReturn(path), false);
});

test("public documents render crawlable content, bound replies, escape user input and exclude private/removed data", async () => {
  const f = await startTestServer(),
    author = f.client();
  try {
    const registered = await author("/register", {
      name: "Public Author",
      username: "public_author",
      email: "author@public.test",
      password: "Fixture-password123",
    });
    assert.equal(registered.status, 200);
    const userId = registered.data.user.id;
    const title =
      'How do I handle </script><script>alert("title")</script> retries?';
    const created = await author("/posts", {
      title,
      body: 'A **public** question about retries.\n\n<script>alert("body")</script>\n\n[unsafe](javascript:alert(1))',
      kind: "question",
      topic: "web",
      code: 'const example = "</script><script>alert(1)</script>";',
      review_focus: "Check the timeout boundary.",
    });
    assert.equal(created.status, 201);
    const id = created.data.id,
      path = conversationPath({ id, title });
    const db = new DatabaseSync(f.path);
    const insert = db.prepare(
      "INSERT INTO replies(user_id,post_id,body) VALUES(?,?,?)",
    );
    const replyIds = [];
    for (let i = 0; i < 12; i++)
      replyIds.push(
        Number(insert.run(userId, id, "Public reply " + i).lastInsertRowid),
      );
    db.prepare(
      "INSERT INTO replies(user_id,post_id,parent_id,body) VALUES(?,?,?,?)",
    ).run(
      userId,
      id,
      replyIds[0],
      "Nested reply stays behind an explicit thread link.",
    );
    db.prepare("INSERT OR REPLACE INTO entity_details VALUES('reply',?,?)").run(
      String(replyIds[1]),
      JSON.stringify({ deleted_at: "2026-10-30T00:00:00Z" }),
    );
    db.prepare("UPDATE replies SET body='ERASED_REPLY_BODY' WHERE id=?").run(
      replyIds[1],
    );
    db.prepare("INSERT OR REPLACE INTO entity_details VALUES('post',?,?)").run(
      String(id),
      JSON.stringify({
        links: [
          { label: "Docs", url: "https://example.com/docs" },
          { label: "Bad", url: "javascript:alert(1)" },
        ],
        internal_secret: "DO_NOT_SERIALIZE_METADATA",
      }),
    );
    const token = db
      .prepare("SELECT token FROM sessions WHERE user_id=? LIMIT 1")
      .get(userId).token;
    const response = await fetch(f.base + path);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/html/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match(response.headers.get("x-robots-tag"), /^index,follow/);
    assert.equal(response.headers.get("set-cookie"), null);
    const html = await response.text();
    const doc = new JSDOM(html).window.document;
    assert.equal(doc.querySelector("h1").textContent, title);
    assert.equal(doc.querySelector("link[rel=canonical]").href, f.base + path);
    assert.equal(doc.querySelectorAll(".public-reply").length, 10);
    assert.ok(doc.querySelector(".public-conversation .markdown strong"));
    assert.ok(
      doc.querySelector(".public-code code").textContent.includes("</script>"),
    );
    assert.ok(doc.querySelector(".public-attachments") === null);
    assert.equal(
      doc.querySelectorAll(
        'script:not([src]):not([type="application/json"]):not([type="application/ld+json"])',
      ).length,
      1,
      "only the fixed theme initialization script executes",
    );
    assert.ok(!doc.querySelector('[href^="javascript:"]'));
    assert.ok(!html.includes("ERASED_REPLY_BODY"));
    assert.ok(!html.includes("DO_NOT_SERIALIZE_METADATA"));
    assert.ok(
      !html.includes('"_metadata"'),
      "driver execution metadata is not public content",
    );
    assert.ok(!html.includes("Nested reply stays"));
    assert.ok(!html.includes("author@public.test"));
    const data = JSON.parse(
      doc.getElementById("conversation-data").textContent,
    );
    assert.equal(data.post.reply_count, 13);
    assert.equal(data.post.links.length, 1);
    const ownerHTML = await (
      await fetch(f.base + path, {
        headers: { Cookie: "devdevian_demo_session=" + token },
      })
    ).text();
    assert.equal(
      ownerHTML,
      html,
      "public SSR is not personalized by a signed-in author",
    );
    const page2 = await fetch(f.base + path + "?reply_page=2");
    assert.match(page2.headers.get("x-robots-tag"), /noindex/);
    const secondDoc = new JSDOM(await page2.text()).window.document;
    assert.equal(secondDoc.querySelectorAll(".public-reply").length, 2);
    assert.equal(
      secondDoc.querySelector("link[rel=canonical]").href,
      f.base + path,
    );
    const redirect = await fetch(
      f.base + "/conversation/" + id + "/old-title?reply_page=2",
      { redirect: "manual" },
    );
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.get("location"), path + "?reply_page=2");
    const resume = await fetch(f.base + "/conversation/" + id + "/old-title?reply=1&reply_to=" + replyIds[0], { redirect: "manual" });
    assert.equal(resume.headers.get("location"), path + "?reply=1&reply_to=" + replyIds[0] + "#reply");
    assert.equal((await fetch(f.base + path + "?reply_page=1e9")).status, 400);
    const space = (
      await author("/communities", {
        name: "Private test space",
        description: "Members only.",
      })
    ).data;
    const privatePost = (
      await author("/posts", {
        title: "PRIVATE_TITLE_NEVER_PUBLIC",
        body: "PRIVATE_BODY_NEVER_PUBLIC",
        kind: "discussion",
        topic: "web",
        community_id: space.id,
      })
    ).data;
    for (const headers of [{}, { Cookie: "devdevian_demo_session=" + token }]) {
      const unavailable = await fetch(
        f.base + `/conversation/${privatePost.id}/anything`,
        { headers },
      );
      assert.equal(unavailable.status, 404);
      const text = await unavailable.text();
      assert.ok(!text.includes("PRIVATE_TITLE"));
      assert.ok(!text.includes("PRIVATE_BODY"));
      assert.match(unavailable.headers.get("x-robots-tag"), /noindex/);
    }
    const index = await (await fetch(f.base + "/sitemap.xml")).text();
    assert.match(index, /sitemapindex/);
    assert.match(index, /sitemaps\/pages.xml/);
    assert.match(index, /conversations-1.xml/);
    const sitemap = await (
      await fetch(f.base + "/sitemaps/conversations-1.xml")
    ).text();
    assert.ok(sitemap.includes(path));
    assert.ok(!sitemap.includes("PRIVATE_TITLE"));
    assert.ok(!sitemap.includes(`/conversation/${privatePost.id}/`));
    // Change visibility after a successful request: no cached HTML may survive.
    db.prepare("UPDATE posts SET community_id=? WHERE id=?").run(space.id, id);
    assert.equal((await fetch(f.base + path)).status, 404);
    assert.ok(
      !(
        await (await fetch(f.base + "/sitemaps/conversations-1.xml")).text()
      ).includes(path),
    );
    db.prepare(
      "UPDATE posts SET community_id=NULL,removed_at=CURRENT_TIMESTAMP WHERE id=?",
    ).run(id);
    assert.equal(
      (
        await fetch(f.base + path, {
          headers: { Cookie: "devdevian_demo_session=" + token },
        })
      ).status,
      404,
    );
    assert.equal(
      (await fetch(f.base + "/conversation/9999999/missing")).status,
      404,
    );
    assert.equal(
      (await fetch(f.base + "/sitemaps/conversations-0.xml")).status,
      404,
    );
    db.close();
  } finally {
    await f.close();
  }
});

test("sitemaps paginate public documents without build-time database reads", async () => {
  const f = await startTestServer(),
    author = f.client();
  try {
    const user = (
      await author("/register", {
        name: "Sitemap Author",
        email: "sitemap@public.test",
        password: "Fixture-password123",
      })
    ).data.user;
    const db = new DatabaseSync(f.path);
    const insert = db.prepare(
      "INSERT INTO posts(user_id,title,body,kind,topic) VALUES(?,?,?,'discussion','web')",
    );
    db.exec("BEGIN");
    for (let i = 0; i < 501; i++)
      insert.run(
        user.id,
        "Sitemap conversation " + i,
        "A useful public discussion.",
      );
    db.exec("COMMIT");
    const index = await (await fetch(f.base + "/sitemap.xml")).text();
    assert.match(index, /conversations-2.xml/);
    for (const [page, count] of [
      [1, 500],
      [2, 1],
    ]) {
      const xml = await (
        await fetch(f.base + `/sitemaps/conversations-${page}.xml`)
      ).text();
      const doc = new JSDOM(xml, { contentType: "text/xml" }).window.document;
      assert.equal(doc.querySelectorAll("url").length, count);
    }
    assert.equal(
      (await fetch(f.base + "/sitemaps/conversations-3.xml")).status,
      404,
    );
    db.close();
  } finally {
    await f.close();
  }
});

test("hosted rewrites preserve document paths, status headers and bounded queries", async () => {
  let path;
  const handler = createHandler(async () => (req, res) => {
    path = req.url;
    res.setHeader("X-Robots-Tag", "index,follow");
    res.end("public HTML");
  });
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const base = "http://127.0.0.1:" + server.address().port;
    const r = await fetch(
      base +
        "/api?__public_path=/conversation/12/title&reply_page=2&other=ignored",
    );
    assert.equal(path, "/conversation/12/title?reply_page=2");
    assert.equal(r.headers.get("x-robots-tag"), "index,follow");
    await fetch(base + "/api?__public_path=//evil.test");
    assert.match(path, /^\/api\?/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("startup failures on public pages stay retryable, noindex HTML", async () => {
  const handler = createHandler(async () => {
    throw Error("Fixture dependency unavailable");
  });
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const response = await fetch(
      "http://127.0.0.1:" + server.address().port + "/conversation/1/title",
    );
    assert.equal(response.status, 503);
    assert.match(response.headers.get("content-type"), /text\/html/);
    assert.match(response.headers.get("x-robots-tag"), /noindex/);
    assert.ok(response.headers.get("retry-after"));
    assert.ok(!(await response.text()).includes("Fixture dependency"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
