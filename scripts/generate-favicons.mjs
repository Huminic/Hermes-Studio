/**
 * generate-favicons.mjs — rasterize public/favicon.svg into the PNG sizes
 * and a PNG-embedded favicon.ico used by the Studio shell + PWA manifest.
 *
 * Uses the Playwright Chromium already installed for the repo (no extra deps).
 * Run: node scripts/generate-favicons.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from '@playwright/test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pub = path.join(root, 'public')
const svg = readFileSync(path.join(pub, 'favicon.svg'), 'utf-8')

// size -> output filename(s)
const TARGETS = [
  { size: 16, files: ['favicon-16.png'] },
  { size: 32, files: ['favicon-32.png'] },
  { size: 180, files: ['apple-touch-icon.png'] },
  { size: 192, files: ['huminic-icon-192.png'] },
  { size: 512, files: ['huminic-icon-512.png'] },
]

function buildIco(png32) {
  // Single-image ICO wrapping a 32x32 PNG (valid for modern browsers).
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(1, 4) // image count
  const entry = Buffer.alloc(16)
  entry.writeUInt8(32, 0) // width
  entry.writeUInt8(32, 1) // height
  entry.writeUInt8(0, 2) // palette
  entry.writeUInt8(0, 3) // reserved
  entry.writeUInt16LE(1, 4) // color planes
  entry.writeUInt16LE(32, 6) // bits per pixel
  entry.writeUInt32LE(png32.length, 8) // image size
  entry.writeUInt32LE(6 + 16, 12) // offset
  return Buffer.concat([header, entry, png32])
}

const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  let png32 = null
  for (const { size, files } of TARGETS) {
    await page.setViewportSize({ width: size, height: size })
    const html = `<!doctype html><html><head><style>
      *{margin:0;padding:0}html,body{width:${size}px;height:${size}px;background:transparent}
      svg{display:block;width:${size}px;height:${size}px}
    </style></head><body>${svg}</body></html>`
    await page.setContent(html, { waitUntil: 'networkidle' })
    const buf = await page.screenshot({ omitBackground: true, type: 'png' })
    for (const f of files) writeFileSync(path.join(pub, f), buf)
    if (size === 32) png32 = buf
    console.log(`wrote ${files.join(', ')} (${size}x${size}, ${buf.length}b)`)
  }
  if (png32) {
    writeFileSync(path.join(pub, 'favicon.ico'), buildIco(png32))
    console.log('wrote favicon.ico (32x32 PNG-embedded)')
  }
} finally {
  await browser.close()
}
