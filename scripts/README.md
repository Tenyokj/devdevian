# Scripts and their scope

[Development](../docs/development.md) · [Deployment](../docs/deployment.md) · [Recovery](../docs/reliability.md)

Prefer the named npm commands in root `package.json`; they provide the expected build order and flags.

| Script | Purpose and boundary |
| --- | --- |
| `prerender.mjs` | Build-time public HTML, sitemap, metadata and 404 document; no account/database reads |
| `browser-check.mjs` | Chromium workflows against a disposable local database; screenshots in ignored test artifacts |
| `load-check.mjs` | Bounded isolated workload, not a production load generator |
| `release-check.mjs` | Validate configuration and screenshot presence; does not prove live provider connectivity |
| `migrate.mjs` | Explicit schema migration; confirm the target environment before running |
| `backup.mjs` | Encrypted backup and restore operations; follow the recovery guide and verify the target |
| `maintenance.mjs` | Data maintenance; operation and environment matter |
| `health-check.mjs` | Service health verification using configured endpoints |
| `demo.mjs` | Isolated local demonstration server/data |
| `seed-screenshots.mjs`, `check-screenshot-data.mjs`, `cli-screenshots.mjs` | Controlled demonstration captures and fixture checks |
| `reset-local-data.mjs` | Destructive local data reset; never use against a hosted database |

Do not infer safety from a filename alone. Read the script’s required arguments and the linked operating guide before migration, maintenance, reset, backup or restore. Keep generated datasets, captures, credentials and backup archives out of commits.
