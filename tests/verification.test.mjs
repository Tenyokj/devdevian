import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./http-fixture.mjs";
import { openDatabase } from "../database.mjs";
test("only verified configured owner grants or revokes badges; profile edits and matching names cannot forge identity", async (t) => {
  const f = await startTestServer({ ownerEmail: "owner@fixture.test" });
  t.after(() => f.close());
  const owner = f.client(),
    member = f.client(),
    guest = f.client();
  const register = (c, name) =>
    c("/register", {
      name,
      email: name + "@fixture.test",
      password: "Fixture-password123",
    });
  const a = (await register(owner, "owner")).data.user,
    b = (await register(member, "member")).data.user;
  const route = `/platform/users/${b.id}/verification`;
  assert.equal((await owner(route, { verified: true }, "PATCH")).status, 403);
  await f.verifyEmail("owner@fixture.test");
  assert.equal((await member(route, { verified: true }, "PATCH")).status, 403);
  assert.equal((await guest(route, { verified: true }, "PATCH")).status, 401);
  assert.equal(
    (
      await member(
        "/details/user-verification/" + b.id,
        { verified: true },
        "PUT",
      )
    ).status,
    404,
  );
  await member(
    "/developer-profile",
    { name: "owner", role: "Founder", verified: true, founder: true },
    "PATCH",
  );
  assert.equal((await guest("/users/" + b.id)).data.verified, false);
  const founder = (await guest("/users/" + a.id)).data;
  assert.equal(founder.verified, true);
  assert.equal(founder.founder, true);
  assert.equal(founder.role, "Founder");
  const bulk = await guest(`/identities?ids=${a.id},${b.id},999999`);
  assert.equal(bulk.status, 200);
  assert.equal(bulk.data.identities[a.id].founder, true);
  assert.equal(bulk.data.identities[b.id].verified, false);
  assert.deepEqual(bulk.data.identities[999999], {
    verified: false,
    founder: false,
  });
  assert.equal(
    (await guest("/identities?ids=" + Array(101).fill(a.id).join(","))).status,
    400,
  );
  assert.equal((await guest("/identities?ids=invalid")).status, 400);

  assert.equal(
    (await owner("/platform/users?q=@" + b.username)).data.items.length,
    1,
  );
  assert.equal((await owner(route, { verified: "true" }, "PATCH")).status, 400);
  assert.equal((await owner(route, { verified: true }, "PATCH")).status, 200);
  assert.equal((await guest("/users/" + b.id)).data.verified, true);
  await member(
    "/developer-profile",
    { name: "Updated", role: "Developer", details: { verified: false } },
    "PATCH",
  );
  assert.equal((await guest("/users/" + b.id)).data.verified, true);
  assert.equal((await owner(route, { verified: false }, "PATCH")).status, 200);
  assert.equal((await guest("/users/" + b.id)).data.verified, false);
  assert.equal(
    (
      await owner(
        `/platform/users/${a.id}/verification`,
        { verified: false },
        "PATCH",
      )
    ).status,
    409,
  );
  const db = await openDatabase({
    DB_PATH: f.path,
    DB_DRIVER: process.env.DB_DRIVER,
  });
  t.after(() => db.close());
  assert.equal(
    db
      .prepare(
        "SELECT count(*) n FROM entity_details WHERE kind='verification-event'",
      )
      .get().n,
    2,
  );
  db.prepare(
    "UPDATE entity_details SET data=? WHERE kind='user-verification' AND entity_id=?",
  ).run(JSON.stringify({ verified: true }), String(b.id));
  db.prepare("UPDATE users SET privacy='hidden' WHERE id=?").run(b.id);
  assert.equal((await owner(route, { verified: true }, "PATCH")).status, 404);
  assert.equal((await owner("/platform/users?q=Updated")).data.items.length, 0);
});
