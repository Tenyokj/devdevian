import { workspaceId } from "./project-workspace.mjs";
export function participationPayload(mode, members, version) {
  if (!["open", "approved"].includes(mode))
    throw Error("Choose open or approved participation.");
  const list =
    typeof members === "string"
      ? members.split(/[\s,]+/).filter(Boolean)
      : members;
  if (
    !Array.isArray(list) ||
    list.length > 100 ||
    list.some((u) => typeof u !== "string" || !/^@?[a-zA-Z0-9_]{3,30}$/.test(u))
  )
    throw Error("Choose up to 100 valid usernames.");
  return { mode, members: list, expected_version: version };
}
export async function participationPlan(api, id) {
  id = workspaceId(id);
  const data = await api(`/projects/${id}/participation`);
  if (data.capabilities?.project_participation !== 1)
    throw Error("Project participation is not available on this server.");
  return {
    url: `/projects/${id}/participation`,
    method: "PUT",
    title: "Project participation",
    audience:
      "Project viewers; removal releases active tasks; approval does not grant private community access",
    payload: { expected_version: data.version },
    values: {
      mode: data.mode,
      members: (data.members || []).map((u) => "@" + u.username).join("\n"),
    },
    fields: [
      {
        key: "mode",
        label: "Participation mode",
        options: [
          ["open", "Open participation"],
          ["approved", "Approved contributors only"],
        ],
      },
      {
        key: "members",
        label: "Approved usernames (one per line)",
        multiline: true,
        max: 3200,
      },
    ],
    roomRoute: { view: "room", id, page: 1 },
    data,
  };
}
export function participationLines(d) {
  return [
    d.mode === "approved" ? "Approved contributors only" : "Open participation",
    d.can_participate
      ? "You can participate."
      : "Observer access: only approved contributors can join the work.",
    "Approval and community visibility are separate. Existing work is retained after removal.",
    ...(d.members || []).map(
      (u) => "@" + u.username + (u.eligible ? "" : " · needs community access"),
    ),
  ];
}
