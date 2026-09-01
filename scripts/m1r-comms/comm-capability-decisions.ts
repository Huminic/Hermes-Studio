/**
 * Gate 4C1 — AUTHORITATIVE per-ID capability decision table for the enhanced weekly
 * Communication Log family. ONE intentional record for EVERY SW-001..SW-295, as a LITERAL
 * TUPLE ARRAY (`DECISIONS_TABLE`) — NOT a Record — so duplicate ids cannot be silently
 * overwritten. `validateAndIndex` fails closed on a wrong length, ANY duplicate id (array
 * length vs Set + explicit identification), any missing/extra/out-of-range id, then builds the
 * lookup Map. The generator uses that validator; it decides nothing. Routing
 * (`join_or_nlp_required`) is truthful per id (Service vs compliance vs cross-rooftop vs
 * external). Nothing here promotes any metric.
 */

export type Category =
  | 'definition_compatible_now'
  | 'semantic_definition_pending'
  | 'nlp_content_capable_pending'
  | 'unsupported_field'
  | 'insufficient_history'
  | 'other_source_or_join'
  | 'outside_sales_boundary'

export type Dec = {
  c: Category
  fields?: Array<string>
  missing: string
  history?: string
  join: string
  why: string
  external_required_input?: string
}

export const ONE_WEEK =
  '1 governed week (2026-08-24..2026-08-30, America/New_York)'

// Reusable authoring helpers (they only shape a hand-chosen category + route; never decide it).
const nlp = (missing: string, why: string): Dec => ({
  c: 'nlp_content_capable_pending',
  missing,
  join: 'NLP on Message Content',
  why,
})
const other = (missing: string, why: string): Dec => ({
  c: 'other_source_or_join',
  missing,
  join: 'join to another family/source',
  why,
})
const unsup = (missing: string, why: string): Dec => ({
  c: 'unsupported_field',
  missing,
  join: 'derivative field extension',
  why,
})
const hist = (missing: string, why: string): Dec => ({
  c: 'insufficient_history',
  missing,
  join: 'multi-week history',
  history: '> 1 week (multi-week history)',
  why,
})
const bound = (why: string, route: string): Dec => ({
  c: 'outside_sales_boundary',
  missing: 'Sales boundary',
  join: route,
  why,
})
// Narrow, truthful boundary routes.
const svc = (why: string): Dec => bound(why, 'separate Service workspace route')
const comp = (why: string): Dec => bound(why, 'compliance authorization route')
const xroof = (why: string): Dec =>
  bound(why, 'separate cross-rooftop governed route')
const extb = (why: string): Dec =>
  bound(why, 'separate external governed source/route')
const pend = (
  fields: Array<string>,
  missing: string,
  why: string,
  extra?: Partial<Dec>,
): Dec => ({
  c: 'semantic_definition_pending',
  fields,
  missing,
  join: 'none (ratified semantic definition only)',
  why,
  history: ONE_WEEK,
  ...extra,
})

/** The authoritative decision table: exactly one [id, decision] tuple per SW-001..SW-295. */
export const DECISIONS_TABLE: Array<[string, Dec]> = [
  // §1 Lead Intake & Source Quality
  [
    'SW-001',
    hist(
      'trailing-4-week source volume',
      'WoW-vs-trailing-4-week volume needs multi-week history',
    ),
  ],
  [
    'SW-002',
    unsup(
      'phone/email dedup fields',
      'duplicate-lead detection needs phone/email identity absent from the family',
    ),
  ],
  [
    'SW-003',
    unsup(
      'phone + email fields',
      'no phone/email column exists in the 24-col family',
    ),
  ],
  [
    'SW-004',
    other(
      'third-party ROI (gross/lead cost)',
      'provider ROI needs cost + gross external to communications',
    ),
  ],
  [
    'SW-005',
    other(
      'lead-source attribution mapping',
      'new-source attribution is a lead-source/attribution metric',
    ),
  ],
  [
    'SW-006',
    hist(
      'MoM source close rate',
      'source close rate month-over-month needs deal outcomes + multi-month history',
    ),
  ],
  [
    'SW-007',
    unsup(
      'phone/email validity fields',
      'invalid-phone/disposable-email checks need phone/email data absent from the family',
    ),
  ],
  [
    'SW-008',
    other(
      'appointment set counts by source',
      'lead-to-appointment ratio is an appointment metric',
    ),
  ],
  [
    'SW-009',
    other(
      'paid-source cost + gross',
      'cost-per-sold vs gross is an external ROI metric',
    ),
  ],
  [
    'SW-010',
    other(
      'OEM co-op volume + spend',
      'OEM co-op is an external marketing metric',
    ),
  ],
  // §2 Speed-to-Lead & First Response
  [
    'SW-011',
    other(
      'lead-origination first-touch (Leads family)',
      'median time-to-first-touch is evaluated via the Leads family and needs origination time',
    ),
  ],
  [
    'SW-012',
    other(
      'lead origination time + staffing/business-hours context',
      '"untouched >30 min during staffed hours" needs lead-origination + staffing; already evaluated via the Leads family (SW-012). Not merely NLP.',
    ),
  ],
  [
    'SW-013',
    other(
      'lead-origination + after-hours calendar',
      'after-hours no-response needs origination time + hours, not in this family',
    ),
  ],
  [
    'SW-014',
    nlp(
      'auto-reply vs human classification',
      'distinguishing an auto-reply needs content/automation semantics',
    ),
  ],
  [
    'SW-015',
    other(
      'lead-origination first-response (Leads family)',
      'first-response time is already evaluated via the accepted Leads family (SW-015); this family does not supersede it and lacks Lead Created Date',
    ),
  ],
  [
    'SW-016',
    other(
      'SLA + origination + holiday calendar',
      'weekend/holiday SLA breach needs origination + a holiday calendar',
    ),
  ],
  [
    'SW-017',
    unsup(
      'Lead Created Date (origination time)',
      '"within 5 min of the lead" needs lead-origination time; the derivative emits comm timestamps only',
    ),
  ],
  [
    'SW-018',
    other(
      'external chat transcripts',
      'chat abandonment is an external chat-system metric',
    ),
  ],
  // §3 Sales Rep Activity & Communication Behavior
  [
    'SW-019',
    pend(
      ['rep_token', 'direction', 'channel', 'activity_date'],
      'zero-activity-day firing + rep population',
      'outbound Logged Call counts per rep per calendar day exist; "2 consecutive days" is WITHIN one week, not multi-week',
      { history: '1 governed week containing >= 2 eligible adjacent days' },
    ),
  ],
  [
    'SW-020',
    unsup(
      'call talk-time/duration',
      'talk-time-per-lead needs call duration, not a derivative field',
    ),
  ],
  [
    'SW-021',
    nlp(
      'message-body similarity',
      '"identical templated message" needs content comparison',
    ),
  ],
  [
    'SW-022',
    pend(
      ['rep_token', 'channel', 'direction'],
      'min-call denominator + directionality',
      'per-rep Text/Logged-Call counts exist; the small-sample guard + directionality are choices',
    ),
  ],
  [
    'SW-023',
    other(
      'CRM status-change attribution',
      'who marked leads bad/lost is a CRM status event, not a comm event',
    ),
  ],
  [
    'SW-024',
    other(
      'open-lead status + aging',
      '"open lead untouched >72h" needs the lead open-status/aging from CRM',
    ),
  ],
  [
    'SW-025',
    unsup(
      'CRM login events',
      'CRM login is not a communication and is not a derivative field',
    ),
  ],
  [
    'SW-026',
    pend(
      ['rep_token', 'has_video'],
      '"personalized media" scope + peer basis',
      'has_video per rep exists; the media scope and peer comparison are choices',
    ),
  ],
  [
    'SW-027',
    other(
      'CRM handoff note',
      'BDC-to-floor handoff notes are CRM records, not comm events',
    ),
  ],
  [
    'SW-028',
    unsup(
      'email open tracking',
      'outbound email open rate needs open tracking, absent',
    ),
  ],
  [
    'SW-029',
    nlp(
      'outbound sentiment trend',
      'negative/pushy sentiment needs message content',
    ),
  ],
  [
    'SW-030',
    nlp(
      'complaint content naming rep',
      'rep named in a complaint needs message content',
    ),
  ],
  // §4 Pipeline Health & Funnel Dynamics
  [
    'SW-031',
    other(
      'appointment set + leads (Dashboard family)',
      'lead-to-appointment set rate is evaluated via the Dashboard family',
    ),
  ],
  [
    'SW-032',
    other(
      'appointment show (Appointments family)',
      'appointment show rate is evaluated via the Appointments family',
    ),
  ],
  [
    'SW-033',
    other(
      'appointment show + write-up counts',
      'show-to-write rate is an appointment/deal metric (evaluated via the Dashboard family, SW-033); not a communication field extension',
    ),
  ],
  [
    'SW-034',
    other(
      'write-up + close (deal) counts',
      'write-to-close is a deal metric; needs the deal family, not communications',
    ),
  ],
  [
    'SW-035',
    hist(
      '90-day funnel baseline',
      'funnel conversion vs 90-day baseline needs history',
    ),
  ],
  [
    'SW-036',
    other(
      'pipeline open-lead aging',
      'pipeline aging is a CRM pipeline metric',
    ),
  ],
  [
    'SW-037',
    other(
      'pipeline composition',
      'hot-leads-% of pipeline is a pipeline metric',
    ),
  ],
  [
    'SW-038',
    other('CRM stage transitions', 'stage skipping needs CRM stage history'),
  ],
  [
    'SW-039',
    other('CRM stage dwell', 'stuck-in-working needs CRM stage timing'),
  ],
  [
    'SW-040',
    other(
      'CRM stage transitions',
      'backwards stage movement needs CRM stage history',
    ),
  ],
  // §5 Appointment & Showroom Metrics
  [
    'SW-041',
    other(
      'appointment no-show (Appointments family)',
      'no-show rate is evaluated via the Appointments family',
    ),
  ],
  [
    'SW-042',
    other(
      'appointment confirmation',
      'confirmed-appt rate is an appointment metric',
    ),
  ],
  [
    'SW-043',
    hist(
      '3-week appt trend',
      'same-day set rate declining 3 weeks needs multi-week history',
    ),
  ],
  [
    'SW-044',
    other(
      'appointment times + operating hours',
      'appts outside hours is an appointment metric',
    ),
  ],
  [
    'SW-045',
    other(
      'be-backs/initial visits (Dashboard family)',
      'be-back ratio is evaluated via the Dashboard family',
    ),
  ],
  [
    'SW-046',
    other(
      'demo/total visits (Dashboard family)',
      'test-drive completion is evaluated via the Dashboard family',
    ),
  ],
  // §6 Deal & Desking Signals
  [
    'SW-047',
    other(
      'desking write-up-to-pencil timing',
      'desking timing is a deal/desking metric',
    ),
  ],
  ['SW-048', other('desking pencil count', 'pencil count is a desking metric')],
  [
    'SW-049',
    hist(
      'trailing-30-day gross',
      'gross-per-unit vs 30-day average needs history',
    ),
  ],
  [
    'SW-050',
    other(
      'front gross on new deals (CRM family)',
      'front-gross-negative is a deal metric (CRM family)',
    ),
  ],
  [
    'SW-051',
    other('F&I product penetration', 'F&I penetration is an F&I metric'),
  ],
  ['SW-052', other('F&I PVR', 'F&I PVR is an F&I metric')],
  ['SW-053', other('cash deals / F&I', 'cash-bypass-F&I is an F&I metric')],
  [
    'SW-054',
    other(
      'trade valuation vs book',
      'trade variance is a desking/trade metric',
    ),
  ],
  [
    'SW-055',
    other('deal jacket stips', 'missing stips is a deal-compliance/DMS metric'),
  ],
  [
    'SW-056',
    other(
      'DMS deal reconciliation',
      'rebate/incentive stacking is a DMS record (non-VinSolutions)',
    ),
  ],
  [
    'SW-057',
    other(
      'inventory age + vehicle-of-interest',
      'lead interest on aged units needs inventory + VOI data',
    ),
  ],
  // §7 Inventory & VOI Signals
  [
    'SW-058',
    other(
      'VOI sold vs lead state',
      'VOI sold-not-marked is an inventory/CRM hygiene metric',
    ),
  ],
  [
    'SW-059',
    other('inventory on lot', 'demand-vs-inventory is an inventory metric'),
  ],
  [
    'SW-060',
    other(
      'VIN-level lead coordination',
      'multiple leads same VIN is an inventory/CRM metric',
    ),
  ],
  [
    'SW-061',
    other(
      'inventory price changes',
      'price-drop-not-communicated is an inventory metric',
    ),
  ],
  [
    'SW-062',
    other('inventory turn rate', 'inventory turn is an inventory metric'),
  ],
  // §8 Marketing & Attribution
  [
    'SW-063',
    other(
      'campaign spend + volume',
      'campaign spend vs volume is a marketing metric',
    ),
  ],
  [
    'SW-064',
    other(
      'first-touch attribution',
      'attribution gaps is a marketing/attribution metric',
    ),
  ],
  [
    'SW-065',
    other(
      'landing-page conversion',
      'landing-page conversion is a web/marketing metric',
    ),
  ],
  ['SW-066', other('SEM cost-per-lead', 'SEM CPL is a marketing metric')],
  [
    'SW-067',
    other(
      'email unsubscribe rate',
      'unsubscribe rate is an ESP/marketing metric',
    ),
  ],
  [
    'SW-068',
    other(
      'review velocity/rating',
      'GBP reviews is an external reputation metric',
    ),
  ],
  [
    'SW-069',
    other(
      'OEM tier-3 compliance',
      'OEM compliance score is an external metric',
    ),
  ],
  // §9 Customer Communication Sentiment & Content
  [
    'SW-070',
    nlp(
      'inbound sentiment (NLP)',
      'negative-sentiment spike needs message content',
    ),
  ],
  [
    'SW-071',
    nlp('churn/competitor language', 'churn language needs message content'),
  ],
  [
    'SW-072',
    nlp(
      'objection detection',
      'price objection in first messages needs content',
    ),
  ],
  [
    'SW-073',
    nlp(
      'escalation-intent content',
      '"requests manager escalation" is a content signal',
    ),
  ],
  [
    'SW-074',
    nlp(
      'profanity/complaint keywords',
      'keyword detection needs message content',
    ),
  ],
  [
    'SW-075',
    nlp(
      'question repetition semantics',
      '"same ask 3+ times" needs message meaning',
    ),
  ],
  [
    'SW-076',
    pend(
      ['thread_token', 'direction', 'activity_iso'],
      '"grows" trend definition + latency clock',
      'within-thread customer->rep latencies exist; the trend definition + wall-clock-vs-business-hours choice are open',
    ),
  ],
  [
    'SW-077',
    nlp(
      '"high-intent message" semantics',
      'the trigger references message content',
    ),
  ],
  [
    'SW-078',
    nlp(
      'language detection',
      'detecting a Spanish-vs-English mismatch needs message language analysis',
    ),
  ],
  // §10 Service-to-Sales & Equity Mining (Service boundary)
  [
    'SW-079',
    svc('Service equity customers is Service-domain (Service-to-Sales)'),
  ],
  ['SW-080', svc('lease maturity + service sourcing is Service-to-Sales')],
  ['SW-081', svc('Service RO customer is Service-domain')],
  ['SW-082', svc('warranty/VSC is Service-domain')],
  ['SW-083', svc('declined service work is Service-domain')],
  // §11 BDC / Call Center Metrics
  [
    'SW-084',
    pend(
      ['user_group', 'channel', 'direction', 'interaction_result'],
      '"connect" definition + BDC population',
      'BDC user_group + call channel + interaction_result exist; mapping results to "connect" is a choice',
    ),
  ],
  [
    'SW-085',
    unsup(
      'call duration',
      'average call duration needs call-length, not a derivative field',
    ),
  ],
  [
    'SW-086',
    pend(
      [
        'thread_token',
        'channel',
        'direction',
        'interaction_result',
        'activity_iso',
      ],
      'voicemail definition + follow-up window',
      'outbound Answering-Machine result + thread follow-up timing exist; the definitions are choices',
    ),
  ],
  [
    'SW-087',
    other('BDC set-to-show', 'set-to-show divergence is an appointment metric'),
  ],
  [
    'SW-088',
    unsup(
      'call recording presence',
      'call-recording-logged is not a derivative field',
    ),
  ],
  [
    'SW-089',
    unsup(
      'phone/call-ANI identifier (a possible phone-system join)',
      '"same number" cannot be proven: person_token is derived from Global Customer ID, NOT a phone/call-ANI number; a telephony-system join would be required',
    ),
  ],
  // §12 Data Integrity & CRM Hygiene
  [
    'SW-090',
    other(
      'lead assignment + origination (Leads family)',
      'unassigned >2h is evaluated via the Leads family and needs assignment/origination',
    ),
  ],
  [
    'SW-091',
    unsup(
      'phone/email fields',
      'conflicting phone/email across profiles needs contact fields absent from the family',
    ),
  ],
  [
    'SW-092',
    other('CRM field completeness', 'CRM completeness is a CRM-hygiene metric'),
  ],
  [
    'SW-093',
    other(
      'delivery date logging',
      'sold-no-delivery-date is a deal/CRM metric',
    ),
  ],
  [
    'SW-094',
    other(
      'DMS deal record',
      'lead-status-sold vs DMS deal is a DMS reconciliation join',
    ),
  ],
  [
    'SW-095',
    other('CRM audit log', 'mass status changes is a CRM-audit metric'),
  ],
  [
    'SW-096',
    other('CRM closed-lost notes', 'empty-notes is a CRM-hygiene metric'),
  ],
  // §13 Compliance & Risk (compliance boundary)
  ['SW-097', comp('Do-Not-Call/Do-Not-Contact is a compliance condition')],
  ['SW-098', comp('TCPA consent is a compliance condition')],
  ['SW-099', comp('adverse-action notice is a compliance condition')],
  ['SW-100', comp('OFAC/Red-Flags is a compliance condition')],
  ['SW-101', comp('driver-license-on-file is a compliance condition')],
  ['SW-102', comp('privacy-policy consent is a compliance condition')],
  ['SW-103', comp('underage/ID-mismatch is a compliance condition')],
  ['SW-104', comp('Safeguards-Rule access log is a compliance condition')],
  // §14 Team / Managerial Dynamics
  [
    'SW-105',
    other(
      'lead assignment distribution',
      'premium-lead fairness is a routing metric',
    ),
  ],
  [
    'SW-106',
    other('lead reassignment', 'reassignment rate is a routing metric'),
  ],
  [
    'SW-107',
    other('desking overrides', 'manager overrides is a desking metric'),
  ],
  [
    'SW-108',
    hist(
      '30/60/90-day cohort close',
      'new-hire close rate needs deal outcomes + cohort history',
    ),
  ],
  [
    'SW-109',
    other(
      'rep activity baseline',
      'turnover-risk 50% activity drop needs a prior-activity baseline',
    ),
  ],
  [
    'SW-110',
    other('CRM ownership changes', 'poaching is a CRM ownership metric'),
  ],
  // §15 Cross-Functional / Second-Order
  [
    'SW-111',
    other(
      'volume + close composite',
      'rising-volume-falling-close needs deal outcomes',
    ),
  ],
  [
    'SW-112',
    other(
      'gross + volume composite',
      'falling-gross-rising-volume needs deal gross',
    ),
  ],
  [
    'SW-113',
    other('set + show composite', 'set-vs-show is an appointment metric'),
  ],
  [
    'SW-114',
    other('show + close composite', 'show-vs-close needs deal outcomes'),
  ],
  ['SW-115', other('sales + service CSI', 'CSI is an external survey source')],
  [
    'SW-116',
    other(
      'marketing spend + phone-ups',
      'spend-vs-phone-ups is a marketing metric',
    ),
  ],
  [
    'SW-117',
    other('BDC set + floor close', 'handoff friction needs appointment + deal'),
  ],
  [
    'SW-118',
    svc(
      'same customer across sales + SERVICE + complaint spans the Service boundary',
    ),
  ],
  [
    'SW-119',
    other(
      'weather/holiday traffic',
      'traffic anomaly needs external seasonality data',
    ),
  ],
  [
    'SW-120',
    other('competitor incentives', 'competitor launch is external market data'),
  ],
  // §16 Anomaly & Statistical Triggers
  [
    'SW-121',
    hist('trailing-30-day KPI mean', '2σ move needs the KPI series/baseline'),
  ],
  ['SW-122', hist('trailing KPI + hard SLA', '3σ/SLA needs the KPI series')],
  [
    'SW-123',
    hist(
      'KPI drift series',
      '3-consecutive-day drift needs the KPI baseline series',
    ),
  ],
  [
    'SW-124',
    hist('cohort baseline', 'cohort divergence needs prior-cohort history'),
  ],
  [
    'SW-125',
    other('multi-KPI correlation', 'decoupling needs multiple KPI families'),
  ],
  [
    'SW-126',
    other('segment KPI slices', 'segment anomaly needs multi-family KPIs'),
  ],
  [
    'SW-127',
    other(
      'alert-tier engine config',
      'tier alerts are an engine-config concern',
    ),
  ],
  [
    'SW-128',
    other('alert dedup engine', 'duplicate suppression is an engine concern'),
  ],
  [
    'SW-129',
    other('alert context bundling', 'context bundling is an engine concern'),
  ],
  [
    'SW-130',
    other('alert feedback store', 'feedback loop is an engine concern'),
  ],
  [
    'SW-131',
    nlp(
      'NLP over notes/messages',
      'semantic layer needs message/notes content NLP',
    ),
  ],
  // PART 1 — Red Flags
  [
    'SW-132',
    pend(
      ['thread_token', 'direction', 'activity_iso'],
      'business-hours calendar (EXTERNAL config) + "active thread"',
      'last-inbound + subsequent-outbound timing exists, but the >4 BUSINESS-hours rule needs an external business-hours calendar that this derivative does NOT contain; remains pending ONLY with that external input recorded and no evaluation until configured/ratified',
      {
        external_required_input:
          'per-rooftop business-hours calendar (external configuration; not in the Communication derivative)',
      },
    ),
  ],
  [
    'SW-133',
    pend(
      ['thread_token', 'direction', 'activity_iso'],
      '"consecutive customer messages" run + reply definition',
      'inbound runs then a rep reply are structural; the run count is a choice',
    ),
  ],
  [
    'SW-134',
    pend(
      ['thread_token', 'direction', 'activity_iso'],
      '"widens" pattern definition',
      'successive within-thread gaps exist; the widening pattern needs definition',
    ),
  ],
  [
    'SW-135',
    nlp(
      'stated-deadline extraction',
      '"I need to decide by Friday" is content',
    ),
  ],
  [
    'SW-136',
    nlp(
      '"hot signal" content (payment/financing/delivery)',
      'hot-signal detection needs message meaning',
    ),
  ],
  [
    'SW-137',
    pend(
      ['thread_token', 'channel', 'direction', 'activity_iso'],
      '"reply" adjacency + window',
      'inbound Text then rep Email in-thread is structural; the reply adjacency/window is a choice',
    ),
  ],
  [
    'SW-138',
    pend(
      ['thread_token', 'direction', 'activity_iso'],
      'run count N + rapid-fire window',
      'consecutive rep-outbound runs exist; N and the window are undefined in the catalog',
    ),
  ],
  [
    'SW-139',
    nlp('stated-callback-time extraction', '"call me after 5" is content'),
  ],
  [
    'SW-140',
    unsup(
      'inbound voicemail / customer-Answering-Machine event',
      'a customer-left voicemail is absent: an independent aggregate cross-tab shows Answering Machine ONLY on OUTBOUND Logged Calls (Honda 109 / Nissan 1 / Ford 16) and ZERO inbound Answering Machine across all three rooftops',
    ),
  ],
  [
    'SW-141',
    nlp(
      '"high intent" content',
      'high-intent classification needs message meaning',
    ),
  ],
  [
    'SW-142',
    nlp(
      'merge-tag/template content',
      'unfilled merge tags needs the message body',
    ),
  ],
  [
    'SW-143',
    nlp('answer-relevance (semantic)', "reply-doesn't-answer needs content"),
  ],
  [
    'SW-144',
    nlp('info-reuse semantics', 'ignoring provided info needs content'),
  ],
  [
    'SW-145',
    nlp(
      'message-body similarity',
      'same-body-to-many needs content comparison',
    ),
  ],
  ['SW-146', nlp('question detection', 'zero-questions needs content')],
  [
    'SW-147',
    nlp('VOI mention', 'mentioning the vehicle by name needs content'),
  ],
  ['SW-148', nlp('pricing/CTA detection', 'no-CTA needs content')],
  [
    'SW-149',
    nlp(
      'word-count from body',
      '<15-words needs the message body (char length is not word count / meaning)',
    ),
  ],
  ['SW-150', nlp('link-only detection', 'links-only needs content')],
  ['SW-151', nlp('greeting/sign-off patterns', 'tone patterns need content')],
  [
    'SW-152',
    nlp('price-concern handling', 'unaddressed price concern needs content'),
  ],
  [
    'SW-153',
    nlp(
      'financing-question + evasion semantics',
      'whether the rep answered the financing ask needs content',
    ),
  ],
  ['SW-154', nlp('buying-signal phrases', '"I\'m ready" needs content')],
  ['SW-155', nlp('trade-info mention', 'voluntary trade info needs content')],
  ['SW-156', nlp('OTD repeat ask', 'repeated OTD ask needs content')],
  [
    'SW-157',
    nlp('answer-vs-evasion semantics', 'evasion pattern needs message meaning'),
  ],
  ['SW-158', nlp('credit-challenge mention', 'credit challenge needs content')],
  ['SW-159', nlp('urgency phrases', 'urgency needs content')],
  [
    'SW-160',
    nlp('pre-objection discount', 'offering a discount early needs content'),
  ],
  ['SW-161', nlp('competitor mention', 'competitor named needs content')],
  [
    'SW-162',
    nlp('shopping-around phrases', 'comparison-shopping needs content'),
  ],
  ['SW-163', nlp('opt-out phrases', '"not interested" needs content')],
  ['SW-164', nlp('competing-offer reference', 'competing offer needs content')],
  ['SW-165', nlp('OTD ask after warming', 'OTD ask needs content')],
  [
    'SW-166',
    nlp('tone-shift detection', 'short-reply tone shift needs content'),
  ],
  [
    'SW-167',
    hist(
      '>7-day silence window',
      'silence >7 days cannot be observed within a 7-day capture',
    ),
  ],
  ['SW-168', nlp('pause/think-about-it phrases', 'delay phrases need content')],
  ['SW-169', nlp('life-event mention', 'life event needs content')],
  ['SW-170', nlp('last-2-message sentiment', 'sentiment needs content')],
  [
    'SW-171',
    nlp(
      'punctuation/caps pattern',
      'escalating punctuation needs the message text',
    ),
  ],
  ['SW-172', nlp('profanity/complaint', 'keyword detection needs content')],
  ['SW-173', nlp('rep-pushiness sentiment', 'pushy tone needs content')],
  [
    'SW-174',
    nlp('frustration keywords', '"frustrated/disappointed" needs content'),
  ],
  ['SW-175', nlp('sarcasm detection', 'sarcasm needs content')],
  [
    'SW-176',
    nlp(
      'sentiment/tone',
      'Sales-domain sentiment (polite-then-curt); "service" here is customer-service manner, NOT the Service department, so NOT outside the Sales boundary',
    ),
  ],
  [
    'SW-177',
    nlp('manager-request phrase', '"speak to a manager" needs content'),
  ],
  ['SW-178', nlp('apology count', 'apology detection needs content')],
  [
    'SW-179',
    nlp(
      'price/payment extraction across messages',
      'different-price-in-successive-messages needs the quoted numbers in the message body',
    ),
  ],
  ['SW-180', other('desking/DMS record', 'numbers-vs-desking is a DMS join')],
  ['SW-181', nlp('promise extraction', '"I\'ll call you at 3" is content')],
  [
    'SW-182',
    other(
      'sold/vehicle state',
      '"unit already sold/pending" needs the deal/inventory outcome',
    ),
  ],
  ['SW-183', nlp('"manager approved" claim semantics', 'the claim is content')],
  [
    'SW-184',
    other(
      'F&I contract vs verbal terms',
      'verbal-vs-contract needs the F&I contract + message content',
    ),
  ],
  [
    'SW-185',
    nlp('repeat-ask semantics', '"asks same info twice" needs content'),
  ],
  ['SW-186', comp('outbound SMS TCPA consent is a compliance condition')],
  ['SW-187', comp('message to a DNC number is a compliance condition')],
  ['SW-188', comp('legal contact-hours is a compliance condition')],
  ['SW-189', comp('APR/terms disclosure is a compliance condition')],
  ['SW-190', comp('discriminatory-language flag is a compliance condition')],
  [
    'SW-191',
    comp('SSN/DOB request via unsecured channel is a compliance condition'),
  ],
  ['SW-192', comp('plain-text PII in message body is a compliance condition')],
  [
    'SW-193',
    nlp(
      'promise substantiation',
      '"guaranteed approval" claim needs content (+ CRM)',
    ),
  ],
  [
    'SW-194',
    nlp(
      'conflicting-info semantics',
      'conflicting info needs content comparison',
    ),
  ],
  [
    'SW-195',
    nlp(
      'rep-introduction detection',
      'whether the floor rep introduced themselves needs content (+ appointment handoff)',
    ),
  ],
  ['SW-196', nlp('context-recap semantics', 'recap presence needs content')],
  [
    'SW-197',
    nlp(
      'acknowledgement semantics',
      'acknowledging prior conversation needs content',
    ),
  ],
  [
    'SW-198',
    other(
      'sold-customer state',
      '"sold customer" needs the deal outcome to join',
    ),
  ],
  ['SW-199', svc('Service advisor coordination is Service-domain')],
  [
    'SW-200',
    nlp('stated-vehicle-interest extraction', 'interest changes need content'),
  ],
  [
    'SW-201',
    nlp('need-confirmation semantics', 'confirming need needs content'),
  ],
  [
    'SW-202',
    nlp(
      'language detection',
      'Spanish/other-language mismatch needs message language',
    ),
  ],
  [
    'SW-203',
    nlp('reading-level analysis', 'reading-level match needs content'),
  ],
  [
    'SW-204',
    nlp('competence-gap semantics', 'feature/model knowledge needs content'),
  ],
  [
    'SW-205',
    nlp('emotional escalation curve', 'sentiment-worsening needs content'),
  ],
  [
    'SW-206',
    nlp('question repetition semantics', 'repeated question needs content'),
  ],
  // PART 2 — Opportunity Mining
  [
    'SW-207',
    other(
      'lost-lead history + inventory',
      '60-180-day lost leads + in-stock vehicle needs lost-lead history + inventory',
    ),
  ],
  [
    'SW-208',
    other(
      'aged lead + stated timeframe',
      '"not now" timeframe arrival needs aged-lead + stated content',
    ),
  ],
  [
    'SW-209',
    other(
      'test-drive history >90 days',
      'prior test drives + 90-day gap needs history + appointment',
    ),
  ],
  [
    'SW-210',
    other(
      'lost-to-credit history',
      '6-month-aged credit leads need history + credit',
    ),
  ],
  [
    'SW-211',
    other('trade-valuation history', 'declined-on-trade needs trade + history'),
  ],
  [
    'SW-212',
    other(
      'competitor/inventory history',
      'lost-to-discontinued-unit needs inventory + history',
    ),
  ],
  [
    'SW-213',
    other(
      'online credit-app funnel',
      'abandoned credit app is an external funnel',
    ),
  ],
  [
    'SW-214',
    other(
      'external chat transcript source + NLP',
      'chat sessions without lead capture come from an external chat system (not the Communication Log); also needs high-intent-language NLP',
    ),
  ],
  [
    'SW-215',
    other('equity position', 'positive-equity owners needs equity data'),
  ],
  [
    'SW-216',
    other('payoff vs trade value', 'payoff<trade needs finance/trade data'),
  ],
  ['SW-217', other('lease maturity', 'leases maturing needs lease data')],
  [
    'SW-218',
    extb(
      'warranty-expiration CPO prospecting needs external warranty/OEM data (outside governed boundary)',
    ),
  ],
  [
    'SW-219',
    other('OEM redesign/inventory', 'model-redesign needs OEM/inventory data'),
  ],
  [
    'SW-220',
    other(
      'used-value appreciation',
      'vehicle-appreciated needs market value data',
    ),
  ],
  [
    'SW-221',
    other('finance term tenure', '24+-months-financed needs finance data'),
  ],
  [
    'SW-222',
    svc(
      'multi-vehicle-household service is Service-domain (outside governed boundary)',
    ),
  ],
  ['SW-223', svc('Service ROs / declined work is Service-domain')],
  ['SW-224', svc('vehicles in Service is Service-domain')],
  ['SW-225', svc('repeat Service customers is Service-domain')],
  ['SW-226', svc('Service customers / safety recalls is Service-domain')],
  ['SW-227', svc('Service-advisor notes is Service-domain')],
  [
    'SW-228',
    svc(
      'service waiting-room prospecting is Service-domain (outside governed boundary)',
    ),
  ],
  [
    'SW-229',
    svc(
      'totaled/major-repair vehicle is a Service-repair signal (outside governed boundary)',
    ),
  ],
  ['SW-230', other('website VDP views', 'VDP retargeting is a website metric')],
  [
    'SW-231',
    other('payment-calculator usage', 'calculator usage is a website metric'),
  ],
  [
    'SW-232',
    other('trade-in tool completions', 'trade tool is a website metric'),
  ],
  [
    'SW-233',
    unsup(
      'email open/click tracking',
      'open/click engagement is not a derivative field ("Email Read" interaction_result is not open/click tracking)',
    ),
  ],
  [
    'SW-234',
    unsup('email click tracking', 'click tracking is not a derivative field'),
  ],
  [
    'SW-235',
    unsup(
      'video-open tracking (Covideo/BombBomb)',
      'video OPENS are an external tool signal; has_video is only whether the rep ATTACHED a video',
    ),
  ],
  [
    'SW-236',
    other(
      'website wishlist activity',
      'saved-vehicle activity is a website metric',
    ),
  ],
  [
    'SW-237',
    other(
      'external chatbot routing',
      'chatbot high-intent is an external chat metric',
    ),
  ],
  ['SW-238', other('sold + CSI', 'recently-sold CSI needs sold + survey data')],
  [
    'SW-239',
    nlp(
      'family/friend-interest mention detection',
      'past-mention mining needs message content NLP',
    ),
  ],
  [
    'SW-240',
    other(
      'household driver data',
      'multi-driver households needs household data',
    ),
  ],
  [
    'SW-241',
    other('review + referral', 'positive-review referral needs review data'),
  ],
  [
    'SW-242',
    other('sold purchase history', 'repeat purchasers needs sold history'),
  ],
  [
    'SW-243',
    other('OEM/affinity membership', 'affinity groups needs OEM/affinity data'),
  ],
  [
    'SW-244',
    other(
      'external lookalike audiences',
      'lookalikes needs an external ad platform',
    ),
  ],
  [
    'SW-245',
    other(
      'geo/ZIP distribution',
      'ZIP overrepresentation needs geo + sold data',
    ),
  ],
  [
    'SW-246',
    other('occupation/employer data', 'employer patterns needs external data'),
  ],
  [
    'SW-247',
    other(
      'age/lifecycle segments',
      'segment close rates needs segment + deal data',
    ),
  ],
  [
    'SW-248',
    other(
      'trade model-swap history',
      'model-swap patterns needs trade history',
    ),
  ],
  [
    'SW-249',
    other('trade conquest history', 'cross-brand conquest needs trade history'),
  ],
  [
    'SW-250',
    other(
      'aged inventory + lost leads',
      'inventory-vs-lost needs inventory + history',
    ),
  ],
  [
    'SW-251',
    other(
      'new arrivals + wishlist',
      'arrivals-vs-wishlist needs inventory + website',
    ),
  ],
  [
    'SW-252',
    other(
      'price drops + objections',
      'price-drop-vs-objection needs inventory + objection content',
    ),
  ],
  [
    'SW-253',
    other(
      'inventory config + waiting-list',
      'hard-to-find configs needs inventory',
    ),
  ],
  [
    'SW-254',
    other(
      'CPO pipeline + off-lease',
      'CPO-vs-off-lease needs inventory + lease',
    ),
  ],
  [
    'SW-255',
    other(
      'trade arrivals + lost leads',
      'trades-vs-lost needs inventory + history',
    ),
  ],
  [
    'SW-256',
    nlp(
      'lifecycle-event mention detection',
      'baby/marriage/move/new-job mentions need message content NLP',
    ),
  ],
  [
    'SW-257',
    other(
      'education/grad program data',
      'recent-graduates needs external data',
    ),
  ],
  ['SW-258', other('military PCS data', 'military moves needs external data')],
  [
    'SW-259',
    other('small-business/fleet data', 'SMB owners needs external data'),
  ],
  [
    'SW-260',
    other('retiree/downsizer data', 'retirees needs external/segment data'),
  ],
  [
    'SW-261',
    hist(
      'multi-week response history',
      'best-time-to-contact model needs historical response times',
    ),
  ],
  [
    'SW-262',
    hist(
      'historical responsiveness',
      '"historically responsive to Saturday" needs multi-week history',
    ),
  ],
  ['SW-263', svc('seasonal Service customers is Service-domain')],
  [
    'SW-264',
    extb(
      'tax-refund-window prospecting needs an external tax/finance-calendar source (outside governed boundary)',
    ),
  ],
  [
    'SW-265',
    other(
      'lease-end dates',
      'end-of-lease clusters need lease data (another source)',
    ),
  ],
  [
    'SW-266',
    other(
      'model-year/inventory',
      'model-year-changeover needs inventory/vehicle data',
    ),
  ],
  [
    'SW-267',
    xroof(
      'cross-rooftop customer introduction needs a separate cross-rooftop governed route',
    ),
  ],
  [
    'SW-268',
    xroof(
      'cross-rooftop trade/wish-list matching needs a separate cross-rooftop governed route',
    ),
  ],
  [
    'SW-269',
    xroof(
      'cross-brand/group switching needs a separate cross-rooftop governed route',
    ),
  ],
  ['SW-270', svc('service-customer cross-marketing is Service-domain')],
  ['SW-271', comp('shared DNC/DNS list is a compliance condition')],
  [
    'SW-272',
    extb(
      'appended home-purchase / new-mover records are an external governed data source',
    ),
  ],
  [
    'SW-273',
    extb('credit-tier refresh needs an external credit-bureau governed source'),
  ],
  ['SW-274', extb('vehicle-registration data is an external governed source')],
  ['SW-275', extb('insurance-total-loss feed is an external governed source')],
  [
    'SW-276',
    extb('public LinkedIn job-change signals are an external governed source'),
  ],
  [
    'SW-277',
    other(
      'lost lead + inventory arrival',
      'lost-lead-vs-arrival needs inventory + history',
    ),
  ],
  // PART 3 — Suggested Semantic Watchdog Add-ons
  ['SW-278', other('equity threshold', 'equity-crossed needs equity data')],
  [
    'SW-279',
    svc(
      'service visit + no sales touch is Service-domain (outside governed boundary)',
    ),
  ],
  ['SW-280', other('website 3rd-visit', 'website visit needs web analytics')],
  ['SW-281', other('review posted', 'review-posted needs review data')],
  ['SW-282', other('lease maturity <120d', 'lease-maturity needs lease data')],
  ['SW-283', other('birthday/anniversary', 'customer-date needs profile data')],
  [
    'SW-284',
    other(
      'competitor incentive change',
      'competitor incentive is external market data',
    ),
  ],
  [
    'SW-285',
    nlp('intent classifier', 'buying/objection intent needs content NLP'),
  ],
  ['SW-286', nlp('sentiment tracker', 'per-message sentiment needs content')],
  [
    'SW-287',
    nlp(
      'question-answer alignment',
      'did the reply address the question needs content',
    ),
  ],
  [
    'SW-288',
    pend(
      ['thread_token', 'direction', 'activity_iso', 'channel'],
      'composite score definition',
      'response times + direction balance + thread momentum are computable; the composite score must be ratified',
    ),
  ],
  [
    'SW-289',
    nlp(
      'personalization/template detection',
      'template-vs-custom needs content',
    ),
  ],
  [
    'SW-290',
    hist(
      'historical labeled outcomes + model data',
      'an escalation/complaint-probability predictor needs labeled historical outcomes + a trained model; not only NLP',
    ),
  ],
  [
    'SW-291',
    hist(
      'dormant-lead reactivation model',
      're-engagement probability needs labeled history + a model',
    ),
  ],
  [
    'SW-292',
    other(
      'equity opportunity score',
      'expected upgrade gross needs equity + deal data',
    ),
  ],
  [
    'SW-293',
    other(
      'referral propensity model',
      'referral likelihood needs sold history + a model',
    ),
  ],
  [
    'SW-294',
    svc(
      'service-to-sales / sales-to-F&I cross-sell spans the Service/F&I boundary',
    ),
  ],
  [
    'SW-295',
    hist(
      'multi-week per-customer history',
      'best-channel/best-time model needs history',
    ),
  ],
]

/**
 * Fail-closed validator: the table must have EXACTLY 295 rows, no duplicate id (array length vs
 * a Set + explicit duplicate identification), and cover exactly SW-001..SW-295 (no missing /
 * extra / out-of-range). Returns the lookup Map only when all hold. This is the SAME validator
 * the generator uses, so an injected duplicate/missing tuple fails through it.
 */
export function validateAndIndex(
  table: Array<[string, Dec]>,
): Map<string, Dec> {
  if (table.length !== 295)
    throw new Error(`decision table has ${table.length} rows, expected 295`)
  const ids = table.map(([id]) => id)
  const seen = new Set<string>()
  const dups: Array<string> = []
  for (const id of ids) {
    if (seen.has(id)) dups.push(id)
    seen.add(id)
  }
  if (seen.size !== ids.length || dups.length)
    throw new Error(
      `duplicate decision id(s): ${[...new Set(dups)].join(', ')}`,
    )
  for (const id of ids)
    if (
      !/^SW-\d{3}$/.test(id) ||
      Number(id.slice(3)) < 1 ||
      Number(id.slice(3)) > 295
    )
      throw new Error(`out-of-range/extra decision id ${id}`)
  for (let i = 1; i <= 295; i++) {
    const id = `SW-${String(i).padStart(3, '0')}`
    if (!seen.has(id)) throw new Error(`missing decision id ${id}`)
  }
  const map = new Map<string, Dec>()
  for (const [id, dec] of table) map.set(id, dec)
  return map
}
