# Browser extensions: themes

Extensions let you change the browser forum's appearance for your own account. The first extension format supports themes: a palette, one of three bundled font stacks and a corner style. It does not execute JavaScript, load external assets or accept arbitrary CSS. Functional plugins, rewards and payments are not implemented.

## Discover, preview and install

Open **Extensions** from the forum sidebar or Settings → Appearance & extensions. Discover includes four bundled themes and published community themes. Search by name or description, or filter for reviewed versions.

Open a theme card to see its palette applied to a small workspace preview. **Install & apply** stores that exact version for your account and applies it to the browser app. Other users keep their own appearance. Your installed choices follow your account on other browsers after sign-in; CLI, documentation and landing themes remain independent.

**Installed** keeps the versions you selected. Apply another installed version, remove one, or choose **Restore default** to use the normal light/dark appearance without removing your library. The header theme button also restores the default when an extension is active. Removing an active version restores the default.

The client rechecks the active version on sign-in, when returning to the tab and once per minute while visible. It clears custom tokens before switching accounts. If an appearance lookup fails, the browser falls back to the default instead of using a previous account's cached theme.

## Review labels and withdrawal

**Reviewed** means a configured Devdevian reviewer marked this exact, immutable version as reviewed. It is not a guarantee of safety or accessibility in every screen. Bundled themes ship with the application; community versions start unreviewed and need an explicit acknowledgement before installation.

A new version does not inherit a review and never replaces an installed version automatically. Check its preview and label, then install it yourself. Revoking review clears active selections for that version; applying it again requires acknowledging its unreviewed status. Withdrawal makes it unavailable for installation and application. Existing clients stop applying it at their next successful refresh. An already open offline tab cannot receive immediate revocation.

Authors can withdraw their own versions. Only separately configured extension reviewers can mark community versions reviewed, revoke a review or restore a withdrawn version. Platform/community moderator status alone does not grant that capability. Review changes keep an audit record.

## Publish your first theme

1. Sign in, finish choosing your permanent username and open **Create a theme**.
2. Choose a bundled palette as a starting point. Give it a descriptive name, a unique lowercase slug and a version such as `1.0.0`.
3. Edit palette tokens, font and corners. The preview is local; changing inputs does not install or publish anything.
4. You can import a JSON file smaller than 8 KB, paste a manifest or export the current manifest.
5. Publish the version. It becomes publicly listed as an unreviewed community theme. To try it on your account, open it and explicitly install it.

Names allow 3–60 characters; descriptions allow 20–1,200. Slugs have 3–48 characters, start with a lowercase letter and contain lowercase letters, digits or hyphens. Slugs are owned by the first author and cannot be taken by another account. Bundled theme slugs are reserved. An existing slug requires a strictly higher `major.minor.patch` version; prerelease labels are not supported in this format. The server caps publications at 100 versions per author and installed versions at 100 per account, with additional hourly write limits.

## Manifest reference

Every field below is required. Unknown fields and unknown palette keys are rejected.

```json
{
  "schema": 1,
  "kind": "theme",
  "mode": "dark",
  "font": "default",
  "corners": "round",
  "palette": {
    "canvas": "#10101e",
    "surface": "#1a1d29",
    "surfaceSoft": "#141721",
    "text": "#f4f5fc",
    "secondary": "#c4c8d9",
    "muted": "#a5abc2",
    "line": "#34394e",
    "accent": "#baa9ff",
    "accentSoft": "#262938",
    "accentLine": "#baa9ff",
    "sidebar": "#10101e",
    "code": "#10131c"
  }
}
```

| Field | Allowed values | Purpose |
| --- | --- | --- |
| `schema` | `1` | Format version |
| `kind` | `theme` | Appearance extension type |
| `mode` | `dark`, `light` | Base styles and browser color scheme |
| `font` | `default`, `mono`, `system` | Existing local/bundled font stacks; no font URLs |
| `corners` | `round`, `soft`, `square` | Allowed rounding presets on supported app cards |
| `palette` | Exact token set above | Six-digit `#RRGGBB` colors only |

Text and secondary text must have at least 4.5:1 contrast against canvas, surface, surfaceSoft and sidebar. Muted text needs at least 3:1 on those surfaces; accents need 3:1 against the reading surfaces and accentSoft. The code background must keep the fixed light code text readable at 4.5:1. These checks protect basic readability; they do not replace testing the actual UI, keyboard focus, mobile layouts or every semantic status color.

Themes do not replace the built-in semantic colors for success, errors, code tokens and content tags. They do not hide controls, change permissions or inject HTML. Some component shapes remain fixed where required for layout.

## HTTP API

All endpoints are under `/api`. Mutations require the normal authenticated account and same-origin protections. Reads return no authentication tokens, email addresses or installation lists for other users.

| Method and path | Action |
| --- | --- |
| `GET /extensions/library?q=&filter=reviewed&page=1` | Bundled themes and bounded community listing |
| `GET /extensions/me` | Your installed versions, active theme, publications and reviewer capability |
| `GET /extensions/releases/:id` | An exact version and its review state |
| `POST /extensions/publish` | Publish `{name,slug,version,description,manifest}` |
| `POST /extensions/install` | Install/apply `{release,acknowledge_unreviewed}` |
| `PUT /extensions/active` | Apply an installed version or restore default with `{release:null}` |
| `DELETE /extensions/installs/:id` | Remove your installed version |
| `PATCH /extensions/releases/:id/review` | Review or withdraw with `{status,note}` and appropriate authority |

Community IDs use `theme-123`; bundled IDs include `devi-violet`, `amber-night`, `mint-terminal` and `solar-paper`. Use returned IDs instead of inferring them from a name. A `409` can indicate a version/slug conflict, a missing acknowledgement or a publication limit. `503` means the operator has not prepared Extensions tables yet.

## Operating and recovering Extensions

The server never creates these tables on a hosted request. Take and verify an encrypted database/file backup, then use `node scripts/migrate.mjs --prepare-extensions` with explicitly selected operator credentials. This is additive, preserves schema marker 7 and existing data, and can be prepared while the previous release remains active. The `extensions` action in the backup workflow performs preparation only after backup verification and artifact upload.

Configure `EXTENSION_REVIEWER_EMAILS` with a comma-separated list of trusted, verified account emails on the server. An unset list gives no community review authority. Do not expose this setting through `VITE_` variables. Keep it separate from community/platform moderation.

Publication data, installed selections and review history are ordinary database records included by the encrypted backup system. Restore rehearsals verify theme state while omitting authentication sessions. To roll back application code, leave additive tables in place; never overwrite new user work with an old database just to disable a feature.

Implementation: [manifest validation](https://github.com/Tenyokj/devdevian/blob/main/extension-manifest.mjs), [API and schema](https://github.com/Tenyokj/devdevian/blob/main/extensions.mjs), [browser library](https://github.com/Tenyokj/devdevian/blob/main/src/extensions.jsx). Report rendering bugs through [GitHub issues](https://github.com/Tenyokj/devdevian/issues); report a security issue using [SECURITY.md](https://github.com/Tenyokj/devdevian/blob/main/SECURITY.md).
