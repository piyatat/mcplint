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
| `0` | No **high** severity findings |
| `1` | One or more high findings, or a usage/load error |

### Options

| Flag | Description |
| --- | --- |
| `--json` | Machine-readable report |
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
| `vague-verb` | Names/descriptions built from vague verbs (`get`, `handle`, `process`, `manage`, `do`, `stuff`, …) without a specific resource |
| `when-to-use` | Missing or tiny descriptions; no “use when / do not use / prefer …” guidance |
| `overlap` | Tool pairs with high bag-of-words Jaccard + cosine similarity; near-duplicate names |
| `schema` | Missing `inputSchema`, empty property descriptions, `required` fields without property defs or hints |
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
