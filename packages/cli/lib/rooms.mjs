import { workspaceId } from "./project-workspace.mjs";
export const roomStates = ["", "open", "in_progress", "ready"];
export function requireRoom(data) {
  if (data?.capabilities?.rooms !== 1)
    throw Error(
      "Rooms are not prepared on this server. Existing work is unchanged.",
    );
  return data;
}
export async function loadRoom(
  api,
  id,
  { state = "", page = 1, mine = false, query = "", signal } = {},
) {
  id = workspaceId(id);
  if (!roomStates.includes(state))
    throw Error("Choose open, in_progress or ready.");
  const room = requireRoom(await api(`/projects/${id}/room`, { signal }));
  const params = new URLSearchParams({
    page: String(workspaceId(page)),
    ...(state ? { state } : {}),
    mine: mine ? "1" : "0",
    q: query,
  });
  const tasks = requireRoom(
    await api(`/projects/${id}/room/tasks?${params}`, { signal }),
  );
  return {
    ...tasks,
    room,
    title: room.project.name + " · Room",
    subtitle: `${room.participation_mode === "approved" ? (room.permissions.participate ? "Approved contributor" : "Observer · approval required") : "Open participation"} · ${state || "All tasks"} · ← → states · X task actions · /decisions ${id}`,
  };
}
export async function roomTaskPlan(
  api,
  project,
  post,
  action,
  { username, state } = {},
) {
  project = workspaceId(project);
  post = workspaceId(post);
  if (!["claim", "release", "assign", "state"].includes(action))
    throw Error("Choose claim, release, assign or state.");
  if (action === "state" && !roomStates.slice(1).includes(state))
    throw Error("Choose open, in_progress or ready.");
  const { task } = requireRoom(
    await api(`/projects/${project}/room/tasks/${post}`),
  );
  return {
    url: `/projects/${project}/room/tasks/${post}`,
    method: "POST",
    payload: {
      action,
      expected_version: task.work_version,
      ...(action === "assign"
        ? {
            username: String(username || "")
              .replace(/^@/, "")
              .toLowerCase(),
          }
        : {}),
      ...(action === "state" ? { state } : {}),
    },
    title: `${action === "claim" ? "Pick up" : action} task · ${task.title}`,
    audience: task.community_id ? "Private community" : "Project room",
    roomRoute: { view: "room", id: project, page: 1 },
  };
}
export async function roomDecisionPlan(
  api,
  project,
  id = null,
  action = "edit",
) {
  project = workspaceId(project);
  const room = requireRoom(await api(`/projects/${project}/room`));
  if (!room.permissions.manage)
    throw Error("Only the project owner can pin decisions.");
  const decision = id
    ? requireRoom(
        await api(`/projects/${project}/room/decisions/${workspaceId(id)}`),
      ).decision
    : null;
  return {
    url: `/projects/${project}/room/decisions${id ? "/" + id : ""}`,
    method: id ? "PUT" : "POST",
    payload: {
      expected_version: decision?.version || 0,
      post_id: decision?.post_id || null,
      ...(id ? {} : { operation_key: crypto.randomUUID() }),
      archived:
        action === "archive"
          ? true
          : action === "restore"
            ? false
            : !!decision?.archived,
    },
    title: id ? "Update pinned decision" : "Pin a decision",
    audience: decision?.post_id
      ? "Linked conversation audience"
      : "Project room",
    values: { title: decision?.title || "", body: decision?.body || "" },
    roomRoute: { view: "room-decisions", id: project, page: 1 },
  };
}
