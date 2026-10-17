# Devdevian

A work in good company. Devdevian is a developer community platform for questions, discussions, code reviews, projects, events, and private communities.

**Status:** early development release. Local development and acceptance testing work. Production hosting, durable cloud storage, and live identity/email provider configuration are not complete.

## Run locally

Use Node.js 24 LTS (or a compatible newer release) and npm. The server uses the built-in `node:sqlite` API.

```sh
npm ci
cp .env.example .env
npm run dev
```

- Landing page: <http://127.0.0.1:4173/>
- Application: <http://127.0.0.1:4173/app>

Use the same origin in your browser, `APP_URL`, and OAuth provider callback settings. Registration requires a configured email service. Existing accounts can sign in while providers are disconnected.

For a separate, disposable acceptance environment with seeded accounts:

```sh
npm run demo
```

This uses `data/acceptance.sqlite` on port 4174. Credentials are printed by the local script. Never run the demo environment as a public production deployment.

## Product model

- **Public feed:** publications organized by user-created topics and technologies. Questions and code reviews support accepted answers; discussions and showcases share the reply system.
- **Private communities:** owner-approved membership, separate conversations, and community validators. Membership is checked by the server for content and attachments.
- **Projects:** logos, screenshot carousels, team members, links, and a linked feedback conversation.
- **Events:** organizer timezone, viewer-local display and date filtering, attendance, and meeting links restricted to attendees or organizers.
- **Profiles:** permanent, case-insensitive unique usernames; editable display names and media; profile visibility and notification preferences.
- **Moderation:** community owners/validators handle their own community; configured platform moderators handle the public feed. Decisions are recorded in an action log.
- **Interface:** light/dark themes, global search, custom selectors, paginated lists/replies, and responsive layouts.

Archiving closes new replies while preserving the conversation. Restoring reopens it unless a moderator restriction still applies. Hidden profiles remain visible to their owners; public posts are not hidden by profile privacy.

## Development

```sh
npm test                 # isolated API, authentication and DOM checks
npm run test:browser     # build + Chromium end-to-end checks
npm run build            # production frontend bundle
npm start                # local production-mode server, after building
```

Before the first browser test, install Chromium with `npx playwright install chromium`. Tests create isolated databases and never reset the development database. Browser artifacts are written to the ignored `.test-data/browser/` directory.

Server modules live at the repository root, React UI in `src/`, and tests in `tests/`. `scripts/demo.mjs` is local acceptance tooling. Comments explain important access, transaction, timezone, and identity boundaries.

## Data and configuration

The local server stores SQLite data in `data/arc.sqlite` and uploaded files in `data/uploads/`. `DB_PATH` selects a different database file. These files, backups, environment files, test artifacts, and personal notes are excluded from Git.

See [authentication configuration](docs/authentication.md) and [deployment status and plan](docs/deployment.md). Local SQLite and uploads must be replaced by durable services before deploying this application to Vercel Functions. A successful frontend build does not verify a production backend.

## Contribute and report issues

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a change. Report suspected vulnerabilities privately according to [SECURITY.md](SECURITY.md); do not include credentials or personal data in public issues.

## License

GNU General Public License, version 3 only (`GPL-3.0-only`). See [LICENSE](LICENSE). Third-party dependencies retain their respective licenses. Uploaded user content is not relicensed by this software license.
