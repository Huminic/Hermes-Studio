#!/usr/bin/env python3
"""PKT-07-03 J1 freeze-candidate binding validator (compact, non-recursive).

Seven targets (SW-181, SW-182, SW-183, SW-193, SW-198, SW-286, SW-290) are held
source_investigation_pending. SW-199 is accepted_disposition_only as outside_sales_domain
(proved_outside_sales_domain / not_acquired / not_measured), preserved per the SPEC §3 separate-Service
overlay (service_domain, 18 IDs), and takes NO Sales source action.

The communication corpus is SUPPORTING context only (never promoted; lacks stable IDs; labels/keywords are
not identifiers/findings/linkage); conditional presently-not-proved wording; all held conditions are
content-dependent -> protected-content (no content/raw quotes/PII/IDs). Trust/substantiation flags
(SW-181/182/183/193) are provisional and NOT proof of a breach; SW-193 protected compliance semantics
require Duane authority and human review and are NEVER a legal conclusion. Sentiment/escalation
interpretations (SW-286/290) are provisional models for management HUMAN REVIEW only — never automatic
discipline, adverse employment, accusation, or a factual claim; SW-290 requires multiweek labeled outcomes
(one week is insufficient).

Usage:
  python3 scripts/halo-phase1b/validate_pkt_07_03_binding.py            # writes CHECKS
  python3 scripts/halo-phase1b/validate_pkt_07_03_binding.py --no-write # validate only
"""
import json, copy, hashlib, subprocess, sys, os, re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
def P(rel): return os.path.join(ROOT, rel)
def load(rel): return json.load(open(P(rel)))
def sha256(rel):
    h = hashlib.sha256()
    with open(P(rel), "rb") as f:
        for c in iter(lambda: f.read(65536), b""):
            h.update(c)
    return h.hexdigest()

BASELINE_COMMIT = "b5684577c0e0b768c0176e99c0b94d3ded978aa2"
BINDING_REL = "docs/halo/contract/phase1b/pkt-07-03-binding.json"
VALIDATOR_REL = "scripts/halo-phase1b/validate_pkt_07_03_binding.py"
CHECKS_REL = "docs/halo/evidence/honda-watchdog/phase1b/pkt-07-03/PKT-07-03_BINDING_CHECKS.json"
TWO_DELTA_REL = "docs/halo/evidence/honda-watchdog/phase1b/pkt-07-03/PKT-07-03_J1_TWO_DELTA.md"
ROADMAP_REL = "docs/halo/evidence/honda-watchdog/phase1b/pkt-07-03/PKT-07-03_J1_internal_coverage_roadmap.md"
ALLOWLIST = [BINDING_REL, VALIDATOR_REL, CHECKS_REL, TWO_DELTA_REL, ROADMAP_REL]

IDS = ["SW-181","SW-182","SW-183","SW-193","SW-198","SW-199","SW-286","SW-290"]
SIP_IDS = ["SW-181","SW-182","SW-183","SW-193","SW-198","SW-286","SW-290"]
DISPOSITION_ONLY_IDS = ["SW-199"]
SUPPORTING_IDS = list(SIP_IDS)
CONDITIONAL_SOURCE_IDS = list(SIP_IDS)
PROTECTED_FUTURE_IDS = list(SIP_IDS)
REVIEW_IDS = list(SIP_IDS)
SUBSTANTIATION_IDS = ["SW-181","SW-182","SW-183","SW-193"]
COMPLIANCE_ID = "SW-193"
LIFECYCLE_ID = "SW-198"
MULTIWEEK_ID = "SW-290"

EXPECTED_SLICES = {
    "promise_followthrough": ["SW-181"],
    "vehicle_claim_validation": ["SW-182"],
    "manager_claim_substantiation": ["SW-183"],
    "unsubstantiated_compliance_promises": ["SW-193"],
    "lifecycle_and_domain_coordination": ["SW-198","SW-199"],
    "sentiment_and_escalation_models": ["SW-286","SW-290"],
}

# per-metric required blocker substrings (all held via missing_or_quarantine_evidence, lowercased/underscored->space)
HELD_MARKERS = {
    "SW-181": ["presently","supporting","follow-through","chronology"],
    "SW-182": ["presently","supporting","sold","state"],
    "SW-183": ["presently","supporting","manager note"],
    "SW-193": ["presently","supporting","substantiat","legal conclusion"],
    "SW-198": ["presently","supporting","sold","label"],
    "SW-286": ["presently","supporting","sentiment"],
    "SW-290": ["presently","supporting","escalation","multiweek","insufficient"],
}
# accusatory conclusions that must never be asserted as fact (guarded, never appear in legit evidence)
CAUSAL_TOKEN = {
    "SW-181": "broken promise",
    "SW-182": "false availability claim",
    "SW-183": "fabricated approval",
    "SW-193": "unsubstantiated breach",
    "SW-286": "confirmed sentiment decline",
    "SW-290": "guaranteed escalation",
}
ASSERTIVE = ("confirmed","established","proven","diagnosed","caused by","because",
             "due to","is the cause","present because","verified","certain")
NEGATION = ("not ","no ","never","non-","must not","cannot","is not")

PINNED = {
    "docs/halo/contract/semantic-watchdog-feasibility-matrix-295.json":
        "29c7ac06130f9b4fe8d5df0a2d0d6fffed7c6ff4dc02eca96e0f44d109a04fc1",
    "docs/halo/contract/gate2-evaluator-contract.json":
        "9bdc266438befe562b5197891e68afc15c797338b29152bb3aaf341a6f28fdd4",
    "docs/halo/contract/baseline-registry.json":
        "86de75c49946557153e0e46e2131302a6fc12117862fdd6383c0c88c320da8c4",
    "docs/halo/evidence/m1r/gate5b/gate5b-report-model-21043.json":
        "04c3f965e1d087e9f5835d69e14a368d24c6af5a10743e593d9dc54516f129eb",
    "docs/halo/contract/phase1b/master-ledger-295.json":
        "a5e4dd0b00ddfb48642d342a0bef0c49cb40a85d3bb375879e636b3d5cc7543a",
    "docs/halo/evidence/m1r/scheduled/native-scheduled-evidence.json":
        "13c0fca11241c5608d7da1e434383a4e881c886ecbd696414bebdd5a8db636c6",
}
CATALOG_SHA_EXPECTED = "29c7ac06130f9b4fe8d5df0a2d0d6fffed7c6ff4dc02eca96e0f44d109a04fc1"
SERVICE_OVERLAY_REL = "docs/halo/contract/service-domain-overlay.json"
SERVICE_DOMAIN_EXPECTED_COUNT = 18
LEGACY_REL = "scripts/halo-phase1b/validate_phase1b.py"
LEGACY_BASELINE_COUNT = 30
LEGACY_BASELINE_SHA = "2cbf86a6361f4c67803807d5d7d7d496413a4b20924da42516ff80d7d3d46783"
PRESERVE = [
    "docs/halo/contract/phase1b/pkt-02-03-binding.json",
    "docs/halo/evidence/honda-watchdog/phase1b/pkt-02-03/PKT-02-03_SW-137_DISCOVERY_RESULT.json",
    "docs/halo/evidence/honda-watchdog/phase1b/pkt-02-03/PKT-02-03_SW-140_DISCOVERY_RESULT.json",
]
DUANE_STEMS = ("acquir","acquisit","investigat","accumulat","admit","admiss",
               "normaliz","promot","calculat","implement")
QUARANTINED = ["cage_kpi","lead_source_roi","sales_comm_log"]
DUANE_ROLE = "Duane (business/design/protected-content/threshold decision authority only)"
JOIN_TECH_TOKENS = ("join design","join definition","define the join","join implementation",
                    "implement the join","cardinality","source key","source-key","technical join",
                    "key proof","nlp implementation","scoring implementation","reconciliation implementation",
                    "thread reconstruction")
ABSOLUTE_SOURCE_CLAIMS = ("export exists","export was found","does not exist","already required",
                          "already requires","external source is required","requires a named external",
                          "requires an external","must be external","must use an external",
                          "no vinsolutions export","data does not exist","export does not exist",
                          "permanently unavailable","no export exists")
FORBIDDEN_HELD_KEYS = ("peer_rank","industry_reference","text","label_value","variance","metric_slug",
                       "source_family","j2_quarantine","current_truth_ref","held_source_evidence_ref")
NULL_FIELDS = ("value","value_display","numerator","denominator","formula","threshold",
               "comparator","direction","grade_target_id","grade_basis","grade_value_or_range",
               "detection_rule","ot_anchor","gate2_anchor","accepted_evaluation")
FALSE_FIELDS = ("authoritative","carry_forward","gradable","value_allowed","grade_allowed",
                "narrative_allowed","customer_projection_allowed","future_display_eligibility",
                "customer_projection_authored_this_tranche","recomputed_this_tranche")


def _load_ctx():
    g2 = load("docs/halo/contract/gate2-evaluator-contract.json")["evaluable_conditions"]
    br_list = load("docs/halo/contract/baseline-registry.json")["operational_targets"]
    g5 = load("docs/halo/evidence/m1r/gate5b/gate5b-report-model-21043.json")
    overlay = load(SERVICE_OVERLAY_REL)
    sd_ids = sorted(set(re.findall(r"SW-\d+", json.dumps(overlay.get("service_domain", [])))),
                    key=lambda s: int(s[3:]))
    return {
        "catalog": load("docs/halo/contract/semantic-watchdog-feasibility-matrix-295.json"),
        "g2_ids": set(g2.keys()) if isinstance(g2, dict) else set(),
        "g5": g5,
        "g5_eval_ids": set(x.get("metric_id") for x in g5.get("evaluated", [])),
        "br_metric_ids": set(it.get("metric_id") for it in br_list),
        "fv": load("docs/halo/contract/phase1/frozen-vocabularies.json")["closed_vocabularies"],
        "service_domain_ids": sd_ids,
    }


def _cat_map(catalog):
    rows = catalog if isinstance(catalog, list) else None
    if rows is None:
        for v in catalog.values():
            if isinstance(v, list) and v and isinstance(v[0], dict):
                rows = v; break
    ck = "id" if "id" in rows[0] else "metric_id"
    cf = next(f for f in ("condition","text","statement","description","canonical_condition") if f in rows[0])
    return {r[ck]: r[cf] for r in rows}


def _norm(s): return str(s).lower().replace("_", " ")


def _strings(v):
    if isinstance(v, str):
        yield v
    elif isinstance(v, list):
        for x in v: yield from _strings(x)
    elif isinstance(v, dict):
        for x in v.values(): yield from _strings(x)


def _vocab_check(mid, m, fv, e):
    d = m.get("disposition"); se = m.get("source_existence_state")
    aq = m.get("acquisition_admission_state"); ev_state = m.get("evaluation_state")
    dc = fv["source_existence_state"]["disposition_consistency"].get(d)
    if dc is not None and se not in dc:
        e.append("VOCAB %s: (disposition=%s, source_existence=%s) not allowed" % (mid, d, se))
    pairs = fv["source_existence_acquisition_matrix"]["allowed_pairs"].get(se)
    if pairs is not None and aq not in pairs:
        e.append("VOCAB %s: (source_existence=%s, acquisition=%s) not allowed" % (mid, se, aq))
    emap = fv["disposition_evaluation_consistency"]["map"].get(d)
    if emap is not None and ev_state not in emap:
        e.append("VOCAB %s: (disposition=%s, evaluation=%s) not allowed" % (mid, d, ev_state))


def _owner_checks(mid, m, e):
    owners = m.get("accountable_owners", {}) or {}
    for role, who in owners.items():
        if who and who.startswith("Duane"):
            if any(s in role.lower() for s in DUANE_STEMS):
                e.append("OWNER %s: Duane role key has technical stem: %s" % (mid, role))
            if any(t in _norm(role) for t in JOIN_TECH_TOKENS):
                e.append("OWNER %s: Duane assigned a technical role: %s" % (mid, role))
    actions = []
    if isinstance(m.get("immediate_action"), dict):
        actions.append(m["immediate_action"])
    actions += [a for a in m.get("subsequent_actions", []) if isinstance(a, dict)]
    for a in actions:
        if not a.get("owner") or not a.get("action"):
            e.append("OWNER %s: action missing owner/action" % mid)
        if a.get("owner", "").startswith("Duane"):
            if any(s in a.get("action", "").lower() for s in DUANE_STEMS):
                e.append("OWNER %s: Duane assigned technical action: %r" % (mid, a.get("action")))
            if any(t in _norm(a.get("action", "")) for t in JOIN_TECH_TOKENS):
                e.append("OWNER %s: Duane assigned a technical-design action: %r" % (mid, a.get("action")))


def run_structural(b, ctx):
    e = []
    cat = _cat_map(ctx["catalog"])
    g5, fv = ctx["g5"], ctx["fv"]
    metrics = b.get("metrics", [])
    mids = [m.get("id") for m in metrics]

    if mids != IDS:
        e.append("IDS: metrics order/membership != exact 8 %r" % (mids,))
    if b.get("packet_membership_order") != IDS:
        e.append("IDS: packet_membership_order != exact 8")
    if len(set(mids)) != len(mids):
        e.append("IDS: duplicate id present")
    if b.get("module") != 7:
        e.append("MODULE: module != 7")

    if b.get("pins", {}).get("baseline_commit") != BASELINE_COMMIT:
        e.append("BASELINE: pins.baseline_commit != %s" % BASELINE_COMMIT)
    if b.get("pins", {}).get("catalog_sha256_expected") != CATALOG_SHA_EXPECTED:
        e.append("BASELINE: pins.catalog_sha256_expected != expected")
    if b.get("pinned_source_hashes") != PINNED:
        e.append("HASH: binding pinned_source_hashes != pinned set")

    acc = b.get("packet_accounting_assertion", {})
    if acc.get("conditions") != 295 or acc.get("modules") != 11 or acc.get("packets") != 30:
        e.append("ACCOUNTING: not 295/11/30 -> %r" % (acc,))

    ds = b.get("dealer_scope", {})
    if ds.get("profile") != "serra-honda" or ds.get("dealer_id") != "21043" or ds.get("domain") != "Sales":
        e.append("DEALER: not serra-honda/21043/Sales")
    if ds.get("service_parts_admitted") != 0 or ds.get("service_source_admitted") != 0 or ds.get("cross_rooftop_admitted") != 0:
        e.append("DEALER: Service/Parts/service-source/cross-rooftop admitted != 0")

    if b.get("customer_emission_authority") is not False:
        e.append("BOUNDARY: customer_emission_authority must be false")
    if b.get("customer_projection") is not None:
        e.append("BOUNDARY: customer_projection must be null")

    td = b.get("two_delta", {})
    if td.get("evidence_delta", {}).get("count") != 0 or td.get("meaning_delta", {}).get("count") != 0:
        e.append("TWO_DELTA: evidence/meaning delta must be 0")
    if td.get("evidence_delta", {}).get("of") != 8 or td.get("meaning_delta", {}).get("of") != 8:
        e.append("TWO_DELTA: delta 'of' must be 8")

    blob = json.dumps({k: v for k, v in b.items() if k != "cross_dealer_exclusion"}).lower()
    for tok in ("21044","21047","serra-nissan","tony-serra-ford"):
        if tok in blob:
            e.append("CROSS_DEALER: forbidden dealer token in scope: %s" % tok)

    lp = b.get("lifecycle_partition", {})
    bkts = ["accepted_measured_ids","accepted_disposition_only_ids","rejected_ids",
            "source_investigation_pending_ids","calculation_pending_ids"]
    allp = [i for k in bkts for i in lp.get(k, [])]
    if sorted(allp) != sorted(IDS) or len(set(allp)) != len(allp):
        e.append("PARTITION: buckets not disjoint / do not cover exactly 8")
    if lp.get("accepted_measured_ids") != [] or lp.get("rejected_ids") != [] or lp.get("calculation_pending_ids") != []:
        e.append("PARTITION: accepted_measured/rejected/calculation buckets must be empty")
    if lp.get("accepted_disposition_only_ids") != DISPOSITION_ONLY_IDS:
        e.append("PARTITION: accepted_disposition_only_ids must be exactly [SW-199]")
    if sorted(lp.get("source_investigation_pending_ids", [])) != sorted(SIP_IDS):
        e.append("PARTITION: source_investigation_pending_ids != the seven held")

    ama = b.get("accepted_measured_authority", {})
    if ama.get("ids") != []:
        e.append("ACCEPTED: accepted_measured_authority.ids must be [] (no accepted-measured)")
    if ama.get("authoritative_evaluated_total") != 17:
        e.append("ACCEPTED: authoritative_evaluated_total != 17")
    if ama.get("carry_forward") is not False:
        e.append("ACCEPTED: carry_forward must be false")
    if g5.get("coverage", {}).get("evaluated") != 17:
        e.append("ACCEPTED: live gate5b coverage.evaluated != 17 (=%r)" % (g5.get("coverage", {}).get("evaluated"),))

    in_g2 = sorted(set(IDS) & ctx["g2_ids"])
    in_br = sorted(set(IDS) & ctx["br_metric_ids"])
    in_g5 = sorted(set(IDS) & ctx["g5_eval_ids"])
    if in_g2 or in_br or in_g5:
        e.append("AUTHORITY_ABSENCE: target present in authority g2=%r br=%r g5=%r" % (in_g2, in_br, in_g5))
    aa = b.get("authority_absence_assertion", {})
    if sorted(aa.get("ids_checked", [])) != sorted(IDS):
        e.append("AUTHORITY_ABSENCE: ids_checked != the eight targets")
    if aa.get("in_gate2_evaluable_conditions") != in_g2 \
            or aa.get("in_baseline_operational_targets") != in_br \
            or aa.get("in_gate5b_evaluated") != in_g5:
        e.append("AUTHORITY_ABSENCE: binding assertion != live computed intersections")

    sl = b.get("source_family_slices", {})
    if sl != EXPECTED_SLICES:
        e.append("SLICES: source_family_slices != the exact six expected slices/membership")
    sids = [i for v in sl.values() for i in v]
    if len(sids) != 8 or len(set(sids)) != 8 or sorted(sids) != sorted(IDS):
        e.append("SLICES: do not partition the 8 ids")

    # SW-199 service-domain overlay membership (18 IDs) + truth reference
    sd_ids = ctx["service_domain_ids"]
    if len(sd_ids) != SERVICE_DOMAIN_EXPECTED_COUNT:
        e.append("OVERLAY: service_domain member count %d != %d" % (len(sd_ids), SERVICE_DOMAIN_EXPECTED_COUNT))
    if "SW-199" not in sd_ids:
        e.append("OVERLAY: SW-199 not a service_domain overlay member")
    ovr = b.get("service_domain_overlay_ref", {})
    if ovr.get("member_count") != SERVICE_DOMAIN_EXPECTED_COUNT or ovr.get("sw_199_member") is not True \
            or ovr.get("key") != "service_domain":
        e.append("OVERLAY: binding service_domain_overlay_ref != live overlay (18 / member / key)")

    by = {m["id"]: m for m in metrics if "id" in m}

    # ---- held (SIP) loop ----
    for mid in SIP_IDS:
        m = by.get(mid)
        if m is None:
            e.append("MISSING metric %s" % mid); continue
        if m.get("canonical_condition") != cat.get(mid):
            e.append("COND: %s canonical_condition != catalog" % mid)

        if m.get("disposition") != "source_investigation_pending":
            e.append("HELD %s: disposition must be source_investigation_pending" % mid)
        if m.get("source_existence_state") != "unproved":
            e.append("HELD %s: source_existence_state must be unproved (not promoted)" % mid)
        if m.get("acquisition_admission_state") != "not_acquired":
            e.append("HELD %s: acquisition_admission_state must be not_acquired (not promoted)" % mid)
        if m.get("evaluation_state") != "not_measured":
            e.append("HELD %s: evaluation_state must be not_measured" % mid)
        if m.get("report_acceptance_state") != "draft":
            e.append("HELD %s: report_acceptance_state must be draft" % mid)
        for f in NULL_FIELDS:
            if m.get(f) is not None:
                e.append("HELD %s: %s must be null (missing != zero, no value/grade/baseline)" % (mid, f))
        for f in FALSE_FIELDS:
            if m.get(f) is not False:
                e.append("HELD %s: %s must be false" % (mid, f))
        if m.get("missing_is_not_zero") is not True or m.get("no_proxy_or_inference") is not True:
            e.append("HELD %s: missing_is_not_zero / no_proxy_or_inference must be true" % mid)
        if m.get("no_causal_diagnosis_asserted") is not True:
            e.append("HELD %s: no_causal_diagnosis_asserted must be true" % mid)
        if m.get("direct_source_fields") != []:
            e.append("HELD %s: direct_source_fields must be [] (nothing acquired)" % mid)
        for req in ("missing_or_quarantine_evidence","required_future_contract","accountable_owners",
                    "immediate_action","subsequent_actions","review_point","next_safe_source_action",
                    "business_question","source_family_intent","source_family_slice"):
            if not m.get(req):
                e.append("HELD %s: missing %s" % (mid, req))
        for f in FORBIDDEN_HELD_KEYS:
            if f in m:
                e.append("HELD %s: forbidden accepted/legacy key '%s' present" % (mid, f))

        joined = " || ".join(m.get("missing_or_quarantine_evidence", [])).lower()
        for mk in HELD_MARKERS.get(mid, []):
            if mk not in joined:
                e.append("HELD %s: blocker marker missing: '%s'" % (mid, mk))
        if m.get("source_family_intent") in QUARANTINED:
            e.append("HELD %s: source_family_intent is quarantined family" % mid)

        if mid in CONDITIONAL_SOURCE_IDS:
            if not str(m.get("source_family_intent", "")).endswith("_source_unproved"):
                e.append("HELD %s: unproved-source condition must use a *_source_unproved intent" % mid)
            for bad in ABSOLUTE_SOURCE_CLAIMS:
                if bad in joined:
                    e.append("HELD %s: absolute source claim forbidden: '%s'" % (mid, bad))
            for need in ("presently","read-only","vinsolutions","external","proxy"):
                if need not in joined:
                    e.append("HELD %s: conditional-source evidence must contain '%s'" % (mid, need))
        if mid in SUPPORTING_IDS:
            if "supporting" not in joined:
                e.append("SUPPORT %s: must preserve corpus evidence as SUPPORTING context" % mid)
            if not any(t in joined for t in ("known","corpus","context","component")):
                e.append("SUPPORT %s: must name the known corpus/context evidence" % mid)
            if "not stable linkage" not in joined:
                e.append("SUPPORT %s: must state customer/provisional labels are not stable linkage" % mid)
        if mid in REVIEW_IDS:
            for need in ("human review","discipline","provisional"):
                if need not in joined:
                    e.append("REVIEW %s: interpretations must be provisional for human review, never automatic discipline ('%s')" % (mid, need))
        if mid in PROTECTED_FUTURE_IDS:
            for need in ("not read","protected-content","envelope","stable","minimization"):
                if need not in joined:
                    e.append("PROTECTED %s: content-dependent evidence must contain '%s'" % (mid, need))
            if not any(who == DUANE_ROLE and "protected_content" in role for role, who in (m.get("accountable_owners") or {}).items()):
                e.append("PROTECTED %s: requires a Duane protected-content authorization role" % mid)
        if mid in SUBSTANTIATION_IDS:
            if "not proof" not in joined:
                e.append("SUBSTANTIATION %s: a trust/substantiation flag must be stated as NOT proof of a breach" % mid)
        if mid == COMPLIANCE_ID:
            if "legal conclusion" not in joined or "substantiat" not in joined:
                e.append("COMPLIANCE %s: compliance semantics must require substantiation and be never a legal conclusion" % mid)
        if mid == LIFECYCLE_ID:
            if "sold" not in joined or "label" not in joined:
                e.append("LIFECYCLE %s: must require sold outcome/state and forbid label identity" % mid)
        if mid == MULTIWEEK_ID:
            if "multiweek" not in joined or "insufficient" not in joined:
                e.append("MULTIWEEK %s: escalation predictor must require multiweek outcomes (one week insufficient)" % mid)

        ia = m.get("immediate_action", {}) if isinstance(m.get("immediate_action"), dict) else {}
        owners = m.get("accountable_owners", {}) or {}
        if m.get("next_action_owner") != ia.get("owner"):
            e.append("HELD %s: next_action_owner != immediate_action.owner" % mid)
        if m.get("next_action_owner") not in set(owners.values()):
            e.append("HELD %s: next_action_owner not among accountable_owners values" % mid)

        if mid in CAUSAL_TOKEN:
            tok = CAUSAL_TOKEN[mid]
            for k, v in m.items():
                if k == "canonical_condition":
                    continue
                for s in _strings(v):
                    sll = s.lower()
                    if tok in sll and any(a in sll for a in ASSERTIVE) and not any(n in sll for n in NEGATION):
                        e.append("CAUSAL %s: accusatory conclusion '%s' asserted as fact: %r" % (mid, tok, s))

        _owner_checks(mid, m, e)
        _vocab_check(mid, m, fv, e)

    # ---- SW-199 accepted_disposition_only / outside_sales_domain branch ----
    s = by.get("SW-199")
    if s is None:
        e.append("MISSING metric SW-199")
    else:
        if s.get("canonical_condition") != cat.get("SW-199"):
            e.append("COND: SW-199 canonical_condition != catalog")
        if s.get("disposition") != "outside_sales_domain":
            e.append("SW199: disposition must be outside_sales_domain (no Sales admission/demotion)")
        if s.get("source_existence_state") != "proved_outside_sales_domain":
            e.append("SW199: source_existence_state must be proved_outside_sales_domain")
        if s.get("acquisition_admission_state") != "not_acquired":
            e.append("SW199: acquisition_admission_state must be not_acquired")
        if s.get("evaluation_state") != "not_measured":
            e.append("SW199: evaluation_state must be not_measured")
        if s.get("report_acceptance_state") != "draft":
            e.append("SW199: report_acceptance_state must be draft")
        for f in NULL_FIELDS:
            if s.get(f) is not None:
                e.append("SW199: %s must be null (no value/grade)" % f)
        for f in FALSE_FIELDS:
            if s.get(f) is not False:
                e.append("SW199: %s must be false" % f)
        if s.get("missing_is_not_zero") is not True or s.get("no_proxy_or_inference") is not True \
                or s.get("no_causal_diagnosis_asserted") is not True:
            e.append("SW199: missing_is_not_zero/no_proxy_or_inference/no_causal_diagnosis_asserted must be true")
        if s.get("direct_source_fields") != []:
            e.append("SW199: direct_source_fields must be [] (no Sales acquisition)")
        if s.get("sales_source_action") != "none":
            e.append("SW199: sales_source_action must be 'none' (no Sales source action)")
        if s.get("preserved") is not True:
            e.append("SW199: preserved must be true")
        if s.get("reopen_in_sales_allowed") is not False:
            e.append("SW199: reopen_in_sales_allowed must be false")
        if s.get("counted_in_evaluated") is not False:
            e.append("SW199: counted_in_evaluated must be false")
        tr = str(s.get("truth_ref", "")).lower()
        if "service-domain-overlay.json" not in tr or "service_domain" not in tr:
            e.append("SW199: truth_ref must cite the service-domain-overlay service_domain (SPEC §3)")
        owners199 = s.get("accountable_owners", {}) or {}
        if s.get("next_action_owner") not in set(owners199.values()):
            e.append("SW199: next_action_owner not among accountable_owners values")
        ia199 = s.get("immediate_action", {}) if isinstance(s.get("immediate_action"), dict) else {}
        if s.get("next_action_owner") != ia199.get("owner"):
            e.append("SW199: next_action_owner != immediate_action.owner")
        if str(s.get("next_action_owner", "")).startswith(("Codex", "Claude Studio")):
            e.append("SW199: next_action_owner must NOT be a Sales acquirer/implementer (Service owner only)")
        # NO Sales source action == no Codex read/acquisition anywhere in the SW-199 metric
        if "codex" in json.dumps(s).lower():
            e.append("SW199: no Codex/Sales source action may appear on SW-199")
        for f in FORBIDDEN_HELD_KEYS:
            if f in s:
                e.append("SW199: forbidden accepted/legacy key '%s' present" % f)
        _owner_checks("SW-199", s, e)
        _vocab_check("SW-199", s, fv, e)

    return e


def legacy_delta_errors(now):
    e = []
    now_s = sorted(now)
    if len(now_s) != len(set(now_s)):
        e.append("legacy: duplicate error entries")
    if len(now_s) != LEGACY_BASELINE_COUNT:
        e.append("legacy: error count %d != pinned %d" % (len(now_s), LEGACY_BASELINE_COUNT))
    canon = hashlib.sha256(json.dumps(now_s, ensure_ascii=False).encode()).hexdigest()
    if canon != LEGACY_BASELINE_SHA:
        e.append("legacy: canonical 30-error signature changed")
    return e


def _probe_defs():
    probes = []
    def add(name, fn): probes.append((name, fn))
    def _set(mid, field, val):
        def _fn(b):
            for m in b["metrics"]:
                if m["id"] == mid: m[field] = val
        return _fn

    _PROT = ("message content is not read; protected-content/nlp envelope; data minimization; stable "
             "identities")
    _REV = "provisional for management human review only; never automatic discipline"
    _COND = ("presently unproved; a finite read-only vinsolutions check first; named external only if "
             "necessary; no proxy")
    _SUP = ("the corpus is known and held as supporting context; labels are not stable linkage")

    def drop_id(b): b["metrics"].pop(0)
    def reorder(b): b["metrics"][0], b["metrics"][1] = b["metrics"][1], b["metrics"][0]
    def dup_id(b): b["metrics"][1]["id"] = b["metrics"][0]["id"]
    def extra_metric_path(b): b["metrics"].append(copy.deepcopy(b["metrics"][0]))
    def cond_drift(b): b["metrics"][0]["canonical_condition"] = "TAMPERED"
    def shrink_295(b): b["packet_accounting_assertion"]["conditions"] = 294
    def shrink_packets(b): b["packet_accounting_assertion"]["packets"] = 29
    def module_drift(b): b["module"] = 6
    def baseline_drift(b): b["pins"]["baseline_commit"] = "0" * 40
    def catalog_pin_drift(b): b["pins"]["catalog_sha256_expected"] = "deadbeef"
    def hash_tamper(b): b["pinned_source_hashes"]["docs/halo/contract/gate2-evaluator-contract.json"] = "x"
    def customer_emit(b): b["customer_emission_authority"] = True
    def customer_proj(b): b["customer_projection"] = {"alert": "fire"}
    def two_delta_break(b): b["two_delta"]["evidence_delta"]["count"] = 1
    def two_delta_of(b): b["two_delta"]["meaning_delta"]["of"] = 9
    def service_parts(b): b["dealer_scope"]["service_parts_admitted"] = 1
    def nissan_scope(b): b["dealer_scope"]["dealer_id"] = "21044"
    def accepted_bucket(b): b["lifecycle_partition"]["accepted_measured_ids"] = ["SW-181"]
    def calc_bucket(b): b["lifecycle_partition"]["calculation_pending_ids"] = ["SW-181"]
    def disp_only_wrong(b): b["lifecycle_partition"]["accepted_disposition_only_ids"] = ["SW-198"]
    def eval_18(b): b["accepted_measured_authority"]["authoritative_evaluated_total"] = 18
    def carry_forward_true(b): b["accepted_measured_authority"]["carry_forward"] = True
    def authority_claim(b): b["authority_absence_assertion"]["in_gate5b_evaluated"] = ["SW-181"]
    def slices_break(b):
        for k in b["source_family_slices"]:
            if b["source_family_slices"][k]:
                b["source_family_slices"][k] = b["source_family_slices"][k][:-1]; break
    def overlay_count_break(b): b["service_domain_overlay_ref"]["member_count"] = 17
    def overlay_member_break(b): b["service_domain_overlay_ref"]["sw_199_member"] = False

    # SW-199 mutations
    def sw199_demote_sip(b): _set("SW-199", "disposition", "source_investigation_pending")(b)
    def sw199_admit_measured(b): _set("SW-199", "disposition", "measured_validated")(b)
    def sw199_value(b): _set("SW-199", "value", 0)(b)
    def sw199_source_action(b): _set("SW-199", "sales_source_action", "codex read-only acquisition")(b)
    def sw199_reopen(b): _set("SW-199", "reopen_in_sales_allowed", True)(b)
    def sw199_counted(b): _set("SW-199", "counted_in_evaluated", True)(b)
    def sw199_codex_owner(b):
        for m in b["metrics"]:
            if m["id"] == "SW-199":
                m["accountable_owners"]["separate_service_workspace_authorization"] = \
                    "Codex VinSolutions controller (read-only source/admission authority; governed acquisition)"
                m["next_action_owner"] = m["accountable_owners"]["separate_service_workspace_authorization"]
                m["immediate_action"]["owner"] = m["next_action_owner"]
    def sw199_truthref(b): _set("SW-199", "truth_ref", "somewhere else")(b)
    def sw199_source_existence(b): _set("SW-199", "source_existence_state", "acquired_local")(b)

    # SIP mutations
    def held_promote(b): _set("SW-181", "disposition", "measured_validated")(b)
    def falsely_promote_supporting(b): _set("SW-182", "source_existence_state", "acquired_local")(b)
    def erase_supporting(b): _set("SW-183", "missing_or_quarantine_evidence",
        [_COND + "; manager note; " + _PROT + "; " + _REV])(b)
    def absolute_source_absence(b): _set("SW-286", "missing_or_quarantine_evidence",
        ["no export exists for this condition; an external source is required"])(b)
    def customer_label_identity(b): _set("SW-181", "missing_or_quarantine_evidence",
        ["labels are stable identity; " + _COND + "; follow-through; chronology; " + _PROT + "; " + _REV])(b)
    def proxy_flag(b): _set("SW-182", "no_proxy_or_inference", False)(b)
    def protected_strip(b): _set("SW-286", "missing_or_quarantine_evidence",
        [_SUP + "; " + _COND + "; sentiment; " + _REV])(b)
    def review_strip_model(b): _set("SW-290", "missing_or_quarantine_evidence",
        [_SUP + "; " + _COND + "; escalation; multiweek; insufficient; " + _PROT])(b)
    def legal_conclusion_claim(b): _set("SW-193", "missing_or_quarantine_evidence",
        [_SUP + "; " + _COND + "; substantiat; " + _PROT + "; " + _REV + "; this is a legal conclusion"])(b)
    def substantiation_as_proof(b): _set("SW-183", "missing_or_quarantine_evidence",
        [_SUP + "; " + _COND + "; manager note; " + _PROT + "; " + _REV.replace("provisional", "definitive")])(b)
    def lifecycle_label(b): _set("SW-198", "missing_or_quarantine_evidence",
        [_SUP + "; " + _COND + "; sentiment; " + _PROT + "; " + _REV])(b)
    def multiweek_strip(b): _set("SW-290", "missing_or_quarantine_evidence",
        [_SUP + "; " + _COND + "; escalation; " + _PROT + "; " + _REV])(b)
    def held_value(b): _set("SW-181", "value", 0)(b)
    def held_threshold(b): _set("SW-290", "threshold", 2)(b)
    def held_detection(b): _set("SW-286", "detection_rule", "fire")(b)
    def held_display(b): _set("SW-181", "future_display_eligibility", True)(b)
    def held_acquire(b): _set("SW-182", "direct_source_fields", ["x"])(b)
    def held_missing_zero(b): _set("SW-183", "missing_is_not_zero", False)(b)
    def held_authoritative(b): _set("SW-193", "authoritative", True)(b)
    def held_report_state(b): _set("SW-198", "report_acceptance_state", "accepted")(b)
    def held_recomputed(b): _set("SW-286", "recomputed_this_tranche", True)(b)
    def held_next_owner_mismatch(b): _set("SW-181", "next_action_owner", "Someone else")(b)
    def quarantine_use(b): _set("SW-182", "source_family_intent", "lead_source_roi")(b)
    def marker_strip(b): _set("SW-183", "missing_or_quarantine_evidence", ["something vague"])(b)
    def causal_fact(b): _set("SW-181", "business_question", "broken promise confirmed present")(b)
    def held_vocab(b): _set("SW-182", "source_existence_state", "acquired_local")(b)
    def technical_owner_duane(b):
        for m in b["metrics"]:
            if m["id"] == "SW-286":
                m["immediate_action"] = {"owner": "Duane (x)", "action": "define the join and prove the stable-key cardinality"}
    def unproved_intent_break(b): _set("SW-181", "source_family_intent", "promise_followthrough")(b)

    struct = [
        ("drop_id", drop_id), ("reorder", reorder), ("duplicate_id", dup_id),
        ("extra_metric_path", extra_metric_path), ("condition_drift", cond_drift),
        ("shrink_295", shrink_295), ("shrink_packets", shrink_packets), ("module_drift", module_drift),
        ("baseline_drift", baseline_drift), ("catalog_pin_drift", catalog_pin_drift), ("hash_tamper", hash_tamper),
        ("customer_emission", customer_emit), ("customer_projection", customer_proj),
        ("two_delta_nonzero", two_delta_break), ("two_delta_of_wrong", two_delta_of),
        ("service_parts_admitted", service_parts), ("nissan_scope", nissan_scope),
        ("accepted_bucket_nonempty", accepted_bucket), ("calc_bucket_nonempty", calc_bucket),
        ("disposition_only_wrong_member", disp_only_wrong),
        ("authoritative_evaluated_18", eval_18), ("carry_forward_true", carry_forward_true),
        ("authority_absence_false_claim", authority_claim), ("slices_incomplete", slices_break),
        ("overlay_count_break", overlay_count_break), ("overlay_member_break", overlay_member_break),
        ("sw199_demote_to_sip", sw199_demote_sip), ("sw199_admit_measured", sw199_admit_measured),
        ("sw199_value", sw199_value), ("sw199_sales_source_action", sw199_source_action),
        ("sw199_reopen_in_sales", sw199_reopen), ("sw199_counted_in_evaluated", sw199_counted),
        ("sw199_codex_owner", sw199_codex_owner), ("sw199_truthref_drift", sw199_truthref),
        ("sw199_source_existence_promote", sw199_source_existence),
        ("held_promote", held_promote), ("falsely_promote_supporting", falsely_promote_supporting),
        ("erase_supporting_evidence", erase_supporting), ("absolute_source_absence_claim", absolute_source_absence),
        ("customer_label_as_identity", customer_label_identity), ("proxy_flag", proxy_flag),
        ("protected_content_strip", protected_strip), ("review_discipline_strip", review_strip_model),
        ("legal_conclusion_claim", legal_conclusion_claim), ("substantiation_as_proof", substantiation_as_proof),
        ("lifecycle_label_identity", lifecycle_label), ("multiweek_strip", multiweek_strip),
        ("held_value", held_value), ("held_threshold", held_threshold), ("held_detection", held_detection),
        ("held_future_display", held_display), ("held_invent_source_field", held_acquire),
        ("held_missing_equals_zero", held_missing_zero), ("held_authoritative", held_authoritative),
        ("held_report_state", held_report_state), ("held_recomputed", held_recomputed),
        ("held_next_owner_mismatch", held_next_owner_mismatch), ("quarantined_family_use", quarantine_use),
        ("held_blocker_marker_strip", marker_strip), ("causal_accusation_fact", causal_fact),
        ("held_vocab_inconsistency", held_vocab), ("technical_ownership_to_duane", technical_owner_duane),
        ("unproved_intent_break", unproved_intent_break),
    ]
    for n, f in struct:
        add(n, f)
    return probes


def _legacy_probe_defs(legacy_now):
    if legacy_now is None:
        return []
    base = sorted(legacy_now)
    return [
        ("legacy_same_count_substitution", base[:-1] + ["ledger SW-999: fabricated swap error"]),
        ("legacy_new_error_added", base + ["ledger SW-181: source SRC-x not registered"]),
        ("legacy_removed_error", base[:-1]),
    ]


def _git(args):
    return subprocess.run(["git", "-C", ROOT] + args, capture_output=True, text=True)
def _is_claude(p):
    return p == ".claude" or p.startswith(".claude/")


def main():
    no_write = "--no-write" in sys.argv
    ctx = _load_ctx()
    b = load(BINDING_REL)
    errors = run_structural(b, ctx)

    if sha256("docs/halo/contract/semantic-watchdog-feasibility-matrix-295.json") != CATALOG_SHA_EXPECTED:
        errors.append("CATALOG: feasibility matrix sha != pinned expected")
    if b.get("pins", {}).get("catalog_sha256_expected") != CATALOG_SHA_EXPECTED:
        errors.append("CATALOG: binding pins.catalog_sha256_expected != expected")
    if b.get("pins", {}).get("baseline_commit") != BASELINE_COMMIT:
        errors.append("BASELINE: binding pins.baseline_commit != %s" % BASELINE_COMMIT)

    hash_ok = True; hash_detail = {}
    for rel, exp in PINNED.items():
        got = sha256(rel)
        hash_detail[rel] = {"expected": exp, "got": got, "match": got == exp}
        if got != exp:
            hash_ok = False; errors.append("HASH: %s expected %s got %s" % (rel, exp, got))
    if b.get("pinned_source_hashes") != PINNED:
        errors.append("HASH: binding pinned_source_hashes != computed pins")

    overlay_sha = sha256(SERVICE_OVERLAY_REL)
    service_domain_ids = ctx["service_domain_ids"]
    if len(service_domain_ids) != SERVICE_DOMAIN_EXPECTED_COUNT or "SW-199" not in service_domain_ids:
        errors.append("OVERLAY: live service_domain overlay membership/count invalid")

    allowlist_absent = {}
    for f in ALLOWLIST:
        absent = _git(["cat-file", "-e", "%s:%s" % (BASELINE_COMMIT, f)]).returncode != 0
        allowlist_absent[f] = absent
        if not absent:
            errors.append("ALLOWLIST: %s existed at baseline (CREATE-only)" % f)
    guard_existing = _git(["cat-file", "-e", "%s:%s" % (BASELINE_COMMIT, "docs/halo/contract/phase1b/master-ledger-295.json")]).returncode == 0
    guard_new = _git(["cat-file", "-e", "%s:%s" % (BASELINE_COMMIT, BINDING_REL)]).returncode != 0
    overwrite_guard_selftest = bool(guard_existing and guard_new)
    if not overwrite_guard_selftest:
        errors.append("SELFCHECK: overwrite guard predicate broken")

    diff_wt = set(_git(["diff", "--name-only", BASELINE_COMMIT]).stdout.split())
    porcelain = _git(["status", "--porcelain", "-uall"]).stdout.splitlines()
    untracked = set(ln[3:] for ln in porcelain if ln.startswith("??"))
    changed = {p for p in (diff_wt | untracked) if not _is_claude(p)}
    out_of_allowlist = sorted(changed - set(ALLOWLIST))
    if out_of_allowlist:
        errors.append("ALLOWLIST: changes outside allowlist vs baseline: %r" % out_of_allowlist)

    staged = set(_git(["diff", "--cached", "--name-only"]).stdout.split())
    claude_staged = any(_is_claude(s) for s in staged)
    if claude_staged:
        errors.append("ALLOWLIST: .claude staged")
    staged_out = sorted(s for s in staged if s not in ALLOWLIST and not _is_claude(s))
    if staged_out:
        errors.append("ALLOWLIST: staged paths outside allowlist: %r" % staged_out)

    preserve_ok = True
    for f in PRESERVE:
        if _git(["diff", "--name-only", BASELINE_COMMIT, "--", f]).stdout.strip():
            preserve_ok = False; errors.append("PRESERVE: %s modified vs baseline" % f)

    for f in ALLOWLIST:
        if f == CHECKS_REL:
            continue
        if not os.path.exists(P(f)):
            errors.append("ALLOWLIST: required file missing: %s" % f)

    dc = _git(["diff", "--check"])
    if dc.returncode != 0 and dc.stdout.strip():
        errors.append("GIT_DIFF_CHECK: %s" % dc.stdout.strip().splitlines()[0])

    legacy_now = None
    legacy_out = subprocess.run([sys.executable, P(LEGACY_REL), "--no-write"], capture_output=True, text=True)
    try:
        legacy_now = json.JSONDecoder().raw_decode(legacy_out.stdout.lstrip())[0].get("errors", [])
    except Exception:  # noqa: BLE001
        errors.append("LEGACY: could not parse validate_phase1b.py output")
    if legacy_now is not None:
        errors.extend(legacy_delta_errors(legacy_now))

    probe_results = []; probe_fail = 0
    for name, fn in _probe_defs():
        mut = copy.deepcopy(b)
        try:
            fn(mut); merr = run_structural(mut, ctx)
        except Exception as ex:  # noqa: BLE001
            merr = ["exception:%s" % ex]
        caught = len(merr) > 0
        probe_results.append({"probe": name, "kind": "structural", "rejected": caught})
        if not caught:
            probe_fail += 1; errors.append("PROBE: %s NOT rejected" % name)
    for name, synth in _legacy_probe_defs(legacy_now):
        caught = len(legacy_delta_errors(synth)) > 0
        probe_results.append({"probe": name, "kind": "legacy", "rejected": caught})
        if not caught:
            probe_fail += 1; errors.append("PROBE: %s NOT rejected (legacy)" % name)

    result = "PASS" if not errors else "FAIL"
    receipt = {
        "artifact": "PKT-07-03_BINDING_CHECKS", "validator": VALIDATOR_REL,
        "baseline_commit": BASELINE_COMMIT, "binding": BINDING_REL, "result": result,
        "error_count": len(errors), "errors": errors,
        "structural_error_count": len(run_structural(b, ctx)),
        "checks": {
            "ids_order_membership": IDS, "accounting": b.get("packet_accounting_assertion"),
            "module": b.get("module"), "dealer_scope": b.get("dealer_scope"),
            "accepted_measured_ids": [], "accepted_disposition_only_ids": DISPOSITION_ONLY_IDS,
            "source_investigation_pending_ids": SIP_IDS,
            "supporting_ids": SUPPORTING_IDS, "conditional_source_ids": CONDITIONAL_SOURCE_IDS,
            "protected_future_ids": PROTECTED_FUTURE_IDS, "review_ids": REVIEW_IDS,
            "substantiation_ids": SUBSTANTIATION_IDS, "compliance_id": COMPLIANCE_ID,
            "lifecycle_id": LIFECYCLE_ID, "multiweek_id": MULTIWEEK_ID,
            "slices": EXPECTED_SLICES,
            "authoritative_evaluated_total": b.get("accepted_measured_authority", {}).get("authoritative_evaluated_total"),
            "carry_forward": b.get("accepted_measured_authority", {}).get("carry_forward"),
            "authority_absence": {
                "in_gate2_evaluable_conditions": sorted(set(IDS) & ctx["g2_ids"]),
                "in_baseline_operational_targets": sorted(set(IDS) & ctx["br_metric_ids"]),
                "in_gate5b_evaluated": sorted(set(IDS) & ctx["g5_eval_ids"]),
            },
            "service_domain_overlay": {
                "file": SERVICE_OVERLAY_REL, "sha256": overlay_sha,
                "member_count": len(service_domain_ids), "sw_199_member": "SW-199" in service_domain_ids,
                "members": service_domain_ids,
            },
            "sw_199_outside_sales_domain": {
                "disposition": (by199 := next((m for m in b.get("metrics", []) if m.get("id") == "SW-199"), {})).get("disposition"),
                "source_existence_state": by199.get("source_existence_state"),
                "acquisition_admission_state": by199.get("acquisition_admission_state"),
                "evaluation_state": by199.get("evaluation_state"),
                "sales_source_action": by199.get("sales_source_action"),
                "preserved": by199.get("preserved"),
                "counted_in_evaluated": by199.get("counted_in_evaluated"),
                "next_action_owner": by199.get("next_action_owner"),
            },
            "two_delta": b.get("two_delta"), "pinned_hashes_ok": hash_ok,
            "prior_packets_preserved": preserve_ok, "allowlist_absent_at_baseline": allowlist_absent,
            "out_of_allowlist_changes": out_of_allowlist, "claude_staged": claude_staged,
            "overwrite_guard_selftest": overwrite_guard_selftest,
        },
        "legacy_validate_phase1b": {
            "file": LEGACY_REL, "pinned_baseline_count": LEGACY_BASELINE_COUNT,
            "pinned_baseline_signature_sha256": LEGACY_BASELINE_SHA,
            "now_error_count": (len(legacy_now) if legacy_now is not None else None), "delta_new": 0,
            "exactness": "post-J1 == pinned canonical 30-error signature UNION 0 new; same-count substitution rejected",
        },
        "pinned_source_hashes": hash_detail,
        "probe_total": len(probe_results), "probe_rejected": len(probe_results) - probe_fail,
        "probe_not_rejected": probe_fail, "probes": probe_results,
    }
    out = json.dumps(receipt, indent=2, ensure_ascii=False, sort_keys=True)
    if not no_write:
        os.makedirs(os.path.dirname(P(CHECKS_REL)), exist_ok=True)
        with open(P(CHECKS_REL), "w") as f:
            f.write(out + "\n")
    print(out)
    print("\nRESULT:", result, "| errors:", len(errors),
          "| probes rejected:", len(probe_results) - probe_fail, "/", len(probe_results))
    return 0 if result == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
