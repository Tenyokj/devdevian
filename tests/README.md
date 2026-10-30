# Verification guide

[Development](../docs/development.md) · [Source map](../docs/source-map.md) · [Contributing](../CONTRIBUTING.md)

Use Node.js 24+, root dependencies and the CLI’s separate dependencies:

```sh
npm ci
npm ci --prefix packages/cli
npm test
```

`npm test` builds/prerenders first, then runs `tests/*.test.mjs` and `packages/cli/test/*.test.mjs`. CLI integration suites require Python 3 and a real pseudo-terminal on macOS/Linux. Chromium checks additionally need `npx playwright install chromium`.

## Choose a useful check

| Change | Check |
| --- | --- |
| Public conversation access, metadata, escaping and sitemap paging | `npm run build` then `node --test tests/public-conversations.test.mjs` |
| Public FAQ, update history, metadata or sitemap | `npm run build` then `node --test tests/seo.test.mjs` |
| Browser interaction or responsive layout | `npm run test:browser` |
| A focused API behavior | `node --test tests/feedback.test.mjs` or the relevant domain suite |
| CLI interaction | The relevant `packages/cli/test/*-terminal.test.mjs` plus its model/parser suite |
| Database compatibility and object storage | `DB_DRIVER=libsql TEST_S3=1 node --test tests/*.test.mjs` |
| Local bounded workload | `npm run test:load` |

Run the required CI checks before merging. Focused checks shorten iteration; they do not replace a required regression suite. `npm run build` is already part of `npm test` and `test:browser`.

## Isolation and evidence

`http-fixture.mjs` and the browser runner create disposable databases; `s3-fixture.mjs` provides an isolated storage fixture. Never change fixtures to point at a production database or bucket. Do not paste personal accounts or credentials into tests. Browser artifacts live under ignored `.test-data/browser/`.

The browser runners check static and runtime-rendered/no-JavaScript documents, hydration, navigation, core multi-account flows and desktop/tablet/mobile layouts. SEO tests inspect generated HTML and canonical/social metadata, not just JSX strings. Terminal suites drive a real PTY to catch layout and input regressions.

A passing fixture test does not prove real OAuth, email delivery, hosted storage, backup scheduling or production capacity. Those need deployment-specific verification described in [reliability and recovery](../docs/reliability.md). Local load checks are not a claim that the hosted service supports a particular traffic level.
