/**
 * Host/system stats for the Sentinel daily digest — CPU load, memory, disk, and
 * uptime. Pure `os` + `fs.statfs`; every field is fail-safe (a read error yields
 * a null/NaN-free fallback so the digest still renders).
 *
 * The Sentinel samples these each pass and tracks daily high/low between
 * digests; `sampleHostStats()` is the current snapshot.
 */
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'

export type HostStats = {
  /** 1-minute load average. */
  cpuLoad1: number
  cpuCores: number
  /** Load per core × 100, capped at 100 — an approximate CPU%. */
  cpuPct: number
  memUsedGb: number
  memTotalGb: number
  memUsedPct: number
  diskUsedGb: number
  diskTotalGb: number
  diskUsedPct: number
  /** System uptime in seconds. */
  uptimeSec: number
}

function dataPath(): string {
  const p = path.join(os.homedir(), '.hermes')
  try {
    return fs.existsSync(p) ? p : '/'
  } catch {
    return '/'
  }
}

export function sampleHostStats(): HostStats {
  const cores = os.cpus()?.length || 1
  const load1 = os.loadavg()?.[0] ?? 0
  const cpuPct = Math.min(100, Math.round((load1 / cores) * 100))

  const total = os.totalmem() || 1
  const free = os.freemem() || 0
  const used = Math.max(0, total - free)

  let diskUsedGb = 0
  let diskTotalGb = 0
  let diskUsedPct = 0
  try {
    const st = fs.statfsSync(dataPath())
    const blockSize = st.bsize
    const totalB = st.blocks * blockSize
    const availB = st.bavail * blockSize
    const usedB = Math.max(0, totalB - availB)
    diskTotalGb = round1(totalB / 1e9)
    diskUsedGb = round1(usedB / 1e9)
    diskUsedPct = totalB > 0 ? Math.round((usedB / totalB) * 100) : 0
  } catch {
    /* leave zeros */
  }

  return {
    cpuLoad1: round2(load1),
    cpuCores: cores,
    cpuPct,
    memUsedGb: round1(used / 1e9),
    memTotalGb: round1(total / 1e9),
    memUsedPct: Math.round((used / total) * 100),
    diskUsedGb,
    diskTotalGb,
    diskUsedPct,
    uptimeSec: Math.round(os.uptime() || 0),
  }
}

export function formatUptime(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return 'unknown'
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
function round2(n: number): number {
  return Math.round(n * 100) / 100
}
