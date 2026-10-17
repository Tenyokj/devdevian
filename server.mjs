import { assertRuntime, allowedOrigin } from "./runtime-config.mjs";
import { preferences, validUsername } from "./preferences.mjs";
import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
assertRuntime();
import { registerAuth } from "./auth.mjs";
import {
  registerEnhancements,
  importPublicTechnologies,
} from "./enhancements.mjs";
import { registerSpaces, installAccess, canRead } from "./spaces.mjs";
import { registerUploads } from "./uploads.mjs";
import { registerReplies } from "./replies.mjs";
import express from "express";
import { registerEventManagement } from "./event-management.mjs";
import { registerModeration } from "./moderation.mjs";
import { registerActivity } from "./activity.mjs";
import { communities, registerDomain } from "./domain.mjs";
import { openDatabase } from "./database.mjs";
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
const db = await openDatabase();
db.exec(
  `PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,name TEXT NOT NULL,bio TEXT DEFAULT '',location TEXT DEFAULT '',role TEXT DEFAULT 'Builder'); CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER NOT NULL,expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS memberships(user_id INTEGER,kind TEXT,item TEXT,PRIMARY KEY(user_id,kind,item)); CREATE TABLE IF NOT EXISTS posts(id INTEGER PRIMARY KEY,user_id INTEGER,title TEXT,body TEXT,created TEXT DEFAULT CURRENT_TIMESTAMP);`,
);
db.exec(
  "CREATE TABLE IF NOT EXISTS device_accounts(device TEXT,user_id INTEGER,token TEXT,PRIMARY KEY(device,user_id))",
);
const DEVICE_COOKIE =
  process.env.DEMO_MODE === "1" ? "devdevian_demo_device" : "devdevian_device";
const cookieValue = (req, name) =>
  req.headers.cookie
    ?.split("; ")
    .find((c) => c.startsWith(name + "="))
    ?.slice(name.length + 1);
const SESSION_COOKIE =
  process.env.DEMO_MODE === "1" ? "devdevian_demo_session" : "arc_session";
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "256kb" }));
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (
    req.method !== "GET" &&
    req.headers.origin &&
    req.headers.origin !== allowedOrigin(req)
  )
    return res.status(403).json({ error: "Invalid request origin." });
  next();
});
db.exec(
  "CREATE TABLE IF NOT EXISTS auth_rate_limits(key TEXT PRIMARY KEY,window_start INTEGER NOT NULL,hits INTEGER NOT NULL)",
);
function rate(req, res, next) {
  const now = Date.now(),
    window = 900000;
  const address =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : null;
  // A per-account limit survives instance changes and IP rotation. Verification
  // codes also have their own persistent attempt counter in auth.mjs.
  const key = createHash("sha256")
    .update(address ? "email:" + address : "ip:" + req.ip)
    .digest("hex");
  const current = db
    .prepare(
      `INSERT INTO auth_rate_limits(key,window_start,hits) VALUES(?,?,1)
    ON CONFLICT(key) DO UPDATE SET
      hits=CASE WHEN window_start<? THEN 1 ELSE hits+1 END,
      window_start=CASE WHEN window_start<? THEN excluded.window_start ELSE window_start END
    RETURNING hits,window_start`,
    )
    .get(key, now, now - window, now - window);
  if (key.startsWith("00"))
    db.prepare("DELETE FROM auth_rate_limits WHERE window_start<?").run(
      now - 86400000,
    );
  if (current.hits > 40)
    return res
      .status(429)
      .set(
        "Retry-After",
        String(
          Math.max(1, Math.ceil((current.window_start + window - now) / 1000)),
        ),
      )
      .json({ error: "Too many attempts. Try again in 15 minutes." });
  next();
}
function profile(u) {
  if (!u) return null;
  const { password, ...user } = u;
  user.platform_role = (process.env.MODERATOR_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .includes(u.email)
    ? "moderator"
    : "member";
  user.preferences = preferences(db, u.id);
  user.can_moderate =
    user.platform_role === "moderator" ||
    !!db
      .prepare(
        "SELECT 1 FROM validators v JOIN memberships m ON m.user_id=v.user_id AND m.kind='group' AND m.item=v.community_id WHERE v.user_id=? UNION SELECT 1 FROM private_communities WHERE owner_id=?",
      )
      .get(u.id, u.id);
  user.managed_communities = db
    .prepare(
      "SELECT v.community_id id FROM validators v JOIN memberships m ON m.user_id=v.user_id AND m.kind='group' AND m.item=v.community_id WHERE v.user_id=? UNION SELECT id FROM private_communities WHERE owner_id=?",
    )
    .all(u.id, u.id)
    .map((c) => c.id);
  user.memberships = db
    .prepare("SELECT kind,item FROM memberships WHERE user_id=?")
    .all(u.id);
  return user;
}
app.use("/api", (req, res, next) => {
  const token = req.headers.cookie
    ?.split("; ")
    .find((c) => c.startsWith(SESSION_COOKIE + "="))
    ?.slice(SESSION_COOKIE.length + 1);
  if (token) {
    const s = db
      .prepare("SELECT user_id FROM sessions WHERE token=? AND expires>?")
      .get(token, Date.now());
    if (s) {
      req.user = db.prepare("SELECT * FROM users WHERE id=?").get(s.user_id);
      if (req.user)
        req.user.platform_role = (process.env.MODERATOR_EMAILS || "")
          .split(",")
          .map((email) => email.trim().toLowerCase())
          .includes(req.user.email)
          ? "moderator"
          : "member";
    }
  }
  if (req.user) {
    req.user.validator_communities = db
      .prepare(
        "SELECT v.community_id id FROM validators v JOIN memberships m ON m.user_id=v.user_id AND m.kind='group' AND m.item=v.community_id WHERE v.user_id=? UNION SELECT id FROM private_communities WHERE owner_id=?",
      )
      .all(req.user.id, req.user.id)
      .map((c) => c.id);
  }
  next();
});
// Sessions and device switching use opaque server-side records. Never return
// password hashes or tokens as part of the profile sent to the browser.
function session(res, id) {
  const token = randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
    token,
    id,
    Date.now() + 604800000,
  );
  let device = cookieValue(res.req, DEVICE_COOKIE);
  if (!device || !/^[a-f0-9]{64}$/.test(device))
    device = randomBytes(32).toString("hex");
  db.prepare("INSERT OR REPLACE INTO device_accounts VALUES(?,?,?)").run(
    device,
    id,
    token,
  );
  res.cookie(DEVICE_COOKIE, device, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 604800000,
    path: "/",
  });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 604800000,
    path: "/",
  });
}
function required(req, res, next) {
  if (!req.user)
    return res.status(401).json({ error: "Please sign in to continue." });
  if (req.user.username_locked === 0 && !req.path.endsWith("/account/username"))
    return res.status(409).json({
      error: "Choose your permanent username to finish creating your account.",
    });
  next();
}
registerEnhancements(app, db, required, communities);
registerSpaces(app, db, required, communities);
registerUploads(app, db, required);
installAccess(app, db);
registerAuth(app, db, { required, session, profile, rate });
app.get("/api/me", (req, res) => res.json({ user: profile(req.user) }));
app.post("/api/register", rate, (req, res) => {
  const { email, password, name } = req.body;
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
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  try {
    const result = db
      .prepare("INSERT INTO users(email,password,name) VALUES(?,?,?)")
      .run(email.toLowerCase().trim(), `${salt}:${hash}`, name.trim());
    db.prepare("UPDATE users SET username=? WHERE id=?").run(
      validUsername(req.body.username)
        ? req.body.username.toLowerCase()
        : "builder_" + result.lastInsertRowid,
      result.lastInsertRowid,
    );
    session(res, result.lastInsertRowid);
    res.json({
      user: profile(
        db
          .prepare("SELECT * FROM users WHERE id=?")
          .get(result.lastInsertRowid),
      ),
    });
  } catch (e) {
    if (e.code?.includes("CONSTRAINT"))
      return res
        .status(409)
        .json({ error: "This email is already registered. Sign in instead." });
    throw e;
  }
});
app.post("/api/login", rate, (req, res) => {
  const { email, password } = req.body;
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    password.length > 256
  )
    return res.status(400).json({ error: "Enter your email and password." });
  const u = db
    .prepare("SELECT * FROM users WHERE email=?")
    .get(email.toLowerCase().trim());
  const [salt, hash] = (
    (!u?.deleted_at && u?.password) ||
    `${"0".repeat(32)}:${"0".repeat(128)}`
  ).split(":");
  const valid = timingSafeEqual(
    scryptSync(password, salt, 64),
    Buffer.from(hash, "hex"),
  );
  if (!u || u.deleted_at || !valid)
    return res.status(401).json({ error: "Email or password is incorrect." });
  session(res, u.id);
  res.json({ user: profile(u) });
});
app.get("/api/accounts", (req, res) => {
  const device = cookieValue(req, DEVICE_COOKIE);
  res.json(
    device
      ? db
          .prepare(
            "SELECT u.id,u.name,u.username FROM device_accounts d JOIN sessions s ON s.token=d.token AND s.expires>? JOIN users u ON u.id=d.user_id WHERE d.device=? AND u.deleted_at IS NULL",
          )
          .all(Date.now(), device)
      : [],
  );
});
app.post("/api/accounts/switch", (req, res) => {
  const account = db
    .prepare(
      "SELECT d.token FROM device_accounts d JOIN sessions s ON s.token=d.token AND s.expires>? JOIN users u ON u.id=d.user_id WHERE d.device=? AND d.user_id=? AND u.deleted_at IS NULL",
    )
    .get(
      Date.now(),
      cookieValue(req, DEVICE_COOKIE) || "",
      Number(req.body.user_id) || 0,
    );
  if (!account)
    return res
      .status(401)
      .json({ error: "That saved session expired. Sign in again." });
  res.cookie(SESSION_COOKIE, account.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 604800000,
    path: "/",
  });
  res.json({ ok: true });
});
app.post("/api/logout", (req, res) => {
  const token = req.headers.cookie
    ?.split("; ")
    .find((c) => c.startsWith(SESSION_COOKIE + "="))
    ?.slice(SESSION_COOKIE.length + 1);
  if (token) {
    db.prepare("DELETE FROM sessions WHERE token=?").run(token);
    db.prepare("DELETE FROM device_accounts WHERE token=?").run(token);
  }
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
});
app.patch("/api/profile", required, (req, res) => {
  const { name, bio, location, role } = req.body;
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.length > 80 ||
    [bio, location, role].some((v) => typeof v !== "string" || v.length > 500)
  )
    return res.status(400).json({ error: "Check your profile fields." });
  db.prepare("UPDATE users SET name=?,bio=?,location=?,role=? WHERE id=?").run(
    name.trim(),
    bio,
    location,
    role,
    req.user.id,
  );
  res.json({
    user: profile(
      db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id),
    ),
  });
});
app.post("/api/membership", required, (req, res) => {
  const { kind, item } = req.body;
  if (
    !["event", "group", "saved", "post"].includes(kind) ||
    typeof item !== "string" ||
    item.length > 100
  )
    return res.status(400).json({ error: "Invalid selection." });
  if (kind === "group") {
    const community = db
      .prepare("SELECT * FROM private_communities WHERE id=?")
      .get(item);
    const joined = db
      .prepare(
        "SELECT 1 FROM memberships WHERE user_id=? AND kind='group' AND item=?",
      )
      .get(req.user.id, item);
    if (!community)
      return res.status(404).json({ error: "Community not found." });
    if (!joined)
      return res
        .status(403)
        .json({ error: "Request access and wait for owner approval." });
    if (community.owner_id === req.user.id)
      return res
        .status(409)
        .json({ error: "The owner cannot leave their community." });
  }
  if (
    kind === "post" &&
    !canRead(
      db,
      req.user,
      db.prepare("SELECT * FROM posts WHERE id=?").get(item),
    )
  )
    return res.status(404).json({ error: "Conversation not found." });
  if (
    kind === "post" &&
    !db.prepare("SELECT 1 FROM posts WHERE id=?").get(item)
  )
    return res.status(404).json({ error: "Conversation not found." });
  if (
    kind === "event" &&
    !db.prepare("SELECT 1 FROM events WHERE id=?").get(item)
  )
    return res.status(404).json({ error: "Event not found." });
  const exists = db
    .prepare("SELECT 1 FROM memberships WHERE user_id=? AND kind=? AND item=?")
    .get(req.user.id, kind, item);
  if (!exists && kind === "event") {
    const event = db
      .prepare("SELECT cancelled_at,end_at FROM events WHERE id=?")
      .get(item);
    if (event.cancelled_at || new Date(event.end_at).getTime() <= Date.now())
      return res
        .status(409)
        .json({ error: "Registration is closed for this event." });
  }
  if (exists && kind === "group")
    db.prepare("DELETE FROM validators WHERE user_id=? AND community_id=?").run(
      req.user.id,
      item,
    );
  if (exists)
    db.prepare(
      "DELETE FROM memberships WHERE user_id=? AND kind=? AND item=?",
    ).run(req.user.id, kind, item);
  else
    db.prepare("INSERT INTO memberships VALUES(?,?,?)").run(
      req.user.id,
      kind,
      item,
    );
  res.json({ user: profile(req.user) });
});
registerDomain(app, db, required, profile);
importPublicTechnologies(db);
registerActivity(app, db, required);
registerModeration(app, db, required);
registerEventManagement(app, db, required);
registerReplies(app, db);
if (process.env.VERCEL !== "1") {
  if (process.env.NODE_ENV === "production" || process.env.DEMO_MODE === "1") {
    app.use(express.static("dist"));
    app.get("/{*path}", (req, res) =>
      res.sendFile(`${process.cwd()}/dist/index.html`),
    );
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }
}
app.use((error, req, res, next) => {
  console.error(error.message);
  res
    .status(
      error.type === "entity.too.large"
        ? 413
        : error.type === "entity.parse.failed"
          ? 400
          : 500,
    )
    .json({
      error:
        error.type === "entity.too.large"
          ? "Files must be 4 MB or smaller."
          : "Something went wrong. Please try again.",
    });
});
export default app;
const port = Number(process.env.PORT) || 4173;
if (process.env.VERCEL !== "1")
  app.listen(port, "127.0.0.1", () =>
    console.log(`Devdevian is ready at http://127.0.0.1:${port}`),
  );
