const TOKEN_EXPIRY = 3600_000

function getCsrfSecret(): string {
  return process.env.CSRF_SECRET || "csrf-secret-not-configured"
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")
}

function base64UrlEncode(input: string): string {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - input.length % 4) % 4)
  return atob(padded)
}

async function hmacSha256(key: string, data: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    "raw", enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"],
  )
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data))
  return bytesToHex(new Uint8Array(signature))
}

export async function generateCsrfToken(sessionId: string): Promise<string> {
  const timestamp = Date.now()
  const secret = getCsrfSecret()
  const raw = `${sessionId}:${timestamp}:${secret}`
  const hmac = await hmacSha256(secret, raw)
  return base64UrlEncode(`${sessionId}:${timestamp}:${hmac}`)
}

export async function validateCsrfToken(token: string, sessionId: string): Promise<boolean> {
  try {
    const decoded = base64UrlDecode(token)
    const parts = decoded.split(":")
    if (parts.length !== 3) return false
    const [tokenSessionId, timestamp, hmac] = parts
    if (tokenSessionId !== sessionId) return false
    const age = Date.now() - parseInt(timestamp, 10)
    if (isNaN(age) || age > TOKEN_EXPIRY) return false
    const secret = getCsrfSecret()
    const raw = `${sessionId}:${timestamp}:${secret}`
    const expected = await hmacSha256(secret, raw)
    if (hmac.length !== expected.length) return false
    return hmac === expected
  } catch {
    return false
  }
}

export function csrfTokenCookieName(): string {
  return "__Host-csrf-token"
}
