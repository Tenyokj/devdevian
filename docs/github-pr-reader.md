# Public GitHub PR reader

CLI 0.9.0 adds explicit, read-only inspection of public pull requests. CLI 0.10.0 adds patch inspection and explicit selection into a Devdevian code review. This is separate from the [local review source context](github-context.md): opening a PR fetches current public GitHub metadata, while publishing a Devdevian review does not automatically copy or synchronize the PR.

## Interactive workspace

- Open **GitHub PR** in navigation and paste the URL after `/pr `, or type `/pr https://github.com/owner/repo/pull/42` in the command bar.
- In a conversation with a linked PR, use **X → Read linked GitHub PR**, or find that action with Ctrl+K.
- Read the title, open/closed/merged/draft status, author, head/base branches, head commit, description and change counts.
- Up/down and Page Up/Down scroll. **[ / ]** paginate changed files, 20 per page. **Shift+R** explicitly refreshes. **Esc** returns to the forum and preserves its previous position. **X → Open PR on GitHub** opens the canonical URL in your browser.

From the PR overview, **F** or **X → Choose a file / inspect diff** opens a selectable file list. **↑/↓** chooses a file; **Enter** loads its patch. In the diff, **[ / ]** moves between hunks (complete blocks of changes), **Space** anchors/clears a contiguous hunk range, **↑/↓ / Page Up/Down** scrolls the current hunk, and **←/→** pans long lines. Added/deleted lines have `+`/`-` markers and colors; old/new file line numbers remain separate.

**C** or **X → Request review of selected hunks** copies only the selected complete hunks to a local review draft. Choose topic/audience, write the review focus and context, then **Ctrl+S** previews the exact patch and source. Publication requires a separate confirmation. Escape returns to editing. Saved drafts retain the frozen patch and base/head commits: restoring one does not fetch newer GitHub code or read a local file. Normal account/community permissions apply; selecting public GitHub code does not automatically publish it.

A review contains one file and one contiguous range of complete hunks, up to 20,000 characters including headers. Review line numbers refer to the published patch, including headers, rather than original file lines. Removed and renamed paths are preserved in patch headers. Missing/binary, oversized, incomplete or control-character patches cannot be selected; open GitHub for full context. Partial-line selection and inline GitHub threads are future work.

Before accepting a patch, the reader fetches fresh metadata, the file page, then fresh metadata again and checks both base/head commits. If the PR changes during loading, it asks you to refresh and select again; it does not retry automatically. This checks for concurrent pushes, not an atomic GitHub snapshot or proof of author ownership. Stored metadata is author-provided and server-validated. The browser and CLI label PR snapshots separately from local Git changes. Published reviews and comments live in Devdevian; no GitHub comments, PR state changes or synchronization are performed.

## Command and JSON

```sh
devdevian github pr https://github.com/owner/repo/pull/42
devdevian github pr https://github.com/owner/repo/pull/42 --page 2 --json
devdevian github diff https://github.com/owner/repo/pull/42 --file src/retry.ts --json
devdevian github review https://github.com/owner/repo/pull/42 --file src/retry.ts \
  --hunks 1:2 --title "Review retry changes" --topic web \
  --focus "Check timeout handling" --body "Please review these two changes."
```

The `github pr` and `github diff` read commands work without a Devdevian login. Overview JSON contains no raw patches; explicit diff JSON includes parsed hunks or an unavailable reason. `github review` requires login, a file path from the chosen page, and an explicit `--hunks N` or `--hunks START:END`; its preview/confirmation works like other publishing commands (`--yes` explicitly confirms scripted publication). Use `--page N` for files beyond the first page. TUI use requires the usual Devdevian account/session.

## Requests, limits and privacy

Requests go directly from the CLI to the fixed `https://api.github.com` REST host. Only canonical public GitHub PR URLs are accepted. The reader sends GET requests with an explicit API version and no Authorization header, cookies, Devdevian session or environment-provided GitHub token. It does not route public reads through the forum backend or request new OAuth permissions.

Opening a diff costs three fresh requests (summary, files, summary), even when its overview was cached. Ordinary overview pagination keeps its existing cache. The initial overview page ordinarily costs two requests: PR summary and one page of files. Additional pages reuse the summary for up to 60 seconds. The cache is bounded to 24 responses in memory, with a 2 MiB response cap and a 15-second request deadline; it is not saved to disk. No background PR polling or automatic retry runs. Manual refresh clears cached data while respecting rate-limit cooldowns. GitHub's unauthenticated quotas apply; a 403/429 may require waiting before another refresh.

Private/missing PRs, redirects after repository moves, malformed responses, large bodies, network failures and quota errors produce messages without signing out of Devdevian or discarding a forum draft. GitHub exposes up to 3,000 files through this endpoint; the UI marks truncation and offers the browser URL when that boundary is reached. No GitHub credentials or private-repository authorization are configured in this stage.

Implementation references: [PR endpoints](https://docs.github.com/en/rest/pulls/pulls), [API versions](https://docs.github.com/en/rest/about-the-rest-api/api-versions), [CLI guide](../packages/cli/README.md).
