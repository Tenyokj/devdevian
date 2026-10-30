import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { JSDOM } from "jsdom";
test("public pages contain crawlable HTML and unique canonical/social metadata without JavaScript", () => {
  const titles = new Set();
  for (const [file, path, heading] of [
    ["index.html", "/", "Less noise."],
    ["privacy/index.html", "/privacy", "Privacy & Security"],
    ["terms/index.html", "/terms", "Terms of Use"],
    ["updates/index.html", "/updates", "Here’s what’s new."],
    ["faq/index.html", "/faq", "Clear answers."],
  ]) {
    const html = readFileSync("dist/" + file, "utf8");
    const document = new JSDOM(html).window.document;
    assert.ok(document.getElementById("root").textContent.includes(heading));
    assert.equal(document.getElementById("root").dataset.prerender, path);
    assert.ok(
      document.querySelector("meta[name=description]").content.length > 50,
    );
    assert.equal(document.querySelectorAll("link[rel=canonical]").length, 1);
    const canonical = document.querySelector("link[rel=canonical]").href;
    assert.equal(new URL(canonical).pathname, path);
    assert.equal(
      document.querySelector('meta[property="og:url"]').content,
      canonical,
    );
    assert.equal(
      document.querySelector('meta[property="og:title"]').content,
      document.title,
    );
    assert.equal(
      document.querySelector('meta[name="twitter:card"]').content,
      "summary_large_image",
    );
    const preview = new URL(
      document.querySelector('meta[property="og:image"]').content,
    );
    assert.ok(existsSync("public" + preview.pathname));
    const structured = JSON.parse(
      document.querySelector('script[type="application/ld+json"]').textContent,
    );
    assert.equal(structured["@type"], path === "/" ? "WebSite" : "WebPage");
    assert.equal(structured.url, canonical);
    assert.ok(!titles.has(document.title));
    titles.add(document.title);
  }
});
test("sitemap lists only public pages while API, app and missing pages stay out of search", () => {
  const document = new JSDOM(readFileSync("dist/sitemap.xml", "utf8"), {
    contentType: "text/xml",
  }).window.document;
  assert.deepEqual(
    [...document.querySelectorAll("loc")].map(
      (n) => new URL(n.textContent).pathname,
    ),
    ["/", "/privacy", "/terms", "/updates", "/faq"],
  );
  const robots = readFileSync("dist/robots.txt", "utf8");
  assert.match(robots, /Disallow: \/api\//);
  assert.match(robots, /Sitemap: https:\/\/.+\/sitemap.xml/);
  assert.ok(!robots.includes("Disallow: /app")); // Crawlers must see the app's noindex.
  for (const file of ["app/index.html", "404.html"]) {
    const doc = new JSDOM(readFileSync("dist/" + file, "utf8")).window.document;
    assert.match(doc.querySelector("meta[name=robots]").content, /noindex/);
  }
});
