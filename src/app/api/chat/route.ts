import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { generateAIResponse } from "@/lib/ai"
import { getClinicId, handleApiError } from "@/lib/api"
import { AI } from "@/config/constants"
import { checkPromptInjection, checkForPromptLeakage, buildPromptInjectionResponse, buildLeakageBlockedResponse, recordAuditEvent } from "@/lib/security"
import { logger } from "@/lib/logger"
import { trackAiUsage, estimateTokens } from "@/lib/ai/usage"
import { requireFeatureAccess, checkConversationLimit } from "@/lib/billing"

export async function POST(req: Request) {
  try {
    const { clinicId } = await getClinicId(req)
    await requireFeatureAccess(clinicId, "ai")
    const { message, conversationId } = await req.json()
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message is required" }, { status: 400 })
    }

    const limitCheck = await checkConversationLimit(clinicId)
    if (!limitCheck.allowed) {
      return NextResponse.json({ error: "Monthly conversation limit reached. Upgrade your plan to continue." }, { status: 429 })
    }

    const sanitizedMessage = message.trim().slice(0, AI.maxMessageLength)

    const injectionCheck = checkPromptInjection(sanitizedMessage)
    if (!injectionCheck.passed) {
      await recordAuditEvent({
        action: "prompt_injection.blocked",
        clinicId,
        ip,
        details: { score: injectionCheck.score, matchedPatterns: injectionCheck.matchedPatterns.slice(0, 3) },
        severity: "warning",
      })
      return NextResponse.json({ reply: buildPromptInjectionResponse() })
    }

    const userTokens = estimateTokens(sanitizedMessage)

    let conversation
    if (conversationId) {
      conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      })
      if (!conversation || conversation.clinicId !== clinicId) {
        return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
      }
    } else {
      conversation = await prisma.conversation.create({
        data: { clinicId, status: "active" },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      })
    }

    await prisma.conversationMessage.create({
      data: { role: "user", content: sanitizedMessage, promptTokens: 0, completionTokens: 0, totalTokens: userTokens, conversationId: conversation.id },
    })

    const history = conversation.messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }))

    const response = await generateAIResponse(sanitizedMessage, clinicId, history)

    const leakageCheck = checkForPromptLeakage(response)
    if (!leakageCheck.passed) {
      logger.warn("Prompt leakage detected in AI response", {
        clinicId,
        matchedPatterns: leakageCheck.matchedPatterns.slice(0, 3),
      })
      await recordAuditEvent({
        action: "prompt_leakage.blocked",
        clinicId,
        ip,
        details: { matchedPatterns: leakageCheck.matchedPatterns.slice(0, 3) },
        severity: "critical",
      })
      return NextResponse.json({ reply: buildLeakageBlockedResponse() })
    }

    const completionTokens = estimateTokens(response)
    const totalTokens = userTokens + completionTokens

    await prisma.conversationMessage.create({
      data: { role: "assistant", content: response, promptTokens: userTokens, completionTokens, totalTokens, conversationId: conversation.id },
    })

    trackAiUsage(clinicId, { promptTokens: userTokens, completionTokens, totalTokens }, "clinot").catch((err) => {
      logger.error("Failed to track AI usage", { error: err })
    })

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { summary: sanitizedMessage.slice(0, 100) },
    })

    return NextResponse.json({ reply: response, conversationId: conversation.id })
  } catch (error) {
    return handleApiError(error, "Failed to generate response.")
  }
}
