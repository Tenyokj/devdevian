import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import headless from "@xterm/headless";
import { defaultAppearance } from "../lib/appearance.mjs";
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

test(
  "terminal appearance previews/cancels, persists across restart, changes density and stacked reviews, and resets safely",
  { timeout: 30000 },
  async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "devdevian-theme-terminal-"),
    );
    const config = join(directory, "appearance.json");
    let writes = 0;
    const post = {
      id: 42,
      title: "Review layout",
      user_id: 1,
      name: "Ada",
      kind: "review",
      body: "Context for the new layout.",
      code: "const value = 42;\nreturn value;",
      replies: [],
      reply_pagination: { page: 1, pages: 1, total: 0 },
    };
    const server = createServer((req, res) => {
      const path = new URL(req.url, "http://fixture").pathname;
      let data;
      if (req.method !== "GET") writes++;
      if (path === "/api/me") data = { user: { id: 1, username: "ada" } };
      else if (path === "/api/posts/42") data = post;
      else if (path === "/api/posts/42/code-reviews")
        data = {
          items: [],
          snippet_hash: createHash("sha256").update(post.code).digest("hex"),
          pagination: { page: 1, pages: 1, total: 0 },
        };
      else
        data = {
          items: Array.from({ length: 12 }, (_, i) => ({
            ...post,
            id: i + 1,
            title: "Conversation " + (i + 1),
            excerpt: "Useful conversation context.",
          })),
          pagination: { page: 1, pages: 1, total: 12 },
        };
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
    let raw = "",
      child;
    const start = (...overrides) => {
      child = spawn(
        "python3",
        [
          fileURLToPath(new URL("./terminal-driver.py", import.meta.url)),
          process.execPath,
          process.env.CLI_TEST_BIN ||
            fileURLToPath(new URL("../bin/devdevian.mjs", import.meta.url)),
          "tui",
          "--no-live",
          ...overrides,
        ],
        {
          env: {
            ...process.env,
            DEVDEVIAN_CONFIG_DIR: directory,
            DEVDEVIAN_TEST_COLUMNS: "140",
            DEVDEVIAN_TEST_ROWS: "38",
            FORCE_COLOR: "3",
            TERM: "xterm-256color",
          },
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      child.stdout.on("data", (c) => {
        raw += c;
        term.write(c.toString());
      });
      child.stderr.on("data", (c) => {
        raw += c;
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
        await delay(50);
      }
      throw Error("Missing " + text + "\n" + screen() + "\n" + raw.slice(-700));
    };
    const send = async (input) => {
      await delay(110);
      child.stdin.write(JSON.stringify({ input }) + "\n");
    };
    const command = async (value) => {
      await send("/");
      await send(value);
      await send("\r");
    };
    const stop = async () => {
      const exited = new Promise((r) => child.once("exit", r));
      await send("\x03");
      await exited;
    };
    try {
      start();
      await wait("Conversation 1");
      const originalCount = (screen().match(/Conversation \d+/g) || []).length;
      await send(",");
      await wait("LIVE PREVIEW");
      let marker = raw.length;
      await send("\x1b[C".repeat(2));
      await wait("Daylight · light");
      assert.ok(raw.slice(marker).includes("48;2;242;245;255"));
      await send("\x1b");
      await wait("preview cancelled");
      await assert.rejects(access(config));
      await send(",");
      await send("\x1b[C".repeat(2));
      await send("\t");
      await send("\x1b[C");
      for (let i = 0; i < 5; i++) {
        await send("\t");
        await send("\x1b[C");
      }
      await wait("Reduced · static indicators");
      await send("\x13");
      await wait("Appearance saved locally");
      const saved = JSON.parse(await readFile(config, "utf8")).settings;
      assert.deepEqual(saved, {
        theme: "daylight",
        accent: "violet",
        density: "compact",
        sidebar: "hidden",
        reviewLayout: "stacked",
        frame: "single",
        motion: "reduced",
      });
      assert.ok(!screen().includes("YOUR SPACE"));
      assert.ok(screen().includes("┌"));
      assert.ok(
        (screen().match(/Conversation \d+/g) || []).length > originalCount,
        "compact density fits more cards",
      );
      await send("\x1b[6~");
      await wait("▸ Conversation 8");
      await command("/open 42");
      await wait("Context for the new layout.");
      await send("v");
      await wait("Discussion · W focus");
      assert.ok(
        !screen().includes("const value = 42;"),
        "stacked view hides the other pane even on a wide terminal",
      );
      await send("W");
      await wait("const value = 42;");
      assert.ok(!screen().includes("Discussion · W focus"));
      await stop();
      term.reset();
      start();
      await wait("Conversation 1");
      assert.ok(!screen().includes("YOUR SPACE"));
      assert.ok(screen().includes("┌"));
      await command("/appearance");
      await wait("Daylight · light");
      await send("0");
      await wait("Midnight · original");
      await send("\x1b");
      await wait("preview cancelled");
      assert.equal(
        JSON.parse(await readFile(config, "utf8")).settings.theme,
        "daylight",
      );
      await send(",");
      await send("0");
      await send("\x13");
      await wait("Appearance saved locally");
      await wait("YOUR SPACE");
      assert.deepEqual(
        JSON.parse(await readFile(config, "utf8")).settings,
        defaultAppearance,
      );
      assert.equal(writes, 0);
      term.resize(60, 18);
      child.stdin.write(JSON.stringify({ resize: [60, 18] }) + "\n");
      await delay(200);
      await send(",");
      await wait("Theme");
      for (let i = 0; i < 6; i++) await send("\t");
      await wait("Motion");
      await wait("Subtle loading indicators");
      assert.equal(term.buffer.active.baseY, 0);
      await send("\x1b");
      await stop();
      term.reset();
      await writeFile(config, "corrupt-json");
      term.resize(140, 38);
      start();
      await wait("Conversation 1");
      await wait("Could not load appearance");
      assert.equal(await readFile(config, "utf8"), "corrupt-json");
      await stop();
      term.reset();
      start("--theme", "nebula", "--accent", "rose");
      await wait("Conversation 1");
      await send(",");
      await wait("Nebula · deep violet");
      await send("\t");
      await wait("Rose");
      await send("\x1b");
      assert.equal(await readFile(config, "utf8"), "corrupt-json");
      await stop();
    } finally {
      child?.kill();
      term.dispose();
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
      await rm(directory, { recursive: true, force: true });
    }
  },
);
