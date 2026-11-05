import { chromium, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { startTestServer } from "../tests/http-fixture.mjs";
const f = await startTestServer();
let browser;
const repository = "https://github.com/fixture/orbit",
  head = "a".repeat(40),
  base = "b".repeat(40);
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
    }),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const post = async (path, data) => {
    const r = await context.request.post(f.base + "/api" + path, { data });
    expect(r.ok(), await r.text()).toBeTruthy();
    return r.json();
  };
  await post("/register", {
    name: "github_browser_owner",
    username: "github_browser_owner",
    email: "github-browser@fixture.test",
    password: "Fixture-password123",
  });
  const community = await post("/communities", {
    name: "GitHub fixture team",
    description: "A private fixture audience for selected code.",
  });
  let denied = false;
  await page.route("**/api/github/**", async (route) => {
    const u = new URL(route.request().url()),
      path = u.pathname;
    if (
      denied &&
      path !== "/api/github/config" &&
      path !== "/api/github/status"
    )
      return route.fulfill({
        status: 404,
        json: { error: "GitHub resource is unavailable to your account." },
      });
    if (path === "/api/github/config")
      return route.fulfill({
        json: {
          configured: true,
          capabilities: { github_app: 1 },
          app_url: "https://github.com/apps/fixture-app",
        },
      });
    if (path === "/api/github/status")
      return route.fulfill({
        json: { connected: true, login: "fixture_owner" },
      });
    if (path === "/api/github/installations")
      return route.fulfill({
        json: {
          items: [{ id: 1, account: "fixture" }],
          page: 1,
          has_next: false,
        },
      });
    if (path === "/api/github/installations/1/repositories")
      return route.fulfill({
        json: {
          items: [{ id: 1, repository, name: "fixture/orbit", private: true }],
          page: 1,
          has_next: false,
        },
      });
    if (path === "/api/github/repository")
      return route.fulfill({
        json: {
          repository,
          name: "fixture/orbit",
          private: true,
          description: "Keep retries small, predictable and reviewable.",
          default_branch: "main",
          generation: 1,
        },
      });
    if (path === "/api/github/read") {
      const target = u.searchParams.get("path");
      let data;
      if (target === "/repos/fixture/orbit/pulls/1")
        data = {
          number: 1,
          title: "Stop retrying permanent failures",
          state: "open",
          body: "Inspect cancellation and HTTP 401.",
          head: { sha: head, ref: "retry", label: "fixture:retry" },
          base: {
            sha: base,
            ref: "main",
            label: "fixture:main",
            repo: { private: true },
          },
          changed_files: 1,
          user: { login: "fixture_owner" },
        };
      else if (target?.startsWith("/repos/fixture/orbit/pulls/1/files"))
        data = [
          {
            filename: "src/retry.ts",
            status: "modified",
            additions: 1,
            deletions: 1,
            patch:
              "@@ -1 +1 @@\n-const retries = Infinity;\n+const retries = 3;",
          },
        ];
      else if (target?.includes("/check-runs"))
        data = {
          check_runs: [{ id: 1, name: "Retry tests", conclusion: "success" }],
        };
      else if (target?.includes("/status"))
        data = { state: "success", statuses: [] };
      else if (target?.startsWith("/repos/fixture/orbit/issues"))
        data = [
          {
            id: 2,
            number: 2,
            title: "Document cancellation",
            state: "open",
            body: "Keep the shutdown contract clear.",
            user: { login: "fixture_owner" },
          },
        ];
      else
        data = [
          {
            id: 1,
            number: 1,
            title: "Stop retrying permanent failures",
            state: "open",
            user: { login: "fixture_owner" },
          },
        ];
      return route.fulfill({
        json: {
          data,
          private: true,
          has_next: false,
          checked_at: new Date().toISOString(),
        },
      });
    }
    await route.continue();
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(f.base + "/app#github");
  await expect(
    page.getByText("A little off the beaten path.", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Your repository. A shared next step." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "@fixture_owner" }),
  ).toHaveAttribute("href", "https://github.com/fixture_owner");
  await page
    .getByText("Choose from installed repositories", { exact: true })
    .click();
  await page.getByRole("button", { name: "fixture", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "fixture/orbit Private" }),
  ).toBeVisible();
  await expect(page.locator(".gh-pager")).toHaveCount(0);
  await page.getByRole("button", { name: "fixture", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "fixture/orbit Private" }),
  ).toBeVisible();
  mkdirSync(".test-data/github-app-browser", { recursive: true });
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
      const boxes = await page
        .locator(".gh-connection-actions > *")
        .evaluateAll((nodes) =>
          nodes.map((n) => {
            const r = n.getBoundingClientRect();
            return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
          }),
        );
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i],
            b = boxes[j];
          expect(
            a.right <= b.x ||
              b.right <= a.x ||
              a.bottom <= b.y ||
              b.bottom <= a.y,
          ).toBeTruthy();
        }
      await page.screenshot({
        path: `.test-data/github-app-browser/connection-${theme}-${width}.png`,
        fullPage: true,
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page
    .getByRole("textbox", { name: "GitHub repository URL" })
    .fill(repository);
  await page
    .getByRole("button", { name: "Open repository", exact: true })
    .click();
  await page.getByRole("button", { name: "Issues", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Document cancellation", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Pull requests", exact: true })
    .click();
  await page.getByRole("button", { name: "Inspect pull request" }).click();
  await page
    .getByRole("button", { name: "Load checks for this commit" })
    .click();
  await expect(page.getByText("Retry tests · success")).toBeVisible();
  await page
    .getByRole("button", { name: "src/retry.ts +1 −1 · modified" })
    .click();
  await expect(page.locator(".gh-diff")).toContainText("const retries = 3;");
  await page.getByRole("button", { name: "Prepare code review" }).click();
  const dialog = page.getByRole("dialog", { name: "Start a conversation" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('textarea[name="code"]')).toHaveAttribute(
    "readonly",
    "",
  );
  await dialog
    .locator('textarea[name="review_focus"]')
    .fill("Check cancellation and permanent failures.");
  await dialog
    .getByRole("button", { name: "Publish conversation", exact: true })
    .click();
  await expect(dialog).toContainText(
    "Choose a private community and confirm sharing",
  );
  await dialog.getByRole("button", { name: "Publication audience" }).click();
  await page
    .getByRole("option", { name: "Private community · GitHub fixture team" })
    .click();
  await dialog
    .getByRole("checkbox", { name: /I want to save this private code/ })
    .check();
  await dialog
    .getByRole("button", { name: "Publish conversation", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const r = await context.request.get(
    f.base + "/api/posts?limit=1&community=" + encodeURIComponent(community.id),
  );
  const rows = await r.json(),
    created = (rows.items || rows)[0];
  expect(created.community_id).toBe(community.id);
  const detail = await (
    await context.request.get(f.base + "/api/posts/" + created.id)
  ).json();
  expect(detail.code).toContain("const retries = 3;");
  expect(detail.github_context.commit).toBe(head);
  const guest = await (await fetch(f.base + "/api/posts/" + created.id)).status;
  expect(guest).toBe(404);
  await page.goto(f.base + "/app#github");
  await page
    .getByRole("textbox", { name: "GitHub repository URL" })
    .fill(repository);
  await page
    .getByRole("button", { name: "Open repository", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Inspect pull request" }),
  ).toBeVisible();
  mkdirSync(".test-data/github-app-browser", { recursive: true });
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `.test-data/github-app-browser/${width}.png`,
      fullPage: true,
    });
  }
  denied = true;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(
    page.getByText("GitHub resource is unavailable to your account.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  console.log(
    "GitHub App browser: repository/PR/issues/checks/diff, explicit private-code share with frozen provenance, guest denial, refresh denial and four widths passed (provider responses isolated).",
  );
} finally {
  await browser?.close();
  await f.close();
}
