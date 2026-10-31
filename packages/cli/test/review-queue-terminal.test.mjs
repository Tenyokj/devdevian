import { createHash } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import headless from "@xterm/headless";
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
test(
  "review queue opens exact discussion, resumes file/line, filters versions and stays bounded after resize",
  { timeout: 30000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "ddv-review-queue-"));
    const term = new headless.Terminal({
      cols: 120,
      rows: 36,
      allowProposedApi: true,
    });
    const calls = [],
      pagination = { page: 1, pages: 1, total: 1 };
    let child;
    const post = {
      id: 42,
      user_id: 1,
      name: "Ada",
      kind: "review",
      title: "Bounded retry review",
      body: "Review this worker.",
      code: Array.from(
        { length: 120 },
        (_, i) => "const line" + i + " = true;",
      ).join("\n"),
      github_context: {
        files: [
          { path: "source.ts", patch_start: 1, patch_end: 60 },
          { path: "test.ts", patch_start: 61, patch_end: 120 },
        ],
      },
      replies: [],
      reply_pagination: pagination,
    };
    const note = {
      id: 3,
      user_id: 2,
      name: "Grace",
      start_line: 63,
      end_line: 63,
      body: "Please cover the deadline.",
      quote: "const line62 = true;",
      revision: 1,
      resolved: false,
    };
    const summary = { open: 1, resolved: 0, earlier: 2 };
    const server = createServer((req, res) => {
      calls.push(req.url);
      const url = new URL(req.url, "http://fixture");
      let data = { items: [], pagination };
      if (url.pathname === "/api/me")
        data = { user: { id: 1, username: "ada" } };
      else if (url.pathname === "/api/notifications")
        data = { ...data, unread_count: 0 };
      else if (url.pathname === "/api/posts")
        data = {
          review_queue: url.searchParams.get("review_queue"),
          items: [
            {
              ...post,
              code: undefined,
              review_target:
                url.searchParams.get("review_queue") === "awaiting" ? 3 : null,
              review_reply_target: 77,
            },
          ],
          pagination,
        };
      else if (url.pathname === "/api/posts/42") data = post;
      else if (url.pathname === "/api/posts/42/code-reviews")
        data = {
          items: [note],
          pagination,
          summary,
          snippet_hash: createHash("sha256").update(post.code).digest("hex"),
        };
      else if (url.pathname === "/api/posts/42/code-reviews/3/replies")
        data = {
          items: [
            {
              id: 77,
              user_id: 2,
              name: "Grace",
              body: "The exact reply from the queue.",
              revision: 1,
            },
          ],
          pagination,
        };
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(data));
    });
    try {
      await new Promise((r) => server.listen(0, "127.0.0.1", r));
      const credentials = JSON.stringify({
        origin: `http://127.0.0.1:${server.address().port}`,
        token: "ddv_" + "a".repeat(43),
      });
      await writeFile(join(directory, "credentials.json"), credentials, {
        mode: 0o600,
      });
      const bin =
        process.env.CLI_TEST_BIN ||
        fileURLToPath(new URL("../bin/devdevian.mjs", import.meta.url));
      child = spawn(
        "python3",
        [
          fileURLToPath(new URL("./terminal-driver.py", import.meta.url)),
          process.execPath,
          bin,
          "tui",
          "--no-live",
          "--motion",
          "reduced",
        ],
        {
          cwd: directory,
          env: {
            ...process.env,
            DEVDEVIAN_CONFIG_DIR: directory,
            DEVDEVIAN_TEST_COLUMNS: "120",
            DEVDEVIAN_TEST_ROWS: "36",
            TERM: "xterm-256color",
            FORCE_COLOR: "3",
          },
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      let raw = "";
      child.stdout.on("data", (c) => {
        raw += c;
        term.write(c);
      });
      child.stderr.on("data", (c) => {
        raw += c;
      });
      const screen = () =>
        Array.from(
          { length: term.rows },
          (_, i) =>
            term.buffer.active.getLine(i)?.translateToString(true) || "",
        ).join("\n");
      const wait = async (text) => {
        for (let i = 0; i < 100; i++) {
          if (screen().includes(text)) return;
          await delay(50);
        }
        throw Error("Missing " + text + "\n" + screen() + raw.slice(-100));
      };
      const send = async (input) => {
        await delay(130);
        child.stdin.write(JSON.stringify({ input }) + "\n");
      };
      const command = async (text) => {
        await send("/");
        await send(text);
        await send("\r");
      };
      await wait("Bounded retry review");
      await command("/reviews");
      await wait("Open requests");
      await send("\x1b[C");
      await wait("Awaiting you");
      await send("\r");
      await wait("The exact reply from the queue.");
      assert.ok(calls.some((p) => p.includes("/replies?page=1&target_id=77")));
      await send("\x1b");
      await wait("Awaiting you");
      await send("\x1b[D");
      await send("\r");
      await wait("Open 1 · Resolved 0 · Earlier 2");
      await send("w");
      await send("}");
      await send("\x1b[B\x1b[B");
      await wait("Lines 63–63");
      await command("/feed");
      await wait("Public feed");
      await command("/open 42");
      await wait("CODE SNIPPET");
      await send("v");
      await wait("Lines 63–63");
      assert.ok(
        calls.some((p) => p.includes("/code-reviews?page=1&target_id=3")),
      );

      await send("g");
      await delay(250);
      assert.ok(
        calls.some(
          (p) => p.includes("version=current") && !p.includes("target_id"),
        ),
      );
      await send("g");
      await delay(250);
      assert.ok(calls.some((p) => p.includes("version=earlier")));
      term.resize(60, 18);
      child.stdin.write(JSON.stringify({ resize: [60, 18] }) + "\n");
      await delay(300);
      assert.equal(term.buffer.active.baseY, 0);
      post.code = "const replacement = true;";
      note.outdated = true;
      await send("R");
      await delay(300);
      await wait("const replacement = true;");
      term.resize(120, 36);
      child.stdin.write(JSON.stringify({ resize: [120, 36] }) + "\n");
      await wait("Lines 1–1");
      assert.equal(
        await readFile(join(directory, "credentials.json"), "utf8"),
        credentials,
      );
      assert.equal(term.buffer.active.baseY, 0);
    } finally {
      child?.kill();
      term.dispose();
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
      await rm(directory, { recursive: true, force: true });
    }
  },
);
