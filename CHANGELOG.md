# Changelog

## 0.1.3 — Following and mentions (unreleased)

- A Following feed combining public topic follows and individually followed conversations, with access checks, recent-activity ordering, search, type/topic filters and pagination.
- Searchable, paginated subscription management with separate topic/conversation filters and removal of unavailable subscriptions without disclosing private titles.
- In-app mentions in conversation and reply bodies, including newly added mentions in edits. Markdown code, links, images and HTML do not send pings; self-mentions, muted recipients and inaccessible community content are excluded. Notifications are bounded to ten distinct handles in each body and deduplicated with existing reply/topic alerts.
- Linked replies are focused, highlighted and revealed across nested pagination, with reduced-motion support, per-reply permalinks and a clear fallback for missing replies.
- API and responsive browser regression coverage for subscription isolation, revoked access, mention preferences, duplicate suppression and deeply nested notification targets. No schema upgrade is required from v0.1.2.

## 0.1.2 — Drafts and subscriptions (unreleased)

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
