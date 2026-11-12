import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { startTestServer } from "../tests/http-fixture.mjs";
const f = await startTestServer({ ownerEmail: "owner@fixture.test" }),
  browser = await chromium.launch({ headless: true });
try {
  const owner = f.client(),
    author = f.client();
  for (const [client, n] of [
    [owner, "owner"],
    [author, "author"],
  ])
    await client("/register", {
      name: n,
      email: n + "@fixture.test",
      password: "Fixture-password123",
    });
  await f.verifyEmail("owner@fixture.test");
  const p = {
    name: "Host Style Review Probe",
    slug: "host-style-review-probe",
    version: "1.0.0",
    description:
      "Checks that installed host styles cannot hide the owner console.",
    manifest: {
      schema: 2,
      kind: "extension",
      permissions: ["ui.panel", "ui.style"],
      entry: "main.js",
      files: {
        "main.js": 'document.body.textContent="Extension panel active";',
      },
      styles: {
        dark: ".platform-console {display:none}",
        light: ".platform-console {display:none}",
      },
    },
  };
  const created = await author("/extensions/publish", p);
  assert.equal(created.status, 201);
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(f.base + "/app#feed");
  await page.evaluate(async () => {
    const r = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "owner@fixture.test",
        password: "Fixture-password123",
      }),
    });
    if (!r.ok) throw Error(await r.text());
  });
  await page.reload();
  await page
    .getByRole("link", { name: "Owner console", exact: true })
    .waitFor();
  await page.evaluate(async (id) => {
    const r = await fetch("/api/extensions/install?format=2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        release: id,
        acknowledge_unreviewed: true,
        granted_permissions: ["ui.panel", "ui.style"],
      }),
    });
    if (!r.ok) throw Error(await r.text());
    window.dispatchEvent(new Event("devdevian-extensions"));
  }, created.data.id);
  await page.waitForFunction(
    () =>
      document.querySelectorAll('iframe[sandbox="allow-scripts"]').length > 0,
  );
  await page.getByRole("link", { name: "Owner console", exact: true }).click();
  await page.getByRole("heading", { name: "Trust is a decision." }).waitFor();
  await page.waitForFunction(
    () =>
      document.querySelectorAll('iframe[sandbox="allow-scripts"]').length === 0,
  );
  assert.equal(
    await page.locator(".platform-console").isVisible(),
    true,
    "host styles cannot hide the console",
  );
  await page
    .getByRole("button", { name: "Inspect version", exact: true })
    .click();
  await page.getByText("All package sources (never executed here)").waitFor();
  await page
    .getByLabel("Decision note", { exact: true })
    .fill("Inspected all included files in this fixture.");
  assert.equal(
    await page
      .getByRole("button", { name: "Mark reviewed", exact: true })
      .isEnabled(),
    false,
  );
  await page
    .getByLabel(
      "I inspected every source file and the declared capabilities of this exact version.",
    )
    .check();
  await page
    .getByRole("button", { name: "Mark reviewed", exact: true })
    .click();
  await page
    .getByText("Current state:", { exact: false })
    .filter({ hasText: "reviewed" })
    .waitFor();
  const consoleBox = await page.locator(".platform-console").boundingBox();
  assert.ok(
    consoleBox.x >= 250,
    "Owner content keeps the normal app shell layout",
  );
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await mkdir(".test-data/platform-owner", { recursive: true });
  await page.screenshot({
    path: ".test-data/platform-owner/console.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByLabel("Decision note", { exact: true })
    .fill("Withdrawn for fixture validation.");
  await page
    .getByRole("button", { name: "Withdraw & disable version", exact: true })
    .click();
  await page
    .getByText("Current state:", { exact: false })
    .filter({ hasText: "withdrawn" })
    .waitFor();
  await page
    .getByRole("button", { name: "Public content", exact: true })
    .click();
  await page.getByLabel("Search public content").waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "Owner console has no mobile horizontal overflow",
  );
  await page.screenshot({
    path: ".test-data/platform-owner/mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  const other = await browser.newPage();
  await other.goto(f.base + "/app#platform");
  await other.getByRole("heading", { name: "Owner access only" }).waitFor();
  assert.equal(
    await other
      .getByRole("link", { name: "Owner console", exact: true })
      .count(),
    0,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Owner console browser checks passed: restricted access, extension suspension, source inspection, consent and exact-version decisions.",
  );
} finally {
  await browser.close();
  await f.close();
}
