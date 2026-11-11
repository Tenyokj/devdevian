import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { JSDOM } from "jsdom";
test("all documentation guides render substantive HTML, reachable local links and valid section anchors", () => {
  const dirs = [
    "",
    ...readdirSync("dist/docs").filter((n) => n !== "index.html"),
  ];
  assert.equal(dirs.length, 27);
  for (const dir of dirs) {
    const path = "/docs" + (dir ? "/" + dir : "");
    const doc = new JSDOM(readFileSync("dist" + path + "/index.html", "utf8"), {
      url: "https://devdevian.vercel.app" + path,
    }).window.document;
    assert.equal(doc.querySelectorAll("h1").length, 1, path);
    assert.ok(
      doc.querySelector("#docs-article").textContent.length >
        (dir ? 1500 : 700),
      path,
    );
    assert.equal(
      new URL(doc.querySelector("link[rel=canonical]").href).pathname,
      path,
    );
    assert.equal(
      doc.querySelector("[aria-current=page]").getAttribute("href"),
      path,
    );
    for (const a of doc.querySelectorAll("a[href]")) {
      const url = new URL(a.href);
      if (
        url.origin !== "https://devdevian.vercel.app" ||
        !url.pathname.startsWith("/docs")
      )
        continue;
      assert.ok(existsSync("dist" + url.pathname + "/index.html"), a.href);
      if (url.hash) {
        const target = new JSDOM(
          readFileSync("dist" + url.pathname + "/index.html", "utf8"),
        ).window.document;
        assert.ok(
          target.getElementById(decodeURIComponent(url.hash.slice(1))),
          a.href,
        );
      }
    }
  }
});
