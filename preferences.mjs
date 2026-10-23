export const preferenceDefaults = Object.freeze({
  notifications_enabled: true,
  notify_replies: true,
  notify_mentions: true,
  notify_subscriptions: true,
  notify_solutions: true,
  notify_projects: true,
  notify_events: true,
  show_event_reminders: true,
  compact_feed: false,
  reduce_motion: false,
});
export function preferences(db, id) {
  const saved = id
    ? JSON.parse(
        db.prepare("SELECT data FROM user_settings WHERE user_id=?").get(id)
          ?.data || "{}",
      )
    : {};
  return { ...preferenceDefaults, ...saved };
}
export function notificationAllowed(db, id, type) {
  const p = preferences(db, id);
  const key =
    type === "mention"
      ? "notify_mentions"
      : type === "reply"
        ? "notify_replies"
        : type.startsWith("solution")
          ? "notify_solutions"
          : type === "project_update"
            ? "notify_projects"
            : type.startsWith("event_")
              ? "notify_events"
              : null;
  return p.notifications_enabled && (!key || p[key]);
}
export function validUsername(value) {
  return (
    typeof value === "string" &&
    /^[a-zA-Z][a-zA-Z0-9_]{2,29}$/.test(value) &&
    !/^builder_\d+$|^deleted_/i.test(value)
  );
}
