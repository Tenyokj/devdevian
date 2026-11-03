// Real browser workflow against disposable local data only.
import { chromium, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { startTestServer } from "../tests/http-fixture.mjs";
const f = await startTestServer();
let browser;
const artifacts = ".test-data/review-flow-browser";
mkdirSync(artifacts, { recursive: true });
try {
  browser = await chromium.launch({ headless: true });
  const author = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    reviewer = await browser.newContext();
  for (const [context, name] of [
    [author, "flow_browser_author"],
    [reviewer, "flow_browser_reviewer"],
  ]) {
    const r = await context.request.post(f.base + "/api/register", {
      data: {
        name,
        username: name,
        email: name + "@fixture.test",
        password: "Fixture-password123",
      },
    });
    expect(r.status()).toBe(200);
  }
  const post = async (context, path, data) => {
    const r = await context.request.post(f.base + "/api" + path, { data });
    expect(r.ok(), await r.text()).toBeTruthy();
    return r.json();
  };
  const get = async (context, path) => {
    const r = await context.request.get(f.base + "/api" + path);
    expect(r.ok()).toBeTruthy();
    return r.json();
  };
  const project = await post(author, "/projects", {
    name: "Review Flow Orbit",
    description: "A fictional workspace for named reviewer collaboration.",
    topic: "web",
    stage: "Prototype",
    help: "Review the retry boundary and its changes.",
  });
  const review = await post(author, "/posts", {
    kind: "review",
    topic: "web",
    title: "A safer retry boundary",
    body: "Please inspect retry safety and permanent failure handling.",
    code: "export const retry = () => true;",
    review_focus: "Check permanent failures and retry limits.",
  });
  expect(
    (
      await author.request.put(
        `${f.base}/api/projects/${project.id}/work-requests/${review.id}`,
        { data: { state: "in_progress", expected_version: 0 } },
      )
    ).status(),
  ).toBe(201);
  const page = await author.newPage(),
    peer = await reviewer.newPage(),
    errors = [];
  for (const p of [page, peer])
    p.on("pageerror", (e) => errors.push(e.message));
  await page.goto(f.base + "/app#post/" + review.id);
  await expect(
    page.getByRole("region", { name: "Review Flow", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Request a reviewer", exact: true })
    .click();
  await page
    .getByLabel("Reviewer username", { exact: true })
    .fill("flow_browser_reviewer");
  await page
    .getByLabel("Invitation context", { exact: true })
    .fill("Please inspect the failure guard.");
  await page
    .getByRole("button", { name: "Preview change", exact: true })
    .click();
  expect(
    (await get(author, `/posts/${review.id}/review-flow`)).pagination.total,
  ).toBe(0);
  await page
    .getByRole("button", { name: "Confirm change", exact: true })
    .click();
  await expect(page.locator(".rf-state").first()).toHaveText("Requested");
  await peer.goto(f.base + "/app#review-flow");
  await expect(
    peer.getByRole("heading", { name: "Waiting for me.", exact: true }),
  ).toBeVisible();
  await peer
    .getByRole("button", { name: "Accept review", exact: true })
    .click();
  await peer
    .getByRole("button", { name: "Preview change", exact: true })
    .click();
  await peer
    .getByRole("button", { name: "Confirm change", exact: true })
    .click();
  await peer.getByRole("button", { name: "In review", exact: true }).click();
  await expect(peer.locator(".rf-state").first()).toHaveText("In review");
  await peer
    .getByRole("button", { name: "Share outcome", exact: true })
    .click();
  await peer
    .getByLabel("Outcome context", { exact: true })
    .fill("The original retry needs a permanent-error guard.");
  await peer
    .getByRole("button", { name: "Preview change", exact: true })
    .click();
  await peer
    .getByRole("button", { name: "Confirm change", exact: true })
    .click();
  await peer.getByRole("button", { name: "History", exact: true }).click();
  await expect(peer.locator(".rf-outcome")).toContainText("Changes requested");
  const metadata = await get(reviewer, `/posts/${review.id}/code-reviews`);
  const remark = await post(reviewer, `/posts/${review.id}/code-reviews`, {
    revision_id: metadata.revision_id,
    snippet_hash: metadata.snippet_hash,
    start_line: 1,
    end_line: 1,
    body: "Add a permanent-error guard before retrying.",
  });
  const flow = await get(author, `/posts/${review.id}/review-flow`);
  const next = await post(author, `/posts/${review.id}/revisions`, {
    base_revision_id: flow.current_revision_id,
    expected_revision: flow.post_revision,
    files: [
      {
        path: "retry.ts",
        code: "export const retry = error => !error.permanent;",
      },
    ],
    review_focus: "Check the new permanent-error guard.",
  });
  await page.reload();
  await expect(page.locator(".rf-outcome")).toContainText(
    "Changes requested · v1",
  );
  await expect(page.locator(".rf-list")).toContainText("Earlier revision");
  await page
    .getByRole("button", { name: "Address in current revision", exact: true })
    .click();
  await page
    .getByLabel("What changed", { exact: true })
    .fill("The permanent-error path now stops retries.");
  await page
    .getByRole("button", { name: "Preview change", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm change", exact: true })
    .click();
  await expect(page.locator(".rf-links")).toContainText(
    "The permanent-error path now stops retries.",
  );
  const notes = await get(author, `/posts/${review.id}/code-reviews`);
  expect(Boolean(notes.items[0].resolved)).toBe(false);
  await page.locator(".rf-panel").screenshot({
    path: artifacts + "/review-flow-desktop.png",
    animations: "disabled",
  });
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
    ).toBe(false);
  }
  await page.locator(".rf-panel").screenshot({
    path: artifacts + "/review-flow-mobile.png",
    animations: "disabled",
  });
  await page.goto(f.base + `/app#workspace/${project.id}/activity`);
  await expect(
    page.getByRole("heading", { name: "Review activity.", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('[aria-label="Project review activity"]'),
  ).toContainText("Changes requested");
  expect(errors).toEqual([]);
  console.log(
    "Review Flow browser passed: named request preview, accept, version-bound outcome, explicit revision link without resolution, project activity and responsive layouts.",
  );
} catch (e) {
  if (browser)
    for (const context of browser.contexts())
      for (const page of context.pages())
        await page
          .screenshot({
            path: artifacts + "/failure-" + Date.now() + ".png",
            animations: "disabled",
          })
          .catch(() => {});
  throw e;
} finally {
  await browser?.close();
  await f.close();
}
