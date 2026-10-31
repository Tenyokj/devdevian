import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reviewNavigation,
  reviewFileForRange,
} from "../src/review-navigation.mjs";
import { combinePRSelections } from "../packages/cli/lib/pr-diff.mjs";
const context = {
  repository: "https://github.com/example/project",
  commit: "a".repeat(40),
  base_commit: "b".repeat(40),
  branch: "retry",
  path: "src/retry.ts",
  mode: "pr",
  pull_request: "https://github.com/example/project/pull/42",
  hunk_start: 3,
  hunk_end: 4,
};
const code =
  '--- "a/src/retry.ts"\n+++ "b/src/retry.ts"\n@@ -1,105 +1,105 @@\n' +
  Array.from({ length: 105 }, (_, i) => ` context ${i}`).join("\n") +
  "\n@@ -200 +200 @@\n-old\n+new";
const multi = combinePRSelections([
  { code, context },
  {
    code: '--- /dev/null\n+++ "b/test.ts"\n@@ -0,0 +1 @@\n+test',
    context: { ...context, path: "test.ts", hunk_start: 1, hunk_end: 1 },
  },
]);
test("file and hunk navigation keeps exact published offsets across pages", () => {
  const files = reviewNavigation(multi.code, multi.context);
  assert.equal(files.length, 2);
  assert.deepEqual(
    files[0].hunks.map((h) => h.line),
    [3, 109],
  );
  assert.equal(files[1].patch_start, 112);
  assert.equal(files[1].hunks[0].line, 114);
  assert.match(files[0].hunks[0].label, /Hunk 3:/);
  assert.equal(reviewFileForRange(files, 110, 111).path, context.path);
  assert.equal(reviewFileForRange(files, 111, 112), undefined);
  assert.equal(reviewFileForRange(files, 0), undefined);
  assert.equal(reviewNavigation(code, context)[0].hunks[1].line, 109);
});
test("stale, incomplete or malformed metadata falls back to unmodified plain text", () => {
  for (const value of [
    null,
    {},
    { ...context, mode: "file" },
    { ...context, hunk_end: 5 },
    {
      ...multi.context,
      files: multi.context.files.map((f) => ({
        ...f,
        patch_end: f.patch_end + 1,
      })),
    },
  ])
    assert.deepEqual(reviewNavigation(code, value), []);
  assert.deepEqual(
    reviewNavigation(multi.code.replace("+new", "+new\n+extra"), multi.context),
    [],
  );
  assert.deepEqual(
    reviewNavigation(
      code.replace("@@ -200 +200 @@", "@@ -200,7 +200 @@"),
      context,
    ),
    [],
  );
  assert.deepEqual(reviewNavigation("plain\n--- text\n+code", context), []);
  assert.deepEqual(
    reviewNavigation(code + "\n" + "x".repeat(20000), context),
    [],
  );
});
