# Security verification for 0.7

This is a maintainer verification record, not an independent penetration test or a guarantee against compromise, outages or quota exhaustion.

## Scope

Reviewed server-side authorization, private project/task/media audiences, GitHub App tokens and provider transport, webhook signatures, SQL query parameterization, upload quotas, API error redaction, browser script policy and backup restoration. Functional checks use disposable databases and files. Production checks are read-only except the explicit additive schema preparation following a verified encrypted backup.

## Changes

- Private project audiences are selected at creation and preserved on edits. Project listings, direct reads, rooms, search and media enforce viewer access. Referencing a private project's logo or screenshots no longer qualifies them as publicly readable images.
- Issue import and PR association recheck permissions after provider waits and inside the final transaction. Private copies require explicit audience consent; stale fingerprints/versions are refused; repeated operations are deduplicated.
- Production CSP restricts executable scripts and API connections to the site origin, refuses embedded objects/frames and blocks framing. Fonts have explicit Google font origins. HTTPS remote images remain allowed. React's inline styles remain allowed; executable inline scripts and `eval` are not. Theme initialization uses a same-origin file.
- Upload attempt limits run before buffering the file body, in addition to existing file-type, byte, daily and storage reservations.
- Provider responses are bounded, timed out and kept separate from user-facing JSON errors and logs. Private GitHub credentials never reach browser or CLI bundles.

## Verification

The associated tests cover private project discovery/direct read/media access, cross-origin writes, safe malformed/oversized JSON errors, GitHub permission revocation during network waits, snapshot/operation replay, stale PR heads, explicit private consent, immutable association history and future-schema refusal. Browser checks exercise CSP and block a deliberately injected inline script; workflow checks cover browser and a real terminal.

Dependency audits cover the root production/development dependency tree and CLI tree. A clean audit means no advisories known to npm for that dependency set; it does not establish application security. Check deployment/CI records for the exact tested source and results.

## Operator responsibilities and limits

Keep Turso, object storage, OAuth and email credentials in server-side secret stores. Rotate any credential exposed outside those stores, deploy/test replacements, and then revoke the old credential. A code fix cannot undo a credential disclosure. Keep the encrypted backup key separately from its archives and verify scheduled backup success/retention.

An anonymous denial for a sampled storage object does not prove every bucket policy or historical object is correct. Local load checks do not establish production capacity or DDoS resistance. Monitor Vercel/provider quotas, errors and backup workflows; tune limits to the actual plan before attracting larger traffic. See [reliability](reliability.md), [GitHub App](github-app.md), [GitHub room work](github-room-work.md) and [security policy](../SECURITY.md).
