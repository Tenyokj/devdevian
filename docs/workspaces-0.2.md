# Devdevian 0.2 — Workspaces

**Status: interactive concept, in development on `workspaces-0.2`.** The published application remains browser/API 0.1.10 and CLI 0.14. No workspace API, migration or npm release is introduced by this prototype.

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
| Work request | Existing conversation, kind, author, replies and visibility | Explicit project association and a small workflow |
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
| Publish another review revision | Request author |
| Add feedback/reply | Authenticated reader, subject to existing paused/removed/limit rules |
| Resolve feedback / accept solution | Existing publication-author rules |
| Pin project context | Project owner initially |
| Change project presentation | Existing project-owner checks |

The prototype views the sample as its owner and does not implement these backend permissions. Moderator powers must retain their existing public/community boundaries. Revisions and private files must use the established authenticated upload/download boundary; a stored provider URL cannot replace access control.

## Delivery plan — one public milestone

1. **Concept:** validate project navigation, work requests, repeated review, old quotes and phone/desktop use. This branch currently implements this step.
2. **Data contract:** additive project associations and immutable review snapshots, migration/backfill strategy, capabilities, permission checks and compatibility tests. Keep old quotes and URLs readable.
3. **Browser integration:** connect the accepted interface to the real project/request APIs with bounded queries and pagination, revision publication preview/confirmation, pending/error states and draft preservation.
4. **CLI companion:** explicit linking of the current directory to an existing project, project-scoped navigation, revision preview/publication and the same version/permission rules. No automatic repository upload or code execution.
5. **Release candidate:** multi-account/private-access tests, recovery and failure paths, migrations/rollback rehearsal, query/request budgets, mobile/keyboard checks and actual browser↔terminal continuity. Ship a combined 0.2 milestone when this complete workflow is ready.

Private GitHub repositories, GitHub writeback, arbitrary code execution, realtime collaborative editing and a new role/membership system are outside the first milestone. Workspace CLI versions remain separately versioned alpha packages; this concept does not assign a stable CLI 1.0 label.

## Verification

`npm run test:workspaces` checks immutable revision behavior and exact comparison reconstruction, then drives the interactive concept in Chromium. The browser scenario covers requests/replies surviving dialog navigation, revision/quote boundaries, decisions, activity, terminal selection, keyboard navigation, reset and 1440/1024/768/390/360px layouts. It asserts that no forum API requests occur. Ordinary production checks remain required before integrating the interface.
