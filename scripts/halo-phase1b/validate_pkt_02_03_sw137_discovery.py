#!/usr/bin/env python3
"""
PKT-02-03 SW-137 finite-discovery memorialization validator (design/evidence only, CREATE-only allowlist).

Validates the SW-137 channel-mismatch ordering finite read-only discovery record; preserves every frozen/committed
artifact byte-for-byte; classifies the seven older frozen git-baseline validators at the current with-files stage:
six are expected_stage_scope_only (never PASS) and the unaffected pkt_02_03_binding validator remains PASS (still_pass_unaffected).
Exit 0 == PASS.
Usage: python3 scripts/halo-phase1b/validate_pkt_02_03_sw137_discovery.py [--out X] [--no-write]
"""
from __future__ import annotations
import argparse, copy, hashlib, json, os, subprocess, sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CB = os.path.join(REPO, "docs", "halo", "contract", "phase1b")
EV = os.path.join(REPO, "docs", "halo", "evidence", "honda-watchdog", "phase1b", "pkt-02-03")
RECORD_PATH = os.path.join(EV, "PKT-02-03_SW-137_DISCOVERY_RESULT.json")
DEFAULT_OUT = os.path.join(EV, "PKT-02-03_SW-137_DISCOVERY_CHECKS.json")

BASELINE_COMMIT = "0f247b841575028ee4d68220626c66d57c642fb1"
PINS = {
 "pkt_02_03_binding_sha256": ("docs/halo/contract/phase1b/pkt-02-03-binding.json", "41531eadeca87c725c6c9b0047c30c46b6e66ac27beaf6cf94c687d8af0aa23a"),
 "pkt_02_03_binding_validator_sha256": ("scripts/halo-phase1b/validate_pkt_02_03_binding.py", "0e2d4f476ba13fd1dfbff662855bc56fd4efff03dbd137b2e1bcdcd19753e3a7"),
 "pkt_02_03_binding_checks_sha256": ("docs/halo/evidence/honda-watchdog/phase1b/pkt-02-03/PKT-02-03_BINDING_CHECKS.json", "7c0c1f858eb54ce664a193591ed4ca58dc5e029c8a889fa7ad52800569045868"),
 "pkt_02_03_j1_two_delta_sha256": ("docs/halo/evidence/honda-watchdog/phase1b/pkt-02-03/PKT-02-03_J1_TWO_DELTA.md", "e2381804a1048d487c2d938af3300f04693d0c1365517bab021546cd7c530b52"),
 "pkt_02_03_j1_roadmap_sha256": ("docs/halo/evidence/honda-watchdog/phase1b/pkt-02-03/PKT-02-03_J1_internal_coverage_roadmap.md", "afcaff1b1977761c17c98e91bcf38ff94c3a3a022a6b26e4b9a4ebcb9a859421"),
 "pkt_02_03_packet_sha256": ("docs/halo/contract/phase1b/packets/PKT-02-03.json", "71c5a2a086ba9ebcb6ad8dede26774499f9bfa7063022d10c372a268ad44b100"),
 "pkt_02_03_j2_validator_sha256": ("scripts/halo-phase1b/validate_pkt_02_03.py", "9862c42efdde2f9317894ed9b3c3fdc1038d539c1d0e9302f00ed8beb165127f"),
 "pkt_02_03_execution_checks_sha256": ("docs/halo/evidence/honda-watchdog/phase1b/pkt-02-03/PKT-02-03_EXECUTION_CHECKS.json", "655f21337c1b3fa6a3d94416fcc098a89480ce3eab2587f4798a4ec3393c6363"),
 "pkt_02_03_j2_run_manifest_sha256": ("docs/halo/evidence/honda-watchdog/phase1b/pkt-02-03/PKT-02-03_J2_run_manifest.json", "c9426d5bda970ad8c7fa9d49d7cead2587918912d54f50bb2799e778d71405e8"),
 "pkt_02_03_j2_two_delta_sha256": ("docs/halo/evidence/honda-watchdog/phase1b/pkt-02-03/PKT-02-03_J2_TWO_DELTA.md", "7c2406c795dc641b5c31439eeb396197bcf24f557c769c290d4bdc5dcec2dbdc"),
 "pkt_02_03_j2_internal_companion_sha256": ("docs/halo/evidence/honda-watchdog/phase1b/pkt-02-03/PKT-02-03_J2_internal_companion.md", "ca212141717f348f75ad68012fa817e8a34450682e31544e10ce77068127a775"),
 "master_ledger_295_sha256": ("docs/halo/contract/phase1b/master-ledger-295.json", "747b6d31796939ae29f3a31a0f57226e57342ad7c2b1a1737e05287a5af59d13"),
 "packet_index_sha256": ("docs/halo/contract/phase1b/packet-index.json", "e59331434ad8d0c06abda5df0a51ff5b4dfc94e3650876f91d0f233a29bbf83b"),
 "packet_schema_1b_v2_sha256": ("docs/halo/contract/phase1b/packet-schema-1b-v2.json", "f137762427c74c180acf4fced19124c498a5e1fc5a8641ebc376afc47c11c5f6"),
 "source_registry_1b_v2_sha256": ("docs/halo/contract/phase1b/source-registry-1b-v2.json", "bcf1bdbce0c824d495b8a6b0148fd4f65e08e0dcff6db18fa1ae6954ae4f928b"),
 "pkt_03_01_binding_sha256": ("docs/halo/contract/phase1b/pkt-03-01-binding.json", "e92a181f2a8016085011358ff256f627b2c11f09e4f37109f4276ecbfce10f8e"),
 "pkt_03_01_binding_validator_sha256": ("scripts/halo-phase1b/validate_pkt_03_01_binding.py", "9780a4150cb3d0093e0c1fa6888b7d01751941e886eefc4c85f20886ad8f26b5"),
 "pkt_03_01_j2_validator_sha256": ("scripts/halo-phase1b/validate_pkt_03_01.py", "6e32cdd2fba47a95e5a1a82674baed37fb6bd225c580d910632eb695c522375e"),
 "pkt_03_01_sw042_validator_sha256": ("scripts/halo-phase1b/validate_pkt_03_01_sw042_discovery.py", "729d0736b80240ecd088306a973410c1096087a2b898dd0ca249409fa26653c5"),
 "pkt_03_01_sw038_040_validator_sha256": ("scripts/halo-phase1b/validate_pkt_03_01_sw038_040_discovery.py", "e78654323ae0b05d72e57fd6d03847669d0625f4a1779ca8072eaedc0882e3dc"),
 "pkt_03_01_sw034_validator_sha256": ("scripts/halo-phase1b/validate_pkt_03_01_sw034_discovery.py", "1f64fad4a8c5fc387955e844a63bfbb3cfb31ab9922f3e4f58c7f9aca824661e"),
}
ALLOWLIST = sorted([
 "docs/halo/evidence/honda-watchdog/phase1b/pkt-02-03/PKT-02-03_SW-137_DISCOVERY_RESULT.json",
 "scripts/halo-phase1b/validate_pkt_02_03_sw137_discovery.py",
 "docs/halo/evidence/honda-watchdog/phase1b/pkt-02-03/PKT-02-03_SW-137_DISCOVERY_CHECKS.json",
])
RECEIPT_REL = "docs/halo/evidence/honda-watchdog/phase1b/pkt-02-03/PKT-02-03_SW-137_DISCOVERY_CHECKS.json"
EXPECTED_LIFECYCLE = {
 "disposition": "data_acquired_calculation_pending", "source_existence_state": "acquired_local",
 "acquisition_admission_state": "admitted_held", "evaluation_state": "not_measured", "authoritative": False,
 "gradable": False, "alert_eligible": False, "customer_visibility": "hidden", "future_display_eligibility": False,
 "customer_emission_authority": False, "report_acceptance_state": "withheld_no_delivery",
}
REQ_FIELDS = ["ordered inbound/outbound sequence at authoritative resolution", "channel per message (text vs email)",
              "ratified reply-adjacency window", "thread grouping key", "admitted stable keys"]
DUANE="Duane Wells"; CODEX="Codex VinSolutions controller"; STUDIO="Claude Studio engineering"
EXPECTED_OWNERS = {
 "adjacency_window_definition_ratification": DUANE,
 "authoritative_sequence_evidence_investigation_and_admission": CODEX,
 "ordering_normalization_implementation": STUDIO,
 "immediate_action_owner": CODEX, "next_action_owner": CODEX,
}
DUANE_TECHNICAL_ROLES = ("authoritative_sequence_evidence_investigation_and_admission", "ordering_normalization_implementation")
DUANE_STEMS = ("acquir","acquisit","investigat","accumulat","admit","admiss","normaliz","promot","calculat","implement","sequence_evidence")
PROHIBITED_OUTPUT_KEYS = {"value","calculated_value","numerator","denominator","formula","join_proved","bridge_proved",
                          "target","operational_target","threshold","grade","rating","detection_rule","alert","sequence_proved"}
_NEG = ("not ","never","no ","without","do not","must not","cannot","is not","are not","don't","exclude","unverified","only after","neither","nor ")
_ASSERT = ("missing is zero","treat missing as zero","seconds ordering proved","sequence ordering proved","authoritative ordering proved")
COLS15 = ["Dealer","User Group","User","Customer","Activity Date","Direction","Comm Channel","Comm Type","Interaction Result","Lead Type","Lead Status Type","Lead Status","Lead Source","Lead Created Date","Message Content"]

PRIOR = {
 "pkt_02_03": {"rel":"scripts/halo-phase1b/validate_pkt_02_03.py","count":11,"probes":45,"binding":None,"sha":"44aa6f93739fccc6bf38d09d9c3cadde51d5337ee344d9ab845a31841a3ca26b","expect_pass":False},
 "pkt_03_01_binding": {"rel":"scripts/halo-phase1b/validate_pkt_03_01_binding.py","count":19,"probes":54,"binding":"e92a181f2a8016085011358ff256f627b2c11f09e4f37109f4276ecbfce10f8e","sha":"52693f92d32a64cab07f89fee272577516a5824a6841f76db488ededb8fec22f","expect_pass":False},
 "pkt_03_01": {"rel":"scripts/halo-phase1b/validate_pkt_03_01.py","count":12,"probes":67,"binding":None,"sha":"617ff53ab75097bf87551eb58c13377ba25247403fd6bfa262f1f141e7231af6","expect_pass":False},
 "pkt_03_01_sw042": {"rel":"scripts/halo-phase1b/validate_pkt_03_01_sw042_discovery.py","count":23,"probes":58,"binding":None,"sha":"9445aba5379b846604d4480f5ab3c8f0606b39210a04f66ab2cbcec89e531e3d","expect_pass":False},
 "pkt_03_01_sw038_040": {"rel":"scripts/halo-phase1b/validate_pkt_03_01_sw038_040_discovery.py","count":13,"probes":73,"binding":None,"sha":"f0707ab4c5577452ce6ecc6f130534190b0174db891a04932c60cc585ae95f2c","expect_pass":False},
 "pkt_02_03_binding": {"rel":"scripts/halo-phase1b/validate_pkt_02_03_binding.py","count":0,"probes":49,"binding":"41531eadeca87c725c6c9b0047c30c46b6e66ac27beaf6cf94c687d8af0aa23a","sha":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945","expect_pass":True},
 "pkt_03_01_sw034": {"rel":"scripts/halo-phase1b/validate_pkt_03_01_sw034_discovery.py","count":12,"probes":90,"binding":None,"sha":"7bf130eec4847fe6c769c1ee1bce547bbc5c3681f8b5768ef98bd3222ac55bd4","expect_pass":False},
}


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
    if rec.get("metric_id")!="SW-137" or rec.get("packet_id")!="PKT-02-03": e.append("metric_id/packet_id drift")
    for name,(_r,want) in PINS.items():
        if rec.get("pins",{}).get(name)!=want: e.append(f"record pins.{name} != committed sha")
    s=rec.get("sw137",{})
    if s.get("canonical_condition")!="Rep replies to text with email (channel mismatch — customer disengages).": e.append("sw137.canonical_condition drift")
    for req in REQ_FIELDS:
        if req not in s.get("frozen_required_fields",[]): e.append(f"sw137.frozen_required_fields missing '{req}'")
    if s.get("metadata_change")!="none": e.append("sw137.metadata_change must be none")
    for sk in ("state_before","state_after"):
        st=s.get(sk,{})
        for k,v in EXPECTED_LIFECYCLE.items():
            if st.get(k)!=v: e.append(f"sw137.{sk}.{k} != {v}")
    if s.get("state_before")!=s.get("state_after"): e.append("sw137 state_before != state_after")
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
    pso=rec.get("positive_schema_observation",{})
    if pso.get("only_ordering_time_column")!="Activity Date": e.append("positive_schema: only_ordering_time_column must be Activity Date")
    for k in ("sequence_or_subminute_or_seconds_field_visible","communication_id_lead_id_global_customer_id_visible_in_default","filter_set","report_run"):
        if pso.get(k) is not False: e.append(f"positive_schema.{k} must be False")
    for k in ("visible_column_absence_is_not_unavailability","no_data_is_not_zero","report_opened_read_only_temp_tab"):
        if pso.get(k) is not True: e.append(f"positive_schema.{k} must be True")
    if pso.get("rows_returned")!=0: e.append("positive_schema.rows_returned must be 0")
    if pso.get("visible_column_names")!=COLS15: e.append("positive_schema.visible_column_names != exact 15 (metadata names only)")
    nho=rec.get("negative_help_observation",{})
    for k in ("knowledge_result","generated_answer_found","is_positive_evidence","is_global_unavailability_proof","disproves_cox_support_admin_custom_route"):
        if nho.get(k) is not False: e.append(f"negative_help_observation.{k} must be False")
    if nho.get("one_finite_search") is not True: e.append("negative_help_observation.one_finite_search must be True")
    efc=rec.get("enhanced_family_context",{})
    for k in ("communication_id_is_documented_chronological_sequence","receipt_reverified_this_pass","receipt_invalidated_this_pass","rows_content_pii_reread_or_persisted"):
        if efc.get(k) is not False: e.append(f"enhanced_family_context.{k} must be False")
    for k in ("communication_id_is_unique_stable","frozen_sales_only_aggregate_receipt_exists"):
        if efc.get(k) is not True: e.append(f"enhanced_family_context.{k} must be True")
    tsn=rec.get("transient_session_navigation",{})
    if tsn.get("session_material_stored") is not False or tsn.get("raw_url_query_or_token_persisted_reproduced_quoted_or_hashed") is not False:
        e.append("transient_session_navigation: no session material may be stored")
    cp=rec.get("candidate_pieces",{})
    for k in ("activity_date_minute_is_authoritative_ordering","communication_id_is_time_order","default_or_hidden_column_absence_is_global_unavailability","help_no_result_is_global_proof","no_data_report_is_zero"):
        if cp.get(k) is not False: e.append(f"candidate_pieces.{k} must be False")
    if cp.get("satisfies_frozen_requirements") is not False or cp.get("substitution_or_inference_forbidden") is not True: e.append("candidate_pieces satisfies/substitution flags wrong")
    ps=rec.get("privacy_and_safety",{})
    for k in ("rows_retrieved","source_bytes_captured","download_or_export","report_run","report_saved","filter_set","report_scheduled","crm_or_customer_mutation","message_content_captured","pii_captured","restricted_id_captured","service_parts_surface_or_data_touched","customer_output"):
        if ps.get(k) is not False: e.append(f"privacy_and_safety.{k} must be False")
    for k in ("operation_scope_sales_only","no_raw_url_query_or_token_stored","missing_is_not_zero","temp_tabs_closed","one_vinconnect_tab_remains"):
        if ps.get(k) is not True: e.append(f"privacy_and_safety.{k} must be True")
    if ps.get("service_parts_admitted")!=0 or ps.get("dealer_id")!="21043": e.append("privacy: Service/Parts 0 + dealer 21043")
    if "sales_only" in ps: e.append("privacy: bare sales_only key forbidden")
    if ps.get("candidate_source_sales_only_verified") is not False: e.append("candidate_source_sales_only_verified must be False (scoped to new candidate)")
    if rec.get("global_unavailability",{}).get("claimed") is not False: e.append("global_unavailability.claimed must be False")
    hip=rec.get("held_items_preserved",{})
    for k in ("sw137_unchanged","sw140_remains_held_unstarted_unchanged","sw035_036_037_remain_held_duane_gated","pkt_03_02_not_started_or_completed","no_silent_skip_or_completion","frozen_ledger_pin_preserves_all_other_held_retry_rows"):
        if hip.get(k) is not True: e.append(f"held_items_preserved.{k} must be True")
    bad=sorted(PROHIBITED_OUTPUT_KEYS & _all_keys(rec))
    if bad: e.append(f"prohibited metric-output key(s) present: {bad}")
    hits=_asserts_unnegated(blob,_ASSERT)
    if hits: e.append(f"assertive forbidden claim(s): {hits}")
    return e


def check_pins_live(errs):
    for name,(rel,want) in PINS.items():
        if sha_file(os.path.join(REPO,rel))!=want: errs.append(f"pinned {name}: live sha != committed")
    b=json.load(open(os.path.join(CB,"pkt-02-03-binding.json"),encoding="utf-8"))["metrics"]["SW-137"]
    row={r["metric_id"]:r for r in json.load(open(os.path.join(CB,"master-ledger-295.json"),encoding="utf-8"))["rows"]}["SW-137"]
    if b.get("disposition")!="data_acquired_calculation_pending" or row.get("disposition")!="data_acquired_calculation_pending":
        errs.append("live SW-137 disposition != data_acquired_calculation_pending")
    if row.get("evaluation_state")!="not_measured" or row.get("acquisition_admission_state")!="admitted_held":
        errs.append("live SW-137 ledger drift")


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


def _run(rel):
    return json.loads(subprocess.run([sys.executable,os.path.join(REPO,rel),"--no-write"],capture_output=True,text=True).stdout)
def prior_layer_errors(layer,r):
    p=PRIOR[layer]; e=[]; errs=r.get("errors",[])
    if r.get("adversarial_probes_total")!=p["probes"]: e.append(f"prior[{layer}]: probe total != {p['probes']}")
    if r.get("adversarial_probes_failed")!=0: e.append(f"prior[{layer}]: failed probe != 0")
    if p["binding"] is not None and r.get("binding_sha256")!=p["binding"]: e.append(f"prior[{layer}]: binding sha drift")
    if len(errs)!=p["count"]: e.append(f"prior[{layer}]: error count {len(errs)} != {p['count']}")
    if canon(errs)!=p["sha"]: e.append(f"prior[{layer}]: canonical signature mismatch")
    if p.get("expect_pass"):
        if r.get("overall_pass") is not True: e.append(f"prior[{layer}]: expected still-PASS (unaffected) but reported FAIL")
    else:
        if r.get("overall_pass") is True: e.append(f"prior[{layer}]: reported PASS (must be expected_stage_scope_only)")
    return e
def check_prior(errs,info):
    cap={}
    for layer in PRIOR:
        r=_run(PRIOR[layer]["rel"]); cap[layer]=r
        info.setdefault("prior_validators_post_discovery",{})[layer]={
         "classification":("still_pass_unaffected" if PRIOR[layer].get("expect_pass") else "expected_stage_scope_only"),"command":f"python3 {PRIOR[layer]['rel']} --no-write",
         "overall_pass":r.get("overall_pass"),
         "adversarial_probes":f"{(r.get('adversarial_probes_total') or 0)-(r.get('adversarial_probes_failed') or 0)}/{r.get('adversarial_probes_total')}",
         "binding_sha256":r.get("binding_sha256"),"expected_error_count":PRIOR[layer]["count"],
         "actual_error_count":len(r.get("errors",[])),"raw_error_array":r.get("errors",[]),
         "canonicalization":"compact UTF-8 JSON (separators (',',':'), ensure_ascii=False) of ordered array",
         "error_signature_sha256":canon(r.get("errors",[])),"expected_error_signature_sha256":PRIOR[layer]["sha"]}
        errs.extend(prior_layer_errors(layer,r))
    return cap


def run_probes(rec,cap):
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
    def rpr(name,layer,mut):
        r=copy.deepcopy(cap[layer]); mut(r); e=prior_layer_errors(layer,r)
        probes.append({"probe":name,"got":"reject" if e else "accept","pass":bool(e),"n":len(e)})
    S=lambda c: c["sw137"]
    for k in ("value","numerator","denominator","formula","join_proved","target","grade","rating","detection_rule","alert","threshold","sequence_proved"):
        rp(f"inject_{k}", (lambda kk: (lambda c: S(c).__setitem__(kk, 1)))(k))
    rp("nested_output_key", lambda c: c["candidate_pieces"].__setitem__("value",0.5))
    rp("sequence_subminute_proved", lambda c: c["positive_schema_observation"].__setitem__("sequence_or_subminute_or_seconds_field_visible",True))
    rp("commid_as_time_order", lambda c: c["candidate_pieces"].__setitem__("communication_id_is_time_order",True))
    rp("commid_documented_sequence", lambda c: c["enhanced_family_context"].__setitem__("communication_id_is_documented_chronological_sequence",True))
    rp("hidden_column_absence_global", lambda c: c["candidate_pieces"].__setitem__("default_or_hidden_column_absence_is_global_unavailability",True))
    rp("help_no_result_global", lambda c: c["candidate_pieces"].__setitem__("help_no_result_is_global_proof",True))
    rp("help_positive_evidence", lambda c: c["negative_help_observation"].__setitem__("is_positive_evidence",True))
    rp("no_data_as_zero", lambda c: c["candidate_pieces"].__setitem__("no_data_report_is_zero",True))
    rp("global_unavailable_flag", lambda c: c["global_unavailability"].__setitem__("claimed",True))
    rp("rows_stored", lambda c: c["privacy_and_safety"].__setitem__("rows_retrieved",True))
    rp("token_stored", lambda c: c["transient_session_navigation"].__setitem__("session_material_stored",True))
    rp("content_stored", lambda c: c["privacy_and_safety"].__setitem__("message_content_captured",True))
    rp("service_parts_admitted", lambda c: c["privacy_and_safety"].__setitem__("service_parts_admitted",1))
    rp("service_surface_touched", lambda c: c["privacy_and_safety"].__setitem__("service_parts_surface_or_data_touched",True))
    rp("run_filter_export", lambda c: c["privacy_and_safety"].__setitem__("report_run",True))
    rp("report_saved", lambda c: c["privacy_and_safety"].__setitem__("report_saved",True))
    rp("report_scheduled", lambda c: c["privacy_and_safety"].__setitem__("report_scheduled",True))
    rp("owner_collapse_duane_investigation", lambda c: S(c)["owners"].__setitem__("authoritative_sequence_evidence_investigation_and_admission",DUANE))
    rp("owner_collapse_duane_implementation", lambda c: S(c)["owners"].__setitem__("ordering_normalization_implementation",DUANE))
    rp("owner_immediate_duane", lambda c: S(c)["owners"].__setitem__("immediate_action_owner",DUANE))
    rp("sw137_promotion", lambda c: S(c)["state_after"].__setitem__("disposition","measured_validated"))
    rp("sw137_measured", lambda c: S(c)["state_after"].__setitem__("evaluation_state","measured_graded"))
    rp("sw137_visible", lambda c: S(c)["state_after"].__setitem__("customer_visibility","visible"))
    rp("state_mismatch", lambda c: S(c)["state_after"].__setitem__("evaluation_state","measured_unscored"))
    rp("candidate_source_verified", lambda c: c["privacy_and_safety"].__setitem__("candidate_source_sales_only_verified",True))
    rp("receipt_reverified_claim", lambda c: c["enhanced_family_context"].__setitem__("receipt_reverified_this_pass",True))
    rp("candidate_satisfies_frozen", lambda c: c["candidate_pieces"].__setitem__("satisfies_frozen_requirements",True))
    rp("sw140_silent_completion", lambda c: c["held_items_preserved"].__setitem__("sw140_remains_held_unstarted_unchanged",False))
    rp("sw035_037_silent_skip", lambda c: c["held_items_preserved"].__setitem__("sw035_036_037_remain_held_duane_gated",False))
    rp("pkt0302_silent_completion", lambda c: c["held_items_preserved"].__setitem__("pkt_03_02_not_started_or_completed",False))
    rp("wrong_binding_pin", lambda c: c["pins"].__setitem__("pkt_02_03_binding_sha256","0"*64))
    rp("baseline_drift", lambda c: c.__setitem__("baseline_commit","deadbeef"))
    rp("contextual_delta_zero", lambda c: c["two_delta"].__setitem__("contextual_discovery_evidence_delta",0))
    ra("nonallowlist_path_touch", set(ALLOWLIST)|{"docs/halo/contract/phase1b/master-ledger-295.json"}, False)
    ra("claude_staged", set(ALLOWLIST), True)
    for layer in PRIOR:
        rpr(f"prior_{layer}_swap", layer, lambda r: r.__setitem__("errors",(r["errors"][:-1]+["fab"]) if r["errors"] else ["fab"]))
        rpr(f"prior_{layer}_add", layer, lambda r: r.__setitem__("errors",r["errors"]+["extra"]))
        rpr(f"prior_{layer}_semantic", layer, lambda r: r.__setitem__("errors",(r["errors"][:-1]+["held SW-137: disposition promotion"]) if r["errors"] else ["held SW-137: disposition promotion"]))
        rpr(f"prior_{layer}_probe_total", layer, lambda r: r.__setitem__("adversarial_probes_total",(r.get("adversarial_probes_total") or 0)-1))
        rpr(f"prior_{layer}_failed", layer, lambda r: r.__setitem__("adversarial_probes_failed",1))
        if PRIOR[layer].get("expect_pass"):
            rpr(f"prior_{layer}_unexpected_fail", layer, lambda r: r.__setitem__("overall_pass",False))
        else:
            rpr(f"prior_{layer}_delete", layer, lambda r: r.__setitem__("errors",r["errors"][:-1]))
            rpr(f"prior_{layer}_pass", layer, lambda r: r.__setitem__("overall_pass",True))
    return probes


def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--out",default=DEFAULT_OUT); ap.add_argument("--no-write",action="store_true")
    args=ap.parse_args()
    rec=json.load(open(RECORD_PATH,encoding="utf-8")); info={}
    errs=run_structural(rec); check_pins_live(errs); cap=check_prior(errs,info); check_allowlist(errs,info)
    probes=run_probes(rec,cap); failed=[p for p in probes if not p["pass"]]
    overall=(not errs) and (not failed)
    result={
     "check":"honda_watchdog_phase1b_pkt_02_03_sw137_discovery_memorialization",
     "phase":"Phase 1B — SW-137 channel-mismatch ordering finite read-only discovery memorialization (design/evidence only; CREATE-only)",
     "scope":"evidence_memorialization_only (no acquisition/admission/calculation/regrade/alert/customer/merge/deploy; SW-137 unchanged)",
     "baseline_commit":BASELINE_COMMIT,"record_file":RECORD_PATH.replace(REPO+"/",""),"record_sha256":sha_file(RECORD_PATH),
     "allowlist_files":ALLOWLIST,"pins_unchanged":{k:v[1] for k,v in PINS.items()},
     "two_delta_split":rec.get("two_delta"),"sw137_held":EXPECTED_LIFECYCLE["disposition"],
     "held_items_preserved":rec.get("held_items_preserved"),
     "prior_validators_post_discovery":info.get("prior_validators_post_discovery"),
     "touched_vs_baseline":info.get("touched_vs_baseline"),
     "adversarial_probes_total":len(probes),"adversarial_probes_failed":len(failed),"adversarial_probes":probes,
     "errors":errs,"overall_pass":overall,
     "note":"One positive schema observation + one bounded negative Help observation; neither proves global unavailability. SW-137 held; contextual +1, governed deltas 0. Six older validators classified expected_stage_scope_only (never PASS); the unaffected pkt_02_03_binding validator remains PASS (still_pass_unaffected).",
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
