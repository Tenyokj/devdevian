import { notificationAllowed } from "./preferences.mjs";
import { scopeSQL, pageRows } from "./spaces.mjs";
// In-app activity only. No email, push service, or external delivery.
export function transaction(db, work) {
  db.exec("BEGIN");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
export function notify(
  db,
  { recipient, actor, post = null, event = null, reply = null, type, key },
) {
  if (
    !recipient ||
    recipient === actor ||
    !notificationAllowed(db, recipient, type)
  )
    return;
  db.prepare(
    `INSERT OR IGNORE INTO notifications(recipient_id,actor_id,post_id,event_id,reply_id,type,event_key) VALUES(?,?,?,?,?,?,?)`,
  ).run(recipient, actor, post, event, reply, type, key);
}
// Fan out in one statement so a popular topic does not issue one remote query per follower.
export function notifySubscribers(
  db,
  { kind, item, actor, post, reply = null, type, key },
) {
  db.prepare(
    `INSERT OR IGNORE INTO notifications(recipient_id,actor_id,post_id,reply_id,type,event_key)
    SELECT s.user_id,?,?,?,?,? FROM subscriptions s
    JOIN users u ON u.id=s.user_id JOIN posts p ON p.id=?
    LEFT JOIN user_settings settings ON settings.user_id=s.user_id
    WHERE s.kind=? AND s.item=? AND s.user_id<>? AND u.deleted_at IS NULL AND p.removed_at IS NULL
    AND (p.community_id IS NULL OR EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=s.user_id AND m.kind='group' AND m.item=p.community_id))
    AND COALESCE(json_extract(settings.data,'$.notifications_enabled'),1)=1
    AND COALESCE(json_extract(settings.data,'$.notify_subscriptions'),1)=1
    AND (?<>'reply' OR COALESCE(json_extract(settings.data,'$.notify_replies'),1)=1)`,
  ).run(actor, post, reply, type, key, post, kind, String(item), actor, type);
}
export function notifyReply(db, post, replyId, actor, parentId) {
  notifySubscribers(db, {
    kind: "post",
    item: post.id,
    actor,
    post: post.id,
    reply: replyId,
    type: "reply",
    key: `reply:${replyId}`,
  });
  const recipients = new Set([post.user_id]);
  if (parentId)
    recipients.add(
      db
        .prepare("SELECT user_id FROM replies WHERE id=? AND post_id=?")
        .get(parentId, post.id)?.user_id,
    );
  for (const recipient of recipients)
    notify(db, {
      recipient,
      actor,
      post: post.id,
      reply: replyId,
      type: "reply",
      key: `reply:${replyId}`,
    });
}
function text(value, max, min = 0) {
  return (
    typeof value === "string" &&
    value.trim().length >= min &&
    value.length <= max
  );
}
function revision(value) {
  return Number.isSafeInteger(value) && value >= 0;
}
export function registerActivity(app, db, required) {
  if (!db.schemaCurrent) {
    for (const table of ["posts", "replies"]) {
      const columns = db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((c) => c.name);
      if (!columns.includes("updated_at"))
        db.exec(`ALTER TABLE ${table} ADD COLUMN updated_at TEXT`);
      if (!columns.includes("revision"))
        db.exec(
          `ALTER TABLE ${table} ADD COLUMN revision INTEGER NOT NULL DEFAULT 0`,
        );
    }
    db.exec(`CREATE TABLE IF NOT EXISTS notifications(
    id INTEGER PRIMARY KEY,recipient_id INTEGER NOT NULL,actor_id INTEGER NOT NULL,
    post_id INTEGER,event_id INTEGER,reply_id INTEGER,type TEXT NOT NULL,event_key TEXT NOT NULL,
    created TEXT DEFAULT CURRENT_TIMESTAMP,read_at TEXT,UNIQUE(recipient_id,event_key));
    CREATE INDEX IF NOT EXISTS notifications_recipient ON notifications(recipient_id,id DESC);
    CREATE TABLE IF NOT EXISTS project_updates(
    id INTEGER PRIMARY KEY,project_id INTEGER NOT NULL,user_id INTEGER NOT NULL,
    title TEXT NOT NULL,body TEXT NOT NULL,created TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS updates_project ON project_updates(project_id,id);`);

    if (
      !db
        .prepare("PRAGMA table_info(notifications)")
        .all()
        .some((c) => c.name === "event_id")
    ) {
      transaction(db, () => {
        db.exec(`ALTER TABLE notifications RENAME TO notifications_legacy_v1;
      CREATE TABLE notifications(id INTEGER PRIMARY KEY,recipient_id INTEGER NOT NULL,actor_id INTEGER NOT NULL,post_id INTEGER,event_id INTEGER,reply_id INTEGER,type TEXT NOT NULL,event_key TEXT NOT NULL,created TEXT DEFAULT CURRENT_TIMESTAMP,read_at TEXT,UNIQUE(recipient_id,event_key));
      INSERT INTO notifications(id,recipient_id,actor_id,post_id,reply_id,type,event_key,created,read_at) SELECT id,recipient_id,actor_id,post_id,reply_id,type,event_key,created,read_at FROM notifications_legacy_v1;
      DROP TABLE notifications_legacy_v1;
      CREATE INDEX notifications_recipient ON notifications(recipient_id,id DESC);`);
      });
    }
  }
  app.get("/api/notifications", required, (req, res) => {
    const from = ` FROM notifications n JOIN users u ON u.id=n.actor_id LEFT JOIN posts p ON p.id=n.post_id LEFT JOIN events e ON e.id=n.event_id WHERE n.recipient_id=? AND (n.post_id IS NULL OR ${scopeSQL("p", req.user)})`;
    const result = pageRows(
      db,
      req,
      `SELECT n.id,n.type,n.post_id,n.event_id,n.reply_id,n.created,n.read_at,u.name actor_name,u.id actor_id,COALESCE(p.title,e.title) post_title` +
        from +
        " ORDER BY n.id DESC",
      [req.user.id],
      20,
    );
    const { count } = db
      .prepare("SELECT COUNT(*) count" + from + " AND n.read_at IS NULL")
      .get(req.user.id);
    const latest = db.prepare("SELECT MAX(n.id) id" + from).get(req.user.id).id;
    res.json({ ...result, unread_count: count, latest_id: latest });
  });
  app.patch("/api/notifications/read-all", required, (req, res) => {
    const { through_id } = req.body;
    if (!Number.isSafeInteger(through_id) || through_id < 1)
      return res
        .status(400)
        .json({ error: "Choose a valid notification boundary." });
    db.prepare(
      "UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE recipient_id=? AND id<=? AND read_at IS NULL",
    ).run(req.user.id, through_id);
    res.json({ ok: true });
  });
  app.patch("/api/notifications/:id/read", required, (req, res) => {
    const result = db
      .prepare(
        "UPDATE notifications SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE id=? AND recipient_id=?",
      )
      .run(req.params.id, req.user.id);
    if (!result.changes)
      return res.status(404).json({ error: "Notification not found." });
    res.json({ ok: true });
  });

  app.patch("/api/posts/:id", required, (req, res) => {
    const post = db
      .prepare("SELECT * FROM posts WHERE id=?")
      .get(req.params.id);
    if (!post)
      return res.status(404).json({ error: "Conversation not found." });
    if (post.user_id !== req.user.id)
      return res
        .status(403)
        .json({ error: "Only the author can edit this conversation." });
    if (db.prepare("SELECT 1 FROM projects WHERE post_id=?").get(post.id))
      return res.status(409).json({
        error:
          "This is a project introduction. Share a project update to continue its story.",
      });
    const {
      title,
      body,
      stack = "",
      revision: version,
      code = post.code || "",
      review_focus = post.review_focus || "",
      repo_url = post.repo_url || "",
      demo_url = post.demo_url || "",
    } = req.body;
    if (
      !text(title, 160, 5) ||
      !text(body, 15000, 10) ||
      !text(stack, 150) ||
      !revision(version)
    )
      return res.status(400).json({
        error:
          "Check your title (5–160 characters), message (10–15,000 characters), and revision.",
      });
    const safeLink = (value) => {
      if (!value) return true;
      try {
        return (
          ["https:", "http:"].includes(new URL(value).protocol) &&
          value.length <= 1000
        );
      } catch {
        return false;
      }
    };
    if (
      !text(code, 20000) ||
      !text(review_focus, 1500) ||
      !safeLink(repo_url) ||
      !safeLink(demo_url)
    )
      return res.status(400).json({ error: "Check your code and links." });
    if (
      post.kind === "review" &&
      ((code.trim().length < 10 && !repo_url) ||
        review_focus.trim().length < 10)
    )
      return res.status(400).json({
        error: "Include code or a repository and a specific review focus.",
      });
    if (
      post.kind === "showcase" &&
      !demo_url &&
      !db
        .prepare("SELECT 1 FROM uploads WHERE post_id=? AND reply_id IS NULL")
        .get(post.id)
    )
      return res
        .status(400)
        .json({ error: "Keep a demo link or an attachment on your showcase." });
    const result = db
      .prepare(
        "UPDATE posts SET title=?,body=?,stack=?,code=?,review_focus=?,repo_url=?,demo_url=?,updated_at=CURRENT_TIMESTAMP,revision=revision+1 WHERE id=? AND revision=?",
      )
      .run(
        title.trim(),
        body.trim(),
        stack.trim(),
        code,
        review_focus,
        repo_url,
        demo_url,
        post.id,
        version,
      );
    if (!result.changes)
      return res.status(409).json({
        error:
          "This conversation changed in another tab. Close the editor and reload before trying again.",
      });
    res.json({ id: post.id });
  });
  app.patch("/api/replies/:id", required, (req, res) => {
    const reply = db
      .prepare("SELECT * FROM replies WHERE id=?")
      .get(req.params.id);
    if (!reply) return res.status(404).json({ error: "Reply not found." });
    if (reply.user_id !== req.user.id)
      return res
        .status(403)
        .json({ error: "Only the author can edit this reply." });
    const { body, revision: version } = req.body;
    if (!text(body, 10000, 2) || !revision(version))
      return res.status(400).json({
        error:
          "Write a reply between 2 and 10,000 characters with a valid revision.",
      });
    const changed = transaction(db, () => {
      const result = db
        .prepare(
          "UPDATE replies SET body=?,updated_at=CURRENT_TIMESTAMP,revision=revision+1 WHERE id=? AND revision=?",
        )
        .run(body.trim(), reply.id, version);
      if (!result.changes) return false;
      const post = db
        .prepare("SELECT * FROM posts WHERE id=?")
        .get(reply.post_id);
      if (post.accepted_reply_id === reply.id)
        notify(db, {
          recipient: post.user_id,
          actor: req.user.id,
          post: post.id,
          reply: reply.id,
          type: "solution_edited",
          key: `reply-edit:${reply.id}:${version + 1}`,
        });
      return true;
    });
    if (!changed)
      return res.status(409).json({
        error:
          "This reply changed in another tab. Close the editor and reload before trying again.",
      });
    res.json({ id: reply.id });
  });
  app.post("/api/projects/:id/updates", required, (req, res) => {
    const project = db
      .prepare("SELECT * FROM projects WHERE id=?")
      .get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found." });
    if (project.user_id !== req.user.id)
      return res
        .status(403)
        .json({ error: "Only the project founder can publish updates." });
    const { title, body } = req.body;
    if (!text(title, 160, 5) || !text(body, 10000, 10))
      return res.status(400).json({
        error:
          "Add an update title (5–160 characters) and message (10–10,000 characters).",
      });
    if (
      db
        .prepare(
          "SELECT COUNT(*) n FROM project_updates WHERE user_id=? AND created>datetime('now','-1 day')",
        )
        .get(req.user.id).n >= 5
    )
      return res.status(429).json({
        error:
          "You can share five project updates a day. Give your readers time to catch up.",
      });
    const id = transaction(db, () => {
      const result = db
        .prepare(
          "INSERT INTO project_updates(project_id,user_id,title,body) VALUES(?,?,?,?)",
        )
        .run(project.id, req.user.id, title.trim(), body.trim());
      const recipients = db
        .prepare(
          `SELECT user_id FROM replies WHERE post_id=? UNION SELECT user_id FROM memberships WHERE kind='post' AND item=?`,
        )
        .all(project.post_id, String(project.post_id));
      for (const { user_id } of recipients)
        notify(db, {
          recipient: user_id,
          actor: req.user.id,
          post: project.post_id,
          type: "project_update",
          key: `update:${result.lastInsertRowid}`,
        });
      return Number(result.lastInsertRowid);
    });
    res.status(201).json({ id, post_id: project.post_id });
  });
}
