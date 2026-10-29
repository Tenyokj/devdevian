import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGitHubReader,
  pullRequestRef,
  pullRequestLines,
} from "../lib/github-reader.mjs";
import { parseCommand } from "../lib/tui-model.mjs";
import { paletteItems } from "../lib/palette.mjs";
import { contextActions } from "../lib/context-actions.mjs";
const url = "https://github.com/example/project/pull/42";
const summary = {
  number: 42,
  title: "Fix retry behaviour",
  body: "A focused change.\nNo code is executed.",
  state: "open",
  user: { login: "developer" },
  base: { label: "example:main" },
  head: { label: "developer:retry", sha: "a".repeat(40) },
  changed_files: 21,
  additions: 8,
  deletions: 2,
};
const response = (data, status = 200, headers = {}) =>
  new Response(typeof data === "string" ? data : JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
test("PR reader restricts endpoints, omits credentials, projects bounded data and paginates with cached summary", async () => {
  let now = 100000,
    calls = [];
  const reader = createGitHubReader({
    now: () => now,
    fetchImpl: async (endpoint, options) => {
      calls.push({ endpoint, options });
      return response(
        endpoint.includes("/files?")
          ? [
              {
                filename: endpoint.endsWith("page=2")
                  ? "src/final.ts"
                  : "src/retry.ts",
                status: "modified",
                additions: 8,
                deletions: 2,
                patch: "secret raw patch not returned",
              },
            ]
          : summary,
      );
    },
  });
  const first = await reader.load(url);
  assert.equal(first.pull.state, "open");
  assert.equal(first.pagination.pages, 2);
  assert.equal(first.files[0].path, "src/retry.ts");
  assert.equal(JSON.stringify(first).includes("raw patch"), false);
  await reader.load(url);
  assert.equal(calls.length, 2);
  const next = await reader.load(url, { page: 2 });
  assert.equal(next.files[0].path, "src/final.ts");
  assert.equal(calls.length, 3);
  assert.match(pullRequestLines(next).join("\n"), /page 2\/2/);
  for (const { endpoint, options } of calls) {
    assert.ok(
      endpoint.startsWith(
        "https://api.github.com/repos/example/project/pulls/42",
      ),
    );
    assert.equal(options.method, "GET");
    assert.equal(options.credentials, "omit");
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.redirect, "manual");
    assert.equal(options.headers["X-GitHub-Api-Version"], "2026-03-10");
  }
  reader.clear();
  now += 61000;
  await reader.load(url);
  assert.equal(calls.length, 5);
  for (const invalid of [
    "http://github.com/example/project/pull/42",
    "https://secret@github.com/example/project/pull/42",
    "https://github.com.evil.test/example/project/pull/42",
    "https://github.com/example/project/pull/42?token=secret",
    "https://github.com/example/project/issues/42",
  ])
    assert.throws(() => pullRequestRef(invalid), /public GitHub PR URL/);
  assert.deepEqual(parseCommand("/pr " + url), { command: "pr", arg: url });
  assert.ok(
    paletteItems({ query: "pr " + url }).some(
      (i) => i.command === "/pr " + url,
    ),
  );
  assert.ok(
    contextActions({
      route: { view: "post" },
      data: { post: { id: 1, github_context: { pull_request: url } } },
    }).some((a) => a.id === "github-pr"),
  );
});
test("GitHub quota cooldown, private responses, invalid JSON, redirect and size errors remain actionable without retries", async () => {
  let calls = 0;
  const limited = createGitHubReader({
    now: () => 100000,
    fetchImpl: async () => {
      calls++;
      return response({}, 403, {
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": "200",
      });
    },
  });
  await assert.rejects(limited.load(url), /rate limit/);
  limited.clear();
  await assert.rejects(limited.load(url), /rate limit/);
  assert.equal(calls, 1);
  for (const [res, pattern] of [
    [response({}, 404), /private/],
    [response("<html>failure", 200), /unreadable/],
    [response({}, 301), /redirected/],
    [response({}, 500), /HTTP 500/],
    [response({}, 200, { "content-length": "9999999" }), /too large/],
  ]) {
    const reader = createGitHubReader({ fetchImpl: async () => res });
    await assert.rejects(reader.load(url), pattern);
  }
  const reader = createGitHubReader({
    fetchImpl: async () =>
      response({
        ...summary,
        title: "\x1b[2JVisible",
        merged: true,
        draft: true,
      }),
  });
  // Summary status is normalized before a deliberately malformed files response fails.
  await assert.rejects(reader.load(url), /invalid file page/);
});
