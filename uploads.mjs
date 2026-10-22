import { limitValue, QuotaError } from "./limits.mjs";
import express from "express";
import { randomUUID } from "node:crypto";
import { objectStorage } from "./object-storage.mjs";
import { canRead } from "./spaces.mjs";
export function attachments(db, postId, replyId = null) {
  return db
    .prepare(
      "SELECT id,name,mime,size FROM uploads WHERE post_id=? AND reply_id IS ? ORDER BY created,id",
    )
    .all(postId, replyId)
    .map((f) => ({ ...f, url: "/api/uploads/" + f.id }));
}
export function validFiles(db, user, ids) {
  return (
    Array.isArray(ids) &&
    ids.length <= 5 &&
    new Set(ids).size === ids.length &&
    ids.every(
      (id) =>
        typeof id === "string" &&
        !!db
          .prepare(
            "SELECT 1 FROM uploads WHERE id=? AND user_id=? AND post_id IS NULL",
          )
          .get(id, user.id),
    )
  );
}
export function attachFiles(db, postId, user, ids = [], replyId = null) {
  for (const id of ids)
    db.prepare(
      "UPDATE uploads SET post_id=?,reply_id=? WHERE id=? AND user_id=? AND post_id IS NULL",
    ).run(postId, replyId, id, user.id);
}
export function registerUploads(app, db, required) {
  const storage = objectStorage();
  if (!db.schemaCurrent) {
    db.exec(
      "CREATE TABLE IF NOT EXISTS uploads(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,post_id INTEGER,reply_id INTEGER,name TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL,created TEXT DEFAULT CURRENT_TIMESTAMP); CREATE INDEX IF NOT EXISTS uploads_post ON uploads(post_id,reply_id);",
    );
  }
  if (!db.schemaCurrent)
    db.exec(
      "CREATE TABLE IF NOT EXISTS upload_reservations(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,size INTEGER NOT NULL,created INTEGER NOT NULL)",
    );
  app.post(
    "/api/uploads",
    required,
    express.raw({ type: "application/octet-stream", limit: "4mb" }),
    async (req, res) => {
      if (!Buffer.isBuffer(req.body) || !req.body.length)
        return res.status(400).json({ error: "Choose a non-empty file." });
      let name;
      try {
        name = decodeURIComponent(req.headers["x-filename"] || "file");
      } catch {
        return res.status(400).json({ error: "Invalid file name." });
      }
      name = name.replace(/[\x00-\x1f\/\\]/g, "_").slice(0, 180);
      const b = req.body;
      let mime = "";
      if (
        b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      )
        mime = "image/png";
      else if (b[0] === 255 && b[1] === 216 && b[2] === 255)
        mime = "image/jpeg";
      else if (/^GIF8[79]a/.test(b.subarray(0, 6).toString()))
        mime = "image/gif";
      else if (
        b.subarray(0, 4).toString() === "RIFF" &&
        b.subarray(8, 12).toString() === "WEBP"
      )
        mime = "image/webp";
      else if (b.subarray(0, 5).toString() === "%PDF-")
        mime = "application/pdf";
      else if (b[0] === 80 && b[1] === 75 && [3, 5, 7].includes(b[2]))
        mime = "application/zip";
      else if (
        /\.(txt|md|json|js|jsx|ts|tsx|py|rs|sol|css|csv|log|yml|yaml)$/i.test(
          name,
        ) &&
        !b.includes(0)
      )
        mime = "text/plain";
      if (!mime)
        return res.status(400).json({
          error:
            "Supported: PNG, JPEG, WebP, GIF, PDF, ZIP and text/code files. SVG and HTML are not accepted.",
        });
      const id = randomUUID(),
        now = Date.now();
      // Reserve bytes before the network write. Parallel uploads and separate
      // function instances cannot overrun the configured storage budget.
      db.exec("BEGIN IMMEDIATE");
      try {
        const daily = db
          .prepare(
            `SELECT SUM(n) n,SUM(bytes) bytes FROM (
          SELECT COUNT(*) n,COALESCE(SUM(size),0) bytes FROM uploads WHERE user_id=? AND created>datetime('now','-1 day')
          UNION ALL SELECT COUNT(*),COALESCE(SUM(size),0) FROM upload_reservations WHERE user_id=? AND created>?)`,
          )
          .get(req.user.id, req.user.id, now - 86400000);
        const used = db
          .prepare(
            "SELECT (SELECT COALESCE(SUM(size),0) FROM uploads)+(SELECT COALESCE(SUM(size),0) FROM upload_reservations) bytes",
          )
          .get().bytes;
        if (
          daily.n >= limitValue("UPLOADS_PER_DAY", 40) ||
          daily.bytes + b.length >
            limitValue("UPLOAD_BYTES_PER_DAY", 40 * 1024 * 1024) ||
          used + b.length > limitValue("STORAGE_MAX_BYTES", 750 * 1024 * 1024)
        )
          throw new QuotaError(
            "Upload limit reached. Please try later or contact the administrator.",
          );
        db.prepare("INSERT INTO upload_reservations VALUES(?,?,?,?)").run(
          id,
          req.user.id,
          b.length,
          now,
        );
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        if (error instanceof QuotaError)
          return res
            .status(429)
            .set("Retry-After", "3600")
            .json({ error: error.message });
        throw error;
      }
      try {
        await storage.put(id, b, mime);
        db.exec("BEGIN IMMEDIATE");
        try {
          db.prepare(
            "INSERT INTO uploads(id,user_id,name,mime,size) VALUES(?,?,?,?,?)",
          ).run(id, req.user.id, name, mime, b.length);
          db.prepare("DELETE FROM upload_reservations WHERE id=?").run(id);
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      } catch (error) {
        // Keep the reservation if object deletion fails, so abandoned bytes
        // remain counted until maintenance can safely remove them.
        try {
          await storage.remove(id);
          db.prepare("DELETE FROM upload_reservations WHERE id=?").run(id);
        } catch {}
        throw error;
      }
      res
        .status(201)
        .json({ id, name, mime, size: b.length, url: "/api/uploads/" + id });
    },
  );
  app.get("/api/uploads/:id", async (req, res, next) => {
    const f = db.prepare("SELECT * FROM uploads WHERE id=?").get(req.params.id);
    if (!f) return res.status(404).json({ error: "File not found." });
    const permitted = f.post_id
      ? canRead(
          db,
          req.user,
          db.prepare("SELECT * FROM posts WHERE id=?").get(f.post_id),
        )
      : req.user?.id === f.user_id ||
        (f.mime.startsWith("image/") &&
          !!db
            .prepare(
              "SELECT 1 FROM entity_details WHERE json_extract(data,'$.logo')=? OR json_extract(data,'$.banner')=? OR json_extract(data,'$.avatar')=? OR EXISTS(SELECT 1 FROM json_each(json_extract(data,'$.screenshots')) WHERE value=?)",
            )
            .get(f.id, f.id, f.id, f.id));
    if (!permitted) return res.status(404).json({ error: "File not found." });
    let bytes;
    try {
      bytes = await storage.get(f.id);
    } catch (error) {
      if (
        error.code === "ENOENT" ||
        error.name === "NoSuchKey" ||
        error.$metadata?.httpStatusCode === 404
      )
        return res.status(404).end();
      return next(error);
    }
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", f.mime);
    res.setHeader(
      "Content-Disposition",
      `${f.mime.startsWith("image/") ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
    );
    res.send(bytes);
  });
}
