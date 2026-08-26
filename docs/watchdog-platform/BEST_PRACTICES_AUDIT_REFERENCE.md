# Best-Practices Audit Reference — Dealership SALES Performance

**Scope:** New/used vehicle SALES performance only. Excludes fixed ops (service, parts, F&I product margin except where it feeds total gross).
**Purpose:** Cited benchmark reference feeding the "custom report: audit vs best practices" generator.
**Compiled:** 2026-08-26.

## How to read this document

- Every benchmark carries a source URL. Numbers that could not be sourced are marked **`unsourced — needs a benchmark`** rather than invented.
- Automotive benchmarks are **noisy and contested**. Lead-source mix, brand, market, measurement window, and de-duplication method all move the numbers. Where the industry disagrees, that is stated explicitly.
- Audit findings should be phrased **tentatively** (e.g. "appears below the typical range — worth a look"), never as hard verdicts. The platform is flagging things for a human to review, not grading them.
- The **metric slug** column maps each benchmark to our catalog so the generator can wire a finding to live data. A slug of `—` means no direct catalog metric exists yet.

---

## 1. Speed-to-Lead / Lead Response Time

The single most consistently cited number in the industry: respond within **5 minutes**. Effect sizes vary wildly by study and should be treated as directional, not precise.

| Metric | Benchmark / target | Metric slug | Source |
|---|---|---|---|
| First-response target | Within **5 minutes** of lead arrival | `—` | [DealerPulse](https://dealerpulse.net/how-fast-should-dealerships-respond-to-leads/), [SocialVik](https://www.socialvik.com/blog/5-minute-lead-response-rule-auto-dealership) |
| Conversion lift vs. 30-min response | ~**9x** higher when responding in 5 min vs 30 min (directional) | `cage.deals_from_leads` | [Demand Local — speed-to-lead stats](https://www.demandlocal.com/blog/speed-to-lead-impact-statistics/) |
| "First to respond wins" | ~**78%** of buyers purchase from whoever responds first | `cage.total_comms` | [Demand Local](https://www.demandlocal.com/blog/speed-to-lead-impact-statistics/), [Hyperleap](https://hyperleap.ai/blog/auto-dealerships-lose-buyers-after-hours) |
| Actual industry performance (the gap) | ~**78%** of leads get first response after 30 min; ~**32%** never answered; average dealer ~**47 hours** to respond | `engagement.reply_rate` | [Demand Local](https://www.demandlocal.com/blog/speed-to-lead-impact-statistics/) |

**Contested / caveats:** The headline multipliers ("21x more likely to qualify", "391% lift under 1 minute") trace back to older lead-response research (InsideSales/Lead Response Management study) recycled across vendor blogs. Treat the *direction* (faster is materially better) as well-established and the *exact multiplier* as marketing-inflated. The 5-minute target itself is near-universal.

**How to phrase the audit finding:** *"Median first-response time appears to sit above the ~5-minute industry target — worth a look, since studies consistently associate faster response with materially higher contact and conversion rates."*

---

## 2. Appointment Show Rate & No-Show Rate

Show rate depends heavily on lead source and on whether the appointment was confirmed. Ranges are wide.

| Metric | Benchmark / target | Metric slug | Source |
|---|---|---|---|
| Sales appointment show rate (realistic) | **50–65%**; **70%+** excellent | `appt.show_rate` | [Demand Local — appointment/show-rate stats](https://www.demandlocal.com/blog/appointment-setting-show-rate-statistics/) |
| Internet-led appointment show rate | Typically **40–80%**, clustered in the lower half; should be **well over 40%** | `appt.show_rate` | [Demand Local](https://www.demandlocal.com/blog/appointment-setting-show-rate-statistics/) |
| No-show rate (implied sales) | ~**35–50%** of set appointments no-show at typical show rates (derived from show-rate range, not a directly published sales figure) | `appt.no_show_rate` | Derived from [Demand Local](https://www.demandlocal.com/blog/appointment-setting-show-rate-statistics/) |
| Service no-show rate (reference only — NOT sales) | ~**20%** industry average | `appt.no_show_rate` | [Demand Local](https://www.demandlocal.com/blog/appointment-setting-show-rate-statistics/) |
| Confirmation practice impact | Same-day text + morning-of reminder = highest-impact lever on show rate | `appt.confirmed_rate` | [Demand Local](https://www.demandlocal.com/blog/appointment-setting-show-rate-statistics/) |

**Contested / caveats:** A clean, widely-agreed **sales-appointment no-show** benchmark is weak in public sources; the ~20% figure that circulates is a **service** number and should not be applied to sales. The sales no-show figure above is *derived* from the published show-rate range, so treat it as an estimate. No sourced public benchmark was found for `appt.cancel_rate` specifically — **`unsourced — needs a benchmark`**.

**How to phrase the audit finding:** *"Appointment show rate appears below the ~50–65% range typically seen for healthy sales BDCs — worth reviewing confirmation cadence (same-day text plus a morning-of reminder is the most-cited lever)."*

---

## 3. Lead-to-Appointment & Lead-to-Sale Conversion

Set rates split sharply by channel: phone leads convert to appointments roughly double internet leads.

| Metric | Benchmark / target | Metric slug | Source |
|---|---|---|---|
| Phone-lead appointment set rate | ~**74–75%** | `cage.deals_from_leads` | [Foureyes — appointment set rates](https://www.foureyes.io/blog/dealership-appointment-set-rates), [Demand Local](https://www.demandlocal.com/blog/lead-to-sale-conversion-statistics/) |
| Internet-lead appointment set rate | ~**40%** | `cage.deals_from_leads` | [Foureyes](https://www.foureyes.io/blog/dealership-appointment-set-rates), [Demand Local](https://www.demandlocal.com/blog/lead-to-sale-conversion-statistics/) |
| Lead-to-sale conversion (overall) | ~**2–10%** depending on source & method; industry avg ~**2.0%**, top performers ~**15.7%** | `roi.sold_from_leads` | [Demand Local — lead-to-sale stats](https://www.demandlocal.com/blog/lead-to-sale-conversion-statistics/) |
| Leads per sold vehicle | ~**3.5 leads per sale** (Q1 2024) | `roi.total_leads` / `gross.total_sum` | [Demand Local](https://www.demandlocal.com/blog/lead-to-sale-conversion-statistics/) (attrib. Foureyes) |

**Contested / caveats:** "Conversion rate" is defined inconsistently — website-visitor-to-lead (~3–5%) vs. lead-to-sale (~2–10%) vs. 30-day close rate (Section 4) are *different denominators* and are routinely conflated across sources. Always confirm the denominator before flagging.

**How to phrase the audit finding:** *"Internet lead-to-appointment rate appears below the ~40% level commonly reported — and well below the ~75% seen on phone leads — which may point to response speed or first-contact quality rather than lead volume."*

---

## 4. Sold-From-Leads % / Internet Lead Close Rate

The most reliable single figure here is Foureyes' cross-dealer **30-day close rate of 16.2%** (all sources blended). Isolated internet close rates run much lower.

| Metric | Benchmark / target | Metric slug | Source |
|---|---|---|---|
| Overall 30-day close rate (all lead sources) | **16.2%** | `roi.sold_from_leads` | [Foureyes — 30-day close rate study](https://www.foureyes.io/blog/30-day-dealer-close-rate) |
| Internet-lead close rate (isolated) | ~**6%** 30-day (Urban Science); third-party leads often **8–12%** (NADA-cited) | `roi.sold_from_leads` | [Demand Local](https://www.demandlocal.com/blog/lead-to-sale-conversion-statistics/) (attrib. Urban Science); [Rework](https://resources.rework.com/libraries/automotive-sales-growth/internet-close-rate-metrics) |
| Phone-lead close rate | ~**14%** 30-day | `roi.sold_from_leads` | [Demand Local](https://www.demandlocal.com/blog/lead-to-sale-conversion-statistics/) (attrib. Urban Science) |
| Showroom / walk-in close rate | ~**25%** 30-day; walk-ins close fastest (~83.7% of their sales in first 3 days) | `roi.sold_from_leads` | [Demand Local](https://www.demandlocal.com/blog/lead-to-sale-conversion-statistics/) (Urban Science); [Foureyes](https://www.foureyes.io/blog/30-day-dealer-close-rate) |
| Owned-channel close (website/database) | ~**15–25%** organic; **30%+** for database/email audiences | `roi.sold_from_leads` | [Rework](https://resources.rework.com/libraries/automotive-sales-growth/internet-close-rate-metrics) |
| Early-window effect | Close rate ~**12.4%** in first 3 days, collapsing to ~**2.3%** on days 4–7 | `cage.deals_from_leads` | [Foureyes](https://www.foureyes.io/blog/30-day-dealer-close-rate) |

**Contested / caveats:** Numbers swing with the **measurement window** (30-day vs 90-day), with de-duplication, and with whether "internet lead" includes chat/text/phone-from-web. The Urban Science channel splits (6/14/25%) and the Foureyes blended 16.2% are internally consistent — internet is the *hardest* channel and drags the blended average down. Do not compare a dealer's internet-only close rate against the 16.2% blended figure.

**How to phrase the audit finding:** *"Sold-from-leads appears toward the low end of the range for its channel mix — worth checking against the appropriate benchmark (internet leads ~6–12% vs. a ~16% blended 30-day close), since a heavy internet mix naturally pulls this down."*

---

## 5. Front / Back / Total Gross Per Unit

**High variance — the most contested area in this document.** Figures move by brand tier, franchise vs. independent, public vs. private group, and rapidly year over year. Treat all numbers as *reference points*, not thresholds. NADA's official Annual Financial Profile is the authoritative primary source but is not machine-readable in this pass; figures below come from Haig Partners and Cox/Presidio-NCM reporting and secondary summaries of NADA.

| Metric | Benchmark / typical range | Metric slug | Source |
|---|---|---|---|
| New-vehicle gross per unit (front, public groups) | ~**$3,298** PVR (Q4 2024, public dealers) | `gross.total_sum` | [Haig Partners Q4 2024](https://haigpartners.com/resources/q4-2024-haig-report-insights-new-vehicle-gross-profits-rise-for-first-time-in-two-years/) |
| New-vehicle gross — luxury segment | ~**$5,679** avg (2024) | `gross.total_sum` | [Auto News / NADA snapshot 2024](https://www.autonews.com/events/nada-show/an-nada-dealership-profitability-snapshot-2024/) |
| Used-vehicle gross per unit | ~**$1,400–$1,630** (2024→2025; settled to ~2019 levels) | `gross.total_sum` | [Haig Partners — used vehicle profits Q2 2025](https://haigpartners.com/resources/used-vehicle-profits-steady-in-q2-2025-what-it-means-for-dealers-planning-their-next-move/) |
| F&I income per vehicle retailed (back-end) | ~**$1,581** (2024) | `gross.total_sum` | [Auto News / NADA snapshot 2024](https://www.autonews.com/events/nada-show/an-nada-dealership-profitability-snapshot-2024/) |
| Total gross per unit (front + back) | **`unsourced — needs a benchmark`** — no single clean published "total gross PVR" figure was found; sum of front + F&I above is an approximation, not a citation | `gross.total_sum` | — |

**Contested / caveats:** These are among the fastest-moving numbers in retail auto. New-vehicle front gross **spiked** during the 2021–2022 inventory shortage and has been **compressing back toward pre-pandemic levels** through 2024–2025; any static benchmark will drift. Brand tier alone can 2–3x the front-gross figure (mainstream vs. luxury). **Recommendation:** for gross, the audit should compare a dealer against *its own trend and its brand cohort*, not a fixed industry number. Where possible, replace the secondary figures above with the current NADA Annual Financial Profile (primary source; requires a text-extractable copy).

**How to phrase the audit finding:** *"Total gross per unit appears below reference ranges, but gross is highly brand- and market-dependent and has been compressing industry-wide since 2022 — this is best read as a trend signal against the dealer's own history, not a pass/fail against a fixed number."*

---

## 6. Communication Cadence / Follow-Up

The core rules: **6+ attempts minimum**, **multi-channel**, sustained over **~10–14 days**. Specific touch counts vary by source; the *shape* (persistent, multi-channel, front-loaded) is well-agreed.

| Metric | Benchmark / target | Metric slug | Source |
|---|---|---|---|
| Minimum contact attempts | **At least 6**; ~80% of sales need **5+** follow-ups; ~44% of reps quit after 1 | `cage.total_comms` | [SPOTIO](https://spotio.com/blog/sales-follow-ups/), [Strolid](https://strolid.com/learn/multi-channel-lead-follow-up-email-sms-phone-strategy) |
| Automotive multi-channel cadence | **~15–20 touchpoints over 10–14 days** before "unresponsive": ~6–8 calls, 4–5 emails, 5–6 texts | `cage.total_comms` | [Strolid](https://strolid.com/learn/multi-channel-lead-follow-up-email-sms-phone-strategy) |
| Multi-channel vs email-only | Multi-channel cadences ~**287%** higher reply rate (directional, vendor-reported) | `engagement.reply_rate` | [Strolid](https://strolid.com/learn/multi-channel-lead-follow-up-email-sms-phone-strategy) |
| First touch timing | Within **5 minutes** of lead arrival (see Section 1) | `—` | [SPOTIO](https://spotio.com/blog/sales-follow-ups/) |

**Contested / caveats:** The "15–20 touches" automotive figure is more aggressive than general-B2B guidance (~8–12 touches over 14–21 days) and comes from a vendor blog — treat it as an upper-bound target, not a floor. The 287% reply-rate lift is vendor-reported and directional. The consistent, defensible core is: **persist to at least 6 attempts across at least 2–3 channels, front-loaded in the first 3 days** (reinforced by the Section 4 early-window collapse after day 3).

**How to phrase the audit finding:** *"Average attempts per lead appear below the 6-attempt floor most sources cite, and follow-up looks single-channel — worth a look, since multi-channel, persistent cadences are consistently associated with higher reply and contact rates."*

---

## 7. CRM Lead-Source ROI & Duplicate-Lead Rate

Duplicates are the big hidden distortion: a large share of "leads" are the same shopper across multiple portals.

| Metric | Benchmark / target | Metric slug | Source |
|---|---|---|---|
| Duplicate-lead rate | ~**30–40%** of dealership leads are duplicates | `roi.duplicate_rate` | [Rework — third-party lead providers](https://resources.rework.com/libraries/automotive-sales-growth/third-party-lead-providers) |
| Third-party vs. owned lead-to-appt | Third-party ~**8–12%**; owned channels ~**25–35%** | `roi.total_leads` / `cage.deals_from_leads` | [Rework](https://resources.rework.com/libraries/automotive-sales-growth/third-party-lead-providers) |
| Effective cost inflation from duplicates | A nominal ~$175/lead can effectively cost **$250–280** once duplicates/bad-fit are stripped (~60% premium) | `roi.total_leads` | [Rework](https://resources.rework.com/libraries/automotive-sales-growth/third-party-lead-providers) |
| Average lead cost (reference) | ~**$283** avg automotive lead cost | `roi.total_leads` | [Rework](https://resources.rework.com/libraries/automotive-sales-growth/third-party-lead-providers) |

**Contested / caveats:** The 30–40% duplicate figure is vendor-reported and depends entirely on **how aggressively the CRM de-dupes** (same person, multiple portals, within some window). No neutral, audited industry duplicate-rate benchmark was found — treat 30–40% as a plausible planning range, not a certified norm. A clean, source-backed **cost-per-sale-by-source** ROI norm was **not** located — **`unsourced — needs a benchmark`** for a definitive per-source ROI target.

**How to phrase the audit finding:** *"Duplicate-lead rate appears elevated relative to the ~30–40% range vendors report — worth confirming CRM de-duplication is running, since duplicates inflate lead cost and distort per-source ROI."*

---

## 8. After-Hours / Speed Coverage

A majority of leads arrive when the store is closed, and most stores don't cover them — a large, consistent gap.

| Metric | Benchmark / target | Metric slug | Source |
|---|---|---|---|
| Share of leads arriving after hours | ~**45–60%** (commonly cited: **53%** outside 9am–6pm; **56%** after business hours; **38%+** after 7pm) | `cage.total_comms` | [Visquanta](https://www.visquanta.com/blog/53-dealer-leads-arrive-after-hours-nobody-answers), [Hyperleap](https://hyperleap.ai/blog/auto-dealerships-lose-buyers-after-hours) |
| After-hours response coverage (actual) | Only ~**37%** of dealers respond to after-hours leads within even 1 hour | `engagement.reply_rate` | [Hyperleap](https://hyperleap.ai/blog/auto-dealerships-lose-buyers-after-hours) |
| Implied target | Effectively **24/7 coverage** (auto-responder/AI/BDC) given the volume above — no single "official" SLA number exists | `comm.inbound_high_intent_keywords` | Derived from [Visquanta](https://www.visquanta.com/blog/53-dealer-leads-arrive-after-hours-nobody-answers) |

**Contested / caveats:** The after-hours share is reported in a band (45–60%); the exact number depends on how "after hours" is defined (store hours vs. a fixed 9–6 window). All figures here are vendor/marketing sources — directionally consistent across many publishers, but none is a neutral audited benchmark. There is **no published "official" after-hours response SLA**; the 24/7 target is an inference from lead-volume data. Catalog slugs `comm.escalation_keyword_screen` and `comm.inbound_high_intent_keywords` support *detecting* high-intent after-hours contacts but have **no external benchmark value** — **`unsourced — needs a benchmark`** if a numeric target is required.

**How to phrase the audit finding:** *"A large share of leads appear to arrive after hours with limited coverage — worth a look, since roughly half of leads land outside store hours and most stores respond slowly or not at all overnight."*

---

## Metric-Slug Coverage Map

| Slug | Covered by section(s) | Has an external numeric benchmark? |
|---|---|---|
| `appt.show_rate` | 2 | Yes (~50–65%) |
| `appt.no_show_rate` | 2 | Partial — sales figure derived, not directly published |
| `appt.confirmed_rate` | 2 | Qualitative only (confirmation = top lever) |
| `appt.cancel_rate` | 2 | **No — unsourced, needs a benchmark** |
| `roi.total_leads` | 3, 7 | Yes (3.5 leads/sale; cost ~$283) |
| `roi.sold_from_leads` | 3, 4 | Yes (16.2% blended; 6–25% by channel) |
| `roi.duplicate_rate` | 7 | Yes but vendor-reported (~30–40%) |
| `gross.total_sum` | 5 | Partial — high variance; total gross PVR unsourced |
| `cage.total_comms` | 1, 6, 8 | Yes (6+ attempts; 15–20 touches) |
| `cage.deals_from_leads` | 1, 3, 4 | Yes (set/close rates) |
| `comm.escalation_keyword_screen` | 8 | **No external benchmark** (detection feature) |
| `comm.inbound_high_intent_keywords` | 8 | **No external benchmark** (detection feature) |
| `engagement.reply_rate` | 1, 6, 8 | Partial — comparative lifts, not an absolute target |

---

## Sources cited

- Demand Local — speed-to-lead impact statistics: https://www.demandlocal.com/blog/speed-to-lead-impact-statistics/
- Demand Local — lead-to-sale conversion statistics: https://www.demandlocal.com/blog/lead-to-sale-conversion-statistics/
- Demand Local — appointment setting & show-rate statistics: https://www.demandlocal.com/blog/appointment-setting-show-rate-statistics/
- Foureyes — 30-day close rate study: https://www.foureyes.io/blog/30-day-dealer-close-rate
- Foureyes — appointment set rate benchmarks: https://www.foureyes.io/blog/dealership-appointment-set-rates
- Rework — internet close-rate metrics: https://resources.rework.com/libraries/automotive-sales-growth/internet-close-rate-metrics
- Rework — third-party lead providers (cost & ROI): https://resources.rework.com/libraries/automotive-sales-growth/third-party-lead-providers
- Strolid — multi-channel lead follow-up: https://strolid.com/learn/multi-channel-lead-follow-up-email-sms-phone-strategy
- SPOTIO — sales follow-up strategies: https://spotio.com/blog/sales-follow-ups/
- DealerPulse — how fast should dealerships respond: https://dealerpulse.net/how-fast-should-dealerships-respond-to-leads/
- SocialVik — 5-minute lead response rule: https://www.socialvik.com/blog/5-minute-lead-response-rule-auto-dealership
- Visquanta — 53% of dealer leads arrive after hours: https://www.visquanta.com/blog/53-dealer-leads-arrive-after-hours-nobody-answers
- Hyperleap — dealerships lose buyers after hours: https://hyperleap.ai/blog/auto-dealerships-lose-buyers-after-hours
- Haig Partners — Q4 2024 report (new-vehicle gross): https://haigpartners.com/resources/q4-2024-haig-report-insights-new-vehicle-gross-profits-rise-for-first-time-in-two-years/
- Haig Partners — used-vehicle profits Q2 2025: https://haigpartners.com/resources/used-vehicle-profits-steady-in-q2-2025-what-it-means-for-dealers-planning-their-next-move/
- Automotive News / NADA profitability snapshot 2024: https://www.autonews.com/events/nada-show/an-nada-dealership-profitability-snapshot-2024/
- NADA — 2025 Annual Financial Profile (primary source; not text-extractable this pass): https://www.nada.org/media/4695/download?inline=

## Known sourcing gaps (truth over completeness)

1. **Sales appointment no-show rate** — no clean *sales-specific* published benchmark; the ~20% figure that circulates is a **service** number. Sales no-show above is derived from show-rate range.
2. **`appt.cancel_rate`** — no external benchmark located.
3. **Total gross PVR (front + back combined)** — no single clean published figure; only front and F&I separately, both high-variance. NADA primary source not machine-readable this pass.
4. **Per-lead-source cost-per-sale ROI norm** — no neutral audited target located; only vendor cost/close-rate figures.
5. **After-hours response SLA** — no official numeric standard exists; 24/7 target is inferred from lead-volume data.
6. Several cited multipliers (9x, 21x, 287%, 391%) are **vendor-reported and directional**, several tracing to a single older lead-response study. Direction is reliable; exact magnitude is not.
