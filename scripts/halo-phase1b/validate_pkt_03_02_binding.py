#!/usr/bin/env python3
"""PKT-03-02 J1 freeze-candidate binding validator (compact, non-recursive).

Validates docs/halo/contract/phase1b/pkt-03-02-binding.json against live repository
authorities at baseline f1119dba, enforces the exact 5-file CREATE-only allowlist,
runs deterministic adversarial mutation probes, and writes a deterministic CHECKS
receipt. A second run with --no-write reproduces the receipt byte-for-byte.

Usage:
  python3 scripts/halo-phase1b/validate_pkt_03_02_binding.py            # writes CHECKS
  python3 scripts/halo-phase1b/validate_pkt_03_02_binding.py --no-write # validate only
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

BASELINE_COMMIT = "f1119dba71d0fe195eab250a33c139197fe1d692"
BINDING_REL = "docs/halo/contract/phase1b/pkt-03-02-binding.json"
CHECKS_REL = "docs/halo/evidence/honda-watchdog/phase1b/pkt-03-02/PKT-03-02_BINDING_CHECKS.json"
VALIDATOR_REL = "scripts/halo-phase1b/validate_pkt_03_02_binding.py"
TWO_DELTA_REL = "docs/halo/evidence/honda-watchdog/phase1b/pkt-03-02/PKT-03-02_J1_TWO_DELTA.md"
ROADMAP_REL = "docs/halo/evidence/honda-watchdog/phase1b/pkt-03-02/PKT-03-02_J1_internal_coverage_roadmap.md"
ALLOWLIST = [BINDING_REL, VALIDATOR_REL, CHECKS_REL, TWO_DELTA_REL, ROADMAP_REL]

IDS = ["SW-043","SW-044","SW-045","SW-046","SW-113","SW-114",
       "SW-121","SW-122","SW-123","SW-125","SW-126","SW-154"]
ACCEPTED = ["SW-045","SW-046"]
HELD = [i for i in IDS if i not in ACCEPTED]
OT_ID = {"SW-045":"OT-SW-045","SW-046":"OT-SW-046"}

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
        "747b6d31796939ae29f3a31a0f57226e57342ad7c2b1a1737e05287a5af59d13",
    "docs/halo/evidence/m1r/scheduled/native-scheduled-evidence.json":
        "13c0fca11241c5608d7da1e434383a4e881c886ecbd696414bebdd5a8db636c6",
}

PRESERVE = [
    "docs/halo/contract/phase1b/pkt-02-03-binding.json",
    "docs/halo/evidence/honda-watchdog/phase1b/pkt-02-03/PKT-02-03_SW-137_DISCOVERY_RESULT.json",
    "docs/halo/evidence/honda-watchdog/phase1b/pkt-02-03/PKT-02-03_SW-140_DISCOVERY_RESULT.json",
]

# Duane may hold ONLY business/design/protected-content/threshold decisions.
DUANE_STEMS = ("acquir","acquisit","investigat","accumulat","admit","admiss",
               "normaliz","promot","calculat","implement")
QUARANTINED = ["cage_kpi","lead_source_roi","sales_comm_log"]
CROSS_DEALER = ["21044","21047","serra-nissan","tony-serra-ford","nissan","ford"]

# per-held robust markers that must be present in missing_or_quarantine_evidence text
HELD_MARKERS = {
    "SW-043": ["same-day","three", "single-week"],
    "SW-044": ["operating hours","timestamp","comparison"],
    "SW-113": ["high","low","threshold"],
    "SW-114": ["high","low","close"],
    "SW-121": ["kpi universe","2-sigma","soft-alert"],
    "SW-122": ["kpi universe","3-sigma","hard-alert"],
    "SW-123": ["kpi universe","drift","trend-alert"],
    "SW-125": ["metric pairs","correlation","decoupling"],
    "SW-126": ["segment universe","anomaly method","root-cause"],
    "SW-154": ["content","envelope","stable"],
}
CAUSAL_TOKEN = {  # catalog causal business labels that must not be asserted as fact
    "SW-113": "quality-of-set",
    "SW-114": "desking",
    "SW-126": "root-cause",
}
ASSERTIVE = ("confirmed","established","proven","diagnosed","caused by","because",
             "due to","is the cause","present because","verified")
NEGATION = ("not ","no ","never","non-","must not","cannot","is not")

# defect-1: accepted top-level convenience fields must be EXACTLY bound to frozen authorities.
# forbidden top-level keys that would surface quarantined legacy facts as usable
ACC_FORBIDDEN_TOPLEVEL = ("peer_rank","industry_reference","text","label","variance")
# defect-3: J2 quarantine contract on the byte-carried accepted_evaluation
Q_FORBIDDEN_USES = ["calculation","narrative","display","ranking","source_attribution","customer_projection"]
Q_PERMITTED_J2 = ["value","evidence.numerator","evidence.denominator"]
Q_MUST_QUARANTINE = ["peer_rank","industry_reference","text","label","evidence.source"]
LEGACY_SOURCE_LABEL = "CRM Sales report"


def _load_ctx():
    return {
        "catalog": load("docs/halo/contract/semantic-watchdog-feasibility-matrix-295.json"),
        "g2": load("docs/halo/contract/gate2-evaluator-contract.json")["evaluable_conditions"],
        "g5": load("docs/halo/evidence/m1r/gate5b/gate5b-report-model-21043.json"),
        "br": {it["id"]: it for it in load("docs/halo/contract/baseline-registry.json")["operational_targets"]},
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


def run_structural(b, ctx):
    """Pure-JSON checks reused by adversarial probes. Returns list of error strings."""
    e = []
    cat = _cat_map(ctx["catalog"])
    g2, g5, br, fv = ctx["g2"], ctx["g5"], ctx["br"], ctx["fv"]
    metrics = b.get("metrics", [])
    mids = [m.get("id") for m in metrics]

    # --- ids / order / membership ---
    if mids != IDS:
        e.append("IDS: metrics order/membership != exact 12 %r" % (mids,))
    if b.get("packet_membership_order") != IDS:
        e.append("IDS: packet_membership_order != exact 12")
    if len(set(mids)) != len(mids):
        e.append("IDS: duplicate id present")
    if b.get("module") != 3:
        e.append("MODULE: module != 3")

    # --- accounting ---
    acc = b.get("packet_accounting_assertion", {})
    if acc.get("conditions") != 295 or acc.get("modules") != 11 or acc.get("packets") != 30:
        e.append("ACCOUNTING: not 295/11/30 -> %r" % (acc,))

    # --- dealer scope ---
    ds = b.get("dealer_scope", {})
    if ds.get("profile") != "serra-honda" or ds.get("dealer_id") != "21043" or ds.get("domain") != "Sales":
        e.append("DEALER: not serra-honda/21043/Sales")
    if ds.get("service_parts_admitted") != 0 or ds.get("service_source_admitted") != 0 or ds.get("cross_rooftop_admitted") != 0:
        e.append("DEALER: Service/Parts/service-source/cross-rooftop admitted != 0")

    # --- customer boundary ---
    if b.get("customer_emission_authority") is not False:
        e.append("BOUNDARY: customer_emission_authority must be false")
    if b.get("customer_projection") is not None:
        e.append("BOUNDARY: customer_projection must be null")

    # --- two-delta ---
    td = b.get("two_delta", {})
    if td.get("evidence_delta", {}).get("count") != 0 or td.get("meaning_delta", {}).get("count") != 0:
        e.append("TWO_DELTA: evidence/meaning delta must be 0")

    # --- cross-dealer exclusion (no Nissan/Ford in any scope text) ---
    blob = json.dumps({k: v for k, v in b.items() if k != "cross_dealer_exclusion"}).lower()
    for tok in ("21044","21047","serra-nissan","tony-serra-ford"):
        if tok in blob:
            e.append("CROSS_DEALER: forbidden dealer token in scope: %s" % tok)

    # --- lifecycle partition disjoint + covers 12 ---
    lp = b.get("lifecycle_partition", {})
    buckets = ["accepted_measured_ids","accepted_disposition_only_ids","rejected_ids",
               "source_investigation_pending_ids","calculation_pending_ids"]
    allp = [i for k in buckets for i in lp.get(k, [])]
    if sorted(allp) != sorted(IDS) or len(set(allp)) != len(allp):
        e.append("PARTITION: buckets not disjoint / do not cover exactly 12")
    if lp.get("accepted_measured_ids") != ACCEPTED:
        e.append("PARTITION: accepted_measured_ids != [SW-045,SW-046]")
    if sorted(lp.get("source_investigation_pending_ids", [])) != sorted(HELD):
        e.append("PARTITION: source_investigation_pending_ids != the ten held")

    # --- source_family_slices sum to 12 unique ---
    sl = b.get("source_family_slices", {})
    sids = [i for v in sl.values() for i in v]
    if len(sids) != 12 or len(set(sids)) != 12 or sorted(sids) != sorted(IDS):
        e.append("SLICES: do not partition the 12 ids")

    # --- authoritative_evaluated stays 17 (live) ---
    ae = b.get("accepted_measured_authority", {}).get("authoritative_evaluated_total")
    live_eval = g5.get("coverage", {}).get("evaluated")
    if ae != 17:
        e.append("ACCEPTED: authoritative_evaluated_total != 17")
    if live_eval != 17:
        e.append("ACCEPTED: live gate5b coverage.evaluated != 17 (=%r)" % (live_eval,))

    by = {m["id"]: m for m in metrics if "id" in m}

    for mid in IDS:
        m = by.get(mid)
        if m is None:
            e.append("MISSING metric %s" % mid); continue

        # canonical condition byte-equal
        if m.get("canonical_condition") != cat.get(mid):
            e.append("COND: %s canonical_condition != catalog" % mid)

        if mid in ACCEPTED:
            # accepted carry-forward, deep-equal live anchors, no recompute
            if m.get("gate2_anchor") != g2.get(mid):
                e.append("ACC %s: gate2_anchor != live gate2" % mid)
            if m.get("accepted_evaluation") != next((it for it in g5["evaluated"] if it["metric_id"] == mid), None):
                e.append("ACC %s: accepted_evaluation != live gate5b evaluated" % mid)
            if m.get("ot_anchor") != br.get(OT_ID[mid]):
                e.append("ACC %s: ot_anchor != live baseline OT" % mid)
            ot = br.get(OT_ID[mid], {})
            if m.get("threshold") != ot.get("threshold"):
                e.append("ACC %s: threshold != OT.threshold" % mid)
            if m.get("comparator") != ot.get("comparator") or m.get("direction") != ot.get("direction"):
                e.append("ACC %s: comparator/direction != OT" % mid)
            if m.get("grade_target_id") != "GT-" + mid:
                e.append("ACC %s: grade_target_id != GT-%s" % (mid, mid))
            ev = m.get("accepted_evaluation") or {}
            if m.get("value") != ev.get("value") or m.get("rating") != ev.get("rating"):
                e.append("ACC %s: value/rating not carried from accepted_evaluation (recompute?)" % mid)
            if m.get("carry_forward") is not True:
                e.append("ACC %s: carry_forward must be true" % mid)
            if m.get("recomputed_this_tranche") is not False:
                e.append("ACC %s: recomputed_this_tranche must be false" % mid)
            if m.get("future_display_eligibility") is not True:
                e.append("ACC %s: future_display_eligibility must be true" % mid)
            if m.get("customer_projection_authored_this_tranche") is not False:
                e.append("ACC %s: must not author customer projection this tranche" % mid)
            if m.get("disposition") != "measured_validated":
                e.append("ACC %s: disposition must be measured_validated" % mid)

            # --- defect-1: every duplicated top-level fact EXACTLY bound to its frozen authority ---
            anc = g2.get(mid, {})
            ot = br.get(OT_ID[mid], {})
            ev = m.get("accepted_evaluation") or {}
            evd = ev.get("evidence", {}) if isinstance(ev, dict) else {}
            bindings = {
                "source_family": anc.get("source_family"),
                "metric_slug": anc.get("metric_slug"),
                "formula": anc.get("formula"),
                "direct_source_fields": anc.get("source_fields"),
                "unit": ev.get("unit"),
                "value": ev.get("value"),
                "value_display": ev.get("value_display"),
                "rating": ev.get("rating"),
                "grade_value_or_range": ev.get("rating"),
                "numerator": evd.get("numerator"),
                "denominator": evd.get("denominator"),
                "grade_basis": ot.get("basis"),
            }
            for fld, exp in bindings.items():
                if m.get(fld) != exp:
                    e.append("ACC %s: top-level '%s' not bound to authority (%r != %r)"
                             % (mid, fld, m.get(fld), exp))
            det_expected = ("%s: authoritative evaluated ratio vs %s %s (%s); carried forward, not recomputed."
                            % (mid, ot.get("comparator"), ot.get("threshold"), ot.get("direction")))
            if m.get("detection_rule") != det_expected:
                e.append("ACC %s: detection_rule not deterministically bound to OT authority" % mid)
            # no quarantined legacy fact surfaced as a usable top-level key
            for f in ACC_FORBIDDEN_TOPLEVEL:
                if f in m:
                    e.append("ACC %s: quarantined legacy field '%s' surfaced at top level" % (mid, f))
            # legacy 'CRM Sales report' label may live ONLY inside byte-carried accepted_evaluation
            # (j2_quarantine metadata legitimately names the label in order to forbid it)
            for k, v in m.items():
                if k in ("accepted_evaluation", "j2_quarantine"):
                    continue
                if LEGACY_SOURCE_LABEL in json.dumps(v):
                    e.append("ACC %s: legacy source label leaked outside accepted_evaluation via '%s'" % (mid, k))

            # --- defect-3: J2 quarantine contract on byte-carried accepted_evaluation ---
            q = m.get("j2_quarantine")
            if not isinstance(q, dict):
                e.append("ACC %s: missing j2_quarantine contract" % mid)
            else:
                if q.get("forbidden_uses") != Q_FORBIDDEN_USES:
                    e.append("ACC %s: j2_quarantine.forbidden_uses != required set" % mid)
                if q.get("permitted_j2_fields") != Q_PERMITTED_J2:
                    e.append("ACC %s: j2_quarantine.permitted_j2_fields != Honda-native set" % mid)
                qc = q.get("byte_carried_but_not_usable_in_j2", [])
                for need in Q_MUST_QUARANTINE:
                    if need not in qc:
                        e.append("ACC %s: j2_quarantine must list legacy field '%s'" % (mid, need))
                if "Dashboard" not in str(q.get("true_authority", "")):
                    e.append("ACC %s: j2_quarantine.true_authority must name the Dashboard authority" % mid)
                pr = ev.get("peer_rank", {}) if isinstance(ev, dict) else {}
                if pr.get("of") != 3:
                    e.append("ACC %s: legacy peer_rank.of must remain 3 (byte-carried)" % mid)
                if q.get("legacy_peer_rank_of") != 3:
                    e.append("ACC %s: j2_quarantine.legacy_peer_rank_of must record 3" % mid)
                if evd.get("source") != LEGACY_SOURCE_LABEL:
                    e.append("ACC %s: byte-carried evidence.source must remain '%s'" % (mid, LEGACY_SOURCE_LABEL))

            # --- accepted-row lifecycle invariants (must not slip through mutation) ---
            acc_states = {
                "report_acceptance_state": "accepted",
                "authoritative": True,
                "source_existence_state": "acquired_local",
                "acquisition_admission_state": "admitted_held",
                "evaluation_state": "measured_graded",
            }
            for fld, exp in acc_states.items():
                if m.get(fld) is not exp and m.get(fld) != exp:
                    e.append("ACC %s: %s must be %r (got %r)" % (mid, fld, exp, m.get(fld)))
            ia = m.get("immediate_action", {}) if isinstance(m.get("immediate_action"), dict) else {}
            nao = m.get("next_action_owner")
            if nao != ia.get("owner"):
                e.append("ACC %s: next_action_owner (%r) != immediate_action.owner (%r)"
                         % (mid, nao, ia.get("owner")))
            if nao not in set((m.get("accountable_owners") or {}).values()):
                e.append("ACC %s: next_action_owner not among accountable_owners values" % mid)
        else:
            # held state: source_investigation_pending, nothing measured/valued
            if m.get("disposition") != "source_investigation_pending":
                e.append("HELD %s: disposition must be source_investigation_pending" % mid)
            if m.get("source_existence_state") != "unproved":
                e.append("HELD %s: source_existence_state must be unproved" % mid)
            if m.get("acquisition_admission_state") != "not_acquired":
                e.append("HELD %s: acquisition_admission_state must be not_acquired" % mid)
            if m.get("evaluation_state") != "not_measured":
                e.append("HELD %s: evaluation_state must be not_measured" % mid)
            for f in ("value","value_display","numerator","denominator","formula","threshold",
                      "comparator","direction","grade_target_id","grade_basis","grade_value_or_range",
                      "detection_rule","ot_anchor","gate2_anchor","accepted_evaluation"):
                if m.get(f) is not None:
                    e.append("HELD %s: %s must be null (missing != zero, no value/grade)" % (mid, f))
            for f in ("authoritative","carry_forward","gradable","value_allowed","grade_allowed",
                      "narrative_allowed","customer_projection_allowed","future_display_eligibility",
                      "customer_projection_authored_this_tranche"):
                if m.get(f) is not False:
                    e.append("HELD %s: %s must be false" % (mid, f))
            if m.get("missing_is_not_zero") is not True or m.get("no_proxy_or_inference") is not True:
                e.append("HELD %s: missing_is_not_zero / no_proxy_or_inference must be true" % mid)
            if m.get("no_causal_diagnosis_asserted") is not True:
                e.append("HELD %s: no_causal_diagnosis_asserted must be true" % mid)
            if m.get("direct_source_fields") != []:
                e.append("HELD %s: direct_source_fields must be [] (nothing acquired)" % mid)
            for req in ("missing_or_quarantine_evidence","required_future_contract",
                        "accountable_owners","immediate_action","subsequent_actions",
                        "review_point","next_safe_source_action","business_question"):
                if not m.get(req):
                    e.append("HELD %s: missing %s" % (mid, req))
            # per-held robust markers
            joined = " || ".join(m.get("missing_or_quarantine_evidence", [])).lower()
            for mk in HELD_MARKERS.get(mid, []):
                if mk not in joined:
                    e.append("HELD %s: blocker marker missing: '%s'" % (mid, mk))
            # source_family_intent must not be a quarantined family
            if m.get("source_family_intent") in QUARANTINED:
                e.append("HELD %s: source_family_intent is quarantined family" % mid)

            # --- defect-2: held-row invariants ---
            if m.get("report_acceptance_state") != "draft":
                e.append("HELD %s: report_acceptance_state must be draft" % mid)
            if m.get("authoritative") is not False:
                e.append("HELD %s: authoritative must be false" % mid)
            if m.get("recomputed_this_tranche") is not False:
                e.append("HELD %s: recomputed_this_tranche must be false" % mid)
            ia = m.get("immediate_action", {}) if isinstance(m.get("immediate_action"), dict) else {}
            nao = m.get("next_action_owner")
            if nao != ia.get("owner"):
                e.append("HELD %s: next_action_owner (%r) != immediate_action.owner (%r)"
                         % (mid, nao, ia.get("owner")))
            if nao not in set((m.get("accountable_owners") or {}).values()):
                e.append("HELD %s: next_action_owner not among accountable_owners values" % mid)

        # causal-label-not-asserted-as-fact (negation-aware; scan every non-canonical string)
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

        # owners: Duane never on technical stems
        owners = m.get("accountable_owners", {})
        for role, who in owners.items():
            if who and who.startswith("Duane") and any(s in role.lower() for s in DUANE_STEMS):
                e.append("OWNER %s: Duane role key has technical stem: %s" % (mid, role))
        actions = []
        if isinstance(m.get("immediate_action"), dict):
            actions.append(m["immediate_action"])
        actions += [a for a in m.get("subsequent_actions", []) if isinstance(a, dict)]
        for a in actions:
            if not a.get("owner") or not a.get("action"):
                e.append("OWNER %s: action missing owner/action" % mid)
            if a.get("owner", "").startswith("Duane") and any(s in a.get("action", "").lower() for s in DUANE_STEMS):
                e.append("OWNER %s: Duane assigned technical action: %r" % (mid, a.get("action")))

        # vocab consistency vs frozen closed vocabularies
        d = m.get("disposition")
        se = m.get("source_existence_state")
        aq = m.get("acquisition_admission_state")
        ev_state = m.get("evaluation_state")
        dc = fv["source_existence_state"]["disposition_consistency"].get(d)
        if dc is not None and se not in dc:
            e.append("VOCAB %s: (disposition=%s, source_existence=%s) not allowed" % (mid, d, se))
        pairs = fv["source_existence_acquisition_matrix"]["allowed_pairs"].get(se)
        if pairs is not None and aq not in pairs:
            e.append("VOCAB %s: (source_existence=%s, acquisition=%s) not allowed" % (mid, se, aq))
        emap = fv["disposition_evaluation_consistency"]["map"].get(d)
        if emap is not None and ev_state not in emap:
            e.append("VOCAB %s: (disposition=%s, evaluation=%s) not allowed" % (mid, d, ev_state))

    # SW-154 protected-content discipline
    s154 = by.get("SW-154", {})
    if s154.get("content_bytes_read") is not False:
        e.append("SW-154: content_bytes_read must be false")
    if s154.get("keyword_results_authoritative") is not False:
        e.append("SW-154: keyword_results_authoritative must be false")
    if s154.get("provisional_labels_are_stable_linkage") is not False:
        e.append("SW-154: provisional_labels_are_stable_linkage must be false")
    if s154.get("protected_content_envelope_required") != "SPEC 5.5":
        e.append("SW-154: protected_content_envelope_required must be 'SPEC 5.5'")

    return e


# ---- adversarial mutation probes: each mutation MUST produce >=1 structural error ----
def _probe_defs():
    probes = []
    def add(name, fn): probes.append((name, fn))

    def drop_id(b): b["metrics"].pop(0)
    def reorder(b): b["metrics"][0], b["metrics"][1] = b["metrics"][1], b["metrics"][0]
    def dup_id(b): b["metrics"][1]["id"] = b["metrics"][0]["id"]
    def cond_drift(b): b["metrics"][0]["canonical_condition"] = "TAMPERED CONDITION"
    def shrink_295(b): b["packet_accounting_assertion"]["conditions"] = 294
    def acc_value(b):
        for m in b["metrics"]:
            if m["id"] == "SW-045": m["value"] = 0.5
    def acc_recompute(b):
        for m in b["metrics"]:
            if m["id"] == "SW-045": m["recomputed_this_tranche"] = True
    def acc_anchor(b):
        for m in b["metrics"]:
            if m["id"] == "SW-045": m["gate2_anchor"] = {"tampered": True}
    def acc_eval_18(b): b["accepted_measured_authority"]["authoritative_evaluated_total"] = 18
    def held_promote(b):
        for m in b["metrics"]:
            if m["id"] == "SW-043": m["disposition"] = "measured_validated"
    def held_value(b):
        for m in b["metrics"]:
            if m["id"] == "SW-113": m["value"] = 0
    def held_formula(b):
        for m in b["metrics"]:
            if m["id"] == "SW-121": m["formula"] = "x/y"
    def held_target(b):
        for m in b["metrics"]:
            if m["id"] == "SW-122": m["threshold"] = 3
    def held_grade(b):
        for m in b["metrics"]:
            if m["id"] == "SW-123": m["grade_value_or_range"] = "healthy"
    def held_detection(b):
        for m in b["metrics"]:
            if m["id"] == "SW-125": m["detection_rule"] = "fire when decoupled"
    def held_display(b):
        for m in b["metrics"]:
            if m["id"] == "SW-126": m["future_display_eligibility"] = True
    def held_acquire(b):
        for m in b["metrics"]:
            if m["id"] == "SW-044": m["direct_source_fields"] = ["created_ts"]
    def held_missing_zero(b):
        for m in b["metrics"]:
            if m["id"] == "SW-114": m["missing_is_not_zero"] = False
    def held_proxy(b):
        for m in b["metrics"]:
            if m["id"] == "SW-121": m["no_proxy_or_inference"] = False
    def customer_emit(b): b["customer_emission_authority"] = True
    def customer_proj(b): b["customer_projection"] = {"alert": "fire"}
    def two_delta_break(b): b["two_delta"]["evidence_delta"]["count"] = 1
    def service_parts(b): b["dealer_scope"]["service_parts_admitted"] = 1
    def nissan_scope(b): b["dealer_scope"]["dealer_id"] = "21044"
    def quarantine_use(b):
        for m in b["metrics"]:
            if m["id"] == "SW-126": m["source_family_intent"] = "lead_source_roi"
    def causal_fact(b):
        for m in b["metrics"]:
            if m["id"] == "SW-113":
                m["business_question"] = "confirmed quality-of-set problem present"
    def duane_technical(b):
        for m in b["metrics"]:
            if m["id"] == "SW-043":
                m["immediate_action"] = {"owner": "Duane (x)", "action": "acquire the 3-week series"}
    def marker_strip(b):
        for m in b["metrics"]:
            if m["id"] == "SW-154": m["missing_or_quarantine_evidence"] = ["something"]
    def sw154_read(b):
        for m in b["metrics"]:
            if m["id"] == "SW-154": m["content_bytes_read"] = True
    def held_vocab(b):
        for m in b["metrics"]:
            if m["id"] == "SW-121": m["source_existence_state"] = "acquired_local"

    # defect-1: one direct rejection probe per mutable accepted top-level field/group
    def _acc_set(field, val):
        def _fn(b):
            for m in b["metrics"]:
                if m["id"] == "SW-045":
                    m[field] = val
        return _fn
    ACC_FIELD_PROBES = {
        "acc_field_source_family": ("source_family", "tampered_family"),
        "acc_field_metric_slug": ("metric_slug", "tampered.slug"),
        "acc_field_formula": ("formula", "a/b"),
        "acc_field_direct_source_fields": ("direct_source_fields", ["x"]),
        "acc_field_unit": ("unit", "percent"),
        "acc_field_value_display": ("value_display", "99%"),
        "acc_field_rating": ("rating", "breach"),
        "acc_field_grade_value_or_range": ("grade_value_or_range", "healthy?"),
        "acc_field_numerator": ("numerator", 999),
        "acc_field_denominator": ("denominator", 999),
        "acc_field_grade_basis": ("grade_basis", "invented_basis"),
        "acc_field_detection_rule": ("detection_rule", "fire always"),
    }

    # defect-2: held-row invariant probes
    def held_report_state(b):
        for m in b["metrics"]:
            if m["id"] == "SW-043": m["report_acceptance_state"] = "accepted"
    def held_authoritative(b):
        for m in b["metrics"]:
            if m["id"] == "SW-044": m["authoritative"] = True
    def held_recomputed(b):
        for m in b["metrics"]:
            if m["id"] == "SW-113": m["recomputed_this_tranche"] = True
    def held_next_owner_mismatch(b):
        for m in b["metrics"]:
            if m["id"] == "SW-121": m["next_action_owner"] = "Someone else entirely"
    def held_next_owner_not_accountable(b):
        for m in b["metrics"]:
            if m["id"] == "SW-122":
                m["next_action_owner"] = "Ghost owner"
                m["immediate_action"]["owner"] = "Ghost owner"

    # defect-3: J2 quarantine probes
    def q_remove(b):
        for m in b["metrics"]:
            if m["id"] == "SW-045": m.pop("j2_quarantine", None)
    def q_surface_peer_rank(b):
        for m in b["metrics"]:
            if m["id"] == "SW-045": m["peer_rank"] = m["accepted_evaluation"]["peer_rank"]
    def q_permit_legacy(b):
        for m in b["metrics"]:
            if m["id"] == "SW-045": m["j2_quarantine"]["permitted_j2_fields"] = ["value","peer_rank"]
    def q_drop_forbidden_use(b):
        for m in b["metrics"]:
            if m["id"] == "SW-045": m["j2_quarantine"]["forbidden_uses"] = ["calculation"]
    def q_legacy_label_leak(b):
        for m in b["metrics"]:
            if m["id"] == "SW-045": m["source_family"] = "CRM Sales report"
    def q_peer_of_change(b):
        for m in b["metrics"]:
            if m["id"] == "SW-045": m["accepted_evaluation"]["peer_rank"]["of"] = 1

    # accepted-row lifecycle invariant probes (one per field)
    ACC_STATE_PROBES = {
        "acc_report_state": ("report_acceptance_state", "draft"),
        "acc_authoritative": ("authoritative", False),
        "acc_source_existence": ("source_existence_state", "unproved"),
        "acc_acquisition": ("acquisition_admission_state", "not_acquired"),
        "acc_evaluation_state": ("evaluation_state", "not_measured"),
    }
    def acc_next_owner_mismatch(b):
        for m in b["metrics"]:
            if m["id"] == "SW-045": m["next_action_owner"] = "Someone else entirely"
    def acc_next_owner_not_accountable(b):
        for m in b["metrics"]:
            if m["id"] == "SW-046":
                m["next_action_owner"] = "Ghost owner"
                m["immediate_action"]["owner"] = "Ghost owner"

    for n, (fld, val) in ACC_FIELD_PROBES.items():
        add(n, _acc_set(fld, val))
    for n, (fld, val) in ACC_STATE_PROBES.items():
        add(n, _acc_set(fld, val))
    add("acc_next_owner_mismatch", acc_next_owner_mismatch)
    add("acc_next_owner_not_accountable", acc_next_owner_not_accountable)
    for n, f in [
        ("held_report_state", held_report_state),
        ("held_authoritative", held_authoritative),
        ("held_recomputed", held_recomputed),
        ("held_next_owner_mismatch", held_next_owner_mismatch),
        ("held_next_owner_not_accountable", held_next_owner_not_accountable),
        ("q_remove_quarantine", q_remove),
        ("q_surface_peer_rank", q_surface_peer_rank),
        ("q_permit_legacy_field", q_permit_legacy),
        ("q_drop_forbidden_use", q_drop_forbidden_use),
        ("q_legacy_label_leak", q_legacy_label_leak),
        ("q_peer_rank_of_change", q_peer_of_change),
    ]:
        add(n, f)

    for n, f in [
        ("drop_id", drop_id), ("reorder", reorder), ("duplicate_id", dup_id),
        ("condition_drift", cond_drift), ("shrink_295", shrink_295),
        ("accepted_value_change", acc_value), ("accepted_recompute_flag", acc_recompute),
        ("accepted_anchor_tamper", acc_anchor), ("authoritative_evaluated_18", acc_eval_18),
        ("held_promote", held_promote), ("held_value", held_value), ("held_formula", held_formula),
        ("held_target", held_target), ("held_grade", held_grade), ("held_detection", held_detection),
        ("held_future_display", held_display), ("held_invent_source_field", held_acquire),
        ("held_missing_equals_zero", held_missing_zero), ("held_proxy", held_proxy),
        ("customer_emission", customer_emit), ("customer_projection", customer_proj),
        ("two_delta_nonzero", two_delta_break), ("service_parts_admitted", service_parts),
        ("nissan_scope", nissan_scope), ("quarantined_family_use", quarantine_use),
        ("causal_diagnosis_fact", causal_fact), ("duane_technical_action", duane_technical),
        ("held_blocker_marker_strip", marker_strip), ("sw154_content_read", sw154_read),
        ("held_vocab_inconsistency", held_vocab),
    ]:
        add(n, f)
    return probes


def _git(args):
    return subprocess.run(["git", "-C", ROOT] + args, capture_output=True, text=True)


def main():
    no_write = "--no-write" in sys.argv
    ctx = _load_ctx()
    b = load(BINDING_REL)

    errors = run_structural(b, ctx)

    # pinned source hashes (recompute live)
    hash_ok = True
    hash_detail = {}
    for rel, exp in PINNED.items():
        got = sha256(rel)
        hash_detail[rel] = {"expected": exp, "got": got, "match": got == exp}
        if got != exp:
            hash_ok = False
            errors.append("HASH: %s expected %s got %s" % (rel, exp, got))
    if b.get("pinned_source_hashes") != PINNED:
        errors.append("HASH: binding pinned_source_hashes != computed pins")

    def _is_claude(p):
        return p == ".claude" or p.startswith(".claude/")

    # (a) CREATE-only: every allowlist path MUST be ABSENT at baseline (rejects overwrite).
    allowlist_absent = {}
    for f in ALLOWLIST:
        absent = _git(["cat-file", "-e", "%s:%s" % (BASELINE_COMMIT, f)]).returncode != 0
        allowlist_absent[f] = absent
        if not absent:
            errors.append("ALLOWLIST: %s existed at baseline (CREATE-only; overwrite forbidden)" % f)

    # (d) self-check: the absent-at-baseline predicate must reject a known baseline-existing path
    #     and accept a genuinely new path — proves the overwrite guard is live.
    guard_existing = _git(["cat-file", "-e", "%s:%s" % (BASELINE_COMMIT,
                          "docs/halo/contract/phase1b/master-ledger-295.json")]).returncode == 0
    guard_new = _git(["cat-file", "-e", "%s:%s" % (BASELINE_COMMIT, BINDING_REL)]).returncode != 0
    overwrite_guard_selftest = bool(guard_existing and guard_new)
    if not overwrite_guard_selftest:
        errors.append("SELFCHECK: overwrite guard predicate broken")

    # State-invariant changed-set vs baseline: union of (baseline<->worktree tracked diff)
    # and untracked files. This is IDENTICAL whether the five files are untracked, staged,
    # or committed at the tranche commit (only which git surface reports them changes).
    diff_wt = set(_git(["diff", "--name-only", BASELINE_COMMIT]).stdout.split())
    porcelain = _git(["status", "--porcelain", "-uall"]).stdout.splitlines()
    untracked = set(ln[3:] for ln in porcelain if ln.startswith("??"))
    changed = {p for p in (diff_wt | untracked) if not _is_claude(p)}
    out_of_allowlist = sorted(changed - set(ALLOWLIST))
    if out_of_allowlist:
        errors.append("ALLOWLIST: changes outside allowlist vs baseline: %r" % out_of_allowlist)

    # (b) reject any .claude staging and any staged path outside the allowlist
    staged = set(_git(["diff", "--cached", "--name-only"]).stdout.split())
    claude_staged = any(_is_claude(s) for s in staged)
    if claude_staged:
        errors.append("ALLOWLIST: .claude staged (must remain untracked)")
    staged_out = sorted(s for s in staged if s not in ALLOWLIST and not _is_claude(s))
    if staged_out:
        errors.append("ALLOWLIST: staged paths outside allowlist: %r" % staged_out)

    # (d) prior packets preserved byte-identical vs baseline (must not differ from baseline blob)
    preserve_ok = True
    for f in PRESERVE:
        if _git(["diff", "--name-only", BASELINE_COMMIT, "--", f]).stdout.strip():
            preserve_ok = False
            errors.append("PRESERVE: %s modified vs baseline" % f)

    # required allowlist files exist on disk (CHECKS may be created by this run)
    for f in ALLOWLIST:
        if f == CHECKS_REL:
            continue
        if not os.path.exists(P(f)):
            errors.append("ALLOWLIST: required file missing: %s" % f)

    # git diff --check (whitespace/conflict markers) on the binding + scripts
    dc = _git(["diff", "--check"])
    if dc.returncode != 0 and dc.stdout.strip():
        errors.append("GIT_DIFF_CHECK: %s" % dc.stdout.strip().splitlines()[0])

    # adversarial probes
    probes = _probe_defs()
    probe_results = []
    probe_fail = 0
    for name, fn in probes:
        mut = copy.deepcopy(b)
        try:
            fn(mut)
            merr = run_structural(mut, ctx)
        except Exception as ex:
            merr = ["exception:%s" % ex]
        caught = len(merr) > 0
        probe_results.append({"probe": name, "rejected": caught})
        if not caught:
            probe_fail += 1
            errors.append("PROBE: %s NOT rejected (mutation slipped through)" % name)

    result = "PASS" if not errors else "FAIL"
    receipt = {
        "artifact": "PKT-03-02_BINDING_CHECKS",
        "validator": VALIDATOR_REL,
        "baseline_commit": BASELINE_COMMIT,
        "binding": BINDING_REL,
        "result": result,
        "error_count": len(errors),
        "errors": errors,
        "structural_error_count": len(run_structural(b, ctx)),
        "checks": {
            "ids_order_membership": IDS,
            "accounting": b.get("packet_accounting_assertion"),
            "module": b.get("module"),
            "dealer_scope": b.get("dealer_scope"),
            "authoritative_evaluated_total": b.get("accepted_measured_authority", {}).get("authoritative_evaluated_total"),
            "two_delta": b.get("two_delta"),
            "accepted_ids": ACCEPTED,
            "held_ids": HELD,
            "pinned_hashes_ok": hash_ok,
            "prior_packets_preserved": preserve_ok,
            "allowlist_absent_at_baseline": allowlist_absent,
            "out_of_allowlist_changes": out_of_allowlist,
            "claude_staged": claude_staged,
            "overwrite_guard_selftest": overwrite_guard_selftest,
        },
        "pinned_source_hashes": hash_detail,
        "probe_total": len(probes),
        "probe_rejected": len(probes) - probe_fail,
        "probe_not_rejected": probe_fail,
        "probes": probe_results,
    }

    out = json.dumps(receipt, indent=2, ensure_ascii=False, sort_keys=True)
    if not no_write:
        os.makedirs(os.path.dirname(P(CHECKS_REL)), exist_ok=True)
        with open(P(CHECKS_REL), "w") as f:
            f.write(out + "\n")

    print(out)
    print("\nRESULT:", result, "| errors:", len(errors),
          "| probes rejected:", len(probes) - probe_fail, "/", len(probes))
    return 0 if result == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
