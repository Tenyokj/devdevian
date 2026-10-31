# Devdevian 0.2 — Workspaces

**Status: interactive concept and server data foundation, in development on `workspaces-0.2`.** The published application remains browser/API 0.1.10 and CLI 0.14. The branch includes additive schema v7 and workspace/revision APIs; these have not been migrated or deployed to production. The visual concept still uses sample data until the next integration stage. No new npm release is introduced.

Workspaces extends the existing Projects into a place to keep work requests, review iterations, decisions and activity together. The main user journey is a review that continues after the code changes, available through the browser and the terminal.

## Try the concept

```sh
npm run preview:workspaces
```

Open `http://127.0.0.1:4180/`. The isolated Vite preview listens only on loopback and uses the fictional Orbit Queue workspace. It makes no forum API or GitHub requests. All interactions live in the current page's memory and reset on reload or **Reset sample workspace**. It is separate from the production build entries.

Walk through **Open review → add a v1 remark → Share revision v2 → compare v1/v2 → View v1 on an earlier remark → add v2 feedback**. Earlier quotes remain attached to v1 and are not automatically resolved. The prepared v2 snapshot is example data; this step is not an upload or an edit to a GitHub PR.

Also try request filters/search, creating a request, replying and reopening it, changing its status, pinning a decision, marking activity as seen, Cmd/Ctrl+K, mobile navigation and the terminal concept. The terminal panel illustrates a proposed workspace view; it does not add commands to the published CLI. Its install button copies the existing alpha installation command.

## Proposed product contract

| Concept | Existing foundation | 0.2 extension |
| --- | --- | --- |
| Workspace | Existing project ID, owner, presentation, team credits and updates | A project navigation surface and project-linked work |
| Work request | Existing conversation, kind, author, replies and visibility | One explicit project association and Open / In progress / Ready workflow |
| Review revision | Existing exact published snippet, hash and line feedback | Append-only, multi-file snapshots with stable IDs |
| Remark | Existing feedback ID, snippet hash, global range and saved quote | Explicit revision/file identity, safe navigation and version-aware discussion |
| Project context | Existing project owner and metadata | Pinned decisions with authorship and edit history |
| Activity | Existing notifications and project updates | A bounded project feed and a viewer-specific seen cursor |

Team credits do not grant private read access. A workspace does not create a second community membership system. Request and snapshot access must derive from the parent conversation and approved community membership. A public project page must not leak private requests through counts, previews, activity or search.

## Revision invariants

- A published revision is immutable. Replacing code creates another revision; it never overwrites the code a remark was anchored to.
- Store exact code, file order, selected ranges, a content hash, author, creation time and repository/base/head provenance. GitHub metadata remains author-provided unless separately verified by a reader.
- Old feedback IDs, notification URLs, quotes and resolution state survive the migration. Never infer a new anchor merely because a line number happens to exist in the latest code.
- Legacy feedback may have a saved quote without a retained full snapshot. Show that quote and label full historical code unavailable; do not fabricate old file contents.
- Counts distinguish current open/resolved remarks from earlier remarks. Sharing v2 does not resolve v1 feedback or accept a solution.
- Code comparison is a view, not the storage or identity model. The small sequence diff in this concept must not become the production anchor authority.
- Current browser/CLI clients must keep reading the latest ordinary publication. New fields and migrations must be additive; unsupported operations need explicit capability checks.

## Initial capabilities

| Action | Proposed authority |
| --- | --- |
| Read request/revision/activity | Existing parent visibility and membership |
| Link/manage a work request | Must own both the project and conversation; team credit grants no authority |
| Publish another review revision | Request author |
| Add feedback/reply | Authenticated reader, subject to existing paused/removed/limit rules |
| Resolve feedback / accept solution | Existing publication-author rules |
| Pin project context | Project owner initially |
| Change project presentation | Existing project-owner checks |

The prototype views the sample as its owner and does not implement these backend permissions. Moderator powers must retain their existing public/community boundaries. Revisions and private files must use the established authenticated upload/download boundary; a stored provider URL cannot replace access control.

## Delivery plan — one public milestone

1. **Concept:** validate project navigation, work requests, repeated review, old quotes and phone/desktop use. This branch currently implements this step.
2. **Data contract:** implemented on this branch: additive project associations, immutable review snapshots, migration/backfill, capability responses, permission checks and compatibility/recovery tests. Keep old quotes and URLs readable.
3. **Browser integration:** connect the accepted interface to the real project/request APIs with bounded queries and pagination, revision publication preview/confirmation, pending/error states and draft preservation.
4. **CLI companion:** explicit linking of the current directory to an existing project, project-scoped navigation, revision preview/publication and the same version/permission rules. No automatic repository upload or code execution.
5. **Release candidate:** multi-account/private-access tests, recovery and failure paths, migrations/rollback rehearsal, query/request budgets, mobile/keyboard checks and actual browser↔terminal continuity. Ship a combined 0.2 milestone when this complete workflow is ready.

Private GitHub repositories, GitHub writeback, arbitrary code execution, realtime collaborative editing and a new role/membership system are outside the first milestone. Workspace CLI versions remain separately versioned alpha packages; this concept does not assign a stable CLI 1.0 label.

## Verification

`npm run test:workspaces` checks immutable revision behavior and exact comparison reconstruction, then drives the interactive concept in Chromium. The browser scenario covers requests/replies surviving dialog navigation, revision/quote boundaries, decisions, activity, terminal selection, keyboard navigation, reset and 1440/1024/768/390/360px layouts. It asserts that no forum API requests occur. Ordinary production checks remain required before integrating the interface.

## Server contract on this branch

Existing Projects and conversations keep their IDs and routes. Nothing creates a second project or private-membership system. The implementation is in [`workspaces.mjs`](../workspaces.mjs) and [`review-revisions.mjs`](../review-revisions.mjs).

| Endpoint | Behavior |
| --- | --- |
| `GET /api/projects/:id/workspace` | Project identity, server capabilities, owner permission and viewer-scoped counts |
| `GET /api/projects/:id/work-requests` | Paginated visible requests; optional `state` and `q` |
| `GET /api/projects/:id/work-requests/:postId` | Current association/version; owners can inspect the version of a detached association |
| `PUT /api/projects/:id/work-requests/:postId` | Explicit link/relink with `state` and `expected_version`; 0 only for a never-linked conversation |
| `PATCH /api/projects/:id/work-requests/:postId` | Change workflow state with its current `expected_version` |
| `DELETE /api/projects/:id/work-requests/:postId` | Detach with `expected_version`; keep the conversation and advance the association version |
| `GET /api/posts/:id/revisions` | Paginated snapshot metadata, `current_revision_id`, `post_revision`, capabilities |
| `GET /api/posts/:id/revisions/:revisionId` | Exact retained code, ordered files, global line ranges, file hashes, provenance and review focus |
| `POST /api/posts/:id/revisions` | Author-only publication with `expected_revision`, `base_revision_id`, ordered `files: [{path, code}]`, `review_focus` and optional `github_context` |

Capability responses contain `work_requests: 1` and `review_revisions: 1`. New clients must check capabilities before offering writes. `409` means stale state, paused publication or a storage cap; preserve the draft and reload. Private/non-readable targets return `404`. Project introductions cannot themselves become work requests. Detaching keeps a version tombstone so an old editor cannot overwrite a later relink. Credits do not grant access. Workflow Ready is independent of accepted answers and feedback resolution.

A revision contains up to 10 unique relative paths and 20,000 total code characters, joined by one newline in file order. Exact original line endings and trailing lines are retained. Global `start_line`/`end_line` refer to this exact flattened text, preserving the current clients' line-number contract. PR file/hunk provenance is validated against the complete supplied patches; provenance remains author-provided, without GitHub verification or writeback. Untrusted paths are labels, never filesystem reads. No repository fetch or code execution occurs.

Line-feedback lists additionally return `revision_id` for the current snapshot and each remark's nullable `snapshot_id`, `snapshot_available`, derived `file_path` and `outdated`. New feedback can send `revision_id` and `file_path` with the existing hash/global range; stale identity is rejected even when two revisions have identical code. Explicit-version feedback must stay within one file. Old clients can continue sending only `snippet_hash`; their new remarks attach to the current retained snapshot. Their hash-only stale-read detection cannot distinguish two identical texts; new clients must send the revision identity. Current/earlier counts use snapshot identity rather than only code equality.

Ordinary post creation and legacy PATCH edits also retain review snapshots atomically. A title-only edit does not create a new snapshot. Replacing code never resolves remarks or accepts a reply. Historical feedback replies, tombstones, IDs, notification links and original quotes are unchanged. A DB trigger blocks accidental snapshot UPDATEs; no API edits or deletes snapshots. An intentional data-erasure procedure may delete retained records; snapshots are not a substitute for a retention/privacy policy.

Publishing revisions is bounded to five per author per ten minutes across both APIs, and 100 snapshots per review. Project workflow mutations are bounded to 60 per author per five minutes. Lists cap pages at 30. These limits bound individual operations, not a claim of unlimited hosted capacity.

## Additive migration and recovery

This is an operator procedure for the eventual 0.2 deployment, **not a request to migrate production now**. Use an explicitly selected environment; never load developer credentials or overwrite `.env` files as part of preparation.

1. Create and verify a database/file backup. Rehearse on a restored disposable copy first.
2. Run `node scripts/migrate.mjs --prepare-workspaces` while release 0.1.10/schema 6 remains active. It creates association/snapshot tables, a nullable feedback anchor/index and an immutable-update guard. It backfills the currently retained review code in bounded keyset batches, and records readiness only when preparation finishes. The main schema marker remains 6.
3. Existing remarks whose hash matches that retained code gain the snapshot identity. Older unknown hashes keep NULL and their exact saved quote. No historical contents are guessed. Valid existing multi-file PR boundaries are retained; unknown file origin uses the explicit `snippet` label. Preparation is repeatable and does not reset content, accounts, sessions or files.
4. Deploy the new server only after preparation completes. It accepts prepared schema 6 without running DDL/backfill on request startup. Verify the real browser/CLI workflow before `node scripts/migrate.mjs` finalizes marker 7. A premature/partial preparation fails the readiness check.
5. After finalization the old server will reject marker 7. Rollback requires an explicit reviewed marker compatibility step with the additive tables retained; never restore an old backup over new user activity. A prolonged mixed-version deployment may have quote-only feedback from the old server, which remains readable; avoid treating an absent full snapshot as recovered history.

The backup schema copier includes snapshot tables, anchors, indexes and triggers. The regression fixture restores that copy, verifies quote/revision identity and confirms the immutability guard still rejects updates. This verifies the storage contract locally; it does not assert that hosted backup scheduling or a production restore drill has occurred.

`tests/workspaces-api.test.mjs` covers ownership, private-list/search/count boundaries, revoked membership, workflow/version conflicts (including detach/relink), multi-file offsets and exact bytes, repeated-code identities, old-client edits, stale requests, paused states, revision budgets/caps, interrupted-write rollback, repeatable v6 preparation and snapshot recovery. The visual concept's separate tests still assert zero forum API calls.
