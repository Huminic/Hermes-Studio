#!/usr/bin/env python3
"""
PKT-03-01 SW-038/039/040 finite-discovery memorialization validator (design/evidence only, CREATE-only allowlist).

Validates the SW-038/039/040 stage-history finite read-only discovery record; preserves every frozen/committed artifact
byte-for-byte; classifies each older frozen validator's live with-files result as expected_stage_scope_only (never PASS).

Exit 0 == PASS. Usage: python3 scripts/halo-phase1b/validate_pkt_03_01_sw038_040_discovery.py [--out X] [--no-write]
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
CB = os.path.join(REPO, "docs", "halo", "contract", "phase1b")
EV = os.path.join(REPO, "docs", "halo", "evidence", "honda-watchdog", "phase1b", "pkt-03-01")
RECORD_PATH = os.path.join(EV, "PKT-03-01_SW-038-040_DISCOVERY_RESULT.json")
DEFAULT_OUT = os.path.join(EV, "PKT-03-01_SW-038-040_DISCOVERY_CHECKS.json")

BASELINE_COMMIT = "0b38168fe5fa448253d4898f9ac220ac9aec09ef"
IDS = ["SW-038", "SW-039", "SW-040"]
PINS = {
    "pkt_03_01_binding_sha256": ("docs/halo/contract/phase1b/pkt-03-01-binding.json", "e92a181f2a8016085011358ff256f627b2c11f09e4f37109f4276ecbfce10f8e"),
    "master_ledger_295_sha256": ("docs/halo/contract/phase1b/master-ledger-295.json", "747b6d31796939ae29f3a31a0f57226e57342ad7c2b1a1737e05287a5af59d13"),
    "pkt_03_01_packet_sha256": ("docs/halo/contract/phase1b/packets/PKT-03-01.json", "a35319fe19061dfe0cf09a5557f9212ff2c7c396cfa5243388cc038675283cae"),
    "sw042_evidence_gap_sha256": ("docs/halo/contract/phase1b/MODULE3_APPT_CONFIRMATION_SW-042_EVIDENCE_GAP.json", "1714aad7b8cd4eaf44e4f3a62ba652b0f61886e61f042b274377deee0e1fab7b"),
    "sw042_discovery_result_sha256": ("docs/halo/evidence/honda-watchdog/phase1b/pkt-03-01/PKT-03-01_SW-042_DISCOVERY_RESULT.json", "05987ed463930dcc3f0b2d2d34fed2203cac5c6ccb4e475ea801715d1ea65551"),
    "sw042_discovery_checks_sha256": ("docs/halo/evidence/honda-watchdog/phase1b/pkt-03-01/PKT-03-01_SW-042_DISCOVERY_CHECKS.json", "0f5494129396d1037d18e5e42af52719886a67803d05b4251255341a0413eaf3"),
    "sw042_discovery_validator_sha256": ("scripts/halo-phase1b/validate_pkt_03_01_sw042_discovery.py", "729d0736b80240ecd088306a973410c1096087a2b898dd0ca249409fa26653c5"),
}
ALLOWLIST = sorted([
    "docs/halo/evidence/honda-watchdog/phase1b/pkt-03-01/PKT-03-01_SW-038-040_DISCOVERY_RESULT.json",
    "scripts/halo-phase1b/validate_pkt_03_01_sw038_040_discovery.py",
    "docs/halo/evidence/honda-watchdog/phase1b/pkt-03-01/PKT-03-01_SW-038-040_DISCOVERY_CHECKS.json",
])
RECEIPT_REL = "docs/halo/evidence/honda-watchdog/phase1b/pkt-03-01/PKT-03-01_SW-038-040_DISCOVERY_CHECKS.json"
EXPECTED_LIFECYCLE = {
    "disposition": "source_investigation_pending", "source_existence_state": "investigation_pending",
    "acquisition_admission_state": "not_acquired", "evaluation_state": "not_measured", "authoritative": False,
    "gradable": False, "alert_eligible": False, "customer_visibility": "hidden", "future_display_eligibility": False,
    "customer_emission_authority": False, "report_acceptance_state": "withheld_no_delivery",
}
REQ_BASE = ["bulk old-status export", "bulk new-status export", "transition timestamp", "stable lead/customer key"]
# Ownership must mirror the frozen pkt-03-01-binding.json SW-038/039/040 accountable_owners exactly.
DUANE = "Duane Wells"
CODEX = "Codex VinSolutions controller"
STUDIO = "Claude Studio engineering"
EXPECTED_OWNERS = {
    "status_audit_request_decision": DUANE,
    "positive_stage_history_export_investigation": CODEX,
    "stage_history_detection_implementation": STUDIO,
    "immediate_action_owner": CODEX,
    "next_action_owner": CODEX,
}
DUANE_TECHNICAL_ROLES = ("positive_stage_history_export_investigation", "stage_history_detection_implementation")
DUANE_ROLE_STEMS = ("acquir", "acquisit", "investigat", "accumulat", "admit", "admiss", "normaliz", "promot", "calculat", "implement")

# Older frozen validators — live WITH-FILES stage-scope signatures (expected_stage_scope_only; NEVER PASS).
J1_BIND_SHA = "e92a181f2a8016085011358ff256f627b2c11f09e4f37109f4276ecbfce10f8e"
PRIOR = {
    "j1": {"rel": "scripts/halo-phase1b/validate_pkt_03_01_binding.py", "count": 13, "probes": 54, "binding": J1_BIND_SHA,
           "sha": "d98c1b884fccf1cd9a76334fb192eabd8f6b1c867e19ed785e093df542af0060"},
    "j2": {"rel": "scripts/halo-phase1b/validate_pkt_03_01.py", "count": 6, "probes": 67, "binding": None,
           "sha": "98eaac2b9681bc5a05bc259bd4dea3aac522b1b0b63a417a10280d0689f2192f"},
    "sw042": {"rel": "scripts/halo-phase1b/validate_pkt_03_01_sw042_discovery.py", "count": 11, "probes": 58, "binding": None,
              "sha": "6273141682ffa2ed14a24133af38ccdbd01bd7b7f5197b091c4cd532e40ce809"},
}
_NEG = ("not ", "never", "no ", "without", "do not", "must not", "cannot", "is not", "are not", "don't", "exclude", "unverified", "only after")
_ASSERT = ("globally unavailable", "global unavailability", "lacks such a source globally", "terminal unavailable",
           "missing equals zero", "missing is zero", "treat missing as zero", "counts as zero",
           "proved clean", "verified clean", "verified sales-only", "cleanliness verified",
           "satisfies the frozen", "reconstructs old", "reconstructs the transition", "is the crm transition timestamp",
           "can backfill history", "backfills history")
_FORBID = ("sales_only_clean", "sales-only clean", "exportable", "schedulable")


def sha_file(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def canon(a):
    return hashlib.sha256(json.dumps(a, separators=(",", ":"), ensure_ascii=False).encode("utf-8")).hexdigest()


def blob_of(o):
    if isinstance(o, dict):
        return " ".join(blob_of(v) for v in o.values())
    if isinstance(o, list):
        return " ".join(blob_of(v) for v in o)
    return str(o)


def _asserts_unnegated(blob, patterns):
    hits = []
    for pat in patterns:
        j = 0
        while True:
            k = blob.find(pat, j)
            if k < 0:
                break
            if not any(n in blob[max(0, k - 34):k] for n in _NEG):
                hits.append(pat)
                break
            j = k + len(pat)
    return hits


def _keys_recursive(o):
    ks = set()
    if isinstance(o, dict):
        for k, v in o.items():
            ks.add(k)
            ks |= _keys_recursive(v)
    elif isinstance(o, list):
        for v in o:
            ks |= _keys_recursive(v)
    return ks


def run_structural(rec):
    errs = []
    blob = blob_of(rec).lower()
    if rec.get("baseline_commit") != BASELINE_COMMIT:
        errs.append("baseline_commit != 0b38168fe")
    if rec.get("metric_ids") != IDS or rec.get("packet_id") != "PKT-03-01":
        errs.append("metric_ids/packet_id drift")
    # record pins == committed
    for name, (_rel, want) in PINS.items():
        if rec.get("pins", {}).get(name) != want:
            errs.append(f"record pins.{name} != committed sha")
    # per-metric
    m = rec.get("metrics", {})
    if set(m.keys()) != set(IDS):
        errs.append("metrics keys != exactly SW-038/039/040")
    for i in IDS:
        rm = m.get(i, {})
        if rm.get("metadata_change") != "none":
            errs.append(f"{i}: metadata_change must be 'none'")
        for state_key in ("state_before", "state_after"):
            st = rm.get(state_key, {})
            for k, v in EXPECTED_LIFECYCLE.items():
                if st.get(k) != v:
                    errs.append(f"{i}.{state_key}.{k} != {v} (held state must be preserved)")
        if rm.get("state_before") != rm.get("state_after"):
            errs.append(f"{i}: state_before != state_after")
        rf = rm.get("frozen_required_fields", [])
        for req in REQ_BASE:
            if req not in rf:
                errs.append(f"{i}: frozen_required_fields missing '{req}'")
    # SW-040 hard note requirement
    s40 = m.get("SW-040", {})
    if s40.get("note_requirement_hard") is not True:
        errs.append("SW-040: note_requirement_hard must be True (transition note is a hard additional requirement)")
    if not any("note" in x.lower() for x in s40.get("frozen_required_fields", [])):
        errs.append("SW-040: frozen_required_fields must include the transition note/annotation requirement")
    # two-delta split
    td = rec.get("two_delta", {})
    if td.get("contextual_discovery_evidence_delta") != 1:
        errs.append("contextual_discovery_evidence_delta must be 1")
    for k in ("governed_source_data_acquisition_delta", "governed_source_data_admission_delta", "metric_meaning_value_lifecycle_customer_delta"):
        if td.get(k) != 0:
            errs.append(f"two_delta.{k} must be 0")
    # help pass
    hp = rec.get("help_pass", {})
    if hp.get("article_number") != "000001225":
        errs.append("help_pass.article_number must be 000001225")
    for f in ("old status", "new status", "transition timestamp", "transition note"):
        if f not in [x.lower() for x in hp.get("does_not_list", [])]:
            errs.append(f"help_pass.does_not_list must include '{f}'")
    if hp.get("last_modified_is_status_specific") is not False:
        errs.append("help_pass.last_modified_is_status_specific must be False")
    # report center pass
    rc = rec.get("report_center_pass", {})
    if rc.get("finite_catalog_evidence_only") is not True or rc.get("supports_global_unavailability") is not False:
        errs.append("report_center_pass: finite_catalog_evidence_only True + supports_global_unavailability False required")
    if sorted(rc.get("finite_search_terms", [])) != sorted(["status", "history", "audit", "transition", "change"]):
        errs.append("report_center_pass.finite_search_terms drift")
    # custom reporting pass
    cr = rec.get("custom_reporting_pass", {})
    if cr.get("data_retrieval_paused_before_dataset_selection") is not True:
        errs.append("custom_reporting_pass: data retrieval must be paused before dataset selection")
    if cr.get("old_new_status_transition_timestamp_or_note_present") is not False:
        errs.append("custom_reporting_pass: old/new status/transition-timestamp/note must be absent")
    for k in ("rows_retrieved", "report_saved", "report_exported", "report_run", "report_scheduled", "filters_set", "columns_added"):
        if cr.get(k) is not False:
            errs.append(f"custom_reporting_pass.{k} must be False")
    # candidate snapshot
    cs = rec.get("candidate_snapshot_method", {})
    for k, want in (("satisfies_frozen_direct_stage_history", False), ("cannot_backfill_history", True),
                    ("is_crm_transition_timestamp", False), ("substitution_or_inference_forbidden", True),
                    ("requires_separately_authorized_sales_only_source", True), ("scheduled_now", False),
                    ("snapshot_change_time_only_brackets_event_between_captures", True)):
        if cs.get(k) is not want:
            errs.append(f"candidate_snapshot_method.{k} must be {want}")
    # privacy / scope split
    ps = rec.get("privacy_and_safety", {})
    for k in ("pii_captured", "raw_rows_captured", "message_content_captured", "source_bytes_captured", "source_files_captured", "report_run_save_export_download_schedule_filter_crm_mutation"):
        if ps.get(k) is not False:
            errs.append(f"privacy_and_safety.{k} must be False")
    for k in ("no_identified_service_parts_rows_or_fields_captured", "operation_scope_sales_only", "no_raw_url_query_or_token_stored", "missing_is_not_zero"):
        if ps.get(k) is not True:
            errs.append(f"privacy_and_safety.{k} must be True")
    if "sales_only" in ps:
        errs.append("privacy_and_safety.sales_only removed (use operation_scope_sales_only + candidate_source_sales_only_verified)")
    if ps.get("candidate_source_sales_only_verified") is not False:
        errs.append("privacy_and_safety.candidate_source_sales_only_verified must be False")
    if ps.get("service_parts_admitted") != 0 or ps.get("dealer_id") != "21043":
        errs.append("privacy_and_safety: Service/Parts admitted 0 + dealer 21043 required")
    # ownership must mirror the frozen binding exactly (no missing/renamed/combined role; correct owners; Duane never technical)
    ow = rec.get("owners", {})
    for role, who in EXPECTED_OWNERS.items():
        if role not in ow:
            errs.append(f"owners: required role '{role}' missing (renamed/combined/omitted)")
        elif ow.get(role) != who:
            errs.append(f"owners.{role} != '{who}' (frozen-binding role/owner mismatch)")
    extra_roles = sorted(set(ow.keys()) - set(EXPECTED_OWNERS.keys()) - {"note"})
    if extra_roles:
        errs.append(f"owners: unexpected/renamed role key(s): {extra_roles}")
    for role, who in ow.items():
        if role == "note":
            continue
        if who == DUANE and (role in DUANE_TECHNICAL_ROLES or any(t in role.lower() for t in DUANE_ROLE_STEMS)):
            errs.append(f"owners: Duane Wells assigned to technical role '{role}' (forbidden)")
    if ow.get("immediate_action_owner") != CODEX or ow.get("next_action_owner") != CODEX:
        errs.append("owners: immediate/next action owner must be Codex VinSolutions controller")
    # global unavailability
    if rec.get("global_unavailability", {}).get("claimed") is not False:
        errs.append("global_unavailability.claimed must be False")
    # forbidden keys + text
    allkeys = _keys_recursive(rec)
    if {"value", "numerator", "denominator", "grade", "target"} & {k for k in allkeys if k in ("numerator", "denominator")}:
        errs.append("forbidden numerator/denominator key present")
    clean_keys = sorted(k for k in allkeys if "clean" in k.lower())
    if clean_keys:
        errs.append(f"forbidden clean-claim key(s): {clean_keys}")
    hits = _asserts_unnegated(blob, _ASSERT)
    if hits:
        errs.append(f"assertive forbidden claim(s) present un-negated: {hits}")
    fb = [p for p in _FORBID if p in blob]
    if fb:
        errs.append(f"outright-forbidden claim(s) present: {fb}")
    return errs


def check_pins_live(errs):
    for name, (rel, want) in PINS.items():
        if sha_file(os.path.join(REPO, rel)) != want:
            errs.append(f"pinned {name}: live sha != committed (a frozen artifact changed)")
    b = json.load(open(os.path.join(CB, "pkt-03-01-binding.json"), encoding="utf-8"))["metrics"]
    rows = {r["metric_id"]: r for r in json.load(open(os.path.join(CB, "master-ledger-295.json"), encoding="utf-8"))["rows"]}
    for i in IDS:
        if b[i].get("disposition") != "source_investigation_pending" or rows[i].get("disposition") != "source_investigation_pending":
            errs.append(f"live {i} disposition != source_investigation_pending")
        if rows[i].get("evaluation_state") != "not_measured" or rows[i].get("acquisition_admission_state") != "not_acquired":
            errs.append(f"live {i} ledger drift (evaluation/acquisition)")


def allowlist_errors(touched, staged_claude):
    e = []
    extra = sorted(f for f in touched if f not in ALLOWLIST)
    if extra:
        e.append(f"files touched outside allowlist: {extra}")
    if staged_claude:
        e.append(".claude/ is staged (forbidden)")
    return e


def check_allowlist(errs, info):
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
    for f in changed:
        errs.append(f"tracked file mutated (must be zero): {f}")
    missing = [f for f in ALLOWLIST if f != RECEIPT_REL and not os.path.exists(os.path.join(REPO, f))]
    if missing:
        errs.append(f"allowlist files missing: {missing}")


def _run_validator(rel):
    out = subprocess.run([sys.executable, os.path.join(REPO, rel), "--no-write"], capture_output=True, text=True)
    return json.loads(out.stdout)


def prior_layer_errors(layer, r):
    """Exact-classify one older frozen validator's live result vs its pinned expected_stage_scope signature."""
    p = PRIOR[layer]
    e = []
    errs = r.get("errors", [])
    total = r.get("adversarial_probes_total")
    failed = r.get("adversarial_probes_failed")
    if total != p["probes"]:
        e.append(f"prior[{layer}]: probe total {total} != {p['probes']}")
    if failed != 0:
        e.append(f"prior[{layer}]: failed probe {failed} != 0")
    if p["binding"] is not None and r.get("binding_sha256") != p["binding"]:
        e.append(f"prior[{layer}]: binding sha drift")
    if len(errs) != p["count"]:
        e.append(f"prior[{layer}]: error count {len(errs)} != {p['count']}")
    if canon(errs) != p["sha"]:
        e.append(f"prior[{layer}]: canonical signature mismatch (swap/add/delete/omitted/extra/wrong path/semantic)")
    if r.get("overall_pass") is True:
        e.append(f"prior[{layer}]: older validator reported PASS (must be expected_stage_scope_only, never PASS)")
    return e


def check_prior_validators(errs, info):
    captured = {}
    for layer in ("j1", "j2", "sw042"):
        r = _run_validator(PRIOR[layer]["rel"])
        captured[layer] = r
        info.setdefault("prior_validators_post_discovery", {})[layer] = {
            "classification": "expected_stage_scope_only",
            "command": f"python3 {PRIOR[layer]['rel']} --no-write",
            "overall_pass": r.get("overall_pass"),
            "adversarial_probes": f"{(r.get('adversarial_probes_total') or 0) - (r.get('adversarial_probes_failed') or 0)}/{r.get('adversarial_probes_total')}",
            "binding_sha256": r.get("binding_sha256"),
            "expected_error_count": PRIOR[layer]["count"],
            "actual_error_count": len(r.get("errors", [])),
            "unexpected_error_count": max(0, len(r.get("errors", [])) - (PRIOR[layer]["count"] if isinstance(PRIOR[layer]["count"], int) else 0)),
            "raw_error_array": r.get("errors", []),
            "canonicalization": "compact UTF-8 JSON (separators (',',':'), ensure_ascii=False) of the ordered array",
            "error_signature_sha256": canon(r.get("errors", [])),
            "expected_error_signature_sha256": PRIOR[layer]["sha"],
        }
        errs.extend(prior_layer_errors(layer, r))
    return captured


def run_probes(rec, captured):
    probes = []

    def rec_p(name, mutate):
        c = copy.deepcopy(rec)
        try:
            mutate(c)
            e = run_structural(c)
        except Exception as ex:  # noqa: BLE001
            probes.append({"probe": name, "expected": "reject", "got": "CRASH", "pass": False, "err": f"{type(ex).__name__}: {ex}"})
            return
        probes.append({"probe": name, "expected": "reject", "got": "reject" if e else "accept", "pass": bool(e), "n": len(e), "sample": e[0] if e else None})

    def rec_allow(name, touched, claude):
        e = allowlist_errors(touched, claude)
        probes.append({"probe": name, "expected": "reject", "got": "reject" if e else "accept", "pass": bool(e), "n": len(e), "sample": e[0] if e else None})

    def rec_prior(name, layer, mutate_r):
        r = copy.deepcopy(captured[layer])
        mutate_r(r)
        e = prior_layer_errors(layer, r)
        probes.append({"probe": name, "expected": "reject", "got": "reject" if e else "accept", "pass": bool(e), "n": len(e), "sample": e[0] if e else None})

    # structural negatives
    rec_p("status_promotion", lambda c: c["metrics"]["SW-038"]["state_after"].__setitem__("disposition", "data_acquired_calculation_pending"))
    rec_p("measured", lambda c: c["metrics"]["SW-039"]["state_after"].__setitem__("evaluation_state", "measured_graded"))
    rec_p("gradable", lambda c: c["metrics"]["SW-040"]["state_after"].__setitem__("gradable", True))
    rec_p("alert", lambda c: c["metrics"]["SW-038"]["state_after"].__setitem__("alert_eligible", True))
    rec_p("visible", lambda c: c["metrics"]["SW-039"]["state_after"].__setitem__("customer_visibility", "visible"))
    rec_p("emission_true", lambda c: c["metrics"]["SW-040"]["state_after"].__setitem__("customer_emission_authority", True))
    rec_p("acquired_admitted", lambda c: c["metrics"]["SW-038"]["state_after"].__setitem__("acquisition_admission_state", "admitted_held"))
    rec_p("authoritative_injection", lambda c: c["metrics"]["SW-039"]["state_after"].__setitem__("authoritative", True))
    rec_p("state_before_after_mismatch", lambda c: c["metrics"]["SW-038"]["state_after"].__setitem__("evaluation_state", "measured_unscored"))
    rec_p("metadata_change_not_none", lambda c: c["metrics"]["SW-040"].__setitem__("metadata_change", "advanced"))
    rec_p("sw040_note_requirement_deleted", lambda c: c["metrics"]["SW-040"].__setitem__("note_requirement_hard", False))
    rec_p("sw040_note_field_downgraded", lambda c: c["metrics"]["SW-040"].__setitem__("frozen_required_fields", REQ_BASE[:]))
    rec_p("candidate_substitutes_frozen", lambda c: c["candidate_snapshot_method"].__setitem__("satisfies_frozen_direct_stage_history", True))
    rec_p("candidate_backfills_history", lambda c: c["candidate_snapshot_method"].__setitem__("cannot_backfill_history", False))
    rec_p("snapshot_is_transition_timestamp", lambda c: c["candidate_snapshot_method"].__setitem__("is_crm_transition_timestamp", True))
    rec_p("snapshot_scheduled_now", lambda c: c["candidate_snapshot_method"].__setitem__("scheduled_now", True))
    rec_p("last_modified_status_specific", lambda c: c["help_pass"].__setitem__("last_modified_is_status_specific", True))
    rec_p("global_unavailable_flag", lambda c: c["global_unavailability"].__setitem__("claimed", True))
    rec_p("global_unavailable_text", lambda c: c.__setitem__("conclusion", c["conclusion"] + " The source is globally unavailable and missing is zero."))
    rec_p("terminal_unavailable_text", lambda c: c["report_center_pass"].__setitem__("terminal_note", "terminal unavailable; missing is zero"))
    rec_p("contextual_delta_zero", lambda c: c["two_delta"].__setitem__("contextual_discovery_evidence_delta", 0))
    rec_p("acquisition_delta_one", lambda c: c["two_delta"].__setitem__("governed_source_data_acquisition_delta", 1))
    rec_p("admission_delta_one", lambda c: c["two_delta"].__setitem__("governed_source_data_admission_delta", 1))
    rec_p("meaning_delta_one", lambda c: c["two_delta"].__setitem__("metric_meaning_value_lifecycle_customer_delta", 1))
    rec_p("candidate_source_verified_true", lambda c: c["privacy_and_safety"].__setitem__("candidate_source_sales_only_verified", True))
    rec_p("operation_scope_false", lambda c: c["privacy_and_safety"].__setitem__("operation_scope_sales_only", False))
    rec_p("sales_only_conflation", lambda c: c["privacy_and_safety"].__setitem__("sales_only", True))
    rec_p("zero_admitted_means_clean", lambda c: c["privacy_and_safety"].__setitem__("candidate_service_free_note", "Zero Service/Parts admitted proves the candidate is clean and verified sales-only."))
    rec_p("service_parts_captured", lambda c: c["privacy_and_safety"].__setitem__("no_identified_service_parts_rows_or_fields_captured", False))
    rec_p("service_parts_admitted_nonzero", lambda c: c["privacy_and_safety"].__setitem__("service_parts_admitted", 2))
    rec_p("pii_captured", lambda c: c["privacy_and_safety"].__setitem__("pii_captured", True))
    rec_p("raw_query_token_stored", lambda c: c["privacy_and_safety"].__setitem__("no_raw_url_query_or_token_stored", False))
    rec_p("message_content_captured", lambda c: c["privacy_and_safety"].__setitem__("message_content_captured", True))
    rec_p("report_run", lambda c: c["custom_reporting_pass"].__setitem__("report_run", True))
    rec_p("rows_retrieved", lambda c: c["custom_reporting_pass"].__setitem__("rows_retrieved", True))
    rec_p("wrong_binding_pin", lambda c: c["pins"].__setitem__("pkt_03_01_binding_sha256", "0" * 64))
    rec_p("wrong_ledger_pin", lambda c: c["pins"].__setitem__("master_ledger_295_sha256", "0" * 64))
    rec_p("wrong_sw042_pin", lambda c: c["pins"].__setitem__("sw042_discovery_result_sha256", "0" * 64))
    rec_p("baseline_drift", lambda c: c.__setitem__("baseline_commit", "deadbeef"))
    rec_p("metric_dropped", lambda c: c["metrics"].pop("SW-039"))
    # --- ownership probes (mirror frozen binding) ---
    rec_p("owner_role_missing", lambda c: c["owners"].pop("positive_stage_history_export_investigation"))
    rec_p("owner_role_renamed", lambda c: (c["owners"].__setitem__("stage_history_investigation", c["owners"].pop("positive_stage_history_export_investigation"))))
    rec_p("owner_roles_combined", lambda c: (c["owners"].pop("positive_stage_history_export_investigation"), c["owners"].pop("stage_history_detection_implementation"), c["owners"].__setitem__("source_contract_and_definition", DUANE)))
    rec_p("owner_wrong_decision", lambda c: c["owners"].__setitem__("status_audit_request_decision", CODEX))
    rec_p("owner_wrong_investigation", lambda c: c["owners"].__setitem__("positive_stage_history_export_investigation", STUDIO))
    rec_p("duane_owns_investigation", lambda c: c["owners"].__setitem__("positive_stage_history_export_investigation", DUANE))
    rec_p("duane_owns_implementation", lambda c: c["owners"].__setitem__("stage_history_detection_implementation", DUANE))
    rec_p("immediate_owner_duane", lambda c: c["owners"].__setitem__("immediate_action_owner", DUANE))
    rec_p("next_owner_duane", lambda c: c["owners"].__setitem__("next_action_owner", DUANE))
    rec_allow("nonallowlist_path_touch", set(ALLOWLIST) | {"docs/halo/contract/phase1b/master-ledger-295.json"}, False)
    rec_allow("claude_staged", set(ALLOWLIST), True)
    # prior-validator comparator probes at all three layers
    for layer in ("j1", "j2", "sw042"):
        rec_prior(f"prior_{layer}_same_count_swap", layer, lambda r: r.__setitem__("errors", (r["errors"][:-1] + ["fabricated swap"]) if r["errors"] else ["x"]))
        rec_prior(f"prior_{layer}_delete_one", layer, lambda r: r.__setitem__("errors", r["errors"][:-1]))
        rec_prior(f"prior_{layer}_add_one", layer, lambda r: r.__setitem__("errors", r["errors"] + ["extra"]))
        rec_prior(f"prior_{layer}_semantic_error", layer, lambda r: r.__setitem__("errors", (r["errors"][:-1] + ["held SW-038: disposition promotion"]) if r["errors"] else ["held SW-038: disposition promotion"]))
        rec_prior(f"prior_{layer}_probe_total_drift", layer, lambda r: r.__setitem__("adversarial_probes_total", (r.get("adversarial_probes_total") or 0) - 1))
        rec_prior(f"prior_{layer}_failed_probe", layer, lambda r: r.__setitem__("adversarial_probes_failed", 1))
        rec_prior(f"prior_{layer}_overall_pass", layer, lambda r: r.__setitem__("overall_pass", True))
    rec_prior("prior_j1_binding_drift", "j1", lambda r: r.__setitem__("binding_sha256", "0" * 64))
    return probes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--no-write", action="store_true")
    args = ap.parse_args()

    rec = json.load(open(RECORD_PATH, encoding="utf-8"))
    info = {}
    errs = run_structural(rec)
    check_pins_live(errs)
    captured = check_prior_validators(errs, info)
    check_allowlist(errs, info)
    probes = run_probes(rec, captured)
    failed = [p for p in probes if not p["pass"]]
    overall = (not errs) and (not failed)

    result = {
        "check": "honda_watchdog_phase1b_pkt_03_01_sw038_040_discovery_memorialization",
        "phase": "Phase 1B — SW-038/039/040 stage-history finite read-only discovery memorialization (design/evidence only; CREATE-only)",
        "scope": "evidence_memorialization_only (no acquisition/admission/calculation/regrade/alert/customer/merge/deploy; SW-038/039/040 unchanged)",
        "baseline_commit": BASELINE_COMMIT,
        "record_file": "docs/halo/evidence/honda-watchdog/phase1b/pkt-03-01/PKT-03-01_SW-038-040_DISCOVERY_RESULT.json",
        "record_sha256": sha_file(RECORD_PATH),
        "allowlist_files": ALLOWLIST,
        "pins_unchanged": {k: v[1] for k, v in PINS.items()},
        "two_delta_split": rec.get("two_delta"),
        "held_metrics_unchanged": {i: EXPECTED_LIFECYCLE["disposition"] for i in IDS},
        "prior_validators_post_discovery": info.get("prior_validators_post_discovery"),
        "touched_vs_baseline": info.get("touched_vs_baseline"),
        "adversarial_probes_total": len(probes),
        "adversarial_probes_failed": len(failed),
        "adversarial_probes": probes,
        "errors": errs,
        "overall_pass": overall,
        "note": "Positive candidate ingredients; frozen direct stage-history source (incl. SW-040 note) unproved. Contextual +1; governed acquisition/admission/meaning 0. No global-unavailability, no missing=zero, no substitution/inference; no PII/raw/query/content. Older validators classified expected_stage_scope_only (never PASS).",
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
