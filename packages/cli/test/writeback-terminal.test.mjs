import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import headless from "@xterm/headless";
import { startTestServer } from "../../../tests/http-fixture.mjs";
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
test(
  "live writeback previews the acting GitHub account and sends an immutable operation",
  { timeout: 30000 },
  async () => {
    const f = await startTestServer({
        serverEntry: "tests/github-writeback-provider.mjs",
      }),
      term = new headless.Terminal({
        cols: 120,
        rows: 36,
        allowProposedApi: true,
      });
    let child;
    try {
      const api = f.client();
      assert.equal(
        (
          await api("/register", {
            name: "room_terminal_owner",
            username: "room_terminal_owner",
            email: "roomterminal@fixture.test",
            password: "Fixture-password123",
          })
        ).status,
        200,
      );
      const post = (
        await api("/posts", {
          kind: "question",
          topic: "web",
          title: "Inspect the retry owner",
          body: "Keep retries under a clear deadline.",
        })
      ).data.id;
      const { seedWritebackConnection } = await import(
        "../../../tests/writeback-fixture.mjs"
      );
      const me = (await api("/me")).data.user;
      await seedWritebackConnection(f, me.id);
      const anon = f.client(),
        device = (await anon("/cli/device", { name: "Room PTY" })).data;
      await api("/cli/authorize", {
        user_code: device.user_code,
        approved: true,
      });
      const token = (
        await anon("/cli/token", { device_code: device.device_code })
      ).data.access_token;
      const dir = join(f.directory, "terminal-config");
      await mkdir(dir);
      await writeFile(
        join(dir, "credentials.json"),
        JSON.stringify({ origin: f.base, token }),
        { mode: 0o600 },
      );
      child = spawn(
        "python3",
        [
          fileURLToPath(new URL("./terminal-driver.py", import.meta.url)),
          process.execPath,
          process.env.CLI_TEST_BIN ||
            fileURLToPath(new URL("../bin/devdevian.mjs", import.meta.url)),
          "tui",
          "--no-live",
          "--welcome",
          "off",
        ],
        {
          env: {
            ...process.env,
            DEVDEVIAN_CONFIG_DIR: dir,
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
          "Missing " + text + "\n" + screen() + "\n" + raw.slice(-700),
        );
      };
      const send = async (input) => {
        await delay(100);
        child.stdin.write(JSON.stringify({ input }) + "\n");
      };
      const command = async (text) => {
        await send("/");
        if (text === "/pin") {
          // A pasted command and Enter can arrive in the same terminal frame.
          await send(text + "\r");
        } else {
          await send(text);
          await send("\r");
        }
      };
      await wait("Inspect the retry owner");
      await command("/writeback " + post + " issue");
      await wait("Repository URL");
      await send("https://github.com/example/repo");
      await send("\t");
      await send("\t");
      await send("Respect cancellation and use one retry deadline.");
      await send("\x13");
      await wait("GITHUB WRITEBACK");
      await wait("@fixture-owner");
      await wait("Respect cancellation");
      await send("\x1b[C");
      await send("\r");
      await wait("Published to GitHub:");
      const history = (await api("/github/writeback")).data.items;
      assert.equal(history.length, 1);
      assert.equal(history[0].state, "sent");
      await send("X");
      await wait("Create GitHub issue");
    } finally {
      child?.kill();
      term.dispose();
      await f.close();
    }
  },
);
