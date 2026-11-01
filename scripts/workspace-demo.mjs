// Real application/API on disposable local data, separate from all developer
// and hosted databases. The fixture explicitly disables environment-file reads.
import { startTestServer } from "../tests/http-fixture.mjs";
const fixture = await startTestServer();
try {
  const owner = fixture.client(),
    reviewer = fixture.client();
  const password = "Workspace-Demo-Only-2026!";
  for (const [client, name, username, email] of [
    [owner, "Alex Morgan", "workspace_alex", "alex@workspace.test"],
    [reviewer, "Sam Chen", "workspace_sam", "sam@workspace.test"],
  ]) {
    const r = await client("/register", { name, username, email, password });
    if (r.status !== 200)
      throw Error("Could not initialize isolated workspace accounts.");
  }
  const project = await owner("/projects", {
    name: "Orbit Queue",
    description:
      "A small queue with bounded retries and clear failure handling.",
    topic: "web",
    stage: "Prototype",
    help: "Help make retries safe under permanent failures.",
    repo: "https://github.com/example/orbit",
  });
  if (project.status !== 201)
    throw Error("Could not initialize the sample project.");
  const created = await owner("/posts", {
    title: "Make retries safe under timeouts",
    body: "Please review how the worker handles timeouts and permanent errors. Keep replay safety explicit.",
    kind: "review",
    topic: "web",
    code: "export async function retry(task) {\n  return task();\n}",
    review_focus: "Check idempotency and permanent errors.",
  });
  if (created.status !== 201)
    throw Error("Could not initialize the sample review.");
  const linked = await owner(
    `/projects/${project.data.id}/work-requests/${created.data.id}`,
    { state: "in_progress", expected_version: 0 },
    "PUT",
  );
  if (linked.status !== 201) throw Error("Could not link the sample review.");
  const notes = await reviewer(`/posts/${created.data.id}/code-reviews`);
  await reviewer(`/posts/${created.data.id}/code-reviews`, {
    snippet_hash: notes.data.snippet_hash,
    revision_id: notes.data.revision_id,
    start_line: 2,
    end_line: 2,
    body: "What happens when a failure is permanent? Avoid retrying it.",
  });
  const next = await owner(`/posts/${created.data.id}/revisions`, {
    base_revision_id: notes.data.revision_id,
    expected_revision: notes.data.post_revision,
    files: [
      {
        path: "src/retry.ts",
        code: "export async function retry(task, error) {\n  if (error.permanent) throw error;\n  return task();\n}",
      },
      {
        path: "test/retry.test.ts",
        code: "assert.equal(permanentFailureRetries(), 0);",
      },
    ],
    review_focus:
      "Check the permanent-error regression test and replay safety.",
  });
  if (next.status !== 201)
    throw Error("Could not initialize the second review version.");
  console.log(
    `\nReal Workspaces preview: ${fixture.base}/app#workspace/${project.data.id}`,
  );
  console.log(
    "Disposable local database only. This data disappears when the preview stops.",
  );
  console.log("Sample sign-in: alex@workspace.test or sam@workspace.test");
  console.log("Sample-only password: " + password);
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await fixture.close();
    process.exit(0);
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
} catch (error) {
  await fixture.close();
  throw error;
}
