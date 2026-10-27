# Changelog

## CLI 0.6.1-alpha.1 — Terminal-first introduction

- Large, selectively colored terminal help with plain/narrow/NO_COLOR fallbacks and Projects/Events workspace hints.
- Early landing section for the CLI, actual terminal captures, copyable commands and GitHub guide links; code-review card now demonstrates the terminal workflow.
- Animated public-conversation count with bounded server/CDN caching, visible-only refreshes and reduced-motion support. Private and removed conversations are excluded.
- Updated product and CLI documentation; reproducible screenshot capture uses disposable local data.

## CLI 0.6.0-alpha.1 — Projects and Events

- Interactive catalogs, search, filters, pagination and full detail pages for Projects and Events.
- Create/edit owned projects and events with workspace images, project teams/links, explicit publication previews and local drafts.
- Event attendance, organizer cancellation/restoration and safe calendar export. Viewer/organizer timezone display and server-controlled meeting links.
- Compatible API detail routes, revision-protected project edits and idempotent attendance. No database migration or reset. See [CLI version history](packages/cli/VERSIONS.md).

## CLI 0.5.1-alpha.1 — Meet Devi

- Terminal-native Devi mascot with English startup/sign-in greetings, compact artwork and useful empty-state prompts.
- Real session/page loading, blink animation with Reduced motion support, local welcome toggle and credential-preserving retry after connection errors.
- Authentication instructions retain priority on small screens. Script/JSON output remains banner-free; no API/schema change.

## CLI 0.5.0-alpha.1 — Themes and interface customization

- Added a live Appearance workspace, four themes, four accents and explicit local save/cancel/reset controls.
- Configurable list density, navigation, review panels, frame style and reduced loading motion; one palette covers the workspace, text/code rendering and file picker.
- Validated atomic preferences, offline appearance commands and session-only launch overrides. Credentials, local drafts and the production schema remain unchanged.
- Fixed batched option navigation and small-terminal active-field visibility. See [CLI version history](packages/cli/VERSIONS.md) for controls and compatibility.

## CLI 0.4.1-alpha.1 — Everyday writing and navigation

- External-editor handoff for multiline fields, with private local drafts and terminal restoration.
- Exact reply notification targets, stable back navigation, lightweight Markdown and basic fenced-code highlighting.
- Actionable connection/HTTP errors and draft-preserving reconnect controls.
- Added [CLI version history](packages/cli/VERSIONS.md), separating per-package changes from combined GitHub releases. Planned CLI 0.5.0 covers themes and interface customization.

## CLI 0.4.0-alpha.1 — Review workspace and live Inbox

- Code and paginated remarks side by side, compact focus switching, selectable line ranges, horizontal code scrolling and all/open/resolved filters. Older remarks display the preserved quote.
- Context actions respect authorship: edit/delete, resolve/reopen, reports and accepted solutions with confirmation. Existing API validation remains authoritative.
- Unread count and serial live reads with idle slowdown, failure backoff, cancellation and pause controls; background updates preserve selection and protect active forms.
- Refined shared blue/purple styling, quieter rounded panels, selected tabs, separated conversation cards, project identity and clearer keyboard hints.
- Uses existing API and schema; no database migration or production data reset.

## CLI 0.3.1-alpha.1 — Ordinary reply deletion

- Fixed D/d deletion for ordinary replies, including full-text reading and parent replies inside nested threads. Confirmation, author ownership and revision checks apply.
- Added a compatible API operation that erases reply text, preserves the discussion tree, hides attached files and clears an accepted-solution mark when needed. Deleted replies cannot be edited or accepted again.
- Reply tombstones use existing entity metadata; no schema migration is required. Browser rendering no longer offers editing/solution controls for deleted replies.

## CLI 0.3.0-alpha.1 — Project workspace reviews

- Project-root file explorer in review forms (`Ctrl+O`), with folder navigation, name filtering, hidden-file toggle, responsive code previews and line-range selection. `--project` selects the workspace for `tui` and `open`.
- Read-only Git selection (`Ctrl+G`): staged/unstaged changes, full-file patches or individual hunks, explicit publication previews and changed-selection detection. Git helpers do not run project diff/textconv/fsmonitor commands.
- Local autosaved drafts, isolated by server/account/project, with restore/delete controls, private file permissions, bounded retention and removal after successful publication. Source content is reread rather than copied into drafts.
- Tests cover terminal file/hunk selection, restart/restore/publication, narrow layouts, Git staging separation, ignored/secret paths, symlinks and local draft isolation. No browser API/schema changes.

## CLI 0.2.0-alpha.1 — Live terminal workspace

- Replaced the scrolling numbered menu with a responsive blue/purple workspace, arrow navigation, command/search bar, conversation tabs and paginated lists.
- Added inline publication/reply forms, explicit previews, draft-discard confirmation, full-text reading, feedback editing/deletion/reporting and connected-terminal controls.
- Added `devdevian open` for a separate supported desktop terminal; `devdevian tui` and the default command run in the current terminal. Existing script commands and JSON output remain supported.
- Added cancellable reads, a bounded short-lived page cache, Unicode-aware input and PTY-based resize/publication/terminal-restoration checks. Browser and API versions remain unchanged.

## 0.1.6 — Devdevian CLI Alpha support (unreleased)

- Official standalone `@tenyokjs/devdevian-cli` alpha package with a live alternate-screen workspace and explicit commands for inbox, feeds/search, questions, conversation replies, file-based code review, line remarks, feedback threads/status and community discovery.
- Browser-approved terminal login with expiring, one-use device requests. Separate 30-day Bearer credentials are hashed at rest, bound to the approving account and revocable in Settings or from the CLI. Password recovery revokes active sessions; approvals predating a password change cannot mint a new session.
- CLI uses the same API, quotas, community membership and moderation rules as the web client. Selected content is previewed before publishing; noninteractive publication requires explicit `--yes`. Redirects are rejected and remote terminal control sequences are stripped from human output.
- CLI credentials and pending authorizations are excluded from backups. Schema v6 preparation keeps the current deployment available.

## 0.1.5 — Feedback discussions (unreleased)

- Paginated reply threads on line feedback, with author-only editing and revision-checked deletion. Deletion preserves other members’ replies through tombstones.
- In-app notifications for feedback replies and resolved/reopened remarks, with links to the exact paginated feedback thread. Existing reply/solution notification preferences apply.
- Targeted reports on individual remarks/replies, separate scoped moderation queues, reversible post restrictions left unchanged, and audited decisions that can remove only the reported feedback.
- Additive schema v5 preparation preserves v0.1.4 availability during deployment.

## 0.1.4 — Focused code feedback (unreleased)

- Optional Question and Code review outlines that preserve existing draft text.
- Feedback on a line or range of up to 50 lines in a published code snippet, with pagination and status/version filters.
- Publication authors can resolve or reopen individual remarks independently of accepted solutions. Concurrent status updates are checked by revision.
- Snippet fingerprints and preserved excerpts prevent feedback from silently moving to different lines after edits. Earlier remarks remain readable when a snippet is removed.
- Private-community access checks, paused-conversation enforcement, bounded posting limits, and in-app notifications to the publication author.
- Additive schema preparation supports deployment without resetting user data or running migrations during requests.

## 0.1.3 — Following and mentions (2026-10-24)

- A Following feed combining public topic follows and individually followed conversations, with access checks, recent-activity ordering, search, type/topic filters and pagination.
- Searchable, paginated subscription management with separate topic/conversation filters and removal of unavailable subscriptions without disclosing private titles.
- In-app mentions in conversation and reply bodies, including newly added mentions in edits. Markdown code, links, images and HTML do not send pings; self-mentions, muted recipients and inaccessible community content are excluded. Notifications are bounded to ten distinct handles in each body and deduplicated with existing reply/topic alerts.
- Minute-precision timestamps with explicit viewer timezones across publications, replies, notifications, moderation and project updates; a compact app footer links the running version, source repository, issue reporting and policies.
- Linked replies are focused, highlighted and revealed across nested pagination, with reduced-motion support, per-reply permalinks and a clear fallback for missing replies.
- API and responsive browser regression coverage for subscription isolation, revoked access, mention preferences, duplicate suppression and deeply nested notification targets. No schema upgrade is required from v0.1.2.

## 0.1.2 — Drafts and subscriptions (included in v0.1.3)

- Account-separated browser drafts for conversations with autosaved text, code, selected labels, audience and links; close/reload restoration, discard and publication cleanup. Attachments must be added again.
- Explicit topic and conversation follows, independent from bookmarks, with in-app notifications, preference controls, idempotent subscription writes and bounded subscriptions.
- Topic alerts cover public conversations only; private reply alerts and notification history remain gated by current membership. Notification fan-out uses one database statement.
- Needs help keeps unresolved questions and code reviews visible even after replies, and removes accepted, archived and locked conversations.
- Regression coverage for follows, unfollows, settings, account separation, private-access loss and browser draft restoration.

## 0.1.1 — Reliability and recovery (2026-10-23)

- Mailbox-confirmed password recovery with hashed expiring codes, bounded attempts and revocation of saved sessions.
- Explicit hosted schema migrations, reusable API initialization, database-region alignment and readable dependency failures with request references.
- Active-screen loading, request deduplication, debounced list search and batched card metadata/attachment reads; password hashing runs outside the request event loop.
- Persistent auth/mail budgets and atomic upload reservations with file-count, byte and total-storage caps.
- Encrypted database/file backups with isolated restore verification, scheduled backup/health workflows, expiration cleanup and dependency update configuration. Production activation requires maintainer secrets and checks.
- Regression coverage for recovery, encrypted restoration, quota enforcement, startup failures, responsive recovery UI and isolated concurrent read workloads.

## 0.1.0 — Early release (2026-10-17)

- Public developer conversations, nested replies, accepted answers, topics, technologies, attachments, votes, and bookmarks.
- Owner-approved private communities with validators, scoped reports, and moderation history.
- Projects with screenshots and teams; timezone-aware events and attendee reminders.
- Permanent usernames, configurable profiles, notifications, account switching, and account deletion.
- Google/GitHub OAuth, email-code registration, and confirmation when connecting a new provider to an existing account.
- Vercel deployment with Turso/libSQL, private S3-compatible uploads, and Brevo email support.
- Responsive light/dark forum, a fixed-dark product landing, and product documentation.

The project is in active development. This version label does not imply an independent security audit or a guaranteed service level.
