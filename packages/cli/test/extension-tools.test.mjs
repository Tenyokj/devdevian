import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  initExtension,
  packExtension,
  serveExtension,
} from "../lib/extension-tools.mjs";
import { validateCommand } from "../lib/sdk/package.mjs";
test("extension scaffold/pack is standalone, refuses overwrite and never bundles secrets or escaping imports", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ddv-sdk-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dir = join(root, "my-tools");
  await initExtension(dir);
  await assert.rejects(initExtension(dir));
  const first = await packExtension(dir),
    pkg = JSON.parse(await readFile(first.output, "utf8"));
  assert.equal(pkg.manifest.schema, 2);
  assert.ok(pkg.manifest.permissions.includes("ui.commands"));
  assert.match(pkg.manifest.files["main.js"], /commands.register/);
  await writeFile(join(dir, ".env"), "TOP_SECRET");
  await writeFile(join(dir, "main.js"), 'import "./.env";');
  await assert.rejects(packExtension(dir));
  await writeFile(join(root, "outside.js"), 'throw Error("MUST NOT RUN")');
  await symlink(join(root, "outside.js"), join(dir, "escape.js"));
  await writeFile(join(dir, "main.js"), 'import "./escape.js";');
  await assert.rejects(packExtension(dir));
});
test("SDK commands restrict shortcut space and contain no arbitrary event subscriptions", () => {
  assert.equal(
    validateCommand({
      id: "notes.open",
      title: "Open notes",
      shortcut: "Alt+Shift+N",
    }).id,
    "notes.open",
  );
  for (const shortcut of ["Meta+K", "Ctrl+W", "A", "Alt+N", "Alt+Shift+F12"])
    assert.throws(() => validateCommand({ id: "test", title: "Hi", shortcut }));
  assert.throws(() =>
    validateCommand({
      id: "test",
      title: "\u001b[31m",
      shortcut: "Alt+Shift+H",
    }),
  );
});
