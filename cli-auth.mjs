import { randomBytes } from "node:crypto";
import { consumeBudget, privateKey, clientAddress } from "./limits.mjs";
import { allowedOrigin } from "./runtime-config.mjs";
import { transaction } from "./activity.mjs";
export const cliSessionKey = (token) =>
  /^ddv_[A-Za-z0-9_-]{43}$/.test(token || "")
    ? "cli:" + privateKey(token)
    : null;
export function prepareCli(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS cli_devices(device_hash TEXT PRIMARY KEY,user_code TEXT UNIQUE NOT NULL,name TEXT NOT NULL,expires INTEGER NOT NULL,user_id INTEGER,decision TEXT,password_version TEXT);
 CREATE INDEX IF NOT EXISTS cli_devices_expiry ON cli_devices(expires);
 CREATE TABLE IF NOT EXISTS cli_tokens(id TEXT PRIMARY KEY,session_token TEXT UNIQUE NOT NULL,user_id INTEGER NOT NULL,name TEXT NOT NULL,created TEXT DEFAULT CURRENT_TIMESTAMP); CREATE INDEX IF NOT EXISTS cli_tokens_user ON cli_tokens(user_id);`);
}
export function registerCliAuth(app, db, required) {
  if (!db.schemaCurrent) prepareCli(db);
  app.use("/api/cli", (req, res, next) => {
    req.body ??= {};
    next();
  });
  const browserOnly = (req, res, next) =>
    req.cli
      ? res
          .status(403)
          .json({ error: "Confirm this request in your signed-in browser." })
      : next();
  app.post("/api/cli/device", (req, res) => {
    const name = req.body.name;
    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.length > 80 ||
      /[\x00-\x1f\x7f]/.test(name)
    )
      return res
        .status(400)
        .json({ error: "Use a device name with 1–80 printable characters." });
    consumeBudget(db, [
      {
        key: "cli-start:" + privateKey(clientAddress(req)),
        max: 20,
        window: 600000,
      },
    ]);
    const device = randomBytes(32).toString("base64url"),
      code = randomBytes(5).toString("hex").toUpperCase(),
      expires = Date.now() + 600000;
    transaction(db, () => {
      db.prepare("DELETE FROM cli_devices WHERE expires<?").run(Date.now());
      db.prepare(
        "INSERT INTO cli_devices(device_hash,user_code,name,expires) VALUES(?,?,?,?)",
      ).run(privateKey(device), code, name.trim(), expires);
    });
    const verification = new URL("/app", allowedOrigin(req));
    verification.hash = "cli/authorize/" + code;
    res.status(201).json({
      device_code: device,
      user_code: code,
      verification_uri: verification.href,
      expires_in: 600,
      interval: 5,
    });
  });
  app.get("/api/cli/device/:code", required, browserOnly, (req, res) => {
    const row = db
      .prepare(
        "SELECT name,user_code,expires,decision FROM cli_devices WHERE user_code=? AND expires>?",
      )
      .get(String(req.params.code).toUpperCase(), Date.now());
    if (!row || row.decision)
      return res.status(404).json({
        error:
          "This request expired or has already been handled. Start login again in the terminal.",
      });
    res.json(row);
  });
  app.post("/api/cli/authorize", required, browserOnly, (req, res) => {
    if (
      typeof req.body.user_code !== "string" ||
      typeof req.body.approved !== "boolean"
    )
      return res
        .status(400)
        .json({ error: "Choose whether to authorize this device." });
    consumeBudget(db, [
      { key: `cli-approve:${req.user.id}`, max: 20, window: 600000 },
    ]);
    const r = db
      .prepare(
        "UPDATE cli_devices SET user_id=?,decision=?,password_version=? WHERE user_code=? AND expires>? AND decision IS NULL",
      )
      .run(
        req.user.id,
        req.body.approved ? "approved" : "denied",
        privateKey(req.user.password),
        req.body.user_code.toUpperCase(),
        Date.now(),
      );
    if (!r.changes)
      return res
        .status(409)
        .json({ error: "The request expired or was already handled." });
    res.json({ ok: true });
  });
  app.post("/api/cli/token", (req, res) => {
    if (
      typeof req.body.device_code !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/.test(req.body.device_code)
    )
      return res.status(400).json({ error: "Invalid device request." });
    const hash = privateKey(req.body.device_code);
    consumeBudget(db, [
      {
        key: "cli-poll-ip:" + privateKey(clientAddress(req)),
        max: 600,
        window: 600000,
      },
    ]);
    const device = db
      .prepare("SELECT * FROM cli_devices WHERE device_hash=? AND expires>?")
      .get(hash, Date.now());
    if (!device)
      return res
        .status(410)
        .json({ error: "This login request expired or was already used." });
    consumeBudget(db, [{ key: "cli-poll:" + hash, max: 150, window: 600000 }]);
    if (!device.decision)
      return res.status(202).json({ pending: true, interval: 5 });
    if (device.decision === "denied") {
      db.prepare("DELETE FROM cli_devices WHERE device_hash=?").run(hash);
      return res
        .status(403)
        .json({ error: "Device authorization was declined." });
    }
    const token = "ddv_" + randomBytes(32).toString("base64url"),
      session = cliSessionKey(token),
      id = randomBytes(16).toString("hex"),
      expires = Date.now() + 30 * 86400000;
    const result = transaction(db, () => {
      const user = db
        .prepare(
          "SELECT id,password FROM users WHERE id=? AND deleted_at IS NULL",
        )
        .get(device.user_id);
      if (!user || privateKey(user.password) !== device.password_version)
        return "unavailable";
      if (
        db
          .prepare(
            "SELECT COUNT(*) n FROM cli_tokens c JOIN sessions s ON s.token=c.session_token WHERE c.user_id=? AND s.expires>?",
          )
          .get(user.id, Date.now()).n >= 20
      )
        return "limit";
      const claim = db
        .prepare(
          "DELETE FROM cli_devices WHERE device_hash=? AND expires>? AND decision='approved' RETURNING user_id",
        )
        .get(hash, Date.now());
      if (!claim) return "used";
      db.prepare(
        "INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)",
      ).run(session, claim.user_id, expires);
      db.prepare(
        "INSERT INTO cli_tokens(id,session_token,user_id,name) VALUES(?,?,?,?)",
      ).run(id, session, claim.user_id, device.name);
      return "ok";
    });
    if (result !== "ok")
      return res.status(409).json({
        error:
          result === "limit"
            ? "Revoke an existing CLI session in Settings before connecting another device."
            : "This login is no longer available.",
      });
    res.json({
      access_token: token,
      token_type: "Bearer",
      expires_at: expires,
    });
  });
  app.get("/api/cli/sessions", required, (req, res) => {
    res.json({
      items: db
        .prepare(
          "SELECT c.id,c.name,c.created,s.expires FROM cli_tokens c JOIN sessions s ON s.token=c.session_token WHERE c.user_id=? AND s.expires>? ORDER BY c.created DESC LIMIT 20",
        )
        .all(req.user.id, Date.now()),
    });
  });
  app.delete("/api/cli/sessions/:id", required, (req, res) => {
    const row = db
      .prepare("SELECT session_token FROM cli_tokens WHERE id=? AND user_id=?")
      .get(req.params.id, req.user.id);
    if (!row) return res.status(404).json({ error: "CLI session not found." });
    transaction(db, () => {
      db.prepare("DELETE FROM sessions WHERE token=?").run(row.session_token);
      db.prepare("DELETE FROM cli_tokens WHERE id=?").run(req.params.id);
    });
    res.json({ ok: true });
  });
  app.post("/api/cli/logout", required, (req, res) => {
    if (!req.cli)
      return res
        .status(400)
        .json({ error: "Use this action from the connected CLI." });
    transaction(db, () => {
      db.prepare(
        "DELETE FROM cli_tokens WHERE session_token=? AND user_id=?",
      ).run(req.cli, req.user.id);
      db.prepare("DELETE FROM sessions WHERE token=?").run(req.cli);
    });
    res.json({ ok: true });
  });
}
