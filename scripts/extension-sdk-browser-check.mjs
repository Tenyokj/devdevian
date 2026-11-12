import { get } from "node:http";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
const { initExtension, serveExtension } = await import(
  process.env.SDK_TOOLS_MODULE || "../packages/cli/lib/extension-tools.mjs"
);
const root = await mkdtemp(join(tmpdir(), "ddv-sdk-browser-")),
  directory = join(root, "my-tools");
await initExtension(directory);
const server = await serveExtension(directory, { port: 0 }),
  browser = await chromium.launch();
try {
  const origin = server.origin;
  assert.equal(
    (
      await fetch(origin + "/build", {
        headers: { Origin: "https://example.com" },
      })
    ).status,
    403,
  );
  const badHost = await new Promise((resolve) =>
    get(origin + "/build", { headers: { host: "example.com" } }, (r) => {
      r.resume();
      resolve(r.statusCode);
    }),
  );
  assert.equal(badHost, 403);
  assert.equal((await fetch(origin + "/.env")).status, 404);
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  await page
    .getByRole("button", { name: "Start preview", exact: true })
    .click();
  let frame = page.frameLocator('iframe[title="My Tools sandbox"]');
  await frame.getByRole("heading", { name: "Hello, builder." }).waitFor();
  await frame.getByRole("button", { name: "Remember this moment" }).click();
  await frame.getByText("Saved on this device.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "⌘ My Tools", exact: true }).click();
  await page.getByRole("button", { name: /Say hello/ }).click();
  await frame
    .getByText("Hello from your extension command!", { exact: true })
    .waitFor();
  await frame.locator("#status").evaluate((e) => (e.textContent = "Waiting"));
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  await page.keyboard.press("Alt+Shift+H");
  await frame
    .getByText("Hello from your extension command!", { exact: true })
    .waitFor();
  await frame
    .locator("#status")
    .evaluate((e) => (e.textContent = "Do not intercept typing"));
  await page.locator(".devext-content").evaluate((e) => {
    const input = document.createElement("input");
    input.setAttribute("aria-label", "Typing test");
    e.append(input);
  });
  await page.getByLabel("Typing test").focus();
  await page.keyboard.press("Alt+Shift+H");
  assert.equal(
    await frame.locator("#status").innerText(),
    "Do not intercept typing",
  );
  await frame.locator("body").evaluate(async () => {
    await devdevian.panel.configure({
      placement: "inline",
      title: "Inline tools",
      height: 260,
      width: 400,
    });
  });
  await page.locator(".devext-inline-slot").waitFor();
  frame = page.frameLocator('iframe[title="My Tools sandbox"]');
  await frame.getByRole("heading", { name: "Hello, builder." }).waitFor();
  // A real source edit rebuilds the iframe and cleans old commands.
  const main = await readFile(join(directory, "main.js"), "utf8");
  await writeFile(
    join(directory, "main.js"),
    main.replace("Hello, builder.", "Live reload works."),
  );
  await frame.getByRole("heading", { name: "Live reload works." }).waitFor();
  const config = JSON.parse(
    await readFile(join(directory, "devdevian.extension.json"), "utf8"),
  );
  config.permissions.push("data.read");
  await writeFile(
    join(directory, "devdevian.extension.json"),
    JSON.stringify(config),
  );
  await page.waitForFunction(() => !document.querySelector(".devext-panel"));
  assert.equal(
    await page.locator(".devext-command-controls").count(),
    0,
    "commands removed when grants change",
  );
  await page
    .getByRole("button", { name: "Start preview", exact: true })
    .click();
  await frame.getByRole("heading", { name: "Live reload works." }).waitFor();
  await page.getByRole("button", { name: "Stop preview", exact: true }).click();
  assert.equal(await page.locator(".devext-command-controls").count(), 0);
  assert.deepEqual(errors, []);
  await mkdir(".test-data/extensions-browser", { recursive: true });
  await page.screenshot({
    path: ".test-data/extensions-browser/sdk-playground.png",
    fullPage: true,
  });
  console.log(
    "Standalone SDK playground passed: no login, scoped loopback reads, commands, shortcuts, editable exclusion, inline reconnect, live reload and capability reconsent.",
  );
} finally {
  await browser.close();
  await server.close();
  await rm(root, { recursive: true, force: true });
}
