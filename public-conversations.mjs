import { reportFailure } from "./observability.mjs";
import { readFile } from "node:fs/promises";
import { conversationId, conversationPath } from "./conversation-url.mjs";
import { normalizeGitHubContext } from "./packages/cli/lib/github-context.mjs";
import { allowedOrigin } from "./runtime-config.mjs";

const batch = 500;
const publicWhere = "p.community_id IS NULL AND p.removed_at IS NULL";
const escape = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
const json = (value) =>
  JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
const preview = () =>
  !!process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production";
const origin = (req) =>
  new URL(process.env.SITE_URL || process.env.APP_URL || allowedOrigin(req))
    .origin;
function safeLink(value) {
  try {
    const u = new URL(value);
    return ["https:", "http:"].includes(u.protocol) &&
      !u.username &&
      !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
}
function object(value) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}
function date(value) {
  const stamp = new Date(
    String(value).replace(" ", "T") +
      (/Z$|[+-]\d\d:\d\d$/.test(value) ? "" : "Z"),
  );
  return Number.isFinite(stamp.getTime()) ? stamp.toISOString() : undefined;
}
function pick(row, fields) {
  return Object.fromEntries(
    fields.split(" ").map((field) => [field, row[field]]),
  );
}
export function publicPost(db, id, requestedPage = 1) {
  // Deliberately independent of req.user. Even owners/moderators get the same
  // public projection, so a cookie can never personalize a crawlable document.
  const row = db
    .prepare(
      `SELECT p.id,p.user_id,p.title,p.body,p.created,p.kind,p.topic,p.stack,p.code,p.review_focus,p.demo_url,p.repo_url,p.accepted_reply_id,p.archived_at,p.locked_at,u.name,CASE WHEN u.privacy='public' THEN u.username ELSE NULL END username,u.role,u.deleted_at,t.name topic_name,m.data metadata FROM posts p JOIN users u ON u.id=p.user_id LEFT JOIN taxonomy t ON t.id=p.topic LEFT JOIN entity_details m ON m.kind='post' AND m.entity_id=CAST(p.id AS TEXT) WHERE p.id=? AND ${publicWhere}`,
    )
    .get(id);
  if (!row) return null;
  const meta = object(row.metadata);
  // Some database drivers append execution metadata to rows. Serialize only
  // the selected public fields, never driver internals or arbitrary row keys.
  const post = pick(
    row,
    "id user_id title body created kind topic stack code review_focus demo_url repo_url accepted_reply_id archived_at locked_at name username role topic_name",
  );
  post.name = row.deleted_at ? "Deleted member" : post.name;
  post.username = row.deleted_at ? null : post.username;
  post.path = conversationPath(post);
  post.demo_url = safeLink(post.demo_url);
  post.repo_url = safeLink(post.repo_url);
  post.links = Array.isArray(meta.links)
    ? meta.links.slice(0, 12).flatMap((link) => {
        const url = safeLink(link?.url);
        return url && typeof link.label === "string"
          ? [{ label: link.label.slice(0, 80), url }]
          : [];
      })
    : [];
  try {
    post.github_context = normalizeGitHubContext(meta.github_context);
  } catch {
    post.github_context = null;
  }
  const counts = db
    .prepare(
      "SELECT COUNT(*) total,SUM(CASE WHEN parent_id IS NULL THEN 1 ELSE 0 END) roots FROM replies WHERE post_id=?",
    )
    .get(id);
  post.reply_count = Number(counts.total);
  const pages = Math.max(1, Math.ceil(Number(counts.roots || 0) / 10));
  const page = Math.min(pages, Math.max(1, Number(requestedPage) || 1));
  const replies = db
    .prepare(
      `SELECT r.id,r.user_id,r.parent_id,r.body,r.created,u.name,CASE WHEN u.privacy='public' THEN u.username ELSE NULL END username,u.deleted_at,json_extract(m.data,'$.deleted_at') erased,(SELECT COUNT(*) FROM replies c WHERE c.parent_id=r.id) children_count FROM replies r JOIN users u ON u.id=r.user_id LEFT JOIN entity_details m ON m.kind='reply' AND m.entity_id=CAST(r.id AS TEXT) WHERE r.post_id=? AND r.parent_id IS NULL ORDER BY r.id LIMIT 10 OFFSET ?`,
    )
    .all(id, (page - 1) * 10)
    .map((row) => ({
      ...pick(row, "id user_id parent_id created children_count"),
      name: row.deleted_at ? "Deleted member" : row.name,
      username: row.deleted_at ? null : row.username,
      body: row.erased ? "[deleted by author]" : row.body,
      deleted_at: row.erased || null,
    }));
  const files = db
    .prepare(
      `SELECT id,reply_id,name,mime,size FROM uploads WHERE post_id=? AND (reply_id IS NULL${replies.length ? " OR reply_id IN (" + replies.map(() => "?").join(",") + ")" : ""}) ORDER BY created,id LIMIT 200`,
    )
    .all(id, ...replies.map((r) => r.id))
    .map((row) => pick(row, "id reply_id name mime size"));
  post.attachments = files.filter((f) => f.reply_id === null);
  for (const reply of replies)
    reply.attachments = reply.deleted_at
      ? []
      : files.filter((f) => f.reply_id === reply.id);
  return {
    post,
    replies,
    pagination: { page, pages, total: Number(counts.roots || 0), limit: 10 },
  };
}

let renderer;
let development;
async function render(seed) {
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.DEMO_MODE !== "1" &&
    process.env.VERCEL !== "1"
  ) {
    development ||= import("vite").then(({ createServer }) =>
      createServer({
        server: { middlewareMode: true, hmr: false, ws: false },
        appType: "custom",
      }),
    );
    const vite = await development;
    const module = await vite.ssrLoadModule(
      "/src/public/conversation-server.jsx",
    );
    const template = await vite.transformIndexHtml(
      seed.post.path,
      await readFile("conversation.html", "utf8"),
    );
    return template.replace(
      '<div id="root"></div>',
      () =>
        `<div id="root" data-prerender="conversation">${module.renderConversation(seed)}</div><script id="conversation-data" type="application/json">${json(seed)}</script>`,
    );
  }
  // Imports/template are process-local build artifacts; content is never cached.
  renderer ||= Promise.all([
    import("./server-build/conversation.mjs"),
    readFile(new URL("./server-build/template.html", import.meta.url), "utf8"),
  ]).catch((error) => {
    renderer = null;
    throw error;
  });
  const [module, template] = await renderer;
  return template.replace(
    '<div id="root"></div>',
    () =>
      `<div id="root" data-prerender="conversation">${module.renderConversation(seed)}</div><script id="conversation-data" type="application/json">${json(seed)}</script>`,
  );
}
function pKind(post) {
  return post.kind === "question" ? "WebPage" : "DiscussionForumPosting";
}
function unavailable(res, status = 404) {
  return res
    .status(status)
    .type("html")
    .send(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><title>Conversation unavailable · Devdevian</title></head><body style="background:#0e1223;color:#f3f0ff;font:18px system-ui;padding:12vh 8vw"><h1>Conversation unavailable.</h1><p>${status === 503 ? "The service is temporarily unavailable. Please try again shortly." : "This conversation is not available on a public page."}</p><a style="color:#b9a4ff" href="/app">Open Devdevian</a></body></html>`,
    );
}
export function registerPublicConversations(app, db) {
  app.get(
    ["/conversation/:id", "/conversation/:id/:slug"],
    async (req, res) => {
      try {
        // No CDN/browser content cache: removal and loss of public visibility must
        // take effect on the next request, including requests from signed-in owners.
        res
          .set("Cache-Control", "no-store")
          .set("X-Robots-Tag", "noindex, follow");
        const id = conversationId(req.params.id);
        if (!id) return unavailable(res);
        if (
          req.query.reply_page !== undefined &&
          !/^[1-9]\d{0,8}$/.test(String(req.query.reply_page))
        )
          return unavailable(res, 400);
        const seed = publicPost(db, id, req.query.reply_page);
        if (!seed) return unavailable(res);
        const path = seed.post.path;
        if (decodeURI(req.path) !== decodeURI(path)) {
          const params = new URLSearchParams();
          if (seed.pagination.page > 1) params.set("reply_page", String(seed.pagination.page));
          if (req.query.reply === "1") {
            params.set("reply", "1");
            const target = conversationId(req.query.reply_to);
            if (target) params.set("reply_to", String(target));
          }
          return res.redirect(308, path + (params.size ? "?" + params : "") + (req.query.reply === "1" ? "#reply" : ""));
        }
        const canonical = origin(req) + path;
        const description =
          String(seed.post.body)
            .replace(/[`*_>#\[\]]/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 180) || "A public developer conversation on Devdevian.";
        const title = seed.post.title + " · Devdevian";
        const robots =
          preview() || seed.pagination.page > 1
            ? "noindex,follow"
            : "index,follow,max-image-preview:large";
        const structured = {
          "@context": "https://schema.org",
          "@type": pKind(seed.post),
          name: seed.post.title,
          headline: seed.post.title,
          text: seed.post.body,
          url: canonical,
          mainEntityOfPage: canonical,
          datePublished: date(seed.post.created),
          author: { "@type": "Person", name: seed.post.name },
          commentCount: seed.post.reply_count,
        };
        const head = `<meta name="robots" content="${robots}"><link rel="canonical" href="${escape(canonical)}"><meta property="og:type" content="article"><meta property="og:site_name" content="Devdevian"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${escape(canonical)}"><meta property="og:image" content="${escape(origin(req) + "/conversation-preview.png")}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Devdevian — a forum for everyone who builds"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(title)}"><meta name="twitter:description" content="${escape(description)}"><meta name="twitter:image" content="${escape(origin(req) + "/conversation-preview.png")}"><script type="application/ld+json">${json(structured)}</script>`;
        const html = (await render(seed))
          .replace(
            /<title>.*?<\/title>/,
            () => `<title>${escape(title)}</title>`,
          )
          .replace(
            /<meta name="description" content="[^"]*"\s*\/?\s*>/,
            () => `<meta name="description" content="${escape(description)}">`,
          )
          .replace("</head>", () => head + "</head>");
        res.set("X-Robots-Tag", robots).type("html").send(html);
      } catch (error) {
        reportFailure(error, {
          event: "public_document_failed",
          request_id: req.requestId,
        });
        res.set("Retry-After", "30");
        return unavailable(res, 503);
      }
    },
  );
  app.get("/sitemap.xml", (req, res) => {
    const root = origin(req);
    const count = preview()
      ? 0
      : Number(
          db
            .prepare(`SELECT COUNT(*) n FROM posts p WHERE ${publicWhere}`)
            .get().n,
        );
    const files = preview()
      ? []
      : [
          root + "/sitemaps/pages.xml",
          ...Array.from(
            { length: Math.min(50000 - 1, Math.ceil(count / batch)) },
            (_, i) => root + `/sitemaps/conversations-${i + 1}.xml`,
          ),
        ];
    res
      .set("Cache-Control", "no-store")
      .set("X-Robots-Tag", "noindex, follow")
      .type("application/xml")
      .send(
        '<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
          files
            .map((file) => `<sitemap><loc>${escape(file)}</loc></sitemap>`)
            .join("") +
          "</sitemapindex>",
      );
  });
  app.get("/sitemaps/conversations-:page.xml", (req, res) => {
    res.set("Cache-Control", "no-store").set("X-Robots-Tag", "noindex, follow");
    const page = conversationId(req.params.page);
    if (!page || page > 49999 || preview())
      return res.status(404).type("text").send("Sitemap not found.");
    const posts = db
      .prepare(
        `SELECT p.id,p.title FROM posts p WHERE ${publicWhere} ORDER BY p.id LIMIT ? OFFSET ?`,
      )
      .all(batch, (page - 1) * batch);
    if (!posts.length)
      return res.status(404).type("text").send("Sitemap not found.");
    res
      .type("application/xml")
      .send(
        '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
          posts
            .map(
              (post) =>
                `<url><loc>${escape(origin(req) + conversationPath(post))}</loc></url>`,
            )
            .join("") +
          "</urlset>",
      );
  });
}
