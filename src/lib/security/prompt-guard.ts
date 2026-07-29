const PROMPT_INJECTION_PATTERNS = [
  /\bignore\s+(all\s+)?(previous|above|prior)\s+(instructions|directions|commands|prompts)\b/i,
  /\bforget\s+(all\s+)?(previous|above|prior)\b/i,
  /\bdisregard\s+(all\s+)?(previous|above|prior)\b/i,
  /\byou\s+are\s+(not\s+)?(a\s+)?(Clinot|receptionist|AI|assistant)\b/i,
  /\b(new\s+)?(instruction|command|rule|prompt|system)\s*[:：]\s*/i,
  /\b(act\s+as|pretend|roleplay|role.play)\s/i,
  /\b(reveal|show|display|print|output|leak|expose)\s+(your\s+)?(prompt|instructions|system|rules|config|settings)\b/i,
  /\bhow\s+(are\s+you\s+(programmed|trained|configured)|do\s+you\s+work|were\s+you\s+made)\b/i,
  /\b(what\s+are\s+your\s+(rules|instructions|guidelines|constraints|limitations)|tell\s+me\s+your\s+(prompt|instructions))\b/i,
  /\b(DAN|do\s+anything\s+now|jailbreak|jail.?break)\b/i,
  /\b(you\s+must|you\s+have\s+to|you\s+need\s+to)\s+(ignore|forget|disregard|skip|bypass)\b/i,
  /\b(sudo|admin|root|superuser|system)\s*(command|mode|access|override)\b/i,
  /\b(change|alter|modify|update)\s+(your\s+)?(behavior|personality|mode|role|settings)\b/i,
  /\b(output|return|respond)\s+(in\s+)?(json|xml|yaml|markdown|code|html)\b/i,
  /\bwithout\s+(any\s+)?(restrictions|limitations|rules|boundaries|filters|safeguards)\b/i,
  /\b(you\s+are\s+free|you\s+can\s+now|you're\s+allowed)\b/i,
  /\bwrite\s+(a\s+)?(poem|story|script|code|essay)\s+(about|on)\s+/i,
  /\bgive\s+me\s+(your\s+)?(full\s+)?(access|permissions|capabilities)\b/i,
  /\btranslate\s+(the\s+)?(above|previous|following).*(instructions|prompt|text)\b/i,
]

const PROMPT_INJECTION_THRESHOLD = 0.4

export interface PromptGuardResult {
  passed: boolean
  score: number
  matchedPatterns: string[]
}

export function checkPromptInjection(input: string): PromptGuardResult {
  const matchedPatterns: string[] = []

  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      matchedPatterns.push(pattern.source)
    }
  }

  const score = Math.min(1, matchedPatterns.length / 5)
  const passed = score < PROMPT_INJECTION_THRESHOLD

  return { passed, score, matchedPatterns }
}

const SENSITIVE_PATTERNS = [
  /\b(api[_-]?key|apikey|secret|password|token|jwt|credential)\s*[:=]\s*\S+/gi,
  /\b(bearer\s+)[\w-]{20,}/gi,
  /\b(sk-[a-zA-Z0-9]{20,}|sk-ant-[a-zA-Z0-9]{20,})/g,
  /\b(ENCRYPTION_KEY|JWT_SECRET|DATABASE_URL|AUTH_SECRET)\b/g,
  /\b(process\.env|env\.|process\s*\.\s*env)\b/g,
  /\b(eyJ[a-zA-Z0-9_\-]+\.eyJ[a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-]+)\b/g,
]

export interface LeakageGuardResult {
  passed: boolean
  matchedPatterns: string[]
}

export function checkForPromptLeakage(input: string): LeakageGuardResult {
  const matchedPatterns: string[] = []

  for (const pattern of SENSITIVE_PATTERNS) {
    const match = input.match(pattern)
    if (match) {
      matchedPatterns.push(match[0].slice(0, 40))
    }
  }

  return { passed: matchedPatterns.length === 0, matchedPatterns }
}

export function buildPromptInjectionResponse(): string {
  return "I'm here to help with clinic-related questions. Could you please ask about our services, appointments, or any other clinic information?"
}

export function buildLeakageBlockedResponse(): string {
  return "I'm sorry, but I can't share that information. Is there anything else I can help you with regarding our clinic?"
}
