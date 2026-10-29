# Devdevian CLI version history

The CLI is a separately versioned Devdevian client. Its npm version does not have to match the web app or API version. All versions below use the same hosted account and permission model.

Every published npm artifact has a unique immutable version. We record each version here, even when several ship in one working session. A GitHub release can summarize a day's work and link to the individual entries; it does not need to be created for every npm publication. An unfinished change stays under **Unreleased** until its package version is assigned. Alpha packages use the `alpha` npm tag.

## Current milestone

**0.10.0 adds PR diffs and selected-hunk code reviews** to public PR reading.

## 0.10.0-alpha.1 — PR diffs into human code review

- Select changed files, inspect colored complete hunks with old/new line numbers, pan long lines and choose a contiguous hunk range. Create an editable review draft with explicit preview/confirmation; browser and CLI display base/head snapshot provenance.
- `github diff` supports public reads without login; `github review --file ... --hunks START:END` publishes through the existing Devdevian account and permissions. Snapshot drafts restore without disk/GitHub re-reads.
- Fresh summary/files/summary reads detect base/head changes during loading. Reject unavailable/binary, oversized, truncated, unsafe-control patches and oversized selections. Existing fixed-host GET-only requests, quotas and timeout limits remain; no GitHub writes, new OAuth permissions, dependencies or schema migration.
- Unit, API, command, real terminal and browser checks cover selection, provenance, publication gates, drafts, compact layouts and existing permissions.

## 0.9.0-alpha.1 — Read public pull requests

- Public PR reader via `/pr URL`, navigation, scoped linked-PR actions and `devdevian github pr URL [--page N] [--json]`. Shows status, author, branches, commit, description and 20 changed files per page; explicit refresh and return preserve forum navigation.
- Fixed-host, GET-only GitHub REST reads without credentials, new OAuth permissions or forum writes. Bounded 60-second memory cache, response/time limits, rate-limit cooldown and actionable private/missing/redirect/response errors; no background GitHub polling.
- The command works without a Devdevian login; TUI uses the existing forum session. No private PR support, full patch import, GitHub comments or database changes. GitHub's file-list cap is labeled.
- Fixture and real terminal tests cover JSON output, linked-PR opening, file pagination, refresh/cache, compact layout, return position and absence of writes or credential forwarding. A small public GitHub smoke read also passed.

## 0.8.0-alpha.1 — GitHub source context

- Optional GitHub step for code reviews: explicitly include local origin, branch/detached HEAD, base commit, repository-relative path and source type; add a matching PR URL when useful. Preview and account/project-scoped drafts preserve the choice. Command clients use `--github-context` and optional `--pr`.
- Terminal overviews, script output and responsive browser cards share the same context. Base-commit links distinguish local working code/diffs from committed content. Metadata is author-provided; this stage does not synchronize PR content or verify ownership/status.
- Local read-only Git commands only, canonical GitHub origins without embedded credentials, bounded server validation and existing private/owner permission checks. Other post details survive edits; no schema migration or new OAuth permission is required.
- Regression coverage exercises real Git repositories, nested project roots, detached HEAD, staged patches, rejected origins/PRs, command/API/browser sharing, private reads, draft restoration and compact/mobile layouts.

## 0.7.2-alpha.1 — Visible links and multiline writing

- Conversation overviews now include Demo and Repository URL fields alongside labeled links. Duplicate URLs appear once, preserving a supplied label; publication previews show the same destinations.
- Multiline editing follows the caret and displays the logical line position/count. Enter retains the preceding visible line when space permits. While editing, the inactive command bar yields its rows to the form, including at 60×18.
- Real terminal/API regressions cover saved Demo URLs together with labeled links, newline visibility, cursor movement and editing in compact terminals. No API/schema or credential changes.

## 0.7.1-alpha.1 — Clearer forms

- Added visible, keyboard-focusable Back / Next controls to staged forms. Tab reaches the controls at step boundaries, arrows choose an available action and Enter activates it. The final action is Preview; publication remains a separate confirmation. Ctrl+N/P shortcuts remain available.
- Pinned input guidance distinguishes Space, multiline Enter, field navigation and image/code pickers. Project help explicitly points to the dedicated People & links step. Compact layouts prioritize the caret and keep guidance in status/hint lines.
- Clarified additional-link syntax, preview versus autosaved drafts, and optional URL fields. Opening a new form clears stale success notices.
- Regression coverage publishes a project through the real terminal and isolated API, checks text spaces/newlines and multiple labeled links from a second account, exercises Back/Next/Preview, preserves Git/image selections and checks multiline editing at 60×18.
- No API/schema change, new dependency or production-data reset. Per-version history is recorded here; no separate GitHub release is required for this patch.

## 0.7.0-alpha.1 — Everyday flow

- Added a searchable quick-action workspace via `Ctrl+K` or `/actions`: scoped actions, navigation, creation, up to eight recent views, explicit ID opening and a regular forum-search fallback. Typing performs no requests or mutations; existing server permissions and confirmation dialogs still apply.
- Conversation, Project and Event forms show one step at a time. `Ctrl+N` validates the current step and advances; `Ctrl+P` goes back. `Tab` continues to traverse fields across steps. `Ctrl+S` validates the complete form and opens the existing explicit publication preview. All draft values and file selections survive step changes.
- Full reply/remark reading remembers positions within the current terminal session, restores the underlying view on close, and offers literal rendered-line search (`/`, `n`/`N`) plus Home/End and line-position indicators. Thread headings identify the parent reply and conversation. Reading memory is bounded and cleared on account reset.
- Quick actions pause live reads while open. Text editing retains `Ctrl+K` for deleting to the end of the line. Compact terminal layout, themes, external editor and draft workflows remain supported.
- No API/schema change, production-data reset or new dependency. Real pseudo-terminal checks cover staged publication into an isolated API visible to another browser account, reader search/return, scoped actions, and 60×18 navigation.

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
