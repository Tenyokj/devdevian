# Authentication configuration

Email/password registration uses a six-digit verification code. Google and GitHub use OAuth authorization-code flows. Providers remain unavailable until their server-side credentials are configured; delivery is never simulated in normal operation.

Copy `.env.example` to `.env` for local development. Keep secrets out of Git, browser code, logs, and screenshots. Use Vercel's environment settings when the cloud backend is ready, with different values for preview and production.

## Origins and callbacks

`APP_URL` must exactly match the browser origin. `localhost` and `127.0.0.1` are different origins.

| Environment | Origin example |
| --- | --- |
| Local | `http://127.0.0.1:4173` |
| Production | `https://devdevian.vercel.app` (after confirming availability) |

Callback paths are `/api/auth/google/callback` and `/api/auth/github/callback`. Keep a stable testing origin and separate OAuth clients for local/testing and production where supported. Do not register every short-lived preview address against production credentials.

## Google

Create an OAuth web application in Google Cloud, configure the consent screen and authorized test users as needed, and register the exact callback URL. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` on the server. Use only the identity scopes the app requests. Complete any provider-required publication/verification steps before opening sign-in to the public.

## GitHub

Create a GitHub OAuth App with the exact homepage and callback origin. Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`. Use a separate app for local development. Existing email accounts must sign in before linking a provider; matching email alone does not silently link identities.

## Verification email

The current implementation sends transactional email through Resend. Set `RESEND_API_KEY` and a permitted `MAIL_FROM`. A verified sending domain is normally required for delivery to arbitrary users; a `vercel.app` address is not a domain you own for mail verification. Without an owned sending domain, select and implement a suitable alternative email provider before public registration. A test sender is not evidence of public delivery readiness.

The server stores a hash of each code, expiry, attempt count, and resend timing. Verification creates the account only after a valid challenge. Never expose verification codes in the client or disable verification in production.

## Username and authorization

Email registration chooses a permanent username before verification. New OAuth users choose it once at first sign-in. Usernames are case-insensitively unique in the database. Display names remain editable. Platform moderator privileges come from `MODERATOR_EMAILS`; community owners appoint their own validators.

Provider setup alone does not make local SQLite and uploads deployable to Vercel. Configure the [cloud storage adapters](deployment.md) and verify the hosted flows before production launch.
