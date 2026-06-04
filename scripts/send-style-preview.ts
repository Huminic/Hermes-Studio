#!/usr/bin/env npx tsx
/**
 * One-off styled-email preview sender. Renders the REAL dealer-notification
 * email via renderDealerNotificationEmail (WS-9) for both formats and sends them
 * to a single explicit recipient through the central-mcp resend_send_email tool —
 * so the operator can eyeball the new emails against what Nexxus sends today.
 *
 * Usage:
 *   CENTRAL_MCP_TOKEN=<claude_nexxus-2.2> TEST_EMAIL=neoweaver@gmail.com \
 *   npx tsx scripts/send-style-preview.ts
 */
import { renderDealerNotificationEmail } from '../src/server/lead-notifications'
import type { AdfLead } from '../src/server/adf-xml'

const TOKEN = process.env.CENTRAL_MCP_TOKEN
const URL = process.env.CENTRAL_MCP_URL ?? 'https://mcp.huminicdev.com/dax/mcp'
const TO = process.env.TEST_EMAIL ?? 'neoweaver@gmail.com'
if (!TOKEN) {
  console.error('CENTRAL_MCP_TOKEN required')
  process.exit(1)
}

async function resend(from: string, subject: string, html: string | undefined, text: string) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'resend_send_email', arguments: { from, to: TO, subject, html, text } },
    }),
  })
  const t = await res.text()
  const m = t.match(/data: ({[\s\S]*?})\n/)
  console.log(`-> ${subject}\n   ${m ? m[1].slice(0, 240) : t.slice(0, 240)}`)
}

const lead: AdfLead = {
  request_date: new Date().toISOString(),
  customer: {
    first_name: 'Robert',
    last_name: 'Kleinstein',
    email: 'robert.kleinstein@example.com',
    phone: '+12055551234',
    preferred_contact: 'email',
  },
  vehicles: [{ interest: 'buy', status: 'used', year: '2023', make: 'Honda', model: 'CR-V', trim: 'EX-L' }],
  vendor: { name: 'Hyundai of Columbia' },
  comments: 'Submitted via TrueCar / consumer report. Asked about pricing and a time to visit.',
}

async function main() {
  // Columbia = regular styled HTML card
  const card = renderDealerNotificationEmail({ format: 'email', lead, orgName: 'Hyundai of Columbia' })
  await resend('Hyundai of Columbia <notifications@huminic.ai>', `[Studio preview] ${card.subject}`, card.html, card.text)

  // Serra = ADF New Lead email
  const serraLead: AdfLead = { ...lead, vendor: { name: 'Serra Honda of Sylacauga' } }
  const adf = renderDealerNotificationEmail({ format: 'adf-xml', lead: serraLead, orgName: 'Serra Honda of Sylacauga' })
  await resend('Nexxus Connect <leads@huminic.ai>', `[Studio preview] ${adf.subject}`, adf.html, adf.text)

  console.log('done')
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
