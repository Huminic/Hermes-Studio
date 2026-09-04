#!/usr/bin/env python3
"""
PKT-02-03 SW-140 finite read-only discovery memorialization validator (evidence only, CREATE-only allowlist).

Compact and self-contained: it does NOT recursively replay or embed the growing historical validator chain.
It pins/verifies exact frozen hashes + the baseline commit, runs the current pkt-02-03 binding validator ONCE as
the binding/integrity prerequisite, enforces the exact three-file CREATE-only allowlist, and validates the SW-140
inbound-voicemail source-investigation memorialization — including the fully disclosed, contained Service/Parts
metadata-surface incident (browser_scope_clean=false). Exit 0 == PASS.
Usage: python3 scripts/halo-phase1b/validate_pkt_02_03_sw140_discovery.py [--out X] [--no-write]
"""
from __future__ import annotations
import argparse, copy, hashlib, json, os, subprocess, sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CB = os.path.join(REPO, "docs", "halo", "contract", "phase1b")
EV = os.path.join(REPO, "docs", "halo", "evidence", "honda-watchdog", "phase1b", "pkt-02-03")
RECORD_PATH = os.path.join(EV, "PKT-02-03_SW-140_DISCOVERY_RESULT.json")
DEFAULT_OUT = os.path.join(EV, "PKT-02-03_SW-140_DISCOVERY_CHECKS.json")

BASELINE_COMMIT = "9bbd5e9ec587ce0fb4d08d38dece1972800b0351"
PINS = {
 "pkt_02_03_binding_sha256": ("docs/halo/contract/phase1b/pkt-02-03-binding.json", "41531eadeca87c725c6c9b0047c30c46b6e66ac27beaf6cf94c687d8af0aa23a"),
 "master_ledger_295_sha256": ("docs/halo/contract/phase1b/master-ledger-295.json", "747b6d31796939ae29f3a31a0f57226e57342ad7c2b1a1737e05287a5af59d13"),
 "packet_index_sha256": ("docs/halo/contract/phase1b/packet-index.json", "e59331434ad8d0c06abda5df0a51ff5b4dfc94e3650876f91d0f233a29bbf83b"),
 "packet_schema_1b_v2_sha256": ("docs/halo/contract/phase1b/packet-schema-1b-v2.json", "f137762427c74c180acf4fced19124c498a5e1fc5a8641ebc376afc47c11c5f6"),
 "source_registry_1b_v2_sha256": ("docs/halo/contract/phase1b/source-registry-1b-v2.json", "bcf1bdbce0c824d495b8a6b0148fd4f65e08e0dcff6db18fa1ae6954ae4f928b"),
 "pkt_02_03_binding_validator_sha256": ("scripts/halo-phase1b/validate_pkt_02_03_binding.py", "0e2d4f476ba13fd1dfbff662855bc56fd4efff03dbd137b2e1bcdcd19753e3a7"),
 "pkt_02_03_sw137_discovery_result_sha256": ("docs/halo/evidence/honda-watchdog/phase1b/pkt-02-03/PKT-02-03_SW-137_DISCOVERY_RESULT.json", "d07f8451b8406aab2757065544cae65f7082ad2840bbc6e09c4131dc0650fcb4"),
 "pkt_02_03_sw137_discovery_checks_sha256": ("docs/halo/evidence/honda-watchdog/phase1b/pkt-02-03/PKT-02-03_SW-137_DISCOVERY_CHECKS.json", "86593d628b4f9169f4a9711f629c0f32be0b60a4c83f82b7155659d6ff72a517"),
 "pkt_02_03_sw137_discovery_validator_sha256": ("scripts/halo-phase1b/validate_pkt_02_03_sw137_discovery.py", "a599a936afe4940d4868cbb8acdf97135805e34f4939ed30a87d4f91ddf62eec"),
}
ALLOWLIST = sorted([
 "docs/halo/evidence/honda-watchdog/phase1b/pkt-02-03/PKT-02-03_SW-140_DISCOVERY_RESULT.json",
 "scripts/halo-phase1b/validate_pkt_02_03_sw140_discovery.py",
 "docs/halo/evidence/honda-watchdog/phase1b/pkt-02-03/PKT-02-03_SW-140_DISCOVERY_CHECKS.json",
])
RECEIPT_REL = "docs/halo/evidence/honda-watchdog/phase1b/pkt-02-03/PKT-02-03_SW-140_DISCOVERY_CHECKS.json"
BINDING_VALIDATOR_REL = "scripts/halo-phase1b/validate_pkt_02_03_binding.py"
BINDING_EXPECT = {"probes": 49, "error_count": 0, "binding_sha256": "41531eadeca87c725c6c9b0047c30c46b6e66ac27beaf6cf94c687d8af0aa23a"}

EXPECTED_LIFECYCLE = {
 "disposition": "source_investigation_pending", "source_existence_state": "investigation_pending",
 "acquisition_admission_state": "not_acquired", "evaluation_state": "not_measured", "authoritative": False,
 "gradable": False, "alert_eligible": False, "customer_visibility": "hidden", "future_display_eligibility": False,
 "customer_emission_authority": False, "report_acceptance_state": "withheld_no_delivery",
}
REQ_FIELDS = ["actual inbound customer-voicemail event", "subsequent reply attempt + stable linkage key", "Global Customer ID"]
CANON_CONDITION = "No reply attempt after voicemail left by customer."
SEARCH_SEQUENCE = ["voicemail", "voice mail", "call", "phone", "custom"]
CANDIDATES = [
 ("Call Detail By Salesperson", "Call records that have been imported from a phone system arranged by salesperson."),
 ("Call Detail Records", "Provides information about call records that have been imported from a phone system."),
 ("Message Log", "List of received internet leads, emails, phone calls, and other messages."),
]
CAND_FALSE = ["opened", "rows_viewed", "source_bytes_captured", "sales_only_proved",
              "proves_actual_inbound_customer_voicemail_event", "proves_subsequent_reply_attempt_and_stable_linkage_key",
              "proves_global_customer_id"]
DUANE="Duane Wells"; CODEX="Codex VinSolutions controller"; STUDIO="Claude Studio engineering"
EXPECTED_OWNERS = {
 "unanswered_and_reply_definition": DUANE,
 "read_only_ui_schema_or_external_source_investigation": CODEX,
 "linkage_acquisition_implementation_once_source_proven": STUDIO,
 "immediate_action_owner": CODEX, "next_action_owner": CODEX,
}
DUANE_TECHNICAL_ROLES = ("read_only_ui_schema_or_external_source_investigation", "linkage_acquisition_implementation_once_source_proven")
DUANE_STEMS = ("acquir","acquisit","investigat","accumulat","admit","admiss","normaliz","promot","calculat","implement","linkage")
PROHIBITED_OUTPUT_KEYS = {"value","calculated_value","numerator","denominator","formula","join_proved","bridge_proved",
                          "target","operational_target","threshold","grade","rating","detection_rule","alert",
                          "customer_projection","ot_anchor","grade_target_id","grade_basis","grade_value_or_range",
                          "measured_unscored_observation"}
FORBIDDEN_CANDIDATE_BOUNDARY_KEYS = {"any_candidate_is_inbound_voicemail_source","any_candidate_is_usable_input",
                          "any_candidate_is_accepted_source","any_candidate_is_acquired_source",
                          "any_candidate_is_admitted_source","any_candidate_is_globally_unavailable_source"}
REQUIRED_CANDIDATE_BOUNDARY_FALSE = ("any_candidate_proved_inbound_voicemail_source","any_candidate_proved_usable_input",
                          "any_candidate_accepted_source_governance_state","any_candidate_acquired_source_governance_state",
                          "any_candidate_admitted_source_governance_state","global_unavailability_of_any_candidate_proved")
_NEG = ("not ","never","no ","without","do not","must not","cannot","is not","are not","don't","exclude","unverified",
        "unproved","only after","neither","nor ","false")
_ASSERT = ("missing is zero","treat missing as zero","zero unanswered voicemail","sales-only proved",
           "sales only scope proved","proved clean","browser pass was clean","scope proved clean","browser scope clean",
           "none is an inbound","none is a usable input","is a globally unavailable source","definitively not a source")


def sha_file(p):
    with open(p,"rb") as f: return hashlib.sha256(f.read()).hexdigest()
def canon(a): return hashlib.sha256(json.dumps(a,separators=(",",":"),ensure_ascii=False).encode()).hexdigest()
def blob_of(o):
    if isinstance(o,dict): return " ".join(blob_of(v) for v in o.values())
    if isinstance(o,list): return " ".join(blob_of(v) for v in o)
    return str(o)
def _all_keys(o):
    ks=set()
    if isinstance(o,dict):
        for k,v in o.items(): ks.add(k); ks|=_all_keys(v)
    elif isinstance(o,list):
        for v in o: ks|=_all_keys(v)
    return ks
def _asserts_unnegated(blob,pats):
    hits=[]
    for pat in pats:
        j=0
        while True:
            k=blob.find(pat,j)
            if k<0: break
            if not any(n in blob[max(0,k-40):k] for n in _NEG): hits.append(pat); break
            j=k+len(pat)
    return hits


def run_structural(rec):
    e=[]; blob=blob_of(rec).lower()
    if rec.get("baseline_commit")!=BASELINE_COMMIT: e.append("baseline_commit drift")
    if rec.get("metric_id")!="SW-140" or rec.get("packet_id")!="PKT-02-03": e.append("metric_id/packet_id drift")
    if rec.get("observation_start_utc") is not None: e.append("observation_start_utc must be null (start not recorded)")
    if rec.get("observation_end_utc")!="2026-09-04T08:01:28Z": e.append("observation_end_utc must be exactly 2026-09-04T08:01:28Z")
    for name,(_r,want) in PINS.items():
        if rec.get("pins",{}).get(name)!=want: e.append(f"record pins.{name} != committed sha")
    s=rec.get("sw140",{})
    if s.get("canonical_condition")!=CANON_CONDITION: e.append("sw140.canonical_condition drift")
    if s.get("frozen_required_fields")!=REQ_FIELDS: e.append("sw140.frozen_required_fields != exact three")
    if s.get("source_family")!="communication_plus_external_telephony": e.append("sw140.source_family drift")
    if s.get("metadata_change")!="none": e.append("sw140.metadata_change must be none")
    for sk in ("state_before","state_after"):
        st=s.get(sk,{})
        for k,v in EXPECTED_LIFECYCLE.items():
            if st.get(k)!=v: e.append(f"sw140.{sk}.{k} != {v}")
    if s.get("state_before")!=s.get("state_after"): e.append("sw140 state_before != state_after")
    ow=s.get("owners",{})
    for role,who in EXPECTED_OWNERS.items():
        if role not in ow: e.append(f"owners: role '{role}' missing")
        elif ow.get(role)!=who: e.append(f"owners.{role} != '{who}'")
    if sorted(set(ow.keys())-set(EXPECTED_OWNERS.keys())-{"note"}): e.append("owners: unexpected role(s)")
    for role,who in ow.items():
        if role=="note": continue
        if who==DUANE and (role in DUANE_TECHNICAL_ROLES or any(t in role.lower() for t in DUANE_STEMS)): e.append(f"owners: Duane on technical role '{role}'")
    if ow.get("immediate_action_owner")!=CODEX or ow.get("next_action_owner")!=CODEX: e.append("owners: immediate/next must be Codex")
    td=rec.get("two_delta",{})
    if td.get("contextual_discovery_evidence_delta")!=1: e.append("contextual delta must be 1")
    for k in ("governed_source_data_acquisition_delta","governed_source_data_admission_delta","metric_meaning_value_lifecycle_customer_delta"):
        if td.get(k)!=0: e.append(f"two_delta.{k} must be 0")
    rc=rec.get("report_center_metadata_pass",{})
    if rc.get("search_sequence")!=SEARCH_SEQUENCE: e.append("report_center_metadata_pass.search_sequence != exact sequence")
    for k in ("first_four_searches_returned_no_report_results","custom_search_returned_broad_mixed_report_title_list","no_report_opened","no_report_run","no_filter_set"):
        if rc.get(k) is not True: e.append(f"report_center_metadata_pass.{k} must be True")
    if rc.get("rows_viewed") is not False: e.append("report_center_metadata_pass.rows_viewed must be False")
    cands=rec.get("candidate_report_definitions",[])
    if len(cands)!=3: e.append("candidate_report_definitions must be exactly 3")
    for i,(nm,desc) in enumerate(CANDIDATES):
        c=cands[i] if i<len(cands) else {}
        if c.get("name")!=nm: e.append(f"candidate[{i}].name drift")
        if c.get("description")!=desc: e.append(f"candidate[{i}].description drift")
        for k in CAND_FALSE:
            if c.get(k) is not False: e.append(f"candidate[{i}].{k} must be False")
        if c.get("disposition")!="stopped_sales_scope_unproved": e.append(f"candidate[{i}].disposition must be stopped_sales_scope_unproved")
    cb=rec.get("candidate_boundary",{})
    for k in REQUIRED_CANDIDATE_BOUNDARY_FALSE:
        if cb.get(k) is not False: e.append(f"candidate_boundary.{k} must be False (proof-status)")
    forb=FORBIDDEN_CANDIDATE_BOUNDARY_KEYS & set(cb.keys())
    if forb: e.append(f"candidate_boundary: forbidden definitive key(s) reintroduced: {sorted(forb)}")
    if cb.get("stop_candidate_at_utc")!="2026-09-04T08:00:27Z": e.append("candidate_boundary.stop_candidate_at_utc drift")
    am=rec.get("outbound_answering_machine_boundary",{})
    if am.get("answering_machine_is_outbound_log_a_call_result_only") is not True: e.append("answering_machine outbound-only must be True")
    if am.get("answering_machine_as_inbound_voicemail_proxy") is not False: e.append("answering_machine inbound-voicemail proxy must be False")
    inc=rec.get("service_parts_metadata_surface_incident",{})
    if inc.get("service_parts_metadata_labels_incidentally_visible") is not True: e.append("incident: service_parts_metadata_labels_incidentally_visible must be True (no concealment)")
    for k in ("service_parts_report_opened","service_parts_rows_content_or_data_read","service_parts_source_bytes_acquired","browser_scope_clean"):
        if inc.get(k) is not False: e.append(f"incident.{k} must be False")
    if inc.get("service_parts_admitted")!=0: e.append("incident.service_parts_admitted must be 0")
    if inc.get("boundary_response")!="stopped_and_restored_safe_no_result_view": e.append("incident.boundary_response drift")
    if inc.get("safe_view_query")!="voicemail": e.append("incident.safe_view_query must be voicemail")
    if inc.get("safe_view_no_results") is not True: e.append("incident.safe_view_no_results must be True")
    if inc.get("incident_contained") is not True: e.append("incident.incident_contained must be True")
    fu=rec.get("final_ui_state",{})
    if fu.get("chrome_tabs")!=1: e.append("final_ui_state.chrome_tabs must be 1")
    if fu.get("authenticated_report_center") is not True or fu.get("no_results") is not True: e.append("final_ui_state authenticated/no_results must be True")
    if fu.get("query")!="voicemail": e.append("final_ui_state.query must be voicemail")
    gu=rec.get("global_unavailability",{})
    if gu.get("claimed") is not False: e.append("global_unavailability.claimed must be False")
    if gu.get("missing_not_zero") is not True: e.append("global_unavailability.missing_not_zero must be True")
    ps=rec.get("privacy_and_safety",{})
    for k in ("report_opened","report_run","filter_set","report_saved","report_exported","report_downloaded","report_scheduled","rows_retrieved","source_bytes_captured","message_content_captured","pii_captured","restricted_id_captured","crm_or_customer_mutation","customer_output","gmail_touched","db_touched","candidate_source_sales_only_verified","browser_scope_clean"):
        if ps.get(k) is not False: e.append(f"privacy_and_safety.{k} must be False")
    for k in ("operation_scope_sales_only","evidence_integrity_pass","no_raw_url_query_or_token_stored","missing_is_not_zero"):
        if ps.get(k) is not True: e.append(f"privacy_and_safety.{k} must be True")
    if ps.get("dealer_id")!="21043": e.append("privacy: dealer 21043")
    if ps.get("evidence_integrity_pass") is True and ps.get("browser_scope_clean") is not False:
        e.append("evidence_integrity_pass may be True only with browser_scope_clean=False")
    hip=rec.get("held_items_preserved",{})
    for k in ("sw140_investigation_recorded_state_unchanged","sw137_remains_memorialized_unchanged","sw035_036_037_remain_held_duane_gated","pkt_03_02_not_started_or_completed","no_silent_skip_or_completion","frozen_ledger_pin_preserves_all_other_held_retry_rows"):
        if hip.get(k) is not True: e.append(f"held_items_preserved.{k} must be True")
    bad=sorted(PROHIBITED_OUTPUT_KEYS & _all_keys(rec))
    if bad: e.append(f"prohibited metric-output key(s) present: {bad}")
    hits=_asserts_unnegated(blob,_ASSERT)
    if hits: e.append(f"assertive forbidden claim(s): {hits}")
    return e


def check_pins_live(errs):
    for name,(rel,want) in PINS.items():
        if sha_file(os.path.join(REPO,rel))!=want: errs.append(f"pinned {name}: live sha != committed")
    b=json.load(open(os.path.join(CB,"pkt-02-03-binding.json"),encoding="utf-8"))["metrics"]["SW-140"]
    row={r["metric_id"]:r for r in json.load(open(os.path.join(CB,"master-ledger-295.json"),encoding="utf-8"))["rows"]}["SW-140"]
    if b.get("disposition")!="source_investigation_pending" or row.get("disposition")!="source_investigation_pending":
        errs.append("live SW-140 disposition != source_investigation_pending")
    if row.get("evaluation_state")!="not_measured" or row.get("acquisition_admission_state")!="not_acquired":
        errs.append("live SW-140 ledger drift")


def run_binding_prereq():
    r=json.loads(subprocess.run([sys.executable,os.path.join(REPO,BINDING_VALIDATOR_REL),"--no-write"],capture_output=True,text=True).stdout)
    return r
def binding_prereq_errors(r):
    e=[]
    if r.get("overall_pass") is not True: e.append("binding prerequisite: overall_pass != True")
    if r.get("adversarial_probes_total")!=BINDING_EXPECT["probes"]: e.append(f"binding prerequisite: probe total != {BINDING_EXPECT['probes']}")
    if r.get("adversarial_probes_failed")!=0: e.append("binding prerequisite: failed probe != 0")
    if len(r.get("errors",[]))!=BINDING_EXPECT["error_count"]: e.append("binding prerequisite: error count != 0")
    if r.get("binding_sha256")!=BINDING_EXPECT["binding_sha256"]: e.append("binding prerequisite: binding sha drift")
    return e
def check_binding_prereq(errs,info):
    r=run_binding_prereq()
    errs.extend(binding_prereq_errors(r))
    tot=r.get("adversarial_probes_total") or 0; fail=r.get("adversarial_probes_failed") or 0
    info["binding_prerequisite"]={
     "command":f"python3 {BINDING_VALIDATOR_REL} --no-write","overall_pass":r.get("overall_pass"),
     "adversarial_probes":f"{tot-fail}/{tot}","error_count":len(r.get("errors",[])),"binding_sha256":r.get("binding_sha256"),
     "note":"Current binding/integrity prerequisite executed exactly once; full probe array intentionally not embedded.",
    }
    return r


def allowlist_errors(touched,staged_claude):
    e=[]
    extra=sorted(f for f in touched if f not in ALLOWLIST)
    if extra: e.append(f"files touched outside allowlist: {extra}")
    if staged_claude: e.append(".claude/ is staged (forbidden)")
    return e


def check_allowlist(errs,info):
    changed=subprocess.check_output(["git","-C",REPO,"diff","--name-only",BASELINE_COMMIT]).decode().split()
    st=subprocess.check_output(["git","-C",REPO,"status","--porcelain"]).decode().splitlines()
    untracked=[ln[3:] for ln in st if ln.startswith("??")]
    staged_claude=any(".claude/" in ln and ln[0] in "AM" for ln in st)
    touched=set(changed)
    for u in untracked:
        if u.startswith(".claude/"): continue
        full=os.path.join(REPO,u)
        if u.endswith("/") or os.path.isdir(full):
            for root,_,files in os.walk(full):
                for fn in files: touched.add(os.path.relpath(os.path.join(root,fn),REPO))
        else: touched.add(u)
    info["touched_vs_baseline"]=sorted(touched)
    errs.extend(allowlist_errors(touched,staged_claude))
    for f in changed: errs.append(f"tracked file mutated (must be zero): {f}")
    missing=[f for f in ALLOWLIST if f!=RECEIPT_REL and not os.path.exists(os.path.join(REPO,f))]
    if missing: errs.append(f"allowlist files missing: {missing}")


def run_probes(rec,bind):
    probes=[]
    def rp(name,mut):
        c=copy.deepcopy(rec)
        try:
            mut(c); e=run_structural(c)
        except Exception as ex:
            probes.append({"probe":name,"got":"CRASH","pass":False,"err":f"{type(ex).__name__}: {ex}"}); return
        probes.append({"probe":name,"got":"reject" if e else "accept","pass":bool(e),"n":len(e),"sample":e[0] if e else None})
    def ra(name,touched,claude):
        e=allowlist_errors(touched,claude); probes.append({"probe":name,"got":"reject" if e else "accept","pass":bool(e),"n":len(e)})
    def rb(name,mut):
        r=copy.deepcopy(bind); mut(r); e=binding_prereq_errors(r)
        probes.append({"probe":name,"got":"reject" if e else "accept","pass":bool(e),"n":len(e)})
    S=lambda c: c["sw140"]
    for k in ("value","numerator","denominator","formula","join_proved","target","grade","rating","detection_rule","alert","threshold","customer_projection","ot_anchor","grade_target_id","grade_basis","grade_value_or_range","measured_unscored_observation"):
        rp(f"inject_{k}", (lambda kk: (lambda c: S(c).__setitem__(kk, 1)))(k))
    rp("inject_customer_projection_obj", lambda c: S(c).__setitem__("customer_projection",{"incremental_sales":99}))
    rp("nested_output_key", lambda c: c["candidate_report_definitions"][0].__setitem__("value",1))
    rp("candidate_opened", lambda c: c["candidate_report_definitions"][0].__setitem__("opened",True))
    rp("candidate_rows_viewed", lambda c: c["candidate_report_definitions"][1].__setitem__("rows_viewed",True))
    rp("candidate_bytes_captured", lambda c: c["candidate_report_definitions"][2].__setitem__("source_bytes_captured",True))
    rp("candidate_sales_only_proved", lambda c: c["candidate_report_definitions"][0].__setitem__("sales_only_proved",True))
    rp("candidate_proves_voicemail", lambda c: c["candidate_report_definitions"][0].__setitem__("proves_actual_inbound_customer_voicemail_event",True))
    rp("candidate_proves_linkage", lambda c: c["candidate_report_definitions"][1].__setitem__("proves_subsequent_reply_attempt_and_stable_linkage_key",True))
    rp("candidate_proves_gcid", lambda c: c["candidate_report_definitions"][2].__setitem__("proves_global_customer_id",True))
    rp("candidate_promoted_disposition", lambda c: c["candidate_report_definitions"][0].__setitem__("disposition","acquired_admitted"))
    rp("cb_proved_inbound_voicemail", lambda c: c["candidate_boundary"].__setitem__("any_candidate_proved_inbound_voicemail_source",True))
    rp("cb_proved_usable_input", lambda c: c["candidate_boundary"].__setitem__("any_candidate_proved_usable_input",True))
    rp("cb_accepted_governance_true", lambda c: c["candidate_boundary"].__setitem__("any_candidate_accepted_source_governance_state",True))
    rp("cb_acquired_governance_true", lambda c: c["candidate_boundary"].__setitem__("any_candidate_acquired_source_governance_state",True))
    rp("cb_admitted_governance_true", lambda c: c["candidate_boundary"].__setitem__("any_candidate_admitted_source_governance_state",True))
    rp("cb_global_unavailability_proved", lambda c: c["candidate_boundary"].__setitem__("global_unavailability_of_any_candidate_proved",True))
    rp("cb_reintroduce_old_definitive_key", lambda c: c["candidate_boundary"].__setitem__("any_candidate_is_inbound_voicemail_source",False))
    rp("cb_definitive_phrase_note", lambda c: c["candidate_boundary"].__setitem__("note","None is an inbound customer-voicemail source; the candidate is definitively not a source."))
    rp("start_time_manufactured", lambda c: c.__setitem__("observation_start_utc","2026-09-04T08:00:27Z"))
    rp("end_time_drift", lambda c: c.__setitem__("observation_end_utc","2026-09-04T09:00:00Z"))
    rp("stop_time_drift", lambda c: c["candidate_boundary"].__setitem__("stop_candidate_at_utc","2026-09-04T07:00:00Z"))
    rp("answering_machine_proxy", lambda c: c["outbound_answering_machine_boundary"].__setitem__("answering_machine_as_inbound_voicemail_proxy",True))
    rp("incident_conceal_visibility", lambda c: c["service_parts_metadata_surface_incident"].__setitem__("service_parts_metadata_labels_incidentally_visible",False))
    rp("incident_browser_scope_clean_true", lambda c: c["service_parts_metadata_surface_incident"].__setitem__("browser_scope_clean",True))
    rp("incident_not_contained", lambda c: c["service_parts_metadata_surface_incident"].__setitem__("incident_contained",False))
    rp("incident_service_report_opened", lambda c: c["service_parts_metadata_surface_incident"].__setitem__("service_parts_report_opened",True))
    rp("incident_service_rows_read", lambda c: c["service_parts_metadata_surface_incident"].__setitem__("service_parts_rows_content_or_data_read",True))
    rp("incident_service_admitted", lambda c: c["service_parts_metadata_surface_incident"].__setitem__("service_parts_admitted",1))
    rp("privacy_browser_scope_clean_true", lambda c: c["privacy_and_safety"].__setitem__("browser_scope_clean",True))
    rp("privacy_candidate_verified", lambda c: c["privacy_and_safety"].__setitem__("candidate_source_sales_only_verified",True))
    rp("privacy_rows_retrieved", lambda c: c["privacy_and_safety"].__setitem__("rows_retrieved",True))
    rp("privacy_source_bytes", lambda c: c["privacy_and_safety"].__setitem__("source_bytes_captured",True))
    rp("privacy_content_captured", lambda c: c["privacy_and_safety"].__setitem__("message_content_captured",True))
    rp("privacy_restricted_id", lambda c: c["privacy_and_safety"].__setitem__("restricted_id_captured",True))
    rp("privacy_customer_output", lambda c: c["privacy_and_safety"].__setitem__("customer_output",True))
    rp("privacy_report_run", lambda c: c["privacy_and_safety"].__setitem__("report_run",True))
    rp("privacy_report_exported", lambda c: c["privacy_and_safety"].__setitem__("report_exported",True))
    rp("privacy_report_scheduled", lambda c: c["privacy_and_safety"].__setitem__("report_scheduled",True))
    rp("privacy_crm_mutation", lambda c: c["privacy_and_safety"].__setitem__("crm_or_customer_mutation",True))
    rp("global_unavailable_flag", lambda c: c["global_unavailability"].__setitem__("claimed",True))
    rp("missing_not_zero_false", lambda c: c["global_unavailability"].__setitem__("missing_not_zero",False))
    rp("search_sequence_drift", lambda c: c["report_center_metadata_pass"].__setitem__("search_sequence",["voicemail","call"]))
    rp("report_opened_flag", lambda c: c["report_center_metadata_pass"].__setitem__("no_report_opened",False))
    rp("owner_collapse_duane_investigation", lambda c: S(c)["owners"].__setitem__("read_only_ui_schema_or_external_source_investigation",DUANE))
    rp("owner_collapse_duane_implementation", lambda c: S(c)["owners"].__setitem__("linkage_acquisition_implementation_once_source_proven",DUANE))
    rp("owner_immediate_duane", lambda c: S(c)["owners"].__setitem__("immediate_action_owner",DUANE))
    rp("sw140_promotion", lambda c: S(c)["state_after"].__setitem__("disposition","measured_validated"))
    rp("sw140_acquired", lambda c: S(c)["state_after"].__setitem__("acquisition_admission_state","admitted_held"))
    rp("sw140_measured", lambda c: S(c)["state_after"].__setitem__("evaluation_state","measured_graded"))
    rp("sw140_visible", lambda c: S(c)["state_after"].__setitem__("customer_visibility","visible"))
    rp("source_existence_promotion", lambda c: S(c)["state_after"].__setitem__("source_existence_state","acquired_local"))
    rp("state_mismatch", lambda c: S(c)["state_after"].__setitem__("evaluation_state","measured_unscored"))
    rp("required_fields_drift", lambda c: S(c).__setitem__("frozen_required_fields",["something"]))
    rp("source_family_drift", lambda c: S(c).__setitem__("source_family","sales_only"))
    rp("sw137_silent_change", lambda c: c["held_items_preserved"].__setitem__("sw137_remains_memorialized_unchanged",False))
    rp("sw035_037_silent_skip", lambda c: c["held_items_preserved"].__setitem__("sw035_036_037_remain_held_duane_gated",False))
    rp("pkt0302_silent_completion", lambda c: c["held_items_preserved"].__setitem__("pkt_03_02_not_started_or_completed",False))
    rp("wrong_binding_pin", lambda c: c["pins"].__setitem__("pkt_02_03_binding_sha256","0"*64))
    rp("baseline_drift", lambda c: c.__setitem__("baseline_commit","deadbeef"))
    rp("contextual_delta_zero", lambda c: c["two_delta"].__setitem__("contextual_discovery_evidence_delta",0))
    rp("governed_delta_nonzero", lambda c: c["two_delta"].__setitem__("governed_source_data_acquisition_delta",1))
    ra("nonallowlist_path_touch", set(ALLOWLIST)|{"docs/halo/contract/phase1b/master-ledger-295.json"}, False)
    ra("claude_staged", set(ALLOWLIST), True)
    rb("binding_prereq_fail", lambda r: r.__setitem__("overall_pass",False))
    rb("binding_prereq_probe_drift", lambda r: r.__setitem__("adversarial_probes_total",48))
    rb("binding_prereq_error", lambda r: r.__setitem__("errors",["x"]))
    rb("binding_prereq_binding_drift", lambda r: r.__setitem__("binding_sha256","0"*64))
    return probes


def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--out",default=DEFAULT_OUT); ap.add_argument("--no-write",action="store_true")
    args=ap.parse_args()
    rec=json.load(open(RECORD_PATH,encoding="utf-8")); info={}
    errs=run_structural(rec); check_pins_live(errs); bind=check_binding_prereq(errs,info); check_allowlist(errs,info)
    probes=run_probes(rec,bind); failed=[p for p in probes if not p["pass"]]
    overall=(not errs) and (not failed)
    result={
     "check":"honda_watchdog_phase1b_pkt_02_03_sw140_discovery_memorialization",
     "phase":"Phase 1B — SW-140 inbound-voicemail source-investigation finite read-only discovery memorialization (evidence only; CREATE-only)",
     "scope":"evidence_memorialization_only (no acquisition/admission/calculation/grade/alert/customer/merge/deploy; SW-140 lifecycle unchanged)",
     "baseline_commit":BASELINE_COMMIT,"record_file":RECORD_PATH.replace(REPO+"/",""),"record_sha256":sha_file(RECORD_PATH),
     "allowlist_files":ALLOWLIST,"pins_unchanged":{k:v[1] for k,v in PINS.items()},
     "binding_prerequisite":info.get("binding_prerequisite"),
     "two_delta_split":rec.get("two_delta"),"sw140_held":EXPECTED_LIFECYCLE["disposition"],
     "service_parts_metadata_surface_incident":{
       "disclosed":True,"browser_scope_clean":False,"incident_contained":True,"service_parts_admitted":0,
       "note":"Contained Service/Parts metadata-surface incident is disclosed, not softened; browser_scope_clean is false; nothing opened/read/acquired/admitted.",
     },
     "held_items_preserved":rec.get("held_items_preserved"),
     "touched_vs_baseline":info.get("touched_vs_baseline"),
     "adversarial_probes_total":len(probes),"adversarial_probes_failed":len(failed),"adversarial_probes":probes,
     "errors":errs,"overall_pass":overall,
     "note":"Finite read-only Report Center metadata investigation for SW-140; three unopened candidate report definitions; contained Service/Parts metadata-surface incident (browser_scope_clean=false, fully disclosed). SW-140 lifecycle unchanged (source_investigation_pending / not_acquired / not_measured); contextual +1, governed deltas 0; global unavailability not claimed; missing is not zero; next action is HOLD. Binding prerequisite executed once (49/49, 0 errors).",
    }
    payload=json.dumps(result,indent=2,ensure_ascii=False)
    if not args.no_write:
        os.makedirs(os.path.dirname(args.out),exist_ok=True)
        open(args.out,"w",encoding="utf-8").write(payload+"\n")
    print(payload)
    print(f"\nRESULT: {'PASS' if overall else 'FAIL'} (errors {len(errs)}, probes {len(probes)-len(failed)}/{len(probes)})",file=sys.stderr)
    return 0 if overall else 1

if __name__=="__main__":
    raise SystemExit(main())
