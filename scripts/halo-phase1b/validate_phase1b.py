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
import sys

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
ACCEPTED_DISP_ONLY = {"external_source_required", "additional_history_required", "genuinely_not_available", "outside_sales_domain"}


def _num(mid):
    return int(mid.split("-")[1])


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
        tr = r.get("transitions") or []
        if not tr or tr[-1].get("to") != disp:
            errs.append(f"ledger {mid}: transitions[-1].to != disposition (append-only)")
        if disp in ("measured_validated", "data_acquired_calculation_pending"):
            if not r.get("source_dependency_ids"):
                errs.append(f"ledger {mid}: measurable needs nonempty source_dependency_ids")
            for s in r.get("source_dependency_ids") or []:
                if s not in CTX_SRC["source_ids"]:
                    errs.append(f"ledger {mid}: source {s} not registered")


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
            if r["metric_id"] == "SW-011":
                r["transitions"][-1]["to"] = "measured_validated"  # disagrees with disposition
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
        m["lifecycle_partition"]["source_investigation_pending_ids"] = ["SW-014"]
        m["lifecycle_partition"]["calculation_pending_ids"] = ["SW-011", "SW-012", "SW-013", "SW-015"]
        return m
    rec("H_packet_bucket_disposition_mismatch", lambda: pkt_mut(pkt_bucket_mismatch()))
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
    check_ledger(led, idx, errs)
    check_packet(pkt, reg, errs)
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
