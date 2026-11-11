import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validatePackage,
  scopedStyles,
  layoutCSS,
} from "../extension-package.mjs";
import { buildExtension } from "../scripts/extension-build.mjs";
import { startTestServer } from "./http-fixture.mjs";
const manifest = () => ({
  schema: 2,
  kind: "extension",
  permissions: ["ui.style"],
  entry: "main.js",
  files: { "main.js": 'document.body.textContent="Hello"' },
  styles: { light: "body{color:red}", dark: ".sidebar{color:cyan}" },
});
test("code packages bound sources, capabilities, CSS scope and shell layout", async () => {
  assert.match(
    scopedStyles("body{color:red}.topbar{background:teal}"),
    /^\.devext-surface\{color:red\}\.devext-surface \.topbar/,
  );
  for (const source of [
    '@import "https://example.com/x";',
    "body+div{display:none}",
    "body~div{display:none}",
    "body{background:url(https://example.com)}",
    'body{background:image-set("https://example.com/a" 1x)}',
    "body{--x:url(https://example.com)}",
    "body{color:red; &+div{display:none}}",
  ])
    assert.throws(() => scopedStyles(source), source);
  for (const permission of [
    "*",
    "network:https://127.0.0.1",
    "network:http://example.com",
    "network:https://example.com/path",
    "network:https://localhost.test",
  ]) {
    const m = manifest();
    m.permissions.push(permission);
    assert.throws(() => validatePackage(m));
  }
  assert.throws(() =>
    layoutCSS({
      areas: [
        ["nav", "content"],
        ["aside", "nav"],
        ["footer", "footer"],
      ],
      columns: ["1fr", "1fr"],
    }),
  );
  assert.equal(
    layoutCSS({
      areas: [["nav"], ["content"], ["aside"], ["footer"]],
      columns: ["1fr"],
    }).gridTemplateAreas,
    '"nav" "content" "aside" "footer"',
  );
  const example = await buildExtension("examples/extensions/studio-shell");
  assert.equal(validatePackage(example.manifest).kind, "extension");
  assert.ok(example.manifest.files["sources/main.js"]);
});
test("code extension grants, account isolation, withdrawal and legacy client compatibility", async (t) => {
  const f = await startTestServer({
    extensionReviewer: "reviewer@extensions.test",
  });
  t.after(() => f.close());
  const a = f.client(),
    b = f.client(),
    review = f.client();
  for (const [api, name] of [
    [a, "author"],
    [b, "reader"],
    [review, "reviewer"],
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
  const headers = { "X-Devdevian-Extensions": "2" },
    pkg = {
      name: "Code fixture",
      slug: "code-fixture",
      version: "1.0.0",
      description: "A source code package for capability isolation checks.",
      manifest: manifest(),
    };
  const published = await a("/extensions/publish", pkg);
  assert.equal(published.status, 201, JSON.stringify(published.data));
  const id = published.data.id;
  assert.equal(
    (
      await b("/extensions/install", {
        release: id,
        acknowledge_unreviewed: true,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await b("/extensions/install", {
        release: id,
        acknowledge_unreviewed: true,
        granted_permissions: ["ui.style", "data.read"],
      })
    ).status,
    409,
  );
  const installed = await b(
    "/extensions/install",
    {
      release: id,
      acknowledge_unreviewed: true,
      granted_permissions: ["ui.style"],
    },
    "POST",
    headers,
  );
  assert.equal(installed.status, 200, JSON.stringify(installed.data));
  assert.equal(installed.data.enabled.length, 1);
  assert.equal(
    (await a("/extensions/me", undefined, "GET", headers)).data.enabled.length,
    0,
  );
  assert.equal((await b("/extensions/me")).data.installed.length, 0);
  assert.equal((await b("/extensions/library")).data.items.length, 0);
  assert.equal(
    (await b("/extensions/active", { release: id }, "PUT")).status,
    400,
  );
  assert.equal(
    (await b("/extensions/disable/" + id, {}, "PUT", headers)).data.enabled
      .length,
    0,
  );
  assert.equal(
    (
      await b(
        "/extensions/install",
        {
          release: id,
          acknowledge_unreviewed: true,
          granted_permissions: ["ui.style"],
        },
        "POST",
        headers,
      )
    ).data.enabled.length,
    1,
  );
  const r = await review(
    "/extensions/releases/" + id + "/review",
    { status: "withdrawn", note: "Fixture revoked package." },
    "PATCH",
    headers,
  );
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(
    (await b("/extensions/me", undefined, "GET", headers)).data.enabled.length,
    0,
  );
  assert.equal(
    (await fetch(f.base + "/api/extensions/development")).status,
    404,
  );
});
