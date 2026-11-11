import { validatePackage } from "./extension-package.mjs";
import { builtinThemes, validateManifest } from "./extension-manifest.mjs";
import { transaction } from "./activity.mjs";
import { consumeBudget } from "./limits.mjs";
export function prepareExtensions(db) {
  db.exec(
    `CREATE TABLE IF NOT EXISTS extension_releases(id INTEGER PRIMARY KEY,slug TEXT NOT NULL,version TEXT NOT NULL,user_id INTEGER NOT NULL,name TEXT NOT NULL,description TEXT NOT NULL,manifest TEXT NOT NULL,review TEXT NOT NULL DEFAULT 'unreviewed' CHECK(review IN('unreviewed','reviewed','withdrawn')),reviewer_id INTEGER,review_note TEXT NOT NULL DEFAULT '',created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(slug,version)); CREATE INDEX IF NOT EXISTS extension_slug_owner ON extension_releases(slug,user_id,id); CREATE TABLE IF NOT EXISTS extension_installs(user_id INTEGER NOT NULL,release_key TEXT NOT NULL,created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,release_key)); CREATE TABLE IF NOT EXISTS extension_active(user_id INTEGER PRIMARY KEY,release_key TEXT NOT NULL); CREATE INDEX IF NOT EXISTS extension_author ON extension_releases(user_id,id); CREATE INDEX IF NOT EXISTS extension_active_release ON extension_active(release_key,user_id); CREATE TABLE IF NOT EXISTS extension_reviews(id INTEGER PRIMARY KEY,release_id INTEGER NOT NULL,reviewer_id INTEGER NOT NULL,status TEXT NOT NULL,note TEXT NOT NULL,created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`,
  );
  const columns = db
    .prepare("PRAGMA table_info(extension_installs)")
    .all()
    .map((x) => x.name);
  if (!columns.includes("enabled"))
    db.exec(
      "ALTER TABLE extension_installs ADD COLUMN enabled INTEGER NOT NULL DEFAULT 0",
    );
  if (!columns.includes("grants"))
    db.exec(
      "ALTER TABLE extension_installs ADD COLUMN grants TEXT NOT NULL DEFAULT '[]'",
    );
}
export function extensionsReady(db) {
  return (
    db
      .prepare(
        "SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name IN('extension_releases','extension_installs','extension_active','extension_reviews')",
      )
      .get().n === 4 &&
    db
      .prepare("PRAGMA table_info(extension_installs)")
      .all()
      .filter((x) => ["enabled", "grants"].includes(x.name)).length === 2
  );
}
const reviewer = (user) =>
  !!user &&
  (process.env.EXTENSION_REVIEWER_EMAILS || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .includes(user.email?.toLowerCase());
const cleanText = (v, min, max) =>
  typeof v === "string" &&
  v.trim().length >= min &&
  v.length <= max &&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v);
const version = (x) =>
  typeof x === "string" &&
  /^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$/.test(x);
const newer = (a, b) => {
  const x = a.split(".").map(Number),
    y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};
export function registerExtensions(
  app,
  db,
  required,
  { migrate = false } = {},
) {
  if (!db.schemaCurrent || migrate) prepareExtensions(db);
  const ready = extensionsReady(db);
  const gate = (req, res, next) =>
    ready
      ? next()
      : res
          .status(503)
          .json({ error: "Extensions are awaiting server preparation." });
  const select = `SELECT e.*,u.name author_name,u.username author_username FROM extension_releases e JOIN users u ON u.id=e.user_id WHERE u.deleted_at IS NULL`;
  const output = (r) =>
    r && {
      id: "theme-" + r.id,
      slug: r.slug,
      name: r.name,
      version: r.version,
      description: r.description,
      manifest: JSON.parse(r.manifest),
      review: r.review,
      review_note: r.review_note,
      author: {
        id: r.user_id,
        name: r.author_name,
        username: r.author_username,
      },
      created: r.created,
      builtin: false,
    };
  const release = (id) =>
    builtinThemes.find((x) => x.id === id) ||
    (/^theme-[1-9]\d{0,9}$/.test(String(id))
      ? output(db.prepare(select + " AND e.id=?").get(Number(id.slice(6))))
      : null);
  const available = (id) => {
    const r = release(id);
    return r && r.review !== "withdrawn" ? r : null;
  };
  const stored = (row) =>
    row &&
    (builtinThemes.find((x) => x.id === row.release_key) ||
      (row.id && row.author_name !== null ? output(row) : null));
  const joined =
    " LEFT JOIN extension_releases e ON s.release_key='theme-'||e.id LEFT JOIN users u ON u.id=e.user_id AND u.deleted_at IS NULL ";
  // One joined read, rather than a remote round trip for every installed theme.
  const state = (user, minimal = false, code = false) => {
    if (!user) return { installed: [], active: null, can_review: false };
    const selected = stored(
      db
        .prepare(
          "SELECT s.release_key,e.*,u.name author_name,u.username author_username FROM extension_active s" +
            joined +
            " WHERE s.user_id=?",
        )
        .get(user.id),
    );
    const active =
      selected && selected.review !== "withdrawn" ? selected : null;
    const enabled = code
      ? db
          .prepare(
            "SELECT s.release_key,s.grants install_grants,e.*,u.name author_name,u.username author_username FROM extension_installs s" +
              joined +
              " WHERE s.user_id=? AND s.enabled=1 ORDER BY s.created,s.release_key LIMIT 8",
          )
          .all(user.id)
          .map((row) => {
            const r = stored(row);
            return r &&
              r.review !== "withdrawn" &&
              r.manifest.kind === "extension"
              ? { ...r, grants: JSON.parse(row.install_grants) }
              : null;
          })
          .filter(Boolean)
      : [];
    if (minimal) return { active, enabled, can_review: reviewer(user) };
    const installed = db
      .prepare(
        "SELECT s.release_key,s.enabled install_enabled,s.grants install_grants,e.*,u.name author_name,u.username author_username FROM extension_installs s" +
          joined +
          " WHERE s.user_id=? ORDER BY s.created DESC,s.release_key LIMIT 100",
      )
      .all(user.id)
      .map((row) => {
        const r = stored(row);
        return r
          ? {
              ...r,
              enabled: !!row.install_enabled,
              grants: JSON.parse(row.install_grants),
            }
          : null;
      })
      .filter((r) => r && (code || r.manifest.kind === "theme"));
    return {
      installed,
      active,
      enabled,
      can_review: reviewer(user),
      published: db
        .prepare(select + " AND e.user_id=? ORDER BY e.id DESC LIMIT 100")
        .all(user.id)
        .map(output)
        .filter((r) => code || r.manifest.kind === "theme"),
    };
  };
  const format2 = (req) => req.get("X-Devdevian-Extensions") === "2";
  const budget = (req, max = 12) =>
    consumeBudget(db, [
      {
        key:
          "extensions:" +
          req.method +
          ":" +
          (req.route?.path || req.path) +
          ":" +
          req.user.id,
        max,
        window: 3600000,
      },
    ]);
  app.get("/api/extensions/library", gate, (req, res) => {
    const page = Math.max(1, Math.min(1000, Number(req.query.page) || 1)),
      q = String(req.query.q || "")
        .trim()
        .slice(0, 80),
      filter = req.query.filter;
    if (!Number.isInteger(page))
      return res.status(400).json({ error: "Invalid page." });
    const where =
      " AND e.review<>'withdrawn' AND e.id=(SELECT MAX(x.id) FROM extension_releases x WHERE x.slug=e.slug) AND (instr(lower(e.name),lower(?))>0 OR instr(lower(e.description),lower(?))>0)" +
      (filter === "reviewed" ? " AND e.review='reviewed'" : "") +
      (format2(req) ? "" : " AND json_extract(e.manifest,'$.kind')='theme'");
    const total = db
      .prepare(
        "SELECT COUNT(*) total FROM extension_releases e JOIN users u ON u.id=e.user_id WHERE u.deleted_at IS NULL" +
          where,
      )
      .get(q, q).total;
    const items = db
      .prepare(select + where + " ORDER BY e.id DESC LIMIT 12 OFFSET ?")
      .all(q, q, (page - 1) * 12)
      .map(output);
    res.set("Cache-Control", "no-store").json({
      builtins:
        page === 1
          ? builtinThemes.filter((x) =>
              (x.name + " " + x.description)
                .toLowerCase()
                .includes(q.toLowerCase()),
            )
          : [],
      items,
      pagination: { page, pages: Math.max(1, Math.ceil(total / 12)), total },
    });
  });
  app.get("/api/extensions/me", gate, (req, res) =>
    res
      .set("Cache-Control", "no-store")
      .json(state(req.user, req.query.active_only === "1", format2(req))),
  );
  app.get("/api/extensions/releases/:id", gate, (req, res) => {
    const r = release(req.params.id);
    return r
      ? res.json(r)
      : res.status(404).json({ error: "Theme not found." });
  });
  app.post("/api/extensions/publish", required, gate, (req, res) => {
    const b = req.body || {};
    if (
      !cleanText(b.name, 3, 60) ||
      !cleanText(b.description, 20, 1200) ||
      !version(b.version) ||
      typeof b.slug !== "string" ||
      !/^[a-z][a-z0-9-]{2,47}$/.test(b.slug) ||
      builtinThemes.some((x) => x.slug === b.slug)
    )
      return res.status(400).json({
        error:
          "Use a name, description, lowercase slug and a version such as 1.0.0.",
      });
    let manifest;
    try {
      manifest =
        b.manifest?.kind === "extension"
          ? validatePackage(b.manifest)
          : validateManifest(b.manifest);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    budget(req);
    const result = transaction(db, () => {
      const prior = db
        .prepare(
          "SELECT user_id,version FROM extension_releases WHERE slug=? ORDER BY id DESC LIMIT 1",
        )
        .get(b.slug);
      if (
        prior &&
        (prior.user_id !== req.user.id || !newer(b.version, prior.version))
      )
        return {
          error:
            "This slug is owned by another author or the version is not newer.",
        };
      if (
        db
          .prepare("SELECT COUNT(*) n FROM extension_releases WHERE user_id=?")
          .get(req.user.id).n >= 100
      )
        return { error: "Publication limit reached. Contact the maintainer." };
      const r = db
        .prepare(
          "INSERT INTO extension_releases(slug,version,user_id,name,description,manifest) VALUES(?,?,?,?,?,?)",
        )
        .run(
          b.slug,
          b.version,
          req.user.id,
          b.name.trim(),
          b.description.trim(),
          JSON.stringify(manifest),
        );
      return { id: "theme-" + r.lastInsertRowid };
    });
    return result.error
      ? res.status(409).json(result)
      : res.status(201).json(release(result.id));
  });
  app.post("/api/extensions/install", required, gate, (req, res) => {
    budget(req, 120);
    const result = transaction(db, () => {
      const r = available(req.body?.release);
      if (!r) return { status: 404, error: "Theme unavailable." };
      if (r.review !== "reviewed" && req.body?.acknowledge_unreviewed !== true)
        return {
          status: 409,
          error:
            "Confirm that this version has not been reviewed by Devdevian.",
        };
      if (r.manifest.kind === "extension") {
        const granted = req.body?.granted_permissions;
        if (
          !Array.isArray(granted) ||
          JSON.stringify([...granted].sort()) !==
            JSON.stringify([...r.manifest.permissions].sort())
        )
          return {
            status: 409,
            error:
              "Confirm every declared extension capability before enabling this version.",
          };
        if (
          db
            .prepare(
              "SELECT COUNT(*) n FROM extension_installs WHERE user_id=? AND enabled=1 AND release_key<>?",
            )
            .get(req.user.id, r.id).n >= 8
        )
          return {
            status: 409,
            error: "Disable another code extension first (maximum 8 enabled).",
          };
      }
      const exists = db
        .prepare(
          "SELECT 1 FROM extension_installs WHERE user_id=? AND release_key=?",
        )
        .get(req.user.id, r.id);
      if (
        !exists &&
        db
          .prepare("SELECT COUNT(*) n FROM extension_installs WHERE user_id=?")
          .get(req.user.id).n >= 100
      )
        return { status: 409, error: "Remove a theme before installing more." };
      db.prepare(
        "INSERT OR IGNORE INTO extension_installs(user_id,release_key) VALUES(?,?)",
      ).run(req.user.id, r.id);
      if (r.manifest.kind === "extension")
        db.prepare(
          "UPDATE extension_installs SET enabled=1,grants=? WHERE user_id=? AND release_key=?",
        ).run(JSON.stringify(r.manifest.permissions), req.user.id, r.id);
      else {
        db.prepare(
          "INSERT INTO extension_active(user_id,release_key) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET release_key=excluded.release_key",
        ).run(req.user.id, r.id);
      }
      return {};
    });
    return result.error
      ? res.status(result.status).json({ error: result.error })
      : res.json(state(req.user, false, format2(req)));
  });
  app.put("/api/extensions/active", required, gate, (req, res) => {
    budget(req, 120);
    const failure = transaction(db, () => {
      const id = req.body?.release;
      if (id === null) {
        db.prepare("DELETE FROM extension_active WHERE user_id=?").run(
          req.user.id,
        );
        return;
      }
      const r = available(id);
      if (
        !r ||
        !db
          .prepare(
            "SELECT 1 FROM extension_installs WHERE user_id=? AND release_key=?",
          )
          .get(req.user.id, id)
      )
        return { status: 404, error: "Install an available theme first." };
      if (r.manifest.kind !== "theme")
        return {
          status: 400,
          error: "Use the extension enable controls for code packages.",
        };
      if (r.review !== "reviewed" && req.body?.acknowledge_unreviewed !== true)
        return {
          status: 409,
          error: "Confirm the unreviewed version before applying it.",
        };
      db.prepare(
        "INSERT INTO extension_active(user_id,release_key) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET release_key=excluded.release_key",
      ).run(req.user.id, id);
    });
    if (failure)
      return res.status(failure.status).json({ error: failure.error });
    res.json(state(req.user, false, format2(req)));
  });
  app.put("/api/extensions/disable/:id", required, gate, (req, res) => {
    budget(req, 120);
    db.prepare(
      "UPDATE extension_installs SET enabled=0 WHERE user_id=? AND release_key=?",
    ).run(req.user.id, req.params.id);
    res.json(state(req.user, false, format2(req)));
  });
  app.post("/api/extensions/disable-all", required, gate, (req, res) => {
    budget(req, 120);
    transaction(db, () => {
      db.prepare("UPDATE extension_installs SET enabled=0 WHERE user_id=?").run(
        req.user.id,
      );
      db.prepare("DELETE FROM extension_active WHERE user_id=?").run(
        req.user.id,
      );
    });
    res.json(state(req.user, false, format2(req)));
  });
  app.delete("/api/extensions/installs/:id", required, gate, (req, res) => {
    budget(req, 120);
    transaction(db, () => {
      db.prepare(
        "DELETE FROM extension_installs WHERE user_id=? AND release_key=?",
      ).run(req.user.id, req.params.id);
      db.prepare(
        "DELETE FROM extension_active WHERE user_id=? AND release_key=?",
      ).run(req.user.id, req.params.id);
    });
    res.json(state(req.user, false, format2(req)));
  });
  app.patch(
    "/api/extensions/releases/:id/review",
    required,
    gate,
    (req, res) => {
      const r = release(req.params.id),
        b = req.body || {};
      if (
        !reviewer(req.user) &&
        !(r?.author?.id === req.user.id && b.status === "withdrawn")
      )
        return res.status(403).json({
          error:
            "Only configured Devdevian reviewers can verify; authors can withdraw their own versions.",
        });
      if (!r || r.builtin)
        return res.status(404).json({ error: "Community theme not found." });
      if (
        !["unreviewed", "reviewed", "withdrawn"].includes(b.status) ||
        !cleanText(b.note, 5, 400)
      )
        return res.status(400).json({
          error: "Choose a review status and add a short review note.",
        });
      budget(req, 120);
      transaction(db, () => {
        db.prepare(
          "UPDATE extension_releases SET review=?,reviewer_id=?,review_note=? WHERE id=?",
        ).run(b.status, req.user.id, b.note.trim(), Number(r.id.slice(6)));
        db.prepare(
          "INSERT INTO extension_reviews(release_id,reviewer_id,status,note) VALUES(?,?,?,?)",
        ).run(Number(r.id.slice(6)), req.user.id, b.status, b.note.trim());
        if (b.status !== "reviewed")
          db.prepare(
            "UPDATE extension_installs SET enabled=0 WHERE release_key=?",
          ).run(r.id);
        if (b.status !== "reviewed")
          db.prepare("DELETE FROM extension_active WHERE release_key=?").run(
            r.id,
          );
      });
      res.json(release(r.id));
    },
  );
}
