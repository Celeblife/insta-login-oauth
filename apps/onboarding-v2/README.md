# CelebLife onboarding v2

Isolated Next.js implementation of the approved CelebLife Instagram Business onboarding flow. Product behavior is defined by `../../handoff/celeblife-v2/`; this directory contains the P0–P5 implementation and local evidence. Existing root/legacy production code is intentionally unchanged.

## Run locally

```bash
nvm use
npm ci
cp .env.example .env.local
npm run dev
```

Local defaults use the mock provider, disabled mail, and disabled jobs. Never place real credentials in tracked files.

## Verify

```bash
npm run test:reference
npm run verify
npm run test:e2e
npm run test:a11y
```

PostgreSQL integration tests (`npm run test:db`) require a disposable PostgreSQL 16 cluster through the documented `TEST_POSTGRES_*` environment variables. Real Meta, SMTP, token refresh, deployment, and production database operations are separate gated checks and are not implied by the local suite.

See [architecture](docs/ARCHITECTURE.md), [operations](docs/OPERATIONS.md), [DB/jobs](docs/db-jobs.md), and the [verification report](docs/VERIFICATION_REPORT.md) for details.
