import { requirePlatformOwner } from "./platform-owner.mjs";
import { inspectExtensionSecurity } from "./extension-security.mjs";
import { consumeBudget } from "./limits.mjs";
export function prepareExtensionReports(db) {
  db.exec(
    `CREATE TABLE IF NOT EXISTS extension_reports(id INTEGER PRIMARY KEY,release_id INTEGER NOT NULL,user_id INTEGER NOT NULL,reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open' CHECK(status IN('open','resolved','dismissed')),reviewer_id INTEGER,note TEXT NOT NULL DEFAULT '',created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,reviewed_at TEXT,UNIQUE(release_id,user_id)); CREATE INDEX IF NOT EXISTS extension_reports_queue ON extension_reports(status,id);`,
  );
}
const text = (s, min, max) =>
  typeof s === "string" &&
  s.trim().length >= min &&
  s.length <= max &&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s);
const page = (req) => {
  const n = Number(req.query.page || 1);
  return Number.isInteger(n) && n >= 1 && n <= 10000 ? n : null;
};
export function registerPlatformModeration(
  app,
  db,
  required,
  gate,
  { select, output, release },
) {
  const ready = !!db
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='extension_reports'",
    )
    .get();
  const reportGate = (req, res, next) =>
    ready
      ? next()
      : res
          .status(503)
          .json({ error: "Extension report storage is awaiting preparation." });
  app.post(
    "/api/extensions/releases/:id/report",
    required,
    gate,
    reportGate,
    (req, res) => {
      const r = release(req.params.id);
      if (!r || r.builtin)
        return res.status(404).json({ error: "Extension version not found." });
      if (!text(req.body?.reason, 10, 1000))
        return res
          .status(400)
          .json({ error: "Describe the concern in 10–1,000 characters." });
      consumeBudget(db, [
        { key: "extension-reports:" + req.user.id, max: 10, window: 86400000 },
      ]);
      const id = Number(r.id.slice(6));
      const result = db
        .prepare(
          "INSERT INTO extension_reports(release_id,user_id,reason) VALUES(?,?,?) ON CONFLICT(release_id,user_id) DO NOTHING",
        )
        .run(id, req.user.id, req.body.reason.trim());
      if (!result.changes)
        return res
          .status(409)
          .json({ error: "You have already reported this version." });
      res.status(201).json({ ok: true });
    },
  );
  const owner = [required, requirePlatformOwner, gate];
  app.get("/api/platform/extensions", ...owner, reportGate, (req, res) => {
    const p = page(req);
    if (!p) return res.status(400).json({ error: "Invalid page." });
    const filter = ["unreviewed", "reviewed", "withdrawn", "reported"].includes(
      req.query.filter,
    )
      ? req.query.filter
      : "unreviewed";
    const where =
      filter === "reported"
        ? " AND EXISTS(SELECT 1 FROM extension_reports r WHERE r.release_id=e.id AND r.status='open')"
        : " AND e.review=?";
    const args = filter === "reported" ? [] : [filter];
    const total = db
      .prepare(
        "SELECT COUNT(*) n FROM extension_releases e JOIN users u ON u.id=e.user_id WHERE u.deleted_at IS NULL" +
          where,
      )
      .get(...args).n;
    const items = db
      .prepare(select + where + " ORDER BY e.id DESC LIMIT 12 OFFSET ?")
      .all(...args, (p - 1) * 12)
      .map(output)
      .map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        version: r.version,
        review: r.review,
        author: r.author,
        created: r.created,
        security: inspectExtensionSecurity(r.manifest),
      }));
    res.json({
      items,
      pagination: { page: p, pages: Math.max(1, Math.ceil(total / 12)), total },
      scope: "platform",
    });
  });
  app.get("/api/platform/extensions/:id", ...owner, reportGate, (req, res) => {
    const r = release(req.params.id);
    if (!r || r.builtin)
      return res.status(404).json({ error: "Extension version not found." });
    const id = Number(r.id.slice(6));
    res.json({
      release: r,
      review_revision: db
        .prepare(
          "SELECT COALESCE(MAX(id),0) revision FROM extension_reviews WHERE release_id=?",
        )
        .get(id).revision,
      security: inspectExtensionSecurity(r.manifest),
      reports: db
        .prepare(
          "SELECT id,reason,status,note,created,reviewed_at FROM extension_reports WHERE release_id=? ORDER BY id DESC LIMIT 100",
        )
        .all(id),
      history: db
        .prepare(
          "SELECT status,note,created FROM extension_reviews WHERE release_id=? ORDER BY id DESC LIMIT 50",
        )
        .all(id),
    });
  });
  app.patch(
    "/api/platform/extension-reports/:id",
    ...owner,
    reportGate,
    (req, res) => {
      const { status, note } = req.body || {};
      if (!["resolved", "dismissed"].includes(status) || !text(note, 5, 1000))
        return res.status(400).json({
          error: "Choose a decision and add a note (5–1,000 characters).",
        });
      const result = db
        .prepare(
          "UPDATE extension_reports SET status=?,note=?,reviewer_id=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=? AND status='open'",
        )
        .run(status, note.trim(), req.user.id, req.params.id);
      if (!result.changes)
        return res
          .status(409)
          .json({ error: "Report was already reviewed or is unavailable." });
      res.json({ ok: true });
    },
  );
  // Deliberately excludes community posts, including communities owned by this owner.
  // Their existing community moderation remains a separate, membership-scoped route.
  app.get("/api/platform/content", ...owner, (req, res) => {
    const p = page(req);
    if (!p) return res.status(400).json({ error: "Invalid page." });
    const q = String(req.query.q || "")
      .trim()
      .slice(0, 80);
    const where =
      "p.community_id IS NULL AND (instr(lower(p.title),lower(?))>0 OR instr(lower(p.body),lower(?))>0)";
    const total = db
      .prepare("SELECT COUNT(*) n FROM posts p WHERE " + where)
      .get(q, q).n;
    const items = db
      .prepare(
        "SELECT p.id,p.title,p.created,p.removed_at,p.locked_at,u.name author_name,u.username author_username FROM posts p JOIN users u ON u.id=p.user_id WHERE " +
          where +
          " ORDER BY p.id DESC LIMIT 12 OFFSET ?",
      )
      .all(q, q, (p - 1) * 12);
    res.json({
      items,
      pagination: { page: p, pages: Math.max(1, Math.ceil(total / 12)), total },
      scope: "public-only",
    });
  });
}
