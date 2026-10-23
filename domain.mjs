import { notifyMentions } from "./mentions.mjs";
import { notifyTopic } from "./subscriptions.mjs";
import { InputError } from "./validation.mjs";
import { pageRows, scopeSQL, memberOf } from "./spaces.mjs";
import { attachments, validFiles, attachFiles } from "./uploads.mjs";
import { replyPage, replyPath } from "./replies.mjs";
import { notify, notifyReply, transaction } from "./activity.mjs";
export const communities = [
  {
    id: "web",
    name: "Web development",
    short: "Web",
    description:
      "Frontend, backend, and everything between the request and the response.",
    color: "violet",
    symbol: "</>",
    topics: "React · TypeScript · Node.js",
  },
  {
    id: "ai",
    name: "AI & machine learning",
    short: "AI & ML",
    description:
      "Build useful things with models, agents, and a healthy dose of curiosity.",
    color: "green",
    symbol: "✳",
    topics: "LLMs · Agents · Python",
  },
  {
    id: "web3",
    name: "Web3",
    short: "Web3",
    description:
      "Smart contracts, onchain applications, and a better decentralized internet.",
    color: "blue",
    symbol: "◇",
    topics: "Solidity · Foundry · Ethereum",
  },
  {
    id: "indie",
    name: "Indie builders",
    short: "Indie builders",
    description:
      "Small teams. Side projects. The things you can’t stop thinking about.",
    color: "orange",
    symbol: "↗",
    topics: "SaaS · Product · Build in public",
  },
  {
    id: "devops",
    name: "DevOps & infrastructure",
    short: "DevOps",
    description: "Ship it, scale it, and keep it running. Share what works.",
    color: "pink",
    symbol: ">_",
    topics: "Docker · CI/CD · Cloud",
  },
  {
    id: "design",
    name: "Design & UX",
    short: "Design",
    description:
      "Make software that people understand, enjoy, and want to use again.",
    color: "yellow",
    symbol: "◒",
    topics: "Interfaces · Accessibility · Research",
  },
];
export const kinds = ["question", "discussion", "review", "showcase"];
const topics = communities.map((c) => c.id);
function text(value, max, min = 0) {
  return (
    typeof value === "string" &&
    value.trim().length >= min &&
    value.length <= max
  );
}
function url(value) {
  if (!value) return true;
  try {
    return (
      ["https:", "http:"].includes(new URL(value).protocol) &&
      value.length <= 1000
    );
  } catch {
    return false;
  }
}
export function dateInZone(local, zone) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))
    throw new InputError("Enter a valid start date and time.");
  const parts = local.match(/\d+/g).map(Number);
  const expected = Date.UTC(
    parts[0],
    parts[1] - 1,
    parts[2],
    parts[3],
    parts[4],
  );
  if (new Date(expected).toISOString().slice(0, 16) !== local)
    throw new InputError("Enter a valid calendar date.");
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const values = (date) =>
    Object.fromEntries(
      fmt
        .formatToParts(date)
        .filter((p) => p.type !== "literal")
        .map((p) => [p.type, Number(p.value)]),
    );
  let candidate = expected;
  for (let i = 0; i < 4; i++) {
    const v = values(new Date(candidate));
    const current = Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute);
    if (current === expected) return new Date(candidate).toISOString();
    candidate += expected - current;
  }
  throw new InputError(
    "This local time does not exist because of a daylight-saving change. Choose another time.",
  );
}
export function registerDomain(app, db, required, profile) {
  if (!db.schemaCurrent) {
    const migrate = (table, name, definition) => {
      if (
        !db
          .prepare(`PRAGMA table_info(${table})`)
          .all()
          .some((c) => c.name === name)
      )
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    };
    for (const [name, def] of [
      ["kind", "TEXT DEFAULT 'discussion'"],
      ["topic", "TEXT DEFAULT 'web'"],
      ["stack", "TEXT DEFAULT ''"],
      ["status", "TEXT DEFAULT 'open'"],
      ["accepted_reply_id", "INTEGER"],
      ["resolved_at", "TEXT"],
    ])
      migrate("posts", name, def);
    for (const name of ["stack", "github", "website"])
      migrate("users", name, "TEXT DEFAULT ''");
    db.exec(`CREATE TABLE IF NOT EXISTS replies(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,post_id INTEGER NOT NULL,parent_id INTEGER,body TEXT NOT NULL,created TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS votes(user_id INTEGER NOT NULL,post_id INTEGER NOT NULL,PRIMARY KEY(user_id,post_id));
  CREATE TABLE IF NOT EXISTS projects(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,post_id INTEGER NOT NULL,name TEXT NOT NULL,description TEXT NOT NULL,url TEXT DEFAULT '',repo TEXT DEFAULT '',topic TEXT NOT NULL,stack TEXT DEFAULT '',stage TEXT NOT NULL,help TEXT NOT NULL,created TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL,topic TEXT NOT NULL,start_at TEXT NOT NULL,end_at TEXT NOT NULL,timezone TEXT NOT NULL,url TEXT NOT NULL,created TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS reports(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,post_id INTEGER NOT NULL,reason TEXT NOT NULL,created TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(user_id,post_id));
  CREATE INDEX IF NOT EXISTS replies_post ON replies(post_id); CREATE INDEX IF NOT EXISTS posts_topic ON posts(topic);`);
  }
  const postSelect = `SELECT p.*,u.name,u.role,(SELECT COUNT(*) FROM replies r WHERE r.post_id=p.id) reply_count,(SELECT COUNT(*) FROM votes v WHERE v.post_id=p.id) vote_count FROM posts p JOIN users u ON u.id=p.user_id`;
  const post = (id) => db.prepare(postSelect + " WHERE p.id=?").get(id);
  function decorate(p, user) {
    return {
      ...p,
      attachments: attachments(db, p.id),
      community_name: p.community_id
        ? db
            .prepare("SELECT name FROM private_communities WHERE id=?")
            .get(p.community_id)?.name
        : null,
      voted: !!(
        user &&
        db
          .prepare("SELECT 1 FROM votes WHERE user_id=? AND post_id=?")
          .get(user.id, p.id)
      ),
    };
  }
  function decorateList(items, user) {
    if (!items.length) return items;
    const slots = items.map(() => "?").join(",");
    const files = db
      .prepare(
        `SELECT id,post_id,name,mime,size FROM uploads WHERE post_id IN (${slots}) AND reply_id IS NULL ORDER BY created,id`,
      )
      .all(...items.map((p) => p.id));
    const voted = new Set(
      user
        ? db
            .prepare(
              `SELECT post_id FROM votes WHERE user_id=? AND post_id IN (${slots})`,
            )
            .all(user.id, ...items.map((p) => p.id))
            .map((v) => v.post_id)
        : [],
    );
    const spaces = [
      ...new Set(items.map((p) => p.community_id).filter(Boolean)),
    ];
    const names = new Map(
      spaces.length
        ? db
            .prepare(
              `SELECT id,name FROM private_communities WHERE id IN (${spaces.map(() => "?")})`,
            )
            .all(...spaces)
            .map((c) => [c.id, c.name])
        : [],
    );
    return items.map((p) => ({
      ...p,
      community_name: names.get(p.community_id) || null,
      voted: voted.has(p.id),
      attachments: files
        .filter((f) => f.post_id === p.id)
        .map(({ post_id, ...f }) => ({ ...f, url: "/api/uploads/" + f.id })),
    }));
  }
  const recentLimit = (user, table, minutes, count) =>
    db
      .prepare(
        `SELECT COUNT(*) n FROM ${table} WHERE user_id=? AND created>datetime('now',?)`,
      )
      .get(user.id, `-${minutes} minutes`).n >= count;
  app.get("/api/posts", (req, res) => {
    const where = [scopeSQL("p", req.user), "p.removed_at IS NULL"],
      params = [];
    const following = req.query.following === "1";
    if (following && !req.user)
      return res
        .status(401)
        .json({ error: "Sign in to see your Following feed." });
    if (following) {
      where.push(
        `EXISTS(SELECT 1 FROM subscriptions s WHERE s.user_id=? AND ((s.kind='post' AND s.item=CAST(p.id AS TEXT)) OR (s.kind='topic' AND p.community_id IS NULL AND s.item=p.topic)))`,
      );
      params.push(req.user.id);
    }
    if (req.query.community) {
      if (!memberOf(db, req.user, String(req.query.community)))
        return res.status(403).json({
          error:
            "Join this private community before reading its conversations.",
        });
      where.push("p.community_id=?");
      params.push(String(req.query.community));
    } else if (
      !following &&
      req.query.author !== "me" &&
      req.query.saved !== "1"
    )
      where.push("p.community_id IS NULL");
    if (req.query.author) {
      const author =
        req.query.author === "me" ? req.user?.id : Number(req.query.author);
      where.push("p.user_id=?");
      params.push(author || 0);
    }
    if (req.query.saved === "1") {
      where.push(
        "EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=? AND m.kind='post' AND m.item=CAST(p.id AS TEXT))",
      );
      params.push(req.user?.id || 0);
    }
    if (req.query.topic) {
      where.push("p.topic=?");
      params.push(String(req.query.topic));
    }
    if (req.query.kind && kinds.includes(String(req.query.kind))) {
      where.push("p.kind=?");
      params.push(String(req.query.kind));
    }
    if (req.query.q) {
      where.push("(p.title LIKE ? OR p.body LIKE ? OR p.stack LIKE ?)");
      const q = "%" + String(req.query.q).slice(0, 200) + "%";
      params.push(q, q, q);
    }
    if (req.query.sort === "help")
      where.push(
        "p.kind IN ('question','review') AND p.status='open' AND p.accepted_reply_id IS NULL AND p.archived_at IS NULL AND p.locked_at IS NULL",
      );
    const order =
      req.query.sort === "active"
        ? " ORDER BY (reply_count+vote_count) DESC,p.id DESC"
        : following
          ? " ORDER BY MAX(COALESCE(p.updated_at,p.created),COALESCE((SELECT MAX(r.created) FROM replies r WHERE r.post_id=p.id),p.created)) DESC,p.id DESC"
          : " ORDER BY p.id DESC";
    const result = pageRows(
      db,
      req,
      postSelect + " WHERE " + where.join(" AND ") + order,
      params,
    );
    result.pagination.public_total = db
      .prepare(
        "SELECT COUNT(*) n FROM posts WHERE community_id IS NULL AND removed_at IS NULL",
      )
      .get().n;
    res.json({
      ...result,
      items: decorateList(result.items, req.user),
    });
  });
  app.get("/api/participated", required, (req, res) => {
    const result = pageRows(
      db,
      req,
      postSelect +
        " WHERE " +
        scopeSQL("p", req.user) +
        " AND p.removed_at IS NULL AND p.id IN (SELECT post_id FROM replies WHERE user_id=?) ORDER BY p.id DESC",
      [req.user.id],
    );
    res.json({
      ...result,
      items: decorateList(result.items, req.user),
    });
  });
  app.get("/api/posts/:id", (req, res) => {
    const p = post(req.params.id);
    if (!p) return res.status(404).json({ error: "Conversation not found." });
    if (
      req.query.reply_id !== undefined &&
      (!Number.isSafeInteger(Number(req.query.reply_id)) ||
        Number(req.query.reply_id) < 1)
    )
      return res.status(400).json({ error: "Choose a valid reply link." });
    const path = req.query.reply_id
      ? replyPath(db, p.id, Number(req.query.reply_id))
      : [];
    const r = replyPage(
      db,
      {
        ...req,
        query: {
          ...req.query,
          page: path[0]?.page || req.query.reply_page || 1,
          limit: 10,
        },
      },
      p.id,
    );
    const project =
      db.prepare("SELECT * FROM projects WHERE post_id=?").get(p.id) || null;
    const updates = project
      ? pageRows(
          db,
          {
            ...req,
            query: {
              ...req.query,
              page: req.query.updates_page || 1,
              limit: 5,
            },
          },
          "SELECT * FROM project_updates WHERE project_id=? ORDER BY id DESC",
          [project.id],
          5,
        )
      : { items: [], pagination: { page: 1, pages: 1, total: 0, limit: 5 } };
    res.json({
      ...decorate(p, req.user),
      replies: r.items,
      reply_pagination: r.pagination,
      reply_path: path,
      reply_target_missing: !!req.query.reply_id && !path.length,
      project,
      updates: updates.items,
      updates_pagination: updates.pagination,
    });
  });
  app.post("/api/posts", required, (req, res) => {
    const {
      title,
      body,
      kind,
      topic,
      stack = "",
      community_id = null,
      attachment_ids = [],
      code = "",
      review_focus = "",
      repo_url = "",
      demo_url = "",
    } = req.body;
    if (
      !text(title, 160, 5) ||
      !text(body, 15000, 10) ||
      !kinds.includes(kind) ||
      !(
        typeof topic === "string" &&
        db
          .prepare("SELECT 1 FROM taxonomy WHERE id=? AND kind='topic'")
          .get(topic)
      ) ||
      !text(stack, 150)
    )
      return res.status(400).json({
        error:
          "Add a title (5–160 characters), a message (10–15,000 characters), a valid type and topic tag.",
      });
    if (
      community_id !== null &&
      (typeof community_id !== "string" ||
        !memberOf(db, req.user, community_id))
    )
      return res
        .status(403)
        .json({ error: "Only members can publish to a private community." });
    if (
      !validFiles(db, req.user, attachment_ids) ||
      !text(code, 20000) ||
      !text(review_focus, 1500) ||
      !url(repo_url) ||
      !url(demo_url)
    )
      return res
        .status(400)
        .json({ error: "Check your attachments, code, and links." });
    if (
      kind === "review" &&
      ((code.trim().length < 10 && !repo_url) ||
        review_focus.trim().length < 10)
    )
      return res.status(400).json({
        error:
          "A code review needs a code snippet or repository link and a specific review request.",
      });
    if (kind === "showcase" && !demo_url && !attachment_ids.length)
      return res.status(400).json({
        error: "Show what you built: add a demo link or an attachment.",
      });
    if (recentLimit(req.user, "posts", 10, 5))
      return res.status(429).json({
        error:
          "You’ve shared a lot recently. Give the community a moment before posting again.",
      });
    const id = transaction(db, () => {
      const result = db
        .prepare(
          "INSERT INTO posts(user_id,title,body,kind,topic,stack,community_id,code,review_focus,repo_url,demo_url) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          req.user.id,
          title.trim(),
          body.trim(),
          kind,
          topic,
          stack.trim(),
          community_id,
          code,
          review_focus,
          repo_url,
          demo_url,
        );
      const id = Number(result.lastInsertRowid);
      attachFiles(db, id, req.user, attachment_ids);
      notifyMentions(db, { post: id, actor: req.user.id, body });
      notifyTopic(db, { id, topic, community_id }, req.user.id);
      return id;
    });
    res.status(201).json(decorate(post(id), req.user));
  });
  app.post("/api/posts/:id/replies", required, (req, res) => {
    const p = post(req.params.id);
    if (!p) return res.status(404).json({ error: "Conversation not found." });
    if (p.archived_at || p.locked_at)
      return res.status(409).json({
        error: p.locked_at
          ? "A moderator has paused replies to this conversation."
          : "The author has archived this conversation.",
      });
    const { body, parent_id = null, attachment_ids = [] } = req.body;
    if (!validFiles(db, req.user, attachment_ids))
      return res.status(400).json({ error: "Check your reply attachments." });
    if (!text(body, 10000, 2))
      return res
        .status(400)
        .json({ error: "Write a reply between 2 and 10,000 characters." });
    if (
      parent_id !== null &&
      (!Number.isSafeInteger(parent_id) ||
        !db
          .prepare("SELECT 1 FROM replies WHERE id=? AND post_id=?")
          .get(parent_id, p.id))
    )
      return res.status(400).json({
        error:
          "The reply you are responding to does not belong to this conversation.",
      });
    if (parent_id && replyPath(db, p.id, parent_id).length >= 12)
      return res.status(400).json({
        error:
          "This thread is deeply nested. Reply higher in the conversation.",
      });
    if (recentLimit(req.user, "replies", 5, 15))
      return res
        .status(429)
        .json({ error: "Please wait a little before replying again." });
    const id = transaction(db, () => {
      const result = db
        .prepare(
          "INSERT INTO replies(user_id,post_id,parent_id,body) VALUES(?,?,?,?)",
        )
        .run(req.user.id, p.id, parent_id, body.trim());
      const id = Number(result.lastInsertRowid);
      attachFiles(db, p.id, req.user, attachment_ids, id);
      notifyMentions(db, { post: p.id, reply: id, actor: req.user.id, body });
      notifyReply(db, p, id, req.user.id, parent_id);
      return id;
    });
    res.status(201).json({ id });
  });
  app.post("/api/posts/:id/vote", required, (req, res) => {
    const p = post(req.params.id);
    if (!p) return res.status(404).json({ error: "Conversation not found." });
    if (
      db
        .prepare("SELECT 1 FROM votes WHERE user_id=? AND post_id=?")
        .get(req.user.id, p.id)
    )
      db.prepare("DELETE FROM votes WHERE user_id=? AND post_id=?").run(
        req.user.id,
        p.id,
      );
    else db.prepare("INSERT INTO votes VALUES(?,?)").run(req.user.id, p.id);
    res.json(decorate(post(p.id), req.user));
  });
  app.patch("/api/posts/:id/solution", required, (req, res) => {
    const p = post(req.params.id);
    if (!p) return res.status(404).json({ error: "Conversation not found." });
    if (p.user_id !== req.user.id)
      return res
        .status(403)
        .json({ error: "Only the author can mark a solution." });
    if (!["question", "review"].includes(p.kind))
      return res
        .status(400)
        .json({ error: "Solutions apply to questions and review requests." });
    const { reply_id } = req.body;
    if (
      reply_id !== null &&
      (!Number.isSafeInteger(reply_id) ||
        !db
          .prepare("SELECT 1 FROM replies WHERE id=? AND post_id=?")
          .get(reply_id, p.id))
    )
      return res
        .status(400)
        .json({ error: "Choose an answer from this conversation." });
    transaction(db, () => {
      db.prepare(
        "UPDATE posts SET status=?,accepted_reply_id=?,resolved_at=CASE WHEN ? IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END WHERE id=?",
      ).run(reply_id === null ? "open" : "resolved", reply_id, reply_id, p.id);
      if (reply_id !== null) {
        const answer = db
          .prepare("SELECT user_id FROM replies WHERE id=?")
          .get(reply_id);
        notify(db, {
          recipient: answer.user_id,
          actor: req.user.id,
          post: p.id,
          reply: reply_id,
          type: "solution",
          key: `solution:${reply_id}`,
        });
      }
    });
    res.json(decorate(post(p.id), req.user));
  });
  app.post("/api/posts/:id/report", required, (req, res) => {
    if (!post(req.params.id))
      return res.status(404).json({ error: "Conversation not found." });
    if (!text(req.body.reason, 1000, 5))
      return res
        .status(400)
        .json({ error: "Please explain the issue in at least 5 characters." });
    db.prepare(
      "INSERT INTO reports(user_id,post_id,reason) VALUES(?,?,?) ON CONFLICT(user_id,post_id) DO UPDATE SET reason=excluded.reason,status='open',reviewed_by=NULL,reviewed_at=NULL,review_note=NULL",
    ).run(req.user.id, req.params.id, req.body.reason.trim());
    res.status(201).json({ ok: true });
  });
  const projectsSelect =
    "SELECT pr.*,u.name founder_name,u.role founder_role,(SELECT COUNT(*) FROM replies r WHERE r.post_id=pr.post_id) feedback_count FROM projects pr JOIN users u ON u.id=pr.user_id";
  app.get("/api/projects", (req, res) => {
    const params = [];
    let where =
      " WHERE pr.post_id IN (SELECT p.id FROM posts p WHERE p.community_id IS NULL AND p.removed_at IS NULL AND " +
      scopeSQL("p", req.user) +
      ")";
    if (req.query.q) {
      where +=
        " AND (pr.name LIKE ? OR pr.description LIKE ? OR pr.stack LIKE ?)";
      const q = "%" + String(req.query.q).slice(0, 200) + "%";
      params.push(q, q, q);
    }
    if (req.query.author) {
      where += " AND pr.user_id=?";
      params.push(
        req.query.author === "me"
          ? req.user?.id || 0
          : Number(req.query.author) || 0,
      );
    }
    res.json(
      pageRows(
        db,
        req,
        projectsSelect + where + " ORDER BY pr.id DESC",
        params,
      ),
    );
  });
  app.post("/api/projects", required, (req, res) => {
    const {
      name,
      description,
      url: link = "",
      repo = "",
      topic,
      stack = "",
      stage,
      help,
    } = req.body;
    if (
      !text(name, 80, 2) ||
      !text(description, 5000, 20) ||
      !text(help, 1500, 10) ||
      !(
        typeof topic === "string" &&
        db
          .prepare("SELECT 1 FROM taxonomy WHERE id=? AND kind='topic'")
          .get(topic)
      ) ||
      !["Idea", "Prototype", "Beta", "Live"].includes(stage) ||
      !text(stack, 150) ||
      !url(link) ||
      !url(repo)
    )
      return res.status(400).json({
        error:
          "Add a name, description (20+ characters), a specific request (10+ characters), valid links, community and stage.",
      });
    if (recentLimit(req.user, "projects", 1440, 2))
      return res.status(429).json({
        error:
          "You can introduce up to two projects per day. Share an update in your existing conversation.",
      });
    if (
      link &&
      db
        .prepare("SELECT 1 FROM projects WHERE user_id=? AND url=?")
        .get(req.user.id, link)
    )
      return res.status(409).json({
        error:
          "You have already shared this project. Continue in its existing conversation.",
      });
    db.exec("BEGIN");
    try {
      const p = db
        .prepare(
          "INSERT INTO posts(user_id,title,body,kind,topic,stack) VALUES(?,?,?,?,?,?)",
        )
        .run(
          req.user.id,
          `Showcase: ${name.trim()}`,
          `${description.trim()}\n\n## What I need help with\n${help.trim()}${link ? "\n\n[Try the project](" + link + ")" : ""}${repo ? "\n\n[Source code](" + repo + ")" : ""}`,
          "showcase",
          topic,
          stack.trim(),
        );
      const result = db
        .prepare(
          "INSERT INTO projects(user_id,post_id,name,description,url,repo,topic,stack,stage,help) VALUES(?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          req.user.id,
          p.lastInsertRowid,
          name.trim(),
          description.trim(),
          link,
          repo,
          topic,
          stack.trim(),
          stage,
          help.trim(),
        );
      notifyTopic(
        db,
        { id: Number(p.lastInsertRowid), topic, community_id: null },
        req.user.id,
      );
      db.exec("COMMIT");
      res
        .status(201)
        .json(
          db
            .prepare(projectsSelect + " WHERE pr.id=?")
            .get(result.lastInsertRowid),
        );
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  });
  app.get("/api/events", (req, res) => {
    const where = [],
      params = [];
    if (req.query.q) {
      where.push("(e.title LIKE ? OR e.description LIKE ?)");
      params.push(
        "%" + String(req.query.q).slice(0, 200) + "%",
        "%" + String(req.query.q).slice(0, 200) + "%",
      );
    }
    if (req.query.topic) {
      where.push("e.topic=?");
      params.push(String(req.query.topic));
    }
    // A calendar day belongs to the viewer's zone, not necessarily to UTC.
    // Use two separately converted midnights so DST days may be 23 or 25 hours.
    if (req.query.date) {
      const day = String(req.query.date);
      try {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new InputError();
        const next = new Date(day + "T00:00:00Z");
        if (next.toISOString().slice(0, 10) !== day) throw new InputError();
        next.setUTCDate(next.getUTCDate() + 1);
        const zone = String(req.query.timezone || "UTC");
        where.push("e.start_at>=? AND e.start_at<?");
        params.push(
          dateInZone(day + "T00:00", zone),
          dateInZone(next.toISOString().slice(0, 10) + "T00:00", zone),
        );
      } catch {
        return res
          .status(400)
          .json({ error: "Choose a valid calendar date and timezone." });
      }
    }
    for (const [key, operator] of [
      ["from", ">="],
      ["to", "<="],
    ])
      if (req.query[key]) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(req.query[key])))
          return res
            .status(400)
            .json({ error: "Use a valid YYYY-MM-DD date filter." });
        where.push(`substr(e.start_at,1,10) ${operator} ?`);
        params.push(req.query[key]);
      }
    if (req.query.status === "upcoming")
      where.push(
        "e.end_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND e.cancelled_at IS NULL",
      );
    if (req.query.status === "past")
      where.push("e.end_at<strftime('%Y-%m-%dT%H:%M:%fZ','now')");
    if (req.query.attending === "1") {
      where.push(
        "EXISTS(SELECT 1 FROM memberships m WHERE m.kind='event' AND m.user_id=? AND m.item=CAST(e.id AS TEXT))",
      );
      params.push(req.user?.id || 0);
    }
    if (req.query.mine === "1") {
      where.push(
        "(e.user_id=? OR EXISTS(SELECT 1 FROM memberships m WHERE m.kind='event' AND m.user_id=? AND m.item=CAST(e.id AS TEXT)))",
      );
      params.push(req.user?.id || 0, req.user?.id || 0);
    }
    const result = pageRows(
      db,
      req,
      `SELECT e.*,u.name organizer_name,EXISTS(SELECT 1 FROM memberships mine WHERE mine.user_id=${Number(req.user?.id) || 0} AND mine.kind='event' AND mine.item=CAST(e.id AS TEXT)) viewer_attending,(SELECT COUNT(*) FROM memberships m WHERE m.kind='event' AND m.item=CAST(e.id AS TEXT)) attendee_count FROM events e JOIN users u ON u.id=e.user_id` +
        (where.length ? " WHERE " + where.join(" AND ") : "") +
        " ORDER BY e.start_at " +
        (req.query.order === "latest" ? "DESC" : "ASC"),
      params,
    );
    res.json({
      ...result,
      items: result.items.map((e) => {
        const { url, viewer_attending, ...event } = e;
        return {
          ...event,
          ...(req.user &&
          (req.user.id === e.user_id || (!e.cancelled_at && viewer_attending))
            ? { url }
            : {}),
        };
      }),
    });
  });
  app.post("/api/events", required, (req, res) => {
    const {
      title,
      description,
      topic,
      local_start,
      timezone,
      duration,
      url: link,
    } = req.body;
    if (
      !text(title, 160, 5) ||
      !text(description, 5000, 20) ||
      !(
        typeof topic === "string" &&
        db
          .prepare("SELECT 1 FROM taxonomy WHERE id=? AND kind='topic'")
          .get(topic)
      ) ||
      !text(timezone, 100, 1) ||
      !text(local_start, 30, 1) ||
      !Number.isInteger(duration) ||
      duration < 15 ||
      duration > 720 ||
      !link ||
      !url(link)
    )
      return res.status(400).json({
        error:
          "Add a title, description, community, meeting URL, start time, timezone, and duration (15–720 minutes).",
      });
    let start;
    try {
      start = dateInZone(local_start, timezone);
    } catch (e) {
      return res.status(400).json({
        error:
          e instanceof RangeError
            ? "Choose a valid IANA timezone, such as Europe/Kyiv."
            : e.message,
      });
    }
    if (new Date(start).getTime() <= Date.now())
      return res
        .status(400)
        .json({ error: "Choose a start time in the future." });
    if (recentLimit(req.user, "events", 1440, 3))
      return res
        .status(429)
        .json({ error: "You can create up to three events per day." });
    const end = new Date(
      new Date(start).getTime() + duration * 60000,
    ).toISOString();
    const result = db
      .prepare(
        "INSERT INTO events(user_id,title,description,topic,start_at,end_at,timezone,url) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(
        req.user.id,
        title.trim(),
        description.trim(),
        topic,
        start,
        end,
        timezone,
        link,
      );
    res.status(201).json({ id: Number(result.lastInsertRowid) });
  });
  app.get("/api/users/:id", (req, res) => {
    const u = db
      .prepare(
        "SELECT id,name,username,bio,location,role,stack,github,website,privacy,deleted_at FROM users WHERE id=?",
      )
      .get(req.params.id);
    if (!u || u.deleted_at || (u.privacy === "hidden" && req.user?.id !== u.id))
      return res.status(404).json({ error: "Member not found." });
    res.json({
      ...u,
      posts: pageRows(
        db,
        req,
        postSelect +
          " WHERE p.user_id=? AND p.community_id IS NULL AND p.removed_at IS NULL AND " +
          scopeSQL("p", req.user) +
          " ORDER BY p.id DESC",
        [u.id],
      ),
    });
  });
  app.patch("/api/developer-profile", required, (req, res) => {
    const {
      name,
      bio = "",
      location = "",
      role = "",
      stack = "",
      github = "",
      website = "",
    } = req.body;
    if (
      !text(name, 80, 1) ||
      !text(bio, 1000) ||
      !text(location, 100) ||
      !text(role, 100) ||
      !text(stack, 150) ||
      !url(github) ||
      !url(website)
    )
      return res.status(400).json({
        error: "Check your profile fields and use full https:// links.",
      });
    db.prepare(
      "UPDATE users SET name=?,bio=?,location=?,role=?,stack=?,github=?,website=? WHERE id=?",
    ).run(
      name.trim(),
      bio.trim(),
      location.trim(),
      role.trim(),
      stack.trim(),
      github,
      website,
      req.user.id,
    );
    res.json({
      user: profile(
        db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id),
      ),
    });
  });
}
