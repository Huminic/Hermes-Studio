/**
 * ADF (Auto Dealer Format) XML parser + emitter — AC.6.7 / AC.6.8.
 *
 * Inbound: detect ADF-XML payloads on email content, parse the
 * <prospect> + <customer> + <vehicle> blocks, normalize to a
 * lead_meta JSON the messaging-hub can persist as Sales thread
 * structured data.
 *
 * Outbound: build a valid ADF-XML document from a lead-shaped JSON
 * payload for forwarding to DMS systems that consume ADF.
 *
 * Implementation note: this uses a hand-rolled lightweight XML
 * tokenizer for ADF's narrow shape (no external lib needed for the
 * three field families ADF guarantees). Robust enough for the common
 * variants in production dealership feeds; not a general XML parser.
 */

export type AdfContact = {
  first_name?: string
  last_name?: string
  full_name?: string
  email?: string
  phone?: string
  preferred_contact?: 'email' | 'phone' | 'sms'
}

export type AdfVehicle = {
  interest: 'buy' | 'lease' | 'trade-in' | 'sell' | 'unknown'
  status?: 'new' | 'used' | 'unknown'
  year?: string
  make?: string
  model?: string
  trim?: string
  vin?: string
  stock?: string
}

export type AdfLead = {
  request_date?: string
  customer: AdfContact
  vehicles: Array<AdfVehicle>
  trade?: AdfVehicle | null
  vendor?: { name?: string; service?: string }
  comments?: string
  /**
   * Hosted call/video-recording link, when the channel provides one (Vapi
   * `recordingUrl`, Tavus `recording_url`). Surfaced to the dealer in the
   * notification: appended to ADF `<comments>` (so the CRM ingests it) and
   * rendered as a clickable link in the email card.
   */
  recording_url?: string
  /**
   * Media type of `recording_url`, so the dealer-facing wording matches the
   * channel: voice → 'audio' ("Call recording" / "Listen to …"), video →
   * 'video' ("Video recording" / "Watch …"). Defaults to audio wording when
   * absent.
   */
  recording_kind?: 'audio' | 'video'
}

/**
 * Detect whether a string looks like an ADF-XML payload. Used by the
 * email adapter to decide whether to route inbound through ADF parsing
 * vs treating it as a plain email message.
 */
export function isAdfXml(input: string): boolean {
  const trimmed = input.trim()
  if (!trimmed.startsWith('<')) return false
  return /<adf\b/i.test(trimmed)
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
}

function pickFirst(input: string, tag: string): string | undefined {
  const re = new RegExp(
    `<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`,
    'i',
  )
  const m = re.exec(input)
  return m ? decodeXmlEntities(m[1].trim()) : undefined
}

function pickAttribute(input: string, tag: string, attr: string): string | undefined {
  const re = new RegExp(
    `<${tag}\\b[^>]*\\b${attr}=["']([^"']+)["']`,
    'i',
  )
  const m = re.exec(input)
  return m ? m[1] : undefined
}

function pickAllSections(input: string, tag: string): Array<string> {
  // Returns the FULL element including the opening tag so that attribute
  // probes (pickAttribute) can run against the same string.
  const re = new RegExp(
    `<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`,
    'gi',
  )
  return input.match(re) ?? []
}

function parseContact(section: string): AdfContact {
  const firstName =
    pickFirst(section, 'name[^>]*part=["\']first["\']') ??
    pickFirstByAttr(section, 'name', 'part', 'first')
  const lastName =
    pickFirstByAttr(section, 'name', 'part', 'last') ?? undefined
  const fullName = pickFirstByAttr(section, 'name', 'part', 'full') ?? undefined
  const email = pickFirst(section, 'email')
  const phone = pickFirst(section, 'phone')
  const out: AdfContact = {}
  if (firstName) out.first_name = firstName
  if (lastName) out.last_name = lastName
  if (fullName) out.full_name = fullName
  if (email) out.email = email
  if (phone) out.phone = phone
  if (!out.full_name && (out.first_name || out.last_name)) {
    out.full_name = [out.first_name, out.last_name].filter(Boolean).join(' ')
  }
  return out
}

function pickFirstByAttr(
  input: string,
  tag: string,
  attr: string,
  value: string,
): string | undefined {
  const re = new RegExp(
    `<${tag}\\b[^>]*\\b${attr}=["']${value}["'][^>]*>([\\s\\S]*?)<\\/${tag}>`,
    'i',
  )
  const m = re.exec(input)
  return m ? decodeXmlEntities(m[1].trim()) : undefined
}

function parseVehicle(section: string): AdfVehicle {
  const interestAttr = pickAttribute(section, 'vehicle', 'interest')
  const statusAttr = pickAttribute(section, 'vehicle', 'status')
  const out: AdfVehicle = {
    interest:
      interestAttr === 'buy' ||
      interestAttr === 'lease' ||
      interestAttr === 'trade-in' ||
      interestAttr === 'sell'
        ? interestAttr
        : 'unknown',
    status:
      statusAttr === 'new' || statusAttr === 'used' ? statusAttr : 'unknown',
  }
  const year = pickFirst(section, 'year')
  const make = pickFirst(section, 'make')
  const model = pickFirst(section, 'model')
  const trim = pickFirst(section, 'trim')
  const vin = pickFirst(section, 'vin')
  const stock = pickFirst(section, 'stock')
  if (year) out.year = year
  if (make) out.make = make
  if (model) out.model = model
  if (trim) out.trim = trim
  if (vin) out.vin = vin
  if (stock) out.stock = stock
  return out
}

export function parseAdfXml(raw: string): AdfLead | null {
  if (!isAdfXml(raw)) return null
  const prospect = pickFirst(raw, 'prospect') ?? raw
  const requestDate = pickFirst(prospect, 'requestdate')
  const customerSection = pickFirst(prospect, 'customer') ?? ''
  const contactSection = pickFirst(customerSection, 'contact') ?? customerSection
  const customer = parseContact(contactSection)
  // Vehicles: prospect can carry multiple; one may be `interest="trade-in"`.
  const vehicleSections = pickAllSections(prospect, 'vehicle')
  const vehicles = vehicleSections.map(parseVehicle)
  const trade =
    vehicles.find((v) => v.interest === 'trade-in' || v.interest === 'sell') ??
    null
  const buys = vehicles.filter(
    (v) => v.interest !== 'trade-in' && v.interest !== 'sell',
  )
  const vendor = {
    name: pickFirst(prospect, 'vendorname'),
    service: pickFirst(prospect, 'service'),
  }
  const comments = pickFirst(customerSection, 'comments')
  return {
    request_date: requestDate,
    customer,
    vehicles: buys,
    trade,
    vendor:
      vendor.name || vendor.service
        ? { name: vendor.name, service: vendor.service }
        : undefined,
    comments,
  }
}

function encodeXml(s: string | undefined): string {
  if (!s) return ''
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function emitVehicle(v: AdfVehicle): string {
  const parts: Array<string> = []
  parts.push(`<vehicle interest="${v.interest}" status="${v.status ?? 'unknown'}">`)
  if (v.year) parts.push(`  <year>${encodeXml(v.year)}</year>`)
  if (v.make) parts.push(`  <make>${encodeXml(v.make)}</make>`)
  if (v.model) parts.push(`  <model>${encodeXml(v.model)}</model>`)
  if (v.trim) parts.push(`  <trim>${encodeXml(v.trim)}</trim>`)
  if (v.vin) parts.push(`  <vin>${encodeXml(v.vin)}</vin>`)
  if (v.stock) parts.push(`  <stock>${encodeXml(v.stock)}</stock>`)
  parts.push(`</vehicle>`)
  return parts.join('\n')
}

export function buildAdfXml(lead: AdfLead): string {
  const customer = lead.customer
  const name: Array<string> = []
  if (customer.first_name) {
    name.push(
      `      <name part="first">${encodeXml(customer.first_name)}</name>`,
    )
  }
  if (customer.last_name) {
    name.push(
      `      <name part="last">${encodeXml(customer.last_name)}</name>`,
    )
  }
  if (!customer.first_name && !customer.last_name && customer.full_name) {
    name.push(
      `      <name part="full">${encodeXml(customer.full_name)}</name>`,
    )
  }

  const lines: Array<string> = []
  lines.push('<?xml version="1.0"?>')
  lines.push('<?adf version="1.0"?>')
  lines.push('<adf>')
  lines.push('  <prospect>')
  if (lead.request_date) {
    lines.push(`    <requestdate>${encodeXml(lead.request_date)}</requestdate>`)
  }
  for (const v of lead.vehicles) {
    lines.push('    ' + emitVehicle(v).split('\n').join('\n    '))
  }
  if (lead.trade) {
    lines.push('    ' + emitVehicle(lead.trade).split('\n').join('\n    '))
  }
  lines.push('    <customer>')
  lines.push('      <contact>')
  for (const line of name) lines.push(line)
  if (customer.email) {
    lines.push(`      <email>${encodeXml(customer.email)}</email>`)
  }
  if (customer.phone) {
    lines.push(`      <phone>${encodeXml(customer.phone)}</phone>`)
  }
  lines.push('      </contact>')
  // Fold the hosted recording link into <comments> so any ADF-consuming DMS
  // surfaces it (no standard ADF element exists for a recording URL). The label
  // matches the media type so a video lead doesn't read as a "Call recording".
  const recordingLabel =
    lead.recording_kind === 'video' ? 'Video recording' : 'Call recording'
  const commentsText = lead.recording_url
    ? [lead.comments, `${recordingLabel}: ${lead.recording_url}`]
        .filter(Boolean)
        .join('\n\n')
    : lead.comments
  if (commentsText) {
    lines.push(`      <comments>${encodeXml(commentsText)}</comments>`)
  }
  lines.push('    </customer>')
  if (lead.vendor) {
    lines.push('    <vendor>')
    if (lead.vendor.name) {
      lines.push(`      <vendorname>${encodeXml(lead.vendor.name)}</vendorname>`)
    }
    if (lead.vendor.service) {
      lines.push(`      <service>${encodeXml(lead.vendor.service)}</service>`)
    }
    lines.push('    </vendor>')
  }
  lines.push('  </prospect>')
  lines.push('</adf>')
  return lines.join('\n')
}
