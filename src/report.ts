import { basename } from 'node:path'
import type { Finding, LintResult, Severity } from './types.js'
import { SEVERITY_ORDER } from './types.js'

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
}

function colorize(enabled: boolean, color: string, text: string): string {
  if (!enabled) return text
  return `${color}${text}${COLORS.reset}`
}

function severityColor(sev: Severity): string {
  switch (sev) {
    case 'high':
      return COLORS.red
    case 'medium':
      return COLORS.yellow
    case 'low':
      return COLORS.cyan
    default:
      return COLORS.dim
  }
}

function padSev(sev: Severity): string {
  return sev.toUpperCase().padEnd(6, ' ')
}

export type ReportBundle = {
  results: LintResult[]
  findings: Finding[]
  toolCount: number
  highCount: number
  clean: boolean
  summary: string
  version: string
}

export function formatText(bundle: ReportBundle, color: boolean): string {
  const c = (col: string, t: string) => colorize(color, col, t)
  const lines: string[] = []

  lines.push('')
  lines.push(c(COLORS.bold, 'mcplint') + c(COLORS.dim, ` · v${bundle.version} · MCP tool static lint`))
  const files = bundle.results.map((r) => basename(r.path)).join(', ')
  lines.push(c(COLORS.dim, files || '(no files)') + ` · ${bundle.toolCount} tool(s)`)
  lines.push('')

  if (bundle.clean) {
    lines.push(c(COLORS.green, '✓ clean') + '  ' + c(COLORS.dim, bundle.summary))
    lines.push('')
    return lines.join('\n')
  }

  const status =
    bundle.highCount > 0
      ? c(COLORS.red, `${bundle.highCount} high`)
      : c(COLORS.yellow, 'warnings')
  lines.push(`${status}  ${c(COLORS.dim, bundle.summary)}`)
  lines.push('')

  let i = 1
  for (const f of bundle.findings) {
    const sev = c(severityColor(f.severity), padSev(f.severity))
    const rule = c(COLORS.dim, f.rule)
    const where = f.tool
      ? c(COLORS.bold, f.tool)
      : f.tools?.map((t) => c(COLORS.bold, t)).join(c(COLORS.dim, ' ↔ ')) ?? ''
    lines.push(`${c(COLORS.dim, String(i).padStart(2, ' '))}. ${sev} ${rule}  ${where}`)
    lines.push(`    ${f.message}`)
    lines.push(`    ${c(COLORS.cyan, 'fix:')} ${f.fix}`)
    if (f.path && bundle.results.length > 1) {
      lines.push(`    ${c(COLORS.dim, basename(f.path))}`)
    }
    lines.push('')
    i++
  }

  if (bundle.highCount > 0) {
    lines.push(c(COLORS.dim, 'Exit 1 — high-severity findings present.'))
  } else {
    lines.push(c(COLORS.dim, 'Exit 0 — no high-severity findings.'))
  }
  lines.push('')
  return lines.join('\n')
}

export function formatJson(bundle: ReportBundle): string {
  const counts: Partial<Record<Severity, number>> = {}
  for (const f of bundle.findings) {
    counts[f.severity] = (counts[f.severity] ?? 0) + 1
  }

  return JSON.stringify(
    {
      version: bundle.version,
      clean: bundle.clean,
      highCount: bundle.highCount,
      toolCount: bundle.toolCount,
      summary: bundle.summary,
      severityCounts: Object.fromEntries(
        SEVERITY_ORDER.filter((s) => counts[s]).map((s) => [s, counts[s]]),
      ),
      files: bundle.results.map((r) => ({
        path: r.path,
        toolCount: r.toolCount,
        findingCount: r.findings.length,
        highCount: r.highCount,
        clean: r.clean,
      })),
      findings: bundle.findings.map((f) => ({
        rule: f.rule,
        severity: f.severity,
        score: f.score,
        message: f.message,
        fix: f.fix,
        tool: f.tool,
        tools: f.tools,
        path: f.path,
        meta: f.meta,
      })),
    },
    null,
    2,
  )
}
