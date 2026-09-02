#!/usr/bin/env python3
"""
PKT-02-02 binding validator (focused + adversarial). Design-only, additive.

Validates docs/halo/contract/phase1b/pkt-02-02-binding.json against:
  - the immutable feasibility matrix (exact canonical_condition equality for all 12 IDs),
  - the packet-index PKT-02-02 assignment (exact 12 IDs; no gaps/dupes; 295/11/30 accounting unchanged),
  - the frozen closed vocabularies (disposition / source_existence / evaluation / acquisition / boundary / kind),
  - the accepted-meaning authorities (gate2 + baseline-registry): NONE of the 12 may be measured/gradable,
  - the admission/quarantine evidence (Service/Parts zero-admission; CAGE/comm quarantine; no synthetic values),
  - the four source-family slice partition (exact),
  - the frozen PKT-02-01 artifacts (sha256 unchanged — this step does not touch them).

Reuses the Phase 1A generic engine (validate_phase1_contracts) for the frozen vocabularies and sha256 only,
WITHOUT modifying any Phase 0/1/1A/1B artifact. Exit 0 == PASS, 1 == FAIL.
Usage: python3 scripts/halo-phase1b/validate_pkt_02_02_binding.py [--out X] [--no-write]
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

C = os.path.join(REPO, "docs", "halo", "contract")
CB = os.path.join(C, "phase1b")
BINDING_PATH = os.path.join(CB, "pkt-02-02-binding.json")
DEFAULT_OUT = os.path.join(REPO, "docs", "halo", "evidence", "honda-watchdog", "phase1b", "pkt-02-02", "PKT-02-02_BINDING_CHECKS.json")

TARGET_IDS = ["SW-016", "SW-017", "SW-018", "SW-084", "SW-085", "SW-086",
              "SW-087", "SW-088", "SW-089", "SW-132", "SW-133", "SW-134"]
SLICES_EXPECTED = {
    "slice_response_times": ["SW-016", "SW-017"],
    "slice_cage_appointments_gross": ["SW-084", "SW-087"],
    "slice_communication": ["SW-018", "SW-086", "SW-089", "SW-132", "SW-133", "SW-134"],
    "slice_external_phone": ["SW-085", "SW-088"],
}
PKT_02_01_BINDING_SHA = "1c1c98a2e7b3be8d10eea9495861b7a33e65a00020ab7c9e756da363b69f2082"
PKT_02_01_PACKET_SHA = "89de72da33a5459d1aedd69cbc92a1fc347f3d589d8cbfd1ecf13bad1890d97d"

FV = p1.FV
DISP = set(FV["disposition"]["values"].keys())
SES = set(FV["source_existence_state"]["values"].keys())
EVAL = set(FV["metric_evaluation_state"]["values"].keys())
ACQ = set(FV["acquisition_admission_state"]["values"].keys())
BOUND = set(FV["boundary_class"]["values"].keys())
KIND = set(FV["calculation_kind"]["values"].keys())
DISP_SES = FV["source_existence_state"]["disposition_consistency"]
DISP_EVAL = FV["disposition_evaluation_consistency"]["map"]
SES_ACQ = FV["source_existence_acquisition_matrix"]["allowed_pairs"]
ACCEPTED_DISP_ONLY = {"external_source_required", "additional_history_required", "genuinely_not_available", "outside_sales_domain"}
BUCKET_DISP = {
    "source_investigation_pending_ids": {"source_investigation_pending"},
    "calculation_pending_ids": {"data_acquired_calculation_pending", "crm_available_acquisition_pending"},
    "accepted_disposition_only_ids": ACCEPTED_DISP_ONLY,
    "accepted_measured_ids": {"measured_validated"},
    "rejected_ids": set(),
}

MATRIX = {e["metric_id"]: e for e in p1.load(os.path.join(C, "semantic-watchdog-feasibility-matrix-295.json"))}
GATE2 = p1.load(os.path.join(C, "gate2-evaluator-contract.json"))["evaluable_conditions"]
_BR = p1.load(os.path.join(C, "baseline-registry.json"))
_OTS = _BR["operational_targets"] if isinstance(_BR["operational_targets"], list) else list(_BR["operational_targets"].values())
BASELINE_METRICS = {o.get("metric_id") for o in _OTS if isinstance(o, dict)}
IDX = p1.load(os.path.join(CB, "packet-index.json"))
NSE = p1.load(os.path.join(REPO, "docs", "halo", "evidence", "m1r", "scheduled", "native-scheduled-evidence.json"))
SW295 = [f"SW-{i:03d}" for i in range(1, 296)]

NULL_VALUE_FIELDS = ["numerator", "denominator", "formula", "grade_target_id", "grade_basis",
                     "grade_value_or_range", "detection_rule", "threshold", "ot_anchor"]


def check_ids(b, errs):
    m = b.get("metrics", {})
    keys = list(m.keys())
    if sorted(keys) != sorted(TARGET_IDS):
        errs.append(f"metrics keys != exact 12 target ids (got {sorted(keys)})")
    if len(keys) != len(set(keys)):
        errs.append("metrics keys contain duplicates")
    if len(keys) != 12:
        errs.append(f"metrics count {len(keys)} != 12")
    pkt = [p for p in IDX["packets"] if p["packet_id"] == "PKT-02-02"]
    if not pkt or pkt[0]["target_ids"] != TARGET_IDS:
        errs.append("packet-index PKT-02-02 target_ids != the exact 12 (order/gap/dup)")
    elif sorted(keys) != sorted(pkt[0]["target_ids"]):
        errs.append("binding metric ids != packet-index PKT-02-02 assignment")


def check_conditions(b, errs):
    for mid, rec in b.get("metrics", {}).items():
        if mid not in MATRIX:
            errs.append(f"{mid}: not in matrix"); continue
        if rec.get("canonical_condition") != MATRIX[mid]["condition"]:
            errs.append(f"{mid}: canonical_condition != matrix condition (exact)")


def check_slices(b, errs):
    sl = b.get("source_family_slices", {})
    if set(sl.keys()) != set(SLICES_EXPECTED.keys()):
        errs.append(f"source_family_slices keys != expected 4 slices (got {sorted(sl.keys())})")
    flat = [i for v in sl.values() for i in (v or [])]
    if len(flat) != len(set(flat)):
        errs.append("source_family_slices overlap (an id in >1 slice)")
    if set(flat) != set(TARGET_IDS):
        errs.append("source_family_slices union != 12 target ids")
    for name, ids in SLICES_EXPECTED.items():
        if sl.get(name) != ids:
            errs.append(f"slice {name} != expected exact membership")
    for mid, rec in b.get("metrics", {}).items():
        s = rec.get("source_family_slice")
        if mid not in (sl.get(s) or []):
            errs.append(f"{mid}: source_family_slice '{s}' does not contain the id (slice mismatch)")


def check_lifecycle(b, errs):
    lp = b.get("lifecycle_partition", {})
    names = ["accepted_measured_ids", "accepted_disposition_only_ids", "rejected_ids",
             "source_investigation_pending_ids", "calculation_pending_ids"]
    if set(lp.keys()) != set(names):
        errs.append("lifecycle_partition keys != the 5 buckets")
    flat = [i for k in names for i in (lp.get(k) or [])]
    if len(flat) != len(set(flat)):
        errs.append("lifecycle_partition buckets overlap")
    if set(flat) != set(TARGET_IDS):
        errs.append("lifecycle_partition union != 12 target ids")
    if lp.get("accepted_measured_ids"):
        errs.append("accepted_measured_ids must be EMPTY (no ID has an accepted target)")
    if lp.get("rejected_ids"):
        errs.append("rejected_ids must be EMPTY (nothing rejected in this binding)")
    bucket_of = {i: k for k in names for i in (lp.get(k) or [])}
    for mid, rec in b.get("metrics", {}).items():
        if bucket_of.get(mid) != rec.get("lifecycle_bucket"):
            errs.append(f"{mid}: lifecycle_bucket '{rec.get('lifecycle_bucket')}' != partition membership '{bucket_of.get(mid)}'")
        allowed = BUCKET_DISP.get(rec.get("lifecycle_bucket"), set())
        if rec.get("disposition") not in allowed:
            errs.append(f"{mid}: disposition '{rec.get('disposition')}' not allowed for bucket '{rec.get('lifecycle_bucket')}'")


def check_no_promotion_no_synthetic(b, errs):
    """The CORE gate: no ID measured/gradable; no synthetic value; no accepted target exists."""
    for mid, rec in b.get("metrics", {}).items():
        if rec.get("gradable") is not False:
            errs.append(f"{mid}: gradable must be False (no accepted target)")
        if rec.get("disposition") == "measured_validated":
            errs.append(f"{mid}: disposition measured_validated forbidden (no promoted source + no accepted target)")
        if rec.get("evaluation_state") == "measured_graded":
            errs.append(f"{mid}: evaluation_state measured_graded forbidden (no accepted target)")
        if str(rec.get("grade_approval")) == "approved":
            errs.append(f"{mid}: grade_approval 'approved' forbidden (no accepted target exists)")
        for f in NULL_VALUE_FIELDS:
            if rec.get(f) is not None:
                errs.append(f"{mid}: {f} must be null (no authority resolves it — no synthetic value)")
        # cross-authority proof: the id is genuinely absent from accepted-meaning authorities
        if mid in GATE2:
            errs.append(f"{mid}: appears in gate2 evaluable_conditions — a target would be required; recheck")
        if mid in BASELINE_METRICS:
            errs.append(f"{mid}: appears in baseline-registry operational_targets — a target would be required; recheck")


def check_measured_unscored(b, errs):
    for mid, rec in b.get("metrics", {}).items():
        obs = rec.get("measured_unscored_observation")
        if rec.get("evaluation_state") == "measured_unscored":
            if not isinstance(obs, dict):
                errs.append(f"{mid}: measured_unscored requires a measured_unscored_observation record")
            elif obs.get("promoted") is not False:
                errs.append(f"{mid}: measured_unscored observation must be promoted=False")
            if rec.get("disposition") != "data_acquired_calculation_pending":
                errs.append(f"{mid}: measured_unscored must pair with data_acquired_calculation_pending")
        if isinstance(obs, dict) and obs.get("promoted") is True:
            errs.append(f"{mid}: measured_unscored_observation.promoted=True forbidden (nothing is promoted)")


def check_vocab(b, errs):
    for mid, rec in b.get("metrics", {}).items():
        for field, allowed in (("disposition", DISP), ("source_existence_state", SES),
                               ("evaluation_state", EVAL), ("acquisition_admission_state", ACQ),
                               ("boundary_class", BOUND), ("calculation_kind", KIND)):
            if rec.get(field) not in allowed:
                errs.append(f"{mid}: {field} '{rec.get(field)}' not in frozen closed vocabulary")
        disp, ses, ev, acq = rec.get("disposition"), rec.get("source_existence_state"), rec.get("evaluation_state"), rec.get("acquisition_admission_state")
        if disp in DISP_SES and ses not in DISP_SES[disp]:
            errs.append(f"{mid}: source_existence '{ses}' inconsistent with disposition '{disp}'")
        if disp in DISP_EVAL and ev not in DISP_EVAL[disp]:
            errs.append(f"{mid}: evaluation '{ev}' inconsistent with disposition '{disp}'")
        if ses in SES_ACQ and acq not in SES_ACQ[ses]:
            errs.append(f"{mid}: acquisition '{acq}' invalid for source_existence '{ses}'")
        # non-sales boundary must be disposition-only (never measured/graded)
        if rec.get("boundary_class") != "sales" and ev not in ("not_measured", "measured_unscored"):
            errs.append(f"{mid}: non-sales boundary must be disposition-only (evaluation not_measured/measured_unscored)")


def check_service_parts_zero_admission(b, errs):
    spa = b.get("service_parts_zero_admission", {})
    if b.get("dealer_scope", {}).get("service_parts_admitted") != 0:
        errs.append("dealer_scope.service_parts_admitted must be 0")
    q = set(spa.get("quarantined_families") or [])
    if not {"cage_kpi", "sales_comm_log"} <= q:
        errs.append("service_parts_zero_admission.quarantined_families must include cage_kpi and sales_comm_log")
    # cross-check against native-scheduled-evidence truth
    nse_q = set(NSE.get("summary", {}).get("quarantined_families") or [])
    if not q <= nse_q:
        errs.append(f"quarantined_families {sorted(q)} not all confirmed quarantined in native-scheduled-evidence {sorted(nse_q)}")
    # any metric whose source is a quarantined family must NOT be promoted/measured
    for mid, rec in b.get("metrics", {}).items():
        fam = rec.get("source_family", "")
        if ("cage" in fam) and rec.get("evaluation_state") == "measured_graded":
            errs.append(f"{mid}: CAGE-family metric cannot be measured_graded (quarantined/pre-admission)")


def check_accounting(b, errs):
    allids = [t for p in IDX["packets"] for t in p["target_ids"]]
    if sorted(allids) != SW295:
        errs.append("packet-index union != exact 295 (accounting drift)")
    mods = sorted({p["module"] for p in IDX["packets"]})
    if mods != list(range(1, 12)):
        errs.append(f"packet-index modules != 11 (1..11); got {mods}")
    if len(IDX["packets"]) != 30:
        errs.append(f"packet-index packet count {len(IDX['packets'])} != 30")
    acc = b.get("packet_accounting_assertion", {})
    if acc != {"conditions": 295, "modules": 11, "packets": 30}:
        errs.append("packet_accounting_assertion != {295,11,30}")


def check_pkt_02_01_untouched(b, errs):
    bsha = p1.sha256_file(os.path.join(CB, "pkt-02-01-binding.json"))
    psha = p1.sha256_file(os.path.join(CB, "packets", "PKT-02-01.json"))
    if bsha != PKT_02_01_BINDING_SHA:
        errs.append(f"PKT-02-01 binding sha changed ({bsha}) — frozen artifact modified")
    if psha != PKT_02_01_PACKET_SHA:
        errs.append(f"PKT-02-01 packet sha changed ({psha}) — frozen artifact modified")
    pins = b.get("pins", {})
    if pins.get("pkt_02_01_binding_sha256") != PKT_02_01_BINDING_SHA:
        errs.append("binding pins.pkt_02_01_binding_sha256 != pinned PKT-02-01 binding sha")
    if pins.get("pkt_02_01_packet_sha256") != PKT_02_01_PACKET_SHA:
        errs.append("binding pins.pkt_02_01_packet_sha256 != pinned PKT-02-01 packet sha")


def run_all(b):
    errs = []
    check_ids(b, errs)
    check_conditions(b, errs)
    check_slices(b, errs)
    check_lifecycle(b, errs)
    check_no_promotion_no_synthetic(b, errs)
    check_measured_unscored(b, errs)
    check_vocab(b, errs)
    check_service_parts_zero_admission(b, errs)
    check_accounting(b, errs)
    check_pkt_02_01_untouched(b, errs)
    return errs


def run_probes(b):
    probes = []

    def rec(name, mutate):
        m = copy.deepcopy(b)
        try:
            mutate(m)
            errs = run_all(m)
        except Exception as ex:  # noqa: BLE001
            probes.append({"probe": name, "expected": "reject", "got": "CRASH", "pass": False, "sample_error": f"{type(ex).__name__}: {ex}"})
            return
        probes.append({"probe": name, "expected": "reject", "got": "reject" if errs else "accept",
                       "pass": bool(errs), "n_errors": len(errs), "sample_error": errs[0] if errs else None})

    rec("A_condition_tamper", lambda m: m["metrics"]["SW-016"].__setitem__("canonical_condition", "Weekend/holiday response SLA breach rate >99%."))
    rec("B_inject_formula", lambda m: m["metrics"]["SW-132"].__setitem__("formula", "count(last inbound unanswered > 4h) / active_threads"))
    rec("C_inject_grade_target", lambda m: m["metrics"]["SW-084"].update({"grade_target_id": "GT-SW-084", "grade_approval": "approved", "grade_value_or_range": "< 0.35 (breach)"}))
    rec("D_mark_measured_validated", lambda m: m["metrics"]["SW-133"].update({"disposition": "measured_validated", "evaluation_state": "measured_graded", "gradable": True}))
    rec("E_move_to_accepted_measured", lambda m: (m["lifecycle_partition"]["accepted_measured_ids"].append("SW-133"),
                                                  m["lifecycle_partition"]["calculation_pending_ids"].remove("SW-133"),
                                                  m["metrics"]["SW-133"].__setitem__("lifecycle_bucket", "accepted_measured_ids")))
    rec("F_slice_misassignment", lambda m: (m["source_family_slices"]["slice_response_times"].append("SW-084"),
                                            m["source_family_slices"]["slice_cage_appointments_gross"].remove("SW-084")))
    rec("G_promote_via_quarantined_cage", lambda m: m["metrics"]["SW-084"].update({"disposition": "data_acquired_calculation_pending", "source_existence_state": "acquired_local", "acquisition_admission_state": "admitted_promoted", "evaluation_state": "measured_graded", "gradable": True}))
    rec("H_gradable_true_no_target", lambda m: m["metrics"]["SW-085"].__setitem__("gradable", True))
    rec("I_promote_sw133_measured_unscored_true", lambda m: m["metrics"]["SW-133"]["measured_unscored_observation"].__setitem__("promoted", True))
    rec("J_drop_one_id", lambda m: m["metrics"].pop("SW-089"))
    rec("K_duplicate_slice_member", lambda m: m["source_family_slices"]["slice_external_phone"].append("SW-085"))
    rec("L_pin_sha_drift", lambda m: m["pins"].__setitem__("pkt_02_01_binding_sha256", "0" * 64))
    rec("M_vocab_violation", lambda m: m["metrics"]["SW-018"].__setitem__("disposition", "totally_made_up_state"))
    rec("N_ses_disposition_inconsistent", lambda m: m["metrics"]["SW-017"].__setitem__("source_existence_state", "acquired_local"))
    rec("O_accounting_assertion_break", lambda m: m["packet_accounting_assertion"].__setitem__("packets", 31))
    rec("P_external_boundary_measured", lambda m: m["metrics"]["SW-085"].__setitem__("evaluation_state", "measured_graded"))
    rec("Q_rejected_bucket_nonempty", lambda m: (m["lifecycle_partition"]["rejected_ids"].append("SW-134"),
                                                 m["lifecycle_partition"]["calculation_pending_ids"].remove("SW-134"),
                                                 m["metrics"]["SW-134"].__setitem__("lifecycle_bucket", "rejected_ids")))
    return probes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--no-write", action="store_true")
    args = ap.parse_args()

    b = p1.load(BINDING_PATH)
    errs = run_all(b)
    probes = run_probes(b)
    failed = [p for p in probes if not p["pass"]]
    overall = (not errs) and (not failed)

    result = {
        "check": "honda_watchdog_phase1b_pkt_02_02_binding",
        "phase": "Phase 1B — PKT-02-02 authority binding + validation gate (design-only, additive)",
        "scope": "authority_binding_and_validation_gate_only (no calculate/persist/grade/alert/report/acquire)",
        "reuses": "scripts/halo-phase1/validate_phase1_contracts.py (frozen vocabularies + sha256 only; unmodified)",
        "binding_file": "docs/halo/contract/phase1b/pkt-02-02-binding.json",
        "binding_sha256": p1.sha256_file(BINDING_PATH),
        "target_ids": TARGET_IDS,
        "id_count": len(b.get("metrics", {})),
        "source_family_slices": {k: v for k, v in SLICES_EXPECTED.items()},
        "lifecycle_partition": b.get("lifecycle_partition", {}),
        "authority_absence_proof": {
            "gate2_evaluable_overlap": sorted(set(TARGET_IDS) & set(GATE2.keys())),
            "baseline_operational_target_overlap": sorted(set(TARGET_IDS) & BASELINE_METRICS),
            "meaning": "empty overlaps ⇒ none of the 12 has an accepted meaning or an approved target ⇒ none is measured/gradable",
        },
        "service_parts_zero_admission": b.get("service_parts_zero_admission", {}),
        "packet_accounting": {"conditions": 295, "modules": 11, "packets": 30},
        "pkt_02_01_frozen": {
            "binding_sha256": p1.sha256_file(os.path.join(CB, "pkt-02-01-binding.json")),
            "packet_sha256": p1.sha256_file(os.path.join(CB, "packets", "PKT-02-01.json")),
            "unchanged": True,
        },
        "adversarial_probes_total": len(probes),
        "adversarial_probes_failed": len(failed),
        "adversarial_probes": probes,
        "errors": errs,
        "overall_pass": overall,
        "note": "Binding-only: NO metric definition, value, grade, or customer projection is authored. No Vin/Gmail/runtime/DB/vault/INGEST/browser action.",
    }
    payload = json.dumps(result, indent=2, ensure_ascii=False)
    if not args.no_write:
        os.makedirs(os.path.dirname(args.out), exist_ok=True)
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(payload + "\n")
    print(payload)
    print(f"\nRESULT: {'PASS' if overall else 'FAIL'} (errors {len(errs)}, probes {len(probes)-len(failed)}/{len(probes)})", file=sys.stderr)
    return 0 if overall else 1


if __name__ == "__main__":
    raise SystemExit(main())
