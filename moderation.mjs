import { manages, canModeratePost } from "./enhancements.mjs";
import { scopeSQL, canRead, pageRows } from "./spaces.mjs";
import { transaction } from "./activity.mjs";
export function moderator(req, res, next) {
  if (
    req.user?.platform_role !== "moderator" &&
    !req.user?.validator_communities?.length
  )
    return res.status(403).json({ error: "This space is for moderators." });
  next();
}
export function registerModeration(app, db, required) {
  if (!db.schemaCurrent) {
    const migrate = (table, column, type) => {
      if (
        !db
          .prepare(`PRAGMA table_info(${table})`)
          .all()
          .some((c) => c.name === column)
      )
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    };
    for (const name of ["archived_at", "locked_at", "lock_reason"])
      migrate("posts", name, "TEXT");
    for (const [name, type] of [
      ["status", "TEXT DEFAULT 'open'"],
      ["reviewed_by", "INTEGER"],
      ["reviewed_at", "TEXT"],
      ["review_note", "TEXT"],
    ])
      migrate("reports", name, type);
    db.exec(
      `CREATE TABLE IF NOT EXISTS moderation_log(id INTEGER PRIMARY KEY,actor_id INTEGER NOT NULL,post_id INTEGER NOT NULL,action TEXT NOT NULL,reason TEXT,created TEXT DEFAULT CURRENT_TIMESTAMP);`,
    );
  }
  app.post("/api/posts/:id/lifecycle", required, (req, res) => {
    const post = db
      .prepare("SELECT * FROM posts WHERE id=?")
      .get(req.params.id);
    if (!post)
      return res.status(404).json({ error: "Conversation not found." });
    const { action, reason = "" } = req.body;
    if (
      !["archive", "restore", "lock", "unlock", "remove", "unremove"].includes(
        action,
      )
    )
      return res.status(400).json({ error: "Choose a valid action." });
    if (["archive", "restore"].includes(action) && post.user_id !== req.user.id)
      return res.status(403).json({
        error: "Only the author can archive or restore this conversation.",
      });
    if (
      ["lock", "unlock", "remove", "unremove"].includes(action) &&
      !canModeratePost(db, req.user, post)
    )
      return res
        .status(403)
        .json({ error: "Only a moderator can change this restriction." });
    if (
      ["lock", "remove"].includes(action) &&
      (typeof reason !== "string" ||
        reason.trim().length < 5 ||
        reason.length > 1000)
    )
      return res
        .status(400)
        .json({ error: "Add a reason between 5 and 1,000 characters." });
    transaction(db, () => {
      if (action === "remove")
        db.prepare(
          "UPDATE posts SET removed_at=CURRENT_TIMESTAMP WHERE id=?",
        ).run(post.id);
      if (action === "unremove")
        db.prepare("UPDATE posts SET removed_at=NULL WHERE id=?").run(post.id);
      if (action === "archive")
        db.prepare(
          "UPDATE posts SET archived_at=COALESCE(archived_at,CURRENT_TIMESTAMP) WHERE id=?",
        ).run(post.id);
      if (action === "restore")
        db.prepare("UPDATE posts SET archived_at=NULL WHERE id=?").run(post.id);
      if (action === "lock")
        db.prepare(
          "UPDATE posts SET locked_at=CURRENT_TIMESTAMP,lock_reason=? WHERE id=?",
        ).run(reason.trim(), post.id);
      if (action === "unlock")
        db.prepare(
          "UPDATE posts SET locked_at=NULL,lock_reason=NULL WHERE id=?",
        ).run(post.id);
      db.prepare(
        "INSERT INTO moderation_log(actor_id,post_id,action,reason) VALUES(?,?,?,?)",
      ).run(
        req.user.id,
        post.id,
        action,
        ["lock", "remove"].includes(action) ? reason.trim() : null,
      );
    });
    res.json({ ok: true });
  });
  const moderationScope = (req) => {
    const managed = `((${scopeSQL("p", req.user)}) AND p.community_id IN (SELECT community_id FROM validators WHERE user_id=${Number(req.user.id)} UNION SELECT id FROM private_communities WHERE owner_id=${Number(req.user.id)}))`;
    if (req.query.scope === "communities") return managed;
    if (req.query.scope === "public")
      return req.user.platform_role === "moderator"
        ? "p.community_id IS NULL"
        : "0=1";
    return req.user.platform_role === "moderator"
      ? `(p.community_id IS NULL OR ${managed})`
      : managed;
  };
  app.get("/api/moderation/reports", required, moderator, (req, res) => {
    if (req.query.scope === "public" && req.user.platform_role !== "moderator")
      return res.status(403).json({
        error:
          "Only the Devdevian moderation team can review public feed reports.",
      });
    const status =
      req.query.filter === "reviewed"
        ? "r.status!='open'"
        : req.query.filter === "open"
          ? "r.status='open'"
          : "1=1";
    const reports = pageRows(
      db,
      req,
      `SELECT r.*,p.title post_title,p.body post_body,p.locked_at,p.archived_at,p.lock_reason,p.removed_at,p.community_id,(SELECT name FROM private_communities WHERE id=p.community_id) community_name,u.name reporter_name,author.name author_name FROM reports r JOIN posts p ON p.id=r.post_id JOIN users u ON u.id=r.user_id JOIN users author ON author.id=p.user_id WHERE ${moderationScope(req)} AND ${status} ORDER BY CASE WHEN r.status='open' THEN 0 ELSE 1 END,r.id DESC`,
      [],
      12,
    );
    const log = pageRows(
      db,
      { ...req, query: { ...req.query, page: req.query.log_page || 1 } },
      `SELECT l.*,u.name actor_name,p.title post_title FROM moderation_log l JOIN users u ON u.id=l.actor_id JOIN posts p ON p.id=l.post_id WHERE ${moderationScope(req)} ORDER BY l.id DESC`,
      [],
      12,
    );
    res.json({ ...reports, log: log.items, log_pagination: log.pagination });
  });
  app.patch("/api/moderation/reports/:id", required, moderator, (req, res) => {
    const report = db
      .prepare("SELECT * FROM reports WHERE id=?")
      .get(req.params.id);
    if (!report) return res.status(404).json({ error: "Report not found." });
    if (
      !canRead(
        db,
        req.user,
        db.prepare("SELECT * FROM posts WHERE id=?").get(report.post_id),
      )
    )
      return res.status(404).json({ error: "Report not found." });
    const post = db
      .prepare("SELECT * FROM posts WHERE id=?")
      .get(report.post_id);
    if (!canModeratePost(db, req.user, post))
      return res
        .status(403)
        .json({ error: "This report belongs to another moderation team." });
    const { status, note, lock = false, remove = false } = req.body;
    if (
      !["resolved", "dismissed"].includes(status) ||
      typeof note !== "string" ||
      note.trim().length < 5 ||
      note.length > 1000 ||
      typeof lock !== "boolean" ||
      typeof remove !== "boolean" ||
      (remove && status !== "resolved") ||
      (lock && status !== "resolved")
    )
      return res.status(400).json({
        error: "Choose a decision and add a review note (5–1,000 characters).",
      });
    if (report.status !== "open")
      return res.status(409).json({
        error: "This report has already been reviewed. Refresh the queue.",
      });
    transaction(db, () => {
      db.prepare(
        "UPDATE reports SET status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,review_note=? WHERE id=?",
      ).run(status, req.user.id, note.trim(), report.id);
      if (remove)
        db.prepare(
          "UPDATE posts SET removed_at=CURRENT_TIMESTAMP WHERE id=?",
        ).run(report.post_id);
      if (lock)
        db.prepare(
          "UPDATE posts SET locked_at=CURRENT_TIMESTAMP,lock_reason=? WHERE id=?",
        ).run(note.trim(), report.post_id);
      db.prepare(
        "INSERT INTO moderation_log(actor_id,post_id,action,reason) VALUES(?,?,?,?)",
      ).run(
        req.user.id,
        report.post_id,
        remove
          ? "report_resolved_remove"
          : lock
            ? "report_resolved_lock"
            : "report_" + status,
        note.trim(),
      );
    });
    res.json({
      ok: true,
      status,
      action: remove ? "hidden" : lock ? "replies_paused" : "recorded",
    });
  });
}
