import { workspaceId } from "./project-workspace.mjs";
export const contributionRoot = (id) =>
  `/projects/${workspaceId(id)}/contributions`;
export function requireContributions(data) {
  if (data?.capabilities?.contributions !== 1)
    throw Error(
      "Contributions are not prepared on this server. Existing work is unchanged.",
    );
  return data;
}
export async function contributionSubmitPlan(api, project, post) {
  const root = contributionRoot(project);
  post = workspaceId(post);
  const { task } = await api(
    `/projects/${workspaceId(project)}/room/tasks/${post}`,
  );
  const me = await api("/me");
  if (task.assignee_id !== me.user?.id)
    throw Error("Pick up this task before submitting work.");
  const rows = requireContributions(await api(`${root}?mine=1&post=${post}`)),
    c = rows.items[0];
  if (c && ["submitted", "accepted"].includes(c.state))
    throw Error(
      "This result is already submitted or accepted. Withdraw a pending result before replacing it.",
    );
  return {
    url: root,
    method: "POST",
    title: "Submit work · " + task.title,
    audience: task.community_id ? "Private community" : "Public project task",
    payload: {
      post_id: post,
      expected_version: c?.version || 0,
      operation_key: crypto.randomUUID(),
      pull_token: null,
    },
    values: { body: c?.body || "", pr: c?.pull?.url || "" },
    roomRoute: { view: "contributions", id: workspaceId(project), page: 1 },
  };
}
export async function contributionDecisionPlan(api, project, id, state) {
  const root = contributionRoot(project);
  id = workspaceId(id);
  if (!["accepted", "changes_requested", "withdrawn"].includes(state))
    throw Error("Choose accepted, changes_requested or withdrawn.");
  const d = requireContributions(await api(`${root}/${id}`));
  if (!d.permissions[state === "withdrawn" ? "withdraw" : "review"])
    throw Error(
      "This contribution action is no longer available. Reload the result.",
    );
  return {
    url: `${root}/${id}`,
    method: "POST",
    title: state.replaceAll("_", " ") + " · result v" + d.contribution.revision,
    audience: "People with access to this task",
    payload: {
      state,
      expected_version: d.contribution.version,
      expected_revision: d.contribution.revision,
    },
    values: { body: "" },
    roomRoute: { view: "contributions", id: workspaceId(project), page: 1 },
  };
}
export async function contributionPayload(api, plan, values) {
  const { pr, ...v } = values;
  const payload = { ...plan.payload, ...v };
  if (pr?.trim()) {
    const checked = await api(plan.url + "/github", {
      method: "POST",
      body: { url: pr.trim() },
    });
    payload.pull_token = checked.token;
    return { payload, pull: checked.pull };
  }
  return { payload, pull: null };
}
