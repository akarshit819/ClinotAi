export interface KnowledgeEntry {
  id: string
  question: string
  answer: string
  category?: string | null
  type: "knowledgebase" | "faq"
}

export interface ScoredEntry extends KnowledgeEntry {
  score: number
  matchedTerms: string[]
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t))
}

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "dare", "ought",
  "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
  "as", "into", "through", "during", "before", "after", "above", "below",
  "between", "out", "off", "over", "under", "again", "further", "then",
  "once", "here", "there", "when", "where", "why", "how", "all", "any",
  "both", "each", "few", "more", "most", "other", "some", "such", "no",
  "nor", "not", "only", "own", "same", "so", "than", "too", "very",
  "just", "about", "up", "down", "also", "and", "but", "or", "if",
  "because", "until", "while", "that", "this", "these", "those",
  "it", "its", "it's", "im", "ive", "you", "your", "yours", "me",
  "my", "mine", "we", "our", "they", "them", "their", "what",
  "which", "who", "whom", "please", "thank", "thanks", "yes", "no",
  "hi", "hello", "hey", "dear", "sir", "maam", "ma'am",
])

function computeBM25(
  queryTokens: string[],
  docTokens: string[],
  avgDocLength: number,
  k1 = 1.5,
  b = 0.75,
): number {
  const docFreq: Record<string, number> = {}
  docTokens.forEach((token) => {
    docFreq[token] = (docFreq[token] || 0) + 1
  })

  const docLength = docTokens.length
  let score = 0

  queryTokens.forEach((token) => {
    const tf = docFreq[token] || 0
    if (tf === 0) return

    const numerator = tf * (k1 + 1)
    const denominator = tf + k1 * (1 - b + b * (docLength / avgDocLength))
    score += numerator / denominator
  })

  return score
}

function exactPhraseBoost(query: string, entry: KnowledgeEntry): number {
  const queryLower = query.toLowerCase()
  const questionBoost = entry.question.toLowerCase().includes(queryLower) ? 3.0 : 0
  const answerBoost = entry.answer.toLowerCase().includes(queryLower) ? 1.0 : 0
  return questionBoost + answerBoost
}

function categoryBoost(query: string, category?: string | null): number {
  if (!category) return 0
  const catTokens = tokenize(category)
  const queryTokens = tokenize(query)
  return queryTokens.filter((t) => catTokens.includes(t)).length * 1.5
}

export function searchKnowledge(
  query: string,
  entries: KnowledgeEntry[],
  topK = 5,
): ScoredEntry[] {
  const queryTokens = tokenize(query)
  if (queryTokens.length === 0) return []

  const allTokens = entries.flatMap((e) => tokenize(e.question + " " + e.answer))
  const avgDocLength = allTokens.length / Math.max(1, entries.length)

  const scored = entries.map((entry) => {
    const questionTokens = tokenize(entry.question)
    const answerTokens = tokenize(entry.answer)

    const questionScore = computeBM25(queryTokens, questionTokens, Math.max(1, avgDocLength))
    const answerScore = computeBM25(queryTokens, answerTokens, Math.max(1, avgDocLength)) * 0.6
    const phraseBoost = exactPhraseBoost(query, entry) * 2
    const catBoost = categoryBoost(query, entry.category)

    const score = questionScore + answerScore + phraseBoost + catBoost

    const querySet = queryTokens.filter((t, i, a) => a.indexOf(t) === i)
    const docSet = questionTokens.concat(answerTokens).filter((t, i, a) => a.indexOf(t) === i)
    const matchedTerms = querySet.filter((t) => docSet.includes(t))

    return { ...entry, score, matchedTerms }
  })

  return scored
    .filter((e) => e.score > 0.01)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}

export function formatRAGContext(results: ScoredEntry[]): string {
  if (results.length === 0) return ""

  return results
    .map(
      (r, i) =>
        `[Source ${i + 1} - ${r.type === "faq" ? "FAQ" : "Knowledge Base"}${r.category ? ` (${r.category})` : ""}]\nQuestion: ${r.question}\nAnswer: ${r.answer}`,
    )
    .join("\n\n")
}

export function hasHighConfidenceMatch(results: ScoredEntry[], threshold = 1.5): boolean {
  return results.length > 0 && results[0].score >= threshold
}
