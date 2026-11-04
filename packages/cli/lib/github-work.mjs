import { workspaceId } from "./project-workspace.mjs";
export const githubTaskRoot = (project, post) =>
  `/projects/${workspaceId(project)}/room/tasks/${workspaceId(post)}/github`;
export async function githubWorkPlan(
  api,
  project,
  post,
  url,
  {
    contribution,
    sharePrivate = false,
    operationKey = crypto.randomUUID(),
  } = {},
) {
  project = workspaceId(project);
  const root = post
    ? githubTaskRoot(project, post)
    : `/projects/${project}/github/issues`;
  const preview = await api(root + "/preview", {
    method: "POST",
    body: { url },
  });
  if (preview.ticket.private && !sharePrivate)
    throw Error(
      "Private source: explicitly confirm sharing the saved copy with all approved community members (--share-private, or type SHARE in the terminal form).",
    );
  let c = null;
  if (contribution) {
    if (!post) throw Error("Contributions can only be linked to a task PR.");
    c = (
      await api(
        `/projects/${project}/contributions/${workspaceId(contribution)}`,
      )
    ).contribution;
    if (c.post_id !== workspaceId(post))
      throw Error("Choose a contribution for this task.");
  }
  return {
    url: root + (post ? "" : "/import"),
    method: "POST",
    title: post ? "Link pull request to task" : "Import GitHub issue as a task",
    audience: preview.ticket.private
      ? "Private community · A saved copy is shared with all approved members"
      : "Project room audience",
    payload: {
      url: preview.ticket.url,
      fingerprint: preview.ticket.fingerprint,
      operation_key: operationKey,
      share_private: sharePrivate,
      ...(post
        ? {
            expected_version: preview.expected_version,
            task_version: preview.task_version,
            ...(c
              ? { contribution_id: c.id, contribution_revision: c.revision }
              : {}),
          }
        : {}),
    },
    ticket: preview.ticket,
    roomRoute: { view: "room", id: project, page: 1 },
  };
}
export function githubTaskLines(data) {
  return [
    "GITHUB · TASK CONTEXT",
    "",
    ...(data.source
      ? [
          `Imported issue #${data.source.number} · ${data.source.title}`,
          data.source.url,
          "Saved copy: the task has its own workflow.",
          "",
        ]
      : []),
    ...(data.live
      ? [
          `PR #${data.live.number} · ${data.live.title}`,
          data.live.url,
          `State: ${data.live.merged ? "merged" : data.live.draft ? "draft" : data.live.state}`,
          `Head: ${data.live.head}`,
          `Review: ${data.live.review.state}${data.live.review.partial ? " (partial; open GitHub for latest verdicts)" : " (current PR head)"}`,
          `Checks: ${data.live.checks.state}`,
          ...data.live.checks.runs.map(
            (c) => `${c.name} · ${c.conclusion || c.status}`,
          ),
          ...(data.live.checks.has_more
            ? ["First 20 checks only; see GitHub for all runs."]
            : []),
          `Checked: ${data.live.checked_at}`,
          ...(data.binding.contribution_id
            ? [
                `Contribution #${data.binding.contribution_id} · revision ${data.binding.contribution_revision}`,
              ]
            : []),
          "Merging does not accept a result or mark a task ready.",
        ]
      : ["No pull request linked yet."]),
  ];
}
