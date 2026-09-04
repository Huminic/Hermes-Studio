#!/usr/bin/env python3
"""
PKT-03-01 J1 binding validator (focused + adversarial). Design-only, additive, CREATE-only allowlist.

Validates docs/halo/contract/phase1b/pkt-03-01-binding.json (Module 3, SW-031..042):
  - exact ordered 12 IDs, byte-exact catalog conditions, packet-index assignment, 295/11/30 accounting;
  - FOUR accepted carry-forward metrics {SW-031,032,033,041} anchored field-for-field to the pinned accepted
    gate5b evaluation + gate2 evaluator + baseline-registry target (deep-equal; NO recalc/regrade/drift); their
    master-ledger rows byte-identical to the baseline commit incl. current_truth_ref; authoritative_evaluated=17;
  - EIGHT held metrics source_investigation_pending / not_measured (no value/grade/alert), owner handoffs, missing!=zero,
    SW-034 Deal Performance candidate-only, SW-035 90d+formula gap, SW-036/037 pipeline join/formula gaps,
    SW-038/039/040 finite-positive investigation before any terminal 'unavailable' (never absence-inference, never zero),
    SW-042 bounded read-only hour-precision discovery (1 help + 1 UI + 1 probe), field-minimized/aggregate-only, no PII/raw/content/promotion;
  - customer emission authority FALSE (no customer output; future display eligibility is metadata only);
  - two-delta exactly 0/12 evidence and 0/12 meaning; zero Service/Parts; quarantined families unusable; no substitution;
  - pinned source hashes; exact 5-file CREATE-only allowlist; non-allowlisted tracked files byte-identical to baseline; .claude never staged.

Pinned to baseline commit c9e4c760ad72ad6620e20a094c5530a3a69e0791. Exit 0 == PASS.
Usage: python3 scripts/halo-phase1b/validate_pkt_03_01_binding.py [--out X] [--no-write]
"""
from __future__ import annotations
import argparse
import copy
import hashlib
import json
import os
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(REPO, "scripts", "halo-phase1"))
import validate_phase1_contracts as p1  # noqa: E402

C = os.path.join(REPO, "docs", "halo", "contract")
CB = os.path.join(C, "phase1b")
BINDING_PATH = os.path.join(CB, "pkt-03-01-binding.json")
DEFAULT_OUT = os.path.join(REPO, "docs", "halo", "evidence", "honda-watchdog", "phase1b", "pkt-03-01", "PKT-03-01_BINDING_CHECKS.json")

BASELINE_COMMIT = "c9e4c760ad72ad6620e20a094c5530a3a69e0791"
IDS = [f"SW-{i:03d}" for i in range(31, 43)]
ACC = ["SW-031", "SW-032", "SW-033", "SW-041"]
HELD = [i for i in IDS if i not in ACC]
STAGE = ["SW-038", "SW-039", "SW-040"]
SLICES_EXPECTED = {
    "slice_dealership_performance_accepted": ["SW-031", "SW-033"],
    "slice_appointments_accepted": ["SW-032", "SW-041"],
    "slice_crm_sales_gross_join": ["SW-034"],
    "slice_multi_source_funnel_join": ["SW-035", "SW-036", "SW-037"],
    "slice_stage_history_audit": ["SW-038", "SW-039", "SW-040"],
    "slice_appointments_confirmation_field": ["SW-042"],
}
MANAGEMENT_Q = ("Where is Serra Honda’s Sales funnel losing momentum—from lead through appointment, showroom, write-up, "
                "and close—and do appointment confirmation, pipeline aging, and stage-history evidence support timely "
                "management intervention?")
ALLOWLIST = sorted([
    "docs/halo/contract/phase1b/pkt-03-01-binding.json",
    "scripts/halo-phase1b/validate_pkt_03_01_binding.py",
    "docs/halo/evidence/honda-watchdog/phase1b/pkt-03-01/PKT-03-01_BINDING_CHECKS.json",
    "docs/halo/evidence/honda-watchdog/phase1b/pkt-03-01/PKT-03-01_J1_TWO_DELTA.md",
    "docs/halo/evidence/honda-watchdog/phase1b/pkt-03-01/PKT-03-01_J1_internal_coverage_roadmap.md",
])
RECEIPT_REL = "docs/halo/evidence/honda-watchdog/phase1b/pkt-03-01/PKT-03-01_BINDING_CHECKS.json"

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
ACCOUNTABLE = {"Duane Wells", "Codex VinSolutions controller", "Claude Studio engineering"}
DUANE = "Duane Wells"
DUANE_STEMS = ("acquir", "acquisit", "investigat", "accumulat", "admit", "admiss", "normaliz", "promot", "calculat", "implement")
GENERIC_OWNER = "Huminic Semantic Watchdog pipeline"
QUARANTINED = {"cage_kpi", "lead_source_roi", "sales_comm_log"}
SW295 = [f"SW-{i:03d}" for i in range(1, 296)]
NULL_VALUE_FIELDS = ["numerator", "denominator", "formula", "grade_target_id", "grade_basis", "grade_value_or_range", "detection_rule", "threshold", "ot_anchor"]

CODEX = "Codex VinSolutions controller"
STUDIO = "Claude Studio engineering"
# Immutable expected ownership (next-action owner, immediate-action owner, full role->owner map) per metric.
EXPECTED_OWNERS = {
    "SW-031": {"next": CODEX, "immediate": CODEX, "roles": {"authoritative_carry_forward_preservation": CODEX, "future_customer_display_authorization": DUANE}},
    "SW-032": {"next": CODEX, "immediate": CODEX, "roles": {"authoritative_carry_forward_preservation": CODEX, "future_customer_display_authorization": DUANE}},
    "SW-033": {"next": CODEX, "immediate": CODEX, "roles": {"authoritative_carry_forward_preservation": CODEX, "future_customer_display_authorization": DUANE}},
    "SW-034": {"next": CODEX, "immediate": CODEX, "roles": {"write_to_close_denominator_and_target_decision": DUANE, "read_only_dated_pull_and_bridge_investigation": CODEX, "join_and_calculation_implementation": STUDIO}},
    "SW-035": {"next": DUANE, "immediate": DUANE, "roles": {"funnel_join_formula_and_90d_baseline_decision": DUANE, "trailing_history_acquisition": CODEX, "baseline_comparison_implementation": STUDIO}},
    "SW-036": {"next": DUANE, "immediate": DUANE, "roles": {"open_pipeline_and_21d_rule_decision": DUANE, "pipeline_activity_extract_acquisition": CODEX, "aging_detection_implementation": STUDIO}},
    "SW-037": {"next": DUANE, "immediate": DUANE, "roles": {"pipeline_denominator_and_7d_window_decision": DUANE, "pipeline_intake_extract_acquisition": CODEX, "hot_lead_mix_implementation": STUDIO}},
    "SW-038": {"next": CODEX, "immediate": CODEX, "roles": {"status_audit_request_decision": DUANE, "positive_stage_history_export_investigation": CODEX, "stage_history_detection_implementation": STUDIO}},
    "SW-039": {"next": CODEX, "immediate": CODEX, "roles": {"status_audit_request_decision": DUANE, "positive_stage_history_export_investigation": CODEX, "stage_history_detection_implementation": STUDIO}},
    "SW-040": {"next": CODEX, "immediate": CODEX, "roles": {"status_audit_request_decision": DUANE, "positive_stage_history_export_investigation": CODEX, "stage_history_detection_implementation": STUDIO}},
    "SW-041": {"next": CODEX, "immediate": CODEX, "roles": {"authoritative_carry_forward_preservation": CODEX, "future_customer_display_authorization": DUANE}},
    "SW-042": {"next": CODEX, "immediate": CODEX, "roles": {"window_anchor_and_target_decision_after_proof": DUANE, "read_only_hour_precision_timestamp_discovery": CODEX, "confirmation_window_implementation": STUDIO}},
}
_NEG = ("not ", "never", "without", "don't", "do not", "must not", "cannot", "can't", "prohibit", "forbid",
        "is not", "are not", "avoid", "refrain", "exclude", "no ", "no-", "only after", "before any", "zero-")
_ABSENCE_ASSERT = ("absence proves", "absence is proof", "proves unavailable", "proves it unavailable",
                   "means unavailable", "means zero", "record zero", "record as zero", "treat missing as zero",
                   "treat absence as zero", "missing as zero", "missing is zero", "counts as zero", "count as zero",
                   "nothing found means", "no rows means", "no results means", "no data means",
                   "negative search proves", "not found proves", "conclude unavailable", "concludes unavailable",
                   "infer unavailable", "inferred unavailable")
_CAPTURE_VERBS = ("retain", "capture", "include", "store", "stores", "emit", "preserve", "export", "record")
_CAPTURE_TARGETS = ("raw row", "raw rows", "pii", "customer name", "customer names", "message content", "message-content")


def _asserts(blob, patterns, prewin=32):
    """Return matched patterns that appear WITHOUT a nearby negation (i.e., stated as assertion, not prohibition)."""
    hits = []
    for pat in patterns:
        idx = 0
        while True:
            j = blob.find(pat, idx)
            if j < 0:
                break
            if not any(n in blob[max(0, j - prewin):j] for n in _NEG):
                hits.append(pat)
                break
            idx = j + len(pat)
    return hits


def _target_negated(blob, target):
    """Every occurrence of `target` must sit in a clause that contains a negation BEFORE it.
    Clauses split on ; . ! ? and newline, so a '/'-joined compound under one 'no' negates all its members,
    while a bare target in its own clause (e.g. '; raw row;') is NOT negated."""
    seps = (";", ".", "!", "?", "\n")
    any_occ, all_ok, start = False, True, 0
    while True:
        j = blob.find(target, start)
        if j < 0:
            break
        any_occ = True
        bstart = max((blob.rfind(s, 0, j) for s in seps), default=-1)
        clause = blob[bstart + 1:j]
        if not any(n in clause for n in _NEG):
            all_ok = False
        start = j + len(target)
    return any_occ and all_ok


def _capture_contradictions(blob):
    hits = []
    for t in _CAPTURE_TARGETS:
        idx = 0
        while True:
            j = blob.find(t, idx)
            if j < 0:
                break
            win = blob[max(0, j - 24):j]
            if any(v in win for v in _CAPTURE_VERBS) and not any(n in win for n in _NEG):
                hits.append(t)
                break
            idx = j + len(t)
    return hits


def sha_file(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def git_show(path):
    return subprocess.check_output(["git", "-C", REPO, "show", f"{BASELINE_COMMIT}:{path}"])


def load_local(rel):
    return json.load(open(os.path.join(REPO, rel), encoding="utf-8"))


def load_ctx():
    ctx = {}
    ctx["b"] = load_local("docs/halo/contract/phase1b/pkt-03-01-binding.json")
    ctx["g2"] = load_local("docs/halo/contract/gate2-evaluator-contract.json")["evaluable_conditions"]
    ctx["ot"] = {o["metric_id"]: o for o in load_local("docs/halo/contract/baseline-registry.json")["operational_targets"] if isinstance(o, dict)}
    ctx["g5"] = {r["metric_id"]: r for r in load_local("docs/halo/evidence/m1r/gate5b/gate5b-report-model-21043.json")["evaluated"] if isinstance(r, dict)}
    ctx["matrix"] = {e["metric_id"]: e for e in p1.load(os.path.join(C, "semantic-watchdog-feasibility-matrix-295.json"))}
    ctx["ledger_new"] = {r["metric_id"]: r for r in load_local("docs/halo/contract/phase1b/master-ledger-295.json")["rows"]}
    ctx["ledger_counts"] = load_local("docs/halo/contract/phase1b/master-ledger-295.json")["counts"]
    ctx["ledger_old"] = {r["metric_id"]: r for r in json.loads(git_show("docs/halo/contract/phase1b/master-ledger-295.json"))["rows"]}
    ctx["index"] = load_local("docs/halo/contract/phase1b/packet-index.json")
    return ctx


def check_ids(ctx, errs):
    b = ctx["b"]
    keys = list(b.get("metrics", {}).keys())
    if keys != IDS:
        errs.append(f"metrics keys != exact ordered 12 (got {keys})")
    if b.get("management_question") != MANAGEMENT_Q:
        errs.append("management_question != exact required text (scope drift)")
    pkt = [p for p in ctx["index"]["packets"] if p["packet_id"] == "PKT-03-01"]
    if not pkt or pkt[0]["target_ids"] != IDS:
        errs.append("packet-index PKT-03-01 target_ids != exact ordered 12")
    owned = {t: p["packet_id"] for p in ctx["index"]["packets"] for t in p["target_ids"]}
    for t in IDS:
        if owned.get(t) != "PKT-03-01":
            errs.append(f"{t}: owned by {owned.get(t)} not PKT-03-01 (module drift)")


def check_conditions(ctx, errs):
    for mid, rec in ctx["b"]["metrics"].items():
        if rec.get("canonical_condition") != ctx["matrix"].get(mid, {}).get("condition"):
            errs.append(f"{mid}: canonical_condition != catalog (byte)")


def check_slices(ctx, errs):
    sl = ctx["b"].get("source_family_slices", {})
    if set(sl.keys()) != set(SLICES_EXPECTED.keys()):
        errs.append("source_family_slices keys != expected 6")
    flat = [i for v in sl.values() for i in (v or [])]
    if len(flat) != len(set(flat)) or set(flat) != set(IDS):
        errs.append("source_family_slices overlap/union != 12")
    for name, ids in SLICES_EXPECTED.items():
        if sl.get(name) != ids:
            errs.append(f"slice {name} != expected membership")
    for mid, rec in ctx["b"]["metrics"].items():
        if mid not in (sl.get(rec.get("source_family_slice")) or []):
            errs.append(f"{mid}: source_family_slice mismatch")


def check_lifecycle(ctx, errs):
    lp = ctx["b"].get("lifecycle_partition", {})
    names = ["accepted_measured_ids", "accepted_disposition_only_ids", "rejected_ids", "source_investigation_pending_ids", "calculation_pending_ids"]
    if set(lp.keys()) != set(names):
        errs.append("lifecycle_partition keys != 5 buckets")
    flat = [i for k in names for i in (lp.get(k) or [])]
    if len(flat) != len(set(flat)) or set(flat) != set(IDS):
        errs.append("lifecycle_partition overlap/union != 12")
    if lp.get("accepted_measured_ids") != ACC:
        errs.append(f"accepted_measured_ids != exact {ACC}")
    if lp.get("accepted_disposition_only_ids") or lp.get("rejected_ids") or lp.get("calculation_pending_ids"):
        errs.append("disposition_only/rejected/calculation_pending must be EMPTY")
    if sorted(lp.get("source_investigation_pending_ids") or []) != sorted(HELD):
        errs.append("source_investigation_pending_ids != the 8 held")
    bucket_of = {i: k for k in names for i in (lp.get(k) or [])}
    for mid, rec in ctx["b"]["metrics"].items():
        if bucket_of.get(mid) != rec.get("lifecycle_bucket"):
            errs.append(f"{mid}: lifecycle_bucket != partition membership")


def check_accepted_anchoring(ctx, errs):
    """The 4 measured carry-forward metrics anchored exactly to pinned gate2 + baseline OT + gate5b (no drift)."""
    for mid in ACC:
        b = ctx["b"]["metrics"][mid]
        g, ot, ev = ctx["g2"].get(mid, {}), ctx["ot"].get(mid, {}), ctx["g5"].get(mid, {})
        if b.get("disposition") != "measured_validated" or b.get("evaluation_state") != "measured_graded":
            errs.append(f"accepted {mid}: must be measured_validated/measured_graded")
        if b.get("source_existence_state") != "acquired_local" or b.get("acquisition_admission_state") != "admitted_held":
            errs.append(f"accepted {mid}: source/acquisition state incorrect")
        if b.get("gradable") is not True:
            errs.append(f"accepted {mid}: gradable must be True")
        # gate2 anchoring
        if b.get("gate2_anchor") != g:
            errs.append(f"accepted {mid}: gate2_anchor != live gate2 evaluable_conditions (drift)")
        if b.get("formula") != g.get("formula"):
            errs.append(f"accepted {mid}: formula != gate2")
        if b.get("numerator") != g.get("numerator_field") or b.get("denominator") != g.get("denominator_field"):
            errs.append(f"accepted {mid}: numerator/denominator != gate2 fields")
        if b.get("unit") != g.get("unit"):
            errs.append(f"accepted {mid}: unit != gate2")
        if b.get("source_family") != g.get("source_family"):
            errs.append(f"accepted {mid}: source_family != gate2")
        if b.get("grade_target_id") != "GT-" + g.get("baseline_id", ""):
            errs.append(f"accepted {mid}: grade_target_id != GT-{g.get('baseline_id')}")
        # baseline OT anchoring
        oa = b.get("ot_anchor") or {}
        for k, sk in (("baseline_id", "id"), ("comparator", "comparator"), ("threshold", "threshold"), ("unit", "unit"), ("direction", "direction"), ("basis", "basis")):
            if oa.get(k) != ot.get(sk):
                errs.append(f"accepted {mid}: ot_anchor.{k} != baseline OT (target drift)")
        if b.get("threshold") != ot.get("threshold"):
            errs.append(f"accepted {mid}: threshold != baseline OT")
        # gate5b accepted evaluation deep-equal (value/rating/numerator/denominator/period/provenance) — no regrade/recalc
        if b.get("accepted_evaluation") != ev:
            errs.append(f"accepted {mid}: accepted_evaluation != pinned gate5b evaluation (value/target/rating/provenance drift)")
        # canonical condition
        if b.get("canonical_condition") != ctx["matrix"].get(mid, {}).get("condition"):
            errs.append(f"accepted {mid}: canonical_condition != catalog")
        if b.get("carry_forward") is not True:
            errs.append(f"accepted {mid}: carry_forward must be True")


def check_carry_forward_preservation(ctx, errs):
    """Ledger rows for the 4 byte-identical to baseline; current_truth_ref preserved; authoritative_evaluated=17; ledger not edited."""
    for mid in ACC:
        if ctx["ledger_new"].get(mid) != ctx["ledger_old"].get(mid):
            errs.append(f"carry-forward {mid}: master-ledger row changed vs baseline (must be byte-identical)")
        if ctx["b"]["metrics"][mid].get("current_truth_ref") != ctx["ledger_old"][mid].get("current_truth_ref"):
            errs.append(f"carry-forward {mid}: binding current_truth_ref != ledger current_truth_ref")
        if ctx["ledger_old"][mid].get("disposition") != "measured_validated":
            errs.append(f"carry-forward {mid}: baseline ledger disposition unexpected")
    if ctx["ledger_counts"].get("authoritative_evaluated") != 17:
        errs.append("authoritative_evaluated != 17")


def check_held(ctx, errs):
    for mid in HELD:
        b = ctx["b"]["metrics"][mid]
        if b.get("disposition") != "source_investigation_pending" or b.get("evaluation_state") != "not_measured":
            errs.append(f"held {mid}: must be source_investigation_pending / not_measured")
        if b.get("source_existence_state") != "investigation_pending" or b.get("acquisition_admission_state") != "not_acquired":
            errs.append(f"held {mid}: source/acquisition state incorrect")
        if b.get("gradable") is not False or b.get("alert_eligible") is not False:
            errs.append(f"held {mid}: gradable/alert must be False")
        if b.get("future_display_eligibility") is not False:
            errs.append(f"held {mid}: future_display_eligibility must be False")
        for f in NULL_VALUE_FIELDS:
            if b.get(f) is not None:
                errs.append(f"held {mid}: {f} must be null")
        if b.get("accepted_evaluation") is not None or b.get("carry_forward") is not False:
            errs.append(f"held {mid}: must not carry an accepted_evaluation / carry_forward")
        if b.get("missing_not_zero") is not True or b.get("content_bytes_read") is not False:
            errs.append(f"held {mid}: missing_not_zero true + content_bytes_read false required")
        if b.get("direct_source_fields") != []:
            errs.append(f"held {mid}: direct_source_fields must be []")
    # SW-034: Deal Performance candidate only; source_family crm_sales_gross (not dealership_performance)
    s34 = ctx["b"]["metrics"]["SW-034"]
    if s34.get("source_family") != "crm_sales_gross":
        errs.append("SW-034: source_family must be crm_sales_gross (Deal Performance is candidate-only, not accepted)")
    if not any("candidate" in m.lower() for m in s34.get("missing_or_quarantine_evidence", [])):
        errs.append("SW-034: must record Deal Performance as candidate-only join bridge")
    # SW-035 90d + formula gap; SW-036/037 pipeline join/formula
    if "90" not in ctx["b"]["metrics"]["SW-035"].get("history_requirement", ""):
        errs.append("SW-035: must preserve the 90-day baseline requirement")
    for mid in ("SW-035", "SW-036", "SW-037"):
        if ctx["b"]["metrics"][mid].get("source_family") != "multi_source_funnel_join":
            errs.append(f"{mid}: must be the multi-source funnel join (no substitution)")
    # SW-038/039/040: finite positive investigation before terminal unavailable; never absence-inference / zero
    for mid in STAGE:
        b = ctx["b"]["metrics"][mid]
        miss_blob = " ".join(b.get("missing_or_quarantine_evidence", [])).lower()
        fut_blob = " ".join(b.get("required_future_contract", [])).lower()
        if "finite positive" not in fut_blob:
            errs.append(f"{mid}: required_future_contract must require a finite POSITIVE investigation before any terminal 'unavailable'")
        if not any(t in miss_blob for t in ("transition", "status", "export", "retention", "audit")):
            errs.append(f"{mid}: missing_or_quarantine_evidence must describe the missing status/transition export (no blank/fabricated requirement)")
        if "finite positive" not in miss_blob:
            errs.append(f"{mid}: missing_or_quarantine_evidence must state a finite positive investigation is required before terminal 'unavailable'")
        if b.get("disposition") in ("external_source_required", "genuinely_not_available"):
            errs.append(f"{mid}: must remain source_investigation_pending (no premature unavailable / absence-inference)")
    # SW-042: bounded read-only discovery + aggregate-only + no PII/raw/content + no promotion
    b42 = ctx["b"]["metrics"]["SW-042"]
    act = b42.get("immediate_action", {}).get("action", "").lower()
    if not ("one help" in act and "one" in act and ("ui" in act) and "probe" in act):
        errs.append("SW-042: immediate discovery must be the bounded one-help/one-UI/one-probe pass")
    if not ("aggregate-only" in act or "field-minimized" in act) or "no pii" not in act:
        errs.append("SW-042: discovery must be field-minimized/aggregate-only with no PII")
    if b42.get("pii_capture") is not False or b42.get("raw_row_capture") is not False or b42.get("message_content_capture") is not False:
        errs.append("SW-042: pii/raw-row/message-content capture flags must all be False")


def check_customer_boundary(ctx, errs):
    if ctx["b"].get("customer_emission_authority") is not False:
        errs.append("customer_emission_authority must be FALSE in J1")
    cp = ctx["b"].get("customer_projection", {})
    if cp.get("customer_visible_ids") or cp.get("customer_report_emitted") is not False:
        errs.append("customer_projection: no visible ids / no report emitted")
    for mid, b in ctx["b"]["metrics"].items():
        if b.get("customer_visibility") != "hidden":
            errs.append(f"{mid}: customer_visibility must be hidden in J1 (no emission)")
        if b.get("customer_projection") is not None:
            errs.append(f"{mid}: customer_projection must be null (no customer output)")
    # accepted metrics are display-eligible metadata only (true), held are false
    for mid in ACC:
        if ctx["b"]["metrics"][mid].get("future_display_eligibility") is not True:
            errs.append(f"accepted {mid}: future_display_eligibility metadata must be True")


def check_owners(ctx, errs):
    roster = ctx["b"].get("accountable_owner_roster", {})
    if set(roster.keys()) != ACCOUNTABLE:
        errs.append("accountable_owner_roster keys != the 3 accountable owners")
    for mid, b in ctx["b"]["metrics"].items():
        owners = b.get("accountable_owners", {})
        if not isinstance(owners, dict) or not owners:
            errs.append(f"{mid}: accountable_owners must be a non-empty map"); continue
        for role, who in owners.items():
            if who not in ACCOUNTABLE:
                errs.append(f"{mid}: owner '{who}' not accountable")
            if who == GENERIC_OWNER:
                errs.append(f"{mid}: generic owner forbidden")
            if who == DUANE and any(t in role.lower() for t in DUANE_STEMS):
                errs.append(f"{mid}: Duane on technical role '{role}'")
        # handoff shape
        ia = b.get("immediate_action")
        subs = b.get("subsequent_actions")
        if not isinstance(ia, dict) or set(ia.keys()) != {"owner", "action"} or ia.get("owner") not in ACCOUNTABLE or not str(ia.get("action", "")).strip():
            errs.append(f"{mid}: immediate_action must be exactly {{owner,action}} with accountable owner + nonblank action")
        elif ia.get("owner") != b.get("next_action_owner"):
            errs.append(f"{mid}: immediate_action.owner != next_action_owner")
        if not isinstance(subs, list) or not subs:
            errs.append(f"{mid}: subsequent_actions must be non-empty list")
            subs = []
        for a in ([ia] + list(subs)):
            if isinstance(a, dict) and set(a.keys()) == {"owner", "action"}:
                if a.get("owner") not in ACCOUNTABLE:
                    errs.append(f"{mid}: action owner not accountable")
                if a.get("owner") == DUANE and any(t in str(a.get("action", "")).lower() for t in DUANE_STEMS):
                    errs.append(f"{mid}: Duane owns a technical action (forbidden)")
            else:
                errs.append(f"{mid}: subsequent action must be exactly {{owner,action}}")
        if b.get("next_action_owner") not in ACCOUNTABLE:
            errs.append(f"{mid}: next_action_owner not accountable")


def check_owner_immutability(ctx, errs):
    """Ownership + action-owner immutability against the pinned expected maps (incl. accepted carry-forward Codex)."""
    for mid, exp in EXPECTED_OWNERS.items():
        m = ctx["b"]["metrics"].get(mid, {})
        if m.get("next_action_owner") != exp["next"]:
            errs.append(f"{mid}: next_action_owner drift (expected {exp['next']})")
        if (m.get("immediate_action") or {}).get("owner") != exp["immediate"]:
            errs.append(f"{mid}: immediate_action owner drift (expected {exp['immediate']})")
        if (m.get("accountable_owners") or {}) != exp["roles"]:
            errs.append(f"{mid}: accountable_owners role->owner map drift (immutable)")


def _mblob(m, *keys):
    parts = []
    for k in keys:
        v = m.get(k)
        if isinstance(v, list):
            parts += [x if isinstance(x, str) else json.dumps(x, ensure_ascii=False) for x in v]
        elif isinstance(v, dict):
            parts.append(str(v.get("action", "")))
        elif isinstance(v, str):
            parts.append(v)
    return " ".join(parts).lower()


def check_pipeline_gaps(ctx, errs):
    """SW-036/037 must preserve their exact denominator/window/join-formula gap language."""
    m36 = ctx["b"]["metrics"]["SW-036"]
    if not m36.get("missing_or_quarantine_evidence"):
        errs.append("SW-036: missing_or_quarantine_evidence must not be empty")
    c36 = _mblob(m36, "missing_or_quarantine_evidence")  # the MISSING evidence itself must preserve every gap marker
    for t in ("pipeline denominator", "last-activity", "21-day", "join", "formula"):
        if t not in c36:
            errs.append(f"SW-036: required gap marker '{t}' missing from missing_or_quarantine_evidence (open-pipeline/last-activity/21-day/join-formula)")
    m37 = ctx["b"]["metrics"]["SW-037"]
    if not m37.get("missing_or_quarantine_evidence"):
        errs.append("SW-037: missing_or_quarantine_evidence must not be empty")
    c37 = _mblob(m37, "missing_or_quarantine_evidence")
    for t in ("pipeline denominator", "7-day", "intake", "join", "formula"):
        if t not in c37:
            errs.append(f"SW-037: required gap marker '{t}' missing from missing_or_quarantine_evidence (pipeline-denominator/7-day-intake/join-formula)")


def check_absence_inference(ctx, errs):
    """SW-038/039/040: forbid absence-as-proof / conclude-unavailable-from-negative / missing-as-zero (negation-aware)."""
    for mid in STAGE:
        m = ctx["b"]["metrics"][mid]
        blob = _mblob(m, "missing_or_quarantine_evidence", "required_future_contract", "immediate_action", "next_safe_source_action")
        hits = _asserts(blob, _ABSENCE_ASSERT)
        if hits:
            errs.append(f"{mid}: absence-inference language asserts {hits} (absence/negative-search is not proof; missing is not zero)")


def check_sw042_capture_language(ctx, errs):
    """SW-042: each of PII, raw row(s), message content must appear AND be independently negated across
    immediate/future/next-safe language (compound 'no PII/raw row/message content' negates all three);
    plus no contradictory capture verbs. Mere token presence is NOT sufficient."""
    m = ctx["b"]["metrics"]["SW-042"]
    ia = str((m.get("immediate_action") or {}).get("action", ""))
    fut = " ; ".join(m.get("required_future_contract", []) or [])
    nsa = str(m.get("next_safe_source_action", ""))
    blob = " ; ".join([ia, fut, nsa]).lower()
    for t in ("pii", "raw row", "message content"):
        if t not in blob:
            errs.append(f"SW-042: explicit exclusion for '{t}' missing from immediate/future/next-safe language")
        elif not _target_negated(blob, t):
            errs.append(f"SW-042: '{t}' appears without a nearby negation in its clause (must be explicitly excluded, per-target)")
    contra = _capture_contradictions(blob)
    if contra:
        errs.append(f"SW-042: contradictory capture verb applied to {contra} (retain/capture/store/emit/export raw/PII/content forbidden even with flags false)")


def check_vocab(ctx, errs):
    for mid, rec in ctx["b"]["metrics"].items():
        for field, allowed in (("disposition", DISP), ("source_existence_state", SES), ("evaluation_state", EVAL),
                               ("acquisition_admission_state", ACQ), ("boundary_class", BOUND), ("calculation_kind", KIND)):
            if rec.get(field) not in allowed:
                errs.append(f"{mid}: {field} '{rec.get(field)}' not in frozen vocab")
        disp, ses, ev, acq = rec.get("disposition"), rec.get("source_existence_state"), rec.get("evaluation_state"), rec.get("acquisition_admission_state")
        if disp in DISP_SES and ses not in DISP_SES[disp]:
            errs.append(f"{mid}: source_existence inconsistent with disposition")
        if disp in DISP_EVAL and ev not in DISP_EVAL[disp]:
            errs.append(f"{mid}: evaluation inconsistent with disposition")
        if ses in SES_ACQ and acq not in SES_ACQ[ses]:
            errs.append(f"{mid}: acquisition invalid for source_existence")


def check_quarantine(ctx, errs):
    b = ctx["b"]
    if b.get("dealer_scope", {}).get("service_parts_admitted") != 0:
        errs.append("service_parts_admitted must be 0")
    spa = b.get("service_parts_zero_admission", {})
    if not QUARANTINED <= set(spa.get("quarantined_families") or []):
        errs.append("quarantined_families must include cage_kpi/lead_source_roi/sales_comm_log")
    for mid, rec in b["metrics"].items():
        if rec.get("source_family") in QUARANTINED:
            errs.append(f"{mid}: sources a quarantined family")
    if ctx["b"]["metrics"]["SW-033"].get("source_family") != "dealership_performance":
        errs.append("SW-033 must use dealership_performance (not quarantined cage_kpi)")


def check_two_delta(ctx, errs):
    td = ctx["b"].get("two_delta", {})
    if td.get("evidence_delta", {}).get("count") != 0 or td.get("evidence_delta", {}).get("of") != 12:
        errs.append("two_delta evidence must be 0/12")
    if td.get("meaning_delta", {}).get("count") != 0 or td.get("meaning_delta", {}).get("of") != 12:
        errs.append("two_delta meaning must be 0/12")


def check_accounting(ctx, errs):
    allids = [t for p in ctx["index"]["packets"] for t in p["target_ids"]]
    if sorted(allids) != SW295:
        errs.append("packet-index union != 295")
    if sorted({p["module"] for p in ctx["index"]["packets"]}) != list(range(1, 12)):
        errs.append("packet-index modules != 1..11")
    if len(ctx["index"]["packets"]) != 30:
        errs.append("packet-index packet count != 30")
    if ctx["b"].get("packet_accounting_assertion") != {"conditions": 295, "modules": 11, "packets": 30}:
        errs.append("packet_accounting_assertion != {295,11,30}")


def check_pinned_hashes(ctx, errs, live=True):
    pins = ctx["b"].get("pinned_source_hashes", {})
    want = {
        "feasibility_matrix": "docs/halo/contract/semantic-watchdog-feasibility-matrix-295.json",
        "gate2_evaluator": "docs/halo/contract/gate2-evaluator-contract.json",
        "baseline_registry": "docs/halo/contract/baseline-registry.json",
        "gate5b_report_model_21043": "docs/halo/evidence/m1r/gate5b/gate5b-report-model-21043.json",
        "master_ledger_295": "docs/halo/contract/phase1b/master-ledger-295.json",
        "sw042_evidence_gap": "docs/halo/contract/phase1b/MODULE3_APPT_CONFIRMATION_SW-042_EVIDENCE_GAP.json",
        "native_scheduled_evidence": "docs/halo/evidence/m1r/scheduled/native-scheduled-evidence.json",
    }
    for k, rel in want.items():
        if k not in pins:
            errs.append(f"pinned_source_hashes missing {k}")
        elif live and pins[k] != sha_file(os.path.join(REPO, rel)):
            errs.append(f"pinned_source_hashes[{k}] != live sha (source drift)")


def run_structural(ctx):
    errs = []
    check_ids(ctx, errs)
    # id/order integrity gate: downstream checks assume the exact 12 metric keys present in order
    if list(ctx["b"].get("metrics", {}).keys()) != IDS:
        return errs
    check_conditions(ctx, errs)
    check_slices(ctx, errs)
    check_lifecycle(ctx, errs)
    check_accepted_anchoring(ctx, errs)
    check_carry_forward_preservation(ctx, errs)
    check_held(ctx, errs)
    check_customer_boundary(ctx, errs)
    check_owners(ctx, errs)
    check_owner_immutability(ctx, errs)
    check_pipeline_gaps(ctx, errs)
    check_absence_inference(ctx, errs)
    check_sw042_capture_language(ctx, errs)
    check_vocab(ctx, errs)
    check_quarantine(ctx, errs)
    check_two_delta(ctx, errs)
    check_accounting(ctx, errs)
    check_pinned_hashes(ctx, errs, live=False)  # structural (probe-safe); live hash check in main
    return errs


# ---------------- allowlist (pure + git) ----------------

def allowlist_errors(touched, staged_claude):
    e = []
    extra = sorted(f for f in touched if f not in ALLOWLIST)
    if extra:
        e.append(f"files touched outside allowlist: {extra}")
    if staged_claude:
        e.append(".claude/ is staged (forbidden)")
    return e


def check_allowlist_and_frozen(errs, info):
    changed = subprocess.check_output(["git", "-C", REPO, "diff", "--name-only", BASELINE_COMMIT]).decode().split()
    st = subprocess.check_output(["git", "-C", REPO, "status", "--porcelain"]).decode().splitlines()
    untracked = [ln[3:] for ln in st if ln.startswith("??")]
    staged_claude = any(".claude/" in ln and ln[0] in "AM" for ln in st)
    touched = set(changed)
    for u in untracked:
        if u.startswith(".claude/"):
            continue
        full = os.path.join(REPO, u)
        if u.endswith("/") or os.path.isdir(full):
            for root, _, files in os.walk(full):
                for fn in files:
                    touched.add(os.path.relpath(os.path.join(root, fn), REPO))
        else:
            touched.add(u)
    info["touched_vs_baseline"] = sorted(touched)
    errs.extend(allowlist_errors(touched, staged_claude))
    missing = [f for f in ALLOWLIST if f != RECEIPT_REL and not os.path.exists(os.path.join(REPO, f))]
    if missing:
        errs.append(f"allowlist files missing: {missing}")
    # non-allowlisted tracked mutation: any tracked file changed vs baseline must be in allowlist
    for f in changed:
        if f not in ALLOWLIST:
            errs.append(f"non-allowlisted tracked file mutated: {f}")


# ---------------- probes ----------------

def run_probes(ctx):
    probes = []

    def rec(name, mutate):
        c = copy.deepcopy(ctx)
        try:
            mutate(c)
            errs = run_structural(c)
        except Exception as ex:  # noqa: BLE001
            probes.append({"probe": name, "expected": "reject", "got": "CRASH", "pass": False, "err": f"{type(ex).__name__}: {ex}"})
            return
        probes.append({"probe": name, "expected": "reject", "got": "reject" if errs else "accept", "pass": bool(errs), "n": len(errs), "sample": errs[0] if errs else None})

    def rec_allow(name, touched, claude):
        e = allowlist_errors(touched, claude)
        probes.append({"probe": name, "expected": "reject", "got": "reject" if e else "accept", "pass": bool(e), "n": len(e), "sample": e[0] if e else None})

    rec("accepted_value_drift", lambda c: c["b"]["metrics"]["SW-032"]["accepted_evaluation"].__setitem__("value", 0.9))
    rec("accepted_target_drift", lambda c: c["b"]["metrics"]["SW-031"]["ot_anchor"].__setitem__("threshold", 0.5))
    rec("accepted_threshold_field_drift", lambda c: c["b"]["metrics"]["SW-031"].__setitem__("threshold", 0.9))
    rec("accepted_provenance_drift", lambda c: c["b"]["metrics"]["SW-041"]["accepted_evaluation"]["evidence"].__setitem__("period", {"start": "2025-01-01", "end": "2025-01-07"}))
    rec("accepted_regrade", lambda c: c["b"]["metrics"]["SW-033"]["accepted_evaluation"].__setitem__("rating", "healthy"))
    rec("gate2_anchor_drift", lambda c: c["b"]["metrics"]["SW-032"].__setitem__("formula", "count(x)/y_tampered"))
    rec("current_truth_drift", lambda c: c["b"]["metrics"]["SW-031"].__setitem__("current_truth_ref", "fabricated"))
    rec("carry_forward_ledger_drift", lambda c: c["ledger_new"]["SW-031"].__setitem__("disposition", "data_acquired_calculation_pending"))
    rec("authoritative_count_drift", lambda c: c["ledger_counts"].__setitem__("authoritative_evaluated", 16))
    rec("customer_emission_true", lambda c: c["b"].__setitem__("customer_emission_authority", True))
    rec("customer_visible_nonempty", lambda c: c["b"]["customer_projection"].__setitem__("customer_visible_ids", ["SW-031"]))
    rec("accepted_customer_projection_value", lambda c: c["b"]["metrics"]["SW-032"].__setitem__("customer_projection", {"headline": "show rate 57%"}))
    rec("sw042_pii_read", lambda c: c["b"]["metrics"]["SW-042"].__setitem__("content_bytes_read", True))
    rec("sw042_promotion", lambda c: c["b"]["metrics"]["SW-042"].update({"disposition": "measured_validated", "evaluation_state": "measured_graded", "gradable": True}))
    rec("sw042_unbounded_discovery", lambda c: c["b"]["metrics"]["SW-042"]["immediate_action"].__setitem__("action", "Do an open-ended full export of all appointment rows including customer names."))
    rec("sw034_candidate_as_accepted", lambda c: c["b"]["metrics"]["SW-034"].__setitem__("source_family", "dealership_performance"))
    rec("fabricated_value_on_held", lambda c: c["b"]["metrics"]["SW-035"].__setitem__("formula", "conv/base"))
    rec("held_accepted_evaluation_injection", lambda c: c["b"]["metrics"]["SW-036"].__setitem__("accepted_evaluation", {"value": 0.5}))
    rec("sw038_absence_inference_unavailable", lambda c: c["b"]["metrics"]["SW-038"].__setitem__("disposition", "genuinely_not_available"))
    rec("sw039_premature_external", lambda c: c["b"]["metrics"]["SW-039"].__setitem__("disposition", "external_source_required"))
    rec("stage_history_requirement_drop", lambda c: c["b"]["metrics"]["SW-040"].__setitem__("missing_or_quarantine_evidence", ["no data"]))
    rec("sw035_90d_drop", lambda c: c["b"]["metrics"]["SW-035"].__setitem__("history_requirement", "single_week"))
    rec("quarantined_source_use", lambda c: c["b"]["metrics"]["SW-034"].__setitem__("source_family", "cage_kpi"))
    rec("service_parts_admitted", lambda c: c["b"]["dealer_scope"].__setitem__("service_parts_admitted", 1))
    rec("generic_owner", lambda c: c["b"]["metrics"]["SW-035"]["accountable_owners"].__setitem__("x", GENERIC_OWNER))
    rec("duane_technical_role", lambda c: c["b"]["metrics"]["SW-042"]["accountable_owners"].__setitem__("timestamp_acquisition", DUANE))
    rec("duane_technical_action", lambda c: c["b"]["metrics"]["SW-035"]["immediate_action"].__setitem__("action", "Acquire and implement the 90-day baseline join."))
    rec("nonzero_two_delta", lambda c: c["b"]["two_delta"]["evidence_delta"].__setitem__("count", 1))
    rec("order_drift", lambda c: c["b"].__setitem__("metrics", {k: c["b"]["metrics"][k] for k in reversed(list(c["b"]["metrics"].keys()))}))
    rec("id_drop", lambda c: c["b"]["metrics"].pop("SW-040"))
    rec("scope_drift_question", lambda c: c["b"].__setitem__("management_question", "different question"))
    rec("accepted_partition_drift", lambda c: (c["b"]["lifecycle_partition"]["accepted_measured_ids"].append("SW-042")))
    rec("held_gradable_true", lambda c: c["b"]["metrics"]["SW-034"].__setitem__("gradable", True))
    rec("held_future_display_true", lambda c: c["b"]["metrics"]["SW-036"].__setitem__("future_display_eligibility", True))
    rec("vocab_violation", lambda c: c["b"]["metrics"]["SW-037"].__setitem__("disposition", "made_up"))
    # --- J1R1: ownership/action-owner immutability ---
    rec("accepted_owner_drift", lambda c: c["b"]["metrics"]["SW-031"]["accountable_owners"].__setitem__("authoritative_carry_forward_preservation", DUANE))
    rec("accepted_immediate_owner_drift", lambda c: c["b"]["metrics"]["SW-032"]["immediate_action"].__setitem__("owner", "Claude Studio engineering"))
    rec("accepted_next_owner_drift", lambda c: c["b"]["metrics"]["SW-033"].__setitem__("next_action_owner", DUANE))
    rec("held_action_owner_drift", lambda c: (c["b"]["metrics"]["SW-035"]["immediate_action"].__setitem__("owner", CODEX), c["b"]["metrics"]["SW-035"].__setitem__("next_action_owner", CODEX)))
    rec("role_owner_drift", lambda c: c["b"]["metrics"]["SW-034"]["accountable_owners"].__setitem__("read_only_dated_pull_and_bridge_investigation", DUANE))
    # --- J1R1: SW-036/037 required gaps ---
    rec("sw036_delete_missing", lambda c: c["b"]["metrics"]["SW-036"].__setitem__("missing_or_quarantine_evidence", []))
    rec("sw036_drop_last_activity", lambda c: c["b"]["metrics"]["SW-036"].__setitem__("missing_or_quarantine_evidence", ["Requires a pipeline denominator and a 21-day window; join/formula undefined."]))
    rec("sw037_delete_missing", lambda c: c["b"]["metrics"]["SW-037"].__setitem__("missing_or_quarantine_evidence", []))
    rec("sw037_drop_intake_window", lambda c: c["b"]["metrics"]["SW-037"].__setitem__("missing_or_quarantine_evidence", ["Requires a pipeline denominator; join/formula undefined."]))
    # --- J1R1: SW-038/039/040 absence-inference ---
    rec("sw038_absence_as_proof_text", lambda c: c["b"]["metrics"]["SW-038"]["missing_or_quarantine_evidence"].append("Absence proves the metric is unavailable; nothing found means zero stage-skips."))
    rec("sw039_conclude_unavailable_on_empty", lambda c: c["b"]["metrics"]["SW-039"]["immediate_action"].__setitem__("action", "If the search returns nothing, conclude unavailable and record zero."))
    rec("sw040_missing_as_zero", lambda c: c["b"]["metrics"]["SW-040"]["required_future_contract"].append("Treat missing as zero backwards moves."))
    # --- J1R1: SW-042 contradictory capture text ---
    rec("sw042_retain_raw_rows_text", lambda c: c["b"]["metrics"]["SW-042"]["immediate_action"].__setitem__("action", "Run the discovery (one help pass, one UI pass, one controlled probe); field-minimized, aggregate-only, no PII/raw/content, no promotion; retain raw rows and message content for later use."))
    rec("sw042_export_pii_text", lambda c: c["b"]["metrics"]["SW-042"]["required_future_contract"].append("Export customer names and message content to a staging file."))
    rec("sw042_drop_exclusion_language", lambda c: (c["b"]["metrics"]["SW-042"]["immediate_action"].__setitem__("action", "Run the discovery (one help pass, one UI pass, one controlled probe); aggregate-only."), c["b"]["metrics"]["SW-042"].__setitem__("required_future_contract", ["Duane ratifies the anchor after proof."]), c["b"]["metrics"]["SW-042"].__setitem__("next_safe_source_action", "Discover the timestamp; no promotion.")))
    rec("sw042_partial_negation_raw_row", lambda c: c["b"]["metrics"]["SW-042"].__setitem__("required_future_contract", ["no PII; raw row; no message content"]))
    rec("sw042_partial_negation_message_content", lambda c: c["b"]["metrics"]["SW-042"].__setitem__("required_future_contract", ["no PII; no raw row; message content"]))
    rec_allow("nonallowlist_path_touch", set(ALLOWLIST) | {"src/server/brain-schema.ts"}, False)
    rec_allow("claude_staged", set(ALLOWLIST), True)
    return probes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--no-write", action="store_true")
    args = ap.parse_args()

    ctx = load_ctx()
    info = {}
    errs = run_structural(ctx)
    check_pinned_hashes(ctx, errs, live=True)
    check_allowlist_and_frozen(errs, info)
    probes = run_probes(ctx)
    failed = [p for p in probes if not p["pass"]]
    overall = (not errs) and (not failed)

    result = {
        "check": "honda_watchdog_phase1b_pkt_03_01_binding",
        "phase": "Phase 1B — PKT-03-01 J1 authority binding (Module 3; 4 accepted carry-forward + 8 held; design-only, additive)",
        "scope": "authority_binding_and_validation_gate_only (no calculate/acquire/admit/promote/grade/alert/customer output)",
        "baseline_commit": BASELINE_COMMIT,
        "binding_file": "docs/halo/contract/phase1b/pkt-03-01-binding.json",
        "binding_sha256": sha_file(BINDING_PATH),
        "target_ids": IDS,
        "accepted_measured_ids": ACC,
        "held_ids": HELD,
        "customer_emission_authority": False,
        "lifecycle_partition_sizes": {k: len(v) for k, v in ctx["b"]["lifecycle_partition"].items()},
        "pinned_source_hashes": ctx["b"].get("pinned_source_hashes", {}),
        "two_delta": ctx["b"].get("two_delta", {}),
        "allowlist_files": ALLOWLIST,
        "touched_vs_baseline": info.get("touched_vs_baseline"),
        "adversarial_probes_total": len(probes),
        "adversarial_probes_failed": len(failed),
        "adversarial_probes": probes,
        "errors": errs,
        "overall_pass": overall,
        "note": "Four accepted metrics are carry-forward (pinned gate5b/gate2/baseline; not recalculated/regraded); eight held are source_investigation_pending. No customer output; missing is not zero; zero Service/Parts; quarantined families unusable.",
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
