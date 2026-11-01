import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import headless from "@xterm/headless";
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
test(
  "live project workspace opens immutable history, previews selected code and preserves stale revision draft",
  { timeout: 30000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "ddv-project-ui-")),
      term = new headless.Terminal({
        cols: 120,
        rows: 36,
        allowProposedApi: true,
      });
    const pagination = { page: 1, pages: 1, total: 1 },
      calls = [];
    const post = {
      id: 42,
      user_id: 1,
      revision: 2,
      name: "Ada",
      kind: "review",
      title: "Orbit retry review",
      body: "Check the retry boundary.",
      code: "export const retry = false;",
      review_focus: "Check the bounded retry behavior.",
      replies: [],
      reply_pagination: pagination,
    };
    const snapshot = {
      id: 7,
      post_id: 42,
      number: 1,
      created: "2026-11-01 10:00:00",
      review_focus: "Original retry boundary.",
      code: "export const retry = true;",
      files: [
        {
          path: "retry.ts",
          code: "export const retry = true;",
          start_line: 1,
          end_line: 1,
        },
      ],
    };
    let child, mutation;
    const server = createServer(async (req, res) => {
      calls.push(req.url);
      const url = new URL(req.url, "http://fixture");
      let data = { items: [], pagination };
      if (url.pathname === "/api/me")
        data = { user: { id: 1, username: "ada" } };
      else if (url.pathname === "/api/projects/3/workspace")
        data = {
          project: { id: 3, name: "Orbit workspace", user_id: 1 },
          counts: { total: 1, open: 1 },
          permissions: { manage_requests: true },
          capabilities: { work_requests: 1 },
        };
      else if (url.pathname === "/api/projects/3/work-requests")
        data = {
          items: [
            {
              id: 42,
              title: post.title,
              kind: "review",
              state: "open",
              author_name: "Ada",
              excerpt: post.body,
            },
          ],
          pagination,
          capabilities: { work_requests: 1 },
        };
      else if (url.pathname === "/api/posts/42") data = post;
      else if (url.pathname === "/api/posts/42/revisions/7") data = snapshot;
      else if (
        url.pathname === "/api/posts/42/revisions" &&
        req.method === "POST"
      ) {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        mutation = JSON.parse(Buffer.concat(chunks));
        res.statusCode = 409;
        data = {
          error: "Another revision was published. Your draft is unchanged.",
        };
      } else if (url.pathname === "/api/posts/42/revisions")
        data = {
          items: [snapshot],
          current_revision_id: 8,
          post_revision: 2,
          capabilities: { review_revisions: 1 },
          pagination,
        };
      else if (url.pathname === "/api/posts/42/code-reviews")
        data = {
          items: [
            {
              id: 5,
              user_id: 2,
              body: "Original concern",
              name: "Grace",
              outdated: true,
              snapshot_id: 7,
              snapshot_available: true,
              quote: snapshot.code,
              start_line: 1,
              end_line: 1,
            },
          ],
          pagination,
          snippet_hash: createHash("sha256").update(post.code).digest("hex"),
          revision_id: 8,
          post_revision: 2,
          files: [{ path: "retry.ts", start_line: 1, end_line: 1 }],
        };
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
      await writeFile(
        join(dir, "retry.ts"),
        "export const selectedUpdate = 3;",
      );
      child = spawn(
        "python3",
        [
          fileURLToPath(new URL("./terminal-driver.py", import.meta.url)),
          process.execPath,
          fileURLToPath(new URL("../bin/devdevian.mjs", import.meta.url)),
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
      await command("/workspace 3");
      await wait("Orbit workspace");
      await wait("Orbit retry review");
      await send("\r");
      await wait("Original concern");
      await send("b");
      await wait("Revision v1");
      await wait("export const retry = true;");
      await send("\x1b");
      await wait("Original concern");
      await send("h");
      await wait("Review revisions");
      await send("\r");
      await wait("Revision v1");
      await command("/revision 42");
      await wait("Code file / Git diff");
      await send("retry.ts");
      await send("\x13");
      await wait("selectedUpdate");
      assert.ok(!mutation, "Preview must not write");
      await send("\x1b[C");
      await send("\r");
      await wait("Another revision was published");
      assert.equal(mutation.base_revision_id, 8);
      assert.equal(mutation.expected_revision, 2);
      assert.deepEqual(mutation.files, [
        { path: "retry.ts", code: "export const selectedUpdate = 3;" },
      ]);
      assert.ok(
        screen().includes("selectedUpdate"),
        "Conflict retains exact preview",
      );
      term.resize(60, 18);
      child.stdin.write(JSON.stringify({ resize: [60, 18] }) + "\n");
      await delay(300);
      assert.equal(term.buffer.active.baseY, 0);
      assert.ok(calls.includes("/api/posts/42/revisions/7"));
    } finally {
      child?.kill();
      term.dispose();
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
      await rm(dir, { recursive: true, force: true });
    }
  },
);
