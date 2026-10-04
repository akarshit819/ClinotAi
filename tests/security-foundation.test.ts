import { describe, it, expect } from "vitest"

import {
  getCSPDirectives,
  getSecurityHeaders,
  getCorsHeaders,
  getCorsHeadersForOrigin,
} from "@/lib/security/headers"
import { decideCsrf } from "@/lib/security/csrf-check"
import { redactSensitiveDetails } from "@/lib/security/audit"

describe("CSP directives (S-1)", () => {
  it("returns a valid policy string, not an object dump", () => {
    const csp = getCSPDirectives(true)
    expect(typeof csp).toBe("string")
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).not.toContain("[object Object]")
    // Every directive is `name value` (or the valueless
    // `upgrade-insecure-requests`), joined by "; ".
    for (const directive of csp.split("; ")) {
      expect(directive.trim()).toMatch(/^[a-z-]+( .+)?$/)
    }
  })

  it("adds upgrade-insecure-requests only in production", () => {
    expect(getCSPDirectives(true)).toContain("upgrade-insecure-requests")
    expect(getCSPDirectives(false)).not.toContain("upgrade-insecure-requests")
  })
})

describe("HSTS is production-only", () => {
  it("includes HSTS in production and omits it in dev", () => {
    expect(getSecurityHeaders(true)["Strict-Transport-Security"]).toContain("max-age=")
    expect(getSecurityHeaders(false)["Strict-Transport-Security"]).toBeUndefined()
  })
})

describe("CORS headers (Q-1)", () => {
  it("echoes a single allowed origin with credentials", () => {
    const headers = getCorsHeadersForOrigin("https://app.example.com", ["https://app.example.com"])
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://app.example.com")
    expect(headers["Access-Control-Allow-Credentials"]).toBe("true")
  })

  it("never emits a comma-joined multi-origin list", () => {
    const headers = getCorsHeadersForOrigin("https://a.example.com", [
      "https://a.example.com",
      "https://b.example.com",
    ])
    // Single echo of the matched request origin only.
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://a.example.com")
    expect(headers["Access-Control-Allow-Origin"]).not.toContain(",")
  })

  it("fail-closed for disallowed or missing origins", () => {
    for (const origin of [undefined, "", "https://evil.example.com"]) {
      const headers = getCorsHeadersForOrigin(origin, ["https://app.example.com"])
      expect(headers["Access-Control-Allow-Origin"]).toBeUndefined()
      expect(headers["Access-Control-Allow-Credentials"]).toBeUndefined()
    }
  })

  it("legacy helper only emits ACAO for exactly one configured origin", () => {
    expect(getCorsHeaders(["https://app.example.com"])["Access-Control-Allow-Origin"]).toBe(
      "https://app.example.com",
    )
    const multi = getCorsHeaders(["https://a.example.com", "https://b.example.com"])
    expect(multi["Access-Control-Allow-Origin"]).toBeUndefined()
    expect(multi["Access-Control-Allow-Origin"] ?? "").not.toContain(",")
  })
})

describe("CSRF origin decision", () => {
  const base = {
    origin: "https://app.example.com",
    referer: "",
    host: "app.example.com",
    protocol: "https:",
    appUrl: "https://app.example.com",
  }

  it("skips safe methods, exempt paths, and non-cookie (bearer) traffic", () => {
    expect(decideCsrf({ ...base, method: "GET", isExempt: false, hasCookieAuth: true })).toBe(
      "skip",
    )
    expect(decideCsrf({ ...base, method: "POST", isExempt: true, hasCookieAuth: true })).toBe(
      "skip",
    )
    expect(decideCsrf({ ...base, method: "POST", isExempt: false, hasCookieAuth: false })).toBe(
      "skip",
    )
  })

  it("denies cookie-authenticated state-changing requests with missing origin", () => {
    expect(
      decideCsrf({
        ...base,
        method: "POST",
        isExempt: false,
        hasCookieAuth: true,
        origin: "",
        referer: "",
      }),
    ).toBe("deny-missing-origin")
  })

  it("denies origin mismatch and allows same-origin", () => {
    expect(
      decideCsrf({
        ...base,
        method: "POST",
        isExempt: false,
        hasCookieAuth: true,
        origin: "https://evil.example.com",
      }),
    ).toBe("deny-origin-mismatch")
    expect(decideCsrf({ ...base, method: "POST", isExempt: false, hasCookieAuth: true })).toBe(
      "allow",
    )
  })
})

describe("audit log redaction", () => {
  it("drops passwords and redacts sensitive keys, preserving benign fields", () => {
    const redacted = redactSensitiveDetails({
      email: "owner@clinic.com",
      password: "supersecret",
      token: "abc",
      apiKey: "key",
      DATABASE_URL: "postgres://u:p@h/db",
      OPENROUTER_API_KEY: "sk-or-123",
      WHATSAPP_ACCESS_TOKEN: "EAAB",
      stripeSecretKey: "sk_test_123",
      authorization: "Bearer abc",
      nested: { jwt: "eyJ", ok: true },
    })
    expect(redacted.email).toBe("owner@clinic.com")
    expect("password" in redacted).toBe(false)
    for (const key of [
      "token",
      "apiKey",
      "DATABASE_URL",
      "OPENROUTER_API_KEY",
      "WHATSAPP_ACCESS_TOKEN",
      "stripeSecretKey",
      "authorization",
    ]) {
      expect(redacted[key]).toBe("[REDACTED]")
    }
    expect((redacted.nested as Record<string, unknown>).jwt).toBe("[REDACTED]")
    expect((redacted.nested as Record<string, unknown>).ok).toBe(true)
  })
})
