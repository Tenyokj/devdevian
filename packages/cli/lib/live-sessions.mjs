import { randomUUID } from "node:crypto";
import { workspaceId } from "./project-workspace.mjs";
import { readCodeFile, workspaceRoot } from "./workspace.mjs";
export function liveId(value) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value || "",
    )
  )
    throw Error("Choose a session ID from live list.");
  return value.toLowerCase();
}
export function liveURL(origin, id) {
  return new URL("/app#live/" + liveId(id), origin).href;
}
export async function loadLive(
  api,
  { project, page = 1, state = "all", query = "", signal } = {},
) {
  if (!["all", "open", "saved"].includes(state))
    throw Error("Choose all, open or saved.");
  const params = new URLSearchParams({
    page: String(workspaceId(page)),
    state,
    q: query.slice(0, 200),
  });
  return api(
    (project ? `/projects/${workspaceId(project)}/live` : "/live") +
      "?" +
      params,
    { signal },
  );
}
const audience = (session) =>
  "Invited participants only · source conversation #" +
  session.post_id +
  (session.private ? " · private community" : "");
export async function liveCreatePlan(
  api,
  post,
  {
    file,
    title,
    language = "typescript",
    root,
    operationKey = randomUUID(),
  } = {},
) {
  post = workspaceId(post);
  const source = await api(`/posts/${post}`);
  if (!file)
    throw Error("Choose an explicit --file inside the current project.");
  const selected = await readCodeFile(await workspaceRoot(root), file);
  if (selected.code.length > 20000)
    throw Error("Select a file up to 20,000 characters.");
  if (!title?.trim() || title.trim().length < 3 || title.length > 100)
    throw Error("Choose a title between 3 and 100 characters.");
  if (
    !["typescript", "javascript", "python", "json", "text"].includes(language)
  )
    throw Error("Unsupported Live language.");
  return {
    url: `/posts/${post}/live`,
    method: "POST",
    audience: audience({ post_id: post, private: !!source.community_id }),
    payload: {
      title: title.trim(),
      language,
      code: selected.code,
      operation_key: operationKey,
    },
  };
}
export async function liveInvitePlan(api, id, username, role = "editor") {
  id = liveId(id);
  const row = await api(`/live/${id}`);
  username = String(username || "")
    .replace(/^@/, "")
    .toLowerCase();
  if (!row.session.can_manage)
    throw Error("Only the session host can manage invitations.");
  if (!/^[a-z][a-z0-9_]{2,29}$/i.test(username))
    throw Error("Choose an exact permanent username.");
  if (!["editor", "viewer", "remove"].includes(role))
    throw Error("Choose editor, viewer or remove.");
  return {
    url: `/live/${id}/members`,
    method: "PATCH",
    audience: audience(row.session),
    payload: { username, role },
  };
}
export async function liveContinuePlan(
  api,
  id,
  { title, operationKey = randomUUID() } = {},
) {
  id = liveId(id);
  const row = await api(`/live/${id}`);
  if (!row.session.can_continue)
    throw Error(
      "Choose a saved session with current source participation rights.",
    );
  title = (title || row.session.title + " · continued").slice(0, 100).trim();
  if (title.length < 3) throw Error("Choose a title of at least 3 characters.");
  return {
    url: `/live/${id}/continue`,
    method: "POST",
    audience: audience(row.session),
    code: row.code,
    payload: { title, operation_key: operationKey },
  };
}
