import { canRead, scopeSQL, pageRows } from "./spaces.mjs";
import { notifySubscribers } from "./activity.mjs";

// Additive preparation leaves schema v2's marker intact while the old release
// is serving requests. Finalize the marker after the new deployment is active.
export function prepareSubscriptions(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS subscriptions(
    user_id INTEGER NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('post','topic')),
    item TEXT NOT NULL,created TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(user_id,kind,item));
    CREATE INDEX IF NOT EXISTS subscriptions_target ON subscriptions(kind,item,user_id);`);
}
// Subscription state is independent from bookmarks and community membership.
export function registerSubscriptions(app, db, required) {
  if (!db.schemaCurrent) prepareSubscriptions(db);
  app.get("/api/subscriptions", required, (req, res) => {
    // Never expose names or searchable titles after private access is revoked.
    const readable = `p.id IS NOT NULL AND p.removed_at IS NULL AND ${scopeSQL("p", req.user)}`;
    const select = `SELECT s.kind,s.item,s.created,
      CASE WHEN s.kind='topic' THEN COALESCE(t.name,'Unavailable topic')
           WHEN ${readable} THEN p.title ELSE 'Unavailable conversation' END label,
      CASE WHEN s.kind='topic' THEN t.id IS NOT NULL ELSE ${readable} END available
      FROM subscriptions s LEFT JOIN taxonomy t ON s.kind='topic' AND t.kind='topic' AND t.id=s.item
      LEFT JOIN posts p ON s.kind='post' AND p.id=CAST(s.item AS INTEGER) WHERE s.user_id=?`;
    const params = [req.user.id],
      where = [];
    if (["post", "topic"].includes(req.query.kind)) {
      where.push("kind=?");
      params.push(req.query.kind);
    }
    if (req.query.q) {
      where.push("instr(lower(label),lower(?))>0");
      params.push(String(req.query.q).slice(0, 200));
    }
    res.json(
      pageRows(
        db,
        req,
        `SELECT * FROM (${select}) ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created DESC,kind,item`,
        params,
        12,
      ),
    );
  });
  function target(req, res, next) {
    const { kind, item } = req.params;
    if (!["post", "topic"].includes(kind) || item.length > 100)
      return res.status(404).json({ error: "Subscription target not found." });
    // A removed post or revoked community access must never prevent unfollowing.
    if (req.method === "PUT" && req.body.following === false) return next();
    if (kind === "post") {
      const post = db.prepare("SELECT * FROM posts WHERE id=?").get(item);
      if (!/^[1-9]\d*$/.test(item) || !canRead(db, req.user, post))
        return res.status(404).json({ error: "Conversation not found." });
    } else if (
      kind !== "topic" ||
      !db
        .prepare("SELECT 1 FROM taxonomy WHERE id=? AND kind='topic'")
        .get(item)
    ) {
      return res.status(404).json({ error: "Topic not found." });
    }
    next();
  }
  app.get("/api/subscriptions/:kind/:item", required, target, (req, res) => {
    res.json({
      following: !!db
        .prepare(
          "SELECT 1 FROM subscriptions WHERE user_id=? AND kind=? AND item=?",
        )
        .get(req.user.id, req.params.kind, req.params.item),
    });
  });
  app.put("/api/subscriptions/:kind/:item", required, target, (req, res) => {
    if (typeof req.body.following !== "boolean")
      return res.status(400).json({
        error: "Choose whether to follow this conversation or topic.",
      });
    const args = [req.user.id, req.params.kind, req.params.item];
    if (req.body.following) {
      // Idempotent writes: double clicks/retries cannot invert a subscription.
      const existing = db
        .prepare(
          "SELECT 1 FROM subscriptions WHERE user_id=? AND kind=? AND item=?",
        )
        .get(...args);
      if (!existing) {
        const result = db
          .prepare(
            "INSERT OR IGNORE INTO subscriptions(user_id,kind,item) SELECT ?,?,? WHERE (SELECT COUNT(*) FROM subscriptions WHERE user_id=?)<500",
          )
          .run(...args, req.user.id);
        if (!result.changes)
          return res.status(429).json({
            error:
              "You can follow up to 500 conversations and topics. Unfollow something first.",
          });
      }
    } else
      db.prepare(
        "DELETE FROM subscriptions WHERE user_id=? AND kind=? AND item=?",
      ).run(...args);
    res.json({ following: req.body.following });
  });
}
export function notifyTopic(db, post, actor) {
  // Topic follows never disclose private community activity.
  if (post.community_id) return;
  notifySubscribers(db, {
    kind: "topic",
    item: post.topic,
    actor,
    post: post.id,
    type: "topic_post",
    key: `topic-post:${post.id}`,
  });
}
