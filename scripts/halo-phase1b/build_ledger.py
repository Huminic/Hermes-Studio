#!/usr/bin/env python3
"""
Phase 1B — deterministic generator for the master 295 ledger instance + packet assignment.

Design-only. Carries forward AUTHORITATIVE prior Honda truth (does NOT reset accepted/evaluated
metrics): the 17 evaluated Honda metrics from gate5b-report-model-21043.json remain measured; the
Service overlay (18) stays outside_sales_domain; everything else is an EXPLICITLY NON-AUTHORITATIVE
provisional planning placeholder. Packet assignment is mechanically balanced (5-12 IDs, one module,
union == exact 295, no overlap) and labelled PROVISIONAL. Only PKT-02-01 is authored in detail.
No metric definitions authored here (planning-level ledger only).
"""
from __future__ import annotations

import json
import math
import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(REPO, "scripts", "halo-phase0"))
import validate_phase0_catalog as p0  # noqa: E402

OVERLAY = {79, 81, 83, 115, 118, 199, 222, 223, 224, 225, 226, 227, 228, 229, 263, 270, 279, 294}
# Authoritative accepted+evaluated Honda metrics (gate5b-report-model-21043.json coverage.evaluated=17)
EVALUATED_17 = {11, 12, 15, 21, 22, 31, 32, 33, 41, 45, 46, 90, 133, 142, 145, 149, 150}
LEADS_PROMOTED = {11, 12, 15, 90}   # vinsolutions_custom_reporting_leads: ACCEPTED+EVALUATED (Gate 4A promotion)
SRC_LEADS = "SRC-vinsolutions_custom_reporting_leads-0001"
AS_OF = "2026-09-02T06:51:10Z"
TRUTH_REF = "gate5b-report-model-21043.json (evaluated); gate2-evaluator-contract.json; baseline-registry.json"


def module_ids():
    return {num: sorted(p0.expand(ranges)) for num, _t, _dc, ranges in p0.MODULES}


def balanced_chunk(ids):
    n = len(ids); k = max(1, math.ceil(n / 12))
    while k > 1 and n / k < 5:
        k -= 1
    base, rem = divmod(n, k)
    sizes = [base + 1] * rem + [base] * (k - rem)
    out, i = [], 0
    for s in sizes:
        out.append(ids[i:i + s]); i += s
    return out


def sw(n):
    return f"SW-{n:03d}"


def p0_owner(i):
    for num, _t, _dc, ranges in p0.MODULES:
        if i in p0.expand(ranges):
            return num
    return None


def build():
    mods = module_ids()
    assignment = {}
    for mod in range(1, 12):
        ids = mods[mod]
        groups = ([ids[:5]] + balanced_chunk(ids[5:])) if mod == 2 else balanced_chunk(ids)
        for seq, grp in enumerate(groups, start=1):
            assignment[f"PKT-{mod:02d}-{seq:02d}"] = {"module": mod, "ids": grp}

    all_ids = [i for a in assignment.values() for i in a["ids"]]
    assert sorted(all_ids) == list(range(1, 296))
    for pid, a in assignment.items():
        assert 5 <= len(a["ids"]) <= 12 and all(p0_owner(i) == a["module"] for i in a["ids"])
    id_to_packet = {i: pid for pid, a in assignment.items() for i in a["ids"]}

    rows = [row_for(n, id_to_packet[n], assignment[id_to_packet[n]]["module"]) for n in range(1, 296)]

    ledger = {
        "artifact": "honda-watchdog-phase1b-master-ledger-295",
        "schema": "docs/halo/contract/phase1b/master-ledger-schema.json",
        "built_by": "scripts/halo-phase1b/build_ledger.py (deterministic; frozen Phase 0 map; carry-forward of authoritative Honda truth)",
        "pinned_at_utc": AS_OF, "profile": "serra-honda", "dealer_id": "21043",
        "catalog_sha256_expected": "29c7ac06130f9b4fe8d5df0a2d0d6fffed7c6ff4dc02eca96e0f44d109a04fc1",
        "authoritative_current_truth": {
            "evaluated_17": [sw(n) for n in sorted(EVALUATED_17)],
            "source": "gate5b-report-model-21043.json coverage.evaluated=17",
            "note": "These 17 rows carry forward current accepted/evaluated truth and are NOT reset. All other non-overlay rows are explicitly non-authoritative provisional planning placeholders."
        },
        "counts": {"metrics": len(rows), "packets": len(assignment), "overlay": len(OVERLAY), "authoritative_evaluated": len(EVALUATED_17)},
        "rows": rows,
    }
    index = {
        "artifact": "honda-watchdog-phase1b-packet-index",
        "pinned_at_utc": AS_OF,
        "assignment_kind": "mechanically_balanced_provisional",
        "note": "Packet assignments are PROVISIONAL PLANNING assignments (mechanically balanced by module: 5-12 IDs, union == exact 295, no overlap). They are NOT yet logically grouped: each packet's management question and metric cohesion is authored/reviewed only on activation. Only PKT-02-01 is active/authored. Any reassignment must be versioned and preserve the exact 295 union.",
        "version": 2,
        "packets": [
            {"packet_id": pid, "module": a["module"], "target_ids": [sw(i) for i in a["ids"]], "size": len(a["ids"]),
             "status": ("active_authored" if pid == "PKT-02-01" else "provisional_planning"),
             "management_question": ("Are new Sales leads being contacted promptly and consistently, and which response gaps need management action?" if pid == "PKT-02-01" else None)}
            for pid, a in sorted(assignment.items())
        ],
    }
    _write("docs/halo/contract/phase1b/master-ledger-295.json", ledger)
    _write("docs/halo/contract/phase1b/packet-index.json", index)
    print(f"wrote ledger ({len(rows)} rows; {len(EVALUATED_17)} authoritative evaluated) + packet-index ({len(assignment)} provisional packets)")


def _init(to, reason):
    return [{"from": None, "to": to, "at": AS_OF, "by": "codex", "reason": reason}]


def row_for(n, pid, mod):
    mid = sw(n)
    base = {"metric_id": mid, "module": mod, "packet_id": pid, "boundary_class": "sales",
            "definition_version": "0.0.0", "owner": "codex", "evidence_as_of": AS_OF,
            "source_dependency_ids": [], "authoritative": False}
    if n in OVERLAY:
        base.update({"boundary_class": "separate_serra_service", "definition_version": "1.0.0",
                     "disposition": "outside_sales_domain", "source_existence_state": "proved_outside_sales_domain",
                     "acquisition_admission_state": "not_acquired", "evaluation_state": "not_measured",
                     "report_acceptance_state": "draft", "authoritative": True,
                     "current_truth_ref": "SPEC §3 separate-Service overlay (18 IDs) — frozen",
                     "evidence_ref": "SPEC §3 overlay; internal disposition-only; appendix ID+label only",
                     "next_action": "internal disposition-only (no Honda value/narrative/grade)", "review_point": "terminal (governance)",
                     "transitions": _init("outside_sales_domain", "ledger init: frozen Service overlay")})
    elif n in EVALUATED_17:
        leads = n in LEADS_PROMOTED
        base.update({"definition_version": "1.0.0", "disposition": "measured_validated",
                     "source_existence_state": "acquired_local",
                     "acquisition_admission_state": ("admitted_promoted" if leads else "admitted_held"),
                     "evaluation_state": "measured_graded", "report_acceptance_state": "accepted", "authoritative": True,
                     "current_truth_ref": TRUTH_REF,
                     "source_dependency_ids": ([SRC_LEADS] if leads else []),
                     "evidence_ref": "carry-forward of authoritative accepted+evaluated Honda state (" + TRUTH_REF + ")",
                     "next_action": "none (accepted/evaluated); recompute on next period",
                     "review_point": "next accepted period",
                     "transitions": _init("measured_validated", "carry-forward authoritative accepted+evaluated Honda truth (not reset)")})
    else:
        base.update({"disposition": "source_investigation_pending", "source_existence_state": "unproved",
                     "acquisition_admission_state": "not_acquired", "evaluation_state": "not_measured",
                     "report_acceptance_state": "draft", "authoritative": False,
                     "evidence_ref": "provisional planning placeholder (NON-AUTHORITATIVE); existence unproved",
                     "next_action": "provisional; investigated when packet " + pid + " is activated",
                     "review_point": "on packet activation",
                     "transitions": _init("source_investigation_pending", "ledger init: provisional non-authoritative placeholder")})
    return base


def _write(rel, obj):
    path = os.path.join(REPO, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(json.dumps(obj, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    build()
