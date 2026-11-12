# Changelog

## 1.4.0 — Extension developer tools and deliberate updates

- CLI 0.24 includes init/dev/pack: scaffold a source project, run a loopback-only SDK playground with live rebuilds and package it without cloning the forum or signing in.
- Share package/listing validation between the server, browser and CLI compiler; source inputs remain bounded and cannot escape the project or include secrets/dependencies.
- Add immutable release notes and version history, plus browser/CLI update comparisons with added/removed capabilities and changed source/style files. Every update requires explicit consent, preserves disabled state and rejects unrelated, stale, withdrawn or older targets.
- SDK 2 adds capability-gated commands with bounded Alt+Shift shortcuts, and top/inline panels. Inline panels retain their iframe while moving; shortcuts exclude editable fields and open dialogs.
- Installed panels are parked visually in the extension manager, keeping update controls accessible. Previews remain visible; disabling still stops code and clears commands/styles/layout.

## 1.3.0 — Extensions, from editor to discovery

- Publish built code packages from CLI 0.23 with a capability/file/listing preview and explicit confirmation. Publishing does not install or execute code.
- Find current extension releases in global search and open their exact cards; author profiles include published extensions with pagination and privacy checks.
- Replace placeholder hero code with a working panel/storage SDK example and fix inherited tile styling on code tokens.
- Add Focus Desk, a source-available focus timer and device-local notes starter, downloadable and previewable before publication.

## 1.2.2 — Keep your extension work

- Account-specific local drafts retain publication fields, package source and screenshot references across closing, preview and reload. Stop preview returns to the saved publisher, including after navigation.
- Saved packages never execute or restore consent automatically; successful publication and Discard draft clear the draft. Storage failures are surfaced before leaving preview setup.
- Shared forum popups (including Search and Notifications) accept scoped extension styling inside a protected modal layer; recovery controls remain separate.
- Added the four-file Popup Focus example and a beginner source/configuration/package walkthrough.
- Replacing a manual preview restarts its code even when packages reuse version or build identifiers.

## 1.2.1 — Extension publishing that explains itself

- Visible publication fields for name, version, short/Markdown descriptions, tags, resource links and uploaded screenshots. Immutable listing metadata follows its exact package version.
- Working downloadable examples and one-click example loading; clear rejection of unrelated JSON/source files.
- Screenshot ownership and access checks preserve private/unpublished uploads; public listing images stop being public when their version is withdrawn.
- Recovery controls only appear for active extensions or safe mode and stay away from the logo.
- Code-focused library introduction and screenshot previews replace the palette-centric presentation.

## 1.2.0 — Code extensions

- Local JavaScript/TypeScript development, live preview and `.devext.json` packaging replace the in-app palette builder.
- Isolated code runtime with explicit capabilities for shell styling/layout, panels, app views, bounded data reads, device-local storage and exact HTTPS service origins.
- Account-specific installs, source inspection, immutable versions, explicit permission grants and review withdrawal.
- Day/night changes preserve extensions; safe mode and recovery controls can disable broken packages.
- Studio Shell and Devi Companion examples; full SDK authoring and recovery documentation.
- Existing palette installs remain compatible. CLI stays at 0.22.0-alpha.1.

## 1.1.0 — Extensions: your space, your colors

- Add a browser theme library with four bundled palettes, community search/filtering, live previews, an authoring form and JSON import/export.
- Store installed exact versions and active appearance per account; reset on account changes, leave CLI/docs/landing independent and retain an explicit default fallback.
- Validate allowlisted JSON tokens, contrast and bounded publication/install quotas. No JavaScript, arbitrary CSS or external resources execute from a theme.
- Publish immutable versions without automatic upgrades or inherited review badges. Dedicated configured reviewers can approve/revoke/withdraw; authors can withdraw their own versions, with retained review history.
- Add additive, backup-first table preparation, encrypted restore coverage, browser/API isolation checks and a complete theme authoring guide. Global schema stays 7; CLI stays 0.22.0-alpha.1.

## 1.0.0 — From conversation to contribution

- Bring the browser/API milestones 0.2–0.10.1 together in the first V1 release: Workspaces, snapshot-based Review Flow, Rooms, Contributions, GitHub App workspace, My Work, project participation controls and searchable documentation.
- Feature the new launch film across the landing, public pages and documentation; refresh README version badges and release navigation.
- Browser/API is now 1.0.0. The terminal package remains separately versioned at 0.22.0-alpha.1; no npm publication, new permissions or database migrations in this release.
- Existing accounts, projects, conversations and data remain in place. The project stays in active development.

## Browser & API 0.10.1 — Documentation reading experience

- Rebuild documentation with plum/violet and pink accents, larger Inter typography, light/dark themes saved independently from the app, and a full-width layout with collapsible navigation.
- Add a keyboard-search dialog with ranked section links, highlighted contextual matches and guide numbering; support Cmd/Ctrl+K, arrows, Enter and Escape.
- Add semantic callouts, glossary tips, labeled code blocks, copy feedback, Markdown export, contextual screenshots and distinct interactive system, task, access and revision illustrations. Add a documentation home with three entry paths and a complete resources footer; existing guides remain available under /docs/:slug.
- Highlight search terms at their destination and scroll to the matching section. Animate sidebar layout changes and the table-of-contents indicator, respecting reduced motion.
- Capture current project overview, Room, illustrative GitHub workspace and CLI Room on disposable demo accounts; add a selectable landing gallery and updated documentation figures.


## Browser & API 0.10.0 — Developer documentation and contributor credits

- Publish 25 searchable, server-rendered documentation guides at `/docs`, with source-aware links, section navigation, code copying, mobile navigation and sitemap metadata. Load the documentation code separately from the forum.
- Add paginated Contributors to project overview, Room and introduction. Attribute visible conversations, discussion, reviews, assignments and results without publishing approval lists or private-work identities.
- Resolve profile photos by user ID across shared avatar surfaces; retain initials when a photo is absent or fails.
- No database migrations, permission changes or CLI package release.


## Browser & API 0.9.0 / CLI 0.22.0-alpha.1 — Project participation

- Separate project visibility from Open / Approved contributors. Choose the mode atomically during creation; owners manage a bounded username list with captured versions and explicit preview. Team credits remain independent.
- Enforce observer read-only access across tasks, related conversations, results and GitHub work changes; keep personal saves/follows, reports and own-content removal available. Approval never grants community membership.
- Release non-approved assignments transactionally on revocation while retaining published work and history. Add optional database barriers and explicit backup-first preparation, encrypted restore and legacy-writer checks.
- Expose browser, live terminal and script controls without new dependencies or provider scopes. Existing projects retain open participation.

## Browser & API 0.8.1 — GitHub workspace layout

- Separate connected-account identity, connection actions and account/repository selection into clear responsive surfaces.
- Hide pagination for a single page and label account/repository page controls separately. Clear old repositories on account switches and preserve the selected account on repeated clicks.
- Project participation permissions and CLI version remain unchanged.

## Browser & API 0.8.0 / CLI 0.21.0-alpha.1 — My work

- Bring named review invitations, current-revision requested changes, replies awaiting an answer and submitted task results into Next up. Keep assigned tasks and result history in separate bounded sections.
- Open the exact review request or task result, preserving the existing preview, confirmation and version checks. Project room and GitHub checks remain explicit actions.
- Continue local drafts and recently opened conversations; history stores only IDs/times, and the server rechecks access before returning titles. Browser history is account/device scoped; terminal history also follows the selected project directory.
- Keep GitHub reads outside the primary list, refresh terminal work on entry and retain local drafts when the recent-items API is unavailable. No new schema, dependencies or GitHub permissions.

## Browser & API 0.4.0 / CLI 0.17.0-alpha.1 — Rooms

- Add shared project task boards, claim/release/assignment and state changes with captured versions and existing private permissions.
- Add owner-pinned decisions, immutable edit history, archive/restore and scoped room activity combining task and Review Flow events.
- Add room commands and live terminal actions, previews and account-scoped drafts. Preserve pasted command/Enter input before rendering and reject command batches.
- Refresh project surfaces and status accents; color current and retained review code without changing text or line anchors.
- Recover one transient browser GET failure within the original deadline, respecting cancellation, cooldown and account changes; never retry writes.
- Add optional Rooms preparation, encrypted recovery, real browser/script/PTY, privacy and load checks.

## Browser & API 0.3.0 / CLI 0.16.0-alpha.1 — Review Flow

- Request a named reviewer and track Waiting / In review / Sent / History in the browser and CLI.
- Publish immutable Changes requested / No objections outcomes for the exact assigned snapshot; sharing a new revision never carries an earlier verdict forward.
- Link a newer revision to an earlier retained remark without implicitly resolving it; expose permission-scoped project review activity.
- Add optional additive preparation, bounded invitations/links, notification preferences and browser/API/terminal/recovery checks. Publication is tracked separately from this source version.

## Workspaces 0.2.0 / CLI 0.15.0-alpha.1

- Extend Projects with scoped work requests, explicit linking, Open/In progress/Ready workflow, search and pagination. Existing private community permissions remain authoritative.
- Retain immutable multi-file review revisions, original remark/code identity and exact comparisons. Old feedback, replies and resolution remain available as code evolves.
- Add explicit local directory/project binding, workspace navigation, revision history and selected file/Git diff publication in the CLI. Preview and confirmation gate writes; local manifests support multiple files.
- Preserve drafts through conflicts and persist creation intent before POST, preventing silent duplicates after a lost response, reload or interrupted terminal.
- Harden explicit migrations, prepared-schema readiness and future-version refusal. Rehearse encrypted database/file recovery and expand scoped load and browser/CLI regression checks.
- Schema v7 uses additive preparation while v6 stays active. No data reset, new GitHub permissions, private PR access or GitHub writeback.

## CLI 0.14.0-alpha.1 / Browser & API 0.1.10

- Add a paginated Review queue with Open requests and Awaiting you. Open involved, unresolved remark discussions at the latest visible reply; respect private access, removal, paused conversations and last visible authorship.
- Add current open/resolved and earlier-version totals, a separate version filter, and filtered target pagination for code feedback.
- Preserve review code position and selected remark during the terminal session, with bounded memory cleared on account reset and stale-code detection. Keep Inbox deep links and publication gates.
- Group CLI 0.11–0.14 and browser/API 0.1.7–0.1.10 in the combined GitHub release. No dependency/schema changes or GitHub write permissions.

## Browser & API 0.1.9

- Add file and hunk navigation for frozen PR review snapshots, with additions/removals and mobile layouts. Keep global published line numbers and existing snippet hashes.
- Return from current-version feedback to its file, code page and selected lines. Preserve outdated quotes without linking them into replacement code; fall back to the full snippet when metadata is inconsistent.
- Add cross-page navigation and feedback regression coverage. CLI remains 0.13.0-alpha.1; no schema, OAuth, dependency or GitHub write changes.

## CLI 0.13.0-alpha.1

- Add My work with paginated Mine, Reviews, Saved and Following sections plus Inbox/local draft shortcuts. Reuse existing account/private visibility rules; add the script `work` command.
- Add optional Halloween theme, orange accent, ASCII ornaments and pumpkin mascot. Preserve local preview/cancel/save, reduced motion, hiding and standard themes; add no seasonal requests or decorative timers.
- Verify contrast, private scopes, terminal navigation, compact layouts and disabling the theme. Browser/API stays 0.1.8; no schema or dependency changes.

## CLI 0.12.0-alpha.1

- Add read-only `doctor` checks with offline/JSON modes, bounded health/session requests and recovery instructions. Never expose tokens/account data, forward credentials to a host override, repair files or repeat writes.
- Add a selectable getting-started guide (`/start`, `tui --start`, new terminal sign-in), live `/doctor` panel and pre-login D diagnostics; adapt to compact terminals and restore the previous view.
- Improve shell error guidance and prevent malformed credential JSON from leaking through parser messages. Browser/API stays 0.1.8; no schema, dependency or GitHub scope changes.

## CLI 0.11.0-alpha.1 / Browser & API 0.1.8

- Update the server’s locked `body-parser` dependency to 2.4.0, which fixes GHSA-27r3-jxmh-p828 (compressed-body denial of service).
- Collect selected complete hunks from up to 10 files of one public GitHub PR into one code review, bounded to 20,000 characters. Mixed revisions and duplicate files are rejected; selected ranges can be replaced or removed before preview.
- Preserve frozen multi-file drafts and exact published line ranges; navigate files with `{` / `}` in terminal reviews. Add command manifests with `github review --selections`.
- Validate and display the additive file map in browser/API and public conversation documents. Existing single-file reviews, comments, permissions and database schema stay compatible.

## 0.1.7 — Public conversation documents

- Added `/conversation/:id/:slug` with server-rendered public text, Markdown, code, source context, attachments and bounded root-reply pages. Original app routes remain supported; sharing and card links use public URLs where permitted.
- Added inline browser sign-in/replies and a validated, same-tab OAuth return to the chosen conversation, including permanent-username completion. Authentication recovery can retain an account-scoped reply for 15 minutes in session storage.
- Public projections ignore session identity and exclude private/removed posts, deleted reply text, account credentials and arbitrary entity metadata. Unavailable documents return a neutral noindex 404; failures return a retryable 503. Content is not cached across requests.
- Added canonical/social metadata, a local PNG preview, public-only structured data and a dynamic sitemap index with 500 conversations per file. Only current public records enter sitemaps; preview deployments remain noindex.
- Build browser and server rendering artifacts without database reads; Vercel and standalone hosting share document routes. Added API/access/XSS/sitemap and real browser/no-JavaScript/auth/responsive regression checks.
- Browser/API version is 0.1.7; CLI remains 0.10.0-alpha.1. No database migration or production reset.

## 2026-10-30 — Combined CLI alpha and public website update

[Release notes](docs/releases/cli-0.10.0-alpha.1.md) · [GitHub release](https://github.com/Tenyokj/devdevian/releases/tag/cli-v0.10.0-alpha.1)

This combined release collects CLI 0.7.0-alpha.1 through 0.10.0-alpha.1 and the website changes below. Browser/API remains 0.1.6. Individual npm milestones retain their own entries.

### Public guides and website refresh

- Added prerendered `/updates` and `/faq` pages, with separate Browser/CLI milestones, searchable categorized answers, stable deep links, keyboard-friendly animated disclosures and reduced-motion support.
- Connected landing, forum and policy navigation; added canonical/social metadata and sitemap entries without reading account data.
- Linked the launch film and added contributor source navigation, frontend/test guides and public-page maintenance instructions. Browser/API and CLI package versions are unchanged.

- Joined navigation and hero on a shared brighter gradient and blended the hero edge into the blurred photograph backdrop.

- Brightened the logo hero with layered indigo/blue light and added a responsive rectangular footer directory below the existing invitation and brand. Keyboard focus and reduced motion remain supported.

- Added npm to the technology ribbon with a local brand mark and CLI package link.
- Centered public conversation count in a glowing Doto display, with brief copy, pausable orbit effects and visibility/reduced-motion handling. Existing public-only cached counting stays unchanged.
- Added a bounded blurred photograph/glass backdrop below the hero, plus short event-driven forum page/card feedback. No new API requests, animation framework or database change.

## CLI 0.10.0-alpha.1 — PR diffs and selected reviews

- Browse public PR files, inspect complete diff hunks and select a contiguous range into an editable code-review draft with preview/confirmation.
- New public `github diff` and authenticated `github review` commands, frozen snapshot drafts, and shared browser/terminal head/base/hunk provenance.
- Fresh commit checks during reads; bounded complete-patch parsing, unavailable/binary/truncated handling and compact terminal rendering. No GitHub writes, new OAuth scopes, dependencies or database migration.

## CLI 0.9.0-alpha.1 — Public GitHub PR reading

- Inspect a linked or explicitly entered public PR in the terminal: status, author, branches, description and paginated changed files.
- GET-only direct GitHub reads without credentials or forum mutations; bounded short cache, request limits and quota cooldown.
- Script/JSON command supports public reads without a forum login. No database migration, private PR authorization or comment synchronization.

## CLI 0.8.0-alpha.1 — GitHub source context

- Opt-in local GitHub repository/branch/base-commit context for selected review files and diffs; optional matching PR URL, explicit preview and preserved drafts.
- Shared terminal/script/browser display with local-versus-commit clarification and responsive source cards.
- Bounded server validation and existing permission scopes; preserve post details during edits. No schema migration or additional OAuth setup. See [GitHub context](docs/github-context.md) for limits.

## CLI 0.7.2-alpha.1 — Links and multiline visibility

- Show Demo/Repository URLs in conversation details and publication previews, alongside labeled links without duplicate destinations.
- Give forms the inactive command bar’s space, follow the multiline caret and show the current logical line/count.
- Terminal/API checks cover real saved links and visible multiline edits at 60×18. No API/schema migration.

## CLI 0.7.1-alpha.1 — Clear form navigation

- Visible keyboard Back/Next/Preview controls, field-specific input guidance and compact-terminal hints.
- Clear project-link instructions and explicit distinction between local autosave, preview and publication.
- Project spaces/newlines/links, step controls, preserved selections and compact multiline editing verified in real terminal/API regressions. No API/schema migration.

## CLI 0.7.0-alpha.1 — Everyday terminal flow

- Searchable quick actions with scoped operations, navigation, creation, recent views and explicit search/open choices.
- Focused steps for conversations, Projects and Events; per-step validation, preserved drafts/selections and full publication preview.
- Session reading positions, full-text line search, Home/End controls and clearer reply-thread context.
- Verified in real terminal sessions and against an isolated shared browser API. No API/schema migration or new dependency.

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

## 0.1.6 — Devdevian CLI Alpha support (included in combined CLI Alpha releases)

- Official standalone `@tenyokjs/devdevian-cli` alpha package with a live alternate-screen workspace and explicit commands for inbox, feeds/search, questions, conversation replies, file-based code review, line remarks, feedback threads/status and community discovery.
- Browser-approved terminal login with expiring, one-use device requests. Separate 30-day Bearer credentials are hashed at rest, bound to the approving account and revocable in Settings or from the CLI. Password recovery revokes active sessions; approvals predating a password change cannot mint a new session.
- CLI uses the same API, quotas, community membership and moderation rules as the web client. Selected content is previewed before publishing; noninteractive publication requires explicit `--yes`. Redirects are rejected and remote terminal control sequences are stripped from human output.
- CLI credentials and pending authorizations are excluded from backups. Schema v6 preparation keeps the current deployment available.

## 0.1.5 — Feedback discussions (included in combined CLI Alpha releases)

- Paginated reply threads on line feedback, with author-only editing and revision-checked deletion. Deletion preserves other members’ replies through tombstones.
- In-app notifications for feedback replies and resolved/reopened remarks, with links to the exact paginated feedback thread. Existing reply/solution notification preferences apply.
- Targeted reports on individual remarks/replies, separate scoped moderation queues, reversible post restrictions left unchanged, and audited decisions that can remove only the reported feedback.
- Additive schema v5 preparation preserves v0.1.4 availability during deployment.

## 0.1.4 — Focused code feedback (included in combined CLI Alpha releases)

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
