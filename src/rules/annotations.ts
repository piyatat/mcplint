import type { Finding, McpTool } from '../types.js'

/** Name prefixes that imply read-only / non-mutating behavior. */
const READ_ONLY_PREFIXES =
  /^(list|get|search|find|read|fetch|query|lookup|look_up|describe|show|inspect|count|stat|stats|head|preview|view)_/i

/** Name prefixes that imply destructive / mutating deletes. */
const DESTRUCTIVE_PREFIXES =
  /^(delete|remove|destroy|drop|purge|wipe|revoke|cancel|terminate|kill)_/i

/** Name prefixes that imply additive / write mutations (not necessarily destructive). */
const WRITE_PREFIXES =
  /^(create|add|insert|update|set|write|put|patch|send|upload|publish|post|append|upsert|replace|move|rename|edit)_/i

type ToolAnnotations = {
  title?: unknown
  readOnlyHint?: unknown
  destructiveHint?: unknown
  idempotentHint?: unknown
  openWorldHint?: unknown
}

function getAnnotations(tool: McpTool): ToolAnnotations | null {
  const raw = tool.annotations
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  return raw as ToolAnnotations
}

function isBool(v: unknown): v is boolean {
  return typeof v === 'boolean'
}

export function checkAnnotations(tools: McpTool[], path: string): Finding[] {
  const findings: Finding[] = []

  for (const tool of tools) {
    const ann = getAnnotations(tool)
    const name = tool.name

    if (!ann) {
      findings.push({
        rule: 'annotations',
        severity: 'medium',
        score: 13,
        tool: name,
        path,
        message: `Tool "${name}" has no annotations object (readOnlyHint / destructiveHint / openWorldHint).`,
        fix: `Add annotations: { "title": "…", "readOnlyHint": true|false, "destructiveHint": true|false, "openWorldHint": true|false }.`,
      })
      continue
    }

    if (ann.readOnlyHint === undefined) {
      findings.push({
        rule: 'annotations',
        severity: 'medium',
        score: 12,
        tool: name,
        path,
        message: `Tool "${name}" annotations omit readOnlyHint — clients assume the tool may mutate.`,
        fix: `Set annotations.readOnlyHint to true for read-only tools, or false for tools that write/mutate.`,
        meta: { field: 'readOnlyHint' },
      })
    } else if (!isBool(ann.readOnlyHint)) {
      findings.push({
        rule: 'annotations',
        severity: 'high',
        score: 20,
        tool: name,
        path,
        message: `Tool "${name}" annotations.readOnlyHint must be a boolean.`,
        fix: `Use true or false, e.g. "readOnlyHint": true.`,
        meta: { field: 'readOnlyHint' },
      })
    }

    if (ann.destructiveHint !== undefined && !isBool(ann.destructiveHint)) {
      findings.push({
        rule: 'annotations',
        severity: 'high',
        score: 20,
        tool: name,
        path,
        message: `Tool "${name}" annotations.destructiveHint must be a boolean.`,
        fix: `Use true or false, e.g. "destructiveHint": false for additive writes.`,
        meta: { field: 'destructiveHint' },
      })
    }

    if (ann.openWorldHint !== undefined && !isBool(ann.openWorldHint)) {
      findings.push({
        rule: 'annotations',
        severity: 'high',
        score: 20,
        tool: name,
        path,
        message: `Tool "${name}" annotations.openWorldHint must be a boolean.`,
        fix: `Use true if the tool reaches external systems; false for a closed domain.`,
        meta: { field: 'openWorldHint' },
      })
    }

    if (ann.title !== undefined && (typeof ann.title !== 'string' || !ann.title.trim())) {
      findings.push({
        rule: 'annotations',
        severity: 'low',
        score: 5,
        tool: name,
        path,
        message: `Tool "${name}" annotations.title should be a non-empty string.`,
        fix: `Set a human-readable title for UI display (e.g. "List Pull Requests").`,
        meta: { field: 'title' },
      })
    } else if (ann.title === undefined) {
      findings.push({
        rule: 'annotations',
        severity: 'info',
        score: 2,
        tool: name,
        path,
        message: `Tool "${name}" annotations omit title (optional but useful for client UIs).`,
        fix: `Add annotations.title with a short human-readable label.`,
        meta: { field: 'title' },
      })
    }

    // Name ↔ hint consistency
    if (ann.readOnlyHint === true && DESTRUCTIVE_PREFIXES.test(name)) {
      findings.push({
        rule: 'annotations',
        severity: 'high',
        score: 27,
        tool: name,
        path,
        message: `Tool "${name}" looks destructive by name but annotations.readOnlyHint is true.`,
        fix: `Set readOnlyHint to false and destructiveHint to true (or rename the tool if it is truly read-only).`,
        meta: { readOnlyHint: true, nameImplies: 'destructive' },
      })
    }

    if (ann.readOnlyHint === true && WRITE_PREFIXES.test(name) && !READ_ONLY_PREFIXES.test(name)) {
      findings.push({
        rule: 'annotations',
        severity: 'high',
        score: 25,
        tool: name,
        path,
        message: `Tool "${name}" looks mutating by name but annotations.readOnlyHint is true.`,
        fix: `Set readOnlyHint to false. Use destructiveHint to distinguish overwrite vs additive writes.`,
        meta: { readOnlyHint: true, nameImplies: 'write' },
      })
    }

    if (ann.readOnlyHint === false && READ_ONLY_PREFIXES.test(name) && !WRITE_PREFIXES.test(name) && !DESTRUCTIVE_PREFIXES.test(name)) {
      findings.push({
        rule: 'annotations',
        severity: 'low',
        score: 7,
        tool: name,
        path,
        message: `Tool "${name}" looks read-only by name but annotations.readOnlyHint is false.`,
        fix: `If the tool only reads, set readOnlyHint to true so clients can skip confirmation prompts.`,
        meta: { readOnlyHint: false, nameImplies: 'read' },
      })
    }

    if (ann.readOnlyHint === true && ann.destructiveHint === true) {
      findings.push({
        rule: 'annotations',
        severity: 'medium',
        score: 14,
        tool: name,
        path,
        message: `Tool "${name}" sets readOnlyHint true and destructiveHint true — contradictory.`,
        fix: `For read-only tools omit destructiveHint or set it to false. destructiveHint only applies when readOnlyHint is false.`,
        meta: { readOnlyHint: true, destructiveHint: true },
      })
    }

    if (
      ann.readOnlyHint === false &&
      DESTRUCTIVE_PREFIXES.test(name) &&
      ann.destructiveHint === false
    ) {
      findings.push({
        rule: 'annotations',
        severity: 'medium',
        score: 15,
        tool: name,
        path,
        message: `Tool "${name}" looks destructive by name but annotations.destructiveHint is false.`,
        fix: `Set destructiveHint to true for delete/overwrite/revoke operations, or rename if the tool is additive.`,
        meta: { destructiveHint: false, nameImplies: 'destructive' },
      })
    }

    if (ann.readOnlyHint === false && ann.destructiveHint === undefined) {
      findings.push({
        rule: 'annotations',
        severity: 'low',
        score: 6,
        tool: name,
        path,
        message: `Tool "${name}" is not read-only but omits destructiveHint (clients default to assuming destructive).`,
        fix: `Set destructiveHint to false for additive creates/appends, or true for deletes/overwrites.`,
        meta: { field: 'destructiveHint' },
      })
    }

    if (ann.openWorldHint === undefined) {
      findings.push({
        rule: 'annotations',
        severity: 'info',
        score: 3,
        tool: name,
        path,
        message: `Tool "${name}" annotations omit openWorldHint (clients default to open-world).`,
        fix: `Set openWorldHint to false for closed domains (local memory, single DB); true when calling external APIs/networks.`,
        meta: { field: 'openWorldHint' },
      })
    }
  }

  return findings
}
