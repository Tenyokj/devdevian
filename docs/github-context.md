# GitHub review context

Devdevian can attach author-provided GitHub context to a code review created from the CLI. Both the terminal and browser display the repository, branch (or detached HEAD), full base commit, repository-relative file path, optional selected file range, staged/unstaged source type and an optional matching pull-request link.

## Terminal workspace

1. Start `devdevian tui` inside your project, or pass `--project PATH`.
2. Request a code review and explicitly select a file/range or Git diff/hunk.
3. Fill in the review focus and message. Continue to the **GitHub** step with Ctrl+N.
4. Change **GitHub context** from **Skip** to **Include origin, branch and base commit**. Optionally paste a canonical PR URL such as `https://github.com/owner/repo/pull/42` from that same repository.
5. Open the full preview with Ctrl+S, inspect the code, audience and source context, then explicitly confirm publication. Preview scrolling reveals longer context. Step changes and local draft restoration preserve the option and PR URL; Git metadata is read again when preparing a new preview.

The default is Skip. Without opting in, ordinary review creation does not collect GitHub metadata. A PR URL requires context to be enabled. If your project has no usable GitHub `origin` or no existing commit, skip this optional step or configure the repository first.

## Command client

```sh
devdevian review create \
  --file src/retry.ts --lines 20:65 \
  --title "Review retry handling" --topic web \
  --body-file question.md --focus "Timeouts and idempotency" \
  --github-context --pr https://github.com/owner/repo/pull/42
```

Omit `--pr` when there is no pull request. `--github-context` uses the current project directory unless `--project PATH` is given; the selected code file must remain within it. Existing preview/confirmation rules apply. `--yes` is an explicit publication bypass for scripts. `conversation open POST_ID` includes the same context in text or JSON output.

## Meaning and boundaries

Context is a snapshot of local Git metadata, not a verified identity, repository ownership claim or GitHub synchronization. The base commit is the local HEAD at preview time. An unstaged/staged diff or edited working file may differ from that commit. The interface therefore links to the **base commit**, without claiming that the published snippet is the file contents at that commit or that the PR contains these changes. The PR is supplied manually and must refer to the same repository; Devdevian does not check its existence or status.

Attaching source context reads the selected local Git origin/HEAD/branch/prefix. That flow does not fetch, push, run GitHub API calls, copy Git credentials or request extra OAuth scopes. The separate [public PR reader](github-pr-reader.md) makes explicit read-only GitHub API requests when you choose to open a PR. Supported origin formats are standard `https://github.com/owner/repo[.git]`, `git@github.com:owner/repo[.git]` and `ssh://git@github.com/owner/repo[.git]`. Embedded credentials, other hosts and arbitrary URL suffixes are rejected without echoing the remote. A canonical HTTPS repository URL is the only remote value sent to Devdevian.

The data uses the existing optional `details.github_context` record; no schema migration is needed. Server validation bounds fields and rebuilds the allowed shape. Existing publication read permissions and author-only details editing apply, including private communities. An author can remove context through `PUT /api/details/post/:id` with `{"github_context":null}`; ordinary edits preserve context and other details. This first stage provides browser display; a browser editor for Git metadata and actual PR synchronization are future work.

See the [CLI guide](../packages/cli/README.md), [architecture](architecture.md) and [GitHub's explanation of commit-specific links](https://docs.github.com/en/repositories/working-with-files/using-files/getting-permanent-links-to-files).
