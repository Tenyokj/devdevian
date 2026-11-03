import { canRead, scopeSQL, pageRows } from "./spaces.mjs";
import { transaction, notify } from "./activity.mjs";
import { revisionHead } from "./review-revisions.mjs";
import { consumeBudget } from "./limits.mjs";
import { validUsername } from "./preferences.mjs";
const positive = (n) => Number.isSafeInteger(n) && n > 0;
const text = (s, max) => typeof s === "string" && s.length <= max;
const active = (state) => ["pending", "accepted"].includes(state);
export function prepareReviewFlow(db) {
  const marker = db
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='review_flow_schema'",
    )
    .get();
  if (
    marker &&
    db.prepare("SELECT version FROM review_flow_schema WHERE id=1").get()
      ?.version > 1
  )
    throw Error(
      "Review Flow schema is newer than this release; no migration was run.",
    );
  transaction(db, () =>
    db.exec(`
    CREATE TABLE IF NOT EXISTS review_flow_schema(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS review_requests(
      id INTEGER PRIMARY KEY,post_id INTEGER NOT NULL REFERENCES posts(id),
      reviewer_id INTEGER NOT NULL REFERENCES users(id),requester_id INTEGER NOT NULL REFERENCES users(id),
      snapshot_id INTEGER NOT NULL REFERENCES review_revisions(id),
      state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','accepted','declined','cancelled','completed')),
      message TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1,
      created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE UNIQUE INDEX IF NOT EXISTS review_requests_active ON review_requests(post_id,reviewer_id) WHERE state IN ('pending','accepted');
    CREATE UNIQUE INDEX IF NOT EXISTS review_requests_revision ON review_requests(post_id,reviewer_id,snapshot_id);
    CREATE INDEX IF NOT EXISTS review_requests_reviewer ON review_requests(reviewer_id,state,id);
    CREATE INDEX IF NOT EXISTS review_requests_post ON review_requests(post_id,id);
    CREATE TABLE IF NOT EXISTS review_outcomes(
      id INTEGER PRIMARY KEY,request_id INTEGER NOT NULL UNIQUE REFERENCES review_requests(id),
      post_id INTEGER NOT NULL REFERENCES posts(id),snapshot_id INTEGER NOT NULL REFERENCES review_revisions(id),
      user_id INTEGER NOT NULL REFERENCES users(id),verdict TEXT NOT NULL CHECK(verdict IN ('changes_requested','no_objections')),
      body TEXT NOT NULL,created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS review_revision_links(
      id INTEGER PRIMARY KEY,post_id INTEGER NOT NULL REFERENCES posts(id),review_id INTEGER NOT NULL REFERENCES code_reviews(id),
      snapshot_id INTEGER NOT NULL REFERENCES review_revisions(id),user_id INTEGER NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(review_id,snapshot_id));
    CREATE INDEX IF NOT EXISTS review_revision_links_post ON review_revision_links(post_id,id);
    CREATE TABLE IF NOT EXISTS review_flow_events(
      id INTEGER PRIMARY KEY,post_id INTEGER NOT NULL REFERENCES posts(id),actor_id INTEGER NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,snapshot_id INTEGER REFERENCES review_revisions(id),request_id INTEGER REFERENCES review_requests(id),
      review_id INTEGER REFERENCES code_reviews(id),created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS review_flow_events_post ON review_flow_events(post_id,id);
    CREATE TRIGGER IF NOT EXISTS review_outcomes_immutable BEFORE UPDATE ON review_outcomes BEGIN SELECT RAISE(ABORT,'Published review outcomes are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS review_revision_links_immutable BEFORE UPDATE ON review_revision_links BEGIN SELECT RAISE(ABORT,'Published revision links are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS review_flow_events_immutable BEFORE UPDATE ON review_flow_events BEGIN SELECT RAISE(ABORT,'Published review events are immutable'); END;
    INSERT INTO review_flow_schema VALUES(1,1) ON CONFLICT(id) DO UPDATE SET version=excluded.version;
  `),
  );
}
export function reviewFlowReady(db) {
  const n = db
    .prepare(
      "SELECT COUNT(*) n FROM sqlite_master WHERE (type='table' AND name IN ('review_flow_schema','review_requests','review_outcomes','review_revision_links','review_flow_events')) OR (type='index' AND name IN ('review_requests_active','review_requests_revision')) OR (type='trigger' AND name IN ('review_outcomes_immutable','review_revision_links_immutable','review_flow_events_immutable'))",
    )
    .get().n;
  return (
    n === 10 &&
    db.prepare("SELECT version FROM review_flow_schema WHERE id=1").get()
      ?.version === 1
  );
}
function event(db, post, actor, type, snapshot, request = null, review = null) {
  db.prepare(
    "INSERT INTO review_flow_events(post_id,actor_id,type,snapshot_id,request_id,review_id) VALUES(?,?,?,?,?,?)",
  ).run(post, actor, type, snapshot, request, review);
}
// Called inside the same transaction as the immutable snapshot. No migration
// fan-out, background scans, external delivery or implicit resolution occurs.
export function notifyReviewFlowRevision(db, post, snapshot) {
  if (!db.reviewFlowReady || snapshot.number < 2) return;
  event(db, post.id, post.user_id, "revision_shared", snapshot.id);
  const recipients = db
    .prepare(
      "SELECT DISTINCT u.id FROM review_requests q JOIN users u ON u.id=q.reviewer_id WHERE q.post_id=? AND q.state IN ('pending','accepted') AND u.deleted_at IS NULL",
    )
    .all(post.id);
  for (const user of recipients)
    if (canRead(db, user, post))
      notify(db, {
        recipient: user.id,
        actor: post.user_id,
        post: post.id,
        type: "review_revision",
        key: `review-revision:${snapshot.id}`,
      });
}
const requestSelect = `SELECT q.id,q.post_id,q.reviewer_id,q.requester_id,q.snapshot_id,q.state,q.message,q.version,q.created,q.updated_at,
  u.name reviewer_name,u.username reviewer_username,s.number revision_number,
  o.id outcome_id,o.verdict,o.body outcome_body,o.created outcome_created,
  p.title post_title,p.community_id,p.archived_at,p.locked_at
  FROM review_requests q JOIN posts p ON p.id=q.post_id JOIN users u ON u.id=q.reviewer_id
  JOIN review_revisions s ON s.id=q.snapshot_id AND s.post_id=q.post_id LEFT JOIN review_outcomes o ON o.request_id=q.id`;
const dto = (row) =>
  Object.fromEntries(
    Object.entries(row).filter(([key]) => key !== "_metadata"),
  );
export function registerReviewFlow(
  app,
  db,
  required,
  { migrate = false } = {},
) {
  if (!db.schemaCurrent || migrate) prepareReviewFlow(db);
  db.reviewFlowReady = reviewFlowReady(db);
  const ready = (req, res, next) =>
    db.reviewFlowReady
      ? next()
      : res.status(503).json({
          error: "Review Flow is not prepared on this server.",
          capabilities: { review_flow: 0 },
        });
  const target = (req, res, next) => {
    const p = db.prepare("SELECT * FROM posts WHERE id=?").get(req.params.id);
    if (!p || !canRead(db, req.user, p) || p.removed_at || p.kind !== "review")
      return res.status(404).json({ error: "Review not found." });
    req.flowPost = p;
    next();
  };
  const current = (req) => {
    const p = db.prepare("SELECT * FROM posts WHERE id=?").get(req.flowPost.id);
    return p &&
      !p.removed_at &&
      !p.archived_at &&
      !p.locked_at &&
      canRead(db, req.user, p)
      ? p
      : null;
  };
  const headId = (p) => {
    const head = revisionHead(db, p.id);
    return head?.code === p.code ? head.id : null;
  };
  app.get("/api/review-flow", required, ready, (req, res) => {
    const section = req.query.section || "waiting";
    if (!["waiting", "accepted", "sent", "completed"].includes(section))
      return res
        .status(400)
        .json({ error: "Choose waiting, accepted, sent or completed." });
    const filter =
      section === "sent"
        ? "q.requester_id=?"
        : `q.reviewer_id=? AND q.state ${section === "waiting" ? "='pending'" : section === "accepted" ? "='accepted'" : "IN ('completed','declined','cancelled')"}`;
    const page = pageRows(
      db,
      req,
      requestSelect +
        ` WHERE ${filter} AND p.removed_at IS NULL AND ${scopeSQL("p", req.user)} ORDER BY q.id DESC`,
      [req.user.id],
    );
    res.json({
      ...page,
      items: page.items.map(dto),
      capabilities: { review_flow: 1 },
    });
  });
  app.get("/api/posts/:id/review-flow", ready, target, (req, res) => {
    const p = req.flowPost,
      head = headId(p);
    let paging = req;
    if (req.query.target_id !== undefined) {
      const id = Number(req.query.target_id);
      if (!positive(id))
        return res.status(400).json({ error: "Use a positive request ID." });
      const row = db
        .prepare("SELECT id FROM review_requests WHERE id=? AND post_id=?")
        .get(id, p.id);
      if (!row)
        return res.status(404).json({ error: "Review request not found." });
      const size = Math.min(
        30,
        Math.max(1, parseInt(req.query.limit, 10) || 12),
      );
      const position = db
        .prepare(
          "SELECT COUNT(*) n FROM review_requests WHERE post_id=? AND id>=?",
        )
        .get(p.id, id).n;
      paging = { query: { ...req.query, page: Math.ceil(position / size) } };
    }
    const page = pageRows(
      db,
      paging,
      requestSelect + " WHERE q.post_id=? ORDER BY q.id DESC",
      [p.id],
    );
    res.json({
      ...page,
      items: page.items.map((row) => ({
        ...dto(row),
        outdated: row.snapshot_id !== head,
      })),
      current_revision_id: head,
      post_revision: p.revision,
      permissions: {
        invite:
          req.user?.id === p.user_id &&
          !p.archived_at &&
          !p.locked_at &&
          !!head,
      },
      capabilities: { review_flow: 1 },
    });
  });
  app.post(
    "/api/posts/:id/review-flow",
    required,
    ready,
    target,
    (req, res) => {
      const input = req.body,
        p = req.flowPost;
      if (p.user_id !== req.user.id)
        return res
          .status(403)
          .json({ error: "Only the review author can request a reviewer." });
      const username =
        typeof input.username === "string"
          ? input.username.replace(/^@/, "").toLowerCase()
          : "";
      if (
        !validUsername(username) ||
        !positive(input.revision_id) ||
        !Number.isSafeInteger(input.expected_revision) ||
        !text(input.message || "", 1000)
      )
        return res.status(400).json({
          error:
            "Include a username, current revision and a message up to 1,000 characters.",
        });
      const reviewer = db
        .prepare(
          "SELECT id FROM users WHERE username=? AND deleted_at IS NULL AND privacy='public'",
        )
        .get(username);
      if (!reviewer || !canRead(db, reviewer, p))
        return res
          .status(404)
          .json({ error: "Reviewer is unavailable for this conversation." });
      if (reviewer.id === req.user.id)
        return res
          .status(400)
          .json({ error: "Ask another member to review your code." });
      consumeBudget(db, [
        { key: `review-invite:${req.user.id}`, max: 10, window: 600000 },
      ]);
      const result = transaction(db, () => {
        const post = current(req);
        // Recheck the selected public profile inside the write transaction:
        // access or account visibility may have changed since form submission.
        const available = db
          .prepare(
            "SELECT id FROM users WHERE id=? AND username=? AND deleted_at IS NULL AND privacy='public'",
          )
          .get(reviewer.id, username);
        if (
          !available ||
          !post ||
          post.user_id !== req.user.id ||
          post.revision !== input.expected_revision ||
          headId(post) !== input.revision_id ||
          !canRead(db, reviewer, post)
        )
          return null;
        if (
          db
            .prepare(
              "SELECT 1 FROM review_requests WHERE post_id=? AND reviewer_id=? AND state IN ('pending','accepted')",
            )
            .get(p.id, reviewer.id)
        )
          return null;
        if (
          db
            .prepare(
              "SELECT 1 FROM review_requests WHERE post_id=? AND reviewer_id=? AND snapshot_id=?",
            )
            .get(p.id, reviewer.id, input.revision_id)
        )
          return null;
        if (
          db
            .prepare(
              "SELECT 1 FROM review_requests WHERE post_id=? AND reviewer_id=? AND state='declined' AND updated_at>datetime('now','-1 day')",
            )
            .get(p.id, reviewer.id)
        )
          return null;
        if (
          db
            .prepare(
              "SELECT COUNT(*) n FROM review_requests WHERE post_id=? AND state IN ('pending','accepted')",
            )
            .get(p.id).n >= 5 ||
          db
            .prepare("SELECT COUNT(*) n FROM review_requests WHERE post_id=?")
            .get(p.id).n >= 100
        )
          return null;
        const id = Number(
          db
            .prepare(
              "INSERT INTO review_requests(post_id,reviewer_id,requester_id,snapshot_id,message) VALUES(?,?,?,?,?)",
            )
            .run(
              p.id,
              reviewer.id,
              req.user.id,
              input.revision_id,
              input.message || "",
            ).lastInsertRowid,
        );
        event(db, p.id, req.user.id, "review_requested", input.revision_id, id);
        notify(db, {
          recipient: reviewer.id,
          actor: req.user.id,
          post: p.id,
          type: "review_requested",
          key: `review-request:${id}`,
        });
        return db.prepare(requestSelect + " WHERE q.id=?").get(id);
      });
      if (!result)
        return res.status(409).json({
          error:
            "Refresh the review. Check active requests, the declined-request cooldown and request limits before inviting again.",
        });
      res.status(201).json(dto(result));
    },
  );
  app.patch(
    "/api/posts/:id/review-flow/:requestId",
    required,
    ready,
    target,
    (req, res) => {
      const { action, expected_version } = req.body;
      if (
        !["accept", "decline", "cancel"].includes(action) ||
        !positive(expected_version)
      )
        return res.status(400).json({
          error:
            "Choose accept, decline or cancel and send the current request version.",
        });
      const state = {
        accept: "accepted",
        decline: "declined",
        cancel: "cancelled",
      }[action];
      const result = transaction(db, () => {
        const p = current(req),
          row = db
            .prepare("SELECT * FROM review_requests WHERE id=? AND post_id=?")
            .get(req.params.requestId, req.flowPost.id);
        if (
          !p ||
          !row ||
          row.version !== expected_version ||
          !active(row.state)
        )
          return null;
        if (
          action === "cancel"
            ? req.user.id !== p.user_id
            : req.user.id !== row.reviewer_id
        )
          return null;
        if (action === "accept" && row.state !== "pending") return null;
        const changed = db
          .prepare(
            "UPDATE review_requests SET state=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=?",
          )
          .run(state, row.id, expected_version);
        if (!changed.changes) return null;
        event(
          db,
          p.id,
          req.user.id,
          "review_" + state,
          row.snapshot_id,
          row.id,
        );
        const recipient = action === "cancel" ? row.reviewer_id : p.user_id;
        if (canRead(db, { id: recipient }, p))
          notify(db, {
            recipient,
            actor: req.user.id,
            post: p.id,
            type: "review_" + state,
            key: `review-request:${row.id}:${expected_version + 1}`,
          });
        return db.prepare(requestSelect + " WHERE q.id=?").get(row.id);
      });
      if (!result)
        return res.status(409).json({
          error:
            "This request changed, is paused, or cannot be changed by your account. Reload before retrying.",
        });
      res.json(dto(result));
    },
  );
  app.post(
    "/api/posts/:id/review-flow/:requestId/outcome",
    required,
    ready,
    target,
    (req, res) => {
      const input = req.body;
      if (
        !["changes_requested", "no_objections"].includes(input.verdict) ||
        !positive(input.expected_version) ||
        !positive(input.revision_id) ||
        !text(input.body, 5000) ||
        input.body.trim().length < 2
      )
        return res.status(400).json({
          error:
            "Choose a verdict and include 2–5,000 characters of context and the assigned revision.",
        });
      const result = transaction(db, () => {
        const p = current(req),
          row = db
            .prepare("SELECT * FROM review_requests WHERE id=? AND post_id=?")
            .get(req.params.requestId, req.flowPost.id);
        if (
          !p ||
          !row ||
          row.reviewer_id !== req.user.id ||
          row.state !== "accepted" ||
          row.version !== input.expected_version ||
          row.snapshot_id !== input.revision_id
        )
          return null;
        db.prepare(
          "INSERT INTO review_outcomes(request_id,post_id,snapshot_id,user_id,verdict,body) VALUES(?,?,?,?,?,?)",
        ).run(
          row.id,
          p.id,
          row.snapshot_id,
          req.user.id,
          input.verdict,
          input.body.trim(),
        );
        db.prepare(
          "UPDATE review_requests SET state='completed',version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=?",
        ).run(row.id, row.version);
        event(db, p.id, req.user.id, input.verdict, row.snapshot_id, row.id);
        if (canRead(db, { id: p.user_id }, p))
          notify(db, {
            recipient: p.user_id,
            actor: req.user.id,
            post: p.id,
            type: "review_completed",
            key: `review-outcome:${row.id}`,
          });
        return db.prepare(requestSelect + " WHERE q.id=?").get(row.id);
      });
      if (!result)
        return res.status(409).json({
          error:
            "Accept your assigned request first and use its exact revision/version. Reload before retrying.",
        });
      res.status(201).json(dto(result));
    },
  );
  app.get("/api/posts/:id/revision-links", ready, target, (req, res) => {
    const page = pageRows(
      db,
      req,
      "SELECT l.id,l.review_id,l.snapshot_id,l.body,l.created,l.user_id,s.number revision_number,c.snapshot_id original_snapshot_id,c.deleted_at FROM review_revision_links l JOIN review_revisions s ON s.id=l.snapshot_id JOIN code_reviews c ON c.id=l.review_id WHERE l.post_id=? AND c.deleted_at IS NULL ORDER BY l.id DESC",
      [req.flowPost.id],
    );
    res.json({
      ...page,
      items: page.items.map(dto),
      capabilities: { review_flow: 1 },
    });
  });
  app.post(
    "/api/posts/:id/revision-links",
    required,
    ready,
    target,
    (req, res) => {
      const input = req.body;
      if (
        !positive(input.snapshot_id) ||
        !positive(input.review_id) ||
        !text(input.body || "", 1500)
      )
        return res.status(400).json({
          error:
            "Choose the revision and earlier remark; context is limited to 1,500 characters.",
        });
      if (req.flowPost.user_id !== req.user.id)
        return res
          .status(403)
          .json({ error: "Only the author can link an addressed remark." });
      consumeBudget(db, [
        { key: `review-links:${req.user.id}`, max: 30, window: 300000 },
      ]);
      const result = transaction(db, () => {
        const p = current(req);
        if (
          db
            .prepare(
              "SELECT COUNT(*) n FROM review_revision_links WHERE snapshot_id=? AND post_id=?",
            )
            .get(input.snapshot_id, req.flowPost.id).n >= 20
        )
          return null;
        const snapshot = db
          .prepare("SELECT * FROM review_revisions WHERE id=? AND post_id=?")
          .get(input.snapshot_id, req.flowPost.id);
        const remark = db
          .prepare(
            "SELECT c.*,s.number original_number FROM code_reviews c LEFT JOIN review_revisions s ON s.id=c.snapshot_id WHERE c.id=? AND c.post_id=? AND c.deleted_at IS NULL",
          )
          .get(input.review_id, req.flowPost.id);
        if (
          !p ||
          p.user_id !== req.user.id ||
          !snapshot ||
          !remark?.original_number ||
          snapshot.number <= remark.original_number
        )
          return null;
        if (
          db
            .prepare(
              "SELECT 1 FROM review_revision_links WHERE review_id=? AND snapshot_id=?",
            )
            .get(remark.id, snapshot.id)
        )
          return null;
        const id = Number(
          db
            .prepare(
              "INSERT INTO review_revision_links(post_id,review_id,snapshot_id,user_id,body) VALUES(?,?,?,?,?)",
            )
            .run(p.id, remark.id, snapshot.id, req.user.id, input.body || "")
            .lastInsertRowid,
        );
        event(
          db,
          p.id,
          req.user.id,
          "remark_addressed",
          snapshot.id,
          null,
          remark.id,
        );
        if (canRead(db, { id: remark.user_id }, p))
          notify(db, {
            recipient: remark.user_id,
            actor: req.user.id,
            post: p.id,
            type: "review_addressed",
            key: `review-link:${id}`,
          });
        return { id, review_id: remark.id, snapshot_id: snapshot.id };
      });
      if (!result)
        return res.status(409).json({
          error:
            "Choose a retained revision newer than this remark's original snapshot. Existing links and quote-only remarks cannot be re-anchored.",
        });
      res.status(201).json(result);
    },
  );
  app.get("/api/projects/:id/review-activity", ready, (req, res) => {
    const project = db
      .prepare(
        "SELECT p.* FROM projects pr JOIN posts p ON p.id=pr.post_id WHERE pr.id=?",
      )
      .get(req.params.id);
    if (!project || project.removed_at || !canRead(db, req.user, project))
      return res.status(404).json({ error: "Project not found." });
    const page = pageRows(
      db,
      req,
      `SELECT e.id,e.type,e.post_id,e.snapshot_id,e.request_id,e.review_id,e.created,u.name actor_name,p.title post_title,s.number revision_number FROM review_flow_events e JOIN posts p ON p.id=e.post_id JOIN project_work_requests w ON w.post_id=p.id AND w.linked=1 JOIN users u ON u.id=e.actor_id LEFT JOIN review_revisions s ON s.id=e.snapshot_id WHERE w.project_id=? AND p.removed_at IS NULL AND ${scopeSQL("p", req.user)} ORDER BY e.id DESC`,
      [req.params.id],
    );
    res.json({
      ...page,
      items: page.items.map(dto),
      capabilities: { review_flow: 1 },
    });
  });
}
