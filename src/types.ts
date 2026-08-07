/** MCP JSON Schema fragment used by tool inputSchema. */
export type JsonSchema = {
  type?: string | string[]
  description?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  items?: JsonSchema
  additionalProperties?: boolean | JsonSchema
  [key: string]: unknown
}

/** One MCP tool definition (MCP tools/list shape). */
export type McpTool = {
  name: string
  description?: string
  inputSchema?: JsonSchema
  /** Optional annotations / extensions preserved from source. */
  [key: string]: unknown
}

export type LoadedManifest = {
  path: string
  tools: McpTool[]
}

export type Severity = 'info' | 'low' | 'medium' | 'high'

export type Finding = {
  /** Stable rule id, e.g. vague-verb / when-to-use / overlap / schema / annotations. */
  rule: string
  severity: Severity
  /** Ranking weight (higher = worse). */
  score: number
  message: string
  fix: string
  /** Primary tool name when applicable. */
  tool?: string
  /** Related tools (overlap). */
  tools?: string[]
  /** Source file path. */
  path?: string
  /** Extra structured context for --json consumers. */
  meta?: Record<string, unknown>
}

export type LintResult = {
  path: string
  toolCount: number
  findings: Finding[]
  summary: string
  highCount: number
  clean: boolean
}

export const SEVERITY_ORDER: Severity[] = ['high', 'medium', 'low', 'info']

export const SEVERITY_RANK: Record<Severity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
}

export function compareFindings(a: Finding, b: Finding): number {
  if (b.score !== a.score) return b.score - a.score
  const sev = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
  if (sev !== 0) return sev
  return (a.tool ?? a.tools?.join(',') ?? '').localeCompare(b.tool ?? b.tools?.join(',') ?? '')
}
