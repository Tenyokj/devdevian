import { randomUUID, createHash } from "node:crypto";
import { githubError } from "./github-app-core.mjs";
import { githubRepository } from "./packages/cli/lib/github-context.mjs";
import { githubWorkRef } from "./github-work.mjs";
import { consumeBudget } from "./limits.mjs";
import { canRead } from "./spaces.mjs";

export function prepareWriteback(db) {
  if (
    db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE name='github_writeback_schema'",
      )
      .get() &&
    db.prepare("SELECT version FROM github_writeback_schema WHERE id=1").get()
      ?.version > 1
  )
    throw Error("GitHub writeback schema is newer than this release.");
  db.exec(`CREATE TABLE IF NOT EXISTS github_writeback_schema(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL);
  INSERT INTO github_writeback_schema VALUES(1,1) ON CONFLICT(id) DO UPDATE SET version=excluded.version;
CREATE TABLE IF NOT EXISTS github_writebacks(
    id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),subject INTEGER NOT NULL,
    post_id INTEGER NOT NULL REFERENCES posts(id),source_hash TEXT NOT NULL,payload TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('preview','sending','sent','uncertain','rejected')),
    result_url TEXT,created INTEGER NOT NULL,updated INTEGER NOT NULL
  ); CREATE INDEX IF NOT EXISTS github_writebacks_owner ON github_writebacks(user_id,created);`);
}
const digest = (post) =>
  createHash("sha256")
    .update(JSON.stringify([post.title, post.body, post.community_id]))
    .digest("hex");
export function writebackInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw githubError("Use a writeback object.", 400);
  const kind = input.kind;
  if (!["issue", "comment"].includes(kind))
    throw githubError("Choose issue or comment.", 400);
  let repository, path, target;
  if (kind === "issue") {
    repository = githubRepository(input.target);
    if (!repository)
      throw githubError("Choose a canonical repository URL.", 400);
    target = repository;
    path = "/repos" + new URL(repository).pathname + "/issues";
  } else {
    const ref = githubWorkRef(
      input.target,
      String(input.target).includes("/pull/") ? "pull" : "issues",
    );
    repository = ref.repository;
    target = ref.url;
    path =
      "/repos" +
      new URL(repository).pathname +
      "/issues/" +
      ref.number +
      "/comments";
  }
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (kind === "issue" && (title.length < 5 || title.length > 160))
    throw githubError("Use a title of 5–160 characters.", 400);
  if (body.length < 10 || body.length > 12000)
    throw githubError("Use a message of 10–12000 characters.", 400);
  return {
    kind,
    repository,
    target,
    path,
    title: kind === "issue" ? title : "",
    body,
  };
}
export function registerWriteback(
  app,
  db,
  required,
  { migrate, ready, repository, get, write, origin },
) {
  if (!db.schemaCurrent || migrate) prepareWriteback(db);
  const available =
    db
      .prepare(
        "SELECT COUNT(*) n FROM sqlite_master WHERE (type='table' AND name IN ('github_writeback_schema','github_writebacks')) OR (type='index' AND name='github_writebacks_owner')",
      )
      .get().n === 3 &&
    db.prepare("SELECT version FROM github_writeback_schema WHERE id=1").get()
      ?.version === 1;
  db.githubWritebackReady = available;
  const source = (req, id) => {
    const p = db.prepare("SELECT * FROM posts WHERE id=?").get(id);
    if (!p || p.removed_at || !canRead(db, req.user, p))
      throw githubError("Conversation not found.", 404);
    if (p.user_id !== req.user.id)
      throw githubError(
        "Export your own conversation. Other authors keep control of theirs.",
        403,
      );
    if (p.locked_at || p.archived_at)
      throw githubError("This conversation is paused or archived.", 409);
    return p;
  };
  const connection = (req) => {
    const c = db
      .prepare("SELECT subject,login FROM github_connections WHERE user_id=?")
      .get(req.user.id);
    if (!c)
      throw githubError("Connect your GitHub workspace account first.", 409);
    return c;
  };
  const guard = (req, res, next) =>
    available
      ? next()
      : res
          .status(503)
          .json({ error: "GitHub writeback is not prepared on this server." });
  const readable = (req, r) => {
    const p = db.prepare("SELECT * FROM posts WHERE id=?").get(r.post_id);
    return !!p && !p.removed_at && canRead(db, req.user, p);
  };
  const dto = (r) => ({
    id: r.id,
    state: r.state,
    result_url: r.result_url,
    ...JSON.parse(r.payload),
  });
  app.get("/api/github/writeback", required, ready, guard, (req, res) => {
    res.json({
      items: db
        .prepare(
          "SELECT * FROM github_writebacks WHERE user_id=? ORDER BY created DESC LIMIT 30",
        )
        .all(req.user.id)
        .filter((r) => readable(req, r))
        .map(dto),
    });
  });
  app.get(
    "/api/github/writeback/:operation",
    required,
    ready,
    guard,
    (req, res) => {
      const r = db
        .prepare("SELECT * FROM github_writebacks WHERE id=? AND user_id=?")
        .get(req.params.operation, req.user.id);
      if (!r || !readable(req, r))
        throw githubError("Operation not found.", 404);
      // A terminated function may leave a sending row. Never automatically resend it.
      if (r.state === "sending" && r.updated < Date.now() - 60000) {
        db.prepare(
          "UPDATE github_writebacks SET state='uncertain' WHERE id=? AND state='sending'",
        ).run(r.id);
        r.state = "uncertain";
      }
      res.json(dto(r));
    },
  );
  app.post(
    "/api/github/writeback/preview",
    required,
    ready,
    guard,
    async (req, res) => {
      consumeBudget(db, [
        {
          key: `github-writeback-preview:${req.user.id}`,
          max: 30,
          window: 300000,
        },
        {
          key: `github-writeback-preview-day:${req.user.id}`,
          max: 100,
          window: 86400000,
        },
      ]);
      db.prepare(
        "DELETE FROM github_writebacks WHERE user_id=? AND state='preview' AND created<?",
      ).run(req.user.id, Date.now() - 86400000);
      if (
        db
          .prepare(
            "SELECT COUNT(*) n FROM github_writebacks WHERE user_id=? AND state='preview' AND created>?",
          )
          .get(req.user.id, Date.now() - 1800000).n >= 50
      )
        throw githubError(
          "Too many pending previews. Send an existing preview or wait for it to expire.",
          429,
        );
      if (!Number.isSafeInteger(req.body?.post_id) || req.body.post_id < 1)
        throw githubError("Choose a conversation ID.", 400);
      const p = source(req, req.body.post_id),
        c = connection(req),
        input = writebackInput(req.body);
      const repo = await repository(req, input.repository);
      if (p.community_id && (!repo.private || req.body.share_private !== true))
        throw githubError(
          "Private conversations require a private repository and explicit sharing consent.",
          409,
        );
      if (input.kind === "comment") {
        const ref = githubWorkRef(
          input.target,
          input.target.includes("/pull/") ? "pull" : "issues",
        );
        const remote = (await get(req, ref.path)).data;
        if (remote.html_url?.toLowerCase() !== input.target.toLowerCase())
          throw githubError("Target moved. Choose its canonical URL.", 409);
      }
      const identity = (await get(req, "/user")).data;
      if (identity.id !== c.subject)
        throw githubError("GitHub identity changed. Reconnect first.", 409);
      const id = randomUUID(),
        now = Date.now();
      const provenance = p.community_id
        ? ""
        : `\n\nSource: ${new URL("/conversation/" + p.id, origin).href}`;
      const payload = {
        ...input,
        body:
          input.body + provenance + `\n\n<!-- devdevian-writeback:${id} -->`,
        actor: identity.login,
        private: repo.private,
        post_id: p.id,
      };
      // Recheck access after network reads; do not create a preview for a removed source.
      if (
        digest(source(req, p.id)) !== digest(p) ||
        connection(req).subject !== c.subject
      )
        throw githubError("Source or connection changed. Preview again.", 409);
      db.prepare(
        "INSERT INTO github_writebacks VALUES(?,?,?,?,?,?,'preview',NULL,?,?)",
      ).run(
        id,
        req.user.id,
        c.subject,
        p.id,
        digest(p),
        JSON.stringify(payload),
        now,
        now,
      );
      res.json({ id, state: "preview", ...payload });
    },
  );
  app.post(
    "/api/github/writeback/:operation/send",
    required,
    ready,
    guard,
    async (req, res) => {
      let r = db
        .prepare("SELECT * FROM github_writebacks WHERE id=? AND user_id=?")
        .get(req.params.operation, req.user.id);
      if (!r || !readable(req, r))
        throw githubError("Operation not found.", 404);
      if (r.state === "sent") return res.json(dto(r));
      if (r.state !== "preview")
        throw githubError(
          "This operation was already attempted. Check its status and GitHub before creating another.",
          409,
        );
      if (req.body?.confirm !== true)
        throw githubError(
          "Review the preview and explicitly confirm sending.",
          400,
        );
      if (r.created < Date.now() - 1800000)
        throw githubError("Preview expired. Create a new preview.", 409);
      if (digest(source(req, r.post_id)) !== r.source_hash)
        throw githubError("Conversation changed. Preview again.", 409);
      const c = connection(req),
        payload = JSON.parse(r.payload);
      if (c.subject !== r.subject)
        throw githubError(
          "Connected GitHub account changed. Preview again.",
          409,
        );
      const repo = await repository(req, payload.repository);
      if (source(req, r.post_id).community_id && !repo.private)
        throw githubError("Destination is no longer private.", 409);
      if (
        digest(source(req, r.post_id)) !== r.source_hash ||
        connection(req).subject !== r.subject
      )
        throw githubError("Source or connection changed. Preview again.", 409);
      consumeBudget(db, [
        {
          key: `github-writeback-send:${req.user.id}`,
          max: 10,
          window: 3600000,
        },
      ]);
      // Claim before network I/O. Concurrent requests and retries cannot both publish.
      const claim = db
        .prepare(
          "UPDATE github_writebacks SET state='sending',updated=? WHERE id=? AND state='preview'",
        )
        .run(Date.now(), r.id);
      if (!claim.changes)
        throw githubError(
          "Operation is already being sent. Check its status.",
          409,
        );
      try {
        const result = (
          await write(
            req,
            payload.path,
            payload.kind === "issue"
              ? { title: payload.title, body: payload.body }
              : { body: payload.body },
            r.subject,
          )
        ).data;
        const u = new URL(result.html_url);
        const expected =
          new URL(payload.repository).pathname.toLowerCase() + "/";
        if (
          u.origin !== "https://github.com" ||
          !u.pathname.toLowerCase().startsWith(expected)
        )
          throw Error("Unexpected GitHub result");
        db.prepare(
          "UPDATE github_writebacks SET state='sent',result_url=?,updated=? WHERE id=?",
        ).run(u.href, Date.now(), r.id);
      } catch (e) {
        const state = e.definitelyRejected ? "rejected" : "uncertain";
        db.prepare(
          "UPDATE github_writebacks SET state=?,updated=? WHERE id=?",
        ).run(state, Date.now(), r.id);
        throw githubError(
          state === "rejected"
            ? "GitHub rejected the write. Check Issues / Pull requests write permissions and repository access, then create a fresh preview."
            : "GitHub may have received this operation. It will not be resent. Check operation status and the destination on GitHub.",
          409,
        );
      }
      r = db.prepare("SELECT * FROM github_writebacks WHERE id=?").get(r.id);
      res.json(dto(r));
    },
  );
}
