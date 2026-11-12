import { inspectExtensionSecurity } from "../extension-security.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { startTestServer } from "./http-fixture.mjs";
import {
  builtinThemes,
  validateManifest,
  themeTokens,
} from "../extension-manifest.mjs";
import { createBackup, restoreBackup } from "../backup.mjs";
import { objectStorage } from "../object-storage.mjs";
const manifest = () => structuredClone(builtinThemes[0].manifest);
const publication = (version = "1.0.0") => ({
  name: "Test Golden Hour",
  slug: "test-golden-hour",
  version,
  description: "A warm palette for calm evening development sessions.",
  manifest: manifest(),
});
test("theme manifests reject executable surfaces, remote resources, missing tokens and unreadable text", () => {
  for (const b of builtinThemes) {
    assert.deepEqual(validateManifest(b.manifest), b.manifest);
    assert.match(themeTokens(b.manifest)["--accent-rgb"], /^\d+, \d+, \d+$/);
  }
  for (const mutate of [
    (x) => (x.script = "alert(1)"),
    (x) => (x.css = "body{display:none}"),
    (x) => (x.palette.accent = "url(https://example.com)"),
    (x) => (x.palette.surface = "#fff;display:none"),
    (x) => (x.font = "https://example.com/font"),
    (x) => delete x.palette.line,
    (x) => (x.palette.text = x.palette.canvas),
    (x) => (x.palette.code = "#ffffff"),
    (x) => (x.palette.extra = "#ffffff"),
    (x) => (x.schema = 2),
  ]) {
    const m = manifest();
    mutate(m);
    assert.throws(() => validateManifest(m));
  }
});
test("extensions isolate installs, pin immutable versions, require explicit trust, and scope review privileges", async (t) => {
  const f = await startTestServer({
    ownerEmail: "reviewer@extensions.test",
  });
  t.after(() => f.close());
  const author = f.client(),
    reader = f.client(),
    other = f.client(),
    reviewer = f.client(),
    guest = f.client();
  for (const [api, name] of [
    [author, "author"],
    [reader, "reader"],
    [other, "other"],
    [reviewer, "reviewer"],
  ])
    assert.equal(
      (
        await api("/register", {
          name,
          email: name + "@extensions.test",
          password: "Fixture-password123",
        })
      ).status,
      200,
    );
  await f.verifyEmail("reviewer@extensions.test");
  assert.equal(
    (await guest("/extensions/install", { release: "amber-night" })).status,
    401,
  );
  const listing = (await guest("/extensions/library")).data;
  assert.equal(listing.builtins.length, 4);
  const fake = publication();
  fake.review = "reviewed";
  fake.user_id = 999;
  const first = await author("/extensions/publish", fake);
  assert.equal(first.status, 201, JSON.stringify(first.data));
  assert.equal(first.data.review, "unreviewed");
  assert.notEqual(first.data.author.id, 999);
  assert.equal(
    (await other("/extensions/publish", publication("2.0.0"))).status,
    409,
  );
  assert.equal(
    (await author("/extensions/publish", publication())).status,
    409,
  );
  assert.equal(
    (await reader("/extensions/install", { release: first.data.id })).status,
    409,
  );
  let installed = await reader("/extensions/install", {
    release: first.data.id,
    acknowledge_unreviewed: true,
  });
  assert.equal(installed.data.active.id, first.data.id);
  assert.equal(
    (await reader("/extensions/me?active_only=1")).data.active.id,
    first.data.id,
  );
  assert.equal((await other("/extensions/me?active_only=1")).data.active, null);
  assert.equal((await other("/extensions/me")).data.active, null);
  assert.deepEqual((await other("/extensions/me")).data.installed, []);
  assert.equal(
    (await other("/extensions/active", { release: first.data.id }, "PUT"))
      .status,
    404,
  );
  assert.equal(
    (
      await reader(
        "/extensions/releases/" + first.data.id + "/review",
        { status: "reviewed", note: "Looks good." },
        "PATCH",
      )
    ).status,
    403,
  );
  const checked = await reviewer(
    "/extensions/releases/" + first.data.id + "/review",
    {
      status: "reviewed",
      note: "Verified palette contrast and rendering.",
      acknowledge_sources: true,
      expected_review: "unreviewed",
      expected_revision: 0,
      digest: inspectExtensionSecurity(first.data.manifest).digest,
    },
    "PATCH",
  );
  assert.equal(checked.status, 200);
  assert.equal(checked.data.review, "reviewed");
  assert.equal(
    (await other("/extensions/install", { release: first.data.id })).status,
    200,
  );
  const next = publication("1.1.0");
  next.manifest.palette.accent = "#8ce9cb";
  const second = await author("/extensions/publish", next);
  assert.equal(second.status, 201);
  assert.equal(second.data.review, "unreviewed");
  assert.equal((await reader("/extensions/me")).data.active.version, "1.0.0");
  assert.deepEqual(
    (await reader("/extensions/me")).data.active.manifest,
    first.data.manifest,
  );
  assert.equal(
    (await guest("/extensions/library?filter=reviewed")).data.items.length,
    0,
  );
  await reviewer(
    "/extensions/releases/" + first.data.id + "/review",
    {
      status: "unreviewed",
      note: "Review revoked for further inspection.",
      expected_review: "reviewed",
      expected_revision: 1,
      digest: inspectExtensionSecurity(first.data.manifest).digest,
    },
    "PATCH",
  );
  assert.equal((await reader("/extensions/me")).data.active, null);
  assert.equal(
    (await reader("/extensions/active", { release: first.data.id }, "PUT"))
      .status,
    409,
  );
  assert.equal(
    (await reader("/extensions/install", { release: first.data.id })).status,
    409,
  );
  await author(
    "/extensions/releases/" + second.data.id + "/review",
    {
      status: "withdrawn",
      note: "Replacing this palette with a better version.",
    },
    "PATCH",
  );
  assert.equal(
    (
      await reader("/extensions/install", {
        release: second.data.id,
        acknowledge_unreviewed: true,
      })
    ).status,
    404,
  );
  await reader("/extensions/install", { release: "solar-paper" });
  await reader("/extensions/installs/solar-paper", undefined, "DELETE");
  assert.equal((await reader("/extensions/me")).data.active, null);
  await reader("/extensions/install", { release: "amber-night" });
  await reader("/extensions/active", { release: null }, "PUT");
  assert.equal((await reader("/extensions/me")).data.active, null);
  assert.equal(
    (await guest("/extensions/library?q=%27%20OR%201%3D1--")).status,
    200,
  );
  assert.equal((await guest("/extensions/library?page=1.2")).status, 400);
  const invalid = publication("1.2.0");
  invalid.manifest.css = "*{display:none}";
  assert.equal((await author("/extensions/publish", invalid)).status, 400);
  const db = new DatabaseSync(f.path);
  try {
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM extension_reviews").get().n,
      3,
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM extension_releases").get().n,
      2,
    );
  } finally {
    db.close();
  }
});
test("theme publications and account installs survive encrypted restore without carrying authentication", async (t) => {
  const f = await startTestServer();
  t.after(() => f.close());
  const a = f.client();
  await a("/register", {
    name: "restore",
    email: "restore@extensions.test",
    password: "Fixture-password123",
  });
  await a("/extensions/install", { release: "mint-terminal" });
  await a("/extensions/publish", publication());
  const code = await a("/extensions/publish", {
    name: "Restore code package",
    listing: {
      full_description: "## Restored listing",
      tags: ["recovery"],
      links: [],
      screenshots: [],
    },
    slug: "restore-code",
    version: "1.0.0",
    description: "A package whose grants and enabled state survive recovery.",
    manifest: {
      schema: 2,
      kind: "extension",
      permissions: ["storage"],
      entry: "main.js",
      files: { "main.js": "void 0" },
      styles: { light: "", dark: "" },
    },
  });
  assert.equal(code.status, 201);
  assert.equal(
    (
      await a("/extensions/install", {
        release: code.data.id,
        acknowledge_unreviewed: true,
        granted_permissions: ["storage"],
      })
    ).status,
    200,
  );

  const db = new DatabaseSync(f.path),
    key = randomBytes(32).toString("hex"),
    output = join(f.directory, "extensions.ddb");
  try {
    await createBackup({
      db,
      storage: objectStorage({
        UPLOAD_DRIVER: "local",
        UPLOAD_DIR: join(f.directory, "uploads"),
      }),
      output,
      key,
      maxBytes: 50 * 1024 * 1024,
    });
  } finally {
    db.close();
  }
  const target = join(f.directory, "restored");
  await restoreBackup({ input: output, key, target });
  const restored = new DatabaseSync(join(target, "database.sqlite"));
  try {
    assert.equal(
      restored.prepare("SELECT release_key FROM extension_active").get()
        .release_key,
      "mint-terminal",
    );
    assert.equal(
      restored.prepare("SELECT COUNT(*) n FROM extension_releases").get().n,
      2,
    );
    assert.deepEqual(
      {
        ...restored
          .prepare(
            "SELECT enabled,grants FROM extension_installs WHERE release_key=?",
          )
          .get(code.data.id),
      },
      { enabled: 1, grants: '["storage"]' },
    );
    assert.equal(
      restored.prepare("SELECT COUNT(*) n FROM sessions").get().n,
      0,
    );
  } finally {
    restored.close();
  }
  const listingCheck = new DatabaseSync(join(target, "database.sqlite"));
  try {
    assert.equal(
      JSON.parse(
        listingCheck
          .prepare(
            "SELECT data FROM entity_details WHERE kind='extension' AND entity_id=?",
          )
          .get(String(code.data.id.slice(6))).data,
      ).full_description,
      "## Restored listing",
    );
  } finally {
    listingCheck.close();
  }
  const running = await startTestServer({
    databasePath: join(target, "database.sqlite"),
  });
  t.after(() => running.close());
  const account = running.client();
  assert.equal(
    (
      await account("/login", {
        email: "restore@extensions.test",
        password: "Fixture-password123",
      })
    ).status,
    200,
  );
  assert.equal(
    (await account("/extensions/me")).data.active.id,
    "mint-terminal",
  );
});

test("extension quotas persist across requests and moderator status alone cannot verify", async (t) => {
  const f = await startTestServer();
  t.after(() => f.close());
  const author = f.client(),
    moderator = f.client();
  await author("/register", {
    name: "budget",
    email: "budget@extensions.test",
    password: "Fixture-password123",
  });
  await moderator("/register", {
    name: "moderator",
    email: "moderator@fixture.test",
    password: "Fixture-password123",
  });
  const first = await author("/extensions/publish", publication());
  assert.equal((await moderator("/extensions/me")).data.can_review, false);
  assert.equal(
    (
      await moderator(
        "/extensions/releases/" + first.data.id + "/review",
        { status: "reviewed", note: "Trying moderator privileges." },
        "PATCH",
      )
    ).status,
    403,
  );
  for (let i = 1; i < 12; i++)
    assert.equal(
      (await author("/extensions/publish", publication(`1.0.${i}`))).status,
      201,
    );
  assert.equal(
    (await author("/extensions/publish", publication("1.0.12"))).status,
    429,
  );
});
