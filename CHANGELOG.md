# Changelog

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
