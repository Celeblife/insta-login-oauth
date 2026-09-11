# Onboarding v2 architecture

## Boundary

Onboarding v2 is an isolated Next.js App Router application. The browser receives only public attempt state and a host-bound session cookie. Provider credentials, OAuth checkpoints, service-role database access, SMTP credentials, and contact snapshots stay on the server.

The production repository is Supabase/PostgreSQL. The in-memory repository and mock Instagram provider exist only for local and browser-contract tests and are rejected in production.

## Request flow

1. `GET /api/onboarding/bootstrap` creates or resumes a browser binding and returns a CSRF token, current policy bundle, and any authorized public attempt state.
2. `POST /api/onboarding/start` checks exact Origin, CSRF, body size, field/policy validation, browser rate limits, and a request-key fingerprint. One database transaction creates or replays the attempt and its OAuth state.
3. Meta returns to the v2 callback at `/auth/instagram/callback` (the API alias `/api/onboarding/auth/callback` delegates to it). The separate `/auth/callback` route is the legacy v1 compatibility bridge. The v2 callback validates state and browser binding, encrypts and checkpoints the raw one-time code, invalidates state, and immediately issues a clean `303` to `/connecting?attemptId=...`. It performs no token exchange.
4. `POST /api/onboarding/complete` claims a fenced processing lease. It resumes only from durable checkpoints: code exchange begun, short token stored, long token stored, and account candidate stored. An ambiguous one-time-code exchange is never retried blindly.
5. If the returned Instagram account differs from the submitted handle, the server exposes a non-sensitive confirmation candidate. `POST /api/onboarding/confirm-account` checks attempt revision before finalization; `POST /api/onboarding/restart` atomically retires the old attempt or replays the same child for the same request key.
6. The final PostgreSQL transaction locks the account, applies precise `(started_at, attempt UUID)` ordering, upserts profile/token/consent, creates exactly one connection history and optional first-analysis request, creates one receipt, and enqueues one notification event.
7. The `/complete` page and `GET /api/onboarding/status` authorize the browser before revealing whether an attempt completed and enforce the receipt expiry before returning PII.

## Durable state

```text
pending -> callback_received -> exchanging_short -> short_token_checkpointed
                                                   |
                                                   v
completed <- saving <- awaiting_account_confirmation <- fetching_account
                                                   ^
                                                   |
                         long_token_checkpointed <- exchanging_long

Any unfinished stage may terminate as failed, cancelled, or expired.
Replacement retires the prior attempt with a terminal status and failure code;
there is no separate persisted `replaced` status.
```

Processing writes require the current lease owner, an unexpired lease, and a fencing token. External progress is checkpointed before moving to the next provider operation. A completed attempt is immutable; authorized receipt replay does not re-run provider or database writes.

OAuth cancellation destroys provider credentials/state but may retain the original draft only for the same browser and original draft TTL. Expiry, replacement, deletion, or a different browser never exposes a recoverable draft.

## Concurrency invariants

- Start and restart idempotency are database-enforced by browser, request key, parent (for restart), and canonical payload fingerprint.
- A valid processing lease is not replaced by bootstrap or another tab.
- The newest successfully finalized authorization for an Instagram account wins according to PostgreSQL timestamp precision and canonical UUID tie-breaking.
- Reconnection preserves the existing v2 user and first review state, creates a `not_requested` connection record, and creates no new analysis request.
- Token refresh updates use row-version and eligibility predicates in the same statement; deletion is never repaired with an upsert.
- Outbox claims and terminal writes require owner, fencing value, and an unexpired lease. SMTP acceptance can still lead to duplicate delivery if the sent-state write is lost; the stable event key and Message-ID reduce, but do not eliminate, that risk.

## Security invariants

- Mutating browser endpoints require exact configured Origin, browser binding, CSRF, bounded JSON size, and strict schema validation.
- Attempt UUIDs, OAuth state, or success query parameters are never authorization credentials.
- OAuth query values receive `no-store`/`no-referrer` handling and are absent from typed logs.
- Provider hosts, API version, callback URL, required permissions, notification recipient, and sender are server configuration, never request-controlled.
- Production, and staging when Supabase-backed, require an exact canonical Supabase project URL plus matching expected Supabase ref and actual/expected Vercel project ID before a client is constructed.
- Missing or invalid provider `expires_in` and unverifiable required permissions fail closed.
- Service-role keys and lifecycle RPC execution are server-only; `anon` and `authenticated` receive no direct table/RPC privilege for v2 private objects.
- Temporary OAuth material is AES-256-GCM encrypted with a configured key ID and attempt-bound AAD. Long-lived token storage intentionally preserves the legacy plaintext consumer contract for the first cutover and remains an explicit production risk gate.
- The final database transaction requires the durable verified account candidate, encrypted long-token checkpoint, and an exact account/token-metadata match. A temporary SHA-256 token fingerprint binds the decrypted token used at finalization without storing another raw token copy and is scrubbed with the candidate.

## Jobs

- Notification retry consumes durable outbox events with bounded SMTP timeouts and stale-lease recovery.
- Token refresh selects only eligible rows, classifies revoked/expired credentials as `reauth_required`, and writes only through CAS-protected functions.
- Cleanup immediately makes expired browser data inaccessible and later physically removes expired temporary/receipt material.
- Every job validates its feature flag and environment identity before side effects and acquires a database job lease.

## Legacy and rollback

The legacy state/cookie format remains accepted during the transition. Its persistence adapter must decide under the same account lock whether v2 already owns the account; a JavaScript read followed by an old RPC is not sufficient. Application rollback keeps the v2 callback/API drain path and additive schema available. Forward migration and rollback SQL live in separate directories so normal migration tooling cannot apply rollback automatically.
