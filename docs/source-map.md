# Find your way around the source

[Documentation home](README.md) · [Architecture](architecture.md) · [Contributing](../CONTRIBUTING.md)

Devdevian is one repository with a browser application, a shared API and an independently published CLI. The current module layout keeps existing imports and deployment paths stable; this guide is a navigation map, not a second source of configuration.

## Top-level folders

| Location | Purpose |
| --- | --- |
| [`src/`](../src/README.md) | React forum, public pages, styles and browser API client |
| [`packages/cli/`](../packages/cli/README.md) | npm package, terminal workspace, commands and its own tests/lockfile |
| [`api/index.mjs`](../api/index.mjs) | Vercel entry point for the Express API |
| [`tests/`](../tests/README.md) | Shared server, browser-contract, storage and security regression tests |
| [`scripts/`](../scripts/README.md) | Build, migration, operations and isolated verification entry points |
| [`public/`](../public/) | Publicly served brand assets and product screenshots; never private uploads |
| [`.github/`](../.github/) | CI, issue templates and repository workflows |
| [`docs/`](README.md) | User, contributor and operator documentation |

Server domain modules currently live at the root. Generated `dist/`, local data, backups, environment files and test artifacts are not source and must stay out of Git.

## Start with the behavior you want to change

| Task | Main entry points | Verification |
| --- | --- | --- |
| Public landing, FAQ or update history | [`src/landing.jsx`](../src/landing.jsx), [`src/public/`](../src/public/), [`scripts/prerender.mjs`](../scripts/prerender.mjs) | SEO suite and browser checks, including no-JavaScript content |
| Public conversation URLs, SSR and sitemaps | [`public-conversations.mjs`](../public-conversations.mjs), [`conversation-url.mjs`](../conversation-url.mjs), [`src/public/conversation.jsx`](../src/public/conversation.jsx) | Public access/XSS/API suite and dedicated browser flow |
| Forum screens, forms or notifications | [`src/main.jsx`](../src/main.jsx), [`src/forms.jsx`](../src/forms.jsx), [`src/activity.jsx`](../src/activity.jsx) | Affected browser flow and mobile layouts |
| Authentication or provider linking | [`auth.mjs`](../auth.mjs), [`oauth-link.mjs`](../oauth-link.mjs), [`password-reset.mjs`](../password-reset.mjs), [`cli-auth.mjs`](../cli-auth.mjs) | Identity/API suites; real callbacks require provider verification |
| Posts, replies and accepted answers | [`domain.mjs`](../domain.mjs), [`replies.mjs`](../replies.mjs), [`code-reviews.mjs`](../code-reviews.mjs), [`feedback-discussion.mjs`](../feedback-discussion.mjs) | Permission and feedback regression suites |
| Community membership and visibility | [`spaces.mjs`](../spaces.mjs), [`moderation.mjs`](../moderation.mjs) | Cross-account public/private access checks |
| Upload bytes and attachment authorization | [`uploads.mjs`](../uploads.mjs), [`object-storage.mjs`](../object-storage.mjs) | Upload tests and isolated S3 fixture |
| Database/schema or recovery | [`database.mjs`](../database.mjs), [`schema.mjs`](../schema.mjs), [`backup.mjs`](../backup.mjs) | Runtime/recovery suites; explicit migration and restore drill |
| CLI navigation, forms and appearance | [`packages/cli/lib/tui.mjs`](../packages/cli/lib/tui.mjs), [`workflow.mjs`](../packages/cli/lib/workflow.mjs), [`theme.mjs`](../packages/cli/lib/theme.mjs) | Pure model tests and real pseudo-terminal suites |
| GitHub context and public PR diffs | [`github-context.mjs`](../packages/cli/lib/github-context.mjs), [`github-reader.mjs`](../packages/cli/lib/github-reader.mjs), [`pr-diff.mjs`](../packages/cli/lib/pr-diff.mjs), [`docs/github-pr-reader.md`](github-pr-reader.md) | Bounded fetch/patch tests and terminal workflows |

## Boundaries to preserve

- A CLI action and its browser equivalent share server permissions. Do not implement access control only in a component or command.
- Public pages render at build time. Do not import server bootstrap, connect to a database or request private API data from them.
- Terminal file selection, local drafts and GitHub context are explicit user choices. Do not read or publish an entire working tree implicitly.
- Root `package.json` is the browser/API version; `packages/cli/package.json` is the npm client version. Record changes in [CHANGELOG](../CHANGELOG.md) and, for CLI releases, [VERSIONS](../packages/cli/VERSIONS.md).
- Document non-obvious reasons and invariants in code. Comments should explain access boundaries, lifecycle, compatibility or failure handling rather than repeat syntax.

Read [development](development.md) before running fixtures and [reliability](reliability.md) before working with migrations or backups. Neither tests nor a configuration check establish that hosted backups or third-party delivery are working.
