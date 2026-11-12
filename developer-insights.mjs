import { scopeSQL } from "./spaces.mjs";
import { consumeBudget, privateKey, clientAddress } from "./limits.mjs";
// Prepared explicitly by maintenance; no DDL is issued by a statistics request.
export function prepareDeveloperInsights(db) {
  for (const [table, columns] of [
    ["posts", "user_id,id"],
    ["replies", "user_id,post_id"],
    ["code_reviews", "user_id,post_id"],
    ["code_review_replies", "user_id,review_id"],
    ["review_outcomes", "user_id,post_id"],
    ["contributions", "user_id,post_id"],
    ["room_assignments", "user_id,post_id"],
    ["room_events", "actor_id,post_id"],
    ["room_decision_history", "user_id,decision_id"],
    ["projects", "user_id,post_id"],
  ]) {
    if (
      db
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
        .get(table)
    )
      db.exec(
        `CREATE INDEX IF NOT EXISTS insights_${table}_author ON ${table}(${columns})`,
      );
  }
}
// Aggregates come from retained, currently readable records. No browsing telemetry,
// profile-view tracking, provider requests or raw private content are returned.
export function registerDeveloperInsights(app, db) {
  app.get("/api/users/:id/insights", (req, res) => {
    res.set("Cache-Control", "no-store");
    // Vercel adds this rewrite-routing parameter to otherwise valid API reads.
    const query = Object.fromEntries(
      Object.entries(req.query).filter(([key]) => key !== "__api_route"),
    );
    const id = Number(req.params.id),
      days = Number(query.days || 90),
      projectPage = Number(query.project_page || 1),
      scope = query.scope || "public";
    if (
      !Number.isSafeInteger(id) ||
      id < 1 ||
      ![30, 90, 365].includes(days) ||
      !Number.isInteger(projectPage) ||
      projectPage < 1 ||
      projectPage > 10000 ||
      !["public", "all"].includes(scope) ||
      Object.keys(query).some(
        (k) => !["days", "scope", "project_page"].includes(k),
      ) ||
      Object.values(query).some((x) => typeof x !== "string")
    )
      return res.status(400).json({
        error:
          "Use a valid profile, 30/90/365 days, public/all scope and project page.",
      });
    const own = req.user?.id === id;
    // Another viewer, even a community member or platform owner, gets public data only.
    if (scope === "all" && !own)
      return res.status(403).json({
        error:
          "Private activity statistics are available only to their author.",
      });
    const person = db
      .prepare(
        "SELECT id,name,username,privacy,deleted_at FROM users WHERE id=?",
      )
      .get(id);
    if (!person || person.deleted_at || (person.privacy === "hidden" && !own))
      return res.status(404).json({ error: "Profile not found." });
    if (!db.roomsReady || !db.contributionsReady || !db.reviewFlowReady)
      return res
        .status(503)
        .json({ error: "Statistics are awaiting server preparation." });
    consumeBudget(db, [
      {
        key:
          "insights:" +
          (req.user
            ? "user:" + req.user.id
            : "ip:" + privateKey(clientAddress(req))),
        max: 60,
        window: 60000,
      },
    ]);
    const postScope = (alias) =>
      scope === "all"
        ? scopeSQL(alias, req.user)
        : `${alias}.community_id IS NULL`;
    const today = new Date().toISOString().slice(0, 10),
      cutoff = new Date(
        Date.parse(today + "T00:00:00Z") - (days - 1) * 86400000,
      )
        .toISOString()
        .slice(0, 10);
    // Restrict aggregation to this person's work and its project parents. Returning
    // only identifiers avoids scanning/materializing every public conversation.
    const candidates = db
      .prepare(
        `WITH work(id) AS (
      SELECT id FROM posts WHERE user_id=?
      UNION SELECT post_id FROM replies WHERE user_id=?
      UNION SELECT post_id FROM code_reviews WHERE user_id=?
      UNION SELECT c.post_id FROM code_review_replies r JOIN code_reviews c ON c.id=r.review_id WHERE r.user_id=?
      UNION SELECT post_id FROM review_outcomes WHERE user_id=?
      UNION SELECT post_id FROM contributions WHERE user_id=?
      UNION SELECT post_id FROM room_assignments WHERE user_id=?
      UNION SELECT post_id FROM room_events WHERE actor_id=? AND post_id IS NOT NULL
      UNION SELECT pr.post_id FROM room_decision_history h JOIN room_decisions d ON d.id=h.decision_id JOIN projects pr ON pr.id=d.project_id WHERE h.user_id=?
      UNION SELECT post_id FROM projects WHERE user_id=?
    ) SELECT json_group_array(id) ids FROM (SELECT id FROM work UNION SELECT pr.post_id FROM project_work_requests w JOIN projects pr ON pr.id=w.project_id WHERE w.linked=1 AND w.post_id IN(SELECT id FROM work))`,
      )
      .get(...Array(10).fill(id)).ids;
    const sql = `WITH RECURSIVE params AS (SELECT ? target, ? cutoff, ? offset, ? candidates),
    visible AS MATERIALIZED (
      SELECT p.* FROM posts p WHERE p.id IN(SELECT value FROM json_each((SELECT candidates FROM params))) AND p.removed_at IS NULL AND ${postScope("p")}
      AND NOT EXISTS(SELECT 1 FROM project_work_requests w JOIN projects pr ON pr.id=w.project_id JOIN posts parent ON parent.id=pr.post_id WHERE w.post_id=p.id AND w.linked=1 AND (parent.removed_at IS NOT NULL OR NOT (${postScope("parent")})))
    ), projects_visible AS MATERIALIZED (SELECT pr.* FROM projects pr JOIN visible p ON p.id=pr.post_id),
    replies_visible AS MATERIALIZED (SELECT r.* FROM replies r JOIN visible p ON p.id=r.post_id WHERE r.user_id=(SELECT target FROM params) AND NOT EXISTS(SELECT 1 FROM entity_details d WHERE d.kind='reply' AND d.entity_id=CAST(r.id AS TEXT) AND json_extract(d.data,'$.deleted_at') IS NOT NULL)),
    remarks_visible AS MATERIALIZED (SELECT c.* FROM code_reviews c JOIN visible p ON p.id=c.post_id WHERE c.deleted_at IS NULL),
    feedback_visible AS MATERIALIZED (SELECT r.*,c.post_id FROM code_review_replies r JOIN remarks_visible c ON c.id=r.review_id WHERE r.deleted_at IS NULL),
    tasks_visible AS MATERIALIZED (SELECT w.*,p.user_id author_id FROM project_work_requests w JOIN visible p ON p.id=w.post_id JOIN projects_visible pr ON pr.id=w.project_id WHERE w.linked=1),
    contributions_visible AS MATERIALIZED (SELECT c.* FROM contributions c JOIN tasks_visible w ON w.post_id=c.post_id AND w.project_id=c.project_id),
    actions AS MATERIALIZED (
      SELECT 'conversation' category,p.kind subtype,p.id post_id,p.created FROM visible p,params WHERE p.user_id=target
      UNION ALL SELECT 'reply','reply',r.post_id,r.created FROM replies_visible r,params WHERE r.user_id=target
      UNION ALL SELECT 'code_feedback','remark',r.post_id,r.created FROM remarks_visible r,params WHERE r.user_id=target
      UNION ALL SELECT 'feedback_reply','reply',r.post_id,r.created FROM feedback_visible r,params WHERE r.user_id=target
      UNION ALL SELECT 'formal_review',o.verdict,o.post_id,o.created FROM review_outcomes o JOIN visible p ON p.id=o.post_id,params WHERE o.user_id=target
      UNION ALL SELECT 'contribution',c.state,c.post_id,c.created FROM contributions_visible c,params WHERE c.user_id=target
      UNION ALL SELECT 'task_update',e.state,e.post_id,e.created FROM room_events e JOIN tasks_visible w ON w.project_id=e.project_id AND w.post_id=e.post_id,params WHERE e.actor_id=target AND e.type='task_state_changed'
      UNION ALL SELECT 'decision_update','decision',pr.post_id,h.created FROM room_decision_history h JOIN room_decisions d ON d.id=h.decision_id JOIN projects_visible pr ON pr.id=d.project_id,params WHERE h.user_id=target AND d.archived=0 AND (h.post_id IS NULL OR EXISTS(SELECT 1 FROM visible p WHERE p.id=h.post_id))
    ), in_window AS MATERIALIZED (SELECT * FROM actions,params WHERE date(created)>=cutoff AND date(created)<=date('now')),
    project_posts AS MATERIALIZED (SELECT id project_id,post_id FROM projects_visible UNION SELECT project_id,post_id FROM tasks_visible),
    credits AS MATERIALIZED (
      SELECT pr.id project_id,'Owner' role FROM projects_visible pr,params WHERE pr.user_id=target
      UNION SELECT w.project_id,'Assigned work' FROM tasks_visible w JOIN room_assignments a ON a.project_id=w.project_id AND a.post_id=w.post_id,params WHERE a.user_id=target
      UNION SELECT pr.project_id,CASE a.category WHEN 'conversation' THEN 'Conversation' WHEN 'reply' THEN 'Discussion' WHEN 'contribution' THEN 'Contribution' WHEN 'decision_update' THEN 'Decision' WHEN 'task_update' THEN 'Task updates' ELSE 'Code review' END
      FROM actions a JOIN project_posts pr ON a.post_id=pr.post_id
      WHERE a.category<>'contribution' OR a.subtype<>'withdrawn'
    ), project_rows AS MATERIALIZED (SELECT pr.id,pr.name,pr.post_id,pr.stage,pr.user_id=(SELECT target FROM params) owned,
      (SELECT group_concat(role,', ') FROM credits c WHERE c.project_id=pr.id) roles,
      (SELECT COUNT(*) FROM contributions_visible c,params WHERE c.project_id=pr.id AND c.user_id=target) contributions,
      (SELECT COUNT(*) FROM contributions_visible c,params WHERE c.project_id=pr.id AND c.user_id=target AND c.state='accepted') accepted
      FROM projects_visible pr WHERE EXISTS(SELECT 1 FROM credits c WHERE c.project_id=pr.id) ORDER BY pr.id DESC),
    stack_tokens(post_id,rest,token) AS (
      SELECT p.id,p.stack||',','' FROM visible p,params WHERE p.user_id=target AND p.stack<>''
      UNION ALL SELECT post_id,substr(rest,instr(rest,',')+1),trim(substr(rest,1,instr(rest,',')-1)) FROM stack_tokens WHERE rest<>''
    ), technologies AS MATERIALIZED (SELECT MIN(token) name,COUNT(DISTINCT post_id) count FROM stack_tokens WHERE token<>'' GROUP BY lower(token) ORDER BY count DESC,lower(token) LIMIT 8),
    topics AS MATERIALIZED (SELECT COALESCE(t.name,p.topic) name,COUNT(*) count FROM visible p LEFT JOIN taxonomy t ON t.id=p.topic AND t.kind='topic',params WHERE p.user_id=target GROUP BY p.topic ORDER BY count DESC,p.topic LIMIT 8)
    SELECT json_object(
      'totals', json_object(
        'conversations',(SELECT COUNT(*) FROM visible p,params WHERE p.user_id=target),
        'questions',(SELECT COUNT(*) FROM visible p,params WHERE p.user_id=target AND p.kind='question'),
        'discussions',(SELECT COUNT(*) FROM visible p,params WHERE p.user_id=target AND p.kind='discussion'),
        'review_requests',(SELECT COUNT(*) FROM visible p,params WHERE p.user_id=target AND p.kind='review'),
        'showcases',(SELECT COUNT(*) FROM visible p,params WHERE p.user_id=target AND p.kind='showcase'),
        'replies',(SELECT COUNT(*) FROM replies_visible r,params WHERE r.user_id=target),
        'accepted_solutions',(SELECT COUNT(*) FROM replies_visible r JOIN visible p ON p.accepted_reply_id=r.id,params WHERE r.user_id=target),
        'code_feedback',(SELECT COUNT(*) FROM remarks_visible r,params WHERE r.user_id=target),
        'feedback_replies',(SELECT COUNT(*) FROM feedback_visible r,params WHERE r.user_id=target),
        'formal_reviews',(SELECT COUNT(*) FROM review_outcomes o JOIN visible p ON p.id=o.post_id,params WHERE o.user_id=target),
        'projects_owned',(SELECT COUNT(*) FROM projects_visible pr,params WHERE pr.user_id=target),
        
        'assigned_tasks',(SELECT COUNT(*) FROM room_assignments a JOIN tasks_visible w ON w.project_id=a.project_id AND w.post_id=a.post_id,params WHERE a.user_id=target),
        'hosted_events',(SELECT COUNT(*) FROM events e,params WHERE e.user_id=target AND e.cancelled_at IS NULL),
        'published_extensions',(SELECT COUNT(*) FROM extension_releases e,params WHERE e.user_id=target AND e.review<>'withdrawn' AND e.id=(SELECT MAX(n.id) FROM extension_releases n WHERE n.slug=e.slug))
      ),
      'contributions', json((SELECT json_group_array(json_object('state',state,'count',n)) FROM (SELECT state,COUNT(*) n FROM contributions_visible,params WHERE user_id=target GROUP BY state))),
      'activity', json((SELECT json_group_array(json_object('day',day,'count',n)) FROM (SELECT date(created) day,COUNT(*) n FROM in_window GROUP BY date(created) ORDER BY day))),
      'breakdown',json((SELECT json_group_array(json_object('category',category,'count',n)) FROM (SELECT category,COUNT(*) n FROM in_window GROUP BY category ORDER BY n DESC,category))),
      'topics',json((SELECT json_group_array(json_object('name',name,'count',count)) FROM topics)),
      'technologies',json((SELECT json_group_array(json_object('name',name,'count',count)) FROM technologies))) payload`;
    const args = [id, cutoff, (projectPage - 1) * 8, candidates];
    const data = JSON.parse(db.prepare(sql).get(...args).payload);
    const projectSql =
      sql.slice(0, sql.indexOf("    SELECT json_object(")) +
      `SELECT json_object(      'projects_total',(SELECT COUNT(*) FROM project_rows),
      'projects',json((SELECT json_group_array(json_object('id',id,'name',name,'post_id',post_id,'stage',stage,'owned',owned,'roles',roles,'contributions',contributions,'accepted',accepted)) FROM (SELECT * FROM project_rows LIMIT 8 OFFSET (SELECT offset FROM params))))) payload`;
    Object.assign(
      data,
      JSON.parse(db.prepare(projectSql).get(...args).payload),
    );
    data.totals.projects_participated = data.projects_total;
    // These are personal preferences/membership counts, never exposed in other profiles.
    let personal = null;
    if (own && scope === "all") {
      personal = db
        .prepare(
          `SELECT
      (SELECT COUNT(*) FROM memberships m JOIN posts p ON CAST(p.id AS TEXT)=m.item WHERE m.user_id=? AND m.kind='post' AND p.removed_at IS NULL AND ${postScope("p")}) bookmarks,
      (SELECT COUNT(*) FROM subscriptions m WHERE m.user_id=? AND m.kind='post') following_conversations,
      (SELECT COUNT(*) FROM memberships m JOIN events e ON CAST(e.id AS TEXT)=m.item WHERE m.user_id=? AND m.kind='event' AND e.cancelled_at IS NULL) event_rsvps,
      (SELECT COUNT(*) FROM extension_installs WHERE user_id=?) installed_extensions`,
        )
        .get(id, id, id, id);
    }
    res.json({
      ...data,
      person: { id: person.id, name: person.name, username: person.username },
      own,
      scope,
      personal,
      window: { days, from: cutoff, to: today, timezone: "UTC" },
      project_pagination: {
        page: projectPage,
        pages: Math.max(1, Math.ceil(data.projects_total / 8)),
        total: data.projects_total,
      },
      limits: {
        tracks_reading_time: false,
        tracks_visits: false,
        includes_deleted: false,
        project_membership:
          "Visible ownership, authored work, discussion/review, assignment or non-withdrawn contribution; approval alone is not participation.",
      },
    });
  });
}
