import type { Finding, JsonSchema, McpTool } from '../types.js'

function propEntries(schema: JsonSchema | undefined): [string, JsonSchema][] {
  if (!schema?.properties || typeof schema.properties !== 'object') return []
  return Object.entries(schema.properties)
}

function requiredList(schema: JsonSchema | undefined): string[] {
  if (!schema?.required || !Array.isArray(schema.required)) return []
  return schema.required.filter((r): r is string => typeof r === 'string')
}

function walkProps(
  schema: JsonSchema,
  prefix: string,
  visit: (path: string, prop: JsonSchema, required: boolean) => void,
  parentRequired: string[] = [],
): void {
  for (const [key, prop] of propEntries(schema)) {
    const path = prefix ? `${prefix}.${key}` : key
    const isRequired = parentRequired.includes(key)
    visit(path, prop, isRequired)
    if (prop && typeof prop === 'object' && prop.properties) {
      walkProps(prop, path, visit, requiredList(prop))
    }
    if (prop?.items && typeof prop.items === 'object' && prop.items.properties) {
      walkProps(prop.items, `${path}[]`, visit, requiredList(prop.items))
    }
  }
}

export function checkSchema(tools: McpTool[], path: string): Finding[] {
  const findings: Finding[] = []

  for (const tool of tools) {
    const schema = tool.inputSchema

    if (!schema) {
      findings.push({
        rule: 'schema',
        severity: 'medium',
        score: 15,
        tool: tool.name,
        path,
        message: `Tool "${tool.name}" has no inputSchema / parameters object.`,
        fix: `Add an inputSchema with type "object", properties, and required[] for mandatory args.`,
      })
      continue
    }

    if (schema.type && schema.type !== 'object' && !(Array.isArray(schema.type) && schema.type.includes('object'))) {
      findings.push({
        rule: 'schema',
        severity: 'low',
        score: 6,
        tool: tool.name,
        path,
        message: `Tool "${tool.name}" inputSchema.type is "${String(schema.type)}" (MCP tools usually use "object").`,
        fix: `Set "type": "object" and declare properties for each argument.`,
      })
    }

    const props = propEntries(schema)
    const required = requiredList(schema)

    if (props.length === 0 && required.length > 0) {
      findings.push({
        rule: 'schema',
        severity: 'high',
        score: 25,
        tool: tool.name,
        path,
        message: `Tool "${tool.name}" lists required fields but has no properties.`,
        fix: `Define each required name under properties with type + description.`,
        meta: { required },
      })
    }

    for (const name of required) {
      if (!schema.properties || !(name in schema.properties)) {
        findings.push({
          rule: 'schema',
          severity: 'high',
          score: 24,
          tool: tool.name,
          path,
          message: `Tool "${tool.name}" marks "${name}" as required but it is missing from properties.`,
          fix: `Add properties.${name} with type and a description that hints the expected value.`,
          meta: { field: name },
        })
      }
    }

    walkProps(
      schema,
      '',
      (fieldPath, prop, isRequired) => {
      const desc = typeof prop.description === 'string' ? prop.description.trim() : ''

      if (!desc) {
        findings.push({
          rule: 'schema',
          severity: isRequired ? 'high' : 'medium',
          score: isRequired ? 22 : 12,
          tool: tool.name,
          path,
          message: `Tool "${tool.name}" property "${fieldPath}" has an empty or missing description${isRequired ? ' (required field)' : ''}.`,
          fix: isRequired
            ? `Add a description that explains the value and any format constraints (this field is required).`
            : `Add a short description so agents know what to pass for "${fieldPath}".`,
          meta: { field: fieldPath, required: isRequired },
        })
      } else if (isRequired && desc.length < 12) {
        findings.push({
          rule: 'schema',
          severity: 'low',
          score: 8,
          tool: tool.name,
          path,
          message: `Tool "${tool.name}" required property "${fieldPath}" has a very short description.`,
          fix: `Expand the description with expected format / example so agents fill it correctly.`,
          meta: { field: fieldPath, required: true },
        })
      }

      // Missing type on a property
      if (prop.type === undefined && prop.properties === undefined && prop.items === undefined) {
        findings.push({
          rule: 'schema',
          severity: 'low',
          score: 7,
          tool: tool.name,
          path,
          message: `Tool "${tool.name}" property "${fieldPath}" has no type.`,
          fix: `Set an explicit JSON Schema type (string, number, boolean, object, array, …).`,
          meta: { field: fieldPath },
        })
      }
    },
      required,
    )

    // required array missing while properties exist — soft hint
    if (props.length > 0 && required.length === 0) {
      const likelyRequired = props.filter(([, p]) => {
        const d = (p.description ?? '').toLowerCase()
        return /\brequired\b/.test(d) || /\bmust\b/.test(d)
      })
      if (likelyRequired.length) {
        findings.push({
          rule: 'schema',
          severity: 'medium',
          score: 14,
          tool: tool.name,
          path,
          message: `Tool "${tool.name}" has no required[] but ${likelyRequired.length} property description(s) say "required"/"must".`,
          fix: `Add a top-level "required": [${likelyRequired.map(([k]) => JSON.stringify(k)).join(', ')}] array.`,
          meta: { fields: likelyRequired.map(([k]) => k) },
        })
      } else {
        findings.push({
          rule: 'schema',
          severity: 'info',
          score: 3,
          tool: tool.name,
          path,
          message: `Tool "${tool.name}" declares properties but no required[] — confirm all args are optional.`,
          fix: `If any argument is mandatory, list it in inputSchema.required.`,
        })
      }
    }
  }

  return findings
}
