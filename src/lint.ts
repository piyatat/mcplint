import { checkAnnotations } from './rules/annotations.js'
import { checkNaming } from './rules/naming.js'
import { checkOverlap } from './rules/overlap.js'
import { checkSchema } from './rules/schema.js'
import { checkVagueVerbs } from './rules/vague-verbs.js'
import { checkWhenToUse } from './rules/when-to-use.js'
import {
  compareFindings,
  type Finding,
  type LintResult,
  type LoadedManifest,
  type Severity,
  SEVERITY_ORDER,
} from './types.js'

export type LintOptions = {
  overlapThreshold?: number
  /** When set, run only these rule ids (e.g. naming, schema). */
  only?: string[]
}

const ALL_RULES = [
  'naming',
  'vague-verb',
  'when-to-use',
  'overlap',
  'schema',
  'annotations',
] as const

export function lintTools(
  tools: LoadedManifest['tools'],
  path: string,
  options: LintOptions = {},
): Finding[] {
  const only = options.only?.length ? new Set(options.only) : null
  const run = (rule: string) => !only || only.has(rule)

  const findings: Finding[] = [
    ...(run('naming') ? checkNaming(tools, path) : []),
    ...(run('vague-verb') ? checkVagueVerbs(tools, path) : []),
    ...(run('when-to-use') ? checkWhenToUse(tools, path) : []),
    ...(run('overlap') ? checkOverlap(tools, path, options.overlapThreshold) : []),
    ...(run('schema') ? checkSchema(tools, path) : []),
    ...(run('annotations') ? checkAnnotations(tools, path) : []),
  ]
  findings.sort(compareFindings)
  return findings
}

export { ALL_RULES }

export function lintManifest(manifest: LoadedManifest, options: LintOptions = {}): LintResult {
  const findings = lintTools(manifest.tools, manifest.path, options)
  const highCount = findings.filter((f) => f.severity === 'high').length
  const tally = severityTally(findings)
  const summary =
    findings.length === 0
      ? `Clean — ${manifest.tools.length} tool(s), no findings.`
      : `${findings.length} finding(s) across ${manifest.tools.length} tool(s)` +
        (tally ? ` (${tally})` : '') +
        '.'

  return {
    path: manifest.path,
    toolCount: manifest.tools.length,
    findings,
    summary,
    highCount,
    clean: findings.length === 0,
  }
}

export function lintAll(manifests: LoadedManifest[], options: LintOptions = {}): LintResult[] {
  return manifests.map((m) => lintManifest(m, options))
}

export function mergeResults(results: LintResult[]): {
  findings: Finding[]
  toolCount: number
  highCount: number
  clean: boolean
  summary: string
} {
  const findings = results.flatMap((r) => r.findings).sort(compareFindings)
  const toolCount = results.reduce((n, r) => n + r.toolCount, 0)
  const highCount = findings.filter((f) => f.severity === 'high').length
  const tally = severityTally(findings)
  const summary =
    findings.length === 0
      ? `Clean — ${toolCount} tool(s) in ${results.length} file(s), no findings.`
      : `${findings.length} finding(s) across ${toolCount} tool(s) in ${results.length} file(s)` +
        (tally ? ` (${tally})` : '') +
        '.'

  return {
    findings,
    toolCount,
    highCount,
    clean: findings.length === 0,
    summary,
  }
}

function severityTally(findings: Finding[]): string | null {
  if (!findings.length) return null
  const counts: Partial<Record<Severity, number>> = {}
  for (const f of findings) {
    counts[f.severity] = (counts[f.severity] ?? 0) + 1
  }
  const parts = SEVERITY_ORDER.filter((s) => (counts[s] ?? 0) > 0).map((s) => `${counts[s]} ${s}`)
  return parts.length ? parts.join(', ') : null
}
