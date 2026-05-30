/**
 * MCP token registry — Phase CY.1.
 *
 * Bearer tokens issued to MCP consumers (agents, scripts, external
 * clients). Per token: which profiles it may read, which tools it may
 * call, optional expiry. Tokens are stored hashed; the raw secret is
 * returned ONLY at issue time.
 *
 * Source of truth: ~/.hermes/mcp-tokens.yaml. Two-write-paths:
 *   1. Studio admin UI (Settings → MCP Tokens) via /api/mcp-tokens.
 *   2. Consultative agent admin tool (mcp__issue_token) via the
 *      privileged consultative-agent token.
 *
 * Audit log: every authentication attempt + every token issuance /
 * revocation is appended to ~/.hermes/mcp-audit.log (JSONL).
 *
 * Hashing: scrypt (same pattern as password-hash.ts) — avoids new deps.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import YAML from 'yaml'

export type ScopeStar = '*'

export type McpToken = {
  /** Operator-readable label (e.g. "serra-honda-runtime", "consultative-agent"). */
  label: string
  /** Hashed secret. Format: scrypt$N$r$p$salt$key. */
  hash: string
  /** First 8 chars of the raw secret — for UI display so the operator can spot the right row to revoke. */
  fingerprint: string
  /** Profiles this token may read. '*' = all. */
  allowed_profiles: Array<string | ScopeStar>
  /** Tool names this token may call. '*' = all tools. */
  allowed_tools: Array<string | ScopeStar>
  /** ISO timestamp; null = never expires. */
  expires_at: string | null
  /** Privileged admin flag — required to call the mcp__create_profile /
   * mcp__issue_token / mcp__revoke_token tools. Only the operator (or
   * another admin-flagged token) may set this on a new token. */
  admin: boolean
  /** Audit: when the token was issued. */
  created_at: string
  /** Audit: who issued the token (username or label of issuing token). */
  created_by: string
  /** Audit: last successful authentication. */
  last_used_at: string | null
}

const REGISTRY_PATH = (): string =>
  path.join(os.homedir(), '.hermes', 'mcp-tokens.yaml')
const AUDIT_PATH = (): string =>
  path.join(os.homedir(), '.hermes', 'mcp-audit.log')

const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LEN = 64

function hashSecret(raw: string): string {
  const salt = randomBytes(16)
  const key = scryptSync(raw, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  })
  return [
    'scrypt',
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('hex'),
    key.toString('hex'),
  ].join('$')
}

function verifySecret(raw: string, hash: string): boolean {
  const parts = hash.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const N = parseInt(parts[1], 10)
  const r = parseInt(parts[2], 10)
  const p = parseInt(parts[3], 10)
  if (!N || !r || !p) return false
  let salt: Buffer
  let key: Buffer
  try {
    salt = Buffer.from(parts[4], 'hex')
    key = Buffer.from(parts[5], 'hex')
  } catch {
    return false
  }
  const candidate = scryptSync(raw, salt, key.length, { N, r, p })
  if (candidate.length !== key.length) return false
  try {
    return timingSafeEqual(candidate, key)
  } catch {
    return false
  }
}

function loadRegistry(): { tokens: Array<McpToken> } {
  const file = REGISTRY_PATH()
  if (!fs.existsSync(file)) return { tokens: [] }
  try {
    const raw = fs.readFileSync(file, 'utf8')
    const parsed = YAML.parse(raw) as { tokens?: Array<McpToken> } | null
    if (!parsed || !Array.isArray(parsed.tokens)) return { tokens: [] }
    return { tokens: parsed.tokens }
  } catch {
    return { tokens: [] }
  }
}

function saveRegistry(reg: { tokens: Array<McpToken> }): void {
  const file = REGISTRY_PATH()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, YAML.stringify(reg), { mode: 0o600 })
}

function appendAudit(entry: Record<string, unknown>): void {
  const file = AUDIT_PATH()
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(
      file,
      JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n',
      { mode: 0o600 },
    )
  } catch {
    // audit failure must not block the request
  }
}

export type TokenSummary = Omit<McpToken, 'hash'> & {
  /** Render-friendly hint; never the raw secret. */
  fingerprint: string
}

function summarize(t: McpToken): TokenSummary {
  const { hash: _hash, ...rest } = t
  void _hash
  return rest
}

export type IssueTokenInput = {
  label: string
  allowed_profiles: Array<string | ScopeStar>
  allowed_tools: Array<string | ScopeStar>
  expires_at?: string | null
  admin?: boolean
  created_by: string
}

export type IssueTokenResult = {
  ok: boolean
  token?: TokenSummary
  /** Raw secret — returned ONCE at issue time. */
  secret?: string
  error?: string
}

export function issueToken(input: IssueTokenInput): IssueTokenResult {
  const reg = loadRegistry()
  if (!input.label || /\s/.test(input.label)) {
    return { ok: false, error: 'label is required (no spaces).' }
  }
  if (reg.tokens.some((t) => t.label === input.label)) {
    return {
      ok: false,
      error: `label '${input.label}' already exists. Revoke the existing token first.`,
    }
  }
  if (input.allowed_profiles.length === 0) {
    return { ok: false, error: 'allowed_profiles must not be empty.' }
  }
  if (input.allowed_tools.length === 0) {
    return { ok: false, error: 'allowed_tools must not be empty.' }
  }
  const secret = randomBytes(32).toString('base64url')
  const token: McpToken = {
    label: input.label,
    hash: hashSecret(secret),
    fingerprint: secret.slice(0, 8),
    allowed_profiles: input.allowed_profiles,
    allowed_tools: input.allowed_tools,
    expires_at: input.expires_at ?? null,
    admin: input.admin === true,
    created_at: new Date().toISOString(),
    created_by: input.created_by,
    last_used_at: null,
  }
  reg.tokens.push(token)
  saveRegistry(reg)
  appendAudit({
    event: 'token_issued',
    label: token.label,
    by: input.created_by,
    admin: token.admin,
    allowed_profiles: token.allowed_profiles,
    allowed_tools: token.allowed_tools,
  })
  return { ok: true, token: summarize(token), secret }
}

export function revokeToken(label: string, by: string): {
  ok: boolean
  error?: string
} {
  const reg = loadRegistry()
  const before = reg.tokens.length
  reg.tokens = reg.tokens.filter((t) => t.label !== label)
  if (reg.tokens.length === before) {
    return { ok: false, error: `token '${label}' not found.` }
  }
  saveRegistry(reg)
  appendAudit({ event: 'token_revoked', label, by })
  return { ok: true }
}

export function listTokens(): Array<TokenSummary> {
  return loadRegistry().tokens.map(summarize)
}

export type AuthResult =
  | {
      ok: true
      token: McpToken
    }
  | {
      ok: false
      reason: string
    }

/** Authenticate a raw bearer secret. Updates last_used_at on success. */
export function authenticateToken(rawSecret: string): AuthResult {
  if (!rawSecret) {
    appendAudit({ event: 'auth_failed', reason: 'empty secret' })
    return { ok: false, reason: 'missing token' }
  }
  const reg = loadRegistry()
  for (const t of reg.tokens) {
    if (verifySecret(rawSecret, t.hash)) {
      if (t.expires_at && Date.parse(t.expires_at) < Date.now()) {
        appendAudit({ event: 'auth_failed', reason: 'expired', label: t.label })
        return { ok: false, reason: 'token expired' }
      }
      t.last_used_at = new Date().toISOString()
      saveRegistry(reg)
      appendAudit({ event: 'auth_success', label: t.label })
      return { ok: true, token: t }
    }
  }
  appendAudit({ event: 'auth_failed', reason: 'no match', preview: rawSecret.slice(0, 8) })
  return { ok: false, reason: 'unknown token' }
}

export function checkScope(
  token: McpToken,
  profile: string,
  tool: string,
): { ok: true } | { ok: false; reason: string } {
  if (
    !token.allowed_profiles.includes('*' as ScopeStar) &&
    !token.allowed_profiles.includes(profile)
  ) {
    appendAudit({
      event: 'scope_denied',
      label: token.label,
      profile,
      tool,
      reason: 'profile-not-allowed',
    })
    return {
      ok: false,
      reason: `token '${token.label}' is not authorized for profile '${profile}'`,
    }
  }
  if (
    !token.allowed_tools.includes('*' as ScopeStar) &&
    !token.allowed_tools.includes(tool)
  ) {
    appendAudit({
      event: 'scope_denied',
      label: token.label,
      profile,
      tool,
      reason: 'tool-not-allowed',
    })
    return {
      ok: false,
      reason: `token '${token.label}' is not authorized for tool '${tool}'`,
    }
  }
  return { ok: true }
}

export function recordToolCall(input: {
  token: McpToken
  profile: string
  tool: string
  status: 'ok' | 'error'
  error?: string
}): void {
  appendAudit({
    event: 'tool_call',
    label: input.token.label,
    profile: input.profile,
    tool: input.tool,
    status: input.status,
    error: input.error ?? null,
  })
}

/** Test helper: clear the registry path. */
export function _resetForTests(): void {
  try {
    fs.unlinkSync(REGISTRY_PATH())
  } catch {
    // ok if missing
  }
  try {
    fs.unlinkSync(AUDIT_PATH())
  } catch {
    // ok
  }
}
