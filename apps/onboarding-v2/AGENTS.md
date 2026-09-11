# CelebLife onboarding v2 agent contract

- The canonical product and security contract is under `../../handoff/celeblife-v2/`; do not reinterpret fixed v1.3.2 decisions.
- For installed Next.js behavior, read version-matched docs under `node_modules/next/dist/docs/` before changing framework-specific code.
- Keep all product code inside this app. Do not edit the repository-root Python, Streamlit, Vercel, schema, migrations, jobs, login assets, or legacy callback during P0-P5.
- Preserve the approved UI source. Port `reference/approved/index.html` and `ui/styles.css`, then append `ui/production/usability-overrides.css`; demo behavior is test-only.
- Browser state is never authority. State, cookie binding, CSRF, server revision, PostgreSQL transaction/locks, and receipt authorization define the workflow.
- Never log or expose OAuth codes, state, tokens, browser secrets, SMTP credentials, or raw contact data.
- Do not run production DB/reset/deploy, Meta mutations, or real email. Record credential-dependent checks as `NOT_RUN`.
- Use exact dependencies and update `package-lock.json` through npm. No new dependency without a concrete, documented need.
- Run the smallest relevant tests after each change and the full app verification before completion.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
