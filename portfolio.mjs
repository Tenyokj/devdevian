import { pageRows } from "./spaces.mjs";
import { consumeBudget, privateKey, clientAddress } from "./limits.mjs";
import { transaction } from "./activity.mjs";
export function preparePortfolio(db) {
  if (
    db
      .prepare("SELECT 1 FROM sqlite_master WHERE name='portfolio_schema'")
      .get() &&
    db.prepare("SELECT version FROM portfolio_schema WHERE id=1").get()
      ?.version > 1
  )
    throw Error("Portfolio schema is newer than this release.");
  transaction(db, () =>
    db.exec(`CREATE TABLE IF NOT EXISTS portfolio_schema(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS portfolio_profiles(user_id INTEGER PRIMARY KEY REFERENCES users(id),pins TEXT NOT NULL,version INTEGER NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE INDEX IF NOT EXISTS portfolio_devlogs_author ON project_devlogs(user_id,status,id);
 INSERT INTO portfolio_schema VALUES(1,1) ON CONFLICT(id) DO NOTHING;`),
  );
}
// Public means public for every viewer, including the author and community members.
// A public-looking task in a private/removed project must not leak via a profile.
const visible = (p) =>
  `${p}.community_id IS NULL AND ${p}.removed_at IS NULL AND NOT EXISTS(SELECT 1 FROM project_work_requests pv_request JOIN projects pv_project ON pv_project.id=pv_request.project_id JOIN posts pv_post ON pv_post.id=pv_project.post_id WHERE pv_request.post_id=${p}.id AND pv_request.linked=1 AND (pv_post.community_id IS NOT NULL OR pv_post.removed_at IS NOT NULL))`;
const replyVisible = `NOT EXISTS(SELECT 1 FROM entity_details e WHERE e.kind='reply' AND e.entity_id=CAST(r.id AS TEXT) AND json_extract(e.data,'$.deleted_at') IS NOT NULL)`;
const pinSources = `SELECT 'project' kind,pr.id,pr.name title,substr(pr.description,1,220) excerpt,pr.created,p.id post_id,pr.id project_id FROM projects pr JOIN posts p ON p.id=pr.post_id WHERE pr.user_id=? AND ${visible("p")}
 UNION ALL SELECT 'conversation',p.id,p.title,substr(p.body,1,220),p.created,p.id,NULL FROM posts p WHERE p.user_id=? AND ${visible("p")} AND NOT EXISTS(SELECT 1 FROM projects pr WHERE pr.post_id=p.id)
 UNION ALL SELECT 'solution',r.id,p.title,substr(r.body,1,220),r.created,p.id,NULL FROM replies r JOIN posts p ON p.accepted_reply_id=r.id AND p.id=r.post_id WHERE r.user_id=? AND ${visible("p")} AND ${replyVisible}`;
const queries = {
  contributions: `SELECT c.id,p.title,substr(coalesce(cr.body,''),1,300) excerpt,c.updated_at created,p.id post_id,pr.id project_id,pr.name project_name,c.revision,NULL verdict,cr.pull_json FROM contributions c JOIN projects pr ON pr.id=c.project_id JOIN posts parent ON parent.id=pr.post_id JOIN posts p ON p.id=c.post_id JOIN project_work_requests w ON w.project_id=pr.id AND w.post_id=p.id AND w.linked=1 LEFT JOIN contribution_revisions cr ON cr.contribution_id=c.id AND cr.revision=c.revision WHERE c.user_id=? AND c.state='accepted' AND ${visible("p")} AND ${visible("parent")}`,
  reviews: `SELECT 'outcome-'||o.id id,p.title,substr(o.body,1,300) excerpt,o.created,p.id post_id,NULL project_id,NULL project_name,s.number revision,o.verdict,NULL pull_json FROM review_outcomes o JOIN posts p ON p.id=o.post_id JOIN review_revisions s ON s.id=o.snapshot_id AND s.post_id=p.id WHERE o.user_id=? AND ${visible("p")}
 UNION ALL SELECT 'remark-'||c.id,p.title,substr(c.body,1,300),c.created,p.id,NULL,NULL,NULL,'line_feedback',NULL FROM code_reviews c JOIN posts p ON p.id=c.post_id WHERE c.user_id=? AND c.deleted_at IS NULL AND ${visible("p")}`,
  devlogs: `SELECT 'v-'||d.id id,d.title,substr(d.body,1,300) excerpt,coalesce(d.published_at,d.created) created,p.id post_id,pr.id project_id,pr.name project_name,d.version revision,NULL verdict,NULL pull_json FROM project_devlogs d JOIN projects pr ON pr.id=d.project_id JOIN posts p ON p.id=pr.post_id WHERE d.user_id=? AND d.status='published' AND ${visible("p")}
 UNION ALL SELECT CAST(d.id AS TEXT),d.title,substr(d.body,1,300),d.created,p.id,pr.id,pr.name,1,NULL,NULL FROM project_updates d JOIN projects pr ON pr.id=d.project_id JOIN posts p ON p.id=pr.post_id WHERE d.user_id=? AND ${visible("p")} AND NOT EXISTS(SELECT 1 FROM project_devlogs x WHERE x.legacy_id=d.id)`,
};
const failure = (res, status, error) => res.status(status).json({ error });
const safePull = (raw) => {
  try {
    const p = JSON.parse(raw || "null");
    return /^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+\/pull\/[1-9]\d*$/.test(
      p?.url || "",
    )
      ? p.url
      : null;
  } catch {
    return null;
  }
};
export function registerPortfolio(app, db, required, { migrate = false } = {}) {
  if (!db.schemaCurrent || migrate) preparePortfolio(db);
  db.portfolioReady =
    db
      .prepare(
        "SELECT COUNT(*) n FROM sqlite_master WHERE (type='table' AND name IN ('portfolio_schema','portfolio_profiles')) OR (type='index' AND name='portfolio_devlogs_author')",
      )
      .get().n === 3 &&
    db.prepare("SELECT version FROM portfolio_schema WHERE id=1").get()
      ?.version === 1;
  const target = (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (
      !db.portfolioReady ||
      !db.devlogsReady ||
      !db.contributionsReady ||
      !db.reviewFlowReady
    )
      return failure(res, 503, "Portfolio is awaiting server preparation.");
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1)
      return failure(res, 400, "Choose a valid profile.");
    const p = db
      .prepare("SELECT id,privacy,deleted_at FROM users WHERE id=?")
      .get(id);
    if (!p || p.deleted_at || (p.privacy === "hidden" && req.user?.id !== id))
      return failure(res, 404, "Profile not found.");
    req.portfolioPerson = p;
    next();
  };
  const state = (id) =>
    db
      .prepare("SELECT pins,version FROM portfolio_profiles WHERE user_id=?")
      .get(id) || { pins: "[]", version: 0 };
  const selected = (id, pins) => {
    const rows = db
      .prepare(
        `SELECT work.* FROM (${pinSources}) work WHERE EXISTS(SELECT 1 FROM json_each(?) j WHERE json_extract(j.value,'$.kind')=work.kind AND json_extract(j.value,'$.id')=work.id)`,
      )
      .all(id, id, id, JSON.stringify(pins));
    const map = new Map(rows.map((r) => [r.kind + ":" + r.id, r]));
    return pins.map((p) => map.get(p.kind + ":" + p.id)).filter(Boolean);
  };
  app.get("/api/users/:id/portfolio", target, (req, res) => {
    const id = req.portfolioPerson.id,
      section = req.query.section || "overview",
      page = req.query.page || "1";
    if (
      !["overview", ...Object.keys(queries)].includes(section) ||
      typeof page !== "string" ||
      !/^\d{1,5}$/.test(page) ||
      Number(page) < 1
    )
      return failure(
        res,
        400,
        "Choose overview, contributions, reviews or devlogs and a valid page.",
      );
    consumeBudget(db, [
      {
        key:
          "portfolio-read:" +
          (req.user
            ? "user:" + req.user.id
            : "ip:" + privateKey(clientAddress(req))),
        max: 90,
        window: 60000,
      },
    ]);
    if (section !== "overview") {
      const sql = queries[section],
        args = Array(section === "contributions" ? 1 : 2).fill(id);
      const result = pageRows(
        db,
        { query: { page, limit: "8" } },
        `SELECT * FROM (${sql}) ORDER BY created DESC,id DESC`,
        args,
      );
      return res.json({
        ...result,
        items: result.items.map(({ pull_json, ...row }) => ({
          ...row,
          pull_url: safePull(pull_json),
        })),
        section,
      });
    }
    const row = state(id),
      pins = selected(id, JSON.parse(row.pins));
    const totals = db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM (${queries.contributions})) contributions,(SELECT COUNT(*) FROM (${queries.reviews})) reviews,(SELECT COUNT(*) FROM (${queries.devlogs})) devlogs,(SELECT COUNT(*) FROM projects pr JOIN posts p ON p.id=pr.post_id WHERE pr.user_id=? AND ${visible("p")}) projects`,
      )
      .get(...Array(6).fill(id));
    res.json({
      pins,
      version: row.version,
      totals,
      public_only: true,
      can_manage: req.user?.id === id,
    });
  });
  app.get(
    "/api/users/:id/portfolio/candidates",
    required,
    target,
    (req, res) => {
      const id = req.portfolioPerson.id;
      if (req.user.id !== id)
        return failure(res, 403, "Manage your own portfolio.");
      const q = req.query.q || "";
      if (typeof q !== "string" || q.length > 80)
        return failure(res, 400, "Use a search of up to 80 characters.");
      consumeBudget(db, [
        { key: "portfolio-candidates:" + id, max: 60, window: 60000 },
      ]);
      res.json({
        items: db
          .prepare(
            `SELECT * FROM (${pinSources}) WHERE instr(lower(title),lower(?))>0 ORDER BY created DESC,id DESC LIMIT 20`,
          )
          .all(id, id, id, q),
      });
    },
  );
  app.put("/api/users/:id/portfolio", required, target, (req, res) => {
    const id = req.portfolioPerson.id;
    if (req.user.id !== id)
      return failure(res, 403, "Manage your own portfolio.");
    const { pins, expected_version } = req.body || {};
    if (
      !Array.isArray(pins) ||
      pins.length > 6 ||
      !Number.isSafeInteger(expected_version) ||
      expected_version < 0 ||
      pins.some(
        (p) =>
          !p ||
          !["project", "conversation", "solution"].includes(p.kind) ||
          !Number.isSafeInteger(p.id) ||
          p.id < 1 ||
          Object.keys(p).some((k) => !["kind", "id"].includes(k)),
      ) ||
      new Set(pins.map((p) => p.kind + ":" + p.id)).size !== pins.length
    )
      return failure(
        res,
        400,
        "Choose up to six distinct public works and the current portfolio version.",
      );
    consumeBudget(db, [
      { key: "portfolio-write:" + id, max: 30, window: 300000 },
    ]);
    if (selected(id, pins).length !== pins.length)
      return failure(
        res,
        409,
        "A selected work is no longer public, available or yours. Refresh the selection.",
      );
    // One conditional write claims the captured version; stale tabs never overwrite.
    const updated =
      expected_version === 0
        ? db
            .prepare(
              "INSERT INTO portfolio_profiles(user_id,pins,version) VALUES(?,?,1) ON CONFLICT(user_id) DO NOTHING RETURNING version",
            )
            .get(id, JSON.stringify(pins))
        : db
            .prepare(
              "UPDATE portfolio_profiles SET pins=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND version=? RETURNING version",
            )
            .get(JSON.stringify(pins), id, expected_version);
    if (!updated)
      return failure(
        res,
        409,
        "Portfolio changed in another tab. Reload before saving; your selection is preserved.",
      );
    res.json({ version: updated.version, pins: selected(id, pins) });
  });
}
