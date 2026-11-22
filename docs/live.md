# Devdevian Live

Live connects an existing conversation to a shared coding session. Invited developers edit the same small code document, see each other's cursors, and discuss changes beside the editor. A session keeps its own chat and participant list. It does not execute code, create a remote terminal, or upload your local project.

[Watch Devdevian Live: A second pair of hands — 90-second film](https://www.youtube.com/watch?v=rCj-GBH760E). See shared editing, session chat and a saved outcome in action.

## Start from a conversation

1. Sign in and open the conversation you want to work through.
2. Choose **Live sessions**, then **Start a session**.
3. Give the session a title, choose a language, and review the starting code. A conversation's existing snippet is offered when present; you can change the starting text before creating the session.
4. Choose **Open Live workspace**. The starting code is saved separately. Edits inside Live never replace the original post or its review snapshot.
5. Open **People**, enter an exact permanent username, and invite that person as an editor or viewer.
6. The invited person receives an in-app notification with the session title, their role and **Join session**. They can also find it under **Live sessions**. Copy the invitation link if you want to share it directly; a link alone does not grant access.

A repeated invitation with the same role does not create another notification. Changing the role refreshes it. Removing someone hides that invitation, including its unread count; existing source permissions are still checked. Recipients can pause Live invitations in **Settings → Notifications**. These are in-app notifications, not emails or operating-system push messages.

A project Room offers the same entry point, attached to that project's introduction conversation. There is no separate project permission system for Live: existing community access and project participation continue to apply.

## See the workflow

![Two developers sharing code and discussing the result in Live](/screenshots/live-shared.webp)

This screenshot uses isolated demonstration accounts. The code editor and chat are separate from the original post; the host decides whether to publish the final code and summary back to that conversation.

![The saved Live result in its original discussion](/screenshots/live-result.webp)

## Invitations and roles

A session link is a navigation link, not a bearer credential. Knowing the URL does not grant access. A person needs a signed-in account, an explicit session invitation, and current access to the source conversation.

| Role   | Shared code                            | Chat                                     | Invitations                            | Finish / publish                                  |
| ------ | -------------------------------------- | ---------------------------------------- | -------------------------------------- | ------------------------------------------------- |
| Host   | Edit while source allows participation | Send while source allows participation   | Add, downgrade, or remove participants | Finish the session; explicitly publish an outcome |
| Editor | Edit while source allows participation | Send while source allows participation   | No                                     | No                                                |
| Viewer | Read only                              | Send only if source allows participation | No                                     | No                                                |

For a private community, being invited to Live does not make someone a community member. For an approval-only project, an observer cannot acquire editor access through a Live invitation. If community membership or participation changes, the server rechecks access on subsequent requests. The open editor switches to read-only or stops synchronization when that change is detected.

The host can remove participants even after a session is saved. A closed session cannot accept new invitations or additional edits. Deleting the host account removes its hosted Live sessions and their session-only data. Shared contributions to someone else's session may remain as collaborative work, attributed to a deleted member.

## Work through the code

The editor supports TypeScript, JavaScript, Python, JSON and plain text. It includes syntax highlighting, line numbers, selection, indentation, and local undo/redo using **Ctrl/⌘ Z**. Undo tracks your own editor changes; it does not simply restore an old copy over another person's work.

Live uses [Yjs document updates](https://docs.yjs.dev/api/document-updates) with the [CodeMirror binding](https://github.com/yjs/y-codemirror.next). Concurrent updates merge into one document. This is different from saving a complete string and letting the last request replace every other person's changes.

Remote cursors use a consistent color per participant and display their name on hover. The People list shows recent presence. Presence is temporary and may take a few seconds to appear or disappear; it is not an audit log or proof that someone is looking at the screen.

Use **Compare original** to view the immutable starting point beside the current shared document. This is a side-by-side comparison, not a Git patch, test result, or automatic code review. Use **Shared editor** to return to editing. **Copy code** copies the current local document, including unsent edits if the network is interrupted.

## Synchronization and interruptions

This first version synchronizes through bounded HTTPS requests to the existing API. Updates normally reach other participants within a few seconds; it is not a zero-latency WebSocket transport. The client sends local changes shortly after editing and otherwise refreshes about every 2.5 seconds. Presence is sent on cursor changes and periodically while active.

Only one synchronization request runs per client at a time. Pending document changes remain in memory and are merged again after a temporary network failure; retries are safe because Yjs updates are idempotent. Retry delays increase after failures. The browser pauses reads while its tab is hidden, and pauses after ten minutes without interaction. Returning to the tab or interacting reconnects it.

## Recover unsent changes

Unsent code edits are copied into browser storage on this device, scoped to your account and session. After reloading and opening an authorized session, **Unsent changes found on this device** offers **Review local changes**. Nothing is restored automatically.

The preview shows current shared code and your saved local code. **Restore and sync** merges the saved Yjs editing history with the latest document, retaining concurrent edits instead of replacing the entire document. Review the merged result before finishing. **Copy local code** and **Discard local copy** are also available. Closed sessions and viewers cannot restore into shared code, but can copy a recovery while they still have session access.

Each open workspace owns its own recovery record: another tab acknowledging its changes cannot clear yours. Acknowledged copies are removed; abandoned copies expire after seven days. Signing out or switching accounts clears the departing account’s copies. The text is stored locally, without separate encryption; use a trusted device.

Browser storage may be disabled, cleared or full. A warning appears if a copy cannot be saved; **Copy code** remains the fallback. Recovery covers code only, not an unsent chat composer or outcome summary. It is a convenience, not a replacement for source control or guaranteed offline storage. Chat text stays in the composer until a successful send; message retries reuse an operation key to prevent duplicates.

If access is revoked, sending stops. The UI keeps the already-visible local code available for copying, but the server will not provide new session content. Previously viewed content cannot be remotely erased from someone's browser or clipboard.

## Finish and save the outcome

The host chooses **Save & finish**, writes a summary, and confirms **Finish and save snapshot**. The client waits for pending changes to synchronize. The server checks the exact current document revision before freezing it; if a new change arrives, the host must review the latest state before closing.

A saved session retains its starting code, final collaborative document, summary, participant list and chat. It remains accessible only to invited accounts that still have source access. Closing stops code edits and chat messages. Saving a session does not change the post, accept an answer, resolve line feedback or submit a formal review verdict.

To share the result more widely, the host chooses **Preview result for the conversation**, reviews the summary/code and source audience, then confirms **Publish reply**. The result becomes one ordinary reply authored by the host. It uses the original conversation's audience; an outcome from a private conversation is not exported to a public destination. The original session and its chat remain invitation-only. Retrying publication returns the same reply rather than inserting another one.

All participants should understand that the host can publish the final code and summary back to the source conversation. Chat messages are not included in that publication. The host should check for secrets and unintended content before confirming.

## Bounds in the first release

| Resource             | Current limit                                                                       |
| -------------------- | ----------------------------------------------------------------------------------- |
| Code                 | 20,000 characters; server also bounds encoded Yjs history                           |
| Encoded update       | 128 KiB base64 field; retained encoded document 256 KiB                             |
| Participants         | 12 accounts per session, including the host                                         |
| Presence             | Up to 3 browser clients per account; recent presence expires after about 30 seconds |
| Hosted open sessions | 4 per account                                                                       |
| Session creation     | 8 per account per day                                                               |
| Chat                 | 2,000 characters per message; 500 retained messages per session                     |
| Chat sends           | 30 per account/session per minute                                                   |
| Session requests     | 120 per account/session per minute                                                  |
| Session lists        | Up to 20 recent, currently accessible sessions                                      |

These limits constrain resource use; they are not a guarantee that a free hosting plan can serve arbitrary concurrency. A large group, multiple active tabs or a long editing history can hit a limit. The UI backs off after request failures. If document history becomes full, save/copy the code and start a new session rather than silently dropping earlier updates. Older chat history loads in bounded batches of 50 messages.

The first release does not include voice/video, code execution, repository filesystem access, a full offline workspace, a session recording, or a full IDE. The npm CLI remains a separate client; interactive Live editing is currently available in the browser.

## Server preparation and recovery

Live uses additive tables with a separate `live_schema` marker. Production request startup checks readiness and returns 503 if preparation has not been performed; it never creates these tables on a hosted cold start.

The operator must first create an encrypted database/file backup and verify an isolated restore. Then run the explicitly selected migration:

```sh
node scripts/migrate.mjs --prepare-live
```

The repository backup workflow includes the **live** action and executes preparation only after backup, restoration verification and artifact upload succeed. The global schema version remains unchanged. A future Live schema version is refused rather than overwritten.

Backups retain collaborative document state, invitations, messages and outcomes. Ephemeral presence and authentication sessions are excluded. Restored accounts must sign in again. A code rollback can leave additive Live tables in place; do not remove them as an improvised rollback or reset production data.

## API and source map

All endpoints require the same signed-in identity as the forum. Session membership never replaces source authorization.

- `GET /api/live`: bounded recent session/invitation list.
- `GET /api/posts/:id/live`: accessible sessions for one conversation.
- `POST /api/posts/:id/live`: create with an operation key, title, language and starting code.
- `GET /api/live/:session`: initial document, members, recent presence and first message batch.
- `POST /api/live/:session/sync`: bounded Yjs update, revision, cursor heartbeat and message cursor; response includes current permissions.
- `PATCH /api/live/:session/members`: host-only exact-username invitation, role change or removal.
- `POST /api/live/:session/messages`: idempotent chat send.
- `POST /api/live/:session/close`: host-only outcome and exact document revision.
- `POST /api/live/:session/publish`: host-only explicit publication to the original conversation.

The implementation is in `live.mjs`, `src/live.jsx`, `src/live-editor.jsx`, `src/live-transport.mjs` and `src/live-launcher.jsx`. The regression suite drives concurrent API updates and a real two-account browser workflow. See [the source map](source-map.md), [Projects & Rooms](rooms.md), [participation rules](project-participation.md) and [security reporting](../SECURITY.md).
