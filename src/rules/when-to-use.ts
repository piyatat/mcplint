import type { Finding, McpTool } from '../types.js'

/** Patterns that indicate usage guidance / when-to-use language. */
const WHEN_TO_USE_PATTERNS: RegExp[] = [
  /\bwhen to use\b/i,
  /\buse (this|when|if|for|only)\b/i,
  /\buse this (tool |)?(when|if|for|to)\b/i,
  /\bprefer (this|when|over)\b/i,
  /\bdo not use\b/i,
  /\bdon't use\b/i,
  /\binstead of\b/i,
  /\bnot for\b/i,
  /\bavoid (when|if|for)\b/i,
  /\bcall (this|when|if)\b/i,
  /\bonly (when|if|for)\b/i,
  /\bideal for\b/i,
  /\bintended for\b/i,
  /\bhelpful when\b/i,
  /\buseful when\b/i,
  /\bchoose this\b/i,
  /\bshould (be )?used\b/i,
]

const MIN_DESCRIPTION_LEN = 40

export function hasWhenToUseGuidance(description: string): boolean {
  const d = description.trim()
  if (!d) return false
  return WHEN_TO_USE_PATTERNS.some((re) => re.test(d))
}

export function checkWhenToUse(tools: McpTool[], path: string): Finding[] {
  const findings: Finding[] = []

  for (const tool of tools) {
    const desc = (tool.description ?? '').trim()

    if (!desc) {
      findings.push({
        rule: 'when-to-use',
        severity: 'high',
        score: 30,
        tool: tool.name,
        path,
        message: `Tool "${tool.name}" has no description — agents cannot decide when to use it.`,
        fix: `Add a description that states what the tool does and when to use it (and when not to).`,
      })
      continue
    }

    if (desc.length < MIN_DESCRIPTION_LEN) {
      findings.push({
        rule: 'when-to-use',
        severity: 'medium',
        score: 18,
        tool: tool.name,
        path,
        message: `Description for "${tool.name}" is very short (${desc.length} chars) and likely lacks usage guidance.`,
        fix: `Expand to ≥${MIN_DESCRIPTION_LEN} characters and include a "Use when…" / "Do not use when…" sentence.`,
        meta: { length: desc.length },
      })
    }

    if (!hasWhenToUseGuidance(desc)) {
      findings.push({
        rule: 'when-to-use',
        severity: desc.length < MIN_DESCRIPTION_LEN ? 'high' : 'medium',
        score: desc.length < MIN_DESCRIPTION_LEN ? 22 : 17,
        tool: tool.name,
        path,
        message: `Description for "${tool.name}" lacks explicit when-to-use / when-not-to-use guidance.`,
        fix: `Add a sentence like: "Use when you need X. Do not use for Y — prefer tool Z instead."`,
      })
    }
  }

  return findings
}
