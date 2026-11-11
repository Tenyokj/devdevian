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
