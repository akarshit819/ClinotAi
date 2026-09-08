import { NextResponse } from "next/server"
import { getClinicId } from "@/lib/api"
import { recordAuditEvent } from "@/lib/security"
import { getOpenRouterModel } from "@/lib/ai/providers"

const VALID_PROVIDERS = ["openrouter"]

export async function POST(req: Request) {
  try {
    const { clinicId } = await getClinicId(req)
    const { provider, apiKey } = await req.json()
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"

    if (!apiKey) {
      return NextResponse.json({ error: "API key is required" }, { status: 400 })
    }
    if (!provider) {
      return NextResponse.json({ error: "Provider is required" }, { status: 400 })
    }
    if (!VALID_PROVIDERS.includes(provider)) {
      return NextResponse.json({ error: `Unsupported provider. Supported: ${VALID_PROVIDERS.join(", ")}` }, { status: 400 })
    }

    const maskedKey = apiKey.length > 8 ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : "[REDACTED]"

    await recordAuditEvent({
      action: "api_key.test",
      clinicId,
      ip,
      details: { provider, keyPreview: maskedKey },
      severity: "info",
    })

    let response: Response
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    try {
      if (provider !== "openrouter") {
        clearTimeout(timeout)
        return NextResponse.json({ error: "Unsupported provider" }, { status: 400 })
      }
      // Probe with the ENV-CONFIGURED model — never a hardcoded ID.
      const probeModel = getOpenRouterModel()
      if (!probeModel) {
        clearTimeout(timeout)
        return NextResponse.json({ error: "OPENROUTER_MODEL is not configured", code: "NOT_CONFIGURED" }, { status: 400 })
      }
      response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: probeModel, messages: [{ role: "user", content: "hi" }], max_tokens: 10 }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }

    if (response.status === 401 || response.status === 403) {
      return NextResponse.json({ error: "Invalid API key", code: "INVALID_KEY" }, { status: 400 })
    }
    if (response.status === 429) {
      return NextResponse.json({ error: "Rate limit exceeded. Try again later.", code: "RATE_LIMITED" }, { status: 429 })
    }
    if (!response.ok) {
      return NextResponse.json({ error: `API test failed (${response.status})`, code: "API_ERROR" }, { status: 400 })
    }

    return NextResponse.json({ success: true, message: "Connection successful" })
  } catch (error: unknown) {
    const err = error as { name?: string; message?: string }
    if (err?.name === "AbortError") {
      return NextResponse.json({ error: "Connection timed out", code: "TIMEOUT" }, { status: 408 })
    }
    console.error("API config test error:", err?.message)
    return NextResponse.json({ error: "Failed to test connection", code: "TEST_FAILED" }, { status: 500 })
  }
}
