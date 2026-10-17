# Architecture

## Request flow

A Vite/React frontend talks to a same-origin Express JSON API. The landing is `/`, the forum is `/app` with hash routes, and policy pages are `/privacy` and `/terms`. The build prerenders public pages using the same React components and hydrates them in the browser; the app remains client-rendered and noindex. See [search visibility](search.md). `vercel.json` serves built static assets and routes `/api/*` to the exported Express handler in `api/index.mjs`. The standalone Node server also supports these entry points.

The API loads the server session, derives platform and community permissions, validates input and origin where applicable, and executes database operations. React uses `/api/me` to retrieve a safe profile. Password hashes, OAuth secrets, and raw database/object-storage credentials are not sent to the browser.

## Modules

| Area | Main files |
| --- | --- |
| Bootstrap, sessions, login, account switching | `server.mjs` |
| Email registration and OAuth | `auth.mjs`, `oauth-link.mjs`, `mail.mjs` |
| Publications, projects, events, votes | `domain.mjs` |
| Profile/media metadata, catalogs, search, validators | `enhancements.mjs` |
| Private communities, membership, pagination, read access | `spaces.mjs` |
| Files and object storage | `uploads.mjs`, `object-storage.mjs` |
| Replies, nesting, accepted-answer paths | `replies.mjs` |
| Notifications, event changes, moderation | `activity.mjs`, `event-management.mjs`, `moderation.mjs` |
| Database compatibility and runtime requirements | `database.mjs`, `search-sql.mjs`, `runtime-config.mjs` |

`enhancements.mjs` decorates API responses with entity details such as project media, author/organizer avatars, and team information. New media fields must be returned by the API and passed to the corresponding UI component. Adding a stored field alone does not render it.

## Storage

Local development uses `node:sqlite` and local files. Turso uses the libSQL SDK behind the same prepared-statement facade. `search-sql.mjs` translates the two local JavaScript search functions into portable parameterized SQL, including literal wildcard handling and case variants. The adapter is synchronous; measure remote latency and throughput before assuming high-traffic scalability.

Schema initialization and additive migrations are currently performed by module bootstrap. Multi-statement writes use transactions. Database URL and credentials never use `VITE_` variables. Do not run development or fixture scripts against production data.

Entity-specific media and presentation data is stored in `entity_details`; uploads hold file metadata and ownership. Private S3-compatible storage holds bytes. The browser downloads through `/api/uploads/:id`; a provider storage URL is not an application access control. The server validates attachment ownership, rejects executable HTML/SVG uploads, and checks the parent publication or published media reference when serving a file.

## Identity and access boundaries

Sessions and device account switching use opaque server-side records and HTTP-only cookies. Email codes and account-link confirmation codes are hashed and expire. OAuth state is bound to a browser cookie and a short-lived server record, with PKCE during code exchange.

A new OAuth identity matching an existing email cannot silently take over that account. The hosted flow confirms possession through a one-time email code, then consumes the challenge and links the provider transactionally. Explicit Settings-based linking requires the original signed-in account. These flows must preserve the existing user ID and permanent username.

Public topics are not communities. Private conversation reads, file downloads, search, notifications, and moderation queues all require the relevant read scope. Community ownership/validator status applies only inside that community. Platform moderation applies to public-feed content and does not automatically open private communities.

## Frontend conventions

Keep the established blue/violet palette and both forum themes. Marketing/policy pages use a separate dark palette without overwriting the forum theme preference. Motion should respect `prefers-reduced-motion`; continuous decoration must provide a pause control. Brand marks are local assets, so a technology credit does not make third-party image-tracking requests.

Paginated endpoints return items and pagination metadata; `src/data.js` normalizes that shape for existing UI lists. Do not fetch every record to paginate solely in the browser. Use the reply-path endpoint to reveal nested answers from direct links.

## Verification limits

Local fixtures verify behavior, not provider availability or deployment correctness. After configuration changes, verify real OAuth callbacks, code delivery, cloud persistence across redeploys, private downloads from another account, and representative mobile layouts on the hosted deployment. The project has not received an independent security audit.
