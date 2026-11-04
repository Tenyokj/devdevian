import { chromium, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { startTestServer } from "../tests/http-fixture.mjs";
const f = await startTestServer(),
  artifacts = ".test-data/rooms-browser";
mkdirSync(artifacts, { recursive: true });
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const owner = await browser.newContext({
      viewport: { width: 1512, height: 1100 },
    }),
    peer = await browser.newContext();
  const post = async (c, path, data) => {
    const r = await c.request.post(f.base + "/api" + path, { data });
    expect(r.ok(), await r.text()).toBeTruthy();
    return r.json();
  };
  const get = async (c, path) => {
    const r = await c.request.get(f.base + "/api" + path);
    expect(r.ok()).toBeTruthy();
    return r.json();
  };
  for (const [c, name] of [
    [owner, "rooms_browser_owner"],
    [peer, "rooms_browser_peer"],
  ])
    await post(c, "/register", {
      name,
      username: name,
      email: name + "@fixture.test",
      password: "Fixture-password123",
    });
  const project = await post(owner, "/projects", {
    name: "Orbit Queue",
    description: "A calmer way to ship reliable background work.",
    topic: "web",
    stage: "Prototype",
    help: "Make retries predictable. Keep the context with the work.",
    repo: "https://github.com/example/orbit",
  });
  const tasks = [];
  for (const [state, title, kind, body] of [
    [
      "open",
      "Stop retrying permanent failures",
      "review",
      "Inspect the retry boundary and cancellation path.",
    ],
    [
      "in_progress",
      "Make worker shutdown predictable",
      "question",
      "Keep active jobs safe when the process exits.",
    ],
    [
      "ready",
      "Publish a clear contributor guide",
      "discussion",
      "Document the path from a first issue to a useful change.",
    ],
  ]) {
    const t = await post(owner, "/posts", {
      title,
      kind,
      topic: "web",
      body,
      ...(kind === "review"
        ? {
            code: "export async function retry(task) {\n  const attempts = 3;\n  return task({ attempts });\n}",
            review_focus: "Check permanent failures and safe retry limits.",
          }
        : {}),
    });
    const r = await owner.request.put(
      `${f.base}/api/projects/${project.id}/work-requests/${t.id}`,
      { data: { state, expected_version: 0 } },
    );
    expect(r.status()).toBe(201);
    tasks.push(t);
  }
  const page = await owner.newPage(),
    other = await peer.newPage(),
    errors = [];
  for (const p of [page, other])
    p.on("pageerror", (e) => errors.push(e.message));
  await other.goto(f.base + `/app#room/${project.id}`);
  await expect(
    other.getByRole("region", { name: "Open tasks", exact: true }),
  ).toBeVisible();
  await other
    .getByRole("region", { name: "Open tasks", exact: true })
    .getByRole("button", { name: "Pick up task", exact: true })
    .click();
  await other
    .getByRole("button", { name: "Preview change", exact: true })
    .click();
  expect(
    (await get(owner, `/projects/${project.id}/room/tasks/${tasks[0].id}`)).task
      .assignee_id,
  ).toBeNull();
  await other
    .getByRole("button", { name: "Confirm change", exact: true })
    .click();
  const open = other.getByRole("region", { name: "Open tasks", exact: true });
  await expect(
    open.getByText("@rooms_browser_peer", { exact: true }),
  ).toBeVisible();
  await open.getByRole("button", { name: "In progress", exact: true }).click();
  await other
    .getByRole("button", { name: "Preview change", exact: true })
    .click();
  await other
    .getByRole("button", { name: "Confirm change", exact: true })
    .click();
  await expect(
    other
      .getByRole("region", { name: "In progress tasks", exact: true })
      .getByText(tasks[0].title, { exact: true }),
  ).toBeVisible();
  await page.goto(f.base + `/app#workspace/${project.id}/decisions`);
  await page
    .getByRole("button", { name: "Pin a decision", exact: true })
    .click();
  await page
    .getByLabel("Decision", { exact: true })
    .fill("One retry owner, one clear deadline");
  await page
    .getByLabel("Why this matters", { exact: true })
    .fill(
      "Permanent failures stop immediately. A bounded owner avoids duplicate work.",
    );
  await page
    .getByLabel("Related work request ID (optional)", { exact: true })
    .fill(String(tasks[0].id));
  await page
    .getByRole("button", { name: "Preview change", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm change", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "One retry owner, one clear deadline",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByLabel("Why this matters", { exact: true })
    .fill(
      "Permanent failures and cancellation stop retries. Keep one owner and a deadline.",
    );
  await page
    .getByRole("button", { name: "Preview change", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm change", exact: true })
    .click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "A bounded owner avoids duplicate work.",
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.goto(f.base + `/app#room/${project.id}`);
  for (const theme of ["dark", "light"]) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
      localStorage.setItem("devdevian-theme", t);
    }, theme);
    for (const width of [1512, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(
        page.getByRole("region", { name: "Ready tasks", exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
      ).toBe(false);
      if (width === 1512 || width === 390)
        await page.screenshot({
          path: `${artifacts}/room-${theme}-${width}.png`,
          fullPage: true,
          animations: "disabled",
        });
    }
  }
  await page.goto(f.base + `/app#workspace/${project.id}/room-activity`);
  await expect(page.getByText("task assigned", { exact: true })).toBeVisible();
  await expect(
    page.getByText("decision updated", { exact: true }),
  ).toBeVisible();
  let failed = false;
  await page.route(
    `**/api/posts/${tasks[0].id}/code-reviews?**`,
    async (route) => {
      if (
        !failed &&
        new URL(route.request().url()).searchParams.get("version") === "current"
      ) {
        failed = true;
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Fixture session read failure",
            request_id: "fixture-session",
          }),
        });
      } else await route.continue();
    },
  );
  await page.goto(
    f.base + `/app#workspace/${project.id}/review/${tasks[0].id}`,
  );
  await expect(
    page.locator(".numbered-snippet .hljs-keyword").first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Snippet version filter", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Current snippet", exact: true })
    .click();
  await expect(
    page.getByText("No feedback matches these filters.", { exact: false }),
  ).toBeVisible();
  expect(failed).toBe(true);
  expect(
    await page.locator(".numbered-snippet code").allTextContents(),
  ).toEqual(tasks[0].code.split("\n"));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await page
    .locator(".numbered-snippet")
    .screenshot({
      path: `${artifacts}/syntax-review-dark.png`,
      animations: "disabled",
    });
  await expect(
    page.getByText("Fixture session read failure", { exact: false }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
  console.log(
    "Rooms browser passed: task claim/state, pin/edit/history, semantic colors, exact syntax tokens, Current snippet transient recovery, both themes and four viewport sizes.",
  );
} finally {
  await browser?.close();
  await f.close();
}
