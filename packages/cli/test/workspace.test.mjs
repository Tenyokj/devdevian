import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
  stat,
  chmod,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import {
  workspaceRoot,
  listFiles,
  readCodeFile,
  selectLines,
  listChanges,
  readDiff,
  reviewSource,
  sensitivePath,
} from "../lib/workspace.mjs";
import { DraftStore } from "../lib/drafts.mjs";
const git = (root, ...args) =>
  execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "devdevian-workspace-"));
  git(root, "init", "-q");
  git(root, "config", "user.name", "Fixture");
  git(root, "config", "user.email", "fixture@example.test");
  return root;
}
test("file selection respects project boundaries, Git ignores, symlinks, secrets and UTF-8 limits", async () => {
  const root = await fixture();
  try {
    await mkdir(join(root, "src"));
    await mkdir(join(root, "node_modules"));
    await writeFile(
      join(root, ".gitignore"),
      "ignored.txt\n*.log\n!useful.log\n",
    );
    for (const name of [
      "ignored.txt",
      "debug.log",
      "useful.log",
      ".hidden",
      ".env",
      ".env.local",
      "private.key",
      "regular.txt",
    ])
      await writeFile(join(root, name), "hello developer\n");
    await symlink(join(root, "regular.txt"), join(root, "link.txt"));
    await writeFile(join(root, "binary.bin"), Buffer.from([0, 0xff, 1]));
    const visible = (await listFiles(root)).map((f) => f.name);
    assert.ok(visible.includes("src"));
    assert.ok(visible.includes("regular.txt"));
    assert.ok(visible.includes("useful.log"));
    for (const name of [
      "ignored.txt",
      "debug.log",
      ".hidden",
      ".env",
      "private.key",
      "link.txt",
      "node_modules",
      ".git",
    ])
      assert.ok(!visible.includes(name), name);
    const hidden = (await listFiles(root, ".", { hidden: true })).map(
      (f) => f.name,
    );
    assert.ok(hidden.includes(".hidden"));
    assert.ok(!hidden.includes(".env.local"));
    assert.equal((await listFiles(root, ".", { query: "REGULAR" })).length, 1);
    for (const name of ["../outside", ".git/config", ".env", "link.txt"])
      await assert.rejects(readCodeFile(root, name));
    await assert.rejects(readCodeFile(root, "binary.bin"));
    assert.equal(
      (await readCodeFile(root, "regular.txt")).code,
      "hello developer\n",
    );
    assert.equal(
      selectLines(
        "first valid line\nsecond valid line\nthird valid line",
        2,
        2,
      ),
      "second valid line",
    );
    assert.throws(() => selectLines("hello developer", 0, 1));
    assert.throws(() => selectLines("x".repeat(20001)));
    await assert.rejects(workspaceRoot(join(root, "regular.txt")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("Git selection separates staged/unstaged patches, supports hunks/deletions, and rejects changed selections", async () => {
  const root = await fixture();
  try {
    const original =
      Array.from(
        { length: 30 },
        (_, i) => "const value" + i + " = " + i + ";",
      ).join("\n") + "\n";
    await writeFile(join(root, "a file.ts"), original);
    await writeFile(join(root, "deleted.ts"), "export const deleted = true;\n");
    await writeFile(join(root, ".env"), "SECRET=initial\n");
    git(root, "add", ".");
    git(root, "commit", "-qm", "fixture");
    const changed = original
      .replace("value1 = 1", "value1 = 111")
      .replace("value25 = 25", "value25 = 250");
    await writeFile(join(root, "a file.ts"), changed);
    await rm(join(root, "deleted.ts"));
    await writeFile(join(root, ".env"), "SECRET=changed\n");
    const changes = await listChanges(root);
    assert.deepEqual(changes.map((c) => c.path).sort(), [
      "a file.ts",
      "deleted.ts",
    ]);
    assert.deepEqual(await listChanges(root, { staged: true }), []);
    const diff = await readDiff(root, "a file.ts");
    assert.equal(diff.hunks.length, 2);
    assert.ok(diff.patch.includes("-const value1 = 1;"));
    assert.ok(diff.patch.includes("+const value25 = 250;"));
    const source = {
      kind: "diff",
      path: "a file.ts",
      staged: false,
      hunk: 0,
      hash: diff.hunks[0].hash,
    };
    const selected = await reviewSource(root, source);
    assert.ok(selected.code.includes("value1"));
    assert.ok(!selected.code.includes("value25"));
    const deletion = await readDiff(root, "deleted.ts");
    assert.ok(deletion.patch.includes("--- a/deleted.ts"));
    assert.ok(deletion.patch.includes("+++ /dev/null"));
    git(root, "add", "a file.ts");
    assert.ok(
      (await listChanges(root, { staged: true })).some(
        (c) => c.path === "a file.ts",
      ),
    );
    await assert.rejects(reviewSource(root, source));
    const staged = await readDiff(root, "a file.ts", { staged: true });
    assert.ok(
      (
        await reviewSource(root, {
          kind: "diff",
          path: "a file.ts",
          staged: true,
          hunk: null,
          hash: staged.hash,
        })
      ).code.includes("value25"),
    );
    await writeFile(
      join(root, "a file.ts"),
      changed + "// changed after staging\n",
    );
    assert.ok(
      (await readDiff(root, "a file.ts")).patch.includes(
        "changed after staging",
      ),
    );
    assert.ok(
      !(await readDiff(root, "a file.ts", { staged: true })).patch.includes(
        "changed after staging",
      ),
    );
    await assert.rejects(readDiff(root, "../outside"));
    assert.equal(sensitivePath("nested/.env.production"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("Git selection never runs external diff/textconv/fsmonitor and uses literal path names", async () => {
  const root = await fixture();
  try {
    await writeFile(join(root, "normal.ts"), "const original = true;\n");
    git(root, "add", ".");
    git(root, "commit", "-qm", "initial");
    await writeFile(join(root, "normal.ts"), "const changed = true;\n");
    git(root, "config", "diff.external", "definitely-not-a-command");
    git(root, "config", "core.fsmonitor", "definitely-not-a-command");
    assert.ok((await readDiff(root, "normal.ts")).patch.includes("changed"));
    await assert.rejects(readDiff(root, ":(glob)*"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("drafts persist privately, isolate account/project scopes, cap history and reject unsafe storage", async () => {
  const root = await mkdtemp(join(tmpdir(), "devdevian-drafts-"));
  const env = { DEVDEVIAN_CONFIG_DIR: join(root, "config") };
  const scope = { origin: "https://forum.example", userId: 1, root, env };
  const store = new DraftStore(scope);
  try {
    const form = {
      kind: "reply",
      draftId: "a".repeat(64),
      title: "Reply",
      url: "/posts/1/replies",
      values: { body: "Unsent reply text" },
    };
    await store.save(form);
    const rows = await store.list();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].form.values.body, form.values.body);
    assert.equal(
      (await stat(join(store.directory, rows[0].id + ".json"))).mode & 0o777,
      0o600,
    );
    assert.equal(
      (await new DraftStore({ ...scope, userId: 2 }).list()).length,
      0,
    );
    assert.equal(
      (await new DraftStore({ ...scope, root: root + "/other" }).list()).length,
      0,
    );
    assert.equal(
      (
        await new DraftStore({
          ...scope,
          origin: "https://another.example",
        }).list()
      ).length,
      0,
    );
    for (let i = 0; i < 22; i++)
      await store.save({ ...form, draftId: i.toString(16).padStart(64, "0") });
    assert.equal((await store.list()).length, 20);
    const row = (await store.list())[0],
      file = join(store.directory, row.id + ".json");
    await chmod(file, 0o644);
    await assert.rejects(store.read(row.id), /permissions/);
    assert.equal((await store.list()).length, 19);
    await store.remove(row.id);
    await assert.rejects(store.read("../escape"));
    await rm(join(root, "config", "drafts"), { recursive: true, force: true });
    await mkdir(join(root, "outside"));
    await symlink(join(root, "outside"), join(root, "config", "drafts"));
    await assert.rejects(store.save(form), /real directory/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ordinary file browsing works when Git is unavailable", async () => {
  const root = await mkdtemp(join(tmpdir(), "devdevian-no-git-"));
  try {
    await writeFile(join(root, "source.ts"), "export const value = true;");
    const module = new URL("../lib/workspace.mjs", import.meta.url).href;
    const output = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import {listFiles} from ${JSON.stringify(module)}; console.log(JSON.stringify(await listFiles(${JSON.stringify(root)})));`,
      ],
      {
        encoding: "utf8",
        env: { ...process.env, PATH: join(root, "no-commands") },
      },
    );
    assert.equal(JSON.parse(output)[0].name, "source.ts");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
