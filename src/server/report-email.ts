/**
 * Shared report-email template (N2.1 — Serra comms recovery).
 *
 * Duane rejected the N1 daily email as "a list, not a report". This module is
 * the single, email-safe HTML template every report email (Daily AI Management,
 * Lead Source, End-of-day Wrap-up) renders through — a light card on a grey
 * page: a text wordmark + store name, a bold headline, a one-line greeting + a
 * one-line context sentence in the agent's voice, a 2×2 grid of KPI tiles, then
 * section blocks (identity + up-to-four stats rows, or a compact table), an
 * optional single green CTA button, and a plain-text footnote block.
 *
 * Email-safe conventions (from the licensed template pack, patterns only):
 *   - <table> layout, inline CSS, a single 600px column, system font stack.
 *   - NO flex/grid, NO external images. Colored "dots" are CSS-filled cells,
 *     never image files, so they render in Gmail web, Outlook desktop and
 *     iPhone Mail without a network fetch.
 *
 * Pure: no I/O, no send. Every caller-supplied string is HTML-escaped here, so
 * numbers filled from data are safe and text is never injected raw. Returns
 * `{ html, text }`; the subject line is the caller's (per-report).
 */

/** Shared page/brand palette — kept here so every report email matches. */
const PAGE_BG = '#eef0f4'
const CARD_BG = '#ffffff'
const INK = '#1f2430'
const MUTED = '#6b7280'
const HAIRLINE = '#e6e8ee'
const TILE_BORDER = '#e6e8ee'
const CTA_GREEN = '#12a150'
const ACCENT = '#2f6df6'
/** Delta arrow colors. */
const UP_GREEN = '#12a150'
const DOWN_RED = '#d0342c'
const EVEN_GREY = '#6b7280'
/** Huminic wordmark (text, never an image). */
const WORDMARK = 'HUMINIC'
const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

/**
 * Gradient banner (N2.6) — mostly deep purple blending discreetly into fuchsia
 * toward one corner. `BANNER_BG` is the Outlook/legacy-client fallback (Outlook
 * ignores CSS gradients); `bannerStyle()` layers the gradient on top of it.
 */
const BANNER_BG = '#4c1d95'
const BANNER_INK = '#ffffff'
const BANNER_MUTED = '#e4dcff'
function bannerStyle(): string {
  return `background:${BANNER_BG};background:linear-gradient(120deg, ${BANNER_BG} 0%, #6d28d9 55%, #c026d3 100%);`
}

/**
 * Unified status palette (N2.6) — ONE scheme used everywhere (tile dots, table
 * headers, and colored cells): waiting is amber under 24h and red at 24h+;
 * a "New" status is blue; lead types are grey.
 */
export const STATUS_AMBER = '#f59e0b'
export const STATUS_RED = '#d0342c'
export const STATUS_BLUE = '#2f6df6'
export const STATUS_GREY = '#6b7280'

/** Cell color for a "waiting" duration in hours (amber < 24h, red ≥ 24h). */
export function waitingColor(hours?: number | null): string {
  if (hours == null) return MUTED
  return hours >= 24 ? STATUS_RED : STATUS_AMBER
}

/** Cell color for a lead status ("New" → blue, otherwise ink). */
export function statusColor(status?: string | null): string {
  const s = (status ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  if (!s) return MUTED
  return /\bnew\b/.test(s) ? STATUS_BLUE : INK
}

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export type DeltaDirection = 'up' | 'down' | 'even'
export type Delta = { text: string; direction: DeltaDirection }

/** One KPI tile in the 2×2 grid. */
export type Tile = {
  value: string | number
  label: string
  /** CSS color for the label dot (e.g. '#2f6df6'). */
  dotColor: string
  /** Optional small trend line under the label. */
  delta?: Delta
}

/** One small stat (number over dot+label) on the right of a section row. */
export type Stat = { value: string | number; label: string; dotColor: string }

/** A section rendered as identity-left / stats-right rows (like "Active team members"). */
export type RowSection = {
  kind?: 'rows'
  title: string
  rows: Array<{ primary: string; secondary?: string; stats: Stat[] }>
}

/** A table column header — a plain label, or a label that carries a color (N2.6). */
export type TableColumn =
  | string
  | { label: string; color?: string; align?: 'left' | 'right' }

/** A table cell — a plain value, or a value with a color/weight (N2.6). */
export type TableCell =
  | string
  | number
  | { value: string | number; color?: string; bold?: boolean }

/**
 * A section rendered as a compact table. Used for the noon source overflow and,
 * since N2.6, the "Needs attention" and "AI coverage" tables — a header row
 * whose column names carry the palette color, then plain (optionally colored)
 * rows underneath. No per-cell dot labels.
 */
export type TableSection = {
  kind: 'table'
  title: string
  columns: TableColumn[]
  rows: TableCell[][]
}

export type Section = RowSection | TableSection

export type Cta = { label: string; url: string }

export type ReportEmailInput = {
  storeName: string
  /** Store agent voice (Caroline / Georgia) — shown in the header byline. */
  agentName: string
  /** Bold headline, e.g. "See what your team has been up to". */
  headline: string
  /** One-line greeting, e.g. "Hi team,". */
  greeting: string
  /** One-line context sentence in the agent's voice (numbers filled from data). */
  context: string
  /** Up to four KPI tiles (rendered 2×2). */
  tiles: Tile[]
  sections: Section[]
  /** Optional single green button. */
  cta?: Cta
  /** Small grey footnote lines (the omission footnote appears ONCE — caller's job). */
  footnotes: string[]
}

// ── HTML fragments ───────────────────────────────────────────────────────────

/** A CSS-filled dot (not an image) followed by escaped label text. */
function dotLabel(color: string, label: string, size = 8): string {
  return `<span style="display:inline-block;width:${size}px;height:${size}px;border-radius:50%;background:${color};vertical-align:middle;margin-right:6px;">&nbsp;</span><span style="vertical-align:middle;">${escapeHtml(
    label,
  )}</span>`
}

function deltaHtml(delta: Delta): string {
  const arrow =
    delta.direction === 'up' ? '&#9650;' : delta.direction === 'down' ? '&#9660;' : '='
  const color =
    delta.direction === 'up' ? UP_GREEN : delta.direction === 'down' ? DOWN_RED : EVEN_GREY
  return `<div style="margin-top:4px;font-size:12px;color:${color};">${arrow} ${escapeHtml(
    delta.text,
  )}</div>`
}

/** One KPI tile cell. */
function tileCell(tile: Tile): string {
  return `<td width="50%" style="padding:6px;" valign="top">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${TILE_BORDER};border-radius:10px;background:${CARD_BG};">
        <tr><td style="padding:18px 20px;text-align:center;">
          <div style="font-size:34px;line-height:1.1;font-weight:700;color:${INK};">${escapeHtml(
            String(tile.value),
          )}</div>
          <div style="margin-top:8px;font-size:14px;color:${MUTED};">${dotLabel(
            tile.dotColor,
            tile.label,
          )}</div>
          ${tile.delta ? deltaHtml(tile.delta) : ''}
        </td></tr>
      </table>
    </td>`
}

/** The 2×2 tile grid (renders 1–4 tiles; pads a lone odd tile with an empty cell). */
function tilesBlock(tiles: Tile[]): string {
  if (tiles.length === 0) return ''
  const rows: string[] = []
  for (let i = 0; i < tiles.length; i += 2) {
    const left = tileCell(tiles[i])
    const right = tiles[i + 1] ? tileCell(tiles[i + 1]) : '<td width="50%" style="padding:6px;"></td>'
    rows.push(`<tr>${left}${right}</tr>`)
  }
  return `<tr><td style="padding:8px 34px 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join('')}</table>
    </td></tr>`
}

/** One "number over dot+label" stat on the right side of a row. */
function statCell(stat: Stat): string {
  return `<td align="center" style="padding:0 10px;">
      <div style="font-size:17px;font-weight:600;color:${INK};">${escapeHtml(
        String(stat.value),
      )}</div>
      <div style="margin-top:2px;font-size:11px;color:${MUTED};white-space:nowrap;">${dotLabel(
        stat.dotColor,
        stat.label,
        7,
      )}</div>
    </td>`
}

function rowSectionBlock(section: RowSection): string {
  const rows = section.rows
    .map((r, i) => {
      const stats = r.stats.map(statCell).join('')
      const border = i === 0 ? '' : `border-top:1px solid ${HAIRLINE};`
      return `<tr><td style="padding:12px 0;${border}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td valign="middle" style="font-size:14px;color:${INK};">
            <div style="font-weight:600;">${escapeHtml(r.primary)}</div>
            ${r.secondary ? `<div style="font-size:12px;color:${MUTED};margin-top:2px;">${escapeHtml(r.secondary)}</div>` : ''}
          </td>
          <td valign="middle" align="right"><table role="presentation" cellpadding="0" cellspacing="0"><tr>${stats}</tr></table></td>
        </tr></table>
      </td></tr>`
    })
    .join('')
  const body = section.rows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`
    : `<div style="font-size:14px;color:${MUTED};">Nothing to flag.</div>`
  return `<tr><td style="padding:18px 34px 4px;">
      <div style="font-size:16px;font-weight:700;color:${INK};margin-bottom:6px;">${escapeHtml(
        section.title,
      )}</div>
      ${body}
    </td></tr>`
}

/** Column label text (accepts the plain-string or object form). */
function columnLabel(c: TableColumn): string {
  return typeof c === 'string' ? c : c.label
}

/** Column alignment: explicit when given, else first column left / rest right. */
function columnAlign(c: TableColumn, i: number): 'left' | 'right' {
  if (typeof c !== 'string' && c.align) return c.align
  return i === 0 ? 'left' : 'right'
}

function tableSectionBlock(section: TableSection): string {
  const head = section.columns
    .map((c, i) => {
      const color = typeof c === 'string' ? MUTED : c.color ?? MUTED
      return `<th align="${columnAlign(c, i)}" style="padding:6px 8px;font-size:12px;color:${color};border-bottom:1px solid ${HAIRLINE};font-weight:700;">${escapeHtml(
        columnLabel(c),
      )}</th>`
    })
    .join('')
  const body = section.rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell, i) => {
            const align = columnAlign(section.columns[i] ?? '', i)
            const isObj = typeof cell === 'object' && cell !== null
            const color = isObj && cell.color ? cell.color : INK
            const weight = isObj && cell.bold ? 'font-weight:600;' : ''
            const value = isObj ? cell.value : cell
            return `<td align="${align}" style="padding:7px 8px;font-size:13px;color:${color};${weight}border-bottom:1px solid ${HAIRLINE};">${escapeHtml(
              String(value),
            )}</td>`
          })
          .join('')}</tr>`,
    )
    .join('')
  const table = section.rows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${head}</tr>${body}</table>`
    : `<div style="font-size:14px;color:${MUTED};">No rows.</div>`
  return `<tr><td style="padding:18px 34px 4px;">
      <div style="font-size:16px;font-weight:700;color:${INK};margin-bottom:6px;">${escapeHtml(
        section.title,
      )}</div>
      ${table}
    </td></tr>`
}

function sectionBlock(section: Section): string {
  return section.kind === 'table' ? tableSectionBlock(section) : rowSectionBlock(section as RowSection)
}

function ctaBlock(cta: Cta): string {
  // Only http(s) links become a live button; anything else renders as escaped
  // text so a non-http scheme can never become a clickable href.
  const isHttp = /^https?:\/\//i.test(cta.url)
  if (!isHttp) return ''
  return `<tr><td style="padding:22px 34px 8px;" align="center">
      <a href="${escapeHtml(cta.url)}" style="display:inline-block;background:${CTA_GREEN};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 26px;border-radius:8px;">${escapeHtml(
        cta.label,
      )}</a>
    </td></tr>`
}

function footnotesBlock(footnotes: string[]): string {
  if (footnotes.length === 0) return ''
  const lines = footnotes
    .map(
      (f) =>
        `<p style="margin:0 0 6px 0;font-size:12px;color:${MUTED};line-height:1.5;">${escapeHtml(
          f,
        )}</p>`,
    )
    .join('')
  return `<tr><td style="padding:20px 34px 30px;border-top:1px solid ${HAIRLINE};">${lines}</td></tr>`
}

/**
 * Render the report email. Returns email-safe HTML + a plain-text alternative.
 * Subject is the caller's responsibility (each report has its own).
 */
export function renderReportEmail(input: ReportEmailInput): { html: string; text: string } {
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(
    input.headline,
  )}</title></head>
<body style="margin:0;padding:0;font-family:${FONT_STACK};background:${PAGE_BG};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE_BG};">
    <tr><td style="padding:28px 12px;">
      <table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:${CARD_BG};border-radius:12px;border:1px solid ${HAIRLINE};overflow:hidden;">
        <!-- Logo: centered on the white card, no box or background behind it -->
        <tr><td align="center" style="padding:26px 34px 20px;">
          <span style="font-size:18px;font-weight:800;letter-spacing:3px;color:${ACCENT};">${WORDMARK}</span>
        </td></tr>
        <!-- Gradient banner: store name + headline + one-sentence story, all white -->
        <tr><td bgcolor="${BANNER_BG}" style="${bannerStyle()}padding:26px 34px;">
          <div style="font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${BANNER_MUTED};">${escapeHtml(
            input.storeName,
          )}</div>
          <div style="margin-top:8px;font-size:23px;font-weight:700;color:${BANNER_INK};line-height:1.25;">${escapeHtml(
            input.headline,
          )}</div>
          <p style="margin:12px 0 0 0;font-size:14px;color:${BANNER_INK};line-height:1.6;">${escapeHtml(
            input.greeting,
          )} ${escapeHtml(input.context)}</p>
        </td></tr>
        ${tilesBlock(input.tiles)}
        ${input.sections.map(sectionBlock).join('')}
        ${input.cta ? ctaBlock(input.cta) : ''}
        ${footnotesBlock(input.footnotes)}
        <tr><td style="padding:0 34px 26px;">
          <p style="margin:0;font-size:11px;color:${MUTED};">— ${escapeHtml(
            input.agentName,
          )} · Powered by Huminic</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  // ── Plain-text alternative ──────────────────────────────────────────────────
  const t: string[] = []
  t.push(input.storeName)
  t.push(input.headline)
  t.push('')
  t.push(input.greeting)
  t.push(input.context)
  if (input.tiles.length) {
    t.push('')
    for (const tile of input.tiles) {
      const d = tile.delta ? ` (${tile.delta.direction} ${tile.delta.text})` : ''
      t.push(`  ${tile.label}: ${tile.value}${d}`)
    }
  }
  for (const section of input.sections) {
    t.push('')
    t.push(section.title)
    if (section.kind === 'table') {
      t.push('  ' + section.columns.map(columnLabel).join(' | '))
      for (const row of section.rows) {
        t.push(
          '  ' +
            row
              .map((cell) => (typeof cell === 'object' && cell !== null ? cell.value : cell))
              .join(' | '),
        )
      }
    } else {
      const rs = section as RowSection
      if (rs.rows.length === 0) t.push('  (nothing to flag)')
      for (const r of rs.rows) {
        const stats = r.stats.map((s) => `${s.label} ${s.value}`).join(', ')
        t.push(`  ${r.primary}${r.secondary ? ` (${r.secondary})` : ''} — ${stats}`)
      }
    }
  }
  if (input.cta && /^https?:\/\//i.test(input.cta.url)) {
    t.push('')
    t.push(`${input.cta.label}: ${input.cta.url}`)
  }
  if (input.footnotes.length) {
    t.push('')
    for (const f of input.footnotes) t.push(f)
  }
  t.push('')
  t.push(`— ${input.agentName} · Powered by Huminic`)

  return { html, text: t.join('\n') }
}
