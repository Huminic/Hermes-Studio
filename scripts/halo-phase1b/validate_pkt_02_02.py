#!/usr/bin/env python3
"""
PKT-02-02 packet execution validator (deterministic + adversarial), extending the
proven PKT-02-01 pattern. Design/evidence only: NO calculation, promotion, notification,
or source admission. Validates the PKT-02-02 packet, the master-ledger carry-forward for
the 11 non-conflict target IDs, the packet-index activation, and hard guards that protect
accepted business truth (the authoritative evaluated-17, the 18 separate-Service overlay,
and SW-133 held under authority conflict).

Baseline (pre-J7) commit for non-target immutability comparison: 6951c3282.
Exit 0 == PASS, 1 == FAIL. Usage: python3 scripts/halo-phase1b/validate_pkt_02_02.py
"""
from __future__ import annotations
import json, subprocess, sys, copy

BASELINE = "6951c3282c6c024bee2c9242e4913f8ec2cec532"
LEDGER = "docs/halo/contract/phase1b/master-ledger-295.json"
INDEX  = "docs/halo/contract/phase1b/packet-index.json"
PACKET = "docs/halo/contract/phase1b/packets/PKT-02-02.json"
BINDING= "docs/halo/contract/phase1b/pkt-02-02-binding.json"

TARGET_12 = ["SW-016","SW-017","SW-018","SW-084","SW-085","SW-086","SW-087","SW-088",
             "SW-089","SW-132","SW-133","SW-134"]
ELEVEN = [m for m in TARGET_12 if m != "SW-133"]

def _load(p): return json.load(open(p, encoding="utf-8"))
def _base(p): return json.loads(subprocess.check_output(["git","show",f"{BASELINE}:{p}"]))
def _rows(led): return {r["metric_id"]: r for r in led["rows"]}

# ---- core checks (each returns list of error strings) ----
def check_target_conservation(packet, index, binding):
    e=[]
    if packet["target_ids"] != TARGET_12: e.append("packet target_ids != exact 12")
    if len(set(packet["target_ids"]))!=12: e.append("packet target_ids not unique/12")
    ix=[p for p in index["packets"] if p["packet_id"]=="PKT-02-02"][0]
    if ix["target_ids"]!=TARGET_12: e.append("index PKT-02-02 target_ids != exact 12")
    if set(binding["metrics"].keys())!=set(TARGET_12): e.append("binding metric set != exact 12")
    part=packet["lifecycle_partition"]
    allids=(part["accepted_measured_ids"]+part["accepted_disposition_only_ids"]+part["rejected_ids"]
            +part["source_investigation_pending_ids"]+part["calculation_pending_ids"]+part["authority_conflict_held_ids"])
    if sorted(allids)!=sorted(TARGET_12): e.append("lifecycle_partition union != exact 12 (no dup/omit)")
    return e

def check_dispositions_match_binding(packet, binding):
    e=[]; md={m["metric_id"]:m for m in packet["metric_definitions"]}
    for m in ELEVEN:
        b=binding["metrics"][m]
        if md[m]["disposition"]!=b["disposition"]: e.append(f"{m} disposition != binding")
        if md[m]["evaluation_state"]!=b["evaluation_state"]: e.append(f"{m} evaluation_state != binding")
        if md[m]["evaluation_state"]=="measured_graded": e.append(f"{m} is measured_graded (promotion not allowed)")
        if md[m]["disposition"]=="measured_validated": e.append(f"{m} is measured_validated (promotion not allowed)")
    return e

def check_no_quarantined_promotes(packet):
    e=[]
    for m in packet["metric_definitions"]:
        mid=m["metric_id"]
        if mid=="SW-133": continue  # held under conflict; excluded from assertions
        if m.get("gradable"): e.append(f"{mid} gradable=true (no ratified target)")
        if m.get("alert_eligible"): e.append(f"{mid} alert_eligible=true (no ratified threshold)")
        obs=m.get("measured_unscored_observation")
        if obs and (obs.get("scored") or obs.get("promoted") or obs.get("alert_eligible")):
            e.append(f"{mid} supplemental observation is scored/promoted/alertable")
    return e

def check_sw133_held(packet, led, base_led):
    e=[]; md={m["metric_id"]:m for m in packet["metric_definitions"]}
    s=md["SW-133"]
    if "authority_conflict" not in s: e.append("SW-133 missing authority_conflict object")
    if s.get("pkt_02_02_assertion")!="withheld_pending_adjudication": e.append("SW-133 not withheld_pending_adjudication")
    if s.get("customer_visibility")!="hidden": e.append("SW-133 not customer-hidden")
    if "SW-133" not in packet["lifecycle_partition"]["authority_conflict_held_ids"]: e.append("SW-133 not in authority_conflict_held_ids")
    if _rows(led)["SW-133"]!=_rows(base_led)["SW-133"]: e.append("SW-133 ledger row CHANGED before adjudication")
    return e

def check_ledger_nontarget_unchanged(led, base_led):
    e=[]; c=_rows(led); h=_rows(base_led)
    if set(c)!=set(h): e.append("ledger metric-id set changed")
    changed=[m for m in h if json.dumps(h[m],sort_keys=True,ensure_ascii=False)!=json.dumps(c[m],sort_keys=True,ensure_ascii=False)]
    nontarget=[m for m in changed if m not in ELEVEN]
    if nontarget: e.append(f"NON-TARGET rows changed: {nontarget}")
    if sorted(changed)!=sorted(ELEVEN): e.append(f"changed set != exactly the 11 targets: {sorted(changed)}")
    # 18 separate-Service overlay untouched
    srv=[m for m,r in h.items() if r.get("boundary_class")=="separate_serra_service" and r.get("authoritative")]
    if len(srv)!=18: e.append(f"service overlay count != 18 ({len(srv)})")
    for m in srv:
        if c[m]!=h[m]: e.append(f"service overlay row {m} changed")
    return e

def check_authoritative_evaluated(led):
    e=[]
    real=sum(1 for r in led["rows"] if r.get("authoritative") and r.get("evaluation_state")=="measured_graded")
    if led["counts"]["authoritative_evaluated"]!=real:
        e.append(f"authoritative_evaluated {led['counts']['authoritative_evaluated']} != count(auth&measured_graded)={real}")
    if led["counts"]["authoritative_evaluated"]!=17:
        e.append(f"authoritative_evaluated != 17 (pre-adjudication) = {led['counts']['authoritative_evaluated']}")
    # never count separate-Service overlay as evaluated
    srv_graded=[r["metric_id"] for r in led["rows"] if r.get("boundary_class")=="separate_serra_service" and r.get("evaluation_state")=="measured_graded"]
    if srv_graded: e.append(f"separate-Service overlay counted as measured_graded: {srv_graded}")
    return e

def check_evaluated_17_unchanged(led, base_led):
    e=[]
    if led["authoritative_current_truth"]!=base_led["authoritative_current_truth"]:
        e.append("authoritative_current_truth (evaluated_17) changed")
    return e

def check_index_activation(index, base_index):
    e=[]
    if index["version"]<=base_index["version"]: e.append("index version not bumped")
    for pc,ph in zip(index["packets"], base_index["packets"]):
        if pc["packet_id"]!="PKT-02-02" and pc!=ph: e.append(f"non-target packet changed: {pc['packet_id']}")
    ix=[p for p in index["packets"] if p["packet_id"]=="PKT-02-02"][0]
    if ix["status"]!="active_authored": e.append("PKT-02-02 not active_authored")
    if not ix.get("management_question"): e.append("PKT-02-02 management_question missing")
    return e

def check_index_note_consistency(index):
    import re
    e=[]; note=index.get("note",""); active=[p["packet_id"] for p in index["packets"] if p["status"]=="active_authored"]
    for a in active:
        if a not in note: e.append(f"index note does not reflect active_authored packet {a}")
    for mo in re.finditer(r"Only (PKT-[0-9-]+) is active/authored", note):
        if set(active)!={mo.group(1)}: e.append(f"index note claims 'Only {mo.group(1)} is active/authored' but active set is {active}")
    return e

def check_customer_projection(packet, evidence_glob):
    import glob
    e=[]; acc=packet["lifecycle_partition"]["accepted_measured_ids"]
    cust_files=glob.glob(evidence_glob)
    projecting={"full","summary","footnote"}
    projected=[m["metric_id"] for m in packet["metric_definitions"] if m.get("customer_visibility") in projecting]
    if not acc:
        if cust_files: e.append(f"accepted_measured_ids empty but customer mini-report present: {cust_files}")
        if projected: e.append(f"accepted_measured_ids empty but metrics customer-projected: {projected}")
        cp=packet.get("customer_projection",{})
        if not cp.get("no_customer_mini_report_emitted"): e.append("customer_projection.no_customer_mini_report_emitted not True")
        if cp.get("customer_facing_claims_from_this_packet",0)!=0: e.append("customer_facing_claims_from_this_packet != 0 while accepted_measured empty")
    else:
        for m in projected:
            if m not in acc: e.append(f"metric {m} customer-projected but not in accepted_measured_ids")
    return e

CUST_GLOB="docs/halo/evidence/honda-watchdog/phase1b/pkt-02-02/*customer_mini_report*"

CORE = [
    ("target_conservation_exact", lambda P,B,L,BL,I,BI: check_target_conservation(P,I,B)),
    ("dispositions_match_binding_no_promotion", lambda P,B,L,BL,I,BI: check_dispositions_match_binding(P,B)),
    ("no_quarantined_or_unratified_promotion", lambda P,B,L,BL,I,BI: check_no_quarantined_promotes(P)),
    ("sw133_held_unchanged", lambda P,B,L,BL,I,BI: check_sw133_held(P,L,BL)),
    ("ledger_nontarget_and_service_overlay_immutable", lambda P,B,L,BL,I,BI: check_ledger_nontarget_unchanged(L,BL)),
    ("authoritative_evaluated_is_17_measured_graded", lambda P,B,L,BL,I,BI: check_authoritative_evaluated(L)),
    ("evaluated_17_unchanged", lambda P,B,L,BL,I,BI: check_evaluated_17_unchanged(L,BL)),
    ("index_activation_scoped", lambda P,B,L,BL,I,BI: check_index_activation(I,BI)),
    ("index_note_consistency", lambda P,B,L,BL,I,BI: check_index_note_consistency(I)),
    ("customer_projection_compliance", lambda P,B,L,BL,I,BI: check_customer_projection(P, CUST_GLOB)),
]

def run_core(P,B,L,BL,I,BI):
    results=[]
    for name,fn in CORE:
        errs=fn(P,B,L,BL,I,BI); results.append((name, not errs, errs))
    return results

# ---- adversarial probes: each mutates and asserts a check FAILS ----
def probes(P,B,L,BL,I,BI):
    out=[]
    def expect_fail(name, mutate, checkfn):
        m=copy.deepcopy(dict(P=P,B=B,L=L,BL=BL,I=I,BI=BI)); mutate(m)
        errs=checkfn(m); out.append((name, bool(errs)))
    # 1 service overlay counted as evaluated
    expect_fail("probe_service_overlay_counted_fails",
        lambda m: m["L"]["counts"].__setitem__("authoritative_evaluated", sum(1 for r in m["L"]["rows"] if r.get("authoritative"))),
        lambda m: check_authoritative_evaluated(m["L"]))
    # 2 a non-target row changed
    def mut_nontarget(m):
        for r in m["L"]["rows"]:
            if r["metric_id"]=="SW-011": r["disposition"]="rejected"
    expect_fail("probe_nontarget_row_change_fails", mut_nontarget, lambda m: check_ledger_nontarget_unchanged(m["L"], m["BL"]))
    # 3 SW-133 changed before adjudication
    def mut_sw133(m):
        for r in m["L"]["rows"]:
            if r["metric_id"]=="SW-133": r["evaluation_state"]="measured_unscored"
    expect_fail("probe_sw133_change_fails", mut_sw133, lambda m: check_sw133_held(m["P"], m["L"], m["BL"]))
    # 4 accepted-17 IDs changed
    def mut17(m):
        m["L"]["authoritative_current_truth"]=copy.deepcopy(m["L"]["authoritative_current_truth"])
        m["L"]["authoritative_current_truth"]["evaluated_17"]=m["L"]["authoritative_current_truth"]["evaluated_17"][:-1]
    expect_fail("probe_accepted17_change_fails", mut17, lambda m: check_evaluated_17_unchanged(m["L"], m["BL"]))
    # 5 a quarantined source promotes
    def mut_promote(m):
        for md in m["P"]["metric_definitions"]:
            if md["metric_id"]=="SW-086": md["alert_eligible"]=True
    expect_fail("probe_quarantined_promotes_fails", mut_promote, lambda m: check_no_quarantined_promotes(m["P"]))
    # 6 target conservation broken
    def mut_target(m):
        m["P"]=copy.deepcopy(m["P"]); m["P"]["target_ids"]=m["P"]["target_ids"][:-1]
    expect_fail("probe_target_conservation_break_fails", mut_target, lambda m: check_target_conservation(m["P"], m["I"], m["B"]))
    # 7 stale index note ("Only PKT-02-01 is active/authored")
    def mut_note(m):
        m["I"]=copy.deepcopy(m["I"]); m["I"]["note"]="Only PKT-02-01 is active/authored."
    expect_fail("probe_index_note_stale_fails", mut_note, lambda m: check_index_note_consistency(m["I"]))
    # 8 customer-projection of a non-measured metric while accepted_measured empty
    def mut_project(m):
        m["P"]=copy.deepcopy(m["P"])
        for md in m["P"]["metric_definitions"]:
            if md["metric_id"]=="SW-017": md["customer_visibility"]="full"
    expect_fail("probe_customer_projection_when_empty_fails", mut_project, lambda m: check_customer_projection(m["P"], CUST_GLOB))
    return out

def main():
    P=_load(PACKET); B=_load(BINDING); L=_load(LEDGER); I=_load(INDEX)
    BL=_base(LEDGER); BI=_base(INDEX)
    core=run_core(P,B,L,BL,I,BI)
    prb=probes(P,B,L,BL,I,BI)
    core_pass=all(ok for _,ok,_ in core); prb_pass=all(ok for _,ok in prb)
    report={"artifact":"pkt-02-02-packet-validation","baseline":BASELINE,
        "core_checks_run":len(core),"core_checks_passed":sum(1 for _,ok,_ in core if ok),
        "adversarial_probes_run":len(prb),"adversarial_probes_passed":sum(1 for _,ok in prb if ok),
        "authoritative_evaluated":L["counts"]["authoritative_evaluated"],
        "nontarget_semantic_diff_count":len([m for m in _rows(BL) if m not in ELEVEN and _rows(L)[m]!=_rows(BL)[m]]),
        "core":[{"name":n,"pass":ok,"errors":errs} for n,ok,errs in core],
        "probes":[{"name":n,"pass":ok} for n,ok in prb],
        "overall_pass":core_pass and prb_pass}
    print(json.dumps(report,indent=2,ensure_ascii=False))
    sys.exit(0 if report["overall_pass"] else 1)

if __name__=="__main__":
    main()
