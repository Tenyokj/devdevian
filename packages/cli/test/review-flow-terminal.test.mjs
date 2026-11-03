import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import headless from "@xterm/headless";
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
test(
  "live assigned reviews confirm acceptance and publish an outcome for the captured snapshot without scrollback",
  { timeout: 30000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "ddv-flow-terminal-")),
      term = new headless.Terminal({
        cols: 120,
        rows: 36,
        allowProposedApi: true,
      });
    let child, mutation;
    const pagination = { page: 1, pages: 1, total: 1 },
      row = {
        id: 7,
        post_id: 42,
        reviewer_id: 1,
        requester_id: 2,
        reviewer_name: "Ada",
        reviewer_username: "ada",
        post_title: "A bounded retry review",
        snapshot_id: 9,
        revision_number: 1,
        state: "pending",
        version: 1,
        message: "Please inspect the retry boundary.",
      };
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, "http://fixture");
      let data = { items: [], pagination };
      if (url.pathname === "/api/me")
        data = { user: { id: 1, username: "ada" } };
      else if (url.pathname === "/api/review-flow")
        data = {
          items:
            url.searchParams.get("section") === "waiting" &&
            row.state !== "pending"
              ? []
              : [row],
          pagination,
          capabilities: { review_flow: 1 },
        };
      else if (url.pathname === "/api/posts/42")
        data = {
          id: 42,
          user_id: 2,
          revision: 1,
          kind: "review",
          title: row.post_title,
          body: "The current code is a newer version.",
          code: "export const retry = true;",
        };
      else if (url.pathname === "/api/posts/42/review-flow")
        data = {
          items: [row],
          pagination,
          capabilities: { review_flow: 1 },
          permissions: { invite: false },
          current_revision_id: 10,
          post_revision: 1,
        };
      else if (
        req.method === "PATCH" &&
        url.pathname === "/api/posts/42/review-flow/7"
      ) {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const body = JSON.parse(Buffer.concat(chunks));
        assert.equal(body.expected_version, 1);
        row.state = "accepted";
        row.version = 2;
        data = row;
      } else if (
        req.method === "POST" &&
        url.pathname === "/api/posts/42/review-flow/7/outcome"
      ) {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        mutation = JSON.parse(Buffer.concat(chunks));
        row.state = "completed";
        row.verdict = mutation.verdict;
        row.outcome_body = mutation.body;
        data = row;
      }
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(data));
    });
    try {
      await new Promise((r) => server.listen(0, "127.0.0.1", r));
      await writeFile(
        join(dir, "credentials.json"),
        JSON.stringify({
          origin: `http://127.0.0.1:${server.address().port}`,
          token: "ddv_" + "a".repeat(43),
        }),
        { mode: 0o600 },
      );
      const bin =
        process.env.CLI_TEST_BIN ||
        fileURLToPath(new URL("../bin/devdevian.mjs", import.meta.url));
      child = spawn(
        "python3",
        [
          fileURLToPath(new URL("./terminal-driver.py", import.meta.url)),
          process.execPath,
          bin,
          "tui",
          "--no-live",
          "--welcome",
          "off",
        ],
        {
          cwd: dir,
          env: {
            ...process.env,
            DEVDEVIAN_CONFIG_DIR: dir,
            DEVDEVIAN_TEST_COLUMNS: "120",
            DEVDEVIAN_TEST_ROWS: "36",
            TERM: "xterm-256color",
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
        for (let i = 0; i < 120; i++) {
          if (screen().includes(text)) return;
          await delay(50);
        }
        throw Error("Missing " + text + "\n" + screen() + raw.slice(-300));
      };
      const send = async (input) => {
        await delay(140);
        child.stdin.write(JSON.stringify({ input }) + "\n");
      };
      const command = async (text) => {
        await send("/");
        await send(text);
        await send("\r");
      };
      await wait("Public feed");
      await command("/assigned");
      await wait("Please inspect the retry boundary.");
      await send("x");
      await wait("Accept review");
      await send("\x1b[B\x1b[B");
      await send("\r");
      await wait("accept review request #7");
      await send("\x1b[C");
      await send("\r");
      await command("/assigned accepted");
      await wait("In review");
      await send("x");
      await wait("Share review outcome");
      await send("\x1b[B\x1b[B\x1b[B");
      await send("\r");
      await wait("Outcome context");
      await send("\t");
      await send("The original version needs a permanent-error guard.");
      await send("\x13");
      await wait("EXACT REVIEW REQUEST");
      assert.equal(mutation, undefined);
      await send("\x1b[C");
      await send("\r");
      await wait("Changes requested");
      assert.equal(
        mutation.revision_id,
        9,
        "Outcome stays on assigned v1, not current snapshot10",
      );
      assert.equal(mutation.expected_version, 2);
      term.resize(60, 18);
      child.stdin.write(JSON.stringify({ resize: [60, 18] }) + "\n");
      await delay(300);
      assert.equal(term.buffer.active.baseY, 0);
    } finally {
      child?.kill();
      term.dispose();
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
      await rm(dir, { recursive: true, force: true });
    }
  },
);
