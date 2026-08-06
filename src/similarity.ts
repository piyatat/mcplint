import { createHash } from 'node:crypto'

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'to',
  'of',
  'in',
  'on',
  'for',
  'with',
  'from',
  'by',
  'is',
  'are',
  'be',
  'this',
  'that',
  'it',
  'as',
  'at',
  'into',
  'when',
  'use',
  'using',
  'used',
  'tool',
  'tools',
])

/** Tokenize name + description into a bag-of-words (lowercased, stopwords dropped). */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\-/./\\]+/g, ' ')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
}

export function bagOfWords(tokens: string[]): Map<string, number> {
  const bag = new Map<string, number>()
  for (const t of tokens) {
    bag.set(t, (bag.get(t) ?? 0) + 1)
  }
  return bag
}

/** Jaccard similarity over unique token sets. */
export function jaccard(a: Iterable<string>, b: Iterable<string>): number {
  const setA = a instanceof Set ? a : new Set(a)
  const setB = b instanceof Set ? b : new Set(b)
  if (setA.size === 0 && setB.size === 0) return 1
  if (setA.size === 0 || setB.size === 0) return 0
  let inter = 0
  for (const t of setA) {
    if (setB.has(t)) inter++
  }
  const union = setA.size + setB.size - inter
  return union === 0 ? 0 : inter / union
}

/** Cosine similarity on bag-of-words term frequencies. */
export function cosine(a: Map<string, number>, b: Map<string, number>): number {
  if (a.size === 0 || b.size === 0) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (const [, v] of a) normA += v * v
  for (const [, v] of b) normB += v * v
  const smaller = a.size <= b.size ? a : b
  const larger = a.size <= b.size ? b : a
  for (const [k, v] of smaller) {
    const w = larger.get(k)
    if (w !== undefined) dot += v * w
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/** Blend Jaccard + cosine for overlap ranking (0–1). */
export function overlapScore(textA: string, textB: string): number {
  const tokA = tokenize(textA)
  const tokB = tokenize(textB)
  const jac = jaccard(tokA, tokB)
  const cos = cosine(bagOfWords(tokA), bagOfWords(tokB))
  return 0.55 * jac + 0.45 * cos
}

export function shortHash(input: string): string {
  return createHash('sha1').update(input).digest('hex').slice(0, 8)
}
