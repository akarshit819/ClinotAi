# Clinot AI — Security

> Verified against `src/lib/security/`, `src/middleware.ts`, `src/lib/api.ts`, `src/lib/auth.ts`,
> `src/lib/env.ts`, and `next.config.js`. For the route-by-route audit, see
> [Phase 2A report](PHASE_2A_REPORT.md#authenticationtenant-audit).
>
> No compliance certifications (HIPAA, SOC 2, GDPR, medical-device) are claimed — there is no verified
> evidence for them. See [Responsible disclosure](../../SECURITY.md).

## 1. Authentication

- Custom JWT + DB-session model (`src/lib/auth.ts`): HS256, 15-min access / 7-day refresh / 30-day session
  (90-day remember-me). Signatures are HMAC-SHA256; only SHA-256 token hashes are stored.
- Every request re-validates: JWT signature **plus** live `Session.isActive` + expiry check — stolen tokens die
  with the session.
- Refresh rotation with family revoke-all; logout revokes the session server-side.

## 2. Passwords

- argon2id primary (`hash-wasm`, m=19456, t=3, p=1); legacy bcrypt hashes auto-rehashed on successful login.
- Strength rules: 10+ chars with upper/lower/digit/special. 5 failures → 15-minute lockout.

## 3. Authorization (RBAC) and tenant isolation

- `Role / Permission / RolePermission` tables; owner/admin get all permission codes, staff a 16-code subset.
- Tenant isolation is application-level `clinicId` scoping on every query (no Postgres RLS). The central
  `getClinicId()` helper derives `clinicId` from the verified JWT — routes never trust client-supplied clinic IDs.
- Current limitation (by design, pending decision): no per-route `requirePermission` checks — any valid session
  for a clinic can use that clinic's features. See [roadmap](../../ROADMAP.md).

## 4. CSRF

- Middleware enforces same-origin `Origin`/`Referer` on state-changing `/api/*` calls that carry cookie auth
  (logic in `src/lib/security/csrf-check.ts`, unit-tested). Missing origin on cookie-auth requests is rejected;
  `Authorization: Bearer` server-to-server traffic is exempt (CSRF is cookie-ambient); webhooks and auth-entry
  routes are exempt via `shouldBypassCsrf`.
- Requires `NEXT_PUBLIC_APP_URL` to be set correctly in production. Token-based CSRF helpers exist but are not
  wired into any flow yet.

## 5. CORS

- `getCorsHeadersForOrigin()` echoes only a configured, matching origin with credentials (fail-closed otherwise).
  The legacy helper emits ACAO only for a single configured origin — multi-origin comma lists are never produced.
- CORS helpers currently have no call sites (same-origin dashboard + webhooks don't need CORS); they exist for
  future cross-origin consumers.

## 6. Rate limiting

- In-memory per-IP limits: login 10/15min, signup 5/hour, chat 200/15min (higher in dev). Enforced in middleware
  for login/register/chat.
- Limitation: single-instance memory store — lost on restart, not shared across instances. A distributed limiter
  is future work.

## 7. Security headers

- `X-Frame-Options: DENY`, `nosniff`, strict `Referrer-Policy`, locked-down `Permissions-Policy`, COOP/COEP/CORP,
  `X-Robots-Tag: noindex, nofollow`, long cache on static assets.
- Production adds a full Content-Security-Policy and HSTS (`max-age=63072000; includeSubDomains; preload`).
  HSTS/CSP are intentionally absent in local HTTP development.

## 8. Webhook verification

- WhatsApp: `hub.verify_token` vs `WA_WEBHOOK_SECRET` (GET), HMAC `x-hub-signature-256` vs `META_APP_SECRET`
  (POST), clinic resolved server-side from `phoneNumberId` (fail-closed on unknown).
- Stripe: event construction with `STRIPE_SECRET_KEY` + signature, `StripeEvent` idempotency.
- Messenger/Instagram: HMAC-verified; known tenant-attribution gaps tracked on the
  [roadmap](../../ROADMAP.md). Telegram webhook is an unauthenticated stub — do not enable it.

## 9. Audit logging

- 38 action types (`src/lib/security/audit.ts`); details stored as JSON with sensitive keys redacted
  (passwords dropped; tokens, keys, URLs, provider credentials → `[REDACTED]`, including nested objects).
- Fail-open on write errors (logs the failure); redaction list is a living allowlist, not a proof of completeness.

## 10. Secrets and encryption

- Production refuses to boot without `JWT_SECRET`, `ENCRYPTION_KEY`, `CSRF_SECRET` (32+ chars each),
  `DATABASE_URL`, `META_APP_SECRET`, `WA_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`.
- Stored integration credentials are AES-256-GCM encrypted (`ENCRYPTION_KEY`); rotating it invalidates stored
  credentials. Dev-only hardcoded fallbacks exist with warnings — never valid in production.
- `.env` is git-ignored and untracked; `.env.example` contains placeholders only. No secrets in logs (presence
  booleans and hostnames only).

## 11. Known limitations

Single-instance rate limiting, regex-based HTML sanitization (not a substitute for DOMPurify where user HTML
renders), broad prompt-guard patterns (false positives possible), no RLS, `User.email` globally unique,
`Appointment` string-slot uniqueness bypassable with `NULL` doctor. Each is tracked; none is presented as solved.
