# My work

Open **My work** in the browser sidebar, or run `/work` in the live terminal. It brings existing workflows together without granting new permissions or completing actions automatically.

| Section | What appears | Next action |
| --- | --- | --- |
| Next up | Pending/accepted named review invitations, changes requested on your current snippet, involved open feedback last answered by someone else, results for you to review or revise | Open the exact review request, feedback thread or task result |
| My tasks / Tasks | Linked, active Room tasks assigned to you | Open task; open room or PR context separately |
| Results | Your submissions and submissions to projects you own, including completed results | Open the existing Contributions workflow |
| Continue | Local drafts and recently opened readable conversations | Resume a draft or continue reading |

A completed review leaves the invitation queue. A changes-requested outcome stops appearing when a newer snippet revision is published. Accepting a contribution does not mark its task ready; a GitHub merge does not accept a result. Existing review/result actions keep their preview, explicit confirmation and version checks.

The list reads one selected page from the Devdevian database. GitHub checks are fetched only after you choose **PR & checks**; provider errors stay inside that view. Refresh My work after another person changes work. The terminal refreshes its selected work page when you enter it again.

## Browser

Visit [/app#work](https://devdevian.vercel.app/app#work). Select Next up, My tasks, Results or Continue. Result and review cards open the matching existing workflow in a dialog. Project room opens the shared board; conversation links open the full discussion.

Continue reads ordinary Composer drafts from this browser/account. Frozen GitHub import drafts retain their own entry point. For a private draft, current community membership is checked before opening the Composer. Clearing browser storage removes local drafts/history; they are not a server backup.

## Terminal

```sh
devdevian tui
# Within the live workspace:
/work
/work tasks
/work results
/work continue
/work mine

# Script output:
devdevian work --section attention --page 1 --json
devdevian work --section tasks --json
devdevian work --section results --json
devdevian work --section continue --project ./my-project --json
```

Use left/right to switch sections, Enter to open, X for contextual actions, R to refresh, I for Inbox and D for the full local draft list. Mine, Reviews, Saved and Following remain available. Local continuation follows the canonical directory selected by `--project` (current working directory by default), server and account.

## Data and access

- Recent history stores at most 12 conversation IDs and opening timestamps for 30 days. It contains no copied body, title, credentials or GitHub tokens. Terminal history files/directories use restricted permissions and reject symlinks or oversized history files.
- The server accepts at most 12 distinct IDs and rechecks current visibility/removal before returning bounded title metadata. Losing private membership removes the conversation from recent results as well as the relevant queue.
- Both the Room task and parent project must be readable. Assignment grants no private-community access. Paused/removed items are excluded from action queues; readable finished results remain in Results.
- Draft contents remain local until you explicitly publish. If recent-item retrieval fails, local drafts remain available. History does not synchronize across devices or between browser and terminal.
- `/api/my-work?section=attention|tasks|results&page=1` is authenticated, paginated and read-only. `/api/my-work/recent?ids=1,2` returns only permitted recent metadata. Identity comes from the authenticated session, never a supplied account ID.
- Optional workflow readiness is reported explicitly. No new database schema, migration or GitHub permission is required for My work.
