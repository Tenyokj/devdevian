import { canParticipate, projectPolicy } from "./project-access.mjs";
import { canRead, scopeSQL, pageRows } from "./spaces.mjs";
import { transaction, notify } from "./activity.mjs";
import { consumeBudget } from "./limits.mjs";
import { validUsername } from "./preferences.mjs";
const positive = (n) => Number.isSafeInteger(n) && n > 0;
const states = ["open", "in_progress", "ready"];
export function prepareRooms(db) {
  if (
    db.prepare("SELECT 1 FROM sqlite_master WHERE name='rooms_schema'").get() &&
    db.prepare("SELECT version FROM rooms_schema WHERE id=1").get()?.version > 1
  )
    throw Error("Rooms schema is newer than this release.");
  transaction(db, () =>
    db.exec(`
    CREATE TABLE IF NOT EXISTS rooms_schema(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS room_assignments(post_id INTEGER PRIMARY KEY REFERENCES posts(id),project_id INTEGER NOT NULL REFERENCES projects(id),user_id INTEGER REFERENCES users(id),updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS room_assignments_project ON room_assignments(project_id,user_id,post_id);
    CREATE TABLE IF NOT EXISTS room_decisions(id INTEGER PRIMARY KEY,project_id INTEGER NOT NULL REFERENCES projects(id),post_id INTEGER REFERENCES posts(id),user_id INTEGER NOT NULL REFERENCES users(id),title TEXT NOT NULL,body TEXT NOT NULL,archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),version INTEGER NOT NULL DEFAULT 1,operation_key TEXT NOT NULL,created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(project_id,operation_key));
    CREATE INDEX IF NOT EXISTS room_decisions_project ON room_decisions(project_id,archived,id);
    CREATE TABLE IF NOT EXISTS room_decision_history(id INTEGER PRIMARY KEY,decision_id INTEGER NOT NULL REFERENCES room_decisions(id),version INTEGER NOT NULL,post_id INTEGER REFERENCES posts(id),title TEXT NOT NULL,body TEXT NOT NULL,archived INTEGER NOT NULL,user_id INTEGER NOT NULL REFERENCES users(id),created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(decision_id,version));
    CREATE TRIGGER IF NOT EXISTS room_decision_history_immutable BEFORE UPDATE ON room_decision_history BEGIN SELECT RAISE(ABORT,'Decision history is immutable'); END;
    CREATE TABLE IF NOT EXISTS room_events(id INTEGER PRIMARY KEY,project_id INTEGER NOT NULL REFERENCES projects(id),post_id INTEGER REFERENCES posts(id),actor_id INTEGER NOT NULL REFERENCES users(id),type TEXT NOT NULL,target_id INTEGER,state TEXT,created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS room_events_project ON room_events(project_id,id);
    CREATE TRIGGER IF NOT EXISTS room_events_immutable BEFORE UPDATE ON room_events BEGIN SELECT RAISE(ABORT,'Room activity is immutable'); END;
    INSERT INTO rooms_schema VALUES(1,1) ON CONFLICT(id) DO UPDATE SET version=excluded.version;
  `),
  );
}
export function roomsReady(db) {
  return (
    db
      .prepare(
        "SELECT COUNT(*) n FROM sqlite_master WHERE (type='table' AND name IN ('rooms_schema','room_assignments','room_decisions','room_decision_history','room_events')) OR (type='index' AND name IN ('room_assignments_project','room_decisions_project','room_events_project')) OR (type='trigger' AND name IN ('room_decision_history_immutable','room_events_immutable'))",
      )
      .get().n === 10 &&
    db.prepare("SELECT version FROM rooms_schema WHERE id=1").get()?.version ===
      1
  );
}
export function roomEvent(
  db,
  project,
  post,
  actor,
  type,
  target = null,
  state = null,
) {
  if (db.roomsReady)
    db.prepare(
      "INSERT INTO room_events(project_id,post_id,actor_id,type,target_id,state) VALUES(?,?,?,?,?,?)",
    ).run(project, post, actor, type, target, state);
}
const boardSelect = `SELECT p.id,p.title,p.kind,p.user_id,p.community_id,p.created,p.archived_at,p.locked_at,substr(p.body,1,200) excerpt,w.state,w.version work_version,w.project_id,u.name author_name,a.user_id assignee_id,au.username assignee_username,au.name assignee_name FROM project_work_requests w JOIN posts p ON p.id=w.post_id JOIN users u ON u.id=p.user_id LEFT JOIN room_assignments a ON a.post_id=p.id AND a.project_id=w.project_id LEFT JOIN users au ON au.id=a.user_id AND au.deleted_at IS NULL`;
const clean = (row) =>
  Object.fromEntries(
    Object.entries(row).filter(([key]) => key !== "_metadata"),
  );
export function registerRooms(app, db, required, { migrate = false } = {}) {
  if (!db.schemaCurrent || migrate) prepareRooms(db);
  db.roomsReady = roomsReady(db);
  const project = (req, res, next) => {
    if (!db.roomsReady)
      return res.status(503).json({
        error: "Rooms are not prepared on this server.",
        capabilities: { rooms: 0 },
      });
    const pr = db
      .prepare(
        "SELECT pr.*,p.archived_at,p.locked_at,p.removed_at,p.community_id FROM projects pr JOIN posts p ON p.id=pr.post_id WHERE pr.id=?",
      )
      .get(req.params.id);
    if (!pr || pr.removed_at || !canRead(db, req.user, pr))
      return res.status(404).json({ error: "Room not found." });
    req.room = pr;
    next();
  };
  const fresh = (req) => {
    const pr = db
      .prepare(
        "SELECT pr.*,p.archived_at,p.locked_at,p.removed_at,p.community_id FROM projects pr JOIN posts p ON p.id=pr.post_id WHERE pr.id=?",
      )
      .get(req.room.id);
    return pr &&
      !pr.removed_at &&
      !pr.archived_at &&
      !pr.locked_at &&
      canRead(db, req.user, pr)
      ? pr
      : null;
  };
  const visible = (req) =>
    `w.project_id=? AND w.linked=1 AND p.removed_at IS NULL AND ${scopeSQL("p", req.user)}`;
  app.get("/api/projects/:id/room", project, (req, res) => {
    const pr = req.room;
    const counts = db
      .prepare(
        `SELECT COUNT(*) total,COALESCE(SUM(w.state='open'),0) open,COALESCE(SUM(w.state='in_progress'),0) in_progress,COALESCE(SUM(w.state='ready'),0) ready FROM project_work_requests w JOIN posts p ON p.id=w.post_id WHERE ${visible(req)}`,
      )
      .get(pr.id);
    res.json({
      capabilities: { rooms: 1 },
      project: {
        id: pr.id,
        name: pr.name,
        description: pr.description,
        goal: pr.help,
        stage: pr.stage,
        repo: pr.repo,
        url: pr.url,
        post_id: pr.post_id,
        user_id: pr.user_id,
      },
      counts: Object.fromEntries(
        ["total", ...states].map((k) => [k, Number(counts[k])]),
      ),
      permissions: {
        manage: req.user?.id === pr.user_id && !pr.archived_at && !pr.locked_at,
        participate: canParticipate(db, pr, req.user),
      },
      participation_mode: projectPolicy(db, pr.id).mode,
      paused: !!(pr.archived_at || pr.locked_at),
    });
  });
  app.get("/api/projects/:id/room/tasks", project, (req, res) => {
    const filters = [visible(req)],
      args = [req.room.id];
    if (req.query.state) {
      if (!states.includes(req.query.state))
        return res.status(400).json({ error: "Unknown task state." });
      filters.push("w.state=?");
      args.push(req.query.state);
    }
    if (req.query.mine === "1") {
      if (!req.user)
        return res.status(401).json({ error: "Sign in to view your tasks." });
      filters.push("a.user_id=? AND au.id IS NOT NULL");
      args.push(req.user.id);
    }
    if (req.query.q) {
      const q = "%" + String(req.query.q).slice(0, 160) + "%";
      filters.push("(p.title LIKE ? OR p.body LIKE ?)");
      args.push(q, q);
    }
    const page = pageRows(
      db,
      req,
      boardSelect + " WHERE " + filters.join(" AND ") + " ORDER BY p.id DESC",
      args,
    );
    res.json({
      ...page,
      items: page.items.map(clean),
      capabilities: { rooms: 1 },
    });
  });
  app.get("/api/projects/:id/room/tasks/:postId", project, (req, res) => {
    const task = db
      .prepare(boardSelect + " WHERE " + visible(req) + " AND p.id=?")
      .get(req.room.id, req.params.postId);
    if (!task) return res.status(404).json({ error: "Task not found." });
    res.json({
      task: clean(task),
      permissions: {
        manage: req.user?.id === req.room.user_id,
        participate: canParticipate(db, req.room, req.user),
      },
      capabilities: { rooms: 1 },
    });
  });
  app.post(
    "/api/projects/:id/room/tasks/:postId",
    required,
    project,
    (req, res) => {
      const input = req.body;
      if (
        !positive(input.expected_version) ||
        !["claim", "release", "assign", "state"].includes(input.action) ||
        (input.action === "state" && !states.includes(input.state))
      )
        return res
          .status(400)
          .json({ error: "Choose an action and the current task version." });
      consumeBudget(db, [
        { key: `room-write:${req.user.id}`, max: 80, window: 300000 },
      ]);
      const result = transaction(db, () => {
        const pr = fresh(req),
          row = db
            .prepare(
              "SELECT w.*,p.archived_at,p.locked_at,p.removed_at,p.community_id FROM project_work_requests w JOIN posts p ON p.id=w.post_id WHERE w.post_id=? AND w.project_id=? AND w.linked=1",
            )
            .get(req.params.postId, req.room.id);
        if (
          !pr ||
          !row ||
          row.removed_at ||
          row.archived_at ||
          row.locked_at ||
          !canRead(db, req.user, row) ||
          row.version !== input.expected_version
        )
          return null;
        const owner = pr.user_id === req.user.id;
        if (!canParticipate(db, pr, req.user) && input.action !== "release")
          return null;
        const assignment = db
          .prepare(
            "SELECT a.user_id FROM room_assignments a JOIN users u ON u.id=a.user_id AND u.deleted_at IS NULL WHERE a.post_id=? AND a.project_id=?",
          )
          .get(row.post_id, pr.id);
        let assignee = assignment?.user_id || null,
          next = row.state;
        if (input.action === "claim") {
          if (assignee) return null;
          assignee = req.user.id;
        }
        if (input.action === "release") {
          if (!assignee || (!owner && assignee !== req.user.id)) return null;
          assignee = null;
        }
        if (input.action === "assign") {
          if (!owner || !validUsername(input.username)) return null;
          const user = db
            .prepare(
              "SELECT id FROM users WHERE username=? AND privacy='public' AND deleted_at IS NULL",
            )
            .get(input.username.toLowerCase());
          if (
            !user ||
            !canRead(db, user, pr) ||
            !canRead(db, user, row) ||
            !canParticipate(db, pr, user)
          )
            return null;
          assignee = user.id;
        }
        if (input.action === "state") {
          if (!owner && assignee !== req.user.id) return null;
          if (next === input.state) return null;
          next = input.state;
        }
        db.prepare(
          "INSERT INTO room_assignments(post_id,project_id,user_id) VALUES(?,?,?) ON CONFLICT(post_id) DO UPDATE SET project_id=excluded.project_id,user_id=excluded.user_id,updated_at=CURRENT_TIMESTAMP",
        ).run(row.post_id, pr.id, assignee);
        db.prepare(
          "UPDATE project_work_requests SET state=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE post_id=? AND version=?",
        ).run(next, row.post_id, row.version);
        roomEvent(
          db,
          pr.id,
          row.post_id,
          req.user.id,
          input.action === "state"
            ? "task_state_changed"
            : assignee
              ? "task_assigned"
              : "task_released",
          assignee,
          next,
        );
        const recipient =
          assignee && assignee !== req.user.id ? assignee : pr.user_id;
        if (canRead(db, { id: recipient }, row))
          notify(db, {
            recipient,
            actor: req.user.id,
            post: row.post_id,
            type: "project_update",
            key: `room-task:${row.post_id}:${row.version + 1}`,
          });
        return {
          post_id: row.post_id,
          project_id: pr.id,
          state: next,
          work_version: row.version + 1,
          assignee_id: assignee,
        };
      });
      if (!result)
        return res.status(409).json({
          error:
            "The task changed, is paused, or this action is unavailable. Refresh before trying again.",
        });
      res.json(result);
    },
  );
  const decisionScope = (req) =>
    `d.project_id=? AND (d.post_id IS NULL OR (p.id IS NOT NULL AND p.removed_at IS NULL AND ${scopeSQL("p", req.user)}))`;
  app.get("/api/projects/:id/room/decisions", project, (req, res) => {
    const page = pageRows(
      db,
      req,
      `SELECT d.*,u.name author_name FROM room_decisions d JOIN users u ON u.id=d.user_id LEFT JOIN posts p ON p.id=d.post_id WHERE ${decisionScope(req)} AND d.archived=? ORDER BY d.id DESC`,
      [req.room.id, req.query.archived === "1" ? 1 : 0],
    );
    res.json({
      ...page,
      items: page.items.map(({ operation_key, ...row }) => clean(row)),
      capabilities: { rooms: 1 },
    });
  });
  app.get(
    "/api/projects/:id/room/decisions/:decisionId",
    project,
    (req, res) => {
      const d = db
        .prepare(
          `SELECT d.* FROM room_decisions d LEFT JOIN posts p ON p.id=d.post_id WHERE ${decisionScope(req)} AND d.id=?`,
        )
        .get(req.room.id, req.params.decisionId);
      if (!d) return res.status(404).json({ error: "Decision not found." });
      const { operation_key, ...decision } = d;
      res.json({ decision: clean(decision), capabilities: { rooms: 1 } });
    },
  );
  app.get(
    "/api/projects/:id/room/decisions/:decisionId/history",
    project,
    (req, res) => {
      const d = db
        .prepare(
          `SELECT d.id FROM room_decisions d LEFT JOIN posts p ON p.id=d.post_id WHERE ${decisionScope(req)} AND d.id=?`,
        )
        .get(req.room.id, req.params.decisionId);
      if (!d) return res.status(404).json({ error: "Decision not found." });
      const page = pageRows(
        db,
        req,
        `SELECT h.*,u.name author_name FROM room_decision_history h JOIN users u ON u.id=h.user_id LEFT JOIN posts p ON p.id=h.post_id WHERE h.decision_id=? AND (h.post_id IS NULL OR (p.id IS NOT NULL AND p.removed_at IS NULL AND ${scopeSQL("p", req.user)})) ORDER BY h.version DESC`,
        [d.id],
      );
      res.json({
        ...page,
        items: page.items.map(clean),
        capabilities: { rooms: 1 },
      });
    },
  );
  const decisionWrite = (req, res) => {
    const input = req.body,
      create = req.method === "POST";
    if (req.room.user_id !== req.user.id)
      return res
        .status(403)
        .json({ error: "Only the project owner can pin or edit decisions." });
    if (
      typeof input.title !== "string" ||
      input.title.trim().length < 3 ||
      input.title.length > 140 ||
      typeof input.body !== "string" ||
      input.body.trim().length < 2 ||
      input.body.length > 6000 ||
      !Number.isSafeInteger(input.expected_version) ||
      input.expected_version < 0 ||
      (input.post_id != null && !positive(input.post_id)) ||
      ![undefined, true, false].includes(input.archived) ||
      (create && !/^[a-zA-Z0-9-]{16,80}$/.test(input.operation_key || ""))
    )
      return res.status(400).json({
        error:
          "Include a title (3–140), explanation (2–6,000), current version and valid context.",
      });
    consumeBudget(db, [
      { key: `room-decisions:${req.user.id}`, max: 30, window: 300000 },
    ]);
    const result = transaction(db, () => {
      const pr = fresh(req);
      if (!pr || pr.user_id !== req.user.id) return null;
      const old = create
        ? null
        : db
            .prepare("SELECT * FROM room_decisions WHERE id=? AND project_id=?")
            .get(req.params.decisionId, pr.id);
      if (
        (create && input.expected_version !== 0) ||
        (!create && (!old || old.version !== input.expected_version))
      )
        return null;
      const postId = input.post_id || null;
      // A published decision cannot change audience. Edits preserve its linked
      // conversation so old private text cannot be made public via history.
      if (old && old.post_id !== postId) return null;
      if (postId) {
        const p = db
          .prepare(
            "SELECT p.* FROM project_work_requests w JOIN posts p ON p.id=w.post_id WHERE w.project_id=? AND w.post_id=? AND w.linked=1",
          )
          .get(pr.id, postId);
        if (!p || p.removed_at || !canRead(db, req.user, p)) return null;
      }
      if (create) {
        const previous = db
          .prepare(
            "SELECT * FROM room_decisions WHERE project_id=? AND operation_key=?",
          )
          .get(pr.id, input.operation_key);
        if (previous)
          return previous.user_id === req.user.id &&
            previous.title === input.title.trim() &&
            previous.body === input.body.trim() &&
            previous.post_id === postId
            ? { id: previous.id, version: previous.version, recovered: true }
            : null;
        if (
          db
            .prepare("SELECT COUNT(*) n FROM room_decisions WHERE project_id=?")
            .get(pr.id).n >= 100
        )
          return null;
      }
      if (
        !input.archived &&
        (!old || old.archived) &&
        db
          .prepare(
            "SELECT COUNT(*) n FROM room_decisions WHERE project_id=? AND archived=0",
          )
          .get(pr.id).n >= 12
      )
        return null;
      const revision = (old?.version || 0) + 1,
        archived = input.archived ? 1 : 0;
      const id =
        old?.id ||
        Number(
          db
            .prepare(
              "INSERT INTO room_decisions(project_id,post_id,user_id,title,body,operation_key) VALUES(?,?,?,?,?,?)",
            )
            .run(
              pr.id,
              postId,
              req.user.id,
              input.title.trim(),
              input.body.trim(),
              input.operation_key,
            ).lastInsertRowid,
        );
      db.prepare(
        "UPDATE room_decisions SET title=?,body=?,archived=?,version=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(input.title.trim(), input.body.trim(), archived, revision, id);
      db.prepare(
        "INSERT INTO room_decision_history(decision_id,version,post_id,title,body,archived,user_id) VALUES(?,?,?,?,?,?,?)",
      ).run(
        id,
        revision,
        postId,
        input.title.trim(),
        input.body.trim(),
        archived,
        req.user.id,
      );
      roomEvent(
        db,
        pr.id,
        postId,
        req.user.id,
        archived
          ? "decision_archived"
          : old
            ? "decision_updated"
            : "decision_pinned",
        id,
      );
      return { id, version: revision };
    });
    if (!result)
      return res.status(409).json({
        error:
          "The decision changed, its context is unavailable, or the room limit was reached. Refresh before trying again.",
      });
    res.status(create ? 201 : 200).json(result);
  };
  app.post(
    "/api/projects/:id/room/decisions",
    required,
    project,
    decisionWrite,
  );
  app.put(
    "/api/projects/:id/room/decisions/:decisionId",
    required,
    project,
    decisionWrite,
  );
  app.get("/api/projects/:id/room/activity", project, (req, res) => {
    const review = db.reviewFlowReady
      ? ` UNION ALL SELECT 'review-'||e.id id,e.type,e.actor_id,e.post_id,e.created,p.title,u.name actor_name,s.number revision_number FROM review_flow_events e JOIN posts p ON p.id=e.post_id JOIN project_work_requests w ON w.post_id=p.id AND w.linked=1 JOIN users u ON u.id=e.actor_id LEFT JOIN review_revisions s ON s.id=e.snapshot_id WHERE w.project_id=? AND p.removed_at IS NULL AND ${scopeSQL("p", req.user)}`
      : "";
    const sql = `SELECT * FROM (SELECT 'room-'||e.id id,e.type,e.actor_id,e.post_id,e.created,p.title,u.name actor_name,NULL revision_number FROM room_events e JOIN users u ON u.id=e.actor_id LEFT JOIN posts p ON p.id=e.post_id WHERE e.project_id=? AND (e.post_id IS NULL OR (p.id IS NOT NULL AND p.removed_at IS NULL AND ${scopeSQL("p", req.user)} AND EXISTS(SELECT 1 FROM project_work_requests w WHERE w.post_id=p.id AND w.project_id=e.project_id AND w.linked=1))) ${review}) ORDER BY created DESC,id DESC`;
    const page = pageRows(
      db,
      req,
      sql,
      db.reviewFlowReady ? [req.room.id, req.room.id] : [req.room.id],
    );
    res.json({
      ...page,
      items: page.items.map(clean),
      capabilities: { rooms: 1 },
    });
  });
}
