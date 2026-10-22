# Authentication configuration

Email/password registration uses a six-digit verification code. Google and GitHub use OAuth authorization-code flows. Providers remain unavailable until their server-side credentials are configured; delivery is never simulated in normal operation.

Copy `.env.example` to `.env` for local development. Keep secrets out of Git, browser code, logs, and screenshots. Use Vercel's environment settings for hosted deployments, with different values for preview and production.

## Origins and callbacks

`APP_URL` must exactly match the browser origin. `localhost` and `127.0.0.1` are different origins.

| Environment | Origin example |
| --- | --- |
| Local | `http://127.0.0.1:4173` |
| Production | `https://devdevian.vercel.app` (hosted instance) |

Callback paths are `/api/auth/google/callback` and `/api/auth/github/callback`. Keep a stable testing origin and separate OAuth clients for local/testing and production where supported. Do not register every short-lived preview address against production credentials.

## Google

Create an OAuth web application in Google Cloud, configure the consent screen and authorized test users as needed, and register the exact callback URL. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` on the server. Use only the identity scopes the app requests. Complete any provider-required publication/verification steps before opening sign-in to the public.

## GitHub

Create a GitHub OAuth App with the exact homepage and callback origin. Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`. Use a separate app for local development. When a new provider returns an existing account email, the inline flow sends a one-time confirmation code to that address, bound to a browser cookie. Confirmation links the provider and signs into the same account. Subsequent sign-ins use the stored provider identity. Explicit Settings linking requires the existing signed-in session; matching email alone never silently links identities.

## Verification email

Email supports two providers. Set `MAIL_PROVIDER=brevo`, `BREVO_API_KEY`, and `MAIL_FROM` for Brevo, or `MAIL_PROVIDER=resend`, `RESEND_API_KEY`, and `MAIL_FROM` for Resend. Omitting `MAIL_PROVIDER` preserves the Resend default. `MAIL_FROM` must be an email address or a `Name <email>` sender that is verified with the selected provider.

Brevo supports a free plan and individual sender verification; account review/transactional activation may still be required. With a free mailbox sender, Brevo can replace the sender domain with `brevosend.com`. A custom authenticated domain improves control over sender identity and deliverability. Resend requires a permitted sender/domain for delivery to arbitrary users. A `vercel.app` hostname is not a sending domain you own. Check provider terms and test a real recipient; API acceptance alone is not proof of delivery.

The server stores a hash of each code, expiry, attempt count, and resend timing. Verification creates the account only after a valid challenge. Never expose verification codes in the client or disable verification in production.

## Username and authorization

Email registration chooses a permanent username before verification. New OAuth users choose it once at first sign-in. Usernames are case-insensitively unique in the database. Display names remain editable. Platform moderator privileges come from `MODERATOR_EMAILS`; community owners appoint their own validators.

Provider setup alone does not make local SQLite and uploads deployable to Vercel. Configure the [cloud storage adapters](deployment.md) and verify the hosted flows before production launch.

## Password recovery

Sign in → Forgot your password sends a six-digit, ten-minute recovery code for an existing verified mailbox. Enter the code and a new password; a valid reset changes the verifier and revokes every session and saved-device login. It does not automatically sign in or change the permanent username. Google/GitHub identities stay linked; a verified provider-created account can also establish an email password through this explicit mailbox-confirmed flow.

Request responses do not disclose whether an address exists. Delivery is performed synchronously, so response timing can differ; registration already reports duplicate email addresses. Codes are hashed, single-use, expire and permit at most five attempts; cooldowns and persistent IP/email/mail budgets restrict abuse. See [reliability](reliability.md) for limits and deployment requirements.
