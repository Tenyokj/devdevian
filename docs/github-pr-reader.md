# Public GitHub PR reader

CLI 0.9.0 adds explicit, read-only inspection of public pull requests. This is separate from the [local review source context](github-context.md): opening a PR fetches current public GitHub metadata, while publishing a Devdevian review does not automatically copy or synchronize the PR.

## Interactive workspace

- Open **GitHub PR** in navigation and paste the URL after `/pr `, or type `/pr https://github.com/owner/repo/pull/42` in the command bar.
- In a conversation with a linked PR, use **X → Read linked GitHub PR**, or find that action with Ctrl+K.
- Read the title, open/closed/merged/draft status, author, head/base branches, head commit, description and change counts.
- Up/down and Page Up/Down scroll. **[ / ]** paginate changed files, 20 per page. **Shift+R** explicitly refreshes. **Esc** returns to the forum and preserves its previous position. **X → Open PR on GitHub** opens the canonical URL in your browser.

This stage lists file names, rename source paths and additions/deletions. It does not inspect full patches or inline review threads, publish imported code, post GitHub comments or change PR state. Changes on GitHub can occur while paging, so the view is not an atomic snapshot of a repository.

## Command and JSON

```sh
devdevian github pr https://github.com/owner/repo/pull/42
devdevian github pr https://github.com/owner/repo/pull/42 --page 2 --json
```

The public-read command works without a Devdevian login. JSON contains `pull`, `files`, `pagination`, a truncation flag and terminal presentation fields; no raw file patches are returned. TUI use still requires the usual Devdevian account/session.

## Requests, limits and privacy

Requests go directly from the CLI to the fixed `https://api.github.com` REST host. Only canonical public GitHub PR URLs are accepted. The reader sends GET requests with an explicit API version and no Authorization header, cookies, Devdevian session or environment-provided GitHub token. It does not route public reads through the forum backend or request new OAuth permissions.

The initial page ordinarily costs two requests: PR summary and one page of files. Additional pages reuse the summary for up to 60 seconds. The cache is bounded to 24 responses in memory, with a 2 MiB response cap and a 15-second request deadline; it is not saved to disk. No background PR polling or automatic retry runs. Manual refresh clears cached data while respecting rate-limit cooldowns. GitHub's unauthenticated quotas apply; a 403/429 may require waiting before another refresh.

Private/missing PRs, redirects after repository moves, malformed responses, large bodies, network failures and quota errors produce messages without signing out of Devdevian or discarding a forum draft. GitHub exposes up to 3,000 files through this endpoint; the UI marks truncation and offers the browser URL when that boundary is reached. No GitHub credentials or private-repository authorization are configured in this stage.

Implementation references: [PR endpoints](https://docs.github.com/en/rest/pulls/pulls), [API versions](https://docs.github.com/en/rest/about-the-rest-api/api-versions), [CLI guide](../packages/cli/README.md).
