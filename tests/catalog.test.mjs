import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { startTestServer } from "./http-fixture.mjs";
import { client } from "../packages/cli/lib/client.mjs";

test("catalog API shares browser data, protects ownership/revisions/media, hides meeting links and makes attendance idempotent", async () => {
  const f = await startTestServer(),
    browser = f.client(),
    other = f.client(),
    anon = f.client();
  try {
    const account = await browser("/register", {
      name: "Catalog Founder",
      username: "catalog_founder",
      email: "founder@catalog.test",
      password: "Fixture-password123",
    });
    await other("/register", {
      name: "Guest Developer",
      username: "catalog_guest",
      email: "guest@catalog.test",
      password: "Fixture-password123",
    });
    const device = (await anon("/cli/device", { name: "Catalog test" })).data;
    await browser("/cli/authorize", {
      user_code: device.user_code,
      approved: true,
    });
    const token = (
      await anon("/cli/token", { device_code: device.device_code })
    ).data.access_token;
    const api = client(f.base, token);
    const image = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=",
      "base64",
    );
    const upload = await api("/uploads", {
      method: "POST",
      raw: image,
      filename: "logo.png",
    });
    const data = {
      name: "Orbit Catalog",
      description: "A useful project shared from a terminal workspace.",
      help: "Review the onboarding and reliability design.",
      topic: "web",
      stack: "Node.js",
      stage: "Prototype",
      url: "https://example.com/orbit",
      repo: "https://github.com/example/orbit",
      details: {
        logo: upload.id,
        screenshots: [upload.id],
        tagline: "Build together",
        team: [{ user_id: account.data.user.id, role: "Founder" }],
        links: [{ label: "Guide", url: "https://example.com/guide" }],
      },
    };
    const created = await api("/projects", { method: "POST", body: data });
    let project = await api("/projects/" + created.id);
    assert.equal(project.logo, upload.id);
    assert.equal(project.team[0].username, "catalog_founder");
    assert.equal(
      (await browser("/posts/" + project.post_id)).data.project.tagline,
      "Build together",
    );
    assert.equal(
      (
        await other(
          "/projects/" + project.id,
          { ...data, details: undefined, revision: project.revision },
          "PATCH",
        )
      ).status,
      403,
    );
    const changed = {
      ...data,
      name: "Orbit Updated",
      stage: "Beta",
      revision: project.revision,
      details: { tagline: "A newer tagline" },
    };
    await api("/projects/" + project.id, { method: "PATCH", body: changed });
    await assert.rejects(
      api("/projects/" + project.id, { method: "PATCH", body: changed }),
      { status: 409 },
    );
    project = await api("/projects/" + project.id);
    assert.equal(project.name, "Orbit Updated");
    assert.equal(project.tagline, "A newer tagline");
    assert.equal(project.logo, upload.id);
    assert.equal(
      (await browser("/posts/" + project.post_id)).data.title,
      "Showcase: Orbit Updated",
    );
    assert.ok(
      (await api("/projects?topic=web&stage=Beta&q=Orbit")).items.some(
        (p) => p.id === project.id,
      ),
    );
    assert.equal((await api("/projects?stage=Idea&q=Orbit")).items.length, 0);
    await assert.rejects(
      api("/projects/" + project.id, {
        method: "PATCH",
        body: {
          ...changed,
          revision: project.revision,
          details: { logo: "unknown-image-id" },
        },
      }),
      { status: 400 },
    );
    assert.equal(
      (await api("/projects/" + project.id)).revision,
      project.revision,
    );
    const event = await api("/events", {
      method: "POST",
      body: {
        title: "Terminal builders meetup",
        description:
          "A practical session about building useful developer tools.",
        topic: "web",
        local_start: "2099-11-04T18:30",
        timezone: "Asia/Shanghai",
        duration: 60,
        url: "https://example.com/private-meeting",
        details: { banner: upload.id },
      },
    });
    assert.equal((await anon("/events/" + event.id)).data.url, undefined);
    assert.equal((await other("/events/" + event.id)).data.url, undefined);
    let e = await api("/events/" + event.id);
    assert.equal(e.banner, upload.id);
    assert.equal(e.start_at, "2099-11-04T10:30:00.000Z");
    const guest = await other(
      "/events/" + event.id + "/attendance",
      { attending: true },
      "PUT",
    );
    assert.equal(guest.data.viewer_attending, true);
    assert.ok(guest.data.url);
    await other(
      "/events/" + event.id + "/attendance",
      { attending: true },
      "PUT",
    );
    assert.equal((await api("/events/" + event.id)).attendee_count, 1);
    assert.equal(
      (
        await other(
          "/events/" + event.id,
          { ...e, revision: e.revision },
          "PATCH",
        )
      ).status,
      403,
    );
    await api(`/events/${e.id}/lifecycle`, {
      method: "POST",
      body: { action: "cancel", revision: e.revision },
    });
    assert.equal((await other("/events/" + event.id)).data.url, undefined);
    assert.equal(
      (
        await other(
          "/events/" + event.id + "/attendance",
          { attending: true },
          "PUT",
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await other(
          "/events/" + event.id + "/attendance",
          { attending: false },
          "PUT",
        )
      ).status,
      200,
    );
    assert.equal((await api("/events/" + event.id)).attendee_count, 0);
    const calendar = await api(`/events/${e.id}/calendar`, {
      responseType: "text",
    });
    assert.ok(calendar.startsWith("BEGIN:VCALENDAR"));
    assert.ok(!calendar.includes("private-meeting"));
    const db = new DatabaseSync(f.path);
    db.prepare("UPDATE posts SET removed_at=CURRENT_TIMESTAMP WHERE id=?").run(
      project.post_id,
    );
    db.close();
    assert.equal((await other("/projects/" + project.id)).status, 404);
    assert.equal((await anon("/projects/" + project.id)).status, 404);
    assert.equal((await browser("/projects/" + project.id)).status, 200);
  } finally {
    await f.close();
  }
});
