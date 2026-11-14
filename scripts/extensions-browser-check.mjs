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
  let devBuild = structuredClone(pkg);
  await page.route("**/api/extensions/development", (route) =>
    route.fulfill({ json: devBuild }),
  );
  // Preview must round-trip the entire publication draft, even from another route.
  await page.getByLabel("I trust this code", { exact: false }).check();
  await page.getByLabel("Live preview (local server only)").check();
  await page
    .getByRole("button", { name: "Preview in my app", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector(".devext-surface")?.dataset.extensionLayout ===
      "true",
  );
  devBuild = structuredClone(pkg);
  devBuild.build = "updated-source";
  devBuild.manifest.files["main.js"] +=
    '\ndocument.body.dataset.updatedDraft="yes";';
  let updated = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    await page.waitForTimeout(250);
    const frame = page
      .frames()
      .find((f) => f.url().includes("/api/extensions/runner?"));
    if (
      frame &&
      (await frame
        .evaluate(() => document.body.dataset.updatedDraft === "yes")
        .catch(() => false))
    ) {
      updated = true;
      break;
    }
  }
  assert.ok(updated, "Live code should update before returning to the draft");
  await page.evaluate(() => {
    location.hash = "feed";
  });
  await page.evaluate(() => (location.hash = "extensions"));
  await page.getByRole("button", { name: "Stop preview", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Publish an extension", exact: true })
    .waitFor();
  assert.equal(
    await page.getByLabel("Full description", { exact: true }).inputValue(),
    "## A complete extension\n\nSetup instructions and useful details.",
  );
  assert.equal(
    await page.getByLabel("Extension tags").inputValue(),
    "theme, productivity",
  );
  assert.equal(
    await page.getByLabel("I trust this code", { exact: false }).isChecked(),
    false,
    "Restored code needs renewed preview consent",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Remove screenshot 1", exact: true })
      .count(),
    1,
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.reload();
  assert.equal(
    await page.locator(".devext-panel").count(),
    0,
    "Draft reload must not execute saved code",
  );
  await page
    .getByRole("button", { name: "Upload extension", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Extension name", { exact: true }).inputValue(),
    "Studio Shell",
  );
  assert.equal(
    await page.getByLabel("Extension tags").inputValue(),
    "theme, productivity",
  );
  assert.equal(
    await page.evaluate(() =>
      JSON.parse(
        Object.entries(localStorage).find(([k]) =>
          k.startsWith("devdevian-extension-draft:"),
        )[1],
      ).pkg.manifest.files["main.js"].includes("updatedDraft"),
    ),
    true,
    "Restored draft keeps the updated live source",
  );
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
  assert.equal(
    await page.evaluate(
      () =>
        Object.keys(localStorage).filter((k) =>
          k.startsWith("devdevian-extension-draft:"),
        ).length,
    ),
    0,
    "Published draft must be removed",
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const code = page.locator(".extension-sdk-example");
    assert.match(await code.innerText(), /placement: "right"/);
    assert.ok(
      await code
        .locator("span")
        .first()
        .evaluate(
          (e) =>
            getComputedStyle(e).display === "inline" &&
            getComputedStyle(e).paddingTop === "0px",
        ),
      "Code tokens must not inherit large tile styling",
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => (location.hash = "profile"));
  await page
    .locator(".profile-tabs")
    .getByRole("button", { name: "Extensions", exact: true })
    .click();
  await page
    .getByRole("region", { name: "My extensions" })
    .getByRole("button", { name: /Studio Shell/ })
    .click();
  await page
    .getByRole("dialog", { name: "Studio Shell", exact: true })
    .waitFor();
  assert.match(page.url(), /#extensions\/theme-/);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: /Find your next idea/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Extensions", exact: true })
    .click();
  await page.getByLabel("Search all Devdevian").fill("productivity");
  await page
    .locator(".search-result")
    .filter({ hasText: "Studio Shell" })
    .click();
  await page
    .getByRole("dialog", { name: "Studio Shell", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
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
  await iframe.evaluate(async () => {
    await devdevian.style.apply(
      ".modal{background:rgb(12, 80, 65)!important}.notification-item{color:cyan!important}",
    );
  });
  await page
    .getByRole("button", { name: "Upload extension", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("dialog", { name: "Publish an extension", exact: true })
      .evaluate((el) => getComputedStyle(el).backgroundColor),
    "rgb(12, 80, 65)",
    "Body portals must support extension styles",
  );
  assert.equal(await page.locator(".devext-recovery").isVisible(), true);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
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
  await page.evaluate(() => (location.hash = "extensions"));
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
  await page.evaluate(() => (location.hash = "feed"));
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
  await page.evaluate(() => (location.hash = "extensions"));
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
  // The first-party starter is real interactive code, without network/data grants.
  await page.evaluate(() => (location.hash = "extensions"));
  await page
    .getByRole("button", { name: "Disable all extensions", exact: true })
    .click();
  await page.goto(f.base + "/app#extensions");
  await page
    .getByRole("button", { name: "Upload extension", exact: true })
    .click();
  await page.getByRole("button", { name: "Load Focus Desk example" }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('[aria-label="Extension name"]').value ===
      "Focus Desk",
  );
  await page.getByLabel("I trust this code", { exact: false }).check();
  await page.getByRole("button", { name: "Preview in my app" }).click();
  const focus = page.frameLocator('iframe[title="Focus Desk sandbox"]');
  await focus.getByRole("heading", { name: "Focus Desk" }).waitFor();
  await focus
    .getByLabel("A note for your next step")
    .fill("Ship the extension workflow");
  await focus.getByText("Saved on this device.", { exact: true }).waitFor();
  await focus.getByRole("button", { name: "Start", exact: true }).click();
  await focus.getByRole("button", { name: "Pause", exact: true }).waitFor();
  await focus
    .getByRole("button", { name: "Take a break", exact: true })
    .click();
  assert.equal(await focus.locator("#time").innerText(), "05:00");
  await page.evaluate(() => (location.hash = "extensions"));
  await page.getByRole("button", { name: "Stop preview", exact: true }).click();
  await page.getByLabel("I trust this code", { exact: false }).check();
  await page.getByRole("button", { name: "Preview in my app" }).click();
  await focus.getByLabel("A note for your next step").waitFor();
  await page.waitForTimeout(200);
  assert.equal(
    await focus.getByLabel("A note for your next step").inputValue(),
    "Ship the extension workflow",
  );
  await mkdir(".test-data/extensions-browser", { recursive: true });
  await page.screenshot({
    path: ".test-data/extensions-browser/focus-desk.png",
    fullPage: true,
  });
  await page.evaluate(() => (location.hash = "extensions"));
  await page.getByRole("button", { name: "Stop preview", exact: true }).click();
  await page.getByRole("button", { name: "Publish immutable package" }).click();
  await page.getByRole("dialog", { name: "Focus Desk", exact: true }).waitFor();
  const updateCase = await page.evaluate(async () => {
    const library = await fetch("/api/extensions/library?format=2").then((r) =>
      r.json(),
    );
    const old = library.items.find((x) => x.slug === "focus-desk");
    const install = await fetch("/api/extensions/install?format=2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        release: old.id,
        acknowledge_unreviewed: true,
        granted_permissions: old.manifest.permissions,
      }),
    });
    if (!install.ok) throw Error(await install.text());
    const manifest = structuredClone(old.manifest);
    manifest.permissions.push("ui.commands");
    manifest.files[manifest.entry] +=
      ';devdevian.commands.register({id:"updated",title:"Updated command",shortcut:"Alt+Shift+U"},()=>{document.getElementById("save-status").textContent="Updated command works.";});';
    const newer = await fetch("/api/extensions/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: old.name,
        slug: old.slug,
        description: old.description,
        version: "1.1.0",
        listing: {
          ...old.listing,
          changelog: "Added an explicit SDK command.",
        },
        manifest,
      }),
    }).then((r) => r.json());
    return { old: old.id, newer: newer.id };
  });
  await page.reload();
  await page.getByRole("tab", { name: "Updates", exact: true }).click();
  await page
    .getByRole("button", { name: "Review update", exact: true })
    .click();
  const updateModal = page.getByRole("dialog", {
    name: "Update Focus Desk",
    exact: true,
  });
  await updateModal.getByText("ui.commands", { exact: true }).waitFor();
  assert.equal(
    await updateModal
      .getByRole("button", { name: "Confirm update", exact: true })
      .isDisabled(),
    true,
  );
  await updateModal
    .getByLabel("I reviewed this version", { exact: false })
    .check();
  await updateModal
    .getByRole("button", { name: "Confirm update", exact: true })
    .click();
  await page
    .getByText("All installed extensions are up to date.", { exact: true })
    .waitFor();
  await page.evaluate(() => (location.hash = "extensions"));
  await page.getByRole("button", { name: "⌘ Focus Desk", exact: true }).click();
  await page.getByRole("button", { name: /Updated command/ }).click();
  await page.evaluate(() => (location.hash = "feed"));
  await page
    .frameLocator('iframe[title="Focus Desk sandbox"]')
    .getByText("Updated command works.", { exact: true })
    .waitFor();
  const changed = await page.evaluate(() =>
    fetch("/api/extensions/me?format=2").then((r) => r.json()),
  );
  assert.equal(changed.enabled[0].id, updateCase.newer);
  assert.ok(!changed.installed.some((x) => x.id === updateCase.old));
  await page.evaluate(
    (id) => (location.hash = "extensions/" + id),
    updateCase.newer,
  );
  const detail = page.getByRole("dialog", { name: "Focus Desk", exact: true });
  await detail.getByText("Version history", { exact: true }).click();
  await detail
    .getByText("Added an explicit SDK command.", { exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "Browser extension checks passed: package upload, opaque runner, SDK grants, layout, day/night, recovery and safe mode.",
  );
} finally {
  await browser.close();
  await f.close();
}
