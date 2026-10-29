import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdtemp,
  writeFile,
  readFile,
  rm,
  mkdir,
  readdir,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import headless from "@xterm/headless";
const delay = (ms) => new Promise((r) => setTimeout(r, ms)),
  run = promisify(execFile);
test(
  "PR diff command and live file/hunk selection publish only after preview, preserve snapshot drafts and fit compact terminals",
  { timeout: 45000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "ddv-pr-diff-")),
      term = new headless.Terminal({
        cols: 120,
        rows: 36,
        allowProposedApi: true,
      });
    let child, server;
    const writes = [];
    try {
      const config = join(directory, "config"),
        empty = join(directory, "empty"),
        preload = join(directory, "github.mjs");
      await mkdir(config);
      await mkdir(empty);
      const url = "https://github.com/example/project/pull/42",
        patch =
          "@@ -1 +1 @@\n-old first\n+new first\n@@ -10 +10 @@\n-old second\n+new second";
      const summary = {
        number: 42,
        title: "Fix retries",
        state: "open",
        changed_files: 2,
        head: { ref: "retry", sha: "a".repeat(40) },
        base: { sha: "b".repeat(40) },
      };
      const files = [
        {
          filename: "src/retry.ts",
          status: "modified",
          additions: 2,
          deletions: 2,
          patch,
        },
        { filename: "image.png", status: "added", additions: 0, deletions: 0 },
      ];
      await writeFile(
        preload,
        `const original=fetch;globalThis.fetch=async(url,options)=>{if(!String(url).startsWith('https://api.github.com/'))return original(url,options);if(options.headers.Authorization||options.method!=='GET')throw Error('Unexpected GitHub mutation/credential');return new Response(JSON.stringify(String(url).includes('/files?')?${JSON.stringify(files)}:${JSON.stringify(summary)}),{headers:{'content-type':'application/json'}})};`,
      );
      const bin =
        process.env.CLI_TEST_BIN ||
        fileURLToPath(new URL("../bin/devdevian.mjs", import.meta.url));
      const env = {
        ...process.env,
        NODE_OPTIONS: "--import " + pathToFileURL(preload).href,
        DEVDEVIAN_CONFIG_DIR: empty,
      };
      const diff = JSON.parse(
        (
          await run(
            process.execPath,
            [bin, "github", "diff", url, "--file", "src/retry.ts", "--json"],
            { env, cwd: directory },
          )
        ).stdout,
      );
      assert.equal(diff.patch.hunks.length, 2);
      server = createServer(async (req, res) => {
        const path = new URL(req.url, "http://fixture").pathname;
        let data = { items: [], pagination: { page: 1, pages: 1, total: 0 } };
        if (req.method === "POST") {
          let body = "";
          for await (const chunk of req) body += chunk;
          const payload = JSON.parse(body);
          writes.push(payload);
          data = { id: 77, ...payload, user_id: 1 };
        } else if (path === "/api/me")
          data = { user: { id: 1, username: "fixture" } };
        else if (path === "/api/topics")
          data = [{ id: "web", name: "Web development" }];
        else if (path === "/api/notifications")
          data = { items: [], unread_count: 0 };
        else if (path === "/api/posts/77")
          data = {
            id: 77,
            ...writes.at(-1),
            github_context: writes.at(-1)?.details?.github_context,
          };
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(data));
      });
      await new Promise((r) => server.listen(0, "127.0.0.1", r));
      await writeFile(
        join(config, "credentials.json"),
        JSON.stringify({
          origin: `http://127.0.0.1:${server.address().port}`,
          token: "ddv_" + "a".repeat(43),
        }),
        { mode: 0o600 },
      );
      // Script mode uses the same selection contract and explicitly confirms via --yes.
      const cli = await run(
        process.execPath,
        [
          bin,
          "github",
          "review",
          url,
          "--file",
          "src/retry.ts",
          "--hunks",
          "2",
          "--title",
          "Selected PR change",
          "--topic",
          "web",
          "--focus",
          "Review retry behaviour",
          "--body",
          "Please review the second retry change.",
          "--yes",
          "--json",
        ],
        { env: { ...env, DEVDEVIAN_CONFIG_DIR: config }, cwd: directory },
      );
      assert.equal(JSON.parse(cli.stdout).id, 77);
      assert.match(writes[0].code, /new second/);
      assert.doesNotMatch(writes[0].code, /new first/);
      assert.equal(writes[0].details.github_context.hunk_start, 2);
      writes.length = 0;
      const start = () =>
        spawn(
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
              DEVDEVIAN_CONFIG_DIR: config,
              DEVDEVIAN_TEST_COLUMNS: "120",
              DEVDEVIAN_TEST_ROWS: "36",
              TERM: "xterm-256color",
              FORCE_COLOR: "3",
            },
            stdio: ["pipe", "pipe", "pipe"],
          },
        );
      child = start();
      let raw = "";
      const attach = () => {
        child.stdout.on("data", (c) => {
          raw += c;
          term.write(c);
        });
        child.stderr.on("data", (c) => (raw += c));
      };
      attach();
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
          "Missing " + text + "\n" + screen() + "\n" + raw.slice(-300),
        );
      };
      const send = async (input) => {
        await delay(100);
        child.stdin.write(JSON.stringify({ input }) + "\n");
      };
      await wait("Public feed");
      await send("/");
      await send("/pr " + url);
      await send("\r");
      await wait("PR #42");
      await send("f");
      await wait("PR changed files");
      await send("\x1b[B");
      await send("\r");
      await wait("did not provide a text patch");
      await send("c");
      await delay(150);
      assert.equal(writes.length, 0);
      await send("\x1b");
      await wait("PR changed files");
      await send("\x1b[A");
      await send("\r");
      await wait("Hunk 1/2");
      await send(" ");
      await send("]");
      await wait("selected 1–2");
      await wait("new second");
      term.resize(60, 18);
      child.stdin.write(JSON.stringify({ resize: [60, 18] }) + "\n");
      await delay(200);
      assert.equal(term.buffer.active.baseY, 0);
      await wait("Hunk 2/2");
      await send("c");
      await wait("Request a code review");
      await send("\x0e");
      await wait("Review focus");
      await send("Check retry failures carefully.");
      await send("\x13");
      await wait("Preview");
      assert.equal(writes.length, 0, "No write before confirmation");
      // The draft stores only the explicit selection and can be restored without reading local files.
      await delay(1300);
      const scopes = await readdir(join(config, "drafts"));
      let saved;
      for (const scope of scopes)
        for (const name of await readdir(join(config, "drafts", scope)))
          if (name.endsWith(".json"))
            saved = JSON.parse(
              await readFile(join(config, "drafts", scope, name), "utf8"),
            );
      assert.equal(saved.form.prSelection.context.mode, "pr");
      assert.match(saved.form.prSelection.code, /new first/);
      child.kill();
      await new Promise((r) => child.once("exit", r));
      term.resize(120, 36);
      term.reset();
      await writeFile(
        preload,
        `const original=fetch;globalThis.fetch=async(url,options)=>{if(String(url).startsWith('https://api.github.com/'))throw Error('Draft restoration must not fetch GitHub');return original(url,options)};`,
      );
      child = start();
      attach();
      await wait("Public feed");
      await send("/");
      await send("/drafts");
      await send("\r");
      await wait("Local drafts");
      await send("\r");
      await wait("Request a code review");
      await send("\x13");
      await wait("Preview");
      assert.equal(writes.length, 0);
      await send("\x1b[C");
      await send("\r");
      await wait("Saved. Your web account");
      assert.equal(writes.length, 1);
      assert.match(writes[0].code, /new first/);
      assert.match(writes[0].code, /new second/);
      assert.equal(writes[0].details.github_context.hunk_end, 2);
      assert.equal(
        writes[0].details.github_context.base_commit,
        "b".repeat(40),
      );
      assert.equal(term.buffer.active.baseY, 0);
    } finally {
      child?.kill();
      term.dispose();
      if (server) await new Promise((r) => server.close(r));
      await rm(directory, { recursive: true, force: true });
    }
  },
);
