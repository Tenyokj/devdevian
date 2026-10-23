import { test } from "node:test";
import assert from "node:assert/strict";
import { draftKey, readDraft, saveDraft } from "../src/drafts.js";

test("drafts isolate accounts, preserve text/links and expire after 30 days", () => {
  const entries = new Map();
  const storage = {
    getItem: (key) => entries.get(key),
    setItem: (k, v) => entries.set(k, v),
    removeItem: (key) => entries.delete(key),
  };
  const key = draftKey(1, null);
  saveDraft(storage, key, {
    title: "Work in progress",
    body: "Useful context",
    kind: "review",
    details: { links: [{ label: "Source", url: "https://example.test" }] },
    attachment_ids: ["private-file"],
    password: "never store",
  });
  assert.equal(readDraft(storage, draftKey(2, null)), null);
  assert.equal(readDraft(storage, draftKey(1, "private-team")), null);
  assert.ok(!storage.getItem(key).includes("never store"));
  assert.ok(!storage.getItem(key).includes("private-file"));
  const draft = readDraft(storage, key);
  assert.equal(draft.kind, "review");
  assert.equal(draft.details.links[0].label, "Source");
  assert.equal(draft.attachment_ids, undefined);
  assert.equal(draft.password, undefined);
  storage.setItem(
    key,
    JSON.stringify({
      version: 1,
      savedAt: Date.now() - 31 * 86400000,
      data: draft,
    }),
  );
  assert.equal(readDraft(storage, key), null);
  storage.setItem(key, "{broken");
  assert.equal(readDraft(storage, key), null);
  saveDraft(storage, key, { title: "   ", body: "" });
  assert.equal(storage.getItem(key), undefined);
});
