import { chromium, expect } from "@playwright/test";
import { startTestServer } from "../tests/http-fixture.mjs";
import { seedWritebackConnection } from "../tests/writeback-fixture.mjs";
import { mkdirSync } from "node:fs";
const f = await startTestServer({
  serverEntry: "tests/github-writeback-provider.mjs",
});
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
    }),
    page = await ctx.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const api = async (path, data) => {
    const r = await ctx.request.post(f.base + "/api" + path, { data });
    expect(r.ok(), await r.text()).toBeTruthy();
    return r.json();
  };
  const user = await api("/register", {
    name: "Writeback owner",
    username: "writeback_owner",
    email: "writeback@fixture.test",
    password: "Fixture-password123",
  });
  const me = await (await ctx.request.get(f.base + "/api/me")).json();
  await seedWritebackConnection(f, me.user.id);
  const p = await api("/posts", {
    kind: "question",
    topic: "web",
    title: "A bounded retry strategy",
    body: "We should stop retrying permanent failures.",
  });
  await page.goto(f.base + "/app#post/" + p.id);
  await page
    .getByRole("button", { name: "Send to GitHub", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByLabel("Repository URL", { exact: true })
    .fill("https://github.com/example/repo");
  await page
    .getByLabel("Message · Markdown")
    .fill("Use a clear retry deadline and respect cancellation.");
  await page
    .getByRole("button", { name: "Preview on GitHub", exact: true })
    .click();
  await expect(page.getByText("Publishing as")).toBeVisible();
  await expect(page.getByText("@fixture-owner", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back to edit", exact: true }).click();
  await expect(page.getByLabel("Message · Markdown")).toHaveValue(
    "Use a clear retry deadline and respect cancellation.",
  );
  await page
    .getByRole("button", { name: "Preview on GitHub", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm and send to GitHub", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Open published result ↗" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  mkdirSync(".test-data/github-writeback-browser", { recursive: true });
  await page.screenshot({
    path: ".test-data/github-writeback-browser/mobile.png",
  });
  expect(errors).toEqual([]);
  console.log(
    "Writeback browser: real preview/back/send, exact identity, persisted result, mobile layout; 0 JS errors. Fixture GitHub only.",
  );
} finally {
  await browser?.close();
  await f.close();
}
