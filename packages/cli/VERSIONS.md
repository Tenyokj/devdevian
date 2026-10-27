# Devdevian CLI version history

The CLI is a separately versioned Devdevian client. Its npm version does not have to match the web app or API version. All versions below use the same hosted account and permission model.

Every published npm artifact has a unique immutable version. We record each version here, even when several ship in one working session. A GitHub release can summarize a day's work and link to the individual entries; it does not need to be created for every npm publication. An unfinished change stays under **Unreleased** until its package version is assigned. Alpha packages use the `alpha` npm tag.

## Roadmap

- **0.5.0 — Themes and interface customization:** visual presets, appearance preferences and layout customization. Planned, not shipped; exact settings will be agreed before implementation.
- Projects and Events parity is deferred; it is not the 0.5.0 milestone.

## 0.4.1-alpha.1 — Everyday writing and navigation

**Changes**

- `Ctrl+E` edits a multiline form field using `VISUAL`, then `EDITOR`, then the platform default. Ink temporarily hands over the terminal and restores it afterward. Original and returned text are saved locally before publication; failed, oversized or invalid editor output preserves the original form.
- Notifications link to the exact ordinary reply, including nested replies on later pages. Back navigation restores the selected item by ID and retains reading/review position where content still exists.
- Conversation bodies and full-text replies render headings, lists, quotes, bold text, inline code, visible link destinations and fenced code with basic lexical highlighting. HTML is displayed as text; terminal control sequences are removed. This is a lightweight renderer, not full CommonMark.
- HTTP status is preserved for non-JSON failures. Connection, timeout, permission, missing-content, rate-limit and server failures suggest a concrete next action. Session expiry during writing keeps the form; `Ctrl+L` saves the draft and returns to connection setup.

**Compatibility and checks**

No API/schema migration. Existing browser and CLI credentials remain compatible. Regression coverage includes real pseudo-terminal editor handoff/restoration, reply deep links, permission/error states and text rendering. Desktop editor behavior still depends on the configured editor; GUI editors such as VS Code need a wait flag (`code --wait`).

## 0.4.0-alpha.1 — Review workspace and live Inbox

- Side-by-side code and remarks on wide terminals; `W` focus switching on compact layouts. Select a line range and press `C` to comment; `F` filters all/open/resolved remarks. Markers describe the current page. Old remarks display their saved quote.
- `X` context menu for available edits, deletion, reports, resolving remarks and accepted solutions. Destructive/solution actions require confirmation and server permission checks.
- Unread counter and serial live polling: 45 seconds active, three minutes idle, failure backoff and pause controls. Active forms and selected items are preserved.
- Shared blue/purple styling, rounded frames, clearer tabs, cards and project identity. No API/schema migration.

## 0.3.1-alpha.1 — Reply deletion

- `D/d` deletes the author's ordinary reply, including full-text and parent-reply views, with confirmation and revision checks.
- API tombstones remove text and attachments from access, preserve descendant replies and clear the deleted reply's solution mark. Deleted replies cannot be edited or accepted again. Existing metadata storage is used; no schema migration.

## 0.3.0-alpha.1 — Project files, Git diffs and drafts

- Root-relative file explorer, filename filtering, code preview and line-range selection. Sensitive paths, ignored files, nested symlinks and outside-root traversal are excluded.
- Read-only staged/unstaged Git diff selection, including individual hunks. No staging, commits or project helper execution. Changed source requires reselection before publication.
- Scoped local autosaved drafts, restore/delete controls and bounded retention. Snippet source is reread at preview time; selected source files are not copied into draft storage.

## 0.2.0-alpha.1 — Live terminal workspace

- Replaced the numbered scrolling menu with an alternate-screen interface, responsive navigation, forms, previews and search.
- Paginated conversations, replies, code-feedback threads, edit/delete/report actions and connected-terminal controls.
- `devdevian tui` runs in the current terminal; `devdevian open` launches a supported desktop terminal. Unicode editing, cancellable reads, bounded caching and terminal restoration checks.

## 0.1.0-alpha.1 — First terminal client

- Browser-approved terminal authentication with scoped, expiring, revocable CLI credentials.
- Command-based feed, Inbox, search, questions, replies, file-based reviews, line remarks and community discovery using the existing Devdevian API.
- Explicit publication confirmation, JSON output for scripts, local private credential storage and terminal-output sanitization.

## Preparing a combined GitHub release

Choose a product release title and list the exact npm versions it includes. Summarize user-visible changes, installation, compatibility and known limitations; link to the relevant headings in this file. Do not rename or republish existing npm artifacts, and do not imply that a planned milestone has shipped. GitHub releases are created when the maintainer decides to close the session or milestone.
