# Onboarding v2 verification report

Captured: 2026-09-11 (Asia/Seoul)

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
| Chromium desktop/mobile E2E | PASS | 52/52 |
| Axe WCAG A/AA automated scan | PASS | 6/6 across intro, apply, and completed receipt |
| npm dependency audits | PASS | zero known vulnerabilities in full and production-only audits |
| Production-build visual layout comparison | PASS WITH LIMITATION | 10 desktop/mobile state captures; see below |

The Axe run is an explicit subset of the 52-test Playwright suite and is listed separately as a
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

The optimized production build was captured at the approved desktop and mobile dimensions for
intro, form, loading, success, and error states. The generated evidence is local and ignored by Git
under `evidence/generated/`.

| Capture | SHA-256 |
|---|---|
| `desktop-intro.png` | `93ff9ddda8ed3921d15fcfdac9241f229cc9832c62224c8bbb0816228df730e2` |
| `desktop-form.png` | `2a3ac8b780de422868c7e11267d65e420b58fedd7333acb2b763637dd7ef8217` |
| `desktop-loading.png` | `788dd55a39863ef5a6af1cd9b5262a52f9fe5da67641725c617369923579e481` |
| `desktop-success.png` | `7a3b6e66a47b6944a51214b4e9b524ef1a9252d43bd1c56bc4cfd83ddcd2ecc3` |
| `desktop-error.png` | `675ead3a322df169472f672af5b125d856ee70ca2706e879792d2e371dc047b5` |
| `mobile-intro.png` | `c5fc4f91bf2c6ffb676790ae81d3d491a2b6aab9e7606632028f9a5d3a58cd0a` |
| `mobile-form.png` | `7b1b69e63f6200e173d296818fe5947d6de106ec41019e68d5a641151b3e4d84` |
| `mobile-loading.png` | `d65accc708ecf3d8b76f30ea9ec00f4da51d75aed6ff21f10a1b2933cbc5a97d` |
| `mobile-success.png` | `0a5e03cd0c46b3629c3f3db9af5b948047fcdd6f40c27d16ec73ad0ee786f881` |
| `mobile-error.png` | `8b3b1be0caf662fbe0309dc1f6e909cf11ddbb6a947ad74ad24d224774110d9b` |

The local Chromium image does not have the approved Korean font installed, so Korean glyphs render
as fallback boxes. Geometry, responsive behavior, field widths, hint placement, footer visibility,
and state hierarchy were reviewed; typography and pixel-identical Korean rendering are not claimed.

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
