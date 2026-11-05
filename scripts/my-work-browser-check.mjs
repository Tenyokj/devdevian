// Real browser and real server against disposable fixture data only.
import { chromium, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { startTestServer } from "../tests/http-fixture.mjs";
const f = await startTestServer();
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const owner = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    peer = await browser.newContext();
  const post = async (c, path, data) => {
    const r = await c.request.post(f.base + "/api" + path, { data });
    expect(r.ok(), await r.text()).toBeTruthy();
    return r.json();
  };
  for (const [c, n] of [
    [owner, "work_owner"],
    [peer, "work_peer"],
  ])
    await post(c, "/register", {
      name: n,
      username: n,
      email: n + "@fixture.test",
      password: "Fixture-password123",
    });
  const project = await post(owner, "/projects", {
    name: "Orbit next steps",
    description: "A shared working day.",
    topic: "web",
    stage: "Prototype",
    help: "Verify bounded retries.",
  });
  const task = await post(owner, "/posts", {
    kind: "question",
    topic: "web",
    title: "Verify bounded retries",
    body: "Check cancellation and permanent failures.",
  });
  expect(
    (
      await owner.request.put(
        `${f.base}/api/projects/${project.id}/work-requests/${task.id}`,
        { data: { state: "open", expected_version: 0 } },
      )
    ).status(),
  ).toBe(201);
  await post(peer, `/projects/${project.id}/room/tasks/${task.id}`, {
    action: "claim",
    expected_version: 1,
  });
  await post(peer, `/projects/${project.id}/contributions`, {
    post_id: task.id,
    body: "Cancellation is now bounded. Run the retry test.",
    expected_version: 0,
    operation_key: randomUUID(),
  });
  const review = await post(owner, "/posts", {
    kind: "review",
    topic: "web",
    title: "Review the cancellation guard",
    body: "Check the cancellation path.",
    code: "export const retry = () => false;",
    review_focus: "Check the guard.",
  });
  const flow = await (
    await owner.request.get(`${f.base}/api/posts/${review.id}/review-flow`)
  ).json();
  await post(owner, `/posts/${review.id}/review-flow`, {
    username: "work_peer",
    revision_id: flow.current_revision_id,
    expected_revision: flow.post_revision,
    message: "Please inspect cancellation.",
  });
  const page = await owner.newPage(),
    pp = await peer.newPage(),
    errors = [],
    requests = [];
  for (const p of [page, pp]) p.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.url().includes("/api/")) requests.push(r.url());
  });
  await page.goto(f.base + "/app#work");
  await expect(
    page.getByRole("heading", { name: "Pick up where it matters." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review result", exact: true }),
  ).toBeVisible();
  expect(requests.some((u) => u.includes("/github/"))).toBe(false);
  await page
    .getByRole("button", { name: "Review result", exact: true })
    .click();
  await expect(
    page.getByText("Cancellation is now bounded. Run the retry test.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Close dialog", exact: true })
    .first()
    .click();
  await pp.goto(f.base + "/app#work");
  await pp
    .getByRole("button", { name: "Review invitation", exact: true })
    .click();
  await pp.getByRole("button", { name: "Accept review", exact: true }).click();
  await pp.getByRole("button", { name: "Preview change", exact: true }).click();
  await pp.getByRole("button", { name: "Confirm change", exact: true }).click();
  await expect(pp.getByText("In review", { exact: true })).toBeVisible();
  await pp.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(
    pp.getByRole("button", { name: "Finish review", exact: true }),
  ).toBeVisible();
  await pp.goto(f.base + "/app#work/tasks");
  await expect(pp.locator(".work-card h3")).toHaveText(
    "Verify bounded retries",
  );
  await pp.getByRole("button", { name: "Open task", exact: true }).click();
  await expect(pp).toHaveURL(/#post\//);
  await expect(
    pp
      .getByRole("heading", { name: "Verify bounded retries", exact: true })
      .first(),
  ).toBeVisible();
  await expect
    .poll(() =>
      pp.evaluate(() => localStorage.getItem("devdevian-recent:v1:2")),
    )
    .not.toBeNull();
  await pp.goto(f.base + "/app#work/continue");
  await expect(
    pp.getByRole("button", { name: "Continue reading", exact: true }),
  ).toBeVisible();
  await pp.evaluate(() =>
    localStorage.setItem(
      "devdevian-draft:v1:2:public",
      JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        data: {
          title: "Unfinished local thought",
          body: "Local only",
          kind: "discussion",
          topic: "web",
        },
      }),
    ),
  );
  await pp.reload();
  await expect(
    pp.getByRole("button", { name: "Resume draft", exact: true }),
  ).toBeVisible();
  await pp.getByRole("button", { name: "Resume draft", exact: true }).click();
  await expect(pp.getByRole("textbox", { name: /title/i })).toHaveValue(
    "Unfinished local thought",
  );
  await pp.keyboard.press("Escape");
  await page.route("**/api/projects/*/room/tasks/*/github", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "GitHub is temporarily unavailable." }),
    }),
  );
  await page.getByRole("button", { name: "PR & checks", exact: true }).click();
  await expect(
    page.getByText("GitHub is temporarily unavailable.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Review result", exact: true }),
  ).toBeVisible();
  mkdirSync(".test-data/my-work-browser", { recursive: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const theme of ["dark", "light"]) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, theme);
    for (const width of [390, 768, 1024, 1512]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(page.locator(".work-card").first()).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 2,
        ),
      ).toBeTruthy();
      await page.screenshot({
        path: `.test-data/my-work-browser/${theme}-${width}.png`,
        fullPage: true,
      });
    }
  }
  expect(errors).toEqual([]);
  console.log(
    "My work: real result target, assigned task, local resume/recent, lazy GitHub, 4 widths × 2 themes passed.",
  );
} finally {
  await browser?.close();
  await f.close();
}
