// Diff is a presentation of immutable text, never a feedback-anchor authority.
// Cap quadratic work; large replacements use a linear exact replacement view.
export function compareReviewLines(before, after) {
  const a = before.split("\n"),
    b = after.split("\n");
  let prefix = 0,
    suffix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix])
    prefix++;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  )
    suffix++;
  const left = a.slice(prefix, a.length - suffix),
    right = b.slice(prefix, b.length - suffix);
  const coarse = (left.length + 1) * (right.length + 1) > 200000;
  const rows = a
    .slice(0, prefix)
    .map((text, i) => ({ kind: "context", text, old: i + 1, next: i + 1 }));
  let i = 0,
    j = 0;
  const lengths = coarse
    ? null
    : Array.from(
        { length: left.length + 1 },
        () => new Uint16Array(right.length + 1),
      );
  if (lengths)
    for (let x = left.length - 1; x >= 0; x--)
      for (let y = right.length - 1; y >= 0; y--)
        lengths[x][y] =
          left[x] === right[y]
            ? lengths[x + 1][y + 1] + 1
            : Math.max(lengths[x + 1][y], lengths[x][y + 1]);
  while (i < left.length || j < right.length) {
    if (!coarse && i < left.length && j < right.length && left[i] === right[j])
      rows.push({
        kind: "context",
        text: left[i++],
        old: prefix + i,
        next: prefix + ++j,
      });
    else if (
      j < right.length &&
      ((!coarse &&
        (i === left.length || lengths[i][j + 1] >= lengths[i + 1][j])) ||
        (coarse && i === left.length))
    )
      rows.push({
        kind: "added",
        text: right[j++],
        old: null,
        next: prefix + j,
      });
    else
      rows.push({
        kind: "removed",
        text: left[i++],
        old: prefix + i,
        next: null,
      });
  }
  for (let n = suffix; n > 0; n--)
    rows.push({
      kind: "context",
      text: a[a.length - n],
      old: a.length - n + 1,
      next: b.length - n + 1,
    });
  return { rows, coarse };
}
export const workspaceDraftKey = (user, context) =>
  `devdevian-workspace:v1:${user}:${context}`;
export function readWorkspaceDraft(storage, key) {
  try {
    const value = JSON.parse(storage.getItem(key));
    if (
      !value ||
      value.version !== 1 ||
      !Number.isFinite(value.saved) ||
      Date.now() - value.saved > 86400000 ||
      value.saved > Date.now() + 60000 ||
      typeof value.data !== "object" ||
      !value.data
    )
      return null;
    const data = value.data;
    // Only text and published conversation/revision IDs. Never credentials or
    // upload handles. A tab-scoped, account/project-specific draft is not sent.
    const result = {};
    for (const [field, max] of Object.entries({
      title: 160,
      body: 15000,
      kind: 20,
      community_id: 100,
      review_focus: 1500,
      code: 20000,
    }))
      if (typeof data[field] === "string")
        result[field] = data[field].slice(0, max);
    for (const field of ["created_id", "base_revision_id", "expected_revision"])
      if (Number.isSafeInteger(data[field]) && data[field] >= 0)
        result[field] = data[field];
    if (
      Array.isArray(data.files) &&
      data.files.length > 0 &&
      data.files.length <= 10 &&
      data.files.every(
        (f) =>
          typeof f?.path === "string" &&
          f.path.length <= 240 &&
          typeof f.code === "string",
      ) &&
      data.files.map((f) => f.code).join("\n").length <= 20000
    )
      result.files = data.files.map(({ path, code }) => ({ path, code }));
    return result;
  } catch {
    return null;
  }
}
export function saveWorkspaceDraft(storage, key, data) {
  try {
    const candidate = JSON.stringify({ version: 1, saved: Date.now(), data });
    const clean = readWorkspaceDraft({ getItem: () => candidate }, key);
    storage.setItem(
      key,
      JSON.stringify({ version: 1, saved: Date.now(), data: clean }),
    );
    return true;
  } catch {
    return false;
  }
}
