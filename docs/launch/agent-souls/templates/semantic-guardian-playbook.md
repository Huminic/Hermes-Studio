---
id: semantic-guardian-playbook
type: playbook
status: active
title: Semantic Guardian Playbook (KSG + DSG)
applies_to: "*-data-governor"
closes: GAP-KSG-SCANNER-001
---

# Semantic Guardian Playbook

The companion playbook for every `*-data-governor` profile. Distributed to each
governor's `governance/semantic-guardian-playbook.md`. It describes both halves
of the guardian:

- **Write-time gate** (synchronous) — `src/server/ksg-gate.ts` + `src/server/dsg-gate.ts`.
- **Read-time scanner** (cadenced) — `src/server/integrity-scanner.ts`
  (`scanWikiIntegrity` in `src/server/knowledge-browser.ts`). This is the
  capability that closes `GAP-KSG-SCANNER-001`; until it shipped, the governor
  SOULs were marked `status: stub`.

## 1. Write-time gate (KSG + DSG)

Every proposed write to the customer wiki or Brain passes through the gate
before commit. Enforced rules:

| Rule | Layer | Outcome on violation |
|---|---|---|
| Protected-tree (`canon/`, `governance/`, `archive/`) | KSG | hard block |
| Canonical-frozen (`status: canonical` pages) | KSG | hard block |
| Missing required frontmatter (`type`, `status`, `title`) | KSG | hard block |
| Promote order (`inbox → drafts → published`) | KSG | hard block |
| Cross-tenant write (another profile writing here) | DSG | hard block |
| Schema conformance (record-family schema) | DSG | hard block |
| Partial-confidence write | DSG | reconcile candidate |

Every gated action writes a `metadata_audit` row (sixth invariant).

## 2. Read-time scanner (cadenced)

The scanner runs over already-committed pages and surfaces drift the gate
cannot catch at write time. Findings, by severity:

| Finding | Severity | Meaning |
|---|---|---|
| Broken wikilink | important | a `[[target]]` no longer resolves |
| Missing frontmatter | important | a committed page lacks `type`/`status` |
| Orphan page | info | no inbound link (entry pages exempt) |

Severity rollup: **important** if any broken link or missing frontmatter,
**info** if only orphans, **clean** otherwise.

When findings are non-clean, the scanner memorializes an `integrity_findings`
output + `integrity_scan` event into the profile Brain (best-effort) and writes
an `integrity_scan` audit row. Findings surface in the engagement
deployment-notes panel for operator review.

### Cadence

`runIntegrityScanAllProfiles()` is the cron entry (mirrors the comms cron).
Run it on a cadence (e.g. hourly) inside the studio container:

```
0 * * * * docker exec $(docker ps --format '{{.Names}}' | grep -m1 '^hermes-studio-') \
            npx tsx scripts/integrity-cron.ts >> /tmp/integrity-cron.log 2>&1
```

## 3. Recovery branches

- **Broken link / missing frontmatter.** Important finding → operator (or the
  owning agent) fixes the source page; next scan clears it.
- **Orphan page.** Advisory → link it from a hub page or archive it.
- **Reconcile candidate (DSG).** Operator approves or rejects from
  `/engagements/<profile>`. On approval, canon updates and pending writes
  re-evaluate; on rejection, the write is final-rejected with an audit row.
- **Cross-tenant attempt.** Hard-rejected at the gate; pen-test verified.
