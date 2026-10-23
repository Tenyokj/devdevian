import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { mentionMatches, walkMentionText } from "./mention-syntax.mjs";
const parser = unified().use(remarkParse).use(remarkGfm);
export function mentionedHandles(body) {
  const handles = new Set();
  walkMentionText(parser.parse(body || ""), (node) => {
    for (const match of mentionMatches(node.value)) {
      if (handles.size < 10) handles.add(match.username.toLowerCase());
    }
  });
  return [...handles];
}
export function notifyMentions(
  db,
  { post, reply = null, actor, body, previous = "" },
) {
  const old = new Set(mentionedHandles(previous));
  const handles = mentionedHandles(body).filter((h) => !old.has(h));
  if (!handles.length) return;
  const key = reply ? `reply:${reply}` : `topic-post:${post}`;
  // One notification per recipient and publication/reply, even when it also
  // triggers a reply or topic-follow alert. Repeated edits cannot re-ping it.
  db.prepare(
    `INSERT OR IGNORE INTO notifications(recipient_id,actor_id,post_id,reply_id,type,event_key)
    SELECT u.id,?,?,?,'mention',? FROM users u JOIN posts p ON p.id=?
    LEFT JOIN user_settings settings ON settings.user_id=u.id
    WHERE u.username COLLATE NOCASE IN (${handles.map(() => "?").join(",")}) AND u.id<>? AND u.deleted_at IS NULL
    AND p.removed_at IS NULL AND (p.community_id IS NULL OR EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=u.id AND m.kind='group' AND m.item=p.community_id))
    AND COALESCE(json_extract(settings.data,'$.notifications_enabled'),1)=1
    AND COALESCE(json_extract(settings.data,'$.notify_mentions'),1)=1`,
  ).run(actor, post, reply, key, post, ...handles, actor);
}
