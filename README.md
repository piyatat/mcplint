# mcplint

Static **eslint for MCP** — catch vague tool names, missing when-to-use guidance, overlapping tools, weak input schemas, and missing or contradictory tool annotations before agents get confused.

Zero runtime dependencies. Node ≥ 18.

## Why

MCP servers expose tools whose names and descriptions are the entire UX for an LLM. Vague verbs (`get`, `handle`, `process`), missing usage hints, and near-duplicate tools cause wrong tool picks. **mcplint** ranks those problems with severity and suggested fixes.

## Install

```bash
npm install
npm run build
```

Link locally (optional):

```bash
npm link
```

## Usage

```bash
mcplint [path]
mcplint fixtures/good-tools.json
mcplint fixtures/bad-tools.json
mcplint --json fixtures/bad-tools.json
```

`path` may be:

- a JSON file (`{ "tools": [...] }`, a bare tools array, or a single tool object)
- a JSONL file (one tool object per line)
- a directory containing `tools.json`, `mcp-tools.json`, `tools.jsonl`, or other `*.json` / `*.jsonl`

If omitted, mcplint looks for `tools.json` or `fixtures/` under the current directory.

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | No findings at `--fail-on` severity or worse (default threshold: **high**) |
| `1` | One or more findings at the fail threshold, or a usage/load error |

### Options

| Flag | Description |
| --- | --- |
| `--json` | Machine-readable report |
| `--fail-on LEVEL` | Exit 1 when any finding is at `LEVEL` or worse (`high`\|`medium`\|`low`\|`info`; default `high`) |
| `--severity LEVEL` | Show only findings at this severity (`high`\|`medium`\|`low`\|`info`) |
| `--overlap-threshold N` | Similarity cutoff for overlap (0–1, default `0.48`) |
| `--color` / `--no-color` | Force ANSI colors |
| `-h`, `--help` | Help |
| `-V`, `--version` | Version |

## Demo

Clean fixture:

```bash
node bin/mcplint.js fixtures/good-tools.json
# ✓ clean
```

Intentionally bad fixture:

```bash
node bin/mcplint.js fixtures/bad-tools.json
# high findings: vague-verb, when-to-use, overlap, schema …
echo $?   # 1
```

JSON output:

```bash
node bin/mcplint.js --json fixtures/bad-tools.json | head
```

## Rules

| Rule | What it catches |
| --- | --- |
| `naming` | Invalid MCP tool names (camelCase, spaces, dots, or characters outside `[a-z0-9_-]`) |
| `vague-verb` | Names/descriptions built from vague verbs (`get`, `handle`, `process`, `manage`, `do`, `stuff`, …) without a specific resource |
| `when-to-use` | Missing or tiny descriptions; no “use when / do not use / prefer …” guidance |
| `overlap` | Tool pairs with high bag-of-words Jaccard + cosine similarity; exact duplicate names; near-duplicate names; exact duplicate descriptions |
| `schema` | Missing `inputSchema`, empty property descriptions, `required` fields without property defs or hints, empty/whitespace tool names |
| `annotations` | Missing `annotations` / `readOnlyHint`; name↔hint mismatches (e.g. `delete_*` with `readOnlyHint: true`) |

Findings are ranked by score (severity weight) and include a **fix** suggestion.

## Manifest shape

```json
{
  "tools": [
    {
      "name": "list_pull_requests",
      "description": "… Use when … Do not use for …",
      "annotations": {
        "title": "List Pull Requests",
        "readOnlyHint": true,
        "openWorldHint": true
      },
      "inputSchema": {
        "type": "object",
        "properties": {
          "owner": { "type": "string", "description": "…" }
        },
        "required": ["owner"]
      }
    }
  ]
}
```

`parameters` is accepted as an alias for `inputSchema`.

## Develop

```bash
npm run build    # tsc → dist/
npm run dev      # tsc --watch
npm start -- fixtures/bad-tools.json
```

## License

MIT
