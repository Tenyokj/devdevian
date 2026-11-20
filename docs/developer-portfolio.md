# Developer portfolio

Your Devdevian profile opens on **Overview**: a curated selection of work and a path to its real context. Contributions, Reviews and Devlogs are separate profile tabs. The portfolio describes retained public work in Devdevian; it is not a ranking, a GitHub activity mirror or a claim that a project merged someone's code.

## Set up your profile

Open **Your corner → Edit profile** to set your name, role or specialization, biography, technologies, profile photo, cover and external links. Your username stays permanent. These existing profile fields remain above every tab. Use a short role that describes what you work on and a biography that explains what you are building or interested in.

The **Developer Insights** extension, when installed, keeps its own profile tab. It is not inserted into Overview and does not need to be installed to use the portfolio.

## Feature your work

In Overview choose **Curate featured work**. You can select up to six items:

- A public project you own.
- A public conversation you authored.
- An answer you wrote that is currently marked as the accepted solution.

Use the search field to find your public work. The picker returns up to twenty matching items at a time; narrow the title when an older item is not in the first results. Selected items appear in a separate ordered list. Move them up or down, unpin them, then choose **Save featured work**. Saving an empty selection clears your featured section. Changes are account-wide rather than a browser-only layout preference.

A selected item must still be public, available and eligible when you save. Profile edits in two tabs use a version check: a stale save is refused instead of silently replacing the other tab's work. Your selection remains visible after the error. **Reload saved selection** explicitly replaces it with the current server version; review it before saving again.

Featured cards are live references. They show the current public title and excerpt, not an immutable snapshot or a duplicated copy of the source. A project card opens its workspace; a conversation or accepted-answer card opens the original discussion. The accepted-answer excerpt identifies the featured answer.

## Read the evidence

Overview shows counts of currently visible public projects, accepted contributions, review outcomes and line feedback, and published Devlogs. Each count opens its matching tab. These counts reflect retained records, not unique days or a measure of developer quality.

**Contributions** lists your results whose current state is `accepted`, in currently linked project tasks. Each card points to its project contribution context and the retained revision. When an attached PR has a canonical GitHub URL, the card also offers that link. An accepted result in Devdevian is not proof of a GitHub merge. If the contribution state changes, it leaves this section.

**Reviews** combines published formal review outcomes and retained line feedback. Formal outcomes preserve the original snapshot number and distinguish **No objections** from **Changes requested**. Line remarks are labelled **Line feedback**. These records show that you contributed a review; they are not automatically GitHub approvals.

**Devlogs** lists published project updates you authored, including older published updates without duplicating their modern canonical record. Drafts never appear. Cards open the project's Devlogs tab, where the full update can be read.

Each history page contains eight cards and uses the shared pagination controls. The browser requests only the section you open. Counts can change when records are removed, access changes or a contribution's state changes.

## Visibility and privacy

Portfolio sections are **public work only**, even when the viewer is the profile owner or belongs to the same private community. Private projects, private conversations, private Devlogs and drafts are excluded from cards, counts and the featured-work picker.

A public-looking task linked into a private or removed project is also excluded. Contributions check both the task and project introduction. An accepted answer whose reply has been deleted is not eligible. Visibility is checked on every read: changing a previously featured source to private or removing it makes it disappear from public results. The stored pin contains only its kind and identifier, not a copy of the content. Saving a new selection replaces the old list.

A hidden profile returns not-found to other viewers, including signed-in community members; its owner can still open it. A deleted account's portfolio is unavailable. The ordinary account deletion flow removes its stored featured selection. Portfolio responses use `Cache-Control: no-store` so a prior viewer's response is not reused as a public cache entry.

For private activity statistics, use your own Developer Insights tab and its explicit private-work option. That does not change what appears in your public portfolio.

## API and operations

| Endpoint | Purpose |
| --- | --- |
| `GET /api/users/:id/portfolio` | Public Overview cards, totals and current selection version |
| `GET /api/users/:id/portfolio?section=contributions&page=1` | Paginated accepted contributions |
| `GET /api/users/:id/portfolio?section=reviews&page=1` | Paginated review outcomes and line feedback |
| `GET /api/users/:id/portfolio?section=devlogs&page=1` | Paginated published Devlogs |
| `GET /api/users/:id/portfolio/candidates?q=retry` | Owner-only public work picker |
| `PUT /api/users/:id/portfolio` | Owner-only version-checked featured selection |

A save body contains `pins`, an array of `{ "kind": "project", "id": 42 }` entries, and `expected_version` from Overview. Supported pin kinds are `project`, `conversation` and `solution`; identifiers are positive integers. Initial version is zero. Duplicate items, more than six pins, ineligible sources or an outdated version are refused.

Portfolio reads are limited to 90 per minute per account or guest IP. The owner picker allows 60 reads per minute; selection writes allow 30 per five minutes. Sources remain behind the same public-visibility rules for script clients.

The additive `portfolio_schema` and `portfolio_profiles` tables and Devlogs author index are prepared by `node scripts/migrate.mjs --prepare-portfolio` after a verified encrypted backup and isolated restore check. Hosted requests perform no DDL. Rolling back hides the new interface but leaves the selection intact; no production content reset or seed is involved. This browser release does not require a new CLI package.

## Related guides

- [Contributions](/docs/contributions)
- [Project Devlogs](/docs/devlogs)
- [Human code reviews](/docs/review-flow)
- [Extensions and Developer Insights](/docs/extensions)
- [Profile privacy and authentication](/docs/authentication)

## Profile verification

A blue check beside the profile name means the Devdevian owner has verified that profile. It does not grant moderator, private-community or GitHub permissions, and is not a guarantee about published content. Only the configured, email-confirmed platform owner can grant or revoke it in Owner console → Verified profiles. Public profiles can be searched by name or username. Every decision is retained separately from editable profile details.

The founder check and Founder role are derived from the configured owner identity, never from a display name, username or user-editable role. Users cannot grant verification through profile editing or extensions. Hidden and deleted accounts are excluded from the verification directory.
