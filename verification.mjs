import { randomUUID } from "node:crypto";
import { isPlatformOwner, requirePlatformOwner } from "./platform-owner.mjs";
import { literalPattern } from "./search-sql.mjs";

// Trust metadata lives outside editable profile details. Never trust client claims.
export function identityBadge(db, id) {
  const row = db
    .prepare("SELECT id,email,email_verified,deleted_at FROM users WHERE id=?")
    .get(id);
  if (!row || row.deleted_at) return { verified: false, founder: false };
  const founder = isPlatformOwner(row);
  const entry = db
    .prepare(
      "SELECT data FROM entity_details WHERE kind='user-verification' AND entity_id=?",
    )
    .get(String(id));
  return {
    verified: founder || JSON.parse(entry?.data || "{}").verified === true,
    founder,
  };
}
export function registerVerification(app, db, required) {
  const owner = [required, requirePlatformOwner];
  app.get("/api/platform/users", ...owner, (req, res) => {
    const q =
      typeof req.query.q === "string"
        ? req.query.q.trim().replace(/^@/, "")
        : "";
    if (q.length > 80)
      return res.status(400).json({ error: "Search up to 80 characters." });
    const items = db
      .prepare(
        "SELECT id,name,username FROM users WHERE deleted_at IS NULL AND privacy='public' AND (username GLOB ? OR name GLOB ?) ORDER BY username,id LIMIT 20",
      )
      .all("*" + literalPattern(q) + "*", "*" + literalPattern(q) + "*");
    res.json({
      items: items.map((u) => ({ ...u, ...identityBadge(db, u.id) })),
    });
  });
  app.patch("/api/platform/users/:id/verification", ...owner, (req, res) => {
    const id = Number(req.params.id);
    if (
      !Number.isSafeInteger(id) ||
      id < 1 ||
      typeof req.body?.verified !== "boolean"
    )
      return res
        .status(400)
        .json({ error: "Choose a user and verification state." });
    const u = db
      .prepare(
        "SELECT id FROM users WHERE id=? AND deleted_at IS NULL AND privacy='public'",
      )
      .get(id);
    if (!u) return res.status(404).json({ error: "Public profile not found." });
    const badge = identityBadge(db, id);
    if (badge.founder)
      return res
        .status(409)
        .json({
          error: "The founder badge is managed by server configuration.",
        });
    const decision = {
      verified: req.body.verified,
      reviewer_id: req.user.id,
      created: new Date().toISOString(),
    };
    // One atomic statement stores both current state and an append-only decision record.
    db.prepare(
      "INSERT OR REPLACE INTO entity_details(kind,entity_id,data) VALUES('user-verification',?,?),('verification-event',?,?)",
    ).run(
      String(id),
      JSON.stringify(decision),
      randomUUID(),
      JSON.stringify({ ...decision, user_id: id }),
    );
    res.json({ ...u, ...identityBadge(db, id) });
  });
}
