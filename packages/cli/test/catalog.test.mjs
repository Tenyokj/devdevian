import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  initialCatalog,
  prepareCatalog,
  publishCatalog,
  readImage,
  saveCalendar,
  localTime,
  catalogQuery,
  validateFilter,
} from "../lib/catalog.mjs";

test("catalog preview keeps images local; publication resumes uploads and never replays an uncertain write", async () => {
  const root = await mkdtemp(join(tmpdir(), "ddv-catalog-"));
  try {
    const image = Buffer.from("89504e470d0a1a0a00000000", "hex");
    await writeFile(join(root, "logo.png"), image);
    await writeFile(join(root, ".env"), image);
    await symlink(join(root, "logo.png"), join(root, "link.png"));
    await assert.rejects(readImage(root, ".env"));
    await assert.rejects(readImage(root, "link.png"));
    await assert.rejects(readImage(root, "../escape.png"));
    await writeFile(join(root, "bad.svg"), "<svg/>");
    await assert.rejects(readImage(root, "bad.svg"));
    let writes = 0,
      uploadCount = 0;
    const form = {
      entity: "project",
      values: {
        ...initialCatalog("project"),
        name: "Orbit",
        description: "Useful project with shared feedback.",
        help: "Review this workflow please.",
        logo: "logo.png",
        screenshots: "logo.png",
      },
    };
    const plan = await prepareCatalog(
      () => {
        writes++;
        throw Error("unexpected");
      },
      root,
      form,
    );
    assert.equal(writes, 0);
    assert.equal(plan.files.length, 2);
    let progress = {};
    const save = async (p) => {
      progress = p;
    };
    const api = async (path, options) => {
      if (path === "/uploads") {
        uploadCount++;
        assert.ok(Buffer.isBuffer(options.raw));
        return { id: "img-1" };
      }
      writes++;
      assert.equal(options.body.details.logo, "img-1");
      assert.deepEqual(options.body.details.screenshots, ["img-1"]);
      throw Object.assign(Error("validation"), { status: 400 });
    };
    await assert.rejects(publishCatalog(api, plan, progress, save));
    assert.equal(progress.uncertain, false);
    assert.equal(uploadCount, 1);
    await assert.rejects(
      publishCatalog(
        async (path, options) => {
          assert.equal(path, "/projects");
          assert.equal(options.body.details.logo, "img-1");
          throw Error("connection lost");
        },
        plan,
        progress,
        save,
      ),
    );
    assert.equal(progress.uncertain, true);
    const before = writes;
    await assert.rejects(
      publishCatalog(api, plan, progress, save),
      /outcome is unknown/,
    );
    assert.equal(writes, before);
    assert.deepEqual(
      await publishCatalog(api, plan, { completedId: 7 }, save),
      { id: 7 },
    );
    assert.ok(!JSON.stringify(progress).includes("89504e47"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("calendar export uses a new workspace file; date filters and organizer times preserve timezone", async () => {
  const root = await mkdtemp(join(tmpdir(), "ddv-calendar-"));
  const text = "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n";
  try {
    const api = async (path, options) => {
      assert.equal(path, "/events/4/calendar");
      assert.equal(options.responseType, "text");
      return text;
    };
    await saveCalendar(api, root, 4, "meetup.ics");
    assert.equal(await readFile(join(root, "meetup.ics"), "utf8"), text);
    await assert.rejects(
      saveCalendar(api, root, 4, "meetup.ics"),
      /already exists/,
    );
    await assert.rejects(saveCalendar(api, root, 4, "../escape.ics"));
    await assert.rejects(saveCalendar(api, root, 4, ".hidden.ics"));
    assert.equal(
      localTime("2099-11-04T10:30:00Z", "Asia/Shanghai"),
      "2099-11-04T18:30",
    );
    const query = new URLSearchParams(
      catalogQuery({
        page: 2,
        query: "a & b",
        mine: "attending",
        date: "2026-10-28",
        timezone: "Asia/Shanghai",
      }),
    );
    assert.equal(query.get("q"), "a & b");
    assert.equal(query.get("attending"), "1");
    assert.throws(() => validateFilter({ date: "2026-02-30" }));
    assert.throws(() => validateFilter({ timezone: "not/a-zone" }));
    assert.equal(
      validateFilter({ date: "2028-02-29", timezone: "UTC" }).date,
      "2028-02-29",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
