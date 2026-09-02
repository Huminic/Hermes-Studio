#!/usr/bin/env python3
"""
Honda Semantic Watchdog — Phase 1A deterministic CONTRACT validator + self-tests.

PURPOSE (Phase 1A, design-only): freeze/verify the planning contracts BEFORE any metric
row or packet is authored. This validator:

  A. STRUCTURE — re-proves the frozen 295 / 11-module / 18-overlay preservation (reusing the
     Phase 0 module map) and that the frozen-vocabularies overlay equals the SPEC overlay.
  B. VOCAB CLOSURE — proves each of the 6 closed vocabularies is well-formed, that every
     transition references only in-set states, that disposition has 8 values, and that
     `source_investigation_pending` has EXACTLY the approved allowed-targets and NONE of the
     forbidden direct targets (SPEC_AMENDMENT_001).
  C. SELF-TESTS — synthetic in-memory fixtures that prove each rule class FIRES (fail-closed):
     metric-row schema, packet partition/two-delta, state transitions, formula rules,
     threshold/reference/target separation, DAG dedupe, privacy/PII, candidate-intake, and
     change-scope (295 frozen). NO real metric rows or packets are authored or required.

It reads only local contract files; no network / Gmail / VinSolutions access. Fail-closed and
evidence-first: any failure sets overall_pass=false and is enumerated.

Usage:
  python3 scripts/halo-phase1/validate_phase1_contracts.py [--out <path>] [--no-write]
Exit 0 == PASS, 1 == FAIL.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CONTRACT_DIR = os.path.join(REPO_ROOT, "docs", "halo", "contract", "phase1")
MATRIX = os.path.join(REPO_ROOT, "docs", "halo", "contract", "semantic-watchdog-feasibility-matrix-295.json")
DEFAULT_OUT = os.path.join(REPO_ROOT, "docs", "halo", "evidence", "honda-watchdog", "phase1a", "PHASE1A_CONTRACT_CHECKS.json")

# Reuse the Phase 0 frozen module map + overlay (single source of truth for 295/11/18).
sys.path.insert(0, os.path.join(REPO_ROOT, "scripts", "halo-phase0"))
import validate_phase0_catalog as p0  # noqa: E402

SW = re.compile(r"^SW-\d{3}$")


def load(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


# ----------------------------------------------------------------------------- structure/vocab
def check_structure(errors):
    matrix = load(MATRIX)
    ids = [e.get("metric_id") for e in matrix]
    nums = sorted(int(m.split("-")[1]) for m in ids)
    if not (len(matrix) == 295 and nums == list(range(1, 296))):
        errors.append("STRUCTURE: catalog is not exactly 295 contiguous SW-001..SW-295")
    owner = {}
    for num, _title, _dc, ranges in p0.MODULES:
        for i in p0.expand(ranges):
            owner.setdefault(i, []).append(num)
    if len(p0.MODULES) != 11:
        errors.append("STRUCTURE: module count != 11")
    if sorted(owner) != list(range(1, 296)) or any(len(v) != 1 for v in owner.values()):
        errors.append("STRUCTURE: 11-module map does not cover every ID exactly once")
    overlay_spec = sorted(p0.sw(i) for i in p0.SERVICE_OVERLAY)
    if len(overlay_spec) != 18:
        errors.append("STRUCTURE: SPEC overlay != 18")
    fv = load(os.path.join(CONTRACT_DIR, "frozen-vocabularies.json"))
    overlay_fv = sorted(fv["closed_vocabularies"]["boundary_class"]["service_overlay_ids"])
    if overlay_fv != overlay_spec:
        errors.append("STRUCTURE: frozen-vocabularies overlay != SPEC 18-overlay")
    return owner, matrix


def check_vocab_closure(errors, fv):
    v = fv["closed_vocabularies"]
    # disposition: 8 values, transitions closed, amendment invariants
    disp = v["disposition"]
    dvals = set(disp["values"].keys())
    if len(dvals) != 8 or disp.get("count") != 8:
        errors.append("VOCAB: disposition must have exactly 8 values")
    for frm, tos in disp["transitions"].items():
        if frm not in dvals:
            errors.append(f"VOCAB: disposition transition from unknown state {frm}")
        for t in tos:
            if t not in dvals:
                errors.append(f"VOCAB: disposition transition to unknown state {t}")
    inv = disp["invariants"]
    sip = set(disp["transitions"].get("source_investigation_pending", []))
    if sip != set(inv["source_investigation_pending_allowed_targets_exact"]):
        errors.append("VOCAB: source_investigation_pending allowed-targets != approved exact set")
    if sip & set(inv["source_investigation_pending_forbidden_direct_targets"]):
        errors.append("VOCAB: source_investigation_pending reaches a forbidden direct target")
    for term in inv["terminal_states"]:
        if disp["transitions"].get(term, []) != []:
            errors.append(f"VOCAB: terminal disposition {term} has outgoing transitions")
    if disp["values"]["source_investigation_pending"].get("terminal") is not False:
        errors.append("VOCAB: source_investigation_pending must be nonterminal")
    # other closed vocabs must declare closed:true and nonempty values
    for name in ("boundary_class", "source_existence_state", "metric_evaluation_state",
                 "acquisition_admission_state", "report_acceptance_state"):
        node = v[name]
        if not node.get("closed"):
            errors.append(f"VOCAB: {name} not marked closed")
        if not node.get("values"):
            errors.append(f"VOCAB: {name} has no values")
    # acquisition invariants: quarantine terminal, promotion only from held
    acq = v["acquisition_admission_state"]
    if acq["transitions"].get("quarantined", None) != []:
        errors.append("VOCAB: quarantined must be terminal")
    if acq["transitions"].get("admitted_held") != ["admitted_promoted"]:
        errors.append("VOCAB: promotion must be only from admitted_held")
    return v


# ----------------------------------------------------------------------------- validators used by self-tests
def _v(fv):
    return fv["closed_vocabularies"]


def validate_metric_row(row, fv, owner):
    """Return list of errors for a single (synthetic) metric row."""
    v = _v(fv)
    e = []
    mid = row.get("metric_id")
    if not (isinstance(mid, str) and SW.match(mid)):
        e.append("bad metric_id"); return e
    num = int(mid.split("-")[1])
    if not (1 <= num <= 295):
        e.append("metric_id out of 295")
    if row.get("module") != (owner.get(num, [None])[0]):
        e.append("module != frozen owner")
    for f, vocab in (("boundary_class", "boundary_class"), ("disposition", "disposition"),
                     ("source_existence_state", "source_existence_state"),
                     ("evaluation_state", "metric_evaluation_state")):
        if row.get(f) not in v[vocab]["values"]:
            e.append(f"{f} not in closed vocab")
    bc, disp, ses, es = row.get("boundary_class"), row.get("disposition"), row.get("source_existence_state"), row.get("evaluation_state")
    grad = row.get("gradable")
    cust = row.get("customer_visibility")
    overlay = set(v["boundary_class"]["service_overlay_ids"])
    # boundary consistency
    if bc != "sales":
        if cust == "full" or grad is True or es not in ("not_measured", "measured_unscored"):
            e.append("non-sales boundary must be disposition-only, not gradable, not customer-full")
    if mid in overlay:
        if bc != "separate_serra_service" or cust != "appendix_id_label_only":
            e.append("service overlay id must be separate_serra_service + appendix_id_label_only")
    # disposition/source_existence consistency
    allowed_ses = v["disposition"]["invariants"] and _v(fv)["source_existence_state"]["disposition_consistency"].get(disp)
    if allowed_ses and ses not in allowed_ses:
        e.append("source_existence_state inconsistent with disposition")
    # source_investigation_pending required fields
    if disp == "source_investigation_pending":
        if grad is not False or cust == "full":
            e.append("source_investigation_pending must be gradable=false and not customer-full")
        for f in ("owner", "next_action", "review_point", "evidence_as_of"):
            if not row.get(f):
                e.append(f"source_investigation_pending missing {f}")
        if ses not in ("unproved", "investigation_pending"):
            e.append("source_investigation_pending needs unproved/investigation_pending existence")
    # grading rules
    if es == "measured_graded":
        gt = row.get("grade_target_contract") or {}
        if grad is not True or disp != "measured_validated":
            e.append("measured_graded requires gradable + measured_validated")
        if gt.get("approval_state") != "approved" or gt.get("status") != "active":
            e.append("measured_graded requires an approved+active grade_target")
        for f in ("numerator", "denominator", "formula", "unit", "window"):
            if not row.get(f):
                e.append(f"measured_graded requires {f}")
    if grad is False and es == "measured_graded":
        e.append("gradable=false cannot be measured_graded")
    # calculated requires formula + direct fields
    if es in ("measured_graded", "measured_unscored") and disp in ("measured_validated", "data_acquired_calculation_pending"):
        if not row.get("formula") or not row.get("direct_source_fields"):
            e.append("calculated/measured requires formula + direct_source_fields (missing is not zero)")
    # protected content
    if row.get("protected_content") is True and not row.get("envelope_authorized"):
        if es not in ("not_measured", "measured_unscored", "measured_abstained"):
            e.append("protected content without envelope cannot be measured_graded")
    return e


def score_allowed(row, fv):
    """True only if the row may be scored (graded) — proves threshold/reference/target separation."""
    gt = row.get("grade_target_contract") or {}
    return bool(row.get("gradable") is True
                and gt.get("approval_state") == "approved" and gt.get("status") == "active")


def validate_packet(pkt, owner):
    e = []
    if not isinstance(pkt.get("module"), int) or not (1 <= pkt["module"] <= 11):
        e.append("module must be one int 1..11")
    tids = pkt.get("target_ids", [])
    if len(set(tids)) != len(tids):
        e.append("duplicate target_ids")
    for t in tids:
        if not SW.match(t):
            e.append(f"bad target id {t}")
        elif owner.get(int(t.split("-")[1]), [None])[0] != pkt.get("module"):
            e.append(f"{t} not owned by module {pkt.get('module')}")
    if not (5 <= len(tids) <= 12) and not pkt.get("size_reason"):
        e.append("target_ids out of 5..12 without size_reason")
    part = pkt.get("partitions_target", {})
    a = set(part.get("accepted_measured_ids", []))
    b = set(part.get("accepted_disposition_only_ids", []))
    c = set(part.get("rejected_ids", []))
    if (a & b) or (a & c) or (b & c):
        e.append("partitions not mutually exclusive")
    if (a | b | c) != set(tids):
        e.append("partitions union != target_ids")
    td = pkt.get("two_delta_proof", {})
    if not td.get("evidence_delta") or not td.get("meaning_delta"):
        e.append("two_delta_proof requires both evidence_delta and meaning_delta")
    sc = pkt.get("stop_conditions", {})
    if not sc.get("inherited_canonical"):
        e.append("packet must inherit canonical fail-closed stops")
    return e


def disp_transition_ok(fv, frm, to):
    return to in _v(fv)["disposition"]["transitions"].get(frm, [])


def acq_transition_ok(fv, frm, to):
    return to in _v(fv)["acquisition_admission_state"]["transitions"].get(frm, [])


def validate_source_dag(nodes):
    e = []
    seen = set()
    for n in nodes:
        key = (n["profile"], n["family"], n["period"], n["schema_revision"])
        if key in seen:
            e.append(f"duplicate acquisition dedupe key {key} (no per-metric duplicate acquisition)")
        seen.add(key)
        for m in n.get("dependent_metric_ids", []):
            if not SW.match(m):
                e.append(f"DAG edge to non-SW target {m}")
    return e


def validate_candidate(c):
    e = []
    cid = c.get("candidate_id", "")
    if not re.match(r"^CAND-\d{4}$", cid):
        e.append("candidate_id must match ^CAND-\\d{4}$")
    if SW.match(cid):
        e.append("candidate_id must NOT be an SW id")
    if c.get("relationship_to_295") == "refines_existing" and not c.get("related_sw_id"):
        e.append("refines_existing requires related_sw_id")
    if c.get("mutates_295"):
        e.append("candidate intake may not mutate the authoritative 295")
    return e


# ----------------------------------------------------------------------------- self-tests
def run_self_tests(fv, owner):
    """Each test: (name, expect_pass, produced_errors). A test 'passes' if the fixture's
    accepted/rejected outcome matches expectation (proving the rule fires)."""
    results = []

    def rec(name, expect_accepted, errs):
        accepted = (len(errs) == 0)
        ok = (accepted == expect_accepted)
        results.append({"test": name, "expected": "accept" if expect_accepted else "reject",
                        "got": "accept" if accepted else "reject", "pass": ok,
                        "sample_error": (errs[0] if errs else None)})

    v = _v(fv)
    # a canonical VALID sales metric row (synthetic fixture, not authored data)
    good = {
        "metric_id": "SW-011", "definition_version": "1.0.0", "module": owner[11][0],
        "business_question": "q", "boundary_class": "sales", "population": "p",
        "numerator": "n", "denominator": "d", "formula": "n/d", "direct_source_fields": ["a"],
        "unit": "pct", "polarity": "higher_is_better", "window": "wk", "timezone": "America/New_York",
        "cadence": "weekly", "gradable": True, "disposition": "measured_validated",
        "source_existence_state": "acquired_local", "evaluation_state": "measured_graded",
        "customer_visibility": "full", "owner": "claude_studio",
        "grade_target_contract": {"approval_state": "approved", "status": "active"},
    }
    rec("metric_row.valid_sales_graded", True, validate_metric_row(good, fv, owner))

    r = dict(good, evaluation_state="measured_graded", grade_target_contract={"approval_state": "proposed", "status": "draft"})
    rec("metric_row.graded_without_approved_target_rejected", False, validate_metric_row(r, fv, owner))

    r = dict(good, formula="", direct_source_fields=[])
    rec("metric_row.calculated_without_formula_rejected", False, validate_metric_row(r, fv, owner))

    r = dict(good, gradable=False, evaluation_state="measured_graded")
    rec("metric_row.nongradable_graded_rejected", False, validate_metric_row(r, fv, owner))

    # source_investigation_pending fixtures
    sip_ok = {
        "metric_id": "SW-012", "definition_version": "1.0.0", "module": owner[12][0],
        "business_question": "q", "boundary_class": "sales", "population": "p", "unit": "u",
        "polarity": "neutral_control", "window": "wk", "timezone": "America/New_York",
        "cadence": "weekly", "gradable": False, "disposition": "source_investigation_pending",
        "source_existence_state": "investigation_pending", "evaluation_state": "not_measured",
        "customer_visibility": "hidden", "owner": "codex", "next_action": "one finite pass",
        "review_point": "2026-09-15", "evidence_as_of": "2026-09-02T00:00:00Z",
    }
    rec("metric_row.source_investigation_pending_valid", True, validate_metric_row(sip_ok, fv, owner))
    rec("metric_row.source_investigation_pending_missing_reviewpoint_rejected", False,
        validate_metric_row(dict(sip_ok, review_point=None), fv, owner))
    rec("metric_row.source_investigation_pending_gradable_rejected", False,
        validate_metric_row(dict(sip_ok, gradable=True), fv, owner))

    # service overlay privacy
    ov = {
        "metric_id": "SW-079", "definition_version": "1.0.0", "module": owner[79][0],
        "business_question": "q", "boundary_class": "separate_serra_service", "population": "p",
        "unit": "u", "polarity": "neutral_control", "window": "wk", "timezone": "America/New_York",
        "cadence": "weekly", "gradable": False, "disposition": "outside_sales_domain",
        "source_existence_state": "proved_outside_sales_domain", "evaluation_state": "not_measured",
        "customer_visibility": "appendix_id_label_only", "owner": "codex",
    }
    rec("metric_row.service_overlay_valid", True, validate_metric_row(ov, fv, owner))
    rec("metric_row.service_overlay_wrong_boundary_rejected", False,
        validate_metric_row(dict(ov, boundary_class="sales"), fv, owner))

    # protected content
    pc = dict(sip_ok, metric_id="SW-142", module=owner[142][0], protected_content=True,
              sensitivity_class="protected_content", disposition="crm_available_acquisition_pending",
              source_existence_state="proved_available_in_crm", evaluation_state="measured_graded",
              gradable=True, grade_target_contract={"approval_state": "approved", "status": "active"},
              numerator="n", denominator="d", formula="n/d", direct_source_fields=["x"])
    rec("metric_row.protected_content_graded_without_envelope_rejected", False,
        validate_metric_row(pc, fv, owner))

    # threshold/reference/target separation — scoring only via approved grade target
    rec("separation.score_requires_approved_grade_target", True,
        [] if score_allowed(good, fv) else ["not scorable"])
    rec("separation.comparison_reference_alone_cannot_score", False,
        [] if score_allowed(dict(good, grade_target_contract={"approval_state": "reference_only", "status": "active"}), fv) else ["blocked"])

    # disposition transitions
    rec("transition.sip_to_crm_available_allowed", True,
        [] if disp_transition_ok(fv, "source_investigation_pending", "crm_available_acquisition_pending") else ["blocked"])
    rec("transition.sip_to_measured_forbidden", False,
        [] if disp_transition_ok(fv, "source_investigation_pending", "measured_validated") else ["blocked"])
    rec("transition.sip_to_data_acquired_forbidden", False,
        [] if disp_transition_ok(fv, "source_investigation_pending", "data_acquired_calculation_pending") else ["blocked"])

    # acquisition transitions
    rec("transition.held_to_promoted_allowed", True,
        [] if acq_transition_ok(fv, "admitted_held", "admitted_promoted") else ["blocked"])
    rec("transition.quarantine_to_admitted_forbidden", False,
        [] if acq_transition_ok(fv, "quarantined", "admitted_held") else ["blocked"])

    # packet partition + two-delta
    good_pkt = {
        "packet_id": "PKT-02-01", "module": 2, "target_ids": ["SW-011", "SW-012", "SW-013", "SW-014", "SW-015"],
        "partitions_target": {"accepted_measured_ids": ["SW-011", "SW-012"],
                              "accepted_disposition_only_ids": ["SW-013", "SW-014"], "rejected_ids": ["SW-015"]},
        "two_delta_proof": {"evidence_delta": "raw->norm", "meaning_delta": "norm->metric"},
        "stop_conditions": {"inherited_canonical": "fail-closed-stops.json", "packet_specific": []},
    }
    rec("packet.valid", True, validate_packet(good_pkt, owner))
    rec("packet.overlapping_partitions_rejected", False,
        validate_packet(dict(good_pkt, partitions_target={"accepted_measured_ids": ["SW-011", "SW-012"],
            "accepted_disposition_only_ids": ["SW-012", "SW-014"], "rejected_ids": ["SW-015"]}), owner))
    rec("packet.partition_union_mismatch_rejected", False,
        validate_packet(dict(good_pkt, partitions_target={"accepted_measured_ids": ["SW-011"],
            "accepted_disposition_only_ids": ["SW-013"], "rejected_ids": ["SW-015"]}), owner))
    rec("packet.single_delta_rejected", False,
        validate_packet(dict(good_pkt, two_delta_proof={"evidence_delta": "x"}), owner))
    rec("packet.wrong_module_ownership_rejected", False,
        validate_packet(dict(good_pkt, module=3), owner))
    rec("packet.oversize_without_reason_rejected", False,
        validate_packet(dict(good_pkt, target_ids=["SW-011", "SW-012", "SW-013"],
            partitions_target={"accepted_measured_ids": ["SW-011"], "accepted_disposition_only_ids": ["SW-012"], "rejected_ids": ["SW-013"]}), owner)
        if False else validate_packet(dict(good_pkt,
            target_ids=[f"SW-{i:03d}" for i in [11, 12, 13, 14]],
            partitions_target={"accepted_measured_ids": ["SW-011"], "accepted_disposition_only_ids": ["SW-012", "SW-013"], "rejected_ids": ["SW-014"]}), owner))

    # DAG dedupe
    nodes_ok = [{"profile": "serra-honda", "family": "appointments", "period": "2026-08-24..2026-08-30",
                 "schema_revision": "v1", "dependent_metric_ids": ["SW-031", "SW-032"]}]
    rec("dag.unique_dedupe_key_ok", True, validate_source_dag(nodes_ok))
    rec("dag.duplicate_dedupe_key_rejected", False, validate_source_dag(nodes_ok + nodes_ok))

    # candidate intake
    rec("candidate.valid", True, validate_candidate({"candidate_id": "CAND-0001", "relationship_to_295": "net_new"}))
    rec("candidate.sw_id_as_candidate_rejected", False, validate_candidate({"candidate_id": "SW-300"}))
    rec("candidate.mutates_295_rejected", False, validate_candidate({"candidate_id": "CAND-0002", "mutates_295": True}))

    # change-scope: 295 still frozen (structural re-check inside self-tests)
    matrix = load(MATRIX)
    rec("change_scope.catalog_still_295", True,
        [] if len(matrix) == 295 else ["catalog size changed"])

    return results


# ----------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--no-write", action="store_true")
    args = ap.parse_args()

    errors = []
    fv = load(os.path.join(CONTRACT_DIR, "frozen-vocabularies.json"))

    # all frozen contracts must parse
    contract_files = [
        "frozen-vocabularies.json", "metric-row-schema.json", "packet-schema.json",
        "source-registry-dag-schema.json", "beyond-295-candidate-intake-schema.json",
        "fail-closed-stops.json",
    ]
    contract_hashes = {}
    for cf in contract_files:
        p = os.path.join(CONTRACT_DIR, cf)
        try:
            load(p)
            contract_hashes[cf] = sha256_file(p)
        except Exception as ex:  # noqa: BLE001
            errors.append(f"CONTRACT parse failure {cf}: {ex}")

    owner, _matrix = check_structure(errors)
    check_vocab_closure(errors, fv)
    self_tests = run_self_tests(fv, owner)
    failed_tests = [t for t in self_tests if not t["pass"]]

    overall = (not errors) and (not failed_tests)
    result = {
        "check": "honda_watchdog_phase1a_contracts",
        "phase": "Phase 1A — design-only contract freeze + self-tests",
        "contract_files": contract_hashes,
        "structure_295_11_18": "PASS" if not any(e.startswith("STRUCTURE") for e in errors) else "FAIL",
        "vocab_closure": "PASS" if not any(e.startswith("VOCAB") for e in errors) else "FAIL",
        "self_tests_total": len(self_tests),
        "self_tests_failed": len(failed_tests),
        "self_tests": self_tests,
        "errors": errors,
        "overall_pass": overall,
        "note": "Design-only: no metric rows or packets authored. Fixtures are synthetic in-memory cases proving each rule fires.",
    }
    payload = json.dumps(result, indent=2, ensure_ascii=False)
    if not args.no_write:
        os.makedirs(os.path.dirname(args.out), exist_ok=True)
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(payload + "\n")
    print(payload)
    print(f"\nRESULT: {'PASS' if overall else 'FAIL'}", file=sys.stderr)
    return 0 if overall else 1


if __name__ == "__main__":
    raise SystemExit(main())
