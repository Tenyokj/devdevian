# Devdevian documentation

Devdevian is an open-source developer forum. The hosted early release is at [devdevian.vercel.app](https://devdevian.vercel.app/), with the forum at [/app](https://devdevian.vercel.app/app).

[Source map](source-map.md) · [What’s new](https://devdevian.vercel.app/updates) · [Searchable FAQ](https://devdevian.vercel.app/faq) · [Launch film](https://www.youtube.com/watch?v=ssUCB1Jpf-Q)

## Release notes

- [CLI 0.10 — From pull request to conversation](releases/cli-0.10.0-alpha.1.md): combined CLI 0.7–0.10 alpha and website update, installation and current limits.
- [Every npm version](../packages/cli/VERSIONS.md) · [Full changelog](../CHANGELOG.md) · [GitHub releases](https://github.com/Tenyokj/devdevian/releases).

## Using the forum

- [My work](my-work.md): next actions, assigned tasks, results and local continuation in browser and CLI.

- [User guide](user-guide.md): accounts, conversations, replies, projects, events, search, and account controls.
- [Moderation](moderation.md): community ownership, validators, platform roles, and report decisions.
- [Privacy & Security](https://devdevian.vercel.app/privacy): what is stored, visibility, cookies, providers, and deletion.
- [Terms of Use](https://devdevian.vercel.app/terms): community conduct, content rights, and use of the hosted service.

## Terminal client

- [CLI guide](../packages/cli/README.md): installation, login, workspace, reviews and local drafts.
- [First launch and diagnostics](cli-diagnostics.md): read-only connection checks, safe reports and recovery.
- [Public GitHub PR reader](github-pr-reader.md): current public PR metadata and changed files from the terminal.
- [GitHub review context](github-context.md): opt-in repository/branch/commit metadata, PR links and their limits.
- [CLI versions and roadmap](../packages/cli/VERSIONS.md): each npm version, compatibility notes and combined release policy.

## Building and operating

- [Development](development.md): local setup, isolated demo accounts, checks, fixtures, and safe data handling.
- [Source map](source-map.md): where to make a change, folder navigation and public-page maintenance.
- [Tests](../tests/README.md): suites, fixtures, prerequisites and isolation boundaries.
- [Architecture](architecture.md): modules, data flow, storage, authorization, and routing.
- [Authentication](authentication.md): OAuth, verified email, provider linking, and server-side credentials.
- [Deployment](deployment.md): self-hosting on Vercel with Turso and private S3-compatible storage.
- [Reliability and recovery](reliability.md): release migrations, encrypted backups, restore drills, health monitoring, quotas and load checks.
- [Search visibility](search.md): prerendered public pages, sitemap, metadata, Search Console, and current indexing scope.
- [Contributing](../CONTRIBUTING.md), [code of conduct](../CODE_OF_CONDUCT.md), and [security reporting](../SECURITY.md).

Documentation describes the current implementation. Free provider quotas, console interfaces, and account approvals can change; check the linked provider documentation for current requirements.

## Feature guides

- [Rooms](rooms.md): shared task boards, assignees, pinned decisions/history, project activity and browser/CLI commands.
- [Review Flow](review-flow.md): named reviewers, personal queues, version-bound outcomes, revision links and project activity in browser and CLI. Browser/API 0.3.0 and CLI 0.16 source milestone; publication is tracked separately.

- [Workspaces 0.2](workspaces-0.2.md): server contracts, real browser and CLI workflows, isolated demos, migration/recovery plan and release-candidate stages. See the release guide for rollout status and compatibility.

- [Contributions](contributions.md): submit assigned work, review exact result revisions and attach checked public GitHub PRs.

- [GitHub workspace](github-app.md): GitHub App connection, installed public/private repositories, PRs/issues/diffs/checks, explicit sharing and operations.

- [GitHub issues → room tasks → PRs](github-room-work.md)
- [0.7 security verification and limits](security-review-0.7.md)
