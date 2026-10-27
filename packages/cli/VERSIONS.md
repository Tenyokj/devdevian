# Devdevian CLI version history

The CLI is a separately versioned Devdevian client. Its npm version does not have to match the web app or API version. All versions below use the same hosted account and permission model.

Every published npm artifact has a unique immutable version. We record each version here, even when several ship in one working session. A GitHub release can summarize a day's work and link to the individual entries; it does not need to be created for every npm publication. An unfinished change stays under **Unreleased** until its package version is assigned. Alpha packages use the `alpha` npm tag.

## Current milestone

**0.6.0 brings Projects and Events into the terminal**, using the same hosted data and permissions as the browser.

## 0.6.1-alpha.1 — A clearer first impression

- Added a large terminal wordmark and selective blue/violet accents to `--help`. Compact terminals, `NO_COLOR`, redirected output and JSON help remain readable without ANSI decoration.
- Help now points to the interactive Projects/Events commands and actions. CLI documentation includes real terminal captures and install/login/workspace guidance.
- The website introduces the CLI near the top, with keyboard-accessible screenshot tabs, copyable install/review commands and GitHub documentation links. A cached public-only activity counter updates while visible and respects reduced motion.
- No schema migration, account/credential change or production-data reset. The CLI package and web/API keep independent versions.

## 0.6.0-alpha.1 — Projects and Events

- Added paginated catalogs, text search and filter forms. Projects filter by topic, stage, owner and order; Events by topic, calendar date with viewer timezone, upcoming/past, participation and order.
- Project detail pages include requested feedback, technologies, links and team roles, with access to the existing conversation. Create/edit forms support logos and screenshots through the workspace image picker.
- Event details show viewer and organizer times. Create/edit events with a banner, join/leave with confirmation, export a new workspace `.ics` file, and cancel/restore owned events. Meeting URLs follow server access rules.
- Publication previews happen before uploads. Local drafts retain successful upload IDs; uncertain publication results are not automatically replayed. Existing image/storage quotas and workspace path protections apply.
- Added authenticated API project editing with revision checks and atomic showcase/metadata updates, detail reads and idempotent desired-state event attendance. No schema migration or production-data reset. Deploy the compatible API before using the new terminal workflows.
- Regression coverage includes browser/CLI shared data, ownership and stale edits, image validation, meeting-link privacy, cancelled-event participation, safe calendar export, interrupted publication handling, and terminal navigation/forms/media selection at desktop and compact sizes.

## 0.5.1-alpha.1 — Meet Devi

- Added a terminal-native ASCII mascot based on the ghost/laptop/orbit logo, with full and compact drawings and English greetings: “Devi missed you.” and “Devi saved you a seat.”
- Startup follows the actual session check and first page request, with no minimum duration or artificial progress. Connection errors stop the loading state and offer an existing-session retry.
- Supported empty sections show a still Devi and a contextual next step. Sign-in codes, addresses and controls take priority on small screens.
- Subtle motion blinks only during active startup or browser approval; Reduced motion is static. Appearance includes a persistent welcome on/off option, also available to offline commands and session-only launch flags.
- Script/JSON commands remain banner-free. No additional image dependency, API change, schema migration or production-data change. Existing preferences default the new setting to on.
- Checked delayed/failing startup, retry, animation/static/off modes, English captions, first-page handoff, empty Inbox, script output and 60×18 device approval in unit and pseudo-terminal regressions.

## 0.5.0-alpha.1 — Make the terminal yours

**Changes**

- Appearance workspace with immediate whole-interface previews, a sample panel on wide terminals and explicit save/cancel/default controls. Open it with `/appearance`, navigation or **,**.
- Midnight, Nebula, Daylight and Contrast themes, with blue/violet/cyan/rose accents shared by navigation, Markdown, code review, forms and the local file/Git picker.
- Comfortable/compact list density, automatic/hidden navigation, automatic/stacked review panels, rounded/straight frames and reduced loading motion. Compact layouts remain keyboard-accessible.
- Atomic, validated local preference storage, independent of account credentials and production data. Invalid configuration falls back visibly without overwriting the file.
- Offline `devdevian appearance` commands and temporary `tui`/`open` appearance flags. Theme text and selection contrast are checked across all preset/accent combinations.
- Rapid option-arrow changes no longer overwrite each other when input events are batched. Small terminal forms retain the active option in the viewport.

**Compatibility and checks**

No API/schema changes. Existing credentials and local drafts remain compatible; missing preferences use Midnight defaults. Regression checks cover save/restart, preview cancellation, reset, corrupt files, credential isolation, palette contrast, compact lists, hidden navigation, stacked reviews and 60×18 resizing in a real pseudo-terminal. Preferences apply to the local CLI installation, across its accounts and projects.

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
