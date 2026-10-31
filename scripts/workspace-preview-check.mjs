import { createServer } from "vite";
import { chromium, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
const root = fileURLToPath(
  new URL("../prototypes/workspaces", import.meta.url),
);
const server = await createServer({
  configFile: false,
  root,
  logLevel: "error",
  server: {
    host: "127.0.0.1",
    port: 0,
    fs: { allow: [fileURLToPath(new URL("..", import.meta.url))] },
  },
});
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const artifacts = ".test-data/workspaces-preview";
await mkdir(artifacts, { recursive: true });
let browser;
const errors = [],
  apiRequests = [];
try {
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/"))
      apiRequests.push(r.url());
  });
  await page.goto(base);
  await expect(
    page.getByRole("heading", { name: "Orbit Queue", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".toast")).not.toHaveClass(/visible/);
  await page.screenshot({
    path: artifacts + "/overview-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Open review", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Make retries safe under timeouts",
      exact: true,
    }),
  ).toBeVisible();
  const oldQuote = await page
    .getByTestId("thread-1")
    .locator("pre")
    .innerText();
  await page
    .getByLabel("Your remark", { exact: false })
    .fill("Use an idempotency key for writes.");
  await page.getByRole("button", { name: "Add remark", exact: true }).click();
  await expect(page.getByTestId("thread-3")).toContainText(
    "Use an idempotency key",
  );
  await page
    .getByRole("button", { name: "Share revision v2", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "v2 is current", exact: true }),
  ).toBeDisabled();
  await expect(page.getByTestId("thread-1")).toContainText("Earlier");
  await expect(page.getByTestId("thread-1").locator("pre")).toHaveText(
    oldQuote,
  );
  await expect(page.locator(".summary-counts")).toContainText("3 earlier");
  await expect(page.locator(".code-row.added").first()).toBeVisible();
  await page
    .getByTestId("thread-1")
    .getByRole("button", { name: "View v1", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Comment on line 6", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".code-row.selected")).toContainText(oldQuote);
  await page.getByRole("button", { name: "v2 Current", exact: true }).click();
  await page
    .getByRole("button", { name: "test/retry.test.ts M", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Comment on line 2", exact: true })
    .click();
  await page
    .getByLabel("Your remark", { exact: false })
    .fill("Also check the original error identity.");
  await page.getByRole("button", { name: "Add remark", exact: true }).click();
  await expect(page.getByTestId("thread-4")).toContainText("v2");
  await page
    .getByTestId("thread-4")
    .getByRole("button", { name: "Mark addressed", exact: true })
    .click();
  await expect(page.locator(".summary-counts")).toContainText("1 resolved");
  await page
    .getByRole("textbox", { name: "Reply to remark 1", exact: true })
    .fill("v2 makes the retry predicate explicit.");
  await page
    .getByRole("button", { name: "Send reply to remark 1", exact: true })
    .click();
  await expect(page.getByTestId("thread-1")).toContainText(
    "v2 makes the retry predicate explicit.",
  );
  await expect(page.locator(".toast")).not.toHaveClass(/visible/);
  await page.screenshot({
    path: artifacts + "/review-v2-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Work requests", exact: false })
    .click();
  await page.getByRole("button", { name: "Help wanted", exact: true }).click();
  await expect(page.locator(".request-row")).toHaveCount(1);
  await page
    .getByRole("textbox", { name: "Find a request", exact: true })
    .fill("no-such-request");
  await expect(
    page.getByRole("heading", { name: "No requests match." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await page.getByRole("button", { name: "New request", exact: true }).click();
  await page
    .getByLabel("A clear next step", { exact: true })
    .fill("Help benchmark queue shutdown");
  await page
    .getByLabel("A little context", { exact: true })
    .fill("Measure the drain behavior under a small bounded workload.");
  await page
    .getByRole("button", { name: "Create request", exact: false })
    .click();
  await expect(page.locator(".request-row")).toHaveCount(5);
  const row = page
    .locator(".request-row")
    .filter({ hasText: "Help benchmark queue shutdown" });
  await row.click();
  await page
    .getByRole("combobox", { name: "Request status", exact: true })
    .selectOption("In progress");
  await page
    .getByLabel("Your message", { exact: true })
    .fill("I can measure the worker deadline.");
  await page
    .getByRole("button", { name: "Add a message", exact: false })
    .click();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await row.click();
  await expect(page.getByRole("dialog")).toContainText(
    "I can measure the worker deadline.",
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.keyboard.press("Control+k");
  await page
    .getByRole("textbox", { name: "Search workspace", exact: true })
    .fill("Context");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Context & decisions", exact: false })
    .click();
  await page
    .getByRole("button", { name: "Pin a decision", exact: false })
    .click();
  await page
    .getByLabel("Decision title", { exact: true })
    .fill("Keep shutdown bounded");
  await page
    .getByLabel("The reason behind it", { exact: true })
    .fill("Give active work a deadline before closing connections.");
  await page
    .getByRole("button", { name: "Pin decision", exact: false })
    .click();
  await expect(page.locator(".decision-card")).toHaveCount(3);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Activity", exact: false })
    .click();
  await page
    .getByRole("button", { name: "Mark as seen", exact: false })
    .click();
  await expect(page.locator(".activity-summary")).toContainText(
    "You’re all caught up",
  );
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Overview", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Terminal view", exact: true })
    .click();
  const terminal = page.getByRole("group", {
    name: "Terminal concept",
    exact: true,
  });
  await terminal.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", {
      name: "Make retries safe under timeouts",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  for (const width of [1440, 1024, 768, 390, 360]) {
    await page.setViewportSize({ width, height: 950 });
    for (const section of [
      "overview",
      "review",
      "work",
      "decisions",
      "activity",
    ]) {
      if (width <= 1024)
        await page
          .getByRole("button", { name: "Toggle navigation", exact: true })
          .click();
      const label = {
        overview: "Overview",
        review: "Code review",
        work: "Work requests",
        decisions: "Context & decisions",
        activity: "Activity",
      }[section];
      await page
        .getByRole("navigation")
        .getByRole("button", {
          name: label,
          exact: section === "overview" || section === "review",
        })
        .click();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        section + " overflow at " + width,
      ).toBeTruthy();
      await expect(page.locator("main h1")).toBeVisible();
      if (
        [1440, 390].includes(width) &&
        ["overview", "review"].includes(section)
      ) {
        await expect(page.locator(".toast")).not.toHaveClass(/visible/);
        await page.screenshot({
          path: artifacts + `/${section}-${width}.png`,
          fullPage: true,
          animations: "disabled",
        });
      }
    }
  }
  await page
    .getByRole("button", { name: "Toggle navigation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reset sample workspace", exact: false })
    .click();
  await expect(
    page.getByRole("heading", { name: "Orbit Queue", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".dialog")).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(apiRequests).toEqual([]);
  console.log(
    "Workspaces concept passed: revisions/quotes, requests/replies, decisions, activity, terminal navigation, keyboard, reset and five viewport sizes. No forum API requests.",
  );
} catch (error) {
  if (browser)
    for (const context of browser.contexts())
      for (const page of context.pages())
        await page
          .screenshot({
            path: artifacts + "/failure.png",
            animations: "disabled",
          })
          .catch(() => {});
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
