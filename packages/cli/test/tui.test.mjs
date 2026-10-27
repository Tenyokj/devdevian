import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import headless from "@xterm/headless";
import { editText, clip, parseCommand, PageCache } from "../lib/tui-model.mjs";
import { macScript, openWindow } from "../lib/window.mjs";
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
test("grapheme editing, terminal sanitizing and command validation", () => {
  assert.deepEqual(editText("a👨‍👩‍👧‍👦б", 2, "", { backspace: true }), {
    value: "aб",
    cursor: 1,
  });
  assert.equal(clip("\x1b[2Jhello", 4), "hel…");
  assert.deepEqual(parseCommand("/open 42"), { command: "open", arg: 42 });
  assert.throws(() => parseCommand("/open -1"));
  const cache = new PageCache({ max: 2 });
  cache.set("a", 1);
  cache.set("b", 2);
  cache.get("a");
  cache.set("c", 3);
  assert.equal(cache.get("b"), null);
  const script = macScript({
    node: "/node",
    entry: "/path with 'quote/cli.mjs",
    cwd: "/safe",
    args: ["--name", "$(touch /tmp/should-not-exist)"],
  });
  assert.ok(script.includes("'$(touch /tmp/should-not-exist)'"));
  assert.ok(script.includes("'\\''"));
});
test(
  "live terminal: bounded screen, navigation, drafts, publishing, resize and cleanup",
  { timeout: 30000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "devdevian-tui-"));
    let publication = null;
    let failed = false,
      deleted = 0;
    const ownReply = {
      id: 9,
      user_id: 1,
      name: "Ada",
      body: "My ordinary reply to delete.",
      revision: 0,
      parent_id: null,
    };
    const childReply = {
      id: 10,
      user_id: 2,
      name: "Grace",
      body: "A child reply that must survive.",
      revision: 0,
      parent_id: 9,
    };
    const post = {
      id: 42,
      title: "A resilient worker",
      name: "Ada",
      user_id: 1,
      kind: "discussion",
      body:
        "Useful context for the worker.\n" + "Long content line.\n".repeat(60),
      replies: [ownReply],
      reply_path: [{ id: 9, parent_id: null, page: 1 }],
      reply_pagination: { page: 1, pages: 1, total: 1 },
    };
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, "http://fixture");
      let data;
      if (req.method === "DELETE" && url.pathname === "/api/replies/9") {
        let body = "";
        for await (const c of req) body += c;
        assert.equal(JSON.parse(body).revision, 0);
        deleted++;
        ownReply.body = "[deleted by author]";
        ownReply.deleted_at = new Date().toISOString();
        ownReply.revision++;
        data = { id: 9, deleted: true };
      } else if (
        req.method === "GET" &&
        url.pathname === "/api/posts/42/replies"
      )
        data = {
          items: [childReply],
          pagination: { page: 1, pages: 1, total: 1 },
        };
      else if (req.method === "POST") {
        let raw = "";
        for await (const chunk of req) raw += chunk;
        publication = JSON.parse(raw);
        data = { id: 42 };
      } else if (url.pathname === "/api/me")
        data = { user: { id: 1, username: "ada" } };
      else if (url.pathname === "/api/topics")
        data = [{ id: "web", name: "Web development" }];
      else if (url.pathname === "/api/communities")
        data = { items: [], pagination: { page: 1, pages: 1, total: 0 } };
      else if (url.pathname === "/api/posts/42") data = post;
      else if (url.pathname === "/api/posts") {
        if (failed) {
          res.statusCode = 503;
          data = { error: "Temporarily unavailable. Please retry." };
        } else
          data = {
            items: [post, { ...post, id: 43, title: "Second conversation" }],
            pagination: { page: 1, pages: 2, total: 13 },
          };
      } else data = { items: [], pagination: { page: 1, pages: 1, total: 0 } };
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(data));
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const origin = "http://127.0.0.1:" + server.address().port;
    await writeFile(
      join(directory, "credentials.json"),
      JSON.stringify({ origin, token: "ddv_" + "a".repeat(43) }),
      { mode: 0o600 },
    );
    const term = new headless.Terminal({
      cols: 100,
      rows: 32,
      allowProposedApi: true,
    });
    let raw = "",
      closed = false;
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
          TERM: "xterm-256color",
          FORCE_COLOR: "3",
          NO_COLOR: "",
          DEVDEVIAN_CONFIG_DIR: directory,
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
    child.on("exit", () => (closed = true));
    const screen = () =>
      Array.from(
        { length: term.rows },
        (_, i) => term.buffer.active.getLine(i)?.translateToString(true) || "",
      ).join("\n");
    let sendQueue = Promise.resolve();
    const send = (input) => {
      sendQueue = sendQueue
        .then(() => delay(120))
        .then(() => child.stdin.write(JSON.stringify({ input }) + "\n"));
      return sendQueue;
    };
    const wait = async (text) => {
      for (let i = 0; i < 100; i++) {
        if (screen().includes(text)) return;
        await delay(50);
      }
      throw Error(
        "Missing " + text + "\n" + screen() + "\n" + raw.slice(-1000),
      );
    };
    try {
      await wait("A resilient worker");
      assert.equal(term.buffer.active.type, "alternate");
      assert.equal(term.buffer.active.baseY, 0);
      send("\x1b[B");
      await wait("Second conversation");
      send("\x1b[A");
      send("\r");
      await wait("Long content line.");
      send("\x1b[6~".repeat(30));
      await delay(150);
      send("\x1b[5~");
      await delay(100);
      send("r");
      await wait("Your reply");
      send("Привет, useful feedback!");
      send("\x13");
      await wait("Preview ·");
      assert.equal(publication, null);
      send("\x1b[C");
      await delay(100);
      send("\r");
      await wait("Saved.");
      assert.equal(publication.body, "Привет, useful feedback!");
      send("\x1b[C");
      await wait("My ordinary reply to delete.");
      send("\r");
      await wait("parent reply");
      send(" ");
      await wait("Full text");
      send("D");
      await wait("Delete your reply?");
      send("\x1b");
      await wait("Full text");
      assert.equal(deleted, 0);
      send("D");
      await wait("Delete your reply?");
      send("\x1b[C");
      send("\r");
      await wait("Reply deleted;");
      assert.equal(deleted, 1);
      await wait("A child reply that must survive.");
      send("\x1b[B");
      send("d");
      await wait("Select your own reply");
      assert.equal(deleted, 1);
      send("/");
      send("/feed");
      send("\r");
      await wait("Public feed");
      send("a");
      await wait("Publication type");
      send("\x1b");
      await wait("Discard this draft?");
      send("\x1b");
      await wait("Title");
      send("\x1b");
      await wait("Discard this draft?");
      send("\x1b[C");
      await delay(100);
      send("\r");
      await wait("Public feed");
      term.resize(80, 24);
      child.stdin.write(JSON.stringify({ resize: [80, 24] }) + "\n");
      await delay(300);
      assert.equal(term.buffer.active.baseY, 0);
      assert.ok(screen().includes("Press /"));
      term.resize(50, 15);
      child.stdin.write(JSON.stringify({ resize: [50, 15] }) + "\n");
      await wait("Enlarge this terminal");
      term.resize(100, 32);
      child.stdin.write(JSON.stringify({ resize: [100, 32] }) + "\n");
      await wait("Public feed");
      failed = true;
      send("R");
      await wait("Temporarily unavailable");
      assert.equal(term.buffer.active.baseY, 0);
      send("\x03");
      for (let i = 0; i < 100 && !closed; i++) await delay(30);
      assert.ok(closed, "Ctrl+C exits\n" + screen() + "\n" + raw.slice(-600));
      await delay(50);
      assert.equal(term.buffer.active.type, "normal");
      assert.ok(raw.includes("\x1b[?1049l"));
    } finally {
      child.kill();
      term.dispose();
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "compact terminal login shows the confirmation code and saves only an approved session",
  { timeout: 20000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "devdevian-login-tui-"));
    let approved = false,
      polls = 0;
    const server = createServer(async (req, res) => {
      let data;
      const path = new URL(req.url, "http://fixture").pathname;
      if (path === "/api/cli/device")
        data = {
          device_code: "x".repeat(43),
          user_code: "AB12-CD34",
          verification_uri: origin + "/app#cli/authorize/AB12-CD34",
        };
      else if (path === "/api/cli/token") {
        polls++;
        if (approved)
          data = {
            access_token: "ddv_" + "b".repeat(43),
            expires_at: Date.now() + 100000,
          };
        else {
          res.statusCode = 202;
          data = { pending: true };
        }
      } else if (path === "/api/me")
        data = { user: { id: 1, username: "approved_user" } };
      else data = { items: [], pagination: { page: 1, pages: 1, total: 0 } };
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(data));
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const origin = "http://127.0.0.1:" + server.address().port;
    const term = new headless.Terminal({
      cols: 100,
      rows: 32,
      allowProposedApi: true,
    });
    let closed = false,
      raw = "";
    const child = spawn(
      "python3",
      [
        fileURLToPath(new URL("./terminal-driver.py", import.meta.url)),
        process.execPath,
        process.env.CLI_TEST_BIN ||
          fileURLToPath(new URL("../bin/devdevian.mjs", import.meta.url)),
        "tui",
        "--host",
        origin,
        "--no-open",
      ],
      {
        env: {
          ...process.env,
          TERM: "xterm-256color",
          DEVDEVIAN_CONFIG_DIR: directory,
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    child.stdout.on("data", (c) => {
      raw += c;
      term.write(c.toString());
    });
    child.on("exit", () => (closed = true));
    const screen = () =>
      Array.from(
        { length: term.rows },
        (_, i) => term.buffer.active.getLine(i)?.translateToString(true) || "",
      ).join("\n");
    const wait = async (text) => {
      for (let i = 0; i < 150; i++) {
        if (screen().includes(text)) return;
        await delay(50);
      }
      throw Error("Missing " + text + "\n" + screen() + "\n" + raw.slice(-400));
    };
    const send = (input) => child.stdin.write(JSON.stringify({ input }) + "\n");
    try {
      await wait("Sign in");
      term.resize(80, 24);
      child.stdin.write(JSON.stringify({ resize: [80, 24] }) + "\n");
      await delay(200);
      send("\r");
      await wait("AB12-CD34");
      const { readFile, stat } = await import("node:fs/promises");
      await assert.rejects(readFile(join(directory, "credentials.json")), {
        code: "ENOENT",
      });
      approved = true;
      await wait("@approved_user");
      assert.equal(polls, 1);
      const saved = JSON.parse(
        await readFile(join(directory, "credentials.json"), "utf8"),
      );
      assert.equal(saved.origin, origin);
      assert.equal(saved.token, "ddv_" + "b".repeat(43));
      assert.equal(
        (await stat(join(directory, "credentials.json"))).mode & 0o777,
        0o600,
      );
      send("\x03");
      for (let i = 0; i < 100 && !closed; i++) await delay(30);
      assert.ok(closed);
      assert.equal(term.buffer.active.type, "normal");
    } finally {
      child.kill();
      term.dispose();
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test("macOS launcher creates a private quoted command file and detects startup failures", async () => {
  const directory = await mkdtemp(join(tmpdir(), "devdevian-launcher-"));
  const capture = join(directory, "capture.json");
  let temporary;
  try {
    await writeFile(
      join(directory, "open"),
      "#!" +
        process.execPath +
        "\nrequire('fs').writeFileSync(process.env.CAPTURE,JSON.stringify(process.argv.slice(2)));\n",
      { mode: 0o700 },
    );
    const env = {
      ...process.env,
      PATH: directory + ":" + process.env.PATH,
      CAPTURE: capture,
    };
    await openWindow({
      platform: "darwin",
      entry: "/project with 'quotes/cli.mjs",
      cwd: directory,
      args: ["--name", "$(not-a-command)"],
      env,
    });
    const args = JSON.parse(await readFile(capture, "utf8"));
    assert.deepEqual(args.slice(0, 3), ["-na", "Terminal", args[2]]);
    temporary = args[2];
    assert.equal((await stat(temporary)).mode & 0o777, 0o700);
    const script = await readFile(temporary, "utf8");
    assert.ok(script.includes("'$(not-a-command)'"));
    assert.ok(script.includes("'\\''"));
    await writeFile(
      join(directory, "open"),
      "#!" + process.execPath + "\nprocess.exit(1);\n",
      { mode: 0o700 },
    );
    await assert.rejects(
      openWindow({
        platform: "darwin",
        entry: "/cli.mjs",
        env,
        cwd: directory,
      }),
      /Could not open/,
    );
  } finally {
    if (temporary)
      await rm(join(temporary, ".."), { recursive: true, force: true });
    await rm(directory, { recursive: true, force: true });
  }
});
