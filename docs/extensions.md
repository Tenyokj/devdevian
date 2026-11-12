# Code extensions

Devdevian extensions are account-specific browser packages containing JavaScript, optional host CSS and inspectable sources. They can rearrange the app shell, add interfaces, render animated companions, open additional app views and integrate external services through explicitly declared capabilities. They do not change the server's source code or give other accounts your layout. CLI, landing and documentation styling remain separate.

## Develop locally

Clone the [repository](https://github.com/Tenyokj/devdevian), install Node.js 24 or newer and run `npm ci`. Copy an example directory as your starting point:

```sh
cp -R examples/extensions/studio-shell my-extension
npm run extension:dev -- my-extension
```

Open `http://127.0.0.1:4188/app#extensions`. Sign in with the local-only account printed by the command, choose **Upload extension → Load local build**, inspect its sources and capabilities, and grant permission for preview. Select **Live preview** before **Preview in my app** to rebuild changed sources approximately every 1.5 seconds. If capabilities change, preview stops so you can review the new request.

The development command uses a separate `.test-data/extension-dev/sandbox.sqlite` database and local uploads. It clears inherited cloud database, storage and authentication credentials for that process; it does not overwrite `.env` files or copy production data. The local build endpoint is disabled in production and only serves the explicitly selected extension directory. Override the port with `EXTENSION_DEV_PORT=4190` if needed. Changes to an extension affect the preview, not your account's published installs.

The examples demonstrate two different integrations:

- [Studio Shell](https://github.com/Tenyokj/devdevian/tree/main/examples/extensions/studio-shell) moves aside beneath the main content and styles aside, nav, cards and footer in both light and dark modes.
- [Devi Companion](https://github.com/Tenyokj/devdevian/tree/main/examples/extensions/devi-companion) renders an animated SVG companion, stores a device-local counter and opens extra app views.

## Source project and package format

Your directory contains `devdevian.extension.json`, an entry file and any explicitly imported local sources. There is no in-app palette builder. You write ordinary browser JavaScript or TypeScript and CSS in your editor.

```json
{
  "name": "My Studio",
  "slug": "my-studio",
  "version": "1.0.0",
  "description": "A custom workspace with navigation below the content.",
  "entry": "main.ts",
  "permissions": ["ui.style", "ui.layout", "ui.panel"],
  "styles": { "light": "light.css", "dark": "dark.css" }
}
```

Bundle and export it:

```sh
npm run extension:pack -- my-extension
# my-extension/dist/my-studio-1.0.0.devext.json
```

The packer bundles the entry into an IIFE, includes imported local source files and host styles, validates the result and writes a JSON archive. It does not execute your extension while packing. Inputs must stay within the selected directory; `.env`, `.git`, symlink escapes and `node_modules` inputs are rejected. This intentionally small first SDK uses browser APIs and local modules; third-party framework bundles must be prepared separately and still fit the package limit. Inspect the output before publishing: sources are public, so never include credentials, personal data or private code.

The resulting envelope has `name`, `slug`, `version`, `description` and `manifest`. A schema 2 manifest contains `kind: "extension"`, `permissions`, `entry: "main.js"`, `files` and `styles: {light, dark}`. File keys use simple relative paths with js/ts/tsx/jsx/css/html/json/svg/md extensions. Packages are limited to 192 KiB of manifest JSON and 32 files; each mode's host CSS is limited to 24 KB. The server independently repeats validation.

Names allow 3–60 characters, descriptions 20–1,200, and slugs 3–48 lowercase letters/digits/hyphens starting with a letter. A slug belongs to its first author. Versions use increasing `major.minor.patch` values without prerelease labels. Published versions are immutable; edits require a new version.

## Runtime and capabilities

Your code starts with `window.devdevian` available. It runs in an iframe with an opaque origin and `sandbox="allow-scripts"`. It owns its document and can create arbitrary HTML, CSS, SVG, canvas and interactions there. It cannot access the forum's DOM, session cookies, local storage, OAuth tokens or server secrets directly. Host changes go through the SDK and are validated separately.

| Capability | SDK | Access |
| --- | --- | --- |
| None | `context()`, `onTheme(fn)` | Current route, light/dark mode and preview flag |
| `ui.style` | `style.apply(css)` | Replace this extension's scoped host stylesheet |
| `ui.layout` | `layout.apply(grid)` | Arrange aside/nav/content/footer regions |
| `ui.panel` | `panel.configure(options)` | Position and size the extension's own interface |
| `ui.navigate` | `navigate(route)` | Navigate to a supported forum route |
| `views.open` | `views.open(route, title)` | Open an additional trusted app view |
| `storage` | `storage.get(key)`, `storage.set(key, value)` | JSON storage scoped to account and extension slug on this device |
| `data.read` | `data.get(path)` | Bounded read-only conversations, projects and events available to this account |
| `network:https://your-service.example` | Standard `fetch` | Requests to that exact HTTPS origin, subject to CORS |

All SDK calls return promises except `onTheme`, which returns an unsubscribe function. Handle rejections; denied permissions, invalid arguments and quotas produce errors. Installing a code package requires explicit acceptance of its exact declared capabilities, including reviewed packages. Updating does not silently grant new access. Up to eight code packages can be enabled per account.

```js
const { mode } = await devdevian.context();
devdevian.onTheme(nextMode => {
  document.documentElement.dataset.theme = nextMode;
});
await devdevian.panel.configure({
  placement: "right", title: "My tools", width: 380, height: 420
});
document.getElementById("root").textContent = `Ready in ${mode} mode`;
```

Panel placements are `right`, `left`, `bottom`, `overlay`, `full` and `hidden`. Width must be 180–1,600 and height 100–1,600 pixels; viewport bounds still apply. A hidden panel continues running, useful for shell-only extensions. Use reduced-motion preferences, readable contrast and keyboard-accessible controls in your own interface.

## Customize the entire shell

Host styles can target `.sidebar`, `.topbar`, `footer`, cards and any other elements within the app surface. They are scoped automatically, so they cannot select the surrounding recovery controls. `:root`, `html`, `body` and `.app` map to the app surface. Ordinary rules, `@media` and `@supports` are accepted. Network resources, `@import`, keyframes, nested selectors and CSS escapes are rejected in host CSS. Put animation, asset rendering and complex CSS inside your isolated panel instead.

Provide both `light.css` and `dark.css`: the header day/night button chooses the corresponding stylesheet without disabling the package. With multiple packages, later styles may override earlier ones; disable conflicting packages rather than relying on an undocumented ordering. Existing schema 1 palettes remain installable for compatibility. Switching to their opposite base mode keeps the install but uses the normal base palette; the original custom palette returns when switching back.

```js
await devdevian.layout.apply({
  areas: [["nav"], ["content"], ["aside"], ["footer"]],
  columns: ["minmax(0, 1fr)"],
  gap: 20
});
```

Layouts support up to six rows and four columns. Each of the four named regions must appear and form a rectangle. Tracks accept bounded `px`, `fr`, `auto` or `minmax(0, 1fr)` values; gaps are 0–48px. This first API rearranges whole regions, not arbitrary React component internals. Narrow mobile screens retain a readable fallback. If several extensions provide layouts, the last applied layout wins; disabling it restores the prior active layout.

## Extra views, data and storage

```js
await devdevian.views.open("projects", "Projects beside my work");
const conversations = await devdevian.data.get("/posts?limit=5&page=1");
const count = (await devdevian.storage.get("visits")) || 0;
await devdevian.storage.set("visits", count + 1);
```

Supported navigation/view routes include `feed`, `work`, `following`, `projects`, `events`, `github`, `extensions`, `communities`, `saved`, `profile`, `post/ID`, `workspace/ID` and `workspace/ID/room`. Up to three additional app views are retained. These are Devdevian-owned views; they keep normal authorization and do not run extensions recursively.

Data reads accept `/posts`, `/projects`, `/events`, optionally `/ID`, plus bounded `page` and `limit` queries. Responses above 64 KB are refused; request smaller pages. This is not a generic API proxy: account settings, sessions, arbitrary endpoints and all write methods are unavailable. A `data.read` grant can expose private content the installing account is authorized to see; combine it with network permission only for code you trust.

Storage keys are 1–80 ASCII letters/digits/underscore/dash/dot. Each JSON value is at most 16 KB, with 64 KB total per account and extension slug. Storage stays on the current device, survives version changes for that slug and is not a secret vault. Browser storage clearing removes it. SDK traffic is bounded at 40 requests per second, eight outstanding calls and 64 KB per message.

## AI and external integrations

An AI tool can render its own composer in the panel and call a service you operate through an explicit `network:https://…` permission. The service must accept the sandbox's opaque origin through appropriate CORS. Do not embed provider secrets in a public package; keep provider credentials on your own authenticated backend. Devdevian's OAuth tokens and email/database/storage credentials are never handed to extensions. There is no hosted AI provider or extension server-code execution in this release.

Network grants accept exact public HTTPS domain origins, not wildcards, paths, localhost, literal IPs or the forum's own origin. The runner's CSP restricts requests and frames independently from the host. A network grant still does not bypass CORS or service authentication.

## Publish, install and review

Open **Extensions → Upload extension**, select the built `.devext.json`, inspect the included sources and publish the immutable package. Preview consent executes code only for you; publishing alone does not execute it. Open the published card and explicitly install it to enable it on your account. Other accounts must choose their own installs. Account installs follow sign-in across devices; device-local extension storage does not.

Community packages start unreviewed. A configured reviewer can mark an exact version reviewed, revoke its review or withdraw it; authors can withdraw their own versions. Ordinary moderator status does not grant package review privileges. Review history is audited, and a new version never inherits approval. Reviewed is a useful signal, not a guarantee against bugs or harmful behavior. Revocation disables code installations; an explicitly consented unreviewed package can be enabled again. Withdrawal prevents reinstallation. Clients refresh on focus and once per minute; an offline tab cannot receive immediate revocation.

## Recovery and limits

A separate **Extensions / Disable all extensions** recovery bar remains outside extension styling. Use it to disable code packages and restore the default appearance. To bypass execution before the page loads, open:

```text
https://devdevian.vercel.app/app?extensions-safe=1#extensions
```

Safe mode is local to that page load; **Disable all extensions** saves the disabled state to your account. **Stop preview** removes only the temporary developer package. The library also supports disabling or removing individual installs.

Isolation limits data access; it is not a resource quota for arbitrary JavaScript. An extension can still be misleading, use CPU excessively or render inaccessible controls inside its own interface. Browser process scheduling differs, so an infinite loop can make a tab unresponsive; close it and reopen in safe mode. This SDK does not promise unrestricted mutation of application internals, server-side plugins, payments or extension rewards. Request additional SDK capabilities through a [GitHub issue](https://github.com/Tenyokj/devdevian/issues) with a concrete use case.

## Create a complete library listing

**Upload extension** opens a publication form immediately: name, unique slug, version, short description, full Markdown description, tags, resource links and screenshots. Loading a package prefills these fields; you can edit the listing before publishing without changing its code. Explain setup, shortcuts, capabilities and any external services so installers know what they are choosing.

For a first test, choose **Load Studio Shell example** in that form. This fetches a real, already built package; it does not execute it. Inspect its capabilities, approve preview and choose **Preview in my app**. You can also [download Studio Shell](https://devdevian.vercel.app/extension-examples/studio-shell.devext.json) or [Devi Companion](https://devdevian.vercel.app/extension-examples/devi-companion.devext.json). A random JSON configuration, screenshot, ZIP or loose source file is not a code package, even if renamed `.devext.json`.

The optional `listing` object in the package envelope or local `devdevian.extension.json` supports:

```json
{
  "listing": {
    "full_description": "## Features\n\nSetup and usage instructions.",
    "tags": ["productivity", "layout"],
    "links": [{ "label": "Source code", "url": "https://github.com/you/extension" }],
    "screenshots": []
  }
}
```

Full descriptions allow 20,000 characters. Add at most eight tags (2–30 letters/digits/dots/underscores/hyphens), five labeled HTTPS links and six PNG/JPEG/WebP/GIF screenshots, each at most 4 MB. Tags can be searched with or without `#`. Upload screenshots through the publication form: the saved listing references upload IDs, not inline base64 or arbitrary external image URLs. Only your own unattached image uploads can be published. Until publication they remain private to you; publishing makes those images visible to library visitors. Images attached to a private conversation cannot be reused through this flow. Withdrawing the version removes the extension listing's public access to its images; other valid public uses of the same image remain independent.

Listing metadata is saved with the immutable release. Update it by publishing a newer version rather than changing an already reviewed page. Included source files are also public. Recovery controls appear at the bottom of the screen only while an extension/preview is running or safe mode is active; the ordinary sidebar contains the normal Extensions navigation.

## Beginner walkthrough: style search and notifications

Work in a clone of the repository with Node.js 24+ and dependencies installed using `npm ci`. The smallest useful starting point is [Popup Focus](https://github.com/Tenyokj/devdevian/tree/main/examples/extensions/popup-focus):

```sh
cp -R examples/extensions/popup-focus my-extension
npm run extension:dev -- my-extension
```

The local server prints an address and a disposable development login. Open Extensions → Upload extension → Load local build, review capabilities, enable preview and open Search or Notifications. Editing local sources with Live preview enabled updates the preview. Your four source files are:

```text
my-extension/
  devdevian.extension.json
  main.js
  light.css
  dark.css
```

`devdevian.extension.json` describes your **source project**: `name`, unique `slug`, `version`, `description`, entry file, capabilities and CSS file paths. `listing` optionally supplies descriptions/tags/links. `main.js` runs browser code in the isolated panel. A style-only extension can hide that panel using `devdevian.panel.configure({placement: 'hidden', title: 'My theme'})`, which needs `ui.panel`. Host styles require `ui.style`.

For example, `.modal { border-radius: 24px; }` changes shared forum dialogs, `.notification-item` styles notification entries, and `.search-result:hover` styles search hover states. These work in the app's protected popup layer as well as the ordinary app surface. Provide matching light/dark styles. Recovery controls remain outside this styling scope.

When ready:

```sh
npm run extension:pack -- my-extension
```

Upload the generated `my-extension/dist/YOUR-SLUG-YOUR-VERSION.devext.json`. This is the **distribution package**, not the source configuration: the compiler embeds bundled JavaScript under `manifest.files["main.js"]`, includes inspectable local sources and embeds CSS text in `manifest.styles.light/dark`. The envelope carries publication metadata and optional `listing`. Installers do not need your local files or original directory paths. Do not handwrite a large JSON file containing escaped JavaScript; edit source files and let the packer generate it.

Appearance customization does not replace the built-in React logic or bypass SDK capabilities. Use isolated panels for your own interactive tools and explicit APIs for app operations. Server plugins, arbitrary session access and generic API writes are not supported.

## Publication drafts and returning from preview

The publisher automatically saves its fields, package source and screenshot references to this browser, separately for each account. Closing the form or reloading the page keeps the draft for up to 30 days. Reopening Upload extension restores it. **Stop preview** returns to Extensions and reopens that draft, even after navigating to another section during preview. **Discard draft** clears it, and successful publication clears it automatically.

Restoring a draft does not run code, restore capability consent or resume a live development watcher. Review and approve preview again. Device-local drafts are not synced across browsers. If browser storage is full/unavailable, the form reports the failure and refuses to close/start preview through its buttons so you can preserve your work. File-picker controls may look empty after restoration, but **Package ready** and the source inspector show the retained code package.


## Publish with Devdevian CLI

CLI 0.23+ accepts the **built** package, not the source config:

```sh
devdevian login
devdevian extensions list --query focus
devdevian extensions mine
devdevian extensions publish --file my-extension/dist/my-popups-1.0.0.devext.json
```

The command reads only the explicitly selected regular file (up to 256 KB), never evaluates its JavaScript and shows a publication preview with capabilities, included files, listing and SHA-256. Confirm with `yes`, or pass `--yes` deliberately for automation. `--json` returns structured output. Server validation, ownership, version monotonicity and publication quotas are unchanged. Publication does not install code. A connection failure after submission can have an unknown outcome: inspect `extensions mine` before retrying. Screenshots must already be your own unattached image upload IDs; use the browser publication form to upload images. This command does not upload arbitrary local image paths or execute extensions in the terminal.

Published releases appear in **profile → Extensions** (including your own profile). The global navigation search has an **Extensions** category that searches names, slugs, descriptions, tags and author usernames, and opens the exact matching card. Only the latest non-withdrawn release for each slug appears. Installed packages remain in **Extensions → Installed**; that private installation list is not a public profile feature.

## Focus Desk starter

[Download Focus Desk](/extension-examples/focus-desk.devext.json), or choose **Load Focus Desk example** in the publisher. Its [source directory](https://github.com/Tenyokj/devdevian/tree/main/examples/extensions/focus-desk) contains a working 25-minute focus timer, 5-minute break and personal scratchpad. The only grants are `ui.panel` and `storage`; there are no network or account-data permissions. Notes/timer state stay on this device and are not synced or suitable for secrets. The timer uses a wall-clock deadline to survive background tab throttling. The example is downloadable starter code, not an automatically installed or approved library release.

## Standalone developer tools (CLI 0.24+)

You no longer need a clone of Devdevian to start an extension. Install the CLI, then create a new source directory:

```sh
npm install -g @tenyokjs/devdevian-cli@alpha
devdevian extensions init my-extension
cd my-extension
devdevian extensions dev .
```

`init` creates `devdevian.extension.json`, `main.js` and a short README. It refuses an existing directory rather than overwriting files. The starter has a working panel, local storage and an SDK command. Edit these ordinary source files in your editor; add `light.css` and `dark.css` paths in the config if you want host styling.

`dev` opens a **local SDK playground**, bound to `127.0.0.1:4188`. Use `--port 4190` to change the port and `--no-open` to keep the browser closed. It does not log in, load `.env`, use a production database or send your code to Devdevian. The displayed forum surface and read APIs use sample data. Review the capability list and press **Start preview**. Source edits rebuild and reload the sandbox. A build error leaves the last running build visible with an error; a changed permission list stops preview until you review and start it again. Ctrl+C stops the local server.

The playground runs the same browser runner, scoped host CSS validator and SDK bridge as the forum. It is useful for panel logic, commands, layouts, appearance and local storage; its sample pages are not a substitute for checking your final extension with **Preview in my app** on the real forum. Network permissions still require explicit capabilities, browser CSP and the destination's CORS support. There are no accounts or provider credentials in the playground.

When ready:

```sh
devdevian extensions pack .
devdevian extensions publish --file dist/my-extension-1.0.0.devext.json
```

`pack` bundles the entry and its local imports, includes inspectable source and host CSS, validates the result and writes `dist/SLUG-VERSION.devext.json`. The same compiler is used by the repository's `extension:pack` script. Individual inputs are bounded to 192 KB; the complete validated manifest also has a 192 KB limit. `.env`, `.git`, `node_modules` and paths escaping the source directory are refused. Third-party bundles must be prepared separately within those limits. Treat every included source as public, and inspect the package before confirming publication.

## SDK 2 commands and shortcuts

Declare `ui.commands` in `permissions` to register up to eight commands for an enabled extension:

```js
const unregister = await devdevian.commands.register({
  id: 'notes.open',
  title: 'Open my notes',
  shortcut: 'Alt+Shift+N'
}, async () => {
  await devdevian.panel.configure({
    placement: 'top', title: 'My notes', width: 420, height: 300
  });
});

// Remove the command when your tool no longer needs it.
await unregister();
```

The forum provides a command menu labeled with the extension's name. This is also the fallback when an operating system intercepts a shortcut. Command IDs use 1–40 lowercase letters, digits, dots or hyphens and start with a letter. Titles are at most 60 printable characters. Optional shortcuts are deliberately limited to **Alt+Shift+A–Z** or **Alt+Shift+0–9**. The host invokes the callback; it never streams key events into the extension.

Shortcuts work while the host forum has focus. They do not fire while typing in an input, textarea, select or editable element, while a forum dialog is open, or inside an extension/app-view iframe. Repeated keys are ignored. If enabled extensions choose the same shortcut, the first registered matching host listener handles it; both commands remain available through their menus. Disabled, removed or restarted extensions lose their registered commands. Registering a command grants no extra data, navigation or network access: the callback must still use its explicitly granted SDK capabilities. Existing SDK 1 packages continue working; the current `devdevian.version` is `2`.

## Top and inline panels

Alongside the original placements, SDK 2 adds `top` and `inline`:

```js
await devdevian.panel.configure({
  placement: 'inline', title: 'My project tools', width: 600, height: 260
});
```

`top` places a floating panel near the top of the viewport. `inline` reserves space before the current page content and follows that slot as the page scrolls or resizes. The iframe stays mounted when it moves, preserving its running state. Changing app sections relocates the slot; use device-local SDK storage for durable user data. Size bounds still apply. Installed panels are visually parked while you manage the Extensions library so they do not cover update/install controls; their code remains running and commands are still available. Temporary developer previews remain visible there. **Disable** stops the code and removes its commands, styles and layout changes.

## Version history and deliberate updates

Publication is immutable. To ship changes, increment the semantic version in the source config and add `listing.changelog`, then pack and publish again:

```json
{
  "listing": {
    "changelog": "## 1.1.0\n\nAdded a notes command. Requires ui.commands.",
    "tags": ["productivity"]
  }
}
```

The changelog is Markdown text of at most 10,000 characters. The browser publisher has a **What changed in this version?** field, retained in its draft. Each library card has **Version history** with release notes and links to inspect individual versions. Review badges belong to each exact release; a reviewed 1.0.0 does not make 1.1.0 reviewed.

Open **Extensions → Updates** to see available newer releases. **Review update** shows the old/new version, author notes, added and removed capabilities, changed source/style filenames and a link to inspect the complete new package. Check the trust checkbox and explicitly confirm. Nothing auto-updates, including releases with unchanged capabilities. The server independently validates the exact target version and grants; withdrawn targets, unrelated authors/slugs, downgrades and stale requests fail without replacing the installed package. Updating a disabled extension keeps it disabled. Updating an enabled extension replaces the running version after confirmation. Device-local storage remains scoped to its account and slug.

The equivalent script commands are:

```sh
devdevian extensions history my-extension
devdevian extensions updates --json
devdevian extensions update theme-42
```

Use the **installed release ID** from `updates`, not a slug. The CLI previews the same version/capability/file comparison and requires confirmation (or an intentional `--yes`). A network error can leave a write's outcome unknown: inspect `extensions mine` before retrying. No automatic write retry is performed.


The compiler lives in `packages/cli/lib/extension-build.mjs`; shared code-package and listing rules live in `packages/cli/lib/sdk/`. The root validator modules re-export these rules for the server/browser. `npm run build` also generates the CLI playground bundle from the real runner component, so published packages carry the tested bridge rather than a separate mock implementation. Updates are paginated in pages of 12; script clients can use `extensions updates --page 2`. The SDK playground tests use sample data, while the application update tests use an isolated disposable database.


## Reporting and owner review

Use **Report this version** in a library card to describe a concern (10–1,000 characters). Reports refer to an immutable release, not every version of a package. One report per account/version is accepted, with a persistent limit of ten reports per day. Reporting never disables code automatically; this prevents mass reports from becoming an automatic takedown mechanism. Disable an installed package immediately if you do not trust it.

The server-configured, verified platform owner has a separate **Owner console**. Its extension queue includes unreviewed, reported, reviewed and withdrawn versions. Source inspection shows all packaged files as escaped text without running them, exact manifest SHA-256, declared capabilities, author notes, open reports and decision history. Static warnings flag private data plus network access, host UI changes and some suspicious source patterns. These checks are incomplete signals for human review, not malware detection or a safety certificate.

Marking a version Reviewed requires a note, source-inspection acknowledgement, exact manifest digest and the current review state. Stale decisions fail rather than overwriting another review. Reviews never transfer to a newer version. Revoking a review disables current installations; withdrawing also removes the release from discovery and blocks installation/update targets. It does not delete the immutable source or its audit history. Authors may withdraw their own versions but cannot reinstate or verify them.

Open clients recheck availability on visibility changes and approximately every 60 seconds. This is not an immediate remote process kill: already-running code may continue until the next successful refresh; an unresponsive tab must be closed and reopened in safe mode. Code, host CSS, layouts, secondary app views and commands are suspended while the owner console is open.

## Security boundaries

`data.read` includes work the installing user is authorized to read, including private communities. Combining it with `network:https://…` can send that content to an external service. The installation UI explicitly warns about this combination. Only grant it to code you trust. Neither a Reviewed label nor the isolated iframe imposes a CPU quota or guarantees that an extension cannot mislead its user.

## Developer Insights and profile panels

[Developer Insights](https://github.com/Tenyokj/devdevian/tree/main/examples/extensions/developer-insights) is a complete statistics extension, available in **Upload extension → Load Developer Insights example**. [Download the package](/extension-examples/developer-insights.devext.json), inspect its JavaScript and permissions, then preview or publish/install it. Requires Browser/API 1.6+. CLI 0.24 can pack/publish it; test profile panels using the current forum sandbox rather than that CLI's older standalone playground.

The dashboard includes a daily activity chart/calendar, current and longest window-bounded streaks, active-day percentage, action and contribution-state breakdowns, conversations, accepted solutions, code feedback, formal reviews, project attribution, declared technologies and topics. Its [metric definitions and privacy boundaries](https://github.com/Tenyokj/devdevian/tree/main/examples/extensions/developer-insights#metrics-and-boundaries) distinguish lifetime counters from the selected 30/90/365-day UTC activity window. Visits, reading time, online hours and GitHub-wide work are not tracked or inferred.

With `ui.panel`, an extension may mount a panel below the profile header:

```js
const context = await devdevian.context();
await devdevian.panel.configure({
  placement: "profile",
  title: "Developer Insights",
  width: 1200,
  height: 1100,
});
const unsubscribe = devdevian.onContext((next) => {
  // next.profile is { id, own } only when a profile is actually rendered.
  // It is null elsewhere. Clear old data and ignore stale in-flight requests.
});
```

`context.capabilities.profile_panels` and `context.capabilities.insights` identify support. Profile panels remain hidden on other routes. `onContext` delivers route/profile/theme context changes through the sandbox message channel; it does not expose DOM access, browser events or credentials. Return the unsubscribe callback when disposing a listener.

With `data.read`, `devdevian.data.get('/users/123/insights?days=90&scope=public&project_page=1')` returns bounded aggregate data. Only `days=30|90|365`, `scope=public|all` and a positive `project_page` are accepted; pages contain up to eight project attributions. `scope=all` requires the authenticated account to be that exact profile. Public scope never includes private-community activity, even for fellow members or the platform owner. Personal preference counters are returned only for the author's explicit private-inclusive view. Current server access is checked on each request, hidden/deleted profiles are unavailable to other viewers, responses are not cached, and rate limits apply. This endpoint grants no database or backend access.
