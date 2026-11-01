// Real API/browser flow against disposable data. Never contacts hosted services.
import { chromium, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { startTestServer } from "../tests/http-fixture.mjs";
const f = await startTestServer(),
  artifacts = ".test-data/workspaces-browser";
mkdirSync(artifacts, { recursive: true });
let browser;
const errors = [];
try {
  browser = await chromium.launch({ headless: true });
  const owner = await browser.newContext({
      viewport: { width: 1512, height: 1100 },
    }),
    reviewer = await browser.newContext(),
    guest = await browser.newContext();
  for (const [context, name] of [
    [owner, "workspace_browser_owner"],
    [reviewer, "workspace_browser_reviewer"],
  ]) {
    const r = await context.request.post(f.base + "/api/register", {
      data: {
        name,
        username: name,
        email: name + "@fixture.test",
        password: "Browser-test-password123",
      },
    });
    expect(r.status()).toBe(200);
  }
  const post = async (context, path, data) => {
    const r = await context.request.post(f.base + "/api" + path, { data });
    expect(r.ok(), await r.text()).toBeTruthy();
    return r.json();
  };
  const get = async (context, path) => {
    const r = await context.request.get(f.base + "/api" + path);
    expect(r.ok()).toBeTruthy();
    return r.json();
  };
  const project = await post(owner, "/projects", {
    name: "Orbit Queue",
    description:
      "A small queue with bounded retries and clear failure handling.",
    topic: "web",
    stage: "Prototype",
    help: "Help make retries safe under permanent failures.",
    repo: "https://github.com/example/orbit",
  });
  const community = await post(owner, "/communities", {
    name: "Private workspace team",
    description: "Private requests stay private across project pages.",
  });
  const code = "export async function retry(task) {\n  return task();\n}";
  const review = await post(owner, "/posts", {
    title: "Make retries safe under timeouts",
    body: "Please review retry boundaries and permanent errors.",
    kind: "review",
    topic: "web",
    code,
    review_focus: "Check idempotency and permanent error handling.",
  });
  const privatePost = await post(owner, "/posts", {
    title: "Confidential request in a public workspace",
    body: "Only approved members should ever see this request.",
    kind: "question",
    topic: "web",
    community_id: community.id,
  });
  for (const p of [review, privatePost]) {
    const r = await owner.request.put(
      `${f.base}/api/projects/${project.id}/work-requests/${p.id}`,
      { data: { state: "open", expected_version: 0 } },
    );
    expect(r.status()).toBe(201);
  }
  const page = await owner.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(f.base + "/app#projects");
  await page.getByRole("link", { name: "Open workspace", exact: true }).click();
  const workspace = page.getByRole("generic", {
    name: "Orbit Queue workspace",
    exact: true,
  });
  await expect(page.locator(".dw-workspace")).toBeVisible();
  await expect(
    page.getByText(privatePost.title, { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: artifacts + "/workspace-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByLabel("Status of " + review.title).click();
  await page.getByRole("option", { name: "In progress", exact: true }).click();
  await expect(page.getByLabel("Status of " + review.title)).toContainText(
    "In progress",
  );
  await page
    .getByRole("button", { name: "New work request", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Work request title")
    .fill("Document the retry contract");
  await dialog
    .getByLabel("Work request message")
    .fill("Please help document which operations are safe to replay.");
  await page.reload();
  await page
    .getByRole("button", { name: "New work request", exact: true })
    .click();
  await expect(page.getByLabel("Work request title")).toHaveValue(
    "Document the retry contract",
  );
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "New work request", exact: true })
    .click();
  await expect(page.getByLabel("Work request title")).toHaveValue(
    "Document the retry contract",
  );
  await page
    .getByRole("button", { name: "Preview request", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Work request preview" }),
  ).toContainText("Document the retry contract");
  await page.getByRole("button", { name: "Publish and link request" }).click();
  await expect(page).toHaveURL(/#post\//);
  await expect(
    page.getByRole("heading", {
      name: "Document the retry contract",
      exact: true,
    }),
  ).toBeVisible();
  const check = await get(
    owner,
    `/projects/${project.id}/work-requests?q=Document`,
  );
  expect(check.pagination.total).toBe(1);
  // A failed link preserves its already-published ID; retry must not publish twice.
  await page.goto(f.base + `/app#workspace/${project.id}`);
  await page
    .getByRole("button", { name: "New work request", exact: true })
    .click();
  await page
    .getByLabel("Work request title")
    .fill("Review the documentation wording");
  await page
    .getByLabel("Work request message")
    .fill("Help make these retry guarantees clear to contributors.");
  await page
    .getByRole("button", { name: "Preview request", exact: true })
    .click();
  let failed = false;
  await page.route("**/api/projects/*/work-requests/*", (route) => {
    if (route.request().method() === "PUT" && !failed) {
      failed = true;
      return route.fulfill({
        status: 503,
        json: { error: "Fixture link outage." },
      });
    }
    return route.continue();
  });
  await page.getByRole("button", { name: "Publish and link request" }).click();
  await expect(
    page.getByRole("button", { name: "Retry linking request", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Retry linking request", exact: true })
    .click();
  await expect(page).toHaveURL(/#post\//);
  const mine = await get(
    owner,
    "/posts?author=me&q=Review%20the%20documentation%20wording",
  );
  expect(mine.pagination.total).toBe(1);
  await page.unroute("**/api/projects/*/work-requests/*");
  await page.goto(f.base + `/app#workspace/${project.id}`);
  await page
    .getByRole("button", {
      name: "Unlink Review the documentation wording",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Unlink request", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Review the documentation wording",
      exact: true,
    }),
  ).toHaveCount(0);
  const publishedQuestion = mine.items[0];
  expect(
    (
      await owner.request.get(f.base + "/api/posts/" + publishedQuestion.id)
    ).status(),
  ).toBe(200);
  await page
    .getByRole("button", { name: "Link a conversation", exact: true })
    .click();
  await page.getByRole("radio").first().waitFor();
  await page
    .getByRole("dialog")
    .getByText("Review the documentation wording", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Link selected conversation", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Review the documentation wording",
      exact: true,
    }),
  ).toBeVisible();
  const reader = await reviewer.newPage();
  reader.on("pageerror", (e) => errors.push(e.message));
  await reader.goto(f.base + `/app#workspace/${project.id}`);
  await expect(reader.locator(".dw-workspace")).toBeVisible();
  await expect(
    reader.getByText(privatePost.title, { exact: true }),
  ).toHaveCount(0);
  await expect(
    reader.getByRole("button", { name: "New work request" }),
  ).toHaveCount(0);
  await expect(reader.getByLabel("Status of " + review.title)).toHaveCount(0);
  await reader.getByRole("button", { name: review.title, exact: true }).click();
  await expect(
    reader.getByRole("heading", { name: review.title, exact: true }),
  ).toBeVisible();
  await reader.getByLabel("Feedback start line").fill("2");
  await reader.getByLabel("Feedback end line").fill("2");
  await reader
    .getByLabel("What would you change?")
    .fill("Handle permanent failures before retrying.");
  await reader
    .getByRole("button", { name: "Add line feedback", exact: true })
    .click();
  await expect(
    reader.getByText("Handle permanent failures before retrying.", {
      exact: true,
    }),
  ).toBeVisible();
  await reader
    .getByLabel("What would you change?")
    .fill("A draft that survives a tab reload.");
  await reader.reload();
  await expect(reader.getByLabel("What would you change?")).toHaveValue(
    "A draft that survives a tab reload.",
  );
  await reader.getByLabel("What would you change?").fill("");
  const notes = await get(reviewer, `/posts/${review.id}/code-reviews`),
    originalId = notes.revision_id;
  expect(notes.items[0].snapshot_id).toBe(originalId);
  // Publish a second, multi-file revision through preview; keep a draft on close.
  await page.goto(f.base + `/app#workspace/${project.id}/review/${review.id}`);
  await page
    .getByRole("button", { name: "Share new revision", exact: true })
    .click();
  await page.getByLabel("Revision file path").fill("src/retry.ts");
  await page
    .getByLabel("Revision file contents")
    .fill(
      "export async function retry(task, error) {\n  if (error.permanent) throw error;\n  return task();\n}",
    );
  await page
    .getByLabel("Revision review focus")
    .fill("Check that permanent errors are never replayed.");
  await page.reload();
  await page
    .getByRole("button", { name: "Share new revision", exact: true })
    .click();
  await expect(page.getByLabel("Revision review focus")).toHaveValue(
    "Check that permanent errors are never replayed.",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "Share new revision", exact: true })
    .click();
  await expect(page.getByLabel("Revision file path")).toHaveValue(
    "src/retry.ts",
  );
  await page.getByRole("button", { name: "Add file", exact: true }).click();
  await page.getByLabel("Revision file path").fill("test/retry.test.ts");
  await page
    .getByLabel("Revision file contents")
    .fill("assert.equal(permanentFailureRetries(), 0);");
  await page
    .getByRole("button", { name: "Preview revision", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Publication preview" }),
  ).toContainText("test/retry.test.ts");
  await page
    .getByRole("button", { name: "Publish revision", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "2 published versions", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Review file")).toBeVisible();
  await page.getByLabel("Review file").click();
  await page
    .getByRole("option", { name: "test/retry.test.ts", exact: true })
    .click();
  await expect(
    page.getByRole("group", { name: "Code snippet lines" }),
  ).toContainText("permanentFailureRetries");
  await expect(
    page.getByText("Earlier snippet version", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "View original version", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Revision 1 code")).toContainText(
    "return task();",
  );
  await expect(dialog.locator(".dw-highlight")).toContainText("return task();");
  await dialog
    .getByRole("button", { name: "Compare with current", exact: true })
    .click();
  await expect(
    dialog.getByRole("region", { name: "Revision comparison" }),
  ).toContainText("error.permanent");
  await page.screenshot({
    path: artifacts + "/review-comparison-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  // Reader reopens and can continue the same old discussion, not a new anchor.
  await reader.reload();
  await expect(
    reader.getByText("Earlier snippet version", { exact: true }),
  ).toBeVisible();
  expect(
    (await get(reviewer, `/posts/${review.id}/code-reviews`)).items[0].quote,
  ).toBe("  return task();");
  await page
    .getByRole("button", { name: "Share new revision", exact: true })
    .click();
  await page
    .getByLabel("Revision file contents")
    .fill("export const keptDraft = true;");
  const latest = await get(owner, "/posts/" + review.id);
  const conflicting = await owner.request.patch(
    f.base + "/api/posts/" + review.id,
    {
      data: {
        title: "Updated elsewhere: retries",
        body: latest.body,
        revision: latest.revision,
      },
    },
  );
  expect(conflicting.ok()).toBeTruthy();
  await page
    .getByRole("button", { name: "Preview revision", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Publish revision", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Reload latest version and keep my draft",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Revision file contents")).toHaveValue(
    "export const keptDraft = true;",
  );
  await page
    .getByRole("button", {
      name: "Reload latest version and keep my draft",
      exact: true,
    })
    .click();
  await expect(page.getByText(/Your draft is kept\. Review it/)).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  // A guest can read an associated public review without private request leakage.
  const anonymous = await guest.newPage();
  anonymous.on("pageerror", (e) => errors.push(e.message));
  await anonymous.goto(
    f.base + `/app#workspace/${project.id}/review/${review.id}`,
  );
  await expect(
    anonymous.getByRole("heading", {
      name: "Updated elsewhere: retries",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    anonymous.getByText(privatePost.title, { exact: true }),
  ).toHaveCount(0);
  await expect(
    anonymous.getByRole("button", { name: "Share new revision" }),
  ).toHaveCount(0);
  for (const theme of ["light", "dark"])
    for (const width of [1440, 1024, 768, 390, 360]) {
      await page.goto(f.base + `/app#workspace/${project.id}`);
      await page.setViewportSize({ width, height: 950 });
      await page.evaluate(
        (value) => (document.documentElement.dataset.theme = value),
        theme,
      );
      await expect(page.locator(".dw-workspace")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBeTruthy();
      if (theme === "dark" && [1440, 390].includes(width))
        await page.screenshot({
          path: `${artifacts}/workspace-${width}.png`,
          fullPage: true,
          animations: "disabled",
        });
    }
  await page.goto(f.base + `/app#workspace/${project.id}/review/${review.id}`);
  await expect(
    page.getByRole("heading", { name: "2 published versions", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "View original version", exact: true })
    .click();
  await expect(page.getByLabel("Revision 1 code")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: artifacts + "/review-original-mobile.png",
    fullPage: false,
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByLabel("What would you change?")
    .fill("Owner-only feedback draft.");
  let switched = await owner.request.post(f.base + "/api/login", {
    data: {
      email: "workspace_browser_reviewer@fixture.test",
      password: "Browser-test-password123",
    },
  });
  expect(switched.ok()).toBeTruthy();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Share new revision", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("What would you change?")).toHaveValue("");
  switched = await owner.request.post(f.base + "/api/login", {
    data: {
      email: "workspace_browser_owner@fixture.test",
      password: "Browser-test-password123",
    },
  });
  expect(switched.ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByLabel("What would you change?")).toHaveValue(
    "Owner-only feedback draft.",
  );
  expect(errors).toEqual([]);
  console.log(
    "Workspace browser flow passed: real project links, request drafts/retry without duplication, ownership/private/guest access, multi-file revisions, exact old quotes/comparison, conflicts, tab drafts, keyboard and five widths in both themes.",
  );
} catch (e) {
  for (const context of browser?.contexts() || [])
    for (const p of context.pages())
      await p
        .screenshot({
          path:
            artifacts +
            "/failure-" +
            browser.contexts().indexOf(context) +
            ".png",
          fullPage: true,
          animations: "disabled",
        })
        .catch(() => {});
  throw e;
} finally {
  await browser?.close();
  await f.close();
}
