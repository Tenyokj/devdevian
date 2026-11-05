import { canRead } from "./spaces.mjs";
import { transaction } from "./activity.mjs";
import { consumeBudget } from "./limits.mjs";
const kind = "project_access";
// A reserved entity_details namespace keeps policy atomic and included in the
// existing database backups. Presentation "team" details never grant access.
export function projectPolicy(db, id) {
  if (
    db.projectAccessReady !== true &&
    !db.prepare("SELECT 1 FROM sqlite_master WHERE name='entity_details'").get()
  )
    return { mode: "open", members: [], version: 0 };
  const row = db
    .prepare("SELECT data FROM entity_details WHERE kind=? AND entity_id=?")
    .get(kind, String(id));
  if (!row) return { mode: "open", members: [], version: 0 };
  const d = JSON.parse(row.data);
  if (
    !["open", "approved"].includes(d.mode) ||
    !Number.isSafeInteger(d.version) ||
    d.version < 1 ||
    !Array.isArray(d.members) ||
    d.members.length > 100 ||
    d.members.some((n) => !Number.isSafeInteger(n) || n < 1)
  )
    throw Error("Invalid project participation policy.");
  return d;
}
export function canParticipate(db, project, user) {
  if (!user || !canRead(db, user, project)) return false;
  if (project.user_id === user.id) return true;
  const p = projectPolicy(db, project.id);
  return p.mode === "open" || p.members.includes(user.id);
}
export function saveInitialParticipation(db, id, mode = "open") {
  if (!["open", "approved"].includes(mode))
    throw Error("Invalid participation mode.");
  if (mode === "approved")
    db.prepare(
      "INSERT INTO entity_details(kind,entity_id,data) VALUES(?,?,?)",
    ).run(kind, String(id), JSON.stringify({ mode, members: [], version: 1 }));
}
function project(db, id) {
  return db
    .prepare(
      "SELECT pr.*,p.community_id,p.removed_at,p.archived_at,p.locked_at FROM projects pr JOIN posts p ON p.id=pr.post_id WHERE pr.id=?",
    )
    .get(id);
}
export function postParticipation(db, id, user) {
  const linked = db
    .prepare("SELECT 1 FROM sqlite_master WHERE name='project_work_requests'")
    .get();
  const rows = db
    .prepare(
      `SELECT pr.*,p.community_id,p.removed_at FROM projects pr JOIN posts p ON p.id=pr.post_id WHERE (pr.post_id=? ${linked ? "OR pr.id IN (SELECT project_id FROM project_work_requests WHERE post_id=? AND linked=1)" : ""}) AND p.removed_at IS NULL`,
    )
    .all(...(linked ? [id, id] : [id]));
  const visible = rows.filter((p) => canRead(db, user, p));
  return {
    read_only: rows.some(
      (p) =>
        projectPolicy(db, p.id).mode === "approved" &&
        !canParticipate(db, p, user),
    ),
    project_ids: visible.map((p) => p.id),
  };
}
export function registerProjectAccess(app, db, required) {
  db.projectAccessReady = true;
  // Guard related conversation writes, including legacy reply/detail endpoints.
  // Reports, bookmarks, follows and removal of one's own content remain available.
  app.use("/api", (req, res, next) => {
    if (
      ["GET", "HEAD", "OPTIONS", "DELETE"].includes(req.method) ||
      /\/report$/.test(req.path)
    )
      return next();
    const projectId = req.path.match(/^\/projects\/([1-9]\d*)(?:\/|$)/)?.[1];
    if (projectId && !/\/participation$/.test(req.path)) {
      const pr = project(db, projectId);
      const cleanup =
        (req.path.includes("/room/tasks/") && req.body?.action === "release") ||
        (req.path.includes("/contributions/") &&
          req.body?.state === "withdrawn");
      if (
        pr &&
        !pr.removed_at &&
        canRead(db, req.user, pr) &&
        !cleanup &&
        !canParticipate(db, pr, req.user)
      )
        return res.status(req.user ? 403 : 401).json({
          error: "Only approved contributors can participate in this project.",
          code: "PROJECT_PARTICIPATION_REQUIRED",
        });
    }
    let id =
      req.path.match(/^\/posts\/([1-9]\d*)(?:\/|$)/)?.[1] ||
      req.path.match(/^\/details\/post\/([1-9]\d*)$/)?.[1];
    const reply = req.path.match(/^\/replies\/([1-9]\d*)$/)?.[1];
    if (reply)
      id = db
        .prepare("SELECT post_id FROM replies WHERE id=?")
        .get(reply)?.post_id;
    if (!id) return next();
    const post = db.prepare("SELECT * FROM posts WHERE id=?").get(id);
    if (!post || !canRead(db, req.user, post)) return next();
    if (postParticipation(db, id, req.user).read_only) {
      if (req.path.includes("/review-flow/") && req.body?.action === "decline")
        return next();
      return res.status(req.user ? 403 : 401).json({
        error:
          "This project allows participation only for approved contributors. You can still view its work.",
        code: "PROJECT_PARTICIPATION_REQUIRED",
      });
    }
    next();
  });
  const dto = (p, user) => {
    const d = projectPolicy(db, p.id),
      manage = user?.id === p.user_id;
    return {
      mode: d.mode,
      version: d.version,
      can_participate: canParticipate(db, p, user),
      can_manage: manage,
      ...(manage
        ? {
            members: d.members
              .map((id) =>
                db
                  .prepare(
                    "SELECT id,username FROM users WHERE id=? AND deleted_at IS NULL",
                  )
                  .get(id),
              )
              .filter(Boolean)
              .map((u) => ({ ...u, eligible: canRead(db, u, p) })),
          }
        : {}),
      capabilities: { project_participation: db.participationReady ? 1 : 0 },
    };
  };
  const target = (req, res, next) => {
    const p = project(db, req.params.id);
    if (!p || p.removed_at || !canRead(db, req.user, p))
      return res.status(404).json({ error: "Project not found." });
    req.accessProject = p;
    next();
  };
  app.get("/api/participation/config", (req, res) =>
    res.json({
      capabilities: { project_participation: db.participationReady ? 1 : 0 },
    }),
  );
  app.get("/api/projects/:id/participation", target, (req, res) =>
    res.json(dto(req.accessProject, req.user)),
  );
  app.put("/api/projects/:id/participation", required, target, (req, res) => {
    if (req.accessProject.user_id !== req.user.id)
      return res
        .status(403)
        .json({ error: "Only the project owner can manage participation." });
    if (!db.participationReady)
      return res.status(503).json({
        error: "Project participation is not prepared on this server.",
      });
    const b = req.body;
    if (
      !["open", "approved"].includes(b?.mode) ||
      !Number.isSafeInteger(b.expected_version) ||
      b.expected_version < 0 ||
      !Array.isArray(b.members) ||
      b.members.length > 100 ||
      b.members.some(
        (u) => typeof u !== "string" || !/^@?[a-zA-Z0-9_]{3,30}$/.test(u),
      )
    )
      return res.status(400).json({
        error:
          "Choose a participation mode, up to 100 usernames and the current policy version.",
      });
    consumeBudget(db, [
      { key: `project-access:${req.user.id}`, max: 40, window: 300000 },
    ]);
    const outcome = transaction(db, () => {
      const p = project(db, req.params.id);
      if (
        !p ||
        p.removed_at ||
        !canRead(db, req.user, p) ||
        p.user_id !== req.user.id
      )
        return { status: 404, error: "Project not found." };
      const current = projectPolicy(db, p.id);
      if (current.version !== b.expected_version)
        return {
          status: 409,
          error: "Participation settings changed. Reload before saving.",
        };
      const ids = [];
      for (const handle of b.members) {
        const u = db
          .prepare(
            "SELECT id FROM users WHERE username=? AND deleted_at IS NULL",
          )
          .get(handle.replace(/^@/, "").toLowerCase());
        if (!u || (!canRead(db, u, p) && !current.members.includes(u.id)))
          return {
            status: 400,
            error:
              "Every approved contributor must exist and already have access to the project audience.",
          };
        if (u.id === p.user_id) continue;
        if (ids.includes(u.id))
          return { status: 400, error: "Choose distinct contributors." };
        ids.push(u.id);
      }
      db.prepare(
        "INSERT INTO entity_details(kind,entity_id,data) VALUES(?,?,?) ON CONFLICT(kind,entity_id) DO UPDATE SET data=excluded.data",
      ).run(
        kind,
        String(p.id),
        JSON.stringify({
          mode: b.mode,
          members: ids,
          version: current.version + 1,
        }),
      );
      return { data: dto(p, req.user) };
    });
    res
      .status(outcome.status || 200)
      .json(outcome.data || { error: outcome.error });
  });
}
