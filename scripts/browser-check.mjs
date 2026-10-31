import { readFileSync } from "node:fs";
const appVersion = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url)),
).version;
import { DatabaseSync } from "node:sqlite";
import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
const probe = createServer();
await new Promise((r) => probe.listen(0, "127.0.0.1", r));
const port = probe.address().port;
await new Promise((r) => probe.close(r));
const directory = mkdtempSync(join(tmpdir(), "devdevian-browser-")),
  artifacts = ".test-data/browser";
mkdirSync(artifacts, { recursive: true });
const server = spawn(process.execPath, ["server.mjs"], {
  env: {
    ...process.env,
    TURSO_DATABASE_URL: "",
    TURSO_AUTH_TOKEN: "",
    UPLOAD_DRIVER: "local",
    VERCEL: "",
    NODE_ENV: "test",
    DEMO_MODE: "1",
    AUTH_TEST_UNVERIFIED: "1",
    PORT: String(port),
    DB_PATH: join(directory, "app.sqlite"),
    MODERATOR_EMAILS: "reviewer@browser.test",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
await new Promise((resolve, reject) => {
  const timer = setTimeout(
    () => reject(Error("Server startup failed: " + output)),
    10000,
  );
  server.stdout.on("data", (c) => {
    output += c;
    if (output.includes("Devdevian is ready")) {
      clearTimeout(timer);
      resolve();
    }
  });
  server.stderr.on("data", (c) => (output += c));
  server.on("exit", () => {
    clearTimeout(timer);
    reject(Error(output));
  });
});
let browser;
const errors = [];
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      timezoneId: "Europe/Kyiv",
    }),
    page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /hydration|Minified React error #(?:418|423|425)/i.test(message.text())
    )
      errors.push(message.text());
  });
  const base = `http://127.0.0.1:${port}`;
  const second = await browser.newContext();
  const registered = await second.request.post(base + "/api/register", {
    data: {
      name: "Riley Reviewer",
      email: "reviewer@browser.test",
      password: "Browser-test-password123",
    },
  });
  expect(registered.ok()).toBeTruthy();
  // OAuth collisions resume in a code form, without sending visitors to Settings.
  await page.route("**/api/auth/link/pending", (route) =>
    route.fulfill({ json: { email: "r***@browser.test", provider: "github" } }),
  );
  await page.route("**/api/auth/link/verify", (route) => {
    expect(route.request().postDataJSON().code).toBe("123456");
    return route.fulfill({
      status: 400,
      json: { error: "Incorrect verification code." },
    });
  });
  await page.goto(base + "/app?auth_link=1#feed");
  await expect(
    page.getByRole("heading", { name: "Confirm it’s you." }),
  ).toBeVisible();
  await expect(page.locator(".auth-modal input[type=password]")).toHaveCount(0);
  await expect(page.locator(".auth-modal")).toContainText(
    "existing account and connect GitHub",
  );
  await page.getByLabel("Verification code", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Confirm & sign in" }).click();
  await expect(page.locator(".auth-modal")).toContainText(
    "Incorrect verification code.",
  );
  await page.getByRole("button", { name: "Start again", exact: true }).click();
  await expect(page.locator(".auth-modal input[type=password]")).toBeVisible();
  await page.unroute("**/api/auth/link/pending");
  await page.unroute("**/api/auth/link/verify");
  const rawLanding = await context.request.get(base + "/");
  expect(rawLanding.ok()).toBeTruthy();
  expect(await rawLanding.text()).toContain('data-prerender="/"');
  const robotsResponse = await context.request.get(base + "/robots.txt");
  expect(robotsResponse.ok()).toBeTruthy();
  expect(await robotsResponse.text()).toContain("/sitemap.xml");
  const sitemapResponse = await context.request.get(base + "/sitemap.xml");
  expect(sitemapResponse.ok()).toBeTruthy();
  expect(await sitemapResponse.text()).toContain("/sitemaps/pages.xml</loc>");
  expect(
    await (await context.request.get(base + "/sitemaps/pages.xml")).text(),
  ).toContain("/privacy</loc>");
  const appShell = await context.request.get(base + "/app");
  expect(appShell.headers()["x-robots-tag"]).toBe("noindex, follow");
  expect((await context.request.get(base + "/does-not-exist")).status()).toBe(
    404,
  );
  const staticContext = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await staticContext.newPage();
  await staticPage.goto(base + "/");
  await expect(staticPage.locator(".landing-intro h1")).toBeVisible();
  await staticPage.goto(base + "/privacy");
  await expect(
    staticPage.getByRole("heading", { level: 1, name: "Privacy & Security" }),
  ).toBeVisible();
  await expect(staticPage.locator(".policy-content")).toContainText(
    "What we collect and why",
  );
  for (const path of ["faq", "updates"]) {
    await staticPage.goto(base + "/" + path);
    await expect(staticPage.locator("main h1")).toBeVisible();
    await expect(staticPage.locator(".public-toolbar:visible")).toHaveCount(0);
  }
  await staticPage.goto(base + "/faq");
  await staticPage.locator("#accepted-answer summary").click();
  await expect(
    staticPage.locator("#accepted-answer .faq-answer"),
  ).toBeVisible();
  await expect(staticPage.locator("#accepted-answer")).toContainText(
    "real product feature",
  );
  await staticContext.close();
  // Public guides must hydrate without losing deep links or native disclosure access.
  await page.goto(base + "/faq#accepted-answer");
  await expect(page.locator("#accepted-answer")).toHaveAttribute("open", "");
  await page.locator("#accepted-answer summary").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#accepted-answer")).not.toHaveAttribute(
    "open",
    "",
  );
  await page.keyboard.press("Space");
  await expect(page.locator("#accepted-answer .faq-answer")).toBeVisible();
  const faqSearch = page.getByRole("searchbox", {
    name: "Search questions and answers",
  });
  await faqSearch.fill("accepted answer");
  await expect(page.locator(".expanded-faq details:visible")).toHaveCount(1);
  await faqSearch.fill("no-such-question-987654");
  await expect(
    page.getByRole("heading", { name: "No matching questions yet." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.locator(".expanded-faq details:visible")).toHaveCount(24);
  await page.getByRole("button", { name: "CLI & GitHub", exact: true }).click();
  await expect(page.locator(".expanded-faq details:visible")).toHaveCount(6);
  await page.goto(base + "/updates");
  await page.getByRole("button", { name: "CLI", exact: true }).click();
  await expect(page.locator(".update-card:visible")).toHaveCount(9);
  await expect(page.locator(".update-card:visible").first()).toContainText(
    "0.12.0-alpha.1",
  );
  await page.getByRole("button", { name: "Browser", exact: true }).click();
  await expect(page.locator(".update-card:visible")).toHaveCount(7);
  await page.getByRole("button", { name: "All updates" }).click();
  await expect(page.locator(".update-card:visible")).toHaveCount(16);
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["faq", "updates"]) {
      await page.goto(base + "/" + path);
      await expect(page.locator("main h1")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
      await page.screenshot({
        path: `${artifacts}/${path}-${width}.png`,
        fullPage: true,
      });
    }
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(base + "/faq#private-content");
  await expect(page.locator("#private-content .faq-answer")).toBeVisible();
  await page.locator("#private-content summary").click();
  await expect(page.locator("#private-content")).not.toHaveAttribute(
    "open",
    "",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Verify both public entry points and responsive landing layouts.
  await page.goto(base);
  await expect(page.locator(".landing-hero .hero-logo")).toBeVisible();
  await expect(page.locator(".landing-faq details")).toHaveCount(7);
  await page.locator(".landing-screenshot img").evaluateAll(async (images) => {
    images.forEach((img) => (img.loading = "eager"));
    await Promise.all(images.map((img) => img.decode()));
  });
  await expect(page.locator(".landing-screenshot img")).toHaveCount(4);
  await expect(page.locator(".screenshot-placeholder")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Switch to .* theme/ }),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Code reviews", exact: true }).click();
  await expect(page.locator("#conversation-example")).toContainText(
    "error handling",
  );
  await page
    .getByRole("tab", { name: "Code reviews", exact: true })
    .press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Show & tell", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "From the command line", exact: true })
    .click();
  await expect(page.locator(".landing-code-card pre")).toContainText(
    "devdevian",
  );
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: base,
  });
  await page
    .getByRole("button", { name: "Copy review command", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Copy review command", exact: true }),
  ).toContainText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "devdevian review create",
  );
  await page
    .getByRole("button", { name: "Live workspace", exact: true })
    .click();
  await expect(page.locator(".cli-review-card>img")).toBeVisible();
  await page
    .getByRole("tab", { name: "Human code review", exact: true })
    .click();
  await expect(page.locator(".cli-preview img")).toHaveAttribute(
    "src",
    "/screenshots/cli-review.png",
  );
  await page
    .getByRole("tab", { name: "Human code review", exact: true })
    .press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Make it yours", exact: true }),
  ).toBeFocused();
  await expect(page.locator(".cli-preview img")).toHaveAttribute(
    "src",
    "/screenshots/cli-appearance.png",
  );
  await page.locator(".cli-preview img").evaluate(async (image) => {
    if (!image.complete)
      await new Promise((r) =>
        image.addEventListener("load", r, { once: true }),
      );
    if (!image.naturalWidth) throw Error("Missing CLI capture");
  });
  let activityCount = 12;
  await page.route("**/api/public-stats", (route) =>
    route.fulfill({
      json: {
        conversations: activityCount,
        updated_at: new Date().toISOString(),
      },
    }),
  );
  await page.locator(".landing-activity").scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("status", { name: "12 public conversations", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".landing-activity")).toHaveAttribute(
    "data-effects-running",
    "true",
  );
  await page.getByRole("button", { name: "Pause counter effects" }).click();
  await expect(page.locator(".activity-orbit").first()).toHaveCSS(
    "animation-play-state",
    "paused",
  );
  await page.getByRole("button", { name: "Resume counter effects" }).click();
  await expect(page.locator(".activity-orbit").first()).toHaveCSS(
    "animation-play-state",
    "running",
  );
  await page.evaluate(() => document.fonts.load('900 160px "Doto"'));
  expect(
    await page.evaluate(() => document.fonts.check('900 160px "Doto"')),
  ).toBeTruthy();
  expect(
    await page
      .locator(".landing-hero")
      .evaluate((e) => e.closest(".landing-world") === null),
  ).toBeTruthy();
  activityCount = 13;
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(
    page.getByRole("status", { name: "13 public conversations", exact: true }),
  ).toBeVisible();
  await page.locator(".faq-list summary").first().click();
  await expect(page.locator(".landing-activity")).toHaveAttribute(
    "data-effects-running",
    "false",
  );
  await expect(page.locator(".faq-list details").first()).toHaveAttribute(
    "open",
    "",
  );
  await page.locator(".faq-list summary").first().click();
  await expect(page.locator(".faq-list details").first()).not.toHaveAttribute(
    "open",
    "",
  );
  await page.locator(".faq-list summary").first().press("Enter");
  await expect(page.locator(".faq-list details").first()).toHaveAttribute(
    "open",
    "",
  );
  const track = page.locator(".stack-track");
  await page.locator(".stack-ribbon").scrollIntoViewIfNeeded();
  await expect(page.locator(".stack-group").first().locator("a")).toHaveCount(
    11,
  );
  await expect(
    page
      .locator(".stack-group")
      .first()
      .getByRole("link", { name: /npm CLI distribution/ }),
  ).toHaveAttribute(
    "href",
    "https://www.npmjs.com/package/@tenyokjs/devdevian-cli",
  );
  expect(
    await page
      .locator(".stack-ribbon")
      .evaluate((e) =>
        e.previousElementSibling.classList.contains("landing-projects"),
      ),
  ).toBeTruthy();
  await page.locator(".stack-window").hover();
  await expect
    .poll(() => track.evaluate((e) => e.getAnimations()[0]?.playbackRate))
    .toBeLessThan(0.2);
  await page.locator(".stack-ribbon").screenshot({
    path: artifacts + "/technology-ribbon.png",
    animations: "allow",
  });
  await page.getByRole("button", { name: "Pause motion", exact: true }).click();
  await expect
    .poll(() => track.evaluate((e) => e.getAnimations()[0]?.playbackRate))
    .toBe(0);
  await page
    .getByRole("button", { name: "Resume motion", exact: true })
    .click();
  await page.locator(".landing-brand").first().focus();
  await page.mouse.move(10, 10);
  await expect
    .poll(() => track.evaluate((e) => e.getAnimations()[0]?.playbackRate))
    .toBeGreaterThan(0.9);
  await page.locator(".stack-group img").evaluateAll(async (images) => {
    await Promise.all(images.map((img) => img.decode()));
  });
  const footerDirectory = page.getByRole("navigation", {
    name: "Footer navigation",
    exact: true,
  });
  await expect(footerDirectory.getByRole("link")).toHaveCount(13);
  await expect(
    footerDirectory.getByRole("link", {
      name: "CLI documentation",
      exact: true,
    }),
  ).toHaveAttribute(
    "href",
    "https://github.com/Tenyokj/devdevian/blob/main/packages/cli/README.md",
  );
  await expect(
    footerDirectory.getByRole("link", {
      name: "Privacy & Security",
      exact: true,
    }),
  ).toHaveAttribute("href", "/privacy");
  await footerDirectory.getByRole("link").first().focus();
  await page.keyboard.press("Tab");
  await expect(
    footerDirectory.getByRole("link", { name: "Communities", exact: true }),
  ).toBeFocused();
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["tablet", 834, 1112],
    ["mobile", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    // Reveal each section as a visitor would before recording the full page.
    await page.evaluate(async () => {
      for (const section of document.querySelectorAll("[data-reveal]")) {
        section.scrollIntoView({ behavior: "instant" });
        await new Promise((resolve) => setTimeout(resolve, 70));
      }
      window.scrollTo({ top: 0, behavior: "instant" });
    });
    await page.waitForTimeout(800);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.locator(".landing-hero").screenshot({
      path: artifacts + "/hero-" + name + ".png",
      animations: "disabled",
    });
    await footerDirectory.screenshot({
      path: artifacts + "/footer-directory-" + name + ".png",
      animations: "disabled",
    });
    const directoryBox = await footerDirectory.boundingBox();
    expect(directoryBox.width).toBeLessThanOrEqual(width);
    await expect(footerDirectory.getByRole("link").last()).toBeVisible();
    await page.screenshot({
      path: artifacts + "/landing-" + name + ".png",
      fullPage: true,
      animations: "disabled",
    });
  }
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["tablet", 834, 1112],
    ["mobile", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.locator(".landing-activity").scrollIntoViewIfNeeded();
    await page.evaluate(() => document.fonts.ready);
    await page.locator(".landing-activity").screenshot({
      path: artifacts + "/activity-" + name + ".png",
      animations: "disabled",
    });
    const offset = await page.locator(".activity-number").evaluate((e) => {
      const number = e.getBoundingClientRect(),
        section = e.closest("section").getBoundingClientRect();
      return Math.abs(
        number.left + number.width / 2 - (section.left + section.width / 2),
      );
    });
    expect(offset).toBeLessThan(2);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  }
  activityCount = Number.MAX_SAFE_INTEGER;
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(
    page.getByRole("status", {
      name: "9,007,199,254,740,991 public conversations",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page
      .locator(".activity-number > span")
      .evaluate(
        (e) =>
          e.getBoundingClientRect().width <=
          e.closest("section").getBoundingClientRect().width,
      ),
  ).toBeTruthy();
  activityCount = 13;
  await page.goto(base + "/#faq");
  await expect(page.locator(".landing-faq")).toBeVisible();
  const reduced = await context.newPage();
  await reduced.emulateMedia({ reducedMotion: "reduce" });
  await reduced.bringToFront();
  await reduced.route("**/api/public-stats", (route) =>
    route.fulfill({
      json: { conversations: 13, updated_at: new Date().toISOString() },
    }),
  );
  await reduced.goto(base);
  expect(
    await reduced
      .locator(".hero-logo-stage")
      .evaluate((e) => getComputedStyle(e).animationName),
  ).toBe("none");
  await expect(reduced.locator(".landing-intro")).toHaveCSS("opacity", "1");
  await expect(reduced.locator(".stack-ribbon")).toHaveClass(/is-static/);
  expect(
    await reduced
      .locator(".stack-track")
      .evaluate((e) => e.getAnimations().length),
  ).toBe(0);
  await reduced.locator(".landing-activity").scrollIntoViewIfNeeded();
  await expect(reduced.locator(".activity-reel").first()).toHaveCSS(
    "transition-duration",
    "0s",
  );
  await expect(reduced.locator(".activity-orbit").first()).toHaveCSS(
    "animation-name",
    "none",
  );
  await expect(
    reduced.getByRole("button", { name: "Pause counter effects" }),
  ).toBeHidden();
  await reduced.close();
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const [path, title] of [
    ["privacy", "Privacy & Security"],
    ["terms", "Terms of Use"],
  ]) {
    await page.goto(base + "/" + path);
    await expect(page.locator("link[rel=canonical]")).toHaveAttribute(
      "href",
      "https://devdevian.vercel.app/" + path,
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      title + " · Devdevian",
    );
    await expect(
      page.getByRole("heading", { level: 1, name: title }),
    ).toBeVisible();
    await expect(
      page.locator('.policy-footer a[href="mailto:dv842449@gmail.com"]'),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: title }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: artifacts + "/" + path + "-mobile.png",
      fullPage: true,
      animations: "disabled",
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  await page.evaluate(() => localStorage.setItem("devdevian-theme", "light"));
  await page.goto(base + "/app");
  await expect(page.locator(".post-card")).toHaveCount(0);
  await expect(page.locator(".empty-state")).toContainText(
    "A good place for the first word",
  );
  const firstPost = await second.request.post(base + "/api/posts", {
    data: {
      kind: "discussion",
      topic: "web",
      title: "Welcome to the developer forum",
      body: "A place for practical questions and thoughtful feedback.",
    },
  });
  expect(firstPost.ok()).toBeTruthy();
  await page.reload();
  await page.waitForSelector(".post-card");
  await page.waitForTimeout(300);
  const shot = async (name) => {
    await page.waitForTimeout(250);
    await page.screenshot({
      path: artifacts + "/" + name + ".png",
      animations: "disabled",
      fullPage: false,
    });
  };
  await shot("feed-light");
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await shot("feed-dark");
  await page
    .getByRole("button", { name: "Sign in", exact: true })
    .first()
    .click();
  await shot("auth");
  await page.setViewportSize({ width: 360, height: 780 });
  await page
    .getByRole("button", { name: "Forgot your password?", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Send recovery code", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".auth-modal input[type=password]")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await shot("mobile-password-recovery");
  await page.route("**/api/auth/password/request", (route) =>
    route.fulfill({
      json: {
        reset_required: true,
        challenge: "a".repeat(64),
        message:
          "If this address has a verified account, a code will arrive shortly.",
      },
    }),
  );
  await page.route("**/api/auth/password/reset", (route) => {
    expect(route.request().postDataJSON()).toEqual({
      challenge: "a".repeat(64),
      code: "123456",
      password: "New-browser-password123",
    });
    return route.fulfill({ json: { ok: true } });
  });
  await page.locator("input[name=email]").fill("recovery@browser.test");
  await page
    .getByRole("button", { name: "Send recovery code", exact: true })
    .click();
  await expect(page.locator(".verification-code")).toBeVisible();
  await page.locator(".verification-code").fill("123456");
  await page.locator("input[name=password]").fill("New-browser-password123");
  await shot("mobile-password-new-code");
  await page
    .getByRole("button", { name: "Set new password", exact: true })
    .click();
  await expect(page.locator(".auth-modal")).toContainText(
    "Password updated. Sign in",
  );
  await expect(page.locator(".verification-code")).toHaveCount(0);
  await page.unroute("**/api/auth/password/request");
  await page.unroute("**/api/auth/password/reset");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Join the community", exact: true })
    .click();
  await page.locator("input[name=name]").fill("Alex Browser");
  await page.locator("input[name=email]").fill("alex@browser.test");
  await page.locator("input[name=password]").fill("Browser-test-password123");
  await page.locator("input[name=username]").fill("alex_browser");
  await page
    .locator(".modal form")
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.locator(".notification-toggle")).toBeVisible();
  const close = () =>
    page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.locator(".notification-toggle").click();
  await expect(
    page.getByRole("dialog", { name: "Your notifications" }),
  ).toBeInViewport();
  expect(
    await page
      .getByRole("dialog", { name: "Your notifications" })
      .evaluate((e) => e.parentElement.parentElement === document.body),
  ).toBeTruthy();
  await shot("notifications-fixed");
  await close();
  await page.locator('a[href="#profile"]').first().click();
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await expect(page.locator("input[name=username]")).toHaveCount(0);
  await page
    .locator(".media-picker")
    .filter({ has: page.locator("input[name=detail_avatar]") })
    .locator("input[type=file]")
    .setInputFiles("public/background1.jpg");
  await expect(page.locator("[data-uploading=true]")).toHaveCount(0);
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.locator(".profile-handle")).toHaveText("@alex_browser");
  await expect(page.locator(".profile-info .avatar img")).toBeVisible();
  const avatarMetrics = await page
    .locator(".profile-info .avatar")
    .evaluate((e) => ({
      width: e.clientWidth,
      height: e.clientHeight,
      padding: getComputedStyle(e).padding,
      fit: getComputedStyle(e.querySelector("img")).objectFit,
    }));
  expect(avatarMetrics.width).toBe(avatarMetrics.height);
  expect(avatarMetrics.padding).toBe("0px");
  expect(avatarMetrics.fit).toBe("cover");
  await shot("profile");
  expect(
    await page
      .locator(".profile-info .avatar")
      .evaluate((e) => getComputedStyle(e).borderRadius),
  ).toBe("50%");
  await expect(page.locator(".profile-cover")).toHaveText("");

  await page.locator('a[href="#feed"]').first().click();
  await page
    .getByRole("button", { name: "Start a conversation", exact: true })
    .first()
    .click();
  await page.locator("input[name=title]").fill("A disposable draft");
  await page
    .getByRole("button", { name: "Discard draft", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start a conversation", exact: true })
    .first()
    .click();
  await expect(page.locator("input[name=title]")).toHaveValue("");
  await page.getByRole("button", { name: "Choose topic", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search topics", exact: true })
    .fill("Browser Engineering");
  await page
    .getByRole("button", { name: "Create “Browser Engineering”", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Choose topic", exact: true }),
  ).toContainText("Browser Engineering");
  await page
    .getByRole("button", { name: "Choose tools and technologies", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Search technologys", exact: true })
    .fill("BrowserTool");
  await page
    .getByRole("button", { name: "Create “BrowserTool”", exact: true })
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .locator("input[name=title]")
    .fill("Browser engineering conversation");
  await page
    .getByRole("textbox", { name: "Post content", exact: true })
    .fill(
      "A detailed conversation about browser testing and developer communities.",
    );
  await page.getByRole("button", { name: "Add link", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Link 1 label", exact: true })
    .fill("Documentation");
  await page
    .getByRole("textbox", { name: "Link 1 URL", exact: true })
    .fill("https://example.test/docs");
  // Closing immediately must flush the last edit; reopening restores custom controls too.
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Start a conversation", exact: true })
    .first()
    .click();
  await expect(page.locator("input[name=title]")).toHaveValue(
    "Browser engineering conversation",
  );
  await expect(
    page.getByRole("textbox", { name: "Post content", exact: true }),
  ).toHaveValue(
    "A detailed conversation about browser testing and developer communities.",
  );
  await expect(
    page.getByRole("button", { name: "Choose topic", exact: true }),
  ).toContainText("Browser Engineering");
  await expect(
    page.getByRole("button", {
      name: "Choose tools and technologies",
      exact: true,
    }),
  ).toContainText("BrowserTool");
  await expect(
    page.getByRole("textbox", { name: "Link 1 URL", exact: true }),
  ).toHaveValue("https://example.test/docs");
  await expect(page.locator(".draft-status")).toContainText("Draft restored");
  await shot("composer");
  await page
    .getByRole("button", { name: "Publish conversation", exact: true })
    .click();
  await expect(page.locator(".post-detail h1")).toHaveText(
    "Browser engineering conversation",
  );
  const postHash = new URL(page.url()).hash;
  expect(
    await page.evaluate(
      () =>
        Object.keys(localStorage).filter((k) =>
          k.startsWith("devdevian-draft:"),
        ).length,
    ),
  ).toBe(0);
  await page
    .getByRole("button", { name: "Follow conversation", exact: true })
    .click();
  await expect(page.locator(".detail-actions .follow-button")).toHaveText(
    "Following",
  );
  await page.reload();
  await expect(page.locator(".detail-actions .follow-button")).toHaveText(
    "Following",
  );
  await page.locator(".detail-actions .follow-button").click();
  await expect(page.locator(".detail-actions .follow-button")).toHaveText(
    "Follow conversation",
  );

  const catalog = await (
    await context.request.get(base + "/api/topics")
  ).json();
  const followedTopic = catalog.find((t) => t.name === "Browser Engineering");
  await page.goto(base + "/app#tag/" + followedTopic.id);
  await page.getByRole("button", { name: "Follow topic", exact: true }).click();
  await expect(page.locator(".topic-follow-bar .follow-button")).toHaveText(
    "Following",
  );
  await page.reload();
  await expect(page.locator(".topic-follow-bar .follow-button")).toHaveText(
    "Following",
  );
  await context.request.put(
    base + "/api/subscriptions/post/" + postHash.split("/")[1],
    { data: { following: true } },
  );
  await page.goto(base + "/app#following");
  await expect(
    page.getByRole("heading", { name: "A little off the beaten path." }),
  ).toHaveCount(0);
  await expect(page.locator(".post-card .post-title")).toContainText(
    "Browser engineering conversation",
  );
  await page
    .getByRole("button", { name: "Manage subscriptions", exact: true })
    .click();
  await expect(page.locator(".subscription-row")).toHaveCount(2);
  await page
    .getByRole("textbox", { name: "Search subscriptions" })
    .fill("Browser");
  await expect(page.locator(".subscription-row")).toHaveCount(2);
  await expect(
    page.getByRole("heading", { name: "A little off the beaten path." }),
  ).toHaveCount(0);
  await shot("subscriptions");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".subscription-row").first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await shot("mobile-subscriptions");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Filter subscriptions", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Conversations", exact: true })
    .click();
  await expect(page.locator(".subscription-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Unfollow", exact: true }).click();
  await expect(page.locator(".subscription-row")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Filter subscriptions", exact: true })
    .click();
  await page.getByRole("option", { name: "Topics", exact: true }).click();
  await expect(page.locator(".subscription-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Unfollow", exact: true }).click();
  await expect(page.locator(".subscription-row")).toHaveCount(0);
  await page.goto(base + "/app#tag/" + followedTopic.id);

  await expect(page.locator(".topic-follow-bar .follow-button")).toHaveText(
    "Follow topic",
  );
  await page.goto(base + "/app" + postHash);
  await expect(page.locator(".reply-dock")).toBeInViewport();
  await page
    .getByRole("button", { name: "Add your perspective", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Your reply", exact: true })
    .fill("Thanks @riley");
  await page
    .locator(".mention-results button")
    .filter({ hasText: "Riley Reviewer" })
    .click();
  await page.getByRole("button", { name: "Post reply", exact: true }).click();
  await expect(page.locator("[id^=reply-]").first()).toBeVisible();
  await expect(page.locator(".inline-mention")).toContainText("@builder_1");
  await expect(page.locator(".reply.is-targeted")).toContainText(
    "Linked reply",
  );
  await expect(page.locator(".reply.is-targeted")).toHaveAttribute(
    "aria-current",
    "location",
  );
  const reviewerPage = await second.newPage();
  await reviewerPage.goto(base + "/app");
  await reviewerPage.getByRole("button", { name: /^Notifications/ }).click();
  await reviewerPage
    .locator(".notification-item")
    .filter({ hasText: "mentioned you" })
    .first()
    .click();
  await expect(reviewerPage.locator(".reply.is-targeted")).toContainText(
    "@builder_1",
  );
  // A notification can target a grandchild on page 3 under a root on page 2.
  const deepResponse = await context.request.post(base + "/api/posts", {
    data: {
      title: "Linked branch fixture",
      body: "A conversation for paginated reply navigation.",
      kind: "discussion",
      topic: "web",
    },
  });
  expect(deepResponse.ok()).toBeTruthy();
  const deepPost = await deepResponse.json();
  const reviewerUser = (
    await (await second.request.get(base + "/api/me")).json()
  ).user;
  const fixture = new DatabaseSync(join(directory, "app.sqlite"));
  const addReply = fixture.prepare(
    "INSERT INTO replies(user_id,post_id,parent_id,body) VALUES(?,?,?,?)",
  );
  const roots = [];
  for (let i = 0; i < 12; i++)
    roots.push(
      Number(
        addReply.run(reviewerUser.id, deepPost.id, null, "Root branch " + i)
          .lastInsertRowid,
      ),
    );
  const children = [];
  for (let i = 0; i < 25; i++)
    children.push(
      Number(
        addReply.run(
          reviewerUser.id,
          deepPost.id,
          roots[11],
          "Nested branch " + i,
        ).lastInsertRowid,
      ),
    );
  fixture.close();
  const leafResponse = await context.request.post(
    base + "/api/posts/" + deepPost.id + "/replies",
    {
      data: {
        parent_id: children[24],
        body: "A deeply linked reply for @builder_1.",
      },
    },
  );
  expect(leafResponse.ok()).toBeTruthy();
  const leaf = await leafResponse.json();
  await reviewerPage.setViewportSize({ width: 390, height: 844 });
  await reviewerPage.goto(base + "/app");
  await reviewerPage.getByRole("button", { name: /^Notifications/ }).click();
  await reviewerPage
    .locator(".notification-item")
    .filter({ hasText: "Linked branch fixture" })
    .click();
  await expect(reviewerPage.locator("#reply-" + leaf.id)).toHaveClass(
    /is-targeted/,
  );
  await expect(reviewerPage.locator("#reply-" + leaf.id)).toBeInViewport();
  await expect(
    reviewerPage.getByRole("navigation", {
      name: "replies pagination",
      exact: true,
    }),
  ).toContainText("Page 2 of 2");
  await expect(
    reviewerPage.getByRole("navigation", {
      name: "thread replies pagination",
      exact: true,
    }),
  ).toContainText("Page 3 of 3");
  expect(
    await reviewerPage.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await reviewerPage.screenshot({
    path: artifacts + "/mobile-linked-reply.png",
  });
  await reviewerPage.goto(
    base + "/app#post/" + deepPost.id + "/reply/" + roots[0],
  );
  await expect(reviewerPage.locator("#reply-" + roots[0])).toHaveClass(
    /is-targeted/,
  );
  await expect(
    reviewerPage.getByRole("navigation", {
      name: "replies pagination",
      exact: true,
    }),
  ).toContainText("Page 1 of 2");
  await reviewerPage.goto(
    base + "/app#post/" + deepPost.id + "/reply/99999999",
  );
  await expect(reviewerPage.locator(".linked-reply-notice")).toBeVisible();
  await reviewerPage.close();
  await shot("conversation");
  await page
    .getByRole("button", { name: "Archive conversation", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Archiving stops new replies",
  );
  await page
    .getByRole("button", { name: "Confirm archive", exact: true })
    .click();
  await expect(page.locator(".conversation-lifecycle")).toContainText(
    "New replies are closed",
  );
  await page
    .getByRole("button", { name: "Restore conversation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm restore", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Archive conversation", exact: true }),
  ).toBeVisible();

  await page.locator(".global-search").click();
  await expect(
    page.getByRole("textbox", { name: "Search all Devdevian" }),
  ).toBeFocused();
  await page.keyboard.type("engineering browser");
  await expect(page.locator(".search-result")).toHaveCount(1);
  await shot("search");
  await close();
  await page.locator('a[href="#communities"]').first().click();
  await page
    .getByRole("button", { name: "Create a community", exact: true })
    .first()
    .click();
  await page.locator("input[name=name]").fill("Browser builders");
  await page
    .locator("textarea[name=description]")
    .fill("A private community for careful browser testing.");
  await page
    .locator(".media-picker")
    .filter({ has: page.locator("input[name=detail_banner]") })
    .locator("input[type=file]")
    .setInputFiles("public/background1.jpg");
  await expect(page.locator("[data-uploading=true]")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Create private community", exact: true })
    .click();
  await expect(page.locator(".community-hero h1")).toHaveText(
    "Browser builders",
  );
  await expect(page.locator(".community-banner")).toBeVisible();
  await expect(page.locator(".community-hero .eyebrow")).toHaveCount(0);
  await shot("community-header");
  const space = new URL(page.url()).hash.split("/")[1];
  const attendeeJoin = await second.request.post(
    base + "/api/communities/" + space + "/request",
    { data: {} },
  );
  expect(attendeeJoin.ok()).toBeTruthy();
  await page
    .getByRole("button", { name: "Manage access", exact: true })
    .click();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Find an approved member", exact: true })
    .fill("Riley");
  await page
    .locator(".people-picker .select-popover button")
    .filter({ hasText: "Riley Reviewer" })
    .click();
  await expect(
    page.locator(".validator-row").filter({ hasText: "Riley Reviewer" }),
  ).toBeVisible();
  await shot("validators");
  await close();
  await page.locator('a[href="#projects"]').first().click();
  await page
    .getByRole("button", { name: /Share your project/ })
    .first()
    .click();
  await page.locator("input[name=name]").fill("Browser Lab");
  await page
    .locator("textarea[name=description]")
    .fill(
      "A useful testing tool for development teams who want reliable interfaces.",
    );
  await page
    .locator("textarea[name=help]")
    .fill("Please review the onboarding and the screenshot workflow.");
  await page
    .locator(".media-picker")
    .filter({ has: page.locator("input[name=detail_logo]") })
    .locator("input[type=file]")
    .setInputFiles("public/devdevian-logo.png");
  await expect(page.locator("[data-uploading=true]")).toHaveCount(0);
  await page
    .locator(".media-picker")
    .filter({ has: page.locator("input[name=detail_screenshots]") })
    .locator("input[type=file]")
    .setInputFiles(["public/background1.jpg", "public/devdevian-logo.png"]);
  await expect(page.locator("[data-uploading=true]")).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Find a developer", exact: true })
    .fill("Riley");
  await page
    .locator(".people-picker .select-popover button")
    .filter({ hasText: "Riley Reviewer" })
    .click();
  await page.getByPlaceholder("Role, e.g. Co-founder").fill("Co-founder");
  await page
    .getByRole("button", { name: "Share project & open feedback", exact: true })
    .click();
  await expect(page.locator(".media-carousel")).toBeVisible();
  await expect(page.locator(".project-team")).toContainText("Co-founder");
  await page.getByRole("button", { name: "Next screenshot" }).click();
  await expect(page.locator(".media-carousel")).toContainText("2 / 2");
  await shot("project");
  await page.locator('a[href="#events"]').first().click();
  await page
    .getByRole("button", { name: "Create an event", exact: true })
    .first()
    .click();
  await page.locator("input[name=title]").fill("Browser builders live meetup");
  await page
    .locator("textarea[name=description]")
    .fill("A friendly live discussion about reliable browser tests.");
  await page.locator("input[name=local_start]").fill("2030-01-20T18:00");
  await page
    .locator("input[name=url]")
    .fill("https://example.test/private-meeting");
  await page
    .locator(".media-picker")
    .filter({ has: page.locator("input[name=detail_banner]") })
    .locator("input[type=file]")
    .setInputFiles("public/background1.jpg");
  await expect(page.locator("[data-uploading=true]")).toHaveCount(0);
  await page.getByRole("button", { name: "Create event", exact: true }).click();
  await expect(page.locator(".event-card h2")).toHaveText(
    "Browser builders live meetup",
  );
  await expect(page.locator(".event-card .entity-banner")).toBeVisible();
  await expect(page.locator(".event-organizer .avatar img")).toBeVisible();
  expect(
    await page
      .locator(".event-organizer .avatar img")
      .evaluate((img) => img.complete && img.naturalWidth > 0),
  ).toBeTruthy();
  await expect(page.locator(".event-filters input[type=date]")).toHaveCount(1);
  await page.getByLabel("Events on date", { exact: true }).fill("2030-01-21");
  await expect(page.locator(".event-card")).toHaveCount(0);
  await page.getByLabel("Events on date", { exact: true }).fill("2030-01-20");
  await expect(page.locator(".event-card h2")).toHaveText(
    "Browser builders live meetup",
  );
  await page.getByLabel("Events on date", { exact: true }).fill("");
  await shot("event");
  const reportPostId = postHash.split("/")[1];
  expect(
    (
      await page.request.post(base + "/api/posts/" + reportPostId + "/report", {
        data: { reason: "Browser acceptance report for moderation." },
      })
    ).ok(),
  ).toBeTruthy();
  await page
    .getByRole("button", { name: "Open settings", exact: true })
    .click();
  await shot("settings");
  await expect(page.locator("input[name=username]")).toHaveCount(0);
  await page
    .getByRole("switch", { name: "Receive in-app notifications", exact: true })
    .uncheck();
  await page
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Preferences saved", exact: true }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Add another account", exact: true })
    .click();
  await page.locator("input[name=email]").fill("reviewer@browser.test");
  await page.locator("input[name=password]").fill("Browser-test-password123");
  await page
    .locator(".modal form")
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await expect(page.locator(".account-button")).toContainText("Riley Reviewer");
  await page.locator('a[href="#moderation/public"]').click();
  await page
    .getByRole("button", { name: "Review report", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeInViewport();
  await page.locator(".modal .select-trigger").click();
  await page
    .getByRole("option", {
      name: "Resolve · hide spam publication",
      exact: true,
    })
    .click();
  await page
    .locator("textarea[name=note]")
    .fill("Spam hidden during the browser acceptance check.");
  await page
    .getByRole("button", { name: "Save decision", exact: true })
    .click();
  await expect(page.locator(".form-success")).toContainText(
    "Publication hidden",
  );
  const anonymous = await browser.newContext();
  expect(
    (await anonymous.request.get(base + "/api/posts/" + reportPostId)).status(),
  ).toBe(404);
  await anonymous.close();
  await page.getByRole("button", { name: "Reviewed", exact: true }).click();
  await expect(page.locator(".report-card")).toContainText("RESOLVED");
  await shot("moderation-decision");

  await page
    .getByRole("button", { name: "Open settings", exact: true })
    .click();
  await page
    .locator(".validator-row")
    .filter({ hasText: "Alex Browser" })
    .click();
  await expect(page.locator(".account-button")).toContainText("Alex Browser");
  await page.locator('a[href="#profile"]').first().click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Sign out?" })).toBeVisible();
  await page.getByRole("button", { name: "Stay here", exact: true }).click();
  await page.setViewportSize({ width: 834, height: 1112 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await shot("tablet-profile");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  await expect(page.locator("main")).toHaveJSProperty(
    "scrollWidth",
    await page.locator("main").evaluate((e) => e.clientWidth),
  );
  await page
    .getByRole("button", { name: "Toggle navigation", exact: true })
    .click();
  await expect(page.locator(".sidebar")).toBeInViewport();
  await shot("mobile-navigation");
  await page.locator(".sidebar-scrim").click({ position: { x: 350, y: 400 } });
  await shot("mobile-profile");
  for (const width of [360, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      "feed",
      "communities",
      "projects",
      "events",
      "profile",
    ]) {
      await page.goto(base + "/app#" + route);
      await page.waitForLoadState("networkidle");
      await expect(page.locator(".loading-state")).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `Horizontal overflow on ${route} at ${width}px`,
      ).toBeTruthy();
      await shot(`responsive-${width}-${route}`);
    }
  }

  // Optional templates append without erasing a draft; line feedback remains separate from replies.
  await page.goto(base + "/app#feed");
  await page
    .getByRole("button", { name: "Start a conversation", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Question", exact: true }).click();
  await page.getByRole("button", { name: "Use outline", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Post content", exact: true }),
  ).toHaveValue(/## The problem/);
  await page
    .getByRole("textbox", { name: "Post content", exact: true })
    .fill("Keep this existing draft.");
  await page.getByRole("button", { name: "Code review", exact: true }).click();
  await page
    .getByRole("button", { name: "Append outline", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Post content", exact: true }),
  ).toHaveValue(/^Keep this existing draft.[\s\S]*## Questions for reviewers/);
  await page
    .getByRole("button", { name: "Discard draft", exact: true })
    .click();
  const reviewResponse = await context.request.post(base + "/api/posts", {
    data: {
      title: "Line review browser fixture",
      body: "Review this worker and its bounded retry strategy.",
      kind: "review",
      topic: "web",
      code: "async function work() {\n  return await request();\n}",
      review_focus: "Check error handling and retry safety.",
    },
  });
  expect(reviewResponse.ok()).toBeTruthy();
  const reviewPost = await reviewResponse.json();
  const lineReviewer = await second.newPage();
  await lineReviewer.goto(base + "/app#post/" + reviewPost.id);
  await lineReviewer
    .getByRole("button", { name: "Select code line 2", exact: true })
    .click();
  await lineReviewer
    .getByRole("button", { name: "Select code line 3", exact: true })
    .click({ modifiers: ["Shift"] });
  await expect(
    lineReviewer.getByRole("spinbutton", {
      name: "Feedback start line",
      exact: true,
    }),
  ).toHaveValue("2");
  await expect(
    lineReviewer.getByRole("spinbutton", {
      name: "Feedback end line",
      exact: true,
    }),
  ).toHaveValue("3");

  await lineReviewer
    .getByRole("textbox", { name: "What would you change?", exact: true })
    .fill("Catch request failures and add a bounded retry.");
  await lineReviewer
    .getByRole("button", { name: "Add line feedback", exact: true })
    .click();
  await expect(lineReviewer.locator(".line-feedback-card")).toContainText(
    "Catch request failures",
  );
  await expect(lineReviewer.locator(".line-feedback-card")).toContainText(
    "Lines 2–3",
  );
  await expect(
    lineReviewer.getByRole("button", { name: "Mark resolved", exact: true }),
  ).toHaveCount(0);
  await page.goto(base + "/app#post/" + reviewPost.id);
  await page
    .getByRole("button", { name: "Mark resolved", exact: true })
    .click();
  await expect(page.locator(".line-feedback-card")).toHaveClass(/is-resolved/);
  await page
    .getByRole("button", { name: "Reopen feedback", exact: true })
    .click();
  await expect(page.locator(".line-feedback-card")).not.toHaveClass(
    /is-resolved/,
  );
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(300);
    await page
      .locator(".code-review-workbench")
      .evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.evaluate(() =>
      window.scrollTo({ left: 0, top: window.scrollY }),
    );
    const box = await page.locator(".code-review-workbench").boundingBox();
    expect(box.x, `Left edge at ${width}px`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `Right edge at ${width}px`).toBeLessThanOrEqual(
      width,
    );

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Line review overflow at ${width}px`,
    ).toBeTruthy();
    await page.screenshot({ path: artifacts + `/code-review-${width}.png` });
  }

  await page
    .getByRole("button", { name: "Discuss feedback", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Reply to this feedback", exact: true })
    .fill("Would bounded retries with a deadline address this concern?");
  await page
    .getByRole("button", { name: "Send feedback reply", exact: true })
    .click();
  await expect(page.locator(".feedback-thread-reply")).toContainText(
    "bounded retries",
  );
  await lineReviewer.reload();
  await lineReviewer
    .locator(".line-feedback-card > .feedback-actions")
    .getByRole("button", { name: "Edit feedback", exact: true })
    .click();
  await lineReviewer
    .getByRole("textbox", { name: "Edit feedback text", exact: true })
    .fill("Handle request failures with a deadline and bounded retries.");
  await lineReviewer
    .getByRole("button", { name: "Save feedback", exact: true })
    .click();
  await expect(lineReviewer.locator(".line-feedback-card")).toContainText(
    "deadline and bounded retries",
  );
  await lineReviewer.getByRole("button", { name: /^Notifications/ }).click();
  await lineReviewer
    .locator(".notification-item")
    .filter({ hasText: "Line review browser fixture" })
    .first()
    .click();
  await expect(lineReviewer.locator(".feedback-thread-reply")).toContainText(
    "bounded retries",
  );
  await lineReviewer
    .locator(".line-feedback-card > .feedback-actions")
    .getByRole("button", { name: "Delete feedback", exact: true })
    .click();
  await lineReviewer
    .getByRole("button", { name: "Confirm deletion", exact: true })
    .click();
  await expect(lineReviewer.locator(".line-feedback-card")).toContainText(
    "This feedback was deleted",
  );
  if (
    await lineReviewer
      .getByRole("button", { name: "Discuss feedback", exact: true })
      .count()
  )
    await lineReviewer
      .getByRole("button", { name: "Discuss feedback", exact: true })
      .click();
  await expect(lineReviewer.locator(".feedback-thread-reply")).toContainText(
    "bounded retries",
  );
  await lineReviewer
    .locator(".feedback-thread-reply")
    .getByRole("button", { name: "Report feedback", exact: true })
    .click();
  await lineReviewer
    .getByRole("textbox", { name: "Feedback report reason", exact: true })
    .fill("This reply contains irrelevant spam content.");
  await lineReviewer
    .getByRole("button", { name: "Submit report", exact: true })
    .click();
  await expect(lineReviewer.getByRole("dialog")).toHaveCount(0);
  await lineReviewer.goto(base + "/app#moderation/public");
  await lineReviewer
    .getByRole("button", { name: "Review feedback report", exact: true })
    .click();
  await lineReviewer
    .getByRole("button", { name: "Feedback moderation decision", exact: true })
    .click();
  await lineReviewer
    .getByRole("option", {
      name: "Resolve · remove selected feedback",
      exact: true,
    })
    .click();
  await lineReviewer
    .getByRole("textbox", { name: "Feedback moderation note", exact: true })
    .fill("Remove this individual reply while preserving the conversation.");
  await lineReviewer
    .getByRole("button", { name: "Save feedback decision", exact: true })
    .click();
  await expect(lineReviewer.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await page
    .getByRole("button", { name: "Discuss feedback", exact: true })
    .click();
  await expect(page.locator(".feedback-thread-reply")).toContainText(
    "This reply was deleted",
  );
  const longReview = await context.request.post(base + "/api/posts", {
    data: {
      title: "Long snippet pagination fixture",
      body: "A larger snippet should keep the browser responsive.",
      kind: "review",
      topic: "web",
      code: Array.from({ length: 205 }, (_, i) => `const value${i}=1;`).join(
        "\n",
      ),
      review_focus: "Review the highlighted line range.",
    },
  });
  expect(longReview.ok()).toBeTruthy();
  await page.goto(base + "/app#post/" + (await longReview.json()).id);
  await expect(page.locator(".snippet-line")).toHaveCount(100);
  await page
    .getByRole("button", { name: "Next code lines page", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Select code line 101", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Next code lines page", exact: true })
    .click();
  await expect(page.locator(".snippet-line")).toHaveCount(5);

  const cliRequest = await context.request.post(base + "/api/cli/device", {
    data: { name: "Browser acceptance terminal" },
  });
  expect(cliRequest.ok()).toBeTruthy();
  const cliDevice = await cliRequest.json();
  await page.goto(base + "/app#cli/authorize/" + cliDevice.user_code);
  await expect(page.locator(".cli-device-code")).toContainText(
    cliDevice.user_code,
  );
  await expect(page.locator(".cli-device-code")).toContainText(
    "Browser acceptance terminal",
  );
  await page
    .getByRole("button", { name: "Authorize terminal", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Connected. Return to your terminal.",
  );
  const cliExchange = await context.request.post(base + "/api/cli/token", {
    data: { device_code: cliDevice.device_code },
  });
  expect(cliExchange.ok()).toBeTruthy();
  const cliToken = (await cliExchange.json()).access_token;
  const cliIdentity = await context.request.get(base + "/api/me", {
    headers: { Authorization: "Bearer " + cliToken },
  });
  expect(cliIdentity.ok()).toBeTruthy();
  await page
    .getByRole("button", { name: "Open settings", exact: true })
    .click();
  await expect(page.locator(".cli-session")).toContainText(
    "Browser acceptance terminal",
  );
  await page
    .getByRole("button", { name: "Revoke terminal", exact: true })
    .click();
  await expect(page.locator(".cli-session")).toHaveCount(0);
  expect(
    (
      await context.request.get(base + "/api/me", {
        headers: { Authorization: "Bearer " + cliToken },
      })
    ).status(),
  ).toBe(401);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.setViewportSize({ width: 360, height: 800 });
  const declinedRequest = await context.request.post(base + "/api/cli/device", {
      data: { name: "Declined acceptance terminal" },
    }),
    declined = await declinedRequest.json();
  await page.goto(base + "/app#cli/authorize/" + declined.user_code);
  await expect(page.locator(".cli-device-code")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await shot("cli-approval-mobile");
  await page.getByRole("button", { name: "Decline", exact: true }).click();
  expect(
    (
      await context.request.post(base + "/api/cli/token", {
        data: { device_code: declined.device_code },
      })
    ).status(),
  ).toBe(403);
  await lineReviewer.close();
  expect(errors).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(
    page.getByRole("link", { name: `Release v${appVersion}`, exact: true }),
  ).toHaveAttribute("href", "https://github.com/Tenyokj/devdevian/releases");
  await expect(
    page.getByRole("link", { name: "Report a bug", exact: true }),
  ).toHaveAttribute(
    "href",
    "https://github.com/Tenyokj/devdevian/issues/new/choose",
  );
  await page
    .locator("main>footer")
    .screenshot({ path: artifacts + "/release-footer-desktop.png" });
  await page.setViewportSize({ width: 360, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page
    .locator("main>footer")
    .screenshot({ path: artifacts + "/release-footer-mobile.png" });
  // GitHub context published by a terminal is readable in both browser themes/layouts.
  const sourceReview = await second.request.post(base + "/api/posts", {
    data: {
      title: "GitHub context browser check",
      kind: "review",
      topic: "web",
      body: "Review this selected local patch and its source context.",
      code: "const retry = 3;",
      review_focus: "Check retries and error handling.",
      details: {
        github_context: {
          repository: "https://github.com/example/project",
          commit: "c".repeat(40),
          branch: "feature/retries",
          path: "packages/client/src/long-path/retry.ts",
          mode: "unstaged",
          pull_request: "https://github.com/example/project/pull/42",
        },
      },
    },
  });
  expect(sourceReview.ok()).toBeTruthy();
  const sourceId = (await sourceReview.json()).id;
  for (const [theme, viewport] of [
    ["light", { width: 1440, height: 1000 }],
    ["dark", { width: 390, height: 844 }],
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(
      (t) => localStorage.setItem("devdevian-theme", t),
      theme,
    );
    await page.goto(base + "/app#post/" + sourceId);
    const card = page.getByRole("region", { name: "GitHub context" });
    await expect(card).toContainText("feature/retries");
    await expect(card).toContainText("Local code may differ");
    await expect(card.getByRole("link", { name: "PR #42" })).toHaveAttribute(
      "href",
      "https://github.com/example/project/pull/42",
    );
    await expect(
      card.getByRole("link", { name: "Base ccccccc" }),
    ).toHaveAttribute(
      "href",
      "https://github.com/example/project/commit/" + "c".repeat(40),
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await card.screenshot({
      path: artifacts + "/github-context-" + theme + ".png",
    });
  }
  const prSnapshot = await second.request.post(base + "/api/posts", {
    data: {
      title: "Selected GitHub PR snapshot browser check",
      kind: "review",
      topic: "web",
      body: "Review this explicit PR patch snapshot.",
      code: '--- "a/src/retry.ts"\n+++ "b/src/retry.ts"\n@@ -1 +1 @@\n-old\n+new\n--- "a/test/retry.test.ts"\n+++ "b/test/retry.test.ts"\n@@ -1 +1 @@\n-old test\n+new test',
      review_focus: "Check the retry behaviour.",
      details: {
        github_context: {
          repository: "https://github.com/example/project",
          commit: "a".repeat(40),
          base_commit: "b".repeat(40),
          branch: "retry",
          path: "src/retry.ts",
          mode: "pr",
          pull_request: "https://github.com/example/project/pull/42",
          hunk_start: 1,
          hunk_end: 2,
          files: [
            {
              path: "src/retry.ts",
              hunk_start: 1,
              hunk_end: 2,
              patch_start: 1,
              patch_end: 5,
            },
            {
              path: "test/retry.test.ts",
              hunk_start: 1,
              hunk_end: 1,
              patch_start: 6,
              patch_end: 10,
            },
          ],
        },
      },
    },
  });
  expect(prSnapshot.ok()).toBeTruthy();
  const prSnapshotId = (await prSnapshot.json()).id;
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(base + "/app#post/" + prSnapshotId);
    const card = page.getByRole("region", { name: "GitHub context" });
    await expect(card).toContainText("PR patch snapshot");
    await expect(card).toContainText("Hunks 1–2");
    await expect(
      card.getByRole("list", { name: "Selected PR files" }),
    ).toContainText("test/retry.test.ts");
    await expect(card).toContainText("published lines 6–10");
    await expect(card).toContainText(
      "Review lines refer to the published patch",
    );
    await expect(
      card.getByRole("link", { name: "Head aaaaaaa" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await card.screenshot({
      path: artifacts + "/pr-snapshot-" + viewport.width + ".png",
    });
  }
  console.log(
    "Browser checks passed: themes, real forms, uploads, catalogs, links, mentions, search, validators, screenshots, teams, account switching, mobile navigation.",
  );
} catch (e) {
  console.error("SERVER:", output);
  if (browser) {
    for (const context of browser.contexts())
      for (const page of context.pages()) {
        console.error(
          "PAGE:",
          (await page.locator("body").innerText()).slice(-3500),
        );
        await page
          .screenshot({
            path: artifacts + "/failure.png",
            animations: "disabled",
          })
          .catch(() => {});
      }
  }
  throw e;
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await new Promise((r) => server.once("exit", r));
  rmSync(directory, { recursive: true, force: true });
}
