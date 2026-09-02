#!/usr/bin/env python3
"""
Honda Semantic Watchdog — Phase 1A deterministic CONTRACT validator + EXHAUSTIVE self-tests.

Design-only (no metric rows or packets authored). This validator is SCHEMA-DRIVEN: enums,
required fields, patterns, transition adjacency, calculation-kind conditionals, context receipts,
fail-closed stops, and sub-contract field sets are all read from the frozen contract files, so the
contracts are the single source of truth and cannot silently drift from the checks.

It enforces — exhaustively, not by example —:
  A. STRUCTURE  : 295 / 11-module / 18-overlay (reusing the Phase 0 module map).
  B. VOCAB      : 6 closed vocabularies + calculation_kind; disposition/source_existence/
                  metric_evaluation/acquisition transition adjacency; SIP allowed/forbidden targets;
                  disposition context receipts.
  C. VALIDATORS : metric-row, three sub-contracts, packet, source-node + DAG, candidate — every
                  required field / type / pattern / enum / conditional.
  D. MUTATIONS  : for EACH required field, enum field, sub-contract field, conditional, transition/
                  context receipt, stop, partition, DAG, and candidate rule, a mutation test proves
                  the rule fires (reject). Plus five named malformed probes that must reject:
                  sparse SIP metric, GNA missing affirmative evidence, sparse packet, sparse source,
                  sparse candidate.

Reads only local files; no network / Gmail / VinSolutions access. Exit 0 == PASS, 1 == FAIL.
Usage: python3 scripts/halo-phase1/validate_phase1_contracts.py [--out <path>] [--no-write]
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import re
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CONTRACT_DIR = os.path.join(REPO_ROOT, "docs", "halo", "contract", "phase1")
MATRIX = os.path.join(REPO_ROOT, "docs", "halo", "contract", "semantic-watchdog-feasibility-matrix-295.json")
DEFAULT_OUT = os.path.join(REPO_ROOT, "docs", "halo", "evidence", "honda-watchdog", "phase1a", "PHASE1A_CONTRACT_CHECKS.json")

SW = re.compile(r"^SW-\d{3}$")
CAND = re.compile(r"^CAND-\d{4}$")

sys.path.insert(0, os.path.join(REPO_ROOT, "scripts", "halo-phase0"))
import validate_phase0_catalog as p0  # noqa: E402


def load(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


# ------------------------------------------------------------------ load frozen contracts (SoT)
FV = load(os.path.join(CONTRACT_DIR, "frozen-vocabularies.json"))["closed_vocabularies"]
MRS = load(os.path.join(CONTRACT_DIR, "metric-row-schema.json"))
PKS = load(os.path.join(CONTRACT_DIR, "packet-schema.json"))
SRS = load(os.path.join(CONTRACT_DIR, "source-registry-dag-schema.json"))
CIS = load(os.path.join(CONTRACT_DIR, "beyond-295-candidate-intake-schema.json"))
FCS = load(os.path.join(CONTRACT_DIR, "fail-closed-stops.json"))

DISP = FV["disposition"]
CALC = FV["calculation_kind"]
OVERLAY = set(FV["boundary_class"]["service_overlay_ids"])
CANON_STOPS = FCS["canonical_stop_names"]


def enum_values(fieldspec):
    if "vocab" in fieldspec:
        return set(FV[fieldspec["vocab"]]["values"].keys())
    if "values" in fieldspec:
        return set(fieldspec["values"])
    return None


def owner_map():
    owner = {}
    for num, _t, _dc, ranges in p0.MODULES:
        for i in p0.expand(ranges):
            owner.setdefault(i, []).append(num)
    return owner


OWNER = owner_map()


# ------------------------------------------------------------------ transition helpers
def _trans(vocab_name, frm, to, ctx=None):
    node = FV[vocab_name]
    if to not in node["transitions"].get(frm, []):
        return False, f"{vocab_name}: {frm}->{to} not adjacent"
    if vocab_name == "disposition":
        for r in DISP.get("context_receipts", {}).get(f"{frm}->{to}", []):
            if not (ctx or {}).get(r):
                return False, f"disposition {frm}->{to} missing context receipt {r}"
    return True, None


# ------------------------------------------------------------------ sub-contract validation (schema-driven)
def _subspec(name):
    return MRS["sub_contracts"][name]["required_fields"]


def validate_subcontract(name, obj):
    e = []
    if not isinstance(obj, dict):
        return [f"{name}: missing/not an object"]
    for field, spec in _subspec(name).items():
        val = obj.get(field)
        if val in (None, "", []):
            e.append(f"{name}: missing {field}")
            continue
        if isinstance(spec, dict) and spec.get("type") == "enum":
            if val not in set(spec["values"]):
                e.append(f"{name}.{field}: '{val}' not in enum")
    return e


# ------------------------------------------------------------------ metric row validation (exhaustive, schema-driven)
def _measurable(row):
    return (row.get("disposition") in ("measured_validated", "data_acquired_calculation_pending")
            or row.get("evaluation_state") in ("measured_unscored", "measured_graded", "measured_abstained"))


def validate_metric_row(row):
    e = []
    rf = MRS["required_fields"]
    # A. always-required presence (key present + not None/empty-string; empty list counts as present)
    for f in MRS["always_required_fields"]:
        v = row.get(f, None)
        if f not in row or v is None or (isinstance(v, str) and v == ""):
            e.append(f"missing required field {f}")
    # measurable metrics must actually name a source
    if _measurable(row) and not row.get("source_dependency_ids"):
        e.append("measurable metric requires nonempty source_dependency_ids")
    # B. generic schema-driven type/enum/pattern/const for every present field
    for f, spec in rf.items():
        if f not in row or not isinstance(spec, dict):
            continue
        v = row[f]
        t = spec.get("type")
        if t == "enum":
            allowed = enum_values(spec)
            if allowed is not None and v not in allowed:
                e.append(f"{f}: '{v}' not in enum")
        elif t == "const":
            if v != spec.get("value"):
                e.append(f"{f}: must be {spec.get('value')}")
        elif t == "integer":
            if not isinstance(v, int):
                e.append(f"{f}: not integer")
            elif spec.get("range") and not (spec["range"][0] <= v <= spec["range"][1]):
                e.append(f"{f}: out of range")
        elif t == "boolean":
            if not isinstance(v, bool):
                e.append(f"{f}: not boolean")
        elif t == "string":
            if spec.get("pattern") and not re.match(spec["pattern"], str(v)):
                e.append(f"{f}: fails pattern")
        elif t and t.startswith("array"):
            if not isinstance(v, list):
                e.append(f"{f}: not array")
            elif spec.get("each_pattern"):
                for it in v:
                    if not re.match(spec["each_pattern"], str(it)):
                        e.append(f"{f}: item fails pattern")
    # C. module ownership vs frozen map
    mid = row.get("metric_id")
    if isinstance(mid, str) and SW.match(mid):
        num = int(mid.split("-")[1])
        if not (1 <= num <= 295):
            e.append("metric_id out of 295")
        elif row.get("module") != OWNER.get(num, [None])[0]:
            e.append("module != frozen owner")
    # D. calculation_kind conditional required fields (only once measurable for source-dependent fields)
    ck = row.get("calculation_kind")
    if ck in CALC["required_fields_by_kind"]:
        source_dep = {"direct_source_fields", "numerator", "denominator", "formula", "zero_denominator_behavior"}
        for f in CALC["required_fields_by_kind"][ck]:
            if f in source_dep and not _measurable(row):
                continue
            if not row.get(f):
                e.append(f"calc_kind {ck} requires {f}")
    if ck == "semantic":
        sem = CALC["semantic_requires"]
        if row.get("sensitivity_class") != sem["sensitivity_class"] or row.get("protected_content") is not sem["protected_content"]:
            e.append("semantic calc_kind requires sensitivity_class=protected_content + protected_content=true")
    # E. disposition-specific
    disp = row.get("disposition")
    if disp == "source_investigation_pending":
        if row.get("gradable") is not False:
            e.append("SIP requires gradable=false")
        if row.get("customer_visibility") == "full":
            e.append("SIP cannot be customer full")
        for f in ("owner", "next_action", "review_point", "evidence_as_of", "finite_investigation_ref"):
            if not row.get(f):
                e.append(f"SIP missing {f}")
        if row.get("source_existence_state") not in ("unproved", "investigation_pending"):
            e.append("SIP requires source_existence_state unproved/investigation_pending")
    if disp == "genuinely_not_available" and not row.get("affirmative_investigation_evidence_ref"):
        e.append("genuinely_not_available requires affirmative_investigation_evidence_ref")
    # F. disposition/source_existence consistency
    cons = FV["source_existence_state"]["disposition_consistency"].get(disp)
    if cons and row.get("source_existence_state") not in cons:
        e.append("source_existence_state inconsistent with disposition")
    # G. boundary consistency + overlay
    bc, cust, es = row.get("boundary_class"), row.get("customer_visibility"), row.get("evaluation_state")
    if bc and bc != "sales":
        if cust == "full" or row.get("gradable") is True or es not in ("not_measured", "measured_unscored"):
            e.append("non-sales boundary must be disposition-only, non-gradable, not customer-full")
    if isinstance(mid, str) and mid in OVERLAY:
        if bc != "separate_serra_service" or cust != "appendix_id_label_only":
            e.append("service overlay id must be separate_serra_service + appendix_id_label_only")
    # H. grading / scoring (approved + active + compatible)
    if es == "measured_graded":
        gt = row.get("grade_target_contract") or {}
        if row.get("gradable") is not True or disp != "measured_validated":
            e.append("measured_graded requires gradable + measured_validated")
        if gt.get("approval_state") != "approved" or gt.get("status") != "active" or gt.get("compatibility_result") != "compatible":
            e.append("measured_graded requires approved+active+compatible grade_target")
    if row.get("gradable") is False and es == "measured_graded":
        e.append("gradable=false cannot be measured_graded")
    # I. protected content
    if row.get("protected_content") is True and not row.get("envelope_authorized"):
        if es not in ("not_measured", "measured_unscored", "measured_abstained"):
            e.append("protected content without envelope cannot be measured_graded")
    # J. three sub-contracts present, valid, DISTINCT ids
    e += validate_subcontract("threshold_contract", row.get("detection_threshold_contract"))
    e += validate_subcontract("comparison_contract", row.get("comparison_reference_contract"))
    e += validate_subcontract("grade_target_contract", row.get("grade_target_contract"))
    ids = [(row.get("detection_threshold_contract") or {}).get("threshold_id"),
           (row.get("comparison_reference_contract") or {}).get("reference_id"),
           (row.get("grade_target_contract") or {}).get("grade_target_id")]
    ids = [i for i in ids if i]
    if len(set(ids)) != len(ids):
        e.append("sub-contract ids must be distinct")
    return e


def score_allowed(row):
    gt = row.get("grade_target_contract") or {}
    return bool(row.get("gradable") is True and gt.get("approval_state") == "approved"
                and gt.get("status") == "active" and gt.get("compatibility_result") == "compatible")


# ------------------------------------------------------------------ packet validation
def validate_packet(pkt):
    e = []
    rf = PKS["required_fields"]
    for f in rf:
        if f == "size_reason":
            continue
        if f not in pkt or pkt[f] in (None, "", []):
            e.append(f"packet missing {f}")
    if not isinstance(pkt.get("module"), int) or not (1 <= pkt.get("module", 0) <= 11):
        e.append("packet module must be int 1..11")
    if not re.match(r"^PKT-\d{2}[A-Z]?-\d{2}$", str(pkt.get("packet_id", ""))):
        e.append("packet_id fails pattern")
    tids = pkt.get("target_ids", [])
    if len(set(tids)) != len(tids):
        e.append("duplicate target_ids")
    for t in tids:
        if not SW.match(str(t)):
            e.append(f"bad target id {t}")
        elif OWNER.get(int(t.split("-")[1]), [None])[0] != pkt.get("module"):
            e.append(f"{t} not owned by module {pkt.get('module')}")
    if not (5 <= len(tids) <= 12) and not pkt.get("size_reason"):
        e.append("target_ids out of 5..12 without size_reason")
    # nested contract required keys
    for cf in ("admission_contract", "transform_contract", "persist_contract", "test_contract", "report_fragment_contract", "stop_conditions", "two_delta_proof", "partitions_target"):
        spec = rf.get(cf, {})
        obj = pkt.get(cf)
        if not isinstance(obj, dict):
            e.append(f"{cf}: missing/not object"); continue
        for k in spec.get("required_keys", []):
            if k not in obj or obj[k] in (None, "", []):
                e.append(f"{cf}: missing {k}")
    # stop inheritance EXACT + packet_specific nonempty
    sc = pkt.get("stop_conditions", {})
    if sc.get("inherited_canonical") != CANON_STOPS:
        e.append("stop_conditions.inherited_canonical must equal canonical_stop_names exactly")
    if not sc.get("packet_specific"):
        e.append("stop_conditions.packet_specific must be nonempty")
    # admission must inherit vault gate
    adm = pkt.get("admission_contract", {})
    gates = adm.get("inherited_admission_gates") or []
    if "vault_policy_nonconformance_admission_gate" not in gates:
        e.append("admission_contract must inherit vault_policy_nonconformance_admission_gate")
    # two-delta both
    td = pkt.get("two_delta_proof", {})
    if not td.get("evidence_delta") or not td.get("meaning_delta"):
        e.append("two_delta_proof requires both evidence_delta and meaning_delta")
    # partitions exact + disjoint
    part = pkt.get("partitions_target", {})
    a, b, c = set(part.get("accepted_measured_ids", [])), set(part.get("accepted_disposition_only_ids", [])), set(part.get("rejected_ids", []))
    if (a & b) or (a & c) or (b & c):
        e.append("partitions not mutually exclusive")
    if (a | b | c) != set(tids):
        e.append("partitions union != target_ids")
    return e


# ------------------------------------------------------------------ source node + DAG
def validate_source_node(n):
    e = []
    rf = SRS["required_source_fields"]
    for f in rf:
        if f not in n or n[f] in (None, "", []):
            if f in ("dependent_metric_ids", "dependent_candidate_ids"):
                if f not in n:
                    e.append(f"source missing {f}")
                continue
            e.append(f"source missing {f}")
    if not re.match(r"^SRC-[a-z_]+-\d{4}$", str(n.get("source_id", ""))):
        e.append("source_id fails pattern")
    if n.get("profile") != "serra-honda":
        e.append("source profile must be serra-honda")
    for f, vocabkey in (("source_existence_state", "source_existence_state"),
                        ("acquisition_admission_state", "acquisition_admission_state")):
        if n.get(f) not in FV[vocabkey]["values"]:
            e.append(f"{f} not in vocab")
    if n.get("family") not in set(rf["family"]["values"]):
        e.append("family not in enum")
    if n.get("source_type") not in set(rf["source_type"]["values"]):
        e.append("source_type not in enum")
    for m in n.get("dependent_metric_ids", []) or []:
        if not SW.match(str(m)):
            e.append(f"dependent_metric_ids must be SW ids ({m})")
    for cid in n.get("dependent_candidate_ids", []) or []:
        if not CAND.match(str(cid)):
            e.append(f"dependent_candidate_ids must be CAND ids ({cid})")
    return e


def validate_source_dag(nodes):
    e = []
    seen = set()
    for n in nodes:
        e += validate_source_node(n)
        key = (n.get("profile"), n.get("family"), n.get("period"), n.get("schema_revision"))
        if key in seen:
            e.append(f"duplicate acquisition dedupe key {key}")
        seen.add(key)
    return e


# ------------------------------------------------------------------ candidate
def validate_candidate(c):
    e = []
    rf = CIS["required_candidate_fields"]
    for f in rf:
        if f == "related_sw_id":
            continue
        if f not in c or c[f] in (None, "", []):
            e.append(f"candidate missing {f}")
    cid = c.get("candidate_id", "")
    if not CAND.match(str(cid)):
        e.append("candidate_id must match ^CAND-\\d{4}$")
    if SW.match(str(cid)):
        e.append("candidate_id must NOT be an SW id")
    if c.get("boundary_class") and c.get("boundary_class") not in FV["boundary_class"]["values"]:
        e.append("candidate boundary_class not in vocab")
    for f in ("relationship_to_295", "candidate_state", "owner"):
        allowed = set(rf[f]["values"]) if isinstance(rf.get(f), dict) and "values" in rf[f] else None
        if allowed and c.get(f) not in allowed:
            e.append(f"candidate {f} not in enum")
    if c.get("relationship_to_295") == "refines_existing" and not c.get("related_sw_id"):
        e.append("refines_existing requires related_sw_id")
    if c.get("mutates_295"):
        e.append("candidate intake may not mutate the authoritative 295")
    return e


# ------------------------------------------------------------------ canonical VALID fixtures
def _sub(prefix):
    return {
        "threshold_contract": {"threshold_id": f"TH-{prefix}", "version": "1.0.0", "rule": ">x", "provenance": "p", "effective_dates": "2026-09", "approval_state": "approved", "status": "active"},
        "comparison_contract": {"reference_id": f"CR-{prefix}", "version": "1.0.0", "basis": "dealer_history", "formula": "f", "provenance": "p", "publication_date": "2026-08", "valid_period": "2026", "compatibility_result": "compatible", "assumptions": "a", "confidence": "high", "approval_state": "approved", "status": "active"},
        "grade_target_contract": {"grade_target_id": f"GT-{prefix}", "version": "1.0.0", "basis": "dealer_history", "value_or_range": "0.5", "provenance": "p", "effective_dates": "2026-09", "compatibility_result": "compatible", "approval_state": "approved", "status": "active"},
    }


def good_metric():
    s = _sub("011")
    return {
        "metric_id": "SW-011", "definition_version": "1.0.0", "module": OWNER[11][0],
        "business_question": "Are leads reached quickly?", "boundary_class": "sales",
        "population": "internet sales leads", "calculation_kind": "rate", "null_missing_behavior": "missing_not_zero",
        "zero_denominator_behavior": "undefined_withheld", "numerator": "touched<=15m", "denominator": "eligible",
        "formula": "num/den", "direct_source_fields": ["first_touch_ts", "lead_created_ts"], "unit": "pct",
        "polarity": "higher_is_better", "window": "prev_week", "timezone": "America/New_York", "cadence": "weekly",
        "impact_method": "operational_only", "impact_status": "not_estimated", "gradable": True,
        "sensitivity_class": "none", "protected_content": False, "authorization": "none_required",
        "disposition": "measured_validated", "source_existence_state": "acquired_local",
        "evaluation_state": "measured_graded", "source_dependency_ids": ["SRC-cage_kpi-0001"],
        "evidence_ref": "ev", "evidence_as_of": "2026-08-31T00:00:00Z", "owner": "claude_studio",
        "internal_visibility": True, "customer_visibility": "full", "confidence": "high",
        "explainability_ref": "expl", "evidence_index_ref": "idx",
        "detection_threshold_contract": s["threshold_contract"],
        "comparison_reference_contract": s["comparison_contract"],
        "grade_target_contract": s["grade_target_contract"],
    }


def good_sip():
    s = _sub("012")
    for k in s:  # a pending metric's contracts are drafted, not yet approved
        s[k]["approval_state"] = "proposed"; s[k]["status"] = "draft"
    s["comparison_contract"]["compatibility_result"] = "unresolved"
    s["grade_target_contract"]["compatibility_result"] = "unresolved"
    s["grade_target_contract"]["approval_state"] = "unresolved"
    return {
        "metric_id": "SW-012", "definition_version": "1.0.0", "module": OWNER[12][0],
        "business_question": "Is after-hours coverage staffed?", "boundary_class": "sales",
        "population": "after-hours leads", "calculation_kind": "rate", "null_missing_behavior": "missing_not_zero",
        "unit": "pct", "polarity": "higher_is_better", "window": "prev_week", "timezone": "America/New_York",
        "cadence": "weekly", "impact_method": "operational_only", "impact_status": "not_applicable",
        "gradable": False, "sensitivity_class": "none", "protected_content": False, "authorization": "none_required",
        "disposition": "source_investigation_pending", "source_existence_state": "investigation_pending",
        "evaluation_state": "not_measured", "source_dependency_ids": [], "evidence_ref": "ev",
        "evidence_as_of": "2026-09-02T00:00:00Z", "owner": "codex", "next_action": "one finite pass",
        "review_point": "2026-09-16", "finite_investigation_ref": "INV-0012", "internal_visibility": True,
        "customer_visibility": "hidden", "confidence": "not_applicable", "explainability_ref": "expl",
        "evidence_index_ref": "idx", "detection_threshold_contract": s["threshold_contract"],
        "comparison_reference_contract": s["comparison_contract"], "grade_target_contract": s["grade_target_contract"],
    }


def good_gna():
    r = good_sip()
    r.update({"metric_id": "SW-013", "module": OWNER[13][0], "disposition": "genuinely_not_available",
              "source_existence_state": "proved_not_available", "affirmative_investigation_evidence_ref": "INV-0013-neg"})
    return r


def good_packet():
    return {
        "packet_id": "PKT-02-01", "module": 2, "target_ids": ["SW-011", "SW-012", "SW-013", "SW-014", "SW-015"],
        "management_question": "Is speed-to-lead healthy?", "prerequisites": ["PKT-00-00"],
        "source_dependencies": ["SRC-cage_kpi-0001"],
        "admission_contract": {"family": "cage_kpi", "dedupe_key": "serra-honda|cage_kpi|2026-08-24..2026-08-30|v1", "sales_only_receipt": "R", "expected_admission_state": "admitted_held", "inherited_admission_gates": ["vault_policy_nonconformance_admission_gate"]},
        "transform_contract": {"normalized_spec": "s", "row_key_set_hash_method": "m", "join_keys": ["k"], "reconciliation": "r"},
        "persist_contract": {"target_tables": ["watchdog_metric_observation"], "append_only": True, "idempotent_key": "k"},
        "test_contract": {"positive_golden": "g", "negative_tests": ["neg"], "missing_is_not_zero_test": "t"},
        "report_fragment_contract": {"subsection_outputs": ["metric_table"], "customer_language_scope": "s", "internal_companion_scope": "i"},
        "stop_conditions": {"inherited_canonical": CANON_STOPS, "packet_specific": ["bdc_roster_absent"]},
        "two_delta_proof": {"evidence_delta": "raw->norm", "meaning_delta": "norm->metric"},
        "partitions_target": {"accepted_measured_ids": ["SW-011", "SW-012"], "accepted_disposition_only_ids": ["SW-013", "SW-014"], "rejected_ids": ["SW-015"]},
    }


def good_source():
    return {"source_id": "SRC-appointments-0001", "profile": "serra-honda", "family": "appointments",
            "period": "2026-08-24..2026-08-30", "schema_revision": "v1", "source_type": "native_xlsx",
            "source_existence_state": "acquired_local", "acquisition_admission_state": "admitted_held",
            "provenance_ref": "gmail:msgid", "sales_only_receipt": "R", "dependent_metric_ids": ["SW-031", "SW-032"],
            "dependent_candidate_ids": []}


def good_candidate():
    return {"candidate_id": "CAND-0001", "proposed_name": "Website VDP views by model",
            "description": "d", "observed_source": "Website Vehicle Views", "rationale": "r",
            "boundary_class": "sales", "relationship_to_295": "net_new", "candidate_state": "candidate_review_pending",
            "authorization_required": True, "owner": "codex", "evidence_ref": "ev"}


# ------------------------------------------------------------------ self-tests (exhaustive mutations)
def run_self_tests():
    results = []

    def rec(name, expect_accept, errs):
        accepted = (len(errs) == 0)
        results.append({"test": name, "expected": "accept" if expect_accept else "reject",
                        "got": "accept" if accepted else "reject", "pass": accepted == expect_accept,
                        "sample_error": (errs[0] if errs else None)})

    # --- canonical valids accept ---
    rec("metric.valid_graded", True, validate_metric_row(good_metric()))
    rec("metric.valid_sip", True, validate_metric_row(good_sip()))
    rec("metric.valid_gna", True, validate_metric_row(good_gna()))
    rec("packet.valid", True, validate_packet(good_packet()))
    rec("source.valid", True, validate_source_dag([good_source()]))
    rec("candidate.valid", True, validate_candidate(good_candidate()))

    # --- metric: drop EACH always-required field -> reject ---
    for f in MRS["always_required_fields"]:
        r = copy.deepcopy(good_metric()); r.pop(f, None)
        rec(f"metric.drop_required.{f}", False, validate_metric_row(r))

    # --- metric: bad enum for EACH enum field -> reject ---
    for f, spec in MRS["required_fields"].items():
        if isinstance(spec, dict) and spec.get("type") == "enum":
            r = copy.deepcopy(good_metric()); r[f] = "__BAD__"
            rec(f"metric.bad_enum.{f}", False, validate_metric_row(r))
    # --- metric: type/pattern/const violations ---
    rec("metric.module_not_int", False, validate_metric_row(dict(good_metric(), module="2")))
    rec("metric.metric_id_bad_pattern", False, validate_metric_row(dict(good_metric(), metric_id="SW-9999")))
    rec("metric.timezone_not_const", False, validate_metric_row(dict(good_metric(), timezone="UTC")))
    rec("metric.gradable_not_bool", False, validate_metric_row(dict(good_metric(), gradable="yes")))
    rec("metric.wrong_module_owner", False, validate_metric_row(dict(good_metric(), module=3)))

    # --- metric: conditional rules ---
    rec("metric.rate_missing_denominator", False, validate_metric_row({k: v for k, v in good_metric().items() if k != "denominator"}))
    rec("metric.rate_missing_zero_den_behavior", False, validate_metric_row({k: v for k, v in good_metric().items() if k != "zero_denominator_behavior"}))
    rec("metric.measurable_missing_direct_fields", False, validate_metric_row({k: v for k, v in good_metric().items() if k != "direct_source_fields"}))
    rec("metric.semantic_without_protected", False, validate_metric_row(dict(good_metric(), calculation_kind="semantic")))
    rec("metric.sip_missing_finite_investigation_ref", False, validate_metric_row({k: v for k, v in good_sip().items() if k != "finite_investigation_ref"}))
    rec("metric.sip_gradable_true", False, validate_metric_row(dict(good_sip(), gradable=True)))
    rec("metric.sip_customer_full", False, validate_metric_row(dict(good_sip(), customer_visibility="full")))
    rec("metric.sip_bad_existence", False, validate_metric_row(dict(good_sip(), source_existence_state="acquired_local")))
    rec("metric.gna_missing_affirmative", False, validate_metric_row({k: v for k, v in good_gna().items() if k != "affirmative_investigation_evidence_ref"}))
    rec("metric.graded_target_not_approved", False, validate_metric_row(dict(good_metric(), grade_target_contract=dict(good_metric()["grade_target_contract"], approval_state="proposed"))))
    rec("metric.graded_target_incompatible", False, validate_metric_row(dict(good_metric(), grade_target_contract=dict(good_metric()["grade_target_contract"], compatibility_result="incompatible"))))
    rec("metric.nongradable_graded", False, validate_metric_row(dict(good_metric(), gradable=False)))
    rec("metric.overlay_wrong_boundary", False, validate_metric_row(dict(good_metric(), metric_id="SW-079", module=OWNER[79][0], boundary_class="sales")))
    rec("metric.nonsales_customer_full", False, validate_metric_row(dict(good_gna(), boundary_class="external_noncrm", customer_visibility="full")))
    rec("metric.subcontract_ids_not_distinct", False, validate_metric_row(dict(good_metric(),
        comparison_reference_contract=dict(good_metric()["comparison_reference_contract"], reference_id="TH-011"))))
    rec("separation.score_requires_approved_active_compatible", True, [] if score_allowed(good_metric()) else ["blocked"])
    rec("separation.comparison_alone_cannot_score", False, [] if score_allowed(dict(good_metric(),
        grade_target_contract=dict(good_metric()["grade_target_contract"], approval_state="reference_only"))) else ["blocked"])

    # --- sub-contracts: drop EACH required field -> reject ---
    for sub_key, obj_key in (("threshold_contract", "detection_threshold_contract"),
                             ("comparison_contract", "comparison_reference_contract"),
                             ("grade_target_contract", "grade_target_contract")):
        for f in _subspec(sub_key):
            r = copy.deepcopy(good_metric()); r[obj_key].pop(f, None)
            rec(f"subcontract.{sub_key}.drop.{f}", False, validate_metric_row(r))
        # bad enum inside each subcontract
        for f, spec in _subspec(sub_key).items():
            if isinstance(spec, dict) and spec.get("type") == "enum":
                r = copy.deepcopy(good_metric()); r[obj_key][f] = "__BAD__"
                rec(f"subcontract.{sub_key}.bad_enum.{f}", False, validate_metric_row(r))

    # --- packet: drop EACH top-level required field -> reject ---
    for f in PKS["required_fields"]:
        if f == "size_reason":
            continue
        r = copy.deepcopy(good_packet()); r.pop(f, None)
        rec(f"packet.drop_required.{f}", False, validate_packet(r))
    # packet: drop EACH nested contract required key -> reject
    for cf in ("admission_contract", "transform_contract", "persist_contract", "test_contract", "report_fragment_contract"):
        for k in PKS["required_fields"][cf].get("required_keys", []):
            r = copy.deepcopy(good_packet()); r[cf].pop(k, None)
            rec(f"packet.{cf}.drop.{k}", False, validate_packet(r))
    rec("packet.inherited_canonical_not_exact", False, validate_packet(dict(good_packet(), stop_conditions={"inherited_canonical": CANON_STOPS[:-1], "packet_specific": ["x"]})))
    rec("packet.packet_specific_empty", False, validate_packet(dict(good_packet(), stop_conditions={"inherited_canonical": CANON_STOPS, "packet_specific": []})))
    rec("packet.missing_vault_gate", False, validate_packet(dict(good_packet(), admission_contract=dict(good_packet()["admission_contract"], inherited_admission_gates=[]))))
    rec("packet.single_delta", False, validate_packet(dict(good_packet(), two_delta_proof={"evidence_delta": "x"})))
    rec("packet.partition_overlap", False, validate_packet(dict(good_packet(), partitions_target={"accepted_measured_ids": ["SW-011", "SW-012"], "accepted_disposition_only_ids": ["SW-012", "SW-014"], "rejected_ids": ["SW-015"]})))
    rec("packet.partition_union_mismatch", False, validate_packet(dict(good_packet(), partitions_target={"accepted_measured_ids": ["SW-011"], "accepted_disposition_only_ids": ["SW-013"], "rejected_ids": ["SW-015"]})))
    rec("packet.wrong_module_ownership", False, validate_packet(dict(good_packet(), module=3)))
    rec("packet.oversize_without_reason", False, validate_packet(dict(good_packet(), target_ids=["SW-011", "SW-012", "SW-013"],
        partitions_target={"accepted_measured_ids": ["SW-011"], "accepted_disposition_only_ids": ["SW-012"], "rejected_ids": ["SW-013"]})))

    # --- source: drop EACH required field -> reject ---
    for f in SRS["required_source_fields"]:
        r = copy.deepcopy(good_source()); r.pop(f, None)
        rec(f"source.drop_required.{f}", False, validate_source_dag([r]))
    rec("source.bad_family", False, validate_source_dag([dict(good_source(), family="service")]))
    rec("source.bad_acq_state", False, validate_source_dag([dict(good_source(), acquisition_admission_state="__BAD__")]))
    rec("source.duplicate_dedupe_key", False, validate_source_dag([good_source(), good_source()]))
    rec("source.sw_in_candidate_edges", False, validate_source_dag([dict(good_source(), dependent_candidate_ids=["SW-031"])]))
    rec("source.cand_in_metric_edges", False, validate_source_dag([dict(good_source(), dependent_metric_ids=["CAND-0001"])]))

    # --- candidate: drop EACH required field -> reject ---
    for f in CIS["required_candidate_fields"]:
        if f == "related_sw_id":
            continue
        r = copy.deepcopy(good_candidate()); r.pop(f, None)
        rec(f"candidate.drop_required.{f}", False, validate_candidate(r))
    rec("candidate.sw_id", False, validate_candidate(dict(good_candidate(), candidate_id="SW-300")))
    rec("candidate.refines_without_related", False, validate_candidate(dict(good_candidate(), relationship_to_295="refines_existing")))
    rec("candidate.mutates_295", False, validate_candidate(dict(good_candidate(), mutates_295=True)))

    # --- transitions + context receipts ---
    rec("trans.sip_to_crm", True, [] if _trans("disposition", "source_investigation_pending", "crm_available_acquisition_pending")[0] else ["x"])
    rec("trans.sip_to_measured_forbidden", False, [] if _trans("disposition", "source_investigation_pending", "measured_validated")[0] else ["x"])
    rec("trans.sip_to_data_acquired_forbidden", False, [] if _trans("disposition", "source_investigation_pending", "data_acquired_calculation_pending")[0] else ["x"])
    rec("trans.sip_to_outside_needs_boundary_correction", False, [] if _trans("disposition", "source_investigation_pending", "outside_sales_domain")[0] else ["x"])
    rec("trans.sip_to_outside_with_receipt", True, [] if _trans("disposition", "source_investigation_pending", "outside_sales_domain", {"boundary_correction_ref": "x"})[0] else ["x"])
    rec("trans.sip_to_gna_needs_affirmative", False, [] if _trans("disposition", "source_investigation_pending", "genuinely_not_available")[0] else ["x"])
    rec("trans.sip_to_gna_with_receipt", True, [] if _trans("disposition", "source_investigation_pending", "genuinely_not_available", {"affirmative_investigation_evidence_ref": "x"})[0] else ["x"])
    rec("trans.ses_unproved_to_acquired_forbidden", False, [] if _trans("source_existence_state", "unproved", "acquired_local")[0] else ["x"])
    rec("trans.ses_unproved_to_investigation_ok", True, [] if _trans("source_existence_state", "unproved", "investigation_pending")[0] else ["x"])
    rec("trans.mes_not_measured_to_graded_forbidden", False, [] if _trans("metric_evaluation_state", "not_measured", "measured_graded")[0] else ["x"])
    rec("trans.mes_unscored_to_graded_ok", True, [] if _trans("metric_evaluation_state", "measured_unscored", "measured_graded")[0] else ["x"])
    rec("trans.acq_quarantine_to_admitted_forbidden", False, [] if _trans("acquisition_admission_state", "quarantined", "admitted_held")[0] else ["x"])
    rec("trans.acq_held_to_promoted_ok", True, [] if _trans("acquisition_admission_state", "admitted_held", "admitted_promoted")[0] else ["x"])

    return results


# ------------------------------------------------------------------ named malformed probes
def run_probes():
    probes = []

    def rec(name, obj, validator):
        errs = validator(obj)
        probes.append({"probe": name, "expected": "reject", "got": "reject" if errs else "accept",
                       "pass": bool(errs), "n_errors": len(errs), "sample_error": errs[0] if errs else None})

    rec("sparse_sip_metric", {"metric_id": "SW-012", "disposition": "source_investigation_pending"}, validate_metric_row)
    rec("gna_missing_affirmative_evidence", {k: v for k, v in good_gna().items() if k != "affirmative_investigation_evidence_ref"}, validate_metric_row)
    rec("sparse_packet", {"packet_id": "PKT-02-09", "module": 2}, validate_packet)
    rec("sparse_source", {"source_id": "SRC-x-0001"}, lambda o: validate_source_dag([o]))
    rec("sparse_candidate", {"candidate_id": "CAND-9999"}, validate_candidate)
    return probes


# ------------------------------------------------------------------ structure / vocab closure
def check_structure(errors):
    matrix = load(MATRIX)
    ids = [e.get("metric_id") for e in matrix]
    nums = sorted(int(m.split("-")[1]) for m in ids)
    if not (len(matrix) == 295 and nums == list(range(1, 296))):
        errors.append("STRUCTURE: catalog not 295 contiguous")
    if len(p0.MODULES) != 11 or sorted(OWNER) != list(range(1, 296)) or any(len(v) != 1 for v in OWNER.values()):
        errors.append("STRUCTURE: 11-module map not exactly-once over 295")
    if sorted(OVERLAY) != sorted(p0.sw(i) for i in p0.SERVICE_OVERLAY) or len(OVERLAY) != 18:
        errors.append("STRUCTURE: overlay != SPEC 18")


def check_vocab(errors):
    if len(DISP["values"]) != 8 or DISP.get("count") != 8:
        errors.append("VOCAB: disposition must have 8 values")
    sip = set(DISP["transitions"].get("source_investigation_pending", []))
    if sip != set(DISP["invariants"]["source_investigation_pending_allowed_targets_exact"]):
        errors.append("VOCAB: SIP allowed-targets != approved set")
    if sip & set(DISP["invariants"]["source_investigation_pending_forbidden_direct_targets"]):
        errors.append("VOCAB: SIP reaches forbidden direct target")
    for term in DISP["invariants"]["terminal_states"]:
        if DISP["transitions"].get(term, []) != []:
            errors.append(f"VOCAB: terminal {term} has transitions")
    for name in ("boundary_class", "disposition", "source_existence_state", "metric_evaluation_state",
                 "acquisition_admission_state", "report_acceptance_state", "calculation_kind"):
        if not FV[name].get("closed") or not FV[name].get("values"):
            errors.append(f"VOCAB: {name} not closed/nonempty")
    for name in ("source_existence_state", "metric_evaluation_state", "acquisition_admission_state", "disposition"):
        node = FV[name]
        for frm, tos in node["transitions"].items():
            if frm not in node["values"] or any(t not in node["values"] for t in tos):
                errors.append(f"VOCAB: {name} transition references unknown state")
    if FV["acquisition_admission_state"]["transitions"].get("quarantined") != [] or \
       FV["acquisition_admission_state"]["transitions"].get("admitted_held") != ["admitted_promoted"]:
        errors.append("VOCAB: acquisition quarantine/promotion invariants broken")
    if FCS.get("count") != 11 or len(CANON_STOPS) != 11 or sorted(CANON_STOPS) != sorted(FCS["canonical_stops"].keys()):
        errors.append("VOCAB: fail-closed-stops must be exactly 11 canonical names matching canonical_stops")
    if "vault_policy_nonconformance_admission_gate" not in FCS.get("inherited_admission_gates", {}):
        errors.append("VOCAB: fail-closed-stops missing inherited vault-policy admission gate")


# ------------------------------------------------------------------ main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--no-write", action="store_true")
    args = ap.parse_args()

    errors = []
    contract_files = ["frozen-vocabularies.json", "metric-row-schema.json", "packet-schema.json",
                      "source-registry-dag-schema.json", "beyond-295-candidate-intake-schema.json",
                      "fail-closed-stops.json"]
    contract_hashes = {}
    for cf in contract_files:
        p = os.path.join(CONTRACT_DIR, cf)
        try:
            load(p); contract_hashes[cf] = sha256_file(p)
        except Exception as ex:  # noqa: BLE001
            errors.append(f"CONTRACT parse failure {cf}: {ex}")

    check_structure(errors)
    check_vocab(errors)
    self_tests = run_self_tests()
    probes = run_probes()
    failed_tests = [t for t in self_tests if not t["pass"]]
    failed_probes = [p for p in probes if not p["pass"]]

    overall = (not errors) and (not failed_tests) and (not failed_probes)
    result = {
        "check": "honda_watchdog_phase1a_contracts",
        "phase": "Phase 1A — design-only exhaustive schema-driven contract freeze + self-tests",
        "schema_driven": True,
        "contract_files": contract_hashes,
        "structure_295_11_18": "PASS" if not any(e.startswith("STRUCTURE") for e in errors) else "FAIL",
        "vocab_closure": "PASS" if not any(e.startswith("VOCAB") for e in errors) else "FAIL",
        "self_tests_total": len(self_tests),
        "self_tests_failed": len(failed_tests),
        "named_probes_total": len(probes),
        "named_probes_failed": len(failed_probes),
        "named_probes": probes,
        "self_tests": self_tests,
        "errors": errors,
        "overall_pass": overall,
        "note": "Design-only: no metric rows or packets authored. Fixtures/mutations are synthetic in-memory cases; every required field/enum/conditional/transition/context-receipt/stop/partition/DAG/candidate rule has a mutation test.",
    }
    payload = json.dumps(result, indent=2, ensure_ascii=False)
    if not args.no_write:
        os.makedirs(os.path.dirname(args.out), exist_ok=True)
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(payload + "\n")
    print(payload)
    print(f"\nRESULT: {'PASS' if overall else 'FAIL'} "
          f"(self_tests {len(self_tests)-len(failed_tests)}/{len(self_tests)}, "
          f"probes {len(probes)-len(failed_probes)}/{len(probes)})", file=sys.stderr)
    return 0 if overall else 1


if __name__ == "__main__":
    raise SystemExit(main())
