import { chromium, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { startTestServer } from "../tests/http-fixture.mjs";
import { seedInsights } from "../tests/insights-fixture.mjs";
import { openDatabase } from "../database.mjs";
const f = await startTestServer();
let browser;
try {
  const s = await seedInsights(f),
    db = await openDatabase({ DB_PATH: f.path });
  db.prepare("UPDATE users SET username='livepeer' WHERE id=?").run(s.other);
  db.close();
  browser = await chromium.launch({ headless: true });
  const owner = await browser.newContext({
      viewport: { width: 1680, height: 1100 },
    }),
    peer = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    p = await owner.newPage(),
    q = await peer.newPage(),
    errors = [];
  for (const page of [p, q])
    page.on("pageerror", (e) => errors.push(e.message));
  for (const [ctx, email] of [
    [owner, "insightauthor@insights.test"],
    [peer, "anotherdeveloper@insights.test"],
  ]) {
    const r = await ctx.request.post(f.base + "/api/login", {
      data: { email, password: "Fixture-password123" },
    });
    expect(r.ok(), await r.text()).toBeTruthy();
  }
  await p.goto(f.base + "/app#post/" + s.publicId);
  await p.getByRole("button", { name: "Live sessions", exact: true }).click();
  await p.getByRole("button", { name: "Start a session", exact: true }).click();
  await p.getByLabel("Session title").fill("Cancellation, together");
  await p.getByLabel("Starting code").fill("const retries = 2;\n");
  await p
    .getByRole("button", { name: "Open Live workspace", exact: true })
    .click();
  await expect(
    p.getByRole("heading", { name: "Cancellation, together", exact: true }),
  ).toBeVisible();
  const url = p.url();
  await p.getByRole("button", { name: /People \(/ }).click();
  await p.getByPlaceholder("@developer").fill("livepeer");
  await p
    .getByRole("button", { name: "Invite participant", exact: true })
    .click();
  await expect(
    p.getByText("Invitation ready.", { exact: false }),
  ).toBeVisible();
  await q.goto(url);
  await q.getByRole("button", { name: /^Notifications/ }).click();
  await expect(
    q.getByText("invited you to a Live session", { exact: false }),
  ).toBeVisible();
  await q
    .locator(".notification-item")
    .filter({ hasText: "Cancellation, together" })
    .click();
  await expect(
    q.getByRole("heading", { name: "Cancellation, together", exact: true }),
  ).toBeVisible();
  const a = p.getByRole("textbox", { name: "Shared code editor", exact: true }),
    b = q.getByRole("textbox", { name: "Shared code editor", exact: true });
  await expect(a).toHaveText("const retries = 2;");
  await expect(b).toHaveText("const retries = 2;");
  await a.click();
  await a.press("ControlOrMeta+End");
  await a.press("Enter");
  await a.pressSequentially("// owner: preserve cancellation", { delay: 8 });
  await b.click();
  await b.press("ControlOrMeta+Home");
  await b.pressSequentially("// peer: retry only safe operations\n", {
    delay: 8,
  });
  await expect(a).toContainText("peer: retry only safe operations", {
    timeout: 15000,
  });
  await expect(b).toContainText("owner: preserve cancellation", {
    timeout: 15000,
  });
  const codeText = (editor) =>
    editor.evaluate((el) =>
      [...el.querySelectorAll(".cm-line")]
        .map((line) => {
          const clone = line.cloneNode(true);
          clone
            .querySelectorAll(".cm-ySelectionCaret")
            .forEach((node) => node.remove());
          return clone.textContent;
        })
        .join("\n"),
    );
  await expect.poll(async () => await codeText(a)).toBe(await codeText(b));
  await expect(p.locator(".cm-ySelectionCaret")).toHaveCount(1, {
    timeout: 15000,
  });
  await q
    .getByLabel("Message the session")
    .fill("We should stop retrying when the signal aborts.");
  await q.getByRole("button", { name: "Send message", exact: true }).click();
  await p.getByRole("button", { name: "Conversation", exact: true }).click();
  await expect(
    p.getByText("We should stop retrying when the signal aborts.", {
      exact: true,
    }),
  ).toBeVisible({ timeout: 15000 });
  await p
    .getByRole("button", { name: "Compare original", exact: true })
    .click();
  await expect(
    p.getByRole("heading", { name: "Starting point", exact: true }),
  ).toBeVisible();
  await p.getByRole("button", { name: "Shared editor", exact: true }).click();
  mkdirSync(".test-data/live-browser", { recursive: true });
  await p.waitForTimeout(500);
  await p.screenshot({ path: ".test-data/live-browser/desktop.png" });
  // Temporary disconnection keeps the editor and pending changes alive.
  await peer.setOffline(true);
  await b.click();
  await b.press("ControlOrMeta+End");
  await b.pressSequentially("\n// offline note", { delay: 5 });
  await q.waitForTimeout(1500);
  await peer.setOffline(false);
  await expect(a).toContainText("offline note", { timeout: 30000 });
  // Only sync is interrupted: reload can fetch an authorized fresh snapshot.
  // A local recovery is not silently applied, and restoring preserves peer edits.
  await q.route("**/api/live/*/sync", (route) => route.abort());
  await b.click();
  await b.press("ControlOrMeta+End");
  await b.pressSequentially("\n// recovered after reload", { delay: 5 });
  await q.waitForTimeout(250);
  q.on("dialog", (dialog) => dialog.accept());
  await q.reload();
  await expect(
    q.getByRole("button", { name: "Review local changes" }),
  ).toBeVisible();
  await expect(b).not.toContainText("recovered after reload");
  await a.click();
  await a.press("ControlOrMeta+End");
  await a.pressSequentially("\n// changed while disconnected", { delay: 5 });
  await expect(
    p
      .locator(".live-connection")
      .filter({ hasText: "Connected · changes sync in a few seconds" }),
  ).toBeVisible({ timeout: 15000 });
  await q.unroute("**/api/live/*/sync");
  await q.getByRole("button", { name: "Review local changes" }).click();
  await expect(
    q.getByRole("heading", { name: "Unsent local code" }),
  ).toBeVisible();
  await q.getByRole("button", { name: "Restore and sync" }).click();
  await expect(a).toContainText("recovered after reload", { timeout: 30000 });
  await expect(b).toContainText("changed while disconnected", {
    timeout: 30000,
  });
  await expect(
    q.getByRole("button", { name: "Review local changes" }),
  ).toHaveCount(0);
  // Preserve unsent edits when permission changes: recovery stays copy-only.
  await q.route("**/api/live/*/sync", (route) => route.abort());
  await b.click();
  await b.press("ControlOrMeta+End");
  await b.pressSequentially("\n// copy-only recovery", { delay: 5 });
  // Host downgrade takes effect while the other editor is open.
  await p.getByRole("button", { name: /People \(/ }).click();
  await p.getByLabel("Access for @livepeer").selectOption("viewer");
  await q.unroute("**/api/live/*/sync");
  await expect(b).toHaveAttribute("contenteditable", "false", {
    timeout: 15000,
  });
  await q.reload();
  await q.getByRole("button", { name: "Review local changes" }).click();
  await expect(
    q.getByRole("button", { name: "Restore and sync" }),
  ).toBeDisabled();
  await q.getByRole("button", { name: "Discard local copy" }).click();
  await expect(a).not.toContainText("copy-only recovery");
  await p.getByRole("button", { name: "Save & finish", exact: true }).click();
  await p
    .getByLabel("Session outcome")
    .fill("Both changes preserve cancellation and safe retry boundaries.");
  await expect(
    p.getByRole("button", { name: "Finish and save snapshot", exact: true }),
  ).toBeEnabled();
  await p.waitForTimeout(500);
  await p
    .getByRole("button", { name: "Finish and save snapshot", exact: true })
    .click();
  if (
    await p
      .getByText(
        "Wait until the latest changes finish syncing, then try again.",
        { exact: true },
      )
      .isVisible()
      .catch(() => false)
  ) {
    await p.waitForTimeout(1000);
    await p
      .getByRole("button", { name: "Finish and save snapshot", exact: true })
      .click();
  }
  await expect(
    p.getByRole("heading", { name: "A useful next step, saved.", exact: true }),
  ).toBeVisible();
  await p
    .getByRole("button", {
      name: "Preview result for the conversation",
      exact: true,
    })
    .click();
  await p
    .getByRole("button", { name: "Confirm & publish reply", exact: true })
    .click();
  await expect(
    p.getByRole("link", { name: "Open published result", exact: false }),
  ).toBeVisible();
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(300);
  expect(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await p.screenshot({
    path: ".test-data/live-browser/mobile.png",
    fullPage: true,
  });
  await p
    .getByRole("link", { name: "Open published result", exact: false })
    .click();
  await expect(
    p
      .locator(".reply")
      .filter({ hasText: "Both changes preserve cancellation" }),
  ).toBeVisible();
  await p.goto(f.base + `/app#workspace/${s.publicProject}/live`);
  await expect(
    p.getByRole("heading", {
      name: "Work together. Keep the progress.",
      exact: true,
    }),
  ).toBeVisible();
  await p.getByLabel("Session status").selectOption("saved");
  await p.getByLabel("Search sessions").fill("Cancellation");
  const historyCard = p
    .locator(".live-history .live-session-card")
    .filter({ hasText: "Cancellation, together" });
  await expect(historyCard).toHaveCount(1);
  expect(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await p.screenshot({
    path: ".test-data/live-browser/project-history.png",
    fullPage: true,
  });
  await historyCard.click();
  const oldId = new URL(url).hash.split("/").at(-1);
  const oldSnapshot = await (
    await owner.request.get(f.base + "/api/live/" + oldId)
  ).json();
  await p
    .getByRole("button", { name: "Continue from result", exact: false })
    .click();
  await expect(p.locator(".live-draft-code")).toContainText(
    "recovered after reload",
  );
  await p.getByLabel("New session title").fill("Cancellation, next step");
  await p
    .getByRole("button", { name: "Create continued session", exact: true })
    .click();
  await expect(
    p.getByRole("heading", { name: "Cancellation, next step", exact: true }),
  ).toBeVisible();
  const newId = new URL(p.url()).hash.split("/").at(-1);
  expect(newId).not.toBe(oldId);
  const newSnapshot = await (
    await owner.request.get(f.base + "/api/live/" + newId)
  ).json();
  expect(newSnapshot.session.initial_code).toBe(oldSnapshot.code);
  expect(newSnapshot.members).toHaveLength(1);
  expect(newSnapshot.messages).toHaveLength(0);
  expect((await peer.request.get(f.base + "/api/live/" + newId)).status()).toBe(
    404,
  );
  expect(errors).toEqual([]);
  console.log(
    "Live browser: two editors, concurrent changes, remote cursors, chat, original comparison, offline recovery, live downgrade, frozen outcome, published reply and mobile passed.",
  );
} finally {
  await browser?.close();
  await f.close();
}
