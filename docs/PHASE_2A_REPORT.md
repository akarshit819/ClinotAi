# Phase 2A Report — Security + Foundation

> Scope: Phase 2A only (audit items S-1, S-2, S-3, Q-1, auth/tenant audit, docs/config foundation).
> No architecture changes, no refactors, no new product behavior. No secrets are included in this report.

## Changes Made

1. **CSP bug (S-1)** — `src/middleware.ts` treated the string returned by `getCSPDirectives()` as an object
   (`Object.entries(csp).map(...)`), producing a malformed production CSP. Now sets the policy string directly.
2. **Removed `x-access-token` echo** — middleware no longer copies the `access_token` cookie into a response
   header on dashboard paths. Verified zero readers of that header in `src/` (only the setter existed).
3. **CSRF hardening** — new pure helper `src/lib/security/csrf-check.ts` (`decideCsrf`/`isSameOrigin`), used by
   middleware. Cookie-authenticated state-changing API requests now require a present, same-origin
   `Origin`/`Referer` (previously missing-origin skipped the check entirely). Bearer-token server-to-server
   traffic skips the check (CSRF is cookie-ambient); webhook/auth-entry/chat/widget/checkout exemptions preserved
   via `shouldBypassCsrf`.
4. **CORS fix (Q-1)** — `getCorsHeaders()` joined multiple origins with `", "` (invalid with credentials).
   Added `getCorsHeadersForOrigin(origin, allowed)` (single echo + credentials, fail-closed otherwise); legacy
   helper now emits ACAO only for exactly one configured origin. No call sites existed, so no behavior changed.
5. **HSTS** — verified already production-only via `getSecurityHeaders(true)` in middleware; deliberately NOT added
   to `next.config.js` (that would force HSTS on local HTTP dev). No code change; covered by test.
6. **Audit redaction** — `recordAuditEvent()` replaced 3 hardcoded keys with `redactSensitiveDetails()`:
   case-insensitive redaction of password/passwd (dropped), secret, token, jwt, api keys, authorization, cookies,
   database/postgres URLs, openrouter/whatsapp/waba/meta/stripe/resend/encryption/credential keys, incl. one nested
   level. Benign fields preserved.
7. **Secrets docs** — `.env.example` now documents `CSRF_SECRET` (previously required in prod but undocumented)
   with 32+ char requirement, dev-fallback warning, and rotation guidance. Prod validation in `src/lib/env.ts`
   confirmed strict (throws without `JWT_SECRET`/`ENCRYPTION_KEY`/`CSRF_SECRET`/`DATABASE_URL`/`META_APP_SECRET`/
   `WA_WEBHOOK_SECRET`/`STRIPE_SECRET_KEY`); dev fallbacks untouched.
8. **Session ownership fix** — `DELETE /api/auth/sessions` now verifies the target session belongs to the caller
   (`404` for foreign/missing IDs, no existence leak). Previously any authenticated user could revoke any session
   ID (low exploitability: unguessable IDs, but real).
9. **Docs accuracy** — `AGENTS.md`: removed false Recharts claim, clarified Postgres-vs-SQLite roles, documented
   single-service worker runtime. README left untouched (full rewrite is Phase 2B).
10. **Config foundation** — added `.eslintrc.json` (`next/core-web-vitals`), `.prettierrc.json` (matches repo style:
    no semicolons, double quotes, trailing commas, printWidth 100, tailwind plugin), `format`/`format:check`
    scripts, `engines: { node: ">=18.17" }` (Next 14 requirement), `.nvmrc` (`24`, verified local runtime
    `v24.18.0`). Fixed 5 pre-existing `react/no-unescaped-entities` JSX copy issues surfaced by the new config.
11. **Root hygiene (inspect only, nothing deleted)** — `dev-test-css.html` (saved 404 snapshot, obsolete),
    `test-whatsapp.ps1` (manual webhook tester, stale prod URL + dummy signature), `certificates/` (empty,
    untracked), `schema.sqlite.prisma` (REQUIRED by `db:import:sqlite`; stale vs main schema — do not delete).
    Recommendations in Phase 2B section.

## Security Fixes

| Finding | Fix | Files |
|---|---|---|
| Malformed prod CSP | Set policy string directly | `src/middleware.ts` |
| Token echoed into response header | Removed echo; no readers existed | `src/middleware.ts` |
| Missing-origin CSRF bypass | Fail-closed for cookie-auth requests; bearer/webhooks exempt | `src/middleware.ts`, `src/lib/security/csrf-check.ts` (new) |
| Comma-joined multi-origin CORS | Per-origin echo + fail-closed legacy helper | `src/lib/security/headers.ts` |
| `CSRF_SECRET` undocumented | Documented + rotation guidance | `.env.example` |
| Audit log redaction gaps | Pattern redaction incl. nested objects | `src/lib/security/audit.ts` |
| Session revocation w/o ownership | Owner check + 404 | `src/app/api/auth/sessions/route.ts` |

Deliberately NOT changed: `generateCsrfToken`/`validateCsrfToken` are exported but unused (no token-based CSRF
flow exists; building one is Phase 2B scope); token HMAC non-constant-time compare, in-memory rate limiter,
regex sanitizer, and prompt-guard tuning (documented limitations, no safe micro-fix).

## Authentication/Tenant Audit

Method: all 46 `route.ts` files under `src/app/api/` inspected. Central control: `getClinicId(request)`
(`src/lib/api.ts`) verifies the token and derives `clinicId` from the trusted JWT payload — every business route
uses it. Zero routes use `requirePermission` (authorization = valid session for the clinic; entitlement gates only).

| Route | Auth | Permission | Tenant Scope | Webhook/Public | Result |
|---|---|---|---|---|---|
| `health` GET | none | none | n/a | intentionally public | pass |
| `widget` GET/PUT | none (inert stub, 404) | none | n/a | listed public | pass |
| `leads` GET/POST/PATCH | `getClinicId` | none | JWT clinicId; `updateMany{id,clinicId}` | edge-authed | pass |
| `emergency` GET/POST | `getClinicId` | none | JWT clinicId | edge-authed | pass |
| `knowledge` all | `getClinicId` | none | JWT clinicId; scoped writes | edge-authed | pass |
| `dashboard` GET | `getClinicId` + subscription gate | none | JWT clinicId | edge-authed | pass |
| `appointments` all | `getClinicId` | none | JWT clinicId; read-first scoped writes | edge-authed | pass |
| `inbox` GET | `getClinicId` + messaging gate | none | JWT clinicId → lib | edge-authed | pass (lib verified) |
| `inbox/[id]` GET/PATCH | `getClinicId` + gate | none | JWT clinicId → lib (`findFirst{id,clinicId}`) | edge-authed | pass (lib verified) |
| `inbox/[id]/messages` POST | `getClinicId` + gate | none | JWT clinicId → `sendReply` (scoped read-first) | edge-authed | pass (lib verified) |
| `messaging/ingest` POST | `getClinicId` + gate | none | JWT clinicId | edge-authed | pass |
| `analytics` GET | `getClinicId` | none | JWT clinicId | edge-authed | pass |
| `billing`, `usage` GET | `getClinicId` | none | JWT clinicId | edge-authed | pass |
| `billing/upgrade|portal|cancel|reactivate` | `getClinicId` | none — any role | JWT clinicId | edge-authed | pass w/ note (no role layer by design) |
| `checkout` POST | `getClinicId` | none | JWT clinicId | listed public, handler-authed | pass (config misleading, holds) |
| `settings`, `ai-providers`, `api-config*` | `getClinicId` (+masked/encrypted keys) | none — any role | JWT clinicId; compound keys | edge-authed | pass w/ note |
| `onboarding` GET/PUT | `verifyAccessToken` direct | none | payload clinicId | exempt but authed | pass |
| `chat` POST | `getClinicId` + AI gate + row check | none | JWT clinicId; 404 on mismatch | listed public, handler-authed | pass (config misleading, holds) |
| `integrations*` (all but callback) | `getClinicId` (+gates) | none — any role | JWT clinicId; compound keys | edge-authed | pass w/ note |
| `integrations/[p]/callback` GET | HMAC-signed expiring `state` | n/a | clinicId from verified state | public (OAuth redirect) | pass (correct pattern) |
| `webhooks/stripe` POST | Stripe secret + signature + idempotency | n/a | resolved from event | webhook | pass (textbook) |
| `webhooks/whatsapp` | verify-token + HMAC + fail-closed resolution | n/a | `phoneNumberId` record | webhook | pass (textbook) |
| `webhooks/messenger` POST | HMAC ok | n/a | `findFirst(enabled)` ignores pageId | webhook | **FINDING — tenant attribution** |
| `webhooks/instagram` POST | HMAC ok | n/a | `findFirst(enabled)` ignores instagramId | webhook | **FINDING — tenant attribution** |
| `webhooks/instagram` GET vs POST | verify-token vs HMAC secret mismatch | n/a | — | webhook | **FINDING — secret inconsistency** |
| `webhooks/telegram` POST | presence-check only, stub (logs only) | n/a | first-row-wins | webhook | **FINDING — no real auth** |
| `auth/login|register|forgot|reset` | none (rate-limited, enum-safe) | n/a | creates session/tokens | intentionally public | pass |
| `auth/refresh|me|sessions|change-pw|logout|verify-email` | token-gated | n/a | payload-derived | token-gated | pass (**sessions DELETE fixed**) |

Remaining findings (deferred with reason): messenger/instagram first-row-wins tenant mapping and telegram stub
need credential-mapping design work (2B); instagram GET/POST secret unification needs deploy-config decision (2B);
no per-role authorization layer is a design question (single-user-per-clinic assumed — confirm intent, 2B);
`chat`/`checkout` in `PUBLIC_PATHS` is misleading but currently safe (handler enforces auth; edge change deferred).

## Documentation Fixes

- `.env.example`: `CSRF_SECRET` documented; secret-fallback warning added.
- `AGENTS.md`: Recharts removed; Postgres-vs-SQLite clarified; single-service runtime documented.
- README: intentionally untouched (rewrite is 2B; truncation + stub disclosures tracked as 2B items).

## Repository Cleanup

No files deleted or moved in 2A (per instructions). Hygiene verdicts recorded above; `certificates/` is empty and
untracked (no action needed); `schema.sqlite.prisma` must be kept (import tooling depends on it — sync, don't delete).

## Configuration Changes

- `.eslintrc.json` (new), `.prettierrc.json` (new), `.nvmrc` (`24`), `engines >=18.17`, `format`/`format:check` scripts.
- `tsconfig.json` exclusion of `scripts/`+`tests/` inspected: widening scope now risks surfacing unrelated errors in
  seed/worker scripts; recommend a separate `tsconfig.scripts.json` in 2B instead of changing the main config.

## Tests Run

- New `tests/security-foundation.test.ts`: 11 tests (CSP validity, HSTS prod-only, CORS single/multi/disallowed,
  CSRF decisions, audit redaction) — pass.
- Focused: `security-foundation` + `auth` — 34 passed.
- Full suite `npm run test`: **25 files passed, 633 tests passed, 11 skipped** (5 env-gated files skipped, as before).
- `npm run typecheck`: clean. `npm run lint`: only the 5 pre-existing JSX-entity issues (fixed). `npm run build`:
  **success, 83/83 pages** (inbox/ai-providers dynamic-usage log lines are pre-existing informational output).
- Verified runtime: Node `v24.18.0`, npm `11.16.0`.

## Build Result

`next build` passes: compiled successfully, lint+types clean, 83/83 static pages, standalone output ready.
No behavior regressions: auth/refresh/dashboard flows untouched (only the header echo removed, which had no readers);
CSRF change affects only cookie-authenticated non-exempt state-changing API calls missing Origin/Referer (browsers
always send one); bearer/webhook/public paths unchanged.

## Remaining Findings

1. Telegram webhook stub (presence-only check, first-tenant-wins, never processes) — disable route or complete it.
2. Messenger/Instagram webhook tenant attribution (first-enabled-row-wins) — map page/IG ID → clinic like WhatsApp.
3. Instagram GET/POST secret inconsistency (`META_WEBHOOK_SECRET` vs `META_APP_SECRET`) — unify + document.
4. No per-role authorization (any session can bill/disconnect/edit settings) — confirm single-user assumption.
5. `chat`/`checkout` in `PUBLIC_PATHS` while requiring JWT — remove from list so edge also enforces.
6. Unused CSRF token helpers; non-constant-time HMAC compare; in-memory rate limiter; regex sanitizer;
   `Appointment` NULL-doctor slot bypass; missing cascades; `User.email` global uniqueness — all documented in the
   Phase 1 audit, untouched in 2A.
7. Repo-wide `format:check` fails on pre-existing drift (config added; no repo-wide reformat done to keep diff small).

## Phase 2B Recommendations

1. Decide license + public/private, then add `LICENSE`, `SECURITY.md`, `.github/` (CI, templates).
2. Fix webhook tenant attribution (messenger/instagram) + telegram decision + instagram secret unification.
3. Decide authorization model (roles vs single-user) and `chat`/`checkout` PUBLIC_PATHS cleanup.
4. Separate `tsconfig.scripts.json`; repo-wide prettier pass; root hygiene moves (`dev-test-css.html`,
   `test-whatsapp.ps1`); sync or retire `schema.sqlite.prisma`.
5. Full README rewrite with honest stub disclosures, screenshots, architecture docs, changelog, roadmap.
