import { details } from "./enhancements.mjs";
import { pageRows, canRead } from "./spaces.mjs";
import { attachments } from "./uploads.mjs";
export function replyPage(db, req, postId, parent = null) {
  const result = pageRows(
    db,
    req,
    `SELECT r.*,u.name,u.role,json_extract(meta.data,'$.deleted_at') deleted_at,(SELECT COUNT(*) FROM replies children WHERE children.parent_id=r.id) children_count FROM replies r JOIN users u ON u.id=r.user_id LEFT JOIN entity_details meta ON meta.kind='reply' AND meta.entity_id=CAST(r.id AS TEXT) WHERE r.post_id=? AND r.parent_id IS ? ORDER BY r.id`,
    [postId, parent],
    10,
  );
  return {
    ...result,
    items: result.items.map((r) => ({
      ...r,
      body: r.deleted_at ? "[deleted by author]" : r.body,
      author_avatar: details(db, "user", r.user_id).avatar,
      attachments: r.deleted_at ? [] : attachments(db, postId, r.id),
    })),
  };
}
export function replyPath(db, postId, target) {
  const path = [];
  let r = db
    .prepare("SELECT id,parent_id FROM replies WHERE id=? AND post_id=?")
    .get(target, postId);
  for (let i = 0; r && i < 20; i++) {
    const count = db
      .prepare(
        "SELECT COUNT(*) n FROM replies WHERE post_id=? AND parent_id IS ? AND id<=?",
      )
      .get(postId, r.parent_id, r.id).n;
    path.unshift({ ...r, page: Math.ceil(count / 10) });
    r = r.parent_id
      ? db
          .prepare("SELECT id,parent_id FROM replies WHERE id=? AND post_id=?")
          .get(r.parent_id, postId)
      : null;
  }
  return path;
}
export function registerReplies(app, db) {
  app.get("/api/posts/:id/replies", (req, res) => {
    const post = db
      .prepare("SELECT * FROM posts WHERE id=?")
      .get(req.params.id);
    if (!canRead(db, req.user, post))
      return res.status(404).json({ error: "Conversation not found." });
    const parent = req.query.parent_id ? Number(req.query.parent_id) : null;
    if (
      parent !== null &&
      (!Number.isSafeInteger(parent) ||
        !db
          .prepare("SELECT 1 FROM replies WHERE id=? AND post_id=?")
          .get(parent, post.id))
    )
      return res
        .status(400)
        .json({ error: "Choose a reply in this conversation." });
    res.json(replyPage(db, req, post.id, parent));
  });
}
