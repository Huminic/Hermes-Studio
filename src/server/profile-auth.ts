/**
 * Profile-synced authentication.
 *
 * Each profile that should be a login identity declares credentials at:
 *   ~/.hermes/profiles/<profile>/auth.yaml
 *
 * Schema:
 *   username: <string>            # required; unique across all profiles
 *   password_hash: <scrypt$...>   # required; produced by password-hash.ts
 *   is_admin: <bool>              # optional; defaults to false (Studio admin)
 *   is_customer_admin: <bool>     # optional; defaults to false (customer storefront admin)
 *
 * Login flow: scan all profile auth.yaml files, find the one matching the
 * submitted username, verify the password against its hash, return the
 * matched identity. The session token is later associated with that
 * {profile, is_admin, is_customer_admin} in auth-middleware.ts.
 *
 * Role distinction:
 *   - is_admin           — Studio operator; can switch active profile, see
 *                          /console/$profile/* (operator-side admin views).
 *   - is_customer_admin  — customer-org admin for THIS profile; can log in
 *                          to the public storefront at /p/$profile/* and
 *                          edit delegated config (widgets, branding,
 *                          autonomous-reply defaults). Cannot switch profiles.
 *
 * Migration: if no profile has auth.yaml, the system continues to accept the
 * legacy HERMES_PASSWORD-based flow (single shared password, implicit admin).
 */

import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { z } from 'zod'
import { getProfilesRoot } from './profiles-browser'
import { isHashString, verifyPasswordHash } from './password-hash'

export const ProfileAuthSchema = z.object({
  username: z.string().min(1),
  password_hash: z.string().refine(isHashString, 'invalid password_hash format'),
  is_admin: z.boolean().optional().default(false),
  is_customer_admin: z.boolean().optional().default(false),
})

export type ProfileAuth = z.infer<typeof ProfileAuthSchema>

export type LoadedProfileAuth = {
  profile: string
  auth: ProfileAuth
  filePath: string
}

export function listProfileAuthEntries(
  pluginsRootOverride?: string,
): Array<LoadedProfileAuth> {
  const root = pluginsRootOverride ?? getProfilesRoot()
  if (!fs.existsSync(root)) return []
  const out: Array<LoadedProfileAuth> = []
  const entries = fs.readdirSync(root, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const profileDir = path.join(root, entry.name)
    const authPath = path.join(profileDir, 'auth.yaml')
    if (!fs.existsSync(authPath)) continue
    let raw: unknown
    try {
      raw = YAML.parse(fs.readFileSync(authPath, 'utf8'))
    } catch {
      continue
    }
    const parsed = ProfileAuthSchema.safeParse(raw)
    if (!parsed.success) continue
    out.push({
      profile: entry.name,
      auth: parsed.data,
      filePath: authPath,
    })
  }
  return out
}

export function hasAnyProfileAuth(pluginsRootOverride?: string): boolean {
  return listProfileAuthEntries(pluginsRootOverride).length > 0
}

export type LoginResult =
  | {
      ok: true
      profile: string
      username: string
      is_admin: boolean
      is_customer_admin: boolean
    }
  | { ok: false; reason: 'not_found' | 'bad_password' | 'no_users' }

export async function loginWithProfileCredentials(
  username: string,
  password: string,
  pluginsRootOverride?: string,
): Promise<LoginResult> {
  const entries = listProfileAuthEntries(pluginsRootOverride)
  if (entries.length === 0) return { ok: false, reason: 'no_users' }

  const match = entries.find((e) => e.auth.username === username)
  if (!match) return { ok: false, reason: 'not_found' }

  const valid = await verifyPasswordHash(password, match.auth.password_hash)
  if (!valid) return { ok: false, reason: 'bad_password' }

  return {
    ok: true,
    profile: match.profile,
    username: match.auth.username,
    is_admin: match.auth.is_admin ?? false,
    is_customer_admin: match.auth.is_customer_admin ?? false,
  }
}
