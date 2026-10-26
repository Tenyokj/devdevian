import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { cliSessionKey } from "../cli-auth.mjs";
import { startTestServer } from "./http-fixture.mjs";

test("CLI device flow is single-use, scoped, revocable and bound to the current password", async () => {
  const fixture = await startTestServer(),
    browser = fixture.client(),
    anon = fixture.client(),
    intruder = fixture.client();
  try {
    const account = await browser("/register", {
      name: "CLI Author",
      username: "cli_author",
      email: "author@cli.test",
      password: "Fixture-password123",
    });
    assert.equal(account.status, 200);
    assert.equal(
      (
        await intruder("/register", {
          name: "Other User",
          username: "cli_other",
          email: "other@cli.test",
          password: "Fixture-password123",
        })
      ).status,
      200,
    );
    const begin = await anon("/cli/device", { name: "Test terminal" });
    assert.equal(begin.status, 201);
    const device = begin.data;
    assert.equal((await anon("/cli/device/" + device.user_code)).status, 401);
    assert.equal(
      (await anon("/cli/token", { device_code: device.device_code })).status,
      202,
    );
    assert.equal(
      (
        await browser("/cli/authorize", {
          user_code: device.user_code,
          approved: true,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await intruder("/cli/authorize", {
          user_code: device.user_code,
          approved: true,
        })
      ).status,
      409,
    );
    const exchange = await anon("/cli/token", {
      device_code: device.device_code,
    });
    assert.equal(exchange.status, 200);
    const token = exchange.data.access_token;
    const headers = { Authorization: "Bearer " + token };
    assert.equal(
      (await anon("/me", null, "GET", headers)).data.user.id,
      account.data.user.id,
    );
    assert.equal(
      (await anon("/cli/token", { device_code: device.device_code })).status,
      410,
    );
    const db = new DatabaseSync(fixture.path);
    assert.equal(
      db.prepare("SELECT 1 FROM sessions WHERE token=?").get(token),
      undefined,
    );
    assert.ok(
      db
        .prepare("SELECT 1 FROM sessions WHERE token=?")
        .get(cliSessionKey(token)),
    );
    assert.equal(
      (
        await anon("/me", null, "GET", {
          Cookie: "devdevian_demo_session=" + cliSessionKey(token),
        })
      ).status,
      401,
    );
    const sessions = (await browser("/cli/sessions")).data.items;
    assert.equal(sessions.length, 1);
    assert.ok(!("session_token" in sessions[0]));
    const denied = await anon("/cli/device", { name: "Denied terminal" });
    assert.equal(
      (
        await anon(
          "/cli/authorize",
          { user_code: denied.data.user_code, approved: true },
          "POST",
          headers,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await browser("/cli/authorize", {
          user_code: denied.data.user_code,
          approved: false,
        })
      ).status,
      200,
    );
    assert.equal(
      (await anon("/cli/token", { device_code: denied.data.device_code }))
        .status,
      403,
    );
    assert.equal(
      (await intruder("/cli/sessions/" + sessions[0].id, {}, "DELETE")).status,
      404,
    );
    assert.equal(
      (await browser("/cli/sessions/" + sessions[0].id, {}, "DELETE")).status,
      200,
    );
    assert.equal((await anon("/me", null, "GET", headers)).status, 401);
    const expired = await anon("/cli/device", { name: "Expired terminal" });
    db.prepare("UPDATE cli_devices SET expires=0 WHERE user_code=?").run(
      expired.data.user_code,
    );
    assert.equal(
      (
        await browser("/cli/authorize", {
          user_code: expired.data.user_code,
          approved: true,
        })
      ).status,
      409,
    );
    assert.equal(
      (await anon("/cli/token", { device_code: expired.data.device_code }))
        .status,
      410,
    );
    const stale = await anon("/cli/device", {
      name: "Password change terminal",
    });
    assert.equal(
      (
        await browser("/cli/authorize", {
          user_code: stale.data.user_code,
          approved: true,
        })
      ).status,
      200,
    );
    db.prepare("UPDATE users SET password=? WHERE id=?").run(
      "different-password-hash",
      account.data.user.id,
    );
    assert.equal(
      (await anon("/cli/token", { device_code: stale.data.device_code }))
        .status,
      409,
    );
    db.close();
  } finally {
    await fixture.close();
  }
});

test("packaged CLI authenticates through browser approval and shares real API data with the web client", async () => {
  const fixture = await startTestServer(),
    browser = fixture.client(),
    other = fixture.client(),
    configDir = join(fixture.directory, "credentials");
  const bin = resolve(
    process.env.CLI_TEST_BIN || "packages/cli/bin/devdevian.mjs",
  );
  const env = {
    ...process.env,
    DEVDEVIAN_CONFIG_DIR: configDir,
    NO_COLOR: "1",
  };
  const run = (args) =>
    new Promise((resolve, reject) => {
      const p = spawn(process.execPath, [bin, ...args], {
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "",
        stderr = "";
      p.stdout.on("data", (c) => (stdout += c));
      p.stderr.on("data", (c) => (stderr += c));
      p.once("error", reject);
      p.once("exit", (code) => resolve({ code, stdout, stderr }));
    });
  let login;
  try {
    const account = await browser("/register", {
      name: "Terminal Builder",
      username: "terminal_builder",
      email: "terminal@cli.test",
      password: "Fixture-password123",
    });
    assert.equal(account.status, 200);
    assert.equal(
      (
        await other("/register", {
          name: "Human Reviewer",
          username: "human_reviewer",
          email: "reviewer@cli.test",
          password: "Fixture-password123",
        })
      ).status,
      200,
    );
    login = spawn(
      process.execPath,
      [bin, "login", "--host", fixture.base, "--no-open"],
      { env, stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "",
      error = "";
    let exitCode = null;
    const exited = new Promise((r) =>
      login.once("exit", (c) => {
        exitCode = c;
        r(c);
      }),
    );
    login.stderr.on("data", (c) => (error += c));
    const code = await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(Error("Login did not print a code: " + error)),
        10000,
      );
      login.stdout.on("data", (c) => {
        output += c;
        const m = output.match(/Confirm code: ([A-F0-9]{10})/);
        if (m) {
          clearTimeout(timeout);
          resolve(m[1]);
        }
      });
      login.once("exit", () => {
        clearTimeout(timeout);
        reject(Error("CLI exited before approval: " + error));
      });
    });
    assert.equal(
      (await browser("/cli/authorize", { user_code: code, approved: true }))
        .status,
      200,
    );
    assert.equal(await exited, 0, error);
    assert.match(output, /Connected/);
    assert.doesNotMatch(output, /ddv_/);
    const saved = JSON.parse(
      await readFile(join(configDir, "credentials.json"), "utf8"),
    );
    assert.equal(saved.origin, fixture.base);
    assert.equal(
      (await stat(join(configDir, "credentials.json"))).mode & 0o777,
      0o600,
    );
    let result = await run(["whoami", "--json"]);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).user.username, "terminal_builder");
    assert.notEqual(
      (await run(["whoami", "--host", "https://example.test"])).code,
      0,
    );
    const file = join(fixture.directory, "retry.ts");
    await writeFile(
      file,
      "async function retry() {\n  return await request();\n}\n",
    );
    result = await run([
      "review",
      "create",
      "--file",
      file,
      "--lines",
      "1:3",
      "--title",
      "Please review this retry function",
      "--focus",
      "Error handling and retry behavior.",
      "--body",
      "This function runs inside a server-side worker.",
      "--topic",
      "web",
      "--yes",
      "--json",
    ]);
    assert.equal(result.code, 0, result.stderr);
    const post = JSON.parse(result.stdout);
    const web = await browser("/posts/" + post.id);
    assert.equal(web.status, 200);
    assert.match(web.data.code, /async function retry/);
    const notesUrl = `/posts/${post.id}/code-reviews`,
      hash = (await other(notesUrl)).data.snippet_hash;
    const note = await other(notesUrl, {
      snippet_hash: hash,
      start_line: 2,
      end_line: 2,
      body: "Please handle the request timeout here.",
    });
    assert.equal(note.status, 201);
    result = await run(["review", "list", String(post.id), "--json"]);
    assert.equal(JSON.parse(result.stdout).items[0].id, note.data.id);
    result = await run([
      "review",
      "reply",
      String(post.id),
      String(note.data.id),
      "--body",
      "I will add a deadline and bounded retries.",
      "--yes",
      "--json",
    ]);
    assert.equal(result.code, 0, result.stderr);
    assert.match(
      (await other(notesUrl + "/" + note.data.id + "/replies")).data[0].body,
      /deadline/,
    );
    result = await run([
      "review",
      "resolve",
      String(post.id),
      String(note.data.id),
      "--json",
    ]);
    assert.equal(result.code, 0, result.stderr);
    assert.equal((await other(notesUrl)).data.items[0].resolved, 1);
    result = await run([
      "reply",
      String(post.id),
      "--body",
      "A normal conversation reply from the terminal.",
      "--yes",
      "--json",
    ]);
    assert.equal(result.code, 0, result.stderr);
    assert.ok(
      (await other("/posts/" + post.id + "/replies")).data.some((r) =>
        r.body.includes("terminal"),
      ),
    );
    result = await run([
      "ask",
      "--title",
      "How do I bound retry attempts?",
      "--body",
      "I need a bounded retry strategy for failed requests.",
      "--topic",
      "web",
      "--json",
    ]);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /Interactive input needs a terminal/);
    assert.equal(
      (await browser("/posts")).data.length,
      1,
      "Cancelled CLI publication must not create a post.",
    );
    const privateSpace = await other("/communities", {
      name: "Private reviewers",
      description: "A private space that the CLI owner has not joined.",
    });
    result = await run([
      "ask",
      "--title",
      "An unauthorized private publication",
      "--body",
      "This should not appear in this private community.",
      "--topic",
      "web",
      "--community",
      String(privateSpace.data.id),
      "--yes",
      "--json",
    ]);
    assert.notEqual(result.code, 0);
    result = await run(["inbox", "--json"]);
    assert.equal(result.code, 0, result.stderr);
    assert.ok(
      JSON.parse(result.stdout).items.some(
        (n) => n.code_review_id === note.data.id,
      ),
    );
    result = await run(["logout"]);
    assert.equal(result.code, 0, result.stderr);
    assert.equal((await browser("/cli/sessions")).data.items.length, 0);
    assert.notEqual((await run(["whoami"])).code, 0);
  } finally {
    if (login && login.exitCode === null) login.kill();
    await fixture.close();
  }
});
