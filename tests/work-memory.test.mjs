import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rememberConversation,
  recentConversations,
  localWorkDrafts,
  workStorage,
} from "../src/work-memory.js";
import { saveDraft, draftKey } from "../src/drafts.js";
function storage() {
  const m = new Map();
  return {
    get length() {
      return m.size;
    },
    key: (i) => [...m.keys()][i],
    getItem: (k) => m.get(k) || null,
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  };
}
test("Browser recent history is per-account, bounded and stores no content", () => {
  const s = storage();
  for (let i = 1; i < 16; i++) rememberConversation(s, 1, i);
  rememberConversation(s, 1, 7);
  const rows = recentConversations(s, 1);
  assert.equal(rows.length, 12);
  assert.equal(rows[0].id, 7);
  assert.deepEqual(Object.keys(rows[0]), ["id", "at"]);
  assert.deepEqual(recentConversations(s, 2), []);
  s.setItem(
    "devdevian-recent:v1:1",
    JSON.stringify([rows[0], rows[0], { id: 2, at: 0 }]),
  );
  assert.equal(recentConversations(s, 1).length, 1);
});
test("Continue offers current-account regular drafts, excludes frozen GitHub context and expired drafts", () => {
  const s = storage();
  saveDraft(s, draftKey(1), { title: "Local thought", kind: "question" });
  saveDraft(s, draftKey(2), { title: "Other user" });
  saveDraft(s, draftKey(1, "public:github:context"), {
    title: "Frozen import",
  });
  s.setItem(
    draftKey(1, "expired"),
    JSON.stringify({ version: 1, savedAt: 0, data: { title: "Old" } }),
  );
  assert.deepEqual(
    localWorkDrafts(s, 1).map((x) => x.title),
    ["Local thought"],
  );
});

test("Optional continuation tolerates missing or blocked browser storage",()=>{
 assert.deepEqual(recentConversations(null,1),[]);assert.deepEqual(localWorkDrafts(null,1),[]);assert.doesNotThrow(()=>rememberConversation(null,1,2));
});
