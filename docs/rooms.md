# Devdevian Rooms

Browser/API **0.4.0** and CLI **0.17.0-alpha.1** extend the existing project workspace into a shared task board, pinned decisions and project activity. Source versions, deployment and npm publication are recorded separately.

## Start with a project

Open **Projects → Enter room**, or open a workspace and choose **Room board**. The room uses the existing project's description and requested help as its goal. Its owner creates/links work requests with the existing controls; each card opens that same conversation or code review.

- **Open / In progress / Ready** columns have independent bounded pagination, search and an **Assigned to me** filter. State colors complement their text labels.
- Choose **Pick up task** to take an unassigned task. You can release it or move its status. The owner can assign a public-profile teammate by username, reassign, release or move any linked task.
- Every change has a preview and confirmation against the captured task version. If another person changes the task first, refresh before making another attempt.
- Assignment grants responsibility for task state, not permission to edit the author's conversation or publish their code revisions. Share work through the existing replies, code feedback and Review Flow.
- Closed/removed or inaccessible parent conversations remain protected. Team credits and task assignment do not grant community access. Assigned people must already have access to both the project and task.

The board and older Work requests view use one state/version record. The owner still controls initial links and unlinking; both project and conversation ownership are required for those existing operations. Rooms do not create a new membership system.

## Keep the decisions

In **Decisions**, the project owner can pin a title and explanation, optionally associated with a linked work request. An associated private request keeps the decision and its history restricted to that conversation's audience. Without an association, the decision follows the room's audience: do not copy private material into an unlinked public decision.

Pinning uses an operation key to recover the same creation after an uncertain response. Published edits append immutable history. A decision preserves its original associated conversation; create a separate decision to change context deliberately. **History** shows previous versions. **Archive / Restore** controls the pinned list; archival is not erasure, and authorized readers can still open archived history.

There are at most 12 active pinned decisions and 100 lifetime decisions per room. Titles are 3–140 characters, explanations 2–6,000. Thirty decision attempts per author/five minutes and eighty task attempts per account/five minutes bound write traffic. These are server-enforced limits.

## Follow activity

**All activity** combines task assignments/state changes, decisions and Review Flow's revision/outcome events. It is paginated and filtered at the server by the current project and parent conversation permissions. Task/review events are shown only while their work remains linked; private records do not leak via counts or earlier history. Earlier work is not retroactively invented as activity when Rooms is prepared.

## Use the terminal

`/room PROJECT_ID` opens task navigation. `/room` uses the directory's explicit project binding, created with `/bind PROJECT_ID`. Left/right switches states; Enter opens the selected conversation, and **X** offers permitted task actions. `/decisions PROJECT_ID` opens pinned decisions; **X** offers history, editing, archive/restore and the archived list. `/pin` starts an owner decision form in the current room. `/room-activity PROJECT_ID` opens the shared timeline. Ctrl+S previews forms; publication has a separate confirmation. A single pasted command with its trailing Enter is supported; pasted batches are rejected.

```sh
devdevian room PROJECT_ID --state open --page 1 --json
devdevian room PROJECT_ID --mine
devdevian room claim PROJECT_ID POST_ID
devdevian room state PROJECT_ID POST_ID --state in_progress
devdevian room assign PROJECT_ID POST_ID --username teammate
devdevian room release PROJECT_ID POST_ID
devdevian room decisions PROJECT_ID --archived
devdevian room decision pin PROJECT_ID --title "Bound retries" --body "Permanent errors stop immediately." --related-post POST_ID
devdevian room decision edit PROJECT_ID DECISION_ID --title "Bound every retry" --body-file decision.md
devdevian room decision history PROJECT_ID DECISION_ID
devdevian room decision archive PROJECT_ID DECISION_ID
devdevian room decision restore PROJECT_ID DECISION_ID
devdevian room activity PROJECT_ID
```

`--yes` explicitly confirms scripted writes without an interactive prompt. Writes are never automatically replayed. CLI drafts remain account/server/directory-scoped and preserve captured versions. A conflict requires another intentional preparation.

## Visual and read reliability changes

The browser adds blue, amber and mint status accents, project card highlights, quieter surfaces and token colors for review code and retained snapshots. Text labels, keyboard use, light/dark themes, reduced-motion settings and exact published line numbering remain authoritative. Highlighting produces inert React text/spans; it never changes or executes stored code.

A failed read can occur during session lookup before the requested route executes. Browser GETs now permit one delayed retry for a 500/502/503/504, within their original deadline. Abort, server cooldowns and intervening mutations/account changes cancel retry. Mutations are never replayed. This improves transient read recovery; it does not promise that provider outages cannot recur.

## Prepare and operate

The global schema remains v7. Rooms uses an additive `rooms_schema` version 1 plus task assignments, decisions/history and event tables. Existing v7 startup probes feature readiness and performs no DDL. Without preparation, Rooms routes report JSON 503 with `capabilities.rooms: 0`; existing conversations and Workspaces remain usable.

After an encrypted backup and a verified restoration, explicitly select the operator environment and run:

```sh
node scripts/migrate.mjs --prepare-rooms
```

Preparation is repeatable, preserves the global marker/data and refuses a future feature marker. The manual encrypted-backup workflow's `workspace_action=rooms` verifies and uploads the backup before preparation. Scheduled backup runs do not migrate. Restart/deploy the new API afterward: readiness is captured at process startup. Old code safely ignores the added tables, but does not emit new room events. Full explicit migration also prepares Rooms.

Encrypted recovery includes assignments, decisions, history and immutable guards. The browser/script CLI/real PTY suites use disposable fictional accounts; production smoke reads existing public records without adding demo content. Local load checks are not a guarantee of hosted free-tier capacity.

See [tests](../tests/README.md), [Review Flow](review-flow.md), [Workspaces](workspaces-0.2.md), [reliability and recovery](reliability.md).

## Project visibility and participation

[Project participation](project-participation.md) separates visibility from **Open participation / Approved contributors**. Existing projects stay open. An owner can restrict new work and related discussions to approved usernames, without hiding the project. Private community membership is still required separately; Team credits grant no access. Revocation releases current assignments and preserves published work/history.
