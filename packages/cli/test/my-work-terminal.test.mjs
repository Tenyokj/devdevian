import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import headless from "@xterm/headless";
const run = promisify(execFile),
  delay = (ms) => new Promise((r) => setTimeout(r, ms));

test(
  "My work tabs, page/back, Inbox/drafts and Halloween preview/save/off work in a real bounded terminal",
  { timeout: 30000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "ddv-work-"));
    const term = new headless.Terminal({
      cols: 120,
      rows: 36,
      allowProposedApi: true,
    });
    let child, release;
    const gate = new Promise((r) => {
      release = r;
    });
    const calls = [];
    const server = createServer(async (req, res) => {
      calls.push({ method: req.method, path: req.url });
      const url = new URL(req.url, "http://fixture");
      let data = { items: [], pagination: { page: 1, pages: 1, total: 0 } };
      if (url.pathname === "/api/me") {
        await gate;
        data = { user: { id: 1, username: "fixture" } };
      } else if (url.pathname === "/api/notifications")
        data = { ...data, unread_count: 0 };
      else if (url.pathname === "/api/posts") {
        const page = Number(url.searchParams.get("page") || 1);
        const section = url.searchParams.has("kind")
          ? "Review"
          : url.searchParams.has("saved")
            ? "Saved"
            : url.searchParams.has("following")
              ? "Following"
              : "Owned";
        data = {
          items: [
            {
              id: 42,
              kind: "question",
              title: section + " page " + page,
              body: "Keep working here.",
              name: "Fixture",
            },
          ],
          pagination: { page, pages: 2, total: 13 },
        };
      } else if (url.pathname === "/api/posts/42")
        data = {
          id: 42,
          title: "An owned conversation",
          body: "Continue this conversation.",
          kind: "question",
          user_id: 1,
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
      const env = { ...process.env, DEVDEVIAN_CONFIG_DIR: directory };
      const bin =
        process.env.CLI_TEST_BIN ||
        fileURLToPath(new URL("../bin/devdevian.mjs", import.meta.url));
      await run(process.execPath, [bin, "appearance", "--theme", "halloween"], {
        env,
      });
      const start = () =>
        spawn(
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
              ...env,
              DEVDEVIAN_TEST_COLUMNS: "120",
              DEVDEVIAN_TEST_ROWS: "36",
              TERM: "xterm-256color",
              FORCE_COLOR: "3",
            },
            stdio: ["pipe", "pipe", "pipe"],
          },
        );
      let raw = "";
      const attach = () => {
        child.stdout.on("data", (c) => {
          raw += c;
          term.write(c);
        });
        child.stderr.on("data", (c) => {
          raw += c;
        });
      };
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
        await delay(100);
        child.stdin.write(JSON.stringify({ input }) + "\n");
      };
      const command = async (text) => {
        await send("/");
        await send(text);
        await send("\r");
      };
      child = start();
      attach();
      await wait("pumpkin magic");
      await wait("_W_");
      const still = screen();
      await delay(500);
      assert.equal(screen(), still, "Reduced motion is static");
      release();
      await wait("Owned page 1");
      await command("/work");
      await wait("My work");
      await wait("Owned page 1");
      await send("\r");
      await wait("An owned conversation");
      await send("\x1b");
      await wait("My work");
      await send("]");
      await wait("Owned page 2");
      await send("\x1b[C");
      await wait("Review page 1");
      await send("\x1b[C");
      await wait("Saved page 1");
      await send("\x1b[C");
      await wait("Following page 1");
      await send("i");
      await wait("You're all caught up");
      await send("\x1b");
      await wait("Following page 1");
      await send("d");
      await wait("Local drafts");
      await send("\x1b");
      await wait("My work");
      term.resize(60, 18);
      child.stdin.write(JSON.stringify({ resize: [60, 18] }) + "\n");
      await delay(250);
      assert.equal(term.buffer.active.baseY, 0);
      await send("\x1b[D");
      await wait("Saved page 1");
      term.resize(120, 36);
      child.stdin.write(JSON.stringify({ resize: [120, 36] }) + "\n");
      await send(",");
      await wait("Halloween");
      await send("\x1b[C");
      await wait("Midnight");
      await send("\x13");
      await delay(300);
      assert.equal(
        JSON.parse(await readFile(join(directory, "appearance.json"), "utf8"))
          .settings.theme,
        "midnight",
      );
      assert.equal(
        await readFile(join(directory, "credentials.json"), "utf8"),
        credentials,
      );
      assert.ok(calls.every((c) => c.method === "GET"));
      assert.ok(calls.some((c) => c.path.includes("author=me&kind=review")));
      child.kill();
      await new Promise((r) => child.once("exit", r));
      term.reset();
      child = start();
      attach();
      await wait("Owned page 1");
      assert.ok(!screen().includes("{*} DEVDEVIAN"));
      assert.equal(term.buffer.active.baseY, 0);
    } finally {
      release();
      child?.kill();
      term.dispose();
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
      await rm(directory, { recursive: true, force: true });
    }
  },
);
