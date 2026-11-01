import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ProjectBinding,
  revisionFiles,
  feedbackAnchor,
  publishWorkRequest,
  loadWorkspace,
} from "../lib/project-workspace.mjs";
import { ReviewMemory } from "../lib/review-queue.mjs";
test("project associations isolate account, origin and canonical directory without repository writes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ddv-project-binding-"));
  const env = { DEVDEVIAN_CONFIG_DIR: join(directory, "config") };
  const base = {
    origin: "https://example.test",
    userId: 1,
    root: directory,
    env,
  };
  try {
    const binding = new ProjectBinding(base);
    assert.equal(await binding.read(), null);
    await binding.save(42);
    assert.equal(await binding.read(), 42);
    for (const change of [
      { userId: 2 },
      { origin: "https://other.test" },
      { root: directory + "/other" },
    ])
      assert.equal(
        await new ProjectBinding({ ...base, ...change }).read(),
        null,
      );
    const body = await readFile(binding.file, "utf8");
    assert.ok(!body.includes(directory));
    await binding.remove();
    assert.equal(await binding.read(), null);
    await symlink(join(directory, "target"), binding.file);
    await assert.rejects(binding.read(), /Invalid local/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test("explicit revision file selection preserves order and excludes secrets, traversal and duplicate files", async () => {
  const root = await mkdtemp(join(tmpdir(), "ddv-revision-files-"));
  try {
    await mkdir(join(root, "src"));
    await writeFile(
      join(root, "src/a.ts"),
      "export const alpha = true;\nexport const beta = false;",
    );
    await writeFile(join(root, "b.ts"), "export const bravo = true;");
    await writeFile(join(root, ".env"), "PRIVATE_SECRET=do-not-read");
    await writeFile(
      join(root, "files.json"),
      JSON.stringify([
        { path: "b.ts" },
        { path: "src/a.ts", start: 2, end: 2 },
      ]),
    );
    const files = await revisionFiles(root, { selections: "files.json" });
    assert.deepEqual(
      files.map((f) => f.path),
      ["b.ts", "src/a.ts"],
    );
    assert.equal(files[1].code, "export const beta = false;");
    await assert.rejects(revisionFiles(root, { file: ".env" }), /excluded/);
    await assert.rejects(
      revisionFiles(root, { file: "../outside.ts" }),
      /inside/,
    );
    await writeFile(
      join(root, "files.json"),
      JSON.stringify([{ path: "b.ts" }, { path: "./b.ts" }]),
    );
    await assert.rejects(
      revisionFiles(root, { selections: "files.json" }),
      /only once/,
    );
    const memory = new ReviewMemory();
    memory.save(
      { id: 1, code: "same code", review_revision_id: 5 },
      { reviewLine: 1 },
    );
    assert.equal(
      memory.restore({ id: 1, code: "same code", review_revision_id: 6 }),
      null,
    );
    assert.throws(
      () => feedbackAnchor({ revision: 3 }, { post_revision: 2 }, 1, 1),
      /changed/,
    );
    assert.throws(
      () =>
        feedbackAnchor(
          { revision: 3 },
          {
            post_revision: 3,
            revision_id: 9,
            files: [{ path: "a", start_line: 1, end_line: 2 }],
          },
          2,
          3,
        ),
      /one file/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("link retry reuses published post and uncertain publication is not replayed", async () => {
  let posts = 0,
    puts = 0,
    progress = {},
    fail = true;
  const api = async (path, options = {}) => {
    if (path === "/posts") {
      posts++;
      return { id: 7 };
    }
    if (path.endsWith("/workspace"))
      return {
        capabilities: { work_requests: 1 },
        project: { name: "Orbit", user_id: 1 },
        permissions: { manage_requests: true },
      };
    if (path === "/posts/7") return { user_id: 1 };
    if (options.method === "PUT") {
      puts++;
      if (fail) throw Error("Connection lost");
      return {};
    }
    return { linked: false, version: 0 };
  };
  const save = async (value) => {
    progress = value;
  };
  await assert.rejects(publishWorkRequest(api, 1, {}, progress, save));
  assert.equal(progress.postId, 7);
  fail = false;
  assert.equal((await publishWorkRequest(api, 1, {}, progress, save)).id, 7);
  assert.equal(posts, 1);
  assert.equal(puts, 2);
  await assert.rejects(
    publishWorkRequest(
      async () => {
        throw Error("Lost response");
      },
      1,
      {},
      {},
      save,
    ),
  );
  assert.equal(progress.uncertain, true);
  await assert.rejects(
    publishWorkRequest(api, 1, {}, progress, save),
    /unknown/,
  );
  assert.equal(posts, 1);
  await assert.rejects(
    loadWorkspace(async () => ({ items: [] }), 1),
    /does not support/,
  );
});

test("creation intent is durable before sending, while a definitive refusal allows correction", async () => {
  let stored,
    calls = 0;
  const save = async (value) => {
    stored = value;
  };
  await assert.rejects(
    publishWorkRequest(
      async () => {
        calls++;
        assert.equal(stored.uncertain, true);
        throw Object.assign(Error("Quota reached"), { status: 429 });
      },
      1,
      { title: "Intent fixture" },
      {},
      save,
    ),
    /Quota/,
  );
  assert.deepEqual(stored, {});
  assert.equal(calls, 1);
  await assert.rejects(
    publishWorkRequest(
      async () => {
        calls++;
      },
      1,
      {},
      {},
      async () => {
        throw Error("Disk unavailable");
      },
    ),
    /Disk unavailable/,
  );
  assert.equal(calls, 1, "No POST when durable intent cannot be recorded");
});
