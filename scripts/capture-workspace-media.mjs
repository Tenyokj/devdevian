// Real application captures against a disposable database. GitHub responses are
// illustrative fixtures; no production account or provider credential is read.
import { chromium, expect } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { startTestServer } from "../tests/http-fixture.mjs";
const f = await startTestServer();
let browser;
const repository = "https://github.com/orbit-labs/orbit",
  head = "a".repeat(40),
  base = "b".repeat(40);
let denied = false;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1512, height: 1100 },
    deviceScaleFactor: 1,
  });
  await context.addInitScript(() =>
    localStorage.setItem("devdevian-theme", "dark"),
  );
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: "reduce" });
  const call = async (path, data, method = "POST") => {
    const r = await context.request.fetch(f.base + "/api" + path, {
      method,
      data,
    });
    expect(r.ok(), await r.text()).toBeTruthy();
    return r.json();
  };
  const owner = await call("/register", {
    name: "Alex Morgan",
    username: "alexmorgan",
    email: "alex@capture.test",
    password: "Capture-only123!",
  });
  const upload = await context.request.post(f.base + "/api/uploads", {
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Filename": "avatar.png",
    },
    data: readFileSync("public/devdevian-logo.png"),
  });
  expect(upload.ok()).toBeTruthy();
  const avatar = (await upload.json()).id;
  await call("/details/user/" + owner.user.id, { avatar }, "PUT");
  const project = await call("/projects", {
    name: "Orbit Queue",
    description:
      "Background work, without losing the context. Build a smaller, safer queue for independent developers.",
    topic: "web",
    stage: "Beta",
    stack: "TypeScript, Node.js",
    help: "Review the retry boundary, make worker shutdown predictable, and improve the contributor guide.",
    repo: repository,
  });
  const tasks = [];
  for (const [state, title, kind, body] of [
    [
      "open",
      "Stop retrying permanent failures",
      "review",
      "Inspect cancellation, timeouts and bounded retries.",
    ],
    [
      "in_progress",
      "Make worker shutdown predictable",
      "question",
      "Keep active jobs safe when a worker exits.",
    ],
    [
      "ready",
      "Write the first contributor guide",
      "discussion",
      "A clear path from a first question to a useful contribution.",
    ],
  ]) {
    const t = await call("/posts", {
      title,
      kind,
      topic: "web",
      body,
      ...(kind === "review"
        ? {
            code: "export async function retry(task) {\n  const attempts = 3;\n  return task({ attempts });\n}",
            review_focus: "Cancellation and permanent failures.",
          }
        : {}),
    });
    await call(
      `/projects/${project.id}/work-requests/${t.id}`,
      { state, expected_version: 0 },
      "PUT",
    );
    tasks.push(t);
  }
  const peerContext = await browser.newContext();
  const register = await peerContext.request.post(f.base + "/api/register", {
    data: {
      name: "Maya Chen",
      username: "mayachen",
      email: "maya@capture.test",
      password: "Capture-only123!",
    },
  });
  expect(register.ok()).toBeTruthy();
  const peer = await register.json();
  const up = await peerContext.request.post(f.base + "/api/uploads", {
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Filename": "avatar.png",
    },
    data: readFileSync("public/devdevian-logo.png"),
  });
  const peerAvatar = (await up.json()).id;
  await peerContext.request.put(f.base + "/api/details/user/" + peer.user.id, {
    data: { avatar: peerAvatar },
  });
  await peerContext.request.post(
    f.base + "/api/posts/" + project.post_id + "/replies",
    {
      data: {
        body: "I can help with the shutdown path. Keeping the lifecycle explicit will make this much easier to review.",
      },
    },
  );
  await call(`/projects/${project.id}/room/tasks/${tasks[1].id}`, {
    action: "assign",
    username: "mayachen",
    expected_version: 1,
  });
  mkdirSync("public/screenshots", { recursive: true });
  const shot = async (name) => {
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByText(/Loading formatted content/)).toHaveCount(0);
    await page.locator("img").evaluateAll(async (images) => {
      await Promise.all(images.map((image) => { image.loading = "eager"; return image.decode().catch(() => {}); }));
    });
    await page.addStyleTag({
      content:
        ".capture-note{position:fixed;bottom:12px;right:18px;z-index:100;background:#131326ed;color:#b1a7d4;border:1px solid #393255;border-radius:6px;padding:6px 10px;font:9px monospace;letter-spacing:1px}",
    });
    await page.evaluate(() => {
      document.querySelector(".capture-note")?.remove();
      const n = document.createElement("div");
      n.className = "capture-note";
      n.textContent = "ISOLATED DEMONSTRATION · NO PRODUCTION DATA";
      document.body.append(n);
    });
    await page.screenshot({ path: "public/screenshots/" + name + ".png" });
  };
  await page.goto(f.base + `/app#workspace/${project.id}`);
  await expect(page.locator(".contributor-grid a")).toHaveCount(2);
  await shot("workspace-current");
  await page.goto(f.base + `/app#workspace/${project.id}/room`);
  await expect(page.locator(".room-board")).toBeVisible();
  await page.locator(".room-board").scrollIntoViewIfNeeded();
  await shot("room-current");
  await page.route("**/api/github/**", async (route) => {
    const u = new URL(route.request().url()),
      path = u.pathname;
    if (
      denied &&
      path !== "/api/github/config" &&
      path !== "/api/github/status"
    )
      return route.fulfill({
        status: 404,
        json: { error: "GitHub resource is unavailable to your account." },
      });
    if (path === "/api/github/config")
      return route.fulfill({
        json: {
          configured: true,
          capabilities: { github_app: 1 },
          app_url: "https://github.com/apps/fixture-app",
        },
      });
    if (path === "/api/github/status")
      return route.fulfill({
        json: { connected: true, login: "alexmorgan" },
      });
    if (path === "/api/github/installations")
      return route.fulfill({
        json: {
          items: [{ id: 1, account: "orbit-labs" }],
          page: 1,
          has_next: false,
        },
      });
    if (path === "/api/github/installations/1/repositories")
      return route.fulfill({
        json: {
          items: [
            { id: 1, repository, name: "orbit-labs/orbit", private: false },
          ],
          page: 1,
          has_next: false,
        },
      });
    if (path === "/api/github/repository")
      return route.fulfill({
        json: {
          repository,
          name: "orbit-labs/orbit",
          private: false,
          description: "Keep retries small, predictable and reviewable.",
          default_branch: "main",
          generation: 1,
        },
      });
    if (path === "/api/github/read") {
      const target = u.searchParams.get("path");
      let data;
      if (target === "/repos/orbit-labs/orbit/pulls/1")
        data = {
          number: 1,
          title: "Stop retrying permanent failures",
          state: "open",
          body: "Inspect cancellation and HTTP 401.",
          head: { sha: head, ref: "retry", label: "fixture:retry" },
          base: {
            sha: base,
            ref: "main",
            label: "fixture:main",
            repo: { private: false },
          },
          changed_files: 1,
          user: { login: "alexmorgan" },
        };
      else if (target?.startsWith("/repos/orbit-labs/orbit/pulls/1/files"))
        data = [
          {
            filename: "src/retry.ts",
            status: "modified",
            additions: 1,
            deletions: 1,
            patch:
              "@@ -1 +1 @@\n-const retries = Infinity;\n+const retries = 3;",
          },
        ];
      else if (target?.includes("/check-runs"))
        data = {
          check_runs: [{ id: 1, name: "Retry tests", conclusion: "success" }],
        };
      else if (target?.includes("/status"))
        data = { state: "success", statuses: [] };
      else if (target?.startsWith("/repos/orbit-labs/orbit/issues"))
        data = [
          {
            id: 2,
            number: 2,
            title: "Document cancellation",
            state: "open",
            body: "Keep the shutdown contract clear.",
            user: { login: "alexmorgan" },
          },
        ];
      else
        data = [
          {
            id: 1,
            number: 1,
            title: "Stop retrying permanent failures",
            state: "open",
            user: { login: "alexmorgan" },
          },
        ];
      return route.fulfill({
        json: {
          data,
          private: false,
          has_next: false,
          checked_at: new Date().toISOString(),
        },
      });
    }
    await route.continue();
  });

  await page.goto(f.base + "/app#github");
  await page
    .getByRole("textbox", { name: "GitHub repository URL" })
    .fill(repository);
  await page
    .getByRole("button", { name: "Open repository", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Stop retrying permanent failures",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Inspect pull request" }).click();
  await page
    .getByRole("button", { name: "Load checks for this commit" })
    .click();
  await expect(page.getByText("Retry tests · success")).toBeVisible();
  await page
    .getByRole("button", { name: "src/retry.ts +1 −1 · modified" })
    .click();
  await expect(page.locator(".gh-diff")).toBeVisible();
  await page.locator(".gh-diff").scrollIntoViewIfNeeded();
  await shot("github-current");
  console.log(
    "Captured current project overview, Room and GitHub workspace on isolated demo data.",
  );
} finally {
  await browser?.close();
  await f.close();
}
