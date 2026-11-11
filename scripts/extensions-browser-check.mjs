import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { startTestServer } from "../tests/http-fixture.mjs";
const f = await startTestServer({
    extensionReviewer: "reviewer@extensions.test",
  }),
  browser = await chromium.launch({ headless: true });
const dir = ".test-data/extensions-browser";
await mkdir(dir, { recursive: true });
try {
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1080 },
    }),
    page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(f.base + "/app#extensions");
  await page
    .getByRole("heading", { name: "Your space. Your colors." })
    .waitFor();
  await page
    .getByRole("heading", { name: "Amber Night", exact: true })
    .waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    );
  });
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector(".extensions-page").getBoundingClientRect()
          .left >=
        document.querySelector(".sidebar").getBoundingClientRect().right,
    ),
    true,
  );
  await page.screenshot({
    path: dir + "/desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  const register = async (p, name) =>
    p.evaluate(async (name) => {
      const r = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email: name + "@extensions.test",
          password: "Fixture-password123",
        }),
      });
      if (!r.ok) throw Error(await r.text());
    }, name);
  await register(page, "author");
  await page.reload();
  await page.getByRole("heading", { name: "Amber Night", exact: true }).click();
  await page
    .getByRole("button", { name: "Install & apply", exact: true })
    .click();
  await page.getByText("Active: Amber Night · v1.0.0").waitFor();
  assert.equal(
    await page.evaluate(() => document.documentElement.dataset.extension),
    "amber-night",
  );
  assert.equal(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--accent")
        .trim(),
    ),
    "#ffd079",
  );
  await page.reload();
  await page.waitForFunction(
    () => document.documentElement.dataset.extension === "amber-night",
  );
  await page.getByRole("button", { name: "Create a theme" }).click();
  await page
    .getByLabel("Theme name", { exact: true })
    .fill("Browser Test Theme");
  await page
    .getByLabel("Unique slug", { exact: true })
    .fill("browser-test-theme");
  await page
    .getByLabel("Description", { exact: true })
    .fill("A deliberately readable browser test theme.");
  await page.screenshot({
    path: dir + "/editor.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Publish version", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Browser Test Theme", exact: true })
    .waitFor();
  await page
    .getByText("Unreviewed community version", { exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Install & apply", exact: true })
      .isDisabled(),
    true,
  );
  await page
    .getByLabel("I understand this version has not been reviewed by Devdevian.")
    .check();
  await page
    .getByRole("button", { name: "Install & apply", exact: true })
    .click();
  await page.getByText("Active: Browser Test Theme · v1.0.0").waitFor();
  const second = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    other = await second.newPage();
  await other.goto(f.base + "/app#extensions");
  await register(other, "other");
  await other.reload();
  await other
    .getByRole("heading", { name: "Amber Night", exact: true })
    .waitFor();
  assert.equal(
    await other.evaluate(
      () => document.documentElement.dataset.extension || null,
    ),
    null,
  );
  await other.screenshot({
    path: dir + "/mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  assert.equal(
    await other.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    true,
  );
  await page
    .getByRole("button", { name: "Restore default", exact: true })
    .click();
  await page.waitForFunction(() => !document.documentElement.dataset.extension);
  await page.getByRole("tab", { name: "Installed", exact: true }).click();
  await page
    .getByRole("heading", { name: "Browser Test Theme", exact: true })
    .waitFor();
  await page
    .getByRole("heading", { name: "Browser Test Theme", exact: true })
    .click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await page
    .getByRole("heading", { name: "Browser Test Theme", exact: true })
    .waitFor({ state: "hidden" });
  await page.goto(f.base + "/docs/extensions");
  await page
    .getByRole("heading", { name: "Browser extensions: themes", exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.dataset.extension || null,
    ),
    null,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Extensions browser: discovery, preview, publication, trust acknowledgement, account isolation, persistence, reset/removal, docs and mobile overflow passed.",
  );
} finally {
  await browser.close();
  await f.close();
}
