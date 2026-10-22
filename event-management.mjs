import { InputError } from "./validation.mjs";
import { communities, dateInZone } from "./domain.mjs";
import { notify, transaction } from "./activity.mjs";
const validText = (v, min, max) =>
  typeof v === "string" && v.trim().length >= min && v.length <= max;
function parse(data, db) {
  const { title, description, topic, local_start, timezone, duration, url } =
    data;
  if (
    !validText(title, 5, 160) ||
    !validText(description, 20, 5000) ||
    !(
      typeof topic === "string" &&
      db
        .prepare("SELECT 1 FROM taxonomy WHERE id=? AND kind='topic'")
        .get(topic)
    ) ||
    !validText(timezone, 1, 100) ||
    !validText(local_start, 1, 30) ||
    !Number.isInteger(duration) ||
    duration < 15 ||
    duration > 720
  )
    throw new InputError(
      "Check the title, description, community, date, timezone and duration.",
    );
  let link;
  try {
    link = new URL(url);
  } catch {
    throw new InputError("Add a valid meeting link.");
  }
  if (!["http:", "https:"].includes(link.protocol) || url.length > 1000)
    throw new InputError("Use an http:// or https:// meeting link.");
  const start = dateInZone(local_start, timezone);
  if (new Date(start).getTime() <= Date.now())
    throw new InputError("Choose a start time in the future.");
  return [
    title.trim(),
    description.trim(),
    topic,
    start,
    new Date(new Date(start).getTime() + duration * 60000).toISOString(),
    timezone,
    url,
  ];
}
function escape(value) {
  return String(value)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/\r\n|\r/g, "\n")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}
function fold(line) {
  let result = "",
    part = "",
    size = 0;
  for (const char of line) {
    const bytes = Buffer.byteLength(char);
    if (size + bytes > 73) {
      result += part + "\r\n";
      part = " ";
      size = 1;
    }
    part += char;
    size += bytes;
  }
  return result + part;
}
function stamp(date) {
  return new Date(date.includes("T") ? date : date.replace(" ", "T") + "Z")
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}
export function registerEventManagement(app, db, required) {
  if (!db.schemaCurrent) {
    for (const [column, type] of [
      ["updated_at", "TEXT"],
      ["cancelled_at", "TEXT"],
      ["revision", "INTEGER NOT NULL DEFAULT 0"],
    ])
      if (
        !db
          .prepare("PRAGMA table_info(events)")
          .all()
          .some((c) => c.name === column)
      )
        db.exec(`ALTER TABLE events ADD COLUMN ${column} ${type}`);
  }
  function audience(event, type, version, actor) {
    for (const { user_id } of db
      .prepare("SELECT user_id FROM memberships WHERE kind='event' AND item=?")
      .all(String(event.id)))
      notify(db, {
        recipient: user_id,
        actor,
        event: event.id,
        type,
        key: `${type}:${event.id}:${version}`,
      });
  }
  app.patch("/api/events/:id", required, (req, res) => {
    const event = db
      .prepare("SELECT * FROM events WHERE id=?")
      .get(req.params.id);
    if (!event) return res.status(404).json({ error: "Event not found." });
    if (event.user_id !== req.user.id)
      return res
        .status(403)
        .json({ error: "Only the organizer can edit this event." });
    if (!Number.isSafeInteger(req.body.revision) || req.body.revision < 0)
      return res
        .status(400)
        .json({ error: "A valid event revision is required." });
    let values;
    try {
      values = parse(req.body, db);
    } catch (e) {
      if (!(e instanceof InputError) && !(e instanceof RangeError)) throw e;
      return res.status(400).json({
        error:
          e instanceof RangeError ? "Choose a valid IANA timezone." : e.message,
      });
    }
    const changed = transaction(db, () => {
      const r = db
        .prepare(
          "UPDATE events SET title=?,description=?,topic=?,start_at=?,end_at=?,timezone=?,url=?,updated_at=CURRENT_TIMESTAMP,revision=revision+1 WHERE id=? AND revision=?",
        )
        .run(...values, event.id, req.body.revision);
      if (!r.changes) return false;
      audience(event, "event_updated", event.revision + 1, req.user.id);
      return true;
    });
    if (!changed)
      return res.status(409).json({
        error: "This event changed in another tab. Refresh before editing it.",
      });
    res.json({ id: event.id });
  });
  app.post("/api/events/:id/lifecycle", required, (req, res) => {
    const event = db
      .prepare("SELECT * FROM events WHERE id=?")
      .get(req.params.id);
    if (!event) return res.status(404).json({ error: "Event not found." });
    if (event.user_id !== req.user.id)
      return res.status(403).json({
        error: "Only the organizer can cancel or restore this event.",
      });
    const { action, revision } = req.body;
    if (
      !["cancel", "restore"].includes(action) ||
      !Number.isSafeInteger(revision)
    )
      return res.status(400).json({
        error: "Choose cancel or restore and a valid event revision.",
      });
    if (event.revision !== revision)
      return res
        .status(409)
        .json({ error: "This event changed. Refresh and try again." });
    if (
      action === "restore" &&
      new Date(event.start_at).getTime() <= Date.now()
    )
      return res.status(400).json({
        error:
          "Edit the start time to a future date before restoring this event.",
      });
    if (
      (action === "cancel" && event.cancelled_at) ||
      (action === "restore" && !event.cancelled_at)
    )
      return res.json({ ok: true });
    transaction(db, () => {
      db.prepare(
        `UPDATE events SET cancelled_at=${action === "cancel" ? "CURRENT_TIMESTAMP" : "NULL"},updated_at=CURRENT_TIMESTAMP,revision=revision+1 WHERE id=?`,
      ).run(event.id);
      audience(
        event,
        action === "cancel" ? "event_cancelled" : "event_restored",
        revision + 1,
        req.user.id,
      );
    });
    res.json({ ok: true });
  });
  app.get("/api/events/:id/calendar", (req, res) => {
    const event = db
      .prepare("SELECT * FROM events WHERE id=?")
      .get(req.params.id);
    if (!event) return res.status(404).json({ error: "Event not found." });
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Devdevian//Community Events//EN",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `UID:devdevian-event-${event.id}@localhost`,
      `DTSTAMP:${stamp(event.updated_at || event.created)}`,
      `DTSTART:${stamp(event.start_at)}`,
      `DTEND:${stamp(event.end_at)}`,
      `SEQUENCE:${event.revision}`,
      `STATUS:${event.cancelled_at ? "CANCELLED" : "CONFIRMED"}`,
      `SUMMARY:${escape(event.title)}`,
      `DESCRIPTION:${escape(event.description + "\nOrganizer timezone: " + event.timezone + "\nFind the meeting link in Devdevian after registering.")}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ];
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="devdevian-event-${event.id}.ics"`,
    );
    res.send(lines.map(fold).join("\r\n") + "\r\n");
  });
}
