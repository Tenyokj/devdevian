import { captureReviewRevision } from "../review-revisions.mjs";
import { snippetHash } from "../code-reviews.mjs";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
const folder = await mkdtemp(join(tmpdir(), "devdevian-load-"));
const probe = createServer();
await new Promise((r) => probe.listen(0, "127.0.0.1", r));
const port = probe.address().port;
await new Promise((r) => probe.close(r));
const env = {
  ...process.env,
  TURSO_DATABASE_URL: "",
  TURSO_AUTH_TOKEN: "",
  DB_PATH: join(folder, "fixture.sqlite"),
  UPLOAD_DRIVER: "local",
  VERCEL: "",
  NODE_ENV: "test",
  DEMO_MODE: "1",
  AUTH_TEST_UNVERIFIED: "",
  PORT: String(port),
};
const run = (file) =>
  spawn(process.execPath, [file], { env, stdio: ["ignore", "pipe", "pipe"] });
let server;
try {
  const migration = run("scripts/migrate.mjs");
  let logs = "";
  migration.stdout.on("data", (c) => (logs += c));
  migration.stderr.on("data", (c) => (logs += c));
  assert.equal(await new Promise((r) => migration.once("exit", r)), 0, logs);
  const db = new DatabaseSync(env.DB_PATH);
  db.exec(
    "BEGIN; INSERT INTO users(id,email,password,name,username,email_verified) VALUES(1,'load@fixture.test','unused','Load fixture','load_fixture',1)",
  );
  const post = db.prepare(
    "INSERT INTO posts(id,user_id,title,body,topic,kind) VALUES(?,1,?,?,'web','question')",
  );
  const reply = db.prepare(
    "INSERT INTO replies(user_id,post_id,body) VALUES(1,?,?)",
  );
  for (let i = 1; i <= 500; i++) {
    post.run(
      i,
      "Load-test question " + i,
      "Deterministic isolated fixture content. ".repeat(8),
    );
    for (let j = 0; j < 3; j++) reply.run(i, "An answer with enough context.");
  }
  const code = "async function work() { return request(); }";
  db.prepare(
    "UPDATE posts SET kind='review',code=?,review_focus='Check error handling.' WHERE id=1",
  ).run(code);
  const feedback = db.prepare(
    "INSERT INTO code_reviews(post_id,user_id,snippet_hash,start_line,end_line,quote,body) VALUES(1,1,?,1,1,?,?)",
  );
  for (let i = 0; i < 1000; i++)
    feedback.run(snippetHash(code), code, "Bounded line feedback fixture " + i);
  db.prepare("INSERT INTO sessions VALUES(?,1,?)").run(
    "load-test-session",
    Date.now() + 600000,
  );
  db.prepare(
    "INSERT INTO subscriptions(user_id,kind,item) VALUES(1,'topic','web')",
  ).run();
  for (let i = 1; i <= 100; i++)
    db.prepare(
      "INSERT INTO subscriptions(user_id,kind,item) VALUES(1,'post',?)",
    ).run(String(i));
  db.prepare(
    "INSERT INTO projects(id,user_id,post_id,name,description,topic,stage,help) VALUES(1,1,500,'Load workspace','Isolated workload','web','Prototype','Review bounded requests')",
  ).run();
  db.prepare(
    "INSERT INTO private_communities(id,owner_id,name,description) VALUES('load-private',1,'Load private team','Isolated private fixture')",
  ).run();
  db.prepare(
    "INSERT INTO memberships(user_id,kind,item) VALUES(1,'group','load-private')",
  ).run();
  db.exec(
    "UPDATE posts SET community_id='load-private' WHERE id BETWEEN 450 AND 499",
  );
  const link = db.prepare(
    "INSERT INTO project_work_requests(post_id,project_id,state,created_by) VALUES(?,1,?,1)",
  );
  for (let id = 1; id < 500; id++)
    link.run(id, ["open", "in_progress", "ready"][id % 3]);
  const review = db.prepare("SELECT * FROM posts WHERE id=1").get();
  const original = captureReviewRevision(db, review);
  let latest = original;
  for (let i = 1; i < 100; i++)
    latest = captureReviewRevision(db, review, { force: true });
  db.prepare(
    "UPDATE code_reviews SET snapshot_id=CASE WHEN id<=500 THEN ? ELSE ? END WHERE post_id=1",
  ).run(original.id, latest.id);
  db.prepare(
    "INSERT INTO users(id,email,password,name,username,email_verified) VALUES(2,'reviewer@fixture.test','unused','Review fixture','load_reviewer',1)",
  ).run();
  const assignment = db.prepare(
    "INSERT INTO review_requests(post_id,reviewer_id,requester_id,snapshot_id,state) VALUES(1,2,1,?,?)",
  );
  const retained = db
    .prepare("SELECT id FROM review_revisions WHERE post_id=1 ORDER BY number")
    .all();
  for (let i = 0; i < retained.length; i++) {
    assignment.run(
      retained[i].id,
      i === retained.length - 1 ? "accepted" : "completed",
    );
    db.prepare(
      "INSERT INTO review_flow_events(post_id,actor_id,type,snapshot_id) VALUES(1,1,'review_requested',?)",
    ).run(retained[i].id);
  }
  for (let i = 2; i <= 101; i++) {
    db.prepare(
      "INSERT INTO room_assignments(post_id,project_id,user_id) VALUES(?,1,1)",
    ).run(i);
    db.prepare(
      "INSERT INTO room_events(project_id,post_id,actor_id,type,state) VALUES(1,?,1,'task_assigned','open')",
    ).run(i);
    db.prepare(
      "INSERT INTO room_decisions(project_id,post_id,user_id,title,body,operation_key,archived) VALUES(1,?,1,?,?,?,?)",
    ).run(
      i,
      "Decision " + i,
      "A bounded fixture decision.",
      "fixture-operation-" + i,
      i < 14 ? 0 : 1,
    );
  }
  const plan = db
    .prepare(
      "EXPLAIN QUERY PLAN SELECT post_id FROM project_work_requests WHERE project_id=1 AND linked=1 ORDER BY post_id DESC LIMIT 12",
    )
    .all();
  assert.ok(
    plan.some((row) => row.detail.includes("project_work_requests_project")),
    "Project pagination must use its index",
  );
  db.exec("COMMIT");
  db.close();
  server = run("server.mjs");
  logs = "";
  server.stdout.on("data", (c) => (logs += c));
  server.stderr.on("data", (c) => (logs += c));
  const base = "http://127.0.0.1:" + port;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null)
      throw Error("Isolated load-test server exited.");
    if (logs.includes("Devdevian is ready")) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.match(logs, /Devdevian is ready/);
  const endpoints = [
    "/projects/1/room",
    "/projects/1/room/tasks?state=open&page=10",
    "/projects/1/room/tasks?mine=1&page=4",
    "/projects/1/room/decisions?archived=1&page=5",
    "/projects/1/room/activity?page=12",
    "/review-flow?section=sent&page=5",
    "/posts/1/review-flow?target_id=1",
    "/projects/1/review-activity?page=5",
    "/posts/1/revision-links",
    "/projects/1/workspace",
    "/projects/1/work-requests?page=20&state=ready",
    "/projects/1/work-requests?q=question&limit=12",
    "/posts/1/revisions?page=5",
    `/posts/1/revisions/${original.id}`,
    `/posts/1/revisions/${latest.id}`,
    "/posts?limit=12",
    "/posts?limit=12&page=20",
    "/posts?following=1&limit=12",
    "/posts?following=1&limit=12&page=20",
    "/subscriptions?limit=12",
    "/posts/250",
    "/posts/1/code-reviews?page=50&status=open&version=current",
    "/topics",
    "/me",
    "/events?limit=12",
    "/communities?limit=12",
  ];
  const guest = await fetch(base + "/api/projects/1/workspace");
  assert.equal(
    (await guest.json()).counts.total,
    449,
    "Workspace counts must exclude fifty private requests",
  );
  const privatePage = await fetch(base + "/api/projects/1/work-requests?q=499");
  assert.equal((await privatePage.json()).pagination.total, 0);
  const times = [];
  let maxResponseBytes = 0;
  let counter = 0;
  const worker = async () => {
    for (;;) {
      const index = counter++;
      if (index >= 300) return;
      const started = performance.now();
      const response = await fetch(
        base + "/api" + endpoints[index % endpoints.length],
        {
          headers: { Cookie: "devdevian_demo_session=load-test-session" },
          signal: AbortSignal.timeout(5000),
        },
      );
      assert.equal(response.status, 200, "Load request must succeed");
      const text = await response.text();
      maxResponseBytes = Math.max(maxResponseBytes, Buffer.byteLength(text));
      const data = JSON.parse(text);
      if (data.pagination)
        assert.ok(data.items.length <= 30, "List payloads stay bounded");
      times.push(performance.now() - started);
    }
  };
  const started = performance.now();
  await Promise.all(Array.from({ length: 10 }, worker));
  times.sort((a, b) => a - b);
  const report = {
    environment: "isolated local database; not a production capacity guarantee",
    requests: times.length,
    workspace_requests: 499,
    private_workspace_requests: 50,
    immutable_revisions: 100,
    named_review_requests: 100,
    max_response_bytes: maxResponseBytes,
    concurrency: 10,
    posts: 500,
    replies: 1500,
    line_feedback: 1000,
    following_sources: 101,
    errors: 0,
    p50_ms: Math.round(times[Math.floor(times.length * 0.5)]),
    p95_ms: Math.round(times[Math.floor(times.length * 0.95)]),
    elapsed_ms: Math.round(performance.now() - started),
  };
  console.log(JSON.stringify(report));
  assert.ok(
    report.p95_ms < 2000,
    "Local p95 regression: investigate before shipping",
  );
} finally {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((r) => server.once("exit", r));
  }
  await rm(folder, { recursive: true, force: true });
}
