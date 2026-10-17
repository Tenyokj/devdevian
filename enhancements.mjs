import {
  preferences,
  preferenceDefaults,
  validUsername,
} from "./preferences.mjs";
import { randomUUID } from "node:crypto";
import { pageRows, scopeSQL, memberOf } from "./spaces.mjs";
import { normalizeName, literalPattern } from "./search-sql.mjs";
export { normalizeName } from "./search-sql.mjs";
export function manages(db, user, id) {
  return (
    !!user &&
    !!id &&
    memberOf(db, user, id) &&
    !!db
      .prepare(
        "SELECT 1 FROM private_communities WHERE id=? AND (owner_id=? OR EXISTS(SELECT 1 FROM validators v WHERE v.community_id=? AND v.user_id=?))",
      )
      .get(id, user.id, id, user.id)
  );
}
export function canModeratePost(db, user, post) {
  return (
    !!post &&
    !!user &&
    (post.community_id
      ? manages(db, user, post.community_id)
      : user.platform_role === "moderator")
  );
}
export function details(db, kind, id) {
  return JSON.parse(
    db
      .prepare("SELECT data FROM entity_details WHERE kind=? AND entity_id=?")
      .get(kind, String(id))?.data || "{}",
  );
}
export function registerEnhancements(app, db, required, seed) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS user_settings(user_id INTEGER PRIMARY KEY,data TEXT NOT NULL)",
  );
  db.function("dev_search", { deterministic: true }, (haystack, query) =>
    normalizeName(query)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 10)
      .every((word) => normalizeName(haystack || "").includes(word))
      ? 1
      : 0,
  );
  db.function("dev_has_technology", { deterministic: true }, (stack, name) =>
    String(stack || "")
      .split(",")
      .some((t) => normalizeName(t) === name)
      ? 1
      : 0,
  );
  db.exec(`CREATE TABLE IF NOT EXISTS taxonomy(id TEXT PRIMARY KEY,kind TEXT NOT NULL,name TEXT NOT NULL,normalized TEXT NOT NULL,created_by INTEGER,UNIQUE(kind,normalized));
 CREATE TABLE IF NOT EXISTS entity_details(kind TEXT,entity_id TEXT,data TEXT NOT NULL,PRIMARY KEY(kind,entity_id));
 CREATE TABLE IF NOT EXISTS validators(community_id TEXT,user_id INTEGER,PRIMARY KEY(community_id,user_id));`);
  if (
    !db
      .prepare("PRAGMA table_info(taxonomy)")
      .all()
      .some((c) => c.name === "match_pattern")
  )
    db.exec("ALTER TABLE taxonomy ADD COLUMN match_pattern TEXT");
  const cols = db.prepare("PRAGMA table_info(users)").all();
  for (const [n, t] of [
    ["username", "TEXT"],
    ["username_locked", "INTEGER NOT NULL DEFAULT 1"],
    ["privacy", "TEXT DEFAULT 'public'"],
    ["deleted_at", "TEXT"],
  ])
    if (!cols.some((c) => c.name === n))
      db.exec(`ALTER TABLE users ADD COLUMN ${n} ${t}`);
  if (
    !db
      .prepare("PRAGMA table_info(posts)")
      .all()
      .some((c) => c.name === "removed_at")
  )
    db.exec("ALTER TABLE posts ADD COLUMN removed_at TEXT");
  db.exec(
    // Enforce uniqueness in storage as well as in signup validation; concurrent
    // registrations must never claim the same handle with different casing.
    "CREATE UNIQUE INDEX IF NOT EXISTS users_username ON users(username COLLATE NOCASE)",
  );
  db.prepare(
    "UPDATE users SET username='builder_'||id WHERE username IS NULL",
  ).run();
  for (const t of seed)
    db.prepare(
      "INSERT OR IGNORE INTO taxonomy(id,kind,name,normalized) VALUES(?,?,?,?)",
    ).run(t.id, "topic", t.name, normalizeName(t.name));
  for (const name of [
    "React",
    "TypeScript",
    "JavaScript",
    "Node.js",
    "Python",
    "Rust",
    "Solidity",
    "Foundry",
    "Docker",
    "PostgreSQL",
    "Next.js",
    "Figma",
  ])
    db.prepare(
      "INSERT OR IGNORE INTO taxonomy(id,kind,name,normalized) VALUES(?,?,?,?)",
    ).run(
      "tech-" + normalizeName(name),
      "technology",
      name,
      normalizeName(name),
    );
  for (const t of db
    .prepare("SELECT id,name FROM taxonomy WHERE match_pattern IS NULL")
    .all())
    db.prepare("UPDATE taxonomy SET match_pattern=? WHERE id=?").run(
      literalPattern(t.name),
      t.id,
    );
  function taxonomy(req, kind, paged = false) {
    const params = [kind];
    let where = "t.kind=?";
    if (req.query.q) {
      where += " AND t.normalized LIKE ?";
      params.push("%" + normalizeName(req.query.q).slice(0, 80) + "%");
    }
    const count =
      kind === "topic"
        ? "p.topic=t.id"
        : "dev_has_technology(p.stack,t.normalized)";
    const sql = `SELECT t.*,t.name short,'violet' color,'#' symbol,'' description,(SELECT COUNT(*) FROM posts p WHERE ${scopeSQL("p", req.user)} AND p.removed_at IS NULL AND ${count}) post_count FROM taxonomy t WHERE ${where} ORDER BY post_count DESC,t.name COLLATE NOCASE`;
    return paged
      ? pageRows(db, req, sql, params, 8)
      : db.prepare(sql).all(...params);
  }
  app.get("/api/topics", (req, res) => res.json(taxonomy(req, "topic")));
  app.get("/api/taxonomy/:kind", (req, res) => {
    if (!["topic", "technology"].includes(req.params.kind))
      return res.status(404).json({ error: "Unknown catalog." });
    res.json(taxonomy(req, req.params.kind, true));
  });
  app.post("/api/taxonomy/:kind", required, (req, res) => {
    const kind = req.params.kind,
      name =
        typeof req.body.name === "string"
          ? req.body.name.normalize("NFKC").trim().replace(/\s+/gu, " ")
          : "";
    if (
      !["topic", "technology"].includes(kind) ||
      name.length < 2 ||
      name.length > 60 ||
      /[\x00-\x1f,]/.test(name)
    )
      return res
        .status(400)
        .json({ error: "Use a name with 2–60 characters, without commas." });
    const normalized = normalizeName(name),
      existing = db
        .prepare("SELECT * FROM taxonomy WHERE kind=? AND normalized=?")
        .get(kind, normalized);
    if (existing)
      return res.status(409).json({
        error: "This already exists. Select it from the list.",
        existing,
      });
    const recent = db
      .prepare("SELECT COUNT(*) n FROM taxonomy WHERE created_by=?")
      .get(req.user.id).n;
    if (recent >= 200)
      return res.status(429).json({ error: "Catalog creation limit reached." });
    const id = randomUUID();
    db.prepare(
      "INSERT INTO taxonomy(id,kind,name,normalized,created_by,match_pattern) VALUES(?,?,?,?,?,?)",
    ).run(id, kind, name, normalized, req.user.id, literalPattern(normalized));
    res.status(201).json({ id, name, post_count: 0 });
  });
  const ownerOf = (kind, id) =>
    kind === "user"
      ? { user_id: Number(id) }
      : db
          .prepare(
            `SELECT ${kind === "community" ? "owner_id" : "user_id"} user_id FROM ${{ post: "posts", project: "projects", event: "events", community: "private_communities" }[kind]} WHERE id=?`,
          )
          .get(id);
  function validate(data, user, kind, id) {
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw Error("Invalid details.");
    const clean = { ...details(db, kind, id || "") };
    for (const key of ["tagline", "audience", "problem"])
      if (key in data) {
        if (typeof data[key] !== "string" || data[key].length > 1000)
          throw Error("Keep project fields under 1,000 characters.");
        clean[key] = data[key].trim();
      }
    for (const key of ["logo", "banner", "avatar", "screenshots"])
      if (key in data) {
        if (kind === "post")
          throw Error("Use protected post attachments for images.");
        const ids =
          key === "screenshots" ? data[key] : data[key] ? [data[key]] : [];
        if (
          !Array.isArray(ids) ||
          ids.length > (key === "screenshots" ? 10 : 1)
        )
          throw Error("Choose up to ten screenshots.");
        for (const file of ids) {
          const f = db.prepare("SELECT * FROM uploads WHERE id=?").get(file);
          if (
            !f ||
            f.user_id !== user.id ||
            f.post_id ||
            !f.mime.startsWith("image/")
          )
            throw Error("Choose one of your uploaded images.");
        }
        clean[key] = key === "screenshots" ? ids : ids[0] || null;
      }
    if ("links" in data) {
      if (!Array.isArray(data.links) || data.links.length > 100)
        throw Error("Use up to 100 links.");
      clean.links = data.links.map((l) => {
        if (
          typeof l.label !== "string" ||
          !l.label.trim() ||
          l.label.length > 80 ||
          typeof l.url !== "string" ||
          l.url.length > 1000 ||
          !/^https?:$/.test(new URL(l.url).protocol)
        )
          throw Error("Each link needs a label and an http(s) URL.");
        return { label: l.label.trim(), url: l.url };
      });
    }
    if ("topics" in data) {
      if (
        !Array.isArray(data.topics) ||
        data.topics.length > 10 ||
        !data.topics.every((t) =>
          db
            .prepare("SELECT 1 FROM taxonomy WHERE id=? AND kind='topic'")
            .get(t),
        )
      )
        throw Error("Choose up to ten existing topics.");
      clean.topics = data.topics;
    }
    if ("team" in data) {
      if (
        !Array.isArray(data.team) ||
        data.team.length > 30 ||
        new Set(data.team.map((m) => m.user_id)).size !== data.team.length
      )
        throw Error("Choose up to 30 distinct team members.");
      clean.team = data.team.map((m) => {
        if (
          !db
            .prepare("SELECT 1 FROM users WHERE id=? AND deleted_at IS NULL")
            .get(m.user_id) ||
          typeof m.role !== "string" ||
          !m.role.trim() ||
          m.role.length > 80
        )
          throw Error("Choose a member and a role (up to 80 characters).");
        return { user_id: Number(m.user_id), role: m.role.trim() };
      });
    }
    return clean;
  }
  function enrich(kind, item) {
    if (!item?.id) return item;
    const d = details(db, kind, item.id);
    return {
      ...item,
      ...d,
      ...(kind === "community"
        ? {
            topic_labels: (d.topics || [])
              .map(
                (id) =>
                  db.prepare("SELECT name FROM taxonomy WHERE id=?").get(id)
                    ?.name,
              )
              .filter(Boolean),
          }
        : {}),
      ...(kind === "post"
        ? { author_avatar: details(db, "user", item.user_id).avatar }
        : {}),
      ...(d.team
        ? {
            team: d.team.map((m) => ({
              ...m,
              ...db
                .prepare("SELECT name,username FROM users WHERE id=?")
                .get(m.user_id),
            })),
          }
        : {}),
      ...(kind === "user" ? { avatar: d.avatar, banner: d.banner } : {}),
    };
  }
  app.put("/api/details/:kind/:id", required, (req, res) => {
    const { kind, id } = req.params;
    if (!["post", "project", "event", "community", "user"].includes(kind))
      return res.status(404).json({ error: "Not found." });
    if (ownerOf(kind, id)?.user_id !== req.user.id)
      return res.status(403).json({ error: "Only the owner can edit this." });
    try {
      const data = validate(req.body, req.user, kind, id);
      db.prepare("INSERT OR REPLACE INTO entity_details VALUES(?,?,?)").run(
        kind,
        id,
        JSON.stringify(data),
      );
      res.json(data);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  app.get("/api/people", (req, res) => {
    const q = "%" + String(req.query.q || "").slice(0, 80) + "%";
    const result = pageRows(
      db,
      req,
      "SELECT id,name,username,role FROM users WHERE deleted_at IS NULL AND privacy='public' AND (name LIKE ? OR username LIKE ?) ORDER BY name,id",
      [q, q],
      8,
    );
    res.json({
      ...result,
      items: result.items.map((p) => ({
        ...p,
        avatar: details(db, "user", p.id).avatar,
      })),
    });
  });
  app.get("/api/people/:id/avatar", (req, res) => {
    const avatar = details(db, "user", req.params.id).avatar;
    if (!avatar) return res.status(404).end();
    res.redirect("/api/uploads/" + avatar);
  });
  app.get("/api/handles/:username", (req, res) => {
    const u = db
      .prepare(
        "SELECT id,name,username FROM users WHERE username=? COLLATE NOCASE AND deleted_at IS NULL AND privacy='public'",
      )
      .get(req.params.username);
    if (!u) return res.status(404).json({ error: "Member not found." });
    res.json({ ...u, avatar: details(db, "user", u.id).avatar });
  });
  app.get("/api/search", (req, res) => {
    const q = String(req.query.q || "")
        .trim()
        .slice(0, 160),
      like = "%" + q + "%",
      type = String(req.query.type || "posts"),
      topic = String(req.query.topic || ""),
      scope = String(req.query.scope || "all");
    if (q.length < 2)
      return res.json({
        items: [],
        pagination: { page: 1, pages: 1, total: 0, limit: 8 },
      });
    let sql,
      params = [];
    if (type === "projects") {
      sql =
        "SELECT pr.id,pr.post_id,pr.name title,pr.description excerpt,pr.topic,'project' type FROM projects pr JOIN posts p ON p.id=pr.post_id WHERE " +
        scopeSQL("p", req.user) +
        " AND p.removed_at IS NULL AND dev_search(pr.name||' '||pr.description||' '||pr.stack,?)";
      params = [q];
      if (topic) {
        sql += " AND pr.topic=?";
        params.push(topic);
      }
      sql += " ORDER BY pr.id DESC";
    } else if (type === "communities") {
      sql =
        "SELECT id,name title,description excerpt,'community' type FROM private_communities WHERE dev_search(name||' '||description,?) ORDER BY created DESC";
      params = [q];
    } else if (type === "people") {
      sql =
        "SELECT id,name title,username excerpt,'person' type FROM users WHERE deleted_at IS NULL AND privacy='public' AND dev_search(name||' '||username,?) ORDER BY name";
      params = [q];
    } else {
      sql =
        "SELECT p.id,p.title,substr(p.body,1,200) excerpt,p.topic,p.community_id,c.name community_name,'post' type FROM posts p LEFT JOIN private_communities c ON c.id=p.community_id WHERE " +
        scopeSQL("p", req.user) +
        " AND p.removed_at IS NULL AND dev_search(p.title||' '||p.body||' '||p.stack,?)";
      params = [q];
      if (topic) {
        sql += " AND p.topic=?";
        params.push(topic);
      }
      if (scope === "public") sql += " AND p.community_id IS NULL";
      if (scope === "private") sql += " AND p.community_id IS NOT NULL";
      sql += " ORDER BY p.id DESC";
    }
    res.json(pageRows(db, req, sql, params, 8));
  });
  app.patch("/api/communities/:id/owner", required, (req, res) => {
    const c = db
      .prepare("SELECT * FROM private_communities WHERE id=?")
      .get(req.params.id);
    if (c?.owner_id !== req.user.id)
      return res
        .status(403)
        .json({ error: "Only the owner can transfer ownership." });
    const id = req.body.user_id;
    if (
      !Number.isInteger(id) ||
      id === req.user.id ||
      !memberOf(db, { id }, c.id)
    )
      return res.status(400).json({ error: "Choose another approved member." });
    db.prepare("UPDATE private_communities SET owner_id=? WHERE id=?").run(
      id,
      c.id,
    );
    db.prepare("DELETE FROM validators WHERE community_id=? AND user_id=?").run(
      c.id,
      id,
    );
    res.json({ ok: true });
  });
  app.get("/api/communities/:id/members", required, (req, res) => {
    if (!memberOf(db, req.user, req.params.id))
      return res.status(403).json({ error: "Community membership required." });
    const params = [req.params.id];
    let sql =
      "SELECT u.id,u.name,u.username FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.kind='group' AND m.item=? AND u.deleted_at IS NULL";
    if (req.query.q) {
      sql += " AND dev_search(u.name||' '||u.username,?)";
      params.push(String(req.query.q));
    }
    const result = pageRows(db, req, sql + " ORDER BY u.name", params, 8);
    res.json({
      ...result,
      items: result.items.map((p) => ({
        ...p,
        avatar: details(db, "user", p.id).avatar,
      })),
    });
  });
  app.get("/api/communities/:id/validators", required, (req, res) => {
    if (!manages(db, req.user, req.params.id))
      return res
        .status(403)
        .json({ error: "Owner or validator access required." });
    res.json(
      db
        .prepare(
          "SELECT u.id,u.name,u.username FROM validators v JOIN users u ON u.id=v.user_id WHERE v.community_id=?",
        )
        .all(req.params.id),
    );
  });
  app.put("/api/communities/:id/validators", required, (req, res) => {
    const c = db
      .prepare("SELECT * FROM private_communities WHERE id=?")
      .get(req.params.id);
    if (c?.owner_id !== req.user.id)
      return res
        .status(403)
        .json({ error: "Only the owner can appoint validators." });
    const ids = req.body.user_ids;
    if (
      !Array.isArray(ids) ||
      ids.length > 20 ||
      !ids.every(
        (id) =>
          Number.isInteger(id) &&
          id !== c.owner_id &&
          memberOf(db, { id }, c.id),
      )
    )
      return res
        .status(400)
        .json({ error: "Choose up to 20 approved community members." });
    db.exec("BEGIN");
    try {
      db.prepare("DELETE FROM validators WHERE community_id=?").run(c.id);
      for (const id of new Set(ids))
        db.prepare("INSERT INTO validators VALUES(?,?)").run(c.id, id);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    res.json({ ok: true });
  });
  // Shared response decoration preserves the existing paging and access checks.
  app.use("/api", (req, res, next) => {
    const json = res.json.bind(res),
      path = req.path;
    const createKind =
      {
        "/posts": "post",
        "/projects": "project",
        "/events": "event",
        "/communities": "community",
        "/developer-profile": "user",
      }[path] ||
      (/^\/(events|posts)\/\d+$/.test(path) && req.method === "PATCH"
        ? path.startsWith("/events")
          ? "event"
          : "post"
        : null);
    if (
      path === "/developer-profile" &&
      req.user &&
      req.body.username !== undefined &&
      req.body.username !== req.user.username
    )
      return res.status(409).json({
        error: "Your username is permanent. Change your display name instead.",
      });
    let pending;
    if (createKind && req.body?.details && req.user) {
      try {
        pending = validate(
          req.body.details,
          req.user,
          createKind,
          createKind === "user"
            ? req.user.id
            : path.match(/^\/events\/(\d+)$/)?.[1] || "",
        );
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }
    }
    res.json = (value) => {
      if (res.statusCode >= 400) return json(value);
      if (pending) {
        const id = createKind === "user" ? req.user.id : value?.id;
        if (id)
          db.prepare("INSERT OR REPLACE INTO entity_details VALUES(?,?,?)").run(
            createKind,
            String(id),
            JSON.stringify(pending),
          );
      }
      let kind = /^\/communities(?:\/[^/]+)?$/.test(path)
        ? "community"
        : /^\/projects(?:\/\d+)?$/.test(path)
          ? "project"
          : /^\/events(?:\/\d+)?$/.test(path)
            ? "event"
            : /^\/posts(?:\/\d+)?$/.test(path)
              ? "post"
              : /^\/users\/\d+$/.test(path)
                ? "user"
                : null;
      const decorate = (item) => {
        const v = enrich(kind, item);
        if (kind === "community")
          v.is_validator = manages(db, req.user, item.id) && !v.is_owner;
        if (kind === "post")
          v.can_moderate = canModeratePost(db, req.user, item);
        return v;
      };
      if (kind) {
        if (Array.isArray(value)) value = value.map(decorate);
        else if (value?.items)
          value = { ...value, items: value.items.map(decorate) };
        else value = decorate(value);
      }
      if (value?.user) value = { ...value, user: enrich("user", value.user) };
      if (kind === "post" && value?.project)
        value.project = enrich("project", value.project);
      return json(value);
    };
    next();
  });
  app.get("/api/account/preferences", required, (req, res) =>
    res.json({
      privacy: req.user.privacy,
      preferences: preferences(db, req.user.id),
    }),
  );
  app.patch("/api/account/preferences", required, (req, res) => {
    if (
      req.body.username !== undefined &&
      req.body.username !== req.user.username
    )
      return res.status(409).json({
        error:
          "Your username is permanent. You can change your display name in Edit profile.",
      });
    const privacy = req.body.privacy ?? req.user.privacy;
    const updates = req.body.preferences ?? {};
    if (
      !["public", "hidden"].includes(privacy) ||
      !updates ||
      typeof updates !== "object" ||
      Array.isArray(updates) ||
      Object.entries(updates).some(
        ([k, v]) => !(k in preferenceDefaults) || typeof v !== "boolean",
      )
    )
      return res
        .status(400)
        .json({ error: "Check your privacy and notification preferences." });
    db.exec("BEGIN");
    try {
      db.prepare("UPDATE users SET privacy=? WHERE id=?").run(
        privacy,
        req.user.id,
      );
      db.prepare("INSERT OR REPLACE INTO user_settings VALUES(?,?)").run(
        req.user.id,
        JSON.stringify({ ...preferences(db, req.user.id), ...updates }),
      );
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    res.json({ ok: true, privacy, preferences: preferences(db, req.user.id) });
  });
  app.post("/api/account/username", required, (req, res) => {
    if (req.user.username_locked)
      return res.status(409).json({
        error: "Your username has already been chosen and cannot be changed.",
      });
    if (!validUsername(req.body.username))
      return res.status(400).json({
        error:
          "Choose 3–30 letters, digits or underscores, starting with a letter.",
      });
    try {
      const r = db
        .prepare(
          "UPDATE users SET username=?,username_locked=1 WHERE id=? AND username_locked=0",
        )
        .run(req.body.username.toLowerCase(), req.user.id);
      if (!r.changes)
        return res.status(409).json({ error: "Username already chosen." });
      res.json({ ok: true });
    } catch (e) {
      if (e.code?.includes("CONSTRAINT"))
        return res
          .status(409)
          .json({ error: "This username is already taken." });
      throw e;
    }
  });
  app.delete("/api/account", required, (req, res) => {
    if (req.body.confirm !== req.user.username)
      return res
        .status(400)
        .json({ error: "Type your username to confirm deletion." });
    if (
      db
        .prepare("SELECT 1 FROM private_communities WHERE owner_id=?")
        .get(req.user.id)
    )
      return res.status(409).json({
        error:
          "Transfer ownership of your communities before deleting your account.",
      });
    db.exec("BEGIN");
    try {
      db.prepare(
        "UPDATE users SET email=?,password='',name='Deleted member',bio='',location='',role='',stack='',github='',website='',username=?,deleted_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(
        "deleted-" + randomUUID() + "@invalid.local",
        "deleted_" + req.user.id,
        req.user.id,
      );
      db.prepare("DELETE FROM sessions WHERE user_id=?").run(req.user.id);
      db.prepare("DELETE FROM memberships WHERE user_id=?").run(req.user.id);
      db.prepare("DELETE FROM validators WHERE user_id=?").run(req.user.id);
      db.prepare("DELETE FROM join_requests WHERE user_id=?").run(req.user.id);
      db.prepare("DELETE FROM device_accounts WHERE user_id=?").run(
        req.user.id,
      );
      db.prepare("DELETE FROM oauth_accounts WHERE user_id=?").run(req.user.id);
      db.prepare(
        "DELETE FROM entity_details WHERE kind='user' AND entity_id=?",
      ).run(String(req.user.id));
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    res.json({ ok: true });
  });
}

export function importPublicTechnologies(db) {
  for (const row of db
    .prepare(
      "SELECT stack FROM posts WHERE community_id IS NULL UNION SELECT stack FROM projects UNION SELECT stack FROM users WHERE privacy='public' AND deleted_at IS NULL",
    )
    .all()) {
    for (const raw of String(row.stack || "").split(",")) {
      const name = raw.normalize("NFKC").trim().replace(/\s+/gu, " ");
      if (name.length >= 2 && name.length <= 60 && !/[\x00-\x1f]/.test(name))
        db.prepare(
          "INSERT OR IGNORE INTO taxonomy(id,kind,name,normalized,match_pattern) VALUES(?,'technology',?,?,?)",
        ).run(randomUUID(), name, normalizeName(name), literalPattern(name));
    }
  }
}
