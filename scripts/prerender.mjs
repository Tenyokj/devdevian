import { createServer } from "vite";
import React from "react";
import { renderToString } from "react-dom/server";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
const defaultOrigin = "https://devdevian.vercel.app";
const site = new URL(
  process.env.SITE_URL || process.env.APP_URL || defaultOrigin,
);
if (
  !["https:", "http:"].includes(site.protocol) ||
  site.username ||
  site.password ||
  site.search ||
  site.hash ||
  site.pathname !== "/"
)
  throw Error("SITE_URL / APP_URL must be a public origin.");
const origin = site.origin,
  preview = !!process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production";
const escape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
const pages = [
  {
    path: "/",
    file: "index.html",
    title: "Devdevian — An open-source forum for developers",
    description:
      "Ask programming questions, get code reviews, share projects, and find your developer community. Devdevian is a free, open-source forum built together.",
    index: true,
  },
  {
    path: "/privacy",
    file: "privacy/index.html",
    title: "Privacy & Security · Devdevian",
    description:
      "How Devdevian handles accounts, public and private content, cookies, uploaded files, security reports, and requests about your data.",
    index: true,
  },
  {
    path: "/terms",
    file: "terms/index.html",
    title: "Terms of Use · Devdevian",
    description:
      "The rules for using Devdevian: accounts, community conduct, content rights, moderation, projects, events, and the open-source software license.",
    index: true,
  },
  {
    path: "/app",
    file: "app/index.html",
    title: "Developer forum · Devdevian",
    description:
      "Sign in to Devdevian to join technical conversations, share your work, and participate in developer communities.",
    index: false,
  },
];
const template = readFileSync("dist/index.html", "utf8");
const vite = await createServer({
  // This server renders HTML only; it never serves a development browser.
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  appType: "custom",
});
try {
  const { default: Landing } = await vite.ssrLoadModule("/src/landing.jsx");
  const { default: PolicyPage } = await vite.ssrLoadModule("/src/policies.jsx");
  for (const page of pages) {
    const canonical = origin + (page.path === "/" ? "/" : page.path);
    const image = origin + "/screenshots/feed-screen.png";
    const structured =
      page.path === "/"
        ? {
            "@context": "https://schema.org",
            "@type": "WebSite",
            "@id": origin + "/#website",
            url: origin + "/",
            name: "Devdevian",
            description: page.description,
            inLanguage: "en",
            publisher: {
              "@type": "Organization",
              name: "Devdevian",
              url: origin + "/",
              logo: origin + "/devdevian-logo.png",
              sameAs: ["https://github.com/Tenyokj/devdevian"],
            },
          }
        : {
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: page.title,
            url: canonical,
            isPartOf: { "@id": origin + "/#website" },
          };
    const head = `<meta name="robots" content="${page.index && !preview ? "index,follow,max-image-preview:large" : "noindex,follow"}"/>
<link rel="canonical" href="${escape(canonical)}"/>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="Devdevian"/>
<meta property="og:locale" content="en_US"/>
<meta property="og:title" content="${escape(page.title)}"/>
<meta property="og:description" content="${escape(page.description)}"/>
<meta property="og:url" content="${escape(canonical)}"/>
<meta property="og:image" content="${escape(image)}"/>
<meta property="og:image:alt" content="Devdevian developer forum: programming questions, discussions, and code reviews"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${escape(page.title)}"/>
<meta name="twitter:description" content="${escape(page.description)}"/>
<meta name="twitter:image" content="${escape(image)}"/>
<script type="application/ld+json">${JSON.stringify(structured).replaceAll("<", "\\u003c")}</script>`;
    let html = template
      .replace(
        /<title>.*?<\/title>/,
        () => "<title>" + escape(page.title) + "</title>",
      )
      .replace(
        /<meta name="description" content="[^"]*"\s*\/?\s*>/,
        () =>
          '<meta name="description" content="' +
          escape(page.description) +
          '"/>',
      )
      .replace("</head>", head + "</head>");
    if (page.index) {
      const element =
        page.path === "/"
          ? React.createElement(Landing)
          : React.createElement(PolicyPage, { type: page.path.slice(1) });
      html = html.replace(
        '<div id="root"></div>',
        () =>
          '<div id="root" data-prerender="' +
          page.path +
          '">' +
          renderToString(element) +
          "</div>",
      );
    }
    const destination = join("dist", page.file);
    mkdirSync(join(destination, ".."), { recursive: true });
    writeFileSync(destination, html);
  }
  const urls = preview
    ? []
    : pages
        .filter((p) => p.index)
        .map((p) => origin + (p.path === "/" ? "/" : p.path));
  writeFileSync(
    "dist/sitemap.xml",
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      urls.map((url) => "<url><loc>" + escape(url) + "</loc></url>").join("") +
      "</urlset>\n",
  );
  writeFileSync(
    "dist/robots.txt",
    preview
      ? "User-agent: *\nDisallow: /\n"
      : "User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: " +
          origin +
          "/sitemap.xml\n",
  );
  writeFileSync(
    "dist/404.html",
    `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="robots" content="noindex,follow"/><title>Page not found · Devdevian</title></head><body style="background:#090c18;color:#f3f0ff;font:18px system-ui;padding:12vh 8vw"><h1>Page not found.</h1><p>This address does not exist.</p><a style="color:#b09bff" href="/">Back to Devdevian</a></body></html>`,
  );
  console.log(
    "Prerendered landing and policy pages; generated sitemap, robots, app metadata, and 404 page.",
  );
} finally {
  await vite.close();
}
