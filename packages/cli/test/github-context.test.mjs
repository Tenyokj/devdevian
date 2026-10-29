import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  githubRepository,
  normalizeGitHubContext,
  githubContextLines,
} from "../lib/github-context.mjs";
import { readGitHubContext } from "../lib/workspace.mjs";
const git = (root, ...args) =>
  execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
const base = {
  repository: "https://github.com/example/project",
  commit: "a".repeat(40),
  branch: "feature/retries",
  path: "src/retry.ts",
  mode: "file",
};
test("GitHub context accepts canonical origins, bounds untrusted metadata and never exposes remote credentials", () => {
  for (const remote of [
    "https://github.com/example/project.git",
    "git@github.com:example/project.git",
    "ssh://git@github.com/example/project.git",
  ])
    assert.equal(githubRepository(remote), base.repository);
  for (const remote of [
    "https://secret@github.com/example/project",
    "https://github.com.evil.test/example/project",
    "git@evil.test:example/project.git",
    "file:///tmp/project",
    "https://github.com/example/project?token=secret",
  ])
    assert.equal(githubRepository(remote), null);
  const context = normalizeGitHubContext({
    ...base,
    pull_request: base.repository + "/pull/42",
    token: "not retained",
  });
  assert.equal(context.pull_request, base.repository + "/pull/42");
  assert.equal(context.token, undefined);
  assert.match(githubContextLines(context).join("\n"), /Local code may differ/);
  for (const patch of [
    { repository: "https://evil.test/repo" },
    { commit: "main" },
    { path: "../private.txt" },
    { path: "/etc/passwd" },
    { path: "bad\npath" },
    { branch: "main\x1b[2J" },
    { mode: "remote" },
    { pull_request: "https://github.com/other/project/pull/42" },
    { start_line: 3, end_line: 2 },
  ])
    assert.throws(
      () => normalizeGitHubContext({ ...base, ...patch }),
      /Check the GitHub/,
    );
  assert.equal(normalizeGitHubContext(null), null);
  assert.match(
    githubContextLines({ repository: "broken" }).join(""),
    /could not be displayed/,
  );
});
test("local GitHub metadata is opt-in, repo-relative from a subdirectory and read-only for detached HEAD and staged changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "ddv-github-"));
  try {
    git(root, "init", "-q");
    git(root, "config", "user.name", "Fixture");
    git(root, "config", "user.email", "fixture@example.test");
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src/retry.ts"), "export const retries = 2;\n");
    git(root, "add", ".");
    git(root, "commit", "-qm", "fixture");
    git(root, "remote", "add", "origin", "git@github.com:example/project.git");
    const commit = git(root, "rev-parse", "HEAD").trim();
    const context = await readGitHubContext(
      join(root, "src"),
      { kind: "file", path: "retry.ts", start: 1, end: 1 },
      { pullRequest: base.repository + "/pull/42" },
    );
    assert.equal(context.path, "src/retry.ts");
    assert.equal(context.commit, commit);
    assert.equal(context.start_line, 1);
    git(root, "checkout", "--detach", "-q", commit);
    await writeFile(join(root, "src/retry.ts"), "export const retries = 3;\n");
    git(root, "add", ".");
    const before = git(root, "status", "--porcelain");
    const patch = await readGitHubContext(root, {
      kind: "diff",
      path: "src/retry.ts",
      staged: true,
    });
    assert.equal(patch.mode, "staged");
    assert.equal(patch.branch, null);
    assert.equal(patch.commit, commit);
    assert.equal(git(root, "status", "--porcelain"), before);
    git(
      root,
      "remote",
      "set-url",
      "origin",
      "https://secret@github.com/example/project",
    );
    await assert.rejects(
      readGitHubContext(root, { kind: "file", path: "src/retry.ts" }),
      (e) =>
        !e.message.includes("secret") && /without credentials/.test(e.message),
    );
    await assert.rejects(
      readGitHubContext(root, { kind: "file", path: "../outside" }),
      /inside/,
    );
    git(root, "remote", "remove", "origin");
    await assert.rejects(
      readGitHubContext(root, { kind: "file", path: "src/retry.ts" }),
      /No origin/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
