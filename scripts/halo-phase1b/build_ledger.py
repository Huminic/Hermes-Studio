#!/usr/bin/env python3
"""
Phase 1B — deterministic generator for the master 295 ledger instance + packet assignment.

Design-only. Produces:
  docs/halo/contract/phase1b/master-ledger-295.json   (SW-001..295 exactly once; frozen module owner;
                                                        unique packet assignment; init states)
  docs/halo/contract/phase1b/packet-index.json         (packet_id -> module, target_ids, status)

Packet assignment: each module's frozen IDs are chunked into vertical packets of 5-12 IDs, one module
per packet, union == 295, no overlap. Module 2's first packet is exactly SW-011..015 = PKT-02-01
(the only packet authored in detail this phase). Everything is derived from the frozen Phase 0 module
map; nothing is invented. No metric definitions are authored here (planning-level ledger only).
"""
from __future__ import annotations

import json
import math
import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(REPO, "scripts", "halo-phase0"))
import validate_phase0_catalog as p0  # noqa: E402

# Frozen Service overlay (SPEC §3) — these 18 are disposition-only, outside Honda Sales.
OVERLAY = {79, 81, 83, 115, 118, 199, 222, 223, 224, 225, 226, 227, 228, 229, 263, 270, 279, 294}
AS_OF = "2026-09-02T06:27:10Z"  # pinned ledger-init stamp (real build time)


def module_ids():
    m = {}
    for num, _t, _dc, ranges in p0.MODULES:
        m[num] = sorted(p0.expand(ranges))
    return m


def balanced_chunk(ids):
    n = len(ids)
    k = max(1, math.ceil(n / 12))
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


def build():
    mods = module_ids()
    assignment = {}  # packet_id -> {module, ids}
    for mod in range(1, 12):
        ids = mods[mod]
        if mod == 2:
            groups = [ids[:5]] + balanced_chunk(ids[5:])   # PKT-02-01 = SW-011..015 fixed
        else:
            groups = balanced_chunk(ids)
        for seq, grp in enumerate(groups, start=1):
            pid = f"PKT-{mod:02d}-{seq:02d}"
            assignment[pid] = {"module": mod, "ids": grp}

    # invariants (build-time asserts)
    all_ids = [i for a in assignment.values() for i in a["ids"]]
    assert sorted(all_ids) == list(range(1, 296)), "union != 295 / overlap"
    for pid, a in assignment.items():
        assert 5 <= len(a["ids"]) <= 12, f"{pid} size {len(a['ids'])} out of 5..12"
        assert all(p0_owner(i) == a["module"] for i in a["ids"]), f"{pid} module mismatch"

    id_to_packet = {i: pid for pid, a in assignment.items() for i in a["ids"]}

    # master ledger rows
    rows = []
    for n in range(1, 296):
        pid = id_to_packet[n]
        mod = assignment[pid]["module"]
        overlay = n in OVERLAY
        if overlay:
            row = _row(n, mod, pid, boundary="separate_serra_service", disp="outside_sales_domain",
                       ses="proved_outside_sales_domain", evidence="SPEC §3 separate-Service overlay (18 IDs)",
                       next_action="internal disposition-only; appendix ID+label only", review="terminal (governance)")
        else:
            row = _row(n, mod, pid, boundary="sales", disp="source_investigation_pending",
                       ses="unproved", evidence="ledger-init; existence unproved pending packet investigation",
                       next_action="scheduled under " + pid + " (planning)", review="on packet activation")
        rows.append(row)

    # PKT-02-01 detailed init (SW-011..015): source reuse vs investigation
    reuse = {11, 12, 15}  # measurable from the reused Leads artifact -> data_acquired_calculation_pending
    invest = {13, 14}     # require finite investigation -> source_investigation_pending
    src_id = "SRC-vinsolutions_custom_reporting_leads-0001"
    for r in rows:
        num = int(r["metric_id"].split("-")[1])
        if num in reuse:
            r.update({"disposition": "data_acquired_calculation_pending", "source_existence_state": "acquired_local",
                      "acquisition_admission_state": "admitted_held", "evaluation_state": "not_measured",
                      "source_dependency_ids": [src_id], "definition_version": "0.1.0",
                      "evidence_ref": "PKT-02-01 (reuse of accepted vinsolutions_custom_reporting_leads Honda 21043 artifact)",
                      "next_action": "recompute value from normalized rows (Phase 6); independent test",
                      "review_point": "PKT-02-01 acceptance"})
            r["transitions"].append(_t("source_investigation_pending", "data_acquired_calculation_pending",
                                        "PKT-02-01 authoring: existing accepted Leads source reused"))
        elif num in invest:
            r.update({"disposition": "source_investigation_pending", "source_existence_state": "investigation_pending",
                      "definition_version": "0.1.0",
                      "evidence_ref": "PKT-02-01 (finite investigation packet; direct field absent in current source)",
                      "next_action": "finite help-contract + read-only UI + one controlled probe (no Vin/UI action this step)",
                      "review_point": "PKT-02-01 investigation close"})
            r["transitions"].append(_t("source_investigation_pending", "source_investigation_pending",
                                        "PKT-02-01 authoring: opened finite investigation (no direct field yet)"))

    ledger = {
        "artifact": "honda-watchdog-phase1b-master-ledger-295",
        "schema": "docs/halo/contract/phase1b/master-ledger-schema.json",
        "built_by": "scripts/halo-phase1b/build_ledger.py (deterministic; frozen Phase 0 module map)",
        "pinned_at_utc": AS_OF,
        "profile": "serra-honda", "dealer_id": "21043",
        "catalog_sha256_expected": "29c7ac06130f9b4fe8d5df0a2d0d6fffed7c6ff4dc02eca96e0f44d109a04fc1",
        "counts": {"metrics": len(rows), "packets": len(assignment), "overlay": len(OVERLAY)},
        "rows": rows,
    }
    index = {
        "artifact": "honda-watchdog-phase1b-packet-index",
        "pinned_at_utc": AS_OF,
        "note": "Full packet assignment is planning-only; only PKT-02-01 is active/authored in detail.",
        "packets": [
            {"packet_id": pid, "module": a["module"], "target_ids": [sw(i) for i in a["ids"]],
             "size": len(a["ids"]), "status": ("active_authored" if pid == "PKT-02-01" else "planned"),
             "management_question": ("Are new Sales leads being contacted promptly and consistently, and which response gaps need management action?" if pid == "PKT-02-01" else None)}
            for pid, a in sorted(assignment.items())
        ],
    }
    _write("docs/halo/contract/phase1b/master-ledger-295.json", ledger)
    _write("docs/halo/contract/phase1b/packet-index.json", index)
    print(f"wrote master-ledger-295.json ({len(rows)} rows) + packet-index.json ({len(assignment)} packets)")


def p0_owner(i):
    for num, _t, _dc, ranges in p0.MODULES:
        if i in p0.expand(ranges):
            return num
    return None


def _t(frm, to, reason):
    return {"from": frm, "to": to, "at": AS_OF, "by": "codex", "reason": reason}


def _row(n, mod, pid, boundary, disp, ses, evidence, next_action, review):
    return {
        "metric_id": sw(n), "module": mod, "packet_id": pid, "boundary_class": boundary,
        "definition_version": "0.0.0", "disposition": disp, "source_existence_state": ses,
        "acquisition_admission_state": "not_acquired", "evaluation_state": "not_measured",
        "report_acceptance_state": "draft", "owner": "codex", "evidence_as_of": AS_OF,
        "evidence_ref": evidence, "next_action": next_action, "review_point": review,
        "source_dependency_ids": [],
        "transitions": [{"from": None, "to": disp, "at": AS_OF, "by": "codex", "reason": "ledger init from frozen 295->11 map"}],
    }


def _write(rel, obj):
    path = os.path.join(REPO, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(json.dumps(obj, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    build()
