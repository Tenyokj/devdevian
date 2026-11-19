import { workspaceId } from "./project-workspace.mjs";
export function devlogId(value) {
  const id = String(value);
  if (
    !/^(?:v-)?[1-9]\d*$/.test(id) ||
    !Number.isSafeInteger(Number(id.replace(/^v-/, "")))
  )
    throw Error("Choose a Devlog ID from devlogs.");
  return id;
}
export async function devlogPlan(api, project, id = null, status = "draft") {
  project = workspaceId(project);
  if (!["draft", "published"].includes(status))
    throw Error("Choose draft or published.");
  const workspace = await api(`/projects/${project}/workspace`);
  if (!workspace.permissions?.manage_requests)
    throw Error("Only the project owner can write Devlogs.");
  const entry = id
    ? (await api(`/projects/${project}/devlogs/${devlogId(id)}`)).devlog
    : null;
  if (entry?.status === "published" && status === "draft")
    throw Error("Published Devlogs cannot become drafts.");
  return {
    url: `/projects/${project}/devlogs${id ? "/" + id : ""}`,
    method: id ? "PUT" : "POST",
    payload: {
      status,
      ...(id
        ? { expected_version: entry.version }
        : { operation_key: crypto.randomUUID() }),
    },
    values: { title: entry?.title || "", body: entry?.body || "" },
    title:
      status === "draft"
        ? "Save private Devlog draft"
        : "Publish project Devlog",
    audience:
      status === "draft"
        ? "Only you"
        : workspace.project.community_id
          ? "Private community members"
          : "Public project",
    roomRoute: {
      view: "devlogs",
      id: project,
      page: 1,
      drafts: status === "draft",
    },
  };
}
export async function loadDevlogs(
  api,
  project,
  { page = 1, drafts = false, signal } = {},
) {
  project = workspaceId(project);
  const data = await api(
    `/projects/${project}/devlogs?status=${drafts ? "draft" : "published"}&page=${workspaceId(page)}`,
    { signal },
  );
  if (data.capabilities?.devlogs !== 1)
    throw Error("Devlogs are not available on this server.");
  return {
    ...data,
    title: drafts ? "My Devlog drafts" : "Project Devlogs",
    subtitle: `Project #${project} · Enter read · X actions · /devlogs ${project}`,
  };
}
