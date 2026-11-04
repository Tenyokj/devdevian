import { test } from "node:test";
import assert from "node:assert/strict";
import { connectedGitHubReader, githubList } from "../lib/github-connected.mjs";
import { selectPRHunks } from "../lib/pr-diff.mjs";
test("connected reader uses the Devdevian transport, pins private PR revisions and keeps credentials out of URLs", async () => {
  const calls = [];
  let moved = false;
  const api = async (value) => {
    calls.push(value);
    const path = new URL(value, "https://fixture.test").searchParams.get(
      "path",
    );
    if (path.includes("/files?"))
      return {
        private: true,
        data: [
          {
            filename: "src/retry.ts",
            status: "modified",
            additions: 1,
            deletions: 1,
            patch: "@@ -1 +1 @@\n-old\n+new",
          },
        ],
      };
    return {
      private: true,
      data: {
        number: 42,
        title: "Private retry",
        state: "open",
        changed_files: 1,
        head: { sha: (moved ? "c" : "a").repeat(40) },
        base: { sha: "b".repeat(40), repo: { private: true } },
      },
    };
  };
  const reader = connectedGitHubReader(api),
    d = await reader.loadDiff("https://github.com/example/private/pull/42", {
      path: "src/retry.ts",
    });
  assert.equal(d.pull.private, true);
  assert.equal(selectPRHunks(d).private, true);
  assert.ok(
    calls.every((u) => u.startsWith("/github/read?") && !u.includes("ghu_")),
  );
  assert.equal(connectedGitHubReader(api), reader);
  const other = connectedGitHubReader(async () => {
    throw Error("Other account denied");
  });
  await assert.rejects(
    other.load("https://github.com/example/private/pull/42"),
    /Could not reach GitHub/,
  );
});
