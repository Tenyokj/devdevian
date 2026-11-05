import { pageRows, scopeSQL } from "./spaces.mjs";
import { awaitingReviewSQL } from "./review-queue.mjs";
const names = [
  "id",
  "type",
  "post_id",
  "project_id",
  "target_id",
  "title",
  "project_name",
  "state",
  "updated_at",
  "community_id",
  "kind",
  "action",
  "revision_number",
];
const safe = (row) => Object.fromEntries(names.map((k) => [k, row[k] ?? null]));
// This is a selected, paginated local-DB view. No provider calls, writes, or
// viewer IDs supplied by the client; both the task and its project must be visible.
export function registerMyWork(app, db, required) {
  const taskScope = (req) =>
    `w.linked=1 AND p.removed_at IS NULL AND parent.removed_at IS NULL AND ${scopeSQL("p", req.user)} AND ${scopeSQL("parent", req.user)}`;
  const active =
    "p.archived_at IS NULL AND p.locked_at IS NULL AND parent.archived_at IS NULL AND parent.locked_at IS NULL";
  const joins =
    "JOIN project_work_requests w ON w.post_id=p.id JOIN projects pr ON pr.id=w.project_id JOIN posts parent ON parent.id=pr.post_id";
  const capabilities = () => ({
    my_work: 1,
    rooms: db.roomsReady ? 1 : 0,
    review_flow: db.reviewFlowReady ? 1 : 0,
    contributions: db.contributionsReady ? 1 : 0,
  });
  app.get("/api/my-work", required, (req, res) => {
    const section = req.query.section || "attention";
    if (!["attention", "tasks", "results"].includes(section))
      return res
        .status(400)
        .json({ error: "Choose attention, tasks or results." });
    const parts = [],
      args = [];
    if (section === "attention" && db.reviewFlowReady) {
      parts.push(
        `SELECT 'request-'||q.id id,'request' type,p.id post_id,NULL project_id,q.id target_id,p.title,NULL project_name,q.state,q.updated_at,p.community_id,p.kind,CASE q.state WHEN 'pending' THEN 'Review invitation' ELSE 'Finish review' END action,s.number revision_number FROM review_requests q JOIN posts p ON p.id=q.post_id JOIN review_revisions s ON s.id=q.snapshot_id WHERE q.reviewer_id=? AND q.state IN ('pending','accepted') AND p.removed_at IS NULL AND p.archived_at IS NULL AND p.locked_at IS NULL AND ${scopeSQL("p", req.user)}`,
      );
      args.push(req.user.id);
      parts.push(
        `SELECT 'outcome-'||o.id,'outcome',p.id,NULL,q.id,p.title,NULL,'changes_requested',o.created,p.community_id,p.kind,'Address review',s.number FROM review_outcomes o JOIN review_requests q ON q.id=o.request_id JOIN posts p ON p.id=q.post_id JOIN review_revisions s ON s.id=q.snapshot_id WHERE p.user_id=? AND o.verdict='changes_requested' AND p.removed_at IS NULL AND p.archived_at IS NULL AND p.locked_at IS NULL AND ${scopeSQL("p", req.user)} AND q.snapshot_id=(SELECT latest.id FROM review_revisions latest WHERE latest.post_id=p.id ORDER BY latest.number DESC LIMIT 1)`,
      );
      args.push(req.user.id);
    }
    if (section === "attention") {
      parts.push(
        `SELECT 'remark-'||c.id id,'remark' type,p.id post_id,NULL project_id,c.id target_id,p.title,NULL project_name,'reply_needed' state,COALESCE((SELECT created FROM code_review_replies last WHERE last.review_id=c.id AND last.deleted_at IS NULL ORDER BY last.id DESC LIMIT 1),c.created) updated_at,p.community_id,p.kind,'Reply to feedback' action,NULL revision_number FROM code_reviews c JOIN posts p ON p.id=c.post_id WHERE p.removed_at IS NULL AND p.archived_at IS NULL AND p.locked_at IS NULL AND ${scopeSQL("p", req.user)} AND ${awaitingReviewSQL(req.user.id)}`,
      );
    }
    if (section === "tasks" && db.roomsReady) {
      parts.push(
        `SELECT 'task-'||p.id id,'task' type,p.id post_id,pr.id project_id,p.id target_id,p.title,pr.name project_name,w.state,w.updated_at,p.community_id,p.kind,'Open task' action,NULL revision_number FROM room_assignments a JOIN posts p ON p.id=a.post_id ${joins} WHERE a.project_id=pr.id AND a.user_id=? AND ${taskScope(req)} AND ${active}`,
      );
      args.push(req.user.id);
    }
    if (
      db.roomsReady &&
      db.contributionsReady &&
      ["attention", "results"].includes(section)
    ) {
      const own =
        section === "attention"
          ? `((c.state='submitted' AND pr.user_id=? AND c.user_id<>?) OR (c.state='changes_requested' AND c.user_id=? AND EXISTS(SELECT 1 FROM room_assignments a WHERE a.post_id=p.id AND a.project_id=pr.id AND a.user_id=?))) AND ${active}`
          : "(c.user_id=? OR pr.user_id=?)";
      parts.push(
        `SELECT 'result-'||c.id id,'result' type,p.id post_id,pr.id project_id,c.id target_id,p.title,pr.name project_name,c.state,c.updated_at,p.community_id,p.kind,CASE WHEN c.state='submitted' AND pr.user_id=${Number(req.user.id)} THEN 'Review result' WHEN c.state='changes_requested' AND c.user_id=${Number(req.user.id)} THEN 'Update result' ELSE 'Open result' END action,c.revision revision_number FROM contributions c JOIN posts p ON p.id=c.post_id ${joins} WHERE c.project_id=pr.id AND ${taskScope(req)} AND ${own}`,
      );
      args.push(
        ...(section === "attention"
          ? [req.user.id, req.user.id, req.user.id, req.user.id]
          : [req.user.id, req.user.id]),
      );
    }
    const unavailable = [];
    if (!db.reviewFlowReady && section === "attention")
      unavailable.push("Named reviews");
    if (!db.roomsReady) unavailable.push("Room tasks");
    if (!db.contributionsReady) unavailable.push("Contributions");
    if (!parts.length)
      return res.json({
        items: [],
        pagination: { page: 1, pages: 1, total: 0, limit: 12 },
        capabilities: capabilities(),
        unavailable,
      });
    const page = pageRows(
      db,
      req,
      "SELECT * FROM (" +
        parts.join(" UNION ALL ") +
        ") ORDER BY updated_at DESC,id DESC",
      args,
    );
    res.json({
      ...page,
      items: page.items.map(safe),
      capabilities: capabilities(),
      unavailable,
    });
  });
  app.get("/api/my-work/recent", required, (req, res) => {
    const raw = typeof req.query.ids === "string" ? req.query.ids : "";
    const ids = raw ? raw.split(",") : [];
    if (
      ids.length > 12 ||
      ids.some(
        (id) =>
          !/^[1-9]\d{0,14}$/.test(id) || !Number.isSafeInteger(Number(id)),
      ) ||
      new Set(ids).size !== ids.length
    )
      return res
        .status(400)
        .json({ error: "Choose at most twelve distinct conversation IDs." });
    if (!ids.length)
      return res.json({ items: [], capabilities: { my_work: 1 } });
    const rows = db
      .prepare(
        `SELECT p.id,p.title,p.kind,p.community_id,p.created FROM posts p WHERE p.id IN (${ids.map(() => "?").join(",")}) AND p.removed_at IS NULL AND ${scopeSQL("p", req.user)}`,
      )
      .all(...ids.map(Number));
    const map = new Map(rows.map((r) => [Number(r.id), r]));
    res.json({
      items: ids
        .map(Number)
        .filter((id) => map.has(id))
        .map((id) => {
          const r = map.get(id);
          return {
            id,
            post_id: id,
            title: r.title,
            kind: r.kind,
            community_id: r.community_id,
            created: r.created,
          };
        }),
      capabilities: { my_work: 1 },
    });
  });
}
