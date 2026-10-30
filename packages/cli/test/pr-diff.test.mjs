import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parsePRPatch,
  selectPRHunks,
  validatePRSelection,
  combinePRSelections,
  addPRSelection,
} from "../lib/pr-diff.mjs";
import { createGitHubReader } from "../lib/github-reader.mjs";
import {
  normalizeGitHubContext,
  githubContextLines,
} from "../lib/github-context.mjs";
const url = "https://github.com/example/project/pull/42";
const patch =
  "@@ -1,2 +1,2 @@ retry\n-old one\n+new one\n context\n@@ -10 +10 @@\n-old two\n+new two\n\\ No newline at end of file";
const file = {
  path: "src/retry.ts",
  status: "modified",
  additions: 2,
  deletions: 2,
};
const pull = {
  repository: "https://github.com/example/project",
  url,
  commit: "a".repeat(40),
  base_commit: "b".repeat(40),
  head_ref: "retry",
  fetched_at: "2026-10-29T00:00:00Z",
};
test("complete PR hunks, renames, additions and deletions select exact frozen patches with base/head provenance", () => {
  const parsed = parsePRPatch(patch, file);
  assert.equal(parsed.hunks.length, 2);
  const selection = selectPRHunks({ file, pull, patch: parsed }, 2);
  assert.ok(selection.code.includes("new two"));
  assert.ok(!selection.code.includes("new one"));
  assert.equal(selection.context.hunk_start, 2);
  assert.deepEqual(validatePRSelection(selection).context, selection.context);
  assert.equal(selection.context.mode, "pr");
  assert.match(
    githubContextLines(selection.context).join("\n"),
    /Head commit: a/,
  );
  assert.throws(() => selectPRHunks({ file, pull, patch: parsed }, 0), /range/);
  assert.throws(
    () => normalizeGitHubContext({ ...selection.context, base_commit: "bad" }),
    /Check/,
  );
  assert.throws(
    () =>
      normalizeGitHubContext({
        ...selection.context,
        pull_request: "https://github.com/other/project/pull/42",
      }),
    /Check/,
  );
  for (const [status, previous_path, expected] of [
    ["added", "", "--- /dev/null"],
    ["removed", "", "+++ /dev/null"],
    ["renamed", "old.ts", '--- "a/old.ts"'],
  ]) {
    assert.ok(
      selectPRHunks(
        { file: { ...file, status, previous_path }, pull, patch: parsed },
        1,
        2,
      ).code.includes(expected),
    );
  }
  const large = parsePRPatch(
    "@@ -1 +1 @@\n-" + "x".repeat(10001) + "\n+" + "y".repeat(10001),
    { ...file, additions: 1, deletions: 1 },
  );
  assert.throws(() => selectPRHunks({ file, pull, patch: large }), /20,000/);
});
test("missing, truncated, malformed and terminal-control patches cannot become reviews", () => {
  for (const input of [
    null,
    "",
    "@@ -1,2 +1,2 @@\n-old\n+new",
    patch.replace("\n context", "\nBROKEN"),
    patch + "\n\x1b[2J",
    patch.replace("@@ -10 +10 @@", "@@ -99999999999999999999 +10 @@"),
    "x".repeat(120001),
  ]) {
    const data = { file, pull, patch: parsePRPatch(input, file) };
    assert.ok(data.patch.reason);
    assert.throws(() => selectPRHunks(data));
  }
  assert.ok(parsePRPatch(patch, { ...file, additions: 3 }).reason);
  assert.throws(() => validatePRSelection({ context: {}, code: "\x1b[2J" }));
});
test("diff reads fresh files between matching base/head snapshots, excludes private credentials and detects PR pushes", async () => {
  let moving = false,
    summaries = 0,
    calls = [];
  const reader = createGitHubReader({
    fetchImpl: async (endpoint, options) => {
      calls.push({ endpoint, options });
      const data = endpoint.includes("/files?")
        ? [
            {
              filename: file.path,
              status: file.status,
              additions: 2,
              deletions: 2,
              patch,
            },
          ]
        : {
            number: 42,
            title: "Retry safely",
            state: "open",
            changed_files: 1,
            head: {
              ref: "retry",
              sha: moving && ++summaries > 1 ? "c".repeat(40) : pull.commit,
            },
            base: { sha: pull.base_commit },
          };
      return new Response(JSON.stringify(data), {
        headers: { "content-type": "application/json" },
      });
    },
  });
  await reader.load(url); // Cached overview must not substitute for a fresh diff read.
  const data = await reader.loadDiff(url, { path: file.path });
  assert.equal(calls.length, 5);
  assert.equal(data.patch.hunks.length, 2);
  assert.ok(
    calls.every(
      ({ options }) =>
        options.method === "GET" &&
        !options.headers.Authorization &&
        options.credentials === "omit",
    ),
  );
  await assert.rejects(reader.loadDiff(url, { path: "moved.ts" }), /moved/);
  moving = true;
  await assert.rejects(
    reader.loadDiff(url, { path: file.path }),
    /changed while loading/,
  );
});

test("multi-file reviews retain exact patch offsets, freeze drafts, replace ranges and reject mixed revisions", () => {
  const first = selectPRHunks(
    { file, pull, patch: parsePRPatch(patch, file) },
    1,
  );
  const second = selectPRHunks(
    {
      file: { ...file, path: "test/retry.test.ts" },
      pull,
      patch: parsePRPatch(patch, file),
    },
    2,
  );
  let basket = addPRSelection([], first);
  basket = addPRSelection(basket, second);
  const combined = combinePRSelections(basket);
  assert.equal(combined.context.files.length, 2);
  assert.deepEqual(
    combined.context.files.map((f) => [f.patch_start, f.patch_end]),
    [
      [1, 6],
      [7, 12],
    ],
  );
  assert.equal(combined.code, first.code + "\n" + second.code);
  assert.deepEqual(validatePRSelection(JSON.parse(JSON.stringify(combined))), {
    code: combined.code,
    context: combined.context,
  });
  assert.match(
    githubContextLines(combined.context).join("\n"),
    /test\/retry.test.ts.*published lines 7–12/,
  );
  basket = addPRSelection(basket, {
    ...first,
    code: first.code.replace("new one", "changed"),
  });
  assert.equal(basket.length, 2);
  assert.equal(basket.at(-1).context.path, file.path);
  for (const key of ["commit", "base_commit", "pull_request", "repository"]) {
    assert.throws(
      () =>
        addPRSelection([first], {
          ...second,
          context: {
            ...second.context,
            [key]: key.includes("commit")
              ? "c".repeat(40)
              : "https://github.com/other/project/pull/1",
          },
        }),
      /revisions/,
    );
  }
  assert.throws(() => combinePRSelections([first, first]), /each file once/);
  assert.throws(() => combinePRSelections([]), /1 and 10/);
  assert.throws(() => combinePRSelections(Array(11).fill(first)), /1 and 10/);
  assert.throws(
    () =>
      combinePRSelections([
        first,
        { ...second, code: second.code + "x".repeat(20000) },
      ]),
    /Invalid saved/,
  );
  const invalid = structuredClone(combined);
  invalid.context.files[1].patch_start--;
  assert.throws(() => validatePRSelection(invalid));
  const wrongEnd = structuredClone(combined);
  wrongEnd.context.files[1].patch_end++;
  assert.throws(() => validatePRSelection(wrongEnd), /ranges/);
  assert.throws(
    () => validatePRSelection({ ...combined, code: "junk" + combined.code }),
    /ranges/,
  );
  const badPath = structuredClone(combined.context);
  badPath.files[1].path = "../secret";
  assert.throws(() => normalizeGitHubContext(badPath));
});
