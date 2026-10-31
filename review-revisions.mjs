import { createHash } from "node:crypto";
import { canRead, pageRows } from "./spaces.mjs";
import { transaction } from "./activity.mjs";
import { consumeBudget } from "./limits.mjs";
import { reviewNavigation } from "./src/review-navigation.mjs";
import { normalizeGitHubContext } from "./packages/cli/lib/github-context.mjs";

const hash = (text) => createHash("sha256").update(text).digest("hex");
export const workspaceCapabilities = Object.freeze({
  work_requests: 1,
  review_revisions: 1,
});
const readDetails = (db, id) =>
  JSON.parse(
    db
      .prepare(
        "SELECT data FROM entity_details WHERE kind='post' AND entity_id=?",
      )
      .get(String(id))?.data || "{}",
  );
export const revisionHead = (db, id) =>
  db
    .prepare(
      "SELECT * FROM review_revisions WHERE post_id=? ORDER BY number DESC LIMIT 1",
    )
    .get(id);
const positive = (n) => Number.isSafeInteger(n) && n > 0;

// Snapshots are append-only. Deletion is reserved for an explicit data-erasure
// procedure, not an HTTP operation; an accidental UPDATE fails at the DB boundary.
export function prepareWorkspaces(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS workspace_schema(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS project_work_requests(
    post_id INTEGER PRIMARY KEY REFERENCES posts(id), project_id INTEGER NOT NULL REFERENCES projects(id),
    linked INTEGER NOT NULL DEFAULT 1 CHECK(linked IN (0,1)),
    state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open','in_progress','ready')),
    version INTEGER NOT NULL DEFAULT 1, created_by INTEGER NOT NULL REFERENCES users(id),
    created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT);
    CREATE INDEX IF NOT EXISTS project_work_requests_project ON project_work_requests(project_id,linked,post_id);
    CREATE TABLE IF NOT EXISTS review_revisions(
    id INTEGER PRIMARY KEY, post_id INTEGER NOT NULL REFERENCES posts(id), number INTEGER NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id), code TEXT NOT NULL, snippet_hash TEXT NOT NULL,
    files_json TEXT NOT NULL, context_json TEXT NOT NULL, review_focus TEXT NOT NULL,
    created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(post_id,number));
    CREATE TRIGGER IF NOT EXISTS review_revisions_immutable BEFORE UPDATE ON review_revisions
    BEGIN SELECT RAISE(ABORT,'Published review revisions are immutable'); END;`);
  const columns = db.prepare("PRAGMA table_info(code_reviews)").all();
  if (!columns.some((c) => c.name === "snapshot_id"))
    db.exec(
      "ALTER TABLE code_reviews ADD COLUMN snapshot_id INTEGER REFERENCES review_revisions(id)",
    );
  db.exec(
    "CREATE INDEX IF NOT EXISTS code_reviews_snapshot ON code_reviews(post_id,snapshot_id,id)",
  );
  // Keyset batches bound memory; only the currently retained code is recoverable.
  // Earlier hashes keep NULL identity and their original quote, never guessed code.
  let after = 0;
  for (;;) {
    const posts = db
      .prepare(
        "SELECT p.* FROM posts p WHERE p.kind='review' AND p.id>? ORDER BY p.id LIMIT 50",
      )
      .all(after);
    if (!posts.length) break;
    transaction(db, () => {
      for (const p of posts) {
        const firstRetainedSnapshot = !revisionHead(db, p.id);
        const snapshot = captureReviewRevision(db, p);
        if (firstRetainedSnapshot)
          db.prepare(
            "UPDATE code_reviews SET snapshot_id=? WHERE post_id=? AND snippet_hash=? AND snapshot_id IS NULL",
          ).run(snapshot.id, p.id, snapshot.snippet_hash);
      }
    });
    after = posts.at(-1).id;
  }
  db.exec(
    "INSERT INTO workspace_schema VALUES(1,1) ON CONFLICT(id) DO UPDATE SET version=excluded.version",
  );
}

// Legacy publications keep their exact flattened text. A synthetic "snippet"
// identity means unknown file origin, not a claim about a repository path.
export function captureReviewRevision(
  db,
  post,
  { details = null, files = null, force = false } = {},
) {
  if (post.kind !== "review") return null;
  details ||= readDetails(db, post.id);
  const code = post.code || "";
  const context = {
    github_context: details.github_context || null,
    repo_url: post.repo_url || "",
  };
  const contextJSON = JSON.stringify(context);
  const head = revisionHead(db, post.id);
  if (
    !force &&
    head &&
    head.code === code &&
    head.context_json === contextJSON &&
    head.review_focus === (post.review_focus || "")
  )
    return head;
  const navigation = !files && reviewNavigation(code, context.github_context);
  const retainedFiles = navigation?.length
    ? navigation.map((f) => {
        const text = code
          .split("\n")
          .slice(f.patch_start - 1, f.patch_end)
          .join("\n");
        return {
          path: f.path,
          code: text,
          start_line: f.patch_start,
          end_line: f.patch_end,
          sha256: hash(text),
        };
      })
    : null;
  const fileRows = files ||
    retainedFiles || [
      {
        path: "snippet",
        code,
        start_line: 1,
        end_line: code.split("\n").length,
        sha256: hash(code),
      },
    ];
  const id = db
    .prepare(
      "INSERT INTO review_revisions(post_id,number,user_id,code,snippet_hash,files_json,context_json,review_focus) VALUES(?,?,?,?,?,?,?,?)",
    )
    .run(
      post.id,
      (head?.number || 0) + 1,
      post.user_id,
      code,
      hash(code),
      JSON.stringify(fileRows),
      contextJSON,
      post.review_focus || "",
    ).lastInsertRowid;
  return db
    .prepare("SELECT * FROM review_revisions WHERE id=?")
    .get(Number(id));
}
export function validRevisionFiles(input) {
  if (!Array.isArray(input) || !input.length || input.length > 10)
    throw Error("Choose 1–10 text files.");
  const paths = new Set();
  let line = 1;
  const files = input.map((file) => {
    const path = file?.path;
    if (
      typeof path !== "string" ||
      path.length > 240 ||
      !path ||
      /[\\\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069:]/u.test(path) ||
      path.startsWith("/") ||
      path.split("/").some((s) => !s || s === "." || s === "..") ||
      paths.has(path)
    )
      throw Error("Use unique relative file paths without traversal.");
    if (typeof file.code !== "string" || file.code.includes("\0"))
      throw Error("Only text snapshots are supported.");
    paths.add(path);
    const result = {
      path,
      code: file.code,
      start_line: line,
      end_line: line + file.code.split("\n").length - 1,
      sha256: hash(file.code),
    };
    line = result.end_line + 1;
    return result;
  });
  const code = files.map((f) => f.code).join("\n");
  if (code.trim().length < 10 || code.length > 20000)
    throw Error("Publish between 10 and 20,000 characters of code.");
  return { code, files };
}
const dto = (row, full = false) => ({
  id: row.id,
  post_id: row.post_id,
  number: row.number,
  user_id: row.user_id,
  snippet_hash: row.snippet_hash,
  created: row.created,
  review_focus: row.review_focus,
  context: JSON.parse(row.context_json),
  files: JSON.parse(row.files_json).map((f) =>
    full
      ? f
      : {
          path: f.path,
          start_line: f.start_line,
          end_line: f.end_line,
          sha256: f.sha256,
        },
  ),
  ...(full ? { code: row.code } : {}),
});

export function registerReviewRevisions(app, db, required) {
  const target = (req, res, next) => {
    const p = db.prepare("SELECT * FROM posts WHERE id=?").get(req.params.id);
    if (!canRead(db, req.user, p))
      return res.status(404).json({ error: "Conversation not found." });
    if (p.kind !== "review")
      return res
        .status(400)
        .json({ error: "This conversation is not a code review." });
    req.snapshotPost = p;
    next();
  };
  app.get("/api/posts/:id/revisions", target, (req, res) => {
    const p = req.snapshotPost,
      head = revisionHead(db, p.id);
    const page = pageRows(
      db,
      req,
      "SELECT * FROM review_revisions WHERE post_id=? ORDER BY number DESC",
      [p.id],
      10,
    );
    res.json({
      ...page,
      capabilities: workspaceCapabilities,
      current_revision_id: head?.code === (p.code || "") ? head.id : null,
      post_revision: p.revision,
      items: page.items.map((r) => dto(r)),
    });
  });
  app.get("/api/posts/:id/revisions/:snapshotId", target, (req, res) => {
    const row = db
      .prepare("SELECT * FROM review_revisions WHERE id=? AND post_id=?")
      .get(req.params.snapshotId, req.snapshotPost.id);
    if (!row)
      return res.status(404).json({ error: "Review revision not found." });
    res.json(dto(row, true));
  });
  app.post("/api/posts/:id/revisions", required, target, (req, res) => {
    const p = req.snapshotPost;
    if (p.user_id !== req.user.id)
      return res
        .status(403)
        .json({ error: "Only the request author can publish a revision." });
    if (p.removed_at || p.archived_at || p.locked_at)
      return res
        .status(409)
        .json({ error: "This conversation is paused or removed." });
    const input = req.body;
    let snapshot, github;
    try {
      snapshot = validRevisionFiles(input.files);
      github =
        input.github_context == null
          ? null
          : normalizeGitHubContext(input.github_context);
      if (
        !Number.isSafeInteger(input.expected_revision) ||
        input.expected_revision < 0 ||
        !positive(input.base_revision_id)
      )
        throw Error("Send the current post revision and base revision ID.");
      if (
        typeof input.review_focus !== "string" ||
        input.review_focus.trim().length < 10 ||
        input.review_focus.length > 1500
      )
        throw Error("Include a review focus between 10 and 1,500 characters.");
      // GitHub patch ranges refer to the exact flattened publication, never to a
      // coincidentally matching path in a newly selected arbitrary text file.
      if (github?.mode === "pr") {
        const navigation = reviewNavigation(snapshot.code, github);
        if (
          navigation.length !== snapshot.files.length ||
          navigation.some(
            (f, i) =>
              f.path !== snapshot.files[i].path ||
              f.patch_start !== snapshot.files[i].start_line ||
              f.patch_end !== snapshot.files[i].end_line,
          )
        )
          throw Error(
            "GitHub patch ranges do not match the selected files and published text.",
          );
      }
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    if (
      p.revision !== input.expected_revision ||
      revisionHead(db, p.id)?.id !== input.base_revision_id ||
      revisionHead(db, p.id)?.code !== (p.code || "")
    )
      return res.status(409).json({
        error: "The review revision changed. Reload before publishing.",
      });
    consumeBudget(db, [
      { key: `review-revision:${req.user.id}`, max: 5, window: 600000 },
    ]);
    const result = transaction(db, () => {
      const current = db.prepare("SELECT * FROM posts WHERE id=?").get(p.id);
      if (
        !canRead(db, req.user, current) ||
        current.removed_at ||
        current.archived_at ||
        current.locked_at ||
        current.revision !== input.expected_revision ||
        revisionHead(db, p.id)?.id !== input.base_revision_id ||
        revisionHead(db, p.id)?.code !== (current.code || "")
      )
        return null;
      if (
        db
          .prepare("SELECT COUNT(*) n FROM review_revisions WHERE post_id=?")
          .get(p.id).n >= 100
      )
        return null;
      const changed = db
        .prepare(
          "UPDATE posts SET code=?,review_focus=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=?",
        )
        .run(
          snapshot.code,
          input.review_focus.trim(),
          p.id,
          input.expected_revision,
        );
      if (!changed.changes) return null;
      // Old clients continue to read the latest code and metadata. Both update
      // atomically with the immutable version; no response-time side effects.
      const details = { ...readDetails(db, p.id), github_context: github };
      db.prepare(
        "INSERT OR REPLACE INTO entity_details(kind,entity_id,data) VALUES('post',?,?)",
      ).run(String(p.id), JSON.stringify(details));
      const row = captureReviewRevision(
        db,
        {
          ...current,
          code: snapshot.code,
          review_focus: input.review_focus.trim(),
        },
        { details, files: snapshot.files, force: true },
      );
      return { ...dto(row, true), post_revision: input.expected_revision + 1 };
    });
    if (!result)
      return res.status(409).json({
        error:
          "The conversation changed or reached its 100-revision limit. Reload before publishing.",
      });
    res.status(201).json(result);
  });
}
