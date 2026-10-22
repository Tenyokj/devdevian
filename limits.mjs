import { createHash } from "node:crypto";
export class QuotaError extends Error {
  constructor(
    message = "This limit has been reached. Please try again later.",
  ) {
    super(message);
    this.status = 429;
  }
}
export const privateKey = (value) =>
  createHash("sha256").update(value).digest("hex");
export function limitValue(name, fallback, env = process.env) {
  const value = Number(env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
export function initializeLimits(db) {
  if (!db.schemaCurrent)
    db.exec(
      "CREATE TABLE IF NOT EXISTS usage_limits(key TEXT PRIMARY KEY,window_start INTEGER NOT NULL,used INTEGER NOT NULL)",
    );
}
// One durable, atomic reservation across all instances; roll back all buckets
// if any is exhausted. Never reset limits by switching a browser or IP address.
export function consumeBudget(db, buckets, now = Date.now()) {
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const { key, max, window, cost = 1, calendar = false } of buckets) {
      if (cost > max) throw new QuotaError();
      const start = calendar ? now - (now % window) : now;
      const cutoff = calendar ? start - 1 : now - window;
      const row = db
        .prepare(
          `INSERT INTO usage_limits(key,window_start,used) VALUES(?,?,?)
        ON CONFLICT(key) DO UPDATE SET
        used=CASE WHEN window_start<=? THEN excluded.used ELSE used+excluded.used END,
        window_start=CASE WHEN window_start<=? THEN excluded.window_start ELSE window_start END
        WHERE window_start<=? OR used+excluded.used<=?
        RETURNING used`,
        )
        .get(key, start, cost, cutoff, cutoff, cutoff, max);
      if (!row) throw new QuotaError();
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
export function clientAddress(req, env = process.env) {
  // Vercel overwrites this header at its boundary. Elsewhere forwarded headers
  // are untrusted; use the actual peer instead of enabling Express trust proxy.
  return env.VERCEL === "1"
    ? String(
        req.headers["x-vercel-forwarded-for"] ||
          req.socket?.remoteAddress ||
          "unknown",
      )
        .split(",")[0]
        .trim()
    : req.ip || req.socket?.remoteAddress || "unknown";
}
