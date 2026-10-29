import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import headless from "@xterm/headless";
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const run = promisify(execFile),
  url = "https://github.com/example/project/pull/42";
test(
  "command reads public PR without forum login; terminal opens linked PR, pages files, restores forum and refreshes without mutations",
  { timeout: 30000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "ddv-pr-pty-")),
      term = new headless.Terminal({
        cols: 120,
        rows: 36,
        allowProposedApi: true,
      });
    let child, server;
    try {
      const preload = join(directory, "github-fixture.mjs"),
        log = join(directory, "requests.jsonl"),
        empty = join(directory, "empty");
      await mkdir(empty);
      const summary = {
        number: 42,
        title: "Retry safely",
        state: "open",
        changed_files: 21,
        additions: 10,
        deletions: 2,
        user: { login: "dev" },
        head: { label: "dev:retry", sha: "a".repeat(40) },
        base: { label: "example:main" },
        body: "A public PR inspected from the terminal.",
      };
      await writeFile(
        preload,
        `import{appendFileSync}from'node:fs';const original=globalThis.fetch;let summaries=0;globalThis.fetch=async(input,options)=>{if(!String(input).startsWith('https://api.github.com/'))return original(input,options);appendFileSync(${JSON.stringify(log)},JSON.stringify({url:String(input),method:options.method,auth:!!options.headers.Authorization})+'\\n');const files=String(input).includes('/files?');const summary=${JSON.stringify(summary)};if(!files&&++summaries>1)summary.title+=' (refreshed)';return new Response(JSON.stringify(files?[{filename:String(input).endsWith('page=2')?'src/last-file.ts':'src/retry.ts',status:'modified',additions:10,deletions:2}]:summary),{headers:{'content-type':'application/json'}});};`,
      );
      const bin =
        process.env.CLI_TEST_BIN ||
        fileURLToPath(new URL("../bin/devdevian.mjs", import.meta.url));
      const env = {
        ...process.env,
        NODE_OPTIONS: "--import " + pathToFileURL(preload).href,
        DEVDEVIAN_CONFIG_DIR: empty,
      };
      const output = await run(
        process.execPath,
        [bin, "github", "pr", url, "--json"],
        { env, cwd: directory },
      );
      assert.equal(JSON.parse(output.stdout).pull.title, "Retry safely");
      await writeFile(log, "");
      let writes = 0;
      const post = {
        id: 7,
        user_id: 1,
        title: "Review source conversation",
        name: "Fixture",
        kind: "discussion",
        body: "Context for a linked public pull request.",
        github_context: {
          repository: "https://github.com/example/project",
          branch: "main",
          commit: "b".repeat(40),
          path: "src/retry.ts",
          mode: "unstaged",
          pull_request: url,
        },
        replies: [],
        reply_pagination: { page: 1, pages: 1, total: 0 },
      };
      server = createServer((req, res) => {
        if (req.method !== "GET") writes++;
        const path = new URL(req.url, "http://fixture").pathname;
        let data =
          path === "/api/me"
            ? { user: { id: 1, username: "fixture" } }
            : path === "/api/notifications"
              ? { items: [], unread_count: 0 }
              : path === "/api/posts/7"
                ? post
                : {
                    items: [post],
                    pagination: { page: 1, pages: 1, total: 1 },
                  };
        res.setHeader("content-type", "application/json");
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
      child = spawn(
        "python3",
        [
          fileURLToPath(new URL("./terminal-driver.py", import.meta.url)),
          process.execPath,
          bin,
          "tui",
          "--no-live",
        ],
        {
          cwd: directory,
          env: {
            ...env,
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
      child.stderr.on("data", (c) => (raw += c));
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
        throw Error(
          "Missing " + text + "\n" + screen() + "\n" + raw.slice(-500),
        );
      };
      const send = async (input) => {
        await delay(100);
        child.stdin.write(JSON.stringify({ input }) + "\n");
      };
      const openPR = async () => {
        await send("\x0b");
        await wait("QUICK ACTIONS");
        await send("Read linked GitHub PR");
        await send("\r");
      };
      await wait(post.title);
      await send("\r");
      await wait("GITHUB CONTEXT");
      await openPR();
      await wait("PR #42");
      await wait("src/retry.ts");
      await send("]");
      await wait("src/last-file.ts");
      await wait("Page 2/2");
      await send("\r");
      await wait("PR #42");
      await send("\x1b");
      await wait(post.title);
      await openPR();
      await wait("PR #42");
      const before = (await readFile(log, "utf8")).trim().split("\n").length;
      assert.equal(before, 3);
      await send("R");
      await wait("(refreshed)");
      await wait("src/retry.ts");
      term.resize(60, 18);
      child.stdin.write(JSON.stringify({ resize: [60, 18] }) + "\n");
      await delay(250);
      await send("\x1b[6~");
      assert.equal(term.buffer.active.baseY, 0);
      await send("\x1b");
      await wait(post.title);
      const requests = (await readFile(log, "utf8"))
        .trim()
        .split("\n")
        .map(JSON.parse);
      assert.equal(requests.length, 5);
      assert.ok(requests.every((r) => r.method === "GET" && !r.auth));
      assert.equal(writes, 0);
    } finally {
      child?.kill();
      term.dispose();
      if (server) await new Promise((r) => server.close(r));
      await rm(directory, { recursive: true, force: true });
    }
  },
);
