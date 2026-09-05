import { prisma } from "@/lib/db"
import { searchKnowledge, formatRAGContext, hasHighConfidenceMatch, type KnowledgeEntry } from "./rag"

interface FallbackParams {
  userMessage: string
  clinicId: string
  ragResults?: { entries: KnowledgeEntry[]; topK: number }
}

export async function generateFallbackResponse(params: FallbackParams): Promise<string> {
  const { userMessage, clinicId, ragResults } = params
  const lower = userMessage.toLowerCase().trim()

  const [clinic, allFaqs, allKnowledge] = await Promise.all([
    prisma.clinic.findUnique({ where: { id: clinicId } }),
    prisma.fAQ.findMany({ where: { clinicId } }),
    prisma.knowledgeBase.findMany({ where: { clinicId } }),
  ])

  const clinicName = clinic?.name || "our clinic"
  const phone = clinic?.phone || ""
  const hours = clinic?.openingHours || ""
  const address = clinic?.address || ""

  const allEntries: KnowledgeEntry[] = [
    ...allKnowledge.map((k) => ({
      id: k.id,
      question: k.question,
      answer: k.answer,
      category: k.category,
      type: "knowledgebase" as const,
    })),
    ...allFaqs.map((f) => ({
      id: f.id,
      question: f.question,
      answer: f.answer,
      category: f.category,
      type: "faq" as const,
    })),
  ]

  const results = searchKnowledge(userMessage, allEntries, ragResults?.topK ?? 5)
  const hasGoodMatch = hasHighConfidenceMatch(results)

  if (hasGoodMatch) {
    const best = results[0]
    return best.answer
  }

  if (/\b(emergency|severe\s*pain|bleeding|broken\s*tooth|swelling|urgent)\b/i.test(lower)) {
    return `I understand this may be urgent. Please contact our clinic immediately at **${clinic?.emergencyPhone || "your clinic's emergency number"}**. For life-threatening emergencies, please call 911. Would you like me to alert our team that you're on your way?`
  }

  // Symptom disclosure with no explicit booking words ("I have knee
  // pain", "my tooth hurts", "I feel sick"). This branch guarantees a
  // USEFUL, safe response even when the AI provider is unavailable —
  // a symptom message must never fall through to the generic "I'm
  // not sure I have the exact information" reply. It deliberately
  // makes no diagnosis and offers the two correct next steps.
  if (
    /\b(pain|pains|hurts?|aching?|aches?|sore|swelling|swollen|fever|feeling\s+sick|feel\s+sick|nausea|dizzy|bleeding|symptom|discomfort|injur(?:y|ed)|stiff)\b/i.test(lower) ||
    /\b(my|the)\s+(head|tooth|teeth|gums?|jaw|back|neck|shoulder|knee|elbow|hand|finger|hip|leg|foot|feet|ear|throat|stomach|chest)\b/i.test(lower)
  ) {
    return `I'm sorry to hear you're dealing with that — our team wants to help. While I can't give medical advice myself, our clinicians can properly evaluate what's going on. Would you like me to book an appointment for you? If it's urgent, please call us at **${clinic?.emergencyPhone || phone || "the clinic"}** right away.`
  }

  if (/\b(book|appointment|schedule|reschedule|cancel|visit|see\s*(a\s*)?doctor|checkup|cleaning|consult)\b/i.test(lower)) {
    return `I'd be happy to help you schedule a visit! Could you please provide your full name, phone number, reason for your visit, and a preferred date and time? I'll send this to our team for confirmation.`
  }

  if (/\b(price|cost|how\s*much|fee|charge|rate|pricing|afford|payment|plan)\b/i.test(lower)) {
    if (allKnowledge.length > 0) {
      const priceInfo = allKnowledge
        .filter((k) => /\b(price|cost|fee|payment|charge)\b/i.test(k.question + " " + k.answer))
      if (priceInfo.length > 0) {
        return priceInfo.map((p) => p.answer).join("\n\n") + `\n\nWe also accept most major insurance plans. Would you like to schedule a consultation?`
      }
    }
    return `Please contact our clinic at **${phone || "our clinic"}** for detailed pricing information. We'd be happy to discuss our rates and payment options with you. Would you like to schedule a visit?`
  }

  if (/\b(hour|open|close|when\s*are\s*you|what\s*time|available|operating)\b/i.test(lower)) {
    return `Our hours are: **${hours || "Mon–Fri: 8:00 AM – 6:00 PM"}**\nWe're located at: **${address || "Please contact us for our address"}**\nWould you like to book an appointment?`
  }

  if (/\b(location|address|where\s*are\s*you|find\s*you|directions|map|office|clinic)\b/i.test(lower)) {
    return `You can find us at: **${address || "Please contact us for our address"}**\nWe have parking available. Would you like directions or to schedule a visit?`
  }

  if (/\b(insurance|cover|delta|cigna|aetna|metlife|blue.?cross|blue.?shield|provider|network|in.?network|out.?of.?network)\b/i.test(lower)) {
    if (allKnowledge.length > 0) {
      const insuranceInfo = allKnowledge.filter((k) => /\b(insurance|cover|delta|cigna|aetna)\b/i.test(k.question + " " + k.answer))
      if (insuranceInfo.length > 0) {
        return insuranceInfo.map((p) => p.answer).join("\n\n") + `\n\nWould you like to schedule a visit?`
      }
    }
    return `We accept most major insurance plans. Please contact our office at **${phone || "the clinic"}** to verify your specific plan coverage. Would you like to schedule a consultation?`
  }

  if (/\b(hello|hi[\s\b]|hey|good\s*(morning|afternoon|evening)|greetings|howdy)\b/i.test(lower)) {
    return `Hello! Welcome to ${clinicName}. I'm Clinot, your AI receptionist. I can help you with appointments, questions about our services, insurance inquiries, or direct you to emergency care if needed. How can I help you today?`
  }

  if (/\b(thanks|thank\s*you|appreciate|grateful)\b/i.test(lower)) {
    return `You're very welcome! I'm glad I could help. If you ever need anything else, don't hesitate to reach out. Have a great day! — Clinot, your AI receptionist`
  }

  if (/\b(bye|goodbye|see\s*you|talk\s*to\s*you\s*late?r|have\s*a\s*great\s*day)\b/i.test(lower)) {
    return `Goodbye! Thank you for reaching out to ${clinicName}. We look forward to serving you. Take care! — Clinot, your AI receptionist`
  }

  if (results.length > 0) {
    return `Thank you for your question. Based on what I have available, here's what I can share:\n\n${results[0].answer}\n\nIf you need more details, please call us at **${phone || "the clinic"}** and our team will be happy to assist.`
  }

  return `Thank you for reaching out to ${clinicName}. I'm not sure I have the exact information you're looking for. Could you please provide more details? You can also call us at **${phone || "the clinic"}** for immediate assistance, and I'll be happy to help however I can.`
}
