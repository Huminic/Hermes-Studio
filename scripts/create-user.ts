#!/usr/bin/env tsx
/**
 * Provision a profile user.
 *
 * Usage:
 *   pnpm tsx scripts/create-user.ts --profile <profile> --username <name> [--admin]
 *
 * Prompts for the password interactively (hidden input). Writes an auth.yaml
 * under ~/.hermes/profiles/<profile>/auth.yaml using a scrypt hash. If an
 * auth.yaml already exists, refuses to overwrite without --force.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { hashPassword } from '../src/server/password-hash'

function parseArgs(argv: Array<string>): {
  profile?: string
  username?: string
  admin: boolean
  customerAdmin: boolean
  force: boolean
  help: boolean
} {
  const out = {
    profile: undefined as string | undefined,
    username: undefined as string | undefined,
    admin: false,
    customerAdmin: false,
    force: false,
    help: false,
  }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--profile') out.profile = argv[++i]
    else if (a === '--username') out.username = argv[++i]
    else if (a === '--admin') out.admin = true
    else if (a === '--customer-admin') out.customerAdmin = true
    else if (a === '--force') out.force = true
    else if (a === '--help' || a === '-h') out.help = true
  }
  return out
}

function promptHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })
    process.stdout.write(prompt)
    const stdin = process.stdin as NodeJS.ReadStream & { isTTY: boolean }
    let buffer = ''

    const onData = (chunk: Buffer) => {
      const s = chunk.toString('utf8')
      for (const ch of s) {
        if (ch === '\n' || ch === '\r' || ch === '') {
          stdin.removeListener('data', onData)
          stdin.setRawMode?.(false)
          process.stdout.write('\n')
          rl.close()
          resolve(buffer)
          return
        }
        if (ch === '' || ch === '\b') {
          buffer = buffer.slice(0, -1)
        } else if (ch >= ' ' && ch <= '~') {
          buffer += ch
        }
      }
    }

    stdin.setRawMode?.(true)
    stdin.resume()
    stdin.on('data', onData)
  })
}

function usage() {
  console.log(
    `Usage: pnpm tsx scripts/create-user.ts --profile <profile> --username <name> [--admin] [--customer-admin] [--force]\n` +
      `\n` +
      `  --profile          profile name under ~/.hermes/profiles/\n` +
      `  --username         login username\n` +
      `  --admin            Studio operator (allows global active-profile switching, /console/* access)\n` +
      `  --customer-admin   customer storefront admin (allows /p/<profile>/* access)\n` +
      `  --force            overwrite an existing auth.yaml\n` +
      `\n` +
      `--admin and --customer-admin are independent flags; a user may have either, both, or neither.\n`,
  )
}

async function main() {
  const args = parseArgs(process.argv)
  if (args.help || !args.profile || !args.username) {
    usage()
    process.exit(args.help ? 0 : 1)
  }

  const profilesRoot = path.join(os.homedir(), '.hermes', 'profiles')
  const profileDir = path.join(profilesRoot, args.profile)
  if (!fs.existsSync(profileDir)) {
    console.error(
      `Profile directory does not exist: ${profileDir}\n` +
        `Run the bootstrap script first, or create the profile in Studio.`,
    )
    process.exit(2)
  }

  const authPath = path.join(profileDir, 'auth.yaml')
  if (fs.existsSync(authPath) && !args.force) {
    console.error(
      `auth.yaml already exists at ${authPath}. Use --force to overwrite.`,
    )
    process.exit(3)
  }

  const password = await promptHidden('Password: ')
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.')
    process.exit(4)
  }
  const confirm = await promptHidden('Confirm:  ')
  if (confirm !== password) {
    console.error('Passwords do not match.')
    process.exit(5)
  }

  const hash = await hashPassword(password)
  const yaml = [
    `username: ${args.username}`,
    `password_hash: ${hash}`,
    `is_admin: ${args.admin ? 'true' : 'false'}`,
    `is_customer_admin: ${args.customerAdmin ? 'true' : 'false'}`,
    '',
  ].join('\n')
  fs.writeFileSync(authPath, yaml, { mode: 0o600 })
  console.log(`Wrote ${authPath}`)
  console.log(`User: ${args.username}`)
  console.log(`Profile: ${args.profile}`)
  console.log(`Admin: ${args.admin ? 'yes' : 'no'}`)
  console.log(`Customer admin: ${args.customerAdmin ? 'yes' : 'no'}`)
}

void main().catch((err) => {
  console.error(err)
  process.exit(99)
})
