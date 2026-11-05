// Reuse the account-scoped post API; no aggregate scans or new permissions.
export const workTabs = [
  ["mine", "Mine"],
  ["reviews", "Reviews"],
  ["saved", "Saved"],
  ["following", "Following"],
  ["attention", "Next up"],
  ["tasks", "Tasks"],
  ["results", "Results"],
  ["continue", "Continue"],
];
export function workQuery(section = "mine", page = 1) {
  if (!workTabs.some(([id]) => id === section))
    throw Error(
      "Choose attention, tasks, results, continue, mine, reviews, saved or following.",
    );
  if (!Number.isSafeInteger(page) || page < 1)
    throw Error("Choose a positive page number.");
  if (["attention", "tasks", "results"].includes(section))
    return `/my-work?section=${section}&page=${page}&limit=12`;
  if (section === "continue") return null;
  const filters = {
    mine: "author=me",
    reviews: "author=me&kind=review",
    saved: "saved=1",
    following: "following=1",
  };
  return `/posts?limit=12&page=${page}&${filters[section]}`;
}
export async function loadWork(
  api,
  section = "attention",
  page = 1,
  { drafts, recent, signal } = {},
) {
  if (section !== "continue") {
    const data = await api(workQuery(section, page), { signal });
    return data.unavailable?.length
      ? {
          ...data,
          warnings: [
            "Some sources are unavailable: " + data.unavailable.join(", "),
          ],
        }
      : data;
  }
  const warnings = [],
    items = [];
  try {
    const rows = (await drafts?.list()) || [];
    items.push(
      ...rows.slice(0, 12).map((r) => ({
        id: "draft-" + r.id,
        draft_id: r.id,
        type: "draft",
        title:
          r.form.values.title ||
          r.form.values.name ||
          r.form.title ||
          "Local draft",
        updated_at: new Date(r.savedAt).toISOString(),
        action: "Resume draft",
      })),
    );
  } catch {
    warnings.push("Local drafts could not be read.");
  }
  try {
    const rows = (await recent?.list()) || [];
    if (rows.length) {
      const d = await api(
        "/my-work/recent?" +
          new URLSearchParams({ ids: rows.map((r) => r.id).join(",") }),
        { signal },
      );
      items.push(
        ...d.items.map((r) => ({
          ...r,
          id: "recent-" + r.id,
          post_id: r.id,
          type: "recent",
          action: "Continue reading",
          updated_at: new Date(
            rows.find((p) => p.id === r.id).at,
          ).toISOString(),
        })),
      );
    }
  } catch (e) {
    if (e.status === 401 || signal?.aborted) throw e;
    warnings.push(
      "Recent conversations are unavailable; local drafts remain accessible.",
    );
  }
  return {
    items,
    warnings,
    pagination: { page: 1, pages: 1, total: items.length, limit: 24 },
  };
}
export function workItemRoute(item) {
  if (item.type === "draft") return null;
  if (["request", "outcome"].includes(item.type))
    return {
      view: "reviewers",
      id: item.post_id,
      targetRequest: item.target_id,
      page: 1,
    };
  if (item.type === "remark")
    return {
      view: "feedback",
      postId: item.post_id,
      id: item.target_id,
      page: 1,
    };
  if (item.type === "result")
    return {
      view: "contributions",
      id: item.project_id,
      post: item.post_id,
      page: 1,
    };
  return {
    view: "post",
    id: item.post_id || item.id,
    tab: "overview",
    page: 1,
  };
}
