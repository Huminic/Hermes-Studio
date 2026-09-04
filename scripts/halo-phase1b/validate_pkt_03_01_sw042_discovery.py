#!/usr/bin/env python3
"""
PKT-03-01 SW-042 finite-discovery memorialization validator (design/evidence only, CREATE-only allowlist).

Validates docs/halo/evidence/honda-watchdog/phase1b/pkt-03-01/PKT-03-01_SW-042_DISCOVERY_RESULT.json:
  - baseline 24c3223b; the four committed artifacts (binding/ledger/gap/packet) UNCHANGED (live sha == pinned);
    SW-042 lifecycle stays exactly as committed (source_investigation_pending / investigation_pending / not_acquired /
    not_measured / not gradable / not alert-eligible / hidden / future_display false / emission false); metadata_change=none;
  - split two-delta: contextual_discovery_evidence_delta=1; governed acquisition=0, admission=0, meaning/value/lifecycle/customer=0;
  - candidate observation = candidate_context_only + non_admitted + sales_only_SCOPE_unverified (NO clean/verified claim);
  - display aggregates are NOT SW-042 numerator/denominator/value/target/grade/alert/customer facts; 15 not within-24h;
    the 2026-09-04 count of 4 is current-UI context, never mixed into the frozen week;
  - no proved period/filter/exportability/scheduleability/stable-grain/event-level/hour-precision/reconfirmation;
  - Confirmed Date / Is Confirmed / Confirmed User / Last Modified Date + aggregate counts are named non-substitutes;
    no invented/ratified 24h anchor; no global-unavailable conclusion;
  - zero PII/raw-row/message-content/Service-Parts capture; zero Service/Parts admitted; Honda #21043 Sales only; missing not zero;
  - exact 3 CREATE-only allowlist; no tracked mutation; .claude never staged.

Exit 0 == PASS. Usage: python3 scripts/halo-phase1b/validate_pkt_03_01_sw042_discovery.py [--out X] [--no-write]
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
RECORD_PATH = os.path.join(EV, "PKT-03-01_SW-042_DISCOVERY_RESULT.json")
DEFAULT_OUT = os.path.join(EV, "PKT-03-01_SW-042_DISCOVERY_CHECKS.json")

BASELINE_COMMIT = "24c3223b010b7fcc345c57d124d589c3e8d3b0b6"
PINS = {
    "pkt_03_01_binding_sha256": ("docs/halo/contract/phase1b/pkt-03-01-binding.json", "e92a181f2a8016085011358ff256f627b2c11f09e4f37109f4276ecbfce10f8e"),
    "master_ledger_295_sha256": ("docs/halo/contract/phase1b/master-ledger-295.json", "747b6d31796939ae29f3a31a0f57226e57342ad7c2b1a1737e05287a5af59d13"),
    "sw042_evidence_gap_sha256": ("docs/halo/contract/phase1b/MODULE3_APPT_CONFIRMATION_SW-042_EVIDENCE_GAP.json", "1714aad7b8cd4eaf44e4f3a62ba652b0f61886e61f042b274377deee0e1fab7b"),
    "pkt_03_01_packet_sha256": ("docs/halo/contract/phase1b/packets/PKT-03-01.json", "a35319fe19061dfe0cf09a5557f9212ff2c7c396cfa5243388cc038675283cae"),
}
ALLOWLIST = sorted([
    "docs/halo/evidence/honda-watchdog/phase1b/pkt-03-01/PKT-03-01_SW-042_DISCOVERY_RESULT.json",
    "scripts/halo-phase1b/validate_pkt_03_01_sw042_discovery.py",
    "docs/halo/evidence/honda-watchdog/phase1b/pkt-03-01/PKT-03-01_SW-042_DISCOVERY_CHECKS.json",
])
RECEIPT_REL = "docs/halo/evidence/honda-watchdog/phase1b/pkt-03-01/PKT-03-01_SW-042_DISCOVERY_CHECKS.json"
EXPECTED_LIFECYCLE = {
    "disposition": "source_investigation_pending", "source_existence_state": "investigation_pending",
    "acquisition_admission_state": "not_acquired", "evaluation_state": "not_measured",
    "gradable": False, "alert_eligible": False, "customer_visibility": "hidden",
    "future_display_eligibility": False, "customer_emission_authority": False,
}
NON_SUBSTITUTES = ["Confirmed Date", "Is Confirmed", "Confirmed User", "Last Modified Date"]
NOT_PROVED_REQUIRED = ["period", "filter", "exportability", "scheduleability", "hour precision",
                       "reconfirmation semantics", "24-hour anchor", "SW-042 numerator", "SW-042 denominator", "SW-042 value"]
FORBIDDEN_SW042_FACT_KEYS = {"sw042_value", "sw042_numerator", "sw042_denominator", "sw042_grade", "sw042_target", "numerator", "denominator"}
_NEG = ("not ", "never", "no ", "without", "do not", "must not", "cannot", "is not", "are not", "don't", "exclude", "unverified", "only after")
# assertive phrases that must NOT appear un-negated
_ASSERT = ("globally unavailable", "lacks such a source globally", "no such source globally", "source does not exist globally",
           "within-24h failure", "within 24h failure", "15 within-24h", "15 within 24h",
           "proves hour precision", "is an hour timestamp", "hour-precision timestamp proved", "confirmation timestamp proved",
           "period proved", "filter proved", "exportability proved", "scheduleability proved", "24-hour anchor ratified", "anchor is ratified",
           "proved clean", "verified clean", "cleanliness verified", "proved sales-only", "verified sales-only")
# phrases forbidden outright (never legitimate in the safe record)
_FORBID = ("sales_only_clean", "sales-only clean", "exportable", "schedulable")


def sha_file(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def blob_of(o):
    if isinstance(o, dict):
        return " ".join(blob_of(v) for v in o.values())
    if isinstance(o, list):
        return " ".join(blob_of(v) for v in o)
    return str(o)


def _asserts_unnegated(blob, patterns):
    hits = []
    for pat in patterns:
        j, n = 0, len(blob)
        while True:
            k = blob.find(pat, j)
            if k < 0:
                break
            if not any(neg in blob[max(0, k - 34):k] for neg in _NEG):
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
        errs.append("baseline_commit != 24c3223b")
    if rec.get("metric_id") != "SW-042" or rec.get("packet_id") != "PKT-03-01":
        errs.append("metric_id/packet_id drift")
    if rec.get("sw042_metadata_change") != "none":
        errs.append("sw042_metadata_change must be 'none' (SW-042 unchanged)")
    rp = rec.get("pins", {})
    for name, (_rel, want) in PINS.items():
        if rp.get(name) != want:
            errs.append(f"record pins.{name} != committed sha (a pinned artifact would have changed)")
    # lifecycle exactly the committed safe values
    lc = rec.get("sw042_lifecycle_unchanged", {})
    for k, v in EXPECTED_LIFECYCLE.items():
        if lc.get(k) != v:
            errs.append(f"sw042_lifecycle_unchanged.{k} != {v} (no acquired/admitted/measured/graded/alert/visible/emission drift)")
    # split two-delta
    td = rec.get("two_delta", {})
    if td.get("contextual_discovery_evidence_delta") != 1:
        errs.append("contextual_discovery_evidence_delta must be 1 (one candidate observation)")
    for k in ("governed_source_data_acquisition_delta", "governed_source_data_admission_delta", "metric_meaning_value_lifecycle_customer_delta"):
        if td.get(k) != 0:
            errs.append(f"two_delta.{k} must be 0")
    # candidate observation
    co = rec.get("candidate_observation", {})
    if co.get("candidate_context_only") is not True or co.get("non_admitted") is not True:
        errs.append("candidate must be candidate_context_only + non_admitted")
    if co.get("sales_only_scope_unverified") is not True:
        errs.append("must record sales_only_scope_unverified (source scope unverified; zero Service/Parts admitted only because nothing acquired/admitted)")
    if co.get("display_aggregates_only") is not True:
        errs.append("aggregates must be marked display_aggregates_only")
    fp = co.get("future_pipeline_count", {})
    if fp.get("value") != 4 or fp.get("date") != "2026-09-04":
        errs.append("future_pipeline_count must be value 4, date 2026-09-04")
    if "not frozen-week" not in str(fp.get("note", "")).lower() or "never mixed" not in str(fp.get("note", "")).lower():
        errs.append("future_pipeline_count.note must mark it NOT frozen-week and never mixed into 2026-08-24..2026-08-30")
    np = [x.lower() for x in co.get("not_proved", [])]
    for req in NOT_PROVED_REQUIRED:
        if req.lower() not in np:
            errs.append(f"not_proved must include '{req}'")
    # non-substitute fields
    nsf = " ".join(rec.get("non_substitute_fields", [])).lower()
    for f in NON_SUBSTITUTES:
        if f.lower() not in nsf:
            errs.append(f"non_substitute_fields must include '{f}'")
    if "aggregate counts" not in nsf:
        errs.append("non_substitute_fields must name the aggregate counts as non-substitutes")
    # 24h anchor + global unavailable
    a = rec.get("anchor_24h", {})
    if a.get("inferred") is not False or a.get("ratified") is not False:
        errs.append("anchor_24h inferred/ratified must both be False (no invented/ratified 24-hour anchor)")
    if rec.get("global_unavailable_conclusion") is not False:
        errs.append("global_unavailable_conclusion must be False (finite pass; no global conclusion)")
    # privacy/safety (R2: operation scope vs candidate-source scope must not be conflated)
    ps = rec.get("privacy_and_safety", {})
    for k in ("pii_captured", "raw_rows_captured", "message_content_captured", "source_files_captured"):
        if ps.get(k) is not False:
            errs.append(f"privacy_and_safety.{k} must be False")
    if ps.get("no_identified_service_parts_rows_or_fields_captured") is not True:
        errs.append("privacy_and_safety.no_identified_service_parts_rows_or_fields_captured must be True")
    if "sales_only" in ps:
        errs.append("privacy_and_safety.sales_only removed (use operation_scope_sales_only + candidate_source_sales_only_verified)")
    if ps.get("operation_scope_sales_only") is not True:
        errs.append("privacy_and_safety.operation_scope_sales_only must be True")
    if ps.get("candidate_source_sales_only_verified") is not False:
        errs.append("privacy_and_safety.candidate_source_sales_only_verified must be False (candidate scope unverified; not proved Service-free)")
    if ps.get("service_parts_admitted") != 0 or ps.get("dealer_id") != "21043" or ps.get("missing_is_not_zero") is not True:
        errs.append("privacy_and_safety: Service/Parts admitted 0, dealer 21043, missing_is_not_zero True required")
    # provenance
    hp = rec.get("help_pass", {})
    if hp.get("article_number") != "000001289":
        errs.append("help_pass.article_number must be 000001289")
    up = rec.get("ui_pass", {})
    if up.get("is_bookmark_read_only") is not True or up.get("no_definition_schedule_crm_filter_change") is not True:
        errs.append("ui_pass must record IsBookmarkReadOnly True + no definition/schedule/CRM/filter change")
    for host_key in ("catalog_host", "report_host"):
        h = str(up.get(host_key, ""))
        if "?" in h or "token=" in h.lower() or "&" in h:
            errs.append(f"ui_pass.{host_key} must be sanitized (query string/tokens omitted)")
    pp = rec.get("probe_pass", {})
    for k in ("downloaded_or_exported_or_pdf", "drilled_rows", "opened_customer_data"):
        if pp.get(k) is not False:
            errs.append(f"probe_pass.{k} must be False")
    if pp.get("tab_closed") is not True or pp.get("no_mutation") is not True:
        errs.append("probe_pass must record tab_closed True + no_mutation True")
    if co.get("report_name") != "_*Future Appointments & Confirmations":
        errs.append("candidate report_name drift")
    # forbidden SW-042-fact keys (value/numerator/denominator/grade/target) + any 'clean' key
    allkeys = _keys_recursive(rec)
    bad_keys = FORBIDDEN_SW042_FACT_KEYS & allkeys
    if bad_keys:
        errs.append(f"forbidden SW-042 fact key(s) present: {sorted(bad_keys)} (aggregates are not SW-042 num/den/value/grade)")
    clean_keys = sorted(k for k in allkeys if "clean" in k.lower())
    if clean_keys:
        errs.append(f"forbidden clean-claim key(s) present: {clean_keys} (scope is unverified; never 'clean')")
    # text scans: no un-negated assertive claim; no outright-forbidden claim
    hits = _asserts_unnegated(blob, _ASSERT)
    if hits:
        errs.append(f"assertive forbidden claim(s) present un-negated: {hits}")
    fb = [p for p in _FORBID if p in blob]
    if fb:
        errs.append(f"outright-forbidden clean/exportable/schedulable claim(s) present: {fb}")
    return errs


# --- R2: frozen prior-validator post-discovery classification (expected_stage_scope_only) ---
J2_OLD = "scripts/halo-phase1b/validate_pkt_03_01.py"
J1_OLD = "scripts/halo-phase1b/validate_pkt_03_01_binding.py"
J1_BIND_SHA = "e92a181f2a8016085011358ff256f627b2c11f09e4f37109f4276ecbfce10f8e"
J2_EXPECTED_COUNT, J2_PROBES = 3, 67
J1_EXPECTED_COUNT, J1_PROBES = 10, 54
J2_ERROR_SIGNATURE_SHA = "822f20b3407d18a91c91ff21811e63e814a06a4d04935d80e0f695e76007697d"
J1_ERROR_SIGNATURE_SHA = "aa1da893f3c9ca8ec20d07bd4b79f60da811c251d0336b6e63960a1f4e8f9562"


def _canon(arr):
    return hashlib.sha256(json.dumps(arr, separators=(",", ":"), ensure_ascii=False).encode("utf-8")).hexdigest()


def prior_validator_errors(j2_total, j2_failed, j2_errs, j1_total, j1_failed, j1_binding, j1_errs):
    """PURE: the frozen old-J2 and nested-J1 outputs must be EXACTLY the expected stage-scope signatures."""
    e = []
    # old J2
    if j2_total != J2_PROBES:
        e.append(f"prior_j2: probe total {j2_total} != {J2_PROBES}")
    if j2_failed != 0:
        e.append(f"prior_j2: failed probe {j2_failed} != 0")
    if len(j2_errs) != J2_EXPECTED_COUNT:
        e.append(f"prior_j2: error count {len(j2_errs)} != {J2_EXPECTED_COUNT}")
    if _canon(j2_errs) != J2_ERROR_SIGNATURE_SHA:
        e.append("prior_j2: canonical signature mismatch (swap/add/delete/semantic)")
    for x in j2_errs:
        if not (x.startswith("files touched outside allowlist:") or x.startswith("j1_stage_scope:")):
            e.append(f"prior_j2: non-stage-scope error present: {x[:60]}")
    if len(j2_errs) == 3:
        if not j2_errs[0].startswith("files touched outside allowlist:"):
            e.append("prior_j2 #1 not the files-touched-outside-allowlist error")
        else:
            import ast
            try:
                lst = ast.literal_eval(j2_errs[0].split("files touched outside allowlist: ", 1)[1])
            except Exception:  # noqa: BLE001
                lst = None
            if sorted(lst or []) != sorted(ALLOWLIST):
                e.append("prior_j2 #1 touched-paths != exactly the 3 SW-042 files (wrong/omitted/fourth path)")
        if "error count 10 != 4" not in j2_errs[1]:
            e.append("prior_j2 #2 not the nested-J1 count 10 != 4")
        if "canonical sha" not in j2_errs[2]:
            e.append("prior_j2 #3 not the nested-J1 canonical signature mismatch")
    # nested J1
    if j1_total != J1_PROBES:
        e.append(f"nested_j1: probe total {j1_total} != {J1_PROBES}")
    if j1_failed != 0:
        e.append(f"nested_j1: failed probe {j1_failed} != 0")
    if j1_binding != J1_BIND_SHA:
        e.append("nested_j1: binding sha drift")
    if len(j1_errs) != J1_EXPECTED_COUNT:
        e.append(f"nested_j1: error count {len(j1_errs)} != {J1_EXPECTED_COUNT}")
    if _canon(j1_errs) != J1_ERROR_SIGNATURE_SHA:
        e.append("nested_j1: canonical signature mismatch")
    return e


def _run_validator(rel):
    out = subprocess.run([sys.executable, os.path.join(REPO, rel), "--no-write"], capture_output=True, text=True)
    return json.loads(out.stdout)


def check_prior_validators(errs, info):
    j2 = _run_validator(J2_OLD)
    j1 = _run_validator(J1_OLD)
    j2_errs, j1_errs = j2.get("errors", []), j1.get("errors", [])
    info["prior_j2_validator_post_discovery"] = {
        "classification": "expected_stage_scope_only",
        "command": f"python3 {J2_OLD} --no-write",
        "adversarial_probes": f"{(j2.get('adversarial_probes_total') or 0) - (j2.get('adversarial_probes_failed') or 0)}/{j2.get('adversarial_probes_total')}",
        "expected_error_count": J2_EXPECTED_COUNT,
        "unexpected_error_count": max(0, len(j2_errs) - J2_EXPECTED_COUNT),
        "raw_error_array": j2_errs,
        "canonicalization": "compact UTF-8 JSON (separators (',',':'), ensure_ascii=False) of the ordered array",
        "error_signature_sha256": _canon(j2_errs),
        "expected_error_signature_sha256": J2_ERROR_SIGNATURE_SHA,
        "rationale": ("The frozen old-J2 validator (never edited) reacts to the three new SW-042 files (outside ITS 8-file "
                      "allowlist) and to the nested-J1 signature that the J2 commit itself changed. Its 67/67 probes and the "
                      "SW-042 content are intact; this is stage-scope only and is NEVER a PASS."),
        "nested_j1": {
            "command": f"python3 {J1_OLD} --no-write",
            "adversarial_probes": f"{(j1.get('adversarial_probes_total') or 0) - (j1.get('adversarial_probes_failed') or 0)}/{j1.get('adversarial_probes_total')}",
            "binding_sha256": j1.get("binding_sha256"),
            "expected_error_count": J1_EXPECTED_COUNT,
            "raw_error_array": j1_errs,
            "error_signature_sha256": _canon(j1_errs),
            "expected_error_signature_sha256": J1_ERROR_SIGNATURE_SHA,
        },
    }
    errs.extend(prior_validator_errors(
        j2.get("adversarial_probes_total"), j2.get("adversarial_probes_failed"), j2_errs,
        j1.get("adversarial_probes_total"), j1.get("adversarial_probes_failed"), j1.get("binding_sha256"), j1_errs))
    return {"j2_total": j2.get("adversarial_probes_total"), "j2_failed": j2.get("adversarial_probes_failed"), "j2_errs": j2_errs,
            "j1_total": j1.get("adversarial_probes_total"), "j1_failed": j1.get("adversarial_probes_failed"),
            "j1_binding": j1.get("binding_sha256"), "j1_errs": j1_errs}


def check_pins_live(errs):
    for name, (rel, want) in PINS.items():
        got = sha_file(os.path.join(REPO, rel))
        if got != want:
            errs.append(f"pinned {name}: live sha {got} != committed {want} (a committed artifact changed)")
    # record's own pins must equal the committed values
    rec = json.load(open(RECORD_PATH, encoding="utf-8"))
    rp = rec.get("pins", {})
    for name, (_rel, want) in PINS.items():
        if rp.get(name) != want:
            errs.append(f"record pins.{name} != committed sha")
    # SW-042 live binding + ledger row lifecycle must equal recorded unchanged lifecycle
    b = json.load(open(os.path.join(CB, "pkt-03-01-binding.json"), encoding="utf-8"))["metrics"]["SW-042"]
    row = {r["metric_id"]: r for r in json.load(open(os.path.join(CB, "master-ledger-295.json"), encoding="utf-8"))["rows"]}["SW-042"]
    if b.get("disposition") != "source_investigation_pending" or row.get("disposition") != "source_investigation_pending":
        errs.append("live SW-042 disposition != source_investigation_pending (row/binding changed)")
    if row.get("evaluation_state") != "not_measured" or row.get("acquisition_admission_state") != "not_acquired":
        errs.append("live SW-042 ledger row drifted (evaluation/acquisition)")


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


def run_probes(rec, prior=None):
    probes = []

    def rec_p(name, mutate):
        c = copy.deepcopy(rec)
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

    rec_p("contextual_delta_zero", lambda c: c["two_delta"].__setitem__("contextual_discovery_evidence_delta", 0))
    rec_p("acquisition_delta_one", lambda c: c["two_delta"].__setitem__("governed_source_data_acquisition_delta", 1))
    rec_p("admission_delta_one", lambda c: c["two_delta"].__setitem__("governed_source_data_admission_delta", 1))
    rec_p("meaning_delta_one", lambda c: c["two_delta"].__setitem__("metric_meaning_value_lifecycle_customer_delta", 1))
    rec_p("sales_only_clean_flag", lambda c: c["candidate_observation"].__setitem__("sales_only_clean", True))
    rec_p("sales_only_clean_text", lambda c: c["candidate_observation"].__setitem__("sales_only_scope_note", "The candidate was proved clean and verified sales-only."))
    rec_p("non_admitted_false", lambda c: c["candidate_observation"].__setitem__("non_admitted", False))
    rec_p("scope_unverified_dropped", lambda c: c["candidate_observation"].__setitem__("sales_only_scope_unverified", False))
    rec_p("acquired_admitted_lifecycle", lambda c: c["sw042_lifecycle_unchanged"].__setitem__("acquisition_admission_state", "admitted_held"))
    rec_p("sw042_measured", lambda c: c["sw042_lifecycle_unchanged"].__setitem__("evaluation_state", "measured_graded"))
    rec_p("sw042_gradable", lambda c: c["sw042_lifecycle_unchanged"].__setitem__("gradable", True))
    rec_p("sw042_alert", lambda c: c["sw042_lifecycle_unchanged"].__setitem__("alert_eligible", True))
    rec_p("sw042_visible", lambda c: c["sw042_lifecycle_unchanged"].__setitem__("customer_visibility", "visible"))
    rec_p("sw042_emission_true", lambda c: c["sw042_lifecycle_unchanged"].__setitem__("customer_emission_authority", True))
    rec_p("sw042_value_80", lambda c: c["candidate_observation"].__setitem__("sw042_value", 0.80))
    rec_p("numerator_denominator_61_76", lambda c: c["candidate_observation"].update({"numerator": 61, "denominator": 76}))
    rec_p("fifteen_within_24h", lambda c: c["candidate_observation"].__setitem__("unconfirmed_display", "15 within-24h failures for SW-042."))
    rec_p("sep04_mixed_into_week", lambda c: c["candidate_observation"]["future_pipeline_count"].__setitem__("note", "Counted within the 2026-08-24..2026-08-30 frozen week."))
    rec_p("sep04_date_drift", lambda c: c["candidate_observation"]["future_pipeline_count"].__setitem__("date", "2026-08-28"))
    rec_p("fabricated_period_proof", lambda c: c["candidate_observation"]["not_proved"].remove("period"))
    rec_p("fabricated_filter_proof", lambda c: c["candidate_observation"]["not_proved"].remove("filter"))
    rec_p("confirmed_date_as_hour_timestamp", lambda c: c.__setitem__("confirmed_date_note", "Confirmed Date proves hour precision and is an hour timestamp."))
    rec_p("confirmed_fields_removed_from_nonsubstitute", lambda c: c.__setitem__("non_substitute_fields", ["all aggregate counts"]))
    rec_p("invented_24h_anchor", lambda c: c["anchor_24h"].__setitem__("ratified", True))
    rec_p("exportable_claim", lambda c: c["candidate_observation"].__setitem__("exportable_note", "The report is exportable and schedulable."))
    rec_p("global_unavailable_flag", lambda c: c.__setitem__("global_unavailable_conclusion", True))
    rec_p("global_unavailable_text", lambda c: c.__setitem__("global_note", "VinSolutions is globally unavailable for this source."))
    rec_p("pii_captured", lambda c: c["privacy_and_safety"].__setitem__("pii_captured", True))
    rec_p("raw_rows_captured", lambda c: c["privacy_and_safety"].__setitem__("raw_rows_captured", True))
    rec_p("message_content_captured", lambda c: c["privacy_and_safety"].__setitem__("message_content_captured", True))
    rec_p("service_parts_captured", lambda c: c["privacy_and_safety"].__setitem__("no_identified_service_parts_rows_or_fields_captured", False))
    rec_p("candidate_source_sales_only_verified_true", lambda c: c["privacy_and_safety"].__setitem__("candidate_source_sales_only_verified", True))
    rec_p("operation_scope_sales_only_false", lambda c: c["privacy_and_safety"].__setitem__("operation_scope_sales_only", False))
    rec_p("sales_only_conflation_reintroduced", lambda c: c["privacy_and_safety"].__setitem__("sales_only", True))
    rec_p("conflate_zero_admitted_means_clean", lambda c: c["privacy_and_safety"].__setitem__("candidate_service_free_note", "Zero Service/Parts admitted proves the candidate aggregate is clean and verified sales-only."))
    rec_p("service_parts_admitted_nonzero", lambda c: c["privacy_and_safety"].__setitem__("service_parts_admitted", 3))
    rec_p("wrong_dealer", lambda c: c["privacy_and_safety"].__setitem__("dealer_id", "21044"))
    rec_p("wrong_binding_pin", lambda c: c["pins"].__setitem__("pkt_03_01_binding_sha256", "0" * 64))
    rec_p("wrong_ledger_pin", lambda c: c["pins"].__setitem__("master_ledger_295_sha256", "0" * 64))
    rec_p("baseline_drift", lambda c: c.__setitem__("baseline_commit", "deadbeef"))
    rec_p("metadata_change_not_none", lambda c: c.__setitem__("sw042_metadata_change", "disposition advanced"))
    rec_p("bookmark_readonly_false", lambda c: c["ui_pass"].__setitem__("is_bookmark_read_only", False))
    rec_p("host_with_tokens", lambda c: c["ui_pass"].__setitem__("report_host", "reporting-vinsolutions.app.coxautoinc.com/?token=abc123"))
    rec_p("mutation_recorded", lambda c: c["probe_pass"].__setitem__("no_mutation", False))
    rec_allow("nonallowlist_path_touch", set(ALLOWLIST) | {"docs/halo/contract/phase1b/master-ledger-295.json"}, False)
    rec_allow("claude_staged", set(ALLOWLIST), True)
    # --- R2: frozen prior-validator (old-J2 + nested-J1) stage-scope comparator probes ---
    if prior is not None:
        j2e, j1e = prior["j2_errs"], prior["j1_errs"]

        def rec_prior(name, j2t, j2f, j2errs, j1t, j1f, j1b, j1errs):
            e = prior_validator_errors(j2t, j2f, j2errs, j1t, j1f, j1b, j1errs)
            probes.append({"probe": name, "expected": "reject", "got": "reject" if e else "accept", "pass": bool(e), "n": len(e), "sample": e[0] if e else None})

        FILES_ERR = "files touched outside allowlist: " + repr(sorted(ALLOWLIST))
        rec_prior("prior_j2_same_count_swap", 67, 0, j2e[:2] + ["fabricated swap error"], 54, 0, J1_BIND_SHA, j1e)
        rec_prior("prior_j2_delete_one", 67, 0, j2e[:2], 54, 0, J1_BIND_SHA, j1e)
        rec_prior("prior_j2_add_one", 67, 0, j2e + ["extra error"], 54, 0, J1_BIND_SHA, j1e)
        rec_prior("prior_j2_wrong_path", 67, 0, ["files touched outside allowlist: " + repr(["docs/other.json", sorted(ALLOWLIST)[1], sorted(ALLOWLIST)[2]]), j2e[1], j2e[2]], 54, 0, J1_BIND_SHA, j1e)
        rec_prior("prior_j2_fourth_path", 67, 0, ["files touched outside allowlist: " + repr(sorted(ALLOWLIST) + ["docs/x.json"]), j2e[1], j2e[2]], 54, 0, J1_BIND_SHA, j1e)
        rec_prior("prior_j2_semantic_error", 67, 0, [j2e[0], j2e[1], "held SW-034: disposition promotion"], 54, 0, J1_BIND_SHA, j1e)
        rec_prior("prior_j2_probe_total_66", 66, 0, j2e, 54, 0, J1_BIND_SHA, j1e)
        rec_prior("prior_j2_failed_probe", 67, 1, j2e, 54, 0, J1_BIND_SHA, j1e)
        rec_prior("nested_j1_count_drift", 67, 0, j2e, 54, 0, J1_BIND_SHA, j1e[:9])
        rec_prior("nested_j1_signature_drift", 67, 0, j2e, 54, 0, J1_BIND_SHA, j1e[:9] + ["fabricated"])
        rec_prior("nested_j1_probe_drift", 67, 0, j2e, 53, 0, J1_BIND_SHA, j1e)
        rec_prior("nested_j1_binding_drift", 67, 0, j2e, 54, 0, "0" * 64, j1e)
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
    prior = check_prior_validators(errs, info)
    check_allowlist(errs, info)
    probes = run_probes(rec, prior)
    failed = [p for p in probes if not p["pass"]]
    overall = (not errs) and (not failed)

    result = {
        "check": "honda_watchdog_phase1b_pkt_03_01_sw042_discovery_memorialization",
        "phase": "Phase 1B — SW-042 finite read-only discovery memorialization (design/evidence only; CREATE-only)",
        "scope": "evidence_memorialization_only (no acquisition/admission/calculation/regrade/alert/customer/merge/deploy; SW-042 unchanged)",
        "baseline_commit": BASELINE_COMMIT,
        "record_file": "docs/halo/evidence/honda-watchdog/phase1b/pkt-03-01/PKT-03-01_SW-042_DISCOVERY_RESULT.json",
        "record_sha256": sha_file(RECORD_PATH),
        "allowlist_files": ALLOWLIST,
        "pins_unchanged": {k: v[1] for k, v in PINS.items()},
        "two_delta_split": rec.get("two_delta"),
        "sw042_metadata_change": rec.get("sw042_metadata_change"),
        "prior_j2_validator_post_discovery": info.get("prior_j2_validator_post_discovery"),
        "touched_vs_baseline": info.get("touched_vs_baseline"),
        "adversarial_probes_total": len(probes),
        "adversarial_probes_failed": len(failed),
        "adversarial_probes": probes,
        "errors": errs,
        "overall_pass": overall,
        "note": "Memorializes a positive candidate observation (non-admitted) and the unproved required source. SW-042 stays source_investigation_pending. Contextual evidence +1; governed acquisition/admission/meaning deltas 0. No PII/raw/content/Service-Parts; missing not zero.",
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
