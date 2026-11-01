import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compareReviewLines,
  workspaceDraftKey,
  readWorkspaceDraft,
  saveWorkspaceDraft,
} from "../src/workspace-model.mjs";

test("bounded production comparison reconstructs exact Unicode, CRLF, trailing lines and large replacements", () => {
  const pairs = [
    ["", ""],
    ["a\r\n\r\n", "a\r\nb\r\n"],
    ["a\nb\na\n", "b\na\nb\n"],
    ["🪐 café\n\nend", "🪐 café\nspace\nend"],
    [
      Array.from({ length: 1500 }, (_, i) => "left" + i).join("\n"),
      Array.from({ length: 1500 }, (_, i) => "right" + i).join("\n"),
    ],
  ];
  for (const [before, after] of pairs) {
    const result = compareReviewLines(before, after);
    assert.equal(
      result.rows
        .filter((r) => r.kind !== "added")
        .map((r) => r.text)
        .join("\n"),
      before,
    );
    assert.equal(
      result.rows
        .filter((r) => r.kind !== "removed")
        .map((r) => r.text)
        .join("\n"),
      after,
    );
    const old = result.rows.filter((r) => r.old !== null).map((r) => r.old),
      next = result.rows.filter((r) => r.next !== null).map((r) => r.next);
    assert.deepEqual(
      old,
      before.split("\n").map((_, i) => i + 1),
    );
    assert.deepEqual(
      next,
      after.split("\n").map((_, i) => i + 1),
    );
  }
  assert.equal(
    compareReviewLines(pairs.at(-1)[0], pairs.at(-1)[1]).coarse,
    true,
  );
});

test("workspace tab drafts isolate accounts and contexts, expire and reject unsafe shapes", () => {
  const map = new Map(),
    storage = {
      getItem: (k) => map.get(k) || null,
      setItem: (k, v) => map.set(k, v),
    };
  const key = workspaceDraftKey(1, "revision:8");
  assert.equal(
    saveWorkspaceDraft(storage, key, {
      files: [{ path: "a.ts", code: "exact\r\ncode\n" }],
      review_focus: "Review the boundaries.",
      base_revision_id: 17,
      expected_revision: 2,
      token: "never restore this",
      uploads: ["never restore this"],
    }),
    true,
  );
  const draft = readWorkspaceDraft(storage, key);
  assert.equal(draft.files[0].code, "exact\r\ncode\n");
  assert.equal(draft.base_revision_id, 17);
  assert.equal(draft.token, undefined);
  assert.equal(draft.uploads, undefined);
  assert.equal(
    readWorkspaceDraft(storage, workspaceDraftKey(2, "revision:8")),
    null,
  );
  assert.equal(
    readWorkspaceDraft(storage, workspaceDraftKey(1, "request:8")),
    null,
  );
  const old = JSON.parse(map.get(key));
  old.saved = Date.now() - 2 * 86400000;
  map.set(key, JSON.stringify(old));
  assert.equal(readWorkspaceDraft(storage, key), null);
  map.set(
    key,
    JSON.stringify({ version: 1, saved: Date.now(), data: { files: [] } }),
  );
  assert.equal(readWorkspaceDraft(storage, key).files, undefined);
  assert.equal(
    saveWorkspaceDraft(
      {
        setItem: () => {
          throw Error("storage denied");
        },
      },
      key,
      draft,
    ),
    false,
  );
});

test("uncertain browser publication survives reload without retaining credentials", () => {
  const entries = new Map(),
    storage = {
      getItem: (key) => entries.get(key),
      setItem: (key, value) => entries.set(key, value),
    };
  const key = workspaceDraftKey(1, "request:8");
  saveWorkspaceDraft(storage, key, {
    title: "Unknown publication",
    body: "Do not send twice.",
    publication_pending: true,
    token: "never-store",
  });
  assert.equal(readWorkspaceDraft(storage, key).publication_pending, true);
  assert.equal(readWorkspaceDraft(storage, key).token, undefined);
});
