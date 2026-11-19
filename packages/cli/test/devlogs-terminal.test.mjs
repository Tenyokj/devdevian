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
  "live Devlogs draft composer, reader and context actions share real API state",
  { timeout: 30000 },
  async () => {
    const f = await startTestServer(),
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
      const project = (
        await api("/projects", {
          name: "Terminal Orbit",
          description: "One room for real terminal work.",
          topic: "web",
          stage: "Prototype",
          help: "Keep a clear retry owner.",
        })
      ).data.id;
      const post = (
        await api("/posts", {
          kind: "question",
          topic: "web",
          title: "Inspect the retry owner",
          body: "Keep retries under a clear deadline.",
        })
      ).data.id;
      await api(
        `/projects/${project}/work-requests/${post}`,
        { state: "open", expected_version: 0 },
        "PUT",
      );
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
      await command("/devlog " + project);
      await wait("Update (Markdown)");
      await send("Terminal progress update");
      await send("\t");
      await send("A calmer retry boundary, verified by our test suite.");
      await send("\x13");
      await wait("DEVLOG PREVIEW");
      assert.equal(
        (await api(`/projects/${project}/devlogs?status=draft`)).data.items
          .length,
        0,
      );
      await send("\x1b[C");
      await send("\r");
      await wait("Draft saved. Only you can read it.");
      await wait("Terminal progress update");
      assert.equal(
        (await api(`/projects/${project}/devlogs?status=draft`)).data.items
          .length,
        1,
      );
      await send("\r");
      await wait("A calmer retry boundary");
      await send("\x1b");
      await send("X");
      await wait("Publish this draft");
      await send("\x1b");
      await command("/devlogs " + project);
      await wait("Project Devlogs");
      term.resize(60, 18);
      child.stdin.write(JSON.stringify({ resize: [60, 18] }) + "\n");
      await delay(250);
      assert.equal(term.buffer.active.baseY, 0);
    } finally {
      child?.kill();
      term.dispose();
      await f.close();
    }
  },
);
