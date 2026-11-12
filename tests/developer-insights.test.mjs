import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./http-fixture.mjs";
import { openDatabase } from "../database.mjs";
import { seedInsights } from "./insights-fixture.mjs";
test("profile insights aggregate retained records and preserve privacy across all metrics and projects", async (t) => {
  const f = await startTestServer();
  t.after(() => f.close());
  const s = await seedInsights(f),
    guest = f.client();
  const publicStats = await guest(`/users/${s.id}/insights?days=30`);
  assert.equal(publicStats.status, 200, JSON.stringify(publicStats.data));
  const d = publicStats.data;
  assert.equal(d.totals.conversations, 3);
  assert.equal(d.totals.questions, 1);
  assert.equal(d.totals.review_requests, 1);
  assert.equal(d.totals.replies, 2);
  assert.equal(d.totals.accepted_solutions, 1);
  assert.equal(d.totals.code_feedback, 1);
  assert.equal(d.totals.feedback_replies, 1);
  assert.equal(d.totals.assigned_tasks, 1);
  assert.equal(d.totals.projects_participated, 1);
  assert.equal(d.contributions[0].state, "accepted");
  assert.equal(d.personal, null);
  assert.equal(d.scope, "public");
  assert.equal(d.projects[0].name, "Public Project");
  assert.equal(
    d.technologies.find((x) => x.name === "TypeScript").count,
    3,
    "duplicate stack tokens count each post once",
  );
  assert.equal(
    d.breakdown.find((x) => x.category === "conversation").count,
    2,
    "window excludes the old conversation while lifetime totals retain it",
  );
  assert.ok(JSON.stringify(d).length < 65536);
  assert.ok(!JSON.stringify(d).includes("Secret"));
  assert.equal(d.limits.tracks_reading_time, false);
  assert.deepEqual(
    (await s.member(`/users/${s.id}/insights?days=30`)).data,
    d,
    "same-community viewers still receive public-only stats",
  );
  assert.equal(
    (await s.member(`/users/${s.id}/insights?scope=all`)).status,
    403,
  );
  assert.equal((await guest(`/users/${s.id}/insights?scope=all`)).status, 403);
  const own = (await s.a(`/users/${s.id}/insights?scope=all&days=30`)).data;
  assert.equal(own.totals.conversations, 4);
  assert.equal(own.totals.replies, 3);
  assert.equal(own.projects_total, 2);
  assert.equal(own.personal.following_conversations, 1);
  assert.equal(own.personal.bookmarks, 1);
  assert.equal(own.own, true);
  assert.equal(
    (await s.a(`/users/${s.id}/insights`)).data.personal,
    null,
    "public view excludes personal preferences even for owner",
  );
  for (const query of [
    "days=0",
    "days=366",
    "days=90&days=30",
    "scope=other",
    "project_page=-1",
    "project_page=1.5",
    "foo=1",
  ])
    assert.equal(
      (await guest(`/users/${s.id}/insights?${query}`)).status,
      400,
      query,
    );
  const db = await openDatabase({
    DB_PATH: f.path,
    DB_DRIVER: process.env.DB_DRIVER,
  });
  db.prepare(
    "DELETE FROM memberships WHERE user_id=? AND kind='group' AND item=?",
  ).run(s.id, s.group.id);
  db.close();
  const revoked = (await s.a(`/users/${s.id}/insights?scope=all`)).data;
  assert.equal(revoked.projects_total, 1);
  assert.ok(!JSON.stringify(revoked).includes("Secret"));
  const db2 = await openDatabase({
    DB_PATH: f.path,
    DB_DRIVER: process.env.DB_DRIVER,
  });
  db2.prepare("UPDATE users SET privacy='hidden' WHERE id=?").run(s.id);
  db2.close();
  assert.equal((await guest(`/users/${s.id}/insights`)).status, 404);
  assert.equal((await s.member(`/users/${s.id}/insights`)).status, 404);
  assert.equal((await s.a(`/users/${s.id}/insights`)).status, 200);
});
test("insights empty profiles have zero denominators and stable bounded project pages", async (t) => {
  const f = await startTestServer();
  t.after(() => f.close());
  const a = f.client(),
    r = await a("/register", {
      name: "Empty Profile",
      email: "empty@insights.test",
      password: "Fixture-password123",
    }),
    id = r.data.user.id;
  const result = await a(
    `/users/${id}/insights?days=365&scope=all&project_page=2`,
  );
  assert.equal(result.status, 200, JSON.stringify(result.data));
  const d = result.data;
  assert.equal(d.totals.conversations, 0);
  assert.equal(d.projects.length, 0);
  assert.equal(d.projects_total, 0);
  assert.deepEqual(d.activity, []);
  assert.deepEqual(d.breakdown, []);
  assert.deepEqual(d.topics, []);
  assert.deepEqual(d.technologies, []);
  assert.equal(d.window.days, 365);
  assert.equal(d.project_pagination.pages, 1);
});
