# Reliability and recovery

Version 0.1.1 adds recovery and operational safeguards. Passing automated tests is not an independent security audit, an uptime guarantee, or proof that a particular deployment's backups are enabled.

## Database migrations and release order

Hosted request handlers **do not migrate the database**. A cold function checks the schema version and reuses one initialized app. A missing/outdated schema returns JSON 503 with a request ID. This avoids repeating catalog imports and schema writes across cold instances when database capacity is limited.

1. Verify a complete encrypted backup of the existing database and files.
2. Run isolated tests against local fixtures, never against production resources.
3. Load the selected production environment explicitly and run the additive migration **before deploying code that requires it**:

   ```sh
   node --env-file=.env.production.local scripts/migrate.mjs
   ```

4. Deploy, then check `/api/health`, a signed-out feed, a signed-in profile, password recovery, and private attachment access.
5. Keep preview credentials separate. Do not run fixture seeding or local data resets with production credentials.

The version marker is written only after all migrations complete. Existing module migrations remain idempotent so an interrupted migration can be retried. Run one migration operator at a time. The committed Vercel region is `dub1`, matching the original deployment's Ireland database; independent deployments should choose a region near their own primary database.

## Encrypted backups

`npm run backup -- create` exports a consistent read transaction to a standalone SQLite database and copies every object referenced by its uploads table. Objects are immutable by ID. Missing objects and size mismatches fail the job instead of producing a misleading successful backup.

The archive is compressed and encrypted with AES-256-GCM, a fresh random nonce, an authentication tag, and SHA-256 file checksums inside the encrypted manifest. Account data and password verifiers are retained. Sessions, saved-device sessions, OAuth states/link challenges, pending registrations, password reset codes, and incomplete upload reservations are excluded. Restoring a backup requires users to sign in again; old authentication challenges cannot be resurrected.

Every creation command decrypts and restores its archive into a new temporary directory, checks SQLite integrity/foreign keys and table counts, verifies every file's checksum and metadata, then removes that temporary copy. A failed verification prevents artifact publication.

### Activate scheduled backups

The **Encrypted backup and restore check** GitHub Actions workflow runs daily, with a manual `workflow_dispatch` option. It needs these repository Actions secrets:

- `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`
- `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
- `BACKUP_ENCRYPTION_KEY`: a random **64-character hexadecimal** value, generated locally with a cryptographic RNG. Store a separate offline/password-manager copy. Losing the key makes recovery impossible.

Use a dedicated database backup token with read/write permission only if running the included maintenance step; without maintenance the exporter itself only reads the database. Keep access restricted to this application's database and storage project.

Only the `.ddb` encrypted artifact is uploaded to GitHub, separate from the application storage provider, with seven-day retention. No plaintext exports or user data belong in Git. The default input budget is **50 MiB per backup**, intended to leave headroom for seven copies under a small artifact-storage allowance. It is deliberately lower than the application's upload cap. If data grows beyond it, the workflow fails visibly: review retention, artifact storage allowance and an independent backup destination before increasing `BACKUP_MAX_BYTES`. Do not disable file inclusion to make a failing full backup appear successful. Existing account usage and provider limits must also be reviewed.

Scheduling depends on GitHub Actions being enabled and available; monitor successful runs and artifact existence. A committed workflow is **not** an activated or verified production backup. Planned recovery point is one successful daily snapshot; recovery time depends on dataset size and operator restoration checks. Keep an additional downloaded encrypted copy if you need recovery after GitHub account loss.

### Verify or recover an archive

With the correct key available only in the process environment:

```sh
npm run backup -- verify backups/example.ddb
npm run backup -- restore backups/example.ddb /absolute/path/to/new-recovery-directory
```

Restore refuses an existing target directory. It never overwrites a running database or cloud bucket. For recovery of the hosted service, first import the restored SQLite into a **new** libSQL database, upload the restored `uploads/` files with the same object IDs to a **new private** bucket under `uploads/<id>`, run current migrations against the new database, test access with a separate preview, and only then switch production environment settings. Recheck file authorization and revoke/rotate credentials if recovering from compromise. Provider import procedures vary; do not blindly execute unreviewed SQL against production.

## Error visibility and availability

API errors and initialization failures log structured events with a generated request ID, error category, and source locations. They do not log passwords, bodies, cookies, email addresses, SQL or arbitrary dependency error messages. Requests over two seconds produce `slow_request` events. Vercel log retention remains provider-controlled; there is no permanent external log store in this release.

`/api/health` makes a minimal database query. The **Production health** workflow checks it about twice hourly, retries transient failures, and fails the workflow if the API is unhealthy. Enable GitHub Actions failure notifications for the maintainer account and run it manually once after deployment. This is periodic detection, not real-time alerting or an end-to-end OAuth/mail/storage availability test.

When database capacity is exceeded, callers receive JSON 503 with `Retry-After`; failed app initialization is held for 15 seconds before another attempt. The frontend handles plain-text/HTML hosting errors, bounds request time, does not automatically replay mutations, and shows a support request reference when available.

## Quotas and cleanup

Defaults, configurable through server-only environment variables:

| Resource | Default |
| --- | --- |
| Auth attempts | 120 per IP and 40 per supplied email per 15 minutes |
| Registration/reset requests per address | One per minute for each flow |
| Mail sending attempts | 200 per UTC day globally, 10 per recipient |
| Verification/reset challenge | 10 minutes, at most five code attempts |
| Upload size | 4 MiB each |
| Uploads per user | 40 files and 40 MiB in the preceding 24 hours |
| Application storage | 750 MiB, including in-progress reservations |

Mail attempts are reserved before provider calls, including failed deliveries. Review provider timezones/limits and usage outside Devdevian; the application cannot budget unrelated sends on a shared provider account. Upload reservations are committed before object writes, so parallel instances cannot oversubscribe the configured byte budget. A failed object cleanup retains its reservation for later maintenance.

`npm run maintenance` deletes expired authentication records, old quota counters, and objects left by incomplete uploads older than one hour. It does not delete published uploads or community content. The backup workflow runs maintenance before its snapshot.

These limits protect specific paid/quota-sensitive operations. They are not global DDoS protection. Configure hosting firewall/bot rules and spending limits appropriate to your provider. The synchronous libSQL adapter still limits per-instance throughput during remote I/O; isolated local load results must not be presented as hosted capacity guarantees.

## Regression checks

`npm test` covers recovery-code expiry/replay/attempt caps, session revocation, backup tampering/wrong keys/missing objects, restoration, schema markers, quota atomicity, API errors, existing private-space boundaries, and ordinary forum behavior. The libSQL/S3 fixture matrix exercises the cloud adapter contract. `npm run test:browser` covers desktop, tablet, mobile navigation, dialogs, media and recovery UI.

`npm run test:load` uses a disposable local database with 500 posts and 1,500 replies and sends 210 requests with concurrency 10. It cannot contact production database or storage. Measure actual hosted latency separately with a small read-only smoke check; do not stress the live free-tier service or create fake public activity.
