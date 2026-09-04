#!/usr/bin/env python3
"""
PKT-03-01 SW-034 finite-discovery memorialization validator (design/evidence only, CREATE-only allowlist).

Validates the SW-034 write-to-close finite read-only discovery record; preserves every frozen/committed artifact
byte-for-byte; classifies each of the FOUR older frozen validators' live with-files result as expected_stage_scope_only
(never PASS). Exit 0 == PASS.
Usage: python3 scripts/halo-phase1b/validate_pkt_03_01_sw034_discovery.py [--out X] [--no-write]
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
RECORD_PATH = os.path.join(EV, "PKT-03-01_SW-034_DISCOVERY_RESULT.json")
DEFAULT_OUT = os.path.join(EV, "PKT-03-01_SW-034_DISCOVERY_CHECKS.json")

BASELINE_COMMIT = "4f03833d8150ddf31fa139cf172c6d542ac50d31"
PINS = {
    "pkt_03_01_binding_sha256": ("docs/halo/contract/phase1b/pkt-03-01-binding.json", "e92a181f2a8016085011358ff256f627b2c11f09e4f37109f4276ecbfce10f8e"),
    "master_ledger_295_sha256": ("docs/halo/contract/phase1b/master-ledger-295.json", "747b6d31796939ae29f3a31a0f57226e57342ad7c2b1a1737e05287a5af59d13"),
    "pkt_03_01_packet_sha256": ("docs/halo/contract/phase1b/packets/PKT-03-01.json", "a35319fe19061dfe0cf09a5557f9212ff2c7c396cfa5243388cc038675283cae"),
    "sw042_evidence_gap_sha256": ("docs/halo/contract/phase1b/MODULE3_APPT_CONFIRMATION_SW-042_EVIDENCE_GAP.json", "1714aad7b8cd4eaf44e4f3a62ba652b0f61886e61f042b274377deee0e1fab7b"),
    "sw042_discovery_result_sha256": ("docs/halo/evidence/honda-watchdog/phase1b/pkt-03-01/PKT-03-01_SW-042_DISCOVERY_RESULT.json", "05987ed463930dcc3f0b2d2d34fed2203cac5c6ccb4e475ea801715d1ea65551"),
    "sw042_discovery_checks_sha256": ("docs/halo/evidence/honda-watchdog/phase1b/pkt-03-01/PKT-03-01_SW-042_DISCOVERY_CHECKS.json", "0f5494129396d1037d18e5e42af52719886a67803d05b4251255341a0413eaf3"),
    "sw042_discovery_validator_sha256": ("scripts/halo-phase1b/validate_pkt_03_01_sw042_discovery.py", "729d0736b80240ecd088306a973410c1096087a2b898dd0ca249409fa26653c5"),
    "sw038_040_discovery_result_sha256": ("docs/halo/evidence/honda-watchdog/phase1b/pkt-03-01/PKT-03-01_SW-038-040_DISCOVERY_RESULT.json", "6c5398584efe702b1994f99604911c3dcac3bd87d693315299c9d66102434a23"),
    "sw038_040_discovery_checks_sha256": ("docs/halo/evidence/honda-watchdog/phase1b/pkt-03-01/PKT-03-01_SW-038-040_DISCOVERY_CHECKS.json", "bb38e300150ff8964b46c160f4057971114194dcee925dd5c0d12b004d61f2d0"),
    "sw038_040_discovery_validator_sha256": ("scripts/halo-phase1b/validate_pkt_03_01_sw038_040_discovery.py", "e78654323ae0b05d72e57fd6d03847669d0625f4a1779ca8072eaedc0882e3dc"),
}
ALLOWLIST = sorted([
    "docs/halo/evidence/honda-watchdog/phase1b/pkt-03-01/PKT-03-01_SW-034_DISCOVERY_RESULT.json",
    "scripts/halo-phase1b/validate_pkt_03_01_sw034_discovery.py",
    "docs/halo/evidence/honda-watchdog/phase1b/pkt-03-01/PKT-03-01_SW-034_DISCOVERY_CHECKS.json",
])
RECEIPT_REL = "docs/halo/evidence/honda-watchdog/phase1b/pkt-03-01/PKT-03-01_SW-034_DISCOVERY_CHECKS.json"
EXPECTED_LIFECYCLE = {
    "disposition": "source_investigation_pending", "source_existence_state": "investigation_pending",
    "acquisition_admission_state": "not_acquired", "evaluation_state": "not_measured", "authoritative": False,
    "gradable": False, "alert_eligible": False, "customer_visibility": "hidden", "future_display_eligibility": False,
    "customer_emission_authority": False, "report_acceptance_state": "withheld_no_delivery",
}
REQ_FIELDS = ["dated Sales-only CRM Sales Gross close outcomes", "written-up denominator", "supported stable lead/customer join bridge"]
DUANE = "Duane Wells"
CODEX = "Codex VinSolutions controller"
STUDIO = "Claude Studio engineering"
EXPECTED_OWNERS = {
    "write_to_close_denominator_and_target_decision": DUANE,
    "read_only_dated_pull_and_bridge_investigation": CODEX,
    "join_and_calculation_implementation": STUDIO,
    "immediate_action_owner": CODEX,
    "next_action_owner": CODEX,
}
DUANE_TECHNICAL_ROLES = ("read_only_dated_pull_and_bridge_investigation", "join_and_calculation_implementation")
DUANE_ROLE_STEMS = ("acquir", "acquisit", "investigat", "accumulat", "admit", "admiss", "normaliz", "promot", "calculat", "implement", "pull", "bridge")

J1_BIND_SHA = "e92a181f2a8016085011358ff256f627b2c11f09e4f37109f4276ecbfce10f8e"
PRIOR = {
    "j1": {"rel": "scripts/halo-phase1b/validate_pkt_03_01_binding.py", "count": 16, "probes": 54, "binding": J1_BIND_SHA,
           "sha": "b824a35dba197f68fe1644a0419125f55cf3284668c9baa01ebe15b7ec9ffda3"},
    "j2": {"rel": "scripts/halo-phase1b/validate_pkt_03_01.py", "count": 9, "probes": 67, "binding": None,
           "sha": "65d1c24912883426aebcdacf7eee8bc304bc48b9435c7402cfb1be0db51783e1"},
    "sw042": {"rel": "scripts/halo-phase1b/validate_pkt_03_01_sw042_discovery.py", "count": 17, "probes": 58, "binding": None,
              "sha": "f6e7e5caf41d7ac590ab7ac91ab0dc18bcee6a781667d39bde9b28a5df574ac5"},
    "sw038_040": {"rel": "scripts/halo-phase1b/validate_pkt_03_01_sw038_040_discovery.py", "count": 10, "probes": 73, "binding": None,
                  "sha": "3b89ac0daa38bf81257fa3264402c4e02d84810b3a799fc5cc94294df2d87655"},
}
_NEG = ("not ", "never", "no ", "without", "do not", "must not", "cannot", "is not", "are not", "don't", "exclude", "unverified", "only after", "ambiguous")
_ASSERT = ("globally unavailable", "global unavailability", "terminal unavailable", "missing is zero", "missing equals zero",
           "treat missing as zero", "counts as zero", "verified sales-only", "proved clean", "verified clean", "cleanliness verified")
_FORBID = ("sales_only_clean", "sales-only clean")
# Prohibited metric-output keys — rejected anywhere in the record (exact key names, so legitimate metadata such as
# operational_target_approved / alert_eligible / target_status are preserved). No value/denominator/join/target/grade/alert.
PROHIBITED_OUTPUT_KEYS = {"value", "calculated_value", "numerator", "denominator", "formula", "join_proved",
                          "bridge_proved", "target", "operational_target", "threshold", "grade", "rating",
                          "detection_rule", "alert"}


def _all_keys(o):
    ks = set()
    if isinstance(o, dict):
        for k, v in o.items():
            ks.add(k)
            ks |= _all_keys(v)
    elif isinstance(o, list):
        for v in o:
            ks |= _all_keys(v)
    return ks


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
            if not any(n in blob[max(0, k - 40):k] for n in _NEG):
                hits.append(pat)
                break
            j = k + len(pat)
    return hits


def run_structural(rec):
    errs = []
    blob = blob_of(rec).lower()
    if rec.get("baseline_commit") != BASELINE_COMMIT:
        errs.append("baseline_commit != 4f03833d8")
    if rec.get("metric_id") != "SW-034" or rec.get("packet_id") != "PKT-03-01":
        errs.append("metric_id/packet_id drift")
    for name, (_rel, want) in PINS.items():
        if rec.get("pins", {}).get(name) != want:
            errs.append(f"record pins.{name} != committed sha")
    s = rec.get("sw034", {})
    if s.get("canonical_condition") != "Write-to-close rate below 40%.":
        errs.append("sw034.canonical_condition drift")
    for req in REQ_FIELDS:
        if req not in s.get("frozen_required_fields", []):
            errs.append(f"sw034.frozen_required_fields missing '{req}'")
    if s.get("metadata_change") != "none":
        errs.append("sw034.metadata_change must be 'none'")
    for sk in ("state_before", "state_after"):
        st = s.get(sk, {})
        for k, v in EXPECTED_LIFECYCLE.items():
            if st.get(k) != v:
                errs.append(f"sw034.{sk}.{k} != {v} (held state must be preserved)")
    if s.get("state_before") != s.get("state_after"):
        errs.append("sw034: state_before != state_after")
    # ownership exact + Duane never technical + immediate/next Codex
    ow = s.get("owners", {})
    for role, who in EXPECTED_OWNERS.items():
        if role not in ow:
            errs.append(f"owners: required role '{role}' missing")
        elif ow.get(role) != who:
            errs.append(f"owners.{role} != '{who}'")
    extra = sorted(set(ow.keys()) - set(EXPECTED_OWNERS.keys()) - {"note"})
    if extra:
        errs.append(f"owners: unexpected/renamed role(s): {extra}")
    for role, who in ow.items():
        if role == "note":
            continue
        if who == DUANE and (role in DUANE_TECHNICAL_ROLES or any(t in role.lower() for t in DUANE_ROLE_STEMS)):
            errs.append(f"owners: Duane Wells on technical role '{role}' (forbidden)")
    if ow.get("immediate_action_owner") != CODEX or ow.get("next_action_owner") != CODEX:
        errs.append("owners: immediate/next action owner must be Codex")
    # two-delta split
    td = rec.get("two_delta", {})
    if td.get("contextual_discovery_evidence_delta") != 1:
        errs.append("contextual_discovery_evidence_delta must be 1")
    for k in ("governed_source_data_acquisition_delta", "governed_source_data_admission_delta", "metric_meaning_value_lifecycle_customer_delta"):
        if td.get(k) != 0:
            errs.append(f"two_delta.{k} must be 0")
    # PDF context
    pc = rec.get("source_pdf_context", {})
    for k in ("is_governed_current_week_input", "row_level_stable_join_keys_present", "is_acquisition_or_admission", "is_denominator_semantics", "is_current_period_value", "proves_supported_join"):
        if pc.get(k) is not False:
            errs.append(f"source_pdf_context.{k} must be False")
    if pc.get("is_historical_customer_example") is not True or pc.get("contextual_schema_evidence_only") is not True:
        errs.append("source_pdf_context: historical/context-only flags required True")
    # DMS-to-CRM matching help
    hm = rec.get("help_dms_to_crm_matching", {})
    if hm.get("article_number") != "000001252":
        errs.append("help_dms_to_crm_matching.article_number must be 000001252")
    for k in ("proves_exportable_bulk_stable_key_bridge", "proves_exact_export_fields", "proves_scheduleability", "proves_sales_only_filters", "proves_denominator_semantics"):
        if hm.get(k) is not False:
            errs.append(f"help_dms_to_crm_matching.{k} must be False")
    if hm.get("read_only_boundary_no_match_reconcile_add_update_click") is not True:
        errs.append("help_dms_to_crm_matching: read-only no-click boundary must be True")
    # report center + ambiguous DMS attempt
    rcp = rec.get("report_center_pass", {})
    if rcp.get("finite_catalog_evidence_only") is not True or rcp.get("supports_global_unavailability") is not False:
        errs.append("report_center_pass: finite_catalog_evidence_only True + supports_global_unavailability False")
    dms = rcp.get("dms_to_crm_sales_attempt", {})
    if dms.get("classification") != "ambiguous_ignored" or dms.get("treated_as_positive_or_negative_evidence") is not False:
        errs.append("report_center_pass.dms_to_crm_sales_attempt must be ambiguous_ignored / not-evidence")
    # custom reporting
    cr = rec.get("custom_reporting_pass", {})
    if cr.get("data_retrieval_paused_before_dataset_selection") is not True:
        errs.append("custom_reporting_pass: retrieval must be paused before dataset selection")
    if cr.get("lead_id_showroom_visit_id_writeup_exposed_in_crm_sales_help") is not False:
        errs.append("custom_reporting_pass: CRM Sales Help must NOT expose Lead ID/Showroom Visit ID/Writeup")
    if cr.get("showroom_visits_tooltip_truncated_after") != "Contac" or cr.get("later_fields_absent_claim") is not False:
        errs.append("custom_reporting_pass: truncated tooltip must not be treated as absence proof")
    if cr.get("stable_bridge_crm_sales_proved") is not False:
        errs.append("custom_reporting_pass: stable bridge must not be claimed proved")
    for k in ("columns_added", "filters_set", "rows_retrieved", "report_saved", "report_exported", "report_run", "report_scheduled"):
        if cr.get(k) is not False:
            errs.append(f"custom_reporting_pass.{k} must be False")
    # Service dataset excursion (unintended metadata-only)
    se = rec.get("service_dataset_excursion", {})
    if se.get("classification") != "unintended_metadata_only_scope_excursion":
        errs.append("service_dataset_excursion must be classified unintended_metadata_only_scope_excursion")
    for k in ("is_authorized_service_investigation", "is_source_acquisition", "is_sales_only_proof", "is_clean_source_proof", "is_admitted_data", "rows_or_source_bytes_or_pii_or_customer_content_retrieved", "filter_save_export_run_schedule_occurred"):
        if se.get(k) is not False:
            errs.append(f"service_dataset_excursion.{k} must be False")
    if se.get("service_parts_admitted") != 0:
        errs.append("service_dataset_excursion.service_parts_admitted must be 0")
    # candidate pieces non-substitute
    cp = rec.get("candidate_pieces", {})
    if cp.get("satisfies_frozen_requirements") is not False or cp.get("substitution_or_inference_forbidden") is not True:
        errs.append("candidate_pieces: satisfies_frozen_requirements False + substitution_or_inference_forbidden True")
    ns = cp.get("non_substitutes", {})
    for k in ("aggregate_writeup_is_accepted_denominator", "customer_is_join_key", "matching_workflow_existence_is_export_proof", "truncated_tooltip_is_absence_proof", "stale_dms_search_is_evidence", "inferred_ids_are_stable_bridge"):
        if ns.get(k) is not False:
            errs.append(f"candidate_pieces.non_substitutes.{k} must be False")
    # target status
    ts = rec.get("target_status", {})
    if ts.get("catalog_condition_only") is not True or ts.get("operational_target_approved") is not False:
        errs.append("target_status: catalog_condition_only True + operational_target_approved False (40% not approved)")
    # privacy scope split
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
    # global unavailability
    if rec.get("global_unavailability", {}).get("claimed") is not False:
        errs.append("global_unavailability.claimed must be False")
    # recursive prohibited metric-output key rejection (no value/denominator/join/target/grade/alert anywhere)
    bad = sorted(PROHIBITED_OUTPUT_KEYS & _all_keys(rec))
    if bad:
        errs.append(f"prohibited metric-output key(s) present anywhere in record: {bad}")
    # text scans
    hits = _asserts_unnegated(blob, _ASSERT)
    if hits:
        errs.append(f"assertive forbidden claim(s) present un-negated: {hits}")
    fb = [p for p in _FORBID if p in blob]
    if fb:
        errs.append(f"outright-forbidden claim(s): {fb}")
    return errs


def check_pins_live(errs):
    for name, (rel, want) in PINS.items():
        if sha_file(os.path.join(REPO, rel)) != want:
            errs.append(f"pinned {name}: live sha != committed (a frozen artifact changed)")
    b = json.load(open(os.path.join(CB, "pkt-03-01-binding.json"), encoding="utf-8"))["metrics"]["SW-034"]
    row = {r["metric_id"]: r for r in json.load(open(os.path.join(CB, "master-ledger-295.json"), encoding="utf-8"))["rows"]}["SW-034"]
    if b.get("disposition") != "source_investigation_pending" or row.get("disposition") != "source_investigation_pending":
        errs.append("live SW-034 disposition != source_investigation_pending")
    if row.get("evaluation_state") != "not_measured" or row.get("acquisition_admission_state") != "not_acquired":
        errs.append("live SW-034 ledger drift")


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
    p = PRIOR[layer]
    e = []
    errs = r.get("errors", [])
    if r.get("adversarial_probes_total") != p["probes"]:
        e.append(f"prior[{layer}]: probe total {r.get('adversarial_probes_total')} != {p['probes']}")
    if r.get("adversarial_probes_failed") != 0:
        e.append(f"prior[{layer}]: failed probe != 0")
    if p["binding"] is not None and r.get("binding_sha256") != p["binding"]:
        e.append(f"prior[{layer}]: binding sha drift")
    if len(errs) != p["count"]:
        e.append(f"prior[{layer}]: error count {len(errs)} != {p['count']}")
    if canon(errs) != p["sha"]:
        e.append(f"prior[{layer}]: canonical signature mismatch (swap/add/delete/omitted/extra/wrong-path/semantic)")
    if r.get("overall_pass") is True:
        e.append(f"prior[{layer}]: older validator reported PASS (must be expected_stage_scope_only, never PASS)")
    return e


def check_prior_validators(errs, info):
    captured = {}
    for layer in ("j1", "j2", "sw042", "sw038_040"):
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

    S = lambda c: c["sw034"]
    rec_p("aggregate_writeup_as_denominator", lambda c: S(c)["state_after"].__setitem__("evaluation_state", "not_measured") or c["candidate_pieces"]["non_substitutes"].__setitem__("aggregate_writeup_is_accepted_denominator", True))
    rec_p("pdf_is_denominator_semantics", lambda c: c["source_pdf_context"].__setitem__("is_denominator_semantics", True))
    rec_p("customer_as_join_key", lambda c: c["candidate_pieces"]["non_substitutes"].__setitem__("customer_is_join_key", True))
    rec_p("matching_workflow_export_proof", lambda c: c["help_dms_to_crm_matching"].__setitem__("proves_exportable_bulk_stable_key_bridge", True))
    rec_p("matching_workflow_ns_flag", lambda c: c["candidate_pieces"]["non_substitutes"].__setitem__("matching_workflow_existence_is_export_proof", True))
    rec_p("truncated_tooltip_absence_proof", lambda c: c["custom_reporting_pass"].__setitem__("later_fields_absent_claim", True))
    rec_p("stale_dms_as_evidence", lambda c: c["report_center_pass"]["dms_to_crm_sales_attempt"].__setitem__("treated_as_positive_or_negative_evidence", True))
    rec_p("stale_dms_reclassified", lambda c: c["report_center_pass"]["dms_to_crm_sales_attempt"].__setitem__("classification", "positive_match_found"))
    rec_p("current_period_acquisition", lambda c: c["source_pdf_context"].__setitem__("is_acquisition_or_admission", True))
    rec_p("acquisition_delta_one", lambda c: c["two_delta"].__setitem__("governed_source_data_acquisition_delta", 1))
    rec_p("target_40_approved", lambda c: c["target_status"].__setitem__("operational_target_approved", True))
    rec_p("status_promotion", lambda c: S(c)["state_after"].__setitem__("disposition", "data_acquired_calculation_pending"))
    rec_p("measured", lambda c: S(c)["state_after"].__setitem__("evaluation_state", "measured_graded"))
    rec_p("gradable", lambda c: S(c)["state_after"].__setitem__("gradable", True))
    rec_p("acquired_admitted", lambda c: S(c)["state_after"].__setitem__("acquisition_admission_state", "admitted_held"))
    rec_p("visible", lambda c: S(c)["state_after"].__setitem__("customer_visibility", "visible"))
    rec_p("emission_true", lambda c: S(c)["state_after"].__setitem__("customer_emission_authority", True))
    rec_p("state_before_after_mismatch", lambda c: S(c)["state_after"].__setitem__("evaluation_state", "measured_unscored"))
    rec_p("metadata_change_not_none", lambda c: S(c).__setitem__("metadata_change", "advanced"))
    rec_p("global_unavailable_flag", lambda c: c["global_unavailability"].__setitem__("claimed", True))
    rec_p("global_unavailable_text", lambda c: c.__setitem__("conclusion", c["conclusion"] + " The source is globally unavailable and missing is zero."))
    rec_p("service_touch_authorized", lambda c: c["service_dataset_excursion"].__setitem__("is_authorized_service_investigation", True))
    rec_p("service_touch_acquisition", lambda c: c["service_dataset_excursion"].__setitem__("is_source_acquisition", True))
    rec_p("service_touch_sales_only_proof", lambda c: c["service_dataset_excursion"].__setitem__("is_sales_only_proof", True))
    rec_p("service_touch_clean_proof", lambda c: c["service_dataset_excursion"].__setitem__("is_clean_source_proof", True))
    rec_p("service_touch_admitted", lambda c: c["service_dataset_excursion"].__setitem__("is_admitted_data", True))
    rec_p("service_touch_reclassified", lambda c: c["service_dataset_excursion"].__setitem__("classification", "authorized_service_investigation"))
    rec_p("service_parts_admitted_nonzero", lambda c: c["privacy_and_safety"].__setitem__("service_parts_admitted", 1))
    rec_p("candidate_source_verified_true", lambda c: c["privacy_and_safety"].__setitem__("candidate_source_sales_only_verified", True))
    rec_p("operation_scope_false", lambda c: c["privacy_and_safety"].__setitem__("operation_scope_sales_only", False))
    rec_p("sales_only_conflation", lambda c: c["privacy_and_safety"].__setitem__("sales_only", True))
    rec_p("pii_captured", lambda c: c["privacy_and_safety"].__setitem__("pii_captured", True))
    rec_p("raw_query_token_stored", lambda c: c["privacy_and_safety"].__setitem__("no_raw_url_query_or_token_stored", False))
    rec_p("candidate_satisfies_frozen", lambda c: c["candidate_pieces"].__setitem__("satisfies_frozen_requirements", True))
    rec_p("inferred_ids_bridge", lambda c: c["candidate_pieces"]["non_substitutes"].__setitem__("inferred_ids_are_stable_bridge", True))
    rec_p("owner_collapse_duane_investigation", lambda c: S(c)["owners"].__setitem__("read_only_dated_pull_and_bridge_investigation", DUANE))
    rec_p("owner_collapse_duane_implementation", lambda c: S(c)["owners"].__setitem__("join_and_calculation_implementation", DUANE))
    rec_p("owner_wrong_decision", lambda c: S(c)["owners"].__setitem__("write_to_close_denominator_and_target_decision", CODEX))
    rec_p("owner_role_missing", lambda c: S(c)["owners"].pop("read_only_dated_pull_and_bridge_investigation"))
    rec_p("immediate_owner_duane", lambda c: S(c)["owners"].__setitem__("immediate_action_owner", DUANE))
    rec_p("wrong_binding_pin", lambda c: c["pins"].__setitem__("pkt_03_01_binding_sha256", "0" * 64))
    rec_p("wrong_sw038_040_pin", lambda c: c["pins"].__setitem__("sw038_040_discovery_result_sha256", "0" * 64))
    rec_p("baseline_drift", lambda c: c.__setitem__("baseline_commit", "deadbeef"))
    rec_p("contextual_delta_zero", lambda c: c["two_delta"].__setitem__("contextual_discovery_evidence_delta", 0))
    # --- prohibited metric-output injection probes (the 8 exact shadow injections + additional classes) ---
    rec_p("inject_value", lambda c: c["sw034"].__setitem__("value", 0.25))
    rec_p("inject_numerator", lambda c: c["sw034"].__setitem__("numerator", 4))
    rec_p("inject_denominator", lambda c: c["sw034"].__setitem__("denominator", 10))
    rec_p("inject_formula", lambda c: c["sw034"].__setitem__("formula", "sold / writeups"))
    rec_p("inject_join_proved", lambda c: c["sw034"].__setitem__("join_proved", True))
    rec_p("inject_target", lambda c: c["sw034"].__setitem__("target", 0.4))
    rec_p("inject_grade", lambda c: c["sw034"].__setitem__("grade", "bad"))
    rec_p("inject_alert", lambda c: c["sw034"].__setitem__("alert", True))
    rec_p("inject_calculated_value", lambda c: c["sw034"].__setitem__("calculated_value", 0.25))
    rec_p("inject_bridge_proved", lambda c: c["sw034"].__setitem__("bridge_proved", True))
    rec_p("inject_operational_target", lambda c: c["sw034"].__setitem__("operational_target", 0.4))
    rec_p("inject_threshold", lambda c: c["sw034"].__setitem__("threshold", 0.4))
    rec_p("inject_rating", lambda c: c["sw034"].__setitem__("rating", "breach"))
    rec_p("inject_detection_rule", lambda c: c["sw034"].__setitem__("detection_rule", "value < 0.4"))
    rec_p("inject_nested_value_candidate", lambda c: c["candidate_pieces"].__setitem__("value", 0.25))
    rec_allow("nonallowlist_path_touch", set(ALLOWLIST) | {"docs/halo/contract/phase1b/master-ledger-295.json"}, False)
    rec_allow("claude_staged", set(ALLOWLIST), True)
    for layer in ("j1", "j2", "sw042", "sw038_040"):
        rec_prior(f"prior_{layer}_same_count_swap", layer, lambda r: r.__setitem__("errors", (r["errors"][:-1] + ["fabricated swap"]) if r["errors"] else ["x"]))
        rec_prior(f"prior_{layer}_delete_one", layer, lambda r: r.__setitem__("errors", r["errors"][:-1]))
        rec_prior(f"prior_{layer}_add_one", layer, lambda r: r.__setitem__("errors", r["errors"] + ["extra"]))
        rec_prior(f"prior_{layer}_semantic_error", layer, lambda r: r.__setitem__("errors", (r["errors"][:-1] + ["held SW-034: disposition promotion"]) if r["errors"] else ["held SW-034: disposition promotion"]))
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
        "check": "honda_watchdog_phase1b_pkt_03_01_sw034_discovery_memorialization",
        "phase": "Phase 1B — SW-034 write-to-close finite read-only discovery memorialization (design/evidence only; CREATE-only)",
        "scope": "evidence_memorialization_only (no acquisition/admission/calculation/regrade/alert/customer/merge/deploy; SW-034 unchanged)",
        "baseline_commit": BASELINE_COMMIT,
        "record_file": "docs/halo/evidence/honda-watchdog/phase1b/pkt-03-01/PKT-03-01_SW-034_DISCOVERY_RESULT.json",
        "record_sha256": sha_file(RECORD_PATH),
        "allowlist_files": ALLOWLIST,
        "pins_unchanged": {k: v[1] for k, v in PINS.items()},
        "two_delta_split": rec.get("two_delta"),
        "sw034_held": EXPECTED_LIFECYCLE["disposition"],
        "target_status": rec.get("target_status"),
        "prior_validators_post_discovery": info.get("prior_validators_post_discovery"),
        "touched_vs_baseline": info.get("touched_vs_baseline"),
        "adversarial_probes_total": len(probes),
        "adversarial_probes_failed": len(failed),
        "adversarial_probes": probes,
        "errors": errs,
        "overall_pass": overall,
        "note": "Positive candidate pieces; frozen SW-034 requirements (dated Sales-only CRM Sales Gross source + written-up denominator + supported stable join bridge) unproved. Service dataset touch recorded as an unintended metadata-only excursion (never admission/clean-proof). 40% is catalog wording only. Contextual +1; governed deltas 0. Four older validators classified expected_stage_scope_only (never PASS).",
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
