import type { Finding, McpTool } from '../types.js'

/** Vague verbs that need a specific object / resource in the tool name. */
export const VAGUE_VERBS = new Set([
  'get',
  'handle',
  'process',
  'manage',
  'do',
  'stuff',
  'run',
  'perform',
  'execute',
  'make',
  'fix',
  'update',
  'fetch',
  'set',
  'check',
  'help',
  'util',
  'utils',
  'misc',
  'data',
  'info',
])

const SPECIFICITY_HINTS =
  /^(create|list|search|delete|send|read|write|query|upload|download|subscribe|publish|authenticate|authorize|lint|validate|deploy|migrate|summarize|translate|render|parse|compile)/i

function splitNameTokens(name: string): string[] {
  return name
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[_\-\s./]+/)
    .filter(Boolean)
}

function vagueNameFinding(tool: McpTool, path: string): Finding | null {
  const tokens = splitNameTokens(tool.name)
  if (!tokens.length) return null

  const first = tokens[0]!
  const rest = tokens.slice(1)
  const restJoined = rest.join(' ')

  // Entire name is a vague verb (or verb + filler)
  const onlyVague =
    tokens.every((t) => VAGUE_VERBS.has(t)) ||
    (VAGUE_VERBS.has(first) && rest.length === 0)

  if (onlyVague) {
    return {
      rule: 'vague-verb',
      severity: 'high',
      score: 28,
      tool: tool.name,
      path,
      message: `Tool name "${tool.name}" is a vague verb with no specific resource or action target.`,
      fix: `Rename to a specific verb+object (e.g. list_pull_requests, create_calendar_event) instead of "${tool.name}".`,
      meta: { verbs: tokens },
    }
  }

  // Starts with vague verb and the remainder is also weak (data, stuff, info, thing…)
  const weakObjects = new Set(['data', 'stuff', 'thing', 'things', 'info', 'item', 'items', 'obj', 'object', 'resource', 'resources', 'misc', 'util', 'utils', 'helper', 'helpers'])
  if (VAGUE_VERBS.has(first) && rest.length > 0 && rest.every((t) => weakObjects.has(t) || VAGUE_VERBS.has(t))) {
    return {
      rule: 'vague-verb',
      severity: 'high',
      score: 26,
      tool: tool.name,
      path,
      message: `Tool name "${tool.name}" pairs vague verb "${first}" with a non-specific object ("${restJoined}").`,
      fix: `Replace with a concrete resource, e.g. ${first}_invoice / list_invoices — not "${tool.name}".`,
      meta: { verb: first, object: restJoined },
    }
  }

  // Vague leading verb with only a weak/empty object — specific nouns (ticket, invoice…) are OK
  if (
    VAGUE_VERBS.has(first) &&
    !SPECIFICITY_HINTS.test(tool.name) &&
    (rest.length === 0 || (rest.length === 1 && weakObjects.has(rest[0]!)))
  ) {
    return {
      rule: 'vague-verb',
      severity: 'medium',
      score: 16,
      tool: tool.name,
      path,
      message: `Tool name "${tool.name}" starts with vague verb "${first}" without a specific resource.`,
      fix: `Prefer a precise verb+object (e.g. look_up_user_by_email). Keep "${first}_…" only when the object noun is unambiguous.`,
      meta: { verb: first },
    }
  }

  return null
}

function vagueDescriptionFinding(tool: McpTool, path: string): Finding | null {
  const desc = (tool.description ?? '').trim()
  if (!desc) return null

  const lower = desc.toLowerCase()
  const vaguePhrases = [
    /\bhandles?\b.{0,20}\b(stuff|things|data|requests?)\b/,
    /\bprocesses?\b.{0,20}\b(stuff|things|data|input)\b/,
    /\bmanages?\b.{0,20}\b(stuff|things|data|everything)\b/,
    /\bdoes\b.{0,20}\b(stuff|things)\b/,
    /\bgeneral[- ]purpose\b/,
    /\bvarious\b.{0,20}\b(tasks?|things|operations?)\b/,
    /\banything\b/,
    /\bmisc(ellaneous)?\b/,
  ]

  for (const re of vaguePhrases) {
    if (re.test(lower)) {
      return {
        rule: 'vague-verb',
        severity: 'medium',
        score: 14,
        tool: tool.name,
        path,
        message: `Description for "${tool.name}" uses vague language (${re.source.slice(0, 40)}…).`,
        fix: `Rewrite the description to name the exact resource, inputs, and outcome. Avoid "handle/process/manage stuff/data".`,
        meta: { pattern: re.source },
      }
    }
  }

  // Description that is basically just a vague verb phrase
  if (/^(gets?|handles?|processes?|manages?|does|runs?|performs?|fetches?)\s+(data|stuff|things|info|it)?\.?$/i.test(desc)) {
    return {
      rule: 'vague-verb',
      severity: 'high',
      score: 24,
      tool: tool.name,
      path,
      message: `Description for "${tool.name}" is a vague one-liner with no specific capability.`,
      fix: `Expand into: what it does, on which resource, key inputs, and when an agent should call it.`,
    }
  }

  return null
}

export function checkVagueVerbs(tools: McpTool[], path: string): Finding[] {
  const findings: Finding[] = []
  for (const tool of tools) {
    const nameHit = vagueNameFinding(tool, path)
    if (nameHit) findings.push(nameHit)
    const descHit = vagueDescriptionFinding(tool, path)
    if (descHit) findings.push(descHit)
  }
  return findings
}
