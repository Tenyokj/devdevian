import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { combinePRSelections } from "../packages/cli/lib/pr-diff.mjs";
import { startTestServer } from "./http-fixture.mjs";
const github = {
  repository: "https://github.com/example/project",
  commit: "b".repeat(40),
  branch: "feature/retries",
  path: "src/retry.ts",
  mode: "unstaged",
  pull_request: "https://github.com/example/project/pull/42",
};
test("GitHub context persists across clients and edits, validates before writes and retains private/owner scopes", async () => {
  const f = await startTestServer(),
    author = f.client(),
    other = f.client();
  try {
    await author("/register", {
      name: "Source Author",
      email: "source@github.test",
      password: "Fixture-password123",
    });
    await other("/register", {
      name: "Another Developer",
      email: "other@github.test",
      password: "Fixture-password123",
    });
    const payload = {
      title: "Review with repository context",
      body: "Please review retries and connection handling.",
      kind: "review",
      topic: "web",
      code: "const retries = 3;",
      review_focus: "Does this handle timeouts?",
      details: {
        github_context: github,
        links: [{ label: "Docs", url: "https://example.com/docs" }],
      },
    };
    const created = await author("/posts", payload);
    assert.equal(created.status, 201);
    const id = created.data.id;
    let post = (await other("/posts/" + id)).data;
    assert.equal(post.github_context.pull_request, github.pull_request);
    assert.equal(post.github_context.commit, github.commit);
    assert.equal(
      (await other("/details/post/" + id, { github_context: null }, "PUT"))
        .status,
      403,
    );
    const edited = await author(
      "/posts/" + id,
      {
        title: post.title,
        body: "Updated review context with additional explanation.",
        revision: post.revision,
        details: {
          links: [{ label: "Guide", url: "https://example.com/guide" }],
        },
      },
      "PATCH",
    );
    assert.equal(edited.status, 200);
    post = (await other("/posts/" + id)).data;
    assert.equal(post.github_context.commit, github.commit);
    assert.equal(post.links[0].label, "Guide");
    const bad = await author("/posts", {
      ...payload,
      title: "Invalid GitHub context must not publish",
      details: {
        github_context: { ...github, repository: "https://evil.test/project" },
      },
    });
    assert.equal(bad.status, 400);
    assert.equal(
      (await author("/posts?q=Invalid%20GitHub%20context")).data.length,
      0,
    );
    const community = (
      await author("/communities", {
        name: "Private source reviews",
        description: "A private team reviewing source context.",
      })
    ).data;
    const privatePost = (
      await author("/posts", {
        ...payload,
        title: "Private source context",
        community_id: community.id,
      })
    ).data;
    assert.ok(
      [403, 404].includes((await other("/posts/" + privatePost.id)).status),
    );
    assert.equal(
      (await author("/posts/" + privatePost.id)).data.github_context.commit,
      github.commit,
    );
    const snapshot = {
      ...github,
      mode: "pr",
      commit: "a".repeat(40),
      base_commit: "b".repeat(40),
      hunk_start: 2,
      hunk_end: 3,
    };
    const prPost = await author("/posts", {
      ...payload,
      title: "Selected public PR patch snapshot",
      details: { github_context: snapshot },
      code: '--- "a/retry.ts"\n+++ "b/retry.ts"\n@@ -1 +1 @@\n-old\n+new',
    });
    assert.equal(prPost.status, 201);
    assert.deepEqual(
      (await other("/posts/" + prPost.data.id)).data.github_context,
      { ...snapshot, start_line: null, end_line: null },
    );
    const multiAuthor = f.client();
    await multiAuthor("/register", {
      name: "Multi-file author",
      email: "multi@github.test",
      password: "Fixture-password123",
    });
    const selection = (path) => ({
      context: { ...snapshot, path },
      code: `--- "a/${path}"\n+++ "b/${path}"\n@@ -1 +1 @@\n-old\n+new`,
    });
    const multi = combinePRSelections([
      selection("src/retry.ts"),
      selection("test/retry.test.ts"),
    ]);
    const multiPost = await multiAuthor("/posts", {
      ...payload,
      title: "Multi-file PR review",
      code: multi.code,
      details: { github_context: multi.context },
    });
    assert.equal(multiPost.status, 201);
    assert.deepEqual(
      (await other("/posts/" + multiPost.data.id)).data.github_context,
      multi.context,
    );
    const document = await fetch(f.base + "/conversation/" + multiPost.data.id);
    assert.equal(document.status, 200);
    const html = await document.text();
    assert.match(html, /Selected PR files/);
    assert.match(html, /test\/retry.test.ts/);
    const badFiles = structuredClone(multi.context);
    badFiles.files[1].path = "../secrets";
    assert.equal(
      (
        await multiAuthor("/posts", {
          ...payload,
          details: { github_context: badFiles },
        })
      ).status,
      400,
    );
    const invalidSnapshot = await author("/posts", {
      ...payload,
      details: { github_context: { ...snapshot, base_commit: "not-a-sha" } },
    });
    assert.equal(invalidSnapshot.status, 400);
    // Exercise the actual command client against the same API and browser account.
    const root = join(f.directory, "project"),
      config = join(f.directory, "cli");
    await mkdir(root);
    await mkdir(config);
    const git = (...args) =>
      execFileSync("git", ["-C", root, ...args], {
        stdio: "pipe",
        encoding: "utf8",
      });
    git("init", "-q");
    git("config", "user.name", "Fixture");
    git("config", "user.email", "fixture@example.test");
    await writeFile(join(root, "retry.ts"), "export const retries = 3;\n");
    git("add", ".");
    git("commit", "-qm", "fixture");
    git("remote", "add", "origin", "git@github.com:example/project.git");
    const anon = f.client(),
      device = (await anon("/cli/device", { name: "GitHub command fixture" }))
        .data;
    await author("/cli/authorize", {
      user_code: device.user_code,
      approved: true,
    });
    const token = (
      await anon("/cli/token", { device_code: device.device_code })
    ).data.access_token;
    await writeFile(
      join(config, "credentials.json"),
      JSON.stringify({ origin: f.base, token }),
      { mode: 0o600 },
    );
    const bin =
      process.env.CLI_TEST_BIN ||
      fileURLToPath(
        new URL("../packages/cli/bin/devdevian.mjs", import.meta.url),
      );
    const run = (extra) =>
      JSON.parse(
        execFileSync(
          process.execPath,
          [
            bin,
            "review",
            "create",
            "--file",
            "retry.ts",
            "--title",
            "A command review with GitHub context",
            "--topic",
            "web",
            "--body",
            "Please check retry limits and failures.",
            "--focus",
            "Check timeout handling.",
            "--json",
            "--yes",
            ...extra,
          ],
          {
            cwd: root,
            env: { ...process.env, DEVDEVIAN_CONFIG_DIR: config },
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
          },
        ),
      );
    const cliPost = run(["--github-context", "--pr", github.pull_request]);
    const shared = (await other("/posts/" + cliPost.id)).data;
    assert.equal(shared.github_context.path, "retry.ts");
    assert.equal(shared.github_context.commit, git("rev-parse", "HEAD").trim());
    git(
      "remote",
      "set-url",
      "origin",
      "https://secret@github.com/example/project",
    );
    const noContext = run([]);
    assert.equal(
      (await other("/posts/" + noContext.id)).data.github_context,
      undefined,
      "default command does not collect GitHub context",
    );
    await author("/details/post/" + id, { github_context: null }, "PUT");
    post = (await other("/posts/" + id)).data;
    assert.equal(post.github_context, null);
    assert.equal(post.links[0].label, "Guide");
  } finally {
    await f.close();
  }
});
