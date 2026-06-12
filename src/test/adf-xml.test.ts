import { describe, expect, it } from 'vitest'
import { buildAdfXml, isAdfXml, parseAdfXml } from '@/server/adf-xml'

const SAMPLE_ADF_BASIC = `<?xml version="1.0"?>
<?adf version="1.0"?>
<adf>
  <prospect>
    <requestdate>2026-05-29T12:00:00-05:00</requestdate>
    <vehicle interest="buy" status="new">
      <year>2026</year>
      <make>Toyota</make>
      <model>Camry</model>
    </vehicle>
    <customer>
      <contact>
        <name part="first">Test</name>
        <name part="last">Lead</name>
        <email>lead@example.com</email>
        <phone>+15555550100</phone>
      </contact>
      <comments>Interested in pricing</comments>
    </customer>
    <vendor>
      <vendorname>AutoTrader</vendorname>
      <service>AutoTrader Leads</service>
    </vendor>
  </prospect>
</adf>`

const SAMPLE_ADF_WITH_TRADE = `<?xml version="1.0"?>
<?adf version="1.0"?>
<adf>
  <prospect>
    <vehicle interest="lease" status="new">
      <make>Honda</make>
      <model>CR-V</model>
    </vehicle>
    <vehicle interest="trade-in" status="used">
      <year>2018</year>
      <make>Ford</make>
      <model>Edge</model>
      <vin>1FMCU0F75JUC12345</vin>
    </vehicle>
    <customer>
      <contact>
        <name part="full">Sample Customer</name>
        <email>sample@example.com</email>
      </contact>
    </customer>
  </prospect>
</adf>`

const SAMPLE_PLAIN_EMAIL = `Hi, I'm interested in the Camry. Please call me.`

describe('isAdfXml', () => {
  it('detects ADF payloads', () => {
    expect(isAdfXml(SAMPLE_ADF_BASIC)).toBe(true)
    expect(isAdfXml(SAMPLE_ADF_WITH_TRADE)).toBe(true)
    expect(isAdfXml(SAMPLE_PLAIN_EMAIL)).toBe(false)
    expect(isAdfXml('')).toBe(false)
  })
})

describe('parseAdfXml', () => {
  it('parses basic ADF prospect data', () => {
    const lead = parseAdfXml(SAMPLE_ADF_BASIC)
    expect(lead).not.toBeNull()
    expect(lead!.customer.first_name).toBe('Test')
    expect(lead!.customer.last_name).toBe('Lead')
    expect(lead!.customer.email).toBe('lead@example.com')
    expect(lead!.vehicles).toHaveLength(1)
    expect(lead!.vehicles[0].make).toBe('Toyota')
    expect(lead!.vehicles[0].interest).toBe('buy')
    expect(lead!.vendor?.name).toBe('AutoTrader')
    expect(lead!.comments).toContain('pricing')
  })

  it('separates trade-in into its own field', () => {
    const lead = parseAdfXml(SAMPLE_ADF_WITH_TRADE)
    expect(lead).not.toBeNull()
    expect(lead!.vehicles).toHaveLength(1)
    expect(lead!.vehicles[0].make).toBe('Honda')
    expect(lead!.trade?.make).toBe('Ford')
    expect(lead!.trade?.vin).toBe('1FMCU0F75JUC12345')
  })

  it('returns null for non-ADF input', () => {
    expect(parseAdfXml(SAMPLE_PLAIN_EMAIL)).toBeNull()
  })
})

describe('buildAdfXml + parseAdfXml round-trip', () => {
  it('round-trips a simple lead identity', () => {
    const lead = {
      request_date: '2026-05-29T12:00:00-05:00',
      customer: {
        first_name: 'Test',
        last_name: 'Lead',
        email: 'lead@example.com',
        phone: '+15555550100',
      },
      vehicles: [
        {
          interest: 'buy' as const,
          status: 'new' as const,
          year: '2026',
          make: 'Toyota',
          model: 'Camry',
        },
      ],
      comments: 'Interested in pricing',
      vendor: { name: 'AutoTrader' },
    }
    const xml = buildAdfXml(lead)
    expect(xml).toContain('<adf>')
    expect(xml).toContain('<make>Toyota</make>')
    const reparsed = parseAdfXml(xml)
    expect(reparsed).not.toBeNull()
    expect(reparsed!.customer.email).toBe('lead@example.com')
    expect(reparsed!.vehicles[0].make).toBe('Toyota')
    expect(reparsed!.vehicles[0].interest).toBe('buy')
  })

  it('folds a video recording link into <comments> with "Video recording:" wording', () => {
    const xml = buildAdfXml({
      customer: { full_name: 'Vid Lead', email: 'vid@example.com' },
      vehicles: [{ interest: 'unknown' as const }],
      comments: 'Asked about availability',
      recording_url: 'https://rec.example.com/vid.mp4',
      recording_kind: 'video',
    })
    expect(xml).toContain('Video recording: https://rec.example.com/vid.mp4')
    expect(xml).not.toContain('Call recording:')
    const reparsed = parseAdfXml(xml)
    expect(reparsed?.comments).toContain('Video recording: https://rec.example.com/vid.mp4')
    expect(reparsed?.comments).toContain('Asked about availability')
  })

  it('defaults to "Call recording:" wording when recording_kind is absent', () => {
    const xml = buildAdfXml({
      customer: { full_name: 'Aud Lead' },
      vehicles: [{ interest: 'unknown' as const }],
      recording_url: 'https://rec.example.com/abc.mp3',
    })
    expect(xml).toContain('Call recording: https://rec.example.com/abc.mp3')
    expect(xml).not.toContain('Video recording:')
  })
})
