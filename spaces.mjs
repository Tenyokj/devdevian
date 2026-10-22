import { manages, canModeratePost } from "./enhancements.mjs";
import { randomUUID } from "node:crypto";
export function pageRows(db, req, sql, params = [], defaultSize = 12) {
  const size = Math.min(
    30,
    Math.max(1, Number.parseInt(req.query.limit, 10) || defaultSize),
  );
  const total = db
    .prepare(`SELECT COUNT(*) total FROM (${sql})`)
    .get(...params).total;
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(
    pages,
    Math.max(1, Number.parseInt(req.query.page, 10) || 1),
  );
  return {
    items: db
      .prepare(sql + " LIMIT ? OFFSET ?")
      .all(...params, size, (page - 1) * size),
    pagination: { page, pages, total, limit: size },
  };
}
export function scopeSQL(alias, user) {
  return user
    ? `(${alias}.community_id IS NULL OR EXISTS(SELECT 1 FROM memberships acl WHERE acl.user_id=${Number(user.id)} AND acl.kind='group' AND acl.item=${alias}.community_id))`
    : `${alias}.community_id IS NULL`;
}
export function memberOf(db, user, id) {
  return !!(
    user &&
    db
      .prepare(
        "SELECT 1 FROM memberships WHERE user_id=? AND kind='group' AND item=?",
      )
      .get(user.id, id)
  );
}
export function canRead(db, user, post) {
  return (
    !!post &&
    (!post.community_id || memberOf(db, user, post.community_id)) &&
    (!post.removed_at ||
      post.user_id === user?.id ||
      canModeratePost(db, user, post))
  );
}
export function installAccess(app, db) {
  app.use("/api", (req, res, next) => {
    let post = null;
    const path = req.path;
    let match;
    if ((match = path.match(/^\/posts\/(\d+)(?:\/|$)/)))
      post = db.prepare("SELECT * FROM posts WHERE id=?").get(match[1]);
    else if ((match = path.match(/^\/replies\/(\d+)(?:\/|$)/)))
      post = db
        .prepare(
          "SELECT p.* FROM posts p JOIN replies r ON r.post_id=p.id WHERE r.id=?",
        )
        .get(match[1]);
    else if ((match = path.match(/^\/projects\/(\d+)(?:\/|$)/)))
      post = db
        .prepare(
          "SELECT p.* FROM posts p JOIN projects pr ON pr.post_id=p.id WHERE pr.id=?",
        )
        .get(match[1]);
    if (post && !canRead(db, req.user, post))
      return res
        .status(404)
        .json({ error: "This content is not available to your account." });
    next();
  });
}
export function registerSpaces(app, db, required, topics) {
  if (!db.schemaCurrent) {
    const columns = db
      .prepare("PRAGMA table_info(posts)")
      .all()
      .map((c) => c.name);
    for (const [name, type] of [
      ["community_id", "TEXT"],
      ["code", "TEXT DEFAULT ''"],
      ["review_focus", "TEXT DEFAULT ''"],
      ["demo_url", "TEXT DEFAULT ''"],
      ["repo_url", "TEXT DEFAULT ''"],
    ])
      if (!columns.includes(name))
        db.exec(`ALTER TABLE posts ADD COLUMN ${name} ${type}`);
    db.exec(`CREATE TABLE IF NOT EXISTS private_communities(id TEXT PRIMARY KEY,owner_id INTEGER NOT NULL,name TEXT NOT NULL,description TEXT NOT NULL,created TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS join_requests(id INTEGER PRIMARY KEY,community_id TEXT NOT NULL,user_id INTEGER NOT NULL,status TEXT DEFAULT 'pending',created TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(community_id,user_id));
 CREATE INDEX IF NOT EXISTS posts_space ON posts(community_id);`);
  }
  const select = `SELECT c.*,u.name owner_name,(SELECT COUNT(*) FROM memberships m WHERE m.kind='group' AND m.item=c.id) members FROM private_communities c JOIN users u ON u.id=c.owner_id`;
  function metadata(c, user) {
    const is_member =
      c.is_member === undefined ? memberOf(db, user, c.id) : !!c.is_member;
    return {
      ...c,
      is_member,
      is_owner: user?.id === c.owner_id,
      requested:
        c.requested === undefined
          ? !!(
              user &&
              db
                .prepare(
                  "SELECT 1 FROM join_requests WHERE community_id=? AND user_id=? AND status='pending'",
                )
                .get(c.id, user.id)
            )
          : !!c.requested,
      posts: is_member
        ? (c.posts ??
          db
            .prepare("SELECT COUNT(*) n FROM posts WHERE community_id=?")
            .get(c.id).n)
        : null,
      color: "violet",
      symbol: "{ }",
      topics: "Private community · members only",
    };
  }

  app.get("/api/communities", (req, res) => {
    const where = [],
      params = [];
    if (req.query.q) {
      where.push("(c.name LIKE ? OR c.description LIKE ?)");
      params.push(
        "%" + String(req.query.q).slice(0, 200) + "%",
        "%" + String(req.query.q).slice(0, 200) + "%",
      );
    }
    if (req.query.joined === "1") {
      where.push(
        "EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=? AND m.kind='group' AND m.item=c.id)",
      );
      params.push(req.user?.id || 0);
    }
    const result = pageRows(
      db,
      req,
      select.replace(
        "SELECT c.*,",
        `SELECT c.*,
        EXISTS(SELECT 1 FROM memberships mine WHERE mine.user_id=${Number(req.user?.id) || 0} AND mine.kind='group' AND mine.item=c.id) is_member,
        EXISTS(SELECT 1 FROM join_requests j WHERE j.community_id=c.id AND j.user_id=${Number(req.user?.id) || 0} AND j.status='pending') requested,
        CASE WHEN EXISTS(SELECT 1 FROM memberships mine WHERE mine.user_id=${Number(req.user?.id) || 0} AND mine.kind='group' AND mine.item=c.id) THEN (SELECT COUNT(*) FROM posts p WHERE p.community_id=c.id) ELSE NULL END posts,`,
      ) +
        (where.length ? " WHERE " + where.join(" AND ") : "") +
        " ORDER BY c.created DESC,c.id",
      params,
    );
    res.json({
      ...result,
      items: result.items.map((c) => metadata(c, req.user)),
    });
  });
  app.post("/api/communities", required, (req, res) => {
    const { name, description } = req.body;
    if (
      typeof name !== "string" ||
      name.trim().length < 3 ||
      name.length > 80 ||
      typeof description !== "string" ||
      description.trim().length < 10 ||
      description.length > 1500
    )
      return res.status(400).json({
        error:
          "Add a name (3–80 characters) and description (10–1,500 characters).",
      });
    if (
      db
        .prepare("SELECT COUNT(*) n FROM private_communities WHERE owner_id=?")
        .get(req.user.id).n >= 20
    )
      return res
        .status(429)
        .json({ error: "You can own up to 20 communities." });
    const id = randomUUID();
    db.exec("BEGIN");
    try {
      db.prepare(
        "INSERT INTO private_communities(id,owner_id,name,description) VALUES(?,?,?,?)",
      ).run(id, req.user.id, name.trim(), description.trim());
      db.prepare("INSERT INTO memberships VALUES(?,'group',?)").run(
        req.user.id,
        id,
      );
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    res
      .status(201)
      .json(metadata(db.prepare(select + " WHERE c.id=?").get(id), req.user));
  });
  app.get("/api/communities/:id", (req, res) => {
    const c = db.prepare(select + " WHERE c.id=?").get(req.params.id);
    if (!c) return res.status(404).json({ error: "Community not found." });
    res.json(metadata(c, req.user));
  });
  app.post("/api/communities/:id/request", required, (req, res) => {
    if (
      !db
        .prepare("SELECT 1 FROM private_communities WHERE id=?")
        .get(req.params.id)
    )
      return res.status(404).json({ error: "Community not found." });
    if (memberOf(db, req.user, req.params.id)) return res.json({ ok: true });
    db.prepare(
      "INSERT INTO join_requests(community_id,user_id) VALUES(?,?) ON CONFLICT(community_id,user_id) DO UPDATE SET status='pending'",
    ).run(req.params.id, req.user.id);
    res.json({ ok: true });
  });
  const owner = (req, res, next) => {
    if (!manages(db, req.user, req.params.id))
      return res
        .status(403)
        .json({ error: "Only the owner or a validator can manage access." });
    next();
  };
  app.get("/api/communities/:id/requests", required, owner, (req, res) =>
    res.json(
      pageRows(
        db,
        req,
        "SELECT r.id,r.status,r.created,u.id user_id,u.name FROM join_requests r JOIN users u ON u.id=r.user_id WHERE r.community_id=? AND r.status='pending' ORDER BY r.id",
        [req.params.id],
        10,
      ),
    ),
  );
  app.patch(
    "/api/communities/:id/requests/:request",
    required,
    owner,
    (req, res) => {
      const r = db
        .prepare(
          "SELECT * FROM join_requests WHERE id=? AND community_id=? AND status='pending'",
        )
        .get(req.params.request, req.params.id);
      if (!r)
        return res.status(404).json({ error: "Pending request not found." });
      if (!["approve", "reject"].includes(req.body.action))
        return res.status(400).json({ error: "Choose approve or reject." });
      db.exec("BEGIN");
      try {
        if (req.body.action === "approve")
          db.prepare(
            "INSERT OR IGNORE INTO memberships VALUES(?,'group',?)",
          ).run(r.user_id, r.community_id);
        db.prepare("UPDATE join_requests SET status=? WHERE id=?").run(
          req.body.action === "approve" ? "approved" : "rejected",
          r.id,
        );
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      res.json({ ok: true });
    },
  );
}
