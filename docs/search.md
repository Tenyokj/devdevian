# Search visibility

## Build output

`npm run build` runs `scripts/build-web.mjs` for browser and conversation SSR artifacts, then `scripts/prerender.mjs` for static public documents. React renders the landing, FAQ, What’s new, Privacy & Security, and Terms of Use into static HTML using the same components as the browser. The browser hydrates those public pages; it renders the signed-in application separately. No account, community, or API data is fetched during prerendering.

Each public page receives its own title, description, canonical URL, Open Graph/Twitter metadata, and JSON-LD. Static pages use the feed screenshot as a social preview. `dist/sitemaps/pages.xml` lists `/`, `/privacy`, `/terms`, `/updates`, and `/faq`. The server provides `/sitemap.xml` as a sitemap index pointing to that static file and public-conversation sitemap files. Optional `lastmod` dates are omitted rather than inventing modification times.

The public origin comes from `SITE_URL`, then `APP_URL`, then the maintainer instance's default origin. For an independent deployment, set the correct origin before building. Do not put credentials in that value or in any `VITE_` variable. Vercel non-production builds receive noindex metadata and a robots file that disallows crawling.

`robots.txt` allows public resources and disallows `/api/`. The app has a noindex meta tag and header; it is deliberately not blocked in robots, so a crawler can read the noindex directive. API responses also use an `X-Robots-Tag` header. Robots directives are crawler guidance, not authorization; private access checks remain on the server.

## Search Console verification

Put the exact Google-provided HTML verification file in `public/`, preserving its filename and content. Vite copies it unchanged to the deployment root. Keep the file available after verification. Never enable a rewrite that returns the landing instead of the verification file.

After deployment, verify the URL-prefix property for the exact public HTTPS origin in Google Search Console. Submit `sitemap.xml`, then inspect `/` and request indexing. Search engines decide whether and when to index pages; a successful verification or sitemap submission is not a ranking guarantee.

## Current scope

Public conversations have ordinary URLs: `/conversation/:id/:slug`. The ID identifies the conversation; a missing or outdated slug redirects to its current URL. Titles and code are escaped, Markdown skips raw HTML, and the JSON hydration seed cannot close its script element. Full HTML is rendered on request, not copied from production during a build. The first page contains at most ten root replies; subsequent reply pages use query URLs with a canonical link to the main page and noindex. Nested threads and advanced review/management actions remain available in the forum workspace.

The projection explicitly requires `community_id IS NULL AND removed_at IS NULL`, regardless of cookies or owner/moderator status. It whitelists data rather than serializing accounts or arbitrary metadata. Deleted reply text is suppressed. Private, removed and missing conversations return the same noindex 404 document. Public HTML and dynamic sitemaps use `no-store` so visibility changes are checked on every request. A dependency/rendering failure returns a noindex 503 with a retry hint, never a successful empty page.

`/sitemap.xml` lists the static pages sitemap and `/sitemaps/conversations-N.xml` files, each containing at most 500 public conversation URLs. The index is bounded by the sitemap protocol’s file-count limit; out-of-range pages return 404. Conversation dates are not presented as invented modification dates. Private/removed records never enter the query. Preview environments produce an empty index and no conversation sitemaps.

Discussion-style posts use `DiscussionForumPosting` metadata. Question pages currently use generic `WebPage` metadata rather than asserting complete Q&A/accepted-answer structured data. Rich-result appearance, indexing and search traffic are not guaranteed.

Existing `/app#post/123` routes continue to work and remain noindex. New share links point to public documents for public posts; private-community sharing retains the app route. Project/event/profile screens are still app hash routes and are not individually indexed by this feature.

## Validation

`tests/seo.test.mjs` checks built HTML, canonicals, structured data, preview images, the sitemap, and noindex metadata. `tests/public-conversations.test.mjs` verifies projection access, XSS, deleted replies, session independence, changing visibility, sitemap pagination and hosted rewrites. `scripts/public-conversation-check.mjs` covers real inline sign-in/reply, OAuth return, no-JavaScript reading and both responsive themes. Existing browser checks cover no-JavaScript public content, metadata on direct page loads, hydration, a real HTTP 404, and functional interactive pages after hydration.
