import { overlapScore } from '../similarity.js'
import type { Finding, McpTool } from '../types.js'

/** Default threshold: report pairs at or above this blended similarity. */
export const DEFAULT_OVERLAP_THRESHOLD = 0.48

/** Name + description only — shared schema keys (owner/repo/id) inflate similarity falsely. */
function toolText(tool: McpTool): string {
  return `${tool.name} ${tool.description ?? ''}`.trim()
}

export function checkOverlap(
  tools: McpTool[],
  path: string,
  threshold = DEFAULT_OVERLAP_THRESHOLD,
): Finding[] {
  const findings: Finding[] = []

  for (let i = 0; i < tools.length; i++) {
    for (let j = i + 1; j < tools.length; j++) {
      const a = tools[i]!
      const b = tools[j]!
      const score = overlapScore(toolText(a), toolText(b))
      if (score < threshold) continue

      const high = score >= 0.65
      findings.push({
        rule: 'overlap',
        severity: high ? 'high' : 'medium',
        score: high ? 20 + Math.round(score * 20) : 12 + Math.round(score * 15),
        tools: [a.name, b.name],
        path,
        message: `Tools "${a.name}" and "${b.name}" look overlapping (similarity ${score.toFixed(2)}).`,
        fix: `Merge into one tool, or differentiate names/descriptions so agents can tell them apart (state exclusive when-to-use for each).`,
        meta: { similarity: Number(score.toFixed(4)), threshold },
      })
    }
  }

  // Exact duplicate names (same string twice in one manifest)
  const byExact = new Map<string, number>()
  for (const t of tools) {
    byExact.set(t.name, (byExact.get(t.name) ?? 0) + 1)
  }
  for (const [name, count] of byExact) {
    if (count < 2) continue
    findings.push({
      rule: 'overlap',
      severity: 'high',
      score: 40,
      tools: Array.from({ length: count }, () => name),
      path,
      message: `Exact duplicate tool name "${name}" appears ${count} times in the same manifest.`,
      fix: `Remove or rename duplicates so each tool name is unique.`,
      meta: { kind: 'exact-duplicate', count },
    })
  }

  // Exact / near-exact name collisions after normalizing separators
  const byNorm = new Map<string, string[]>()
  for (const t of tools) {
    const norm = t.name.toLowerCase().replace(/[_\-\s]+/g, '')
    const list = byNorm.get(norm) ?? []
    list.push(t.name)
    byNorm.set(norm, list)
  }
  for (const [, names] of byNorm) {
    if (names.length < 2) continue
    const unique = [...new Set(names)]
    // Exact duplicates already reported above; skip when every name is identical.
    if (unique.length < 2) continue
    findings.push({
      rule: 'overlap',
      severity: 'high',
      score: 35,
      tools: unique,
      path,
      message: `Near-duplicate tool names: ${unique.map((n) => `"${n}"`).join(', ')}.`,
      fix: `Keep a single canonical name; rename or remove duplicates.`,
      meta: { kind: 'name-collision' },
    })
  }

  // Exact duplicate descriptions (after trim) — agents cannot tell tools apart
  const byDesc = new Map<string, string[]>()
  for (const t of tools) {
    const desc = (t.description ?? '').trim()
    if (!desc) continue
    const list = byDesc.get(desc) ?? []
    list.push(t.name)
    byDesc.set(desc, list)
  }
  for (const [desc, names] of byDesc) {
    if (names.length < 2) continue
    const unique = [...new Set(names)]
    findings.push({
      rule: 'overlap',
      severity: 'high',
      score: 38,
      tools: unique,
      path,
      message: `Exact duplicate description shared by ${unique.map((n) => `"${n}"`).join(', ')}.`,
      fix: `Give each tool a distinct description with exclusive when-to-use guidance.`,
      meta: {
        kind: 'exact-duplicate-description',
        descriptionPreview: desc.length > 80 ? `${desc.slice(0, 79)}…` : desc,
      },
    })
  }

  return findings
}
