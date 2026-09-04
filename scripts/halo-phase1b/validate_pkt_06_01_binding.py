#!/usr/bin/env python3
"""PKT-06-01 J1 freeze-candidate binding validator (compact, non-recursive).

One accepted carry-forward (SW-142, deep-equal to live Gate 5B; only authority). Eleven held
source_investigation_pending: communication corpus supporting-only (never promoted; 15-field source
lacks stable IDs; customer/provisional labels are not identity); conditional presently-not-proved
wording; protected-content (no content read) for 070-075/077/078/143/144; SW-076 metadata-only
(no measurement without stable chronology). Hypothesis/rule vocabulary is not a diagnosis.

Usage:
  python3 scripts/halo-phase1b/validate_pkt_06_01_binding.py            # writes CHECKS
  python3 scripts/halo-phase1b/validate_pkt_06_01_binding.py --no-write # validate only
"""
import json, copy, hashlib, subprocess, sys, os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
def P(rel): return os.path.join(ROOT, rel)
def load(rel): return json.load(open(P(rel)))
def sha256(rel):
    h = hashlib.sha256()
    with open(P(rel), "rb") as f:
        for c in iter(lambda: f.read(65536), b""):
            h.update(c)
    return h.hexdigest()

BASELINE_COMMIT = "6a22f0067a372a78f8aa9d76a044aeb4f27d6327"
BINDING_REL = "docs/halo/contract/phase1b/pkt-06-01-binding.json"
VALIDATOR_REL = "scripts/halo-phase1b/validate_pkt_06_01_binding.py"
CHECKS_REL = "docs/halo/evidence/honda-watchdog/phase1b/pkt-06-01/PKT-06-01_BINDING_CHECKS.json"
TWO_DELTA_REL = "docs/halo/evidence/honda-watchdog/phase1b/pkt-06-01/PKT-06-01_J1_TWO_DELTA.md"
ROADMAP_REL = "docs/halo/evidence/honda-watchdog/phase1b/pkt-06-01/PKT-06-01_J1_internal_coverage_roadmap.md"
ALLOWLIST = [BINDING_REL, VALIDATOR_REL, CHECKS_REL, TWO_DELTA_REL, ROADMAP_REL]

IDS = ["SW-070","SW-071","SW-072","SW-073","SW-074","SW-075","SW-076","SW-077","SW-078","SW-142","SW-143","SW-144"]
ACCEPTED_IDS = ["SW-142"]
SIP_IDS = [i for i in IDS if i not in ACCEPTED_IDS]
SUPPORTING_IDS = list(SIP_IDS)
CONDITIONAL_SOURCE_IDS = list(SIP_IDS)
PROTECTED_FUTURE_IDS = ["SW-070","SW-071","SW-072","SW-073","SW-074","SW-075","SW-077","SW-078","SW-143","SW-144"]
METADATA_ONLY_ID = "SW-076"

EXPECTED_SLICES = {
    "sentiment_and_churn_language": ["SW-070","SW-071"],
    "price_friction_and_escalation": ["SW-072","SW-073"],
    "complaint_and_repeated_questions": ["SW-074","SW-075"],
    "thread_timing_and_silence": ["SW-076","SW-077"],
    "language_and_personalization": ["SW-078","SW-142"],
    "answer_and_context_quality": ["SW-143","SW-144"],
}

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
JOIN_TECH_TOKENS = ("join design", "join definition", "define the join", "join implementation",
                    "implement the join", "cardinality", "source key", "source-key", "technical join",
                    "key proof", "nlp implementation", "scoring implementation", "reconciliation implementation",
                    "thread reconstruction")
ABSOLUTE_SOURCE_CLAIMS = ("export exists", "export was found", "does not exist", "already required",
                          "already requires", "external source is required", "requires a named external",
                          "requires an external", "must be external", "must use an external",
                          "no vinsolutions export", "data does not exist", "export does not exist",
                          "permanently unavailable")
HELD_MARKERS = {
    "SW-070": ["presently","supporting","sentiment"], "SW-071": ["presently","supporting","churn"],
    "SW-072": ["presently","supporting","friction"], "SW-073": ["presently","supporting","escalation"],
    "SW-074": ["presently","supporting","complaint"], "SW-075": ["presently","supporting","repeated"],
    "SW-076": ["presently","supporting","latency"], "SW-077": ["presently","supporting","silence"],
    "SW-078": ["presently","supporting","language"], "SW-143": ["presently","supporting","answer"],
    "SW-144": ["presently","supporting","context"],
}
CAUSAL_TOKEN = {"SW-070": "negative sentiment", "SW-071": "churn", "SW-075": "rep not answering"}
ASSERTIVE = ("confirmed","established","proven","diagnosed","caused by","because",
             "due to","is the cause","present because","verified")
NEGATION = ("not ","no ","never","non-","must not","cannot","is not")
FORBIDDEN_HELD_KEYS = ("peer_rank","industry_reference","text","label","variance","metric_slug",
                       "source_family","j2_quarantine","current_truth_ref","held_source_evidence_ref")
ACCEPTED_FORBIDDEN_TOPLEVEL = ("peer_rank","industry_reference","text","label","variance")


def _load_ctx():
    g2 = load("docs/halo/contract/gate2-evaluator-contract.json")["evaluable_conditions"]
    br_list = load("docs/halo/contract/baseline-registry.json")["operational_targets"]
    g5 = load("docs/halo/evidence/m1r/gate5b/gate5b-report-model-21043.json")
    return {
        "catalog": load("docs/halo/contract/semantic-watchdog-feasibility-matrix-295.json"),
        "g2_ids": set(g2.keys()) if isinstance(g2, dict) else set(),
        "g5": g5,
        "g5_eval": {x.get("metric_id"): x for x in g5.get("evaluated", [])},
        "g5_eval_ids": set(x.get("metric_id") for x in g5.get("evaluated", [])),
        "br_metric_ids": set(it.get("metric_id") for it in br_list),
        "fv": load("docs/halo/contract/phase1/frozen-vocabularies.json")["closed_vocabularies"],
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


def run_structural(b, ctx):
    e = []
    cat = _cat_map(ctx["catalog"])
    g5, fv = ctx["g5"], ctx["fv"]
    metrics = b.get("metrics", [])
    mids = [m.get("id") for m in metrics]

    if mids != IDS:
        e.append("IDS: metrics order/membership != exact 12 %r" % (mids,))
    if b.get("packet_membership_order") != IDS:
        e.append("IDS: packet_membership_order != exact 12")
    if len(set(mids)) != len(mids):
        e.append("IDS: duplicate id present")
    if b.get("module") != 6:
        e.append("MODULE: module != 6")

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
    if td.get("evidence_delta", {}).get("of") != 12 or td.get("meaning_delta", {}).get("of") != 12:
        e.append("TWO_DELTA: delta 'of' must be 12")

    blob = json.dumps({k: v for k, v in b.items() if k != "cross_dealer_exclusion"}).lower()
    for tok in ("21044","21047","serra-nissan","tony-serra-ford"):
        if tok in blob:
            e.append("CROSS_DEALER: forbidden dealer token in scope: %s" % tok)

    lp = b.get("lifecycle_partition", {})
    bkts = ["accepted_measured_ids","accepted_disposition_only_ids","rejected_ids",
            "source_investigation_pending_ids","calculation_pending_ids"]
    allp = [i for k in bkts for i in lp.get(k, [])]
    if sorted(allp) != sorted(IDS) or len(set(allp)) != len(allp):
        e.append("PARTITION: buckets not disjoint / do not cover exactly 12")
    if lp.get("accepted_measured_ids") != ACCEPTED_IDS:
        e.append("PARTITION: accepted_measured_ids != [SW-142]")
    if lp.get("accepted_disposition_only_ids") != [] or lp.get("rejected_ids") != [] or lp.get("calculation_pending_ids") != []:
        e.append("PARTITION: accepted_disposition_only/rejected/calculation_pending must be empty")
    if sorted(lp.get("source_investigation_pending_ids", [])) != sorted(SIP_IDS):
        e.append("PARTITION: source_investigation_pending_ids != the eleven held")

    ama = b.get("accepted_measured_authority", {})
    if ama.get("ids") != ACCEPTED_IDS:
        e.append("ACCEPTED: accepted_measured_authority.ids != [SW-142]")
    if ama.get("authoritative_evaluated_total") != 17:
        e.append("ACCEPTED: authoritative_evaluated_total != 17")
    if g5.get("coverage", {}).get("evaluated") != 17:
        e.append("ACCEPTED: live gate5b coverage.evaluated != 17 (=%r)" % (g5.get("coverage", {}).get("evaluated"),))

    in_g2 = sorted(set(SIP_IDS) & ctx["g2_ids"])
    in_br = sorted(set(SIP_IDS) & ctx["br_metric_ids"])
    in_g5 = sorted(set(SIP_IDS) & ctx["g5_eval_ids"])
    if in_g2 or in_br or in_g5:
        e.append("AUTHORITY_ABSENCE: held target present in authority g2=%r br=%r g5=%r" % (in_g2, in_br, in_g5))
    missing_acc = [m for m in ACCEPTED_IDS if m not in ctx["g5_eval_ids"]]
    if missing_acc:
        e.append("ACCEPTED: accepted ids not in live gate5b evaluated: %r" % (missing_acc,))
    aa = b.get("authority_absence_assertion", {})
    if sorted(aa.get("ids_checked", [])) != sorted(SIP_IDS):
        e.append("AUTHORITY_ABSENCE: ids_checked != the eleven held")
    if aa.get("in_gate2_evaluable_conditions") != in_g2 \
            or aa.get("in_baseline_operational_targets") != in_br \
            or aa.get("in_gate5b_evaluated") != in_g5:
        e.append("AUTHORITY_ABSENCE: binding assertion != live computed intersections")

    sl = b.get("source_family_slices", {})
    if sl != EXPECTED_SLICES:
        e.append("SLICES: source_family_slices != the exact six expected slices/membership")
    sids = [i for v in sl.values() for i in v]
    if len(sids) != 12 or len(set(sids)) != 12 or sorted(sids) != sorted(IDS):
        e.append("SLICES: do not partition the 12 ids")

    by = {m["id"]: m for m in metrics if "id" in m}

    for mid in IDS:
        m = by.get(mid)
        if m is None:
            e.append("MISSING metric %s" % mid); continue
        if m.get("canonical_condition") != cat.get(mid):
            e.append("COND: %s canonical_condition != catalog" % mid)
        owners = m.get("accountable_owners", {}) or {}

        if mid in ACCEPTED_IDS:
            ev = ctx["g5_eval"].get(mid)
            if ev is None:
                e.append("ACC %s: no live gate5b evaluated entry" % mid)
            else:
                if m.get("accepted_evaluation") != ev:
                    e.append("ACC %s: accepted_evaluation != live gate5b evaluated (deep-equal)" % mid)
                ot = ev.get("operational_target", {}); evd = ev.get("evidence", {})
                bind = {"value": ev.get("value"), "value_display": ev.get("value_display"),
                        "unit": ev.get("unit"), "rating": ev.get("rating"),
                        "grade_value_or_range": ev.get("rating"),
                        "numerator": evd.get("numerator"), "denominator": evd.get("denominator"),
                        "threshold": ot.get("value"), "comparator": ot.get("comparator"),
                        "direction": ot.get("direction")}
                for f, exp in bind.items():
                    if m.get(f) != exp:
                        e.append("ACC %s: top-level '%s' not bound to gate5b authority (%r != %r)" % (mid, f, m.get(f), exp))
                det = ("%s: authoritative evaluated ratio vs %s %s (%s); carried forward, not recomputed."
                       % (mid, ot.get("comparator"), ot.get("value"), ot.get("direction")))
                if m.get("detection_rule") != det:
                    e.append("ACC %s: detection_rule not deterministically bound to gate5b OT" % mid)
            acc_states = {"disposition": "measured_validated", "source_existence_state": "acquired_local",
                          "acquisition_admission_state": "admitted_held", "evaluation_state": "measured_graded",
                          "report_acceptance_state": "accepted"}
            for f, exp in acc_states.items():
                if m.get(f) != exp:
                    e.append("ACC %s: %s must be %r (got %r)" % (mid, f, exp, m.get(f)))
            acc_bool = {"authoritative": True, "carry_forward": True, "recomputed_this_tranche": False,
                        "future_display_eligibility": True, "customer_projection_authored_this_tranche": False}
            for f, exp in acc_bool.items():
                if m.get(f) is not exp:
                    e.append("ACC %s: %s must be %r" % (mid, f, exp))
            if m.get("grade_target_id") != "GT-" + mid:
                e.append("ACC %s: grade_target_id != GT-%s" % (mid, mid))
            if m.get("grade_basis") != "operational_target":
                e.append("ACC %s: grade_basis must be operational_target" % mid)
            if m.get("gate2_anchor") is not None or m.get("ot_anchor") is not None:
                e.append("ACC %s: gate2_anchor/ot_anchor must be null (no gate2/baseline authority exists)" % mid)
            if m.get("formula") is not None:
                e.append("ACC %s: formula must be null" % mid)
            if m.get("direct_source_fields") != []:
                e.append("ACC %s: direct_source_fields must be []" % mid)
            if "gate5b" not in str(m.get("current_truth_ref", "")):
                e.append("ACC %s: current_truth_ref must name gate5b" % mid)
            for f in ACCEPTED_FORBIDDEN_TOPLEVEL:
                if f in m:
                    e.append("ACC %s: legacy field '%s' surfaced at top level" % (mid, f))
            ia = m.get("immediate_action", {}) if isinstance(m.get("immediate_action"), dict) else {}
            if m.get("next_action_owner") != ia.get("owner"):
                e.append("ACC %s: next_action_owner != immediate_action.owner" % mid)
            if m.get("next_action_owner") not in set(owners.values()):
                e.append("ACC %s: next_action_owner not among accountable_owners values" % mid)
        else:
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
            for f in ("value","value_display","numerator","denominator","formula","threshold",
                      "comparator","direction","grade_target_id","grade_basis","grade_value_or_range",
                      "detection_rule","ot_anchor","gate2_anchor","accepted_evaluation"):
                if m.get(f) is not None:
                    e.append("HELD %s: %s must be null (missing != zero, no value/grade/baseline)" % (mid, f))
            for f in ("authoritative","carry_forward","gradable","value_allowed","grade_allowed",
                      "narrative_allowed","customer_projection_allowed","future_display_eligibility",
                      "customer_projection_authored_this_tranche","recomputed_this_tranche"):
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
                for need in ("presently", "read-only", "vinsolutions", "external", "proxy"):
                    if need not in joined:
                        e.append("HELD %s: conditional-source evidence must contain '%s'" % (mid, need))
            if mid in SUPPORTING_IDS:
                if "supporting" not in joined:
                    e.append("SUPPORT %s: must preserve corpus/component evidence as SUPPORTING context" % mid)
                if not any(t in joined for t in ("known","corpus","context","component")):
                    e.append("SUPPORT %s: must name the known corpus/component/context evidence" % mid)
                if "not stable linkage" not in joined:
                    e.append("SUPPORT %s: must state customer/provisional labels are not stable linkage" % mid)
            if mid in PROTECTED_FUTURE_IDS:
                for need in ("not read", "protected-content", "envelope", "stable", "minimization"):
                    if need not in joined:
                        e.append("PROTECTED %s: content-dependent evidence must contain '%s'" % (mid, need))
                if not any(who == DUANE_ROLE and "protected_content" in role for role, who in owners.items()):
                    e.append("PROTECTED %s: requires a Duane protected-content authorization role" % mid)
            if mid == METADATA_ONLY_ID:
                for need in ("metadata", "chronology"):
                    if need not in joined:
                        e.append("METADATA %s: must state metadata-only proof and no measurement without stable chronology ('%s')" % (mid, need))

            ia = m.get("immediate_action", {}) if isinstance(m.get("immediate_action"), dict) else {}
            if m.get("next_action_owner") != ia.get("owner"):
                e.append("HELD %s: next_action_owner != immediate_action.owner" % mid)
            if m.get("next_action_owner") not in set(owners.values()):
                e.append("HELD %s: next_action_owner not among accountable_owners values" % mid)

            if mid in CAUSAL_TOKEN:
                tok = CAUSAL_TOKEN[mid]
                def _strings(v):
                    if isinstance(v, str): yield v
                    elif isinstance(v, list):
                        for x in v: yield from _strings(x)
                    elif isinstance(v, dict):
                        for x in v.values(): yield from _strings(x)
                for k, v in m.items():
                    if k == "canonical_condition":
                        continue
                    for s in _strings(v):
                        sl = s.lower()
                        if tok in sl and any(a in sl for a in ASSERTIVE) and not any(n in sl for n in NEGATION):
                            e.append("CAUSAL %s: causal label '%s' asserted as fact: %r" % (mid, tok, s))

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

    def drop_id(b): b["metrics"].pop(0)
    def reorder(b): b["metrics"][0], b["metrics"][1] = b["metrics"][1], b["metrics"][0]
    def dup_id(b): b["metrics"][1]["id"] = b["metrics"][0]["id"]
    def cond_drift(b): b["metrics"][0]["canonical_condition"] = "TAMPERED"
    def shrink_295(b): b["packet_accounting_assertion"]["conditions"] = 294
    def shrink_packets(b): b["packet_accounting_assertion"]["packets"] = 29
    def module_drift(b): b["module"] = 5
    def customer_emit(b): b["customer_emission_authority"] = True
    def customer_proj(b): b["customer_projection"] = {"alert": "fire"}
    def two_delta_break(b): b["two_delta"]["evidence_delta"]["count"] = 1
    def service_parts(b): b["dealer_scope"]["service_parts_admitted"] = 1
    def nissan_scope(b): b["dealer_scope"]["dealer_id"] = "21044"
    def accepted_bucket_wrong(b): b["lifecycle_partition"]["accepted_measured_ids"] = ["SW-070"]
    def calc_bucket(b): b["lifecycle_partition"]["calculation_pending_ids"] = ["SW-070"]
    def eval_18(b): b["accepted_measured_authority"]["authoritative_evaluated_total"] = 18
    def authority_claim(b): b["authority_absence_assertion"]["in_gate5b_evaluated"] = ["SW-070"]
    def slices_break(b):
        for k in b["source_family_slices"]:
            if b["source_family_slices"][k]:
                b["source_family_slices"][k] = b["source_family_slices"][k][:-1]; break
    def accepted_value_change(b): _set("SW-142", "value", 0.5)(b)
    def accepted_recompute(b): _set("SW-142", "recomputed_this_tranche", True)(b)
    def accepted_eval_tamper(b): _set("SW-142", "accepted_evaluation", {"tampered": True})(b)
    def accepted_false_anchor(b): _set("SW-142", "gate2_anchor", {"x": 1})(b)
    def accepted_legacy_surface(b): _set("SW-142", "peer_rank", {"rank": 1})(b)
    def accepted_demote(b): _set("SW-142", "disposition", "source_investigation_pending")(b)
    def accepted_condition_drift(b): _set("SW-142", "canonical_condition", 'Rep uses generic template (no merge tag).')(b)
    def held_promote(b): _set("SW-070", "disposition", "measured_validated")(b)
    def erase_supporting(b): _set("SW-071", "missing_or_quarantine_evidence",
        ["the rule is undefined; presently unproved; read-only vinsolutions check; external if needed; no proxy; content not read protected-content envelope stable identities minimization"])(b)
    def falsely_promote_supporting(b): _set("SW-071", "source_existence_state", "acquired_local")(b)
    def absolute_source_absence(b): _set("SW-072", "missing_or_quarantine_evidence",
        ["no export exists for this condition; an external source is required"])(b)
    def technical_owner_duane(b):
        for m in b["metrics"]:
            if m["id"] == "SW-072":
                m["immediate_action"] = {"owner": "Duane (x)", "action": "define the join and prove the stable-key cardinality"}
    def protected_without_authority(b): _set("SW-070", "missing_or_quarantine_evidence",
        ["the corpus is known and held as supporting context; customer labels are not stable linkage; presently unproved; read-only vinsolutions check; external if needed; no proxy"])(b)
    def proxy_join(b): _set("SW-072", "no_proxy_or_inference", False)(b)
    def customer_label_as_identity(b): _set("SW-073", "missing_or_quarantine_evidence",
        ["customer labels are stable identity; read-only vinsolutions check; external if needed; no proxy"])(b)
    def sw076_no_chronology(b): _set("SW-076", "missing_or_quarantine_evidence",
        ["the corpus is known and held as supporting context; customer labels are not stable linkage; presently unproved; read-only vinsolutions check; external if needed; no proxy; latency"])(b)
    def held_value(b): _set("SW-070", "value", 0)(b)
    def held_formula(b): _set("SW-072", "formula", "x/y")(b)
    def held_threshold(b): _set("SW-077", "threshold", 5)(b)
    def held_grade(b): _set("SW-074", "grade_value_or_range", "healthy")(b)
    def held_detection(b): _set("SW-143", "detection_rule", "fire")(b)
    def held_display(b): _set("SW-070", "future_display_eligibility", True)(b)
    def held_acquire(b): _set("SW-076", "direct_source_fields", ["x"])(b)
    def held_missing_zero(b): _set("SW-071", "missing_is_not_zero", False)(b)
    def held_authoritative(b): _set("SW-078", "authoritative", True)(b)
    def held_report_state(b): _set("SW-075", "report_acceptance_state", "accepted")(b)
    def held_recomputed(b): _set("SW-144", "recomputed_this_tranche", True)(b)
    def held_next_owner_mismatch(b): _set("SW-070", "next_action_owner", "Someone else")(b)
    def held_next_owner_not_accountable(b):
        for m in b["metrics"]:
            if m["id"] == "SW-071":
                m["next_action_owner"] = "Ghost"; m["immediate_action"]["owner"] = "Ghost"
    def quarantine_use(b): _set("SW-072", "source_family_intent", "lead_source_roi")(b)
    def marker_strip(b): _set("SW-074", "missing_or_quarantine_evidence", ["something vague"])(b)
    def causal_fact(b): _set("SW-071", "business_question", "confirmed churn present")(b)
    def held_vocab(b): _set("SW-072", "source_existence_state", "acquired_local")(b)
    def held_forbidden_key(b): _set("SW-074", "current_truth_ref", "x")(b)

    struct = [
        ("drop_id", drop_id), ("reorder", reorder), ("duplicate_id", dup_id),
        ("condition_drift", cond_drift), ("shrink_295", shrink_295), ("shrink_packets", shrink_packets),
        ("module_drift", module_drift), ("customer_emission", customer_emit),
        ("customer_projection", customer_proj), ("two_delta_nonzero", two_delta_break),
        ("service_parts_admitted", service_parts), ("nissan_scope", nissan_scope),
        ("accepted_bucket_wrong", accepted_bucket_wrong), ("calc_bucket_nonempty", calc_bucket),
        ("authoritative_evaluated_18", eval_18), ("authority_absence_false_claim", authority_claim),
        ("slices_incomplete", slices_break),
        ("accepted_value_change", accepted_value_change), ("accepted_recompute", accepted_recompute),
        ("accepted_evaluation_tamper", accepted_eval_tamper), ("accepted_false_anchor", accepted_false_anchor),
        ("accepted_legacy_surface", accepted_legacy_surface), ("accepted_demote", accepted_demote),
        ("accepted_condition_drift", accepted_condition_drift),
        ("held_promote", held_promote), ("erase_supporting_evidence", erase_supporting),
        ("falsely_promote_supporting", falsely_promote_supporting),
        ("absolute_source_absence_claim", absolute_source_absence),
        ("technical_ownership_to_duane", technical_owner_duane),
        ("protected_content_without_authority", protected_without_authority),
        ("proxy_join", proxy_join), ("customer_label_as_identity", customer_label_as_identity),
        ("sw076_measurement_without_chronology", sw076_no_chronology),
        ("held_value", held_value), ("held_formula", held_formula), ("held_threshold", held_threshold),
        ("held_grade", held_grade), ("held_detection", held_detection), ("held_future_display", held_display),
        ("held_invent_source_field", held_acquire), ("held_missing_equals_zero", held_missing_zero),
        ("held_authoritative", held_authoritative), ("held_report_state", held_report_state),
        ("held_recomputed", held_recomputed), ("held_next_owner_mismatch", held_next_owner_mismatch),
        ("held_next_owner_not_accountable", held_next_owner_not_accountable),
        ("quarantined_family_use", quarantine_use), ("held_blocker_marker_strip", marker_strip),
        ("causal_diagnosis_fact", causal_fact), ("held_vocab_inconsistency", held_vocab),
        ("held_forbidden_accepted_key", held_forbidden_key),
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
        ("legacy_new_error_added", base + ["ledger SW-070: source SRC-x not registered"]),
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
        "artifact": "PKT-06-01_BINDING_CHECKS", "validator": VALIDATOR_REL,
        "baseline_commit": BASELINE_COMMIT, "binding": BINDING_REL, "result": result,
        "error_count": len(errors), "errors": errors,
        "structural_error_count": len(run_structural(b, ctx)),
        "checks": {
            "ids_order_membership": IDS, "accounting": b.get("packet_accounting_assertion"),
            "module": b.get("module"), "dealer_scope": b.get("dealer_scope"),
            "accepted_measured_ids": ACCEPTED_IDS, "source_investigation_pending_ids": SIP_IDS,
            "supporting_ids": SUPPORTING_IDS, "conditional_source_ids": CONDITIONAL_SOURCE_IDS,
            "protected_future_ids": PROTECTED_FUTURE_IDS, "metadata_only_id": METADATA_ONLY_ID,
            "slices": EXPECTED_SLICES,
            "authoritative_evaluated_total": b.get("accepted_measured_authority", {}).get("authoritative_evaluated_total"),
            "authority_absence_over_held": {
                "in_gate2_evaluable_conditions": sorted(set(SIP_IDS) & ctx["g2_ids"]),
                "in_baseline_operational_targets": sorted(set(SIP_IDS) & ctx["br_metric_ids"]),
                "in_gate5b_evaluated": sorted(set(SIP_IDS) & ctx["g5_eval_ids"]),
            },
            "accepted_in_gate5b": [m for m in ACCEPTED_IDS if m in ctx["g5_eval_ids"]],
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
