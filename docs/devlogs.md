# Project Devlogs

Devlogs are a project's progress journal: what changed, what you learned and what comes next. Open **Projects → Open workspace → Devlogs**. The project introduction still shows published updates and its existing discussion; old updates keep their original IDs and text.

## Write an update

Only the project owner writes official Devlogs. Being an approved contributor lets you participate in project work, but does not grant permission to publish the owner's progress journal. Read access follows the project's existing public/private community audience.

1. Choose **Write a Devlog**. Give the update a specific title.
2. Write Markdown: paragraphs, lists, code fences, links to PRs or conversations, and image URLs you are allowed to share. Devlogs do not upload files themselves; a link does not change the target file's access rules.
3. Choose **Preview** to inspect the rendered text. Return to writing without losing your input.
4. Choose **Save draft**, or preview and then **Publish Devlog**.

Published updates need a 5–160 character title and 10–10,000 character body. Drafts can be incomplete: a title of at least one character is enough. There is a limit of five first publications per account per day and 50 server drafts per account. Editing a published entry does not consume another publication or send another notification.

## Drafts and recovery

**My drafts** contains server drafts, visible only to the owner while they retain project access. They can be resumed from another device. Guests, project observers, approved contributors and platform moderators have no special access to someone else's drafts or private project audience.

Unsaved browser input also survives closing the composer and refreshing the same tab for up to 24 hours. This temporary copy is scoped to the account, project and entry; it is not a substitute for saving a server draft. Local tab storage can be cleared or unavailable. On a shared computer, sign out and close the browser tab.

Save server drafts explicitly. **Discard draft** requires a second click in the browser, or a confirmation in CLI; published entries cannot be discarded as drafts. A published entry cannot be reverted to a private draft. Text edits replace the current text and advance its version; Devlogs are not an immutable edit-history archive.

Concurrent saves include the version you opened. A stale edit returns a conflict and preserves the current server record. Keep your local writing, reload the entry and reconcile the changes. New entries carry a publication key: retrying the same create request after a lost response returns the original entry. Reusing that key for different text is rejected.

## Follow progress

Use **Follow conversation** on the Devlogs page or project introduction. The subscription is attached to the introduction: it covers discussion replies as well as first Devlog publications. Existing readers who replied to or saved the introduction also receive project-update notifications according to their notification preferences.

Draft saves and edits do not notify readers. Community membership is checked when delivering and reading private notifications. Notifications link to the project's Devlogs in the browser and terminal. There are no Devlog emails or push notifications.

## Terminal workspace

Install the current alpha CLI and run `devdevian tui`.

```sh
/devlogs 12
/devlog 12
```

`/devlogs ID` opens published entries. Press **Enter** to read an entry and **X** for actions: write, view private drafts, edit, publish a draft or discard it. `/devlog ID` opens a draft composer. Existing CLI text entry, external editor, preview/confirmation and account/server/directory-scoped local draft recovery apply. **Ctrl+S opens the change preview; it does not silently publish.** Confirm only after reviewing the audience and content.

## Script commands

```sh
devdevian devlogs 12
devdevian devlogs 12 --status draft
devdevian devlog create 12 --title "A safer retry boundary" --body-file update.md
devdevian devlog edit 12 v-34 --body-file revised-update.md
devdevian devlog publish 12 v-34
devdevian devlog open 12 v-34
devdevian devlog discard 12 v-34
```

Create/edit default to `--status draft`. To edit a published entry, explicitly pass `--status published`. Files are read only when explicitly selected. Changes show a preview and ask for confirmation; `--yes` deliberately skips interactive confirmation for scripts. `--json` returns structured results. A script command with a fresh operation is a new request: there is no generic automatic write retry.

## API and operation

All routes retain ordinary session/CLI authentication, write-origin checks, rate limits and project authorization:

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/projects/:id/devlogs?status=published&page=1` | Paginated published entries |
| GET | `/api/projects/:id/devlogs?status=draft&page=1` | Owner's drafts |
| GET | `/api/projects/:id/devlogs/:entry` | Read one visible entry |
| POST | `/api/projects/:id/devlogs` | Create with `title`, `body`, `status`, `operation_key` |
| PUT | `/api/projects/:id/devlogs/:entry` | Save with `title`, `body`, `status`, `expected_version` |
| DELETE | `/api/projects/:id/devlogs/:entry` | Discard an owned draft with `expected_version` |

A new publication key is an 8–100 character identifier (`A–Z`, `a–z`, digits, `_`, `-`); use a UUID. Pagination is bounded at 30 entries per response. Paused projects keep readable journals but cannot receive new writes or publications; an owner may still discard their draft. Inaccessible private projects return 404.

The additive migration adds `project_devlogs` and preserves legacy published records in `project_updates`. Hosted cold starts inspect readiness and do not migrate. Operators must first verify an encrypted database/files backup and restore rehearsal, then run:

```sh
node scripts/migrate.mjs --prepare-devlogs
```

Entry IDs are opaque: new entries use `v-34`; legacy published updates may use numeric IDs. Use the returned ID unchanged. Drafts never enter the legacy public-update table, including during rollout or rollback.

Use the existing explicit production environment workflow; do not overwrite environment files. The backup workflow's `devlogs` action prepares the schema only after the encrypted backup is verified and uploaded. New servers without preparation respond 503 for Devlogs; existing forum pages retain their existing behavior. [Operations](deployment.md) · [Rooms](rooms.md) · [CLI](../packages/cli/README.md)
