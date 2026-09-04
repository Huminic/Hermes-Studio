#!/usr/bin/env python3
"""
PKT-02-03 binding validator (focused + adversarial). Design-only, additive.

Validates docs/halo/contract/phase1b/pkt-02-03-binding.json against:
  - the immutable feasibility matrix (exact canonical_condition equality for all 11 IDs),
  - the packet-index PKT-02-03 assignment (exact ordered 11 IDs; no gaps/dupes; 295/11/30 accounting unchanged),
  - the frozen closed vocabularies (disposition / source_existence / evaluation / acquisition / boundary / kind),
  - the accepted-meaning authorities (gate2 + baseline-registry): NONE of the 11 may be measured/gradable,
  - the admission/quarantine truth (Service/Parts zero-admission; legacy comm + CAGE quarantine; enhanced weekly
    pre-admission proves capability only; no source substitution; Leads only a future SW-262 join leg),
  - the protected-content rule (SPEC §5.5): message content not read; no keyword proxy; content-derived IDs held,
  - the six source-family slice partition (exact),
  - customer boundary (all hidden; zero accepted_measured ⇒ no customer projection; no alert eligibility),
  - the frozen PKT-02-01 AND PKT-02-02 artifacts (sha256 unchanged — this step does not touch them).

Reuses the Phase 1A generic engine (validate_phase1_contracts) for frozen vocabularies + sha256 only,
WITHOUT modifying any Phase 0/1/1A/1B artifact. Pinned to baseline commit 4fb0b664.
Exit 0 == PASS, 1 == FAIL.
Usage: python3 scripts/halo-phase1b/validate_pkt_02_03_binding.py [--out X] [--no-write]
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
BINDING_PATH = os.path.join(CB, "pkt-02-03-binding.json")
DEFAULT_OUT = os.path.join(REPO, "docs", "halo", "evidence", "honda-watchdog", "phase1b", "pkt-02-03", "PKT-02-03_BINDING_CHECKS.json")

BASELINE_COMMIT = "4fb0b664d42780632f32aa40a52f9f6b36162323"
TARGET_IDS = ["SW-135", "SW-136", "SW-137", "SW-138", "SW-139", "SW-140", "SW-141",
              "SW-261", "SW-262", "SW-288", "SW-295"]
SLICES_EXPECTED = {
    "slice_content_semantic": ["SW-135", "SW-136", "SW-139", "SW-141"],
    "slice_structural_sequence": ["SW-137", "SW-138"],
    "slice_voicemail_inbound": ["SW-140"],
    "slice_history_model": ["SW-261", "SW-295"],
    "slice_multi_source_join": ["SW-262"],
    "slice_composite_cadence": ["SW-288"],
}
CONTENT_IDS = {"SW-135", "SW-136", "SW-139", "SW-141"}
ENHANCED_IDS = {"SW-135", "SW-136", "SW-137", "SW-138", "SW-139", "SW-141"}
MULTIWEEK_IDS = {"SW-261", "SW-262", "SW-288", "SW-295"}
ACCOUNTABLE_OWNERS = {"Duane Wells", "Codex VinSolutions controller", "Claude Studio engineering"}
GENERIC_OWNER_FORBIDDEN = "Huminic Semantic Watchdog pipeline"
DUANE = "Duane Wells"
# Duane Wells may own ONLY business authority/definition/ratification/threshold/formula/model-policy decisions.
# Forbidden technical stems cover acquisition, investigation, accumulation, admission, normalization, promotion,
# calculation, and implementation (with variants) — applied to BOTH role names and action text.
DUANE_FORBIDDEN_STEMS = ("acquir", "acquisit", "investigat", "accumulat", "admit", "admiss",
                         "normaliz", "promot", "calculat", "implement")
DUANE_FORBIDDEN_ROLE_TOKENS = DUANE_FORBIDDEN_STEMS
DUANE_FORBIDDEN_ACTION_STEMS = DUANE_FORBIDDEN_STEMS
HISTORY_EXPECTED = {
    "SW-135": "event_follow_forward_to_stated_deadline_boundary_required",
    "SW-136": "min_72h_follow_forward_after_hot_signal_event",
    "SW-137": "single_week_sufficient_once_ordering_definition_and_admission_resolved",
    "SW-138": "single_week_sufficient_once_definition_and_admission_resolved",
    "SW-139": "event_follow_forward_to_stated_callback_boundary_required",
    "SW-140": "not_history_blocked_absent_inbound_voicemail_event_source",
    "SW-141": "min_2d_follow_forward_after_high_intent_event_weekend_evening_ratified",
    "SW-261": "multi_week_required",
    "SW-262": "multi_week_required",
    "SW-288": "multi_week_required",
    "SW-295": "multi_week_required",
}
BLANKET_HISTORY_FORBIDDEN = "single_week_observed_insufficient_for_value"
STABLE_KEY_NAMES = ("Communication ID", "Lead ID", "Global Customer ID")
ENHANCED_ACQUIRED = ("acquired_local", "admitted_held", "data_acquired_calculation_pending")

PKT_02_01_BINDING_SHA = "1c1c98a2e7b3be8d10eea9495861b7a33e65a00020ab7c9e756da363b69f2082"
PKT_02_01_PACKET_SHA = "89de72da33a5459d1aedd69cbc92a1fc347f3d589d8cbfd1ecf13bad1890d97d"
PKT_02_02_BINDING_SHA = "7307e6039363fa421c217ff9c1beb1ca606dfcbcfbe083c503a65d5371c16f44"
PKT_02_02_PACKET_SHA = "c18a2bc9a8d73e363a9696071adf4b2f8896397eaddef47ef2b631609fe4ab80"
CATALOG_SHA = "29c7ac06130f9b4fe8d5df0a2d0d6fffed7c6ff4dc02eca96e0f44d109a04fc1"

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
    if keys != TARGET_IDS:
        errs.append(f"metrics keys != exact ordered 11 target ids (got {keys})")
    if len(keys) != len(set(keys)):
        errs.append("metrics keys contain duplicates")
    if len(keys) != 11:
        errs.append(f"metrics count {len(keys)} != 11")
    pkt = [p for p in IDX["packets"] if p["packet_id"] == "PKT-02-03"]
    if not pkt or pkt[0]["target_ids"] != TARGET_IDS:
        errs.append("packet-index PKT-02-03 target_ids != the exact ordered 11 (order/gap/dup)")
    elif sorted(keys) != sorted(pkt[0]["target_ids"]):
        errs.append("binding metric ids != packet-index PKT-02-03 assignment")
    # module ownership: PKT-02-03 owns exactly these 11 and no other packet claims them
    owned = {t: p["packet_id"] for p in IDX["packets"] for t in p["target_ids"]}
    for t in TARGET_IDS:
        if owned.get(t) != "PKT-02-03":
            errs.append(f"{t}: owned by {owned.get(t)} not PKT-02-03 (module ownership drift)")


def check_conditions(b, errs):
    for mid, rec in b.get("metrics", {}).items():
        if mid not in MATRIX:
            errs.append(f"{mid}: not in matrix"); continue
        if rec.get("canonical_condition") != MATRIX[mid]["condition"]:
            errs.append(f"{mid}: canonical_condition != matrix condition (exact byte)")


def check_slices(b, errs):
    sl = b.get("source_family_slices", {})
    if set(sl.keys()) != set(SLICES_EXPECTED.keys()):
        errs.append(f"source_family_slices keys != expected 6 slices (got {sorted(sl.keys())})")
    flat = [i for v in sl.values() for i in (v or [])]
    if len(flat) != len(set(flat)):
        errs.append("source_family_slices overlap (an id in >1 slice)")
    if set(flat) != set(TARGET_IDS):
        errs.append("source_family_slices union != 11 target ids")
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
        errs.append("lifecycle_partition union != 11 target ids")
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
    """CORE gate: no ID measured/gradable/alertable; no synthetic value; no accepted target exists."""
    for mid, rec in b.get("metrics", {}).items():
        if rec.get("gradable") is not False:
            errs.append(f"{mid}: gradable must be False (no accepted target)")
        if rec.get("alert_eligible") is not False:
            errs.append(f"{mid}: alert_eligible must be False (nothing measured/graded)")
        if rec.get("disposition") == "measured_validated":
            errs.append(f"{mid}: disposition measured_validated forbidden (no promoted source + no accepted target)")
        if rec.get("evaluation_state") in ("measured_graded", "measured_unscored"):
            errs.append(f"{mid}: evaluation_state '{rec.get('evaluation_state')}' forbidden (no measured/provisional value in this binding)")
        if str(rec.get("grade_approval")) == "approved":
            errs.append(f"{mid}: grade_approval 'approved' forbidden (no accepted target exists)")
        for f in NULL_VALUE_FIELDS:
            if rec.get(f) is not None:
                errs.append(f"{mid}: {f} must be null (no authority resolves it — no synthetic value)")
        if rec.get("measured_unscored_observation") is not None:
            errs.append(f"{mid}: measured_unscored_observation must be null (no ID carries a provisional value)")
        if mid in GATE2:
            errs.append(f"{mid}: appears in gate2 evaluable_conditions — a target would be required; recheck")
        if mid in BASELINE_METRICS:
            errs.append(f"{mid}: appears in baseline-registry operational_targets — a target would be required; recheck")


def check_customer_boundary(b, errs):
    for mid, rec in b.get("metrics", {}).items():
        if rec.get("customer_visibility") != "hidden":
            errs.append(f"{mid}: customer_visibility must be 'hidden'")
        if rec.get("customer_projection") is not None:
            errs.append(f"{mid}: customer_projection must be null (no customer narrative/finding)")
    cp = b.get("customer_projection", {})
    if cp.get("accepted_measured_ids"):
        errs.append("top-level customer_projection.accepted_measured_ids must be EMPTY")
    if cp.get("customer_visible_ids"):
        errs.append("top-level customer_projection.customer_visible_ids must be EMPTY")
    if cp.get("customer_report_emitted") is not False:
        errs.append("customer_report_emitted must be False (zero accepted_measured)")


def check_protected_content(b, errs):
    """SPEC §5.5: message content not read; content-derived IDs held; no keyword proxy anywhere."""
    for mid, rec in b.get("metrics", {}).items():
        if rec.get("content_bytes_read") is not False:
            errs.append(f"{mid}: content_bytes_read must be False (message content not read in J1)")
        if mid in CONTENT_IDS and rec.get("disposition") not in ("crm_available_acquisition_pending", "data_acquired_calculation_pending"):
            errs.append(f"{mid}: content-derived ID must remain crm_available_acquisition_pending/data_acquired_calculation_pending until Duane's envelope (SPEC §5.5)")
    # no keyword-proxy leakage anywhere in the binding blob
    blob = json.dumps(b, ensure_ascii=False).lower()
    if "keyword proxy" in blob and "no keyword proxy" not in blob and "keyword proxies are prohibited" not in blob:
        errs.append("keyword-proxy language present without a prohibition context")
    # detection_rule must be null for every metric (no proxy rule authored)
    for mid, rec in b.get("metrics", {}).items():
        if rec.get("detection_rule") is not None:
            errs.append(f"{mid}: detection_rule must be null (no proxy/keyword rule authored)")


def check_measured_unscored(b, errs):
    for mid, rec in b.get("metrics", {}).items():
        obs = rec.get("measured_unscored_observation")
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
        if rec.get("boundary_class") != "sales" and ev not in ("not_measured", "measured_unscored"):
            errs.append(f"{mid}: non-sales boundary must be disposition-only (evaluation not_measured/measured_unscored)")


def check_source_truth(b, errs):
    """Quarantine, pre-admission, no-substitution, Leads-only-as-future-join-leg, Service/Parts zero."""
    spa = b.get("service_parts_zero_admission", {})
    if b.get("dealer_scope", {}).get("service_parts_admitted") != 0:
        errs.append("dealer_scope.service_parts_admitted must be 0")
    q = set(spa.get("quarantined_families") or [])
    if not {"cage_kpi", "sales_comm_log", "lead_source_roi"} <= q:
        errs.append("service_parts_zero_admission.quarantined_families must include cage_kpi, sales_comm_log, lead_source_roi")
    nse_q = set(NSE.get("summary", {}).get("quarantined_families") or [])
    if not q <= nse_q:
        errs.append(f"quarantined_families {sorted(q)} not all confirmed quarantined in native-scheduled-evidence {sorted(nse_q)}")
    for mid, rec in b.get("metrics", {}).items():
        fam = rec.get("source_family", "")
        # No metric may source a quarantined legacy family
        if fam in ("sales_comm_log", "cage_kpi", "lead_source_roi"):
            errs.append(f"{mid}: source_family '{fam}' is a quarantined legacy family (forbidden)")
        # SW-262 must remain the multi-source join, never a communication-only substitution
        if mid == "SW-262" and fam != "multi_source_join_leads_comm_appointments_sales_cage_roi":
            errs.append(f"SW-262: source_family '{fam}' is a substitution — must remain the multi-source join")
        # No comm/enhanced-family metric may be admitted_promoted (pre-admission proves capability only)
        if rec.get("acquisition_admission_state") == "admitted_promoted":
            errs.append(f"{mid}: acquisition_admission_state admitted_promoted forbidden (enhanced weekly is pre-admission; promotes nothing)")


def check_stable_keys(b, errs):
    """Correction 1: enhanced rows must NOT falsely claim the file lacks the stable keys; must state the truth."""
    for mid in ENHANCED_IDS:
        rec = b.get("metrics", {}).get(mid, {})
        strings = (rec.get("missing_or_quarantine_evidence") or []) + (rec.get("required_direct_fields_or_keys") or [])
        joined = " ".join(strings)
        low = joined.lower()
        for key in STABLE_KEY_NAMES:
            # forbid "lacks/lack ... <key>" style false-absence claims
            if ("lack" in low or "does not contain" in low or "missing " + key.lower() in low) and key.lower() in low:
                # allow the truthful "excluded from the permitted derivative" phrasing (not a lack claim)
                if "excluded from the permitted" not in low and "unadmitted" not in low:
                    errs.append(f"{mid}: false missing-stable-key claim for enhanced source ({key})")
        if "unadmitted" not in low and "restricted" not in low:
            errs.append(f"{mid}: enhanced row must state stable keys exist in restricted/unadmitted raw (truthful key state)")


def check_source_lifecycle_enhanced(b, errs):
    """Correction 2: already-acquired enhanced raw must be acquired_local + admitted_held + data_acquired_calculation_pending."""
    for mid in ENHANCED_IDS:
        rec = b.get("metrics", {}).get(mid, {})
        ses, acq, disp = rec.get("source_existence_state"), rec.get("acquisition_admission_state"), rec.get("disposition")
        if (ses, acq, disp) != ENHANCED_ACQUIRED:
            errs.append(f"{mid}: enhanced-family lifecycle must be acquired_local/admitted_held/data_acquired_calculation_pending (got {ses}/{acq}/{disp})")
        if acq in ("not_acquired", "acquisition_pending"):
            errs.append(f"{mid}: acquisition_admission_state '{acq}' contradicts already-acquired enhanced raw")


def check_history(b, errs):
    """Correction 3: accurate per-ID history/maturity; no blanket single-week; multi-week only where catalog requires."""
    for mid, rec in b.get("metrics", {}).items():
        want = HISTORY_EXPECTED.get(mid)
        if rec.get("history_requirement") != want:
            errs.append(f"{mid}: history_requirement '{rec.get('history_requirement')}' != expected '{want}'")
        if mid in {"SW-135", "SW-136", "SW-137", "SW-138", "SW-139", "SW-140", "SW-141"} and rec.get("history_requirement") == BLANKET_HISTORY_FORBIDDEN:
            errs.append(f"{mid}: blanket '{BLANKET_HISTORY_FORBIDDEN}' forbidden for SW-135..141")
        if rec.get("history_requirement") == "multi_week_required" and mid not in MULTIWEEK_IDS:
            errs.append(f"{mid}: multi_week_required only allowed for {sorted(MULTIWEEK_IDS)}")
        if mid in MULTIWEEK_IDS and rec.get("history_requirement") != "multi_week_required":
            errs.append(f"{mid}: catalog-logic ID must be multi_week_required")


def check_owners(b, errs):
    """Correction 4: explicit accountable owners; no generic pipeline owner; Duane never on technical-execution roles."""
    roster = b.get("accountable_owner_roster", {})
    if set(roster.keys()) != ACCOUNTABLE_OWNERS:
        errs.append("accountable_owner_roster keys != the 3 accountable owners")
    for mid, rec in b.get("metrics", {}).items():
        owners = rec.get("accountable_owners")
        if not isinstance(owners, dict) or not owners:
            errs.append(f"{mid}: accountable_owners must be a non-empty role->owner map"); continue
        for role, who in owners.items():
            if who not in ACCOUNTABLE_OWNERS:
                errs.append(f"{mid}: owner '{who}' for role '{role}' not an accountable owner")
            if who == GENERIC_OWNER_FORBIDDEN:
                errs.append(f"{mid}: generic pipeline owner forbidden as accountable owner")
            if who == DUANE and any(tok in role.lower() for tok in DUANE_FORBIDDEN_ROLE_TOKENS):
                errs.append(f"{mid}: Duane Wells assigned to technical-execution role '{role}' (forbidden)")
        nao = rec.get("next_action_owner")
        if nao not in ACCOUNTABLE_OWNERS:
            errs.append(f"{mid}: next_action_owner '{nao}' not an accountable owner")
    # no generic owner string anywhere as an owner value
    if rec_owner_leak(b):
        errs.append("generic pipeline owner string present as an owner value")


def rec_owner_leak(b):
    for mid, rec in b.get("metrics", {}).items():
        vals = list((rec.get("accountable_owners") or {}).values()) + [rec.get("next_action_owner")]
        if GENERIC_OWNER_FORBIDDEN in vals:
            return True
    return False


def _action_shape_error(a):
    """Exactly a structured object {owner, action}: no missing/extra keys, accountable owner, nonblank string action."""
    if not isinstance(a, dict):
        return "not a dict"
    if set(a.keys()) != {"owner", "action"}:
        return f"keys {sorted(a.keys())} != exactly {{owner, action}}"
    if a.get("owner") not in ACCOUNTABLE_OWNERS:
        return f"owner '{a.get('owner')}' not an accountable owner"
    if not isinstance(a.get("action"), str) or not a.get("action").strip():
        return "action must be a nonblank string"
    return None


def check_owner_handoff(b, errs):
    """J1R2/J1R3: ordered owner handoffs with exact structured shape; Duane never owns a technical action."""
    for mid, rec in b.get("metrics", {}).items():
        ia = rec.get("immediate_action")
        subs = rec.get("subsequent_actions")
        ia_err = _action_shape_error(ia)
        if ia_err:
            errs.append(f"{mid}: immediate_action invalid ({ia_err})")
        if not isinstance(subs, list) or not subs:
            errs.append(f"{mid}: subsequent_actions must be a non-empty list")
            subs = []
        for j, s in enumerate(subs):
            s_err = _action_shape_error(s)
            if s_err:
                errs.append(f"{mid}: subsequent_actions[{j}] invalid ({s_err})")
        # only shape-valid actions proceed to the semantic checks below
        valid = [a for a in ([ia] + list(subs)) if _action_shape_error(a) is None]
        if _action_shape_error(ia) is None and ia.get("owner") != rec.get("next_action_owner"):
            errs.append(f"{mid}: immediate_action.owner '{ia.get('owner')}' != next_action_owner '{rec.get('next_action_owner')}'")
        # No Duane-owned action (immediate or subsequent) may contain a technical verb stem.
        for act in valid:
            if act.get("owner") == DUANE and any(t in act.get("action", "").lower() for t in DUANE_FORBIDDEN_ACTION_STEMS):
                errs.append(f"{mid}: Duane Wells owns a technical action (forbidden): {act.get('action')[:70]}")
        # If Duane is the immediate owner but the summary still carries technical verbs, it MUST explicitly hand off to Codex/Claude.
        nsa = str(rec.get("next_safe_source_action", "")).lower()
        if rec.get("next_action_owner") == DUANE and any(t in nsa for t in DUANE_FORBIDDEN_ACTION_STEMS):
            if ("codex" not in nsa) and ("claude studio" not in nsa):
                errs.append(f"{mid}: Duane next_action_owner with technical verbs but no explicit Codex/Claude handoff in next_safe_source_action")


def check_completeness(b, errs):
    req_lists = ["required_direct_fields_or_keys", "missing_or_quarantine_evidence", "required_future_contract"]
    req_strs = ["business_question", "population", "period", "history_requirement",
                "next_safe_source_action", "next_action_owner", "authority", "cadence"]
    for mid, rec in b.get("metrics", {}).items():
        for k in req_lists:
            if not isinstance(rec.get(k), list) or not rec.get(k):
                errs.append(f"{mid}: {k} must be a non-empty list (blocker/next-action completeness)")
        for k in req_strs:
            if not isinstance(rec.get(k), str) or not rec.get(k).strip():
                errs.append(f"{mid}: {k} must be a non-empty string")
        if rec.get("missing_not_zero") is not True:
            errs.append(f"{mid}: missing_not_zero must be True")
        if rec.get("direct_source_fields") != []:
            errs.append(f"{mid}: direct_source_fields must be [] (no per-row committed derivative in J1)")


def check_accounting(b, errs):
    allids = [t for p in IDX["packets"] for t in p["target_ids"]]
    if sorted(allids) != SW295:
        errs.append("packet-index union != exact 295 (accounting drift)")
    if len(allids) != len(set(allids)):
        errs.append("packet-index has duplicate id assignment")
    mods = sorted({p["module"] for p in IDX["packets"]})
    if mods != list(range(1, 12)):
        errs.append(f"packet-index modules != 11 (1..11); got {mods}")
    if len(IDX["packets"]) != 30:
        errs.append(f"packet-index packet count {len(IDX['packets'])} != 30")
    acc = b.get("packet_accounting_assertion", {})
    if acc != {"conditions": 295, "modules": 11, "packets": 30}:
        errs.append("packet_accounting_assertion != {295,11,30}")


def check_frozen_untouched(b, errs):
    shas = {
        "pkt-02-01-binding.json": (os.path.join(CB, "pkt-02-01-binding.json"), PKT_02_01_BINDING_SHA),
        "packets/PKT-02-01.json": (os.path.join(CB, "packets", "PKT-02-01.json"), PKT_02_01_PACKET_SHA),
        "pkt-02-02-binding.json": (os.path.join(CB, "pkt-02-02-binding.json"), PKT_02_02_BINDING_SHA),
        "packets/PKT-02-02.json": (os.path.join(CB, "packets", "PKT-02-02.json"), PKT_02_02_PACKET_SHA),
    }
    for name, (path, want) in shas.items():
        got = p1.sha256_file(path)
        if got != want:
            errs.append(f"{name} sha changed ({got}) — frozen artifact modified")
    pins = b.get("pins", {})
    for key, want in (("pkt_02_01_binding_sha256", PKT_02_01_BINDING_SHA),
                      ("pkt_02_01_packet_sha256", PKT_02_01_PACKET_SHA),
                      ("pkt_02_02_binding_sha256", PKT_02_02_BINDING_SHA),
                      ("pkt_02_02_packet_sha256", PKT_02_02_PACKET_SHA),
                      ("catalog_sha256", CATALOG_SHA),
                      ("baseline_commit", BASELINE_COMMIT)):
        if pins.get(key) != want:
            errs.append(f"binding pins.{key} != pinned value")
    if p1.sha256_file(os.path.join(C, "semantic-watchdog-feasibility-matrix-295.json")) != CATALOG_SHA:
        errs.append("feasibility matrix sha != pinned catalog sha (catalog drift)")


def run_all(b):
    errs = []
    check_ids(b, errs)
    check_conditions(b, errs)
    check_slices(b, errs)
    check_lifecycle(b, errs)
    check_no_promotion_no_synthetic(b, errs)
    check_customer_boundary(b, errs)
    check_protected_content(b, errs)
    check_measured_unscored(b, errs)
    check_vocab(b, errs)
    check_source_truth(b, errs)
    check_stable_keys(b, errs)
    check_source_lifecycle_enhanced(b, errs)
    check_history(b, errs)
    check_owners(b, errs)
    check_owner_handoff(b, errs)
    check_completeness(b, errs)
    check_accounting(b, errs)
    check_frozen_untouched(b, errs)
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

    rec("A_condition_tamper", lambda m: m["metrics"]["SW-135"].__setitem__("canonical_condition", "Rep replied on time (tampered)."))
    rec("B_inject_formula", lambda m: m["metrics"]["SW-138"].__setitem__("formula", "count(bursts N>=3 within T=10m no inbound)"))
    rec("C_inject_grade_target", lambda m: m["metrics"]["SW-141"].update({"grade_target_id": "GT-SW-141", "grade_approval": "approved", "grade_value_or_range": "> 0 (breach)"}))
    rec("D_mark_measured_validated", lambda m: m["metrics"]["SW-135"].update({"disposition": "measured_validated", "source_existence_state": "acquired_local", "acquisition_admission_state": "admitted_promoted", "evaluation_state": "measured_graded", "gradable": True}))
    rec("E_move_to_accepted_measured", lambda m: (m["lifecycle_partition"]["accepted_measured_ids"].append("SW-135"),
                                                  m["lifecycle_partition"]["calculation_pending_ids"].remove("SW-135"),
                                                  m["metrics"]["SW-135"].__setitem__("lifecycle_bucket", "accepted_measured_ids")))
    rec("F_slice_misassignment", lambda m: (m["source_family_slices"]["slice_content_semantic"].append("SW-137"),
                                            m["source_family_slices"]["slice_structural_sequence"].remove("SW-137")))
    rec("G_promote_enhanced_pre_admission", lambda m: m["metrics"]["SW-136"].update({"disposition": "data_acquired_calculation_pending", "source_existence_state": "acquired_local", "acquisition_admission_state": "admitted_promoted", "evaluation_state": "measured_graded", "gradable": True}))
    rec("H_gradable_true_no_target", lambda m: m["metrics"]["SW-261"].__setitem__("gradable", True))
    rec("I_alert_eligible_true", lambda m: m["metrics"]["SW-140"].__setitem__("alert_eligible", True))
    rec("J_customer_visible", lambda m: m["metrics"]["SW-288"].__setitem__("customer_visibility", "visible"))
    rec("K_customer_projection_value", lambda m: m["metrics"]["SW-295"].__setitem__("customer_projection", {"headline": "best channel is text"}))
    rec("L_customer_report_emitted", lambda m: m["customer_projection"].__setitem__("customer_report_emitted", True))
    rec("M_content_bytes_read", lambda m: m["metrics"]["SW-135"].__setitem__("content_bytes_read", True))
    rec("N_content_detection_rule_proxy", lambda m: m["metrics"]["SW-136"].__setitem__("detection_rule", "keyword proxy: contains 'finance'"))
    rec("O_drop_one_id", lambda m: m["metrics"].pop("SW-262"))
    rec("P_reorder_ids", lambda m: m.__setitem__("metrics", {k: m["metrics"][k] for k in reversed(list(m["metrics"].keys()))}))
    rec("Q_duplicate_slice_member", lambda m: m["source_family_slices"]["slice_history_model"].append("SW-135"))
    rec("R_vocab_violation", lambda m: m["metrics"]["SW-137"].__setitem__("disposition", "totally_made_up_state"))
    rec("S_ses_disposition_inconsistent", lambda m: m["metrics"]["SW-140"].__setitem__("source_existence_state", "acquired_local"))
    rec("T_sw262_comm_only_substitution", lambda m: m["metrics"]["SW-262"].__setitem__("source_family", "enhanced_sales_communication_log_weekly"))
    rec("U_quarantined_family_source", lambda m: m["metrics"]["SW-140"].__setitem__("source_family", "sales_comm_log"))
    rec("V_accounting_break", lambda m: m["packet_accounting_assertion"].__setitem__("packets", 31))
    rec("W_pkt0202_pin_drift", lambda m: m["pins"].__setitem__("pkt_02_02_binding_sha256", "0" * 64))
    rec("X_baseline_commit_drift", lambda m: m["pins"].__setitem__("baseline_commit", "deadbeef"))
    rec("Y_rejected_bucket_nonempty", lambda m: (m["lifecycle_partition"]["rejected_ids"].append("SW-288"),
                                                 m["lifecycle_partition"]["source_investigation_pending_ids"].remove("SW-288"),
                                                 m["metrics"]["SW-288"].__setitem__("lifecycle_bucket", "rejected_ids")))
    rec("Z_empty_blocker", lambda m: m["metrics"]["SW-137"].__setitem__("missing_or_quarantine_evidence", []))
    # --- J1R1 recurrence-prevention probes (shadow corrections 1-4) ---
    rec("AA_false_missing_stable_key", lambda m: m["metrics"]["SW-135"].__setitem__(
        "missing_or_quarantine_evidence", ["Current file lacks stable Communication ID, Lead ID, and Global Customer ID."]))
    rec("AB_enhanced_not_acquired", lambda m: m["metrics"]["SW-136"].update(
        {"source_existence_state": "investigation_pending", "acquisition_admission_state": "not_acquired", "disposition": "source_investigation_pending", "lifecycle_bucket": "source_investigation_pending_ids"}))
    rec("AC_enhanced_acquisition_pending", lambda m: m["metrics"]["SW-138"].__setitem__("acquisition_admission_state", "acquisition_pending"))
    rec("AD_blanket_single_week", lambda m: m["metrics"]["SW-135"].__setitem__("history_requirement", "single_week_observed_insufficient_for_value"))
    rec("AE_wrong_multiweek_structural", lambda m: m["metrics"]["SW-137"].__setitem__("history_requirement", "multi_week_required"))
    rec("AF_generic_owner", lambda m: m["metrics"]["SW-135"]["accountable_owners"].__setitem__("protected_content_authorization_and_definition", "Huminic Semantic Watchdog pipeline"))
    rec("AG_duane_technical_role", lambda m: m["metrics"]["SW-140"]["accountable_owners"].__setitem__("read_only_ui_schema_or_external_source_investigation", "Duane Wells"))
    rec("AH_next_owner_generic", lambda m: m["metrics"]["SW-262"].__setitem__("next_action_owner", "Huminic Semantic Watchdog pipeline"))
    # --- J1R2 ownership-handoff probes ---
    rec("BA_duane_owns_tech_immediate", lambda m: m["metrics"]["SW-261"].__setitem__("immediate_action", {"owner": "Duane Wells", "action": "Accumulate multi-week history and admit a stable pseudonymous key."}))
    rec("BB_duane_owns_tech_subsequent", lambda m: m["metrics"]["SW-288"]["subsequent_actions"].__setitem__(0, {"owner": "Duane Wells", "action": "Acquire component evidence and implement the composite."}))
    rec("BC_duane_nsa_tech_no_handoff", lambda m: m["metrics"]["SW-295"].__setitem__("next_safe_source_action", "Accumulate multi-week history and implement the model; no promotion."))
    rec("BD_immediate_owner_mismatch", lambda m: m["metrics"]["SW-135"]["immediate_action"].__setitem__("owner", "Codex VinSolutions controller"))
    # --- J1R3 exact-shape + extended Duane-role probes ---
    rec("BE_subsequent_not_dict", lambda m: m["metrics"]["SW-262"].__setitem__("subsequent_actions", ["freeze then acquire"]))
    rec("BF_subsequent_blank_action", lambda m: m["metrics"]["SW-262"]["subsequent_actions"][0].__setitem__("action", "   "))
    rec("BG_subsequent_extra_key", lambda m: m["metrics"]["SW-262"]["subsequent_actions"][0].__setitem__("owner_note", "extra"))
    rec("BH_immediate_missing_key", lambda m: m["metrics"]["SW-138"].__setitem__("immediate_action", {"owner": "Duane Wells"}))
    rec("BI_immediate_extra_key", lambda m: m["metrics"]["SW-138"]["immediate_action"].__setitem__("priority", "high"))
    rec("BJ_subsequent_unaccountable_owner", lambda m: m["metrics"]["SW-261"]["subsequent_actions"][0].__setitem__("owner", "Some Vendor Inc"))
    rec("BK_duane_accumulation_role", lambda m: m["metrics"]["SW-261"]["accountable_owners"].__setitem__("history_accumulation", "Duane Wells"))
    rec("BL_duane_admission_role", lambda m: m["metrics"]["SW-138"]["accountable_owners"].__setitem__("consumer_admission", "Duane Wells"))
    rec("BM_duane_normalization_role", lambda m: m["metrics"]["SW-137"]["accountable_owners"].__setitem__("ordering_normalization", "Duane Wells"))
    rec("BN_duane_promotion_role", lambda m: m["metrics"]["SW-136"]["accountable_owners"].__setitem__("value_promotion", "Duane Wells"))
    rec("BO_duane_calculation_role", lambda m: m["metrics"]["SW-141"]["accountable_owners"].__setitem__("metric_calculation", "Duane Wells"))
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
        "check": "honda_watchdog_phase1b_pkt_02_03_binding",
        "phase": "Phase 1B — PKT-02-03 authority binding + validation gate (design-only, additive, freeze-candidate)",
        "scope": "authority_binding_and_validation_gate_only (no calculate/acquire/admit/normalize/promote/grade/alert/report)",
        "baseline_commit": BASELINE_COMMIT,
        "reuses": "scripts/halo-phase1/validate_phase1_contracts.py (frozen vocabularies + sha256 only; unmodified)",
        "binding_file": "docs/halo/contract/phase1b/pkt-02-03-binding.json",
        "binding_sha256": p1.sha256_file(BINDING_PATH),
        "target_ids": TARGET_IDS,
        "id_count": len(b.get("metrics", {})),
        "source_family_slices": {k: v for k, v in SLICES_EXPECTED.items()},
        "lifecycle_partition": b.get("lifecycle_partition", {}),
        "authority_absence_proof": {
            "gate2_evaluable_overlap": sorted(set(TARGET_IDS) & set(GATE2.keys())),
            "baseline_operational_target_overlap": sorted(set(TARGET_IDS) & BASELINE_METRICS),
            "meaning": "empty overlaps ⇒ none of the 11 has an accepted meaning or an approved target ⇒ none is measured/gradable/alertable",
        },
        "content_boundary": {
            "content_derived_ids": sorted(CONTENT_IDS),
            "content_bytes_read": False,
            "protected_content_envelope_required": "SPEC §5.5 (Duane authorization pending)",
        },
        "service_parts_zero_admission": b.get("service_parts_zero_admission", {}),
        "customer_projection": b.get("customer_projection", {}),
        "packet_accounting": {"conditions": 295, "modules": 11, "packets": 30},
        "frozen_prior_artifacts": {
            "pkt_02_01_binding_sha256": p1.sha256_file(os.path.join(CB, "pkt-02-01-binding.json")),
            "pkt_02_01_packet_sha256": p1.sha256_file(os.path.join(CB, "packets", "PKT-02-01.json")),
            "pkt_02_02_binding_sha256": p1.sha256_file(os.path.join(CB, "pkt-02-02-binding.json")),
            "pkt_02_02_packet_sha256": p1.sha256_file(os.path.join(CB, "packets", "PKT-02-02.json")),
            "unchanged": True,
        },
        "adversarial_probes_total": len(probes),
        "adversarial_probes_failed": len(failed),
        "adversarial_probes": probes,
        "errors": errs,
        "overall_pass": overall,
        "note": "Binding-only: NO metric value, grade, alert, or customer projection is authored. No Vin/Gmail/browser/runtime/DB/schedule action. No ledger/index update in J1.",
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
