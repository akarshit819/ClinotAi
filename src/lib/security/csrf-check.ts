/**
 * Pure, framework-free CSRF origin-check decision logic.
 *
 * Extracted from middleware so it can be unit-tested without Next.js.
 * Policy:
 * - Only applies to state-changing API requests that are not exempt
 *   (exemption is decided by the caller via `isExempt`).
 * - Requests authenticated with an ambient cookie (`hasCookieAuth`)
 *   are browser-like: Origin/Referer must be present AND same-origin.
 *   Missing Origin/Referer on a cookie-authenticated state-changing
 *   request is rejected (browsers always send one for such fetches).
 * - Requests WITHOUT cookie auth (e.g. `Authorization: Bearer`
 *   server-to-server clients, or unauthenticated requests that will
 *   401 later) skip the origin check — CSRF is a cookie-ambient attack.
 * - Exempt paths (webhooks, login/register, widget/chat, checkout)
 *   always skip — decided by the caller.
 */

export interface CsrfCheckInput {
  method: string
  isExempt: boolean
  hasCookieAuth: boolean
  origin: string
  referer: string
  host: string
  protocol: string
  appUrl: string
}

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "")
}

export function isSameOrigin(
  input: Pick<CsrfCheckInput, "origin" | "referer" | "host" | "protocol" | "appUrl">,
): boolean {
  const origin = stripTrailingSlashes(input.origin || "")
  const referer = stripTrailingSlashes(input.referer || "")
  const normalizedAppUrl = stripTrailingSlashes(input.appUrl || "")

  if (normalizedAppUrl && origin.startsWith(normalizedAppUrl)) return true
  if (normalizedAppUrl && referer.startsWith(normalizedAppUrl)) return true

  if (input.host && origin) {
    const protocol = input.protocol || "https:"
    if (origin === `${protocol}//${input.host}`) return true
  }

  return false
}

export type CsrfDecision = "allow" | "deny-missing-origin" | "deny-origin-mismatch" | "skip"

export function decideCsrf(input: CsrfCheckInput): CsrfDecision {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(input.method)) return "skip"
  if (input.isExempt) return "skip"
  // Bearer-token / unauthenticated server-to-server traffic is not
  // ambient-cookie traffic — CSRF does not apply.
  if (!input.hasCookieAuth) return "skip"

  const hasOrigin = Boolean(input.origin || input.referer)
  if (!hasOrigin) return "deny-missing-origin"
  if (!isSameOrigin(input)) return "deny-origin-mismatch"
  return "allow"
}
