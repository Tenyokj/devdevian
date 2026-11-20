import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./http-fixture.mjs";
import { seedInsights } from "./insights-fixture.mjs";
import { openDatabase } from "../database.mjs";
import { preparePortfolio } from "../portfolio.mjs";
async function setup(t) {
  const f = await startTestServer();
  t.after(() => f.close());
  const s = await seedInsights(f),
    db = await openDatabase({
      DB_PATH: f.path,
      DB_DRIVER: process.env.DB_DRIVER || "",
    });
  t.after(() => db.close());
  return { f, s, db, root: `/users/${s.id}/portfolio`, guest: f.client() };
}
test("portfolio pins own public projects, conversations and accepted solutions in explicit order; optimistic versions prevent lost updates", async (t) => {
  const { s, root, guest } = await setup(t);
  const candidates = (await s.a(root + "/candidates")).data.items;
  assert.ok(candidates.some((x) => x.kind === "solution"));
  assert.ok(!JSON.stringify(candidates).includes("Secret"));
  const pins = ["solution", "project", "conversation"].map((kind) => {
    const p = candidates.find((x) => x.kind === kind);
    return { kind: p.kind, id: p.id };
  });
  assert.equal(
    (await s.a(root, { pins, expected_version: 0 }, "PUT")).status,
    200,
  );
  const d = (await guest(root)).data;
  assert.deepEqual(
    d.pins.map(({ kind, id }) => ({ kind, id })),
    pins,
  );
  assert.equal(d.version, 1);
  assert.equal(d.can_manage, false);
  const race = await Promise.all([
    s.a(root, { pins: [...pins].reverse(), expected_version: 1 }, "PUT"),
    s.a(root, { pins: [], expected_version: 1 }, "PUT"),
  ]);
  assert.deepEqual(race.map((x) => x.status).sort(), [200, 409]);
  assert.equal(
    (await s.b(root, { pins: [], expected_version: 2 }, "PUT")).status,
    403,
  );
  assert.equal((await s.b(root + "/candidates")).status, 403);
  assert.equal(
    (await s.a(root, { pins: [...pins, pins[0]], expected_version: 2 }, "PUT"))
      .status,
    400,
  );
});
test("portfolio rejects private, removed and foreign pins; hides pins when visibility changes for every viewer", async (t) => {
  const { s, root, guest, db } = await setup(t);
  for (const pin of [
    { kind: "project", id: s.privateProject },
    { kind: "conversation", id: s.privateId },
    { kind: "conversation", id: 999999 },
  ])
    assert.equal(
      (await s.a(root, { pins: [pin], expected_version: 0 }, "PUT")).status,
      409,
    );
  await s.a(
    root,
    { pins: [{ kind: "project", id: s.publicProject }], expected_version: 0 },
    "PUT",
  );
  db.prepare("UPDATE posts SET community_id=? WHERE id=?").run(
    s.group.id,
    s.publicId,
  );
  for (const read of [guest, s.a, s.member]) {
    const d = (await read(root)).data;
    assert.equal(d.pins.length, 0);
    assert.equal(d.totals.projects, 0);
    assert.equal(d.totals.contributions, 0);
    assert.ok(!JSON.stringify(d).includes("Secret"));
  }
});
test("portfolio feeds expose accepted current contributions, published Devlogs and public review context with bounded pagination", async (t) => {
  const { s, root, guest, db } = await setup(t);
  assert.equal(
    (
      await s.a(`/projects/${s.publicProject}/devlogs`, {
        title: "Public progress update",
        body: "We bounded the retry logic and verified cancellation.",
        status: "published",
        operation_key: "portfolio-public-update",
      })
    ).status,
    201,
  );
  await s.a(`/projects/${s.publicProject}/devlogs`, {
    title: "Secret draft",
    body: "Never on a public portfolio",
    status: "draft",
    operation_key: "portfolio-private-draft",
  });
  await s.a(`/projects/${s.privateProject}/devlogs`, {
    title: "Secret published update",
    body: "Private project details stay private.",
    status: "published",
    operation_key: "portfolio-private-published",
  });
  const d = (await guest(root)).data;
  assert.equal(d.totals.contributions, 1);
  assert.equal(d.totals.reviews, 1);
  assert.equal(d.totals.devlogs, 1);
  const logs = await guest(root + "?section=devlogs");
  assert.equal(logs.status, 200);
  assert.equal(logs.data.items.length, 1);
  assert.equal(logs.data.items[0].title, "Public progress update");
  assert.ok(!JSON.stringify(logs.data).includes("Secret"));
  const reviews = await guest(root + "?section=reviews");
  assert.equal(reviews.data.items[0].verdict, "line_feedback");
  const contributions = await guest(root + "?section=contributions");
  assert.equal(contributions.data.items[0].project_name, "Public Project");
  db.prepare(
    "UPDATE contributions SET state='changes_requested' WHERE user_id=?",
  ).run(s.id);
  assert.equal(
    (await guest(root + "?section=contributions")).data.pagination.total,
    0,
  );
  assert.equal((await guest(root + "?section=unknown")).status, 400);
  assert.equal((await guest(root + "?page=-1")).status, 400);
});
test("hidden/deleted profiles and removed parents stay unavailable; portfolio schema preparation is repeatable", async (t) => {
  const { s, root, guest, db } = await setup(t);
  preparePortfolio(db);
  preparePortfolio(db);
  db.prepare("UPDATE users SET privacy='hidden' WHERE id=?").run(s.id);
  assert.equal((await guest(root)).status, 404);
  assert.equal((await s.member(root)).status, 404);
  assert.equal((await s.a(root)).status, 200);
  db.prepare("UPDATE users SET deleted_at=CURRENT_TIMESTAMP WHERE id=?").run(
    s.id,
  );
  assert.equal((await s.a(root)).status, 404);
  db.prepare("UPDATE portfolio_schema SET version=2 WHERE id=1").run();
  assert.throws(() => preparePortfolio(db), /newer/);
});
test("portfolio order/version survive encrypted restoration without exposing authentication", async (t) => {
  const { f, s, root, db } = await setup(t);
  const pins = [
    { kind: "project", id: s.publicProject },
    { kind: "conversation", id: s.oldId },
  ];
  await s.a(root, { pins, expected_version: 0 }, "PUT");
  const { createBackup, restoreBackup } = await import("../backup.mjs"),
    { join } = await import("node:path"),
    { randomBytes } = await import("node:crypto");
  const key = randomBytes(32).toString("hex"),
    output = join(f.directory, "portfolio.ddb"),
    target = join(f.directory, "portfolio-restored");
  await createBackup({
    db,
    storage: {
      get: async () => {
        throw Error("No uploads expected");
      },
    },
    output,
    key,
  });
  await restoreBackup({ input: output, key, target });
  const restored = await openDatabase({
    DB_PATH: join(target, "database.sqlite"),
    DB_DRIVER: process.env.DB_DRIVER || "",
  });
  try {
    assert.deepEqual(
      JSON.parse(
        restored
          .prepare("SELECT pins FROM portfolio_profiles WHERE user_id=?")
          .get(s.id).pins,
      ),
      pins,
    );
    assert.equal(
      restored
        .prepare("SELECT version FROM portfolio_profiles WHERE user_id=?")
        .get(s.id).version,
      1,
    );
    assert.equal(
      restored.prepare("SELECT COUNT(*) n FROM sessions").get().n,
      0,
    );
  } finally {
    restored.close();
  }
});
