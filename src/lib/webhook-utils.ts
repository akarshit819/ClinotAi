import crypto from "crypto"

export function requireEnv(name: string): string {
  const val = process.env[name]
  if (!val || val.trim() === "") {
    if (process.env.NODE_ENV === "development") {
      throw new Error(`Missing required environment variable: ${name}. Set it in .env before using webhook.`)
    }
    throw new Error("Server configuration error")
  }
  return val.trim()
}

export function getAppSecret(): string {
  return requireEnv("META_APP_SECRET")
}

export function getWebhookSecret(): string {
  return requireEnv("WA_WEBHOOK_SECRET")
}

export function timingSafeEqual(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a)
    const bufB = Buffer.from(b)
    if (bufA.length !== bufB.length) {
      const empty = Buffer.alloc(bufA.length)
      crypto.timingSafeEqual(bufA, empty)
      return false
    }
    return crypto.timingSafeEqual(bufA, bufB)
  } catch {
    return false
  }
}

export function verifySignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader) return false

  const prefix = "sha256="
  if (!signatureHeader.startsWith(prefix)) return false

  const receivedSig = signatureHeader.slice(prefix.length)
  if (!/^[a-f0-9]{64}$/i.test(receivedSig)) return false

  const expectedSig = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex")

  return timingSafeEqual(expectedSig, receivedSig)
}