import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  stat,
  writeFile,
  symlink,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RecentStore } from "../lib/recent.mjs";
import { loadWork, workItemRoute } from "../lib/my-work.mjs";
test("Recent history stores only IDs/times, bounded, private, isolated and rejects unsafe files", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "devdevian-recent-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const opts = {
    origin: "https://example.com",
    userId: 1,
    root: "/project",
    env: { DEVDEVIAN_CONFIG_DIR: root },
  };
  const store = new RecentStore(opts);
  await Promise.all(Array.from({ length: 15 }, (_, i) => store.record(i + 1)));
  await store.record(9);
  const rows = await store.list();
  assert.equal(rows.length, 12);
  assert.equal(rows[0].id, 9);
  assert.equal(new Set(rows.map((x) => x.id)).size, 12);
  assert.deepEqual(Object.keys(rows[0]), ["id", "at"]);
  assert.equal((await stat(store.file)).mode & 0o077, 0);
  assert.equal(
    (await new RecentStore({ ...opts, userId: 2 }).list()).length,
    0,
  );
  assert.equal(
    (await new RecentStore({ ...opts, root: "/elsewhere" }).list()).length,
    0,
  );
  const data = JSON.parse(await readFile(store.file));
  data.items = [
    { id: 1, at: 0 },
    { id: 2, at: Date.now() + 3600000 },
    { id: 3, at: Date.now() },
    { id: 3, at: Date.now() },
  ];
  await writeFile(store.file, JSON.stringify(data));
  assert.deepEqual(
    (await store.list()).map((x) => x.id),
    [3],
  );
  await rm(store.file);
  await symlink(join(root, "outside"), store.file);
  await assert.rejects(() => store.list(), /Invalid/);
});
test("Continue survives a provider failure without sending draft text and maps explicit actions", async () => {
  const calls = [];
  const drafts = {
    list: async () => [
      {
        id: "draft1",
        savedAt: Date.now(),
        form: { values: { title: "Local thought", body: "never upload" } },
      },
    ],
  };
  const recent = { list: async () => [{ id: 7, at: Date.now() }] };
  const result = await loadWork(
    async (path) => {
      calls.push(path);
      throw Object.assign(Error("Unavailable"), { status: 503 });
    },
    "continue",
    1,
    { drafts, recent },
  );
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].type, "draft");
  assert.equal(result.warnings.length, 1);
  assert.deepEqual(calls, ["/my-work/recent?ids=7"]);
  assert.ok(!JSON.stringify(result).includes("never upload"));
  assert.deepEqual(
    workItemRoute({ type: "result", project_id: 1, post_id: 2 }),
    { view: "contributions", id: 1, post: 2, page: 1 },
  );
  assert.deepEqual(
    workItemRoute({ type: "request", target_id: 3, post_id: 2 }),
    { view: "reviewers", id: 2, targetRequest: 3, page: 1 },
  );
  const paths = [];
  await loadWork(
    async (p) => {
      paths.push(p);
      return {};
    },
    "tasks",
    2,
  );
  assert.deepEqual(paths, ["/my-work?section=tasks&page=2&limit=12"]);
});
