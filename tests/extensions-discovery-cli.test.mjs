import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, symlink } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { startTestServer } from "./http-fixture.mjs";
import { extensionPublication } from "../packages/cli/lib/extensions.mjs";
import { buildExtension } from "../scripts/extension-build.mjs";

test("CLI publishes inert packages with explicit confirmation; search and profiles expose only current public listings", async (t) => {
  const f = await startTestServer();
  t.after(() => f.close());
  const author = f.client(),
    guest = f.client();
  const account = await author("/register", {
    name: "Extension Author",
    username: "ext_author",
    email: "author@extension-cli.test",
    password: "Fixture-password123",
  });
  assert.equal(account.status, 200);
  const me = (await author("/me")).data.user;
  const device = (await guest("/cli/device", { name: "Extension terminal" }))
    .data;
  await author("/cli/authorize", {
    user_code: device.user_code,
    approved: true,
  });
  const token = (await guest("/cli/token", { device_code: device.device_code }))
    .data.access_token;
  const config = join(f.directory, "config");
  await mkdir(config, { mode: 0o700 });
  await writeFile(
    join(config, "credentials.json"),
    JSON.stringify({ origin: f.base, token }),
    { mode: 0o600 },
  );
  const { build, ...pkg } = await buildExtension(
    "examples/extensions/focus-desk",
  );
  const file = join(f.directory, "focus-desk.devext.json");
  await writeFile(file, JSON.stringify(pkg));
  const plan = await extensionPublication(file);
  assert.deepEqual(plan.payload, pkg);
  assert.match(plan.preview.sha256, /^[a-f0-9]{64}$/);
  assert.ok(plan.preview.files.includes("main.js"));
  const alias = join(f.directory, "alias.devext.json");
  await symlink(file, alias);
  await assert.rejects(extensionPublication(alias));
  const huge = join(f.directory, "huge.devext.json");
  await writeFile(huge, Buffer.alloc(262145));
  await assert.rejects(extensionPublication(huge), /256 KB/);
  await assert.rejects(extensionPublication(".env"), /built .devext.json/);
  const run = (args) =>
    new Promise((resolve, reject) => {
      const p = spawn(process.execPath, [resolveBin(), ...args], {
        env: { ...process.env, DEVDEVIAN_CONFIG_DIR: config },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let out = "",
        err = "";
      p.stdout.on("data", (c) => (out += c));
      p.stderr.on("data", (c) => (err += c));
      p.once("error", reject);
      p.once("exit", (code) => resolve({ code, out, err }));
    });
  const no = await run(["extensions", "publish", "--file", file]);
  assert.notEqual(no.code, 0);
  assert.equal(
    (await guest("/extensions/library?format=2")).data.items.length,
    0,
  );
  const yes = await run([
    "extensions",
    "publish",
    "--file",
    file,
    "--yes",
    "--json",
  ]);
  assert.equal(yes.code, 0, yes.err);
  const release = JSON.parse(yes.out);
  assert.equal(release.slug, "focus-desk");
  assert.equal(
    (await author("/extensions/me?format=2")).data.installed.length,
    0,
    "publishing never installs code",
  );
  const listed = await run([
    "extensions",
    "list",
    "--query",
    "focus",
    "--json",
  ]);
  assert.equal(listed.code, 0, listed.err);
  assert.equal(JSON.parse(listed.out).items[0].id, release.id);
  const mine = await run(["extensions", "mine", "--json"]);
  assert.equal(mine.code, 0, mine.err);
  assert.equal(JSON.parse(mine.out).published[0].id, release.id);
  const profile = await guest(`/extensions/authors/${me.id}`);
  assert.equal(profile.status, 200);
  assert.equal(profile.data[0].id, release.id);
  assert.equal(profile.data[0].manifest, undefined);
  const search = await guest("/search?type=extensions&q=productivity");
  assert.equal(search.status, 200);
  assert.equal(search.data[0].id, release.id);
  const newer = await author("/extensions/publish", {
    ...pkg,
    version: "1.0.1",
  });
  assert.equal(newer.status, 201);
  assert.equal(
    (await guest(`/extensions/authors/${me.id}`)).data.pagination.total,
    1,
  );
  assert.equal(
    (await guest("/search?type=extensions&q=focus")).data[0].id,
    newer.data.id,
  );
  assert.equal(
    (
      await author("/extensions/install", {
        release: release.id,
        acknowledge_unreviewed: true,
        granted_permissions: pkg.manifest.permissions,
      })
    ).status,
    200,
  );
  const availableUpdates = await run(["extensions", "updates", "--json"]);
  assert.equal(availableUpdates.code, 0, availableUpdates.err);
  assert.equal(JSON.parse(availableUpdates.out).items[0].from.id, release.id);
  const history = await run(["extensions", "history", "focus-desk", "--json"]);
  assert.equal(history.code, 0, history.err);
  assert.equal(JSON.parse(history.out).items.length, 2);
  const refusedUpdate = await run(["extensions", "update", release.id]);
  assert.notEqual(refusedUpdate.code, 0);
  const confirmedUpdate = await run([
    "extensions",
    "update",
    release.id,
    "--yes",
    "--json",
  ]);
  assert.equal(confirmedUpdate.code, 0, confirmedUpdate.err);
  assert.equal(JSON.parse(confirmedUpdate.out).installed[0].id, newer.data.id);
  const db = new DatabaseSync(f.path);
  try {
    db.prepare("UPDATE users SET privacy='hidden' WHERE id=?").run(me.id);
    assert.equal((await guest(`/extensions/authors/${me.id}`)).status, 404);
    assert.equal((await author(`/extensions/authors/${me.id}`)).status, 200);
    db.prepare(
      "UPDATE extension_releases SET review='withdrawn' WHERE id=?",
    ).run(Number(newer.data.id.slice(6)));
    assert.equal((await author(`/extensions/authors/${me.id}`)).data.length, 0);
    assert.equal(
      (await guest("/search?type=extensions&q=focus")).data.length,
      0,
      "withdrawn newest version never revives old releases",
    );
  } finally {
    db.close();
  }
});
function resolveBin() {
  return resolve(process.env.CLI_TEST_BIN || "packages/cli/bin/devdevian.mjs");
}
