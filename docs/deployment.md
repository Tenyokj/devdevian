# Deployment

## Intended URL layout

One project and one public origin are sufficient:

| Path | Purpose |
| --- | --- |
| `/` | Public landing page |
| `/app` | Developer application (hash routes currently handle inner screens) |
| `/api/*` | Server requests, uploads, and OAuth callbacks |

`devdevian.vercel.app` is an intended free Vercel address, subject to availability. No domain has been reserved or deployment completed. An `app.` subdomain is not required.

## Current constraint

The backend uses synchronous `node:sqlite` queries and local uploaded files. Vercel Functions do not provide a durable shared local filesystem. Deploying this server unchanged would not produce a persistent working forum.

The next infrastructure milestone is to select cloud database/object storage services with suitable free quotas, migrate the data-access implementation, and test private file access. No external database adapter is implemented yet. Do not assume that adding a `DATABASE_URL` environment variable changes the existing storage implementation.

References: [Express on Vercel](https://vercel.com/docs/frameworks/backend/express), [SQLite support](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel), [rewrites](https://vercel.com/docs/routing/rewrites).

## Release sequence

1. Connect the source repository to the owner's Vercel account and confirm the available project address.
2. Implement and test durable database/object storage, including authenticated private downloads and migrations.
3. Create an **empty production database** using schema migrations; never upload the local demo or development database. The starter taxonomy may be seeded, but accounts, sessions, uploads, posts, and events must start empty.
4. Create separate preview resources. Preview deployments must not use production data or secrets.
5. Configure production `APP_URL`, exact provider callbacks, email sender, and explicit moderator accounts. See [authentication](authentication.md).
6. Verify HTTPS, session cookies, account verification, OAuth state, membership boundaries, upload ownership, moderation, pagination, mobile layouts, and backup restoration against the hosted preview.
7. Publish the verified version and test Google/GitHub sign-in and email delivery with real accounts on the exact production origin.

Free service quotas and acceptable-use rules must be checked when selecting providers. A free web address does not provide a mail-sending domain. Some transactional mail services require a verified domain.

## Local production-like run

```sh
npm ci
npm run build
NODE_ENV=production DB_PATH=data/production-local.sqlite node server.mjs
```

This creates a separate, empty local database. It does not deploy to Vercel. Preserve development data rather than deleting it to prepare a release.
