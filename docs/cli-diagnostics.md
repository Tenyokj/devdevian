# First launch and diagnostics

[CLI guide](../packages/cli/README.md) · [PR review workflow](github-pr-reader.md) · [Version history](../packages/cli/VERSIONS.md)

Install the current alpha with Node.js 24 or newer:

```sh
npm install -g @tenyokjs/devdevian-cli@alpha
devdevian tui --start
```

Sign-in stays in your browser; the terminal displays the code you approve. A newly connected terminal opens **Getting started**. Choose an action with arrows and Enter: read the feed, ask a question, open a public PR, check the connection, or learn the keys. Creating a question/review opens a draft, never an automatic publication. Press **Ctrl+S** for a preview and explicitly confirm to publish. Existing signed-in launches keep the normal feed; `/start` reopens the guide anytime.

The live workspace needs at least 60 columns by 18 rows. Tab changes focus between navigation/content/input; `/` opens command input, Esc returns, and Ctrl+K searches actions. In a PR, F chooses a file, A collects selected hunks, and R composes a multi-file review. The help view explains the context-sensitive keys.

## Check without changing anything

```sh
devdevian doctor
devdevian doctor --offline
devdevian doctor --json
devdevian doctor --host https://your-forum.example --project /path/to/project
```

`doctor` checks the runtime, terminal size, workspace directory availability, Git availability, saved credential validation, server health and saved session. It does not read project source files or run repository commands; the only Git command is `git --version`. Git is optional for ordinary forum use and public PR reads, but needed for local Git context/diffs.

Network mode makes at most two explicit GETs: public `/api/health`, then authenticated `/api/me` only if health succeeds and the selected origin matches the saved credential origin. Each network request has a five-second deadline and 64 KiB response limit. No redirects, cookies, GitHub requests or automatic retries are used. `--offline` performs only local checks and skips health/session validation.

JSON output has `schema`, `cli_version`, `origin`, `ok` and `checks`; each check has `id`, `status`, `message` and optional `action`. Status is `ok`, `warn`, `error` or `skipped`. Exit code 1 indicates a failed check; missing login, non-interactive output or optional Git produce notes without failing the whole command. A successful offline check does **not** establish that the server or session works. The report omits tokens, account identity, local file contents and raw server/error bodies. It includes the selected server origin: review a self-hosted address before sharing it publicly.

Inside the live workspace, use `/doctor`, or choose **Check my connection** in `/start`. On the sign-in/connection screen, press D. Esc cancels/returns, arrows scroll, and R explicitly runs the checks again. Cancelling does not change saved credentials or drafts.

## Follow the result

| Result | Next step |
| --- | --- |
| Node.js is older than 24 | Install a supported Node.js version before running the CLI. |
| Terminal is too small | Enlarge the VS Code terminal panel or terminal window. Script commands still work without a TUI. |
| Credentials cannot be loaded | Check the `credentials.json` format and owner-only permissions (600 on macOS/Linux). Doctor does not delete or overwrite it. Reconnect with `devdevian login` once you choose to replace an invalid login. |
| No saved login / expired session | Run `devdevian login`. Existing drafts remain local and retain their account/project scope. |
| Saved origin differs from `--host` | Credentials were not sent. Use `devdevian login --host ORIGIN` to connect deliberately to the other server. |
| Health fails / connection times out | Check the selected address, network and service status. Retry diagnostics explicitly when appropriate; no writes are retried. |
| A publication failed or timed out | Check the feed/conversation to see whether it already succeeded before repeating it. Doctor cannot determine the outcome of a previous write. |

The checks are a troubleshooting aid, not an uptime guarantee, a security audit or a load test. No files/settings are repaired automatically; the command never publishes content or revokes a session.
