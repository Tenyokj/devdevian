import { canParticipate } from "./project-access.mjs";
import { createHash } from "node:crypto";
import { transaction } from "./activity.mjs";
import { canRead } from "./spaces.mjs";
import { consumeBudget } from "./limits.mjs";
import { roomEvent } from "./rooms.mjs";
import { githubError } from "./github-app-core.mjs";
import { githubRepository } from "./packages/cli/lib/github-context.mjs";

export function prepareGitHubWork(db) {
  if (
    db
      .prepare("SELECT 1 FROM sqlite_master WHERE name='github_work_schema'")
      .get() &&
    db.prepare("SELECT version FROM github_work_schema WHERE id=1").get()
      ?.version > 1
  )
    throw Error("GitHub work schema is newer than this release.");
  transaction(db, () =>
    db.exec(`
    CREATE TABLE IF NOT EXISTS github_work_schema(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS github_issue_tasks(post_id INTEGER PRIMARY KEY REFERENCES posts(id),project_id INTEGER NOT NULL REFERENCES projects(id),url TEXT NOT NULL,snapshot TEXT NOT NULL,operation_key TEXT NOT NULL,created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(project_id,url),UNIQUE(project_id,operation_key));
    CREATE TABLE IF NOT EXISTS github_task_pulls(post_id INTEGER PRIMARY KEY REFERENCES posts(id),project_id INTEGER NOT NULL REFERENCES projects(id),url TEXT NOT NULL,version INTEGER NOT NULL,head TEXT NOT NULL,contribution_id INTEGER,contribution_revision INTEGER,operation_key TEXT NOT NULL,updated TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS github_task_pull_history(id INTEGER PRIMARY KEY,post_id INTEGER NOT NULL REFERENCES posts(id),project_id INTEGER NOT NULL REFERENCES projects(id),url TEXT NOT NULL,version INTEGER NOT NULL,head TEXT NOT NULL,contribution_id INTEGER,contribution_revision INTEGER,actor_id INTEGER NOT NULL REFERENCES users(id),operation_key TEXT NOT NULL,created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(post_id,version),UNIQUE(project_id,operation_key));
    CREATE INDEX IF NOT EXISTS github_task_history_parent ON github_task_pull_history(post_id,id);
    CREATE TRIGGER IF NOT EXISTS github_task_history_immutable BEFORE UPDATE ON github_task_pull_history BEGIN SELECT RAISE(ABORT,'GitHub task link history is immutable'); END;
    INSERT INTO github_work_schema VALUES(1,1) ON CONFLICT(id) DO UPDATE SET version=excluded.version;
  `),
  );
}
export function githubWorkReady(db) {
  return (
    db
      .prepare(
        "SELECT COUNT(*) n FROM sqlite_master WHERE (type='table' AND name IN ('github_work_schema','github_issue_tasks','github_task_pulls','github_task_pull_history')) OR (type='index' AND name='github_task_history_parent') OR (type='trigger' AND name='github_task_history_immutable')",
      )
      .get().n === 6 &&
    db.prepare("SELECT version FROM github_work_schema WHERE id=1").get()
      ?.version === 1
  );
}
export function githubWorkRef(value, kind) {
  if (typeof value !== "string")
    throw githubError("Choose a canonical GitHub URL.", 400);
  let u;
  try {
    u = new URL(value);
  } catch {
    throw githubError("Choose a canonical GitHub URL.", 400);
  }
  const m = u.pathname.match(
    /^\/([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9_.-]{1,100})\/(issues|pull)\/([1-9]\d{0,9})\/?$/,
  );
  if (
    u.origin !== "https://github.com" ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    !m ||
    m[3] !== kind ||
    [".", ".."].includes(m[2])
  )
    throw githubError("Choose a canonical GitHub " + kind + " URL.", 400);
  return {
    repository: `https://github.com/${m[1]}/${m[2]}`,
    url: `https://github.com/${m[1]}/${m[2]}/${kind}/${m[4]}`,
    path: `/repos/${m[1]}/${m[2]}/${kind === "pull" ? "pulls" : "issues"}/${m[4]}`,
    number: Number(m[4]),
  };
}
const fingerprint = (o) =>
  createHash("sha256").update(JSON.stringify(o)).digest("hex");
const fields = (row, names) =>
  Object.fromEntries(names.map((name) => [name, row[name]]));
const key = (v) => typeof v === "string" && /^[a-zA-Z0-9-]{16,80}$/.test(v);
export function registerGitHubWork(
  app,
  db,
  required,
  { migrate = false, get, repository, ready },
) {
  if (!db.schemaCurrent || migrate) prepareGitHubWork(db);
  db.githubWorkReady = githubWorkReady(db);
  const context = (req, write = false, taskId = null) => {
    if (!db.githubWorkReady || !db.roomsReady)
      throw githubError(
        "GitHub task integration is not prepared on this server.",
        503,
      );
    const pr = db
      .prepare(
        "SELECT pr.*,p.community_id,p.removed_at,p.archived_at,p.locked_at FROM projects pr JOIN posts p ON p.id=pr.post_id WHERE pr.id=?",
      )
      .get(req.params.id);
    if (!pr || pr.removed_at || !canRead(db, req.user, pr))
      throw githubError("Project not found.", 404);
    let task = null;
    if (taskId) {
      task = db
        .prepare(
          "SELECT p.*,w.version work_version,a.user_id assignee_id FROM project_work_requests w JOIN posts p ON p.id=w.post_id LEFT JOIN room_assignments a ON a.post_id=p.id AND a.project_id=w.project_id WHERE w.project_id=? AND p.id=? AND w.linked=1",
        )
        .get(pr.id, taskId);
      if (!task || task.removed_at || !canRead(db, req.user, task))
        throw githubError("Task not found.", 404);
    }
    if (
      write &&
      (!canParticipate(db, pr, req.user) ||
        pr.archived_at ||
        pr.locked_at ||
        task?.archived_at ||
        task?.locked_at ||
        (pr.user_id !== req.user.id &&
          (!task || task.assignee_id !== req.user.id)))
    )
      throw githubError(
        "Only the project owner or assigned teammate can change this active task.",
        403,
      );
    return { pr, task };
  };
  const fetchRef = async (req, value, kind, ctx) => {
    const ref = githubWorkRef(value, kind),
      bound =
        db
          .prepare(
            "SELECT repository FROM github_project_repos WHERE project_id=?",
          )
          .get(ctx.pr.id)?.repository || githubRepository(ctx.pr.repo);
    if (!bound || bound.toLowerCase() !== ref.repository.toLowerCase())
      throw githubError(
        "Use an issue or PR from the repository linked to this project.",
        409,
      );
    const repo = await repository(req, ref.repository),
      r = (await get(req, ref.path)).data;
    if (r.number !== ref.number || (kind === "issues" && r.pull_request))
      throw githubError("GitHub returned a different resource.", 409);
    if (r.html_url?.toLowerCase() !== ref.url.toLowerCase())
      throw githubError(
        "GitHub resource moved. Refresh its canonical URL.",
        409,
      );
    if (
      repo.private &&
      (!ctx.pr.community_id ||
        (ctx.task && ctx.task.community_id !== ctx.pr.community_id))
    )
      throw githubError(
        "Private GitHub content requires a task in the same private community as the project.",
        409,
      );
    const result = {
      ...ref,
      title: String(r.title || "").slice(0, 140),
      body: String(r.body || "").slice(0, 12000),
      state: r.state,
      updated_at: r.updated_at,
      private: !!repo.private,
    };
    if (kind === "pull") {
      if (
        !/^[a-f0-9]{40,64}$/.test(r.head?.sha || "") ||
        !/^[a-f0-9]{40,64}$/.test(r.base?.sha || "")
      )
        throw githubError("GitHub did not confirm the PR revision.", 409);
      Object.assign(result, {
        head: r.head.sha,
        base: r.base.sha,
        merged: !!r.merged,
        draft: !!r.draft,
      });
    }
    return { ...result, fingerprint: fingerprint(result) };
  };
  const consent = (b, ticket) => {
    if (ticket.private && b.share_private !== true)
      throw githubError(
        "Confirm that all approved members of this private community may read the saved GitHub copy.",
        400,
      );
  };
  app.post(
    "/api/projects/:id/github/issues/preview",
    required,
    ready,
    async (req, res) => {
      const ctx = context(req, true);
      const ticket = await fetchRef(req, req.body?.url, "issues", ctx);
      context(req, true);
      res.json({
        ticket,
        audience: ctx.pr.community_id
          ? "Private community"
          : "Public project room",
      });
    },
  );
  app.post(
    "/api/projects/:id/github/issues/import",
    required,
    ready,
    async (req, res) => {
      const b = req.body || {},
        ctx = context(req, true);
      if (!key(b.operation_key) || typeof b.fingerprint !== "string")
        throw githubError("Preview the issue before importing it.", 400);
      consumeBudget(db, [
        { key: `github-import:${req.user.id}`, max: 30, window: 86400000 },
      ]);
      const ticket = await fetchRef(req, b.url, "issues", ctx);
      consent(b, ticket);
      if (ticket.fingerprint !== b.fingerprint)
        throw githubError(
          "The issue changed. Preview it again before importing.",
          409,
        );
      const result = transaction(db, () => {
        const fresh = context(req, true);
        if (
          fresh.pr.community_id !== ctx.pr.community_id ||
          fresh.pr.repo !== ctx.pr.repo
        )
          throw githubError("Project audience changed. Preview again.", 409);
        const previous = db
          .prepare(
            "SELECT * FROM github_issue_tasks WHERE project_id=? AND (url=? OR operation_key=?)",
          )
          .get(ctx.pr.id, ticket.url, b.operation_key);
        if (previous) {
          if (previous.url !== ticket.url)
            throw githubError(
              "This operation was already used for a different issue.",
              409,
            );
          context(req, false, previous.post_id);
          return { post_id: previous.post_id, recovered: true };
        }
        if (
          db
            .prepare(
              "SELECT COUNT(*) n FROM github_issue_tasks WHERE project_id=?",
            )
            .get(ctx.pr.id).n >= 500
        )
          throw githubError("This room reached its imported issue limit.", 409);
        const body = `${ticket.body || "GitHub issue imported for discussion."}\n\nSource: ${ticket.url}\n\nSaved copy · GitHub ${ticket.state}. Changes here do not update GitHub.`;
        const id = Number(
          db
            .prepare(
              "INSERT INTO posts(user_id,title,body,kind,topic,stack,community_id,code,review_focus,repo_url,demo_url) VALUES(?,?,?,'discussion',?,?,?,'','',?,'')",
            )
            .run(
              req.user.id,
              ticket.title || `Issue #${ticket.number}`,
              body,
              ctx.pr.topic || "web",
              ctx.pr.stack || "",
              ctx.pr.community_id,
              ticket.repository,
            ).lastInsertRowid,
        );
        db.prepare(
          "INSERT INTO project_work_requests(post_id,project_id,state,created_by) VALUES(?,?,'open',?)",
        ).run(id, ctx.pr.id, req.user.id);
        db.prepare(
          "INSERT INTO github_issue_tasks(post_id,project_id,url,snapshot,operation_key) VALUES(?,?,?,?,?)",
        ).run(
          id,
          ctx.pr.id,
          ticket.url,
          JSON.stringify(ticket),
          b.operation_key,
        );
        roomEvent(
          db,
          ctx.pr.id,
          id,
          req.user.id,
          "github_issue_imported",
          ticket.number,
          "open",
        );
        return { post_id: id, recovered: false };
      });
      res.status(result.recovered ? 200 : 201).json(result);
    },
  );
  const taskRoot = "/api/projects/:id/room/tasks/:postId/github";
  app.post(taskRoot + "/preview", required, ready, async (req, res) => {
    const ctx = context(req, true, req.params.postId),
      ticket = await fetchRef(req, req.body?.url, "pull", ctx);
    context(req, true, req.params.postId);
    const old = db
      .prepare("SELECT version FROM github_task_pulls WHERE post_id=?")
      .get(ctx.task.id);
    res.json({
      ticket,
      expected_version: old?.version || 0,
      task_version: ctx.task.work_version,
    });
  });
  app.post(taskRoot, required, ready, async (req, res) => {
    const b = req.body || {},
      ctx = context(req, true, req.params.postId);
    if (
      !key(b.operation_key) ||
      !Number.isSafeInteger(b.expected_version) ||
      b.expected_version < 0
    )
      throw githubError("Preview the PR and preserve its link version.", 400);
    consumeBudget(db, [
      { key: `github-task-link:${req.user.id}`, max: 40, window: 3600000 },
    ]);
    const ticket = await fetchRef(req, b.url, "pull", ctx);
    consent(b, ticket);
    if (ticket.fingerprint !== b.fingerprint)
      throw githubError(
        "The PR changed. Preview it again before linking.",
        409,
      );
    const result = transaction(db, () => {
      const fresh = context(req, true, req.params.postId);
      if (
        fresh.task.work_version !== b.task_version ||
        fresh.pr.community_id !== ctx.pr.community_id ||
        fresh.task.community_id !== ctx.task.community_id ||
        fresh.pr.repo !== ctx.pr.repo
      )
        throw githubError("Task or audience changed. Preview again.", 409);
      const old = db
        .prepare("SELECT * FROM github_task_pulls WHERE post_id=?")
        .get(ctx.task.id);
      if (old && old.project_id !== ctx.pr.id)
        throw githubError(
          "This task has a GitHub link in a different project room.",
          409,
        );
      const retry = db
        .prepare(
          "SELECT * FROM github_task_pull_history WHERE project_id=? AND operation_key=?",
        )
        .get(ctx.pr.id, b.operation_key);
      if (retry) {
        if (
          retry.post_id !== ctx.task.id ||
          retry.url !== ticket.url ||
          retry.head !== ticket.head ||
          (retry.contribution_id || null) !== (b.contribution_id || null)
        )
          throw githubError(
            "Operation already used for a different link.",
            409,
          );
        return { version: retry.version, recovered: true };
      }
      if ((old?.version || 0) !== b.expected_version)
        throw githubError("The PR link changed. Refresh before editing.", 409);
      let c = null;
      if (b.contribution_id != null) {
        if (!Number.isSafeInteger(b.contribution_id) || !db.contributionsReady)
          throw githubError("Choose a valid contribution.", 400);
        c = db
          .prepare(
            "SELECT * FROM contributions WHERE id=? AND project_id=? AND post_id=?",
          )
          .get(b.contribution_id, ctx.pr.id, ctx.task.id);
        if (
          !c ||
          (ctx.pr.user_id !== req.user.id && c.user_id !== req.user.id) ||
          c.revision !== b.contribution_revision
        )
          throw githubError(
            "Contribution changed or is not available to you.",
            409,
          );
      }
      if ((old?.version || 0) >= 100)
        throw githubError("This task reached its PR link history limit.", 409);
      const version = (old?.version || 0) + 1;
      db.prepare(
        "INSERT INTO github_task_pulls(post_id,project_id,url,version,head,contribution_id,contribution_revision,operation_key) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(post_id) DO UPDATE SET url=excluded.url,version=excluded.version,head=excluded.head,contribution_id=excluded.contribution_id,contribution_revision=excluded.contribution_revision,operation_key=excluded.operation_key,updated=CURRENT_TIMESTAMP",
      ).run(
        ctx.task.id,
        ctx.pr.id,
        ticket.url,
        version,
        ticket.head,
        c?.id || null,
        c?.revision || null,
        b.operation_key,
      );
      db.prepare(
        "INSERT INTO github_task_pull_history(post_id,project_id,url,version,head,contribution_id,contribution_revision,actor_id,operation_key) VALUES(?,?,?,?,?,?,?,?,?)",
      ).run(
        ctx.task.id,
        ctx.pr.id,
        ticket.url,
        version,
        ticket.head,
        c?.id || null,
        c?.revision || null,
        req.user.id,
        b.operation_key,
      );
      roomEvent(
        db,
        ctx.pr.id,
        ctx.task.id,
        req.user.id,
        "github_pr_linked",
        ticket.number,
      );
      return { version, recovered: false };
    });
    res.json(result);
  });
  app.get(taskRoot, required, ready, async (req, res) => {
    const ctx = context(req, false, req.params.postId),
      source = db
        .prepare(
          "SELECT url,snapshot FROM github_issue_tasks WHERE post_id=? AND project_id=?",
        )
        .get(ctx.task.id, ctx.pr.id),
      binding =
        db
          .prepare(
            "SELECT url,version,head,contribution_id,contribution_revision,updated FROM github_task_pulls WHERE post_id=? AND project_id=?",
          )
          .get(ctx.task.id, ctx.pr.id) || null;
    let live = null;
    if (binding) {
      const ticket = await fetchRef(req, binding.url, "pull", ctx);
      const commitPath = `/repos${new URL(ticket.repository).pathname}/commits/${ticket.head}`;
      const checks = (await get(req, commitPath + "/check-runs?per_page=20"))
          .data,
        status = (await get(req, commitPath + "/status")).data;
      const reviews = await get(
        req,
        `/repos${new URL(ticket.repository).pathname}/pulls/${ticket.number}/reviews?per_page=20&page=1`,
      );
      const votes = new Map();
      for (const review of reviews.data || []) {
        if (review.commit_id === ticket.head && review.state === "DISMISSED")
          votes.delete(review.user?.id);
        if (
          review.commit_id === ticket.head &&
          ["APPROVED", "CHANGES_REQUESTED"].includes(review.state)
        )
          votes.set(review.user?.id, review.state);
      }
      const reviewState = reviews.hasNext
        ? "partial"
        : [...votes.values()].includes("CHANGES_REQUESTED")
          ? "changes_requested"
          : [...votes.values()].includes("APPROVED")
            ? "approved"
            : "no_current_verdict";
      const after = await fetchRef(req, binding.url, "pull", ctx);
      if (ticket.head !== after.head || ticket.base !== after.base)
        throw githubError(
          "PR changed while loading checks. Refresh this task.",
          409,
        );
      live = {
        ...after,
        review: { state: reviewState, partial: !!reviews.hasNext },
        checks: {
          state: status.state || "unknown",
          total: checks.total_count || 0,
          has_more: (checks.total_count || 0) > 20,
          runs: (checks.check_runs || []).slice(0, 20).map((c) => ({
            name: String(c.name || "").slice(0, 120),
            status: c.status,
            conclusion: c.conclusion,
          })),
        },
        checked_at: new Date().toISOString(),
      };
    }
    context(req, false, req.params.postId);
    res.json({
      source: source ? JSON.parse(source.snapshot) : null,
      binding: binding
        ? fields(binding, [
            "url",
            "version",
            "head",
            "contribution_id",
            "contribution_revision",
            "updated",
          ])
        : null,
      live,
      permissions: {
        manage:
          !ctx.pr.archived_at &&
          !ctx.pr.locked_at &&
          !ctx.task.archived_at &&
          !ctx.task.locked_at &&
          canParticipate(db, ctx.pr, req.user) &&
          (ctx.pr.user_id === req.user.id ||
            ctx.task.assignee_id === req.user.id),
      },
      capabilities: { github_work: 1 },
    });
  });
  app.get(taskRoot + "/history", required, ready, (req, res) => {
    const ctx = context(req, false, req.params.postId);
    const page = Number(req.query.page || 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 150)
      throw githubError("Choose a valid history page.", 400);
    res.json({
      items: db
        .prepare(
          "SELECT version,url,head,contribution_id,contribution_revision,created FROM github_task_pull_history WHERE post_id=? AND project_id=? ORDER BY version DESC LIMIT 20 OFFSET ?",
        )
        .all(ctx.task.id, ctx.pr.id, (page - 1) * 20)
        .map((row) =>
          fields(row, [
            "version",
            "url",
            "head",
            "contribution_id",
            "contribution_revision",
            "created",
          ]),
        ),
      page,
      has_next:
        db
          .prepare(
            "SELECT COUNT(*) n FROM github_task_pull_history WHERE post_id=? AND project_id=?",
          )
          .get(ctx.task.id, ctx.pr.id).n >
        page * 20,
      capabilities: { github_work: 1 },
    });
  });
}
