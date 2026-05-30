/**
 * Default Service campaign templates seeded under
 * ~/.hermes/profiles/<profile>/campaigns/templates/<id>.md when missing.
 *
 * Per operator decision 2026-05-29 the Service sub-page is the only
 * campaigns surface; these templates target Service workflows.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export type CampaignTemplate = {
  id: string
  name: string
  description: string
  channel: 'email' | 'sms'
  message_template: string
  domain: 'service'
}

const SEED: Array<CampaignTemplate> = [
  {
    id: 'service-recall',
    name: 'Service Recall',
    description:
      'Reach out to customers whose vehicles match an open recall.',
    channel: 'email',
    domain: 'service',
    message_template: [
      'Hi {{first_name}},',
      '',
      'Your {{vehicle_year}} {{vehicle_model}} is affected by recall {{recall_id}}.',
      'We can perform the repair under warranty at no cost. Reply or call us to schedule.',
      '',
      '— {{dealer_name}} service',
    ].join('\n'),
  },
  {
    id: 'service-due',
    name: 'Service Due',
    description:
      'Remind customers their next service interval is due.',
    channel: 'sms',
    domain: 'service',
    message_template:
      "Hi {{first_name}} — your {{vehicle_model}} is due for {{service_type}}. Want to book this week? Reply YES and we'll text times.",
  },
  {
    id: 'follow-up-lead',
    name: 'Follow-up Lead',
    description: 'Re-engage leads that went cold after initial inquiry.',
    channel: 'email',
    domain: 'service',
    message_template: [
      'Hi {{first_name}},',
      '',
      'Following up on your interest in {{topic}}. Still want to set up a time to talk?',
      'I can also send detail by email if that works better.',
      '',
      '— {{agent_name}}',
    ].join('\n'),
  },
]

function templatesDir(profile: string): string {
  return path.join(
    os.homedir(),
    '.hermes',
    'profiles',
    profile,
    'campaigns',
    'templates',
  )
}

function frontmatterForTemplate(t: CampaignTemplate): string {
  return [
    '---',
    `id: ${t.id}`,
    `name: ${JSON.stringify(t.name)}`,
    `description: ${JSON.stringify(t.description)}`,
    `channel: ${t.channel}`,
    `domain: ${t.domain}`,
    'type: campaign-template',
    'status: published',
    '---',
    '',
  ].join('\n')
}

export function ensureCampaignTemplates(profile: string): {
  ok: boolean
  seeded: Array<string>
} {
  const dir = templatesDir(profile)
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch {
    return { ok: false, seeded: [] }
  }
  const seeded: Array<string> = []
  for (const t of SEED) {
    const file = path.join(dir, `${t.id}.md`)
    if (!fs.existsSync(file)) {
      fs.writeFileSync(
        file,
        frontmatterForTemplate(t) + t.message_template,
      )
      seeded.push(t.id)
    }
  }
  return { ok: true, seeded }
}

export function listCampaignTemplates(profile: string): Array<CampaignTemplate> {
  ensureCampaignTemplates(profile)
  // Always return the seed list — the on-disk files are operator-editable
  // but the API surface keeps a stable shape via this seed.
  return SEED
}
