#!/usr/bin/env python3
"""
PKT-03-02 J2 activation validator (authoritative for the metadata/control activation).

Proves the J2 edit is a truthful, bounded activation:
  - exact 8-file allowlist; no .claude staging; five frozen J1 artifacts + schema-v2 + registry-v2 + every other tracked
    path byte-identical to the baseline commit;
  - 2 accepted rows {SW-045,046} ledger-byte-identical to baseline (no recalc/regrade/drift); authoritative_evaluated=17;
  - 10 held rows {SW-043,044,113,114,121,122,123,125,126,154}: disposition source_investigation_pending unchanged,
    authoritative false, not_acquired, not_measured, deps [], transitions BYTE-IDENTICAL (0 new transitions, no
    self-transition); ONLY the 7-field metadata allowlist changed (source_existence_state=>investigation_pending,
    report_acceptance_state=>withheld_no_delivery, owner, evidence_ref, next_action, review_point,
    evidence_as_of=J2 activation time); owners/actions/authority match the frozen J1 binding;
  - packet metric_definitions equal the J1 binding field-for-field (binding metrics keyed by "id") plus ONLY the two
    structural keys {metric_id, source_dependency_ids}; packet + metric dependency arrays empty; no new registry node;
    authority_binding.ref derived from packet_id + sha == frozen J1 binding sha; schema-v2/registry-v2 unmodified;
  - packet partitions accepted 2 / held 10 / others empty; customer emission/report/visible false/empty; two-delta 0/12 + 0/12;
  - accepted SW-045/046 legacy peer_rank/industry_reference/text/label/value_display/variance/CRM-Sales source label are
    byte-carried but QUARANTINED (j2_quarantine: forbidden_uses = calc/narrative/display/ranking/source-attribution/
    customer-projection; true authority = Dashboard Gate 4B); no customer projection authored;
  - index: only PKT-03-02 -> active_authored + exact question; version +1; note; every other packet record unchanged;
  - zero Service/Parts; quarantined cage_kpi/lead_source_roi/sales_comm_log unusable; no substitution; no PII/raw/content;
  - frozen J1 binding validator, RE-RUN after J2, reports EXACTLY the expected scope/pin signature (master-ledger pinned
    HASH drift + ALLOWLIST list of the eight J2 paths), probes 60/60, no binding-content failure;
  - legacy validate_phase1b.py == the pinned canonical 30-error signature UNION 0 new (same-count substitution rejected).

Pinned to baseline commit 82d5893123f2ecb21538a84d4cb97d373b89b3ad. Exit 0 == PASS.
Usage: python3 scripts/halo-phase1b/validate_pkt_03_02.py [--out X] [--no-write]
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
EVID = "docs/halo/evidence/honda-watchdog/phase1b/pkt-03-02"
DEFAULT_OUT = os.path.join(REPO, EVID, "PKT-03-02_EXECUTION_CHECKS.json")

BASELINE_COMMIT = "82d5893123f2ecb21538a84d4cb97d373b89b3ad"
BIND_REL = "docs/halo/contract/phase1b/pkt-03-02-binding.json"
BIND_SHA = "d20c35c026c73fa7929b21022c986bf0117769b428e7f22a6837d5f1827433a0"
SCHEMA_V2_SHA = "f137762427c74c180acf4fced19124c498a5e1fc5a8641ebc376afc47c11c5f6"
REGISTRY_V2_SHA = "bcf1bdbce0c824d495b8a6b0148fd4f65e08e0dcff6db18fa1ae6954ae4f928b"
ACTIVATION_T = "2026-09-04T09:40:19Z"
LEGACY_BASELINE_SHA = "2cbf86a6361f4c67803807d5d7d7d496413a4b20924da42516ff80d7d3d46783"
LEGACY_BASELINE_COUNT = 30

# Frozen J1 binding validator, RE-RUN after J2, reports EXACTLY these two "expected_stage_scope_only" errors:
# (1) its pinned master-ledger source hash drifts (baseline -> post-J2 ledger); (2) its 5-file allowlist flags the
# eight J2 paths as changes-outside-allowlist-vs-baseline. Probes stay 60/60. No binding-content failure.
# Canonicalization = compact UTF-8 JSON (separators (',',':'), ensure_ascii=False) of the ordered error array.
J1_VALIDATOR = "scripts/halo-phase1b/validate_pkt_03_02_binding.py"
J1_PROBES_TOTAL_EXPECTED = 60
J1_ERROR_COUNT_EXPECTED = 2
LEDGER_BASELINE_SHA = "747b6d31796939ae29f3a31a0f57226e57342ad7c2b1a1737e05287a5af59d13"
LEDGER_POST_J2_SHA = "a5e4dd0b00ddfb48642d342a0bef0c49cb40a85d3bb375879e636b3d5cc7543a"
J1_ERROR_SIGNATURE_SHA = "742545ca628c866ec36bf30ec4f81cc02fc6d54705c427a166743ca6a49ee898"

IDS = ["SW-043", "SW-044", "SW-045", "SW-046", "SW-113", "SW-114", "SW-121", "SW-122", "SW-123", "SW-125", "SW-126", "SW-154"]
ACC = ["SW-045", "SW-046"]
HELD = ["SW-043", "SW-044", "SW-113", "SW-114", "SW-121", "SW-122", "SW-123", "SW-125", "SW-126", "SW-154"]
HELD_META_FIELDS = {"source_existence_state", "report_acceptance_state", "owner", "evidence_as_of", "evidence_ref", "next_action", "review_point"}
OWNER_MAP = {
    "Codex VinSolutions controller (read-only source/admission authority; governed acquisition)": "codex",
    "Claude Studio engineering (binding author; later implementer)": "claude_studio",
    "Duane (business/design/protected-content/threshold decision authority only)": "duane",
}
QUARANTINED = {"cage_kpi", "lead_source_roi", "sales_comm_log"}
SW295 = [f"SW-{i:03d}" for i in range(1, 296)]

J1_FROZEN = {
    "docs/halo/contract/phase1b/pkt-03-02-binding.json": BIND_SHA,
    "scripts/halo-phase1b/validate_pkt_03_02_binding.py": "55ab22f2c838e662aaf78b51c8064af25519d89f75f9412658c4c119685af3cc",
    "docs/halo/evidence/honda-watchdog/phase1b/pkt-03-02/PKT-03-02_BINDING_CHECKS.json": "3b7e0a6ad6561a15e30cc226cde754b184927851156dbed60a1923ce855371fa",
    "docs/halo/evidence/honda-watchdog/phase1b/pkt-03-02/PKT-03-02_J1_TWO_DELTA.md": "9cf104d1e4440e4b7d7849ea33a20b48545f225ef1d653299905f9c658962288",
    "docs/halo/evidence/honda-watchdog/phase1b/pkt-03-02/PKT-03-02_J1_internal_coverage_roadmap.md": "8e05ccd0cbc809329f7a7c260a5259dbd24f6402ed9bb25cc4f8fe3d3ba2cec9",
    "docs/halo/contract/phase1b/packet-schema-1b-v2.json": SCHEMA_V2_SHA,
    "docs/halo/contract/phase1b/source-registry-1b-v2.json": REGISTRY_V2_SHA,
}
ALLOWLIST = sorted([
    "docs/halo/contract/phase1b/packets/PKT-03-02.json",
    "docs/halo/contract/phase1b/master-ledger-295.json",
    "docs/halo/contract/phase1b/packet-index.json",
    "scripts/halo-phase1b/validate_pkt_03_02.py",
    "docs/halo/evidence/honda-watchdog/phase1b/pkt-03-02/PKT-03-02_EXECUTION_CHECKS.json",
    "docs/halo/evidence/honda-watchdog/phase1b/pkt-03-02/PKT-03-02_J2_run_manifest.json",
    "docs/halo/evidence/honda-watchdog/phase1b/pkt-03-02/PKT-03-02_J2_TWO_DELTA.md",
    "docs/halo/evidence/honda-watchdog/phase1b/pkt-03-02/PKT-03-02_J2_internal_companion.md",
])
RECEIPT_REL = "docs/halo/evidence/honda-watchdog/phase1b/pkt-03-02/PKT-03-02_EXECUTION_CHECKS.json"
RUN_MANIFEST_REL = "docs/halo/evidence/honda-watchdog/phase1b/pkt-03-02/PKT-03-02_J2_run_manifest.json"

# The frozen J1 binding validator's expected post-J2 error array (constructed from pinned constants; verified live).
EXPECTED_J1_ERRORS = [
    f"HASH: docs/halo/contract/phase1b/master-ledger-295.json expected {LEDGER_BASELINE_SHA} got {LEDGER_POST_J2_SHA}",
    "ALLOWLIST: changes outside allowlist vs baseline: " + repr(sorted(ALLOWLIST)),
]

PACKET_TOP_KEYS = {"artifact", "schema", "packet_id", "module", "period", "management_question", "target_ids",
                   "source_reuse_note", "source_dependencies", "metric_definitions", "lifecycle_partition",
                   "stop_conditions", "two_delta_proof", "authority_binding", "customer_emission_authority",
                   "customer_projection", "accountable_owner_roster", "status"}
PACKET_ARTIFACT = "honda-watchdog-phase1b-packet-PKT-03-02"
PACKET_SCHEMA = "docs/halo/contract/phase1b/packet-schema-1b-v2.json"
PACKET_PERIOD = "2026-08-24..2026-08-30"
SOURCE_REUSE_NOTE = ("No source dependency is added: SW-045/046 are authoritative carry-forward "
                     "(current_truth_ref; byte-semantic; not recomputed/regraded); the ten held metrics are "
                     "source_investigation_pending with empty dependencies. No new source-registry node; "
                     "schema-v2/registry-v2 unmodified.")
TWO_DELTA_PROOF = {
    "evidence_delta": {"count": 0, "of": 12, "note": "2 accepted are carry-forward (not new evidence); 10 held acquired nothing."},
    "meaning_delta": {"count": 0, "of": 12, "note": "no value/grade authored or changed; accepted preserved; held produce none."},
}
INHERITED_CANONICAL = ["wrong_dealer", "service_parts_in_sales", "ambiguous_period", "schema_drift", "missing_provenance",
                       "protected_content_or_pii_outside_envelope", "formula_or_denominator_ambiguity", "incompatible_baseline",
                       "source_substitution_or_skip", "dirty_or_competing_writer", "production_or_customer_behavior_change"]
PACKET_SPECIFIC_STOPS = [
    "Two accepted metrics (SW-045, SW-046) are carry-forward measured_validated; no recalculation/regrade; authoritative_evaluated=17.",
    "Ten held metrics remain source_investigation_pending (no value/grade/alert/customer projection); missing is not zero.",
    "Zero Service/Parts; cage_kpi/lead_source_roi/sales_comm_log quarantined and unusable; no substitution/inference; business-language causal labels are not factual diagnoses.",
    "Customer emission authority FALSE; no PII/raw/message content; SW-154 protected content remains unread (SPEC 5.5 envelope unauthorized).",
]
LIFECYCLE_PARTITION = {
    "accepted_measured_ids": ACC,
    "accepted_disposition_only_ids": [],
    "rejected_ids": [],
    "source_investigation_pending_ids": HELD,
    "calculation_pending_ids": [],
}
CUSTOMER_PROJECTION = {
    "accepted_measured_ids": ACC,
    "customer_visible_ids": [],
    "customer_report_emitted": False,
    "note": ("Two accepted metrics (SW-045, SW-046) are display-ELIGIBLE (metadata only); "
             "this activation authorizes NO customer file/output/send. Emission requires a "
             "separate Duane business decision. Ten held metrics are hidden."),
}
ACCOUNTABLE_OWNER_ROSTER = {
    "Duane Wells": ("business meaning/threshold/formula/target decisions + future "
                    "customer-display authorization (never acquisition/investigation/accumulation/"
                    "admission/normalization/promotion/calculation/implementation)"),
    "Codex VinSolutions controller": ("bounded read-only source/UI/schema investigation "
                                       "+ governed acquisition/evidence + authoritative carry-forward preservation"),
    "Claude Studio engineering": "implementation + admission once contracts exist",
}
QUARANTINE_FORBIDDEN_USES = ["calculation", "narrative", "display", "ranking", "source_attribution", "customer_projection"]
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
    b = load_local(BIND_REL)
    ctx["binding"] = b
    ctx["bmap"] = {m["id"]: m for m in b["metrics"]}
    ctx["packet"] = load_local("docs/halo/contract/phase1b/packets/PKT-03-02.json")
    ctx["index_new"] = load_local("docs/halo/contract/phase1b/packet-index.json")
    ctx["index_old"] = json.loads(git_show("docs/halo/contract/phase1b/packet-index.json"))
    lnew = load_local("docs/halo/contract/phase1b/master-ledger-295.json")
    lold = json.loads(git_show("docs/halo/contract/phase1b/master-ledger-295.json"))
    ctx["ledger_new_full"] = lnew
    ctx["ledger_new"] = {r["metric_id"]: r for r in lnew["rows"]}
    ctx["ledger_old_full"] = lold
    ctx["ledger_old"] = {r["metric_id"]: r for r in lold["rows"]}
    ctx["matrix"] = {e["metric_id"]: e for e in p1.load(os.path.join(C, "semantic-watchdog-feasibility-matrix-295.json"))}
    mpath = os.path.join(REPO, RUN_MANIFEST_REL)
    ctx["manifest"] = json.load(open(mpath, encoding="utf-8")) if os.path.exists(mpath) else None
    return ctx


def pdefs(ctx):
    return {m.get("metric_id"): m for m in ctx["packet"]["metric_definitions"]}


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
    prec = [p for p in idx["packets"] if p["packet_id"] == "PKT-03-02"]
    if not prec or prec[0]["target_ids"] != IDS:
        errs.append("packet-index PKT-03-02 target_ids != exact 12")
    allids = [t for p in idx["packets"] for t in p["target_ids"]]
    if sorted(allids) != SW295 or len(allids) != len(set(allids)):
        errs.append("packet-index union != exact 295 unique")
    if sorted({p["module"] for p in idx["packets"]}) != list(range(1, 12)):
        errs.append("packet-index modules != 1..11")
    if len(idx["packets"]) != 30:
        errs.append("packet-index packet count != 30")


def check_packet_parity(ctx, errs):
    """EXACT deep equality: each packet metric_definition == binding.metrics[mid] (keyed by 'id') plus ONLY the two
    structural keys {metric_id, source_dependency_ids}. Any extra field (calculated_value/new_grade/...) rejects."""
    bmap = ctx["bmap"]
    mdefs = ctx["packet"]["metric_definitions"]
    if [m.get("metric_id") for m in mdefs] != IDS:
        errs.append("packet metric_definitions order/ids != exact 12")
        return
    for i, mid in enumerate(IDS):
        md, bm = mdefs[i], bmap[mid]
        allowed = set(bm.keys()) | {"metric_id", "source_dependency_ids"}
        if set(md.keys()) != allowed:
            extra = sorted(set(md.keys()) - allowed)
            missing = sorted(allowed - set(md.keys()))
            errs.append(f"packet {mid}: metric_definition key set != binding + {{metric_id, source_dependency_ids}} (extra={extra}, missing={missing})")
        for f in bm:
            if md.get(f) != bm.get(f):
                errs.append(f"packet {mid}: field '{f}' != J1 binding (exact deep equality)")
        if md.get("metric_id") != mid or md.get("id") != mid:
            errs.append(f"packet {mid}: metric_id/id mismatch")
        if md.get("source_dependency_ids") != []:
            errs.append(f"packet {mid}: source_dependency_ids must be [] (no dependency)")
    derived = f"docs/halo/contract/phase1b/{ctx['packet']['packet_id'].lower()}-binding.json"
    ab = ctx["packet"].get("authority_binding", {})
    if ab.get("ref") != derived:
        errs.append(f"packet authority_binding.ref != derived path '{derived}'")
    if ab.get("sha256") != BIND_SHA:
        errs.append("packet authority_binding.sha256 != frozen J1 binding sha")
    if ctx["packet"].get("schema") != PACKET_SCHEMA:
        errs.append("packet.schema must name packet-schema-1b-v2.json")
    if ctx["packet"].get("source_dependencies") != []:
        errs.append("packet.source_dependencies must be [] (no new registry node)")


def check_packet_strict(ctx, errs):
    """Exact top-level key set + pinned values + exact lifecycle/two-delta/customer/roster/stop-conditions."""
    pk, b = ctx["packet"], ctx["binding"]
    if set(pk.keys()) != PACKET_TOP_KEYS:
        extra = sorted(set(pk.keys()) - PACKET_TOP_KEYS)
        missing = sorted(PACKET_TOP_KEYS - set(pk.keys()))
        errs.append(f"packet top-level key set drift (extra={extra}, missing={missing})")
    if pk.get("artifact") != PACKET_ARTIFACT:
        errs.append("packet.artifact drift")
    if pk.get("schema") != PACKET_SCHEMA:
        errs.append("packet.schema drift")
    if pk.get("packet_id") != "PKT-03-02":
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
    if pk.get("lifecycle_partition") != LIFECYCLE_PARTITION:
        errs.append("packet.lifecycle_partition drift (accepted 2 / held 10 / others empty; no target_ids bucket)")
    if pk.get("two_delta_proof") != TWO_DELTA_PROOF:
        errs.append("packet.two_delta_proof drift (must be exactly 0/12 + 0/12 with denominators + notes)")
    if pk.get("customer_emission_authority") is not False or b.get("customer_emission_authority") is not False:
        errs.append("customer_emission_authority must be exactly False (binding)")
    if pk.get("customer_projection") != CUSTOMER_PROJECTION:
        errs.append("packet.customer_projection drift (accepted 2 / visible [] / emitted false / note)")
    if pk.get("accountable_owner_roster") != ACCOUNTABLE_OWNER_ROSTER:
        errs.append("packet.accountable_owner_roster drift (exact three-owner roster)")
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
        errs.append("packet accepted_measured_ids != exact 2")
    if sorted(lp.get("source_investigation_pending_ids") or []) != sorted(HELD):
        errs.append("packet source_investigation_pending_ids != exact 10")
    if lp.get("accepted_disposition_only_ids") or lp.get("rejected_ids") or lp.get("calculation_pending_ids"):
        errs.append("packet other partitions must be empty")


def check_accepted_preserved(ctx, errs):
    for mid in ACC:
        if ctx["ledger_new"].get(mid) != ctx["ledger_old"].get(mid):
            errs.append(f"accepted {mid}: ledger row changed vs baseline (byte-identical required; no recalc/regrade)")
    if ctx["ledger_new_full"]["counts"].get("authoritative_evaluated") != 17:
        errs.append("authoritative_evaluated != 17")


def check_held_activation(ctx, errs):
    bmap = ctx["bmap"]
    for mid in HELD:
        old, new, b = ctx["ledger_old"].get(mid, {}), ctx["ledger_new"].get(mid, {}), bmap[mid]
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
        if b["authority"] not in str(new.get("evidence_ref", "")) or "pkt-03-02-binding.json" not in str(new.get("evidence_ref", "")):
            errs.append(f"held {mid}: evidence_ref must reference the J1 binding + authority")
        if new.get("review_point") != "PKT-03-02 investigation close":
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
    if "PKT-03-02" not in ctx["index_new"]["note"]:
        errs.append("packet-index note must record PKT-03-02 active")
    for pid in old:
        if pid == "PKT-03-02":
            continue
        if old[pid] != new[pid]:
            errs.append(f"packet-index record {pid} changed (only PKT-03-02 may change)")
    p = new["PKT-03-02"]
    if p.get("status") != "active_authored":
        errs.append("PKT-03-02 status != active_authored")
    if p.get("management_question") != ctx["binding"]["management_question"]:
        errs.append("PKT-03-02 management_question drift")
    if p.get("target_ids") != IDS or p.get("module") != 3:
        errs.append("PKT-03-02 target/module drift")


def check_customer_and_safety(ctx, errs):
    pk = ctx["packet"]
    d = pdefs(ctx)
    if pk.get("customer_emission_authority") is not False:
        errs.append("packet customer_emission_authority must be False")
    cp = pk.get("customer_projection", {})
    if cp.get("customer_visible_ids") or cp.get("customer_report_emitted") is not False:
        errs.append("packet customer_projection: no visible ids / no report emitted")
    for mid in HELD:
        m = d.get(mid, {})
        if m.get("future_display_eligibility") is not False:
            errs.append(f"{mid}: held future_display_eligibility must be False")
        if m.get("customer_projection_allowed") is not False:
            errs.append(f"{mid}: held customer_projection_allowed must be False")
        if m.get("customer_projection_authored_this_tranche") is not False:
            errs.append(f"{mid}: held customer_projection_authored_this_tranche must be False")
        if m.get("value_allowed") is not False or m.get("grade_allowed") is not False or m.get("narrative_allowed") is not False:
            errs.append(f"{mid}: held value/grade/narrative must not be allowed")
        for nf in ("value", "value_display", "numerator", "denominator", "formula", "threshold", "detection_rule",
                   "ot_anchor", "gate2_anchor", "accepted_evaluation"):
            if m.get(nf) is not None:
                errs.append(f"{mid}: held field '{nf}' must be null (no value/grade/detection)")
        if m.get("authoritative") is not False or m.get("disposition") != "source_investigation_pending":
            errs.append(f"{mid}: held disposition/authoritative drift")
        if m.get("source_existence_state") != "unproved":
            errs.append(f"{mid}: held source_existence_state must be unproved in binding/packet")
        if m.get("missing_is_not_zero") is not True or m.get("no_proxy_or_inference") is not True:
            errs.append(f"{mid}: held missing_is_not_zero/no_proxy_or_inference must be True")
        if m.get("source_family_intent") in QUARANTINED:
            errs.append(f"{mid}: held sources a quarantined family")
    for mid in ACC:
        m = d.get(mid, {})
        if m.get("future_display_eligibility") is not True:
            errs.append(f"{mid}: accepted future_display_eligibility metadata must be True")
        if m.get("customer_projection_authored_this_tranche") is not False:
            errs.append(f"{mid}: accepted must not author a customer projection this tranche")
        if m.get("recomputed_this_tranche") is not False:
            errs.append(f"{mid}: accepted must not be recomputed this tranche")
        if m.get("authoritative") is not True or m.get("carry_forward") is not True:
            errs.append(f"{mid}: accepted authoritative/carry_forward drift")
        if m.get("source_family") in QUARANTINED:
            errs.append(f"{mid}: accepted sources a quarantined family")
        q = m.get("j2_quarantine", {})
        if q.get("forbidden_uses") != QUARANTINE_FORBIDDEN_USES:
            errs.append(f"{mid}: accepted j2_quarantine.forbidden_uses drift (calc/narrative/display/ranking/source-attribution/customer-projection)")
        if "Dashboard" not in str(q.get("true_authority", "")):
            errs.append(f"{mid}: accepted true authority must be the Dashboard (Gate 4B), not the legacy CRM Sales label")
        for legacy in ("peer_rank", "industry_reference", "text", "label", "value_display", "variance", "evidence.source"):
            if legacy not in (q.get("byte_carried_but_not_usable_in_j2") or []):
                errs.append(f"{mid}: accepted quarantine must list byte-carried legacy field '{legacy}' as not usable")
    # SW-154 protected content stays unread
    s154 = d.get("SW-154", {})
    if s154.get("content_bytes_read") is not False or s154.get("keyword_results_authoritative") is not False or s154.get("provisional_labels_are_stable_linkage") is not False:
        errs.append("SW-154: protected content must stay unread / non-authoritative / non-stable-linkage")
    td = pk.get("two_delta_proof", {})
    if td.get("evidence_delta", {}).get("count") != 0 or td.get("meaning_delta", {}).get("count") != 0:
        errs.append("two_delta must be 0/12 + 0/12")
    ds = ctx["binding"]["dealer_scope"]
    if ds.get("service_parts_admitted") != 0 or ds.get("service_source_admitted") != 0 or ds.get("cross_rooftop_admitted") != 0:
        errs.append("Service/Parts/service-source/cross-rooftop admitted must all be 0")


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


def j1_stage_scope_errors(probes_total, not_rejected, errors):
    """PURE: the frozen J1 validator's post-J2 result must be EXACTLY the expected stage-scope signature
    (master-ledger pinned HASH drift + ALLOWLIST list of the eight J2 paths), probes 60/60, no content failure."""
    e = []
    if probes_total != J1_PROBES_TOTAL_EXPECTED:
        e.append(f"j1_stage_scope: probe_total {probes_total} != {J1_PROBES_TOTAL_EXPECTED}")
    if not_rejected != 0:
        e.append(f"j1_stage_scope: probe_not_rejected {not_rejected} != 0")
    if len(errors) != J1_ERROR_COUNT_EXPECTED:
        e.append(f"j1_stage_scope: error count {len(errors)} != {J1_ERROR_COUNT_EXPECTED}")
    if _canon_sha(errors) != J1_ERROR_SIGNATURE_SHA:
        e.append("j1_stage_scope: error-array canonical sha != pinned expected_stage_scope signature (swap/add/delete/semantic)")
    if errors != EXPECTED_J1_ERRORS:
        e.append("j1_stage_scope: live error array != exact expected two-error scope/pin signature")
    for x in errors:
        if not (x.startswith("HASH: docs/halo/contract/phase1b/master-ledger-295.json ") or x.startswith("ALLOWLIST: changes outside allowlist vs baseline: ")):
            e.append(f"j1_stage_scope: non-stage-scope (semantic/content) error present: {x[:70]}")
    return e


def check_j1_expected_stage_scope(errs, info):
    out = subprocess.run([sys.executable, os.path.join(REPO, J1_VALIDATOR), "--no-write"], capture_output=True, text=True)
    try:
        r = json.JSONDecoder().raw_decode(out.stdout.lstrip())[0]
    except Exception:  # noqa: BLE001
        errs.append("j1_stage_scope: could not parse frozen J1 validator output")
        return
    j1_errs = r.get("errors", [])
    total = r.get("probe_total")
    not_rej = r.get("probe_not_rejected")
    info["j1"] = {
        "classification": "expected_stage_scope_only",
        "command": f"python3 {J1_VALIDATOR} --no-write",
        "probe_total": total,
        "probe_rejected": r.get("probe_rejected"),
        "probe_not_rejected": not_rej,
        "semantic_probes": f"{(total or 0) - (not_rej or 0)}/{total}",
        "expected_error_count": J1_ERROR_COUNT_EXPECTED,
        "unexpected_error_count": max(0, len(j1_errs) - J1_ERROR_COUNT_EXPECTED),
        "raw_error_array": j1_errs,
        "expected_error_array": EXPECTED_J1_ERRORS,
        "canonicalization": "compact UTF-8 JSON (separators (',',':'), ensure_ascii=False) of the ordered array",
        "error_signature_sha256": _canon_sha(j1_errs),
        "expected_error_signature_sha256": J1_ERROR_SIGNATURE_SHA,
        "rationale": ("The frozen J1 binding validator's pinned master-ledger source hash + its 5-file allowlist react "
                      "to J2's legitimate ledger/index/packet changes. No binding-content failure (probes 60/60). "
                      "Acceptable ONLY with the J2 proof: exact ten held metadata updates, accepted two byte-identical, "
                      "all transition arrays unchanged, 0 new transitions, post-J2 ledger hash pinned."),
    }
    errs.extend(j1_stage_scope_errors(total, not_rej, j1_errs))


def manifest_j1_binding_errors(manifest, live):
    """PURE: the run manifest's J1 block + commands[0] wording must BIND to the LIVE frozen-J1 post-J2
    result. Rejects the two shadow-flagged contradictions and any drift from the live result:
      - commands[0] must not claim the frozen J1 validator 'unchanged'/'PASS' post-J2; it must state the
        actual result (semantic probes 60/60 + the two expected stage-scope HASH/ALLOWLIST errors);
      - the J1 block's classification/probes/counts/signature/error-array must equal the live info['j1']
        (and the pinned expected signature); the rationale must state the frozen J1 validator's 5-file
        allowlist (NOT '8-file allowlist') that flags the eight J2 changed paths."""
    e = []
    if manifest is None:
        return ["run manifest missing (cannot bind J1 block/commands to live result)"]
    cmds = manifest.get("commands") or []
    c0 = cmds[0] if cmds else ""
    low = c0.lower()
    if J1_VALIDATOR not in c0:
        e.append("manifest commands[0] must invoke the frozen J1 binding validator")
    if "unchanged" in low:
        e.append("manifest commands[0] must not claim the frozen J1 validator is 'unchanged' post-J2")
    if "pass" in low:
        e.append("manifest commands[0] must not claim the frozen J1 validator PASSes post-J2 (it reports the expected stage-scope errors)")
    if "60/60" not in c0:
        e.append("manifest commands[0] must state the actual semantic probes 60/60")
    if not ("HASH" in c0 and "ALLOWLIST" in c0):
        e.append("manifest commands[0] must name the two expected stage-scope errors (HASH + ALLOWLIST)")
    j = manifest.get("frozen_j1_validator_post_j2") or {}
    live = live or {}
    if j.get("classification") != live.get("classification"):
        e.append("manifest J1 classification != live frozen-J1 classification")
    if j.get("semantic_probes") != live.get("semantic_probes"):
        e.append("manifest J1 semantic_probes != live frozen-J1 result")
    if j.get("semantic_probes") != f"{J1_PROBES_TOTAL_EXPECTED}/{J1_PROBES_TOTAL_EXPECTED}":
        e.append(f"manifest J1 semantic_probes != {J1_PROBES_TOTAL_EXPECTED}/{J1_PROBES_TOTAL_EXPECTED}")
    if j.get("expected_error_count") != live.get("expected_error_count") or j.get("expected_error_count") != J1_ERROR_COUNT_EXPECTED:
        e.append("manifest J1 expected_error_count != live / pinned 2")
    if j.get("error_signature_sha256") != live.get("error_signature_sha256"):
        e.append("manifest J1 error_signature_sha256 != live frozen-J1 signature")
    if j.get("error_signature_sha256") != J1_ERROR_SIGNATURE_SHA:
        e.append("manifest J1 error_signature_sha256 != pinned expected signature")
    if j.get("raw_error_array") != live.get("raw_error_array"):
        e.append("manifest J1 raw_error_array != live frozen-J1 error array")
    if j.get("raw_error_array") != EXPECTED_J1_ERRORS:
        e.append("manifest J1 raw_error_array != exact expected two-error scope/pin signature")
    if j.get("binding_sha256") != BIND_SHA:
        e.append("manifest J1 binding_sha256 != frozen J1 binding sha")
    rat = str(j.get("rationale", ""))
    if "8-file allowlist" in rat:
        e.append("manifest J1 rationale falsely says '8-file allowlist' (frozen J1 has a 5-file allowlist)")
    if "5-file allowlist" not in rat:
        e.append("manifest J1 rationale must state the frozen J1 validator's 5-file allowlist")
    return e


def check_run_manifest_j1_binding(ctx, errs, info):
    live = info.get("j1")
    e = manifest_j1_binding_errors(ctx.get("manifest"), live)
    info["manifest_j1_binding"] = {
        "bound_to": "live frozen_j1_validator_post_j2 result + pinned expected signature",
        "asserts": ["commands[0] states the actual post-J2 result (no 'unchanged'/'PASS' claim; 60/60 + HASH/ALLOWLIST)",
                    "J1 block classification/probes/count/signature/error-array == live",
                    "rationale states the frozen J1 5-file allowlist (not '8-file allowlist')"],
        "errors": e,
        "pass": not e,
    }
    errs.extend(e)


def check_legacy_delta(errs, info):
    out = subprocess.run([sys.executable, os.path.join(REPO, "scripts", "halo-phase1b", "validate_phase1b.py"), "--no-write"], capture_output=True, text=True)
    try:
        now = sorted(json.JSONDecoder().raw_decode(out.stdout.lstrip())[0]["errors"])
    except Exception:
        errs.append("could not parse legacy validate_phase1b.py output")
        return None
    info["legacy_now_count"] = len(now)
    errs.extend(legacy_delta_errors(now))
    return now


# ---------------- probes ----------------

def run_probes(ctx, legacy_now, live_j1=None):
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

    def MD(c, mid):
        return next(m for m in c["packet"]["metric_definitions"] if m.get("metric_id") == mid)

    rec("accepted_row_drift", lambda c: L(c, "SW-045").__setitem__("evaluation_state", "measured_unscored"))
    rec("accepted_value_regrade", lambda c: L(c, "SW-046")["transitions"].append({"from": "measured_validated", "to": "data_acquired_calculation_pending", "at": ACTIVATION_T, "by": "codex", "reason": "x"}))
    rec("authoritative_count_drift", lambda c: c["ledger_new_full"]["counts"].__setitem__("authoritative_evaluated", 16))
    rec("held_disposition_promotion", lambda c: L(c, "SW-043").__setitem__("disposition", "data_acquired_calculation_pending"))
    rec("held_evaluation_injection", lambda c: L(c, "SW-044").__setitem__("evaluation_state", "measured_graded"))
    rec("held_acquisition_injection", lambda c: L(c, "SW-113").__setitem__("acquisition_admission_state", "admitted_held"))
    rec("held_authoritative_injection", lambda c: L(c, "SW-114").__setitem__("authoritative", True))
    rec("held_source_dep_injection", lambda c: L(c, "SW-121").__setitem__("source_dependency_ids", ["SRC-enhanced_sales_communication_log_weekly-0002"]))
    rec("held_self_transition_add", lambda c: L(c, "SW-122")["transitions"].append({"from": "source_investigation_pending", "to": "source_investigation_pending", "at": ACTIVATION_T, "by": "codex", "reason": "x"}))
    rec("held_transition_delete", lambda c: L(c, "SW-123").__setitem__("transitions", []))
    rec("held_field_outside_allowlist", lambda c: L(c, "SW-125").__setitem__("boundary_class", "separate_serra_service"))
    rec("held_wrong_owner", lambda c: L(c, "SW-044").__setitem__("owner", "duane"))
    rec("held_wrong_next_action", lambda c: L(c, "SW-113").__setitem__("next_action", "Do something else."))
    rec("held_evidence_ref_drift", lambda c: L(c, "SW-114").__setitem__("evidence_ref", "no authority"))
    rec("held_report_state_invalid", lambda c: L(c, "SW-121").__setitem__("report_acceptance_state", "authored_non_measured"))
    rec("held_ses_wrong", lambda c: L(c, "SW-122").__setitem__("source_existence_state", "acquired_local"))
    rec("held_evidence_as_of_freshness", lambda c: L(c, "SW-123").__setitem__("evidence_as_of", "2026-09-01T04:36:18-04:00"))
    rec("held_review_point_drift", lambda c: L(c, "SW-126").__setitem__("review_point", "whenever"))
    rec("accepted_partition_drift", lambda c: c["packet"]["lifecycle_partition"]["accepted_measured_ids"].append("SW-043"))
    rec("packet_dep_nonempty", lambda c: c["packet"].__setitem__("source_dependencies", [{"source_id": "SRC-x-0003"}]))
    rec("metric_dep_nonempty", lambda c: MD(c, "SW-113").__setitem__("source_dependency_ids", ["SRC-x-0003"]))
    rec("packet_parity_drift", lambda c: MD(c, "SW-043").__setitem__("business_question", "tampered"))
    rec("packet_binding_sha_drift", lambda c: c["packet"]["authority_binding"].__setitem__("sha256", "0" * 64))
    rec("customer_emission_true", lambda c: c["packet"].__setitem__("customer_emission_authority", True))
    rec("customer_report_emitted", lambda c: c["packet"]["customer_projection"].__setitem__("customer_report_emitted", True))
    rec("value_injection_on_held", lambda c: MD(c, "SW-043").__setitem__("formula", "x/y"))
    rec("grade_injection_on_held", lambda c: MD(c, "SW-113").__setitem__("value", 0.42))
    rec("held_display_eligible_true", lambda c: MD(c, "SW-114").__setitem__("future_display_eligibility", True))
    rec("held_projection_allowed_true", lambda c: MD(c, "SW-121").__setitem__("customer_projection_allowed", True))
    rec("accepted_recomputed_true", lambda c: MD(c, "SW-045").__setitem__("recomputed_this_tranche", True))
    rec("accepted_display_eligible_false", lambda c: MD(c, "SW-046").__setitem__("future_display_eligibility", False))
    rec("accepted_quarantine_forbidden_weakened", lambda c: MD(c, "SW-045")["j2_quarantine"].__setitem__("forbidden_uses", ["calculation"]))
    rec("accepted_true_authority_to_crm", lambda c: MD(c, "SW-045")["j2_quarantine"].__setitem__("true_authority", "CRM Sales report"))
    rec("sw154_content_read_true", lambda c: MD(c, "SW-154").__setitem__("content_bytes_read", True))
    rec("service_parts_admitted", lambda c: c["binding"]["dealer_scope"].__setitem__("service_parts_admitted", 1))
    rec("cross_rooftop_admitted", lambda c: c["binding"]["dealer_scope"].__setitem__("cross_rooftop_admitted", 1))
    rec("accepted_substitution", lambda c: MD(c, "SW-045").__setitem__("source_family", "dealership_performance_x"))
    rec("quarantined_source_held", lambda c: MD(c, "SW-113").__setitem__("source_family_intent", "cage_kpi"))
    rec("index_other_packet_drift", lambda c: c["index_new"]["packets"][0].__setitem__("status", "active_authored"))
    rec("index_status_wrong", lambda c: next(p for p in c["index_new"]["packets"] if p["packet_id"] == "PKT-03-02").__setitem__("status", "provisional_planning"))
    rec("index_question_drift", lambda c: next(p for p in c["index_new"]["packets"] if p["packet_id"] == "PKT-03-02").__setitem__("management_question", "x"))
    rec("index_version_not_bumped", lambda c: c["index_new"].__setitem__("version", c["index_old"]["version"]))
    rec("nontarget_ledger_drift", lambda c: L(c, "SW-011").__setitem__("disposition", "genuinely_not_available"))
    rec("overlay_drift", lambda c: next(r for r in [c["ledger_new"][m] for m in c["ledger_new"] if c["ledger_new"][m].get("boundary_class") == "separate_serra_service"]).__setitem__("disposition", "measured_validated"))
    rec("two_delta_nonzero", lambda c: c["packet"]["two_delta_proof"]["evidence_delta"].__setitem__("count", 1))
    rec("target_order_drift", lambda c: c["packet"].__setitem__("target_ids", list(reversed(IDS))))
    # --- exact-contract rejection probes ---
    rec("held_extra_calculated_value", lambda c: MD(c, "SW-113").__setitem__("calculated_value", 0.42))
    rec("accepted_extra_new_grade", lambda c: MD(c, "SW-045").__setitem__("new_grade", "A"))
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
    rec("lifecycle_extra_bucket", lambda c: c["packet"]["lifecycle_partition"].__setitem__("bonus_bucket", ["SW-045"]))
    rec("lifecycle_target_ids_leak", lambda c: c["packet"]["lifecycle_partition"].__setitem__("target_ids", IDS))
    rec("customer_note_says_authorized", lambda c: c["packet"]["customer_projection"].__setitem__("note", "Customer emission is authorized for all accepted metrics."))
    rec_allow("nonallowlist_path_touch", set(ALLOWLIST) | {"src/server/brain-schema.ts"}, False)
    rec_allow("claude_staged", set(ALLOWLIST), True)
    if legacy_now is not None:
        rec_legacy("legacy_same_count_substitution", (sorted(legacy_now)[:-1] + ["ledger SW-999: fabricated swap error"]))
        rec_legacy("legacy_new_error_added", (sorted(legacy_now) + ["ledger SW-043: source SRC-x not registered"]))
        rec_legacy("legacy_removed_error", sorted(legacy_now)[:-1])
    # --- J1 expected_stage_scope comparator probes (pure; must reject) ---
    j1_ok = list(EXPECTED_J1_ERRORS)

    def rec_j1(name, total, not_rej, errors):
        e = j1_stage_scope_errors(total, not_rej, errors)
        probes.append({"probe": name, "expected": "reject", "got": "reject" if e else "accept", "pass": bool(e), "n": len(e), "sample": e[0] if e else None})

    rec_j1("j1_same_count_fabricated_swap", 60, 0, [j1_ok[0], "fabricated swap error"])
    rec_j1("j1_delete_one", 60, 0, [j1_ok[0]])
    rec_j1("j1_add_one", 60, 0, j1_ok + ["extra error"])
    rec_j1("j1_mutate_ledger_hash", 60, 0, ["HASH: docs/halo/contract/phase1b/master-ledger-295.json expected " + LEDGER_BASELINE_SHA + " got " + "0" * 64, j1_ok[1]])
    rec_j1("j1_mutate_allowlist_list", 60, 0, [j1_ok[0], "ALLOWLIST: changes outside allowlist vs baseline: " + repr(sorted(ALLOWLIST) + ["docs/x.json"])])
    rec_j1("j1_omit_one_j2_path", 60, 0, [j1_ok[0], "ALLOWLIST: changes outside allowlist vs baseline: " + repr(sorted(ALLOWLIST)[:-1])])
    rec_j1("j1_semantic_error_present", 60, 0, [j1_ok[0], "held SW-043: disposition promotion"])
    rec_j1("j1_probe_total_59", 59, 0, j1_ok)
    rec_j1("j1_not_rejected_1", 60, 1, j1_ok)
    rec_j1("j1_replace_hash_with_binding_drift", 60, 0, ["accepted SW-045: accepted_evaluation value drift", j1_ok[1]])
    # --- run-manifest J1-binding comparator probes (pure; must reject the shadow-flagged contradictions) ---
    base_manifest = ctx.get("manifest")
    if base_manifest is not None and live_j1 is not None:
        def rec_manifest(name, mutate):
            m = copy.deepcopy(base_manifest)
            lj = copy.deepcopy(live_j1)
            try:
                mutate(m, lj)
                e = manifest_j1_binding_errors(m, lj)
            except Exception as ex:  # noqa: BLE001
                probes.append({"probe": name, "expected": "reject", "got": "CRASH", "pass": False, "err": f"{type(ex).__name__}: {ex}"})
                return
            probes.append({"probe": name, "expected": "reject", "got": "reject" if e else "accept", "pass": bool(e), "n": len(e), "sample": e[0] if e else None})

        rec_manifest("manifest_commands_claims_unchanged_pass",
                     lambda m, lj: m["commands"].__setitem__(0, f"python3 {J1_VALIDATOR} --no-write  (J1; unchanged PASS)"))
        rec_manifest("manifest_commands_drops_probes_and_errors",
                     lambda m, lj: m["commands"].__setitem__(0, f"python3 {J1_VALIDATOR} --no-write"))
        rec_manifest("manifest_rationale_says_8_file_allowlist",
                     lambda m, lj: m["frozen_j1_validator_post_j2"].__setitem__("rationale", m["frozen_j1_validator_post_j2"]["rationale"].replace("5-file allowlist", "8-file allowlist")))
        rec_manifest("manifest_j1_signature_drift",
                     lambda m, lj: m["frozen_j1_validator_post_j2"].__setitem__("error_signature_sha256", "0" * 64))
        rec_manifest("manifest_j1_probes_drift",
                     lambda m, lj: m["frozen_j1_validator_post_j2"].__setitem__("semantic_probes", "59/60"))
        rec_manifest("manifest_j1_raw_array_swap",
                     lambda m, lj: m["frozen_j1_validator_post_j2"]["raw_error_array"].__setitem__(0, "fabricated stage-scope error"))
        rec_manifest("manifest_j1_count_drift",
                     lambda m, lj: m["frozen_j1_validator_post_j2"].__setitem__("expected_error_count", 4))
        # binding-to-LIVE: if the live result itself drifts, a static manifest must be rejected
        rec_manifest("manifest_stale_vs_live_signature",
                     lambda m, lj: lj.__setitem__("error_signature_sha256", "1" * 64))
        rec_manifest("manifest_stale_vs_live_probes",
                     lambda m, lj: lj.__setitem__("semantic_probes", "58/60"))
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
    check_run_manifest_j1_binding(ctx, errs, info)
    legacy_now = check_legacy_delta(errs, info)
    probes = run_probes(ctx, legacy_now, info.get("j1"))
    failed = [p for p in probes if not p["pass"]]
    overall = (not errs) and (not failed)

    result = {
        "check": "honda_watchdog_phase1b_pkt_03_02_j2_activation",
        "phase": "Phase 1B — PKT-03-02 J2 metadata/control activation (2 accepted carry-forward preserved + 10 held activated; 0 new transitions)",
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
        "run_manifest_j1_binding": info.get("manifest_j1_binding"),
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
        "note": "Truthful activation: 0 new transitions (existing arrays byte-identical); accepted rows byte-identical (no recalc/regrade); held rows metadata-only; accepted legacy fields byte-carried but quarantined (true authority = Dashboard); no new registry node; schema-v2/registry-v2 unmodified; no customer output; missing not zero; zero Service/Parts.",
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
