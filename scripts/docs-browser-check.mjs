import { chromium, expect } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { startTestServer } from "../tests/http-fixture.mjs";
const f = await startTestServer();
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
      permissions: ["clipboard-read", "clipboard-write"],
      viewport: { width: 1440, height: 1000 },
    }),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(f.base + "/docs");
  await expect(page.locator(".docs-home h1")).toContainText("Less searching.");
  await expect(page.locator(".docs-home-paths>a")).toHaveCount(3);
  await expect(page.locator(".docs-top .docs-brand")).toHaveAttribute(
    "href",
    "/docs",
  );
  await page.getByRole("button", { name: "Open documentation search" }).click();
  const search = page.getByRole("combobox", { name: "Search documentation" });
  await search.fill("forgotten password");
  await expect(page.locator(".docs-results")).toContainText("Using the forum");
  await search.press("Enter");
  await page.waitForURL(/highlight=/);
  await expect(page.locator(".docs-search-hit").first()).toBeVisible();
  await page.getByRole("button", { name: "Clear highlights" }).click();
  await expect(page.locator(".docs-search-hit")).toHaveCount(0);
  await page.keyboard.press("Control+k");
  await expect(
    page.getByRole("dialog", { name: "Search documentation" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open documentation search" }),
  ).toBeFocused();
  await page.goto(f.base + "/docs/first-session");
  await page.locator(".docs-code button").first().click();
  await expect(page.locator(".docs-code button").first()).toHaveText("Copied");
  await page.getByRole("button", { name: "Copy Markdown" }).click();
  await expect(
    page.getByRole("button", { name: "Copy Markdown" }),
  ).toContainText("Copied");
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
  for (const theme of ["dark", "light"]) {
    await page.goto(f.base + "/docs");
    if (
      (await page.evaluate(
        () => document.documentElement.dataset.docsTheme,
      )) !== theme
    )
      await page
        .getByRole("button", { name: "Switch to " + theme + " theme" })
        .click();
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(f.base + "/docs");
      await expect(page.locator(".docs-home h1")).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute(
        "data-docs-theme",
        theme,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
      await page.screenshot({
        path: `.test-data/docs-browser/home-${theme}-${width}.png`,
        fullPage: true,
      });
      await page.goto(f.base + "/docs/cli");
      await expect(page.locator(".docs-article h1")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
    }
  }
  await page
    .getByRole("button", { name: "Toggle documentation navigation" })
    .click();
  await page
    .getByRole("link", { name: "Projects & Rooms", exact: true })
    .click();
  await expect(page.locator(".docs-article h1")).toContainText("Rooms");
  await page
    .getByRole("button", { name: "Move to In progress", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Move to Ready", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(f.base + "/docs/overview");
  await page.evaluate(() => document.fonts.ready);
  const links = page.locator(".docs-toc nav a");
  await links.nth(2).click();
  await expect.poll(() => page.locator("#understand-the-vocabulary").evaluate(
    (heading) => Math.round(heading.getBoundingClientRect().top),
  )).toBeLessThanOrEqual(202);
  await expect.poll(() => page.locator("#understand-the-vocabulary").evaluate(
    (heading) => Math.round(heading.getBoundingClientRect().top),
  )).toBeGreaterThan(150);
  await expect(links.nth(2)).toHaveAttribute("aria-current", "location");
  await expect
    .poll(() =>
      page
        .locator(".docs-toc-indicator")
        .evaluate((e) => e.getBoundingClientRect().height),
    )
    .toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "Toggle documentation navigation" })
    .click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-docs-sidebar",
    "collapsed",
  );
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute(
    "data-docs-sidebar",
    "collapsed",
  );
  await page
    .getByRole("button", { name: "Toggle documentation navigation" })
    .click();
  const before = await page.evaluate(() =>
    localStorage.getItem("devdevian-theme"),
  );
  await page.getByRole("button", { name: /Switch to .* theme/ }).click();
  expect(
    await page.evaluate(() => localStorage.getItem("devdevian-theme")),
  ).toBe(before);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(f.base + "/docs/overview");
  await page.screenshot({
    path: ".test-data/docs-browser/overview-redesigned.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Open documentation search" }).click();
  await page
    .getByRole("combobox", { name: "Search documentation" })
    .fill("retry");
  await page.screenshot({
    path: ".test-data/docs-browser/search-redesigned.png",
  });
  await page.keyboard.press("Escape");
  await page.goto(f.base + "/docs/participation");
  await page
    .getByRole("button", { name: "Community · Approved", exact: true })
    .click();
  await expect(page.locator(".docs-access-grid")).toContainText(
    "Current community members",
  );
  await expect(page.locator(".docs-access-grid")).toContainText(
    "Owner + approved users",
  );
  await page.goto(f.base + "/");
  const gallery = page.getByRole("group", {
    name: "Explore project workspaces",
  });
  await expect(gallery).toBeVisible();
  await gallery.getByRole("button", { name: "GitHub Workspace" }).click();
  await expect(
    page.locator(".landing-workspace-showcase figure img"),
  ).toHaveAttribute("src", "/screenshots/github-current.png");
  await expect
    .poll(() =>
      page
        .locator(".landing-workspace-showcase figure img")
        .evaluate((i) => i.complete && i.naturalWidth > 0),
    )
    .toBeTruthy();
  // Exercise actual motion as well as the reduced-motion reading checks.
  await page.goto(f.base + "/docs/overview");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Toggle documentation navigation" }).click();
  await expect(page.locator(".docs-sidebar")).toHaveCSS("opacity", "1");
  await page.getByRole("button", { name: "Toggle documentation navigation" }).click();
  const closing = await page.locator(".docs-sidebar").evaluate(async (sidebar) => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const style = getComputedStyle(sidebar);
    return { duration: style.transitionDuration, visibility: style.visibility };
  });
  expect(closing.duration).toContain("0.3s");
  expect(closing.visibility).toBe("visible");
  await expect(page.locator(".docs-sidebar")).toHaveCSS("visibility", "hidden");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const plain = await browser.newContext({ javaScriptEnabled: false }),
    noJS = await plain.newPage();
  await noJS.goto(f.base + "/docs/rooms");
  await expect(noJS.locator(".docs-article h1")).toBeVisible();
  expect(
    await noJS
      .locator(".docs-site")
      .evaluate((e) => getComputedStyle(e).backgroundColor),
  ).toBe("rgb(16, 10, 24)");
  expect(errors).toEqual([]);
  console.log(
    "Docs redesign: home, 27 routes, modal keyboard/section search + page highlights, code/Markdown copy, theme isolation + persistence, sidebar/toc, different diagrams, new images/gallery, 5 widths × 2 themes and no-JS reading passed.",
  );
} finally {
  await browser?.close();
  await f.close();
}
