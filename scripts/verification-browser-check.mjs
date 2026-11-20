import { chromium, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { startTestServer } from "../tests/http-fixture.mjs";
const f = await startTestServer({ ownerEmail: "owner@fixture.test" });
let browser;
try {
  const owner = f.client(),
    member = f.client();
  const a = (
    await owner("/register", {
      name: "Founder Fixture",
      email: "owner@fixture.test",
      password: "Fixture-password123",
    })
  ).data.user;
  const b = (
    await member("/register", {
      name: "Member Fixture",
      email: "member@fixture.test",
      password: "Fixture-password123",
    })
  ).data.user;
  await f.verifyEmail("owner@fixture.test");
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    p = await context.newPage(),
    errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await context.request.post(f.base + "/api/login", {
    data: { email: "owner@fixture.test", password: "Fixture-password123" },
  });
  await p.goto(f.base + "/app#profile");
  await expect(
    p.getByRole("img", { name: "Devdevian founder", exact: true }),
  ).toBeVisible();
  await expect(p.locator(".identity-founder")).toHaveText("Founder");
  await p.getByRole("link", { name: "Owner console", exact: true }).click();
  await p
    .getByRole("button", { name: "Verified profiles", exact: true })
    .click();
  await p.getByPlaceholder("@username or name").fill(b.username);
  await p.getByRole("button", { name: "Search profiles", exact: true }).click();
  p.on("dialog", (d) => d.accept());
  await p
    .getByRole("button", { name: "Grant verification", exact: true })
    .click();
  await expect(
    p.getByRole("button", { name: "Remove verification", exact: true }),
  ).toBeVisible();
  const visitor = await browser.newPage();
  await visitor.goto(f.base + "/app#member/" + b.id);
  await expect(
    visitor.getByRole("img", { name: "Verified by Devdevian", exact: true }),
  ).toBeVisible();
  await p
    .getByRole("button", { name: "Remove verification", exact: true })
    .click();
  await expect(
    p.getByRole("button", { name: "Grant verification", exact: true }),
  ).toBeVisible();
  await visitor.reload();
  await expect(
    visitor.locator(".profile-identity-name .identity-verified"),
  ).toHaveCount(0);
  await p.goto(f.base + "/app#profile");
  await p.setViewportSize({ width: 390, height: 844 });
  await expect(
    p.getByRole("img", { name: "Devdevian founder", exact: true }),
  ).toBeVisible();
  expect(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  mkdirSync(".test-data/verification-browser", { recursive: true });
  await p.screenshot({ path: ".test-data/verification-browser/mobile.png" });
  expect(errors).toEqual([]);
  console.log(
    "Verification browser: founder identity, owner grant/revoke, visitor badge, mobile and no JS errors passed.",
  );
} finally {
  await browser?.close();
  await f.close();
}
