# Browser source

[Source map](../docs/source-map.md) · [Architecture](../docs/architecture.md) · [Test guide](../tests/README.md)

## Entry points

`main.jsx` chooses public documents by pathname and renders the forum on `/app` with hash navigation. Static public pages hydrate build-time HTML; the signed-in forum renders separately. Conversation documents have their own `conversation.html` → `public/conversation-client.jsx` entry and hydrate a server-generated public seed; they do not bootstrap the complete App. Preserve the legacy landing-anchor allowlist when changing root hash routing.

| Area | Files |
| --- | --- |
| Forum orchestration and pages | `main.jsx`, `spaces.jsx`, `management.jsx`, `settings.jsx` |
| Writing and shared controls | `forms.jsx`, `controls.jsx`, `ui.jsx`, `content.jsx` |
| Content rendering | `markdown.jsx`, `code-review.jsx`, `feedback-thread.jsx`, `github-context.jsx` |
| Discovery and activity | `search.jsx`, `activity.jsx`, `follow.jsx`, `subscriptions.jsx` |
| Browser API/time formatting, drafts and theme | `data.js`, `drafts.js`, `theme.js` |
| Terminal device approval | `cli.jsx` |
| Landing and showcases | `landing.jsx`, `landing-cli.jsx`, `stack.jsx`, `landing-media.json` |
| Public FAQ and update history | `public/pages.jsx`, `public/content.mjs`, `public/accordion.jsx`, `public/pages.css` |
| Public conversation reading and replies | `public/conversation.jsx`, `public/conversation.css`, `auth-return.js` |
| Policy documents | `policies.jsx`, `policies.css` |
| Forum styling | `style.css`, `refresh.css`, `github-context.css` |

## Maintaining public pages

1. Edit FAQ content and curated milestones in `public/content.mjs`. Keep question/milestone IDs stable because they are linked externally. Include only shipped capabilities in update history; future work belongs in plans or issues.
2. Keep initial React output deterministic. Search/category state starts unfiltered, matching prerendered HTML. Enable interactive controls after hydration; native disclosures work without JavaScript.
3. For a new pathname, update `main.jsx`, `scripts/prerender.mjs`, `vercel.json` and standalone static routes in `server.mjs`. Add navigation and verify canonical metadata, HTTP serving and sitemap coverage.
4. Run the [SEO and browser checks](../tests/README.md). Check a fragment link, keyboard operation, no-result search, reduced motion and small screens. Do not depend on animation to expose content.

Public documents use their own dark appearance without writing to the forum’s stored theme. FAQ animation measures height, preserves native `<details>` semantics and reverses an in-flight transition. Avoid replacing it with a clickable `<div>`.

## API and content boundaries

`data.js` centralizes JSON error handling, bounded request timeouts and identical in-flight GET sharing. It deliberately does not retain a private response cache between accounts or retry mutations automatically. Preserve those properties when optimizing requests.

Render user text through the established Markdown/link components and use safe URL validation. Never insert user-controlled raw HTML. Visibility and ownership must also be checked by the API; hidden buttons are only presentation.

## Public conversation boundary

`public-conversations.mjs` selects and whitelists only public, non-removed content. `public/conversation-server.jsx` renders the same component used by the separate client entry. Render with an explicit UTC timezone first; switch to the viewer timezone after hydration. Do not render viewer-specific account/session information into the seed. Do not add an HTML/content cache without accounting for removal and visibility changes.

Inline sign-in reuses the established forms. OAuth resumes through a short-lived, strictly validated same-tab conversation return path; the App waits for permanent-username completion before returning. A failed authenticated reply can preserve account-scoped text for 15 minutes in session storage. No reply is replayed automatically.

## Review snapshot navigation

`review-navigation.mjs` validates author-provided PR file boundaries and complete hunks before producing a view of the published text. `code-review.jsx` pages within a chosen file while posting global line numbers and the existing server snippet hash. Do not reconstruct the patch or retarget outdated remarks. Invalid metadata falls back to the complete plain snippet.
