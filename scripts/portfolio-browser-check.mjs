import { chromium, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { startTestServer } from "../tests/http-fixture.mjs";
import { seedInsights } from "../tests/insights-fixture.mjs";
const f = await startTestServer();
let browser;
try {
  const s = await seedInsights(f);
  await s.a(`/projects/${s.publicProject}/devlogs`, {
    title: "A clearer retry boundary",
    body: "We simplified retries and verified cancellation before publishing.",
    status: "published",
    operation_key: "portfolio-browser-published",
  });
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
    }),
    page = await ctx.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const login = await ctx.request.post(f.base + "/api/login", {
    data: {
      email: "insightauthor@insights.test",
      password: "Fixture-password123",
    },
  });
  expect(login.ok(), await login.text()).toBeTruthy();
  await page.goto(f.base + "/app#profile");
  await expect(
    page.getByRole("heading", { name: "Work with a story." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Curate featured work", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Project Public Project", exact: true })
    .check();
  await page
    .getByRole("checkbox", {
      name: "Conversation An older conversation",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Save featured work (2/6)", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Featured work updated" }),
  ).toBeVisible();
  await expect(page.locator(".portfolio-card")).toHaveCount(2);
  await page.reload();
  await expect(page.locator(".portfolio-card")).toHaveCount(2);
  mkdirSync(".test-data/portfolio-browser", { recursive: true });
  await page.waitForTimeout(400);
  await page.screenshot({
    path: ".test-data/portfolio-browser/desktop.png",
    fullPage: false,
  });
  await page
    .getByRole("button", { name: "Contributions", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Results accepted by a project." }),
  ).toBeVisible();
  await expect(page.locator(".portfolio-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Reviews", exact: true }).click();
  await expect(page.getByText("Line feedback", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Devlogs", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A clearer retry boundary" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(page.locator(".portfolio-card")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Switch to dark theme", exact: true })
    .click();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: ".test-data/portfolio-browser/dark.png",
    fullPage: false,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: ".test-data/portfolio-browser/mobile.png",
    fullPage: true,
  });
  const guest = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
    }),
    visitor = await guest.newPage();
  await visitor.goto(f.base + "/app#member/" + s.id);
  await expect(visitor.locator(".portfolio-card")).toHaveCount(2);
  await expect(
    visitor.getByRole("button", { name: "Curate featured work", exact: true }),
  ).toHaveCount(0);
  expect(await visitor.locator(".portfolio").innerText()).not.toContain(
    "Secret",
  );
  expect(errors).toEqual([]);
  console.log(
    "Portfolio browser: curate/save/reload, public visitor, contributions/reviews/Devlogs, mobile no overflow; 0 JS errors.",
  );
} finally {
  await browser?.close();
  await f.close();
}
