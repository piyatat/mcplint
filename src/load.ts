import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import type { LoadedManifest, McpTool } from './types.js'

const JSON_EXTS = new Set(['.json', '.jsonl'])

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function asTool(raw: unknown, index: number, path: string): McpTool {
  if (!isRecord(raw)) {
    throw new Error(`${path}: tool #${index} is not an object`)
  }
  const name = raw.name
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error(`${path}: tool #${index} is missing a non-empty string "name"`)
  }
  const tool: McpTool = { name: name.trim() }
  if (typeof raw.description === 'string') tool.description = raw.description
  if (isRecord(raw.inputSchema)) tool.inputSchema = raw.inputSchema as McpTool['inputSchema']
  // Common alias used in some fixtures / SDKs
  if (!tool.inputSchema && isRecord(raw.parameters)) {
    tool.inputSchema = raw.parameters as McpTool['inputSchema']
  }
  for (const [k, v] of Object.entries(raw)) {
    if (k === 'name' || k === 'description' || k === 'inputSchema' || k === 'parameters') continue
    tool[k] = v
  }
  return tool
}

function extractTools(parsed: unknown, path: string): McpTool[] {
  if (Array.isArray(parsed)) {
    return parsed.map((t, i) => asTool(t, i, path))
  }
  if (isRecord(parsed)) {
    if (Array.isArray(parsed.tools)) {
      return parsed.tools.map((t, i) => asTool(t, i, path))
    }
    // Single tool object
    if (typeof parsed.name === 'string') {
      return [asTool(parsed, 0, path)]
    }
  }
  throw new Error(
    `${path}: expected a tools array, { "tools": [...] }, a single tool object, or JSONL of tools`,
  )
}

function parseJsonl(text: string, path: string): McpTool[] {
  const tools: McpTool[] = []
  const lines = text.split(/\r?\n/)
  let idx = 0
  for (let lineNo = 0; lineNo < lines.length; lineNo++) {
    const line = lines[lineNo]!.trim()
    if (!line || line.startsWith('//') || line.startsWith('#')) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      throw new Error(`${path}:${lineNo + 1}: invalid JSONL line`)
    }
    tools.push(asTool(parsed, idx++, path))
  }
  if (!tools.length) {
    throw new Error(`${path}: JSONL file contains no tools`)
  }
  return tools
}

export function loadManifestFile(filePath: string): LoadedManifest {
  const path = resolve(filePath)
  if (!existsSync(path)) throw new Error(`Path not found: ${path}`)
  const st = statSync(path)
  if (!st.isFile()) throw new Error(`Not a file: ${path}`)

  const text = readFileSync(path, 'utf8')
  const ext = extname(path).toLowerCase()

  if (ext === '.jsonl') {
    return { path, tools: parseJsonl(text, path) }
  }

  // Prefer JSON; if that fails and it looks like JSONL, try JSONL
  try {
    const parsed = JSON.parse(text) as unknown
    return { path, tools: extractTools(parsed, path) }
  } catch (jsonErr) {
    if (text.includes('\n') && text.trim().startsWith('{')) {
      try {
        return { path, tools: parseJsonl(text, path) }
      } catch {
        /* fall through */
      }
    }
    const msg = jsonErr instanceof Error ? jsonErr.message : String(jsonErr)
    throw new Error(`${path}: invalid JSON (${msg})`)
  }
}

function listCandidateFiles(dir: string): string[] {
  const names = readdirSync(dir)
  // Canonical single-manifest names win when present (typical MCP server layout).
  const preferred = ['tools.json', 'mcp-tools.json']
  const hits: string[] = []
  for (const pref of preferred) {
    if (names.includes(pref)) hits.push(join(dir, pref))
  }
  if (hits.length) return hits

  return names
    .filter((n) => JSON_EXTS.has(extname(n).toLowerCase()))
    .filter((n) => !n.startsWith('.'))
    .sort()
    .map((n) => join(dir, n))
}

/**
 * Resolve a path to one or more manifests.
 * - File → load that file
 * - Directory → look for tools.json / mcp-tools.json / tools.jsonl, else all *.json / *.jsonl
 */
export function loadFromPath(inputPath: string): LoadedManifest[] {
  const path = resolve(inputPath)
  if (!existsSync(path)) throw new Error(`Path not found: ${path}`)

  const st = statSync(path)
  if (st.isFile()) return [loadManifestFile(path)]

  if (!st.isDirectory()) throw new Error(`Not a file or directory: ${path}`)

  const files = listCandidateFiles(path)
  if (!files.length) {
    throw new Error(
      `No MCP tool manifests found in ${path}. Expected tools.json, *.json, or *.jsonl`,
    )
  }

  return files.map(loadManifestFile)
}

export function defaultTargetHint(cwd = process.cwd()): string {
  const candidates = [
    'tools.json',
    'mcp-tools.json',
    'fixtures/good-tools.json',
    'fixtures/tools.json',
  ]
  for (const c of candidates) {
    if (existsSync(join(cwd, c))) return c
  }
  return 'tools.json'
}

export function displayName(path: string): string {
  return basename(path)
}
