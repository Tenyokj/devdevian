# Contributing to Devdevian

Thanks for helping improve Devdevian. This is an early development project; focused changes are easier to review and validate.

## Before starting

For a bug, describe the page, exact steps, expected result, actual result, browser, and viewport. Remove personal data from screenshots. For a significant feature or architectural change, discuss the proposed behavior in an issue before implementing it.

Follow the [code of conduct](CODE_OF_CONDUCT.md).

Do not publish security vulnerabilities in public issues. Follow [SECURITY.md](SECURITY.md).

## Local setup

Follow the [development guide](docs/development.md) and [architecture overview](docs/architecture.md). Use an isolated `DB_PATH` or `npm run demo` when experimenting with account deletion, moderation, or migrations. Never commit environment files, databases, uploads, session cookies, OAuth tokens, or production exports.

## Find the right part of the project

Use the [source map](docs/source-map.md), [frontend guide](src/README.md) and [test guide](tests/README.md). The browser/API and CLI have independent versions and dependency lockfiles. Keep package-specific behavior in `packages/cli`; server authorization remains shared.

For public FAQ or update edits, use `src/public/content.mjs`. Keep published fragment IDs stable, separate shipped changes from plans, and verify the built HTML. A new public route also needs prerender metadata, Vercel and standalone-server routing, and sitemap/browser checks. See the [frontend guide](src/README.md).

## Implementation guidelines

- Keep the blue/violet palette and support both themes.
- Check permissions on the server; hiding a button does not protect a route.
- Preserve the distinction between public topics and private communities.
- Keep lists bounded and paginated. Respect private access in search, notifications, profiles, and uploads.
- Validate input, use bound SQL parameters, and use transactions for related writes.
- Preserve existing data during migrations. Document storage or configuration changes.
- Add comments for non-obvious constraints, not for every line.
- Keep interfaces usable with keyboard navigation, small touch screens, tablets, and reduced motion.

## Validation

Run `npm test` and `npm run build`. For affected UI flows, also run `npm run test:browser` and inspect screenshots. Add a regression check when the change affects permissions, identity, persistence, or another behavior that is not reliably verified visually.

## Pull requests

Explain the problem, the resulting behavior, and how you verified it. Attach relevant light/dark and mobile screenshots for visual changes. Identify migrations, configuration changes, and known limitations. Keep unrelated refactors separate.

By contributing, you agree that your contribution is licensed under GPL-3.0-only. Do not submit code or assets you do not have permission to distribute.

The standalone CLI has its own dependency lockfile. Run `npm ci --prefix packages/cli` before `npm test`; terminal integration tests use Python 3 and a real pseudo-terminal (macOS/Linux). To try the live client, run `node packages/cli/bin/devdevian.mjs tui`.
