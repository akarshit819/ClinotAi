# Changelog

> Historical versions were never tagged, so this changelog begins from the current documented state and does
> not reconstruct earlier history.

## [v0.1.0] — Proposed (not tagged, do not treat as released)

First portfolio milestone: security foundation (Phase 2A) + professional presentation (Phase 2B). Release
is blocked on: 6 manual screenshots, license decision (`docs/LICENSE_DECISION.md`), GitHub-side settings
(`docs/GITHUB_SETUP.md`), and a green CI run on `main`. Create the tag only when explicitly authorized.

## Unreleased

### Added

- GitHub professionalization audit (`docs/GITHUB_PROFESSIONALIZATION_AUDIT.md`).
- Security foundation (Phase 2A): CSP fix, `x-access-token` echo removal, cookie-aware CSRF enforcement,
  correct per-origin CORS helpers, expanded audit-log redaction, `CSRF_SECRET` documentation, session-revocation
  ownership check, `tests/security-foundation.test.ts` (11 tests).
- Config foundation: `.eslintrc.json`, `.prettierrc.json`, `format`/`format:check` scripts,
  `engines >=18.17`, `.nvmrc`.
- Documentation set: `ARCHITECTURE.md`, `AI.md`, `SECURITY.md`, `DEPLOYMENT.md`, `ROADMAP.md`,
  `GITHUB_SETUP.md`, social-preview spec, screenshot capture list, `CONTRIBUTING.md`, `SECURITY.md` policy,
  GitHub issue/PR templates, CI workflow.

### Fixed

- Prisma P2028 bootstrap failures: `registerClinic()` split into short transactions; `ensureClinicRoles()`
  reduced from ~146 sequential writes to batch `createMany` operations.
- 5 pre-existing `react/no-unescaped-entities` JSX issues surfaced by the new ESLint config.

### Known limitations

- Telegram webhook is a stub (no verification, no processing).
- Messenger/Instagram webhooks verify signatures but attribute tenants first-row-wins.
- RAG context is computed but not consumed by the receptionist prompt; LLM tool-calling is dormant.
- No per-route role authorization (any session for a clinic can use its features).
