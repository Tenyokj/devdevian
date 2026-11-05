import { canParticipate } from "./project-access.mjs";
import { randomUUID } from "node:crypto";
import { transaction, notify } from "./activity.mjs";
import { canRead, scopeSQL, pageRows } from "./spaces.mjs";
import { consumeBudget } from "./limits.mjs";
import { roomEvent } from "./rooms.mjs";
import { publicPull, fetchPublicPull } from "./github-pulls.mjs";
import { githubRepository } from "./packages/cli/lib/github-context.mjs";
export function prepareContributions(db) {
  if (
    db
      .prepare("SELECT 1 FROM sqlite_master WHERE name='contributions_schema'")
      .get() &&
    db.prepare("SELECT version FROM contributions_schema WHERE id=1").get()
      ?.version > 1
  )
    throw Error("Contributions schema is newer than this release.");
  transaction(db, () =>
    db.exec(`
    CREATE TABLE IF NOT EXISTS contributions_schema(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS contribution_pulls(id TEXT PRIMARY KEY,url TEXT NOT NULL,snapshot TEXT NOT NULL,fetched_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS contribution_pulls_url ON contribution_pulls(url,fetched_at);
    CREATE TABLE IF NOT EXISTS contributions(id INTEGER PRIMARY KEY,project_id INTEGER NOT NULL REFERENCES projects(id),post_id INTEGER NOT NULL REFERENCES posts(id),user_id INTEGER NOT NULL REFERENCES users(id),state TEXT NOT NULL CHECK(state IN ('submitted','changes_requested','accepted','withdrawn')),version INTEGER NOT NULL,revision INTEGER NOT NULL,created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(project_id,post_id,user_id));
    CREATE INDEX IF NOT EXISTS contributions_project ON contributions(project_id,id);
    CREATE TABLE IF NOT EXISTS contribution_revisions(id INTEGER PRIMARY KEY,contribution_id INTEGER NOT NULL REFERENCES contributions(id),revision INTEGER NOT NULL,body TEXT NOT NULL,pull_json TEXT,operation_key TEXT NOT NULL,created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(contribution_id,revision),UNIQUE(contribution_id,operation_key));
    CREATE TABLE IF NOT EXISTS contribution_events(id INTEGER PRIMARY KEY,contribution_id INTEGER NOT NULL REFERENCES contributions(id),revision INTEGER NOT NULL,actor_id INTEGER NOT NULL REFERENCES users(id),state TEXT NOT NULL,body TEXT NOT NULL,created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS contribution_events_parent ON contribution_events(contribution_id,id);
    CREATE TRIGGER IF NOT EXISTS contribution_revisions_immutable BEFORE UPDATE ON contribution_revisions BEGIN SELECT RAISE(ABORT,'Contribution revisions are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS contribution_events_immutable BEFORE UPDATE ON contribution_events BEGIN SELECT RAISE(ABORT,'Contribution decisions are immutable'); END;
    INSERT INTO contributions_schema VALUES(1,1) ON CONFLICT(id) DO UPDATE SET version=excluded.version;
  `),
  );
}
export function contributionsReady(db) {
  return (
    db
      .prepare(
        "SELECT COUNT(*) n FROM sqlite_master WHERE (type='table' AND name IN ('contributions_schema','contributions','contribution_revisions','contribution_events','contribution_pulls')) OR (type='index' AND name IN ('contributions_project','contribution_pulls_url','contribution_events_parent')) OR (type='trigger' AND name IN ('contribution_revisions_immutable','contribution_events_immutable'))",
      )
      .get().n === 10 &&
    db.prepare("SELECT version FROM contributions_schema WHERE id=1").get()
      ?.version === 1
  );
}
const validBody = (b) =>
  typeof b === "string" && b.trim().length >= 2 && b.length <= 6000;
const positive = (n) => Number.isSafeInteger(n) && n > 0;
const key = (k) => typeof k === "string" && /^[a-zA-Z0-9-]{16,80}$/.test(k);
const select = `SELECT c.*,r.body,r.pull_json,p.title task_title,u.name author_name FROM contributions c JOIN contribution_revisions r ON r.contribution_id=c.id AND r.revision=c.revision JOIN project_work_requests w ON w.post_id=c.post_id AND w.project_id=c.project_id AND w.linked=1 JOIN posts p ON p.id=c.post_id JOIN users u ON u.id=c.user_id`;
const dto = (row) => {
  const { pull_json, ...rest } = row;
  const pull = pull_json ? JSON.parse(pull_json) : null;
  if (pull) delete pull.token;
  return { ...rest, pull };
};
export function registerContributions(
  app,
  db,
  required,
  { migrate = false } = {},
) {
  if (!db.schemaCurrent || migrate) prepareContributions(db);
  db.contributionsReady = contributionsReady(db);
  const project = (req, res, next) => {
    if (!db.contributionsReady || !db.roomsReady)
      return res.status(503).json({
        error: "Contributions are not prepared on this server.",
        capabilities: { contributions: 0 },
      });
    const pr = db
      .prepare(
        "SELECT pr.*,p.community_id,p.removed_at,p.archived_at,p.locked_at FROM projects pr JOIN posts p ON p.id=pr.post_id WHERE pr.id=?",
      )
      .get(req.params.id);
    if (!pr || pr.removed_at || !canRead(db, req.user, pr))
      return res.status(404).json({ error: "Project not found." });
    req.project = pr;
    next();
  };
  const where = (req) =>
    `c.project_id=? AND p.removed_at IS NULL AND ${scopeSQL("p", req.user)}`;
  const task = (req, id) =>
    db
      .prepare(
        `SELECT w.*,p.community_id,p.removed_at,p.archived_at,p.locked_at,a.user_id assignee_id FROM project_work_requests w JOIN posts p ON p.id=w.post_id LEFT JOIN room_assignments a ON a.post_id=w.post_id AND a.project_id=w.project_id WHERE w.project_id=? AND w.post_id=? AND w.linked=1 AND p.removed_at IS NULL AND ${scopeSQL("p", req.user)}`,
      )
      .get(req.project.id, id);
  const freshProject = (req) => {
    const pr = db
      .prepare(
        "SELECT pr.*,p.community_id,p.removed_at,p.archived_at,p.locked_at FROM projects pr JOIN posts p ON p.id=pr.post_id WHERE pr.id=?",
      )
      .get(req.project.id);
    if (
      !pr ||
      pr.removed_at ||
      pr.archived_at ||
      pr.locked_at ||
      !canRead(db, req.user, pr)
    )
      return false;
    req.project = pr;
    return true;
  };
  const paused = (req) => !!(req.project.archived_at || req.project.locked_at);
  const record = (req, c, state, body) => {
    db.prepare(
      "INSERT INTO contribution_events(contribution_id,revision,actor_id,state,body) VALUES(?,?,?,?,?)",
    ).run(c.id, c.revision, req.user.id, state, body);
    roomEvent(
      db,
      req.project.id,
      c.post_id,
      req.user.id,
      "contribution_" + state,
      c.id,
      state,
    );
    const recipient =
      req.user.id === req.project.user_id ? c.user_id : req.project.user_id;
    const target = { id: recipient };
    const t = task(req, c.post_id);
    if (t && canRead(db, target, req.project) && canRead(db, target, t))
      notify(db, {
        recipient,
        actor: req.user.id,
        post: c.post_id,
        type: "project_update",
        key: `contribution:${c.id}:${c.version}`,
      });
  };
  app.post(
    "/api/projects/:id/contributions/github",
    required,
    project,
    async (req, res) => {
      const ref = publicPull(req.body?.url);
      if (!ref)
        return res.status(400).json({
          error: "Use a public https://github.com/owner/repo/pull/123 URL.",
        });
      const repo = githubRepository(req.project.repo);
      if (repo && repo.toLowerCase() !== ref.repository.toLowerCase())
        return res.status(400).json({
          error: "Choose a PR from this project’s GitHub repository.",
        });
      consumeBudget(db, [
        { key: `contribution-github:${req.user.id}`, max: 20, window: 3600000 },
      ]);
      const cached = db
        .prepare(
          "SELECT * FROM contribution_pulls WHERE url=? AND fetched_at>? ORDER BY fetched_at DESC LIMIT 1",
        )
        .get(ref.url, Date.now() - 300000);
      if (cached)
        return res.json({
          token: cached.id,
          pull: JSON.parse(cached.snapshot),
          cached: true,
        });
      consumeBudget(db, [
        { key: "contribution-github:server", max: 30, window: 3600000 },
      ]);
      try {
        const pull = await fetchPublicPull(ref),
          id = randomUUID();
        db.prepare("INSERT INTO contribution_pulls VALUES(?,?,?,?)").run(
          id,
          ref.url,
          JSON.stringify(pull),
          Date.now(),
        );
        // Keep bounded, short-lived public cache. Submitted snapshots are copied.
        db.prepare("DELETE FROM contribution_pulls WHERE fetched_at<?").run(
          Date.now() - 3600000,
        );
        res.json({ token: id, pull, cached: false });
      } catch (e) {
        res.status(e.status || 503).json({
          error: e.status
            ? e.message
            : "Could not check GitHub. Your work is unchanged.",
        });
      }
    },
  );
  app.get("/api/projects/:id/contributions", project, (req, res) => {
    const filters = [where(req)],
      args = [req.project.id];
    if (
      req.query.post &&
      (typeof req.query.post !== "string" ||
        !/^[1-9]\d{0,12}$/.test(req.query.post))
    )
      return res.status(400).json({ error: "Choose a task ID." });
    if (req.query.post) {
      filters.push("c.post_id=?");
      args.push(req.query.post);
    }
    if (req.query.mine === "1") {
      if (!req.user)
        return res
          .status(401)
          .json({ error: "Sign in to view your contributions." });
      filters.push("c.user_id=?");
      args.push(req.user.id);
    }
    const rows = pageRows(
      db,
      req,
      select + " WHERE " + filters.join(" AND ") + " ORDER BY c.id DESC",
      args,
    );
    res.json({
      ...rows,
      items: rows.items.map(dto),
      capabilities: { contributions: 1 },
    });
  });
  app.get("/api/projects/:id/contributions/:cid", project, (req, res) => {
    const c = db
      .prepare(select + " WHERE " + where(req) + " AND c.id=?")
      .get(req.project.id, req.params.cid);
    if (!c) return res.status(404).json({ error: "Contribution not found." });
    const t = task(req, c.post_id),
      writable = !paused(req) && !t.archived_at && !t.locked_at;
    res.json({
      contribution: dto(c),
      permissions: {
        submit:
          writable &&
          canParticipate(db, req.project, req.user) &&
          t.assignee_id === req.user?.id &&
          c.user_id === req.user?.id &&
          !["accepted", "submitted"].includes(c.state),
        review:
          writable &&
          req.user?.id === req.project.user_id &&
          c.user_id !== req.user?.id &&
          c.state === "submitted",
        withdraw:
          writable && c.user_id === req.user?.id && c.state === "submitted",
      },
      capabilities: { contributions: 1 },
    });
  });
  app.get(
    "/api/projects/:id/contributions/:cid/history",
    project,
    (req, res) => {
      const c = db
        .prepare(select + " WHERE " + where(req) + " AND c.id=?")
        .get(req.project.id, req.params.cid);
      if (!c) return res.status(404).json({ error: "Contribution not found." });
      const revisions = pageRows(
        db,
        req,
        "SELECT * FROM contribution_revisions WHERE contribution_id=? ORDER BY revision DESC",
        [c.id],
      );
      res.json({
        ...revisions,
        items: revisions.items.map(({ operation_key, ...r }) => dto(r)),
        events: db
          .prepare(
            "SELECT e.*,u.name actor_name FROM contribution_events e JOIN users u ON u.id=e.actor_id WHERE e.contribution_id=? ORDER BY e.id DESC LIMIT 100",
          )
          .all(c.id),
        capabilities: { contributions: 1 },
      });
    },
  );
  app.post("/api/projects/:id/contributions", required, project, (req, res) => {
    const b = req.body || {};
    if (
      !positive(b.post_id) ||
      !validBody(b.body) ||
      !key(b.operation_key) ||
      !Number.isSafeInteger(b.expected_version) ||
      b.expected_version < 0 ||
      (b.pull_token != null && typeof b.pull_token !== "string")
    )
      return res.status(400).json({
        error: "Choose a task, describe the result and preserve its version.",
      });
    consumeBudget(db, [
      { key: `contribution-write:${req.user.id}`, max: 40, window: 300000 },
    ]);
    const result = transaction(db, () => {
      if (!freshProject(req)) return null;
      const t = task(req, b.post_id);
      if (
        !t ||
        paused(req) ||
        t.archived_at ||
        t.locked_at ||
        t.assignee_id !== req.user.id ||
        !canParticipate(db, req.project, req.user)
      )
        return null;
      let c = db
        .prepare(
          "SELECT * FROM contributions WHERE project_id=? AND post_id=? AND user_id=?",
        )
        .get(req.project.id, b.post_id, req.user.id);
      // Retry only the identical creation/revision, without producing another event.
      const existing =
        c &&
        db
          .prepare(
            "SELECT * FROM contribution_revisions WHERE contribution_id=? AND operation_key=?",
          )
          .get(c.id, b.operation_key);
      if (existing) {
        const p = existing.pull_json && JSON.parse(existing.pull_json);
        if (
          existing.body !== b.body.trim() ||
          (p?.token || null) !== (b.pull_token || null)
        )
          return null;
        return { id: c.id, recovered: true };
      }
      if (
        (c?.version || 0) !== b.expected_version ||
        (c && ["submitted", "accepted"].includes(c.state))
      )
        return null;
      if (c && c.revision >= 20) return null;
      let pull = null;
      if (b.pull_token) {
        const row = db
          .prepare(
            "SELECT * FROM contribution_pulls WHERE id=? AND fetched_at>?",
          )
          .get(b.pull_token, Date.now() - 900000);
        if (!row) return null;
        pull = { ...JSON.parse(row.snapshot), token: row.id };
        const repo = githubRepository(req.project.repo);
        if (repo && repo.toLowerCase() !== pull.repository.toLowerCase())
          return null;
      }
      if (!c) {
        const id = Number(
          db
            .prepare(
              "INSERT INTO contributions(project_id,post_id,user_id,state,version,revision) VALUES(?,?,?,'submitted',1,1)",
            )
            .run(req.project.id, b.post_id, req.user.id).lastInsertRowid,
        );
        c = {
          id,
          post_id: b.post_id,
          user_id: req.user.id,
          version: 1,
          revision: 1,
        };
      } else {
        c = { ...c, version: c.version + 1, revision: c.revision + 1 };
        db.prepare(
          "UPDATE contributions SET state='submitted',version=?,revision=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        ).run(c.version, c.revision, c.id);
      }
      db.prepare(
        "INSERT INTO contribution_revisions(contribution_id,revision,body,pull_json,operation_key) VALUES(?,?,?,?,?)",
      ).run(
        c.id,
        c.revision,
        b.body.trim(),
        pull ? JSON.stringify(pull) : null,
        b.operation_key,
      );
      record(req, c, "submitted", "");
      return { id: c.id };
    });
    if (!result)
      return res.status(409).json({
        error:
          "Task, assignment or contribution changed. Reload before submitting; an expired PR preview needs checking again.",
      });
    res.status(result.recovered ? 200 : 201).json(result);
  });
  app.post(
    "/api/projects/:id/contributions/:cid",
    required,
    project,
    (req, res) => {
      const b = req.body || {};
      if (
        !positive(b.expected_version) ||
        !positive(b.expected_revision) ||
        !["accepted", "changes_requested", "withdrawn"].includes(b.state) ||
        !validBody(b.body)
      )
        return res.status(400).json({
          error:
            "Choose a decision, explain it and preserve the reviewed revision.",
        });
      consumeBudget(db, [
        { key: `contribution-write:${req.user.id}`, max: 40, window: 300000 },
      ]);
      const ok = transaction(db, () => {
        if (!freshProject(req)) return false;
        const c = db
          .prepare(select + " WHERE " + where(req) + " AND c.id=?")
          .get(req.project.id, req.params.cid);
        if (!c) return false;
        const t = task(req, c.post_id);
        if (
          paused(req) ||
          t.archived_at ||
          t.locked_at ||
          c.version !== b.expected_version ||
          c.revision !== b.expected_revision ||
          c.state !== "submitted"
        )
          return false;
        if (
          b.state === "withdrawn"
            ? c.user_id !== req.user.id
            : req.project.user_id !== req.user.id || c.user_id === req.user.id
        )
          return false;
        db.prepare(
          "UPDATE contributions SET state=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        ).run(b.state, c.id);
        record(req, { ...c, version: c.version + 1 }, b.state, b.body.trim());
        return true;
      });
      res.status(ok ? 200 : 409).json(
        ok
          ? { ok: true }
          : {
              error:
                "Contribution changed or this decision is not allowed. Reload before reviewing.",
            },
      );
    },
  );
}
