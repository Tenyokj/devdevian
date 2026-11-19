import { chromium, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { startTestServer } from "../tests/http-fixture.mjs";
const f = await startTestServer(),
  browser = await chromium.launch({ headless: true });
const artifacts = ".test-data/devlogs-browser";
mkdirSync(artifacts, { recursive: true });
try {
  const owner = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    peer = await browser.newContext();
  for (const [c, name] of [
    [owner, "devlogs_browser_owner"],
    [peer, "devlogs_browser_peer"],
  ]) {
    const r = await c.request.post(f.base + "/api/register", {
      data: {
        name,
        username: name,
        email: name + "@fixture.test",
        password: "Fixture-password123",
      },
    });
    expect(r.status()).toBe(200);
  }
  const p = await (
    await owner.request.post(f.base + "/api/projects", {
      data: {
        name: "Orbit Devlogs",
        description: "A clear story of progress and useful changes.",
        topic: "web",
        stage: "Prototype",
        help: "Review the retry policy.",
      },
    })
  ).json();
  const page = await owner.newPage(),
    other = await peer.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  other.on("pageerror", (e) => errors.push(e.message));
  await page.goto(f.base + `/app#workspace/${p.id}/devlogs`);
  await page
    .getByRole("button", { name: "Write a Devlog", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Title", { exact: true })
    .fill("A safer retry boundary");
  await dialog
    .getByLabel("Update", { exact: true })
    .fill(
      "We separated **transient failures** from permanent ones.\n\n[Read the PR](https://github.com/example/orbit/pull/1)",
    );
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Write a Devlog", exact: true })
    .click();
  await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue(
    "A safer retry boundary",
  );
  await dialog.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(
    dialog.getByText("transient failures", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Back to writing", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "A safer retry boundary" }),
  ).toBeVisible();
  await other.goto(f.base + `/app#workspace/${p.id}/devlogs`);
  await expect(
    other.getByRole("heading", { name: "Every project has a story." }),
  ).toBeVisible();
  await expect(
    other.getByRole("button", { name: "My drafts", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "My drafts", exact: true }).click();
  await page.getByRole("button", { name: "Edit Devlog", exact: true }).click();
  await dialog.getByRole("button", { name: "Preview", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Publish Devlog", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "A safer retry boundary" }),
  ).toBeVisible();
  await other.reload();
  await expect(
    other.getByRole("heading", { name: "A safer retry boundary" }),
  ).toBeVisible();
  await page.screenshot({ path: artifacts + "/desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "A safer retry boundary" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await page.screenshot({ path: artifacts + "/mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await page.screenshot({ path: artifacts + "/dark.png", fullPage: true });
  expect(errors).toEqual([]);
  console.log(
    "Devlogs browser: draft recovery, preview, publish, permissions, mobile passed.",
  );
} finally {
  await browser.close();
  await f.close();
}
