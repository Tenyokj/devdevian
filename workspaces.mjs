import { roomEvent } from "./rooms.mjs";
import { canRead, pageRows, scopeSQL } from "./spaces.mjs";
import { transaction } from "./activity.mjs";
import { workspaceCapabilities } from "./review-revisions.mjs";
import { consumeBudget } from "./limits.mjs";
const states = ["open", "in_progress", "ready"];
const version = (n) => Number.isSafeInteger(n) && n >= 0;

export function registerWorkspaces(app, db, required) {
  const project = (req, res, next) => {
    const pr = db
      .prepare("SELECT * FROM projects WHERE id=?")
      .get(req.params.id);
    const parent =
      pr && db.prepare("SELECT * FROM posts WHERE id=?").get(pr.post_id);
    if (!pr || !canRead(db, req.user, parent) || parent.removed_at)
      return res.status(404).json({ error: "Project not found." });
    req.workspace = pr;
    next();
  };
  const visible = (req) =>
    `w.project_id=? AND w.linked=1 AND p.removed_at IS NULL AND ${scopeSQL("p", req.user)}`;
  app.get("/api/projects/:id/workspace", project, (req, res) => {
    const pr = req.workspace;
    const counts = db
      .prepare(
        `SELECT COUNT(*) total,COALESCE(SUM(w.state='open'),0) open,COALESCE(SUM(w.state='in_progress'),0) in_progress,COALESCE(SUM(w.state='ready'),0) ready FROM project_work_requests w JOIN posts p ON p.id=w.post_id WHERE ${visible(req)}`,
      )
      .get(pr.id);
    res.json({
      project: {
        id: pr.id,
        post_id: pr.post_id,
        name: pr.name,
        description: pr.description,
        user_id: pr.user_id,
        stage: pr.stage,
        help: pr.help,
        topic: pr.topic,
        stack: pr.stack,
        repo: pr.repo,
        url: pr.url,
      },
      capabilities: workspaceCapabilities,
      permissions: { manage_requests: req.user?.id === pr.user_id },
      counts: Object.fromEntries(
        ["total", ...states].map((k) => [k, Number(counts[k])]),
      ),
    });
  });
  app.get("/api/projects/:id/work-requests", project, (req, res) => {
    const where = [visible(req)],
      params = [req.workspace.id];
    if (req.query.kind !== undefined) {
      if (
        !["question", "discussion", "review", "showcase"].includes(
          req.query.kind,
        )
      )
        return res.status(400).json({ error: "Unknown request type." });
      where.push("p.kind=?");
      params.push(req.query.kind);
    }
    if (req.query.state !== undefined) {
      if (!states.includes(req.query.state))
        return res.status(400).json({ error: "Unknown work-request state." });
      where.push("w.state=?");
      params.push(req.query.state);
    }
    if (req.query.q) {
      where.push("(p.title LIKE ? OR p.body LIKE ?)");
      const q = "%" + String(req.query.q).slice(0, 200) + "%";
      params.push(q, q);
    }
    const page = pageRows(
      db,
      req,
      `SELECT p.id,p.title,p.kind,p.user_id,p.community_id,p.created,p.revision,substr(p.body,1,200) excerpt,u.name author_name,(SELECT json_extract(photo.data,'$.avatar') FROM entity_details photo WHERE photo.kind='user' AND photo.entity_id=CAST(u.id AS TEXT)) author_avatar,(SELECT COUNT(*) FROM replies r WHERE r.post_id=p.id) reply_count,w.project_id,w.state,w.version work_version,w.updated_at FROM project_work_requests w JOIN posts p ON p.id=w.post_id JOIN users u ON u.id=p.user_id WHERE ${where.join(" AND ")} ORDER BY p.id DESC`,
      params,
    );
    // Whitelist data columns; the libSQL adapter can attach row metadata.
    const fields = [
      "id",
      "title",
      "kind",
      "user_id",
      "community_id",
      "created",
      "revision",
      "project_id",
      "state",
      "work_version",
      "updated_at",
      "excerpt",
      "author_name",
      "reply_count",
    ];
    res.json({
      ...page,
      items: page.items.map((row) =>
        Object.fromEntries(fields.map((key) => [key, row[key]])),
      ),
      capabilities: workspaceCapabilities,
    });
  });
  app.get("/api/projects/:id/work-requests/:postId", project, (req, res) => {
    const p = db
      .prepare("SELECT * FROM posts WHERE id=?")
      .get(req.params.postId);
    if (!canRead(db, req.user, p) || p.removed_at)
      return res.status(404).json({ error: "Conversation not found." });
    const row = db
      .prepare("SELECT * FROM project_work_requests WHERE post_id=?")
      .get(p.id);
    if (row?.linked && row.project_id === req.workspace.id)
      return res.json({
        post_id: p.id,
        project_id: row.project_id,
        state: row.state,
        version: row.version,
        linked: true,
      });
    if (req.workspace.user_id !== req.user?.id || p.user_id !== req.user?.id)
      return res.status(404).json({ error: "Work request not found." });
    res.json({ post_id: p.id, linked: false, version: row?.version || 0 });
  });
  // Initial linking deliberately requires the same owner on both sides. Team
  // credits are attribution, not permission to curate another author's work.
  const mutate = (req, res) => {
    const pr = req.workspace,
      p = db.prepare("SELECT * FROM posts WHERE id=?").get(req.params.postId);
    if (!canRead(db, req.user, p) || p.removed_at)
      return res.status(404).json({ error: "Conversation not found." });
    if (pr.user_id !== req.user.id || p.user_id !== req.user.id)
      return res.status(403).json({
        error:
          "Only the owner of both the project and request can link or manage it.",
      });
    if (
      p.id === pr.post_id ||
      db.prepare("SELECT 1 FROM projects WHERE post_id=?").get(p.id)
    )
      return res
        .status(400)
        .json({ error: "Project introductions cannot be work requests." });
    if (
      !version(req.body.expected_version) ||
      (req.method !== "DELETE" && !states.includes(req.body.state))
    )
      return res.status(400).json({
        error:
          "Send a valid state and current work-request version (0 when linking).",
      });
    if (p.archived_at || p.locked_at)
      return res.status(409).json({ error: "This conversation is paused." });
    consumeBudget(db, [
      { key: `workspace-write:${req.user.id}`, max: 60, window: 300000 },
    ]);
    const result = transaction(db, () => {
      const current = db.prepare("SELECT * FROM posts WHERE id=?").get(p.id);
      const currentProject = db
        .prepare(
          "SELECT pr.user_id project_owner,p.* FROM projects pr JOIN posts p ON p.id=pr.post_id WHERE pr.id=?",
        )
        .get(pr.id);
      if (
        !canRead(db, req.user, current) ||
        !canRead(db, req.user, currentProject) ||
        current.removed_at ||
        currentProject.removed_at ||
        current.archived_at ||
        current.locked_at ||
        current.user_id !== req.user.id ||
        currentProject.project_owner !== req.user.id
      )
        return null;
      const row = db
        .prepare("SELECT * FROM project_work_requests WHERE post_id=?")
        .get(p.id);
      if (
        row &&
        ((row.linked && row.project_id !== pr.id) ||
          row.version !== req.body.expected_version)
      )
        return null;
      if (req.method === "DELETE") {
        if (!row?.linked) return null;
        db.prepare(
          "UPDATE project_work_requests SET linked=0,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE post_id=? AND version=?",
        ).run(p.id, row.version);
        roomEvent(db, pr.id, p.id, req.user.id, "task_unlinked");
        return { ok: true, version: row.version + 1 };
      }
      if (!row) {
        if (req.method !== "PUT" || req.body.expected_version !== 0)
          return null;
        db.prepare(
          "INSERT INTO project_work_requests(post_id,project_id,state,created_by) VALUES(?,?,?,?)",
        ).run(p.id, pr.id, req.body.state, req.user.id);
      } else {
        if (!row.linked && req.method !== "PUT") return null;
        db.prepare(
          "UPDATE project_work_requests SET project_id=?,linked=1,state=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE post_id=? AND version=?",
        ).run(pr.id, req.body.state, p.id, row.version);
      }
      roomEvent(
        db,
        pr.id,
        p.id,
        req.user.id,
        row?.linked ? "task_state_changed" : "task_linked",
        null,
        req.body.state,
      );
      return {
        post_id: p.id,
        project_id: pr.id,
        state: req.body.state,
        version: (row?.version || 0) + 1,
      };
    });
    if (!result)
      return res.status(409).json({
        error:
          "The work request changed or belongs to another project. Reload before trying again.",
      });
    res
      .status(
        req.method === "PUT" && req.body.expected_version === 0 ? 201 : 200,
      )
      .json(result);
  };
  for (const method of ["put", "patch", "delete"])
    app[method](
      "/api/projects/:id/work-requests/:postId",
      required,
      project,
      mutate,
    );
}
