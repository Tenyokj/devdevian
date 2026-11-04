# GitHub issues, room tasks and pull requests

Browser/API 0.7.0 and CLI 0.20 alpha connect GitHub work with Devdevian Rooms. GitHub access remains read-only. Importing, linking and acceptance are separate, explicit actions.

## Browser

1. Create a project with its GitHub repository. Choose **Public project** or an approved private community. The audience is fixed after publication. Private GitHub sources require a private project and task in the same community.
2. Connect the GitHub App under `/app#github`, then install it on selected repositories. Organization installations work too. Each viewer authorizes their own account.
3. In the project room choose **Import GitHub issue**, paste a canonical issue URL and inspect its title and description. Confirm sharing when the source is private, then import. You can also start from an issue in the project's GitHub tab.
4. The imported conversation appears as an open task. It preserves a source copy; future GitHub edits or closure do not overwrite the room task.
5. Open **GitHub context** on a task, then **Link pull request**. An owner or assigned teammate can link a PR and optionally an exact contribution revision. Inspect the preview and confirm the audience.
6. The context shows the live PR state, current commit checks and current-head review verdicts using your GitHub access. Link history preserves earlier associations. Contributions also offer **Task PR & checks**.

A PR merge never marks a task ready or accepts a contribution. A contribution's existing immutable revision is not rewritten by a later GitHub link.

## Terminal

```sh
devdevian room import PROJECT_ID https://github.com/owner/repo/issues/123
devdevian room link-pr PROJECT_ID POST_ID https://github.com/owner/repo/pull/456
devdevian room link-pr PROJECT_ID POST_ID PR_URL --contribution CONTRIBUTION_ID
devdevian room github PROJECT_ID POST_ID --json
devdevian room github-history PROJECT_ID POST_ID --page 2
```

Private sources require `--share-private` in addition to the normal preview/confirmation. `--yes` skips the interactive confirmation, not the private sharing requirement. In the TUI open `/room PROJECT_ID`, then **X / Ctrl+K**: Import GitHub issue, Link GitHub PR / contribution, or GitHub task context and checks. Type `SHARE` in the private-sharing field to explicitly allow the saved copy to be read by all approved community members.

## Consistency and access

- Import requires project ownership, the project's linked repository, an unchanged server-fetched preview fingerprint and a durable operation key. Duplicate issue imports recover the existing task.
- PR linking requires ownership or current assignment, exact task/link versions and an unchanged source fingerprint. Contribution associations include their revision. A membership, assignment, project repository or audience change during a provider request cancels the write.
- Sharing private content saves a Devdevian copy readable by approved members of the selected community, including people without GitHub access. This copy is separate from live GitHub access. Do not import secrets.
- Live checks are bracketed by PR revision reads. If base/head moves while loading, the request fails and must be refreshed. Provider denial clears the view instead of showing cached private data.
- At most 20 check runs and 20 reviews are read. Partial review results are explicitly marked; they are not reported as a definitive approval or changes-requested verdict. Open GitHub for the full record. Commit statuses, check runs and review verdicts remain separate signals.
- Daily imports, link writes, provider requests and per-task link history have bounds. GitHub state does not execute code or trigger merges, comments or other GitHub writes.

## Operations

Back up and verify restoration before `node scripts/migrate.mjs --prepare-github-work`. The manual encrypted backup workflow supports `github-work` after verified archive upload. Optional GitHub work schema v1 preserves global schema v7. Existing tasks and the application remain usable when this optional schema is not prepared; the integration returns a clear unavailable response.

Issue snapshots and PR link history are included in encrypted backups. Authorization states and GitHub access/refresh tokens remain excluded; reconnect after restoration. Restore rehearsals must use an isolated destination, never production.
