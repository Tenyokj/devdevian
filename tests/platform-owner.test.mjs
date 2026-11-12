import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./http-fixture.mjs";
import { openDatabase } from "../database.mjs";
import { isPlatformOwner } from "../platform-owner.mjs";
import { inspectExtensionSecurity } from "../extension-security.mjs";
test("owner authorization requires configured exact verified identity, not a role or profile claim", () => {
  const before = process.env.PLATFORM_OWNER_EMAIL;
  process.env.PLATFORM_OWNER_EMAIL = "owner@fixture.test";
  try {
    assert.equal(
      isPlatformOwner({ email: "owner@fixture.test", email_verified: 0 }),
      false,
    );
    assert.equal(
      isPlatformOwner({
        email: "imposter@test.test",
        email_verified: 1,
        is_platform_owner: true,
        platform_role: "moderator",
      }),
      false,
    );
    assert.equal(
      isPlatformOwner({
        email: "owner@fixture.test",
        email_verified: 1,
        deleted_at: "now",
      }),
      false,
    );
    assert.equal(
      isPlatformOwner({ email: "OWNER@fixture.test", email_verified: 1 }),
      true,
    );
  } finally {
    if (before === undefined) delete process.env.PLATFORM_OWNER_EMAIL;
    else process.env.PLATFORM_OWNER_EMAIL = before;
  }
});
const pkg = {
  name: "Owner Review Probe",
  slug: "owner-review-probe",
  version: "1.0.0",
  description: "An inspectable extension for security boundary checks.",
  manifest: {
    schema: 2,
    kind: "extension",
    permissions: ["data.read", "network:https://example.com"],
    entry: "main.js",
    files: { "main.js": 'document.body.textContent="review me";' },
    styles: { light: "", dark: "" },
  },
};
test("owner moderation rejects other roles, excludes private work, audits exact-version review and revokes installs", async (t) => {
  const f = await startTestServer({ ownerEmail: "owner@fixture.test" });
  t.after(() => f.close());
  const owner = f.client(),
    author = f.client(),
    reader = f.client(),
    moderator = f.client(),
    guest = f.client();
  for (const [client, n] of [
    [owner, "owner"],
    [author, "author"],
    [reader, "reader"],
    [moderator, "moderator"],
  ])
    assert.equal(
      (
        await client("/register", {
          name: n,
          email: n + "@fixture.test",
          password: "Fixture-password123",
        })
      ).status,
      200,
    );
  assert.equal(
    (await owner("/platform/extensions")).status,
    403,
    "matching unverified account has no owner rights",
  );
  const db = await openDatabase({
    DB_PATH: f.path,
    DB_DRIVER: process.env.DB_DRIVER,
  });
  db.prepare("UPDATE users SET email_verified=1 WHERE email=?").run(
    "owner@fixture.test",
  );
  db.close();
  assert.equal((await owner("/me")).data.user.is_platform_owner, true);
  for (const client of [author, reader, moderator])
    assert.equal((await client("/platform/extensions")).status, 403);
  assert.equal((await guest("/platform/extensions")).status, 401);
  const pub = (
    await author("/posts", {
      title: "Public security test",
      body: "Public content belongs in the public moderation queue.",
      kind: "discussion",
      topic: "web",
    })
  ).data;
  const community = (
    await author("/communities", {
      name: "Hidden boundary",
      description: "A private community for authorization testing.",
    })
  ).data;
  const privatePost = await author("/posts", {
    title: "Do not leak private content",
    body: "This private message must stay within the private community.",
    kind: "discussion",
    topic: "web",
    community_id: community.id,
  });
  assert.equal(privatePost.status, 201);
  const contents = await owner("/platform/content");
  assert.equal(contents.status, 200);
  assert.ok(contents.data.items.some((x) => x.id === pub.id));
  assert.ok(!contents.data.items.some((x) => x.id === privatePost.data.id));
  assert.equal(
    (
      await owner(`/posts/${privatePost.data.id}/lifecycle`, {
        action: "remove",
        reason: "Must not reach this private content",
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await owner(`/posts/${pub.id}/lifecycle`, {
        action: "remove",
        reason: "Public moderation fixture",
      })
    ).status,
    200,
  );
  const created = await author("/extensions/publish", pkg);
  assert.equal(created.status, 201);
  const id = created.data.id;
  assert.equal(
    (
      await reader("/extensions/install?format=2", {
        release: id,
        acknowledge_unreviewed: true,
        granted_permissions: pkg.manifest.permissions,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await reader(`/extensions/releases/${id}/report`, {
        reason: "This version may transmit private information.",
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await reader(`/extensions/releases/${id}/report`, {
        reason: "Duplicate reports should not flood the queue.",
      })
    ).status,
    409,
  );
  const reported = await owner("/platform/extensions?filter=reported");
  assert.equal(reported.data.items[0].id, id);
  const detail = (await owner("/platform/extensions/" + id)).data;
  assert.equal(detail.security.warnings[0].code, "private-data-network");
  assert.match(detail.security.digest, /^[a-f0-9]{64}$/);
  assert.equal(detail.reports.length, 1);
  assert.equal((await author("/platform/extensions/" + id)).status, 403);
  const decision = {
    status: "reviewed",
    note: "All sources inspected for the fixture.",
    expected_review: "unreviewed",
    expected_revision: 0,
    digest: detail.security.digest,
    acknowledge_sources: true,
  };
  assert.equal(
    (
      await owner(
        "/extensions/releases/" + id + "/review",
        { ...decision, digest: "bad" },
        "PATCH",
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await owner(
        "/extensions/releases/" + id + "/review",
        { ...decision, acknowledge_sources: false },
        "PATCH",
      )
    ).status,
    400,
  );
  assert.equal(
    (await author("/extensions/releases/" + id + "/review", decision, "PATCH"))
      .status,
    403,
  );
  assert.equal(
    (await owner("/extensions/releases/" + id + "/review", decision, "PATCH"))
      .status,
    200,
  );
  assert.equal(
    (await owner("/extensions/releases/" + id + "/review", decision, "PATCH"))
      .status,
    409,
    "stale decisions cannot overwrite another review",
  );
  assert.equal(
    (
      await owner(
        "/extensions/releases/" + id + "/review",
        {
          ...decision,
          status: "withdrawn",
          expected_review: "reviewed",
          expected_revision: 1,
        },
        "PATCH",
      )
    ).status,
    200,
  );
  const state = (await reader("/extensions/me?format=2")).data;
  assert.equal(state.enabled.length, 0);
  assert.equal(state.installed[0].enabled, false);
  assert.equal(
    (
      await reader("/extensions/install?format=2", {
        release: id,
        acknowledge_unreviewed: true,
        granted_permissions: pkg.manifest.permissions,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await author(
        "/extensions/releases/" + id + "/review",
        { status: "reviewed", note: "Author cannot undo a block" },
        "PATCH",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await owner(
        "/platform/extension-reports/" + detail.reports[0].id,
        { status: "resolved", note: "Withdrawn after review" },
        "PATCH",
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await owner(
        "/platform/extension-reports/" + detail.reports[0].id,
        { status: "dismissed", note: "Stale report update" },
        "PATCH",
      )
    ).status,
    409,
  );
  const final = (await owner("/platform/extensions/" + id)).data;
  assert.deepEqual(
    final.history.map((x) => x.status),
    ["withdrawn", "reviewed"],
  );
  assert.equal(final.reports[0].status, "resolved");
});
test("security signals inspect text without executing it and do not certify code", () => {
  const m = structuredClone(pkg.manifest);
  m.files["main.js"] = 'while(true){}; eval("foo")';
  const result = inspectExtensionSecurity(m);
  assert.equal(result.signals.length, 2);
  assert.match(result.disclaimer, /incomplete/);
});
