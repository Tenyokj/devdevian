// Visibility is a convenience; the API remains the permission authority.
export function contextActions({ route, data, selected, user, live }) {
  const actions = [],
    post = data?.post;
  const add = (id, label) => actions.push({ id, label });
  const feedback =
    route.view === "feedback" ||
    (route.view === "post" && route.tab === "feedback");
  const reply =
    route.view === "thread" ||
    (route.view === "post" && route.tab === "replies");
  if (selected) add("read", "Read selected item");
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
  if (post) add("browser", "Open conversation in browser");
  if (route.view === "inbox" && data?.unread_count > 0)
    add("read-all", "Mark received notifications as read");
  add("sync", "Refresh this view");
  add("live", live ? "Pause live updates" : "Resume live updates");
  return actions;
}
