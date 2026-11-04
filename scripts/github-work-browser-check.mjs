import { chromium, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { startTestServer } from "../tests/http-fixture.mjs";
const f = await startTestServer({
  serverEntry: "tests/github-work-provider.mjs",
});
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const c = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    page = await c.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const post = async (path, data) => {
    const r = await c.request.post(f.base + "/api" + path, { data });
    expect(r.ok(), await r.text()).toBeTruthy();
    return r.json();
  };
  await post("/register", {
    name: "work_browser",
    username: "work_browser",
    email: "work@fixture.test",
    password: "Fixture-password123",
  });
  const community = await post("/communities", {
    name: "GitHub room team",
    description: "Private fixture work.",
  });
  const project = await post("/projects", {
    name: "GitHub Orbit",
    description: "Shared work from GitHub issues.",
    topic: "web",
    stage: "Prototype",
    help: "Bound retries.",
    repo: "https://github.com/example/repo",
    community_id: community.id,
  });
  const auth = await post("/github/connect", {});
  const state = new URL(auth.url).searchParams.get("state");
  const cb = await c.request.get(
    f.base +
      "/api/github/callback?" +
      new URLSearchParams({ state, code: "fixture" }),
    { maxRedirects: 0 },
  );
  expect(cb.status()).toBe(302);
  await page.goto(f.base + `/app#workspace/${project.id}/room`);
  await page
    .getByRole("button", { name: "Import GitHub issue", exact: true })
    .click();
  await page
    .getByLabel("Issue URL", { exact: true })
    .fill("https://github.com/example/repo/issues/4");
  await page
    .getByRole("button", { name: "Preview from GitHub", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "#4 · Bound the retry loop" }),
  ).toBeVisible();
  const save = page.getByRole("button", {
    name: "Import as room task",
    exact: true,
  });
  await expect(save).toBeDisabled();
  await page.getByRole("checkbox", { name: /I understand/ }).check();
  await save.click();
  await expect(
    page.locator(".room-task-title", { hasText: "Bound the retry loop" }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.pwned)).toBeUndefined();
  await page
    .getByRole("button", { name: "GitHub context", exact: true })
    .click();
  await expect(page.getByText("IMPORTED ISSUE · SAVED COPY")).toBeVisible();
  await page
    .getByRole("button", { name: "Link pull request", exact: true })
    .click();
  await page
    .getByLabel("Pull request URL", { exact: true })
    .fill("https://github.com/example/repo/pull/5");
  await page
    .getByRole("button", { name: "Preview from GitHub", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "#5 · Fix the retry deadline" }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: /I understand/ }).check();
  await page
    .getByRole("button", { name: "Confirm PR link", exact: true })
    .click();
  await expect(
    page.getByText("tests · success", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Link history", exact: true }).click();
  await expect(page.getByText(/v1 ·/)).toBeVisible();
  mkdirSync(".test-data/github-work-browser", { recursive: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const theme of ["dark", "light"]) {
    await page.evaluate(
      (t) => (document.documentElement.dataset.theme = t),
      theme,
    );
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBeTruthy();
      await page.screenshot({
        path: `.test-data/github-work-browser/${theme}-${width}.png`,
        fullPage: true,
      });
    }
  }
  expect(errors).toEqual([]);
  console.log(
    "Real Devdevian GitHub task import → private consent → board → linked PR/checks/history passed; provider isolated; dark/light four widths, no script execution or page errors.",
  );
} finally {
  await browser?.close();
  await f.close();
}
