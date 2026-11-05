import { chromium, expect } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { startTestServer } from "../tests/http-fixture.mjs";
const f = await startTestServer();
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
      permissions: ["clipboard-read", "clipboard-write"],
    }),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(f.base + "/docs");
  await expect(
    page.getByRole("heading", { level: 1, name: "Build in good company" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Search documentation" })
    .fill("forgotten password");
  await expect(page.locator(".docs-results")).toContainText("Using the forum");
  await page.keyboard.press("Escape");
  await expect(page.locator(".docs-results")).toHaveCount(0);
  await page.goto(f.base + "/docs/first-session");
  await expect(page.locator(".docs-code").first()).toBeVisible();
  await page.locator(".docs-code button").first().click();
  await expect(page.locator(".docs-code button").first()).toHaveText("Copied");
  const user = await context.request.post(f.base + "/api/register", {
    data: {
      name: "Orbit Builder",
      username: "orbit_builder",
      email: "orbit@fixture.test",
      password: "Fixture-password123",
    },
  });
  expect(user.ok()).toBeTruthy();
  const uid = (await user.json()).user.id;
  const image = await context.request.post(f.base + "/api/uploads", {
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Filename": "avatar.png",
    },
    data: readFileSync("public/devdevian-logo.png"),
  });
  expect(image.ok()).toBeTruthy();
  const uploaded = await image.json();
  const details = await context.request.put(
    f.base + `/api/details/user/${uid}`,
    { data: { avatar: uploaded.id } },
  );
  expect(details.ok(), await details.text()).toBeTruthy();
  const result = await context.request.post(f.base + "/api/projects", {
    data: {
      name: "Orbit Docs",
      description: "A project for useful guides and readable code.",
      topic: "web",
      stage: "Prototype",
      help: "Review the developer experience.",
    },
  });
  expect(result.ok()).toBeTruthy();
  const project = await result.json();
  await page.goto(f.base + `/app#workspace/${project.id}`);
  await expect(
    page.getByRole("region", { name: "Project contributors" }),
  ).toBeVisible();
  await expect(page.locator(".contributor-grid img")).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".contributor-grid img")
        .evaluate((i) => i.complete && i.naturalWidth > 0),
    )
    .toBeTruthy();
  await page.goto(f.base + "/app#projects");
  await expect(
    page.locator(".project-footer .avatar img").first(),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".project-footer .avatar img")
        .first()
        .evaluate((i) => i.complete && i.naturalWidth > 0),
    )
    .toBeTruthy();
  mkdirSync(".test-data/docs-browser", { recursive: true });
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(f.base + "/docs");
    await expect(page.locator(".docs-article h1")).toBeVisible();
    expect(
      await page.evaluate(() => ({
        ok: document.documentElement.scrollWidth <= innerWidth,
        bad: [...document.querySelectorAll("body *")]
          .filter((e) => e.getBoundingClientRect().right > innerWidth + 1)
          .slice(0, 8)
          .map((e) => ({
            tag: e.tagName,
            cls: e.className,
            width: e.getBoundingClientRect().width,
          })),
      })),
    ).toMatchObject({ ok: true });
    await page.screenshot({
      path: `.test-data/docs-browser/overview-${width}.png`,
      fullPage: true,
    });
    await page.goto(f.base + "/docs/cli");
    await expect(page.locator(".docs-article h1")).toBeVisible();
    expect(
      await page.evaluate(() => ({
        ok: document.documentElement.scrollWidth <= innerWidth,
        bad: [...document.querySelectorAll("body *")]
          .filter((e) => e.getBoundingClientRect().right > innerWidth + 1)
          .slice(0, 8)
          .map((e) => ({
            tag: e.tagName,
            cls: e.className,
            width: e.getBoundingClientRect().width,
          })),
      })),
    ).toMatchObject({ ok: true });
  }
  await page
    .getByRole("button", { name: "Toggle documentation navigation" })
    .click();
  await page
    .getByRole("link", { name: "Projects & Rooms", exact: true })
    .click();
  await expect(page.locator(".docs-article h1")).toContainText("Rooms");
  expect(errors).toEqual([]);
  console.log(
    "Docs search/copy/navigation/SSR hydration, 4 responsive widths and real project avatars passed.",
  );
} finally {
  await browser?.close();
  await f.close();
}
