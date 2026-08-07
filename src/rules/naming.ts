import type { Finding, McpTool } from '../types.js'

/** MCP tool names should be lowercase snake_case (letters, digits, _, -). */
const VALID_NAME = /^[a-z][a-z0-9_-]*$/

export function checkNaming(tools: McpTool[], path: string): Finding[] {
  const findings: Finding[] = []

  for (const tool of tools) {
    const name = typeof tool.name === 'string' ? tool.name : ''
    if (!name.trim()) continue // empty-name handled by schema rule

    if (VALID_NAME.test(name)) continue

    const hasUpper = /[A-Z]/.test(name)
    const hasSpace = /\s/.test(name)
    const hasDot = /\./.test(name)
    const hints = [
      hasUpper ? 'uppercase letters' : null,
      hasSpace ? 'spaces' : null,
      hasDot ? 'dots' : null,
      !/^[a-z]/.test(name) ? 'must start with a lowercase letter' : null,
      /[^a-z0-9_-]/.test(name) ? 'invalid characters' : null,
    ].filter(Boolean)

    findings.push({
      rule: 'naming',
      severity: 'high',
      score: 28,
      tool: name,
      path,
      message: `Tool name "${name}" is not valid MCP snake_case (${hints.join(', ') || 'format'}).`,
      fix: `Rename to lowercase snake_case (e.g. list_pull_requests, get-user). Avoid camelCase, spaces, and dots.`,
      meta: { kind: 'invalid-name', hints },
    })
  }

  return findings
}
