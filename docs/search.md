# Search visibility

## Build output

`npm run build` runs Vite and then `scripts/prerender.mjs`. React renders the landing, Privacy & Security, and Terms of Use into static HTML using the same components as the browser. The browser hydrates those public pages; it renders the signed-in application separately. No account, community, or API data is fetched during prerendering.

Each public page receives its own title, description, canonical URL, Open Graph/Twitter metadata, and JSON-LD. The existing feed screenshot is the social preview image. `dist/sitemap.xml` lists only `/`, `/privacy`, and `/terms`; optional `lastmod` dates are omitted instead of inventing modification times.

The public origin comes from `SITE_URL`, then `APP_URL`, then the maintainer instance's default origin. For an independent deployment, set the correct origin before building. Do not put credentials in that value or in any `VITE_` variable. Vercel non-production builds receive noindex metadata and a robots file that disallows crawling.

`robots.txt` allows public resources and disallows `/api/`. The app has a noindex meta tag and header; it is deliberately not blocked in robots, so a crawler can read the noindex directive. API responses also use an `X-Robots-Tag` header. Robots directives are crawler guidance, not authorization; private access checks remain on the server.

## Search Console verification

Put the exact Google-provided HTML verification file in `public/`, preserving its filename and content. Vite copies it unchanged to the deployment root. Keep the file available after verification. Never enable a rewrite that returns the landing instead of the verification file.

After deployment, verify the URL-prefix property for the exact public HTTPS origin in Google Search Console. Submit `sitemap.xml`, then inspect `/` and request indexing. Search engines decide whether and when to index pages; a successful verification or sitemap submission is not a ranking guarantee.

## Current scope

Individual forum screens still use hash routes such as `/app#post/123`. They are not separately crawlable document URLs and are excluded from this sitemap. Indexing public discussions requires stable ordinary URLs, public-only server rendering, appropriate content status codes and canonical links, and a sitemap that excludes private, removed, or restricted content. That is a separate feature; do not add every hash route to the current sitemap.

## Validation

`tests/seo.test.mjs` checks built HTML, canonicals, structured data, preview images, the sitemap, and noindex metadata. Browser checks cover no-JavaScript public content, metadata on direct page loads, hydration, a real HTTP 404, and functional interactive pages after hydration.
