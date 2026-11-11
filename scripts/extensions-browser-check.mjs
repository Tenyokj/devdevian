import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { startTestServer } from "../tests/http-fixture.mjs";
import { buildExtension } from "./extension-build.mjs";
import { contentSecurityPolicy } from "../security-headers.mjs";
const f = await startTestServer(),
  browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", async (route) => {
    const req = route.request();
    if (
      req.resourceType() === "document" &&
      !req.url().includes("/api/extensions/runner?")
    ) {
      const response = await route.fetch();
      let policy = contentSecurityPolicy.replace(
        "; upgrade-insecure-requests",
        "",
      );
      if (new URL(req.url()).pathname === "/workspace-pane")
        policy = policy.replace(
          "frame-ancestors 'none'",
          "frame-ancestors 'self'",
        );
      await route.fulfill({
        response,
        headers: {
          ...response.headers(),
          "content-security-policy": policy,
          "x-frame-options":
            new URL(req.url()).pathname === "/workspace-pane"
              ? "SAMEORIGIN"
              : "DENY",
        },
      });
    } else await route.continue();
  });
  await page.goto(f.base + "/app#extensions");
  await page.evaluate(async () => {
    const r = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Package Tester",
        email: "packages@extensions.test",
        password: "Fixture-password123",
      }),
    });
    if (!r.ok) throw Error(await r.text());
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Upload extension", exact: true })
    .waitFor();
  assert.equal(
    await page.locator(".devext-recovery").count(),
    0,
    "No recovery button should cover the logo when no extension is running",
  );
  const pkg = await buildExtension("examples/extensions/studio-shell");
  await page
    .getByRole("button", { name: "Upload extension", exact: true })
    .click();
  await page.getByLabel("Extension name", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Load Studio Shell example", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector('[aria-label="Extension name"]').value ===
      "Studio Shell",
  );
  await mkdir(".test-data/extensions-browser", { recursive: true });
  await page.screenshot({
    path: ".test-data/extensions-browser/publish-listing.png",
    fullPage: true,
  });

  await page.getByLabel("Extension package file").setInputFiles({
    name: "RectangleConfig.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"random":true}'),
  });
  await page
    .getByText("This is not a Devdevian extension package.", { exact: false })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Publish immutable package" })
      .isDisabled(),
    true,
  );
  await page.getByLabel("Extension package file").setInputFiles({
    name: "studio-shell.devext.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(pkg)),
  });
  await page
    .getByLabel("Full description", { exact: true })
    .fill("## A complete extension\n\nSetup instructions and useful details.");
  await page.getByLabel("Extension tags").fill("theme, productivity");
  await page.getByRole("button", { name: "+ Add link", exact: true }).click();
  const linkCount = await page.getByLabel(/Link \d+ label/).count();
  await page.getByLabel(`Link ${linkCount} label`).fill("Support");
  await page
    .getByLabel(`Link ${linkCount} URL`)
    .fill("https://github.com/Tenyokj/devdevian/issues");
  await page
    .getByLabel("Extension screenshots")
    .setInputFiles("public/devdevian-logo.png");
  await page
    .getByRole("button", { name: "Remove screenshot 1", exact: true })
    .waitFor();
  const src = await page
    .getByAltText("Screenshot 1", { exact: true })
    .getAttribute("src");
  const guest = await browser.newContext();
  assert.equal(
    (await guest.request.get(f.base + src)).status(),
    404,
    "Unpublished screenshot stays private",
  );
  await page.getByRole("button", { name: "Publish immutable package" }).click();
  assert.equal(
    (await guest.request.get(f.base + src)).status(),
    200,
    "Published screenshot is visible to library visitors",
  );
  await guest.close();

  await page
    .getByRole("heading", { name: "Studio Shell", exact: true })
    .waitFor();
  await page
    .getByRole("heading", { name: "A complete extension", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("link", { name: "Support", exact: false })
      .getAttribute("href"),
    "https://github.com/Tenyokj/devdevian/issues",
  );
  await page
    .getByAltText("Studio Shell screenshot 1", { exact: true })
    .waitFor();
  // Install only after reviewing code capabilities. Also prove the server rejects missing grants.
  const result = await page.evaluate(async () => {
    const library = await (
      await fetch("/api/extensions/library", {
        headers: { "X-Devdevian-Extensions": "2" },
      })
    ).json();
    const item = library.items.find((x) => x.slug === "studio-shell");
    const r = await fetch("/api/extensions/install", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Devdevian-Extensions": "2",
      },
      body: JSON.stringify({
        release: item.id,
        acknowledge_unreviewed: true,
        granted_permissions: item.manifest.permissions,
      }),
    });
    return { status: r.status, body: await r.json() };
  });
  assert.equal(result.status, 200, JSON.stringify(result));
  await page.reload();
  await page.waitForFunction(
    () =>
      document.querySelector(".devext-surface")?.dataset.extensionLayout ===
      "true",
  );
  assert.match(
    await page
      .locator(".devext-surface")
      .evaluate((e) => e.style.gridTemplateAreas),
    /"aside"/,
  );
  const iframe = page
    .frames()
    .find((f) => f.url().includes("/api/extensions/runner?"));
  assert.ok(iframe);
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector(".sidebar").getBoundingClientRect().top >=
        document.querySelector(".devext-content").getBoundingClientRect()
          .bottom -
          2,
    ),
    true,
    "Aside actually moves below content",
  );

  assert.equal(
    await iframe.evaluate(() => {
      try {
        parent.document.body;
        return false;
      } catch {
        return true;
      }
    }),
    true,
  );
  assert.equal(
    await iframe.evaluate(() => {
      try {
        document.cookie;
        return false;
      } catch {
        return true;
      }
    }),
    true,
  );
  assert.equal(
    await iframe.evaluate(async () => {
      try {
        await fetch("/api/me");
        return false;
      } catch {
        return true;
      }
    }),
    true,
  );
  assert.equal(
    await iframe.evaluate(async () => {
      try {
        await devdevian.data.get("/posts");
        return false;
      } catch (e) {
        return e.message.includes("not granted");
      }
    }),
    true,
  );
  const mode = await page.evaluate(
    () => document.documentElement.dataset.theme,
  );
  await page
    .getByRole("button", {
      name: mode === "dark" ? "Switch to light theme" : "Switch to dark theme",
      exact: true,
    })
    .click();
  await page.waitForFunction(
    (mode) => document.documentElement.dataset.theme !== mode,
    mode,
  );
  assert.equal(await page.locator(".devext-panel").count(), 1);
  assert.equal(
    (
      await page.evaluate(
        async () =>
          await (
            await fetch("/api/extensions/me", {
              headers: { "X-Devdevian-Extensions": "2" },
            })
          ).json(),
      )
    ).enabled.length,
    1,
  );
  // Host styles cannot hide recovery; arbitrary panel code stays in the opaque document.
  await iframe.evaluate(async () => {
    await devdevian.style.apply(
      "body{z-index:2147483647!important;position:fixed!important}.devext-recovery{display:none!important}",
    );
  });
  assert.equal(await page.locator(".devext-recovery").isVisible(), true);
  assert.equal(
    await page
      .locator(".devext-surface")
      .evaluate((e) => getComputedStyle(e).zIndex),
    "0",
  );
  await page
    .getByRole("button", { name: "Disable all extensions", exact: true })
    .click();
  await page.waitForFunction(() => !document.querySelector(".devext-panel"));
  assert.equal(
    await page.locator(".devext-surface").getAttribute("data-extension-layout"),
    null,
  );

  const companion = await buildExtension("examples/extensions/devi-companion");
  await page.evaluate(async (pkg) => {
    const headers = {
      "Content-Type": "application/json",
      "X-Devdevian-Extensions": "2",
    };
    const r = await fetch("/api/extensions/publish", {
      method: "POST",
      headers,
      body: JSON.stringify(pkg),
    });
    const item = await r.json();
    if (!r.ok) throw Error(JSON.stringify(item));
    await fetch("/api/extensions/install", {
      method: "POST",
      headers,
      body: JSON.stringify({
        release: item.id,
        acknowledge_unreviewed: true,
        granted_permissions: item.manifest.permissions,
      }),
    });
  }, companion);
  await page.reload();
  const companionFrame = await page.waitForSelector(
    'iframe[title="Devi Companion sandbox"]',
  );
  const companionScope = page.frameLocator(
    'iframe[title="Devi Companion sandbox"]',
  );
  await companionScope
    .getByRole("button", { name: "Open feed beside me" })
    .click();
  await page
    .frameLocator('iframe[title="Public feed app view"]')
    .getByRole("heading")
    .first()
    .waitFor();
  assert.equal(
    await page
      .frameLocator('iframe[title="Public feed app view"]')
      .locator(".devext-panel")
      .count(),
    0,
  );
  await page
    .getByRole("button", { name: "Disable all extensions", exact: true })
    .click();
  await page.waitForFunction(() => !document.querySelector(".devext-panel"));
  // Restore the package, then bypass it before loading any JS with the recovery URL.
  await page.evaluate(async (id) => {
    await fetch("/api/extensions/install", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        release: id,
        acknowledge_unreviewed: true,
        granted_permissions: ["ui.style", "ui.layout", "ui.panel"],
      }),
    });
  }, result.body.enabled[0].id);
  await page.goto(f.base + "/app?extensions-safe=1#extensions");
  await page.getByText("Safe mode", { exact: true }).waitFor();
  assert.equal(await page.locator(".devext-panel").count(), 0);
  await mkdir(".test-data/extensions-browser", { recursive: true });
  await page.screenshot({
    path: ".test-data/extensions-browser/packages.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "Browser extension checks passed: package upload, opaque runner, SDK grants, layout, day/night, recovery and safe mode.",
  );
} finally {
  await browser.close();
  await f.close();
}
