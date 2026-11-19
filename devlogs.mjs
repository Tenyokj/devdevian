import { randomUUID } from "node:crypto";
import { transaction } from "./activity.mjs";
import { canRead, pageRows } from "./spaces.mjs";
import { consumeBudget } from "./limits.mjs";

// Drafts never enter project_updates: older servers and rollback releases read
// that table without draft filters. Only published text is mirrored there.
export function prepareDevlogs(db) {
  if (
    db
      .prepare("SELECT 1 FROM sqlite_master WHERE name='devlogs_schema'")
      .get() &&
    db.prepare("SELECT version FROM devlogs_schema WHERE id=1").get()?.version >
      1
  )
    throw Error("Devlogs schema is newer than this release.");
  transaction(db, () =>
    db.exec(`
    CREATE TABLE IF NOT EXISTS devlogs_schema(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS project_devlogs(id INTEGER PRIMARY KEY,project_id INTEGER NOT NULL REFERENCES projects(id),user_id INTEGER NOT NULL REFERENCES users(id),title TEXT NOT NULL,body TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('draft','published')),version INTEGER NOT NULL DEFAULT 1,operation_key TEXT,legacy_id INTEGER UNIQUE REFERENCES project_updates(id),created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,published_at TEXT,updated_at TEXT,UNIQUE(user_id,operation_key));
    CREATE INDEX IF NOT EXISTS devlogs_project_status ON project_devlogs(project_id,status,id);
    INSERT INTO devlogs_schema VALUES(1,1) ON CONFLICT(id) DO NOTHING;
  `),
  );
}
export function devlogsReady(db) {
  return (
    db
      .prepare(
        "SELECT COUNT(*) n FROM sqlite_master WHERE (type='table' AND name IN ('devlogs_schema','project_devlogs')) OR (type='index' AND name='devlogs_project_status')",
      )
      .get().n === 3 &&
    db.prepare("SELECT version FROM devlogs_schema WHERE id=1").get()
      ?.version === 1
  );
}
const canonicalSelect =
  "SELECT 'v-'||id id,project_id,user_id,title,body,status,version,legacy_id,created,published_at,updated_at FROM project_devlogs";
const legacySelect =
  "SELECT CAST(u.id AS TEXT) id,u.project_id,u.user_id,u.title,u.body,'published' status,1 version,u.id legacy_id,u.created,u.created published_at,NULL updated_at FROM project_updates u WHERE NOT EXISTS(SELECT 1 FROM project_devlogs d WHERE d.legacy_id=u.id)";
const validId = (id) =>
  /^(?:v-)?[1-9]\d*$/.test(String(id)) &&
  Number.isSafeInteger(Number(String(id).replace(/^v-/, "")));
export function registerDevlogs(app, db, required, { migrate = false } = {}) {
  if (!db.schemaCurrent || migrate) prepareDevlogs(db);
  db.devlogsReady = devlogsReady(db);
  app.get("/api/devlogs/config", (req, res) =>
    res.json({ capabilities: { devlogs: db.devlogsReady ? 1 : 0 } }),
  );
  const project = (id) =>
    db
      .prepare(
        "SELECT pr.*,p.community_id,p.removed_at,p.archived_at,p.locked_at FROM projects pr JOIN posts p ON p.id=pr.post_id WHERE pr.id=?",
      )
      .get(id);
  const target = (req, res, next) => {
    if (!db.devlogsReady)
      return res
        .status(503)
        .json({ error: "Devlogs are not prepared on this server." });
    const p = project(req.params.id);
    if (!p || p.removed_at || !canRead(db, req.user, p))
      return res.status(404).json({ error: "Project not found." });
    req.devlogProject = p;
    next();
  };
  const get = (id) => {
    if (!validId(id)) return null;
    if (String(id).startsWith("v-"))
      return db
        .prepare(canonicalSelect + " WHERE id=?")
        .get(Number(id.slice(2)));
    return (
      db.prepare(canonicalSelect + " WHERE legacy_id=?").get(Number(id)) ||
      db.prepare(legacySelect + " AND u.id=?").get(Number(id))
    );
  };
  const dto = (d) => ({
    ...d,
    published_at: d.status === "published" ? d.published_at || d.created : null,
  });
  app.get("/api/projects/:id/devlogs", target, (req, res) => {
    const own = req.devlogProject.user_id === req.user?.id,
      status = req.query.status || "published";
    if (!["draft", "published"].includes(status))
      return res.status(400).json({ error: "Choose draft or published." });
    if (status === "draft" && !own)
      return res
        .status(403)
        .json({ error: "Drafts are visible only to the project owner." });
    const result = pageRows(
      db,
      req,
      `SELECT * FROM (${canonicalSelect} UNION ALL ${legacySelect}) WHERE project_id=? AND status=? ORDER BY COALESCE(published_at,created) DESC,id DESC`,
      [req.devlogProject.id, status],
      10,
    );
    res.json({
      ...result,
      items: result.items.map(dto),
      can_manage:
        own && !req.devlogProject.archived_at && !req.devlogProject.locked_at,
      project_id: req.devlogProject.id,
      capabilities: { devlogs: 1 },
    });
  });
  app.get("/api/projects/:id/devlogs/:devlog", target, (req, res) => {
    const d = get(req.params.devlog);
    if (
      !d ||
      d.project_id !== req.devlogProject.id ||
      (d.status === "draft" && req.user?.id !== req.devlogProject.user_id)
    )
      return res.status(404).json({ error: "Devlog not found." });
    res.json({ devlog: dto(d), capabilities: { devlogs: 1 } });
  });
  function notifyReaders(p, actor, id) {
    // A bounded number of SQL statements, even for popular projects. Current
    // memberships, account state and notification preferences remain authoritative.
    db.prepare(
      `INSERT OR IGNORE INTO notifications(recipient_id,actor_id,post_id,type,event_key)
      SELECT recipient.user_id,?,?,'project_update',? FROM (
        SELECT user_id FROM replies WHERE post_id=?
        UNION SELECT user_id FROM memberships WHERE kind='post' AND item=?
        UNION SELECT s.user_id FROM subscriptions s LEFT JOIN user_settings pref ON pref.user_id=s.user_id
          WHERE s.kind='post' AND s.item=? AND COALESCE(json_extract(pref.data,'$.notify_subscriptions'),1)=1
      ) recipient JOIN users u ON u.id=recipient.user_id LEFT JOIN user_settings settings ON settings.user_id=u.id
      WHERE u.deleted_at IS NULL AND u.id<>? AND COALESCE(json_extract(settings.data,'$.notifications_enabled'),1)=1
        AND COALESCE(json_extract(settings.data,'$.notify_projects'),1)=1
        AND (? IS NULL OR EXISTS(SELECT 1 FROM memberships acl WHERE acl.user_id=u.id AND acl.kind='group' AND acl.item=?))`,
    ).run(
      actor,
      p.post_id,
      `update:${id}`,
      p.post_id,
      String(p.post_id),
      String(p.post_id),
      actor,
      p.community_id,
      p.community_id,
    );
  }
  const write = (req, res) => {
    const { title, body } = req.body,
      status = req.body.status || "published",
      editing = !!req.params.devlog;
    const key =
      req.body.operation_key ||
      (!editing && req.path.endsWith("/updates") ? randomUUID() : null);
    if (
      typeof title !== "string" ||
      title.trim().length < (status === "draft" ? 1 : 5) ||
      title.length > 160 ||
      typeof body !== "string" ||
      body.trim().length < (status === "draft" ? 0 : 10) ||
      body.length > 10000 ||
      !["draft", "published"].includes(status) ||
      (editing
        ? !Number.isSafeInteger(req.body.expected_version) ||
          req.body.expected_version < 1
        : typeof key !== "string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(key))
    )
      return res.status(400).json({
        error:
          "Check the title (5–160), Markdown (10–10,000), version and publication key. Drafts may be incomplete.",
      });
    consumeBudget(db, [
      { key: `devlog-write:${req.user.id}`, max: 60, window: 300000 },
    ]);
    const result = transaction(db, () => {
      const p = project(req.params.id);
      if (!p || p.removed_at || !canRead(db, req.user, p))
        return { status: 404, error: "Project not found." };
      if (p.user_id !== req.user.id)
        return {
          status: 403,
          error: "Only the project owner can write Devlogs.",
        };
      if (p.archived_at || p.locked_at)
        return { status: 409, error: "This project is paused." };
      const previous = editing
        ? get(req.params.devlog)
        : db
            .prepare(canonicalSelect + " WHERE user_id=? AND operation_key=?")
            .get(req.user.id, key);
      if (previous && previous.project_id !== p.id)
        return {
          status: 409,
          error: "This publication key belongs to another project.",
        };
      if (!editing && previous) {
        if (
          previous.title !== title.trim() ||
          previous.body !== body.trim() ||
          previous.status !== status
        )
          return {
            status: 409,
            error:
              "This publication key was already used. Reload the saved Devlog.",
          };
        return {
          devlog: dto(previous),
          id: previous.id,
          post_id: p.post_id,
          replayed: true,
        };
      }
      if (editing && !previous)
        return { status: 404, error: "Devlog not found." };
      if (editing && previous.version !== req.body.expected_version)
        return {
          status: 409,
          error:
            "This Devlog changed. Reload before saving; your text has not been overwritten.",
        };
      if (previous?.status === "published" && status === "draft")
        return {
          status: 409,
          error: "A published Devlog cannot become a draft.",
        };
      const publishing =
        status === "published" && previous?.status !== "published";
      // Legacy rows are the publication ledger, so rollout-era writes count too.
      if (
        publishing &&
        db
          .prepare(
            "SELECT COUNT(*) n FROM project_updates WHERE user_id=? AND created>datetime('now','-1 day')",
          )
          .get(req.user.id).n >= 5
      )
        return {
          status: 429,
          error: "You can publish five project Devlogs a day.",
        };
      if (
        !editing &&
        status === "draft" &&
        db
          .prepare(
            "SELECT COUNT(*) n FROM project_devlogs WHERE user_id=? AND status='draft'",
          )
          .get(req.user.id).n >= 50
      )
        return { status: 429, error: "You can keep up to 50 server drafts." };
      let legacy = previous?.legacy_id || null;
      if (publishing) {
        legacy = Number(
          db
            .prepare(
              "INSERT INTO project_updates(project_id,user_id,title,body) VALUES(?,?,?,?)",
            )
            .run(p.id, req.user.id, title.trim(), body.trim()).lastInsertRowid,
        );
      } else if (status === "published")
        db.prepare(
          "UPDATE project_updates SET title=?,body=? WHERE id=? AND project_id=?",
        ).run(title.trim(), body.trim(), legacy, p.id);
      let id;
      if (previous?.id.startsWith("v-")) {
        id = previous.id;
        db.prepare(
          "UPDATE project_devlogs SET title=?,body=?,status=?,legacy_id=?,version=version+1,updated_at=CURRENT_TIMESTAMP,published_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE published_at END WHERE id=? AND version=?",
        ).run(
          title.trim(),
          body.trim(),
          status,
          legacy,
          publishing ? 1 : 0,
          Number(id.slice(2)),
          previous.version,
        );
      } else {
        id =
          "v-" +
          db
            .prepare(
              "INSERT INTO project_devlogs(project_id,user_id,title,body,status,version,operation_key,legacy_id,published_at,created) VALUES(?,?,?,?,?,?,?,?,CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE ? END,COALESCE(?,CURRENT_TIMESTAMP))",
            )
            .run(
              p.id,
              req.user.id,
              title.trim(),
              body.trim(),
              status,
              previous ? 2 : 1,
              key,
              legacy,
              publishing ? 1 : 0,
              previous?.published_at || null,
              previous?.created || null,
            ).lastInsertRowid;
      }
      if (publishing) notifyReaders(p, req.user.id, legacy);
      return {
        devlog: dto(get(id)),
        id: req.path.endsWith("/updates") ? legacy : id,
        post_id: p.post_id,
      };
    });
    res
      .status(result.status || (editing || result.replayed ? 200 : 201))
      .json(result.error ? { error: result.error } : result);
  };
  app.post("/api/projects/:id/devlogs", required, target, write);
  app.put("/api/projects/:id/devlogs/:devlog", required, target, write);
  app.post("/api/projects/:id/updates", required, target, write);
  app.delete(
    "/api/projects/:id/devlogs/:devlog",
    required,
    target,
    (req, res) => {
      if (req.devlogProject.user_id !== req.user.id)
        return res
          .status(403)
          .json({ error: "Only the owner can discard a draft." });
      const d = get(req.params.devlog);
      if (!d || d.project_id !== req.devlogProject.id)
        return res.status(404).json({ error: "Devlog not found." });
      if (d.status !== "draft")
        return res
          .status(409)
          .json({ error: "Published Devlogs cannot be discarded as drafts." });
      if (!Number.isSafeInteger(req.body?.expected_version))
        return res
          .status(400)
          .json({ error: "Include the current draft version." });
      const r = db
        .prepare(
          "DELETE FROM project_devlogs WHERE id=? AND project_id=? AND user_id=? AND status='draft' AND version=?",
        )
        .run(
          Number(d.id.slice(2)),
          d.project_id,
          req.user.id,
          req.body.expected_version,
        );
      if (!r.changes)
        return res
          .status(409)
          .json({ error: "This draft changed. Reload before discarding." });
      res.json({ id: d.id, discarded: true });
    },
  );
}
