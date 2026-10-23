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
  expect(await sitemapResponse.text()).toContain("/privacy</loc>");
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
  await staticContext.close();
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
  await expect(page.getByRole("tabpanel")).toContainText("error handling");
  await page
    .getByRole("tab", { name: "Code reviews", exact: true })
    .press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Show & tell", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Try the suggested change", exact: true })
    .click();
  await expect(page.locator(".landing-code-card pre")).toContainText(
    "if (!response.ok)",
  );
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: base,
  });
  await page
    .getByRole("button", { name: "Copy example code", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Copy example code", exact: true }),
  ).toContainText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "if (!response.ok)",
  );
  await page
    .getByRole("button", {
      name: "Suggestion applied · reset example",
      exact: true,
    })
    .click();
  await expect(page.locator(".landing-code-card pre")).not.toContainText(
    "if (!response.ok)",
  );
  await page.locator(".faq-list summary").first().click();
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
    10,
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
    await page.screenshot({
      path: artifacts + "/landing-" + name + ".png",
      fullPage: true,
      animations: "disabled",
    });
  }
  await page.goto(base + "/#faq");
  await expect(page.locator(".landing-faq")).toBeVisible();
  const reduced = await context.newPage();
  await reduced.emulateMedia({ reducedMotion: "reduce" });
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
  expect(errors).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(
    page.getByRole("link", { name: "Release v0.1.3", exact: true }),
  ).toHaveAttribute(
    "href",
    "https://github.com/Tenyokj/devdevian/releases/tag/v0.1.3",
  );
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
