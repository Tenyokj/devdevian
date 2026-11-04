import { randomBytes, randomUUID, createHash } from "node:crypto";
import {
  appConfig,
  appConfigured,
  sealToken,
  openToken,
  validWebhook,
  githubGET,
  exchangeAppToken,
  allowedRead,
  githubError,
} from "./github-app-core.mjs";
import { transaction } from "./activity.mjs";
import { consumeBudget } from "./limits.mjs";
import { canRead } from "./spaces.mjs";
import { githubRepository } from "./packages/cli/lib/github-context.mjs";
import { registerGitHubWork } from "./github-work.mjs";
const hash = (v) => createHash("sha256").update(v).digest("hex");
export function prepareGitHubApp(db) {
  if (
    db
      .prepare("SELECT 1 FROM sqlite_master WHERE name='github_app_schema'")
      .get() &&
    db.prepare("SELECT version FROM github_app_schema WHERE id=1").get()
      ?.version > 1
  )
    throw Error("GitHub App schema is newer than this release.");
  transaction(db, () =>
    db.exec(`
 CREATE TABLE IF NOT EXISTS github_app_schema(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS github_connections(user_id INTEGER PRIMARY KEY REFERENCES users(id),subject INTEGER NOT NULL,login TEXT NOT NULL,access TEXT NOT NULL,refresh TEXT NOT NULL,expires INTEGER NOT NULL,refresh_expires INTEGER NOT NULL,version INTEGER NOT NULL DEFAULT 1,lease TEXT,lease_until INTEGER NOT NULL DEFAULT 0);
 CREATE INDEX IF NOT EXISTS github_connections_subject ON github_connections(subject);
 CREATE TABLE IF NOT EXISTS github_app_states(state_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),browser_hash TEXT NOT NULL,verifier TEXT NOT NULL,expires INTEGER NOT NULL,claimed INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS github_repo_events(repository TEXT PRIMARY KEY,generation INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS github_deliveries(id TEXT PRIMARY KEY,digest TEXT NOT NULL,created INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS github_deliveries_created ON github_deliveries(created);
 CREATE TABLE IF NOT EXISTS github_project_repos(project_id INTEGER PRIMARY KEY REFERENCES projects(id),repository TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,user_id INTEGER NOT NULL REFERENCES users(id));
 INSERT INTO github_app_schema VALUES(1,1) ON CONFLICT(id) DO UPDATE SET version=excluded.version;
 `),
  );
}
export function githubAppReady(db) {
  return (
    db
      .prepare(
        "SELECT COUNT(*) n FROM sqlite_master WHERE (type='table' AND name IN ('github_app_schema','github_connections','github_app_states','github_repo_events','github_deliveries','github_project_repos')) OR (type='index' AND name IN ('github_connections_subject','github_deliveries_created'))",
      )
      .get().n === 8 &&
    db.prepare("SELECT version FROM github_app_schema WHERE id=1").get()
      ?.version === 1
  );
}
export function registerGitHubApp(
  app,
  db,
  required,
  {
    migrate = false,
    config = appConfig(),
    get = githubGET,
    exchange = exchangeAppToken,
  } = {},
) {
  if (!db.schemaCurrent || migrate) prepareGitHubApp(db);
  db.githubAppReady = githubAppReady(db);
  const ready = (req, res, next) => {
    if (!db.githubAppReady || !appConfigured(config))
      return res.status(503).json({
        error: "GitHub App is not configured on this server yet.",
        capabilities: { github_app: 0 },
      });
    next();
  };
  const cookie = {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/github",
    maxAge: 600000,
  };
  const origin = () => new URL(config.origin).origin;
  const store = (user, p, version) => ({
    access: sealToken(p.access_token, user, config.key),
    refresh: sealToken(p.refresh_token, user, config.key),
    expires: Date.now() + p.expires_in * 1000,
    refresh_expires:
      Date.now() + Math.min(p.refresh_token_expires_in, 15897600) * 1000,
    version,
  });
  async function token(user) {
    let row = db
      .prepare("SELECT * FROM github_connections WHERE user_id=?")
      .get(user);
    if (!row) throw githubError("Connect GitHub App in Settings first.", 409);
    if (row.expires > Date.now() + 60000)
      return {
        value: openToken(row.access, user, config.key),
        version: row.version,
      };
    if (row.refresh_expires < Date.now())
      throw githubError(
        "GitHub authorization expired. Reconnect your account.",
        409,
      );
    const lease = randomUUID(),
      claimed = db
        .prepare(
          "UPDATE github_connections SET lease=?,lease_until=? WHERE user_id=? AND version=? AND lease_until<? RETURNING *",
        )
        .get(lease, Date.now() + 30000, user, row.version, Date.now());
    if (!claimed)
      throw githubError(
        "GitHub authorization is being refreshed. Try again shortly.",
        503,
      );
    try {
      const p = await exchange(
          {
            grant_type: "refresh_token",
            refresh_token: openToken(row.refresh, user, config.key),
          },
          config,
        ),
        s = store(user, p, row.version + 1);
      const changed = db
        .prepare(
          "UPDATE github_connections SET access=?,refresh=?,expires=?,refresh_expires=?,version=?,lease=NULL,lease_until=0 WHERE user_id=? AND version=? AND lease=?",
        )
        .run(
          s.access,
          s.refresh,
          s.expires,
          s.refresh_expires,
          s.version,
          user,
          row.version,
          lease,
        );
      if (!changed.changes)
        throw githubError(
          "GitHub connection changed. Reconnect before continuing.",
          409,
        );
      return { value: p.access_token, version: s.version };
    } catch (e) {
      db.prepare(
        "UPDATE github_connections SET lease=NULL,lease_until=0 WHERE user_id=? AND lease=?",
      ).run(user, lease);
      throw e.githubPublic
        ? e
        : githubError(
            "GitHub token refresh failed. Reconnect if it keeps failing.",
          );
    }
  }
  const authorizations = new Map();
  async function request(req, path) {
    consumeBudget(db, [
      { key: `github-app-read:${req.user.id}`, max: 200, window: 300000 },
    ]);
    let pending = authorizations.get(req.user.id);
    if (!pending) {
      pending = token(req.user.id).finally(() =>
        authorizations.delete(req.user.id),
      );
      authorizations.set(req.user.id, pending);
    }
    const auth = await pending;
    try {
      const result = await get(path, auth.value);
      if (
        !db
          .prepare(
            "SELECT 1 FROM github_connections WHERE user_id=? AND version=?",
          )
          .get(req.user.id, auth.version)
      )
        throw githubError(
          "GitHub connection changed while loading. Refresh this view.",
          409,
        );
      return result;
    } catch (e) {
      if (e.githubStatus === 401)
        db.prepare(
          "DELETE FROM github_connections WHERE user_id=? AND version=?",
        ).run(req.user.id, auth.version);
      throw e.githubPublic
        ? e
        : githubError("Could not reach GitHub. Try again later.");
    }
  }
  async function repository(req, value) {
    const canonical = githubRepository(value);
    if (!canonical)
      throw githubError("Choose a canonical GitHub repository URL.", 400);
    const r = await request(req, "/repos" + new URL(canonical).pathname);
    if (
      !r.data?.id ||
      githubRepository(r.data.html_url)?.toLowerCase() !==
        canonical.toLowerCase()
    )
      throw githubError("GitHub repository moved. Choose it again.", 409);
    return {
      repository: canonical,
      private: !!r.data.private,
      name: r.data.full_name,
      description: String(r.data.description || "").slice(0, 500),
      default_branch: r.data.default_branch,
      permissions: r.data.permissions || {},
    };
  }
  app.get("/api/github/config", (req, res) =>
    res.json({
      capabilities: { github_app: db.githubAppReady ? 1 : 0 },
      configured: db.githubAppReady && appConfigured(config),
      app_url:
        config.slug && /^[a-z0-9-]+$/.test(config.slug)
          ? `https://github.com/apps/${config.slug}`
          : null,
    }),
  );
  app.get("/api/github/status", required, (req, res) => {
    const row =
      db.githubAppReady &&
      db
        .prepare(
          "SELECT login,subject,expires,refresh_expires FROM github_connections WHERE user_id=?",
        )
        .get(req.user.id);
    res.json({
      connected: !!row,
      login: row?.login || null,
      expires: row?.expires || null,
      reconnect: !!row && row.refresh_expires < Date.now(),
      capabilities: { github_app: db.githubAppReady ? 1 : 0 },
    });
  });
  app.post("/api/github/connect", required, ready, (req, res) => {
    consumeBudget(db, [
      { key: `github-app-connect:${req.user.id}`, max: 10, window: 600000 },
    ]);
    const state = randomBytes(32).toString("hex"),
      browser = randomBytes(32).toString("hex"),
      verifier = randomBytes(32).toString("base64url");
    db.prepare(
      "DELETE FROM github_app_states WHERE user_id=? OR expires<?",
    ).run(req.user.id, Date.now());
    db.prepare(
      "INSERT INTO github_app_states(state_hash,user_id,browser_hash,verifier,expires) VALUES(?,?,?,?,?)",
    ).run(
      hash(state),
      req.user.id,
      hash(browser),
      verifier,
      Date.now() + 600000,
    );
    res.cookie("devdevian_github_app", browser, cookie);
    const query = new URLSearchParams({
      client_id: config.id,
      redirect_uri: origin() + "/api/github/callback",
      state,
      scope: "offline_access",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    });
    res.json({ url: "https://github.com/login/oauth/authorize?" + query });
  });
  app.get("/api/github/callback", required, ready, async (req, res) => {
    const state = typeof req.query.state === "string" ? req.query.state : "",
      browser =
        req.headers.cookie
          ?.split(";")
          .map((s) => s.trim())
          .find((s) => s.startsWith("devdevian_github_app="))
          ?.split("=")[1] || "";
    if (
      !/^[a-f0-9]{64}$/.test(state) ||
      !browser ||
      typeof req.query.code !== "string"
    )
      return res.status(400).json({
        error: "GitHub authorization expired. Start again from Settings.",
      });
    const row = db
      .prepare(
        "UPDATE github_app_states SET claimed=1 WHERE state_hash=? AND user_id=? AND browser_hash=? AND expires>? AND claimed=0 RETURNING *",
      )
      .get(hash(state), req.user.id, hash(browser), Date.now());
    if (!row)
      return res.status(400).json({
        error: "GitHub authorization expired or belongs to another account.",
      });
    res.clearCookie("devdevian_github_app", { path: "/api/github" });
    try {
      const p = await exchange(
          {
            code: req.query.code,
            redirect_uri: origin() + "/api/github/callback",
            code_verifier: row.verifier,
          },
          config,
        ),
        identity = (await get("/user", p.access_token)).data;
      if (
        !Number.isSafeInteger(identity.id) ||
        identity.id < 1 ||
        typeof identity.login !== "string" ||
        !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(identity.login)
      )
        throw githubError("GitHub did not confirm your identity.", 409);
      // A GitHub App connection never silently changes the existing sign-in identity.
      const known = db
        .prepare(
          "SELECT subject FROM oauth_accounts WHERE user_id=? AND provider='github'",
        )
        .get(req.user.id);
      if (known && String(known.subject) !== String(identity.id))
        throw githubError(
          "Authorize the same GitHub account used for your linked sign-in.",
          409,
        );
      const s = store(req.user.id, p, 1);
      transaction(db, () => {
        const current = db
          .prepare(
            "DELETE FROM github_app_states WHERE state_hash=? AND user_id=? AND claimed=1 AND expires>? RETURNING user_id",
          )
          .get(hash(state), req.user.id, Date.now());
        if (!current)
          throw githubError(
            "GitHub connection was cancelled. Start again.",
            409,
          );
        db.prepare(
          "INSERT INTO github_connections(user_id,subject,login,access,refresh,expires,refresh_expires) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET subject=excluded.subject,login=excluded.login,access=excluded.access,refresh=excluded.refresh,expires=excluded.expires,refresh_expires=excluded.refresh_expires,version=version+1,lease=NULL,lease_until=0",
        ).run(
          req.user.id,
          identity.id,
          identity.login,
          s.access,
          s.refresh,
          s.expires,
          s.refresh_expires,
        );
      });
      res.redirect(origin() + "/app#github");
    } catch (e) {
      res.status(e.status || 503).json({
        error: e.status
          ? e.message
          : "GitHub connection failed. Start again from Settings.",
      });
    }
  });
  app.delete("/api/github/connection", required, (req, res) => {
    if (!db.githubAppReady) return res.json({ ok: true });
    transaction(db, () => {
      db.prepare("DELETE FROM github_connections WHERE user_id=?").run(
        req.user.id,
      );
      db.prepare("DELETE FROM github_app_states WHERE user_id=?").run(
        req.user.id,
      );
    });
    res.json({
      ok: true,
      manage_url:
        "https://github.com/settings/connections/applications/" + config.id,
    });
  });
  app.get("/api/github/installations", required, ready, async (req, res) => {
    const page = Number(req.query.page || 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 150)
      throw githubError("Choose a valid page.", 400);
    const r = await request(
      req,
      `/user/installations?per_page=20&page=${page}`,
    );
    res.json({
      items: (r.data.installations || []).map((i) => ({
        id: i.id,
        account: i.account?.login,
        suspended: !!i.suspended_at,
      })),
      page,
      has_next: r.hasNext,
    });
  });
  app.get(
    "/api/github/installations/:installation/repositories",
    required,
    ready,
    async (req, res) => {
      const page = Number(req.query.page || 1),
        id = Number(req.params.installation);
      if (
        !Number.isSafeInteger(id) ||
        id < 1 ||
        !Number.isSafeInteger(page) ||
        page < 1 ||
        page > 150
      )
        throw githubError("Choose an installation and page.", 400);
      const r = await request(
        req,
        `/user/installations/${id}/repositories?per_page=20&page=${page}`,
      );
      res.json({
        items: (r.data.repositories || []).map((i) => ({
          id: i.id,
          name: i.full_name,
          repository: i.html_url,
          private: !!i.private,
          description: String(i.description || "").slice(0, 500),
        })),
        page,
        has_next: r.hasNext,
      });
    },
  );
  app.get("/api/github/repository", required, ready, async (req, res) => {
    const repo = await repository(req, req.query.repository);
    const event = db
      .prepare(
        "SELECT generation,updated_at FROM github_repo_events WHERE repository=?",
      )
      .get(repo.repository.toLowerCase());
    res.json({
      ...repo,
      generation: event?.generation || 0,
      updated_at: event?.updated_at || null,
    });
  });
  app.get("/api/github/read", required, ready, async (req, res) => {
    const ref = allowedRead(req.query.path),
      repo = await repository(req, ref.repository),
      r = await request(req, ref.path);
    res.json({
      data: r.data,
      private:
        repo.private || !!r.data?.base?.repo?.private || !!r.data?.private,
      has_next: r.hasNext,
      checked_at: new Date().toISOString(),
    });
  });
  app.get("/api/projects/:id/github", required, ready, async (req, res) => {
    const pr = db
      .prepare(
        "SELECT pr.id,pr.user_id,p.community_id,p.removed_at FROM projects pr JOIN posts p ON p.id=pr.post_id WHERE pr.id=?",
      )
      .get(req.params.id);
    if (!pr || pr.removed_at || !canRead(db, req.user, pr))
      return res.status(404).json({ error: "Project not found." });
    const binding = db
      .prepare(
        "SELECT repository,version FROM github_project_repos WHERE project_id=?",
      )
      .get(pr.id);
    if (!binding)
      return res.json({ binding: null, manage: pr.user_id === req.user.id });
    const repo = await repository(req, binding.repository);
    if (repo.private && !pr.community_id)
      throw githubError(
        "Private repositories require a private community project.",
        409,
      );
    res.json({
      binding: { ...binding, ...repo },
      manage: pr.user_id === req.user.id,
    });
  });
  app.post("/api/projects/:id/github", required, ready, async (req, res) => {
    const repo = await repository(req, req.body?.repository),
      expected = req.body?.expected_version;
    if (!Number.isSafeInteger(expected) || expected < 0)
      throw githubError("Preserve the repository binding version.", 400);
    const ok = transaction(db, () => {
      const pr = db
        .prepare(
          "SELECT pr.id,pr.user_id,p.community_id,p.removed_at,p.locked_at,p.archived_at FROM projects pr JOIN posts p ON p.id=pr.post_id WHERE pr.id=?",
        )
        .get(req.params.id);
      if (
        !pr ||
        pr.removed_at ||
        pr.locked_at ||
        pr.archived_at ||
        pr.user_id !== req.user.id ||
        !canRead(db, req.user, pr) ||
        (repo.private && !pr.community_id)
      )
        return false;
      const old = db
        .prepare("SELECT * FROM github_project_repos WHERE project_id=?")
        .get(pr.id);
      if ((old?.version || 0) !== expected) return false;
      db.prepare(
        "INSERT INTO github_project_repos VALUES(?,?,1,?) ON CONFLICT(project_id) DO UPDATE SET repository=excluded.repository,user_id=excluded.user_id,version=version+1",
      ).run(pr.id, repo.repository, req.user.id);
      db.prepare("UPDATE projects SET repo=? WHERE id=?").run(
        repo.repository,
        pr.id,
      );
      return true;
    });
    res.status(ok ? 200 : 409).json(
      ok
        ? { ok: true }
        : {
            error:
              "Project or binding changed, or the repository audience is not allowed.",
          },
    );
  });
  app.post("/api/github/webhook", (req, res) => {
    if (!db.githubAppReady || !config.webhook)
      return res
        .status(503)
        .json({ error: "GitHub App webhook is not configured." });
    if (
      !validWebhook(
        req.githubRawBody,
        req.headers["x-hub-signature-256"],
        config.webhook,
      )
    )
      return res.status(401).json({ error: "Invalid webhook signature." });
    const id = req.headers["x-github-delivery"],
      event = req.headers["x-github-event"];
    if (typeof id !== "string" || !/^[a-zA-Z0-9-]{16,100}$/.test(id))
      return res.status(400).json({ error: "Invalid delivery ID." });
    const digest = hash(req.githubRawBody);
    const outcome = transaction(db, () => {
      const inserted = db
        .prepare("INSERT OR IGNORE INTO github_deliveries VALUES(?,?,?)")
        .run(id, digest, Date.now());
      if (!inserted.changes) {
        const previous = db
          .prepare("SELECT digest FROM github_deliveries WHERE id=?")
          .get(id);
        return previous?.digest === digest ? "duplicate" : "conflict";
      }
      if (
        event === "github_app_authorization" &&
        req.body?.action === "revoked"
      )
        db.prepare("DELETE FROM github_connections WHERE subject=?").run(
          Number(req.body.sender?.id) || 0,
        );
      const repos = [
        req.body?.repository,
        ...(Array.isArray(req.body?.repositories) ? req.body.repositories : []),
        ...(Array.isArray(req.body?.repositories_removed)
          ? req.body.repositories_removed
          : []),
        ...(Array.isArray(req.body?.repositories_added)
          ? req.body.repositories_added
          : []),
      ];
      const names = [
        ...new Set(
          repos
            .slice(0, 1000)
            .map((repo) =>
              githubRepository(
                repo?.html_url ||
                  (repo?.full_name
                    ? "https://github.com/" + repo.full_name
                    : ""),
              )?.toLowerCase(),
            )
            .filter(Boolean),
        ),
      ];
      for (let offset = 0; offset < names.length; offset += 100) {
        const part = names.slice(offset, offset + 100);
        db.prepare(
          "INSERT INTO github_repo_events(repository) VALUES " +
            part.map(() => "(?)").join(",") +
            " ON CONFLICT(repository) DO UPDATE SET generation=generation+1,updated_at=CURRENT_TIMESTAMP",
        ).run(...part);
      }
      db.prepare("DELETE FROM github_deliveries WHERE created<?").run(
        Date.now() - 604800000,
      );
    });
    res
      .status(outcome === "conflict" ? 409 : 200)
      .json(outcome ? { duplicate: true } : { ok: true });
  });
  registerGitHubWork(app, db, required, { migrate, get: request, repository, ready });
  app.use((error, req, res, next) => {
    if (!error.githubPublic) return next(error);
    res
      .status(error.status || 503)
      .json({ error: error.message, provider: "github_app" });
  });
}
