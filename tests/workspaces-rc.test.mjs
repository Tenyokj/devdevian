import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { readFile, stat } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { openDatabase } from "../database.mjs";
import { createBackup, restoreBackup } from "../backup.mjs";
import { objectStorage } from "../object-storage.mjs";
import { inspectSchema } from "../schema.mjs";
import { prepareWorkspaces } from "../review-revisions.mjs";
import { startTestServer } from "./http-fixture.mjs";
const password = "Fixture-password123";
async function account(f, name) {
  const api = f.client(),
    data = { name, username: name, email: name + "@fixture.test", password };
  const created = await api("/register", data);
  assert.equal(created.status, 200);
  return { api, user: created.data.user, data };
}
function migrate(path, args = []) {
  return spawnSync(
    process.execPath,
    [join(process.cwd(), "scripts/migrate.mjs"), ...args],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 10000,
      env: {
        PATH: process.env.PATH,
        NODE_ENV: "production",
        DB_PATH: path,
        DB_DRIVER: process.env.DB_DRIVER || "",
        UPLOAD_DRIVER: "local",
      },
    },
  );
}
function schema(db) {
  return db
    .prepare(
      "SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
    )
    .all()
    .map((row) => [row.type, row.name, row.sql]);
}
test("release guard rejects future schemas, damaged v6 readiness and migration flag typos without downgrading", async () => {
  const f = await startTestServer();
  const db = new DatabaseSync(f.path);
  try {
    const original = schema(db);
    db.exec("UPDATE app_schema SET version=8");
    assert.throws(() => inspectSchema(db), /newer than this release/);
    const future = migrate(f.path);
    assert.notEqual(future.status, 0);
    assert.equal(db.prepare("SELECT version FROM app_schema").get().version, 8);
    assert.deepEqual(schema(db), original);
    db.exec("UPDATE app_schema SET version=6");
    for (const args of [
      ["--prepare-workspace"],
      ["--prepare-workspaces", "--prepare-cli"],
    ]) {
      assert.notEqual(migrate(f.path, args).status, 0);
      assert.equal(
        db.prepare("SELECT version FROM app_schema").get().version,
        6,
      );
      assert.deepEqual(schema(db), original);
    }
    for (const drop of [
      "DROP TRIGGER review_revisions_immutable",
      "DROP INDEX code_reviews_snapshot",
      "DROP INDEX project_work_requests_project",
    ]) {
      db.exec(drop);
      assert.equal(inspectSchema(db, { allowPreparedWorkspaces: true }), false);
      prepareWorkspaces(db);
      assert.equal(inspectSchema(db, { allowPreparedWorkspaces: true }), true);
    }
    // Non-Vercel production must fail closed before it can initialize schema.
    db.exec("DROP TABLE workspace_schema");
    const before = schema(db);
    const startup = spawnSync(process.execPath, ["server.mjs"], {
      encoding: "utf8",
      timeout: 5000,
      env: {
        PATH: process.env.PATH,
        DEVDEVIAN_EXPLICIT_ENV: "1",
        NODE_ENV: "production",
        APP_URL: "http://127.0.0.1",
        DB_PATH: f.path,
        DB_DRIVER: process.env.DB_DRIVER || "",
        UPLOAD_DRIVER: "local",
      },
    });
    assert.notEqual(startup.status, 0);
    assert.match(startup.stderr, /requires migration/);
    assert.deepEqual(schema(db), before);
  } finally {
    db.close();
    await f.close();
  }
});

test(
  "encrypted Workspaces restore boots prepared v6 without DDL, preserves files/anchors and safely resumes after rollback-era writes",
  { timeout: 30000 },
  async () => {
    const f = await startTestServer();
    let restoredServer, source;
    try {
      const owner = await account(f, "rc_owner"),
        reader = await account(f, "rc_reader"),
        anon = f.client();
      const pr = (
        await owner.api("/projects", {
          name: "Recovery Orbit",
          topic: "web",
          stage: "Prototype",
          description: "A disposable project for release recovery rehearsal.",
          help: "Review rollback and restored file authorization.",
        })
      ).data;
      const community = (
        await owner.api("/communities", {
          name: "Recovery private team",
          description: "Private snapshot and file recovery rehearsal.",
        })
      ).data;
      const review = (
        await owner.api("/posts", {
          kind: "review",
          title: "Recover the original retry safely",
          topic: "web",
          community_id: community.id,
          body: "This private review and its original feedback must survive recovery.",
          code: "export const retry = () => true;",
          review_focus: "Check the retry recovery boundary.",
        })
      ).data;
      const root = `/posts/${review.id}`;
      const db = new DatabaseSync(f.path);
      db.prepare(
        "INSERT INTO memberships(user_id,kind,item) VALUES(?,'group',?)",
      ).run(reader.user.id, community.id);
      assert.equal(
        (
          await owner.api(
            `/projects/${pr.id}/work-requests/${review.id}`,
            { state: "in_progress", expected_version: 0 },
            "PUT",
          )
        ).status,
        201,
      );
      const first = (await owner.api(root + "/revisions")).data;
      const meta = (await owner.api(root + "/code-reviews")).data;
      const remark = await reader.api(root + "/code-reviews", {
        revision_id: first.current_revision_id,
        snippet_hash: meta.snippet_hash,
        start_line: 1,
        end_line: 1,
        body: "Keep this original concern and its quote.",
      });
      assert.equal(remark.status, 201);
      const reply = await owner.api(
        root + `/code-reviews/${remark.data.id}/replies`,
        { body: "We will retain it through the next revision." },
      );
      assert.equal(reply.status, 201);
      // Concurrent writers with the same baseline cannot both win.
      const input = {
        base_revision_id: first.current_revision_id,
        expected_revision: first.post_revision,
        files: [
          { path: "src/retry.ts", code: "export const retry = () => false;" },
          { path: "test/retry.ts", code: "assert.equal(retry(), false);" },
        ],
        review_focus: "Check both the retry and its regression test.",
      };
      const race = await Promise.all([
        owner.api(root + "/revisions", input),
        owner.api(root + "/revisions", input),
      ]);
      assert.deepEqual(race.map((r) => r.status).sort(), [201, 409]);
      const before = (await owner.api(root + "/revisions")).data;
      assert.equal(before.items.length, 2);
      const fileId = "12345678-1234-1234-1234-123456789012",
        bytes = Buffer.from("Private recovery fixture file.\n");
      db.prepare(
        "INSERT INTO uploads(id,user_id,post_id,name,mime,size) VALUES(?,?,?,?,?,?)",
      ).run(
        fileId,
        owner.user.id,
        review.id,
        "recovery.txt",
        "text/plain",
        bytes.length,
      );
      const storage = objectStorage({
        UPLOAD_DRIVER: "local",
        DB_PATH: f.path,
      });
      await storage.put(fileId, bytes);
      db.close();
      source = await openDatabase({
        DB_PATH: f.path,
        DB_DRIVER: process.env.DB_DRIVER,
      });
      const archive = join(f.directory, "workspaces.ddb"),
        target = join(f.directory, "restored"),
        key = randomBytes(32).toString("hex");
      const report = await createBackup({
        db: source,
        storage,
        output: archive,
        key,
      });
      assert.equal(report.files, 1);
      assert.equal((await stat(archive)).mode & 0o777, 0o600);
      await restoreBackup({ input: archive, key, target });
      assert.deepEqual(await readFile(join(target, "uploads", fileId)), bytes);
      const restoredPath = join(target, "database.sqlite"),
        restored = new DatabaseSync(restoredPath);
      assert.equal(
        restored.prepare("SELECT COUNT(*) n FROM sessions").get().n,
        0,
      );
      assert.equal(
        restored.prepare("SELECT COUNT(*) n FROM review_revisions").get().n,
        2,
      );
      assert.equal(
        restored
          .prepare("SELECT snapshot_id FROM code_reviews WHERE id=?")
          .get(remark.data.id).snapshot_id,
        first.current_revision_id,
      );
      assert.throws(
        () =>
          restored
            .prepare("UPDATE review_revisions SET code='wrong' WHERE id=?")
            .run(first.current_revision_id),
        /immutable/,
      );
      // Prepared marker 6 is the additive deployment / pre-finalization rollback window.
      restored.exec("UPDATE app_schema SET version=6");
      const preparedSchema = schema(restored);
      restoredServer = await startTestServer({ databasePath: restoredPath });
      assert.deepEqual(
        schema(restored),
        preparedSchema,
        "cold start performs no DDL",
      );
      assert.equal(
        restored.prepare("SELECT version FROM app_schema").get().version,
        6,
      );
      const visitor = restoredServer.client(),
        author = restoredServer.client(),
        member = restoredServer.client();
      assert.equal((await visitor(root + "/revisions")).status, 404);
      assert.equal(
        (await author("/login", { email: owner.data.email, password })).status,
        200,
      );
      assert.equal(
        (await member("/login", { email: reader.data.email, password })).status,
        200,
      );
      const old = (
        await author(root + "/revisions/" + first.current_revision_id)
      ).data;
      assert.equal(old.code, "export const retry = () => true;");
      assert.equal(
        (await member(root + `/code-reviews/${remark.data.id}/replies`)).data[0]
          .body,
        "We will retain it through the next revision.",
      );
      const device = (
        await visitor("/cli/device", { name: "Restored fixture terminal" })
      ).data;
      await author("/cli/authorize", {
        user_code: device.user_code,
        approved: true,
      });
      const token = (
        await visitor("/cli/token", { device_code: device.device_code })
      ).data.access_token;
      const download = await fetch(
        restoredServer.base + "/api/uploads/" + fileId,
        { headers: { Authorization: "Bearer " + token } },
      );
      assert.equal(download.status, 200);
      assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
      assert.equal(
        (await fetch(restoredServer.base + "/api/uploads/" + fileId)).status,
        404,
      );
      restored
        .prepare("DELETE FROM memberships WHERE user_id=? AND kind='group'")
        .run(reader.user.id);
      assert.equal(
        (await member(root + "/revisions/" + first.current_revision_id)).status,
        404,
      );
      assert.equal(
        (await member(`/projects/${pr.id}/workspace`)).data.counts.total,
        0,
      );
      await restoredServer.close();
      restoredServer = null;
      // Simulate an old writer during rollback without pretending to recover unknown code.
      const rollbackCode = "export const retry = () => 'rollback-era';";
      restored
        .prepare("UPDATE posts SET code=?,revision=revision+1 WHERE id=?")
        .run(rollbackCode, review.id);
      const { createHash } = await import("node:crypto");
      restored
        .prepare(
          "INSERT INTO code_reviews(post_id,user_id,snippet_hash,start_line,end_line,quote,body) VALUES(?,?,?,?,?,?,?)",
        )
        .run(
          review.id,
          owner.user.id,
          createHash("sha256").update(rollbackCode).digest("hex"),
          1,
          1,
          rollbackCode,
          "Legacy writer quote stays honest.",
        );
      assert.equal(migrate(restoredPath, ["--prepare-workspaces"]).status, 0);
      assert.equal(
        restored.prepare("SELECT version FROM app_schema").get().version,
        6,
      );
      assert.equal(
        restored.prepare("SELECT COUNT(*) n FROM review_revisions").get().n,
        3,
      );
      assert.equal(
        restored
          .prepare(
            "SELECT snapshot_id FROM code_reviews WHERE body='Legacy writer quote stays honest.'",
          )
          .get().snapshot_id,
        null,
      );
      assert.equal(migrate(restoredPath).status, 0);
      assert.equal(
        restored.prepare("SELECT version FROM app_schema").get().version,
        7,
      );
      assert.equal(
        restored
          .prepare("SELECT quote FROM code_reviews WHERE id=?")
          .get(remark.data.id).quote,
        old.code,
      );
      restored.close();
      assert.equal(
        (await owner.api(root + "/revisions")).data.items.length,
        before.items.length,
        "rehearsal never changes the source",
      );
    } finally {
      if (restoredServer) await restoredServer.close();
      source?.close();
      await f.close();
    }
  },
);
