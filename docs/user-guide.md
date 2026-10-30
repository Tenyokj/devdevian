# User guide

## Join and keep one account

Open [Devdevian](https://devdevian.vercel.app/app). You can use Google, GitHub, or email/password registration when those methods are enabled. Email registration sends a six-digit code that expires after ten minutes. A registration is not complete until the code is accepted. Check spam and wait at least one minute before resending.

Choose your permanent username carefully. It is case-insensitively unique and cannot be changed later. Your display name, biography, links, photo, and banner can be edited in Your corner. Never post verification codes or credentials in discussions or bug reports.

If a new provider returns an email already used by an existing account, Devdevian sends a one-time confirmation to that email. Confirm in the same browser to connect the provider and enter the existing account. Future sign-ins use the connection directly. Different provider emails may create separate accounts; changing profile names does not merge them.

## Forgotten password

Choose **Sign in → Forgot your password?**, enter your email, then enter the six-digit code and a new password. Codes expire after ten minutes. Request a new code through **Request another code** if needed. A successful reset signs out every saved device; sign in again. The permanent username and your publications stay unchanged.

## Public feed and private communities

Topics and technologies organize public publications. They are not membership groups. You can choose existing labels or create a nonduplicate label. Their selectors show usage counts and support search.

Communities are separate, members-only spaces. Request access and wait for the owner or a validator to approve. Only approved members can publish and read community conversations and their attachments. Community names, descriptions, logos, and membership counts are directory information. A private community is not an encrypted messenger; do not use it for credentials or confidential records you cannot share with the service operator.

## Start a conversation

Choose a type that explains what you want:

| Type | Intended use | Helpful context |
| --- | --- | --- |
| Question | A specific problem to solve | What you tried, expected behavior, actual behavior |
| Discussion | An exchange of ideas | A clear starting point and tradeoffs |
| Code review | Feedback on an implementation | A focused snippet and the questions reviewers should address |
| Show & tell | Something you built | Who it helps, how to try it, and the feedback you want |

Choose a public audience or one of your joined communities. Add a title, content, topic, technologies, optional attachments, and any number of labeled links. Markdown supports links and fenced code blocks. Mention a profile with its @username. Verify the audience before publishing.

Files are limited to 4 MB each. Supported types include PNG, JPEG, WebP, GIF, PDF, ZIP, and supported text/code extensions. SVG and HTML uploads are not accepted. Image attachments can appear on publication cards; other files appear as attachments. Never upload someone else’s private information or a repository containing secrets.

Draft text, selected topic/technologies, audience, code, and links auto-save in this browser, separately for each account and public/community entry point. Closing and reopening the composer restores the draft; reattach files before publishing. Drafts can be restored for 30 days after the last edit. **Discard draft** or a successful publication removes it. Drafts do not sync across devices; avoid sensitive text on shared devices. Clearing this site’s browser storage also removes drafts.

## Replies, accepted answers, and archiving

Reply to the publication or to an individual reply. Root replies and nested branches have their own pagination. Use the direct reply link from notifications to find the relevant branch.

The author of a Question or Code review can accept a reply and later undo that choice. Accepted answers help readers find a useful solution; they do not prevent further discussion or guarantee correctness. Authors can edit their own content; you cannot edit another account’s reply.

Archiving stops new replies without removing the conversation. The author can restore it. Moderator restrictions remain in force until an authorized moderator changes them. Voting and bookmarks are per-account toggles.

**Needs help** includes open Questions and Code reviews without an accepted solution, even when they already have replies. Archived, moderated/locked and solved conversations are excluded. Accepting a solution removes the post from this filter; undoing it brings the post back.

## Following and mentions

**Following** in the sidebar combines public posts from followed topics with individual conversations you follow. Its Recent view orders conversations by the latest post edit or reply; Active and Needs help, search, topic/type filters, and pagination remain available. Following a topic does not include private community activity. A private conversation appears only while you remain an approved member.

Choose **Manage subscriptions** from Following or Settings to search your follows, filter topics/conversations, and unfollow. Removed or inaccessible posts have a generic label and can still be unfollowed. A post may remain in Following after a direct unfollow if you still follow its public topic. Bookmarks are separate.

Mention an @username in the **body** of a conversation or reply to send an in-app notification. Newly added mentions in edits also qualify. At most the first ten distinct handles in a body are considered; code blocks, inline code, links, images, HTML, and your own username do not send alerts. Recipients must have access to the conversation. A recipient receives at most one initial notification per post/reply, even if a mention and a subscription/reply alert overlap; removing and re-adding a mention does not re-ping them. Settings → @Mentions controls mention alerts independently of other categories. Existing notifications remain subject to current access checks.

Notification reply links reveal the correct root and nested pages, focus and highlight the linked reply, and respect reduced-motion preferences. Every reply also has a **Link** permalink. If a linked reply is missing, the conversation opens with an explanation instead.

## Projects and events

A project can include its logo, screenshots, team members with custom roles, and labeled links. Its feedback conversation keeps reviews in one place. Editing the presentation retains that conversation.

Create an event with a topic, banner, organizer-local date/time, timezone, duration, and optional meeting link. Devdevian stores the instant in UTC and displays it in the viewer’s timezone, alongside organizer information. Calendar downloads contain the scheduled dates rather than a private meeting URL.

Join an event to see its meeting link and reminders, when reminders are enabled. Organizers can edit or cancel events; attendees can receive notifications according to their preferences. Use the date filter for a single day in your viewer timezone.

## Search, notifications, and profile controls

Global search opens in a modal and groups matching content by type and audience. Community content is searchable only when your account has access. Use page-level filters and pagination to narrow directories and discussions.

Follow a topic from its filtered feed to receive notifications about new public conversations (including project introductions). Follow an individual conversation to receive new-reply notifications without bookmarking it. Topic subscriptions never include private-community activity. Conversation notifications require continued community membership. Unfollow to stop future alerts; existing notification history stays. Your own activity does not notify you.

Notifications link to the relevant content. Settings control future notification categories; disabling optional notifications does not disable security codes. Profile visibility affects profile discovery, not the visibility of existing public posts. Signing out asks for confirmation; saved account switching requires a valid session on that device.

## Reports, deletion, and help

Report a publication with a clear reason. Community reports go to that community’s owner and validators; public-feed reports go to designated platform moderators. See [moderation](moderation.md).

Account deletion in Settings requires your username as confirmation. Transfer owned communities first. Deletion removes account access and anonymizes the profile; contributions and some attachments can remain. Read [Privacy & Security](https://devdevian.vercel.app/privacy) for details and further removal requests.

For a reproducible non-sensitive bug, open a [GitHub issue](https://github.com/Tenyokj/devdevian/issues) with the page, steps, expected/actual results, browser, and viewport. For private account or data questions, email **dv842449@gmail.com**. Do not publish passwords, codes, API keys, or private community content.

### Focused code feedback

Questions and code reviews offer optional outlines in the composer. Applying an outline appends it to existing text; it does not replace your draft.

For a published Code review snippet, click a line number or select a range with Shift-click or the From/To fields. Add a remark about up to 50 lines. Long snippets show 100 numbered lines per page to keep rendering bounded. Line feedback has separate pagination and filters for open/resolved remarks and snippet versions. The publication author receives an in-app reply notification according to their notification settings.

Only the publication author can resolve or reopen a remark. This does not accept a solution or close the conversation. After a code edit, remarks about different snippet content show **Earlier snippet version** and keep their original excerpt. Removing the snippet keeps earlier remarks readable. New remarks are blocked when replies are paused; private-community feedback is visible only to members with access.

### Discussing and reporting feedback

Choose **Discuss feedback** under a line remark to open its paginated reply thread. You can edit or delete your own remarks and replies; stale edits are rejected instead of overwriting another tab. Deletion removes the text and leaves a placeholder so other members’ replies survive.

Reply notifications go to the publication and remark authors; status notifications go to the remark author. They follow the reply and solution notification preferences respectively. Notifications open the exact remark and, where applicable, the paginated reply.

Use **Report feedback** on the particular remark or reply. Community reports go to its owner and appointed validators, while public reports go to Devdevian moderators. The **Reported code feedback** queue allows a documented decision or removal of that item without hiding the whole publication.

### Devdevian in the terminal

Install `@tenyokjs/devdevian-cli@alpha` with npm (Node.js 24+), run `devdevian login`, compare the displayed code with the browser approval screen, sign in, and choose **Authorize terminal**. Then run `devdevian` for an interactive menu or `devdevian --help` for commands. The CLI uses the same account, publications, private-community permissions, feedback and notifications.

Selected text/files are previewed before publication. Revoke an individual terminal under **Settings → Connected terminals** or run `devdevian logout`. The alpha's scope and local credential-file permissions are documented in the [CLI README](../packages/cli/README.md). Browser-only controls remain available for media/profile editing, event administration and moderation.

## Sharing and reading public conversations

Public posts can be shared using `/conversation/:id/:slug`; Share copies this readable URL. Existing `/app#post/:id` links and the full forum workspace still work. Private-community sharing uses the app route and continues to require membership. Public reading needs no account and works without JavaScript; replies are paginated. Nested threads and advanced actions can be opened in the full workspace.

With JavaScript enabled, sign in on the public page to reply. Browser OAuth returns to the same conversation after completing any required permanent username. Replies still obey pauses, membership/visibility, quotas and server validation. A short-lived, account-scoped session draft may restore text when a reply requires sign-in again; it is not synchronized and expires after 15 minutes. Publication always requires an explicit submit and is never retried automatically.
