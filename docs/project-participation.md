# Project participation

Browser/API **0.9.0** and CLI **0.22 alpha** separate **who can see a project** from **who can join its work**. Existing projects retain open participation. The Team list remains presentation/credits; it grants no permissions.

| Visibility | Participation | Result |
| --- | --- | --- |
| Public | Open | Everyone can view; signed-in readers can take an available task and join discussions |
| Public | Approved contributors | Everyone can observe; only the owner and approved users can participate |
| Private community | Open | Current community members can view and participate |
| Private community | Approved contributors | Current community members can view; only approved members and the owner can participate |

Approval never adds someone to a private community, grants project ownership, or changes their GitHub repository access.

## Browser

Select **Project participation** while creating a project. Approved mode initially allows only its owner, so there is no temporary open window during publication.

On the project conversation or Room board, open **Manage participation**. Select the mode, enter up to 100 existing usernames (one per line), preview and confirm. Private-project contributors must already have access to the community. An empty approved list means owner-only participation. The owner always retains working rights while they have access to the project audience.

Only the owner can see or edit the approved list. Other viewers see their own working/observer status and the project mode. Changing settings preserves captured versions: a conflicting save fails without silently overwriting another change. Close and reopen the editor to load current settings before preparing a new attempt.

## Contributor credits

The **Contributors** section on a project overview, Room and introduction credits the owner and public profiles associated with readable conversations, replies, code feedback, current assignments and non-withdrawn task contributions. It is paginated and reflects only the work the viewer can read. Deleted profiles and hidden profiles are omitted. Private work linked to a public project does not expose its contributors to outsiders. This is attribution, not the private approval list, a ranking, or a mirror of GitHub commit authors. Team credits remain separately edited by the project author.

## Working rights

Approved contributors can use existing participant workflows: pick up an unassigned task, update their assigned task, submit a result, and reply or add code feedback in related conversations. They do not become co-owners. Assignment, project editing, pinned decisions and result acceptance retain their existing owner/author rules.

Observers can read accessible project/task conversations, work, results and history. They cannot claim tasks, submit results, add replies, vote, publish feedback/outcomes or change project work. Personal bookmarks/follows, reporting content and removal of their own existing content remain available. A former contributor may withdraw their own pending result where the existing workflow permits it.

Removing approval, or switching an open project to approved mode, releases active assignments held by people outside the approved list. Task versions advance and the Room activity records the release. Published contributions, replies, snapshots and decision history are retained. Previously approved reviewers can decline an existing invitation, but cannot accept or publish an outcome without approval. Read access still depends on current community membership.

If a conversation is associated with more than one restricted project, approval is required for each. An existing public conversation does not become private merely because participation is restricted.

## Terminal

Within the live workspace:

```text
/room PROJECT_ID
/participation PROJECT_ID
```

Room actions include **Manage participation** for its owner, or **Participation rules** for observers. Owners get the same mode and username fields, preview and confirmation. Revoked assignments cannot keep write access through an older local draft.

Script commands:

```sh
devdevian participation PROJECT_ID --json
devdevian participation set PROJECT_ID --mode approved --members "alice,bob"
devdevian participation set PROJECT_ID --mode approved --members ""
devdevian participation set PROJECT_ID --mode open
```

Omitting `--members` preserves the currently stored list. An explicit empty string clears it. Opening participation makes the list inactive; it is available if the owner chooses approved mode later. `--yes` deliberately skips the interactive confirmation. New CLI project creation checks server capability before allowing approved mode, rather than trusting an old server that might ignore an unknown field.

## API and rollout

- `GET /api/participation/config` exposes readiness only.
- `GET /api/projects/:id/participation` checks project visibility. Returns mode/version/current-viewer permissions; only the owner receives member metadata.
- `PUT /api/projects/:id/participation` requires the owner, current `expected_version`, `mode` (`open` or `approved`) and an explicit `members` username array. Changes are atomic and version checked.
- Policy data uses a reserved `entity_details` namespace, separate from editable presentation details. The ordinary Details API cannot edit it.
- Global schema stays v7. Optional `participation_schema` v1 adds database barriers for core inserts, assignments and content edits, including legacy writers. Assignment release, version increments, activity and policy update are transactional.
- Prepare explicitly **after a verified encrypted backup** with `node scripts/migrate.mjs --prepare-participation`, then deploy the matching API. The manual backup workflow offers `participation`; scheduled backups do not migrate. New runtime boot does not issue this DDL on a prepared production database.
- Keep older Vercel deployments protected. Older servers are not fully compatible with approved participation; do not remove database barriers or route users to them as a rollback strategy.

The encrypted backup/restore check preserves policy rows, optional schema and triggers. Tests exercise cross-account writes, private membership, CAS conflicts, legacy SQL rejection, revoked assignments, restored-server boot and future-schema refusal using isolated data only.
