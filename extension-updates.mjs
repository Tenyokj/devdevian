import { createHash } from "node:crypto";
import { transaction } from "./activity.mjs";
export const newerExtension = (a, b) => {
  const x = a.split(".").map(Number),
    y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};
const digest = (value) => createHash("sha256").update(value).digest("hex");
const summary = (r) => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  version: r.version,
  review: r.review,
  created: r.created,
  permissions: r.manifest.permissions || [],
  kind: r.manifest.kind,
  changelog: r.listing?.changelog || "",
});
export function compareExtensionReleases(from, to) {
  const old = new Set(from.manifest.permissions || []),
    next = new Set(to.manifest.permissions || []);
  const files = (m) => ({
    ...m.files,
    ...(m.kind === "extension"
      ? Object.fromEntries(
          Object.entries(m.styles).map(([k, v]) => ["host-style:" + k, v]),
        )
      : { "theme.json": JSON.stringify(m) }),
  });
  const a = files(from.manifest),
    b = files(to.manifest);
  return {
    from: summary(from),
    to: summary(to),
    added_permissions: [...next].filter((p) => !old.has(p)),
    removed_permissions: [...old].filter((p) => !next.has(p)),
    files: [...new Set([...Object.keys(a), ...Object.keys(b)])]
      .filter((k) => a[k] !== b[k])
      .map((path) => ({
        path,
        change:
          a[path] === undefined
            ? "added"
            : b[path] === undefined
              ? "removed"
              : "changed",
        before: a[path] === undefined ? null : digest(a[path]),
        after: b[path] === undefined ? null : digest(b[path]),
      })),
  };
}
export function registerExtensionUpdates(
  app,
  db,
  required,
  gate,
  { release, available, state, format2, budget, select, output },
) {
  const installed = (user, id) =>
    db
      .prepare(
        "SELECT enabled FROM extension_installs WHERE user_id=? AND release_key=?",
      )
      .get(user.id, id);
  const plan = (user, fromId, toId) => {
    if (
      typeof fromId !== "string" ||
      typeof toId !== "string" ||
      !/^theme-[1-9]\d{0,9}$/.test(fromId || "") ||
      !/^theme-[1-9]\d{0,9}$/.test(toId || "")
    )
      return { status: 400, error: "Use installed and target release IDs." };
    const from = release(fromId),
      to = available(toId);
    if (!from || !installed(user, fromId))
      return { status: 404, error: "Installed version not found." };
    if (
      !to ||
      to.builtin ||
      from.builtin ||
      from.slug !== to.slug ||
      from.author.id !== to.author.id ||
      from.manifest.kind !== to.manifest.kind ||
      !newerExtension(to.version, from.version)
    )
      return {
        status: 409,
        error: "Choose a newer available version from the same author.",
      };
    return { from, to };
  };
  app.get("/api/extensions/history/:slug", gate, (req, res) => {
    if (!/^[a-z][a-z0-9-]{2,47}$/.test(req.params.slug))
      return res.status(400).json({ error: "Invalid extension slug." });
    const page = Math.max(1, Math.min(100, Number(req.query.page) || 1));
    if (!Number.isInteger(page))
      return res.status(400).json({ error: "Invalid page." });
    const total = db
      .prepare(
        "SELECT COUNT(*) n FROM extension_releases e JOIN users u ON u.id=e.user_id WHERE e.slug=? AND e.review<>'withdrawn' AND u.deleted_at IS NULL",
      )
      .get(req.params.slug).n;
    const items = db
      .prepare(
        select +
          " AND e.slug=? AND e.review<>'withdrawn' ORDER BY e.id DESC LIMIT 12 OFFSET ?",
      )
      .all(req.params.slug, (page - 1) * 12)
      .map(output)
      .map(summary);
    res.set("Cache-Control", "no-store").json({
      items,
      pagination: { page, pages: Math.max(1, Math.ceil(total / 12)), total },
    });
  });
  app.get("/api/extensions/updates", required, gate, (req, res) => {
    const page = Math.max(1, Math.min(100, Number(req.query.page) || 1));
    if (
      !Number.isInteger(page) ||
      (req.query.from !== undefined &&
        (typeof req.query.from !== "string" ||
          !/^theme-[1-9]\d{0,9}$/.test(req.query.from)))
    )
      return res
        .status(400)
        .json({ error: "Use a valid page and installed release ID." });
    // Two bounded queries rather than one remote query for every installed version.
    const fromSQL =
      " FROM extension_installs i JOIN extension_releases o ON i.release_key='theme-'||o.id JOIN extension_releases e ON e.slug=o.slug AND e.id=(SELECT MAX(n.id) FROM extension_releases n WHERE n.slug=o.slug) JOIN users u ON u.id=e.user_id LEFT JOIN entity_details d ON d.kind='extension' AND d.entity_id=CAST(e.id AS TEXT) WHERE i.user_id=? AND u.deleted_at IS NULL AND e.review<>'withdrawn' AND e.id>o.id AND e.user_id=o.user_id AND json_extract(e.manifest,'$.kind')=json_extract(o.manifest,'$.kind')" +
      (req.query.from ? " AND i.release_key=?" : "");
    const args = [req.user.id, ...(req.query.from ? [req.query.from] : [])];
    const total = db
      .prepare("SELECT COUNT(*) total" + fromSQL)
      .get(...args).total;
    const rows = db
      .prepare(
        "SELECT e.*,d.data listing_json,u.name author_name,u.username author_username,o.id previous_id,o.manifest previous_manifest,o.name previous_name,o.version previous_version,o.review previous_review,o.created previous_created" +
          fromSQL +
          " ORDER BY e.id DESC,o.id DESC LIMIT 12 OFFSET ?",
      )
      .all(...args, (page - 1) * 12);
    const items = rows.map((row) => {
      const to = output(row),
        from = {
          ...to,
          id: "theme-" + row.previous_id,
          manifest: JSON.parse(row.previous_manifest),
          name: row.previous_name,
          version: row.previous_version,
          review: row.previous_review,
          created: row.previous_created,
          listing: {},
        };
      return compareExtensionReleases(from, to);
    });
    res.set("Cache-Control", "no-store").json({
      items,
      pagination: { page, pages: Math.max(1, Math.ceil(total / 12)), total },
      requires_confirmation: true,
    });
  });
  app.post("/api/extensions/update", required, gate, (req, res) => {
    budget(req, 120);
    const result = transaction(db, () => {
      const p = plan(req.user, req.body?.from, req.body?.release);
      if (p.error) return p;
      const { from, to } = p;
      if (req.body.acknowledge_update !== true)
        return {
          status: 409,
          error:
            "Review the version changes and explicitly confirm this update.",
        };
      if (to.review !== "reviewed" && req.body.acknowledge_unreviewed !== true)
        return {
          status: 409,
          error: "Confirm that the new version has not been reviewed.",
        };
      if (
        to.manifest.kind === "extension" &&
        (!Array.isArray(req.body.granted_permissions) ||
          JSON.stringify([...req.body.granted_permissions].sort()) !==
            JSON.stringify([...to.manifest.permissions].sort()))
      )
        return {
          status: 409,
          error: "Confirm all capabilities of the new version.",
        };
      const old = installed(req.user, from.id),
        existing = installed(req.user, to.id);
      const enabled = !!(old.enabled || existing?.enabled);
      db.prepare(
        "INSERT OR IGNORE INTO extension_installs(user_id,release_key) VALUES(?,?)",
      ).run(req.user.id, to.id);
      db.prepare(
        "UPDATE extension_installs SET enabled=?,grants=? WHERE user_id=? AND release_key=?",
      ).run(
        enabled ? 1 : 0,
        JSON.stringify(to.manifest.permissions || []),
        req.user.id,
        to.id,
      );
      db.prepare(
        "UPDATE extension_active SET release_key=? WHERE user_id=? AND release_key=?",
      ).run(to.id, req.user.id, from.id);
      db.prepare(
        "DELETE FROM extension_installs WHERE user_id=? AND release_key=?",
      ).run(req.user.id, from.id);
      return {};
    });
    return result.error
      ? res.status(result.status).json({ error: result.error })
      : res.json(state(req.user, false, format2(req)));
  });
}
