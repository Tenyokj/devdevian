import { encodePassword } from "./passwords.mjs";
import { reportFailure } from "./observability.mjs";
import {
  initializeLimits,
  consumeBudget,
  privateKey,
  QuotaError,
} from "./limits.mjs";
import { registerPasswordReset } from "./password-reset.mjs";
import { registerOAuthLink } from "./oauth-link.mjs";
import { mailReady, sendVerificationCode } from "./mail.mjs";
import { validUsername } from "./preferences.mjs";
import {
  randomBytes,
  randomInt,
  createHash,
  timingSafeEqual,
} from "node:crypto";
const digest = (s) => createHash("sha256").update(s).digest("hex");
const configured = (p) =>
  !!(
    process.env.APP_URL &&
    process.env[p.toUpperCase() + "_CLIENT_ID"] &&
    process.env[p.toUpperCase() + "_CLIENT_SECRET"]
  );
export function registerAuth(app, db, { required, session, profile, rate }) {
  initializeLimits(db);
  registerPasswordReset(app, db, rate);
  const sendCode = (email, code) => sendVerificationCode(email, code, { db });
  if (!db.schemaCurrent) {
    const cols = db.prepare("PRAGMA table_info(users)").all();
    if (!cols.some((c) => c.name === "email_verified"))
      db.exec("ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0");
    if (!cols.some((c) => c.name === "username_locked"))
      db.exec(
        "ALTER TABLE users ADD COLUMN username_locked INTEGER NOT NULL DEFAULT 1",
      );
    db.exec(`CREATE TABLE IF NOT EXISTS registrations(id TEXT PRIMARY KEY,email TEXT,password TEXT,name TEXT,code_hash TEXT,expires INTEGER,attempts INTEGER DEFAULT 0,last_sent INTEGER);
 CREATE TABLE IF NOT EXISTS oauth_states(state TEXT PRIMARY KEY,provider TEXT,verifier TEXT,expires INTEGER,link_user INTEGER);
 CREATE TABLE IF NOT EXISTS oauth_accounts(provider TEXT,subject TEXT,user_id INTEGER,PRIMARY KEY(provider,subject));`);
    if (
      !db
        .prepare("PRAGMA table_info(registrations)")
        .all()
        .some((c) => c.name === "username")
    )
      db.exec("ALTER TABLE registrations ADD COLUMN username TEXT");
  }
  const confirmExisting = registerOAuthLink(app, db, {
    rate,
    session,
    profile,
  });
  app.get("/api/auth/config", (req, res) =>
    res.json({
      google: configured("google"),
      github: configured("github"),
      email_verification: mailReady(),
    }),
  );
  app.post("/api/register", rate, async (req, res, next) => {
    if (
      process.env.NODE_ENV === "test" &&
      process.env.AUTH_TEST_UNVERIFIED === "1"
    )
      return next();
    const { email, password, name, username } = req.body;
    if (
      typeof email !== "string" ||
      !/^\S+@\S+\.\S+$/.test(email) ||
      email.length > 254 ||
      typeof name !== "string" ||
      !name.trim() ||
      name.length > 80 ||
      typeof password !== "string" ||
      password.length < 8 ||
      password.length > 256
    )
      return res.status(400).json({
        error:
          "Enter your name, a valid email and a password with at least 8 characters.",
      });
    if (!validUsername(username))
      return res.status(400).json({
        error:
          "Choose your permanent username: 3–30 letters, digits or underscores, starting with a letter.",
      });
    if (
      db
        .prepare("SELECT 1 FROM users WHERE username=? COLLATE NOCASE")
        .get(username)
    )
      return res.status(409).json({ error: "This username is already taken." });
    if (!mailReady())
      return res.status(503).json({
        error:
          "Email verification is not connected yet. Existing accounts can sign in. Configure the mail service to enable registration.",
      });
    const address = email.trim().toLowerCase();
    if (db.prepare("SELECT 1 FROM users WHERE email=?").get(address))
      return res
        .status(409)
        .json({ error: "This email is already registered. Sign in instead." });
    if (
      db
        .prepare("SELECT 1 FROM registrations WHERE email=? AND last_sent>?")
        .get(address, Date.now() - 60000)
    )
      return res
        .status(429)
        .json({ error: "Wait a minute before requesting another code." });
    try {
      consumeBudget(db, [
        {
          key: "registration-email:" + privateKey(address),
          max: 1,
          window: 60000,
        },
      ]);
    } catch (error) {
      if (!(error instanceof QuotaError)) throw error;
      return res
        .status(429)
        .set("Retry-After", "60")
        .json({ error: "Wait a minute before requesting another code." });
    }
    db.prepare("DELETE FROM registrations WHERE expires<?").run(Date.now());
    const id = randomBytes(32).toString("hex"),
      encoded = await encodePassword(password),
      code = String(randomInt(0, 1000000)).padStart(6, "0");
    db.prepare(
      "INSERT INTO registrations(id,email,password,name,code_hash,expires,last_sent) VALUES(?,?,?,?,?,?,?)",
    ).run(
      id,
      address,
      encoded,
      name.trim(),
      digest(id + code),
      Date.now() + 600000,
      Date.now(),
    );
    db.prepare("UPDATE registrations SET username=? WHERE id=?").run(
      username.toLowerCase(),
      id,
    );
    try {
      await sendCode(address, code);
      res
        .status(202)
        .json({ verification_required: true, challenge: id, email: address });
    } catch (error) {
      db.prepare("DELETE FROM registrations WHERE id=?").run(id);
      if (error instanceof QuotaError)
        return res.status(429).set("Retry-After", "3600").json({
          error: "Email sending limit reached. Please try again later.",
        });
      reportFailure(error, {
        event: "registration_delivery_failed",
        request_id: req.requestId,
      });
      res.status(502).json({
        error:
          "Could not deliver the code. Check the email service configuration and try again.",
      });
    }
  });
  app.post("/api/auth/verify", rate, (req, res) => {
    const { challenge, code } = req.body;
    if (
      typeof challenge !== "string" ||
      typeof code !== "string" ||
      !/^\d{6}$/.test(code)
    )
      return res
        .status(400)
        .json({ error: "Enter the six-digit code from your email." });
    const r = db
      .prepare(
        "UPDATE registrations SET attempts=attempts+1 WHERE id=? AND expires>? AND attempts<5 RETURNING *",
      )
      .get(challenge, Date.now());
    if (!r)
      return res.status(400).json({
        error:
          "Code expired or too many attempts. Register again to get a new code.",
      });
    if (
      !timingSafeEqual(
        Buffer.from(r.code_hash, "hex"),
        Buffer.from(digest(challenge + code), "hex"),
      )
    )
      return res.status(400).json({ error: "Incorrect verification code." });
    if (db.prepare("SELECT 1 FROM users WHERE email=?").get(r.email))
      return res
        .status(409)
        .json({ error: "This email is already registered. Sign in instead." });
    if (!validUsername(r.username))
      return res.status(400).json({
        error: "Start registration again and choose your permanent username.",
      });
    if (
      db
        .prepare("SELECT 1 FROM users WHERE username=? COLLATE NOCASE")
        .get(r.username)
    )
      return res.status(409).json({
        error:
          "This username was taken while you were verifying. Start registration again with another username.",
      });
    let id;
    db.exec("BEGIN IMMEDIATE");
    try {
      const claimed = db
        .prepare(
          "DELETE FROM registrations WHERE id=? AND code_hash=? AND expires>? AND attempts<=5 RETURNING id",
        )
        .get(challenge, r.code_hash, Date.now());
      if (!claimed)
        throw Object.assign(Error("Verification expired"), {
          verificationExpired: true,
        });
      const result = db
        .prepare(
          "INSERT INTO users(email,password,name,email_verified) VALUES(?,?,?,1)",
        )
        .run(r.email, r.password, r.name);
      id = Number(result.lastInsertRowid);
      db.prepare("UPDATE users SET username=? WHERE id=?").run(r.username, id);
      db.prepare("DELETE FROM registrations WHERE email=?").run(r.email);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      if (e.verificationExpired)
        return res
          .status(400)
          .json({ error: "Code expired. Start registration again." });
      if (e.code?.includes("CONSTRAINT"))
        return res.status(409).json({
          error:
            "Email or username already registered. Sign in or choose another username.",
        });
      throw e;
    }
    session(res, id);
    res.json({
      user: profile(db.prepare("SELECT * FROM users WHERE id=?").get(id)),
    });
  });
  app.post("/api/auth/resend", rate, async (req, res) => {
    const r =
      typeof req.body.challenge === "string" &&
      db
        .prepare("SELECT * FROM registrations WHERE id=?")
        .get(req.body.challenge);
    if (!r || r.expires < Date.now())
      return res
        .status(400)
        .json({ error: "This registration expired. Start again." });
    if (r.last_sent > Date.now() - 60000)
      return res
        .status(429)
        .json({ error: "Wait 60 seconds before requesting another code." });
    if (r.attempts >= 5)
      return res
        .status(429)
        .json({ error: "Start registration again to get a new code." });
    const code = String(randomInt(0, 1000000)).padStart(6, "0");
    const now = Date.now();
    const claimed = db
      .prepare(
        "UPDATE registrations SET code_hash=?,last_sent=?,expires=? WHERE id=? AND last_sent<=? AND attempts<5",
      )
      .run(digest(r.id + code), now, now + 600000, r.id, now - 60000);
    if (!claimed.changes)
      return res
        .status(429)
        .json({ error: "Wait 60 seconds before requesting another code." });
    try {
      await sendCode(r.email, code);
      res.json({ ok: true });
    } catch (error) {
      if (error instanceof QuotaError) return res.status(429).set("Retry-After","3600").json({error:"Email sending limit reached. Please try again later."});
      reportFailure(error,{event:"verification_delivery_failed",request_id:req.requestId});
      res.status(502).json({ error: "Could not send the code. Try again later." });
    }
  });
  app.get("/api/auth/:provider/start", rate, (req, res) => {
    const p = req.params.provider;
    if (!["google", "github"].includes(p) || !configured(p))
      return res
        .status(503)
        .send("This sign-in provider is not configured yet.");
    const state = randomBytes(32).toString("hex"),
      verifier = randomBytes(32).toString("base64url");
    db.prepare("DELETE FROM oauth_states WHERE expires<?").run(Date.now());
    const link = req.query.link === "1" ? req.user?.id : null;
    if (req.query.link === "1" && !link)
      return res.status(401).send("Sign in first to connect a provider.");
    db.prepare("INSERT INTO oauth_states VALUES(?,?,?,?,?)").run(
      state,
      p,
      verifier,
      Date.now() + 600000,
      link || null,
    );
    res.cookie("devdevian_oauth", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 600000,
      path: "/api/auth",
    });
    const params = new URLSearchParams({
      client_id: process.env[p.toUpperCase() + "_CLIENT_ID"],
      redirect_uri: new URL("/api/auth/" + p + "/callback", process.env.APP_URL)
        .href,
      state,
      scope: p === "google" ? "openid email profile" : "read:user user:email",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      ...(p === "google" ? { response_type: "code" } : {}),
    });
    res.redirect(
      (p === "google"
        ? "https://accounts.google.com/o/oauth2/v2/auth"
        : "https://github.com/login/oauth/authorize") +
        "?" +
        params,
    );
  });
  app.get("/api/auth/:provider/callback", async (req, res) => {
    const p = req.params.provider,
      state = String(req.query.state || ""),
      cookie = req.headers.cookie
        ?.split("; ")
        .find((c) => c.startsWith("devdevian_oauth="))
        ?.split("=")[1];
    const flow =
      state &&
      db
        .prepare(
          "SELECT * FROM oauth_states WHERE state=? AND provider=? AND expires>?",
        )
        .get(state, p, Date.now());
    if (
      !flow ||
      state !== cookie ||
      !["google", "github"].includes(p) ||
      !configured(p)
    )
      return res
        .status(400)
        .send(
          "This sign-in request expired or is invalid. Try again from Devdevian.",
        );
    db.prepare("DELETE FROM oauth_states WHERE state=?").run(state);
    res.clearCookie("devdevian_oauth", { path: "/api/auth" });
    if (typeof req.query.code !== "string")
      return res.redirect("/?auth_error=cancelled#feed");
    try {
      const body = new URLSearchParams({
        client_id: process.env[p.toUpperCase() + "_CLIENT_ID"],
        client_secret: process.env[p.toUpperCase() + "_CLIENT_SECRET"],
        code: req.query.code,
        redirect_uri: new URL(
          "/api/auth/" + p + "/callback",
          process.env.APP_URL,
        ).href,
        code_verifier: flow.verifier,
        grant_type: "authorization_code",
      });
      const tokenResponse = await fetch(
        p === "google"
          ? "https://oauth2.googleapis.com/token"
          : "https://github.com/login/oauth/access_token",
        {
          method: "POST",
          signal: AbortSignal.timeout(15000),
          headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body,
        },
      );
      const token = await tokenResponse.json();
      if (!tokenResponse.ok || !token.access_token) throw Error("provider");
      const headers = {
        Authorization: "Bearer " + token.access_token,
        Accept: "application/json",
        "User-Agent": "Devdevian",
      };
      const identityResponse = await fetch(
        p === "google"
          ? "https://openidconnect.googleapis.com/v1/userinfo"
          : "https://api.github.com/user",
        { headers, signal: AbortSignal.timeout(15000) },
      );
      const identity = await identityResponse.json();
      if (!identityResponse.ok) throw Error("identity");
      let email = identity.email;
      if (p === "google" && !identity.email_verified) throw Error("unverified");
      if (p === "github") {
        const er = await fetch("https://api.github.com/user/emails", {
          headers,
          signal: AbortSignal.timeout(15000),
        });
        const emails = await er.json();
        if (!er.ok || !Array.isArray(emails)) throw Error("email");
        email = (
          emails.find((e) => e.primary && e.verified) ||
          emails.find((e) => e.verified)
        )?.email;
      }
      const subject = String(p === "google" ? identity.sub : identity.id);
      if (!email || !subject || subject === "undefined")
        throw Error("identity");
      let account = db
          .prepare(
            "SELECT * FROM oauth_accounts WHERE provider=? AND subject=?",
          )
          .get(p, subject),
        id = account?.user_id;
      if (flow.link_user) {
        if (req.user?.id !== flow.link_user) throw Error("session");
        if (id && id !== flow.link_user) throw Error("linked");
        if (!account) {
          db.prepare("INSERT INTO oauth_accounts VALUES(?,?,?)").run(
            p,
            subject,
            flow.link_user,
          );
        }
        id = flow.link_user;
      }
      if (!id) {
        const existing = db
          .prepare("SELECT * FROM users WHERE email=? AND deleted_at IS NULL")
          .get(email.toLowerCase());
        if (existing)
          return await confirmExisting(res, {
            provider: p,
            subject,
            user: existing,
          });
        db.exec("BEGIN");
        try {
          // OAuth-only accounts start with an unguessable password verifier;
          // there is no known password until a mailbox-confirmed reset.
          const password =
            randomBytes(16).toString("hex") +
            ":" +
            randomBytes(64).toString("hex");
          const r = db
            .prepare(
              "INSERT INTO users(email,password,name,email_verified) VALUES(?,?,?,1)",
            )
            .run(
              email.toLowerCase(),
              password,
              String(identity.name || identity.login || "Builder").slice(0, 80),
            );
          id = Number(r.lastInsertRowid);
          db.prepare("UPDATE users SET username=? WHERE id=?").run(
            "builder_" + id,
            id,
          );
          db.prepare("UPDATE users SET username_locked=0 WHERE id=?").run(id);
          db.prepare("INSERT INTO oauth_accounts VALUES(?,?,?)").run(
            p,
            subject,
            id,
          );
          db.exec("COMMIT");
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
      }
      const user = db
        .prepare("SELECT * FROM users WHERE id=? AND deleted_at IS NULL")
        .get(id);
      if (!user) throw Error("deleted");
      session(res, id);
      res.redirect("/#profile");
    } catch {
      res.redirect("/?auth_error=failed#feed");
    }
  });
}
