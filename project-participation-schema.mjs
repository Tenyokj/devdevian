import { transaction } from "./activity.mjs";
// The DB barrier also covers older server deployments sharing this database.
// It uses immutable record authors/assignment targets, not connection-local flags.
const denied = (post, actor) =>
  `EXISTS(SELECT 1 FROM projects pa JOIN posts pp ON pp.id=pa.post_id JOIN entity_details pd ON pd.kind='project_access' AND pd.entity_id=CAST(pa.id AS TEXT) WHERE json_extract(pd.data,'$.mode')='approved' AND (pa.post_id=${post} OR pa.id IN(SELECT project_id FROM project_work_requests WHERE post_id=${post} AND linked=1)) AND ((pa.user_id<>${actor} AND NOT EXISTS(SELECT 1 FROM json_each(pd.data,'$.members') member WHERE member.value=${actor})) OR (pp.community_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM memberships m WHERE m.kind='group' AND m.item=pp.community_id AND m.user_id=${actor}))))`;
const assignmentDenied = `EXISTS(SELECT 1 FROM projects pa JOIN posts pp ON pp.id=pa.post_id JOIN entity_details pd ON pd.kind='project_access' AND pd.entity_id=CAST(pa.id AS TEXT) WHERE pa.id=NEW.project_id AND json_extract(pd.data,'$.mode')='approved' AND ((pa.user_id<>NEW.user_id AND NOT EXISTS(SELECT 1 FROM json_each(pd.data,'$.members') m WHERE m.value=NEW.user_id)) OR (pp.community_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM memberships m WHERE m.kind='group' AND m.item=pp.community_id AND m.user_id=NEW.user_id))))`;
const specs = [
  ["replies", "NEW.post_id", "NEW.user_id"],
  ["votes", "NEW.post_id", "NEW.user_id"],
  ["code_reviews", "NEW.post_id", "NEW.user_id"],
  [
    "code_review_replies",
    "(SELECT post_id FROM code_reviews WHERE id=NEW.review_id)",
    "NEW.user_id",
  ],
  ["review_revisions", "NEW.post_id", "NEW.user_id"],
  ["review_outcomes", "NEW.post_id", "NEW.user_id"],
  ["review_revision_links", "NEW.post_id", "NEW.user_id"],
  ["contributions", "NEW.post_id", "NEW.user_id"],
  [
    "contribution_revisions",
    "(SELECT post_id FROM contributions WHERE id=NEW.contribution_id)",
    "(SELECT user_id FROM contributions WHERE id=NEW.contribution_id)",
  ],
];
const definitions = [];
function trigger(
  name,
  table,
  event,
  when,
  body = "SELECT RAISE(ABORT,'Project participation approval required');",
) {
  definitions.push({
    name: "participation_" + name,
    sql: `CREATE TRIGGER IF NOT EXISTS participation_${name} BEFORE ${event} ON ${table} WHEN ${when} BEGIN ${body} END;`,
  });
}
for (const [table, post, actor] of specs) {
  trigger(table + "_insert", table, "INSERT", denied(post, actor));
  if (["replies", "code_reviews", "code_review_replies"].includes(table))
    trigger(
      table + "_edit",
      table,
      "UPDATE OF body",
      `NEW.body IS NOT OLD.body AND ${denied(post, actor)}`,
    );
}
trigger(
  "posts_edit",
  "posts",
  "UPDATE OF title,body,code,review_focus,repo_url,demo_url",
  `(NEW.title IS NOT OLD.title OR NEW.body IS NOT OLD.body OR NEW.code IS NOT OLD.code OR NEW.review_focus IS NOT OLD.review_focus OR NEW.repo_url IS NOT OLD.repo_url OR NEW.demo_url IS NOT OLD.demo_url) AND ${denied("NEW.id", "NEW.user_id")}`,
);
for (const event of ["INSERT", "UPDATE"]) {
  trigger(
    "assignment_" + event.toLowerCase(),
    "room_assignments",
    event,
    `NEW.user_id IS NOT NULL AND ${assignmentDenied}`,
  );
  trigger(
    "post_details_" + event.toLowerCase(),
    "entity_details",
    event,
    `NEW.kind='post' AND ${denied("CAST(NEW.entity_id AS INTEGER)", "(SELECT user_id FROM posts WHERE id=CAST(NEW.entity_id AS INTEGER))")}`,
  );
  trigger(
    "policy_valid_" + event.toLowerCase(),
    "entity_details",
    event,
    `NEW.kind='project_access' AND CASE WHEN json_valid(NEW.data) THEN (COALESCE(json_extract(NEW.data,'$.mode'),'') NOT IN('open','approved') OR COALESCE(json_type(NEW.data,'$.members'),'')<>'array' OR COALESCE(json_type(NEW.data,'$.version'),'')<>'integer' OR COALESCE(json_extract(NEW.data,'$.version'),0)<1 OR json_array_length(NEW.data,'$.members')>100 OR EXISTS(SELECT 1 FROM json_each(NEW.data,'$.members') m WHERE m.type<>'integer' OR m.value<1)) ELSE 1 END`,
  );
}
trigger(
  "invitation_insert",
  "review_requests",
  "INSERT",
  `${denied("NEW.post_id", "NEW.requester_id")} OR ${denied("NEW.post_id", "NEW.reviewer_id")}`,
);
trigger(
  "invitation_state",
  "review_requests",
  "UPDATE OF state",
  `NEW.state IN('accepted','completed') AND ${denied("NEW.post_id", "NEW.reviewer_id")}`,
);
const invalidAssignment = `a.project_id=CAST(NEW.entity_id AS INTEGER) AND a.user_id IS NOT NULL AND a.user_id<>(SELECT user_id FROM projects WHERE id=a.project_id) AND json_extract(NEW.data,'$.mode')='approved' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.data,'$.members') m WHERE m.value=a.user_id)`;
for (const event of ["INSERT", "UPDATE"])
  definitions.push({
    name: "participation_policy_" + event.toLowerCase(),
    sql: `CREATE TRIGGER IF NOT EXISTS participation_policy_${event.toLowerCase()} AFTER ${event} ON entity_details WHEN NEW.kind='project_access' BEGIN
 INSERT INTO room_events(project_id,actor_id,type,state) SELECT id,user_id,'participation_changed',json_extract(NEW.data,'$.mode') FROM projects WHERE id=CAST(NEW.entity_id AS INTEGER);
 UPDATE project_work_requests SET version=version+1,updated_at=CURRENT_TIMESTAMP WHERE post_id IN(SELECT a.post_id FROM room_assignments a WHERE ${invalidAssignment});
 INSERT INTO room_events(project_id,post_id,actor_id,type,target_id) SELECT a.project_id,a.post_id,p.user_id,'participation_released',a.user_id FROM room_assignments a JOIN projects p ON p.id=a.project_id WHERE ${invalidAssignment};
 UPDATE room_assignments SET user_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE post_id IN(SELECT a.post_id FROM room_assignments a WHERE ${invalidAssignment});
 END;`,
  });
export function participationReady(db) {
  const exists = db
    .prepare("SELECT 1 FROM sqlite_master WHERE name='participation_schema'")
    .get();
  if (!exists) return false;
  return (
    db.prepare("SELECT version FROM participation_schema WHERE id=1").get()
      ?.version === 1 &&
    db
      .prepare(
        `SELECT COUNT(*) n FROM sqlite_master WHERE type='trigger' AND name IN(${definitions.map(() => "?").join(",")})`,
      )
      .get(...definitions.map((d) => d.name)).n === definitions.length
  );
}
export function prepareParticipation(db) {
  if (
    db
      .prepare("SELECT 1 FROM sqlite_master WHERE name='participation_schema'")
      .get() &&
    db.prepare("SELECT version FROM participation_schema WHERE id=1").get()
      ?.version > 1
  )
    throw Error("Project participation schema is newer than this release.");
  const tables = [
    ...new Set([
      ...specs.map((s) => s[0]),
      "posts",
      "entity_details",
      "room_assignments",
      "room_events",
      "review_requests",
      "project_work_requests",
      "projects",
      "memberships",
    ]),
  ];
  if (
    db
      .prepare(
        `SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name IN(${tables.map(() => "?").join(",")})`,
      )
      .get(...tables).n !== tables.length
  )
    throw Error(
      "Prepare Review Flow, Rooms and Contributions before project participation.",
    );
  transaction(db, () => {
    db.exec(
      "CREATE TABLE IF NOT EXISTS participation_schema(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL)",
    );
    for (const d of definitions) db.exec(d.sql);
    db.exec(
      "INSERT INTO participation_schema VALUES(1,1) ON CONFLICT(id) DO UPDATE SET version=excluded.version",
    );
  });
}
