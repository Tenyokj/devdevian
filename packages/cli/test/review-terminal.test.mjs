import { createHash } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import headless from "@xterm/headless";
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

test(
  "review terminal: split/compact code, line selection, contextual permissions and solution",
  { timeout: 30000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "devdevian-review-tui-"));
    const pagination = { page: 1, pages: 1, total: 1 };
    let releaseCount,
      mutation = null,
      filter = "",
      counts = 0,
      marked = null;
    const notifications = [
      {
        id: 11,
        actor_name: "Ada",
        type: "mention",
        post_title: "First notification",
      },
      {
        id: 10,
        actor_name: "Grace",
        type: "reply",
        post_title: "Selected notification",
      },
    ];
    const post = {
      id: 42,
      user_id: 1,
      name: "Ada",
      kind: "review",
      title: "Review the queue",
      body: "Review the retry boundary.",
      code: "async function retry() {\n  const reply = await send();\n  return reply;\n}",
      replies: [
        {
          id: 9,
          user_id: 2,
          name: "Grace",
          body: "Use a bounded retry policy.",
          revision: 0,
        },
      ],
      reply_pagination: pagination,
    };
    const note = {
      id: 3,
      user_id: 2,
      name: "Grace",
      body: "Handle the timeout here.",
      start_line: 2,
      end_line: 3,
      revision: 0,
      resolved: false,
    };
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, "http://fixture");
      let data;
      if (url.pathname === "/api/me")
        data = { user: { id: 1, username: "ada" } };
      else if (url.pathname === "/api/notifications") {
        if (url.searchParams.get("limit") === "1" && ++counts === 1)
          await new Promise((r) => {
            releaseCount = r;
          });
        data = {
          items: notifications,
          pagination,
          unread_count: marked ? 0 : 7,
          latest_id: notifications[0].id,
        };
      } else if (url.pathname === "/api/notifications/read-all") {
        let text = "";
        for await (const chunk of req) text += chunk;
        marked = JSON.parse(text).through_id;
        data = { ok: true };
      } else if (url.pathname === "/api/posts/42/solution") {
        let text = "";
        for await (const chunk of req) text += chunk;
        mutation = JSON.parse(text);
        post.accepted_reply_id = mutation.reply_id;
        data = { ok: true };
      } else if (url.pathname === "/api/posts/42/code-reviews") {
        filter = url.searchParams.get("status") || "all";
        data = {
          items: [note],
          pagination,
          snippet_hash: createHash("sha256").update(post.code).digest("hex"),
        };
      } else if (url.pathname === "/api/posts/42/code-reviews/3/replies")
        data = { items: [], pagination };
      else if (url.pathname === "/api/posts/42") data = post;
      else data = { items: [post], pagination };
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(data));
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    await writeFile(
      join(directory, "credentials.json"),
      JSON.stringify({
        origin: "http://127.0.0.1:" + server.address().port,
        token: "ddv_" + "a".repeat(43),
      }),
      { mode: 0o600 },
    );
    const term = new headless.Terminal({
      cols: 140,
      rows: 38,
      allowProposedApi: true,
    });
    let raw = "";
    const child = spawn(
      "python3",
      [
        fileURLToPath(new URL("./terminal-driver.py", import.meta.url)),
        process.execPath,
        process.env.CLI_TEST_BIN ||
          fileURLToPath(new URL("../bin/devdevian.mjs", import.meta.url)),
        "tui",
      ],
      {
        env: {
          ...process.env,
          DEVDEVIAN_CONFIG_DIR: directory,
          DEVDEVIAN_TEST_COLUMNS: "140",
          DEVDEVIAN_TEST_ROWS: "38",
          TERM: "xterm-256color",
          FORCE_COLOR: "3",
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
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
        (_, i) => term.buffer.active.getLine(i)?.translateToString(true) || "",
      ).join("\n");
    const wait = async (text) => {
      for (let i = 0; i < 100; i++) {
        if (screen().includes(text)) return;
        await delay(50);
      }
      throw Error("Missing " + text + "\n" + screen() + "\n" + raw.slice(-700));
    };
    const send = async (input) => {
      await delay(120);
      child.stdin.write(JSON.stringify({ input }) + "\n");
    };
    const resize = async (cols, rows) => {
      term.resize(cols, rows);
      child.stdin.write(JSON.stringify({ resize: [cols, rows] }) + "\n");
      await delay(250);
    };
    try {
      await wait("Review the queue");
      await send("\r");
      await wait("Review the retry boundary.");
      await send("V");
      await wait("Discussion · W focus");
      await wait("const reply = await send()");
      await send("X");
      await wait("Resolve remark");
      assert.ok(
        !screen().includes("Delete your reply / remark"),
        "foreign remark cannot be deleted",
      );
      await send("\x1b");
      await send("F");
      await delay(200);
      assert.equal(filter, "open");
      await send("w");
      await send("\x1b[B");
      await send(" ");
      await send("\x1b[B");
      await wait("Lines 2–3");
      await send("C");
      await wait("From snippet line");
      await send("\t");
      await send("\t");
      await send("Preserve this draft while syncing.");
      await wait("Preserve this draft");
      releaseCount();
      await wait("7 unread");
      assert.ok(screen().includes("Preserve this draft"));
      await send("\x13");
      await wait("Preview ·");
      assert.ok(screen().includes("Preserve this draft"));
      await send("\x1b");
      await send("\x1b");
      await wait("Discard this draft?");
      await send("\x1b[C");
      await send("\r");
      await wait("Discussion · W focus");
      await resize(80, 24);
      await wait("Code · W focus");
      assert.ok(!screen().includes("Discussion · W focus"));
      await send("w");
      await wait("Discussion · W focus");
      assert.ok(!screen().includes("const reply = await send()"));
      await send("\x1b[D");
      await wait("Use a bounded retry policy.");
      await send("X");
      await wait("Accept as solution");
      assert.ok(!screen().includes("Delete your reply / remark"));
      await send("\x1b");
      await send("S");
      await wait("Accept this reply as the solution?");
      assert.equal(mutation, null);
      await send("\x1b[C");
      await send("\r");
      await wait("Solution accepted.");
      assert.equal(mutation.reply_id, 9);
      await resize(140, 38);
      await send("/");
      await send("/inbox");
      await send("\r");
      await wait("Selected notification");
      await send("\x1b[B");
      await wait("▸ Grace");
      await send("X");
      await send("\x1b[B".repeat(3));
      await send("\r");
      await wait("Paused");
      notifications.unshift({
        id: 12,
        actor_name: "Linus",
        type: "mention",
        post_title: "New arrival",
      });
      await send("X");
      await send("\x1b[B".repeat(3));
      await send("\r");
      await wait("New arrival");
      assert.ok(
        screen().includes("▸ Grace"),
        "live refresh anchors selection by ID",
      );
      await send("X");
      await send("\x1b[B");
      await send("\r");
      await wait("Received notifications marked as read.");
      assert.equal(marked, 12);
      await wait("0 unread");
      assert.equal(term.buffer.active.baseY, 0);
    } finally {
      child.kill();
      releaseCount?.();
      term.dispose();
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
      await rm(directory, { recursive: true, force: true });
    }
  },
);
