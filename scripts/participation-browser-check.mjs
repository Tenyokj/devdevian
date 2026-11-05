import { chromium, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { startTestServer } from "../tests/http-fixture.mjs";
const f = await startTestServer();
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const owner = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    peer = await browser.newContext(),
    observer = await browser.newContext();
  const post = async (c, path, data) => {
    const r = await c.request.post(f.base + "/api" + path, { data });
    expect(r.ok(), await r.text()).toBeTruthy();
    return r.json();
  };
  for (const [c, n] of [
    [owner, "policy_owner"],
    [peer, "policy_peer"],
    [observer, "policy_observer"],
  ])
    await post(c, "/register", {
      name: n,
      username: n,
      email: n + "@fixture.test",
      password: "Fixture-password123",
    });
  const p = await post(owner, "/projects", {
      name: "Approved Orbit",
      description: "One public project with explicit participation.",
      topic: "web",
      stage: "Prototype",
      help: "Inspect the retry guard.",
      participation_mode: "approved",
    }),
    task = await post(owner, "/posts", {
      kind: "question",
      topic: "web",
      title: "Inspect the retry guard",
      body: "Keep cancellation bounded and predictable.",
    });
  expect(
    (
      await owner.request.put(
        `${f.base}/api/projects/${p.id}/work-requests/${task.id}`,
        { data: { state: "open", expected_version: 0 } },
      )
    ).status(),
  ).toBe(201);
  const op = await owner.newPage(),
    pp = await peer.newPage(),
    vp = await observer.newPage(),
    errors = [];
  for (const page of [op, pp, vp]) {
    page.on("pageerror", (e) => errors.push(e.message));
    await page.emulateMedia({ reducedMotion: "reduce" });
  }
  await op.goto(f.base + `/app#room/${p.id}`);
  await expect(
    op.getByRole("button", { name: "Manage participation", exact: true }),
  ).toBeVisible();
  await vp.goto(f.base + `/app#room/${p.id}`);
  await expect(
    vp.getByText("You have observer access. Ask the owner to approve you.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    vp.getByRole("button", { name: "Pick up task", exact: true }),
  ).toHaveCount(0);
  await vp.goto(f.base + `/app#post/${task.id}`);
  await expect(
    vp.getByText(
      "Observer access: only approved project contributors can reply or join the work.",
      { exact: true },
    ),
  ).toBeVisible();
  await op
    .getByRole("button", { name: "Manage participation", exact: true })
    .click();
  await op
    .getByLabel("Approved usernames (one per line)", { exact: true })
    .fill("@policy_peer");
  await op.getByRole("button", { name: "Preview change", exact: true }).click();
  await op.getByRole("button", { name: "Confirm change", exact: true }).click();
  await pp.goto(f.base + `/app#room/${p.id}`);
  await pp.getByRole("button", { name: "Pick up task", exact: true }).click();
  await pp.getByRole("button", { name: "Preview change", exact: true }).click();
  await pp.getByRole("button", { name: "Confirm change", exact: true }).click();
  await expect(pp.locator(".room-assignee").first()).toContainText(
    "policy_peer",
  );
  await op
    .getByRole("button", { name: "Manage participation", exact: true })
    .click();
  await op
    .getByLabel("Approved usernames (one per line)", { exact: true })
    .fill("");
  await op.getByRole("button", { name: "Preview change", exact: true }).click();
  await op.getByRole("button", { name: "Confirm change", exact: true }).click();
  await pp.getByRole("button", { name: "Refresh room", exact: true }).click();
  await expect(
    pp.getByRole("button", { name: "Pick up task", exact: true }),
  ).toHaveCount(0);
  await pp.reload();
  await expect(
    pp.getByText("You have observer access. Ask the owner to approve you.", {
      exact: true,
    }),
  ).toBeVisible();
  mkdirSync(".test-data/participation-browser", { recursive: true });
  for (const theme of ["dark", "light"]) {
    await op.evaluate(
      (t) => (document.documentElement.dataset.theme = t),
      theme,
    );
    for (const width of [1440, 768, 390, 320]) {
      await op.setViewportSize({ width, height: 1000 });
      expect(
        await op.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBeTruthy();
      await op.screenshot({
        path: `.test-data/participation-browser/${theme}-${width}.png`,
        fullPage: true,
      });
    }
  }
  expect(errors).toEqual([]);
  console.log(
    "Participation browser: owner preview/confirm, observer read-only, approval, claim, revocation/release, 4 widths × 2 themes passed.",
  );
} finally {
  await browser?.close();
  await f.close();
}
