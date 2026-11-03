import { catalogActions } from "./catalog.mjs";
// Visibility is a convenience; the API remains the permission authority.
export function contextActions({ route, data, selected, user, live }) {
  const actions = catalogActions(route, data, user),
    post = data?.post;
  const add = (id, label) => actions.push({ id, label });
  if (["assigned", "reviewers"].includes(route.view)) {
    if (selected) {
      add("flow-original", "View assigned code");
      add("flow-post", "Open conversation");
      if (
        selected.reviewer_id === user?.id &&
        !selected.archived_at &&
        !selected.locked_at
      ) {
        if (selected.state === "pending") add("flow-accept", "Accept review");
        if (["pending", "accepted"].includes(selected.state))
          add("flow-decline", "Decline review");
        if (selected.state === "accepted")
          add("flow-outcome", "Share review outcome");
      }
      if (
        !selected.archived_at &&
        !selected.locked_at &&
        selected.requester_id === user?.id &&
        ["pending", "accepted"].includes(selected.state)
      )
        add("flow-cancel", "Cancel request");
    }
    if (
      data?.post?.user_id === user?.id &&
      !data.post.archived_at &&
      !data.post.locked_at
    )
      add("flow-invite", "Request a reviewer");
    add("sync", "Refresh this view");
    return actions;
  }
  if (route.view === "workspace")
    add("flow-activity", "Project review activity");
  if (route.view === "project") add("workspace", "Open project workspace");
  if (
    route.view === "workspace" &&
    selected &&
    data?.workspace?.permissions?.manage_requests
  )
    add("request-state", "Change selected work-request state");
  const feedback =
    route.view === "feedback" ||
    (route.view === "post" && route.tab === "feedback");
  const reply =
    route.view === "thread" ||
    (route.view === "post" && route.tab === "replies");
  if (selected && !route.view.startsWith("pr"))
    add("read", "Read selected item");
  if (post && !post.archived_at && !post.locked_at) {
    add("reply", "Write a reply");
    if (post.code) add("comment", "Comment on selected code lines");
  }
  if (
    (reply || feedback) &&
    selected &&
    user &&
    selected.user_id === user.id &&
    !selected.deleted_at
  ) {
    add("edit", "Edit your reply / remark");
    add("delete", "Delete your reply / remark…");
  }
  if (post && user && post.user_id === user.id) {
    const note =
      route.view === "feedback" ? data.note : feedback ? selected : null;
    if (note && !note.deleted_at)
      add("resolve", note.resolved ? "Reopen remark" : "Resolve remark");
    if (
      reply &&
      selected &&
      !selected.deleted_at &&
      ["question", "review"].includes(post.kind)
    )
      add(
        "solution",
        post.accepted_reply_id === selected.id
          ? "Remove accepted solution…"
          : "Accept as solution…",
      );
  }
  if (feedback && selected && !selected.deleted_at)
    add("report", "Report selected feedback…");
  // Keep actions on the selected reply/remark visible before global review tools.
  if (post?.code) {
    add("flow-reviewers", "Reviewers and outcomes");
    if (post.user_id === user?.id && !post.archived_at && !post.locked_at) {
      add("flow-invite", "Request a reviewer");
      const note = route.view === "feedback" ? data.note : selected;
      if (note?.outdated && note.snapshot_available)
        add("flow-link", "Link current revision to this remark");
    }
  }
  if (post?.code) {
    add("versions", "Review revision history");
    if (user?.id === post.user_id && !post.archived_at && !post.locked_at)
      add("revision", "Share another review revision");
    const note = route.view === "feedback" ? data.note : selected;
    if (note?.snapshot_available)
      add("original", "View remark’s original revision");
  }
  if (post?.github_context?.pull_request)
    add("github-pr", "Read linked GitHub PR");
  if (route.view === "pr" && data?.pull)
    add("pr-files", "Choose a file / inspect diff");
  if (route.view === "pr-diff" && data?.patch?.hunks?.length)
    add("pr-review", "Request review of selected hunks");
  if (["pr", "pr-files", "pr-diff"].includes(route.view) && data?.pull)
    add("pr-browser", "Open PR on GitHub");
  if (post) add("browser", "Open conversation in browser");
  if (route.view === "inbox" && data?.unread_count > 0)
    add("read-all", "Mark received notifications as read");
  add("sync", "Refresh this view");
  add("live", live ? "Pause live updates" : "Resume live updates");
  return actions;
}
