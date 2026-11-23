import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import headless from "@xterm/headless";
import { startTestServer } from "../../../tests/http-fixture.mjs";
import { seedInsights } from "../../../tests/insights-fixture.mjs";
import { openDatabase } from "../../../database.mjs";
import { liveId, liveURL } from "../lib/live-sessions.mjs";
const run = promisify(execFile),
  delay = (ms) => new Promise((r) => setTimeout(r, ms));
test("Live IDs reject paths, queries and terminal-control input", () => {
  for (const id of ["../me", "1", "a?x=1", "\x1b[31m"])
    assert.throws(() => liveId(id));
  assert.equal(
    liveURL("https://example.com", "01234567-1234-1234-1234-0123456789ab"),
    "https://example.com/app#live/01234567-1234-1234-1234-0123456789ab",
  );
});
test(
  "installed-style CLI and real terminal create, list, inspect, invite and continue with explicit preview and current permissions",
  { timeout: 60000 },
  async (t) => {
    const f = await startTestServer();
    t.after(() => f.close());
    const s = await seedInsights(f);
    const db = await openDatabase({ DB_PATH: f.path });
    db.prepare("UPDATE users SET username='livepeer' WHERE id=?").run(s.other);
    db.close();
    const anon = f.client(),
      device = (await anon("/cli/device", { name: "Live terminal fixture" }))
        .data;
    await s.a("/cli/authorize", {
      user_code: device.user_code,
      approved: true,
    });
    const token = (
      await anon("/cli/token", { device_code: device.device_code })
    ).data.access_token;
    const dir = join(f.directory, "config");
    await mkdir(dir);
    await writeFile(
      join(dir, "credentials.json"),
      JSON.stringify({ origin: f.base, token }),
      { mode: 0o600 },
    );
    await writeFile(join(f.directory, "retry.ts"), "const retry = 4;\n");
    await writeFile(
      join(f.directory, ".env"),
      "SYNTHETIC_NOT_A_SECRET=fixture",
    );
    const bin =
        process.env.CLI_TEST_BIN ||
        fileURLToPath(new URL("../bin/devdevian.mjs", import.meta.url)),
      env = { ...process.env, DEVDEVIAN_CONFIG_DIR: dir };
    const cli = async (args) =>
      JSON.parse(
        (
          await run(process.execPath, [bin, ...args, "--json"], {
            env,
            cwd: f.directory,
            timeout: 10000,
          })
        ).stdout,
      );
    await assert.rejects(
      () =>
        cli([
          "live",
          "create",
          String(s.publicId),
          "--file",
          "retry.ts",
          "--title",
          "No silent changes",
        ]),
      /Interactive input/,
    );
    assert.equal((await s.a("/live")).data.items.length, 0);
    await assert.rejects(
      () =>
        cli([
          "live",
          "create",
          String(s.publicId),
          "--file",
          ".env",
          "--title",
          "Do not read credentials",
          "--yes",
        ]),
      /credential/,
    );
    const op = crypto.randomUUID(),
      args = [
        "live",
        "create",
        String(s.publicId),
        "--file",
        "retry.ts",
        "--title",
        "Terminal retry session",
        "--operation",
        op,
        "--yes",
      ];
    const created = await cli(args);
    assert.equal((await cli(args)).id, created.id);
    await cli([
      "live",
      "invite",
      created.id,
      "--username",
      "livepeer",
      "--role",
      "viewer",
      "--yes",
    ]);
    assert.equal(
      (await s.b(`/live/${created.id}`)).data.session.role,
      "viewer",
    );
    assert.equal(
      (await cli(["live", "project", String(s.publicProject)])).items[0].id,
      created.id,
    );
    assert.equal(
      (await cli(["live", "show", created.id])).code,
      "const retry = 4;\n",
    );
    assert.equal(
      (await cli(["live", "open", created.id, "--no-open"])).url,
      f.base + "/app#live/" + created.id,
    );
    const snapshot = (await s.a(`/live/${created.id}`)).data;
    await s.a(`/live/${created.id}/close`, {
      summary: "Terminal snapshot saved",
      expected_revision: snapshot.session.revision,
    });
    const continued = await cli([
      "live",
      "continue",
      created.id,
      "--title",
      "Next terminal step",
      "--yes",
    ]);
    assert.equal((await s.a(`/live/${continued.id}`)).data.members.length, 1);
    const term = new headless.Terminal({
      cols: 120,
      rows: 36,
      allowProposedApi: true,
    });
    const child = spawn(
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
        cwd: f.directory,
        env: {
          ...env,
          TERM: "xterm-256color",
          FORCE_COLOR: "3",
          DEVDEVIAN_TEST_COLUMNS: "120",
          DEVDEVIAN_TEST_ROWS: "36",
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    t.after(() => {
      child.kill();
      term.dispose();
    });
    let raw = "";
    child.stdout.on("data", (c) => {
      raw += c;
      term.write(c);
    });
    child.stderr.on("data", (c) => (raw += c));
    const screen = () =>
      Array.from(
        { length: term.rows },
        (_, i) => term.buffer.active.getLine(i)?.translateToString(true) || "",
      ).join("\n");
    const wait = async (text) => {
      for (let i = 0; i < 120; i++) {
        if (screen().includes(text)) return;
        await delay(50);
      }
      throw Error(
        "Missing " + text + "\n" + screen() + "\n" + raw.slice(-1000),
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
    await wait("Public feed");
    await command("/live " + s.publicProject);
    await wait("Terminal retry session");
    await wait("Invited sessions only");
    await command("/session " + continued.id);
    await wait("Next terminal step");
    await send("\r");
    await wait("const retry = 4");
    await send("\x1b");
    await send("\x0b");
    await send("Invite participant");
    await send("\r");
    await wait("Permanent username");
    await send("livepeer");
    await send("\x13");
    await wait("LIVE SESSION PREVIEW");
    await wait("Invited participants only");
    await send("\x1b[C");
    await send("\r");
    await wait("Live session updated");
    assert.equal(
      (await s.b(`/live/${continued.id}`)).data.session.role,
      "editor",
    );
    await command("/session " + created.id);
    await wait("Terminal retry session");
    await send("\x0b");
    await send("Continue from saved result");
    await send("\r");
    await wait("New session title");
    await send("\x13");
    await wait("Saved code (participants and chat are not copied)");
    await send("\x1b[C");
    await send("\r");
    await wait("Live session updated");
    await command("/live-create " + s.publicId);
    await wait("File inside this project");
    await send("\t");
    await send("retry.ts");
    await send("\x13");
    await wait("LIVE SESSION PREVIEW");
    await wait("const retry = 4");
    await send("\x1b[C");
    await send("\r");
    await wait("Live session updated");
    assert.equal((await s.a("/live")).data.pagination.total, 4);
    await send("\x03");
    assert.ok(raw.includes("\x1b[?1049h"), "alternate screen");
  },
);
