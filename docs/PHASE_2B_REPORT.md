# Clinot AI — Phase 2B Report

> Presentation phase. No application architecture changed; no features fabricated; no secrets included.
> Verification status of every claim was checked against source before writing.

## README

Rebuilt `README.md` from verified source only: one-line description + single CI badge, Overview, Why Clinot,
verified Core Features, Screenshots section (honestly pending), Architecture with Mermaid diagram, AI summary
with explicit incomplete-items disclosure, stack table (only installed tech), project structure, setup, full
env table (incl. `CSRF_SECRET`), dev commands from `package.json` scripts, deployment/security pointers,
honest Current Status (stub list), Roadmap/Changelog/Contributing links, License section stating **no license
granted yet** (`private: true`), and Links (repo URL from git remote; onrender deployment linked with an
availability caveat). Deliberately excluded: testimonials, user counts, compliance claims, badge walls, emojis.

## Documentation

- `docs/ARCHITECTURE.md` (new): 14 sections, system Mermaid diagram, verified flows for frontend, API, auth,
  tenant isolation, DB, queue, worker, AI, messaging, Stripe, email, deployment.
- `docs/AI.md` (new): provider, env model config, failover semantics, 10-route router, guardrails, Hinglish +
  typo tolerance, fallbacks, usage tracking, prompt handling, and an explicit incomplete list (RAG wiring,
  tool-calling, `gpt-4o` default drift).
- `docs/SECURITY.md` (new): 11 sections, zero compliance claims, limitations called out.
- `docs/DEPLOYMENT.md` (new): consolidated requirements/startup/platforms/troubleshooting; existing
  `DATABASE.md` and `RENDER-DEPLOYMENT.md` preserved and linked, not duplicated.
- `AGENTS.md` inaccuracies from the audit corrected in Phase 2A (Recharts, SQLite, worker runtime).

## Screenshots

- **Captured automatically: none.** This environment has no browser tooling, and fabricated UI images are
  forbidden. No fake screenshots were created.
- **Requires manual capture:** `docs/screenshots/README.md` lists exact pages, viewport, filenames
  (`dashboard`, `appointments`, `patients`, `inbox`, `ai-receptionist`, `integrations` + optionals) and the
  no-real-data rule. README references that list honestly.

## Architecture

Covered in README + `docs/ARCHITECTURE.md` (see above). Verified detail: single-service monolith, edge
middleware, `getClinicId()` JWT pattern, Postgres queue + internal worker (launcher-started, not
instrumentation-started), OpenRouter-only AI, WhatsApp-first messaging.

## AI Documentation

`docs/AI.md` (see above).Verified while writing: `ragContext` is destructured but never interpolated in
`prompt.ts`; `includeTools: false` in the production receptionist path; no `googleapis`/calendar imports
anywhere in `src/` (calendar sync does not exist); analytics route performs real aggregations (implemented).

## Security Documentation

`docs/SECURITY.md` + root `SECURITY.md` (disclosure policy, supported-versions note, no compliance claims).

## Deployment Documentation

`docs/DEPLOYMENT.md` + preserved `RENDER-DEPLOYMENT.md`. Railway/Voroa wrappers documented as identical
contracts around `scripts/start-production.js`.

## Roadmap

`ROADMAP.md`: Completed (verified list incl. Phase 2A/2B docs), In Progress (2B items, webhook attribution,
telegram decision, secret unification), Planned (authz decision, RAG, defaults, constraints, limiter, hygiene),
Future (per-clinic email uniqueness, JSON normalization, calendar, tool-calling, 2nd provider, RLS). No dates.

## Changelog

`CHANGELOG.md`: starts at current state (no historical tags — stated explicitly), Unreleased section with
Added/Fixed/Known-limitations.

## GitHub Templates

`.github/`: `workflows/ci.yml` (checkout → Node 24 → `npm ci` → typecheck → lint → tests → build, hermetic env),
`ISSUE_TEMPLATE/bug_report.md` + `feature_request.md`, `pull_request_template.md` (with security checklist).
No `CODEOWNERS` (no team structure to encode — stated, not invented).

## CI

Workflow added as above. Node 24 matches `.nvmrc` and the verified local runtime (`v24.18.0`); `engines`
declares `>=18.17` per Next.js 14. No secrets in CI; build needs none beyond the hermetic defaults.

## Branding

Existing brand inspected: `public/brand/clinot-logo.png` + `src/components/brand/ClinotLogo.tsx` (canonical).
No preview image generated (no tooling; fake screenshots forbidden). Spec created:
`docs/GITHUB_SOCIAL_PREVIEW_SPEC.md` (1280×640, logo + name + one-line descriptor, no claims).

## Repository Metadata Recommendations

`docs/GITHUB_SETUP.md`: description, 10 verified topics, homepage/demo guidance (onrender URL only after
confirming currency; its marketing claims must not be repeated without evidence), social preview, release
strategy (`v0.1.0` at 2B commit), license/visibility decision (still `private`, no `LICENSE` — do not flip
without the decision), branch protection (require `verify` job, no force pushes).

### AUTOMATED CHANGES (in this commit)

All files listed under "Files added/modified" below — docs, templates, CI, README.

### MANUAL GITHUB SETTINGS (not applied — documented only)

Description, topics, homepage, social preview upload, releases/tags, visibility, license choice, branch
protection. All in `docs/GITHUB_SETUP.md`.

## Tests

- `npm run typecheck`: clean.
- `npm run lint`: **no warnings or errors** (the 5 JSX-entity issues from Phase 2A fixed).
- `npm run test`: **25 files passed, 633 tests passed, 11 skipped** (5 env-gated files, as before).
- Markdown links verified by hand against the file tree (all relative targets exist); Mermaid diagrams kept to
  basic flowchart syntax used elsewhere in docs.

## Build

`npm run build`: success — compiled, lint+types clean, **83/83 pages**, standalone output ready. (The
inbox/ai-providers "Dynamic server usage" log lines are pre-existing informational output; both routes are
correctly dynamic.)

## Remaining Manual Tasks

1. Capture the 6 screenshots per `docs/screenshots/README.md` and reference them in `README.md`.
2. Decide license; add `LICENSE`; flip `private` if open-sourcing.
3. Apply `docs/GITHUB_SETUP.md` (description, topics, preview, releases, protection).
4. Create the `v0.1.0` tag at the Phase 2B commit.
5. Confirm whether `https://clinot-ai.onrender.com` is the maintained deployment before featuring it.
6. Engineering follow-ups live in `ROADMAP.md` (webhooks, authz model, RAG, hygiene).

## Files added / modified (Phase 2B)

Added: `README.md` (rewritten), `docs/{ARCHITECTURE,AI,SECURITY,DEPLOYMENT,GITHUB_SETUP,
GITHUB_SOCIAL_PREVIEW_SPEC,PHASE_2B_REPORT}.md`, `docs/screenshots/README.md`, `ROADMAP.md`, `CHANGELOG.md`,
`CONTRIBUTING.md`, `SECURITY.md`, `.github/workflows/ci.yml`, `.github/ISSUE_TEMPLATE/{bug_report,
feature_request}.md`, `.github/pull_request_template.md`.
Modified: none in `src/` (docs-only phase; the 5 JSX-escape fixes landed in Phase 2A's build-fix step).
