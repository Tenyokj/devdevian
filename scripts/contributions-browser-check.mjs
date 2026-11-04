import { chromium, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { startTestServer } from "../tests/http-fixture.mjs";
const f = await startTestServer();
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const owner = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
    }),
    peer = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
    });
  const post = async (c, p, data) => {
    const r = await c.request.post(f.base + "/api" + p, { data });
    expect(r.ok(), await r.text()).toBeTruthy();
    return r.json();
  };
  const users = [];
  for (const [c, n] of [
    [owner, "contrib_browser_owner"],
    [peer, "contrib_browser_peer"],
  ])
    users.push(
      await post(c, "/register", {
        name: n,
        username: n,
        email: n + "@fixture.test",
        password: "Fixture-password123",
      }),
    );
  const project = await post(owner, "/projects", {
    name: "Orbit contributions",
    description: "A practical place to review small fixes.",
    topic: "web",
    stage: "Prototype",
    help: "Stop retrying permanent failures.",
  });
  const task = await post(owner, "/posts", {
    kind: "question",
    topic: "web",
    title: "Stop retrying permanent failures",
    body: "Keep cancellation and HTTP 401 predictable.",
  });
  const root = `/projects/${project.id}/contributions`;
  expect(
    (
      await owner.request.put(
        f.base + `/api/projects/${project.id}/work-requests/${task.id}`,
        { data: { state: "open", expected_version: 0 } },
      )
    ).status(),
  ).toBe(201);
  await post(peer, `/projects/${project.id}/room/tasks/${task.id}`, {
    action: "claim",
    expected_version: 1,
  });
  const pp = await peer.newPage(),
    op = await owner.newPage(),
    errors = [];
  pp.on("pageerror", (e) => errors.push(e.message));
  op.on("pageerror", (e) => errors.push(e.message));
  const open = async (p) => {
    await p.goto(f.base + `/app#workspace/${project.id}/contributions`);
    await expect(
      p.getByRole("heading", { name: "Work worth bringing back." }),
    ).toBeVisible();
  };
  await open(pp);
  await pp
    .getByRole("button", {
      name: "Submit work · Stop retrying permanent failures",
    })
    .click();
  await pp
    .getByRole("textbox", { name: "Result and how to verify it" })
    .fill("Permanent failures now stop immediately. The HTTP 401 test passes.");
  await pp.getByRole("button", { name: "Preview submission" }).click();
  await pp.getByRole("button", { name: "Confirm submission" }).click();
  await expect(pp.getByText("Awaiting review", { exact: true })).toBeVisible();
  await open(op);
  await op
    .getByRole("button", { name: "Request changes", exact: true })
    .click();
  await op
    .getByRole("textbox", { name: "Decision and next steps" })
    .fill("Please add a cancellation test as well.");
  await op.getByRole("button", { name: "Preview change" }).click();
  await op.getByRole("button", { name: "Confirm change" }).click();
  await expect(
    op.getByText("Changes requested", { exact: true }),
  ).toBeVisible();
  await pp.reload();
  await pp
    .getByRole("button", {
      name: "Submit work · Stop retrying permanent failures",
    })
    .click();
  await pp
    .getByRole("textbox", { name: "Result and how to verify it" })
    .fill(
      "Added cancellation coverage. Both permanent failures and aborts stop retries.",
    );
  await pp.getByRole("button", { name: "Preview submission" }).click();
  await pp.getByRole("button", { name: "Confirm submission" }).click();
  await expect(pp.getByText("Awaiting review", { exact: true })).toBeVisible();
  await op.reload();
  await op.getByRole("button", { name: "Accept result", exact: true }).click();
  await op
    .getByRole("textbox", { name: "Decision and next steps" })
    .fill("Verified both tests and the implementation. Accepted.");
  await op.getByRole("button", { name: "Preview change" }).click();
  await op.getByRole("button", { name: "Confirm change" }).click();
  await expect(op.getByText("Accepted", { exact: true })).toBeVisible();
  await op.getByRole("button", { name: "Revision history" }).click();
  await expect(
    op.getByRole("heading", { name: "Result v1", exact: true }),
  ).toBeVisible();
  await expect(
    op.getByRole("heading", { name: "Result v2", exact: true }),
  ).toBeVisible();
  await op.getByRole("button", { name: "Close dialog", exact: true }).click();
  mkdirSync(".test-data/contributions-browser", { recursive: true });
  for (const width of [1440, 768, 390, 320]) {
    await op.setViewportSize({ width, height: 1000 });
    const links = await op.locator(".dw-nav nav a").evaluateAll((nodes) =>
      nodes.map((n) => {
        const r = n.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top };
      }),
    );
    for (let i = 1; i < links.length; i++)
      if (Math.abs(links[i].top - links[i - 1].top) < 2)
        expect(links[i].left).toBeGreaterThanOrEqual(links[i - 1].right - 1);
    await op.screenshot({
      path: `.test-data/contributions-browser/${width}.png`,
      fullPage: true,
    });
    expect(
      await op.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
  }
  expect(errors).toEqual([]);
  console.log(
    "Contributions browser lifecycle, immutable revision history and 4 responsive widths passed.",
  );
} finally {
  await browser?.close();
  await f.close();
}
