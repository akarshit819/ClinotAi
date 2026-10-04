# Contributing to Clinot AI

## Ground rules

- Small, reviewable changes. No large refactors without discussion.
- Never commit secrets, databases (`.env`, `prisma/dev.db`), `node_modules`, `.next`, or generated caches.
- Never `git push --force`, rewrite history, or delete branches.
- Verify every product claim against source before writing docs.

## Local setup

```bash
npm install
npm run setup     # Prisma generate + db push + seeds (local throwaway DB only)
npm run dev       # http://localhost:3000
```

Local demo login (dev only): `admin@clinot.ai` / `admin123`.

## Checks (all must pass)

```bash
npm run typecheck
npm run lint
npm run format:check
npm run test
npm run build
```

Production database work uses migrations only: `npm run db:migrate:dev` locally,
`npm run db:migrate:deploy` in production. Never `db:push` outside local dev.

## Pull requests

- Use the PR template. Describe what changed, how it was verified, and what remains.
- Security-sensitive changes: inspect implementation, make the smallest change, add/run focused tests,
  run the broader suite, and review the diff before requesting review.
- Report security issues privately per [SECURITY.md](SECURITY.md) — never in a public issue.
