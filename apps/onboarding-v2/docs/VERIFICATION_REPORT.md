# Onboarding v2 verification report

Captured: 2026-09-12 (Asia/Seoul)

## Scope and outcome

This report covers the isolated `apps/onboarding-v2` implementation on branch
`codex/onboarding-v2`. The root application and the `main` worktree were not modified. Local
automated evidence is `PASS`; checks that require real credentials, approved external targets, or
destructive authority remain explicitly `NOT_RUN`.

| Evidence | Result | Fresh local result |
|---|---|---|
| Approved handoff reference suite | PASS | 131/131 |
| ESLint and TypeScript | PASS | zero errors/warnings |
| Vitest unit/integration/static suite | PASS | 76 passed, 21 PostgreSQL-environment-gated tests skipped in the default run |
| Disposable PostgreSQL 16 migration/RPC suite | PASS | 2 files, 26 tests |
| Production Next.js build and route generation | PASS | build completed |
| Production headers, artifact scan, protected-root boundary | PASS | all checks completed |
| Chromium desktop/mobile E2E | PASS | 54/54 |
| Axe WCAG A/AA automated scan | PASS | 6/6 across intro, apply, and completed receipt |
| npm dependency audits | PASS | zero known vulnerabilities in full and production-only audits |
| Deployed-login visual parity | PASS | desktop and mobile captures are byte-for-byte identical to `public/Login/index.html` |

The Axe run is an explicit subset of the 54-test Playwright suite and is listed separately as a
quality gate, not added as six unique E2E tests.

## Commands and boundaries

The final local gate used Node `v22.20.0` and npm `10.9.3`:

```sh
npm run test:reference
npm run verify
TEST_POSTGRES_BIN_DIR=... TEST_POSTGRES_SHARE_DIR=... TEST_POSTGRES_LIBRARY_DIR=... npm run test:db
PLAYWRIGHT_PORT=3137 npm run test:e2e
PLAYWRIGHT_PORT=3139 npm run test:a11y
npm audit --audit-level=high
npm audit --omit=dev --audit-level=high
git diff --check
```

The PostgreSQL harness initialized a new disposable cluster and applied only the v2 migration. It
did not connect to Supabase. The browser suite used the local mock provider and route-level fixtures;
it did not contact Meta or send mail.

## Visual evidence

The first login screen was rendered from both the deployed static source
`public/Login/index.html` and the v2 `/` route after the restore. Chromium used the same viewport,
font, and network-idle capture conditions for each pair. `cmp` returned zero for both pairs, so the
PNG output itself is identical, including Korean typography, layout, assets, colors, and responsive
behavior.

| Viewport | Deployed source SHA-256 | V2 route SHA-256 | Result |
|---|---|---|---|
| Desktop `1440x1000` | `a6beb9cd0c9076c2c47724f92c940c2f30c10e53b47d99fcefd4fd56c1108acf` | `a6beb9cd0c9076c2c47724f92c940c2f30c10e53b47d99fcefd4fd56c1108acf` | identical |
| Mobile `390x960` | `6a66a58b7e7d8170aee4c9f2993c9f88f8fb09e1e0815baa6f61349ff3c872db` | `6a66a58b7e7d8170aee4c9f2993c9f88f8fb09e1e0815baa6f61349ff3c872db` | identical |

The CTA is the intentional functional difference: it keeps the deployed label and styling but links
to the v2 `/apply` route. The remaining v2 pages are not claimed as pixel-identical to the legacy
screen; their unchanged flow is covered by the 54-test desktop/mobile E2E suite.

## External and operational gates

| Check | Result | Reason / required evidence |
|---|---|---|
| Real Meta dashboard, OAuth, scopes, `/me`, and token lifecycle | NOT_RUN | Approved app/test account and dashboard access required |
| NAVER WORKS SMTP authentication and inbox delivery | NOT_RUN | Approved credentials and mailbox observation required |
| Eligible real-token refresh | NOT_RUN | Approved non-production token and target required |
| Actual Supabase staging/production migration | NOT_RUN | Exact approved project and migration authority required |
| Vercel staging/production deploy and Cron observation | NOT_RUN | Exact project IDs, plan, and deployment authority required |
| Scoped reset target inspection | NOT_RUN | Exact approved target and immutable allowlist required; execution is unsupported |
| Physical iPhone/Android/in-app-browser/screen-reader pass | NOT_RUN | Device/browser accessibility session required |
| Final public contact and legal policy approval | NOT_RUN | Production values and owner approval required |
| Retention ownership and legacy plaintext-token risk acceptance | NOT_RUN | Explicit operational/security decision required |

The application fails closed for the production configuration gates it can enforce locally: provider
mode and credentials, policy approval metadata, distinct browser/payload keys, public contact,
canonical Supabase project URL/ref, actual/expected Vercel project ID, server-only database key, and
per-job enablement. These guards do not substitute for the external checks above.
