# Onboarding v2 verification report

## 2026-10-13: production rollout for optional additional notification recipient

Production rollout was authorized and performed for project `celeblife`. The previous production
deployment was `dpl_ERfabvE13tWhcYU4TfJymkp9htbJ`; the rollout deployed
`dpl_7c4ocTeRJ2B2D3251X2yiCzQtymY` at
`https://celeblife-fuaa80uck-jun99s-projects.vercel.app` and then promoted it to production aliases.
The source snapshot was built from base commit `475abd538ed53213639a7375af07f34fd6c0d41a` plus the
then-uncommitted additional-recipient changes. The rollout preceded Git integration; deployment IDs
above identify that validated snapshot.

| Production evidence | Result | Detail |
|---|---|---|
| Pre-rollout production state captured | PASS | Previous deployment and production env metadata recorded in `.omx/evidence/additional-notification-recipient/production-rollout-before.json` |
| Production env update | PASS | Added one `NOTIFICATION_ADDITIONAL_TO` production variable; 71 preexisting env entries unchanged; secret values were not retrieved |
| Source snapshot manifest | PASS | 444 files, manifest SHA-256 `c4ac42b216d3298ec71a0fe26233072d91be8d175f2ec2fc7d46d46617d816ff` |
| Isolated production deployment | PASS | `vercel deploy --prod --skip-domain` completed successfully for `dpl_7c4ocTeRJ2B2D3251X2yiCzQtymY` |
| Deployment metadata | PASS | Deployment ready, target `production`, expected cron routes present, runtime env keys include `NOTIFICATION_ADDITIONAL_TO` |
| Staged authenticated smoke | PASS | Six GET probes passed for `/`, `/Login`, `/apply`, `/policies/terms`, `/policies/privacy`, and `/api/onboarding/bootstrap` |
| Production promotion | PASS | New deployment promoted to production aliases |
| Public live smoke | PASS | Same six public alias probes returned 200 with HSTS/CSP and no new recipient config exposure |
| Own-account reconnection and inbox delivery to initial additional recipient | USER_REPORTED_PASS | User confirmed the live test worked after rollout; inbox contents were not independently inspected in this workspace |
| Production additional-recipient replacement | PASS | Replaced the additional recipient with a colleague NAVER WORKS address on deployment `dpl_H2GAY9UWmJK2zaZdCBtYGGXh4RXw`; staged and public smoke checks passed |
| New colleague inbox delivery | USER_REPORTED_PASS | User confirmed the replacement recipient received the live test email; inbox contents were not independently inspected in this workspace |

The additional recipient address itself is intentionally omitted from this tracked report. Evidence
for the environment write records only metadata: the new value was verified during rollout, but
tracked docs do not contain the address or SMTP credentials. A public privacy page already contained
the same Gmail address as a public contact before this promotion; the live smoke treated that as unchanged
public page content, not exposure of the new server-side recipient setting.

No SQL migration, Meta dashboard mutation, manual internal job run, cron trigger, SMTP credential retrieval,
or production email backfill was performed as part of this rollout. Existing SMTP settings were
retained through the initial rollout and the replacement. The initial live inbox result is
user-reported only. The replacement recipient inbox delivery is also user-reported only; it was
not independently inspected in this workspace.

The replacement rollout deployed `dpl_H2GAY9UWmJK2zaZdCBtYGGXh4RXw` at
`https://celeblife-ro6eyw5dd-jun99s-projects.vercel.app`. `NOTIFICATION_ADDITIONAL_TO` was updated,
the prior additional recipient was removed from that setting, SMTP credentials were unchanged, and
71 other production env entries were preserved. Staged smoke and public production smoke each passed
3/3 route checks for `/Login`, `/apply`, and `/api/onboarding/bootstrap`; both public aliases were
verified. The smoke checks found no recipient config exposure.

## 2026-10-12: optional additional notification recipient

Local implementation is complete on `codex/additional-notification-recipient`, based on `475abd5`.
The required primary recipient is preserved; server-only `NOTIFICATION_ADDITIONAL_TO` accepts one
optional bare mailbox. The SMTP adapter validates configuration before opening transport and only
reports success when all configured recipients are accepted and none are rejected. Duplicate primary
addresses are de-duplicated. The new setting is blank in `.env.example`; no real additional address
or local mail credentials were configured for this change.

| Fresh evidence | Result | Detail |
|---|---|---|
| Approved handoff reference suite | PASS | 131/131 |
| Full app verification | PASS | ESLint, TypeScript, Vitest, production build, production headers, artifact scan, protected-root check |
| Final Vitest run after additional retry regressions | PASS | 125 passed; 23 PostgreSQL tests skipped |
| Chromium desktop/mobile E2E, including automated accessibility checks | PASS | 62/62 |
| Additional-recipient browser artifact scan | PASS | 17 production browser files checked; no config-key or test-address leaks |
| Independent implementation review | APPROVE | No findings; reviewed SMTP behavior and retry regression tests |
| Handoff HTML navigation/content validation | PASS | 16 navigation entries; no duplicate IDs or missing internal targets |
| PostgreSQL runtime tests | NOT_RUN | Local PostgreSQL server binaries/configuration unavailable; all 23 gated tests skipped |
| Real SMTP authentication/inbox delivery, Meta, Supabase, deployment | NOT_RUN | Outside this local implementation; mock transport/provider and memory repository used |

Commands were run with isolated test values and external jobs/mail disabled (SMTP unit/job tests
enable only a mocked transport):

```sh
npm run test:reference
npm run verify
npm run test
npm run test:e2e -- --workers=2
git diff --check
```

The full verification initially included 121 passing app tests; four added retry regressions were
then included in the final 125-test passing run. Production source did not change between those
runs. Local command logs and result metadata are under the Git-ignored
`.omx/evidence/additional-notification-recipient/` directory at the repository root.

Coverage includes absent/blank/invalid/duplicate additional recipients, full and partial SMTP
acceptance, failure sanitization, the same event retrying with stable IDs, a single configuration
snapshot per batch, the next invocation reading changed settings, disabled mail, stale sent writes,
and recipient configuration remaining absent from public API responses. Two DB assertions were
added for the existing primary-recipient SQL contract, but are part of the 23 unexecuted DB tests.

There is no SQL migration, dependency, lockfile, UI, root legacy application, or cron change. The
separate `codex/onboarding-v2` worktree remains unchanged. Event-level retries are preserved: partial
SMTP acceptance can cause a recipient who already received a message to receive it again. The
application enforces acceptance of all configured recipients; the unchanged SQL RPC enforces the
primary-recipient minimum. SMTP acceptance does not establish inbox delivery.

The handoff Markdown was rebuilt from source. The HTML was updated with matching source changes and
validated; the Python HTML generator could not run because the local environment lacks `bs4`.
Historical verification artifacts were preserved. At the end of the local-only implementation phase,
this change was not committed, pushed, or deployed.

## Historical baseline: 2026-09-12

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
