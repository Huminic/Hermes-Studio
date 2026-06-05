/**
 * Wiki MCP server — exposes profile wikis via the Model Context Protocol
 * over HTTP JSON-RPC. Any agent (in Studio, in a customer profile, or
 * external) that holds a valid bearer token can call the tools below.
 *
 * Tools:
 *   wiki_list(profile, path?)
 *     -> list pages + dirs under <profile>/knowledge[/path]
 *   wiki_read(profile, path)
 *     -> read a page's raw text + parsed frontmatter
 *   wiki_search(profile, query, limit?)
 *     -> simple substring search across the profile's published wiki
 *   wiki_propose(profile, path, content)
 *     -> write to <profile>/knowledge/inbox/<path>. KSG-gated. The wiki
 *        write path that an autonomous agent may use; never overwrites
 *        canon or governance.
 *
 * Admin tools (require token.admin = true):
 *   mcp__create_profile(slug, label, accent_color?)
 *     -> create a new customer profile dir + studio.yaml scaffold.
 *        Mirrors the provisioning script for a single slug.
 *   mcp__issue_token(label, allowed_profiles[], allowed_tools[], expires_at?, admin?)
 *     -> issue a new MCP token. The raw secret is returned ONCE.
 *   mcp__revoke_token(label)
 *     -> revoke a token by label.
 *
 * The consultative agent holds an admin-flagged token so it can stand
 * up a new customer profile + issue scoped tokens for the new agents
 * as part of executing its prescription.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { extractFrontmatter, readWikiFields } from '../lib/frontmatter'
import { evaluateWikiSave } from './ksg-gate'
import {
  authenticateToken,
  checkScope,
  issueToken,
  listTokens,
  recordToolCall,
  revokeToken,
  type IssueTokenInput,
  type McpToken,
} from './mcp-tokens'
import {
  BRAIN_TOOLS,
  BRAIN_ADMIN_TOOLS,
  callBrainTool,
} from './brain-mcp-handlers'
import { COMMS_TOOLS, callCommsTool } from './comms-mcp-handlers'
import {
  FEDERATION_TOOLS,
  callFederationTool,
} from './federation-mcp-handlers'
import { ROLLUP_TOOLS, callRollupTool } from './rollup-mcp-handlers'
import {
  KNOWLEDGE_TOOLS,
  callKnowledgeTool,
} from './knowledge-mcp-handlers'
import { recordAudit } from './metadata-substrate'

const ADMIN_TOOLS = new Set([
  'mcp__create_profile',
  'mcp__issue_token',
  'mcp__revoke_token',
  'mcp__list_tokens',
  ...BRAIN_ADMIN_TOOLS,
])

const BRAIN_TOOL_NAMES = new Set(BRAIN_TOOLS.map((t) => t.name))
const COMMS_TOOL_NAMES = new Set(COMMS_TOOLS.map((t) => t.name))
const FEDERATION_TOOL_NAMES = new Set(FEDERATION_TOOLS.map((t) => t.name))
const ROLLUP_TOOL_NAMES = new Set(ROLLUP_TOOLS.map((t) => t.name))
const KNOWLEDGE_TOOL_NAMES = new Set(KNOWLEDGE_TOOLS.map((t) => t.name))

function profileDir(profile: string): string {
  return path.join(os.homedir(), '.hermes', 'profiles', profile)
}

function knowledgeDir(profile: string): string {
  return path.join(profileDir(profile), 'knowledge')
}

function ensureSafeWithin(root: string, rel: string): string {
  const norm = rel.replace(/\\/g, '/').replace(/^\/+/, '')
  if (norm.includes('..')) throw new Error('path traversal not allowed')
  const full = path.resolve(root, norm)
  const relCheck = path.relative(root, full)
  if (relCheck.startsWith('..') || path.isAbsolute(relCheck)) {
    throw new Error('resolved path escapes root')
  }
  return full
}

type ListEntry =
  | { type: 'dir'; name: string; path: string }
  | { type: 'file'; name: string; path: string; size: number; modified: number; title?: string }

function tool_wiki_list(profile: string, sub: string): Array<ListEntry> {
  const root = knowledgeDir(profile)
  const target = sub ? ensureSafeWithin(root, sub) : root
  if (!fs.existsSync(target)) return []
  const entries = fs.readdirSync(target, { withFileTypes: true })
  const out: Array<ListEntry> = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const childRel = path.posix.join(sub, entry.name).replace(/^\/+/, '')
    if (entry.isDirectory()) {
      out.push({ type: 'dir', name: entry.name, path: childRel })
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const full = path.join(target, entry.name)
      let stat: fs.Stats | null = null
      let title: string | undefined
      try {
        stat = fs.statSync(full)
        const raw = fs.readFileSync(full, 'utf8')
        const fm = extractFrontmatter(raw)
        const fields = readWikiFields(fm.frontmatter)
        title = fields.title ?? undefined
      } catch {
        // skip
      }
      out.push({
        type: 'file',
        name: entry.name,
        path: childRel,
        size: stat?.size ?? 0,
        modified: stat?.mtimeMs ?? 0,
        title,
      })
    }
  }
  return out.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

function tool_wiki_read(profile: string, p: string): {
  path: string
  content: string
  frontmatter: Record<string, unknown> | null
  body: string
} {
  const root = knowledgeDir(profile)
  const full = ensureSafeWithin(root, p)
  if (!full.endsWith('.md')) {
    throw new Error('wiki_read accepts .md files only')
  }
  if (!fs.existsSync(full)) {
    throw new Error('not found')
  }
  const content = fs.readFileSync(full, 'utf8')
  const fm = extractFrontmatter(content)
  return {
    path: p,
    content,
    frontmatter: fm.frontmatter,
    body: fm.body,
  }
}

function tool_wiki_search(
  profile: string,
  query: string,
  limit = 20,
): Array<{ path: string; title?: string; snippet: string; score: number }> {
  const root = knowledgeDir(profile)
  if (!fs.existsSync(root)) return []
  if (!query.trim()) return []
  const q = query.toLowerCase()
  const results: Array<{
    path: string
    title?: string
    snippet: string
    score: number
  }> = []
  function walk(dir: string, rel: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), path.posix.join(rel, entry.name))
        continue
      }
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue
      const childRel = path.posix.join(rel, entry.name).replace(/^\/+/, '')
      let raw = ''
      try {
        raw = fs.readFileSync(path.join(dir, entry.name), 'utf8')
      } catch {
        continue
      }
      const lower = raw.toLowerCase()
      const idx = lower.indexOf(q)
      if (idx === -1) continue
      const fm = extractFrontmatter(raw)
      const fields = readWikiFields(fm.frontmatter)
      const snippetStart = Math.max(0, idx - 80)
      const snippetEnd = Math.min(raw.length, idx + q.length + 200)
      const titleHit = fields.title?.toLowerCase().includes(q) ? 5 : 0
      results.push({
        path: childRel,
        title: fields.title,
        snippet: raw.slice(snippetStart, snippetEnd).trim(),
        score: titleHit + 1,
      })
    }
  }
  walk(root, '')
  results.sort((a, b) => b.score - a.score)
  return results.slice(0, limit)
}

function tool_wiki_propose(
  profile: string,
  p: string,
  content: string,
): { ok: boolean; path: string; warnings: Array<string>; error?: string } {
  // Force the write into knowledge/inbox/ — agents propose, KSG decides.
  const targetRel = p.startsWith('knowledge/inbox/')
    ? p
    : `knowledge/inbox/${p.replace(/^knowledge\//, '')}`
  // Run through the SAME KSG gate as the customer-admin wiki save.
  const verdict = evaluateWikiSave({
    relativePath: targetRel,
    previousContent: null,
    newContent: content,
  })
  if (!verdict.ok) {
    return {
      ok: false,
      path: targetRel,
      warnings: [],
      error: `${verdict.reason} (${verdict.rule})`,
    }
  }
  const root = profileDir(profile)
  const full = ensureSafeWithin(root, targetRel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, 'utf8')
  return { ok: true, path: targetRel, warnings: verdict.warnings }
}

function tool_mcp_create_profile(
  slug: string,
  label: string,
  accent: string,
  createdBy: string,
): { ok: boolean; profile: string; error?: string } {
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { ok: false, profile: slug, error: 'slug must match [a-z0-9-]+' }
  }
  const dir = profileDir(slug)
  if (fs.existsSync(dir)) {
    return { ok: false, profile: slug, error: 'profile already exists' }
  }
  fs.mkdirSync(path.join(dir, 'knowledge', 'inbox'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'knowledge', 'drafts'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'knowledge', 'published'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'knowledge', 'widgets'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'governance', 'agents'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'canon'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'SOUL.md'),
    `# ${label}\n\nCustomer-facing profile for ${label}. Provisioned by consultative-agent via mcp__create_profile (created_by=${createdBy}).\n`,
  )
  fs.writeFileSync(
    path.join(dir, 'persona.md'),
    `# Persona — ${label}\n\nLoad wiki at session start; speak as the ${label} brand.\n`,
  )
  fs.writeFileSync(
    path.join(dir, 'studio.yaml'),
    [
      `# Provisioned via mcp__create_profile by ${createdBy} at ${new Date().toISOString()}`,
      `branding:`,
      `  persona_name: "${label}"`,
      `  accent_color: "${accent}"`,
      `menu:`,
      `  chat: true`,
      `  knowledge: true`,
      `  tools: true`,
      `  data: true`,
      `  comms: true`,
      `  campaigns: true`,
      `agent_picker:`,
      `  visible_agents: []`,
      `tools_widget:`,
      `  show_embed_snippet: true`,
      `  show_live_demo: true`,
      `  consult: false`,
      `widgets: []`,
      `autonomous_reply_defaults:`,
      `  enabled: false`,
      `  business_hours_only: false`,
      `  max_agent_turns: 3`,
      `federation:`,
      `  read_scopes: []`,
      `lead_notifications:`,
      `  adf_email: ""`,
      `  sender_name: "${label} new lead"`,
      `  resend_token_var: CENTRAL_MCP_TOKEN`,
      ``,
    ].join('\n'),
  )
  fs.writeFileSync(
    path.join(dir, 'engagement-state.yaml'),
    [
      'schema_version: 1',
      `customer: ${slug}`,
      'current_stage: draft',
      `stage_entered_at: "${new Date().toISOString()}"`,
      'stage_history:',
      '  - stage: draft',
      `    entered_at: "${new Date().toISOString()}"`,
      '    exited_at: null',
      `    notes: "Provisioned via mcp__create_profile by ${createdBy}"`,
      '    skipped: false',
      'assigned_consultative_agent: consultative-agent',
      'build_time_crew:',
      '  - role: architect',
      '    profile: consultative-agent',
      'run_time_crew:',
      '  - role: architect',
      '    profile: consultative-agent',
      'deployment_notes: []',
      'readiness_gates:',
      '  ready_to_blueprint:',
      '    status: pending',
      '    approved_by: null',
      '    approved_at: null',
      '    notes: ""',
      '  ready_to_instantiate_runtime:',
      '    status: pending',
      '    approved_by: null',
      '    approved_at: null',
      '    notes: ""',
      '  ready_to_publish_mcp_projections:',
      '    status: pending',
      '    approved_by: null',
      '    approved_at: null',
      '    notes: ""',
      '  ready_to_hand_off_externally:',
      '    status: pending',
      '    approved_by: null',
      '    approved_at: null',
      '    notes: ""',
      '  topology_decided:',
      '    status: pending',
      '    approved_by: null',
      '    approved_at: null',
      '    decision: null',
      'open_decisions: []',
      'adjacent_data_neighbors: []',
      '',
    ].join('\n'),
  )
  return { ok: true, profile: slug }
}

// ─── JSON-RPC dispatcher ────────────────────────────────────────────────────

type JsonRpcRequest = {
  jsonrpc?: string
  id?: number | string | null
  method?: string
  params?: Record<string, unknown>
}

type JsonRpcResponse = {
  jsonrpc: '2.0'
  id: number | string | null
  result?: unknown
  error?: { code: number; message: string }
}

function ok(id: number | string | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result }
}
function err(
  id: number | string | null,
  code: number,
  message: string,
): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

type ToolCallParams = {
  name?: string
  arguments?: Record<string, unknown>
}

export const WIKI_TOOLS: Array<{
  name: string
  description: string
  inputSchema: Record<string, unknown>
}> = [
  {
    name: 'wiki_list',
    description: 'List wiki pages + sub-dirs under a profile knowledge tree.',
    inputSchema: {
      type: 'object',
      properties: {
        profile: { type: 'string' },
        path: { type: 'string', default: '' },
      },
      required: ['profile'],
    },
  },
  {
    name: 'wiki_read',
    description: 'Read a single wiki page (raw markdown + parsed frontmatter).',
    inputSchema: {
      type: 'object',
      properties: {
        profile: { type: 'string' },
        path: { type: 'string' },
      },
      required: ['profile', 'path'],
    },
  },
  {
    name: 'wiki_search',
    description: 'Substring search over a profile wiki. Returns ranked snippets.',
    inputSchema: {
      type: 'object',
      properties: {
        profile: { type: 'string' },
        query: { type: 'string' },
        limit: { type: 'number', default: 20 },
      },
      required: ['profile', 'query'],
    },
  },
  {
    name: 'wiki_propose',
    description:
      'Write a proposed wiki page into knowledge/inbox/. KSG-gated; canon and governance are off-limits.',
    inputSchema: {
      type: 'object',
      properties: {
        profile: { type: 'string' },
        path: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['profile', 'path', 'content'],
    },
  },
  {
    name: 'mcp__create_profile',
    description:
      'Create a new customer profile dir + studio.yaml scaffold. ADMIN-ONLY (requires token.admin=true).',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        label: { type: 'string' },
        accent_color: { type: 'string' },
      },
      required: ['slug', 'label'],
    },
  },
  {
    name: 'mcp__issue_token',
    description:
      'Issue a new MCP bearer token. The raw secret is returned ONCE. ADMIN-ONLY.',
    inputSchema: {
      type: 'object',
      properties: {
        label: { type: 'string' },
        allowed_profiles: { type: 'array', items: { type: 'string' } },
        allowed_tools: { type: 'array', items: { type: 'string' } },
        expires_at: { type: 'string', nullable: true },
        admin: { type: 'boolean', default: false },
      },
      required: ['label', 'allowed_profiles', 'allowed_tools'],
    },
  },
  {
    name: 'mcp__revoke_token',
    description: 'Revoke an MCP bearer token by label. ADMIN-ONLY.',
    inputSchema: {
      type: 'object',
      properties: { label: { type: 'string' } },
      required: ['label'],
    },
  },
  {
    name: 'mcp__list_tokens',
    description: 'List all MCP tokens (label, scopes, expiry, last_used). ADMIN-ONLY.',
    inputSchema: { type: 'object', properties: {} },
  },
]

export async function dispatchWikiMcp(
  request: Request,
): Promise<JsonRpcResponse> {
  const auth = request.headers.get('authorization') ?? ''
  const secret = auth.replace(/^Bearer\s+/i, '').trim()
  const authResult = authenticateToken(secret)
  let body: JsonRpcRequest
  try {
    body = (await request.json()) as JsonRpcRequest
  } catch {
    return err(null, -32700, 'parse error')
  }
  const id = body.id ?? null
  if (!authResult.ok) {
    return err(id, -32001, `unauthorized: ${authResult.reason}`)
  }
  const token = authResult.token
  const method = body.method ?? ''
  if (method === 'tools/list') {
    return ok(id, {
      tools: [
        ...WIKI_TOOLS,
        ...KNOWLEDGE_TOOLS,
        ...BRAIN_TOOLS,
        ...COMMS_TOOLS,
        ...FEDERATION_TOOLS,
        ...ROLLUP_TOOLS,
      ],
    })
  }
  if (method !== 'tools/call') {
    return err(id, -32601, `method not found: ${method}`)
  }
  const params = (body.params ?? {}) as ToolCallParams
  const toolName = params.name ?? ''
  const args = params.arguments ?? {}
  const profileArg =
    typeof args.profile === 'string' ? (args.profile as string) : '*'
  const isAdminTool = ADMIN_TOOLS.has(toolName)
  if (isAdminTool && !token.admin) {
    recordToolCall({
      token,
      profile: profileArg,
      tool: toolName,
      status: 'error',
      error: 'admin token required',
    })
    return err(id, -32002, `admin token required for ${toolName}`)
  }
  // For admin tools that span profiles, only the tool's own logic enforces.
  // For non-admin tools, check profile scope.
  if (!isAdminTool) {
    const scope = checkScope(token, profileArg, toolName)
    if (!scope.ok) {
      recordToolCall({
        token,
        profile: profileArg,
        tool: toolName,
        status: 'error',
        error: scope.reason,
      })
      return err(id, -32003, scope.reason)
    }
  }
  try {
    let result: unknown
    switch (toolName) {
      case 'wiki_list':
        result = tool_wiki_list(
          profileArg,
          (args.path as string | undefined) ?? '',
        )
        break
      case 'wiki_read':
        result = tool_wiki_read(profileArg, args.path as string)
        break
      case 'wiki_search':
        result = tool_wiki_search(
          profileArg,
          (args.query as string) ?? '',
          (args.limit as number | undefined) ?? 20,
        )
        break
      case 'wiki_propose':
        result = tool_wiki_propose(
          profileArg,
          args.path as string,
          args.content as string,
        )
        break
      case 'mcp__create_profile':
        result = tool_mcp_create_profile(
          args.slug as string,
          args.label as string,
          (args.accent_color as string) ?? '#1e40af',
          `mcp-token:${token.label}`,
        )
        break
      case 'mcp__issue_token': {
        const input: IssueTokenInput = {
          label: args.label as string,
          allowed_profiles: args.allowed_profiles as Array<string>,
          allowed_tools: args.allowed_tools as Array<string>,
          expires_at: (args.expires_at as string | null) ?? null,
          admin: args.admin === true,
          created_by: `mcp-token:${token.label}`,
        }
        result = issueToken(input)
        break
      }
      case 'mcp__revoke_token':
        result = revokeToken(
          args.label as string,
          `mcp-token:${token.label}`,
        )
        break
      case 'mcp__list_tokens':
        result = { tokens: listTokens() }
        break
      default:
        if (KNOWLEDGE_TOOL_NAMES.has(toolName)) {
          const kRes = callKnowledgeTool(toolName, args, {
            token_label: token.label,
            token_allowed_profiles: token.allowed_profiles,
            token_allowed_tools: token.allowed_tools,
            token_admin: token.admin,
          })
          if (!kRes.ok) {
            recordToolCall({
              token,
              profile: profileArg,
              tool: toolName,
              status: 'error',
              error: kRes.error,
            })
            return err(id, -32009, kRes.error)
          }
          result = kRes.data
          break
        }
        if (ROLLUP_TOOL_NAMES.has(toolName)) {
          if (!token.admin && !token.allowed_profiles.includes('*')) {
            recordToolCall({
              token,
              profile: profileArg,
              tool: toolName,
              status: 'error',
              error: 'rollup requires admin or wildcard scope',
            })
            return err(id, -32007, 'rollup requires admin or wildcard scope')
          }
          const rollupRes = callRollupTool(args, {
            token_label: token.label,
            token_allowed_profiles: token.allowed_profiles,
            token_allowed_tools: token.allowed_tools,
            token_admin: token.admin,
          })
          if (!rollupRes.ok) {
            recordToolCall({
              token,
              profile: profileArg,
              tool: toolName,
              status: 'error',
              error: rollupRes.error,
            })
            return err(id, -32008, rollupRes.error)
          }
          result = rollupRes.data
          break
        }
        if (COMMS_TOOL_NAMES.has(toolName)) {
          const commsRes = await callCommsTool(toolName, args, {
            token_label: token.label,
            token_allowed_profiles: token.allowed_profiles,
            token_allowed_tools: token.allowed_tools,
            token_admin: token.admin,
          })
          if (!commsRes.ok) {
            recordToolCall({
              token,
              profile: profileArg,
              tool: toolName,
              status: 'error',
              error: commsRes.error,
            })
            return err(id, -32005, commsRes.error)
          }
          result = commsRes.data
          break
        }
        if (FEDERATION_TOOL_NAMES.has(toolName)) {
          const fedRes = await callFederationTool(toolName, args, {
            token_label: token.label,
            token_allowed_profiles: token.allowed_profiles,
            token_allowed_tools: token.allowed_tools,
            token_admin: token.admin,
          })
          if (!fedRes.ok) {
            recordToolCall({
              token,
              profile: profileArg,
              tool: toolName,
              status: 'error',
              error: fedRes.error,
            })
            return err(id, -32006, fedRes.error)
          }
          result = fedRes.data
          break
        }
        if (BRAIN_TOOL_NAMES.has(toolName)) {
          const brainRes = callBrainTool(toolName, args, {
            token_label: token.label,
            token_allowed_profiles: token.allowed_profiles,
            token_allowed_tools: token.allowed_tools,
            token_admin: token.admin,
          })
          if (!brainRes.ok) {
            recordToolCall({
              token,
              profile: profileArg,
              tool: toolName,
              status: 'error',
              error: brainRes.error,
            })
            // The sixth-invariant audit is already written by dsgGate /
            // recordChat / recordLookupMiss inside the handlers; mirror
            // the denial into mcp-audit.log for cross-surface visibility.
            recordAudit(profileArg, {
              ts: Date.now(),
              surface: 'brain',
              actor: `token:${token.label}`,
              action: 'tool_call',
              target_type: toolName,
              reason: brainRes.error,
              outcome: 'denied',
              rule: brainRes.rule ?? null,
              gate_event_id: brainRes.gate_event_id ?? null,
            })
            return err(id, -32004, brainRes.error)
          }
          result = brainRes.data
          break
        }
        recordToolCall({
          token,
          profile: profileArg,
          tool: toolName,
          status: 'error',
          error: 'unknown tool',
        })
        return err(id, -32601, `unknown tool: ${toolName}`)
    }
    recordToolCall({
      token,
      profile: profileArg,
      tool: toolName,
      status: 'ok',
    })
    return ok(id, {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'tool error'
    recordToolCall({
      token,
      profile: profileArg,
      tool: toolName,
      status: 'error',
      error: message,
    })
    return err(id, -32000, message)
  }
}
