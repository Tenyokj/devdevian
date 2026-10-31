# Devdevian CLI 0.14 — Keep the review moving

This combined alpha release collects **CLI 0.11.0-alpha.1 through 0.14.0-alpha.1** and **browser/API 0.1.7 through 0.1.10**. One published PR snapshot can now travel from terminal selection to browser review, focused discussion and a return to your work.

[Try Devdevian](https://devdevian.vercel.app/app) · [Launch film](https://www.youtube.com/watch?v=ssUCB1Jpf-Q) · [What's new](https://devdevian.vercel.app/updates) · [FAQ](https://devdevian.vercel.app/faq)

## Install or update

Requires Node.js 24+; the TUI supports VS Code's integrated terminal and terminals from 60 columns × 18 rows.

```sh
npm install -g @tenyokjs/devdevian-cli@0.14.0-alpha.1
devdevian tui
```

Use `npm install -g @tenyokjs/devdevian-cli@alpha` for future alpha updates. The untagged `latest` channel may point to an older version. Existing credentials, local drafts and appearance settings remain compatible. Review queue requires API 0.1.10 or newer.

## A complete review loop

- **Multi-file PR selections:** collect complete hunks from up to ten files of one public GitHub PR revision, preview the exact combined patch, then publish one review. The total code limit remains 20,000 characters. Frozen drafts preserve selected code without rereading GitHub or disk.
- **Browser review navigation:** choose a file, jump between selected changes and see additions/removals. Show in code returns from a current remark to its exact file and page. Published global line numbers and snippet hashes remain stable; earlier-version remarks retain their saved quote.
- **Review queue:** `/reviews` shows Open requests and Awaiting you. The latter finds involved unresolved remark discussions where someone else wrote the last visible message. Enter opens one waiting remark at its latest visible reply. Private membership, accepted solutions, removal and paused/resolved states are respected.
- **Version-aware feedback:** totals distinguish current open/resolved remarks from earlier versions. F filters status; G filters snippet versions. Deep links locate the correct filtered feedback page.
- **Reading continuity:** leaving and reopening the review restores code position and selected remark during the session. The bounded cache is memory-only, clears on account reset and invalidates positions when code changes. Explicit Inbox links retain their exact targets.

GitHub remains read-only: these workflows publish and discuss code in Devdevian, without posting GitHub comments, changing PR state or requesting additional GitHub OAuth permissions.

## Find your work and your way in

CLI 0.13 adds **My work**: Mine, Reviews, Saved and Following, with paging and shortcuts to Inbox/local drafts. An optional **Halloween theme** brings orange accents and a pumpkin greeting; switching themes disables the seasonal appearance. Reduced motion and hiding the mascot remain supported.

CLI 0.12 adds `/start` and read-only `devdevian doctor` / `/doctor` diagnostics. Diagnostics use bounded requests, do not change files or credentials, and omit tokens and private response bodies. The guide helps new terminals reach a first conversation or review.

## Share a conversation outside the workspace

Eligible public conversations now have server-rendered readable URLs, social metadata and paginated replies. Read without an account and sign in on the page to reply. Existing workspace links continue to work; private and removed publications stay excluded from public pages and sitemaps.

The browser review workspace was checked in light/dark themes and desktop/tablet/mobile sizes. A locked dependency update also addresses the compressed-request denial-of-service advisory GHSA-27r3-jxmh-p828 in `body-parser`.

## Verification and boundaries

The release passed 150 automated tests, including unit/API and real pseudo-terminal scenarios. Browser/public SSR scenarios, libSQL/S3 fixtures and bounded load checks are also part of the required release checks. Passing these checks does not establish an independent security audit or a hosted traffic guarantee.

The CLI remains alpha. Public GitHub reads have GitHub quotas; private PRs, GitHub writeback, offline synchronization and cross-restart review positions are not included. Local review memory contains positions and code hashes, and is cleared on account reset. Drafts and terminal credentials retain their existing local storage rules.

[CLI guide](https://github.com/Tenyokj/devdevian/blob/cli-v0.14.0-alpha.1/packages/cli/README.md) · [Version history](https://github.com/Tenyokj/devdevian/blob/cli-v0.14.0-alpha.1/packages/cli/VERSIONS.md) · [Full changelog](https://github.com/Tenyokj/devdevian/blob/cli-v0.14.0-alpha.1/CHANGELOG.md) · [Contribute](https://github.com/Tenyokj/devdevian/blob/cli-v0.14.0-alpha.1/CONTRIBUTING.md) · [Report a bug](https://github.com/Tenyokj/devdevian/issues)
