# P0 baseline and external evidence

Captured: 2026-09-11 (Asia/Seoul)

## Repository boundary

- Development worktree: `/home/jun/celeblife/insta-login-oauth-onboarding-v2`
- Branch: `codex/onboarding-v2`
- Handoff baseline commit: `62579e36bad66b6ff2b87ff06c1a2381fa2135e9`
- Preserved root/main baseline: `3c4cdc7ae4f8e399351bd2a30c0db24401347a9e`
- Allowed implementation paths: `apps/onboarding-v2/**` and the already committed `handoff/celeblife-v2/**` package.
- Protected during P0-P5: root `vercel.json`, `asgi.py`, `app.py`, `api/**`, `src/**`, `jobs/**`, `pages/**`, `public/Login/**`, `supabase_schema.sql`, and root `migrations/**`.

Run `node scripts/verify-protected-root.mjs` from this app to enforce this boundary against `origin/main`.

## Legacy compatibility map

- OAuth start is currently split between `api/instagram_start.js` and `src/oauth_start_service.py`; it requires same-origin form submission, four explicit consents, a 2 KiB body limit, a 600-second signed state, and browser binding.
- Callback is `GET /auth/callback`; query stripping middleware prevents callback credentials from entering normal logs. State plus the `cl_consent_binding` cookie authorizes the callback.
- Legacy configuration uses Instagram Graph `v22.0`, scopes `instagram_business_basic,instagram_business_manage_insights`, the Instagram authorize/code endpoints, and Graph long-token/refresh endpoints.
- Existing storage contracts are `users`, `tokens`, `user_consents`, and `public.complete_instagram_onboarding(...) RETURNS BIGINT`. Existing Python callers expect integer IDs and plaintext `tokens.access_token`.
- Existing RLS is service-role scoped. V2 must add and revoke explicitly rather than replacing the root schema.
- Existing refresh CAS checks token row ID, `created_at`, and `expires_at`; v2 deliberately strengthens this with `row_version`, status, scopes, source, and no-upsert semantics while preserving old consumers.
- Root Vercel cron is daily `/internal/token-refresh`; v2 defines its own app-local routes/config and must not assume the root rewrite handles them.

The detailed inspected map and compatibility tests come from the checked-in handoff `docs/REPO_MAP.md` plus a fresh read of the root files at this branch.

## Runtime and dependency decision

| Component | Pinned version | Reason |
|---|---:|---|
| Node.js | `>=22.20.0 <25` (`.nvmrc` 22.20.0) | Matches the local runtime and satisfies current Next, Supabase JS, Vitest, Vite, and test DOM engines. |
| Next.js | 16.3.4 | Current upstream/npm version during P0; App Router and Node Route Handlers. |
| React / React DOM | 19.3.0 | Current compatible stable peer for Next 16.3.4. |
| Supabase JS | 2.116.0 | Current server client; requires Node 22+. No auth SSR helper is needed because browser auth is not Supabase Auth. |
| Zod | 4.6.2 | Shared strict boundary validation. |
| Nodemailer | 10.0.3 | SMTP transport; disabled by default and server-only. |
| TypeScript | 6.0.3 | Latest version inside current `typescript-eslint` peer range; TypeScript 7 produced an unsupported peer graph. |
| ESLint | 9.39.5 | Latest version supported by Next 16.3.4's bundled plugins; ESLint 10 produced peer conflicts. |
| Vitest / Playwright | 5.0.0 / 1.63.0 | Unit/integration and actual browser gates. |

All packages are exact-pinned in `package.json` and `package-lock.json`. `npm audit --omit=dev --audit-level=high` returned zero known vulnerabilities at capture time. A future install must re-run audit rather than treating this result as permanent.

## Official/upstream evidence used

- Next 16 upgrade and Node/async request APIs: <https://nextjs.org/docs/app/guides/upgrading/version-16>
- Next Route Handlers: <https://nextjs.org/docs/app/getting-started/route-handlers>
- Next cookies API: <https://nextjs.org/docs/app/api-reference/functions/cookies>
- Supabase local migrations: <https://supabase.com/docs/guides/local-development/database-migrations>
- Supabase local workflow: <https://supabase.com/docs/guides/local-development/cli-workflows>
- Supabase API key boundary: <https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys>
- Instagram Business Login: <https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login/>
- Instagram platform changelog: <https://developers.facebook.com/docs/instagram-platform/changelog/>
- Graph API versioning: <https://developers.facebook.com/docs/graph-api/guides/versioning>
- Vercel Cron behavior and authentication: <https://vercel.com/docs/cron-jobs/manage-cron-jobs>
- Vercel Node runtime: <https://vercel.com/docs/functions/runtimes/node-js>

## Current external facts and boundaries

- Next 16 request APIs such as `cookies()` are asynchronous. Route handlers are dynamic when they inspect request/cookie/header/DB data. All v2 handlers explicitly use the Node runtime and no-store behavior where relevant.
- Supabase is moving legacy `anon`/`service_role` keys toward publishable/secret keys. V2 accepts a server secret key name and never exposes it to a client bundle. The deployed project remains an operator gate.
- Meta documentation currently lists Graph API v26.0, but the checked-in app uses v22.0 and the target app's dashboard version, app ID type, redirect URI, review status, enabled features, and scopes are not available locally. V2 therefore validates/configures these values and does not claim a real upgrade or real OAuth pass.
- Official Instagram Business Login documentation lists state but did not document PKCE parameters in the evidence reviewed. The implementation must say “PKCE not documented for this flow,” not “Meta never supports PKCE.”
- Vercel Cron is best-effort, can miss or duplicate invocations, does not retry failed jobs, and may overlap. V2 jobs use database claims, fencing, idempotency, and reconciliation rather than assuming exactly-once scheduling.
- Hobby Cron cannot run every five minutes. Actual plan/cadence and project isolation remain deployment gates.

## Local environment evidence

- Node: `v22.20.0`; npm: `10.9.3`.
- Docker executable is visible through a Windows path, but Docker Desktop WSL integration is disabled; no local `psql`, `pg_isready`, or Supabase CLI was initially available.
- Therefore actual PostgreSQL evidence requires a safe app-local PostgreSQL runtime or remains `NOT_RUN`; model tests or SQL inspection cannot be reported as database PASS.

## Open gates (`NOT_RUN` until independently available)

- Actual Meta dashboard/app/test account, approved redirect URI/scopes/features, OAuth grant and real token lifecycle.
- Actual Supabase project schema/key/project ref and any production/staging migration.
- NAVER WORKS SMTP host/port/TLS/login/sender permission and real mailbox receipt.
- Final public contact address, approved policy text/version/hash, retention/ownership decisions.
- Vercel project IDs, environment isolation, paid plan/Cron cadence, staging and production deployment.
- Physical iPhone/Android/in-app-browser/screen-reader execution.

