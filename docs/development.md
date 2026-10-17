# Development

## Normal local setup

Use Node.js 24+ and npm:

```sh
npm ci
cp .env.example .env
npm run dev
```

The landing runs at `http://127.0.0.1:4173/`, the app at `/app`, and the API under `/api`. Keep browser origin and `APP_URL` identical. The default database is `data/arc.sqlite`; uploads are in `data/uploads`. `DB_PATH` selects a separate database and its adjacent uploads folder. Schema bootstrap/migrations run at startup. The ordinary empty checkout has no fake feed fallback or seeded accounts.

Keep `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` empty and `UPLOAD_DRIVER=local` for isolated development. **Do not place production credentials in the auto-loaded `.env`.** The application does not automatically load `.env.production.local`; that ignored file can hold operator configuration separately. All `.env*` files except the blank `.env.example` are excluded from Git and deployment uploads.

## Disposable accounts and fixtures

```sh
npm run demo
```

This builds the frontend and runs a local acceptance environment on port 4174 with disposable accounts. The script prints local credentials, forces local storage, and refuses production mode. Do not expose this server to the public internet or use real user records.

The screenshot fixture tooling is optional. It archives and replaces local data, so stop local servers and read the script’s required explicit flags before running:

```sh
npm run seed:screenshots -- --reset-local-data
npm run check:screenshots
```

To archive and empty both working databases and their uploads:

```sh
npm run data:empty -- --empty-local-data
```

These commands are for local fixtures, never cloud resets. The entire previous data directory is moved into ignored `backups/`. Do not commit that directory. Committed landing screenshots remain separate under `public/screenshots`.

## Checks

```sh
npm test
npx playwright install chromium
npm run test:browser
DB_DRIVER=libsql TEST_S3=1 node --test tests/*.test.mjs
```

The first command builds and runs API, authentication, mail-contract, and simulated DOM checks against isolated data. Browser checks exercise real forms, themes, files, access roles, and mobile layouts and save captures to `.test-data/browser`. The libSQL/S3 variant uses the production database SDK locally and an HTTP S3 fixture; it does not establish live cloud connectivity. CI also runs this variant on Linux.

Use focused tests while iterating. A change to access, identity, data persistence, or serialization should include a regression assertion. Review meaningful screenshots for UI changes. Keep local and remote service credentials out of fixtures and logs.

## Frontend and server work

React UI lives in `src/`. The landing is `src/landing.jsx`; policy pages are `src/policies.jsx`; the technology ribbon is `src/stack.jsx`. Original screenshot paths are configured by `src/landing-media.json`. Brand marks are local SVGs in `public/brands` with attribution in `THIRD_PARTY_NOTICES.md`.

The server entry is `server.mjs`, reused by `api/index.mjs` on Vercel. See [architecture](architecture.md) before changing response enrichment, access checks, or schema migrations. Keep all SQL values parameterized and migrations compatible with SQLite and libSQL. Preserve uploaded media IDs rather than constructing public storage URLs.

## Configuration and deployment

Use dedicated development OAuth clients and a test mail sender. See [authentication](authentication.md). The standalone production server serves the built frontend; run `npm run build` before `npm start`. Hosted settings and release checks are described in [deployment](deployment.md).
