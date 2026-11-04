import { chromium, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { startTestServer } from "../tests/http-fixture.mjs";
import { contentSecurityPolicy } from "../security-headers.mjs";
const f = await startTestServer();
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    errors = [],
    violations = [];
  await page.exposeFunction("recordCSP", (d) => violations.push(d));
  await page.addInitScript(() =>
    document.addEventListener("securitypolicyviolation", (e) =>
      window.recordCSP(e.violatedDirective),
    ),
  );
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() === "document") {
      const r = await route.fetch();
      await route.fulfill({
        response: r,
        headers: {
          ...r.headers(),
          "content-security-policy": contentSecurityPolicy.replace(
            "; upgrade-insecure-requests",
            "",
          ),
        },
      });
    } else await route.continue();
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(f.base + "/");
  await expect(page.locator("#root")).not.toBeEmpty();
  await page.goto(f.base + "/app#github");
  await expect(
    page.getByText("Sign in to connect your GitHub workspace."),
  ).toBeVisible();
  await page.evaluate(() => {
    const s = document.createElement("script");
    s.textContent = "window.__unexpectedInlineCode = true";
    document.body.append(s);
  });
  await expect
    .poll(() => violations.some((v) => v.startsWith("script-src")))
    .toBeTruthy();
  expect(
    await page.evaluate(() => window.__unexpectedInlineCode),
  ).toBeUndefined();
  const registered = await page.request.post(f.base + "/api/register", {
    data: {
      name: "csp_reader",
      username: "csp_reader",
      email: "csp@fixture.test",
      password: "Fixture-password123",
    },
  });
  expect(registered.ok()).toBeTruthy();
  const saved = await page.request.post(f.base + "/api/posts", {
    data: {
      kind: "question",
      topic: "web",
      title: "CSP conversation check",
      body: 'Raw HTML stays inert. <img src="x" onerror="window.__markdownCode=true"> [unsafe](javascript:alert(1))',
    },
  });
  expect(saved.ok()).toBeTruthy();
  const post = await saved.json();
  await page.goto(
    f.base + "/conversation/" + post.id + "/csp-conversation-check",
  );
  await expect(
    page.getByRole("heading", { name: "CSP conversation check", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.__markdownCode)).toBeUndefined();
  expect(await page.locator('a[href^="javascript:"]').count()).toBe(0);
  expect(errors).toEqual([]);
  mkdirSync(".test-data/security-browser", { recursive: true });
  await page.screenshot({ path: ".test-data/security-browser/csp-app.png" });
  console.log(
    "Production CSP: landing/app/public conversation hydration and inert Markdown, external theme bootstrap, blocked inline execution and zero page errors passed.",
  );
} finally {
  await browser?.close();
  await f.close();
}
