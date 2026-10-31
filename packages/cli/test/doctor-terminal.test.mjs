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
const run = promisify(execFile);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test(
  "doctor command and live starter stay read-only, preserve credentials and fit compact terminals",
  { timeout: 30000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "ddv-doctor-"));
    const term = new headless.Terminal({
      cols: 120,
      rows: 36,
      allowProposedApi: true,
    });
    const calls = [];
    let child;
    const server = createServer((req, res) => {
      calls.push({
        method: req.method,
        path: req.url,
        auth: req.headers.authorization,
      });
      const path = new URL(req.url, "http://fixture").pathname;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify(
          path === "/api/health"
            ? { ok: true, version: "0.1.8" }
            : path === "/api/me"
              ? {
                  user: {
                    id: 1,
                    username: "fixture",
                    email: "private@example.test",
                  },
                }
              : {
                  items: [],
                  unread_count: 0,
                  pagination: { page: 1, pages: 1 },
                },
        ),
      );
    });
    try {
      await new Promise((r) => server.listen(0, "127.0.0.1", r));
      const origin = `http://127.0.0.1:${server.address().port}`;
      const token = "ddv_" + "a".repeat(43);
      const credentials = JSON.stringify({ origin, token });
      const file = join(directory, "credentials.json");
      await writeFile(file, credentials, { mode: 0o600 });
      const env = { ...process.env, DEVDEVIAN_CONFIG_DIR: directory };
      const bin =
        process.env.CLI_TEST_BIN ||
        fileURLToPath(new URL("../bin/devdevian.mjs", import.meta.url));
      const json = JSON.parse(
        (
          await run(process.execPath, [bin, "doctor", "--json"], {
            env,
            cwd: directory,
          })
        ).stdout,
      );
      assert.equal(json.ok, true);
      assert.equal(calls.length, 2);
      assert.equal(calls[0].auth, undefined);
      assert.equal(calls[1].auth, "Bearer " + token);
      assert.doesNotMatch(JSON.stringify(json), /ddv_|private@example/);
      const offline = await run(
        process.execPath,
        [bin, "doctor", "--offline"],
        { env, cwd: directory },
      );
      assert.match(offline.stdout, /Offline mode/);
      assert.equal(calls.length, 2);
      assert.equal(await readFile(file, "utf8"), credentials);
      await writeFile(file, '{"secret":"' + token + '", BROKEN');
      await assert.rejects(
        run(process.execPath, [bin, "doctor", "--offline", "--json"], {
          env,
          cwd: directory,
        }),
        (error) => {
          assert.equal(error.code, 1);
          assert.equal(JSON.parse(error.stdout).ok, false);
          assert.doesNotMatch(error.stdout + error.stderr, /ddv_|BROKEN/);
          return true;
        },
      );
      await writeFile(file, credentials);
      const start = () =>
        spawn(
          "python3",
          [
            fileURLToPath(new URL("./terminal-driver.py", import.meta.url)),
            process.execPath,
            bin,
            "tui",
            "--host",
          origin,
          "--start",
            "--no-live",
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
      child = start();
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
        throw Error(
          "Missing " + text + "\n" + screen() + "\n" + raw.slice(-200),
        );
      };
      const send = async (input) => {
        await delay(100);
        child.stdin.write(JSON.stringify({ input }) + "\n");
      };
      await wait("YOUR FIRST FEW MINUTES");
      await send("\x1b[B");
      await send("\x1b[B");
      await send("\x1b[B");
      await send("\r");
      await wait("Connection check");
      await wait("active Devdevian session");
      await send("\x1b");
      await wait("YOUR FIRST FEW MINUTES");
      term.resize(60, 18);
      child.stdin.write(JSON.stringify({ resize: [60, 18] }) + "\n");
      await delay(250);
      assert.equal(term.buffer.active.baseY, 0);
      await send("\x1b[B");
      await wait("5. Learn the keyboard controls");
      await send("\r");
      await wait("/doctor");
      await send("\x1b");
      await wait("YOUR FIRST FEW MINUTES");
      await send("/");
      await send("/doctor");
      await send("\r");
      await wait("Connection check");
      await delay(250);
      assert.doesNotMatch(screen(), /private@example|ddv_/);
      assert.equal(term.buffer.active.baseY, 0);
      assert.ok(calls.every((c) => c.method === "GET"));
      assert.equal(await readFile(file, "utf8"), credentials);
      child.kill();
      await new Promise((r) => child.once("exit", r));
      await rm(file);
      term.resize(120, 36);
      term.reset();
      child = start();
      child.stdout.on("data", (c) => {
        raw += c;
        term.write(c);
      });
      child.stderr.on("data", (c) => {
        raw += c;
      });
      await wait("Sign in with your existing");
      await send("d");
      await wait("Connection check");
      await wait("This terminal is not signed in");
      await send("\x1b");
      await wait("Sign in with your existing");
      assert.ok(calls.every((c) => c.method === "GET"));
      await assert.rejects(readFile(file), { code: "ENOENT" });
    } finally {
      child?.kill();
      term.dispose();
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
      await rm(directory, { recursive: true, force: true });
    }
  },
);
