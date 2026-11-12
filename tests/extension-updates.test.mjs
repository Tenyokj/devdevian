import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./http-fixture.mjs";
const pkg = (version, permissions = ["storage"]) => ({
  name: "Update Probe",
  slug: "update-probe",
  description: "A real versioned package for update boundary tests.",
  version,
  listing: { changelog: `Changes for ${version}` },
  manifest: {
    schema: 2,
    kind: "extension",
    permissions,
    entry: "main.js",
    files: { "main.js": `console.log('${version}')` },
    styles: { light: "", dark: "" },
  },
});
test("extension updates are explicit, immutable, same-author and preserve disabled state and old installs on refusal", async (t) => {
  const f = await startTestServer();
  t.after(() => f.close());
  const a = f.client(),
    b = f.client(),
    other = f.client(),
    guest = f.client();
  for (const [api, n] of [
    [a, "author"],
    [b, "reader"],
    [other, "other"],
  ])
    assert.equal(
      (
        await api("/register", {
          name: n,
          email: n + "@update.test",
          password: "Fixture-password123",
        })
      ).status,
      200,
    );
  const first = (await a("/extensions/publish", pkg("1.0.0"))).data;
  const install = await b("/extensions/install?format=2", {
    release: first.id,
    acknowledge_unreviewed: true,
    granted_permissions: ["storage"],
  });
  assert.equal(install.status, 200);
  const second = (
    await a("/extensions/publish", pkg("1.1.0", ["storage", "ui.commands"]))
  ).data;
  const updates = await b("/extensions/updates");
  assert.equal(updates.data.items.length, 1);
  const plan = updates.data.items[0];
  assert.deepEqual(plan.added_permissions, ["ui.commands"]);
  assert.deepEqual(plan.removed_permissions, []);
  assert.equal(plan.to.changelog, "Changes for 1.1.0");
  assert.equal(plan.files[0].change, "changed");
  assert.match(plan.files[0].after, /^[a-f0-9]{64}$/);
  assert.equal(
    (await b("/extensions/me?format=2")).data.enabled[0].id,
    first.id,
    "publishing new code never updates an install",
  );
  const body = {
    from: first.id,
    release: second.id,
    acknowledge_update: true,
    acknowledge_unreviewed: true,
    granted_permissions: ["storage", "ui.commands"],
  };
  assert.equal((await guest("/extensions/update", body)).status, 401);
  assert.equal((await other("/extensions/update", body)).status, 404);
  assert.equal(
    (await b("/extensions/update", { ...body, acknowledge_update: false }))
      .status,
    409,
  );
  assert.equal(
    (
      await b("/extensions/update", {
        ...body,
        granted_permissions: ["storage"],
      })
    ).status,
    409,
  );
  assert.equal(
    (await b("/extensions/update", { ...body, acknowledge_unreviewed: false }))
      .status,
    409,
  );
  const history = await guest("/extensions/history/update-probe");
  assert.equal(history.data.length, 2);
  assert.equal(history.data[0].version, "1.1.0");
  assert.equal(history.data[0].manifest, undefined);
  // Updating a disabled package must not start code, even with full grants.
  assert.equal(
    (await b("/extensions/disable/" + first.id, {}, "PUT")).status,
    200,
  );
  const changed = await b("/extensions/update?format=2", body);
  assert.equal(changed.status, 200);
  assert.equal(changed.data.enabled.length, 0);
  assert.equal(changed.data.installed[0].id, second.id);
  assert.equal(changed.data.installed.length, 1);
  assert.equal(
    (await b("/extensions/update", body)).status,
    404,
    "stale requests never replace another current version",
  );
  assert.equal((await b("/extensions/updates")).data.items.length, 0);
  const third = (await a("/extensions/publish", pkg("1.2.0", ["storage"])))
    .data;
  const next = (await b("/extensions/updates")).data.items[0];
  assert.deepEqual(next.removed_permissions, ["ui.commands"]);
  const unrelated = (
    await other("/extensions/publish", {
      ...pkg("2.0.0"),
      slug: "other-package",
    })
  ).data;
  assert.equal(
    (
      await b("/extensions/update", {
        ...body,
        from: second.id,
        release: unrelated.id,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await a(
        "/extensions/releases/" + third.id + "/review",
        { status: "withdrawn", note: "Withdraw fixture" },
        "PATCH",
      )
    ).status,
    200,
  );
  assert.equal(
    (await b("/extensions/updates")).data.items.length,
    0,
    "withdrawn latest cannot be installed via update",
  );
});
