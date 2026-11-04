# Contributions

A contribution is a versioned result for a task in a project Room. Browser and CLI share the same records, accounts and permissions.

## From task to accepted work

1. Open **Projects → Open workspace → Room board** and pick up a linked task. Assignment does not give permission to edit someone else's conversation.
2. Open **Contributions**, choose **Submit work**, describe what changed and how to verify it. Optionally attach a public GitHub PR and check it before previewing.
3. Preview the audience and result, then confirm. The result becomes **Awaiting review**.
4. The project owner can **Accept result** or **Request changes**, with an explanation. You cannot approve your own contribution.
5. After changes are requested, the assigned contributor can submit a new revision. Earlier descriptions, PR commits and decisions remain in history. A pending result can also be withdrawn before replacement.

An accepted contribution is final. Acceptance does not merge a PR, change the Room task status, accept a conversation answer or resolve code remarks. Move the task to Ready separately when appropriate.

## GitHub evidence

Only public PRs are supported. When the project has a GitHub repository, the PR must belong to that repository. Checking fetches public PR metadata from GitHub: title, state, base/head commits and time checked. It does not download the repository or use your GitHub OAuth token. PR authorship is **not verified** against the contributor's account.

The submitted PR snapshot is pinned to the result revision. **Check PR status** compares the latest checked head to that snapshot; new commits do not inherit an earlier verdict. Checking may reuse a five-minute cache, and the time shown always identifies that check. Submit a new result revision explicitly to attach a newer head. A checked preview expires after 15 minutes; check again if needed.

Server reads are bounded to 30 upstream requests/hour, with an additional 20 check attempts/account/hour. Cache hits avoid another upstream request. If GitHub is unavailable or the quota is exhausted, keep the draft and retry later, or submit a description without a PR. Credentials, private repositories, merge actions, checks and writeback are not part of this feature.

For detailed code review, open an attached PR in the CLI, inspect its diff, select changes and create an explicit review conversation. A GitHub App with selected repositories and verified webhooks is planned separately; no extra GitHub permissions are required here.

## Terminal

In the live workspace:

- `/room PROJECT_ID`, select an assigned task, **X → Submit work**.
- `/contributions PROJECT_ID`: results; **Enter** opens revision history; **X** offers owner decisions, withdrawal and opening the attached PR.
- **Ctrl+K** searches the current actions. **Ctrl+S** previews a form; publishing requires a separate confirmation.

Script commands:

```sh
devdevian contributions PROJECT_ID
devdevian contributions submit PROJECT_ID POST_ID --body-file result.md --pr https://github.com/owner/repo/pull/42
devdevian contributions changes PROJECT_ID CONTRIBUTION_ID --body "Please cover cancellation."
devdevian contributions accept PROJECT_ID CONTRIBUTION_ID --body "Verified both tests."
devdevian contributions withdraw PROJECT_ID CONTRIBUTION_ID --body "Preparing another revision."
devdevian contributions history PROJECT_ID CONTRIBUTION_ID
```

`--json` supports scripts. `--yes` explicitly skips the interactive publication confirmation. No background process publishes results automatically.

## Access and recovery

Only the current assignee can submit or resubmit. Only the project owner can review another person's pending result. Every decision checks the captured result revision and version. Paused tasks/projects reject writes. Unlinked, removed or inaccessible tasks hide contributions, histories and related Room activity; community membership is never granted by submission.

Descriptions: 2–6000 characters. At most 20 revisions per contributor/task. Each submission has an operation key so an identical retry does not create a second revision; decisions use version checks and are never automatically replayed. Browser descriptions are kept in account/task/version-scoped session drafts for up to 24 hours; terminal drafts use the existing local draft store. A conflict requires reloading the current result before preparing another attempt.

## Operators

Browser/API 0.5.0 and CLI 0.18 alpha require the optional Contributions schema v1 alongside Rooms. The global schema stays v7. Existing v7 databases do not run Contributions DDL during a cold start: back up and verify restoration first, then run `node scripts/migrate.mjs --prepare-contributions` with the selected production environment. The manual encrypted-backup workflow offers `contributions` after verified backup and artifact upload. Unprepared servers return a feature-unavailable response; previous work remains usable.

Encrypted backups retain contributions, immutable revisions and decision events. Temporary public PR cache entries are not authoritative; submitted snapshots are copied into revisions.
