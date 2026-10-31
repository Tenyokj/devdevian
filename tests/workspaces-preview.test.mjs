import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialReview,
  publishRevision,
  addRemark,
  snapshots,
  files,
  threadCounts,
  compareLines,
} from "../prototypes/workspaces/model.mjs";

test("new workspace revisions preserve prior comments, exact quotes and explicit resolution", () => {
  const first = initialReview();
  const withRemark = addRemark(first, {
    revision: "v1",
    file: files[0],
    line: 4,
    body: "  Can this request be safely replayed?  ",
  });
  assert.equal(first.threads.length, 2);
  assert.equal(
    withRemark.threads[2].quote,
    snapshots.v1[files[0]].split("\n")[3],
  );
  const before = structuredClone(withRemark.threads);
  const next = publishRevision(withRemark);
  assert.equal(withRemark.currentRevision, "v1");
  assert.deepEqual(next.threads, before);
  assert.equal(next.currentRevision, "v2");
  assert.deepEqual(threadCounts(next), { open: 0, resolved: 0, earlier: 3 });
  assert.equal(publishRevision(next), next);
  const current = addRemark(next, {
    revision: "v2",
    file: files[1],
    line: 2,
    body: "Does this cover the permanent error?",
  });
  assert.deepEqual(threadCounts(current), { open: 1, resolved: 0, earlier: 3 });
  assert.equal(current.threads.at(-1).revision, "v2");
  assert.equal(current.threads.at(-1).id, 4);
});
test("snapshot remarks reject missing revisions, unknown paths, bad line anchors and blank text", () => {
  const state = initialReview();
  for (const values of [
    { revision: "v3", file: files[0], line: 1, body: "Remark" },
    { revision: "v1", file: "unknown.ts", line: 1, body: "Remark" },
    { revision: "v1", file: files[0], line: 0, body: "Remark" },
    { revision: "v1", file: files[0], line: 999, body: "Remark" },
    { revision: "v1", file: files[0], line: 1.5, body: "Remark" },
    { revision: "v1", file: files[0], line: 1, body: "  " },
  ])
    assert.throws(() => addRemark(state, values));
  assert.equal(state.threads.length, 2);
});
test("comparison reconstructs both exact snapshots, including whitespace, repeats and Unicode", () => {
  for (const [before, after] of [
    ...files.map((f) => [snapshots.v1[f], snapshots.v2[f]]),
    ["", "new"],
    ["old", ""],
    ["a\na\nb", "a\nb\na"],
    [" α\n\n", "β\n α\n\n"],
  ]) {
    const rows = compareLines(before, after);
    assert.equal(
      rows
        .filter((r) => r.kind !== "added")
        .map((r) => r.text)
        .join("\n"),
      before,
    );
    assert.equal(
      rows
        .filter((r) => r.kind !== "removed")
        .map((r) => r.text)
        .join("\n"),
      after,
    );
    assert.deepEqual(
      rows.filter((r) => r.next).map((r) => r.next),
      after.split("\n").map((_, i) => i + 1),
    );
    assert.deepEqual(
      rows.filter((r) => r.old).map((r) => r.old),
      before.split("\n").map((_, i) => i + 1),
    );
  }
});
