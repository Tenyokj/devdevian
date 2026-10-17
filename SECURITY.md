# Security policy

## Supported status

Devdevian is an early development release and has not received an independent security audit. There is no stable release support schedule yet. Security fixes target the current development branch.

## Reporting a vulnerability

Do not post exploit details, credentials, user records, session cookies, or private community content in public issues.

When this repository is hosted on GitHub, use its **Security → Advisories → Report a vulnerability** feature if private vulnerability reporting has been enabled by the maintainer. If it is unavailable, ask the maintainer to establish a private reporting channel before sending sensitive details. A dedicated security contact has not yet been configured.

Include the affected revision, relevant endpoint, minimal reproduction with synthetic accounts, expected access boundary, and observed impact. No response-time guarantee or bug bounty is currently offered.

## Maintainer deployment responsibilities

- Enable private vulnerability reporting and set a monitored contact before public launch.
- Keep production, preview, acceptance, and development data and secrets separate.
- Configure HTTPS and exact OAuth callback URLs. Keep secrets server-side, never in `VITE_*` variables.
- Do not expose the local demo server or seed demo credentials in production.
- Use durable private database/object storage; local function filesystems are not production persistence.
- Verify account, membership, moderator, attachment, and notification access after deployment.
- Keep encrypted backups and test restoration. Exclude backups and personal data from repository history.
- Review rate limits, distributed abuse protection, dependency updates, and upload retention before public registration.

The repository's automated tests verify specific application behaviors; they do not establish that every deployment is secure.
