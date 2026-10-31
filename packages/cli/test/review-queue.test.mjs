import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ReviewMemory,
  loadReviewQueue,
  reviewQueueQuery,
  reviewSummary,
} from "../lib/review-queue.mjs";
import { loadPage, notificationRoute } from "../lib/tui-data.mjs";
import { parseCommand } from "../lib/tui-model.mjs";
test("review queue reads one selected bounded page, parses commands and keeps targeted Inbox routes", async () => {
  const calls = [];
  const result = await loadPage(
    async (path) => {
      calls.push(path);
      return {
        review_queue: "awaiting",
        items: [{ id: 3, review_target: 4 }],
        pagination: { page: 2, pages: 3 },
      };
    },
    { view: "reviews", tab: "awaiting", page: 2 },
  );
  assert.deepEqual(calls, ["/posts?limit=12&page=2&review_queue=awaiting"]);
  assert.equal(result.items[0].review_target, 4);
  assert.equal(reviewQueueQuery(), "/posts?limit=12&page=1&review_queue=open");
  assert.throws(() => reviewQueueQuery("mine"));
  assert.throws(() => reviewQueueQuery("open", 0));
  assert.equal(parseCommand("/reviews awaiting").command, "reviews");
  assert.deepEqual(
    await notificationRoute(
      () => {
        throw Error("Unexpected scan");
      },
      { post_id: 3, code_review_id: 4, feedback_reply_id: 99 },
    ),
    { view: "feedback", postId: 3, id: 4, page: 1, targetReply: 99 },
  );
  assert.equal(
    reviewSummary({ open: 2, resolved: 3, earlier: 4 }),
    "Open 2 · Resolved 3 · Earlier 4",
  );
  assert.equal(reviewSummary(null), "");
  await assert.rejects(
    loadReviewQueue(async () => ({ items: [] })),
    /0.1.10/,
  );
});
test("session review memory is bounded, preserves exact snippet positions and discards changed code or account state", () => {
  const memory = new ReviewMemory(),
    post = { id: 1, code: "one\ntwo\nthree" };
  const position = {
    reviewLine: 2,
    reviewAnchor: 1,
    reviewHorizontal: 5,
    reviewFocus: "code",
    selectedId: 9,
  };
  memory.save(post, position);
  assert.equal(memory.target(post.id), 9);
  assert.equal(memory.restore(post).reviewLine, 2);
  assert.equal(memory.restore(post).selectedId, 9);
  assert.equal(memory.restore({ ...post, code: "replacement" }), null);
  assert.equal(memory.restore(post), null);
  memory.save(post, position);
  memory.clear();
  assert.equal(memory.restore(post), null);
  for (let id = 1; id <= 31; id++) memory.save({ ...post, id }, position);
  assert.equal(memory.restore(post), null);
  assert.equal(memory.restore({ ...post, id: 31 }).reviewLine, 2);
});
