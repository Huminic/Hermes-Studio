#!/usr/bin/env python3
"""
PKT-02-03 J2 activation validator (authoritative for the additive v2 packet/schema/registry).

Metadata/control activation only. Proves the J2 allowlist edit is safe and additive:
  - exact 10-file allowlist; no .claude staging; five frozen J1 artifacts byte-identical to pinned hashes;
    all non-allowlisted tracked files byte-identical to the baseline commit;
  - exact ordered 11 IDs, exact catalog bytes, exact 295 union/order/no-dup, 11 modules / 30 packets;
  - packet-schema-v2 additive validity + derived (packet_id -> binding path) authority ref + sha equality;
  - source-registry-v2 additive: v1 node byte-semantic, exactly one enhanced held node, pinned provenance/counts,
    zero Service/Parts, zero wrong-dealer, no content/PII derivative, capability-only (no promotion);
  - packet/binding/ledger parity (lifecycle/history/owners/eligibility/visibility/missing/source-dependency);
  - master non-target rows byte-identical; exactly 14 chained transitions across 8 changed rows; zero self-transitions;
    three unchanged transition arrays byte-identical; authoritative measured count 17 unchanged; Service overlay unchanged;
  - index version/note/PKT-02-03 question+status; every other packet record unchanged;
  - accepted_measured/customer_visible empty; zero values/grades/alerts/customer claims; quarantined legacy sources unusable;
  - source freshness distinct from J2 activation time; acyclic reference graph; deterministic receipt.
  - the legacy validate_phase1b.py delta is EXACTLY the six expected "source not registered" consequences of v1 being
    unable to read the additive v2 registry (classified, not a pass); the new validator validates those deps against v2.

Exit 0 == PASS. Usage: python3 scripts/halo-phase1b/validate_pkt_02_03.py [--out X] [--no-write]
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
DEFAULT_OUT = os.path.join(REPO, "docs", "halo", "evidence", "honda-watchdog", "phase1b", "pkt-02-03", "PKT-02-03_EXECUTION_CHECKS.json")

BASELINE_COMMIT = "9837bb9f2c5e7ea753deeb2db8005e64a8852294"
BIND_SHA = "41531eadeca87c725c6c9b0047c30c46b6e66ac27beaf6cf94c687d8af0aa23a"
SRCID = "SRC-enhanced_sales_communication_log_weekly-0002"
LEADS_SRCID = "SRC-vinsolutions_custom_reporting_leads-0001"
ACTIVATION_T = "2026-09-04T03:57:17Z"
LEDGER_INIT_T = "2026-09-02T06:51:10Z"

IDS = ["SW-135", "SW-136", "SW-137", "SW-138", "SW-139", "SW-140", "SW-141", "SW-261", "SW-262", "SW-288", "SW-295"]
ENH = ["SW-135", "SW-136", "SW-137", "SW-138", "SW-139", "SW-141"]
HIST = ["SW-261", "SW-295"]
SIP = ["SW-140", "SW-262", "SW-288"]

J1_FROZEN = {
    "docs/halo/contract/phase1b/pkt-02-03-binding.json": BIND_SHA,
    "scripts/halo-phase1b/validate_pkt_02_03_binding.py": "0e2d4f476ba13fd1dfbff662855bc56fd4efff03dbd137b2e1bcdcd19753e3a7",
    "docs/halo/evidence/honda-watchdog/phase1b/pkt-02-03/PKT-02-03_BINDING_CHECKS.json": "7c0c1f858eb54ce664a193591ed4ca58dc5e029c8a889fa7ad52800569045868",
    "docs/halo/evidence/honda-watchdog/phase1b/pkt-02-03/PKT-02-03_J1_TWO_DELTA.md": "e2381804a1048d487c2d938af3300f04693d0c1365517bab021546cd7c530b52",
    "docs/halo/evidence/honda-watchdog/phase1b/pkt-02-03/PKT-02-03_J1_internal_coverage_roadmap.md": "afcaff1b1977761c17c98e91bcf38ff94c3a3a022a6b26e4b9a4ebcb9a859421",
}
ALLOWLIST = sorted([
    "docs/halo/contract/phase1b/packets/PKT-02-03.json",
    "docs/halo/contract/phase1b/master-ledger-295.json",
    "docs/halo/contract/phase1b/packet-index.json",
    "docs/halo/contract/phase1b/packet-schema-1b-v2.json",
    "docs/halo/contract/phase1b/source-registry-1b-v2.json",
    "scripts/halo-phase1b/validate_pkt_02_03.py",
    "docs/halo/evidence/honda-watchdog/phase1b/pkt-02-03/PKT-02-03_EXECUTION_CHECKS.json",
    "docs/halo/evidence/honda-watchdog/phase1b/pkt-02-03/PKT-02-03_J2_run_manifest.json",
    "docs/halo/evidence/honda-watchdog/phase1b/pkt-02-03/PKT-02-03_J2_TWO_DELTA.md",
    "docs/halo/evidence/honda-watchdog/phase1b/pkt-02-03/PKT-02-03_J2_internal_companion.md",
])
BASELINE_LEGACY_ERROR_COUNT = 24
# canonical hash of the sorted, pinned baseline 24-error list (json.dumps(sorted(base), ensure_ascii=False))
BASELINE_LEGACY_SHA = "f8b9496337c6ad9a1c2a80ba1dc5465062000322e8e962919c05708ba5a2e7eb"
EXPECTED_NEW_LEGACY = sorted(f"ledger {m}: source {SRCID} not registered" for m in ENH)

FV = p1.FV
DISP_ADJ = FV["disposition"]["transitions"]
DISP_SES = FV["source_existence_state"]["disposition_consistency"]
DISP_EVAL = FV["disposition_evaluation_consistency"]["map"]
SES_ACQ = FV["source_existence_acquisition_matrix"]["allowed_pairs"]
REPORT_VOCAB = set(FV["report_acceptance_state"]["values"].keys())
LEDGER_OWNER_ENUM = {"codex", "claude_studio", "duane", "impartial_shadow"}
OWNER_MAP = {"Duane Wells": "duane", "Codex VinSolutions controller": "codex", "Claude Studio engineering": "claude_studio"}
DUANE_TECH_STEMS = ("acquir", "acquisit", "investigat", "accumulat", "admit", "admiss", "normaliz", "promot", "calculat", "implement")
SW295 = [f"SW-{i:03d}" for i in range(1, 296)]


def sha_bytes(b):
    return hashlib.sha256(b).hexdigest()


def sha_file(path):
    with open(path, "rb") as f:
        return sha_bytes(f.read())


def git_show(path):
    return subprocess.check_output(["git", "-C", REPO, "show", f"{BASELINE_COMMIT}:{path}"])


def load_local(rel):
    return json.load(open(os.path.join(REPO, rel), encoding="utf-8"))


def load_ctx():
    ctx = {}
    ctx["binding"] = load_local("docs/halo/contract/phase1b/pkt-02-03-binding.json")
    ctx["packet"] = load_local("docs/halo/contract/phase1b/packets/PKT-02-03.json")
    ctx["schema2"] = load_local("docs/halo/contract/phase1b/packet-schema-1b-v2.json")
    ctx["schema1"] = load_local("docs/halo/contract/phase1b/packet-schema-1b.json")
    ctx["reg2"] = load_local("docs/halo/contract/phase1b/source-registry-1b-v2.json")
    ctx["reg1"] = load_local("docs/halo/contract/phase1b/source-registry-1b.json")
    ctx["index_new"] = load_local("docs/halo/contract/phase1b/packet-index.json")
    ctx["ledger_new"] = load_local("docs/halo/contract/phase1b/master-ledger-295.json")
    ctx["index_old"] = json.loads(git_show("docs/halo/contract/phase1b/packet-index.json"))
    ctx["ledger_old"] = json.loads(git_show("docs/halo/contract/phase1b/master-ledger-295.json"))
    ctx["matrix"] = {e["metric_id"]: e for e in p1.load(os.path.join(C, "semantic-watchdog-feasibility-matrix-295.json"))}
    return ctx


# ---------------- structural checks (operate on ctx; probe-safe) ----------------

def check_ids_catalog_accounting(ctx, errs):
    pkt = ctx["packet"]
    if pkt.get("target_ids") != IDS:
        errs.append("packet.target_ids != exact ordered 11")
    mdefs = pkt.get("metric_definitions", [])
    if [m.get("metric_id") for m in mdefs] != IDS:
        errs.append("packet.metric_definitions order/ids != exact ordered 11")
    for m in mdefs:
        mid = m.get("metric_id")
        if mid in ctx["matrix"] and m.get("canonical_condition") != ctx["matrix"][mid]["condition"]:
            errs.append(f"packet {mid}: canonical_condition != catalog (byte)")
    idx = ctx["index_new"]
    prec = [p for p in idx["packets"] if p["packet_id"] == "PKT-02-03"]
    if not prec or prec[0]["target_ids"] != IDS:
        errs.append("packet-index PKT-02-03 target_ids != exact ordered 11")
    allids = [t for p in idx["packets"] for t in p["target_ids"]]
    if sorted(allids) != SW295:
        errs.append("packet-index union != exact 295")
    if len(allids) != len(set(allids)):
        errs.append("packet-index duplicate id assignment")
    if sorted({p["module"] for p in idx["packets"]}) != list(range(1, 12)):
        errs.append("packet-index modules != 1..11")
    if len(idx["packets"]) != 30:
        errs.append("packet-index packet count != 30")


def check_schema_v2(ctx, errs):
    s1, s2 = ctx["schema1"], ctx["schema2"]
    if s2.get("frozen") is not True:
        errs.append("packet-schema-v2 must be frozen:true (frozen control at pre-commit freeze state)")
    # ADDITIVE EXACT-DIFF: source_dependency + lifecycle schemas byte-semantic identical to v1
    for key in ("source_dependency_schema", "lifecycle_partition_schema"):
        if s2.get(key) != s1.get(key):
            errs.append(f"packet-schema-v2 {key} != v1 (must be byte-semantic identical; non-additive change)")
    # packet_schema identical to v1 EXCEPT the authority_binding subtree
    p1s = copy.deepcopy(s1["packet_schema"])
    p2s = copy.deepcopy(s2["packet_schema"])
    p1s["properties"]["authority_binding"] = "<NORM>"
    p2s["properties"]["authority_binding"] = "<NORM>"
    if p1s != p2s:
        errs.append("packet-schema-v2 packet_schema changed OUTSIDE authority_binding (non-additive: e.g. module.maximum / target_ids / required)")
    # authority_binding may differ ONLY in properties.ref and note
    ab1 = copy.deepcopy(s1["packet_schema"]["properties"]["authority_binding"])
    ab2 = copy.deepcopy(s2["packet_schema"]["properties"]["authority_binding"])
    for x in (ab1, ab2):
        x["properties"] = dict(x["properties"])
        x["properties"]["ref"] = "<NORM>"
        x.pop("note", None)
    if ab1 != ab2:
        errs.append("packet-schema-v2 authority_binding changed beyond the allowed ref rule + note")
    # v1 invariants preserved exactly as prefix (additive-only)
    if s2.get("invariants", [])[:len(s1["invariants"])] != s1["invariants"]:
        errs.append("packet-schema-v2 dropped/changed a v1 invariant (must be additive)")
    # ref rule shape: pattern, not const
    ab = s2["packet_schema"]["properties"]["authority_binding"]["properties"]["ref"]
    if "const" in ab:
        errs.append("packet-schema-v2 authority_binding.ref must NOT be a hard-coded const (packet-specific)")
    if not ab.get("pattern"):
        errs.append("packet-schema-v2 authority_binding.ref must carry a path pattern")
    # packet names v2 + derived ref/sha equality
    pkt = ctx["packet"]
    if pkt.get("schema") != "docs/halo/contract/phase1b/packet-schema-1b-v2.json":
        errs.append("packet.schema must name packet-schema-1b-v2.json")
    derived = f"docs/halo/contract/phase1b/{pkt['packet_id'].lower()}-binding.json"
    abnd = pkt.get("authority_binding", {})
    if abnd.get("ref") != derived:
        errs.append(f"packet authority_binding.ref '{abnd.get('ref')}' != derived-from-packet-id path '{derived}'")
    if abnd.get("sha256") != BIND_SHA:
        errs.append("packet authority_binding.sha256 != pinned J1 binding sha")


def check_registry_v2(ctx, errs):
    reg2, reg1 = ctx["reg2"], ctx["reg1"]
    if reg2.get("frozen") is not True:
        errs.append("source-registry-v2 must be frozen:true (frozen control at pre-commit freeze state)")
    # v1 PRESERVATION: profile, dealer, every node, every reuse receipt, every invariant (as prefix)
    if reg2.get("profile") != reg1.get("profile"):
        errs.append("source-registry-v2 profile != v1 profile")
    if reg2.get("dealer_id") != reg1.get("dealer_id"):
        errs.append("source-registry-v2 dealer_id != v1 dealer_id")
    n1 = {n["source_id"]: n for n in reg1.get("nodes", [])}
    n2 = {n["source_id"]: n for n in reg2.get("nodes", [])}
    for sid, node in n1.items():
        if n2.get(sid) != node:
            errs.append(f"source-registry-v2 v1 node {sid} changed (must be byte-semantic identical)")
    rr1 = reg1.get("reuse_receipts", {})
    rr2 = reg2.get("reuse_receipts", {})
    for sid, rr in rr1.items():
        if rr2.get(sid) != rr:
            errs.append(f"source-registry-v2 v1 reuse_receipt {sid} changed (must be byte-semantic identical)")
    if reg2.get("invariants", [])[:len(reg1["invariants"])] != reg1["invariants"]:
        errs.append("source-registry-v2 dropped/changed a v1 invariant (additive-only)")
    if not any(("SW-013" in i and "SW-014" in i) for i in reg2.get("invariants", [])):
        errs.append("source-registry-v2 missing the v1 SW-013/SW-014 Leads-exclusion invariant")
    nodes = n2
    # exactly one enhanced held node
    added = [sid for sid in nodes if sid not in n1]
    if added != [SRCID]:
        errs.append(f"source-registry-v2 must add exactly one node {SRCID}; got {added}")
    n = nodes.get(SRCID, {})
    if n.get("source_existence_state") != "acquired_local" or n.get("acquisition_admission_state") != "admitted_held":
        errs.append("enhanced node must be acquired_local + admitted_held")
    if n.get("dependent_metric_ids") != ENH:
        errs.append("enhanced node dependent_metric_ids != the six enhanced ids")
    hf = n.get("held_capability_facts", {})
    agg = hf.get("aggregate_21043", {})
    if agg != {"rows": 1530, "unique_communication_ids": 1530, "unique_lead_ids": 386, "service_parts_signal_rows": 0, "wrong_dealer_rows": 0}:
        errs.append("enhanced node aggregate_21043 counts != pinned (1530/1530/386/0/0)")
    if hf.get("stable_keys_present_in_restricted_raw") != ["Communication ID", "Lead ID", "Global Customer ID"]:
        errs.append("enhanced node must record the three stable keys present in restricted raw")
    if hf.get("stable_keys_in_permitted_committed_derivative") is not False or hf.get("message_content_in_permitted_committed_derivative") is not False:
        errs.append("enhanced node: stable keys / message content must be EXCLUDED from permitted committed derivative")
    if hf.get("contract_state") != "proposed_extension_pending_consumer_acceptance":
        errs.append("enhanced node contract_state must be proposed_extension_pending_consumer_acceptance (capability-only)")
    if "content/pii" not in str(hf.get("content_or_pii_derivative", "")).lower() and "none" not in str(hf.get("content_or_pii_derivative", "")).lower():
        errs.append("enhanced node must record no content/PII derivative")
    # freshness distinct from activation time
    if ACTIVATION_T in json.dumps(hf.get("captured_at", "")) or hf.get("captured_at", "").startswith("2026-09-04"):
        errs.append("enhanced node captured_at must reflect source freshness, not J2 activation time")
    # no promotion / no admitted_promoted anywhere in the added node
    if "admitted_promoted" in json.dumps(n):
        errs.append("enhanced node must not carry admitted_promoted (capability-only, no promotion)")
    # source_id pattern + family derivation
    if n.get("family") != "enhanced_sales_communication_log_weekly" or not SRCID.startswith("SRC-enhanced_sales_communication_log_weekly-"):
        errs.append("enhanced source_id must derive from the contract family (no alias)")


def _consistency(mid, disp, ses, acq, ev, errs, where):
    if disp in DISP_SES and ses not in DISP_SES[disp]:
        errs.append(f"{where} {mid}: source_existence '{ses}' inconsistent with disposition '{disp}'")
    if disp in DISP_EVAL and ev not in DISP_EVAL[disp]:
        errs.append(f"{where} {mid}: evaluation '{ev}' inconsistent with disposition '{disp}'")
    if ses in SES_ACQ and acq not in SES_ACQ[ses]:
        errs.append(f"{where} {mid}: acquisition '{acq}' invalid for source_existence '{ses}'")


def check_parity(ctx, errs):
    b = ctx["binding"]["metrics"]
    mdefs = {m["metric_id"]: m for m in ctx["packet"]["metric_definitions"]}
    rows = {r["metric_id"]: r for r in ctx["ledger_new"]["rows"]}
    lp = ctx["binding"]["lifecycle_partition"]
    bucket_of = {i: k for k, ids in lp.items() for i in ids}
    parity_fields = ["business_question", "population", "calculation_kind", "unit", "disposition",
                     "source_existence_state", "acquisition_admission_state", "evaluation_state",
                     "lifecycle_bucket", "boundary_class", "gradable", "alert_eligible",
                     "customer_visibility", "customer_projection", "missing_not_zero", "content_bytes_read",
                     "history_requirement", "direct_source_fields", "required_direct_fields_or_keys",
                     "missing_or_quarantine_evidence", "required_future_contract", "next_safe_source_action",
                     "next_action_owner", "immediate_action", "subsequent_actions", "accountable_owners",
                     "numerator", "denominator", "formula", "detection_rule", "threshold", "grade_target_id"]
    for mid in IDS:
        bm, md, row = b[mid], mdefs.get(mid, {}), rows[mid]
        # packet<->binding exact parity
        for f in parity_fields:
            if md.get(f) != bm.get(f):
                errs.append(f"parity {mid}: packet.{f} != binding")
        # packet source_dependency_ids
        want_dep = [SRCID] if mid in ENH else []
        if md.get("source_dependency_ids") != want_dep:
            errs.append(f"parity {mid}: packet.source_dependency_ids != {want_dep}")
        if row.get("source_dependency_ids") != want_dep:
            errs.append(f"parity {mid}: ledger.source_dependency_ids != {want_dep}")
        # ledger<->binding lifecycle parity
        if row.get("disposition") != bm["disposition"]:
            errs.append(f"parity {mid}: ledger.disposition != binding")
        if row.get("evaluation_state") != "not_measured":
            errs.append(f"parity {mid}: ledger.evaluation_state must be not_measured")
        _consistency(mid, row.get("disposition"), row.get("source_existence_state"), row.get("acquisition_admission_state"), row.get("evaluation_state"), errs, "ledger")
        if bucket_of.get(mid) != bm["lifecycle_bucket"]:
            errs.append(f"parity {mid}: binding bucket mismatch")
        # ledger report_acceptance_state vocab-valid (no invalid authored_non_measured)
        if row.get("report_acceptance_state") not in REPORT_VOCAB:
            errs.append(f"parity {mid}: ledger.report_acceptance_state '{row.get('report_acceptance_state')}' not in frozen vocab")
        # owner mapped from immediate owner; ledger next_action == binding immediate action; Duane never a technical action
        want_owner = OWNER_MAP.get(bm["immediate_action"]["owner"])
        if row.get("owner") != want_owner:
            errs.append(f"parity {mid}: ledger.owner '{row.get('owner')}' != mapped immediate owner '{want_owner}'")
        if row.get("owner") not in LEDGER_OWNER_ENUM:
            errs.append(f"parity {mid}: ledger.owner not in enum")
        if row.get("next_action") != bm["immediate_action"]["action"]:
            errs.append(f"parity {mid}: ledger.next_action != binding immediate_action.action")
        if row.get("owner") == "duane" and any(t in row.get("next_action", "").lower() for t in DUANE_TECH_STEMS):
            errs.append(f"parity {mid}: duane-owned ledger next_action contains a technical verb (forbidden)")
        # eligibility / visibility / measured-truth safety
        if bm.get("gradable") is not False or bm.get("alert_eligible") is not False:
            errs.append(f"parity {mid}: gradable/alert must be false")
        if bm.get("customer_visibility") != "hidden" or bm.get("customer_projection") is not None:
            errs.append(f"parity {mid}: must be hidden with null customer_projection")
        for vf in ("numerator", "denominator", "formula", "detection_rule", "threshold", "grade_target_id"):
            if bm.get(vf) is not None:
                errs.append(f"parity {mid}: {vf} must be null (no value/grade)")


def check_transitions(ctx, errs):
    old = {r["metric_id"]: r for r in ctx["ledger_old"]["rows"]}
    new = {r["metric_id"]: r for r in ctx["ledger_new"]["rows"]}
    total_added = 0
    for mid in IDS:
        o_tr, n_tr = old[mid]["transitions"], new[mid]["transitions"]
        added = len(n_tr) - len(o_tr)
        total_added += added
        expected_added = 2 if mid in ENH else (1 if mid in HIST else 0)
        if added != expected_added:
            errs.append(f"transitions {mid}: added {added} != expected {expected_added}")
        # prefix preserved (append-only)
        if n_tr[:len(o_tr)] != o_tr:
            errs.append(f"transitions {mid}: existing prefix altered (not append-only)")
        if mid in SIP and n_tr != o_tr:
            errs.append(f"transitions {mid}: SIP row transition array must be byte-identical (no self-transition)")
        # chain + adjacency + no self-transition + timestamps + terminal to==disposition
        for i in range(1, len(n_tr)):
            frm, to, at = n_tr[i]["from"], n_tr[i]["to"], n_tr[i]["at"]
            if frm != n_tr[i - 1]["to"]:
                errs.append(f"transitions {mid}[{i}]: from != previous to (chain break)")
            if frm == to:
                errs.append(f"transitions {mid}[{i}]: forbidden self-transition")
            elif to not in DISP_ADJ.get(frm, []):
                errs.append(f"transitions {mid}[{i}]: '{frm}'->'{to}' not in frozen adjacency")
            if at < n_tr[i - 1]["at"]:
                errs.append(f"transitions {mid}[{i}]: timestamp decreasing")
        if n_tr[-1]["to"] != new[mid]["disposition"]:
            errs.append(f"transitions {mid}: transitions[-1].to != disposition")
        # appended reasons distinct + activation-time
        for t in n_tr[len(o_tr):]:
            if t["at"] != ACTIVATION_T:
                errs.append(f"transitions {mid}: appended transition 'at' must equal J2 activation time")
            if t["by"] != "codex":
                errs.append(f"transitions {mid}: appended transition 'by' must be codex (metadata activation)")
        if mid in ENH:
            appended = n_tr[len(o_tr):]
            path = [(t["from"], t["to"]) for t in appended]
            if path != [("source_investigation_pending", "crm_available_acquisition_pending"), ("crm_available_acquisition_pending", "data_acquired_calculation_pending")]:
                errs.append(f"transitions {mid}: enhanced 2-step path incorrect {path}")
            if len(appended) >= 2 and appended[0]["reason"] == appended[1]["reason"]:
                errs.append(f"transitions {mid}: appended transitions need distinct reasons")
        if mid in HIST:
            appended = n_tr[len(o_tr):]
            if [(t["from"], t["to"]) for t in appended] != [("source_investigation_pending", "additional_history_required")]:
                errs.append(f"transitions {mid}: history direct transition incorrect")
    if total_added != 14:
        errs.append(f"transitions: total appended {total_added} != 14 across 8 changed rows")


def check_master_nontarget_overlay(ctx, errs):
    old = {r["metric_id"]: r for r in ctx["ledger_old"]["rows"]}
    new = {r["metric_id"]: r for r in ctx["ledger_new"]["rows"]}
    if [r["metric_id"] for r in ctx["ledger_old"]["rows"]] != [r["metric_id"] for r in ctx["ledger_new"]["rows"]]:
        errs.append("ledger row order/id set changed")
    for mid in old:
        if mid not in IDS and old[mid] != new[mid]:
            errs.append(f"non-target ledger row {mid} changed (must be byte-identical)")
    # top-level (excluding rows) identical
    if {k: v for k, v in ctx["ledger_old"].items() if k != "rows"} != {k: v for k, v in ctx["ledger_new"].items() if k != "rows"}:
        errs.append("ledger top-level (counts/version/provenance/truth) changed")
    if ctx["ledger_new"]["counts"].get("authoritative_evaluated") != 17:
        errs.append("authoritative_evaluated != 17")
    if ctx["ledger_new"]["authoritative_current_truth"]["evaluated_17"] != ctx["ledger_old"]["authoritative_current_truth"]["evaluated_17"]:
        errs.append("evaluated_17 list changed")
    # Service overlay + prior authoritative measured rows unchanged (covered by non-target check; assert count)
    overlay = [m for m in old if old[m].get("boundary_class") == "separate_serra_service"]
    if len(overlay) != 18:
        errs.append(f"Service overlay count {len(overlay)} != 18")
    for m in overlay:
        if old[m] != new[m]:
            errs.append(f"Service overlay row {m} changed")


def check_index(ctx, errs):
    old = {p["packet_id"]: p for p in ctx["index_old"]["packets"]}
    new = {p["packet_id"]: p for p in ctx["index_new"]["packets"]}
    if ctx["index_new"]["version"] != ctx["index_old"]["version"] + 1:
        errs.append("packet-index version not bumped by exactly 1")
    if "PKT-02-03 are active" not in ctx["index_new"]["note"] and "PKT-02-03" not in ctx["index_new"]["note"]:
        errs.append("packet-index note must record PKT-02-03 active")
    for pid in old:
        if pid == "PKT-02-03":
            continue
        if old[pid] != new[pid]:
            errs.append(f"packet-index record {pid} changed (only PKT-02-03 may change)")
    p = new["PKT-02-03"]
    if p.get("status") != "active_authored":
        errs.append("PKT-02-03 status != active_authored")
    if p.get("management_question") != ctx["binding"]["management_question"]:
        errs.append("PKT-02-03 management_question != exact frozen question")


def check_partition_and_customer(ctx, errs):
    lp = ctx["packet"]["lifecycle_partition"]
    sizes = {k: len(lp.get(k, [])) for k in lp}
    if sizes.get("accepted_measured_ids") != 0 or sizes.get("rejected_ids") != 0:
        errs.append("partition: accepted_measured/rejected must be empty")
    if sizes.get("accepted_disposition_only_ids") != 2 or sizes.get("source_investigation_pending_ids") != 3 or sizes.get("calculation_pending_ids") != 6:
        errs.append(f"partition sizes != 0/2/0/3/6 (got {sizes})")
    flat = [i for k in lp for i in lp[k]]
    if sorted(flat) != sorted(IDS):
        errs.append("partition union != 11 ids")
    cp = ctx["packet"].get("customer_projection", {})
    if cp.get("accepted_measured_ids") or cp.get("customer_visible_ids") or cp.get("customer_report_emitted") is not False:
        errs.append("packet customer_projection must be empty / no report emitted")
    # dealer + quarantine + no substitution
    b = ctx["binding"]
    if b["dealer_scope"]["service_parts_admitted"] != 0:
        errs.append("service_parts_admitted != 0")
    q = set(b["service_parts_zero_admission"]["quarantined_families"])
    if not {"cage_kpi", "sales_comm_log", "lead_source_roi"} <= q:
        errs.append("quarantined families incomplete")
    for m in ctx["packet"]["metric_definitions"]:
        fam = m.get("source_family", "")
        if fam in ("sales_comm_log", "cage_kpi", "lead_source_roi"):
            errs.append(f"{m['metric_id']}: sources a quarantined legacy family")
        if m["metric_id"] == "SW-262" and fam != "multi_source_join_leads_comm_appointments_sales_cage_roi":
            errs.append("SW-262: source substitution (must remain multi-source join)")
        if m.get("content_bytes_read") is not False:
            errs.append(f"{m['metric_id']}: content_bytes_read must be false")


def check_ref_graph_acyclic(ctx, errs):
    edges = [
        ("packets/PKT-02-03.json", "pkt-02-03-binding.json"),
        ("packets/PKT-02-03.json", "packet-schema-1b-v2.json"),
        ("packets/PKT-02-03.json", "source-registry-1b-v2.json"),
        ("source-registry-1b-v2.json", "enhanced-sales-communication-log-weekly-contract.json"),
        ("master-ledger-295.json", "source-registry-1b-v2.json"),
        ("pkt-02-03-binding.json", "semantic-watchdog-feasibility-matrix-295.json"),
    ]
    nodes = set(x for e in edges for x in e)
    adj = {n: [] for n in nodes}
    for a, bn in edges:
        adj[a].append(bn)
    color = {n: 0 for n in nodes}

    def dfs(u):
        color[u] = 1
        for v in adj[u]:
            if color[v] == 1 or (color[v] == 0 and dfs(v)):
                return True
        color[u] = 2
        return False
    if any(color[n] == 0 and dfs(n) for n in nodes):
        errs.append("reference graph contains a cycle")


def run_structural(ctx):
    errs = []
    check_ids_catalog_accounting(ctx, errs)
    check_schema_v2(ctx, errs)
    check_registry_v2(ctx, errs)
    check_parity(ctx, errs)
    check_transitions(ctx, errs)
    check_master_nontarget_overlay(ctx, errs)
    check_index(ctx, errs)
    check_partition_and_customer(ctx, errs)
    check_ref_graph_acyclic(ctx, errs)
    return errs


# ---------------- disk/git checks (main only) ----------------

def check_frozen_and_allowlist(errs, info):
    for rel, want in J1_FROZEN.items():
        got = sha_file(os.path.join(REPO, rel))
        if got != want:
            errs.append(f"J1 frozen artifact {rel} sha changed ({got})")
    # changed/untracked set (excluding .claude) == allowlist
    changed = subprocess.check_output(["git", "-C", REPO, "diff", "--name-only", BASELINE_COMMIT]).decode().split()
    st = subprocess.check_output(["git", "-C", REPO, "status", "--porcelain"]).decode().splitlines()
    untracked = [ln[3:] for ln in st if ln.startswith("??")]
    staged_claude = [ln for ln in st if ".claude/" in ln and (ln[0] in "AM")]
    touched = sorted(set(changed) | set(u for u in untracked if not u.startswith(".claude/")))
    # expand untracked dir (pkt-02-03/) to files
    expanded = set()
    for t in touched:
        full = os.path.join(REPO, t)
        if t.endswith("/") or os.path.isdir(full):
            for root, _, files in os.walk(full):
                for fn in files:
                    expanded.add(os.path.relpath(os.path.join(root, fn), REPO))
        else:
            expanded.add(t)
    # J1 five are pre-existing tracked (unchanged) -> not in changed; remove any that equal frozen
    receipt_rel = "docs/halo/evidence/honda-watchdog/phase1b/pkt-02-03/PKT-02-03_EXECUTION_CHECKS.json"
    extra = sorted(f for f in expanded if f not in ALLOWLIST)
    # the receipt is generated by THIS run; allow it to be absent during its own generation
    missing = sorted(f for f in ALLOWLIST if f != receipt_rel and not os.path.exists(os.path.join(REPO, f)))
    info["touched_vs_baseline"] = sorted(expanded)
    if extra:
        errs.append(f"files touched outside allowlist: {extra}")
    if missing:
        errs.append(f"allowlist files missing: {missing}")
    if staged_claude:
        errs.append(".claude/ is staged (forbidden)")


def legacy_delta_errors(now):
    """PURE: prove `now` == the pinned baseline 24 UNION exactly the six expected v2-source errors.
    Closes a same-count baseline swap (canonical hash of the remainder must equal the pinned signature)."""
    e = []
    now = list(now)
    if len(now) != len(set(now)):
        e.append("legacy: duplicate error entries")
    now_s = sorted(now)
    if len(now_s) != BASELINE_LEGACY_ERROR_COUNT + len(EXPECTED_NEW_LEGACY):
        e.append(f"legacy: total error count {len(now_s)} != {BASELINE_LEGACY_ERROR_COUNT}+{len(EXPECTED_NEW_LEGACY)}")
    for ex in EXPECTED_NEW_LEGACY:
        if ex not in now_s:
            e.append(f"legacy: expected v2-source error missing: {ex}")
    remaining = sorted(x for x in now_s if x not in EXPECTED_NEW_LEGACY)
    extra_src = [x for x in remaining if SRCID in x]
    if extra_src:
        e.append(f"legacy: unexpected v2-source error(s) beyond the six: {extra_src}")
    if len(remaining) != BASELINE_LEGACY_ERROR_COUNT:
        e.append(f"legacy: baseline remainder count {len(remaining)} != pinned {BASELINE_LEGACY_ERROR_COUNT}")
    canon = hashlib.sha256(json.dumps(remaining, ensure_ascii=False).encode()).hexdigest()
    if canon != BASELINE_LEGACY_SHA:
        e.append("legacy: baseline 24-error signature changed (same-count swap / removed / added baseline error)")
    for x in remaining:
        if any(t in x for t in IDS):
            e.append(f"legacy: new error on a PKT-02-03 target row: {x}")
    return e


def check_legacy_delta(errs, info):
    out = subprocess.run([sys.executable, os.path.join(REPO, "scripts", "halo-phase1b", "validate_phase1b.py"), "--no-write"],
                         capture_output=True, text=True)
    try:
        now = sorted(json.loads(out.stdout)["errors"])
    except Exception:
        errs.append("could not parse legacy validate_phase1b.py output")
        return None
    info["legacy_now_count"] = len(now)
    info["legacy_expected_new"] = EXPECTED_NEW_LEGACY
    info["legacy_baseline_sha"] = BASELINE_LEGACY_SHA
    errs.extend(legacy_delta_errors(now))
    return now


# ---------------- adversarial probes ----------------

def run_probes(ctx, legacy_now=None):
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

    def rec_legacy(name, synth):
        errs = legacy_delta_errors(synth)
        probes.append({"probe": name, "expected": "reject", "got": "reject" if errs else "accept", "pass": bool(errs), "n": len(errs), "sample": errs[0] if errs else None})

    def L(c, mid):
        return next(r for r in c["ledger_new"]["rows"] if r["metric_id"] == mid)

    rec("self_transition", lambda c: L(c, "SW-135")["transitions"].append({"from": "data_acquired_calculation_pending", "to": "data_acquired_calculation_pending", "at": ACTIVATION_T, "by": "codex", "reason": "x"}))
    rec("source_dependency_omission", lambda c: L(c, "SW-135").__setitem__("source_dependency_ids", []))
    rec("packet_dep_omission", lambda c: c["packet"]["metric_definitions"][0].__setitem__("source_dependency_ids", []))
    rec("schema_v1_hardcoded_ref", lambda c: c["packet"]["authority_binding"].__setitem__("ref", "docs/halo/contract/phase1b/pkt-02-01-binding.json"))
    rec("arbitrary_binding_ref", lambda c: c["packet"]["authority_binding"].__setitem__("ref", "docs/halo/contract/phase1b/some-other-binding.json"))
    rec("binding_sha_drift", lambda c: c["packet"]["authority_binding"].__setitem__("sha256", "0" * 64))
    rec("schema_v2_const_ref", lambda c: c["schema2"]["packet_schema"]["properties"]["authority_binding"]["properties"]["ref"].__setitem__("const", "x"))
    rec("source_node_promotion", lambda c: c["reg2"]["nodes"][1].__setitem__("acquisition_admission_state", "admitted_promoted"))
    rec("source_leakage_content", lambda c: c["reg2"]["nodes"][1]["held_capability_facts"].__setitem__("message_content_in_permitted_committed_derivative", True))
    rec("source_freshness_corruption", lambda c: c["reg2"]["nodes"][1]["held_capability_facts"].__setitem__("captured_at", ACTIVATION_T))
    rec("source_counts_corruption", lambda c: c["reg2"]["nodes"][1]["held_capability_facts"]["aggregate_21043"].__setitem__("service_parts_signal_rows", 3))
    rec("v1_node_mutation", lambda c: c["reg2"]["nodes"][0].__setitem__("acquisition_admission_state", "admitted_held"))
    rec("nontarget_ledger_drift", lambda c: next(r for r in c["ledger_new"]["rows"] if r["metric_id"] == "SW-011").__setitem__("disposition", "genuinely_not_available"))
    rec("authoritative_count_drift", lambda c: c["ledger_new"]["counts"].__setitem__("authoritative_evaluated", 16))
    rec("service_overlay_drift", lambda c: next(r for r in c["ledger_new"]["rows"] if r.get("boundary_class") == "separate_serra_service").__setitem__("disposition", "measured_validated"))
    rec("customer_projection_nonempty", lambda c: c["packet"]["customer_projection"].__setitem__("customer_visible_ids", ["SW-135"]))
    rec("value_injection", lambda c: c["packet"]["metric_definitions"][0].__setitem__("formula", "count(x)/y"))
    rec("binding_value_injection", lambda c: c["binding"]["metrics"]["SW-135"].__setitem__("formula", "count(x)/y"))
    rec("service_parts_admitted", lambda c: c["binding"]["dealer_scope"].__setitem__("service_parts_admitted", 1))
    rec("sw262_substitution", lambda c: c["packet"]["metric_definitions"][8].__setitem__("source_family", "enhanced_sales_communication_log_weekly"))
    rec("index_other_packet_drift", lambda c: c["index_new"]["packets"][0].__setitem__("status", "active_authored"))
    rec("index_status_wrong", lambda c: next(p for p in c["index_new"]["packets"] if p["packet_id"] == "PKT-02-03").__setitem__("status", "provisional_planning"))
    rec("enhanced_missing_second_step", lambda c: L(c, "SW-135")["transitions"].pop())
    rec("sip_self_transition_append", lambda c: L(c, "SW-140")["transitions"].append({"from": "source_investigation_pending", "to": "source_investigation_pending", "at": ACTIVATION_T, "by": "codex", "reason": "x"}))
    rec("duane_technical_next_action", lambda c: L(c, "SW-135").__setitem__("next_action", "Acquire and admit the enhanced derivative and implement the model."))
    rec("owner_mismap", lambda c: L(c, "SW-135").__setitem__("owner", "codex"))
    rec("report_state_invalid", lambda c: L(c, "SW-135").__setitem__("report_acceptance_state", "authored_non_measured"))
    rec("catalog_condition_tamper", lambda c: c["packet"]["metric_definitions"][0].__setitem__("canonical_condition", "tampered"))
    rec("target_id_drop", lambda c: c["packet"].__setitem__("target_ids", IDS[:-1]))
    # --- J2R1: registry v1-preservation probes ---
    rec("registry_changed_profile", lambda c: c["reg2"].__setitem__("profile", "wrong-profile"))
    rec("registry_changed_dealer", lambda c: c["reg2"].__setitem__("dealer_id", "99999"))
    rec("registry_dropped_sw013_014_invariant", lambda c: c["reg2"].__setitem__("invariants", [i for i in c["reg2"]["invariants"] if not ("SW-013" in i and "SW-014" in i)]))
    rec("registry_changed_v1_invariant", lambda c: c["reg2"]["invariants"].__setitem__(0, "tampered v1 invariant"))
    rec("registry_changed_v1_node", lambda c: c["reg2"]["nodes"][0].__setitem__("acquisition_admission_state", "admitted_held"))
    rec("registry_changed_v1_reuse_receipt", lambda c: c["reg2"]["reuse_receipts"][LEADS_SRCID].__setitem__("bytes", 1))
    rec("registry_frozen_false", lambda c: c["reg2"].__setitem__("frozen", False))
    # --- J2R1: schema additivity probes ---
    rec("schema_module_maximum_change", lambda c: c["schema2"]["packet_schema"]["properties"]["module"].__setitem__("maximum", 99))
    rec("schema_target_ids_change", lambda c: c["schema2"]["packet_schema"]["properties"]["target_ids"].__setitem__("maxItems", 99))
    rec("schema_source_dep_pattern_change", lambda c: c["schema2"]["source_dependency_schema"]["properties"]["source_id"].__setitem__("pattern", "^.*$"))
    rec("schema_dropped_v1_invariant", lambda c: c["schema2"].__setitem__("invariants", c["schema2"]["invariants"][1:]))
    rec("schema_frozen_false", lambda c: c["schema2"].__setitem__("frozen", False))
    # --- J2R1: exact legacy-delta probes (pure, on captured `now`) ---
    if legacy_now is not None:
        base = [e for e in legacy_now if e not in EXPECTED_NEW_LEGACY]
        rec_legacy("legacy_same_count_swap", (base[:-1] + ["ledger SW-999: fabricated swap error"]) + EXPECTED_NEW_LEGACY)
        rec_legacy("legacy_missing_expected", base + EXPECTED_NEW_LEGACY[:-1])
        rec_legacy("legacy_extra_expected", base + EXPECTED_NEW_LEGACY + [f"ledger SW-140: source {SRCID} not registered"])
        rec_legacy("legacy_removed_baseline_error", base[:-1] + EXPECTED_NEW_LEGACY)
    return probes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--no-write", action="store_true")
    args = ap.parse_args()

    ctx = load_ctx()
    info = {}
    errs = run_structural(ctx)
    check_frozen_and_allowlist(errs, info)
    legacy_now = check_legacy_delta(errs, info)
    probes = run_probes(ctx, legacy_now)
    failed = [p for p in probes if not p["pass"]]
    overall = (not errs) and (not failed)

    result = {
        "check": "honda_watchdog_phase1b_pkt_02_03_j2_activation",
        "phase": "Phase 1B — PKT-02-03 J2 metadata/control activation (additive v2 packet/schema/registry; no acquisition/value)",
        "scope": "metadata_activation_only (no acquire/read/export/analyze/admit/promote/calculate/grade/alert/customer/merge/deploy)",
        "baseline_commit": BASELINE_COMMIT,
        "allowlist_files": ALLOWLIST,
        "frozen_j1_artifacts": J1_FROZEN,
        "target_ids": IDS,
        "enhanced_source_id": SRCID,
        "activation_time_utc": ACTIVATION_T,
        "lifecycle_partition_sizes": {k: len(v) for k, v in ctx["packet"]["lifecycle_partition"].items()},
        "transitions_appended_total": 14,
        "v2_controls_frozen": {"packet-schema-1b-v2.json": True, "source-registry-1b-v2.json": True},
        "legacy_validate_phase1b": {
            "classification": "v1 cannot read the additive v2 source registry; the six new errors are the expected source-ID recognition consequence, not a passing result. v2 dependencies are validated by THIS validator.",
            "expected_new_errors": info.get("legacy_expected_new"),
            "now_error_count": info.get("legacy_now_count"),
            "pinned_baseline_error_count": BASELINE_LEGACY_ERROR_COUNT,
            "pinned_baseline_signature_sha256": BASELINE_LEGACY_SHA,
            "exactness": "now == pinned-baseline-24 (canonical hash) UNION exactly the six expected v2-source errors; same-count swap rejected",
        },
        "touched_vs_baseline": info.get("touched_vs_baseline"),
        "artifact_hashes": {rel: sha_file(os.path.join(REPO, rel)) for rel in ALLOWLIST if os.path.exists(os.path.join(REPO, rel)) and rel != "docs/halo/evidence/honda-watchdog/phase1b/pkt-02-03/PKT-02-03_EXECUTION_CHECKS.json"},
        "adversarial_probes_total": len(probes),
        "adversarial_probes_failed": len(failed),
        "adversarial_probes": probes,
        "errors": errs,
        "overall_pass": overall,
        "note": "Metadata-only activation: no values/formulas/grades/alerts/customer output; no content/PII/raw rows; enhanced source registered as already-held capability-only (no acquisition/admission/promotion).",
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
