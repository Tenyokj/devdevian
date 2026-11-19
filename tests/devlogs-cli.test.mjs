import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { startTestServer } from "./http-fixture.mjs";
test("script CLI drafts and publishes a Devlog shared with the browser API", async (t) => {
  const f = await startTestServer();
  t.after(() => f.close());
  const api = f.client();
  await api("/register", {
    name: "devlog_cli",
    username: "devlog_cli",
    email: "devlogcli@fixture.test",
    password: "Fixture-password123",
  });
  const p = (
    await api("/projects", {
      name: "CLI Journal",
      description: "A project with a clear development story.",
      topic: "web",
      stage: "Prototype",
      help: "Review the retry logic.",
    })
  ).data;
  const anon = f.client(),
    device = (await anon("/cli/device", { name: "Devlogs test" })).data;
  await api("/cli/authorize", { user_code: device.user_code, approved: true });
  const token = (await anon("/cli/token", { device_code: device.device_code }))
    .data.access_token;
  const dir = join(f.directory, "cli");
  await mkdir(dir);
  await writeFile(
    join(dir, "credentials.json"),
    JSON.stringify({ origin: f.base, token }),
    { mode: 0o600 },
  );
  const cli = async (...args) =>
    JSON.parse(
      (
        await promisify(execFile)(
          process.execPath,
          [
            process.env.CLI_TEST_BIN ||
              join(process.cwd(), "packages/cli/bin/devdevian.mjs"),
            ...args,
            "--json",
          ],
          {
            env: { ...process.env, DEVDEVIAN_CONFIG_DIR: dir },
            cwd: f.directory,
          },
        )
      ).stdout,
    );
  const draft = await cli(
    "devlog",
    "create",
    String(p.id),
    "--title",
    "A focused progress update",
    "--body",
    "We simplified retries and wrote a clear verification guide.",
    "--yes",
  );
  assert.equal(draft.devlog.status, "draft");
  assert.equal(
    (await f.client()(`/projects/${p.id}/devlogs`)).data.items.length,
    0,
  );
  assert.equal(
    (await cli("devlogs", String(p.id), "--status", "draft")).items[0].id,
    draft.id,
  );
  const published = await cli(
    "devlog",
    "publish",
    String(p.id),
    String(draft.id),
    "--yes",
  );
  assert.equal(published.devlog.status, "published");
  assert.equal(
    (await cli("devlog", "open", String(p.id), String(draft.id))).title,
    "A focused progress update",
  );
  assert.equal(
    (await f.client()(`/projects/${p.id}/devlogs`)).data.items[0].id,
    draft.id,
  );
});
