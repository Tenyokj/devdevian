import {
  randomBytes,
  randomInt,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import { mailReady, sendVerificationCode } from "./mail.mjs";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const cookieName = "devdevian_link";
const cookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/api/auth",
  maxAge: 600000,
});
export function registerOAuthLink(app, db, { rate, session, profile }) {
  if (!db.schemaCurrent) {
    db.exec(
      "CREATE TABLE IF NOT EXISTS oauth_link_challenges(token_hash TEXT PRIMARY KEY,provider TEXT NOT NULL,subject TEXT NOT NULL,user_id INTEGER NOT NULL,email TEXT NOT NULL,code_hash TEXT NOT NULL,expires INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,last_sent INTEGER NOT NULL)",
    );
  }
  const pending = (req) => {
    const token = req.headers.cookie
      ?.split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(cookieName + "="))
      ?.slice(cookieName.length + 1);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    return db
      .prepare(
        "SELECT * FROM oauth_link_challenges WHERE token_hash=? AND expires>? AND attempts<5",
      )
      .get(hash(token), Date.now());
  };
  const unavailable = (res) =>
    res.status(400).json({
      error:
        "This sign-in confirmation expired. Start again with Google or GitHub.",
    });
  app.get("/api/auth/link/pending", (req, res) => {
    const r = pending(req);
    if (!r) return unavailable(res);
    const [local, domain] = r.email.split("@");
    res.json({
      email: local.slice(0, 1) + "***@" + domain,
      provider: r.provider,
    });
  });
  app.post("/api/auth/link/resend", rate, async (req, res) => {
    const r = pending(req);
    if (!r) return unavailable(res);
    // Claim the cooldown before awaiting the provider; parallel requests cannot
    // consume the daily mail allowance or replace each other's code repeatedly.
    const now = Date.now(),
      code = String(randomInt(100000, 1000000));
    const changed = db
      .prepare(
        "UPDATE oauth_link_challenges SET code_hash=?,last_sent=? WHERE token_hash=? AND last_sent<=?",
      )
      .run(hash(r.token_hash + code), now, r.token_hash, now - 60000);
    if (!changed.changes)
      return res
        .status(429)
        .json({ error: "Wait one minute before requesting another code." });
    try {
      await sendVerificationCode(r.email, code, { db });
      res.json({ ok: true });
    } catch {
      res
        .status(502)
        .json({ error: "Could not send the code. Try again later." });
    }
  });
  app.post("/api/auth/link/verify", rate, (req, res) => {
    if (typeof req.body.code !== "string" || !/^\d{6}$/.test(req.body.code))
      return res
        .status(400)
        .json({ error: "Enter the six-digit code from your email." });
    const candidate = pending(req);
    if (!candidate) return unavailable(res);
    const r = db
      .prepare(
        "UPDATE oauth_link_challenges SET attempts=attempts+1 WHERE token_hash=? AND expires>? AND attempts<5 RETURNING *",
      )
      .get(candidate.token_hash, Date.now());
    if (!r) return unavailable(res);
    if (
      !timingSafeEqual(
        Buffer.from(r.code_hash, "hex"),
        Buffer.from(hash(r.token_hash + req.body.code), "hex"),
      )
    )
      return res.status(400).json({ error: "Incorrect verification code." });
    const user = db
      .prepare(
        "SELECT * FROM users WHERE id=? AND email=? AND deleted_at IS NULL",
      )
      .get(r.user_id, r.email);
    if (!user) return unavailable(res);
    db.exec("BEGIN");
    try {
      // Consume the challenge and claim the provider identity in one transaction.
      const used = db
        .prepare(
          "DELETE FROM oauth_link_challenges WHERE token_hash=? AND code_hash=? AND expires>? AND attempts<=5",
        )
        .run(r.token_hash, r.code_hash, Date.now());
      if (!used.changes) throw Error("expired");
      const linked = db
        .prepare(
          "SELECT user_id FROM oauth_accounts WHERE provider=? AND subject=?",
        )
        .get(r.provider, r.subject);
      if (linked && linked.user_id !== r.user_id) throw Error("linked");
      if (!linked)
        db.prepare("INSERT INTO oauth_accounts VALUES(?,?,?)").run(
          r.provider,
          r.subject,
          r.user_id,
        );
      db.exec("COMMIT");
    } catch {
      db.exec("ROLLBACK");
      return res.status(409).json({
        error: "Could not connect this provider. Start sign-in again.",
      });
    }
    res.clearCookie(cookieName, { path: "/api/auth" });
    session(res, r.user_id);
    res.json({ user: profile(user) });
  });
  return async function confirmExisting(res, { provider, subject, user }) {
    if (!mailReady()) return res.redirect("/app?auth_error=link_existing#feed");
    const now = Date.now();
    db.prepare("DELETE FROM oauth_link_challenges WHERE expires<=?").run(now);
    if (
      db
        .prepare(
          "SELECT 1 FROM oauth_link_challenges WHERE user_id=? AND last_sent>?",
        )
        .get(user.id, now - 60000)
    )
      return res.redirect("/app?auth_error=link_wait#feed");
    const token = randomBytes(32).toString("hex"),
      tokenHash = hash(token),
      code = String(randomInt(100000, 1000000));
    db.prepare(
      "INSERT INTO oauth_link_challenges(token_hash,provider,subject,user_id,email,code_hash,expires,last_sent) VALUES(?,?,?,?,?,?,?,?)",
    ).run(
      tokenHash,
      provider,
      subject,
      user.id,
      user.email,
      hash(tokenHash + code),
      now + 600000,
      now,
    );
    try {
      await sendVerificationCode(user.email, code, { db });
    } catch {
      db.prepare("DELETE FROM oauth_link_challenges WHERE token_hash=?").run(
        tokenHash,
      );
      return res.redirect("/app?auth_error=link_mail#feed");
    }
    res.cookie(cookieName, token, cookieOptions());
    return res.redirect("/app?auth_link=1#feed");
  };
}
