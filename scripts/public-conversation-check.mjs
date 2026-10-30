import { chromium, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { startTestServer } from "../tests/http-fixture.mjs";
import { conversationPath } from "../conversation-url.mjs";
const f = await startTestServer();
let browser;
try {
  const author = f.client();
  await author("/register", {
    name: "Morgan Author",
    email: "author@public-browser.test",
    password: "Fixture-password123",
  });
  const reader = f.client();
  await reader("/register", {
    name: "Riley Reader",
    email: "reader@public-browser.test",
    password: "Fixture-password123",
  });
  const p = (
    await author("/posts", {
      title: "How should we bound retries across a service boundary?",
      body: "I’m looking for a second pair of eyes on a **bounded retry** strategy.\n\n## What matters\n\n- A useful timeout\n- Clear failures\n\nWhat would you change?",
      code: "export async function loadResource() {\n  const response = await fetch('/resource');\n  if (!response.ok) throw new Error('Request failed');\n  return response.json();\n}",
      review_focus: "Check how the timeout and retry budget interact.",
      topic: "web",
      kind: "review",
      stack: "TypeScript,Node.js",
    })
  ).data;
  // Disposable fixture rows avoid exercising publication quotas during setup.
  const db = new DatabaseSync(f.path);
  for (let i = 0; i < 11; i++)
    db.prepare("INSERT INTO replies(user_id,post_id,body) VALUES(?,?,?)").run(
      p.user_id,
      p.id,
      "A fixture reply about explicit deadlines.",
    );
  db.close();
  const path = conversationPath(p);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    timezoneId: "Europe/Kyiv",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /hydration|Minified React error/.test(message.text())
    )
      errors.push(message.text());
  });
  const staticContext = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await staticContext.newPage();
  await staticPage.goto(f.base + path);
  await expect(staticPage.getByRole("heading", { level: 1 })).toHaveText(
    p.title,
  );
  await expect(staticPage.locator(".public-code")).toContainText(
    "export async function",
  );
  await expect(staticPage.locator(".public-reply")).toHaveCount(10);
  await staticPage.getByRole("link", { name: "Next", exact: true }).click();
  await expect(staticPage.locator(".public-reply")).toHaveCount(1);
  await staticContext.close();
  await page.goto(f.base + path);
  await expect(
    page.getByRole("button", { name: "Sign in to reply", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Sign in to reply", exact: true })
    .click();
  await page
    .locator(".auth-modal input[name=email]")
    .fill("reader@public-browser.test");
  await page
    .locator(".auth-modal input[name=password]")
    .fill("Fixture-password123");
  await page
    .locator(".auth-modal")
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await expect(page.getByLabel("Your reply", { exact: true })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(path);
  await page
    .getByLabel("Your reply", { exact: true })
    .fill("A real reply written on the new public conversation page.");
  await page.getByRole("button", { name: "Post reply", exact: true }).click();
  await expect(page.locator(".public-reply")).toContainText([
    "A fixture reply",
    "A real reply written",
  ]);
  const saved = await author("/posts/" + p.id + "?reply_page=2");
  expect(
    saved.data.replies.some((reply) =>
      reply.body.includes("A real reply written"),
    ),
  ).toBeTruthy();
  const firstReply = (await author("/posts/" + p.id)).data.replies[0];
  const returnPath = path + "?reply=1&reply_to=" + firstReply.id + "#reply";
  // Same-tab OAuth completion must return to the intended public conversation.
  await page.evaluate(
    (destination) =>
      sessionStorage.setItem(
        "devdevian-conversation-return",
        JSON.stringify({ path: destination, expires: Date.now() + 600000 }),
      ),
    returnPath,
  );
  await page.goto(f.base + "/app#profile");
  await expect(page).toHaveURL(f.base + returnPath);
  await expect(page.getByLabel("Your reply", { exact: true })).toBeFocused();
  await expect(page.locator(".public-parent")).toContainText("Morgan Author");
  mkdirSync(".test-data/browser", { recursive: true });
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (value) => localStorage.setItem("devdevian-theme", value),
      theme,
    );
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(f.base + path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(p.title);
      expect(
        await page
          .locator("main")
          .evaluate((node) => getComputedStyle(node).animationName),
      ).toBe("none");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
      const contrast = await page.locator(".public-code").evaluate((panel) => {
        const luminance = (color) => {
          const [r, g, b] = color
            .match(/[\d.]+/g)
            .slice(0, 3)
            .map(Number)
            .map((channel) => {
              const v = channel / 255;
              return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const fg = luminance(
          getComputedStyle(panel.querySelector("code")).color,
        );
        const bg = luminance(getComputedStyle(panel).backgroundColor);
        return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
      });
      expect(contrast).toBeGreaterThanOrEqual(4.5);
      await page.screenshot({
        path: `.test-data/browser/public-conversation-${theme}-${width}.png`,
        fullPage: true,
      });
    }
  }
  // Existing app links and share controls remain available on the original route.
  await page.goto(f.base + "/app#post/" + p.id);
  await expect(page.locator(".post-detail h1")).toHaveText(p.title);
  await page.evaluate(() => {
    window.__shared = null;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value) => {
          window.__shared = value;
        },
      },
    });
  });
  await page.getByRole("button", { name: "Share", exact: true }).click();
  expect(await page.evaluate(() => window.__shared)).toBe(f.base + path);
  expect(errors).toEqual([]);
  console.log(
    "Public conversation browser checks passed: SSR/no-JS, pagination, inline sign-in/reply, OAuth return, legacy sharing, both themes and responsive layouts.",
  );
} finally {
  await browser?.close();
  await f.close();
}
