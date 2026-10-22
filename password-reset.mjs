import { encodePassword } from "./passwords.mjs";
import {
  randomBytes,
  randomInt,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import { mailReady, sendVerificationCode } from "./mail.mjs";
import { consumeBudget, privateKey, QuotaError } from "./limits.mjs";
import { reportFailure } from "./observability.mjs";
const hash = (value) => createHash("sha256").update(value).digest("hex");
export function registerPasswordReset(app, db, rate) {
  if (!db.schemaCurrent)
    db.exec(`CREATE TABLE IF NOT EXISTS password_resets(
    id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,password_version TEXT NOT NULL,
    code_hash TEXT NOT NULL,expires INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS password_resets_user ON password_resets(user_id);`);
  app.post("/api/auth/password/request", rate, async (req, res) => {
    const email =
      typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254)
      return res.status(400).json({ error: "Enter a valid email address." });
    if (!mailReady())
      return res
        .status(503)
        .json({ error: "Email delivery is temporarily unavailable." });
    try {
      consumeBudget(db, [
        { key: "reset-email:" + privateKey(email), max: 1, window: 60000 },
      ]);
    } catch (error) {
      if (!(error instanceof QuotaError)) throw error;
      return res
        .status(429)
        .set("Retry-After", "60")
        .json({ error: "Wait one minute before requesting another code." });
    }
    const id = randomBytes(32).toString("hex");
    const user = db
      .prepare(
        "SELECT id,password FROM users WHERE email=? AND deleted_at IS NULL AND email_verified=1",
      )
      .get(email);
    // Existing, unknown, OAuth and deleted accounts receive the same response.
    // No password/session changes happen until mailbox ownership is proven.
    if (user) {
      const code = String(randomInt(0, 1000000)).padStart(6, "0");
      db.prepare(
        "DELETE FROM password_resets WHERE expires<? OR user_id=?",
      ).run(Date.now(), user.id);
      db.prepare(
        "INSERT INTO password_resets(id,user_id,password_version,code_hash,expires) VALUES(?,?,?,?,?)",
      ).run(
        id,
        user.id,
        hash(user.password),
        hash(id + code),
        Date.now() + 600000,
      );
      try {
        await sendVerificationCode(email, code, {
          db,
          purpose: "password-reset",
        });
      } catch (error) {
        db.prepare("DELETE FROM password_resets WHERE id=?").run(id);
        reportFailure(error, {
          event: "password_reset_delivery_failed",
          request_id: req.requestId,
        });
        // Do not disclose account existence through provider errors either.
      }
    }
    res
      .status(202)
      .json({
        reset_required: true,
        challenge: id,
        message:
          "If this address has a verified account, a code will arrive shortly. It expires in 10 minutes.",
      });
  });
  app.post("/api/auth/password/reset", rate, async (req, res) => {
    const { challenge, code, password } = req.body || {};
    if (
      typeof challenge !== "string" ||
      !/^[a-f0-9]{64}$/.test(challenge) ||
      typeof code !== "string" ||
      !/^\d{6}$/.test(code) ||
      typeof password !== "string" ||
      password.length < 8 ||
      password.length > 256
    )
      return res
        .status(400)
        .json({
          error:
            "Enter the six-digit code and a new password with 8–256 characters.",
        });
    // UPDATE RETURNING claims an attempt atomically across function instances.
    const record = db
      .prepare(
        "UPDATE password_resets SET attempts=attempts+1 WHERE id=? AND attempts<5 AND expires>? RETURNING *",
      )
      .get(challenge, Date.now());
    const invalid = () =>
      res
        .status(400)
        .json({
          error:
            "The code is invalid, expired or has too many attempts. Request a new code.",
        });
    if (
      !record ||
      !timingSafeEqual(
        Buffer.from(record.code_hash, "hex"),
        Buffer.from(hash(challenge + code), "hex"),
      )
    )
      return invalid();
    const encoded = await encodePassword(password);
    let changed = false;
    db.exec("BEGIN IMMEDIATE");
    try {
      const user = db
        .prepare("SELECT password FROM users WHERE id=? AND deleted_at IS NULL")
        .get(record.user_id);
      const claimed = db
        .prepare(
          "DELETE FROM password_resets WHERE id=? AND code_hash=? AND expires>? RETURNING id",
        )
        .get(challenge, record.code_hash, Date.now());
      if (claimed && user && hash(user.password) === record.password_version) {
        db.prepare("UPDATE users SET password=? WHERE id=?").run(
          encoded,
          record.user_id,
        );
        for (const table of [
          "sessions",
          "device_accounts",
          "password_resets",
          "oauth_link_challenges",
        ])
          db.prepare(`DELETE FROM ${table} WHERE user_id=?`).run(
            record.user_id,
          );
        db.prepare("DELETE FROM oauth_states WHERE link_user=?").run(
          record.user_id,
        );
        changed = true;
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    if (!changed) return invalid();
    res.json({
      ok: true,
      message: "Password updated. Sign in again on each device.",
    });
  });
}
