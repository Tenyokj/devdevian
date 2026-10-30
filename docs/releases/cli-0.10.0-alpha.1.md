# Devdevian CLI 0.10 — From pull request to conversation

This combined alpha release brings together **CLI 0.7.0-alpha.1 through 0.10.0-alpha.1**, plus the public website and documentation updates. The browser/API package remains **0.1.6**.

Open a public GitHub pull request, choose the changes you want another developer to look at, and turn them into a focused Devdevian code review. The discussion is available in both the terminal and browser, with the same account and access rules.

[Watch the launch film](https://www.youtube.com/watch?v=ssUCB1Jpf-Q) · [Try the forum](https://devdevian.vercel.app/app) · [What’s new](https://devdevian.vercel.app/updates) · [FAQ](https://devdevian.vercel.app/faq)

## Install or update

Requires **Node.js 24+**. The interactive workspace supports terminals from **60 columns × 18 rows**, including the VS Code integrated terminal.

```sh
npm install -g @tenyokjs/devdevian-cli@0.10.0-alpha.1
devdevian tui
```

For subsequent alpha updates, use `npm install -g @tenyokjs/devdevian-cli@alpha`. Keep the explicit `@alpha` tag: an untagged install may select an older package from npm’s `latest` channel.

Authorize the terminal through your browser when prompted. Existing users can keep their account, local drafts, appearance preferences and connected terminal session. `devdevian open` launches a separate terminal window on supported systems.

## Public GitHub PRs → human code review

- Open a public PR from the command bar with `/pr https://github.com/owner/repo/pull/42`, or follow a linked PR from a conversation. Read its status, author, branches, description and paginated changed files.
- Choose a file and inspect its colored diff, with separate old/new line numbers and horizontal scrolling for long lines.
- Select one complete hunk or a contiguous range of hunks. Create an editable review draft, add context, then preview and explicitly confirm publication.
- Browser and terminal show the selected patch’s repository, file and base/head commit context. Restoring a saved PR-review draft preserves the selected snapshot rather than silently fetching new code.
- Fresh commit checks detect a PR changing during loading. Unsupported, binary, oversized or incomplete patches produce an explanation instead of an incomplete review selection.

The `github pr` and `github diff` read commands also work without a Devdevian login. Publishing a review requires a forum account and the usual permissions. See the [PR workflow and command reference](https://github.com/Tenyokj/devdevian/blob/cli-v0.10.0-alpha.1/docs/github-pr-reader.md).

**GitHub integration is read-only.** These actions create a discussion in Devdevian; they do not submit a GitHub review, post a GitHub comment, modify code or change PR state. No additional OAuth scope is requested.

## A smoother terminal workflow

- **Quick actions:** `Ctrl+K` or `/actions` opens searchable navigation, context actions, recent views and explicit search/open choices.
- **Clearer writing:** step-by-step forms for conversations, Projects and Events; visible Back / Next / Preview controls; validation before advancing; preserved draft values and selections.
- **Better multiline input:** earlier text stays visible, the view follows the caret, and compact terminals show the logical line position and count.
- **Visible links:** Demo and Repository URLs appear in conversation details and previews alongside labeled links, without duplicate destinations.
- **Reading continuity:** full-text search and session reading positions help you return to long replies and review discussions.
- **Optional GitHub context:** local reviews can include repository, branch, base commit, file path and a matching PR link, visible in both clients.

## A clearer public website and repository

- New [What’s new](https://devdevian.vercel.app/updates) page with separate Browser/CLI milestones.
- Expanded [FAQ](https://devdevian.vercel.app/faq): 24 answers, four categories, search, direct answer links and keyboard-friendly animated disclosures.
- Brighter shared navigation/hero, a blurred photograph backdrop, a centered animated public-conversation counter, npm in the technology ribbon and a footer navigation directory.
- Public pages include prerendered content, canonical/social metadata and sitemap entries. The FAQ remains usable without JavaScript; motion respects the system’s reduced-motion preference.
- Updated product README and contributor documentation, with a [source map](https://github.com/Tenyokj/devdevian/blob/cli-v0.10.0-alpha.1/docs/source-map.md), frontend/test/script guides, and the launch film.

## Compatibility and current limits

- **No new database migration is required when upgrading from the previous combined `cli-v0.6.1-alpha.1` release.** Browser/API remains 0.1.6. Self-hosters should deploy the matching API and frontend before using the new shared review context. Older deployments should follow the migration guide appropriate to their version.
- This remains an **alpha**. Public GitHub requests use unauthenticated quotas; private repositories, GitHub write-back, synchronized GitHub threads and partial-line PR selections are not supported.
- A published PR review contains one file and a contiguous range of complete hunks, up to 20,000 characters including headers. Review line numbers refer to the published patch, not directly to the original file.
- Drafts and appearance preferences are local. There is no offline synchronization. Terminal credentials use a restricted local file rather than an OS keychain; access can be revoked in Settings.
- Tests and restore tooling do not establish a production capacity guarantee or an independent security audit. Keep your own copy of important work.

## Verification

The release candidate passed **127 automated tests**, real pseudo-terminal regressions, desktop/tablet/mobile browser checks, and SEO/prerender checks. CI also passed the libSQL/S3 fixture configuration and isolated load checks. The deployed FAQ, update history, metadata, sitemap, mobile search and filters were checked on the public site.

Each npm version is recorded independently in the [CLI version history](https://github.com/Tenyokj/devdevian/blob/cli-v0.10.0-alpha.1/packages/cli/VERSIONS.md). This GitHub release groups those existing publications; it does not introduce another npm version.

[CLI guide](https://github.com/Tenyokj/devdevian/blob/cli-v0.10.0-alpha.1/packages/cli/README.md) · [npm package](https://www.npmjs.com/package/@tenyokjs/devdevian-cli) · [Full changelog](https://github.com/Tenyokj/devdevian/blob/cli-v0.10.0-alpha.1/CHANGELOG.md) · [Contribute](https://github.com/Tenyokj/devdevian/blob/cli-v0.10.0-alpha.1/CONTRIBUTING.md) · [Report a bug](https://github.com/Tenyokj/devdevian/issues)

**Full comparison:** https://github.com/Tenyokj/devdevian/compare/cli-v0.6.1-alpha.1...cli-v0.10.0-alpha.1
