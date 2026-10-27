import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import headless from "@xterm/headless";
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

test(
  "terminal editor restores Ink, deep-link selects a nested reply, back preserves selection and session expiry preserves writing",
  { timeout: 30000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "devdevian-everyday-"));
    const editorFile = join(directory, "editor.mjs");
    await writeFile(
      editorFile,
      "import{readFile,writeFile}from'node:fs/promises';const p=process.argv.at(-1);await new Promise(r=>setTimeout(r,200));await writeFile(p,(await readFile(p,'utf8'))+'\\nEdited in external editor.');",
    );
    const parent = {
      id: 9,
      user_id: 1,
      name: "Ada",
      body: "Parent answer",
      revision: 1,
    };
    const nested = {
      id: 29,
      user_id: 2,
      name: "Grace",
      body: "Nested answer on the third page",
      parent_id: 9,
      revision: 1,
    };
    const post = {
      id: 42,
      user_id: 1,
      name: "Ada",
      kind: "question",
      title: "First conversation",
      body: "# Helpful heading\n**Useful** context for your question.\n```js\nconst value = 42;\n```",
      replies: [parent],
      reply_pagination: { page: 2, pages: 2, total: 11 },
    };
    const second = { ...post, id: 43, title: "Second conversation" };
    const pagination = { page: 1, pages: 1, total: 2 };
    let writes = 0;
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, "http://fixture");
      let data;
      if (url.pathname === "/api/me")
        data = { user: { id: 1, username: "ada" } };
      else if (
        req.method === "POST" &&
        url.pathname === "/api/posts/42/replies"
      ) {
        writes++;
        res.statusCode = 401;
        data = { error: "Session expired" };
      } else if (url.pathname === "/api/notifications")
        data = {
          items: [
            {
              id: 5,
              actor_name: "Grace",
              type: "reply",
              post_id: 42,
              reply_id: 29,
              post_title: "Nested notification",
            },
          ],
          pagination,
          unread_count: 1,
          latest_id: 5,
        };
      else if (url.pathname === "/api/notifications/5/read")
        data = { ok: true };
      else if (url.pathname === "/api/posts/42/replies")
        data = {
          items: [nested],
          pagination: { page: 3, pages: 3, total: 21 },
        };
      else if (url.pathname === "/api/posts/42")
        data = {
          ...post,
          reply_path:
            url.searchParams.get("reply_id") === "29"
              ? [
                  { id: 9, parent_id: null, page: 2 },
                  { id: 29, parent_id: 9, page: 3 },
                ]
              : [{ id: 9, parent_id: null, page: 2 }],
        };
      else if (url.pathname === "/api/posts/43") data = second;
      else data = { items: [post, second], pagination };
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
      cols: 110,
      rows: 34,
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
        "--no-live",
      ],
      {
        env: {
          ...process.env,
          DEVDEVIAN_CONFIG_DIR: directory,
          DEVDEVIAN_TEST_COLUMNS: "110",
          DEVDEVIAN_TEST_ROWS: "34",
          TERM: "xterm-256color",
          FORCE_COLOR: "3",
          VISUAL: `"${process.execPath}" "${editorFile}"`,
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    child.stdout.on("data", (chunk) => {
      raw += chunk;
      term.write(chunk.toString());
    });
    child.stderr.on("data", (chunk) => {
      raw += chunk;
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
      throw Error("Missing " + text + "\n" + screen() + "\n" + raw.slice(-600));
    };
    const send = async (input) => {
      await delay(120);
      child.stdin.write(JSON.stringify({ input }) + "\n");
    };
    const command = async (value) => {
      await send("/");
      await send(value);
      await send("\r");
    };
    try {
      await wait("Second conversation");
      await send("\x1b[B");
      await send("\r");
      await wait("Helpful heading");
      await send("\x1b");
      await wait("▸ Second conversation");
      await command("/inbox");
      await wait("Nested notification");
      await send("\r");
      await wait("▸ Grace · reply #29");
      await wait("Page 3/3");
      await send("\x1b");
      await wait("Nested notification");
      await command("/open 42");
      await wait("Helpful heading");
      assert.ok(!screen().includes("# Helpful heading"));
      await wait("const value = 42;");
      await send("r");
      await wait("Your reply");
      await send("Original useful response.");
      await send("\x05");
      await wait("Text returned from editor.");
      await wait("Edited in external editor.");
      assert.equal(term.buffer.active.type, "alternate");
      assert.equal(term.buffer.active.baseY, 0);
      assert.equal(writes, 0);
      await writeFile(editorFile, "process.exit(1)");
      await send("\x05");
      await wait("original text is unchanged");
      assert.ok(screen().includes("Edited in external editor."));
      await send("\x13");
      await wait("Preview ·");
      await send("\x1b[C");
      await send("\r");
      await wait("Session expired or revoked");
      assert.equal(writes, 1);
      await send("\x1b");
      await wait("Edited in external editor.");
      await send("\x0c");
      await wait("Sign in with your existing");
      const scopes = await readdir(join(directory, "drafts"));
      let saved;
      for (const scope of scopes)
        for (const file of await readdir(join(directory, "drafts", scope))) {
          const record = JSON.parse(
            await readFile(join(directory, "drafts", scope, file), "utf8"),
          );
          if (record.form.kind === "reply") saved = record;
        }
      assert.match(
        saved.form.values.body,
        /Original useful response\.[\s\S]*Edited in external editor\./,
      );
    } finally {
      child.kill();
      term.dispose();
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
      await rm(directory, { recursive: true, force: true });
    }
  },
);
