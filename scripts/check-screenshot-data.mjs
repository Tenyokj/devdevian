// Non-destructive UI verification of the prepared local screenshot fixture.
import { chromium, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = "http://127.0.0.1:4174";
const output = ".test-data/screenshot-fixtures";
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    timezoneId: "Europe/Kyiv",
  });
  await context.addInitScript(() =>
    localStorage.setItem("devdevian-theme", "dark"),
  );
  const auth = await context.request.post(base + "/api/login", {
    data: { email: "author@devdevian.test", password: "Devdevian-Test-2026!" },
  });
  expect(auth.ok()).toBeTruthy();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const [name, route, selector, text] of [
    ["feed", "feed", ".post-card", "optimistic update"],
    ["conversation", "post/214", ".post-detail", "optimistic update"],
    ["code-review", "post/213", ".post-detail", "fetch helper"],
    [
      "community",
      "community/web-collective",
      ".community-hero",
      "Web Collective",
    ],
    ["projects", "projects", ".project-card", "Traceboard"],
    ["project-detail", "post/31", ".post-detail", "Orbit"],
    ["profile", "profile", ".profile-main", "Alex Morgan"],
    ["events", "events", ".event-card", "Frontend review room"],
  ]) {
    await page.goto(base + "/app#" + route);
    await expect(page.locator(selector).first()).toContainText(text);
    await page.locator("img").evaluateAll(async (images) => {
      images.forEach((img) => (img.loading = "eager"));
      await Promise.race([
        Promise.all(images.map((img) => img.decode().catch(() => {}))),
        new Promise((resolve) => setTimeout(resolve, 8000)),
      ]);
    });
    const broken = await page
      .locator("img")
      .evaluateAll((images) =>
        images.filter((img) => !img.naturalWidth).map((img) => img.src),
      );
    expect(broken).toEqual([]);
    if (name === "conversation")
      await expect(page.locator(".reply").first()).toContainText(
        "confirmed server state",
      );
    if (name === "community")
      await expect(page.locator(".post-card")).toHaveCount(4);
    if (name === "projects")
      await expect(page.locator(".project-card")).toHaveCount(3);
    if (name === "project-detail")
      await expect(page.locator(".project-team")).toContainText(
        "Product design",
      );
    await expect(
      page.getByText("Loading formatted content…", { exact: true }),
    ).toHaveCount(0);
    if (name === "conversation")
      await expect(page.locator(".post-detail pre")).toContainText("cache.set");
    if (name === "feed") {
      await page
        .locator(".feed-toolbar")
        .evaluate((e) => e.scrollIntoView({ block: "start" }));
      await page.evaluate(() => window.scrollBy(0, -110));
    }
    await page.waitForTimeout(250);
    await page.screenshot({
      path: output + "/" + name + ".png",
      animations: "disabled",
    });
  }
  expect(errors).toEqual([]);
  const anonymous = await browser.newContext();
  expect((await anonymous.request.get(base + "/api/posts/21")).status()).toBe(
    404,
  );
  await anonymous.close();
  console.log(
    "Screenshot fixture checked: 8 pages, media, accepted answer, team, private access.",
  );
} finally {
  await browser.close();
}
