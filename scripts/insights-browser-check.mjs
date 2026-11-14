import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { startTestServer } from "../tests/http-fixture.mjs";
import { seedInsights } from "../tests/insights-fixture.mjs";
import { buildExtension } from "./extension-build.mjs";
import { contentSecurityPolicy } from "../security-headers.mjs";
const f = await startTestServer(),
  browser = await chromium.launch({ headless: true });
try {
  const seeded = await seedInsights(f),
    context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", async (route) => {
    if (
      route.request().resourceType() === "document" &&
      !route.request().url().includes("/api/extensions/runner?")
    ) {
      const response = await route.fetch();
      await route.fulfill({
        response,
        headers: {
          ...response.headers(),
          "content-security-policy": contentSecurityPolicy.replace(
            "; upgrade-insecure-requests",
            "",
          ),
        },
      });
    } else await route.continue();
  });
  await page.goto(f.base + "/app");
  await page.evaluate(async () => {
    const r = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "insightauthor@insights.test",
        password: "Fixture-password123",
      }),
    });
    if (!r.ok) throw Error(await r.text());
  });
  const pkg = await buildExtension("examples/extensions/developer-insights");
  await page.evaluate(async (pkg) => {
    const headers = {
      "Content-Type": "application/json",
      "X-Devdevian-Extensions": "2",
    };
    const r = await fetch("/api/extensions/publish", {
        method: "POST",
        headers,
        body: JSON.stringify(pkg),
      }),
      release = await r.json();
    if (!r.ok) throw Error(JSON.stringify(release));
    const install = await fetch("/api/extensions/install", {
      method: "POST",
      headers,
      body: JSON.stringify({
        release: release.id,
        acknowledge_unreviewed: true,
        granted_permissions: release.manifest.permissions,
      }),
    });
    if (!install.ok) throw Error(await install.text());
  }, pkg);
  await page.goto(f.base + "/app#profile");
  await page
    .getByRole("button", { name: "Developer Insights", exact: true })
    .waitFor();
  assert.equal(
    await page.locator(".devext-command-controls, .devext-recovery").count(),
    0,
    "No floating extension controls on profiles",
  );
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector(".devext-panel-profile"))
        .visibility === "hidden",
  );
  await page
    .getByRole("button", { name: "Developer Insights", exact: true })
    .click();
  const panel = page.locator(".devext-panel-profile"),
    frame = page.frameLocator('iframe[title="Developer Insights sandbox"]');
  await frame
    .getByRole("heading", { name: "Insight Author's rhythm." })
    .waitFor();
  await assert.doesNotReject(() =>
    frame.getByRole("heading", { name: "Activity over time" }).waitFor(),
  );
  assert.equal(await frame.locator(".metric").count(), 6);
  await frame.getByLabel("Include my accessible private work").check();
  await frame.getByRole("heading", { name: "Only you", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Conversations", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector(".devext-panel-profile"))
        .visibility === "hidden",
  );
  await page
    .getByRole("button", { name: "Developer Insights", exact: true })
    .click();
  await frame.getByRole("heading", { name: "Only you", exact: true }).waitFor();
  await page.evaluate((id) => (location.hash = "member/" + id), seeded.other);
  await page
    .locator(".profile-hero")
    .getByRole("heading", { name: "Another Developer", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Developer Insights", exact: true })
    .click();
  await frame
    .getByRole("heading", { name: "Another Developer's rhythm." })
    .waitFor();
  assert.equal(
    await frame.getByLabel("Include my accessible private work").count(),
    0,
  );
  assert.equal(
    await frame.getByRole("heading", { name: "Only you", exact: true }).count(),
    0,
  );
  await page.evaluate(() => (location.hash = "feed"));
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector(".devext-panel-profile"))
        .visibility === "hidden",
  );
  await page.evaluate(() => (location.hash = "profile"));
  await page
    .locator(".profile-hero")
    .getByRole("heading", { name: "Insight Author", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Developer Insights", exact: true })
    .click();
  await frame
    .getByRole("heading", { name: "Insight Author's rhythm." })
    .waitFor();
  assert.equal(
    await frame.getByLabel("Include my accessible private work").isChecked(),
    false,
  );
  await frame.getByLabel("Activity window").selectOption("365");
  await frame.locator(".cell").nth(364).waitFor();
  await page.waitForTimeout(400);
  assert.ok(
    await panel.evaluate(
      (el) =>
        el.getBoundingClientRect().left >=
        document.querySelector(".sidebar").getBoundingClientRect().right,
    ),
    "profile panel stays in content column",
  );
  await mkdir(".test-data/insights-browser", { recursive: true });
  await page.screenshot({ path: ".test-data/insights-browser/viewport.png" });
  await page.screenshot({
    path: ".test-data/insights-browser/desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Switch to dark theme", exact: true })
    .click();
  await frame.locator('body[data-mode="dark"]').waitFor();
  await page.screenshot({
    path: ".test-data/insights-browser/dark-viewport.png",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await page.screenshot({
    path: ".test-data/insights-browser/mobile.png",
    fullPage: true,
  });
  assert.ok(
    await frame
      .locator("body")
      .evaluate((el) => el.scrollWidth <= innerWidth + 1),
    "dashboard has no horizontal overflow on mobile",
  );
  assert.equal(
    await page
      .locator('iframe[title="Developer Insights sandbox"]')
      .getAttribute("sandbox"),
    "allow-scripts",
  );
  await page.evaluate(async () => {
    const r = await fetch("/api/extensions/disable-all", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Devdevian-Extensions": "2",
      },
      body: "{}",
    });
    if (!r.ok) throw Error(await r.text());
    window.dispatchEvent(new Event("devdevian-extensions"));
  });
  await page
    .getByRole("button", { name: "Developer Insights", exact: true })
    .waitFor({ state: "detached" });
  await page.locator(".devext-panel-profile").waitFor({ state: "detached" });
  assert.equal(
    await page.locator(".profile-tabs button.selected").innerText(),
    "Conversations",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Insights browser: actual package install, charts, own/private scope, profile switching, hidden outside profiles and mobile passed.",
  );
} finally {
  await browser.close();
  await f.close();
}
