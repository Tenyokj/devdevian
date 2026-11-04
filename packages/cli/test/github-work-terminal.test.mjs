import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { openDatabase } from "../../../database.mjs";
import { sealToken } from "../../../github-app-core.mjs";
import { fileURLToPath } from "node:url";
import headless from "@xterm/headless";
import { startTestServer } from "../../../tests/http-fixture.mjs";
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
test(
  "real terminal previews a private GitHub task PR, preserves explicit consent, reads exact checks and imports an issue through the installed command",
  { timeout: 30000 },
  async () => {
    const f = await startTestServer({
        serverEntry: "tests/github-work-provider.mjs",
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
      const community = (
        await api("/communities", {
          name: "Terminal GitHub team",
          description: "Private fixture team.",
        })
      ).data;
      const project = (
        await api("/projects", {
          name: "Terminal Orbit",
          repo: "https://github.com/example/repo",
          community_id: community.id,
          description: "One room for real terminal work.",
          topic: "web",
          stage: "Prototype",
          help: "Keep a clear retry owner.",
        })
      ).data.id;
      const post = (
        await api("/posts", {
          kind: "question",
          community_id: community.id,
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
      const user = (await api("/me")).data.user;
      const db = await openDatabase({
        DB_PATH: f.path,
        DB_DRIVER: process.env.DB_DRIVER || "",
      });
      db.prepare(
        "INSERT INTO github_connections(user_id,subject,login,access,refresh,expires,refresh_expires) VALUES(?,?,?,?,?,?,?)",
      ).run(
        user.id,
        100,
        "fixture-owner",
        sealToken("ghu_fixture", user.id, "a".repeat(64)),
        sealToken("ghr_fixture", user.id, "a".repeat(64)),
        Date.now() + 3600000,
        Date.now() + 7200000,
      );
      db.close();
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
      await wait("Public feed");
      await command("/room " + project);
      await wait("Terminal Orbit · Room");
      await wait("Available to pick up");
      await send("\x0b");
      await send("Link GitHub PR / contribution");
      await send("\r");
      await wait("GitHub pull request URL");
      await send("https://github.com/example/repo/pull/5");
      await send("\t");
      await send("\t");
      await send("SHARE");
      await send("\x13");
      await wait("GITHUB SOURCE · Private");
      await wait("Fix the retry deadline");
      assert.equal(
        (await api(`/projects/${project}/room/tasks/${post}/github`)).data
          .binding,
        null,
      );
      await send("\x1b[C");
      await send("\r");
      await wait("Saved to the project room.");
      assert.equal(
        (await api(`/projects/${project}/room/tasks/${post}/github`)).data
          .binding.version,
        1,
      );
      await send("\x0b");
      await send("GitHub task context and checks");
      await send("\r");
      await wait("Task · GitHub context");
      await wait("tests · success");
      await send("\x1b");
      const bin =
        process.env.CLI_TEST_BIN ||
        fileURLToPath(new URL("../bin/devdevian.mjs", import.meta.url));
      const result = spawnSync(
        process.execPath,
        [
          bin,
          "room",
          "import",
          String(project),
          "https://github.com/example/repo/issues/4",
          "--share-private",
          "--yes",
          "--json",
        ],
        {
          env: { ...process.env, DEVDEVIAN_CONFIG_DIR: dir },
          encoding: "utf8",
          timeout: 10000,
        },
      );
      assert.equal(result.status, 0, result.stderr);
      assert.ok(JSON.parse(result.stdout).post_id);
      assert.equal(
        (await api(`/projects/${project}/room/tasks`)).data.pagination.total,
        2,
      );
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
