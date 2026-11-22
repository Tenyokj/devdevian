import * as Y from "yjs";
import { randomUUID, createHash } from "node:crypto";
import { canRead } from "./spaces.mjs";
import { postParticipation } from "./project-access.mjs";
import { notify, notifyReply } from "./activity.mjs";
import { consumeBudget } from "./limits.mjs";
import { validUsername } from "./preferences.mjs";

class LiveError extends Error {
  constructor(message, status = 403) {
    super(message);
    this.status = status;
  }
}
function atomic(db, work) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export const liveLanguages = [
  "javascript",
  "typescript",
  "python",
  "json",
  "text",
];
const text = (v, max, min = 0) =>
  typeof v === "string" && v.length <= max && v.trim().length >= min;
const b64 = (bytes) => Buffer.from(bytes).toString("base64");
function bytes(s, max = 262144) {
  if (!text(s, max, 1) || !/^[A-Za-z0-9+/]*={0,2}$/.test(s))
    throw Error("Invalid document update.");
  return new Uint8Array(Buffer.from(s, "base64"));
}
export function liveDocument(state, update) {
  const doc = new Y.Doc();
  try {
    const code = doc.getText("code");
    if (state) Y.applyUpdate(doc, bytes(state));
    if (update) Y.applyUpdate(doc, bytes(update, 131072));
    if (
      doc.share.size !== 1 ||
      !doc.share.has("code") ||
      code.length > 20000 ||
      code.toDelta().some((x) => typeof x.insert !== "string" || x.attributes)
    )
      throw Error("Only plain code up to 20,000 characters is supported.");
    const encoded = b64(Y.encodeStateAsUpdate(doc));
    if (encoded.length > 262144)
      throw Error(
        "Document history is full. Save this session and start a new one.",
      );
    return { state: encoded, code: code.toString() };
  } finally {
    doc.destroy();
  }
}
export function prepareLive(db) {
  if (
    db.prepare("SELECT 1 FROM sqlite_master WHERE name='live_schema'").get() &&
    db.prepare("SELECT version FROM live_schema WHERE id=1").get()?.version > 1
  )
    throw Error("Live schema is newer than this release.");
  atomic(db, () =>
    db.exec(`
    CREATE TABLE IF NOT EXISTS live_schema(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS live_sessions(id TEXT PRIMARY KEY,post_id INTEGER NOT NULL REFERENCES posts(id),host_id INTEGER NOT NULL REFERENCES users(id),title TEXT NOT NULL,language TEXT NOT NULL,initial_code TEXT NOT NULL,state TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,summary TEXT NOT NULL DEFAULT '',closed_at TEXT,published_reply_id INTEGER,operation_key TEXT NOT NULL,created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(host_id,operation_key));
    CREATE INDEX IF NOT EXISTS live_sessions_post ON live_sessions(post_id,created);
    CREATE TABLE IF NOT EXISTS live_members(session_id TEXT NOT NULL REFERENCES live_sessions(id),user_id INTEGER NOT NULL REFERENCES users(id),role TEXT NOT NULL CHECK(role IN('host','editor','viewer')),invited_by INTEGER NOT NULL,created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(session_id,user_id));
    CREATE TABLE IF NOT EXISTS live_presence(session_id TEXT NOT NULL,user_id INTEGER NOT NULL,client_id TEXT NOT NULL,anchor TEXT,head TEXT,seen INTEGER NOT NULL,PRIMARY KEY(session_id,user_id,client_id));
    CREATE INDEX IF NOT EXISTS live_presence_expiry ON live_presence(seen);
    CREATE TABLE IF NOT EXISTS live_messages(id INTEGER PRIMARY KEY,session_id TEXT NOT NULL REFERENCES live_sessions(id),user_id INTEGER NOT NULL REFERENCES users(id),body TEXT NOT NULL,operation_key TEXT NOT NULL,created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(session_id,user_id,operation_key));
    CREATE INDEX IF NOT EXISTS live_messages_session ON live_messages(session_id,id);
    INSERT INTO live_schema VALUES(1,1) ON CONFLICT(id) DO NOTHING;
  `),
  );
}
export function liveReady(db) {
  return (
    db
      .prepare(
        "SELECT count(*) n FROM sqlite_master WHERE type='table' AND name IN('live_schema','live_sessions','live_members','live_presence','live_messages')",
      )
      .get().n === 5 &&
    db.prepare("SELECT version FROM live_schema WHERE id=1").get()?.version ===
      1 &&
    db
      .prepare(
        "SELECT count(*) n FROM sqlite_master WHERE type='index' AND name IN('live_sessions_post','live_presence_expiry','live_messages_session')",
      )
      .get().n === 3
  );
}
export function registerLive(app, db, required, { migrate = false } = {}) {
  if (!db.schemaCurrent || migrate) prepareLive(db);
  db.liveReady = liveReady(db);
  const ready = (req, res, next) =>
    db.liveReady
      ? next()
      : res.status(503).json({ error: "Live is awaiting server preparation." });
  const source = (id, user) => {
    const p = db.prepare("SELECT * FROM posts WHERE id=?").get(id);
    return p && !p.removed_at && canRead(db, user, p) ? p : null;
  };
  const writable = (p, user) =>
    !!user &&
    !p.archived_at &&
    !p.locked_at &&
    !postParticipation(db, p.id, user).read_only;
  const target = (req, res, next) => {
    res.set("Cache-Control", "no-store");
    const s = db
      .prepare("SELECT * FROM live_sessions WHERE id=?")
      .get(req.params.session);
    const p = s && source(s.post_id, req.user);
    const member =
      s &&
      db
        .prepare(
          "SELECT role FROM live_members WHERE session_id=? AND user_id=?",
        )
        .get(s.id, req.user.id);
    if (!s || !p || !member)
      return res.status(404).json({
        error: "Live session not found, or you no longer have access.",
      });
    req.live = s;
    req.livePost = p;
    req.liveRole = member.role;
    consumeBudget(db, [
      { key: `live-read:${s.id}:${req.user.id}`, max: 120, window: 60000 },
    ]);
    next();
  };
  // Recheck permissions under the same write lock as the mutation. Revocation
  // and publication cannot race a previously authorized request on another instance.
  function fresh(req, editing = false) {
    const current = db
      .prepare("SELECT * FROM live_sessions WHERE id=?")
      .get(req.live.id);
    const p = current && source(current.post_id, req.user);
    const member =
      current &&
      db
        .prepare(
          "SELECT role FROM live_members WHERE session_id=? AND user_id=?",
        )
        .get(current.id, req.user.id);
    if (
      !current ||
      !p ||
      !member ||
      db.prepare("SELECT deleted_at FROM users WHERE id=?").get(req.user.id)
        ?.deleted_at
    )
      throw new LiveError("Session access changed.", 404);
    if (
      editing &&
      (current.closed_at || member.role === "viewer" || !writable(p, req.user))
    )
      throw new LiveError("You no longer have editing rights.");
    req.live = current;
    req.livePost = p;
    req.liveRole = member.role;
    return current;
  }
  const host = (req, res, next) =>
    req.live.host_id === req.user.id
      ? next()
      : res.status(403).json({ error: "Only the session host can do this." });
  const members = (s) =>
    db
      .prepare(
        "SELECT m.user_id,m.role,u.name,u.username FROM live_members m JOIN users u ON u.id=m.user_id WHERE m.session_id=? AND u.deleted_at IS NULL ORDER BY m.created,m.user_id",
      )
      .all(s);
  const messageRows = (s, after) =>
    db
      .prepare(
        "SELECT m.id,m.user_id,u.name,m.body,m.created FROM live_messages m JOIN users u ON u.id=m.user_id WHERE m.session_id=? AND m.id>? ORDER BY m.id LIMIT 50",
      )
      .all(s, after);
  const presence = (s) =>
    db
      .prepare(
        "SELECT p.user_id,p.client_id,p.anchor,p.head,p.seen,u.name FROM live_presence p JOIN live_members m ON m.session_id=p.session_id AND m.user_id=p.user_id JOIN users u ON u.id=p.user_id WHERE p.session_id=? AND p.seen>? AND u.deleted_at IS NULL LIMIT 36",
      )
      .all(s, Date.now() - 30000)
      .map((p) => ({
        ...p,
        presence_id: Number.parseInt(
          createHash("sha256")
            .update(s + ":" + p.user_id + ":" + p.client_id)
            .digest("hex")
            .slice(0, 12),
          16,
        ),
      }));
  const dto = (req) => ({
    id: req.live.id,
    post_id: req.live.post_id,
    host_id: req.live.host_id,
    title: req.live.title,
    language: req.live.language,
    initial_code: req.live.initial_code,
    revision: req.live.revision,
    summary: req.live.summary,
    closed_at: req.live.closed_at,
    published_reply_id: req.live.published_reply_id,
    role: req.liveRole,
    can_edit:
      !req.live.closed_at &&
      req.liveRole !== "viewer" &&
      writable(req.livePost, req.user),
    can_chat: !req.live.closed_at && writable(req.livePost, req.user),
    can_manage: req.live.host_id === req.user.id,
    post_title: req.livePost.title,
    private: !!req.livePost.community_id,
  });
  app.get("/api/live", required, ready, (req, res) => {
    res.set("Cache-Control", "no-store");
    const rows = db
      .prepare(
        "SELECT s.id,s.post_id,s.title,s.language,s.closed_at,s.created,s.host_id,u.name host_name,m.role FROM live_sessions s JOIN live_members m ON m.session_id=s.id AND m.user_id=? JOIN users u ON u.id=s.host_id ORDER BY s.created DESC,s.id DESC LIMIT 40",
      )
      .all(req.user.id);
    res.json({
      items: rows.filter((s) => source(s.post_id, req.user)).slice(0, 20),
    });
  });
  app.get("/api/posts/:id/live", required, ready, (req, res) => {
    const p = source(req.params.id, req.user);
    if (!p) return res.status(404).json({ error: "Conversation not found." });
    res.set("Cache-Control", "no-store");
    const items = db
      .prepare(
        "SELECT s.id,s.title,s.language,s.closed_at,s.created,s.host_id,u.name host_name,m.role FROM live_sessions s JOIN live_members m ON m.session_id=s.id AND m.user_id=? JOIN users u ON u.id=s.host_id WHERE s.post_id=? ORDER BY s.created DESC,s.id DESC LIMIT 20",
      )
      .all(req.user.id, p.id);
    res.json({ items, can_create: writable(p, req.user) });
  });
  app.post("/api/posts/:id/live", required, ready, (req, res) => {
    const p = source(req.params.id, req.user),
      b = req.body;
    if (!p) return res.status(404).json({ error: "Conversation not found." });
    if (!writable(p, req.user))
      return res
        .status(403)
        .json({ error: "You cannot start a session in this conversation." });
    if (
      !text(b?.title, 100, 3) ||
      !text(b.code, 20000) ||
      !liveLanguages.includes(b.language) ||
      !text(b.operation_key, 80, 8)
    )
      return res.status(400).json({
        error:
          "Choose a title, supported language, code up to 20,000 characters and operation key.",
      });
    const prior = db
      .prepare(
        "SELECT id,post_id,title,language,initial_code FROM live_sessions WHERE host_id=? AND operation_key=?",
      )
      .get(req.user.id, b.operation_key);
    if (prior)
      return prior.post_id === p.id &&
        prior.title === b.title.trim() &&
        prior.language === b.language &&
        prior.initial_code === b.code
        ? res.json({ id: prior.id })
        : res.status(409).json({
            error: "Use a new operation key for changed session details.",
          });
    consumeBudget(db, [
      { key: `live-create:${req.user.id}`, max: 8, window: 86400000 },
    ]);
    const doc = new Y.Doc();
    doc.getText("code").insert(0, b.code);
    const state = b64(Y.encodeStateAsUpdate(doc));
    doc.destroy();
    if (state.length > 262144)
      return res.status(400).json({ error: "Code is too large." });
    const id = randomUUID();
    const created = atomic(db, () => {
      const current = source(p.id, req.user);
      if (!current || !writable(current, req.user))
        throw new LiveError("Conversation access changed.");
      const existing = db
        .prepare(
          "SELECT * FROM live_sessions WHERE host_id=? AND operation_key=?",
        )
        .get(req.user.id, b.operation_key);
      if (existing) {
        if (
          existing.post_id !== p.id ||
          existing.title !== b.title.trim() ||
          existing.language !== b.language ||
          existing.initial_code !== b.code
        )
          throw new LiveError("Use a new operation key.", 409);
        return existing.id;
      }
      if (
        db
          .prepare(
            "SELECT count(*) n FROM live_sessions WHERE host_id=? AND closed_at IS NULL",
          )
          .get(req.user.id).n >= 4
      )
        return false;
      db.prepare(
        "INSERT INTO live_sessions(id,post_id,host_id,title,language,initial_code,state,operation_key) VALUES(?,?,?,?,?,?,?,?)",
      ).run(
        id,
        p.id,
        req.user.id,
        b.title.trim(),
        b.language,
        b.code,
        state,
        b.operation_key,
      );
      db.prepare(
        "INSERT INTO live_members(session_id,user_id,role,invited_by) VALUES(?,?,'host',?)",
      ).run(id, req.user.id, req.user.id);
      return id;
    });
    if (!created)
      return res.status(409).json({
        error: "Close an existing session first (up to four open sessions).",
      });
    res.status(201).json({ id: created });
  });
  app.get("/api/live/:session", required, ready, target, (req, res) =>
    res.json({
      session: dto(req),
      state: req.live.state,
      members: members(req.live.id),
      presence: presence(req.live.id),
      messages: messageRows(req.live.id, 0),
    }),
  );
  app.post("/api/live/:session/sync", required, ready, target, (req, res) => {
    const b = req.body || {},
      after = Number(b.after || 0);
    if (
      !Number.isSafeInteger(after) ||
      after < 0 ||
      !text(b.client_id, 40, 1) ||
      !/^[0-9]+$/.test(b.client_id) ||
      !Number.isInteger(Number(b.client_id)) ||
      Number(b.client_id) > 4294967295
    )
      return res.status(400).json({ error: "Invalid live sync request." });
    if (
      b.update &&
      (req.live.closed_at ||
        req.liveRole === "viewer" ||
        !writable(req.livePost, req.user))
    )
      return res
        .status(403)
        .json({ error: "You no longer have editing rights." });
    for (const key of ["anchor", "head"])
      if (
        b[key] != null &&
        (!text(b[key], 1024) || !/^[A-Za-z0-9+/]*={0,2}$/.test(b[key]))
      )
        return res.status(400).json({ error: "Invalid cursor position." });
    if (b.update)
      atomic(db, () => {
        const current = fresh(req, true);
        let merged;
        try {
          merged = liveDocument(current.state, b.update);
        } catch {
          throw new LiveError(
            "Invalid or oversized collaborative update. Your local text has not been discarded.",
            400,
          );
        }
        db.prepare(
          "UPDATE live_sessions SET state=?,revision=revision+1 WHERE id=? AND revision=? AND closed_at IS NULL",
        ).run(merged.state, current.id, current.revision);
      });
    if (!req.live.closed_at && b.heartbeat === true) {
      atomic(db, () => {
        fresh(req);
        if (req.live.closed_at) return;
        db.prepare("DELETE FROM live_presence WHERE seen<?").run(
          Date.now() - 60000,
        );
        const own = db
          .prepare(
            "SELECT count(*) n FROM live_presence WHERE session_id=? AND user_id=? AND client_id<>?",
          )
          .get(req.live.id, req.user.id, b.client_id).n;
        if (own < 3)
          db.prepare(
            "INSERT INTO live_presence(session_id,user_id,client_id,anchor,head,seen) VALUES(?,?,?,?,?,?) ON CONFLICT(session_id,user_id,client_id) DO UPDATE SET anchor=excluded.anchor,head=excluded.head,seen=excluded.seen",
          ).run(
            req.live.id,
            req.user.id,
            b.client_id,
            b.anchor || null,
            b.head || null,
            Date.now(),
          );
      });
    }
    const latest = db
      .prepare("SELECT * FROM live_sessions WHERE id=?")
      .get(req.live.id);
    req.live = latest;
    res.json({
      session: dto(req),
      state: latest.revision === Number(b.revision) ? null : latest.state,
      presence: presence(latest.id),
      messages: messageRows(latest.id, after),
      members: members(latest.id),
    });
  });
  app.post(
    "/api/live/:session/messages",
    required,
    ready,
    target,
    (req, res) => {
      if (req.live.closed_at || !writable(req.livePost, req.user))
        return res.status(403).json({ error: "Chat is read-only." });
      const b = req.body;
      if (!text(b?.body, 2000, 1) || !text(b.operation_key, 80, 8))
        return res
          .status(400)
          .json({ error: "Write a message up to 2,000 characters." });
      consumeBudget(db, [
        {
          key: `live-chat:${req.live.id}:${req.user.id}`,
          max: 30,
          window: 60000,
        },
      ]);
      const prior = db
        .prepare(
          "SELECT id,body FROM live_messages WHERE session_id=? AND user_id=? AND operation_key=?",
        )
        .get(req.live.id, req.user.id, b.operation_key);
      if (prior)
        return prior.body === b.body.trim()
          ? res.json({ id: prior.id })
          : res.status(409).json({ error: "Use a new message operation key." });
      const result = atomic(db, () => {
        fresh(req);
        if (req.live.closed_at || !writable(req.livePost, req.user))
          throw new LiveError("Chat is read-only.");
        const existing = db
          .prepare(
            "SELECT id,body FROM live_messages WHERE session_id=? AND user_id=? AND operation_key=?",
          )
          .get(req.live.id, req.user.id, b.operation_key);
        if (existing) {
          if (existing.body !== b.body.trim())
            throw new LiveError("Use a new message operation key.", 409);
          return { id: existing.id };
        }
        if (
          db
            .prepare("SELECT count(*) n FROM live_messages WHERE session_id=?")
            .get(req.live.id).n >= 500
        )
          return null;
        return db
          .prepare(
            "INSERT INTO live_messages(session_id,user_id,body,operation_key) VALUES(?,?,?,?) RETURNING id",
          )
          .get(req.live.id, req.user.id, b.body.trim(), b.operation_key);
      });
      if (!result)
        return res
          .status(409)
          .json({ error: "Session message limit reached (500)." });
      res.status(201).json(result);
    },
  );
  app.patch(
    "/api/live/:session/members",
    required,
    ready,
    target,
    host,
    (req, res) => {
      const b = req.body;
      if (
        b?.role !== "remove" &&
        (req.live.closed_at || !writable(req.livePost, req.user))
      )
        return res
          .status(403)
          .json({ error: "This session cannot accept new participants." });
      if (
        !["editor", "viewer", "remove"].includes(b?.role) ||
        !validUsername(b.username)
      )
        return res.status(400).json({
          error: "Choose an exact username and viewer/editor access.",
        });
      const u = db
        .prepare(
          "SELECT * FROM users WHERE username=? COLLATE NOCASE AND deleted_at IS NULL",
        )
        .get(b.username);
      if (!u || u.id === req.live.host_id || !canRead(db, u, req.livePost))
        return res.status(404).json({
          error: "That person cannot be invited to this conversation.",
        });
      if (b.role === "editor" && !writable(req.livePost, u))
        return res.status(409).json({
          error:
            "This person needs project participation approval before editing.",
        });
      const result = atomic(db, () => {
        fresh(req);
        if (
          b.role !== "remove" &&
          (req.live.closed_at || !writable(req.livePost, req.user))
        )
          throw new LiveError("This session cannot accept participants.");
        if (
          !canRead(db, u, req.livePost) ||
          (b.role === "editor" && !writable(req.livePost, u))
        )
          throw new LiveError("This person no longer has access.");
        if (b.role === "remove") {
          db.prepare(
            "DELETE FROM live_members WHERE session_id=? AND user_id=? AND role<>'host'",
          ).run(req.live.id, u.id);
          db.prepare(
            "DELETE FROM live_presence WHERE session_id=? AND user_id=?",
          ).run(req.live.id, u.id);
          return true;
        }
        if (
          !db
            .prepare(
              "SELECT 1 FROM live_members WHERE session_id=? AND user_id=?",
            )
            .get(req.live.id, u.id) &&
          db
            .prepare("SELECT count(*) n FROM live_members WHERE session_id=?")
            .get(req.live.id).n >= 12
        )
          return false;
        const previous = db
          .prepare(
            "SELECT role FROM live_members WHERE session_id=? AND user_id=?",
          )
          .get(req.live.id, u.id);
        db.prepare(
          "INSERT INTO live_members(session_id,user_id,role,invited_by) VALUES(?,?,?,?) ON CONFLICT(session_id,user_id) DO UPDATE SET role=excluded.role",
        ).run(req.live.id, u.id, b.role, req.user.id);
        if (previous?.role !== b.role) {
          const key = `live:${req.live.id}`;
          db.prepare(
            "DELETE FROM notifications WHERE recipient_id=? AND event_key=?",
          ).run(u.id, key);
          notify(db, {
            recipient: u.id,
            actor: req.user.id,
            post: req.live.post_id,
            type: "live_invite",
            key,
          });
        }
        return true;
      });
      if (!result)
        return res
          .status(409)
          .json({ error: "A session supports up to 12 participants." });
      res.json({ members: members(req.live.id) });
    },
  );
  app.post(
    "/api/live/:session/close",
    required,
    ready,
    target,
    host,
    (req, res) => {
      if (
        !text(req.body?.summary, 4000, 3) ||
        Number(req.body.expected_revision) !== req.live.revision
      )
        return res.status(409).json({
          error:
            "Refresh the shared code, then write a summary before closing.",
        });
      const result = atomic(db, () => {
        fresh(req);
        return db
          .prepare(
            "UPDATE live_sessions SET summary=?,closed_at=CURRENT_TIMESTAMP WHERE id=? AND revision=? AND closed_at IS NULL RETURNING id",
          )
          .get(
            req.body.summary.trim(),
            req.live.id,
            req.body.expected_revision,
          );
      });
      if (!result)
        return res
          .status(409)
          .json({ error: "New code arrived. Review it before closing." });
      db.prepare("DELETE FROM live_presence WHERE session_id=?").run(
        req.live.id,
      );
      res.json({ ok: true });
    },
  );
  app.post(
    "/api/live/:session/publish",
    required,
    ready,
    target,
    host,
    (req, res) => {
      if (!req.live.closed_at || !writable(req.livePost, req.user))
        return res.status(403).json({
          error:
            "Close the session and check conversation permissions before publishing.",
        });
      if (req.body?.confirm !== true)
        return res
          .status(400)
          .json({ error: "Explicit publication confirmation is required." });
      const reply = atomic(db, () => {
        const current = fresh(req);
        if (!current.closed_at || !writable(req.livePost, req.user))
          throw new LiveError("Conversation permissions changed.");
        if (current.published_reply_id) return current.published_reply_id;
        const { code } = liveDocument(current.state);
        const fence = "`".repeat(
          Math.max(3, ...(code.match(/`+/g) || []).map((x) => x.length + 1)),
        );
        const body = `## Live session: ${current.title}\n\n${current.summary}\n\n${fence}${current.language === "text" ? "" : current.language}\n${code}\n${fence}\n\n[View the session](/app#live/${current.id})`;
        const id = Number(
          db
            .prepare("INSERT INTO replies(post_id,user_id,body) VALUES(?,?,?)")
            .run(current.post_id, req.user.id, body).lastInsertRowid,
        );
        db.prepare(
          "UPDATE live_sessions SET published_reply_id=? WHERE id=?",
        ).run(id, current.id);
        notifyReply(db, req.livePost, id, req.user.id, null);
        return id;
      });
      res.json({ reply_id: reply });
    },
  );
  app.use("/api", (error, req, res, next) => {
    if (!(error instanceof LiveError)) return next(error);
    res.status(error.status).json({ error: error.message });
  });
}
