#!/usr/bin/env python3
"""
Phase 1B — build the versioned PKT-02-01 semantic binding artifact and set the packet to EQUAL it
field-for-field. The binding is the exact authority for SW-011..015 in this Phase 1B instance:
  - SW-011/012/015 definitional fields (formula/numerator/denominator/unit/source_fields/baseline_id/
    comparator) are copied EXACTLY from gate2-evaluator-contract.json; the operational-target anchor
    (comparator/threshold/unit/direction/basis) EXACTLY from baseline-registry.json.
  - canonical_condition EXACTLY equals the frozen catalog condition for each metric.
  - SW-013/014 (not evaluable in Gate 2) carry the exact catalog condition verbatim + the reviewed
    source-pending contract; their exact packet fields are authoritative for this instance.
The Phase 1B validator enforces exact equality packet == binding (no substring/keyword logic) and
re-verifies the binding against the immutable authorities. Design-only; reads pinned authorities only.
"""
from __future__ import annotations

import hashlib
import json
import os

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
C = os.path.join(REPO, "docs", "halo", "contract")
GATE2 = json.load(open(os.path.join(C, "gate2-evaluator-contract.json")))["evaluable_conditions"]
CATALOG = {e["metric_id"]: e for e in json.load(open(os.path.join(C, "semantic-watchdog-feasibility-matrix-295.json")))}
_BR = json.load(open(os.path.join(C, "baseline-registry.json")))
_OTS = _BR["operational_targets"] if isinstance(_BR["operational_targets"], list) else list(_BR["operational_targets"].values())
OT = {e["id"]: e for e in _OTS if isinstance(e, dict) and "id" in e}
ALIAS = {"Sales Rep": "Sales Rep (aggregated, pseudonymized)"}  # exact presentation alias -> authority field

# Phase-1B-authored fields (literals). These become authoritative for this instance via the binding hash.
AUTHORED = {
    "SW-011": {
        "business_question": "How quickly are new business-hours Sales leads receiving their first response (median)?",
        "population": "Serra Honda 21043 Sales leads, period 2026-08-24..2026-08-30, Originated After Hours == No (business-hours-originated)",
        "grade_value_or_range": "> 10 minutes (breach); comparator '>' lower_is_better",
        "detection_rule": "median_business_hours_response_min > 10", "grade_basis": "operator_potential",
    },
    "SW-012": {
        "business_question": "What is the strict-untouched rate: business-hours leads with NO first contact attempt AND NO first customer contact AND NO actual response time?",
        "population": "Serra Honda 21043 Sales leads, period 2026-08-24..2026-08-30, Originated After Hours == No (business-hours population)",
        "grade_value_or_range": "> 0 (any strict-untouched lead = breach); comparator '>' lower_is_better",
        "detection_rule": "strict_untouched_rate > 0", "grade_basis": "operator_potential",
    },
    "SW-015": {
        "business_question": "What share of Sales reps have a mean first-response at least 2x the store median (business-hours population)?",
        "population": "Serra Honda 21043 Sales leads, period 2026-08-24..2026-08-30, Originated After Hours == No (SW-011 business-hours population), grouped by Sales Rep (pseudonymized, ephemeral)",
        "grade_value_or_range": "> 0 (any rep >= 2x store median = breach); comparator '>' lower_is_better",
        "detection_rule": "rep_2x_store_median_share > 0", "grade_basis": "operator_potential",
        "presentation_direct_source_fields": ["Sales Rep", "Actual Response Time (Min)", "Originated After Hours"],
    },
    "SW-013": {
        "business_question": "Do AFTER-HOURS-originated leads receive a first HUMAN response by the authoritative next opening + 15 minutes?",
        "population": "Serra Honda 21043 AFTER-HOURS-originated Sales leads (Originated After Hours == Yes) with no HUMAN response by the authoritative next opening + 15 minutes",
        "calculation_kind": "rate",
    },
    "SW-014": {
        "business_question": "How many Sales leads received an AUTO-REPLY-ONLY first response with NO human touch within two hours?",
        "population": "Serra Honda 21043 Sales leads (no business-hours restriction) whose first response was auto-reply only AND had no human touch within two hours",
        "calculation_kind": "count", "unit": "leads",
    },
}


def _evaluable(mid, ak):
    g = GATE2[mid]
    ot = OT[g["baseline_id"]]
    a = AUTHORED[mid]
    return {
        "canonical_condition": CATALOG[mid]["condition"],
        "business_question": a["business_question"], "population": a["population"],
        "calculation_kind": ak, "numerator": g["numerator_field"], "denominator": g["denominator_field"],
        "formula": g["formula"], "unit": g["unit"],
        "direct_source_fields": list(g["source_fields"]),
        "disposition": "measured_validated", "source_existence_state": "acquired_local", "evaluation_state": "measured_graded",
        "lifecycle_bucket": "accepted_measured_ids",
        "grade_target_id": "GT-" + g["baseline_id"], "grade_approval": "approved", "grade_status": "active",
        "grade_basis": a["grade_basis"], "grade_value_or_range": a["grade_value_or_range"], "detection_rule": a["detection_rule"],
        "ot_anchor": {"baseline_id": ot["id"], "comparator": ot["comparator"], "threshold": ot["threshold"],
                      "unit": ot["unit"], "direction": ot["direction"], "basis": ot["basis"]},
        "authority": "gate2-evaluator-contract.json + baseline-registry.json + catalog condition",
    }


def _pending(mid):
    a = AUTHORED[mid]
    return {
        "canonical_condition": CATALOG[mid]["condition"],
        "business_question": a["business_question"], "population": a["population"],
        "calculation_kind": a["calculation_kind"], "numerator": None, "denominator": None, "formula": None,
        "unit": a.get("unit", "ratio_0_1"), "direct_source_fields": [],
        "disposition": "source_investigation_pending", "source_existence_state": "investigation_pending", "evaluation_state": "not_measured",
        "lifecycle_bucket": "source_investigation_pending_ids",
        "grade_target_id": "GT-" + mid[3:], "grade_approval": "unresolved", "grade_status": "draft",
        "grade_basis": "dealer_history", "grade_value_or_range": "pending", "detection_rule": "pending",
        "ot_anchor": None,
        "authority": "catalog condition (verbatim) + reviewed source-pending contract (this Phase 1B instance)",
    }


def build():
    metrics = {
        "SW-011": _evaluable("SW-011", "duration"),
        "SW-012": _evaluable("SW-012", "rate"),
        "SW-015": _evaluable("SW-015", "rate"),
        "SW-013": _pending("SW-013"),
        "SW-014": _pending("SW-014"),
    }
    binding = {
        "artifact": "honda-watchdog-phase1b-pkt-02-01-binding",
        "version": 1,
        "packet_id": "PKT-02-01",
        "immutable_after_independent_pass": False,
        "note": "Exact per-metric authority record. The packet must EQUAL each field (no substring/keyword logic). This binding is anchored to the immutable authorities and its sha256 is pinned in the packet + evidence manifest; it becomes immutable only after an independent PASS, and later phases MUST assert this hash.",
        "anchors": {
            "catalog": "docs/halo/contract/semantic-watchdog-feasibility-matrix-295.json (29c7ac06…) — canonical_condition",
            "gate2": "docs/halo/contract/gate2-evaluator-contract.json — SW-011/012/015 formula/numerator_field/denominator_field/unit/source_fields/baseline_id",
            "baseline_registry": "docs/halo/contract/baseline-registry.json — OT-SW-011/012/015 comparator/threshold/unit/direction/basis",
        },
        "alias_map": ALIAS,
        "metrics": metrics,
    }
    bpath = os.path.join(C, "phase1b", "pkt-02-01-binding.json")
    payload = json.dumps(binding, indent=2, ensure_ascii=False) + "\n"
    open(bpath, "w", encoding="utf-8").write(payload)
    bsha = hashlib.sha256(payload.encode("utf-8")).hexdigest()

    # Set the packet metric defs to EQUAL the binding (definitional fields), keep other metric_row fields.
    ppath = os.path.join(C, "phase1b", "packets", "PKT-02-01.json")
    pkt = json.load(open(ppath))
    for m in pkt["metric_definitions"]:
        b = metrics[m["metric_id"]]
        m["business_question"] = b["business_question"]
        m["population"] = b["population"]
        m["calculation_kind"] = b["calculation_kind"]
        m["unit"] = b["unit"]
        m["disposition"] = b["disposition"]
        m["source_existence_state"] = b["source_existence_state"]
        m["evaluation_state"] = b["evaluation_state"]
        # numerator/denominator/formula: exact when present, else remove
        for k in ("numerator", "denominator", "formula"):
            if b[k] is None:
                m.pop(k, None)
            else:
                m[k] = b[k]
        # direct_source_fields: presentation form for SW-015, authority form otherwise
        if m["metric_id"] == "SW-015":
            m["direct_source_fields"] = AUTHORED["SW-015"]["presentation_direct_source_fields"]
        elif b["direct_source_fields"]:
            m["direct_source_fields"] = b["direct_source_fields"]
        else:
            m.pop("direct_source_fields", None)
        # grade + detection contracts (exact)
        m["grade_target_contract"]["grade_target_id"] = b["grade_target_id"]
        m["grade_target_contract"]["approval_state"] = b["grade_approval"]
        m["grade_target_contract"]["status"] = b["grade_status"]
        m["grade_target_contract"]["basis"] = b["grade_basis"]
        m["grade_target_contract"]["value_or_range"] = b["grade_value_or_range"]
        m["detection_threshold_contract"]["rule"] = b["detection_rule"]
    pkt["authority_binding"] = {"ref": "docs/halo/contract/phase1b/pkt-02-01-binding.json", "sha256": bsha}
    open(ppath, "w", encoding="utf-8").write(json.dumps(pkt, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote binding (sha256 {bsha}) and set packet to equal it")


if __name__ == "__main__":
    build()
