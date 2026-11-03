export const flowSections = [
  ["waiting", "Waiting for me"],
  ["accepted", "In review"],
  ["sent", "Sent"],
  ["completed", "History"],
];
export const flowLabels = {
  pending: "Requested",
  accepted: "In review",
  declined: "Declined",
  cancelled: "Cancelled",
  completed: "Completed",
  changes_requested: "Changes requested",
  no_objections: "No objections",
};
export function flowID(id) {
  const n = Number(id);
  if (!Number.isSafeInteger(n) || n < 1)
    throw Error("Use a positive conversation/request ID.");
  return n;
}
export function requireFlow(data) {
  if (data?.capabilities?.review_flow !== 1)
    throw Error(
      "Review Flow is not prepared on this server. Existing conversations and drafts are unchanged.",
    );
  return data;
}
export async function flowPage(api, section = "waiting", page = 1, signal) {
  if (!flowSections.some(([id]) => id === section))
    throw Error("Choose waiting, accepted, sent or completed.");
  return requireFlow(
    await api(`/review-flow?section=${section}&page=${flowID(page)}`, {
      signal,
    }),
  );
}
export async function flowRequest(api, post, id) {
  post = flowID(post);
  id = flowID(id);
  const data = requireFlow(
    await api(`/posts/${post}/review-flow?target_id=${id}`),
  );
  const row = data.items.find((r) => r.id === id);
  if (!row) throw Error("Review request not found.");
  return row;
}
export function flowActionPlan(row, action) {
  if (!["accept", "decline", "cancel"].includes(action))
    throw Error("Choose accept, decline or cancel.");
  return {
    url: `/posts/${row.post_id}/review-flow/${row.id}`,
    method: "PATCH",
    payload: { action, expected_version: row.version },
    title: `${action} review request #${row.id}`,
    audience: row.community_id ? "Private community" : "Public conversation",
    context: `Assigned revision v${row.revision_number} · @${row.reviewer_username}`,
  };
}
export function flowOutcomePlan(row, verdict, body) {
  if (
    !["changes_requested", "no_objections"].includes(verdict) ||
    typeof body !== "string" ||
    body.trim().length < 2 ||
    body.length > 5000
  )
    throw Error(
      "Choose changes_requested or no_objections and write 2–5,000 characters.",
    );
  return {
    url: `/posts/${row.post_id}/review-flow/${row.id}/outcome`,
    method: "POST",
    payload: {
      revision_id: row.snapshot_id,
      expected_version: row.version,
      verdict,
      body,
    },
    title: `Review outcome for v${row.revision_number}`,
    audience: row.community_id ? "Private community" : "Public conversation",
  };
}
export async function flowInvitePlan(api, post, username, message = "") {
  post = flowID(post);
  const data = requireFlow(await api(`/posts/${post}/review-flow`));
  if (!data.permissions?.invite)
    throw Error("Only the conversation author can invite reviewers.");
  if (!data.current_revision_id)
    throw Error("Refresh the review before inviting.");
  return {
    url: `/posts/${post}/review-flow`,
    method: "POST",
    payload: {
      username,
      message,
      revision_id: data.current_revision_id,
      expected_revision: data.post_revision,
    },
    title: "Request a reviewer",
    audience: "Same audience as the review",
  };
}

// Explain the captured publication without exposing transport/CAS field names.
export function flowPreview(payload) {
  const labels = {
    username: "Reviewer",
    message: "Invitation context",
    body: "Explanation",
    verdict: "Outcome",
    action: "Action",
    revision_id: "Assigned snapshot",
    snapshot_id: "Newer snapshot",
    review_id: "Earlier remark",
  };
  return Object.entries(payload)
    .filter(
      ([key, value]) =>
        !["expected_version", "expected_revision"].includes(key) &&
        value !== "",
    )
    .map(
      ([key, value]) =>
        `${labels[key] || key}: ${key === "verdict" ? flowLabels[value] || value : value}`,
    );
}
