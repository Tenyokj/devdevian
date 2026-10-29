import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import headless from "@xterm/headless";
import { workspaceRoot } from "../lib/workspace.mjs";
import { DraftStore } from "../lib/drafts.mjs";
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
function terminal({ root, config }) {
  const term = new headless.Terminal({
    cols: 120,
    rows: 36,
    allowProposedApi: true,
  });
  let raw = "",
    closed = false,
    queue = Promise.resolve();
  const child = spawn(
    "python3",
    [
      fileURLToPath(new URL("./terminal-driver.py", import.meta.url)),
      process.execPath,
      process.env.CLI_TEST_BIN ||
        fileURLToPath(new URL("../bin/devdevian.mjs", import.meta.url)),
      "tui",
      "--project",
      root,
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        DEVDEVIAN_TEST_COLUMNS: "120",
        DEVDEVIAN_TEST_ROWS: "36",
        DEVDEVIAN_CONFIG_DIR: config,
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  child.stdout.on("data", (c) => {
    raw += c;
    term.write(c.toString());
  });
  child.stderr.on("data", (c) => (raw += c));
  child.on("exit", () => (closed = true));
  const screen = () =>
    Array.from(
      { length: term.rows },
      (_, i) => term.buffer.active.getLine(i)?.translateToString(true) || "",
    ).join("\n");
  return {
    term,
    child,
    screen,
    send(input) {
      queue = queue
        .then(() => delay(100))
        .then(() => child.stdin.write(JSON.stringify({ input }) + "\n"));
      return queue;
    },
    async wait(text) {
      for (let i = 0; i < 120; i++) {
        if (screen().includes(text)) return;
        await delay(50);
      }
      throw Error("Missing " + text + "\n" + screen() + "\n" + raw.slice(-500));
    },
    async exit() {
      for (let i = 0; i < 100 && !closed; i++) await delay(30);
      assert.ok(closed, "Terminal exits");
      assert.equal(term.buffer.active.type, "normal");
    },
    resize(cols, rows) {
      term.resize(cols, rows);
      child.stdin.write(JSON.stringify({ resize: [cols, rows] }) + "\n");
    },
    close() {
      child.kill();
      term.dispose();
    },
  };
}
test(
  "workspace UI selects a Git hunk, restores a review draft after restart and publishes the selected patch",
  { timeout: 45000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "devdevian-workflow-")),
      project = join(directory, "project"),
      config = join(directory, "config");
    await mkdir(project);
    await mkdir(config, { mode: 0o700 });
    const root = await workspaceRoot(project),
      git = (...args) =>
        execFileSync("git", ["-C", root, ...args], { stdio: "pipe" });
    let ui,
      posted = null,
      posts = 0;
    await mkdir(join(root, "src"));
    const original =
      Array.from(
        { length: 30 },
        (_, i) => `export const value${i} = ${i};`,
      ).join("\n") + "\n";
    await writeFile(join(root, "src", "retry.ts"), original);
    await writeFile(join(root, ".env"), "NEVER_SELECT=secret");
    git("init", "-q");
    git("add", ".");
    git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.test",
      "commit",
      "-qm",
      "fixture",
    );
    await writeFile(
      join(root, "src", "retry.ts"),
      original
        .replace("value1 = 1", "value1 = 111")
        .replace("value25 = 25", "value25 = 250"),
    );
    const before = git("diff", "--no-ext-diff").toString();
    let membership = true;
    const server = createServer(async (req, res) => {
      let data;
      const path = new URL(req.url, "http://fixture").pathname;
      if (req.method === "POST" && path === "/api/posts") {
        let body = "";
        for await (const c of req) body += c;
        posted = JSON.parse(body);
        posts++;
        // Receiving the write does not yet acknowledge it to the terminal.
        await delay(150);
        data = { id: 77 };
      } else if (path === "/api/me")
        data = { user: { id: 1, username: "reviewer" } };
      else if (path === "/api/topics")
        data = [{ id: "web", name: "Web development" }];
      else if (path === "/api/communities")
        data = {
          items: membership ? [{ id: "private-1", name: "Review team" }] : [],
          pagination: { page: 1, pages: 1, total: membership ? 1 : 0 },
        };
      else if (path === "/api/communities/private-1")
        data = { id: "private-1", name: "Review team", is_member: membership };
      else if (path === "/api/posts/77")
        data = {
          ...posted,
          id: 77,
          name: "Reviewer",
          user_id: 1,
          replies: [],
          reply_pagination: { page: 1, pages: 1, total: 0 },
        };
      else data = { items: [], pagination: { page: 1, pages: 1, total: 0 } };
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(data));
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const origin = "http://127.0.0.1:" + server.address().port;
    await writeFile(
      join(config, "credentials.json"),
      JSON.stringify({ origin, token: "ddv_" + "c".repeat(43) }),
      { mode: 0o600 },
    );
    try {
      ui = terminal({ root, config });
      await ui.wait("Nothing here yet.");
      ui.resize(120, 36);
      await delay(150);
      await ui.send("/");
      await ui.send("/review");
      await ui.send("\r");
      await ui.wait("Publication type");
      await ui.send("\x07");
      await ui.wait("Git changes · unstaged");
      await ui.wait("src/retry.ts");
      assert.ok(!ui.screen().includes(".env"));
      await ui.send("\r");
      await ui.wait("All hunks");
      await ui.send("]");
      await ui.wait("Hunk 1/2");
      await ui.send("\r");
      await ui.wait("Git changes selected.");
      await ui.send("\t");
      await ui.send("Review the retry strategy");
      await ui.send("\t");
      await ui.send("\t");
      await ui.send("\x1b[C"); // Explicitly choose the private audience.
      await ui.send("\x0e"); // Next step; preserve the selected Git hunk.
      await ui.send("\t");
      await ui.send("Please review retry behaviour and timeout handling.");
      await ui.send("\t");
      await ui.send(
        "This worker needs a second pair of eyes before deployment.",
      );
      await ui.wait("Draft saved locally");
      assert.equal(posts, 0);
      await ui.send("\x03");
      await ui.wait("Leave this draft?");
      await ui.send("\x1b[C");
      await ui.send("\r");
      await ui.exit();
      ui.close();
      const store = new DraftStore({
        origin,
        userId: 1,
        root,
        env: { DEVDEVIAN_CONFIG_DIR: config },
      });
      const saved = await store.list();
      assert.equal(saved.length, 1);
      assert.equal(saved[0].form.source.hunk, 0);
      assert.equal(saved[0].form.values.community_id, "private-1");
      membership = false; // Losing access cannot silently promote this draft to the public feed.
      assert.ok(!JSON.stringify(saved).includes("export const value1"));
      ui = terminal({ root, config });
      await ui.wait("Nothing here yet.");
      await ui.send("/");
      await ui.send("/drafts");
      await ui.send("\r");
      await ui.wait("Review the retry strategy");
      await ui.send("\r");
      await ui.wait("Restored local draft.");
      await ui.send("\x13");
      await ui.wait("Choose an available audience explicitly");
      assert.equal(posts, 0);
      await ui.send("\t");
      await ui.send("\t");
      await ui.send("\t");
      await ui.send("\x1b[D"); // Explicitly choose Public before previewing.
      await ui.send("\x13");
      await ui.wait("Preview · Request a code review");
      assert.equal(posts, 0);
      await ui.send("\x1b[C");
      await ui.send("\r");
      for (let i = 0; i < 100 && !posted; i++) await delay(50);
      assert.equal(posts, 1);
      assert.equal(posted.kind, "review");
      assert.equal(posted.community_id, null);
      assert.equal(posted.title, "Review the retry strategy");
      assert.ok(posted.code.includes("+export const value1 = 111;"));
      assert.ok(!posted.code.includes("value25"));
      assert.ok(posted.body.includes("Review source: Git diff"));
      await ui.wait("Saved. Your web account sees the same update.");
      assert.equal((await store.list()).length, 0);
      await ui.wait("Code feedback");
      // The same picker also supports file navigation and a range, including a compact terminal.
      await ui.send("/");
      await ui.send("/review");
      await ui.send("\r");
      await ui.wait("Publication type");
      await ui.send("\x0f");
      await ui.wait("Files · .");
      await ui.wait("src");
      await ui.send("\r");
      await ui.wait("retry.ts");
      await ui.send("\r");
      await ui.wait("Whole file");
      ui.resize(80, 24);
      await delay(200);
      await ui.send(" ");
      await ui.send("\x1b[B");
      await ui.wait("Selected lines 1–2");
      await ui.send("\r");
      await ui.wait("File selected.");
      assert.equal(ui.term.buffer.active.baseY, 0);
      assert.equal(
        git("diff", "--no-ext-diff").toString(),
        before,
        "Git selection is read-only",
      );
      await ui.send("\x1b");
      await ui.wait("Discard this draft?");
      await ui.send("\x1b[C");
      await ui.send("\r");
      await delay(150);
      await ui.send("\x03");
      await ui.exit();
    } finally {
      ui?.close();
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
      await rm(directory, { recursive: true, force: true });
    }
  },
);
