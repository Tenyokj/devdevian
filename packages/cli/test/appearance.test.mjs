import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  writeFile,
  readFile,
  readdir,
  lstat,
  symlink,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  defaultAppearance,
  normalizeAppearance,
  appearanceFlags,
  loadAppearance,
  saveAppearance,
} from "../lib/appearance.mjs";
import { themeFor } from "../lib/theme.mjs";
import { markdownRows } from "../lib/rich-text.mjs";

const luminance = (hex) => {
  const rgb = hex
    .slice(1)
    .match(/../g)
    .map((v) => parseInt(v, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};
const ratio = (a, b) =>
  (Math.max(luminance(a), luminance(b)) + 0.05) /
  (Math.min(luminance(a), luminance(b)) + 0.05);

test("every theme/accent keeps body, selection and status text readable and styles Markdown consistently", () => {
  for (const theme of [
    "midnight",
    "nebula",
    "daylight",
    "contrast",
    "halloween",
  ])
    for (const accent of ["blue", "violet", "cyan", "rose", "orange"]) {
      const c = themeFor({ theme, accent });
      for (const role of ["text", "muted", "blue", "purple", "green", "red"])
        for (const surface of ["bg", "panel", "selected"])
          assert.ok(
            ratio(c[role], c[surface]) >= 4.5,
            `${theme}/${accent} ${role} on ${surface}: ${ratio(c[role], c[surface])}`,
          );
      const rows = markdownRows("# Header\n```js\nreturn 42;\n```", 80, c);
      assert.equal(rows[0].color, c.purple);
      assert.ok(
        rows.some((row) =>
          row.spans?.some(
            (span) => span.text === "return" && span.color === c.purple,
          ),
        ),
      );
    }
  assert.throws(
    () => normalizeAppearance({ theme: "../token" }),
    /Invalid theme/,
  );
  assert.throws(
    () => normalizeAppearance({ token: "secret" }),
    /Unknown appearance/,
  );
  assert.deepEqual(
    appearanceFlags({ "review-layout": "stacked", theme: "daylight" }),
    { theme: "daylight", reviewLayout: "stacked" },
  );
});

test("local appearance is atomic, survives restart and leaves credentials and corrupt files untouched", async () => {
  const directory = await mkdtemp(join(tmpdir(), "devdevian-appearance-")),
    env = { DEVDEVIAN_CONFIG_DIR: directory },
    file = join(directory, "appearance.json");
  try {
    assert.deepEqual((await loadAppearance(env)).settings, defaultAppearance);
    await writeFile(join(directory, "credentials.json"), "credential sentinel");
    await saveAppearance({ theme: "daylight", density: "compact" }, env);
    assert.equal((await loadAppearance(env)).settings.theme, "daylight");
    assert.equal((await loadAppearance(env)).settings.density, "compact");
    assert.equal(
      await readFile(join(directory, "credentials.json"), "utf8"),
      "credential sentinel",
    );
    if (process.platform !== "win32")
      assert.equal((await lstat(file)).mode & 0o777, 0o600);
    assert.ok(
      !(await readdir(directory)).some((name) =>
        name.startsWith(".appearance-"),
      ),
    );
    await writeFile(file, "{bad json");
    assert.ok((await loadAppearance(env)).warning);
    assert.equal(await readFile(file, "utf8"), "{bad json");
    await writeFile(file, JSON.stringify({ version: 999, settings: {} }));
    assert.ok((await loadAppearance(env)).warning);
    await saveAppearance(defaultAppearance, env);
    assert.equal((await loadAppearance(env)).warning, "");
    await rm(file);
    await symlink(join(directory, "credentials.json"), file);
    assert.ok((await loadAppearance(env)).warning);
    await saveAppearance(defaultAppearance, env);
    assert.equal(
      await readFile(join(directory, "credentials.json"), "utf8"),
      "credential sentinel",
    );
    const alias = join(directory, "alias");
    await symlink(directory, alias, "dir");
    await assert.rejects(
      saveAppearance(defaultAppearance, { DEVDEVIAN_CONFIG_DIR: alias }),
      /real directory/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("appearance commands work offline without login and validate updates before writing", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "devdevian-appearance-command-"),
  );
  const bin =
    process.env.CLI_TEST_BIN ||
    fileURLToPath(new URL("../bin/devdevian.mjs", import.meta.url));
  const run = (args) =>
    spawnSync(process.execPath, [bin, "appearance", ...args], {
      env: { ...process.env, DEVDEVIAN_CONFIG_DIR: directory },
      encoding: "utf8",
    });
  try {
    assert.equal(
      run([
        "--theme",
        "daylight",
        "--accent",
        "violet",
        "--review-layout",
        "stacked",
      ]).status,
      0,
    );
    assert.equal(JSON.parse(run(["--json"]).stdout).theme, "daylight");
    const before = await readFile(join(directory, "appearance.json"), "utf8");
    assert.notEqual(run(["--theme", "missing"]).status, 0);
    assert.equal(
      await readFile(join(directory, "appearance.json"), "utf8"),
      before,
    );
    assert.equal(run(["--reset"]).status, 0);
    assert.deepEqual(JSON.parse(run([]).stdout), defaultAppearance);
    assert.ok(!(await readdir(directory)).includes("credentials.json"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
