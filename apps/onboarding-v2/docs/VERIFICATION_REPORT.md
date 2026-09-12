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
| Current UI visual layout comparison | PASS WITH LIMITATION | 10 desktop/mobile state captures; see below |

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

The current app was captured at the approved desktop and mobile dimensions for intro, form,
loading, success, and error states. Loading uses the development-only static preview route; the
remaining captures use the same route components and styles as the production build. The generated
evidence is local and ignored by Git under `evidence/generated/`.

| Capture | SHA-256 |
|---|---|
| `desktop-intro.png` | `ca04124bea999b912808c87aef2085e4b6dc9128e769ec01df8c7cd653455cf4` |
| `desktop-form.png` | `5f7217a465801c3647b9c3f6b60a3ad60430a5bf062850aeb6a5106be74e5961` |
| `desktop-loading.png` | `0e34d805fc12ee7617dbdeb7883c02209260f3460bb361bc905292fbed34f20d` |
| `desktop-success.png` | `01db78d3e4c5c7a75a4bc1bfea58b5ca5f883c7e3e2446822ede3a6084fbc10f` |
| `desktop-error.png` | `745f0e8d3a76932d95e990b9945aad49749ee915346c7534a38c77bca8a6427f` |
| `mobile-intro.png` | `bc934b664c235f66c7a2aec6072150685385303f12675eb946cea1c0ccc59bfc` |
| `mobile-form.png` | `510205aa0476efc5e2f77336212b2a0bf8cc896b08012cfc11c069623ea804d2` |
| `mobile-loading.png` | `0486f0cc2b04028584e9fab0cf1fb4bef8334e2f9f4362e12343e5f907737068` |
| `mobile-success.png` | `541dc48e3c8bec063d4bc55468c8dc3bd1446691193c61eb86064ff184b5add4` |
| `mobile-error.png` | `c5b4f1674a0bea4971d674761e0c750ce916e0a0434c5fae8744f7d3b60cc855` |

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
