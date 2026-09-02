#!/usr/bin/env python3
"""
Phase 1B validator — validates the real master ledger, packet index, PKT-02-01 packet + metric
definitions, and source-DAG instances against the Phase 1B invariants and adversarial controls.

Design-only. Reuses the Phase 1A generic engine (record schemas, closed vocabularies, transition
maps, strict equality, metric-row/source validation) WITHOUT modifying any Phase 0/1A artifact.
Exit 0 == PASS, 1 == FAIL. Usage: python3 scripts/halo-phase1b/validate_phase1b.py [--out X] [--no-write]
"""
from __future__ import annotations

import argparse
import copy
import json
import os
import re
import sys
from datetime import datetime

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(REPO, "scripts", "halo-phase1"))
import validate_phase1_contracts as p1  # noqa: E402

C1B = os.path.join(REPO, "docs", "halo", "contract", "phase1b")
DEFAULT_OUT = os.path.join(REPO, "docs", "halo", "evidence", "honda-watchdog", "phase1b", "PHASE1B_CHECKS.json")
OVERLAY = {79, 81, 83, 115, 118, 199, 222, 223, 224, 225, 226, 227, 228, 229, 263, 270, 279, 294}
CTX_SRC = {"source_ids": {"SRC-vinsolutions_custom_reporting_leads-0001"}, "candidate_ids": set()}
CANON = list(p1.CANON_STOPS)
SW295 = [f"SW-{i:03d}" for i in range(1, 296)]


def load(rel):
    return p1.load(os.path.join(C1B, rel))


# inject Phase 1B schemas into the reused generic engine's $ref registry
LEDGER_SCHEMA = load("master-ledger-schema.json")
PKT1B_SCHEMA = load("packet-schema-1b.json")
p1.DEFS["ledger_row"] = LEDGER_SCHEMA["row_schema"]
p1.DEFS["ledger_transition"] = LEDGER_SCHEMA["transition_schema"]
p1.DEFS["pkt1b"] = PKT1B_SCHEMA["packet_schema"]
p1.DEFS["source_dependency"] = PKT1B_SCHEMA["source_dependency_schema"]
p1.DEFS["lifecycle_partition"] = PKT1B_SCHEMA["lifecycle_partition_schema"]

DISP_SES = p1.FV["source_existence_state"]["disposition_consistency"]
DISP_EVAL = p1.FV["disposition_evaluation_consistency"]["map"]
SES_ACQ = p1.FV["source_existence_acquisition_matrix"]["allowed_pairs"]
DISP_ADJ = p1.FV["disposition"]["transitions"]
TERMINAL = set(p1.FV["disposition"]["invariants"]["terminal_states"])
ACCEPTED_DISP_ONLY = {"external_source_required", "additional_history_required", "genuinely_not_available", "outside_sales_domain"}
# Authoritative prior Honda truth (must be carried forward, not reset)
EVALUATED_17 = {11, 12, 15, 21, 22, 31, 32, 33, 41, 45, 46, 90, 133, 142, 145, 149, 150}
LEADS_PROMOTED = {11, 12, 15, 90}
# Authoritative structured sources (pinned; read-only). Semantic bindings derive from THESE, not paraphrase.
GATE2 = p1.load(os.path.join(REPO, "docs", "halo", "contract", "gate2-evaluator-contract.json"))
CATALOG = {e["metric_id"]: e for e in p1.load(os.path.join(REPO, "docs", "halo", "contract", "semantic-watchdog-feasibility-matrix-295.json"))}
_BR = p1.load(os.path.join(REPO, "docs", "halo", "contract", "baseline-registry.json"))
_OTS = _BR["operational_targets"] if isinstance(_BR["operational_targets"], list) else list(_BR["operational_targets"].values())
OT = {e["id"]: e for e in _OTS if isinstance(e, dict) and "id" in e}
SEMANTIC_PROVENANCE = {
    "catalog": "docs/halo/contract/semantic-watchdog-feasibility-matrix-295.json (29c7ac06…) — condition per metric",
    "gate2": "docs/halo/contract/gate2-evaluator-contract.json — evaluable_conditions formula/source_fields/numerator/denominator/unit/baseline_id/comparator",
    "baseline_registry": "docs/halo/contract/baseline-registry.json — OT-SW-011/012/015 comparator/threshold/unit/direction/basis"
}


def _dt(s):
    """Parse a timezone-AWARE ISO datetime to an aware instant; None if malformed or naive."""
    if not p1.valid_iso_datetime(s):
        return None
    t = s.strip()
    if t.endswith("Z"):
        t = t[:-1] + "+00:00"
    try:
        d = datetime.fromisoformat(t)
    except ValueError:
        return None
    return d if d.tzinfo is not None else None


def _num(mid):
    return int(mid.split("-")[1])


def check_transitions(r, mid, errs):
    """Complete from/to adjacency, chaining, timestamp order, terminal consistency, append-only."""
    tr = r.get("transitions") or []
    if not tr:
        errs.append(f"ledger {mid}: no transitions"); return
    if tr[0].get("from") is not None:
        errs.append(f"ledger {mid}: first transition.from must be null (init)")
    prev_to, prev_dt = None, None
    for i, t in enumerate(tr):
        frm, to, at = t.get("from"), t.get("to"), t.get("at")
        if i > 0:
            if frm != prev_to:
                errs.append(f"ledger {mid}: transition {i} from '{frm}' != previous to '{prev_to}'")
            if frm == to:
                errs.append(f"ledger {mid}: forbidden self-transition '{frm}'->'{to}'")
            elif to not in DISP_ADJ.get(frm, []):
                errs.append(f"ledger {mid}: transition {i} '{frm}'->'{to}' not in disposition adjacency")
        cur_dt = _dt(at) if at is not None else None
        if cur_dt is None:
            errs.append(f"ledger {mid}: transition {i} malformed/naive timestamp {at!r}")
        elif prev_dt is not None and cur_dt < prev_dt:
            errs.append(f"ledger {mid}: transition {i} chronologically before previous instant ({at})")
        if i < len(tr) - 1 and to in TERMINAL:
            errs.append(f"ledger {mid}: transition into terminal '{to}' then continues")
        prev_to = to
        if cur_dt is not None:
            prev_dt = cur_dt
    if tr[-1].get("to") != r.get("disposition"):
        errs.append(f"ledger {mid}: transitions[-1].to != disposition")


def _numtok(text, val):
    return re.search(r"(?<![\d.])%d(?![\d.])" % int(val), str(text)) is not None


def _expected_semantics():
    """Derive per-metric expected structured facts from the PINNED authority (catalog + gate2 + OT)."""
    g = GATE2["evaluable_conditions"]
    E = {
        "SW-011": {"unit": g["SW-011"]["unit"], "calc": "duration", "disposition": "measured_validated",
                   "ses": "acquired_local", "bucket": "accepted_measured_ids", "direct_fields": set(g["SW-011"]["source_fields"]),
                   "formula_must": ["median", "after hours == no"],
                   "grade_ref": "OT-SW-011", "comparator": OT["OT-SW-011"]["comparator"], "threshold": OT["OT-SW-011"]["threshold"]},
        "SW-012": {"unit": g["SW-012"]["unit"], "calc": "rate", "disposition": "measured_validated",
                   "ses": "acquired_local", "bucket": "accepted_measured_ids", "direct_fields": set(g["SW-012"]["source_fields"]),
                   "numerator_all_blank": ["first contact attempt", "first customer contact", "actual response time"],
                   "numerator_forbid": [" or ", "any of", "any "], "denominator_must": "business_hours_population",
                   "grade_ref": "OT-SW-012", "comparator": OT["OT-SW-012"]["comparator"], "threshold": OT["OT-SW-012"]["threshold"]},
        "SW-015": {"unit": g["SW-015"]["unit"], "calc": "rate", "disposition": "measured_validated",
                   "ses": "acquired_local", "bucket": "accepted_measured_ids", "direct_fields": {"Sales Rep", "Actual Response Time (Min)"},
                   "numerator_must": ["store median"], "numerator_2x": ["2 x store median", ">= 2"],
                   "numerator_forbid": ["minus", "difference"], "denominator_exact": "reps_with_numeric_response",
                   "grade_ref": "OT-SW-015", "comparator": OT["OT-SW-015"]["comparator"], "threshold": OT["OT-SW-015"]["threshold"]},
        "SW-013": {"disposition": "source_investigation_pending", "ses": "investigation_pending", "bucket": "source_investigation_pending_ids",
                   "population_must": ["after", "opening", "15"], "no_business_only": True, "catalog": CATALOG["SW-013"]["condition"]},
        "SW-014": {"disposition": "source_investigation_pending", "calc": "count", "bucket": "source_investigation_pending_ids",
                   "predicate_must": ["auto-reply", "no human", "hour"], "no_business_hours": True, "catalog": CATALOG["SW-014"]["condition"]},
    }
    return E


def check_semantic_immutability(pkt, errs):
    """Bind SW-011..015 field-by-field to the derived authoritative structured facts (not paraphrase)."""
    md = {m.get("metric_id"): m for m in pkt.get("metric_definitions", [])}
    lp = pkt.get("lifecycle_partition", {})
    bucket_of = {i: b for b, ids in lp.items() for i in ids}
    E = _expected_semantics()
    for mid, ex in E.items():
        m = md.get(mid, {})
        f = str(m.get("formula", "")).lower()
        num = str(m.get("numerator", "")).lower() + " " + f
        den = str(m.get("denominator", "")).lower()
        pop = str(m.get("population", "")).lower()
        gt = m.get("grade_target_contract") or {}
        dt = m.get("detection_threshold_contract") or {}
        blob = " ".join(str(m.get(k, "")) for k in ("business_question", "population", "explainability_ref", "evidence_ref", "formula")).lower()
        if "unit" in ex and m.get("unit") != ex["unit"]:
            errs.append(f"semantic {mid}: unit {m.get('unit')!r} != authority {ex['unit']!r}")
        if "calc" in ex and m.get("calculation_kind") != ex["calc"]:
            errs.append(f"semantic {mid}: calculation_kind {m.get('calculation_kind')!r} != authority {ex['calc']!r}")
        if m.get("disposition") != ex["disposition"]:
            errs.append(f"semantic {mid}: disposition != {ex['disposition']}")
        if "ses" in ex and m.get("source_existence_state") != ex["ses"]:
            errs.append(f"semantic {mid}: source_existence_state != {ex['ses']}")
        if bucket_of.get(mid) != ex["bucket"]:
            errs.append(f"semantic {mid}: lifecycle bucket {bucket_of.get(mid)} != {ex['bucket']}")
        if "direct_fields" in ex:
            missing = {x for x in ex["direct_fields"] if x not in (m.get("direct_source_fields") or [])}
            if missing:
                errs.append(f"semantic {mid}: missing required direct fields {sorted(missing)}")
        for tok in ex.get("formula_must", []):
            if tok not in f:
                errs.append(f"semantic {mid}: formula missing required token '{tok}'")
        if "numerator_all_blank" in ex:
            for fld in ex["numerator_all_blank"]:
                if fld not in num:
                    errs.append(f"semantic {mid}: numerator must include ALL THREE blank fields (missing '{fld}')")
            if " and " not in num:
                errs.append(f"semantic {mid}: numerator must AND (not OR/ANY) across the three blanks")
        for bad in ex.get("numerator_forbid", []):
            if bad in num:
                errs.append(f"semantic {mid}: numerator/formula must not contain '{bad.strip()}'")
        for tok in ex.get("numerator_must", []):
            if tok not in num:
                errs.append(f"semantic {mid}: numerator must contain '{tok}'")
        if "numerator_2x" in ex and not any(t in num for t in ex["numerator_2x"]):
            errs.append(f"semantic {mid}: numerator must express >= 2x store median")
        if "denominator_exact" in ex and ex["denominator_exact"] not in den:
            errs.append(f"semantic {mid}: denominator must be exactly '{ex['denominator_exact']}'")
        if "denominator_must" in ex and ex["denominator_must"] not in den and ex["denominator_must"] not in f:
            errs.append(f"semantic {mid}: denominator must reference '{ex['denominator_must']}'")
        if "grade_ref" in ex:
            if ex["grade_ref"] not in str(gt.get("grade_target_id")):
                errs.append(f"semantic {mid}: grade target must reference {ex['grade_ref']}")
            if gt.get("approval_state") != "approved" or gt.get("status") != "active":
                errs.append(f"semantic {mid}: grade target must be approved+active")
            th_text = str(dt.get("rule", "")) + " " + str(gt.get("value_or_range", ""))
            if ex["comparator"] not in th_text:
                errs.append(f"semantic {mid}: threshold comparator '{ex['comparator']}' not bound")
            if not _numtok(th_text, ex["threshold"]):
                errs.append(f"semantic {mid}: threshold value {ex['threshold']} not bound (authority OT-{mid[3:]})")
        for tok in ex.get("population_must", []):
            if tok not in pop:
                errs.append(f"semantic {mid}: population missing required token '{tok}'")
        if ex.get("no_business_only") and "business-hours" in pop and "after" not in pop:
            errs.append(f"semantic {mid}: population must be after-hours, not business-hours")
        if ex.get("no_business_hours") and "business-hours" in pop and "no business-hours" not in pop:
            errs.append(f"semantic {mid}: must not impose a business-hours restriction")
        for tok in ex.get("predicate_must", []):
            if tok not in blob:
                errs.append(f"semantic {mid}: predicate missing required token '{tok}'")


def check_cross_packet_independence(idx, errs):
    """Packets are disjoint, so an open/blocked id in one packet cannot block another packet."""
    seen = {}
    for p in idx["packets"]:
        for t in p["target_ids"]:
            if t in seen:
                errs.append(f"cross-packet: {t} in both {seen[t]} and {p['packet_id']} (blocking would leak across packets)")
            seen[t] = p["packet_id"]


def check_packet_index(idx, errs):
    allids = []
    for p in idx["packets"]:
        tids = p["target_ids"]
        if not (5 <= len(tids) <= 12):
            errs.append(f"packet-index {p['packet_id']}: size {len(tids)} out of 5..12")
        for t in tids:
            if p1.OWNER.get(_num(t), [None])[0] != p["module"]:
                errs.append(f"packet-index {p['packet_id']}: {t} not owned by module {p['module']}")
        allids += tids
    if sorted(allids) != SW295:
        errs.append("packet-index: target union != exact 295 (overlap/gap)")
    p01 = [p for p in idx["packets"] if p["packet_id"] == "PKT-02-01"]
    if not p01 or p01[0]["target_ids"] != ["SW-011", "SW-012", "SW-013", "SW-014", "SW-015"]:
        errs.append("packet-index: PKT-02-01 != SW-011..015")


def check_ledger(led, idx, errs):
    rows = led["rows"]
    ids = [r["metric_id"] for r in rows]
    if sorted(ids) != SW295:
        errs.append("ledger: metric_id set != exact SW-001..295")
    packet_of = {t: p["packet_id"] for p in idx["packets"] for t in p["target_ids"]}
    seen = set()
    for r in rows:
        mid = r.get("metric_id", "?")
        e2 = []
        p1.validate_instance(r, {"$ref": "ledger_row"}, mid, e2)
        errs += [f"ledger {mid}: {x}" for x in e2]
        if not isinstance(mid, str) or not p1.SW.match(mid):
            continue
        num = _num(mid)
        if mid in seen:
            errs.append(f"ledger: duplicate {mid}")
        seen.add(mid)
        if r.get("module") != p1.OWNER.get(num, [None])[0]:
            errs.append(f"ledger {mid}: module != frozen owner")
        if r.get("packet_id") != packet_of.get(mid):
            errs.append(f"ledger {mid}: packet_id != packet-index assignment")
        if num in OVERLAY and not (r.get("boundary_class") == "separate_serra_service" and r.get("disposition") == "outside_sales_domain"
                                   and r.get("source_existence_state") == "proved_outside_sales_domain" and r.get("evaluation_state") == "not_measured"):
            errs.append(f"ledger {mid}: Service overlay row state invalid")
        if r.get("boundary_class") != "sales" and r.get("evaluation_state") not in ("not_measured", "measured_unscored"):
            errs.append(f"ledger {mid}: non-sales must be disposition-only")
        disp = r.get("disposition")
        if disp == "source_investigation_pending":
            if r.get("source_existence_state") not in ("unproved", "investigation_pending") or r.get("evaluation_state") != "not_measured":
                errs.append(f"ledger {mid}: SIP state invalid")
            for f in ("owner", "evidence_as_of", "next_action", "review_point"):
                if not r.get(f):
                    errs.append(f"ledger {mid}: SIP missing {f}")
        if disp in DISP_SES and r.get("source_existence_state") not in DISP_SES[disp]:
            errs.append(f"ledger {mid}: source_existence inconsistent with disposition")
        if disp in DISP_EVAL and r.get("evaluation_state") not in DISP_EVAL[disp]:
            errs.append(f"ledger {mid}: evaluation inconsistent with disposition")
        se = r.get("source_existence_state")
        if se in SES_ACQ and r.get("acquisition_admission_state") not in SES_ACQ[se]:
            errs.append(f"ledger {mid}: source_existence/acquisition pair invalid")
        check_transitions(r, mid, errs)
        # carry-forward / no-regression of authoritative accepted+evaluated truth
        auth = r.get("authoritative")
        if auth is True and not r.get("current_truth_ref"):
            errs.append(f"ledger {mid}: authoritative requires current_truth_ref")
        if auth is True and disp not in ("measured_validated", "outside_sales_domain"):
            errs.append(f"ledger {mid}: authoritative row must be measured_validated or outside_sales_domain")
        if disp == "measured_validated":
            if auth is not True:
                errs.append(f"ledger {mid}: measured_validated row must be authoritative (no reset)")
            if r.get("evaluation_state") not in ("measured_graded", "measured_unscored", "measurement_rejected"):
                errs.append(f"ledger {mid}: accepted/evaluated row reset to non-measured evaluation")
        if num in EVALUATED_17:
            if disp != "measured_validated" or r.get("evaluation_state") != "measured_graded":
                errs.append(f"ledger {mid}: prior accepted+evaluated Honda metric reset (must stay measured_validated/measured_graded)")
            if num in LEADS_PROMOTED and r.get("acquisition_admission_state") != "admitted_promoted":
                errs.append(f"ledger {mid}: promoted leads metric regressed from admitted_promoted")
        # measurable rows need a registered source UNLESS authoritative carry-forward (source cited)
        if disp in ("measured_validated", "data_acquired_calculation_pending"):
            if r.get("source_dependency_ids"):
                for s in r["source_dependency_ids"]:
                    if s not in CTX_SRC["source_ids"]:
                        errs.append(f"ledger {mid}: source {s} not registered")
            elif not (auth is True and r.get("current_truth_ref")):
                errs.append(f"ledger {mid}: measurable needs a registered source or an authoritative current_truth_ref")


def check_packet(pkt, reg, errs):
    e2 = []
    p1.validate_instance(pkt, {"$ref": "pkt1b"}, "PKT-02-01", e2)
    errs += [f"packet: {x}" for x in e2]
    tids = pkt.get("target_ids", [])
    lp = pkt.get("lifecycle_partition", {})
    buckets = {k: lp.get(k, []) for k in ("accepted_measured_ids", "accepted_disposition_only_ids", "rejected_ids", "source_investigation_pending_ids", "calculation_pending_ids")}
    flat = [i for b in buckets.values() for i in b]
    if len(flat) != len(set(flat)):
        errs.append("packet: lifecycle partitions overlap")
    if set(flat) != set(tids):
        errs.append("packet: lifecycle union != target_ids")
    for t in tids:
        if p1.SW.match(str(t)) and p1.OWNER.get(_num(t), [None])[0] != pkt.get("module"):
            errs.append(f"packet: {t} not owned by module {pkt.get('module')}")
    if pkt.get("stop_conditions", {}).get("inherited_canonical") != CANON:
        errs.append("packet: inherited_canonical != Phase 1A canonical stop names")
    mdmap = {md.get("metric_id"): md for md in pkt.get("metric_definitions", [])}
    for md in pkt.get("metric_definitions", []):
        e3 = p1.validate_metric_row(md, CTX_SRC)
        errs += [f"metric {md.get('metric_id')}: {x}" for x in e3]
    # SIP never accepted_disposition_only; accepted_disposition_only must be an evidence-backed disposition
    for sid in buckets["accepted_disposition_only_ids"]:
        if mdmap.get(sid, {}).get("disposition") not in ACCEPTED_DISP_ONLY:
            errs.append(f"packet: {sid} in accepted_disposition_only but disposition not evidence-backed (SIP never allowed)")
    for sid in buckets["source_investigation_pending_ids"]:
        if mdmap.get(sid, {}).get("disposition") != "source_investigation_pending":
            errs.append(f"packet: {sid} in SIP bucket but metric disposition != source_investigation_pending")
    for cid in buckets["calculation_pending_ids"]:
        if mdmap.get(cid, {}).get("disposition") not in ("data_acquired_calculation_pending", "crm_available_acquisition_pending"):
            errs.append(f"packet: {cid} in calculation_pending bucket but disposition mismatch")
    for aid in buckets["accepted_measured_ids"]:
        m = mdmap.get(aid, {})
        if m.get("disposition") != "measured_validated" or m.get("evaluation_state") not in ("measured_graded", "measured_unscored"):
            errs.append(f"packet: {aid} in accepted_measured but metric is not measured_validated/graded")
        gt = m.get("grade_target_contract") or {}
        if m.get("gradable") is not True or gt.get("approval_state") != "approved" or gt.get("status") != "active" or gt.get("compatibility_result") != "compatible":
            errs.append(f"packet: {aid} accepted_measured requires an approved+active+compatible grade target")
    # bidirectional source fan-out: a metric's source dep must list that metric as dependent (no proxy attach)
    dep_of = {n["source_id"]: set(n.get("dependent_metric_ids", [])) for n in reg.get("nodes", [])}
    for md in pkt.get("metric_definitions", []):
        for s in md.get("source_dependency_ids", []) or []:
            if md.get("metric_id") not in dep_of.get(s, set()):
                errs.append(f"packet: metric {md.get('metric_id')} claims source {s} but source does not declare it (fan-out mismatch / proxy attach)")


def check_source(reg, errs):
    errs += [f"source: {x}" for x in p1.validate_source_dag(reg.get("nodes", []), CTX_SRC)]
    for n in reg.get("nodes", []):
        rr = (reg.get("reuse_receipts") or {}).get(n.get("source_id"))
        if not rr or rr.get("reuse_or_fresh") not in ("reuse", "fresh_acquisition"):
            errs.append(f"source {n.get('source_id')}: missing reuse-vs-fresh label")


def run_probes(led, idx, pkt, reg):
    probes = []

    def rec(name, fn):
        try:
            errs = fn()
        except Exception as ex:  # noqa: BLE001
            probes.append({"probe": name, "expected": "reject_no_crash", "got": "CRASH", "pass": False, "sample_error": f"{type(ex).__name__}: {ex}"})
            return
        probes.append({"probe": name, "expected": "reject", "got": "reject" if errs else "accept", "pass": bool(errs), "n_errors": len(errs), "sample_error": errs[0] if errs else None})

    def pkt_mut(m):
        e = []; check_packet(m, reg, e); return e

    def idx_mut(m):
        e = []; check_packet_index(m, e); return e

    def led_mut(m):
        e = []; check_ledger(m, idx, e); return e

    # A: SIP moved into accepted_disposition_only -> reject
    def sip_as_dispo():
        m = copy.deepcopy(pkt)
        m["lifecycle_partition"]["source_investigation_pending_ids"] = ["SW-014"]
        m["lifecycle_partition"]["accepted_disposition_only_ids"] = ["SW-013"]
        return m
    rec("A_sip_as_accepted_disposition_only", lambda: pkt_mut(sip_as_dispo()))
    # B: proxy attach — flip SW-013 to measurable on the Leads source (not declared dependent) -> reject
    def proxy_attach():
        m = copy.deepcopy(pkt)
        for md in m["metric_definitions"]:
            if md["metric_id"] == "SW-013":
                md.update({"disposition": "data_acquired_calculation_pending", "source_existence_state": "acquired_local",
                           "evaluation_state": "not_measured", "gradable": True, "customer_visibility": "full",
                           "source_dependency_ids": ["SRC-vinsolutions_custom_reporting_leads-0001"],
                           "direct_source_fields": ["Adjusted Response Time (Min)"], "formula": "proxy from adjusted response"})
                md.pop("finite_investigation_ref", None)
        m["lifecycle_partition"]["source_investigation_pending_ids"] = ["SW-014"]
        m["lifecycle_partition"]["calculation_pending_ids"] = ["SW-011", "SW-012", "SW-013", "SW-015"]
        return m
    rec("B_proxy_attach_013_to_leads", lambda: pkt_mut(proxy_attach()))
    # C: overlay id projected to customer full -> reject (metric-row overlay strictness)
    rec("C_overlay_customer_full", lambda: p1.validate_metric_row(_overlay_metric_customer_full(), CTX_SRC))
    # D: packet-index union != 295 (drop one id) -> reject
    def idx_drop():
        m = copy.deepcopy(idx)
        m["packets"][-1]["target_ids"] = m["packets"][-1]["target_ids"][:-1]
        return m
    rec("D_packet_index_union_not_295", lambda: idx_mut(idx_drop()))
    # E: per-packet reacquisition (duplicate source dedupe key) -> reject
    def src_dup():
        m = copy.deepcopy(reg)
        m["nodes"] = m["nodes"] + [copy.deepcopy(m["nodes"][0])]
        e = []; check_source(m, e); return e
    rec("E_per_packet_reacquisition_duplicate_source", src_dup)
    # F: ledger append-only violation (last transition.to != disposition) -> reject
    def led_appendonly():
        m = copy.deepcopy(led)
        for r in m["rows"]:
            if r["metric_id"] == "SW-013":
                r["transitions"].append({"from": "source_investigation_pending", "to": "source_investigation_pending", "at": "2026-09-02T07:00:00Z", "by": "codex", "reason": "forbidden self-transition"})
        return m
    rec("F_ledger_append_only_violation", lambda: led_mut(led_appendonly()))
    # G: ledger SIP row with non-not_measured evaluation -> reject
    def led_sip_eval():
        m = copy.deepcopy(led)
        for r in m["rows"]:
            if r["metric_id"] == "SW-013":
                r["evaluation_state"] = "measured_unscored"
        return m
    rec("G_ledger_sip_bad_evaluation", lambda: led_mut(led_sip_eval()))
    # H: packet lifecycle bucket disposition mismatch (SIP id put in calculation_pending) -> reject
    def pkt_bucket_mismatch():
        m = copy.deepcopy(pkt)
        m["lifecycle_partition"]["source_investigation_pending_ids"] = ["SW-011", "SW-014"]
        m["lifecycle_partition"]["accepted_measured_ids"] = ["SW-012", "SW-015"]
        m["lifecycle_partition"]["calculation_pending_ids"] = ["SW-013"]
        return m
    rec("H_packet_bucket_disposition_mismatch", lambda: pkt_mut(pkt_bucket_mismatch()))

    def sem(mutator):
        m = copy.deepcopy(pkt); mutator(m)
        e = []; check_semantic_immutability(m, e); return e

    def _def(m, mid):
        return next(d for d in m["metric_definitions"] if d["metric_id"] == mid)
    # item 9 semantic adversarial probes
    rec("I_sw012_OR_for_AND", lambda: sem(lambda m: _def(m, "SW-012").update({"formula": "count(First Contact Attempt blank OR First Customer Contact blank OR Actual Response Time blank where Originated After Hours == No) / business_hours_population"})))
    rec("J_sw013_business_hours_for_after_hours", lambda: sem(lambda m: _def(m, "SW-013").update({"population": "Serra Honda 21043 business-hours Sales leads (Originated After Hours == No)"})))
    rec("K_sw014_duration_for_two_hour_event", lambda: sem(lambda m: _def(m, "SW-014").update({"calculation_kind": "duration"})))
    rec("L_sw015_minutes_difference_for_2x_share", lambda: sem(lambda m: _def(m, "SW-015").update({"formula": "per-rep mean Actual Response Time minus store median (minutes difference)"})))
    rec("M_sw011_target_replacement", lambda: sem(lambda m: _def(m, "SW-011").__setitem__("grade_target_contract", {"grade_target_id": "TH-011", "approval_state": "proposed", "status": "draft"})))
    # regression of a prior accepted/evaluated state (ledger)
    def led_regress():
        m = copy.deepcopy(led)
        for r in m["rows"]:
            if r["metric_id"] == "SW-011":
                r["evaluation_state"] = "not_measured"; r["acquisition_admission_state"] = "admitted_held"
        return m
    rec("N_prior_accepted_state_regression", lambda: led_mut(led_regress()))
    # cross-packet independence: overlap between two packets (blocking would leak) rejects
    def idx_overlap():
        m = copy.deepcopy(idx)
        # inject PKT-02-01's blocked SW-013 into an unrelated packet
        for p in m["packets"]:
            if p["packet_id"] != "PKT-02-01" and p["module"] == 2:
                p["target_ids"] = p["target_ids"] + ["SW-013"]
                break
        return m

    def cross_mut(m):
        e = []; check_cross_packet_independence(m, e); return e
    rec("O_cross_packet_overlap_blocking_leak", lambda: cross_mut(idx_overlap()))

    # --- coordinated-bypass semantic probes: multiple wrong fields that still contain expected keywords ---
    rec("P_sw012_two_fields_present_not_all_three", lambda: sem(lambda m: _def(m, "SW-012").update({
        "numerator": "count of business-hours leads where First Contact Attempt is blank AND First Customer Contact is blank (Originated After Hours == No)",
        "formula": "count(First Contact Attempt blank AND First Customer Contact blank where Originated After Hours == No) / business_hours_population"})))
    rec("Q_sw013_unrelated_after_hours_event", lambda: sem(lambda m: _def(m, "SW-013").update({
        "population": "Serra Honda 21043 after-hours Sales leads that were sold in the period"})))
    rec("R_sw014_unrelated_count_question", lambda: sem(lambda m: _def(m, "SW-014").update({
        "business_question": "How many Sales leads were contacted in the period?",
        "population": "Serra Honda 21043 Sales leads contacted in the period",
        "explainability_ref": "count of contacted leads", "evidence_ref": "count of contacted leads", "formula": "count of contacted leads"})))
    rec("S_sw015_denominator_all_leads", lambda: sem(lambda m: _def(m, "SW-015").update({
        "denominator": "all accepted leads rows"})))
    rec("T_sw011_threshold_999", lambda: sem(lambda m: (_def(m, "SW-011").__setitem__("detection_threshold_contract", dict(_def(m, "SW-011")["detection_threshold_contract"], rule="median_business_hours_response_min > 999")),
                                                        _def(m, "SW-011").__setitem__("grade_target_contract", dict(_def(m, "SW-011")["grade_target_contract"], value_or_range="> 999 minutes (breach); comparator '>' lower_is_better")))))
    # --- chronological (tz-aware) timestamp reversal across offsets ---
    def ts_reversal():
        r = {"disposition": "measured_validated", "transitions": [
            {"from": None, "to": "data_acquired_calculation_pending", "at": "2026-09-02T06:51:10Z", "by": "codex", "reason": "init"},
            {"from": "data_acquired_calculation_pending", "to": "measured_validated", "at": "2026-09-02T07:00:00+14:00", "by": "codex", "reason": "valid adjacency but chronologically earlier"}]}
        e = []; check_transitions(r, "SW-TS", e); return e
    rec("U_timestamp_chronological_reversal_offset", ts_reversal)
    return probes


def _overlay_metric_customer_full():
    m = {"metric_id": "SW-079", "definition_version": "0.1.0", "module": p1.OWNER[79][0],
         "business_question": "q", "boundary_class": "separate_serra_service", "population": "n/a",
         "calculation_kind": "direct", "null_missing_behavior": "not_applicable", "unit": "id",
         "polarity": "neutral_control", "window": "w", "timezone": "America/New_York", "cadence": "weekly",
         "impact_method": "none", "impact_status": "not_applicable", "gradable": False, "sensitivity_class": "none",
         "protected_content": False, "authorization": "none_required", "disposition": "outside_sales_domain",
         "source_existence_state": "proved_outside_sales_domain", "evaluation_state": "not_measured",
         "source_dependency_ids": [], "evidence_ref": "overlay", "evidence_as_of": "2026-09-02T00:00:00Z",
         "owner": "codex", "internal_visibility": True, "customer_visibility": "full", "confidence": "not_applicable",
         "explainability_ref": "x", "evidence_index_ref": "x"}
    for k, pfx in (("detection_threshold_contract", "TH"), ("comparison_reference_contract", "CR"), ("grade_target_contract", "GT")):
        pass
    m["detection_threshold_contract"] = {"threshold_id": "TH-079", "version": "1.0.0", "rule": "x", "provenance": "p", "effective_dates": "2026-09", "approval_state": "proposed", "status": "draft"}
    m["comparison_reference_contract"] = {"reference_id": "CR-079", "version": "1.0.0", "basis": "dealer_history", "formula": "f", "provenance": "p", "publication_date": "2026-09", "valid_period": "2026", "compatibility_result": "unresolved", "assumptions": "a", "confidence": "low", "approval_state": "proposed", "status": "draft"}
    m["grade_target_contract"] = {"grade_target_id": "GT-079", "version": "1.0.0", "basis": "dealer_history", "value_or_range": "x", "provenance": "p", "effective_dates": "2026-09", "compatibility_result": "unresolved", "approval_state": "unresolved", "status": "draft"}
    return m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--no-write", action="store_true")
    args = ap.parse_args()

    led = load("master-ledger-295.json")
    idx = load("packet-index.json")
    pkt = p1.load(os.path.join(C1B, "packets", "PKT-02-01.json"))
    reg = load("source-registry-1b.json")

    errs = []
    check_packet_index(idx, errs)
    check_cross_packet_independence(idx, errs)
    check_ledger(led, idx, errs)
    check_packet(pkt, reg, errs)
    check_semantic_immutability(pkt, errs)
    check_source(reg, errs)
    probes = run_probes(led, idx, pkt, reg)
    failed_probes = [p for p in probes if not p["pass"]]

    files = {f: p1.sha256_file(os.path.join(C1B, f)) for f in
             ["master-ledger-schema.json", "master-ledger-295.json", "packet-index.json",
              "packet-schema-1b.json", "source-registry-1b.json"]}
    files["packets/PKT-02-01.json"] = p1.sha256_file(os.path.join(C1B, "packets", "PKT-02-01.json"))

    overall = (not errs) and (not failed_probes)
    result = {
        "check": "honda_watchdog_phase1b",
        "phase": "Phase 1B — packetized execution instances (design-only)",
        "reuses": "scripts/halo-phase1/validate_phase1_contracts.py (Phase 1A generic engine, unmodified)",
        "instance_files": files,
        "ledger_metrics": len(led["rows"]),
        "packets": len(idx["packets"]),
        "authored_packet": "PKT-02-01 (SW-011..015)",
        "two_delta_present": bool(pkt.get("two_delta_proof", {}).get("evidence_delta") and pkt.get("two_delta_proof", {}).get("meaning_delta")),
        "semantic_bindings_provenance": SEMANTIC_PROVENANCE,
        "acquisition_truth": {"admitted_promoted_leads": ["SW-011", "SW-012", "SW-015", "SW-090"], "admitted_held_other_evaluated_count": 13, "note": "All 17 preserve evaluated/report state; analytical evaluation is not acquisition promotion."},
        "adversarial_probes_total": len(probes),
        "adversarial_probes_failed": len(failed_probes),
        "adversarial_probes": probes,
        "errors": errs,
        "overall_pass": overall,
        "note": "Design-only: only PKT-02-01 authored in detail; the other 289 ledger rows are planning-level (packet assignment + init state), no metric definitions. No Vin/Gmail/runtime/DB/vault/INGEST action.",
    }
    payload = json.dumps(result, indent=2, ensure_ascii=False)
    if not args.no_write:
        os.makedirs(os.path.dirname(args.out), exist_ok=True)
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(payload + "\n")
    print(payload)
    print(f"\nRESULT: {'PASS' if overall else 'FAIL'} (errors {len(errs)}, probes {len(probes)-len(failed_probes)}/{len(probes)})", file=sys.stderr)
    return 0 if overall else 1


if __name__ == "__main__":
    raise SystemExit(main())
