import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import headless from "@xterm/headless";
import { startTestServer } from "../../../tests/http-fixture.mjs";
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
test(
  "terminal quick actions, step validation, shared publication and searchable resumable reply reading",
  { timeout: 40000 },
  async () => {
    const f = await startTestServer(),
      directory = await mkdtemp(join(tmpdir(), "ddv-workflow-pty-"));
    let child;
    const term = new headless.Terminal({
      cols: 120,
      rows: 36,
      allowProposedApi: true,
    });
    try {
      const author = f.client(),
        other = f.client(),
        anon = f.client();
      await author("/register", {
        name: "Workflow Author",
        username: "workflow_author",
        email: "author@workflow.test",
        password: "Fixture-password123",
      });
      await other("/register", {
        name: "Helpful Developer",
        username: "helpful_developer",
        email: "other@workflow.test",
        password: "Fixture-password123",
      });
      const post = (
        await author("/posts", {
          title: "A useful workflow question",
          body: "How do you keep long technical conversations readable?",
          topic: "web",
          kind: "question",
        })
      ).data;
      const longBody = Array.from({ length: 70 }, (_, i) =>
        i === 24 || i === 49
          ? "Checkpoint: retry with an idempotency key."
          : "Paragraph " +
            String(i + 1).padStart(2, "0") +
            " explains one small design choice.",
      ).join("\n");
      const reply = (
        await other(`/posts/${post.id}/replies`, { body: longBody })
      ).data;
      const device = (
        await anon("/cli/device", { name: "Workflow terminal test" })
      ).data;
      await author("/cli/authorize", {
        user_code: device.user_code,
        approved: true,
      });
      const token = (
        await anon("/cli/token", { device_code: device.device_code })
      ).data.access_token;
      await writeFile(
        join(directory, "credentials.json"),
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
        ],
        {
          cwd: directory,
          env: {
            ...process.env,
            DEVDEVIAN_CONFIG_DIR: directory,
            DEVDEVIAN_TEST_COLUMNS: "120",
            DEVDEVIAN_TEST_ROWS: "36",
            FORCE_COLOR: "3",
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
        throw Error(
          "Missing " + text + "\n" + screen() + "\n" + raw.slice(-500),
        );
      };
      const send = async (input) => {
        await delay(100);
        child.stdin.write(JSON.stringify({ input }) + "\n");
      };
      const command = async (value) => {
        await send("/");
        await send(value);
        await send("\r");
      };
      await wait(post.title);
      await send("\x0b");
      await wait("QUICK ACTIONS");
      await send("Ask a question");
      await send("\r");
      await wait("Step 1/2");
      await send("\x0e");
      await wait("Title needs at least");
      await send("Terminal wizard publishes one question");
      await send("\x0e");
      await wait("Step 2/2");
      await send(
        "This question was written through the new staged terminal form.",
      );
      await send("\x10");
      await wait("Step 1/2");
      await send("\x0e");
      await wait("Step 2/2");
      await wait("This question was written");
      await send("\x13");
      await wait("Preview");
      assert.equal(
        (await author("/posts?q=Terminal%20wizard")).data.length,
        0,
        "preview does not publish",
      );
      await send("\x1b[C");
      await send("\r");
      await wait("Saved.");
      const shared = (await other("/posts?q=Terminal%20wizard")).data;
      assert.equal(shared.length, 1);
      assert.match(
        (await other("/posts/" + shared[0].id)).data.body,
        /staged terminal form/,
      );
      await command("/actions");
      await wait("QUICK ACTIONS");
      await send("Create a project");
      await send("\r");
      await wait("Step 1/4");
      await wait("Next: Story");
      await send("Form navigation project");
      await send("\x0e");
      await wait("Step 2/4");
      await send("A project demonstrating clear terminal forms and links.");
      await send("\t");
      await wait("Text and links are allowed");
      await wait("Enter adds a line");
      await send("Review");
      await send(" ");
      await send("https://example.com/design");
      await send("\r");
      await send("Focus on reliability.");
      await send("\x0e");
      await wait("Step 3/4");
      await send("https://example.com/project");
      await send("\t"); // Source URL: optional.
      await send("\t"); // Team: optional.
      await send("\t");
      await wait("One per line: Label");
      await send("Docs | https://example.com/docs");
      await send("\r");
      await send("Demo | https://example.com/demo");
      await send("\t"); // Focus Next instead of silently changing steps.
      await wait("›[ Next: Images");
      await send("\x1b[D");
      await send("\r"); // Back keeps all link values.
      await wait("Step 2/4");
      await send("\x0e");
      await wait("Step 3/4");
      await wait("https://example.com/project");
      await send("\x0e");
      await wait("Step 4/4");
      await send("\t"); // Screenshot paths.
      await send("\t"); // Preview button.
      await wait("›[ Preview");
      await send("\r");
      await wait("Preview · Create a project");
      assert.equal(
        (await other("/projects?q=Form%20navigation")).data.length,
        0,
      );
      await send("\x1b[C");
      await send("\r");
      await wait("Request for feedback");
      const projects = (await other("/projects?q=Form%20navigation")).data;
      assert.equal(projects.length, 1);
      const project = (await other("/projects/" + projects[0].id)).data;
      assert.equal(
        project.help,
        "Review https://example.com/design\nFocus on reliability.",
      );
      assert.equal(project.url, "https://example.com/project");
      assert.deepEqual(project.links, [
        { label: "Docs", url: "https://example.com/docs" },
        { label: "Demo", url: "https://example.com/demo" },
      ]);
      await command("/open " + post.id);
      await wait(post.title);
      await send("\x1b[C");
      await wait("Helpful Developer");
      await send(" ");
      await wait("Full text");
      await wait("Paragraph 01");
      await send("/");
      await send("idempotency");
      await send("\r");
      await wait("2 matching lines");
      await wait("Checkpoint: retry");
      await send("n");
      await delay(200);
      assert.ok(
        screen().includes("Lines 50"),
        "next match reaches later paragraph",
      );
      await send("\x1b");
      await send(" ");
      await wait("Full text");
      await wait("Lines 50");
      await send("\x0b");
      await wait("QUICK ACTIONS");
      await send("delete");
      assert.ok(
        !screen().includes("Delete your reply"),
        "another account reply is not deletable",
      );
      await send("\x1b");
      await wait("Full text");
      await send("\x1b[H");
      await wait("Paragraph 01");
      await send("\x1b[F");
      await wait("Paragraph 70");
      await send("\x1b");
      await send("\r");
      await wait("Reply thread");
      await send(" ");
      await wait("Full text");
      await wait("Paragraph 70");
      await send("\x1b");
      await send("\x1b");
      await send("\x1b");
      await wait("Form navigation project");
      term.resize(60, 18);
      child.stdin.write(JSON.stringify({ resize: [60, 18] }) + "\n");
      await delay(200);
      await send("\x0b");
      await wait("QUICK ACTIONS");
      await send("projects");
      await send("\r");
      await wait("Projects");
      assert.equal(term.buffer.active.baseY, 0);
      await send("n");
      await wait("Step 1/4");
      await send("Compact project");
      await send("\x0e");
      await wait("Step 2/4");
      await send("Enough context for a compact terminal project.");
      await send("\r");
      await send("line2");
      await wait("line2");
      assert.equal(term.buffer.active.baseY, 0);
      await send("\x03");
      assert.ok(reply.id);
    } finally {
      child?.kill();
      term.dispose();
      await f.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
