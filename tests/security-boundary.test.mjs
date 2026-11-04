import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  contentSecurityPolicy,
  securityHeaders,
} from "../security-headers.mjs";
import { startTestServer } from "./http-fixture.mjs";
test("production CSP restricts executable scripts, frames and API connections while keeping font and image origins explicit", () => {
  const config = JSON.parse(
    readFileSync(new URL("../vercel.json", import.meta.url)),
  );
  const headers = config.headers.find((h) => h.source === "/(.*)").headers;
  assert.equal(
    headers.find((h) => h.key === "Content-Security-Policy").value,
    contentSecurityPolicy,
  );
  assert.match(contentSecurityPolicy, /script-src 'self';/);
  assert.match(contentSecurityPolicy, /connect-src 'self';/);
  assert.match(contentSecurityPolicy, /object-src 'none'/);
  assert.match(contentSecurityPolicy, /frame-ancestors 'none'/);
  for (const file of ["index.html", "conversation.html"]) {
    const html = readFileSync(new URL("../" + file, import.meta.url), "utf8");
    assert.ok(html.includes('src="/theme-init.js"'));
    assert.doesNotMatch(html, /<script>/);
  }
  const result = {};
  securityHeaders({}, { setHeader: (k, v) => (result[k] = v) }, () => {});
  assert.equal(result["Content-Security-Policy"], contentSecurityPolicy);
});
test("cross-origin mutations are refused and malformed or oversized payloads return safe JSON without database or credential details", async () => {
  const f = await startTestServer();
  try {
    for (const [body, headers, status] of [
      [
        "{}",
        { "content-type": "application/json", Origin: "https://attacker.test" },
        403,
      ],
      ["{bad", { "content-type": "application/json" }, 400],
      [
        JSON.stringify({ text: "x".repeat(270000) }),
        { "content-type": "application/json" },
        413,
      ],
    ]) {
      const r = await fetch(f.base + "/api/posts", {
        method: "POST",
        headers,
        body,
      });
      assert.equal(r.status, status);
      const text = await r.text();
      assert.doesNotThrow(() => JSON.parse(text));
      assert.doesNotMatch(
        text,
        /SELECT |INSERT |stack|password:|authToken|libsql:\/\//i,
      );
    }
    const r = await fetch(f.base + "/api/me");
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal((await r.json()).user, null);
  } finally {
    await f.close();
  }
});
test("private project creation preserves community audience and keeps its logo, room, search and task source away from guests", async () => {
  const { client } = await import("../packages/cli/lib/client.mjs");
  const f = await startTestServer(),
    owner = f.client(),
    guest = f.client(),
    other = f.client();
  try {
    await owner("/register", {
      name: "Private Founder",
      username: "private_founder",
      email: "private@fixture.test",
      password: "Fixture-password123",
    });
    await other("/register", {
      name: "Outside Member",
      username: "outside_member",
      email: "outside@fixture.test",
      password: "Fixture-password123",
    });
    const community = (
      await owner("/communities", {
        name: "Private project team",
        description: "A private project audience.",
      })
    ).data;
    const device = (await guest("/cli/device", { name: "Private media check" }))
      .data;
    await owner("/cli/authorize", {
      user_code: device.user_code,
      approved: true,
    });
    const token = (
      await guest("/cli/token", { device_code: device.device_code })
    ).data.access_token;
    const api = client(f.base, token);
    const image = await api("/uploads", {
      method: "POST",
      raw: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=",
        "base64",
      ),
      filename: "private-logo.png",
    });
    const body = {
      name: "Private Orbit",
      description: "This project belongs to an approved private team.",
      help: "Review a bounded retry implementation.",
      topic: "web",
      stage: "Prototype",
      community_id: community.id,
      details: { logo: image.id, screenshots: [image.id] },
    };
    assert.equal((await other("/projects", body)).status, 400);
    const project = await owner("/projects", body);
    assert.equal(project.status, 201);
    assert.equal(project.data.community_id, community.id);
    for (const path of [
      `/projects/${project.data.id}`,
      `/projects/${project.data.id}/room`,
      `/posts/${project.data.post_id}`,
      `/uploads/${image.id}`,
    ]) {
      assert.equal((await guest(path)).status, 404, path);
      assert.equal((await other(path)).status, 404, path);
      if (path.startsWith("/uploads/")) {
        const response = await fetch(f.base + "/api" + path, {
          headers: { Authorization: "Bearer " + token },
        });
        assert.equal(response.status, 200);
        await response.body?.cancel();
      } else assert.equal((await owner(path)).status, 200, path);
    }
    const list = (await guest("/projects")).data;
    assert.equal(
      list.some((p) => p.id === project.data.id),
      false,
    );
    const search = (await guest("/search?type=projects&q=Private%20Orbit"))
      .data;
    assert.equal(
      (search.items || search).some((p) => p.id === project.data.id),
      false,
    );
  } finally {
    await f.close();
  }
});
