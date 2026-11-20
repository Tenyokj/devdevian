# GitHub writeback

GitHub writeback connects a conversation to the next concrete step: create an issue or post an outcome as an ordinary comment on an issue or pull request. The browser, live terminal and script commands use the same server-side preview and operation record. This is a human action: opening a conversation, importing a PR or saving a Devlog never posts anything to GitHub.

## Connect and grant access

Connect **GitHub workspace** first. GitHub sign-in alone is not a repository connection. Writes use your GitHub App **user access token**, so the published issue or comment belongs to the connected GitHub user shown in the preview. It is not sent as a Devdevian bot.

The application administrator enables **Issues: Read and write** for creating issues and issue comments, and **Pull requests: Read and write** for PR comments. Repository owners approve the updated installation permissions in GitHub. Until that approval, the existing reading integration can continue to work; GitHub rejects writes that lack permission. Contents stays read-only. No branch creation, file changes, merging, review verdicts or workflow execution is implemented by this feature.

GitHub checks the intersection of the user's rights, the app permissions and repositories selected for its installation. A connected account does not grant another Devdevian user access. Organization approval or SAML restrictions may require an additional step on GitHub.

## Browser workflow

Open your conversation and choose **Send to GitHub**, or use the same action in **GitHub workspace** and enter your conversation ID. Choose **Create an issue** and a repository URL, or **Comment on issue / PR** and the canonical issue or PR URL.

Write the outcome you want to publish. The conversation title is offered as an issue title, but the entire discussion is not copied automatically. Other people's replies and code are not silently included. Preview the exact text, connected account and destination. Use **Back to edit** to change it, then explicitly choose **Confirm and send to GitHub**. The published link appears after success. Recent operations let you reopen a preview or check an attempted send after closing the dialog.

Only the conversation author can use it as the source. Removed, paused or archived sources cannot be sent. A source edit after preview requires a fresh preview. Previews expire after 30 minutes. Issue titles contain 5–160 characters; messages contain 10–12000 characters before the short provenance footer. Limits are 30 previews per five minutes, 100 per day, 50 active previews and ten send attempts per hour per Devdevian account. Unsent previews older than a day are cleaned up when preparing another preview.

## Private work

Private conversations require a **private GitHub repository** and explicit consent to share with that repository's readers. Membership in a Devdevian community and access to a GitHub repository are different audiences: the checkbox matters even if you personally belong to both. A public destination is refused. Private exports do not include a public conversation link. Access and destination privacy are checked again before sending. Operation history also respects current source access.

Public sources include their Devdevian conversation link. Every publication has an invisible operation marker for tracing an uncertain response. Review the complete preview before sharing information with a different audience.

## Live terminal and commands

In a conversation press **X** and choose **Create GitHub issue** or **Share outcome**. Alternatively use `/writeback POST_ID issue` or `/writeback POST_ID comment`. Fill the destination and message, then Ctrl+S to preview. The terminal shows the connected identity, destination and message before the explicit publish confirmation. A private source requires typing `SHARE`.

```sh
# Prepare only: these commands do not publish to GitHub.
devdevian github writeback issue 42 \
  --target https://github.com/owner/repository \
  --title "Bound the retry deadline" --body-file outcome.md

devdevian github writeback comment 42 \
  --target https://github.com/owner/repository/pull/7 \
  --body-file outcome.md

# Use the operation UUID returned by the preview.
devdevian github writeback status OPERATION_ID
devdevian github writeback send OPERATION_ID
devdevian github writeback list
```

`--share-private` explicitly allows the private export. `--json` provides structured results. `send --yes` is an explicit automation confirmation; it still uses a previously prepared, immutable preview. Credentials remain on the server for GitHub requests. Local CLI drafts use the existing account/host scoped draft store and restricted file permissions.

## Retries and uncertain outcomes

Sending first claims the durable operation record. Concurrent requests cannot both send. A repeated request for an already successful operation returns its original result. If GitHub clearly refuses a request, it becomes `rejected`; check repository permissions before preparing another preview.

A timeout, an unreadable success response or a terminated function can mean GitHub accepted the write without Devdevian learning its URL. Such an operation becomes `uncertain` (a stale `sending` operation is marked uncertain when inspected after one minute). **It is never automatically resent.** Check the destination on GitHub before preparing another operation. This avoids retry duplicates without claiming an atomic transaction across two independent services. Creating a fresh operation is a new explicit action and can duplicate a manually repeated message.

## API and operation

All endpoints require an authenticated Devdevian account, a connected GitHub workspace and a prepared writeback schema.

| Endpoint | Result |
| --- | --- |
| `POST /api/github/writeback/preview` | Validate `kind`, `post_id`, `target`, `title`, `body`, optional `share_private`; persist exact preview |
| `POST /api/github/writeback/:id/send` | Send stored preview with `{ "confirm": true }` |
| `GET /api/github/writeback/:id` | Inspect your operation and result |
| `GET /api/github/writeback` | Read your latest accessible operations (up to 30) |

The additive `github_writebacks` table stores operation state, the exact approved message, source fingerprint, connected GitHub subject and result URL. Prepare it with `node scripts/migrate.mjs --prepare-writeback` only after a verified encrypted backup and isolated restore check. Hosted requests do not create tables. Rolling back leaves these records intact; it does not undo already published GitHub issues/comments. Account deletion removes local writeback records, but does not delete publications from GitHub. Use GitHub to edit or delete those publications.

## Resources

- [Connect GitHub workspace](/docs/github-app)
- [Issues, tasks and PRs](/docs/github-work)
- [Project Devlogs](/docs/devlogs)
- [GitHub: create an issue](https://docs.github.com/en/rest/issues/issues#create-an-issue)
- [GitHub: create an issue comment](https://docs.github.com/en/rest/issues/comments#create-an-issue-comment)
- [GitHub App permissions](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps)
