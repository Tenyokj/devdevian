import { createHash } from "node:crypto";
import { canRead } from "./spaces.mjs";
import { transaction } from "./activity.mjs";
import { validatedDetails } from "./enhancements.mjs";
const fields = [
  "name",
  "description",
  "url",
  "repo",
  "topic",
  "stack",
  "stage",
  "help",
];
const text = (v, min, max) =>
  typeof v === "string" && v.trim().length >= min && v.length <= max;
const link = (value) => {
  try {
    return (
      typeof value === "string" &&
      value.length <= 1000 &&
      (!value || ["https:", "http:"].includes(new URL(value).protocol))
    );
  } catch {
    return false;
  }
};
export function registerCatalog(app, db, required) {
  function project(id, user) {
    const row = db
      .prepare(
        "SELECT pr.*,u.name founder_name,u.role founder_role,(SELECT COUNT(*) FROM replies r WHERE r.post_id=pr.post_id) feedback_count FROM projects pr JOIN users u ON u.id=pr.user_id WHERE pr.id=?",
      )
      .get(id);
    const post =
      row && db.prepare("SELECT * FROM posts WHERE id=?").get(row.post_id);
    if (!post || post.community_id || !canRead(db, user, post)) return null;
    const metadata =
      db
        .prepare(
          "SELECT data FROM entity_details WHERE kind='project' AND entity_id=?",
        )
        .get(String(row.id))?.data || "{}";
    return {
      ...row,
      revision: createHash("sha256")
        .update(
          JSON.stringify([
            fields.map((key) => row[key]),
            post.revision,
            metadata,
          ]),
        )
        .digest("hex"),
    };
  }
  app.get("/api/projects/:id", (req, res) => {
    const row = project(req.params.id, req.user);
    if (!row) return res.status(404).json({ error: "Project not found." });
    res.json(row);
  });
  app.patch("/api/projects/:id", required, (req, res) => {
    const row = project(req.params.id, req.user);
    if (!row) return res.status(404).json({ error: "Project not found." });
    if (row.user_id !== req.user.id)
      return res
        .status(403)
        .json({ error: "Only the founder can edit this project." });
    const b = req.body;
    if (
      !text(b.name, 2, 80) ||
      !text(b.description, 20, 5000) ||
      !text(b.help, 10, 1500) ||
      !text(b.stack, 0, 150) ||
      !link(b.url) ||
      !link(b.repo) ||
      !["Idea", "Prototype", "Beta", "Live"].includes(b.stage) ||
      typeof b.topic !== "string" ||
      !db
        .prepare("SELECT 1 FROM taxonomy WHERE id=? AND kind='topic'")
        .get(b.topic)
    )
      return res.status(400).json({
        error:
          "Check the project name, description, request, links, topic, stack and stage.",
      });
    if (typeof b.revision !== "string" || !/^[a-f0-9]{64}$/.test(b.revision))
      return res
        .status(400)
        .json({ error: "Refresh the project before editing." });
    const result = transaction(db, () => {
      const current = project(row.id, req.user);
      if (
        !current ||
        current.user_id !== req.user.id ||
        current.revision !== b.revision
      )
        return null;
      if (
        b.url &&
        db
          .prepare("SELECT 1 FROM projects WHERE user_id=? AND url=? AND id<>?")
          .get(req.user.id, b.url.trim(), row.id)
      )
        return { duplicate: true };
      const values = fields.map((key) =>
        typeof b[key] === "string" ? b[key].trim() : b[key],
      );
      db.prepare(
        "UPDATE projects SET name=?,description=?,url=?,repo=?,topic=?,stack=?,stage=?,help=? WHERE id=?",
      ).run(...values, row.id);
      db.prepare(
        "UPDATE posts SET title=?,body=?,topic=?,stack=?,revision=revision+1 WHERE id=?",
      ).run(
        `Showcase: ${b.name.trim()}`,
        `${b.description.trim()}\n\n## What I need help with\n${b.help.trim()}${b.url ? "\n\n[Try the project](" + b.url + ")" : ""}${b.repo ? "\n\n[Source code](" + b.repo + ")" : ""}`,
        b.topic,
        b.stack.trim(),
        row.post_id,
      );
      if (req[validatedDetails]) {
        db.prepare(
          "INSERT OR REPLACE INTO entity_details VALUES('project',?,?)",
        ).run(String(row.id), JSON.stringify(req[validatedDetails]));
        res.locals.detailsSaved = true;
      }
      return project(row.id, req.user);
    });
    if (!result)
      return res
        .status(409)
        .json({ error: "This project changed. Refresh before editing." });
    if (result.duplicate)
      return res
        .status(409)
        .json({ error: "You already shared a project with this link." });
    res.json(result);
  });
  function event(id, user) {
    const row = db
      .prepare(
        "SELECT e.*,u.name organizer_name,u.username organizer_username,(SELECT COUNT(*) FROM memberships m WHERE m.kind='event' AND m.item=CAST(e.id AS TEXT)) attendee_count,EXISTS(SELECT 1 FROM memberships m WHERE m.kind='event' AND m.item=CAST(e.id AS TEXT) AND m.user_id=?) viewer_attending FROM events e JOIN users u ON u.id=e.user_id WHERE e.id=?",
      )
      .get(user?.id || 0, id);
    if (!row) return null;
    const { url, ...visible } = row;
    return {
      ...visible,
      viewer_attending: !!row.viewer_attending,
      ...(user &&
      (user.id === row.user_id || (row.viewer_attending && !row.cancelled_at))
        ? { url }
        : {}),
    };
  }
  app.get("/api/events/:id", (req, res) => {
    const row = event(req.params.id, req.user);
    if (!row) return res.status(404).json({ error: "Event not found." });
    res.json(row);
  });
  // Desired state, rather than a toggle: retrying cannot accidentally leave an event.
  app.put("/api/events/:id/attendance", required, (req, res) => {
    if (typeof req.body.attending !== "boolean")
      return res.status(400).json({ error: "Choose whether to attend." });
    const result = transaction(db, () => {
      const row = event(req.params.id, req.user);
      if (!row) return { error: "Event not found.", status: 404 };
      if (
        req.body.attending &&
        (row.cancelled_at || new Date(row.end_at).getTime() <= Date.now())
      )
        return { error: "Registration is closed for this event.", status: 409 };
      if (req.body.attending)
        db.prepare("INSERT OR IGNORE INTO memberships VALUES(?,'event',?)").run(
          req.user.id,
          String(row.id),
        );
      else
        db.prepare(
          "DELETE FROM memberships WHERE user_id=? AND kind='event' AND item=?",
        ).run(req.user.id, String(row.id));
      return event(row.id, req.user);
    });
    if (result.error)
      return res.status(result.status).json({ error: result.error });
    res.json(result);
  });
}
