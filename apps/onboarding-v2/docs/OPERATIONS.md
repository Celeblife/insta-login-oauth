# Onboarding v2 operations runbook

This runbook covers local verification and a future, separately approved rollout. It does not authorize a production migration, reset, deployment, Meta mutation, token refresh, or email delivery.

## Application boundary

- Vercel root directory: `apps/onboarding-v2`
- Runtime: Node.js as pinned by `.nvmrc` and `package.json`
- Existing root application, root `vercel.json`, legacy database objects, and legacy callback remain protected.
- Database migration is additive. Never apply files under `supabase/rollback/` as forward migrations.

## Local verification

```bash
npm ci
npm run test:reference
npm run verify
npm run test:e2e
npm run test:a11y
```

The Postgres suite requires a disposable PostgreSQL 16 installation through the `TEST_POSTGRES_*` variables documented by the DB test harness. It must run against a disposable cluster, never a shared or production database.

## Environment isolation

Use `.env.example` as the setting inventory. Secrets belong in the approved secret store and must not be copied into Git, tickets, logs, screenshots, or reports.

External side effects are fail-closed:

- mock provider is permitted only outside production;
- SMTP, refresh, notification retry, and cleanup each require an explicit enable flag;
- internal jobs require `Authorization: Bearer <CRON_SECRET>`;
- every external Supabase-backed application path and every enabled job requires exact `APP_ENV`, Supabase project ref, and Vercel project identity values;
- side-effecting jobs accept only exact `APP_ENV=staging` or `APP_ENV=production` and do not alias preview, development, or test environments;
- a Vercel deployment whose `VERCEL_ENV` is `production` is not by itself company production.

The approved mail transport is NAVER WORKS SMTP. The non-secret defaults are
`smtp.worksmobile.com:465`, SSL enabled, and `dkssud374@celeblife.co.kr` for the authenticated
account, sender, and fixed internal recipient. Store only a NAVER WORKS third-party app password in
`SMTP_PASSWORD`; never use or record the member's normal account password.
`NOTIFICATION_ADDITIONAL_TO` may add one internal recipient as a bare mailbox. Leave it empty unless
an approved address is supplied through the secret/config store. The fixed recipient remains
mandatory, a duplicate of it is de-duplicated, and the app treats the notification as sent only when
every configured To recipient is accepted by SMTP with no rejected recipients. Both recipients are
visible to each other in the message To header.

Recipient settings are read when the notification job runs. Changing `NOTIFICATION_ADDITIONAL_TO`
affects future attempts for still-pending or recoverable processing events, but it does not backfill
events already marked sent or dead. Because retry remains event-level, a partial SMTP acceptance can
cause a later retry to duplicate mail to a recipient that already received the earlier attempt.

Before any approved rollout, record the non-secret target identities and compare them with the protected settings. A mismatch must stop before opening a provider, SMTP, or database side-effect connection.

## Scheduled jobs

`vercel.json` declares the proposed schedules:

| Job | Route | UTC schedule | Required flag |
| --- | --- | --- | --- |
| Token refresh | `/internal/token-refresh` | `23 0 * * *` | `TOKEN_REFRESH_ENABLED=true` |
| Notification retry | `/internal/notification-retry` | `13 1 * * *` | `NOTIFICATION_RETRY_ENABLED=true` |
| Session cleanup | `/internal/onboarding-cleanup` | `43 0 * * *` | `ONBOARDING_CLEANUP_ENABLED=true` |

Vercel Cron invokes these routes with `GET`. Manual protected `POST` calls may be retained for controlled staging diagnostics. Notification retry is scheduled once daily for Vercel Hobby compatibility; immediate after-response delivery remains the primary notification path after a registration is accepted. Cron delivery is best effort, so database leases, due times, stale-processing recovery, and job health queries are the recovery source of truth.

## Observability

Log only typed event names, result codes, counts, durations, and generated trace IDs. Never log request URLs containing OAuth query values, raw `code`, `state`, cookies, access tokens, secrets, contact values, SMTP content, or internal SQL details.

Operational checks distinguish:

- HTTP invocation from successful work;
- provider response from committed token state;
- SMTP acceptance from inbox delivery or human reading;
- successful first registration from reconnection (which creates no new analysis request);
- ordinary provider failure from `reauth_required` and CAS-skipped writes.

Monitor last successful run, oldest overdue refresh, oldest pending notification, dead notification count, lease age, and `reauth_required` count without selecting token or PII columns.

## Staged rollout (separate approval required)

1. Confirm the exact deployment, Supabase, Meta, callback, policy, retention, public-contact, SMTP, commercial-plan, and token-storage-risk gates.
2. Apply the additive migration to an isolated test database and run the complete PostgreSQL suite.
3. Deploy this app as an isolated staging project with all external write flags off.
4. Verify the mock flow, browser binding, receipt expiry, production artifact scan, and legacy callback compatibility.
5. With approved test credentials only, verify actual Meta, SMTP delivery, and one eligible token refresh; record each separately.
6. Run the read-only reset inspection against the exact approved target and immutable allowlist. This app does not provide an execution mode; it must report zero writes.
7. After an explicit production approval, apply the additive migration, deploy, drain in-flight callbacks, assign token-refresh ownership to one service, then enable jobs one at a time.

## Pausing the production deployment

Vercel can pause the whole `celeblife` project without touching deployments, code, environment variables, or domains. While paused, every alias (including `celeblife.vercel.app` and `insta-login-oauth-preview.vercel.app`) returns `503 DEPLOYMENT_PAUSED`. Unpausing restores the same production deployment immediately; no redeploy is needed.

The installed Vercel CLI has no pause command, so call the REST API with the CLI's stored login token. The endpoint needs the project and team IDs, not their names; run `vercel link` at the repository root once to write them to the untracked `.vercel/project.json`.

```sh
# run from the repository root
TOKEN=$(python3 -c "import json;print(json.load(open('$HOME/.local/share/com.vercel.cli/auth.json'))['token'])")
PROJECT=$(python3 -c "import json;print(json.load(open('.vercel/project.json'))['projectId'])")
TEAM=$(python3 -c "import json;print(json.load(open('.vercel/project.json'))['orgId'])")

# pause
curl -sS -X POST -H "Authorization: Bearer $TOKEN" "https://api.vercel.com/v1/projects/$PROJECT/pause?teamId=$TEAM"
# resume
curl -sS -X POST -H "Authorization: Bearer $TOKEN" "https://api.vercel.com/v1/projects/$PROJECT/unpause?teamId=$TEAM"

# verify: 503 while paused, 200 after resume
curl -sS -o /dev/null -w '%{http_code}\n' https://celeblife.vercel.app
```

Cron routes are served from the same domain, so while paused the scheduled jobs above also stop doing work: token refresh, notification retry, and session cleanup. Instagram long-lived tokens expire 60 days after their last refresh, so a pause of a few days is safe, but a pause measured in weeks starts expiring tokens and forces each creator to log in again. Unpause, or move token refresh to another owner, before that window closes.

### Pause log

| Paused (UTC) | Resumed (UTC) | Reason |
| --- | --- | --- |
| 2026-11-02 01:26 | still paused | Requested by the project owner as a temporary stop. |

## Incident containment and rollback

If authentication failures, persistence failures, authorization exposure, or token-consumer incompatibility increase:

1. disable new onboarding starts;
2. keep valid in-flight callback/complete routes available long enough to drain;
3. disable v2 background-job ownership before enabling a legacy owner;
4. roll back application traffic or UI routing without rolling back the database migration;
5. preserve valid v2 profiles, requests, receipts, and audit records;
6. do not recreate deleted credentials or restore old test tokens automatically.

The rollback SQL is a reviewed emergency aid, not a deployment step. It must not be applied while v2 data or in-flight attempts exist, and must never be run automatically.

## External gates

The following remain `NOT_RUN` until credentials, exact targets, and explicit operational approval exist: real Meta authorization and permission inspection, NAVER WORKS authentication and inbox delivery, eligible real-token refresh, Vercel deployment/Cron observation, company-production migration, scoped data reset, and physical-device/in-app-browser verification.
