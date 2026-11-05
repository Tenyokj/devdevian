import { test } from "node:test";
import assert from "node:assert/strict";
import { searchGuides, rehypeSearchHighlights } from "../src/docs/search.mjs";
test("documentation search ranks real sections and treats regex-like queries literally", () => {
  const guides = [
    {
      slug: "account",
      title: "Accounts",
      group: "Start",
      body: "# Accounts\nIntroduction.\n## Reset a forgotten password\nA password reset revokes saved devices.",
    },
    {
      slug: "cli",
      title: "CLI handbook",
      group: "Terminal",
      body: "# CLI\nUse the CLI.\n## Read a diff\nA diff shows selected changes. Use src/[id].ts.",
    },
  ];
  const path = (s) => "/docs/" + s,
    id = (s) => s.toLowerCase().replaceAll(" ", "-");
  const hits = searchGuides(guides, "forgotten password", path, id);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].href, "/docs/account#reset-a-forgotten-password");
  assert.match(hits[0].excerpt, /password reset/);
  assert.equal(searchGuides(guides, "src/[id].ts", path, id)[0].slug, "cli");
  assert.deepEqual(searchGuides(guides, "unfindable", path, id), []);
});
test("search highlights readable text and code without inserting HTML or changing link targets", () => {
  const tree = {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "a",
        properties: { href: "https://example.test/password" },
        children: [{ type: "text", value: "A password and PASSWORD reset." }],
      },
    ],
  };
  rehypeSearchHighlights({ query: "password" })(tree);
  const a = tree.children[0];
  assert.equal(a.properties.href, "https://example.test/password");
  assert.equal(a.children.filter((n) => n.tagName === "mark").length, 2);
  const literal = {
    type: "root",
    children: [{ type: "text", value: "[id].ts <script>" }],
  };
  rehypeSearchHighlights({ query: "[id].ts" })(literal);
  assert.equal(literal.children[0].tagName, "mark");
  assert.equal(literal.children[1].type, "text");
});
