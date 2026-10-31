// This isolated concept uses sample data and session memory, never the forum API.
export const files = ["src/retry.ts", "test/retry.test.ts"];
export const snapshots = Object.freeze({
  v1: Object.freeze({
    "src/retry.ts":
      "export async function retry<T>(send: () => Promise<T>) {\n  for (let attempt = 0; attempt < 3; attempt++) {\n    try {\n      return await send();\n    } catch (error) {\n      if (attempt === 2) throw error;\n    }\n  }\n  throw new Error('Unreachable');\n}",
    "test/retry.test.ts":
      "it('retries transient failures', async () => {\n  const send = vi.fn()\n    .mockRejectedValueOnce(new Error('timeout'))\n    .mockResolvedValue('ok');\n\n  expect(await retry(send)).toBe('ok');\n  expect(send).toHaveBeenCalledTimes(2);\n});",
  }),
  v2: Object.freeze({
    "src/retry.ts":
      "import { setTimeout as delay } from 'node:timers/promises';\n\nexport async function retry<T>(\n  send: () => Promise<T>,\n  isRetryable: (error: unknown) => boolean,\n) {\n  for (let attempt = 0; attempt < 3; attempt++) {\n    try {\n      return await send();\n    } catch (error) {\n      if (!isRetryable(error) || attempt === 2) throw error;\n      await delay(100 * 2 ** attempt);\n    }\n  }\n  throw new Error('Unreachable');\n}",
    "test/retry.test.ts":
      "it('does not repeat a permanent failure', async () => {\n  const failure = new Error('not authorized');\n  const send = vi.fn().mockRejectedValue(failure);\n\n  await expect(retry(send, () => false))\n    .rejects.toBe(failure);\n  expect(send).toHaveBeenCalledTimes(1);\n});",
  }),
});
export const initialRequests = [
  {
    id: 14,
    type: "Code review",
    title: "Make retries safe under timeouts",
    description:
      "A failed response does not always mean a failed request. Help make our retry boundary explicit.",
    status: "Changes requested",
    author: "Alex Morgan",
    initials: "AM",
    updated: "12 minutes ago",
    tags: ["TypeScript", "Reliability"],
    featured: true,
  },
  {
    id: 13,
    type: "Question",
    title: "Where should job cancellation live?",
    description:
      "Worker or scheduler? Comparing two approaches before we commit.",
    status: "In progress",
    author: "Sam Chen",
    initials: "SC",
    updated: "38 minutes ago",
    tags: ["Architecture"],
  },
  {
    id: 12,
    type: "Help wanted",
    title: "Help test the first-run experience",
    description:
      "Looking for someone to walk through the quick start with a fresh pair of eyes.",
    status: "Open",
    author: "Alex Morgan",
    initials: "AM",
    updated: "2 hours ago",
    tags: ["Good first contribution"],
  },
  {
    id: 11,
    type: "Code review",
    title: "Keep queue shutdown predictable",
    description: "Drain active jobs before closing the connection.",
    status: "Ready",
    author: "Jamie Park",
    initials: "JP",
    updated: "Yesterday",
    tags: ["Node.js"],
  },
];
export const initialThreads = [
  {
    id: 1,
    revision: "v1",
    file: files[0],
    line: 6,
    quote: snapshots.v1[files[0]].split("\n")[5],
    author: "Sam Chen",
    initials: "SC",
    body: "Which failures are safe to retry? A 401 should stop immediately. Could we make that decision explicit?",
    resolved: false,
    replies: [],
  },
  {
    id: 2,
    revision: "v1",
    file: files[1],
    line: 6,
    quote: snapshots.v1[files[1]].split("\n")[5],
    author: "Jamie Park",
    initials: "JP",
    body: "Can we add a regression for permanent errors? We should prove the request is sent only once.",
    resolved: false,
    replies: [],
  },
];
export function addRemark(state, { revision, file, line, body }) {
  const code = snapshots[revision]?.[file];
  if (
    !code ||
    !Number.isSafeInteger(line) ||
    line < 1 ||
    line > code.split("\n").length ||
    !body?.trim()
  )
    throw Error("Choose a snapshot line and write a remark.");
  return {
    ...state,
    threads: [
      ...state.threads,
      {
        id: state.nextId,
        revision,
        file,
        line,
        quote: code.split("\n")[line - 1],
        author: "You",
        initials: "YO",
        body: body.trim(),
        resolved: false,
        replies: [],
      },
    ],
    nextId: state.nextId + 1,
  };
}
export function publishRevision(state) {
  // New revisions never rewrite an existing comment, quote, or resolution state.
  if (state.currentRevision === "v2") return state;
  return { ...state, currentRevision: "v2" };
}
export function threadCounts(state) {
  const live = state.threads.filter(
    (t) => t.revision === state.currentRevision,
  );
  return {
    open: live.filter((t) => !t.resolved).length,
    resolved: live.filter((t) => t.resolved).length,
    earlier: state.threads.filter((t) => t.revision !== state.currentRevision)
      .length,
  };
}
// Exact sequence diff for these small, bounded example snapshots. The production
// contract will keep immutable published offsets instead of using this view as data.
export function compareLines(before, after) {
  const a = before.split("\n"),
    b = after.split("\n");
  const lengths = Array.from(
    { length: a.length + 1 },
    () => new Uint16Array(b.length + 1),
  );
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lengths[i][j] =
        a[i] === b[j]
          ? lengths[i + 1][j + 1] + 1
          : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
  const rows = [];
  let i = 0,
    j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      rows.push({ kind: "context", text: a[i], old: ++i, next: ++j });
    } else if (
      j < b.length &&
      (i === a.length || lengths[i][j + 1] >= lengths[i + 1][j])
    ) {
      rows.push({ kind: "added", text: b[j], old: null, next: ++j });
    } else {
      rows.push({ kind: "removed", text: a[i], old: ++i, next: null });
    }
  }
  return rows;
}
export function initialReview() {
  return {
    currentRevision: "v1",
    threads: structuredClone(initialThreads),
    nextId: 3,
  };
}
