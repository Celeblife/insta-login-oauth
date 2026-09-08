# Instagram token refresh operations

This app keeps Instagram login and token persistence only. Downstream analytics
should read the stored Instagram user id and access token from Supabase, but the
analytics work stays outside this repository.

## What is implemented locally

- Vercel Cron calls `GET /internal/token-refresh` once per day at `23 0 * * *`
  UTC.
- The route runs only on Vercel Production.
- `CRON_SECRET` must be at least 32 bytes and must match
  `Authorization: Bearer <CRON_SECRET>`.
- `SUPABASE_PRODUCTION_PROJECT_REF` must match the project ref in
  `SUPABASE_URL` before the refresh job can touch the database.
- `SUPABASE_KEY` must be a Supabase `sb_secret_` key or a legacy
  `service_role` JWT.
- The refresh gate validates only its own runtime, authorization, and database
  requirements. Interactive login settings such as the redirect URI, app secret,
  contact email, and session cookie secret do not gate refresh; they remain
  required separately for the login flow.
- Failure responses and webhook payloads include aggregate counts only. They do
  not include access tokens, usernames, query strings, raw API errors, or raw
  exception strings.

## Production setup still required

Set these Vercel Production environment variables before deploying the cron:

- `CRON_SECRET`: random secret, minimum 32 bytes.
- `SUPABASE_PRODUCTION_PROJECT_REF`: exact production Supabase project ref.
- `TOKEN_REFRESH_ALERT_WEBHOOK_URL`: optional HTTPS webhook that accepts JSON
  with a `text` field.

The webhook is an operational alert only. If it is missing or fails, token
refresh can still succeed; failures are reported in the route response and
Vercel function logs. Actual alert receipt must be checked after deployment.

## Why Vercel Cron

GitHub Actions scheduled workflows can be delayed or disabled on public
repositories after long inactivity. Vercel Cron keeps the check beside the
deployed app and uses the existing Vercel Production secrets. On Hobby, the
expected cadence is once per day; the exact minute is not a strict runtime
guarantee.

Vercel Cron invocations are best effort. A failed invocation is logged, but it
is not automatically retried on the same day. The next daily run will evaluate
eligible tokens again, and operators can use the source CLI command below
as the manual fallback when the Vercel log or alert shows a failure.

Manual read-only check:

```bash
uv run python jobs/refresh_tokens.py --dry-run --expected-project-ref <ref>
```

Manual refresh fallback after checking the target project ref:

```bash
uv run python jobs/refresh_tokens.py --expected-project-ref <ref>
```

Use the source CLI above as the supported refresh command. This project does not
currently publish a working `refresh-tokens` console script.

This job is sized for the current small account workload. If the number of
stored accounts grows materially, review function duration, Meta rate limits,
and alert noise before relying on the same once-daily single invocation.

When `TOKEN_REFRESH_ALERT_WEBHOOK_URL` is not configured, failures still return
HTTP 503 and appear in Vercel logs, but no out-of-band alert is delivered.

## Token behavior

Instagram long-lived tokens are refreshed only by the backend refresh job. Meta
does not allow refreshing a token that is less than 24 hours old, and this
repository must not force-refresh a newly reconnected real account just to test
the job. Unit tests cover refresh success and failure paths; a real production
refresh is proven only when an eligible token is older than 24 hours and near
the refresh threshold.

If a token is expired or access was revoked, the route reports a failure or
reauth-required count. The account owner must reconnect; the app cannot renew a
revoked or expired token by itself.

## Security follow-up

Supabase management and service keys that were pasted into chat should be
rotated after the deployment is stable. Keep those keys out of Git and do not
send them to analytics repositories; hand off only the stored Instagram account
id and a securely transported token when needed.
