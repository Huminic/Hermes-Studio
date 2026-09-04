#!/usr/bin/env python3
"""
PKT-03-01 J2 activation validator (authoritative for the metadata/control activation).

Proves the J2 edit is a truthful, bounded activation:
  - exact 8-file allowlist; no .claude staging; five frozen J1 artifacts + schema-v2 + registry-v2 + every other tracked
    path byte-identical to the baseline commit;
  - 4 accepted rows {SW-031,032,033,041} ledger-byte-identical to baseline (no recalc/regrade/drift); authoritative_evaluated=17;
  - 8 held rows {SW-034..040,042}: disposition source_investigation_pending unchanged, authoritative false, not_acquired,
    not_measured, deps [], transitions BYTE-IDENTICAL (0 new transitions, no self-transition); ONLY the metadata allowlist
    (source_existence_state=>investigation_pending, report_acceptance_state=>withheld_no_delivery, owner, evidence_ref,
    next_action, review_point, evidence_as_of=J2 activation time) changed; owners/actions/evidence-refs match frozen J1 binding;
  - packet metric_definitions equal the J1 binding field-for-field; packet + metric dependency arrays empty; no new registry node;
    authority_binding.ref derived from packet_id + sha == frozen J1 binding sha; schema-v2/registry-v2 unmodified;
  - packet partitions accepted 4 / held 8 / others empty; customer emission/report/visible false/empty; two-delta 0/12 + 0/12;
  - index: only PKT-03-01 -> active_authored + exact question; version +1; note; every other packet record unchanged;
  - zero Service/Parts; quarantined cage_kpi/lead_source_roi/sales_comm_log unusable; no substitution; no PII/raw/content;
  - legacy validate_phase1b.py == the pinned canonical 30-error signature UNION 0 new (same-count substitution rejected).

Pinned to baseline commit 844a1673d492774d9c69bb1f2555cb5a249573d3. Exit 0 == PASS.
Usage: python3 scripts/halo-phase1b/validate_pkt_03_01.py [--out X] [--no-write]
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
DEFAULT_OUT = os.path.join(REPO, "docs", "halo", "evidence", "honda-watchdog", "phase1b", "pkt-03-01", "PKT-03-01_EXECUTION_CHECKS.json")

BASELINE_COMMIT = "844a1673d492774d9c69bb1f2555cb5a249573d3"
BIND_SHA = "e92a181f2a8016085011358ff256f627b2c11f09e4f37109f4276ecbfce10f8e"
SCHEMA_V2_SHA = "f137762427c74c180acf4fced19124c498a5e1fc5a8641ebc376afc47c11c5f6"
REGISTRY_V2_SHA = "bcf1bdbce0c824d495b8a6b0148fd4f65e08e0dcff6db18fa1ae6954ae4f928b"
ACTIVATION_T = "2026-09-04T05:09:51Z"
LEGACY_BASELINE_SHA = "2cbf86a6361f4c67803807d5d7d7d496413a4b20924da42516ff80d7d3d46783"
LEGACY_BASELINE_COUNT = 30

# Frozen J1 binding validator, when RE-RUN after J2, reports exactly these four "expected_stage_scope_only" errors:
# its own point-in-time guards (pinned whole-ledger sha + its 5-file allowlist + tracked-mutation checks) reacting to
# J2's legitimate ledger/index changes. Analogous to the exact legacy-delta rule. Canonicalization = compact UTF-8 JSON
# (separators (',',':'), ensure_ascii=False) of the ordered error array.
J1_VALIDATOR = "scripts/halo-phase1b/validate_pkt_03_01_binding.py"
J1_PROBES_TOTAL_EXPECTED = 54
J1_ERROR_COUNT_EXPECTED = 4
J1_ERROR_SIGNATURE_SHA = "499f3684b0e278156b91f2fd783fc77776ab70c781a1cdb735db6f339ad0fa2d"

IDS = [f"SW-{i:03d}" for i in range(31, 43)]
ACC = ["SW-031", "SW-032", "SW-033", "SW-041"]
HELD = ["SW-034", "SW-035", "SW-036", "SW-037", "SW-038", "SW-039", "SW-040", "SW-042"]
HELD_META_FIELDS = {"source_existence_state", "report_acceptance_state", "owner", "evidence_as_of", "evidence_ref", "next_action", "review_point"}
OWNER_MAP = {"Duane Wells": "duane", "Codex VinSolutions controller": "codex", "Claude Studio engineering": "claude_studio"}
QUARANTINED = {"cage_kpi", "lead_source_roi", "sales_comm_log"}
SW295 = [f"SW-{i:03d}" for i in range(1, 296)]

J1_FROZEN = {
    "docs/halo/contract/phase1b/pkt-03-01-binding.json": BIND_SHA,
    "scripts/halo-phase1b/validate_pkt_03_01_binding.py": "9780a4150cb3d0093e0c1fa6888b7d01751941e886eefc4c85f20886ad8f26b5",
    "docs/halo/evidence/honda-watchdog/phase1b/pkt-03-01/PKT-03-01_BINDING_CHECKS.json": "21fd9f38af718ebc4807c2157382734af3b669984c2d85b20be8efbc2398544c",
    "docs/halo/evidence/honda-watchdog/phase1b/pkt-03-01/PKT-03-01_J1_TWO_DELTA.md": "64b0c186b18cf8f9ed2671793080eb931c17142a7e29f33e05afc3ccaf2e650a",
    "docs/halo/evidence/honda-watchdog/phase1b/pkt-03-01/PKT-03-01_J1_internal_coverage_roadmap.md": "eec0bde42aee79aa621abf181a43c785ed27d02c61039c09dc08d2b37ca9116c",
    "docs/halo/contract/phase1b/packet-schema-1b-v2.json": SCHEMA_V2_SHA,
    "docs/halo/contract/phase1b/source-registry-1b-v2.json": REGISTRY_V2_SHA,
}
ALLOWLIST = sorted([
    "docs/halo/contract/phase1b/packets/PKT-03-01.json",
    "docs/halo/contract/phase1b/master-ledger-295.json",
    "docs/halo/contract/phase1b/packet-index.json",
    "scripts/halo-phase1b/validate_pkt_03_01.py",
    "docs/halo/evidence/honda-watchdog/phase1b/pkt-03-01/PKT-03-01_EXECUTION_CHECKS.json",
    "docs/halo/evidence/honda-watchdog/phase1b/pkt-03-01/PKT-03-01_J2_run_manifest.json",
    "docs/halo/evidence/honda-watchdog/phase1b/pkt-03-01/PKT-03-01_J2_TWO_DELTA.md",
    "docs/halo/evidence/honda-watchdog/phase1b/pkt-03-01/PKT-03-01_J2_internal_companion.md",
])
RECEIPT_REL = "docs/halo/evidence/honda-watchdog/phase1b/pkt-03-01/PKT-03-01_EXECUTION_CHECKS.json"

# Exact packet contract (J2R2 hardening) — pinned to the current semantically-correct packet.
PACKET_TOP_KEYS = {"artifact", "schema", "packet_id", "module", "period", "management_question", "target_ids",
                   "source_reuse_note", "source_dependencies", "metric_definitions", "lifecycle_partition",
                   "stop_conditions", "two_delta_proof", "authority_binding", "customer_emission_authority",
                   "customer_projection", "accountable_owner_roster", "status"}
PACKET_ARTIFACT = "honda-watchdog-phase1b-packet-PKT-03-01"
PACKET_SCHEMA = "docs/halo/contract/phase1b/packet-schema-1b-v2.json"
PACKET_PERIOD = "2026-08-24..2026-08-30"
SOURCE_REUSE_NOTE = ("No source dependency is added: the 4 accepted metrics are authoritative carry-forward "
                     "(current_truth_ref); the 8 held metrics are source_investigation_pending with empty dependencies. "
                     "No new source-registry node; schema-v2/registry-v2 unmodified.")
TWO_DELTA_PROOF = {
    "evidence_delta": {"count": 0, "of": 12, "note": "4 accepted are carry-forward (not new evidence); 8 held acquired nothing."},
    "meaning_delta": {"count": 0, "of": 12, "note": "no value/grade authored or changed; accepted preserved; held produce none."},
}
INHERITED_CANONICAL = ["wrong_dealer", "service_parts_in_sales", "ambiguous_period", "schema_drift", "missing_provenance",
                       "protected_content_or_pii_outside_envelope", "formula_or_denominator_ambiguity", "incompatible_baseline",
                       "source_substitution_or_skip", "dirty_or_competing_writer", "production_or_customer_behavior_change"]
PACKET_SPECIFIC_STOPS = [
    "Four accepted metrics are carry-forward measured_validated; no recalculation/regrade; authoritative_evaluated=17.",
    "Eight held metrics remain source_investigation_pending (no value/grade/alert/customer projection); missing is not zero.",
    "Zero Service/Parts; cage_kpi/lead_source_roi/sales_comm_log quarantined and unusable; no substitution/inference.",
    "Customer emission authority FALSE; no PII/raw/message content.",
]
REPORT_VOCAB = set(p1.FV["report_acceptance_state"]["values"].keys())
LEDGER_OWNER_ENUM = {"codex", "claude_studio", "duane", "impartial_shadow"}


def sha_file(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def git_show(path):
    return subprocess.check_output(["git", "-C", REPO, "show", f"{BASELINE_COMMIT}:{path}"])


def load_local(rel):
    return json.load(open(os.path.join(REPO, rel), encoding="utf-8"))


def load_ctx():
    ctx = {}
    ctx["binding"] = load_local("docs/halo/contract/phase1b/pkt-03-01-binding.json")
    ctx["packet"] = load_local("docs/halo/contract/phase1b/packets/PKT-03-01.json")
    ctx["index_new"] = load_local("docs/halo/contract/phase1b/packet-index.json")
    ctx["index_old"] = json.loads(git_show("docs/halo/contract/phase1b/packet-index.json"))
    lnew = load_local("docs/halo/contract/phase1b/master-ledger-295.json")
    lold = json.loads(git_show("docs/halo/contract/phase1b/master-ledger-295.json"))
    ctx["ledger_new_full"] = lnew
    ctx["ledger_new"] = {r["metric_id"]: r for r in lnew["rows"]}
    ctx["ledger_old_full"] = lold
    ctx["ledger_old"] = {r["metric_id"]: r for r in lold["rows"]}
    ctx["matrix"] = {e["metric_id"]: e for e in p1.load(os.path.join(C, "semantic-watchdog-feasibility-matrix-295.json"))}
    return ctx


# ---------------- structural checks ----------------

def check_ids_catalog_accounting(ctx, errs):
    pkt = ctx["packet"]
    if pkt.get("target_ids") != IDS:
        errs.append("packet.target_ids != exact ordered 12")
    if [m.get("metric_id") for m in pkt.get("metric_definitions", [])] != IDS:
        errs.append("packet.metric_definitions order/ids != exact 12")
    if pkt.get("management_question") != ctx["binding"]["management_question"]:
        errs.append("packet.management_question != binding (scope drift)")
    for m in pkt.get("metric_definitions", []):
        mid = m.get("metric_id")
        if mid in ctx["matrix"] and m.get("canonical_condition") != ctx["matrix"][mid]["condition"]:
            errs.append(f"packet {mid}: canonical_condition != catalog")
    idx = ctx["index_new"]
    prec = [p for p in idx["packets"] if p["packet_id"] == "PKT-03-01"]
    if not prec or prec[0]["target_ids"] != IDS:
        errs.append("packet-index PKT-03-01 target_ids != exact 12")
    allids = [t for p in idx["packets"] for t in p["target_ids"]]
    if sorted(allids) != SW295 or len(allids) != len(set(allids)):
        errs.append("packet-index union != exact 295 unique")
    if sorted({p["module"] for p in idx["packets"]}) != list(range(1, 12)):
        errs.append("packet-index modules != 1..11")
    if len(idx["packets"]) != 30:
        errs.append("packet-index packet count != 30")


def check_packet_parity(ctx, errs):
    """EXACT deep equality: each packet metric_definition == binding.metrics[mid] plus ONLY the two structural keys
    {metric_id, source_dependency_ids}. Any extra field (calculated_value/new_grade/...) rejects."""
    b = ctx["binding"]["metrics"]
    mdefs = ctx["packet"]["metric_definitions"]
    if [m.get("metric_id") for m in mdefs] != IDS:
        errs.append("packet metric_definitions order/ids != exact 12")
        return
    for i, mid in enumerate(IDS):
        md, bm = mdefs[i], b[mid]
        allowed = set(bm.keys()) | {"metric_id", "source_dependency_ids"}
        if set(md.keys()) != allowed:
            extra = sorted(set(md.keys()) - allowed)
            missing = sorted(allowed - set(md.keys()))
            errs.append(f"packet {mid}: metric_definition key set != binding + {{metric_id, source_dependency_ids}} (extra={extra}, missing={missing})")
        for f in bm:
            if md.get(f) != bm.get(f):
                errs.append(f"packet {mid}: field '{f}' != J1 binding (exact deep equality)")
        if md.get("metric_id") != mid:
            errs.append(f"packet {mid}: metric_id mismatch")
        if md.get("source_dependency_ids") != []:
            errs.append(f"packet {mid}: source_dependency_ids must be [] (no dependency)")
    # authority binding derived + sha
    derived = f"docs/halo/contract/phase1b/{ctx['packet']['packet_id'].lower()}-binding.json"
    ab = ctx["packet"].get("authority_binding", {})
    if ab.get("ref") != derived:
        errs.append(f"packet authority_binding.ref != derived path '{derived}'")
    if ab.get("sha256") != BIND_SHA:
        errs.append("packet authority_binding.sha256 != frozen J1 binding sha")
    if ctx["packet"].get("schema") != "docs/halo/contract/phase1b/packet-schema-1b-v2.json":
        errs.append("packet.schema must name packet-schema-1b-v2.json")
    if ctx["packet"].get("source_dependencies") != []:
        errs.append("packet.source_dependencies must be [] (no new registry node)")


def check_packet_strict(ctx, errs):
    """J2R2: exact top-level key set + pinned values + exact lifecycle/two-delta/customer/roster/stop-conditions."""
    pk, b = ctx["packet"], ctx["binding"]
    if set(pk.keys()) != PACKET_TOP_KEYS:
        extra = sorted(set(pk.keys()) - PACKET_TOP_KEYS)
        missing = sorted(PACKET_TOP_KEYS - set(pk.keys()))
        errs.append(f"packet top-level key set drift (extra={extra}, missing={missing})")
    if pk.get("artifact") != PACKET_ARTIFACT:
        errs.append("packet.artifact drift")
    if pk.get("schema") != PACKET_SCHEMA:
        errs.append("packet.schema drift")
    if pk.get("packet_id") != "PKT-03-01":
        errs.append("packet.packet_id drift")
    if pk.get("module") != 3:
        errs.append("packet.module != 3")
    if pk.get("period") != PACKET_PERIOD or pk.get("period") != b.get("period"):
        errs.append("packet.period drift (must equal binding 2026-08-24..2026-08-30)")
    if pk.get("status") != "active_authored":
        errs.append("packet.status != active_authored")
    if pk.get("management_question") != b["management_question"]:
        errs.append("packet.management_question != binding")
    if pk.get("source_dependencies") != []:
        errs.append("packet.source_dependencies must be []")
    if pk.get("source_reuse_note") != SOURCE_REUSE_NOTE:
        errs.append("packet.source_reuse_note drift (must be the exact no-source note; no new source claim)")
    if pk.get("lifecycle_partition") != b["lifecycle_partition"]:
        errs.append("packet.lifecycle_partition != binding (exact; no extra bucket)")
    if pk.get("two_delta_proof") != TWO_DELTA_PROOF:
        errs.append("packet.two_delta_proof drift (must be exactly 0/12 + 0/12 with denominators + notes)")
    if pk.get("customer_emission_authority") is not False or b.get("customer_emission_authority") is not False:
        errs.append("customer_emission_authority must be exactly False (binding)")
    if pk.get("customer_projection") != b["customer_projection"]:
        errs.append("packet.customer_projection != binding (accepted 4 / visible [] / emitted false / note unchanged)")
    if pk.get("accountable_owner_roster") != b["accountable_owner_roster"]:
        errs.append("packet.accountable_owner_roster != binding roster (exact)")
    sc = pk.get("stop_conditions", {})
    if set(sc.keys()) != {"inherited_canonical", "packet_specific"}:
        errs.append("packet.stop_conditions key set drift")
    if sc.get("inherited_canonical") != INHERITED_CANONICAL:
        errs.append("packet.stop_conditions.inherited_canonical drift (all 11 canonical stops required, exact order)")
    if sc.get("packet_specific") != PACKET_SPECIFIC_STOPS:
        errs.append("packet.stop_conditions.packet_specific drift (all four statements required; no deletion/weakening, esp. Service/Parts)")


def check_partition(ctx, errs):
    lp = ctx["packet"]["lifecycle_partition"]
    if lp.get("accepted_measured_ids") != ACC:
        errs.append("packet accepted_measured_ids != exact 4")
    if sorted(lp.get("source_investigation_pending_ids") or []) != sorted(HELD):
        errs.append("packet source_investigation_pending_ids != exact 8")
    if lp.get("accepted_disposition_only_ids") or lp.get("rejected_ids") or lp.get("calculation_pending_ids"):
        errs.append("packet other partitions must be empty")


def check_accepted_preserved(ctx, errs):
    for mid in ACC:
        if ctx["ledger_new"].get(mid) != ctx["ledger_old"].get(mid):
            errs.append(f"accepted {mid}: ledger row changed vs baseline (byte-identical required; no recalc/regrade)")
    if ctx["ledger_new_full"]["counts"].get("authoritative_evaluated") != 17:
        errs.append("authoritative_evaluated != 17")


def check_held_activation(ctx, errs):
    bm = ctx["binding"]["metrics"]
    for mid in HELD:
        old, new, b = ctx["ledger_old"].get(mid, {}), ctx["ledger_new"].get(mid, {}), bm[mid]
        diff = {k for k in set(old) | set(new) if old.get(k) != new.get(k)}
        if not diff <= HELD_META_FIELDS:
            errs.append(f"held {mid}: changed fields {sorted(diff - HELD_META_FIELDS)} outside metadata allowlist")
        if new.get("transitions") != old.get("transitions"):
            errs.append(f"held {mid}: transitions changed (0 new transitions required; append-only/no self-transition)")
        if new.get("disposition") != "source_investigation_pending":
            errs.append(f"held {mid}: disposition must stay source_investigation_pending")
        if new.get("authoritative") is not False:
            errs.append(f"held {mid}: authoritative must stay False")
        if new.get("source_existence_state") != "investigation_pending":
            errs.append(f"held {mid}: source_existence_state must be investigation_pending")
        if new.get("acquisition_admission_state") != "not_acquired" or new.get("evaluation_state") != "not_measured":
            errs.append(f"held {mid}: acquisition/evaluation drift")
        if new.get("source_dependency_ids") != []:
            errs.append(f"held {mid}: source_dependency_ids must be []")
        if new.get("report_acceptance_state") != "withheld_no_delivery" or new.get("report_acceptance_state") not in REPORT_VOCAB:
            errs.append(f"held {mid}: report_acceptance_state must be withheld_no_delivery (vocab-valid)")
        if new.get("owner") != OWNER_MAP.get(b["immediate_action"]["owner"]) or new.get("owner") not in LEDGER_OWNER_ENUM:
            errs.append(f"held {mid}: owner must map from binding immediate owner")
        if new.get("next_action") != b["immediate_action"]["action"]:
            errs.append(f"held {mid}: next_action must equal binding immediate_action.action")
        if b["authority"] not in str(new.get("evidence_ref", "")) or "pkt-03-01-binding.json" not in str(new.get("evidence_ref", "")):
            errs.append(f"held {mid}: evidence_ref must reference the J1 binding + authority")
        if new.get("review_point") != "PKT-03-01 investigation close":
            errs.append(f"held {mid}: review_point drift")
        if new.get("evidence_as_of") != ACTIVATION_T:
            errs.append(f"held {mid}: evidence_as_of must equal J2 activation time (labeled, not source freshness)")


def check_master_nontarget_overlay(ctx, errs):
    old, new = ctx["ledger_old"], ctx["ledger_new"]
    if [r["metric_id"] for r in ctx["ledger_old_full"]["rows"]] != [r["metric_id"] for r in ctx["ledger_new_full"]["rows"]]:
        errs.append("ledger row order/id set changed")
    for mid in old:
        if mid not in HELD and old[mid] != new[mid]:
            errs.append(f"non-target/accepted ledger row {mid} changed (must be byte-identical)")
    if {k: v for k, v in ctx["ledger_old_full"].items() if k != "rows"} != {k: v for k, v in ctx["ledger_new_full"].items() if k != "rows"}:
        errs.append("ledger top-level changed")
    overlay = [m for m in old if old[m].get("boundary_class") == "separate_serra_service"]
    if len(overlay) != 18 or any(old[m] != new[m] for m in overlay):
        errs.append("Service overlay (18) changed or wrong count")


def check_index(ctx, errs):
    old = {p["packet_id"]: p for p in ctx["index_old"]["packets"]}
    new = {p["packet_id"]: p for p in ctx["index_new"]["packets"]}
    if ctx["index_new"]["version"] != ctx["index_old"]["version"] + 1:
        errs.append("packet-index version not bumped by 1")
    if "PKT-03-01" not in ctx["index_new"]["note"]:
        errs.append("packet-index note must record PKT-03-01 active")
    for pid in old:
        if pid == "PKT-03-01":
            continue
        if old[pid] != new[pid]:
            errs.append(f"packet-index record {pid} changed (only PKT-03-01 may change)")
    p = new["PKT-03-01"]
    if p.get("status") != "active_authored":
        errs.append("PKT-03-01 status != active_authored")
    if p.get("management_question") != ctx["binding"]["management_question"]:
        errs.append("PKT-03-01 management_question drift")
    if p.get("target_ids") != IDS or p.get("module") != 3:
        errs.append("PKT-03-01 target/module drift")


def check_customer_and_safety(ctx, errs):
    pk = ctx["packet"]
    if pk.get("customer_emission_authority") is not False:
        errs.append("packet customer_emission_authority must be False")
    cp = pk.get("customer_projection", {})
    if cp.get("customer_visible_ids") or cp.get("customer_report_emitted") is not False:
        errs.append("packet customer_projection: no visible ids / no report emitted")
    for m in pk["metric_definitions"]:
        if m.get("customer_visibility") != "hidden":
            errs.append(f"{m['metric_id']}: customer_visibility must be hidden")
        if m.get("customer_projection") is not None:
            errs.append(f"{m['metric_id']}: customer_projection must be null")
        if m.get("content_bytes_read") is not False:
            errs.append(f"{m['metric_id']}: content_bytes_read must be false")
        if m["metric_id"] in HELD and m.get("future_display_eligibility") is not False:
            errs.append(f"{m['metric_id']}: held future_display_eligibility must be False")
        if m["metric_id"] in ACC and m.get("future_display_eligibility") is not True:
            errs.append(f"{m['metric_id']}: accepted future_display_eligibility metadata must be True")
    td = pk.get("two_delta_proof", {})
    if td.get("evidence_delta", {}).get("count") != 0 or td.get("meaning_delta", {}).get("count") != 0:
        errs.append("two_delta must be 0/12 + 0/12")
    # quarantine + service/parts + no substitution
    if ctx["binding"]["dealer_scope"]["service_parts_admitted"] != 0:
        errs.append("service_parts_admitted != 0")
    for m in pk["metric_definitions"]:
        if m.get("source_family") in QUARANTINED:
            errs.append(f"{m['metric_id']}: sources a quarantined family")
        if m["metric_id"] == "SW-034" and m.get("source_family") != "crm_sales_gross":
            errs.append("SW-034: source substitution (must remain crm_sales_gross; Deal Performance candidate-only)")
    if ctx["packet"]["metric_definitions"][2].get("source_family") != "dealership_performance":
        errs.append("SW-033 must remain dealership_performance (not quarantined cage_kpi)")


def run_structural(ctx):
    errs = []
    check_ids_catalog_accounting(ctx, errs)
    check_packet_parity(ctx, errs)
    check_packet_strict(ctx, errs)
    check_partition(ctx, errs)
    check_accepted_preserved(ctx, errs)
    check_held_activation(ctx, errs)
    check_master_nontarget_overlay(ctx, errs)
    check_index(ctx, errs)
    check_customer_and_safety(ctx, errs)
    return errs


# ---------------- disk/git checks ----------------

def allowlist_errors(touched, staged_claude):
    e = []
    extra = sorted(f for f in touched if f not in ALLOWLIST)
    if extra:
        e.append(f"files touched outside allowlist: {extra}")
    if staged_claude:
        e.append(".claude/ is staged (forbidden)")
    return e


def check_frozen_and_allowlist(errs, info):
    for rel, want in J1_FROZEN.items():
        got = sha_file(os.path.join(REPO, rel))
        if got != want:
            errs.append(f"frozen artifact {rel} changed ({got}) — J1/schema-v2/registry-v2 drift")
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
        if f not in ALLOWLIST:
            errs.append(f"non-allowlisted tracked file mutated: {f}")
    missing = [f for f in ALLOWLIST if f != RECEIPT_REL and not os.path.exists(os.path.join(REPO, f))]
    if missing:
        errs.append(f"allowlist files missing: {missing}")


def legacy_delta_errors(now):
    e = []
    now_s = sorted(now)
    if len(now_s) != len(set(now_s)):
        e.append("legacy: duplicate error entries")
    if len(now_s) != LEGACY_BASELINE_COUNT:
        e.append(f"legacy: error count {len(now_s)} != pinned {LEGACY_BASELINE_COUNT}")
    canon = hashlib.sha256(json.dumps(now_s, ensure_ascii=False).encode()).hexdigest()
    if canon != LEGACY_BASELINE_SHA:
        e.append("legacy: canonical 30-error signature changed (new error / same-count substitution / removed error)")
    return e


def _canon_sha(arr):
    return hashlib.sha256(json.dumps(arr, separators=(",", ":"), ensure_ascii=False).encode("utf-8")).hexdigest()


def j1_stage_scope_errors(probes_total, failed, binding_sha, errs):
    """PURE: the frozen J1 validator's post-J2 result must be EXACTLY the expected stage-scope signature.
    Reject any drift: wrong probe totals, binding sha drift, count != 4, canonical-hash mismatch, path drift,
    a swapped/added/removed/semantic (binding-content) error."""
    e = []
    if probes_total != J1_PROBES_TOTAL_EXPECTED:
        e.append(f"j1_stage_scope: adversarial_probes_total {probes_total} != {J1_PROBES_TOTAL_EXPECTED}")
    if failed != 0:
        e.append(f"j1_stage_scope: adversarial_probes_failed {failed} != 0")
    if binding_sha != BIND_SHA:
        e.append("j1_stage_scope: binding sha drift")
    if len(errs) != J1_ERROR_COUNT_EXPECTED:
        e.append(f"j1_stage_scope: error count {len(errs)} != {J1_ERROR_COUNT_EXPECTED}")
    if _canon_sha(errs) != J1_ERROR_SIGNATURE_SHA:
        e.append("j1_stage_scope: error-array canonical sha != pinned expected_stage_scope signature (swap/add/delete/semantic)")
    # structural classification (defense-in-depth; every one of the four must be a known stage-scope guard)
    ALLOWED_PREFIX = ("files touched outside allowlist:", "non-allowlisted tracked file mutated:")
    for x in errs:
        if ("pinned_source_hashes[master_ledger" not in x) and not any(x.startswith(p) for p in ALLOWED_PREFIX):
            e.append(f"j1_stage_scope: non-stage-scope (semantic/content) error present: {x[:70]}")
    if len(errs) == 4:
        if "pinned_source_hashes[master_ledger_295]" not in errs[0]:
            e.append("j1_stage_scope: error#1 not the pinned master_ledger source-drift")
        if not errs[1].startswith("files touched outside allowlist:"):
            e.append("j1_stage_scope: error#2 not the files-touched-outside-allowlist error")
        else:
            import ast
            try:
                lst = ast.literal_eval(errs[1].split("files touched outside allowlist: ", 1)[1])
            except Exception:  # noqa: BLE001
                lst = None
            if sorted(lst or []) != sorted(ALLOWLIST):
                e.append("j1_stage_scope: error#2 touched-paths != exactly the eight J2 allowlist paths")
        if errs[2] != "non-allowlisted tracked file mutated: docs/halo/contract/phase1b/master-ledger-295.json":
            e.append("j1_stage_scope: error#3 not the master-ledger tracked mutation")
        if errs[3] != "non-allowlisted tracked file mutated: docs/halo/contract/phase1b/packet-index.json":
            e.append("j1_stage_scope: error#4 not the packet-index tracked mutation")
    return e


def check_j1_expected_stage_scope(errs, info):
    out = subprocess.run([sys.executable, os.path.join(REPO, J1_VALIDATOR), "--no-write"], capture_output=True, text=True)
    try:
        r = json.loads(out.stdout)
    except Exception:  # noqa: BLE001
        errs.append("j1_stage_scope: could not parse frozen J1 validator output")
        return
    j1_errs = r.get("errors", [])
    info["j1"] = {
        "classification": "expected_stage_scope_only",
        "command": f"python3 {J1_VALIDATOR} --no-write",
        "adversarial_probes_total": r.get("adversarial_probes_total"),
        "adversarial_probes_failed": r.get("adversarial_probes_failed"),
        "semantic_probes": f"{(r.get('adversarial_probes_total') or 0) - (r.get('adversarial_probes_failed') or 0)}/{r.get('adversarial_probes_total')}",
        "binding_sha256": r.get("binding_sha256"),
        "expected_error_count": J1_ERROR_COUNT_EXPECTED,
        "unexpected_error_count": max(0, len(j1_errs) - J1_ERROR_COUNT_EXPECTED),
        "raw_error_array": j1_errs,
        "canonicalization": "compact UTF-8 JSON (separators (',',':'), ensure_ascii=False) of the ordered array",
        "error_signature_sha256": _canon_sha(j1_errs),
        "expected_error_signature_sha256": J1_ERROR_SIGNATURE_SHA,
        "rationale": ("The frozen J1 validator's pinned whole-ledger hash + its 5-file allowlist + tracked-mutation guards "
                      "react to J2's legitimate ledger/index changes. No binding-content failure (semantic probes 54/54). "
                      "Error#1 is acceptable ONLY with the J2 proof: exact eight held metadata updates, accepted four "
                      "byte-identical, all transition arrays unchanged, 0 new transitions, post-J2 ledger hash pinned."),
    }
    errs.extend(j1_stage_scope_errors(r.get("adversarial_probes_total"), r.get("adversarial_probes_failed"), r.get("binding_sha256"), j1_errs))


def check_legacy_delta(errs, info):
    out = subprocess.run([sys.executable, os.path.join(REPO, "scripts", "halo-phase1b", "validate_phase1b.py"), "--no-write"], capture_output=True, text=True)
    try:
        now = sorted(json.loads(out.stdout)["errors"])
    except Exception:
        errs.append("could not parse legacy validate_phase1b.py output")
        return None
    info["legacy_now_count"] = len(now)
    errs.extend(legacy_delta_errors(now))
    return now


# ---------------- probes ----------------

def run_probes(ctx, legacy_now):
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

    def rec_legacy(name, synth):
        e = legacy_delta_errors(synth)
        probes.append({"probe": name, "expected": "reject", "got": "reject" if e else "accept", "pass": bool(e), "n": len(e), "sample": e[0] if e else None})

    def L(c, mid):
        return c["ledger_new"][mid]

    rec("accepted_row_drift", lambda c: L(c, "SW-032").__setitem__("evaluation_state", "measured_unscored"))
    rec("accepted_value_regrade", lambda c: L(c, "SW-031")["transitions"].append({"from": "measured_validated", "to": "data_acquired_calculation_pending", "at": ACTIVATION_T, "by": "codex", "reason": "x"}))
    rec("authoritative_count_drift", lambda c: c["ledger_new_full"]["counts"].__setitem__("authoritative_evaluated", 16))
    rec("held_disposition_promotion", lambda c: L(c, "SW-034").__setitem__("disposition", "data_acquired_calculation_pending"))
    rec("held_evaluation_injection", lambda c: L(c, "SW-035").__setitem__("evaluation_state", "measured_graded"))
    rec("held_acquisition_injection", lambda c: L(c, "SW-036").__setitem__("acquisition_admission_state", "admitted_held"))
    rec("held_authoritative_injection", lambda c: L(c, "SW-037").__setitem__("authoritative", True))
    rec("held_source_dep_injection", lambda c: L(c, "SW-038").__setitem__("source_dependency_ids", ["SRC-enhanced_sales_communication_log_weekly-0002"]))
    rec("held_self_transition_add", lambda c: L(c, "SW-039")["transitions"].append({"from": "source_investigation_pending", "to": "source_investigation_pending", "at": ACTIVATION_T, "by": "codex", "reason": "x"}))
    rec("held_transition_delete", lambda c: L(c, "SW-040").__setitem__("transitions", []))
    rec("held_field_outside_allowlist", lambda c: L(c, "SW-042").__setitem__("boundary_class", "separate_serra_service"))
    rec("held_wrong_owner", lambda c: L(c, "SW-034").__setitem__("owner", "duane"))
    rec("held_wrong_next_action", lambda c: L(c, "SW-035").__setitem__("next_action", "Do something else."))
    rec("held_evidence_ref_drift", lambda c: L(c, "SW-036").__setitem__("evidence_ref", "no authority"))
    rec("held_report_state_invalid", lambda c: L(c, "SW-037").__setitem__("report_acceptance_state", "authored_non_measured"))
    rec("held_ses_wrong", lambda c: L(c, "SW-038").__setitem__("source_existence_state", "acquired_local"))
    rec("held_evidence_as_of_freshness", lambda c: L(c, "SW-039").__setitem__("evidence_as_of", "2026-09-01T04:36:18-04:00"))
    rec("accepted_partition_drift", lambda c: c["packet"]["lifecycle_partition"]["accepted_measured_ids"].append("SW-042"))
    rec("packet_dep_nonempty", lambda c: c["packet"].__setitem__("source_dependencies", [{"source_id": "SRC-x-0003"}]))
    rec("metric_dep_nonempty", lambda c: c["packet"]["metric_definitions"][3].__setitem__("source_dependency_ids", ["SRC-x-0003"]))
    rec("packet_parity_drift", lambda c: c["packet"]["metric_definitions"][0].__setitem__("business_question", "tampered"))
    rec("packet_binding_sha_drift", lambda c: c["packet"]["authority_binding"].__setitem__("sha256", "0" * 64))
    rec("customer_emission_true", lambda c: c["packet"].__setitem__("customer_emission_authority", True))
    rec("customer_report_emitted", lambda c: c["packet"]["customer_projection"].__setitem__("customer_report_emitted", True))
    rec("value_injection_on_held", lambda c: c["packet"]["metric_definitions"][3].__setitem__("formula", "x/y"))
    rec("service_parts_admitted", lambda c: c["binding"]["dealer_scope"].__setitem__("service_parts_admitted", 1))
    rec("sw034_substitution", lambda c: c["packet"]["metric_definitions"][3].__setitem__("source_family", "dealership_performance"))
    rec("quarantined_source", lambda c: c["packet"]["metric_definitions"][3].__setitem__("source_family", "cage_kpi"))
    rec("index_other_packet_drift", lambda c: c["index_new"]["packets"][0].__setitem__("status", "active_authored"))
    rec("index_status_wrong", lambda c: next(p for p in c["index_new"]["packets"] if p["packet_id"] == "PKT-03-01").__setitem__("status", "provisional_planning"))
    rec("index_question_drift", lambda c: next(p for p in c["index_new"]["packets"] if p["packet_id"] == "PKT-03-01").__setitem__("management_question", "x"))
    rec("nontarget_ledger_drift", lambda c: L(c, "SW-011").__setitem__("disposition", "genuinely_not_available"))
    rec("overlay_drift", lambda c: next(r for r in [c["ledger_new"][m] for m in c["ledger_new"] if c["ledger_new"][m].get("boundary_class") == "separate_serra_service"]).__setitem__("disposition", "measured_validated"))
    rec("two_delta_nonzero", lambda c: c["packet"]["two_delta_proof"]["evidence_delta"].__setitem__("count", 1))
    rec("target_order_drift", lambda c: c["packet"].__setitem__("target_ids", list(reversed(IDS))))
    # --- J2R2 exact-contract rejection probes (15) ---
    rec("held_extra_calculated_value", lambda c: c["packet"]["metric_definitions"][3].__setitem__("calculated_value", 0.42))
    rec("accepted_extra_new_grade", lambda c: c["packet"]["metric_definitions"][0].__setitem__("new_grade", "A"))
    rec("extra_toplevel_deployment_authorized", lambda c: c["packet"].__setitem__("deployment_authorized", True))
    rec("evidence_delta_of_11", lambda c: c["packet"]["two_delta_proof"]["evidence_delta"].__setitem__("of", 11))
    rec("meaning_delta_of_11", lambda c: c["packet"]["two_delta_proof"]["meaning_delta"].__setitem__("of", 11))
    rec("customer_accepted_ids_emptied", lambda c: c["packet"]["customer_projection"].__setitem__("accepted_measured_ids", []))
    rec("status_changed_to_planned", lambda c: c["packet"].__setitem__("status", "planned"))
    rec("period_drift", lambda c: c["packet"].__setitem__("period", "2026-08-17..2026-08-23"))
    rec("module_changed_to_4", lambda c: c["packet"].__setitem__("module", 4))
    rec("inherited_wrong_dealer_removed", lambda c: c["packet"]["stop_conditions"].__setitem__("inherited_canonical", [s for s in c["packet"]["stop_conditions"]["inherited_canonical"] if s != "wrong_dealer"]))
    rec("service_parts_packet_stop_weakened", lambda c: c["packet"]["stop_conditions"]["packet_specific"].__setitem__(2, "Service/Parts allowed where clean."))
    rec("accountable_owner_roster_drift", lambda c: c["packet"]["accountable_owner_roster"].__setitem__("Duane Wells", "does everything"))
    rec("source_reuse_note_claims_new_source", lambda c: c["packet"].__setitem__("source_reuse_note", "A new source SRC-appointments-0003 is acquired and admitted."))
    rec("lifecycle_extra_bucket", lambda c: c["packet"]["lifecycle_partition"].__setitem__("bonus_bucket", ["SW-031"]))
    rec("customer_note_says_authorized", lambda c: c["packet"]["customer_projection"].__setitem__("note", "Customer emission is authorized for all four accepted metrics."))
    rec_allow("nonallowlist_path_touch", set(ALLOWLIST) | {"src/server/brain-schema.ts"}, False)
    rec_allow("claude_staged", set(ALLOWLIST), True)
    if legacy_now is not None:
        rec_legacy("legacy_same_count_substitution", (sorted(legacy_now)[:-1] + ["ledger SW-999: fabricated swap error"]))
        rec_legacy("legacy_new_error_added", (sorted(legacy_now) + ["ledger SW-034: source SRC-x not registered"]))
        rec_legacy("legacy_removed_error", sorted(legacy_now)[:-1])
    # --- J1 expected_stage_scope comparator probes (pure; must reject) ---
    j1_ok = [
        "pinned_source_hashes[master_ledger_295] != live sha (source drift)",
        "files touched outside allowlist: " + repr(sorted(ALLOWLIST)),
        "non-allowlisted tracked file mutated: docs/halo/contract/phase1b/master-ledger-295.json",
        "non-allowlisted tracked file mutated: docs/halo/contract/phase1b/packet-index.json",
    ]

    def rec_j1(name, total, failed, sha, errs):
        e = j1_stage_scope_errors(total, failed, sha, errs)
        probes.append({"probe": name, "expected": "reject", "got": "reject" if e else "accept", "pass": bool(e), "n": len(e), "sample": e[0] if e else None})

    rec_j1("j1_same_count_fabricated_swap", 54, 0, BIND_SHA, j1_ok[:3] + ["fabricated swap error"])
    rec_j1("j1_delete_one", 54, 0, BIND_SHA, j1_ok[:3])
    rec_j1("j1_add_one", 54, 0, BIND_SHA, j1_ok + ["extra error"])
    rec_j1("j1_mutate_ledger_path", 54, 0, BIND_SHA, [j1_ok[0], j1_ok[1], "non-allowlisted tracked file mutated: docs/halo/contract/phase1b/other.json", j1_ok[3]])
    rec_j1("j1_mutate_index_path", 54, 0, BIND_SHA, [j1_ok[0], j1_ok[1], j1_ok[2], "non-allowlisted tracked file mutated: docs/halo/contract/phase1b/other.json"])
    rec_j1("j1_ninth_touched_path", 54, 0, BIND_SHA, [j1_ok[0], "files touched outside allowlist: " + repr(sorted(ALLOWLIST) + ["docs/x.json"]), j1_ok[2], j1_ok[3]])
    rec_j1("j1_omit_one_j2_path", 54, 0, BIND_SHA, [j1_ok[0], "files touched outside allowlist: " + repr(sorted(ALLOWLIST)[:-1]), j1_ok[2], j1_ok[3]])
    rec_j1("j1_replace_ledger_with_binding_drift", 54, 0, BIND_SHA, ["accepted SW-031: accepted_evaluation value drift", j1_ok[1], j1_ok[2], j1_ok[3]])
    rec_j1("j1_semantic_error_in_four", 54, 0, BIND_SHA, [j1_ok[0], j1_ok[1], j1_ok[2], "held SW-034: disposition promotion"])
    rec_j1("j1_probe_total_53", 53, 0, BIND_SHA, j1_ok)
    rec_j1("j1_failed_probe_1", 54, 1, BIND_SHA, j1_ok)
    rec_j1("j1_binding_sha_drift", 54, 0, "0" * 64, j1_ok)
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
    check_j1_expected_stage_scope(errs, info)
    legacy_now = check_legacy_delta(errs, info)
    probes = run_probes(ctx, legacy_now)
    failed = [p for p in probes if not p["pass"]]
    overall = (not errs) and (not failed)

    result = {
        "check": "honda_watchdog_phase1b_pkt_03_01_j2_activation",
        "phase": "Phase 1B — PKT-03-01 J2 metadata/control activation (4 accepted carry-forward preserved + 8 held activated; 0 new transitions)",
        "scope": "metadata_activation_only (no acquire/read/export/admit/promote/calculate/grade/alert/customer output/merge/deploy)",
        "baseline_commit": BASELINE_COMMIT,
        "allowlist_files": ALLOWLIST,
        "frozen_artifacts": J1_FROZEN,
        "activation_time_utc": ACTIVATION_T,
        "accepted_measured_ids": ACC,
        "held_ids": HELD,
        "transitions_appended_total": 0,
        "held_metadata_fields": sorted(HELD_META_FIELDS),
        "v2_controls_unmodified": {"packet-schema-1b-v2.json": SCHEMA_V2_SHA, "source-registry-1b-v2.json": REGISTRY_V2_SHA},
        "frozen_j1_validator_post_j2": info.get("j1"),
        "legacy_validate_phase1b": {
            "pinned_baseline_count": LEGACY_BASELINE_COUNT,
            "pinned_baseline_signature_sha256": LEGACY_BASELINE_SHA,
            "now_error_count": info.get("legacy_now_count"),
            "delta_new": 0,
            "exactness": "post-J2 == pinned canonical 30-error signature UNION 0 new; same-count substitution rejected",
        },
        "touched_vs_baseline": info.get("touched_vs_baseline"),
        "artifact_hashes": {rel: sha_file(os.path.join(REPO, rel)) for rel in ALLOWLIST if os.path.exists(os.path.join(REPO, rel)) and rel != RECEIPT_REL},
        "adversarial_probes_total": len(probes),
        "adversarial_probes_failed": len(failed),
        "adversarial_probes": probes,
        "errors": errs,
        "overall_pass": overall,
        "note": "Truthful activation: 0 new transitions (existing arrays byte-identical); accepted rows byte-identical (no recalc/regrade); held rows metadata-only; no new registry node; schema-v2/registry-v2 unmodified; no customer output; missing not zero; zero Service/Parts.",
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
