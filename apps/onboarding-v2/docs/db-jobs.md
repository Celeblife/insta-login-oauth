# DB and Jobs Notes

This app uses an additive v2 schema under `supabase/migrations/0001_onboarding_v2.sql`.
It preserves `users`, `tokens`, `user_consents`, and the v1 `complete_instagram_onboarding`
contract.

## Migration

- Apply only to the intended Supabase project after checking `SUPABASE_EXPECTED_PROJECT_REF` or legacy `SUPABASE_PRODUCTION_PROJECT_REF`.
- The forward migration adds v2 tables, service-only RPCs, RLS policies, outbox/job leases,
  and token metadata/CAS triggers. Draft onboarding contact payloads are stored only as sealed
  `draft_payload_encrypted` envelopes; finalize receives the server-decrypted payload explicitly
  and clears the envelope on completion, non-recoverable terminal, replacement, and cleanup paths.
  The sole terminal exception is a same-browser `OAUTH_CANCELLED` attempt: its draft envelope may
  remain only until the original draft TTL so the form can be restored, while OAuth state, code,
  tokens, candidate, and lease data are scrubbed immediately.
- Finalization accepts only the durable verified candidate path. It binds the exact account, token
  metadata, encrypted long-token checkpoint, and a temporary raw-token fingerprint before any
  user/token/request/outbox write; confirmation-required candidates release the processing lease so
  the browser's explicit confirmation can acquire a new fenced lease immediately.
- The rollback companion lives outside the migration chain at
  `supabase/rollback/0001_onboarding_v2_rollback.sql`. It is non-destructive: it revokes v2
  execution/table access, dead-letters unsent v2 notifications, and releases v2 leases. It does
  not drop v2 data.

## Internal Jobs

All internal routes support `GET` for Vercel Cron and `POST` for protected manual runs. They require
`Authorization: Bearer $CRON_SECRET`, `INTERNAL_JOBS_ENABLED=true`, a valid `APP_ENV`, exact
`SUPABASE_EXPECTED_PROJECT_REF` (or legacy `SUPABASE_PRODUCTION_PROJECT_REF`), and exact `VERCEL_PROJECT_ID_EXPECTED`. The handlers declare
`maxDuration = 60`; provider/SMTP timeouts should stay below that budget and DB leases are 90s.

- `GET|POST /internal/token-refresh`
- `GET|POST /internal/notification-retry`
- `GET|POST /internal/onboarding-cleanup`

SMTP is disabled by default with `MAIL_ENABLED=false`. The notification recipient is fixed to
`dkssud374@celeblife.co.kr`; user input is never used as To/From/Reply-To/CC/BCC. Canonical SMTP
configuration is `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`, and `SMTP_REQUIRE_TLS=true` for
STARTTLS. Legacy `SMTP_USERNAME`/`SMTP_FROM` are tolerated only as fallback names. Token refresh
uses the allowlisted Meta endpoint `https://graph.instagram.com/refresh_access_token` and does not
require or send an app secret.

## Verification

Actual disposable PostgreSQL verification is runnable with:

```sh
TEST_POSTGRES_BIN_DIR=/path/to/postgres/bin \
TEST_POSTGRES_SHARE_DIR=/path/to/postgres/share \
TEST_POSTGRES_LIBRARY_DIR=/path/to/postgres/libs \
npm run test:db
```

Production DB, real SMTP delivery, and real Instagram refresh remain `NOT_RUN` until approved
credentials and targets are provided. Destructive reset execution is intentionally unsupported in
this app: the reset script performs read-only graph/count checks only, rejects execution flags, and
always reports `destructiveStatementsExecuted: 0`.
