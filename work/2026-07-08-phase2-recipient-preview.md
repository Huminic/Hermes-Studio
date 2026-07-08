# Phase 2 — Recipient list preview (for operator review BEFORE any real send)

**Generated:** 2026-07-08 ~19:44 UTC (live VIN read, read-only, NO sends). serra-honda
(org 24d64f99…). These are dry-run counts for review. The authoritative per-recipient
list (names + phones) is produced by running each script `--profile serra-honda` (dry-run,
no `--send`) INSIDE the container once the branch is deployed — that also applies phone
resolution, the exclude filter, and the dedup ledger before you approve `--send`.

## Script A — IMMEDIATE lead-engagement (today's NEW, not-yet-followed-up)
- **Recipients now: 0.**
- Today (since 00:00 CT) has **5** ACTIVE leads, but **none are `ACTIVE_NEW_LEAD`** — all 5
  are `CONTACTED`/`WAITING` (leadGroupCategory), i.e. the BDC already worked them today.
- This is the intended behavior: the immediate after-hours text targets leads that arrive
  and are NOT worked (nights/overnight). It populates outside staffed hours; the 8am and
  6–8pm windows drain that overnight backlog. Expect a non-zero list overnight, ~0 during a
  fully-staffed day.
- Exclude (Vapi/Tavus): 0 impact observed — agent leads don't enter the VIN feed; the
  hub cross-ref runs at send time regardless.

## Script B — 24-HOUR FOLLOW-UP (last 7 days, ACTIVE, 24h anniversary passed)
- **Due now: 83** (of 104 ACTIVE leads in the 07-01 → 07-08 window; 21 arrived in the last
  24h and become due on a rolling basis).
- Breakdown of the 83 due, by lead type:

  | Lead type | Due |
  |---|---|
  | INTERNET | 43 |
  | PHONE | 17 |
  | WALK_IN | 10 |
  | **SERVICE** | **13** |
  | **Sales-type (INTERNET+PHONE+WALK_IN)** | **70** |

- ⚠️ **Decision for review:** the follow-up automation is **Caroline (sales)**. Script B
  currently includes all `leadStatusType=ACTIVE` leads, so it would send a sales follow-up
  to **13 SERVICE leads**. If you want sales-only, the list is **70**; say so and I'll add a
  `leadType` sales-only filter to Script B (one-line, default per your "all leads" rule).
- Final count will be slightly lower after dropping leads with no valid mobile
  (`isValidSmsE164`) and (on re-runs) anyone already in the dedup ledger.

## Safety at send time (unchanged)
- Dry-run by default; `--send` still passes the full comms-gate (kill switch, prelaunch
  allowlist, blacklist/STOP, window, rate limit).
- First live step = self-test behind `PRELAUNCH_SMS_LOCK` to your number only.
- No real-customer send until your explicit GO.
