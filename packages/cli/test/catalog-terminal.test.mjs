import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import headless from "@xterm/headless";
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
test(
  "catalog terminal navigates, filters, previews edits, joins events and exports a calendar without scrollback",
  { timeout: 30000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "ddv-catalog-pty-"));
    const project = {
      id: 7,
      user_id: 1,
      name: "Orbit Project",
      founder_name: "Ada",
      stage: "Idea",
      topic: "web",
      description: "A useful project built with the community.",
      help: "Please review the onboarding flow.",
      post_id: 42,
      revision: "rev1",
      team: [],
      links: [],
    };
    const event = {
      id: 9,
      user_id: 2,
      title: "Terminal Meetup",
      organizer_name: "Grace",
      timezone: "Asia/Shanghai",
      start_at: "2099-11-04T10:30:00Z",
      end_at: "2099-11-04T11:30:00Z",
      description: "Building developer tools together.",
      attendee_count: 0,
      viewer_attending: false,
      revision: 0,
    };
    const requests = [],
      writes = [];
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, "http://fixture"),
        path = url.pathname;
      requests.push(req.url);
      let body = "";
      for await (const part of req) body += part;
      if (path === "/api/uploads") {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ id: "image-1" }));
        return;
      }
      if (req.method !== "GET")
        writes.push({ path, method: req.method, body: JSON.parse(body) });
      let data;
      if (path === "/api/me") data = { user: { id: 1, username: "ada" } };
      else if (path === "/api/topics")
        data = [{ id: "web", name: "Web development" }];
      else if (path === "/api/projects/7") {
        if (req.method === "PATCH") Object.assign(project, JSON.parse(body));
        data = project;
      } else if (path === "/api/events/9/attendance") {
        event.viewer_attending = JSON.parse(body).attending;
        event.attendee_count = Number(event.viewer_attending);
        data = event;
      } else if (path === "/api/events/9/calendar") {
        res.end("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n");
        return;
      } else if (path === "/api/events/9") data = event;
      else
        data = {
          items:
            path === "/api/projects"
              ? [project]
              : path === "/api/events"
                ? [event]
                : [{ id: 42, title: "Welcome conversation", excerpt: "Hello" }],
          pagination: { page: 1, pages: 1, total: 1 },
        };
      res.setHeader("Content-Type", "application/json");
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
    await writeFile(
      join(directory, "logo.png"),
      Buffer.from("89504e470d0a1a0a00000000", "hex"),
    );
    const term = new headless.Terminal({
      cols: 140,
      rows: 38,
      allowProposedApi: true,
    });
    const child = spawn(
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
          DEVDEVIAN_TEST_COLUMNS: "140",
          DEVDEVIAN_TEST_ROWS: "38",
          FORCE_COLOR: "3",
          TERM: "xterm-256color",
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let raw = "";
    child.stdout.on("data", (c) => {
      raw += c;
      term.write(c.toString());
    });
    child.stderr.on("data", (c) => {
      raw += c;
    });
    const screen = () =>
      Array.from(
        { length: term.rows },
        (_, i) => term.buffer.active.getLine(i)?.translateToString(true) || "",
      ).join("\n");
    const wait = async (text) => {
      for (let i = 0; i < 100; i++) {
        if (screen().includes(text)) return;
        await delay(50);
      }
      throw Error("Missing " + text + "\n" + screen() + "\n" + raw.slice(-500));
    };
    const send = async (input) => {
      await delay(120);
      child.stdin.write(JSON.stringify({ input }) + "\n");
    };
    const command = async (value) => {
      await send("/");
      await send(value);
      await send("\r");
    };
    try {
      await wait("Welcome conversation");
      await command("/projects");
      await wait("Orbit Project");
      await send("f");
      await wait("Filter projects");
      await send("Orbit");
      await send("\x13");
      await wait("Orbit Project");
      assert.ok(requests.some((p) => p.includes("q=Orbit")));
      await send("\r");
      await wait("Request for feedback");
      await send("e");
      await wait("Edit your project");
      for (let i = 0; i < 13; i++) await send("\t");
      await send("\x0f");
      await wait("Enter preview image");
      await send("/");
      await send("logo.png");
      await send("\r");
      await send("\r");
      await wait("Image selected");
      await send("\r");
      await wait("Edit your project");
      await send("\x13");
      await wait("Orbit Project");
      await wait("Preview");
      assert.equal(writes.length, 0, "preview does not publish");
      await send("\x1b[C");
      await send("\r");
      await wait("Request for feedback");
      await command("/events");
      await wait("Terminal Meetup");
      await send("\r");
      await wait("Organizer time:");
      await send("j");
      await wait("Attend this event?");
      await send("\x1b[C");
      await send("\r");
      await wait("You're attending.");
      assert.equal(writes[0].method, "PATCH");
      assert.equal(writes[0].body.details.logo, "image-1");
      assert.equal(writes[1].path, "/api/events/9/attendance");
      assert.equal(writes[1].body.attending, true);
      await send("x");
      await wait("Export calendar .ics");
      await send("\x1b[B");
      await send("\r");
      await wait("Export calendar");
      await send("\x13");
      await wait("Calendar saved");
      assert.ok(
        (
          await readFile(join(directory, "devdevian-event-9.ics"), "utf8")
        ).startsWith("BEGIN:VCALENDAR"),
      );
      term.resize(60, 18);
      child.stdin.write(JSON.stringify({ resize: [60, 18] }) + "\n");
      await delay(250);
      assert.equal(term.buffer.active.baseY, 0);
      await send("\x03");
    } finally {
      child.kill();
      term.dispose();
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
      await rm(directory, { recursive: true, force: true });
    }
  },
);
