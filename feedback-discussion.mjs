import { canRead, pageRows } from "./spaces.mjs";
import { canModeratePost } from "./enhancements.mjs";
import { moderator, moderationScope } from "./moderation.mjs";
import { consumeBudget } from "./limits.mjs";
import { transaction } from "./activity.mjs";
import { notificationAllowed } from "./preferences.mjs";

export function prepareFeedback(db) {
  for (const [table, column, type] of [
    ["code_reviews", "deleted_at", "TEXT"],
    ["code_reviews", "edited_at", "TEXT"],
    ["notifications", "code_review_id", "INTEGER"],
    ["notifications", "feedback_reply_id", "INTEGER"],
  ]) {
    if (
      !db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .some((c) => c.name === column)
    )
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
  db.exec(`CREATE TABLE IF NOT EXISTS code_review_replies(id INTEGER PRIMARY KEY,review_id INTEGER NOT NULL REFERENCES code_reviews(id),user_id INTEGER NOT NULL REFERENCES users(id),body TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,created TEXT DEFAULT CURRENT_TIMESTAMP,edited_at TEXT,deleted_at TEXT);
    CREATE INDEX IF NOT EXISTS code_review_replies_parent ON code_review_replies(review_id,id);
    CREATE TABLE IF NOT EXISTS feedback_reports(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,post_id INTEGER NOT NULL,review_id INTEGER NOT NULL,reply_id INTEGER NOT NULL DEFAULT 0,reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',created TEXT DEFAULT CURRENT_TIMESTAMP,reviewed_by INTEGER,reviewed_at TEXT,review_note TEXT,UNIQUE(user_id,review_id,reply_id));`);
}
export function notifyFeedback(
  db,
  {
    recipients,
    actor,
    post,
    review,
    reply = null,
    type = "feedback_reply",
    key,
  },
) {
  const parent = db.prepare("SELECT * FROM posts WHERE id=?").get(post);
  for (const recipient of new Set(recipients)) {
    if (
      !recipient ||
      recipient === actor ||
      !canRead(db, { id: recipient }, parent) ||
      !notificationAllowed(db, recipient, type)
    )
      continue;
    db.prepare(
      `INSERT OR IGNORE INTO notifications(recipient_id,actor_id,post_id,code_review_id,feedback_reply_id,type,event_key) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND deleted_at IS NULL)`,
    ).run(recipient, actor, post, review, reply, type, key, recipient);
  }
}
const validBody = (body) =>
  typeof body === "string" && body.trim().length >= 2 && body.length <= 5000;
export function registerFeedback(app, db, required) {
  if (!db.schemaCurrent) prepareFeedback(db);
  const target = (req, res, next) => {
    const post = db
      .prepare("SELECT * FROM posts WHERE id=?")
      .get(req.params.id);
    if (!canRead(db, req.user, post))
      return res.status(404).json({ error: "Conversation not found." });
    const review = db
      .prepare("SELECT * FROM code_reviews WHERE id=? AND post_id=?")
      .get(req.params.reviewId, post.id);
    if (!review)
      return res.status(404).json({ error: "Line feedback not found." });
    req.feedbackPost = post;
    req.feedbackReview = review;
    next();
  };
  const paused = (req, res) => {
    if (req.feedbackPost.archived_at || req.feedbackPost.locked_at) {
      res
        .status(409)
        .json({ error: "New feedback is paused for this conversation." });
      return true;
    }
    return false;
  };
  app.get(
    "/api/posts/:id/code-reviews/:reviewId/replies",
    target,
    (req, res) => {
      const query = { ...req.query };
      if (query.target_id) {
        const row = db
          .prepare(
            "SELECT id FROM code_review_replies WHERE id=? AND review_id=?",
          )
          .get(query.target_id, req.feedbackReview.id);
        if (row)
          query.page = Math.ceil(
            db
              .prepare(
                "SELECT COUNT(*) n FROM code_review_replies WHERE review_id=? AND id<=?",
              )
              .get(req.feedbackReview.id, row.id).n / 10,
          );
      }
      res.json(
        pageRows(
          db,
          { ...req, query },
          `SELECT r.*,u.name,json_extract(d.data,'$.avatar') author_avatar FROM code_review_replies r JOIN users u ON u.id=r.user_id LEFT JOIN entity_details d ON d.kind='user' AND d.entity_id=CAST(r.user_id AS TEXT) WHERE r.review_id=? ORDER BY r.id`,
          [req.feedbackReview.id],
          10,
        ),
      );
    },
  );
  app.post(
    "/api/posts/:id/code-reviews/:reviewId/replies",
    required,
    target,
    (req, res) => {
      if (paused(req, res)) return;
      if (!validBody(req.body.body))
        return res
          .status(400)
          .json({ error: "Write between 2 and 5,000 characters." });
      consumeBudget(db, [
        { key: `line-thread:${req.user.id}`, max: 15, window: 300000 },
      ]);
      const id = transaction(db, () => {
        const count = db
          .prepare(
            "SELECT COUNT(*) n FROM code_review_replies WHERE review_id=?",
          )
          .get(req.feedbackReview.id).n;
        if (count >= 500) return null;
        const id = Number(
          db
            .prepare(
              "INSERT INTO code_review_replies(review_id,user_id,body) VALUES(?,?,?)",
            )
            .run(req.feedbackReview.id, req.user.id, req.body.body.trim())
            .lastInsertRowid,
        );
        notifyFeedback(db, {
          recipients: [req.feedbackPost.user_id, req.feedbackReview.user_id],
          actor: req.user.id,
          post: req.feedbackPost.id,
          review: req.feedbackReview.id,
          reply: id,
          key: `feedback-reply:${id}`,
        });
        return id;
      });
      if (!id)
        return res
          .status(409)
          .json({ error: "This feedback thread has reached its reply limit." });
      res.status(201).json({ id });
    },
  );
  function mutate(req, res, isReply, remove = false) {
    const table = isReply ? "code_review_replies" : "code_reviews";
    const row = isReply
      ? db
          .prepare(
            "SELECT * FROM code_review_replies WHERE id=? AND review_id=?",
          )
          .get(req.params.replyId, req.feedbackReview.id)
      : req.feedbackReview;
    if (!row) return res.status(404).json({ error: "Feedback not found." });
    if (row.user_id !== req.user.id)
      return res
        .status(403)
        .json({ error: "Only the author can edit or delete this feedback." });
    if (
      !Number.isSafeInteger(req.body.revision) ||
      (!remove && !validBody(req.body.body))
    )
      return res
        .status(400)
        .json({ error: "Send the current revision and 2–5,000 characters." });
    const result = db
      .prepare(
        `UPDATE ${table} SET body=?,revision=revision+1,${remove ? "deleted_at" : "edited_at"}=CURRENT_TIMESTAMP WHERE id=? AND revision=? AND deleted_at IS NULL`,
      )
      .run(remove ? "" : req.body.body.trim(), row.id, req.body.revision);
    if (!result.changes)
      return res.status(409).json({
        error: "Feedback changed or was deleted. Reload before editing.",
      });
    // Keep the parent and its replies as a tombstone; never delete another member's work.
    res.json({ ok: true });
  }
  app.patch(
    "/api/posts/:id/code-reviews/:reviewId",
    required,
    target,
    (req, res) => {
      if (req.body.body !== undefined) return mutate(req, res, false);
      const p = req.feedbackPost,
        c = req.feedbackReview;
      if (p.user_id !== req.user.id)
        return res.status(403).json({
          error:
            "Only the publication author can resolve or reopen line feedback.",
        });
      if (c.deleted_at)
        return res.status(409).json({ error: "This feedback was deleted." });
      if (
        typeof req.body.resolved !== "boolean" ||
        !Number.isSafeInteger(req.body.revision)
      )
        return res
          .status(400)
          .json({ error: "Send the current revision and desired status." });
      const changed = transaction(db, () => {
        const r = db
          .prepare(
            "UPDATE code_reviews SET resolved=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=? AND deleted_at IS NULL",
          )
          .run(req.body.resolved ? 1 : 0, c.id, req.body.revision);
        if (r.changes && !!c.resolved !== req.body.resolved)
          notifyFeedback(db, {
            recipients: [c.user_id],
            actor: req.user.id,
            post: p.id,
            review: c.id,
            type: req.body.resolved ? "feedback_resolved" : "feedback_reopened",
            key: `feedback-status:${c.id}:${c.revision + 1}`,
          });
        return r.changes;
      });
      if (!changed)
        return res
          .status(409)
          .json({ error: "Feedback changed. Reload and try again." });
      res.json({ ok: true });
    },
  );
  app.delete(
    "/api/posts/:id/code-reviews/:reviewId",
    required,
    target,
    (req, res) => mutate(req, res, false, true),
  );
  app.patch(
    "/api/posts/:id/code-reviews/:reviewId/replies/:replyId",
    required,
    target,
    (req, res) => mutate(req, res, true),
  );
  app.delete(
    "/api/posts/:id/code-reviews/:reviewId/replies/:replyId",
    required,
    target,
    (req, res) => mutate(req, res, true, true),
  );
  app.post(
    "/api/posts/:id/code-reviews/:reviewId/report",
    required,
    target,
    (req, res) => {
      const reply = req.body.reply_id ?? 0;
      const row = reply
        ? db
            .prepare(
              "SELECT * FROM code_review_replies WHERE id=? AND review_id=?",
            )
            .get(reply, req.feedbackReview.id)
        : req.feedbackReview;
      if (!Number.isSafeInteger(reply) || reply < 0 || !row || row.deleted_at)
        return res.status(404).json({ error: "Feedback not found." });
      if (
        typeof req.body.reason !== "string" ||
        req.body.reason.trim().length < 5 ||
        req.body.reason.length > 1000
      )
        return res
          .status(400)
          .json({ error: "Explain the issue in 5–1,000 characters." });
      consumeBudget(db, [
        { key: `feedback-report:${req.user.id}`, max: 10, window: 3600000 },
      ]);
      db.prepare(
        `INSERT INTO feedback_reports(user_id,post_id,review_id,reply_id,reason) VALUES(?,?,?,?,?) ON CONFLICT(user_id,review_id,reply_id) DO UPDATE SET reason=excluded.reason,status='open',reviewed_by=NULL,reviewed_at=NULL,review_note=NULL`,
      ).run(
        req.user.id,
        req.feedbackPost.id,
        req.feedbackReview.id,
        reply,
        req.body.reason.trim(),
      );
      res.status(201).json({ ok: true });
    },
  );
  app.get("/api/moderation/code-feedback", required, moderator, (req, res) => {
    if (req.query.scope === "public" && req.user.platform_role !== "moderator")
      return res
        .status(403)
        .json({ error: "Only platform moderators can review public reports." });
    const status =
      req.query.filter === "reviewed" ? "r.status<>'open'" : "r.status='open'";
    res.json(
      pageRows(
        db,
        req,
        `SELECT r.*,p.title post_title,p.community_id,u.name reporter_name,CASE WHEN r.reply_id=0 THEN c.body ELSE cr.body END reported_body FROM feedback_reports r JOIN posts p ON p.id=r.post_id JOIN users u ON u.id=r.user_id JOIN code_reviews c ON c.id=r.review_id LEFT JOIN code_review_replies cr ON cr.id=r.reply_id WHERE ${moderationScope(req)} AND ${status} ORDER BY r.id DESC`,
        [],
        10,
      ),
    );
  });
  app.patch(
    "/api/moderation/code-feedback/:reportId",
    required,
    moderator,
    (req, res) => {
      const report = db
        .prepare("SELECT * FROM feedback_reports WHERE id=?")
        .get(req.params.reportId);
      const post =
        report &&
        db.prepare("SELECT * FROM posts WHERE id=?").get(report.post_id);
      if (!canRead(db, req.user, post))
        return res.status(404).json({ error: "Report not found." });
      if (!canModeratePost(db, req.user, post))
        return res
          .status(403)
          .json({ error: "This report belongs to another moderation team." });
      const { status, note, remove = false } = req.body;
      if (
        !["resolved", "dismissed"].includes(status) ||
        typeof note !== "string" ||
        note.trim().length < 5 ||
        note.length > 1000 ||
        typeof remove !== "boolean" ||
        (remove && status !== "resolved")
      )
        return res.status(400).json({
          error: "Choose a decision and explain it in 5–1,000 characters.",
        });
      const changed = transaction(db, () => {
        const r = db
          .prepare(
            "UPDATE feedback_reports SET status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,review_note=? WHERE id=? AND status='open'",
          )
          .run(status, req.user.id, note.trim(), report.id);
        if (!r.changes) return false;
        if (remove) {
          const table = report.reply_id
            ? "code_review_replies"
            : "code_reviews";
          db.prepare(
            `UPDATE ${table} SET body='',deleted_at=CURRENT_TIMESTAMP,revision=revision+1 WHERE id=?`,
          ).run(report.reply_id || report.review_id);
        }
        db.prepare(
          "INSERT INTO moderation_log(actor_id,post_id,action,reason) VALUES(?,?,?,?)",
        ).run(
          req.user.id,
          post.id,
          remove ? "feedback_removed" : "feedback_" + status,
          `Report #${report.id}: ${note.trim()}`,
        );
        return true;
      });
      if (!changed)
        return res
          .status(409)
          .json({ error: "This report has already been reviewed." });
      res.json({ ok: true });
    },
  );
}
