import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import headless from "@xterm/headless";
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

test(
  "Devi follows real startup requests, supports static/off modes, retries connection errors and keeps compact sign-in usable",
  { timeout: 30000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "devdevian-devi-terminal-"));
    let meGate,
      postsGate,
      failMe = false,
      empty = false,
      deviceRequests = 0;
    const blockMe = () => {
      let release;
      meGate = new Promise((r) => {
        release = r;
      });
      return () => {
        meGate = null;
        release();
      };
    };
    const blockPosts = () => {
      let release;
      postsGate = new Promise((r) => {
        release = r;
      });
      return () => {
        postsGate = null;
        release();
      };
    };
    const server = createServer(async (req, res) => {
      const path = new URL(req.url, "http://fixture").pathname;
      let data;
      if (path === "/api/me") {
        if (meGate) await meGate;
        if (failMe) {
          res.statusCode = 503;
          data = { error: "Capacity temporarily exceeded" };
        } else data = { user: { id: 1, username: "ada" } };
      } else if (path === "/api/posts") {
        if (postsGate) await postsGate;
        data = {
          items: empty
            ? []
            : [
                {
                  id: 42,
                  title: "A real conversation",
                  name: "Ada",
                  kind: "discussion",
                  excerpt: "A useful conversation.",
                },
              ],
          pagination: { page: 1, pages: 1, total: empty ? 0 : 1 },
        };
      } else if (path === "/api/cli/device") {
        deviceRequests++;
        data = {
          device_code: "x".repeat(43),
          user_code: "AB12-CD34",
          verification_uri: origin + "/app#cli/authorize/AB12-CD34",
        };
      } else
        data = {
          items: [],
          pagination: { page: 1, pages: 1, total: 0 },
          unread_count: 0,
        };
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(data));
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const origin = "http://127.0.0.1:" + server.address().port;
    const credentials = join(directory, "credentials.json");
    const saveCredentials = () =>
      writeFile(
        credentials,
        JSON.stringify({ origin, token: "ddv_" + "a".repeat(43) }),
        { mode: 0o600 },
      );
    await saveCredentials();
    const term = new headless.Terminal({
      cols: 120,
      rows: 36,
      allowProposedApi: true,
    });
    let child,
      raw = "",
      closed = true;
    const start = (...args) => {
      term.resize(120, 36);
      term.reset();
      raw = "";
      closed = false;
      child = spawn(
        "python3",
        [
          fileURLToPath(new URL("./terminal-driver.py", import.meta.url)),
          process.execPath,
          process.env.CLI_TEST_BIN ||
            fileURLToPath(new URL("../bin/devdevian.mjs", import.meta.url)),
          "tui",
          "--no-live",
          "--no-open",
          "--host",
          origin,
          ...args,
        ],
        {
          env: {
            ...process.env,
            DEVDEVIAN_CONFIG_DIR: directory,
            DEVDEVIAN_TEST_COLUMNS: "120",
            DEVDEVIAN_TEST_ROWS: "36",
            FORCE_COLOR: "3",
            TERM: "xterm-256color",
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
      child.on("exit", () => {
        closed = true;
      });
    };
    const screen = () =>
      Array.from(
        { length: term.rows },
        (_, i) => term.buffer.active.getLine(i)?.translateToString(true) || "",
      ).join("\n");
    const wait = async (text) => {
      for (let i = 0; i < 100; i++) {
        if (screen().includes(text)) return;
        await delay(40);
      }
      throw Error("Missing " + text + "\n" + screen() + "\n" + raw.slice(-600));
    };
    const send = async (input) => {
      await delay(100);
      child.stdin.write(JSON.stringify({ input }) + "\n");
    };
    const stop = async () => {
      await send("\x03");
      for (let i = 0; i < 100 && !closed; i++) await delay(20);
      assert.ok(closed, "Ctrl+C exits promptly");
      assert.equal(term.buffer.active.type, "normal");
    };
    let releaseMe = () => {},
      releasePosts = () => {};
    try {
      releaseMe = blockMe();
      releasePosts = blockPosts();
      start();
      await wait("Devi missed you.");
      await wait("Connecting to Devdevian...");
      await wait("</>");
      await wait("-  -");
      releaseMe();
      await wait("Loading your public feed...");
      assert.ok(!screen().includes("A real conversation"));
      releasePosts();
      await wait("A real conversation");
      assert.ok(!screen().includes("Devi missed you."));
      const marker = raw.length;
      await send("R");
      await delay(250);
      assert.ok(!raw.slice(marker).includes("Devi missed you."));
      await stop();

      releaseMe = blockMe();
      start("--motion", "reduced");
      await wait("Devi missed you.");
      await delay(100);
      const still = screen();
      await delay(1800);
      assert.equal(screen(), still);
      failMe = true;
      releaseMe();
      await wait("Connection could not be completed.");
      await wait("R or Enter retries");
      assert.ok(!screen().includes("Connecting to Devdevian..."));
      failMe = false;
      empty = true;
      await send("R");
      await wait("Nothing here yet.");
      await wait("</>");
      assert.equal(
        deviceRequests,
        0,
        "retry checks the existing session without starting a new login",
      );
      await send("/");
      await send("/inbox");
      await send("\r");
      await wait("You're all caught up.");
      await stop();

      empty = false;
      releaseMe = blockMe();
      start("--welcome", "off");
      await wait("Connecting to Devdevian...");
      assert.ok(!screen().includes("Devi missed you."));
      assert.ok(!screen().includes("</>"));
      releaseMe();
      await wait("A real conversation");
      await stop();

      await rm(credentials);
      start();
      await wait("Devi saved you a seat.");
      await wait("Sign in with your existing");
      await send("\r");
      await wait("AB12-CD34");
      term.resize(60, 18);
      child.stdin.write(JSON.stringify({ resize: [60, 18] }) + "\n");
      await delay(200);
      await wait("AB12-CD34");
      await wait("Esc cancels");
      assert.equal(term.buffer.active.baseY, 0);
      await send("\x1b");
      await wait("Sign in with your existing");
      await stop();
    } finally {
      releaseMe();
      releasePosts();
      child?.kill();
      term.dispose();
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
      await rm(directory, { recursive: true, force: true });
    }
  },
);
