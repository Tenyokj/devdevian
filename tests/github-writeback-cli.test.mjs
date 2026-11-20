import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { startTestServer } from "./http-fixture.mjs";
import { seedWritebackConnection } from "./writeback-fixture.mjs";
import { DatabaseSync } from "node:sqlite";
import { createBackup, restoreBackup } from "../backup.mjs";
import { randomBytes } from "node:crypto";
test("script CLI prepares, confirms, reads and retries the same GitHub operation; encrypted restore preserves its claim", async (t) => {
  const f = await startTestServer({
    serverEntry: "tests/github-writeback-provider.mjs",
  });
  t.after(() => f.close());
  const api = f.client();
  await api("/register", {
    name: "Writeback cli",
    username: "writeback_cli",
    email: "wb-cli@fixture.test",
    password: "Fixture-password123",
  });
  const me = (await api("/me")).data.user;
  await seedWritebackConnection(f, me.id);
  const post = (
    await api("/posts", {
      kind: "question",
      topic: "web",
      title: "A controlled retry policy",
      body: "Respect cancellation and permanent failures.",
    })
  ).data;
  const anon = f.client(),
    device = (await anon("/cli/device", { name: "Writeback fixture" })).data;
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
            "github",
            "writeback",
            ...args,
            "--json",
          ],
          {
            cwd: f.directory,
            env: { ...process.env, DEVDEVIAN_CONFIG_DIR: dir },
          },
        )
      ).stdout,
    );
  const preview = await cli(
    "issue",
    String(post.id),
    "--target",
    "https://github.com/example/repo",
    "--title",
    "Use one retry deadline",
    "--body",
    "Avoid unbounded backoff and stop on cancellation.",
  );
  assert.equal(preview.state, "preview");
  assert.equal(preview.actor, "fixture-owner");
  const published = await cli("send", preview.id, "--yes");
  assert.equal(published.state, "sent");
  assert.equal(
    (await cli("send", preview.id, "--yes")).result_url,
    published.result_url,
  );
  assert.equal((await cli("list")).items.length, 1);
  assert.equal((await cli("status", preview.id)).state, "sent");
  const comment = await cli(
    "comment",
    String(post.id),
    "--target",
    "https://github.com/example/repo/pull/5",
    "--body",
    "Reviewed the cancellation boundary and accepted the fix.",
  );
  assert.equal(comment.kind, "comment");
  assert.equal(comment.state, "preview");
  const db = new DatabaseSync(f.path),
    output = join(f.directory, "writeback.ddb"),
    key = randomBytes(32).toString("hex"),
    target = join(f.directory, "restored");
  try {
    await createBackup({
      db,
      storage: {
        get: async () => {
          throw Error("No uploads expected");
        },
      },
      output,
      key,
    });
    await restoreBackup({ input: output, key, target });
    const restored = new DatabaseSync(join(target, "database.sqlite"));
    try {
      assert.equal(
        restored
          .prepare("SELECT state FROM github_writebacks WHERE id=?")
          .get(preview.id).state,
        "sent",
      );
      assert.equal(
        restored
          .prepare("SELECT state FROM github_writebacks WHERE id=?")
          .get(comment.id).state,
        "preview",
      );
    } finally {
      restored.close();
    }
  } finally {
    db.close();
  }
});
