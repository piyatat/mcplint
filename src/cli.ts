#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lintAll, mergeResults, ALL_RULES } from './lint.js'
import { defaultTargetHint, loadFromPath } from './load.js'
import { formatJson, formatText, type ReportBundle } from './report.js'
import { DEFAULT_OVERLAP_THRESHOLD } from './rules/overlap.js'
import { SEVERITY_RANK, type Severity } from './types.js'

type Args = {
  target: string
  json: boolean
  help: boolean
  version: boolean
  color: boolean | 'auto'
  overlapThreshold: number
  /** Fail when any finding at this severity or worse is present (default: high). */
  failOn: Severity
  /** Run only these rule ids (comma-separated). */
  only: string[]
}

function packageVersion(): string {
  const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string }
  return pkg.version
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    target: '',
    json: false,
    help: false,
    version: false,
    color: 'auto',
    overlapThreshold: DEFAULT_OVERLAP_THRESHOLD,
    failOn: 'high',
    only: [],
  }

  const positionals: string[] = []

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === '--help' || a === '-h') args.help = true
    else if (a === '--version' || a === '-V') args.version = true
    else if (a === '--json') args.json = true
    else if (a === '--color') args.color = true
    else if (a === '--no-color') args.color = false
    else if (a === '--fail-on') {
      const raw = (argv[++i] ?? '').toLowerCase()
      if (raw !== 'high' && raw !== 'medium' && raw !== 'low' && raw !== 'info') {
        throw new Error(
          `Invalid --fail-on: ${raw || '(empty)'}. Use high, medium, low, or info.\nTry: mcplint --help`,
        )
      }
      args.failOn = raw
    } else if (a === '--only') {
      const raw = argv[++i] ?? ''
      if (!raw.trim()) {
        throw new Error(`Missing value for --only.\nTry: mcplint --help`)
      }
      const ids = raw.split(',').map((s) => s.trim()).filter(Boolean)
      const valid = new Set<string>(ALL_RULES)
      for (const id of ids) {
        if (!valid.has(id)) {
          throw new Error(
            `Invalid --only rule: ${id}. Use: ${ALL_RULES.join(', ')}.\nTry: mcplint --help`,
          )
        }
      }
      args.only = ids
    } else if (a === '--overlap-threshold') {
      const raw = argv[++i]
      const n = Number(raw)
      if (!Number.isFinite(n) || n < 0 || n > 1) {
        throw new Error(
          `Invalid --overlap-threshold: ${raw ?? '(empty)'}. Use a number between 0 and 1.\nTry: mcplint --help`,
        )
      }
      args.overlapThreshold = n
    } else if (a.startsWith('-')) {
      throw new Error(`Unknown flag: ${a}\nTry: mcplint --help`)
    } else {
      positionals.push(a)
    }
  }

  if (positionals.length > 1) {
    throw new Error(`Unexpected extra arguments: ${positionals.slice(1).join(' ')}\nTry: mcplint --help`)
  }
  args.target = positionals[0] ?? ''
  return args
}

function help(): string {
  const v = packageVersion()
  return `
mcplint ${v} — static lint for MCP tool manifests

Usage:
  mcplint [options] [path]

Arguments:
  path                   File or directory with MCP tools
                         (JSON, JSONL, or tools.json). Default: tools.json
                         or fixtures/ under cwd when present.

Options:
  --json                 Machine-readable JSON report
  --fail-on LEVEL        Exit 1 when any finding at LEVEL or worse
                         (high|medium|low|info; default: high)
  --only RULES           Run only these rules (comma-separated:
                         naming, vague-verb, when-to-use, overlap, schema, annotations)
  --overlap-threshold N  Similarity cutoff for overlap rule (0–1, default ${DEFAULT_OVERLAP_THRESHOLD})
  --color / --no-color   Force ANSI colors on or off
  -h, --help             Show help
  -V, --version          Show version

Exit codes:
  0  No findings at --fail-on severity or worse
  1  One or more findings at the fail threshold (or usage error)

Rules:
  naming        Invalid MCP tool names (camelCase, spaces, dots, bad chars)
  vague-verb    Vague verbs (get/handle/process/manage/do/stuff…) without specificity
  when-to-use   Missing usage guidance in descriptions
  overlap       Overlapping tool names/descriptions (Jaccard + cosine bag-of-words)
  schema        Empty property descriptions, missing required field hints, empty tool names
  annotations   Missing or inconsistent MCP tool annotations (readOnlyHint, …)

Examples:
  mcplint fixtures/good-tools.json
  mcplint fixtures/bad-tools.json
  mcplint --json fixtures/bad-tools.json
  mcplint --fail-on medium fixtures/bad-tools.json
  mcplint fixtures/duplicate-descriptions.json
  mcplint fixtures/case-duplicate-names.json
  mcplint fixtures/empty-name-tools.json
  mcplint fixtures/invalid-names.json
  mcplint --only naming fixtures/bad-tools.json
  mcplint ./my-mcp-server
`.trimStart()
}

function wantColor(flag: boolean | 'auto', json: boolean): boolean {
  if (json) return false
  if (flag === true) return true
  if (flag === false) return false
  return Boolean(process.stdout.isTTY) && !process.env.NO_COLOR
}

async function main(): Promise<number> {
  let args: Args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    return 1
  }

  if (args.help) {
    console.log(help())
    return 0
  }
  if (args.version) {
    console.log(packageVersion())
    return 0
  }

  const target = args.target ? resolve(args.target) : resolve(defaultTargetHint())

  let manifests
  try {
    manifests = loadFromPath(target)
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    console.error('Try: mcplint --help')
    return 1
  }

  const results = lintAll(manifests, {
    overlapThreshold: args.overlapThreshold,
    only: args.only.length ? args.only : undefined,
  })
  const merged = mergeResults(results)

  const bundle: ReportBundle = {
    results,
    findings: merged.findings,
    toolCount: merged.toolCount,
    highCount: merged.highCount,
    clean: merged.clean,
    summary: merged.summary,
    version: packageVersion(),
  }

  if (args.json) {
    console.log(formatJson(bundle))
  } else {
    console.log(formatText(bundle, wantColor(args.color, false)))
  }

  const threshold = SEVERITY_RANK[args.failOn]
  const failCount = merged.findings.filter((f) => SEVERITY_RANK[f.severity] >= threshold).length
  return failCount > 0 ? 1 : 0
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : String(err))
    process.exitCode = 1
  })
