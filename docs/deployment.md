# Deployment

The landing (`/`), application (`/app`), and API (`/api/*`) share one Vercel project. `devdevian.vercel.app` can serve all three if the name is available. A second domain or an `app.` subdomain is unnecessary.

## Current status

The repository contains a Vercel function, a Turso/libSQL database adapter, and private S3-compatible uploads. API tests exercise both local SQLite and the libSQL SDK; a local S3 contract fixture checks upload/download authorization. These checks do not verify a real remote database, bucket, or hosted OAuth callback. The maintainer-operated instance is live at https://devdevian.vercel.app. These instructions also apply to a new independent deployment; configure its own resources and credentials.

## 1. Create separate cloud resources

Create an **empty libSQL database** in [Turso](https://docs.turso.tech/sdk/ts/reference) and generate its database token. Use the libSQL-compatible service, not an incompatible database engine. Keep the URL and token in server environment variables. Run the explicit migration before deployment to create the schema and initial topic catalog, without accounts or sample publications. Hosted request startup only checks the schema version; see [reliability and recovery](reliability.md). Never import `data/`, screenshot fixtures, or local sessions into production.

Create a private S3-compatible bucket, for example [Supabase Storage](https://supabase.com/docs/guides/storage/s3/authentication). The hosted Devdevian instance uses Supabase. Generate server credentials for object reads, writes, and deletion. Supabase S3 keys can access all buckets in their project, so keep that project dedicated to this application. Do not enable public bucket access. Downloads pass through the authenticated API, which checks ownership and community membership. Browser-to-bucket CORS is unnecessary. Files are limited to 4 MB to fit Vercel's function payload limits.

Use separate databases, buckets, and credentials for development/preview and production. An unpredictable preview deployment must never mutate production data. Review current free-tier quotas and billing settings before creating resources; free quotas do not guarantee unlimited free usage.

## 2. Import the repository into Vercel

Import `Tenyokj/devdevian`, select the repository root, and use Node.js 24. The committed `vercel.json` selects Vite, runs `npm run build`, serves `dist`, and routes API requests to `api/index.mjs`. Do not deploy until the server environment is configured.

Set these values in Vercel's environment settings, scoped to the appropriate environment:

| Variable | Value |
| --- | --- |
| `APP_URL` | Exact stable HTTPS origin, e.g. `https://devdevian.vercel.app` |
| `TURSO_DATABASE_URL` | Database's `libsql://` URL |
| `TURSO_AUTH_TOKEN` | Token for that database |
| `UPLOAD_DRIVER` | `s3` |
| `S3_ENDPOINT` | Provider's HTTPS S3 endpoint |
| `S3_REGION` | Exact provider region; use the region shown by Supabase |
| `S3_BUCKET` | Private bucket name |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Server S3 credentials (dedicated project; keep private) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Production Google OAuth web client |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | Production GitHub OAuth App |
| `MAIL_PROVIDER`, `BREVO_API_KEY`, `MAIL_FROM` | `brevo`, API key, verified sender (or configure Resend) |
| `MODERATOR_EMAILS` | Comma-separated trusted platform moderator emails |

Never prefix secrets with `VITE_`. Never set `DEMO_MODE` or `AUTH_TEST_UNVERIFIED` in a hosted environment. Do not upload `.env`, SQLite files, or backups. Redeploy after changing environment variables.

With the equivalent values in a private local `.env`, `npm run release:check` reports missing variable names without displaying their values. This validates configuration, not connectivity. Normal local development should keep its own local-only `.env`; do not run development commands against production credentials.

## 3. Connect identity and email

See [authentication](authentication.md). Exact callbacks for the example origin:

- Google: `https://devdevian.vercel.app/api/auth/google/callback`
- GitHub: `https://devdevian.vercel.app/api/auth/github/callback`

Use separate OAuth applications for local development and a stable testing deployment. The free `vercel.app` hostname cannot be verified as your mail-sending domain. Brevo supports verified individual senders, with its own domain-replacement and account-approval rules; Resend requires a permitted sender/domain. Configure the selected provider and verify delivery to a real recipient. OAuth can be configured and tested independently.

## 4. Migrate and verify before announcing a release

After verifying a backup, run `node --env-file=.env.production.local scripts/migrate.mjs` with the selected environment before deploying. Never use production credentials for a preview. On a stable preview with separate resources, verify:

1. Landing screenshots, navigation into `/app`, mobile layout, and reduced-motion behavior.
2. Real Google/GitHub sign-in, permanent unique usernames, sign-out, and session persistence.
3. Create a publication, redeploy, and confirm it survives. Check search, pagination, accepted answers, and archive/restore.
4. Upload a private community attachment. Members can download it; a separate nonmember and signed-out browser cannot.
5. Submit a report and membership request; only the authorized owner, validator, or platform moderator can act on its scope.
6. Once a real sender is configured, check six-digit delivery, expiry, resend limits, and incorrect-code limits.
7. Confirm no fictional accounts or posts exist in the production database. Establish database backup/export and restoration procedures with the selected provider.

Remote transaction behavior, native SDK packaging on Vercel, cold starts, and actual provider callbacks require hosted validation. The synchronous libSQL adapter prioritizes compatibility for the initial release; it should be measured before increasing traffic. A green frontend build alone is insufficient evidence of a working production forum.

References: [Express functions](https://vercel.com/docs/frameworks/backend/express), [function limits](https://vercel.com/docs/functions/limitations), [local SQLite constraint](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel), [R2 pricing](https://developers.cloudflare.com/r2/pricing/).

### Rolling upgrade from v0.1.1 to v0.1.2

Back up and verify the database and files first. Using the operator-selected production environment, run `node scripts/migrate.mjs --prepare-subscriptions` **before** deploying v0.1.2. This creates only the subscriptions table/index and preserves schema marker 2, so v0.1.1 can continue serving traffic. v0.1.2 accepts this explicitly prepared schema without running DDL during requests. After the new deployment passes its health check, run `node scripts/migrate.mjs` to finalize marker 3. No user records, posts, files, or sessions are reset. A rollback to v0.1.1 after finalization requires a reviewed schema-marker compatibility step; do not restore an old database over new user activity.

### Upgrading v0.1.3 to v0.1.4

Create and verify a database/file backup first. With the operator-selected production environment, run `node scripts/migrate.mjs --prepare-code-reviews` before deployment. This prepares only the additive feedback table/index and leaves marker 3 intact for the active release. Deploy v0.1.4, verify health, then run `node scripts/migrate.mjs` to finalize marker 4. Requests never run migration DDL. No accounts, sessions, posts, or files are reset. After finalization, rollback to v0.1.3 needs a reviewed marker compatibility step; do not overwrite newer user activity with an older backup.

### Upgrading v0.1.4 to v0.1.5

Back up and verify data/files, run `node scripts/migrate.mjs --prepare-feedback` with the selected production environment, deploy v0.1.5, verify health, then finalize with `node scripts/migrate.mjs`. Preparation adds thread/report tables and nullable notification/deletion columns while preserving marker 4 for the active release. No accounts or content are reset.

### Enabling CLI access (v0.1.6)

Back up and verify data/files, run `node scripts/migrate.mjs --prepare-cli` with the selected production environment, deploy v0.1.6, verify health and browser approval, then finalize with `node scripts/migrate.mjs`. Preparation creates only CLI device/token tables while preserving marker 5. No new OAuth provider keys or email service permissions are required. CLI uses the existing sign-in page.

The standalone package in `packages/cli` has no runtime dependencies. Check `npm pack --dry-run` before publication; only its bin/lib files, README, package metadata and GPL license are included. Publish with the `alpha` dist-tag; the browser application and CLI have independent versions. Never package operator environment files or credentials.
