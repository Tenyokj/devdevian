import { assertSnippet } from "../lib/tui-data.mjs";
import { createHash } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { liveLoop, anchoredIndex } from "../lib/live.mjs";
import { contextActions } from "../lib/context-actions.mjs";
import { codeRange, reviewExcerpt } from "../lib/review-workspace.mjs";

test("context actions match authorship, paused discussions and tombstones", () => {
  const base = {
    route: { view: "post", tab: "replies" },
    data: { post: { user_id: 1, kind: "question" } },
    selected: { id: 8, user_id: 2 },
    user: { id: 1 },
    live: true,
  };
  const ids = (v) => contextActions(v).map((a) => a.id);
  assert.ok(ids(base).includes("solution"));
  assert.ok(!ids(base).includes("delete"));
  assert.ok(ids({ ...base, user: { id: 2 } }).includes("delete"));
  assert.ok(!ids({ ...base, user: { id: 2 } }).includes("solution"));
  const deleted = {
    ...base,
    selected: { ...base.selected, deleted_at: "now" },
  };
  assert.ok(!ids(deleted).includes("solution"));
  assert.ok(!ids({ ...deleted, user: { id: 2 } }).includes("edit"));
  assert.ok(
    !ids({
      ...base,
      data: { post: { ...base.data.post, archived_at: "now" } },
    }).includes("reply"),
  );
  assert.ok(
    ids({
      ...base,
      route: { view: "feedback" },
      data: { ...base.data, note: { resolved: true } },
    }).includes("resolve"),
  );
});

test("code selection is one-based and old snippets use the preserved quote", () => {
  assert.deepEqual(codeRange(4, 1), { start: 2, end: 5 });
  assert.deepEqual(codeRange(0), { start: 1, end: 1 });
  assert.deepEqual(
    reviewExcerpt(
      { code: "new code" },
      { outdated: true, quote: "old code", start_line: 8 },
    ),
    { text: "old code", first: 8, old: true },
  );
  assert.equal(
    reviewExcerpt({ code: "new code" }, { outdated: false }).text,
    "new code",
  );
  assert.equal(anchoredIndex([{ id: 2 }], [{ id: 3 }, { id: 2 }], 0), 1);
  assert.equal(anchoredIndex([{ id: 2 }], [], 0), 0);
  assert.equal(
    anchoredIndex(
      [{ id: 2, entryType: "note" }],
      [
        { id: 2, entryType: "feedbackReply" },
        { id: 2, entryType: "note" },
      ],
      0,
    ),
    1,
  );
});

test("live updates are serial, idle-aware, back off, and stop on authentication failure", async () => {
  let queued,
    now = 0,
    activity = 0,
    calls = 0,
    release,
    fail = null;
  const delays = [],
    errors = [];
  const stop = liveLoop(
    async (signal) => {
      calls++;
      if (calls === 1)
        await new Promise((resolve) => {
          release = resolve;
        });
      assert.equal(signal.aborted, false);
      if (fail) throw fail;
    },
    {
      schedule: (fn, ms) => {
        queued = fn;
        delays.push(ms);
        return 1;
      },
      cancel: () => {
        queued = null;
      },
      now: () => now,
      activity: () => activity,
      onError: (e) => errors.push(e),
    },
  );
  const initial = queued();
  queued = null;
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.equal(queued, null, "No overlapping poll during request");
  release();
  await initial;
  assert.equal(delays.at(-1), 45000);
  now = 130000;
  await queued();
  assert.equal(delays.at(-1), 180000);
  activity = now;
  fail = Error("capacity");
  await queued();
  assert.equal(delays.at(-1), 90000);
  fail = null;
  await queued();
  assert.equal(delays.at(-1), 45000);
  fail = Object.assign(Error("expired"), { status: 401 });
  await queued();
  assert.equal(errors.length, 2);
  assert.equal(queued, null);
  stop();
});

test("stopping live updates aborts an in-flight read without rescheduling", async () => {
  let queued, signal, release;
  const stop = liveLoop(
    async (s) => {
      signal = s;
      await new Promise((r) => {
        release = r;
      });
    },
    {
      schedule: (fn) => {
        queued = fn;
        return 1;
      },
      cancel: () => {
        queued = null;
      },
    },
  );
  const pending = queued();
  stop();
  assert.ok(signal.aborted);
  release();
  await pending;
  assert.equal(queued, null);
});

test("review hash refuses a snippet changed between code and remark reads", () => {
  const hash = createHash("sha256").update("current code").digest("hex");
  assert.doesNotThrow(() => assertSnippet("current code", hash));
  assert.throws(() => assertSnippet("old code", hash), /Code changed/);
  assert.doesNotThrow(() =>
    contextActions({
      route: { view: "post", tab: "feedback" },
      data: null,
      selected: null,
      user: null,
      live: true,
    }),
  );
});
