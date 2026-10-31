import { createHash } from "node:crypto";
export const reviewQueueTabs = [
  ["open", "Open requests"],
  ["awaiting", "Awaiting you"],
];
export function reviewQueueQuery(section = "open", page = 1) {
  if (
    !reviewQueueTabs.some(([id]) => id === section) ||
    !Number.isSafeInteger(page) ||
    page < 1
  )
    throw Error("Choose open or awaiting and a positive page number.");
  return `/posts?limit=12&page=${page}&review_queue=${section}`;
}
export async function loadReviewQueue(api, section = "open", page = 1, signal) {
  const result = await api(reviewQueueQuery(section, page), { signal });
  if (result.review_queue !== section)
    throw Error(
      "This server needs API 0.1.10 or newer for Review queue. Your work and drafts are unchanged.",
    );
  return result;
}
export function reviewSummary(summary) {
  if (!summary) return ""; // Older servers remain readable.
  const count = (key) =>
    Number.isSafeInteger(summary[key]) && summary[key] >= 0 ? summary[key] : 0;
  return `Open ${count("open")} · Resolved ${count("resolved")} · Earlier ${count("earlier")}`;
}
// Session-only LRU. No code, quotes or account data is written to disk.
export class ReviewMemory {
  #items = new Map();
  save(post, position) {
    if (!post?.code) return;
    this.#items.delete(post.id);
    this.#items.set(post.id, { hash: this.#hash(post.code), ...position });
    if (this.#items.size > 30)
      this.#items.delete(this.#items.keys().next().value);
  }
  restore(post) {
    const item = this.#items.get(post?.id);
    if (!item || item.hash !== this.#hash(post.code || "")) {
      this.#items.delete(post?.id);
      return null;
    }
    return {
      ...item,
      reviewLine: Math.min(
        item.reviewLine || 0,
        post.code.split("\n").length - 1,
      ),
    };
  }
  target(postId) {
    const id = this.#items.get(Number(postId))?.selectedId;
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  }
  clear() {
    this.#items.clear();
  }
  #hash(code) {
    return createHash("sha256").update(code).digest("hex");
  }
}
