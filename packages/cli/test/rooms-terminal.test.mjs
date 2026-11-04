import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import headless from "@xterm/headless";
import { startTestServer } from "../../../tests/http-fixture.mjs";
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
test(
  "live Rooms claim, move, pin and read history with real API and remain bounded after resize",
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
        await send(text);
        await send("\r");
      };
      await wait("Inspect the retry owner");
      await command("/room " + project);
      await wait("Terminal Orbit · Room");
      await wait("Available to pick up");
      await send("X");
      await wait("Pick up task");
      await send("\x1b[B");
      await send("\r");
      await wait("Pick up task ·");
      assert.equal(
        (await api(`/projects/${project}/room/tasks/${post}`)).data.task
          .assignee_id,
        null,
      );
      await send("\x1b[C");
      await send("\r");
      await wait("Room task updated.");
      assert.ok(
        (await api(`/projects/${project}/room/tasks/${post}`)).data.task
          .assignee_id,
      );
      await send("X");
      await wait("Move to in progress");
      await send("\x1b[B".repeat(2));
      await send("\r");
      await wait("state task ·");
      await send("\x1b[C");
      await send("\r");
      await wait("in progress · question");
      assert.equal(
        (await api(`/projects/${project}/room/tasks/${post}`)).data.task.state,
        "in_progress",
      );
      await command("/decisions " + project);
      await wait("Pinned decisions");
      await wait("0 items");
      // Wait for the completed navigation frame before entering a new command.
      await delay(250);
      await command("/pin");
      await wait("Why this matters");
      await send("A single retry owner");
      await send("\t");
      await send("Stop permanent failures and use a bounded deadline.");
      await send("\x13");
      await wait("ROOM CHANGE");
      assert.equal(
        (await api(`/projects/${project}/room/decisions`)).data.pagination
          .total,
        0,
      );
      await send("\x1b[C");
      await send("\r");
      await wait("Saved to the project room.");
      assert.equal(
        (await api(`/projects/${project}/room/decisions`)).data.pagination
          .total,
        1,
      );
      await send("\r");
      await wait("Decision history");
      await wait("A single retry owner");
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
