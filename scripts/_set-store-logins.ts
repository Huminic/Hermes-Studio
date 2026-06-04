#!/usr/bin/env npx tsx
/**
 * One-off: write known customer-admin logins for the 5 dealer stores so the
 * operator/tester can log into each store's storefront. Generates auth.yaml
 * content (scrypt hash via the project's own hashPassword) to /tmp/store-auth/.
 * The caller then `docker cp`s each into the Studio container's volume.
 *
 * Usage: PASSWORD='DealerDemo2026!' npx tsx scripts/_set-store-logins.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { hashPassword } from '../src/server/password-hash'

const PASSWORD = process.env.PASSWORD ?? 'DealerDemo2026!'
const STORES = [
  'serra-honda',
  'serra-nissan',
  'tony-serra-ford',
  'hyundai-of-columbia',
  'ford-of-columbia',
]

const outDir = '/tmp/store-auth'
fs.mkdirSync(outDir, { recursive: true })

async function main() {
  for (const slug of STORES) {
    const hash = await hashPassword(PASSWORD)
    const yaml =
      `username: ${slug}\n` +
      `password_hash: "${hash}"\n` +
      `is_admin: false\n` +
      `is_customer_admin: true\n`
    fs.writeFileSync(path.join(outDir, `${slug}.yaml`), yaml)
    console.log(`wrote ${slug}.yaml (username=${slug})`)
  }
  console.log(`\nALL set. Password for every store login: ${PASSWORD}`)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
