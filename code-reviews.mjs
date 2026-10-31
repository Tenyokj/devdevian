import { notifyFeedback } from "./feedback-discussion.mjs";
import { createHash } from "node:crypto";
import { canRead, pageRows } from "./spaces.mjs";
import { consumeBudget } from "./limits.mjs";
import { transaction } from "./activity.mjs";

export const snippetHash = (code) =>
  createHash("sha256")
    .update(code || "")
    .digest("hex");
// Additive preparation preserves the old marker until the rolling deploy ends.
export function prepareCodeReviews(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS code_reviews(
    id INTEGER PRIMARY KEY,post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),snippet_hash TEXT NOT NULL,
    start_line INTEGER NOT NULL,end_line INTEGER NOT NULL,quote TEXT NOT NULL,body TEXT NOT NULL,
    resolved INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 1,
    created TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT);
    CREATE INDEX IF NOT EXISTS code_reviews_post ON code_reviews(post_id,id);`);
}
export function registerCodeReviews(app, db, required) {
  if (!db.schemaCurrent) prepareCodeReviews(db);
  const target = (req, res, next) => {
    const post = db
      .prepare("SELECT * FROM posts WHERE id=?")
      .get(req.params.id);
    if (!canRead(db, req.user, post))
      return res.status(404).json({ error: "Conversation not found." });
    if (post.kind !== "review")
      return res
        .status(400)
        .json({ error: "Line feedback requires a published code snippet." });
    req.reviewPost = post;
    next();
  };
  app.get("/api/posts/:id/code-reviews", target, (req, res) => {
    const hash = snippetHash(req.reviewPost.code);
    const filters = ["c.post_id=?"],
      args = [req.reviewPost.id];
    if (["open", "resolved"].includes(req.query.status)) {
      filters.push("c.resolved=?");
      args.push(req.query.status === "resolved" ? 1 : 0);
    }
    if (req.query.version === "current") {
      filters.push("c.snippet_hash=?");
      args.push(hash);
    }
    if (req.query.version === "earlier") {
      filters.push("c.snippet_hash<>?");
      args.push(hash);
    }
    // Counts cover all live remarks, independently of the selected page/filter.
    const counts = db
      .prepare(
        `SELECT
      COALESCE(SUM(CASE WHEN snippet_hash=? AND resolved=0 THEN 1 ELSE 0 END),0) open,
      COALESCE(SUM(CASE WHEN snippet_hash=? AND resolved=1 THEN 1 ELSE 0 END),0) resolved,
      COALESCE(SUM(CASE WHEN snippet_hash<>? THEN 1 ELSE 0 END),0) earlier
      FROM code_reviews WHERE post_id=? AND deleted_at IS NULL`,
      )
      .get(hash, hash, hash, req.reviewPost.id);
    // libSQL attaches non-column metadata to result rows. Expose only counts.
    const summary = {
      open: Number(counts.open),
      resolved: Number(counts.resolved),
      earlier: Number(counts.earlier),
    };
    const query = { ...req.query };
    if (query.target_id) {
      const target = db
        .prepare("SELECT id FROM code_reviews WHERE id=? AND post_id=?")
        .get(query.target_id, req.reviewPost.id);
      if (target) {
        query.page = Math.ceil(
          db
            .prepare(
              `SELECT COUNT(*) n FROM code_reviews c WHERE ${filters.join(" AND ")} AND c.id>=?`,
            )
            .get(...args, target.id).n / 10,
        );
      }
    }
    const page = pageRows(
      db,
      { ...req, query },
      `SELECT c.*,u.name,json_extract(d.data,'$.avatar') author_avatar FROM code_reviews c JOIN users u ON u.id=c.user_id LEFT JOIN entity_details d ON d.kind='user' AND d.entity_id=CAST(c.user_id AS TEXT) WHERE ${filters.join(" AND ")} ORDER BY c.id DESC`,
      args,
      10,
    );
    res.json({
      ...page,
      snippet_hash: hash,
      summary,
      items: page.items.map((row) => ({
        ...row,
        outdated: row.snippet_hash !== hash,
      })),
    });
  });
  app.post("/api/posts/:id/code-reviews", required, target, (req, res) => {
    const {
      start_line: start,
      end_line: end,
      body,
      snippet_hash: hash,
    } = req.body;
    const p = req.reviewPost,
      lines = (p.code || "").split("\n");
    if (!p.code)
      return res
        .status(400)
        .json({ error: "Publish a code snippet before adding line feedback." });
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 1 ||
      end < start ||
      end > lines.length ||
      end - start >= 50 ||
      typeof body !== "string" ||
      body.trim().length < 2 ||
      body.length > 5000
    )
      return res.status(400).json({
        error:
          "Choose up to 50 lines and write feedback between 2 and 5,000 characters.",
      });
    if (hash !== snippetHash(p.code))
      return res.status(409).json({
        error: "The snippet changed. Reload it before adding line feedback.",
      });
    if (p.archived_at || p.locked_at)
      return res
        .status(409)
        .json({ error: "Replies to this conversation are paused." });
    consumeBudget(db, [
      { key: `line-feedback:${req.user.id}`, max: 15, window: 300000 },
    ]);
    const id = transaction(db, () => {
      // A conditional insert guards against an edit/archive between validation and write.
      const result = db
        .prepare(
          `INSERT INTO code_reviews(post_id,user_id,snippet_hash,start_line,end_line,quote,body)
        SELECT id,?,?,?,?,?,? FROM posts WHERE id=? AND code=? AND kind='review' AND archived_at IS NULL AND locked_at IS NULL AND removed_at IS NULL
        AND (SELECT COUNT(*) FROM code_reviews WHERE post_id=?)<1000
        AND (community_id IS NULL OR EXISTS(SELECT 1 FROM memberships WHERE user_id=? AND kind='group' AND item=posts.community_id))`,
        )
        .run(
          req.user.id,
          hash,
          start,
          end,
          lines.slice(start - 1, end).join("\n"),
          body.trim(),
          p.id,
          p.code,
          p.id,
          req.user.id,
        );
      if (!result.changes) return null;
      const id = Number(result.lastInsertRowid);
      notifyFeedback(db, {
        recipients: [p.user_id],
        review: id,
        actor: req.user.id,
        post: p.id,
        type: "feedback_reply",
        key: `code-review:${id}`,
      });
      return id;
    });
    if (!id)
      return res.status(409).json({
        error:
          "The conversation changed or reached its line-feedback limit. Reload and try again.",
      });
    res.status(201).json({ id });
  });
}
