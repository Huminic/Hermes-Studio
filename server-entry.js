import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Load .env before anything else
try {
  const { readFileSync } = await import('node:fs')
  const envPath = new URL('.env', import.meta.url).pathname
  const lines = readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    if (key && !(key in process.env)) process.env[key] = val
  }
} catch { /* .env is optional */ }

import server from './dist/server/server.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const CLIENT_DIR = join(__dirname, 'dist', 'client')

const port = parseInt(process.env.PORT || '3000', 10)
const host = process.env.HOST || '0.0.0.0'

const MIME_TYPES = {
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.map': 'application/json',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json',
}

async function tryServeStatic(req, res) {
  const url = new URL(
    req.url || '/',
    `http://${req.headers.host || 'localhost'}`,
  )
  const pathname = decodeURIComponent(url.pathname)

  // Prevent directory traversal
  if (pathname.includes('..')) return false

  const filePath = join(CLIENT_DIR, pathname)

  // Make sure the resolved path is within CLIENT_DIR
  if (!filePath.startsWith(CLIENT_DIR)) return false

  try {
    const fileStat = await stat(filePath)
    if (!fileStat.isFile()) return false

    const ext = extname(filePath).toLowerCase()
    const contentType = MIME_TYPES[ext] || 'application/octet-stream'
    const data = await readFile(filePath)

    const headers = {
      'Content-Type': contentType,
      'Content-Length': data.length,
    }

    // Cache hashed assets aggressively (they have content hashes in filenames)
    if (pathname.startsWith('/assets/')) {
      headers['Cache-Control'] = 'public, max-age=31536000, immutable'
    }

    res.writeHead(200, headers)
    res.end(data)
    return true
  } catch {
    return false
  }
}

const httpServer = createServer(async (req, res) => {
  // Try static files first (client assets)
  if (req.method === 'GET' || req.method === 'HEAD') {
    const served = await tryServeStatic(req, res)
    if (served) return
  }

  // Fall through to SSR handler
  const url = new URL(
    req.url || '/',
    `http://${req.headers.host || 'localhost'}`,
  )

  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value)
  }

  let body = null
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await new Promise((resolve) => {
      const chunks = []
      req.on('data', (chunk) => chunks.push(chunk))
      req.on('end', () => resolve(Buffer.concat(chunks)))
    })
  }

  const request = new Request(url.toString(), {
    method: req.method,
    headers,
    body,
    duplex: 'half',
  })

  try {
    const response = await server.fetch(request)

    // frame-ancestors only takes effect when delivered as an HTTP header — the
    // <meta> CSP in __root.tsx is ignored for this directive (GAP-CSP-META-001).
    // Emit it (and X-Frame-Options as a belt-and-suspenders) at the edge.
    const outHeaders = Object.fromEntries(response.headers.entries())
    // Public widget surfaces are MEANT to be embedded (iframed) on customer
    // websites and previewed in-app, so they must be frameable. Everything else
    // stays frame-locked (clickjacking protection).
    const embeddable =
      url.pathname.startsWith('/w/') ||
      url.pathname === '/nexxus-widget.js' ||
      url.pathname === '/nexxus-widget.min.js'
    if (embeddable) {
      delete outHeaders['x-frame-options']
      if (!outHeaders['content-security-policy']) {
        outHeaders['content-security-policy'] = 'frame-ancestors *'
      }
    } else {
      if (!outHeaders['content-security-policy']) {
        outHeaders['content-security-policy'] = "frame-ancestors 'none'"
      }
      outHeaders['x-frame-options'] = 'DENY'
    }

    res.writeHead(response.status, outHeaders)

    if (response.body) {
      const reader = response.body.getReader()
      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          res.write(value)
        }
        res.end()
      }
      pump().catch((err) => {
        console.error('Stream error:', err)
        res.end()
      })
    } else {
      const text = await response.text()
      res.end(text)
    }
  } catch (err) {
    console.error('Request error:', err)
    res.writeHead(500)
    res.end('Internal Server Error')
  }
})

httpServer.listen(port, host, () => {
  console.log(`Huminic Studio running at http://${host}:${port}`)
})

// Sentinel monitor — a supervised sibling process inside this container.
// Env-gated OFF by default: set SENTINEL_TICK_ENABLED=true to run it. It emails
// alerts only (no customer sends, no SMS). Kept in its own process so it keeps
// watching even if the request handler above wedges; respawned with a delay if
// it ever exits.
if (process.env.SENTINEL_TICK_ENABLED === 'true') {
  const { spawn } = await import('node:child_process')
  let stopping = false
  const startSentinel = () => {
    // `npx tsx scripts/<file>.ts` is the proven in-container script mechanism
    // (npx is global in the node image; tsx + src/ + scripts/ ship in the image
    // per the Dockerfile). Runs in THIS container so the monitor sees the same
    // ~/.hermes profile data and provider keys the app uses.
    const child = spawn('npx', ['tsx', 'scripts/sentinel-daemon.ts'], {
      cwd: __dirname,
      env: process.env,
      stdio: 'inherit',
    })
    child.on('exit', (code) => {
      if (stopping) return
      console.error(`[sentinel] daemon exited (code ${code}); restarting in 30s`)
      setTimeout(startSentinel, 30_000)
    })
    child.on('error', (err) => {
      console.error('[sentinel] failed to spawn daemon:', err?.message || err)
    })
  }
  process.on('SIGTERM', () => {
    stopping = true
  })
  startSentinel()
  console.log('[sentinel] monitor supervision enabled')
}
