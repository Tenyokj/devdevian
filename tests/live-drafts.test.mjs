import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import { liveDrafts, clearLiveDrafts } from "../src/live-drafts.mjs";
function storage() {
  const s = {};
  Object.defineProperties(s, {
    getItem: { value: (k) => s[k] ?? null },
    setItem: { value: (k, v) => (s[k] = v) },
    removeItem: { value: (k) => delete s[k] },
  });
  return s;
}
test("Recovery copies isolate accounts, sessions and tabs, expire and clear on sign-out", () => {
  const s = storage(),
    a = liveDrafts(1, "a", s),
    b = liveDrafts(1, "a", s);
  a.save("AA==", "offline", 1);
  assert.equal(a.list().length, 0);
  assert.equal(b.list().length, 1);
  b.clear();
  assert.equal(b.list().length, 1);
  assert.equal(liveDrafts(2, "a", s).list().length, 0);
  assert.equal(liveDrafts(1, "b", s).list().length, 0);
  const key = Object.keys(s)[0],
    old = JSON.parse(s[key]);
  s[key] = JSON.stringify({ ...old, updated: Date.now() - 8 * 86400000 });
  assert.equal(b.list().length, 0);
  a.save("AA==", "offline", 1);
  clearLiveDrafts(1, s);
  assert.equal(
    Object.keys(s).filter((k) => k.startsWith("devdevian.live-draft.v1:"))
      .length,
    0,
  );
  assert.throws(() => a.save("AA==", "late response", 1), /Account changed/);
  const broken = {
    getItem() {
      return null;
    },
    setItem() {
      throw new Error("quota");
    },
  };
  assert.throws(() => liveDrafts(1, "a", broken).save("AA==", "x", 1), /quota/);
});
test("A saved Yjs history merges offline edits with concurrent server edits without replacing them", () => {
  const base = new Y.Doc();
  base.getText("code").insert(0, "const retries = 2;\n");
  const offline = new Y.Doc(),
    server = new Y.Doc();
  for (const doc of [offline, server])
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(base));
  offline.getText("code").insert(0, "// offline\n");
  server
    .getText("code")
    .insert(server.getText("code").length, "// someone else\n");
  Y.applyUpdate(server, Y.encodeStateAsUpdate(offline));
  assert.match(server.getText("code").toString(), /offline/);
  assert.match(server.getText("code").toString(), /someone else/);
  for (const d of [base, offline, server]) d.destroy();
});
