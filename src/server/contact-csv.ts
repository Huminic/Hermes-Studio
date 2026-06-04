/**
 * Dependency-free CSV parser for customer contact-list uploads (SERRA-UI-9).
 *
 * The customer uploads a simple list (first_name,last_name,phone,email). We
 * are tolerant of header-name variants and column order, and we surface every
 * skipped row with a plain-language reason so nothing is silently dropped.
 */

export type ParsedContact = {
  display_name: string | null
  /** Channel-keyed identifiers usable by the campaign worker (email/sms/phone). */
  identifiers: Record<string, string>
}

export type CsvParseResult = {
  contacts: Array<ParsedContact>
  /** 1-based source row numbers (excluding header) that were skipped + why. */
  skipped: Array<{ row: number; reason: string }>
  /** Headers we recognised, for diagnostics. */
  matchedColumns: {
    first_name: number | null
    last_name: number | null
    name: number | null
    phone: number | null
    email: number | null
  }
}

/** Split a single CSV line, honouring double-quoted fields and escaped quotes. */
function splitCsvLine(line: string): Array<string> {
  const out: Array<string> = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

/** Normalise a header cell to a comparison key: lowercase, strip non-alphanum. */
function headerKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '')
}

const FIRST_NAME_HEADERS = new Set([
  'firstname',
  'first',
  'fname',
  'givenname',
  'given',
])
const LAST_NAME_HEADERS = new Set([
  'lastname',
  'last',
  'lname',
  'surname',
  'familyname',
  'family',
])
const NAME_HEADERS = new Set(['name', 'fullname', 'contact', 'contactname'])
const PHONE_HEADERS = new Set([
  'phone',
  'phonenumber',
  'mobile',
  'cell',
  'cellphone',
  'mobilenumber',
  'tel',
  'telephone',
  'sms',
])
const EMAIL_HEADERS = new Set(['email', 'emailaddress', 'mail', 'e'])

/** Keep only digits and a single leading + for phone numbers. */
function normalisePhone(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/[^0-9]/g, '')
  if (!digits) return ''
  return (hasPlus ? '+' : '') + digits
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function parseContactCsv(text: string): CsvParseResult {
  const skipped: Array<{ row: number; reason: string }> = []
  const contacts: Array<ParsedContact> = []
  const matchedColumns = {
    first_name: null as number | null,
    last_name: null as number | null,
    name: null as number | null,
    phone: null as number | null,
    email: null as number | null,
  }

  // Strip a UTF-8 BOM if present, then split into non-empty lines.
  const normalised = text.replace(/^﻿/, '')
  const lines = normalised
    .split(/\r\n|\r|\n/)
    .filter((l) => l.trim().length > 0)

  if (lines.length === 0) {
    return { contacts, skipped, matchedColumns }
  }

  const header = splitCsvLine(lines[0]).map(headerKey)
  header.forEach((h, idx) => {
    if (matchedColumns.first_name === null && FIRST_NAME_HEADERS.has(h)) {
      matchedColumns.first_name = idx
    } else if (matchedColumns.last_name === null && LAST_NAME_HEADERS.has(h)) {
      matchedColumns.last_name = idx
    } else if (matchedColumns.name === null && NAME_HEADERS.has(h)) {
      matchedColumns.name = idx
    } else if (matchedColumns.phone === null && PHONE_HEADERS.has(h)) {
      matchedColumns.phone = idx
    } else if (matchedColumns.email === null && EMAIL_HEADERS.has(h)) {
      matchedColumns.email = idx
    }
  })

  const cell = (cols: Array<string>, idx: number | null): string =>
    idx === null ? '' : (cols[idx] ?? '').trim()

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i])
    const first = cell(cols, matchedColumns.first_name)
    const last = cell(cols, matchedColumns.last_name)
    const whole = cell(cols, matchedColumns.name)
    const rawPhone = cell(cols, matchedColumns.phone)
    const rawEmail = cell(cols, matchedColumns.email)

    const phone = normalisePhone(rawPhone)
    const email = rawEmail.toLowerCase()

    const identifiers: Record<string, string> = {}
    if (email && EMAIL_RE.test(email)) {
      identifiers.email = email
    }
    if (phone) {
      // The campaign worker reaches text contacts via identifiers.sms and
      // voice/video contacts via identifiers.phone — populate both from the
      // single phone column so any channel can address the contact.
      identifiers.sms = phone
      identifiers.phone = phone
    }

    if (Object.keys(identifiers).length === 0) {
      const reason =
        rawEmail && !EMAIL_RE.test(email)
          ? 'invalid email and no phone'
          : 'missing phone/email'
      skipped.push({ row: i, reason })
      continue
    }

    let displayName: string | null = null
    if (first || last) {
      displayName = [first, last].filter(Boolean).join(' ')
    } else if (whole) {
      displayName = whole
    }

    contacts.push({ display_name: displayName, identifiers })
  }

  return { contacts, skipped, matchedColumns }
}
