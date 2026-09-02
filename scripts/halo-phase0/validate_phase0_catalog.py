#!/usr/bin/env python3
"""
Honda Semantic Watchdog — Phase 0 deterministic catalog / module / Service-overlay validator.

PURPOSE (Phase 0 only): pin current truth. This script does NOT author per-metric
definitions or packet contents. It mechanically proves three things against the
authoritative feasibility matrix, using module ownership + Service overlay transcribed
verbatim from docs/halo/planning/HONDA_SEMANTIC_WATCHDOG_EXECUTION_SPEC.md (§3, §4):

  1. CATALOG   — the matrix contains exactly 295 unique, contiguous IDs SW-001..SW-295.
  2. MODULES   — the 11-module allocation covers every ID exactly once (no gap, no dupe),
                 and each module's declared count matches its enumerated IDs and the
                 grand total 28+28+24+22+26+36+26+27+20+32+26 == 295.
  3. OVERLAY   — the separate-Service overlay is exactly the 18 IDs the spec lists, every
                 overlay ID is inside the catalog, and each is owned by exactly one module.

It is fail-closed and evidence-first: any mismatch sets overall status to FAIL and is
enumerated. It reads only local files; it performs no network / Gmail / VinSolutions access.

Usage:
  python3 scripts/halo-phase0/validate_phase0_catalog.py \
      [--matrix docs/halo/contract/semantic-watchdog-feasibility-matrix-295.json] \
      [--out docs/halo/evidence/honda-watchdog/phase0/03_catalog_module_overlay_checks.json]

Exit code 0 == PASS, 1 == FAIL. The machine-check JSON is written to --out (and echoed).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_MATRIX = os.path.join(
    REPO_ROOT, "docs", "halo", "contract", "semantic-watchdog-feasibility-matrix-295.json"
)
DEFAULT_OUT = os.path.join(
    REPO_ROOT,
    "docs",
    "halo",
    "evidence",
    "honda-watchdog",
    "phase0",
    "03_catalog_module_overlay_checks.json",
)

CATALOG_MIN = 1
CATALOG_MAX = 295

# --- Authoritative 11-module ownership, transcribed verbatim from SPEC §4 -------------
# Each entry: (module number, title, declared_count, [(range_start, range_end), ...]).
# Single IDs are expressed as (n, n). These ranges are the source of truth for Phase 0
# ownership; they are NOT re-derived from the matrix.
MODULES = [
    (1, "Demand, source quality, and paid-media ROI", 28,
     [(1, 10), (63, 69), (116, 116), (119, 120), (230, 237)]),
    (2, "Speed-to-lead, contact coverage, and BDC cadence", 28,
     [(11, 18), (84, 89), (132, 141), (261, 262), (288, 288), (295, 295)]),
    (3, "Funnel, appointment, and showroom conversion", 24,
     [(31, 46), (113, 114), (121, 123), (125, 126), (154, 154)]),
    (4, "Deal economics, desking, F&I, and inventory velocity", 22,
     [(47, 62), (112, 112), (160, 160), (179, 180), (184, 184), (292, 292)]),
    (5, "Rep productivity, coaching, routing, and workforce health", 26,
     [(19, 30), (105, 111), (117, 117), (124, 124), (194, 197), (204, 204)]),
    (6, "Conversation discovery, personalization, and objection handling", 36,
     [(70, 78), (142, 153), (155, 159), (185, 185), (200, 203), (205, 206),
      (285, 285), (287, 287), (289, 289)]),
    (7, "Customer experience, trust, sentiment, and escalation", 26,
     [(161, 178), (181, 183), (193, 193), (198, 199), (286, 286), (290, 290)]),
    (8, "CRM data quality, compliance, and control integrity", 27,
     [(90, 104), (127, 131), (186, 192)]),
    (9, "Pipeline recovery and lifecycle reactivation", 20,
     [(207, 214), (217, 217), (219, 219), (221, 221), (250, 255), (277, 277),
      (282, 282), (291, 291)]),
    (10, "Sales-owned owner-base, loyalty, referral, and equity", 32,
     [(79, 83), (115, 115), (118, 118), (215, 216), (218, 218), (220, 220),
      (222, 229), (238, 243), (270, 270), (278, 279), (281, 281), (283, 283),
      (293, 294)]),
    (11, "Audience, territory, conquest, and lifecycle growth", 26,
     [(244, 249), (256, 260), (263, 269), (271, 276), (280, 280), (284, 284)]),
]

# --- Authoritative separate-Service overlay, verbatim from SPEC §3 --------------------
SERVICE_OVERLAY = [
    79, 81, 83, 115, 118, 199, 222, 223, 224, 225, 226, 227, 228, 229, 263, 270, 279, 294,
]

DECLARED_GRAND_TOTAL = 295


def sw(n: int) -> str:
    return f"SW-{n:03d}"


def expand(ranges):
    out = []
    for a, b in ranges:
        out.extend(range(a, b + 1))
    return out


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--matrix", default=DEFAULT_MATRIX)
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--no-write", action="store_true", help="print only; do not write --out")
    args = ap.parse_args()

    errors = []
    result = {
        "check": "honda_watchdog_phase0_catalog_module_overlay",
        "purpose": "Phase 0 pinning only — no per-metric definitions authored",
        "matrix_path": os.path.relpath(args.matrix, REPO_ROOT),
        "matrix_sha256": sha256_file(args.matrix),
    }

    # ---- Load matrix ----
    with open(args.matrix, "r", encoding="utf-8") as f:
        matrix = json.load(f)
    matrix_ids = [e.get("metric_id") for e in matrix]

    # ---- Check 1: CATALOG ----
    nums = []
    malformed = []
    for mid in matrix_ids:
        if not isinstance(mid, str) or not mid.startswith("SW-"):
            malformed.append(mid)
            continue
        try:
            nums.append(int(mid.split("-")[1]))
        except (ValueError, IndexError):
            malformed.append(mid)
    unique_nums = sorted(set(nums))
    expected = list(range(CATALOG_MIN, CATALOG_MAX + 1))
    catalog_ok = (
        len(matrix) == CATALOG_MAX
        and not malformed
        and len(nums) == len(unique_nums) == CATALOG_MAX
        and unique_nums == expected
    )
    if not catalog_ok:
        errors.append("CATALOG mismatch")
    result["catalog"] = {
        "entries": len(matrix),
        "expected_entries": CATALOG_MAX,
        "unique_ids": len(unique_nums),
        "malformed_ids": malformed,
        "duplicate_ids": sorted(sw(n) for n in nums if nums.count(n) > 1),
        "contiguous_1_to_295": unique_nums == expected,
        "first_id": matrix_ids[0] if matrix_ids else None,
        "last_id": matrix_ids[-1] if matrix_ids else None,
        "pass": catalog_ok,
    }

    # ---- Check 2: MODULES ----
    catalog_set = set(expected)
    owner = {}  # id -> list of modules claiming it
    module_report = []
    module_sum = 0
    for num, title, declared, ranges in MODULES:
        ids = expand(ranges)
        enumerated = len(ids)
        count_ok = enumerated == declared
        module_sum += enumerated
        out_of_range = sorted(sw(i) for i in ids if i not in catalog_set)
        dupes_within = sorted(sw(i) for i in ids if ids.count(i) > 1)
        for i in ids:
            owner.setdefault(i, []).append(num)
        if not count_ok:
            errors.append(f"MODULE {num} count {enumerated} != declared {declared}")
        if out_of_range:
            errors.append(f"MODULE {num} has out-of-catalog IDs {out_of_range}")
        if dupes_within:
            errors.append(f"MODULE {num} has intra-module duplicates {dupes_within}")
        module_report.append({
            "module": num,
            "title": title,
            "declared_count": declared,
            "enumerated_count": enumerated,
            "count_match": count_ok,
            "out_of_catalog": out_of_range,
            "intra_module_duplicates": dupes_within,
        })

    overlaps = sorted(sw(i) for i, mods in owner.items() if len(mods) > 1)
    covered = set(owner.keys())
    gaps = sorted(sw(i) for i in (catalog_set - covered))
    extra = sorted(sw(i) for i in (covered - catalog_set))
    grand_total_ok = module_sum == DECLARED_GRAND_TOTAL == CATALOG_MAX
    if overlaps:
        errors.append(f"MODULE overlaps (ID owned by >1 module): {overlaps}")
    if gaps:
        errors.append(f"MODULE coverage gaps (uncovered catalog IDs): {gaps}")
    if extra:
        errors.append(f"MODULE extra IDs not in catalog: {extra}")
    if not grand_total_ok:
        errors.append(f"MODULE grand total {module_sum} != {DECLARED_GRAND_TOTAL}")
    modules_ok = not overlaps and not gaps and not extra and grand_total_ok and all(
        m["count_match"] and not m["out_of_catalog"] and not m["intra_module_duplicates"]
        for m in module_report
    )
    result["modules"] = {
        "module_count": len(MODULES),
        "grand_total_enumerated": module_sum,
        "declared_grand_total": DECLARED_GRAND_TOTAL,
        "grand_total_match": grand_total_ok,
        "each_id_exactly_once": not overlaps and not gaps and not extra,
        "overlaps": overlaps,
        "coverage_gaps": gaps,
        "extra_ids": extra,
        "per_module": module_report,
        "pass": modules_ok,
    }

    # ---- Check 3: SERVICE OVERLAY ----
    overlay_ids = SERVICE_OVERLAY
    overlay_count_ok = len(overlay_ids) == 18 == len(set(overlay_ids))
    overlay_out_of_catalog = sorted(sw(i) for i in overlay_ids if i not in catalog_set)
    overlay_owner = {}
    for i in overlay_ids:
        overlay_owner[sw(i)] = owner.get(i, [])
    overlay_unowned = sorted(k for k, v in overlay_owner.items() if len(v) != 1)
    if not overlay_count_ok:
        errors.append("OVERLAY count != 18 unique")
    if overlay_out_of_catalog:
        errors.append(f"OVERLAY IDs out of catalog {overlay_out_of_catalog}")
    if overlay_unowned:
        errors.append(f"OVERLAY IDs not owned by exactly one module {overlay_unowned}")
    overlay_ok = overlay_count_ok and not overlay_out_of_catalog and not overlay_unowned
    result["service_overlay"] = {
        "expected_count": 18,
        "actual_count": len(overlay_ids),
        "ids": [sw(i) for i in overlay_ids],
        "all_in_catalog": not overlay_out_of_catalog,
        "out_of_catalog": overlay_out_of_catalog,
        "owning_module_by_id": {k: (v[0] if len(v) == 1 else v) for k, v in overlay_owner.items()},
        "each_owned_by_one_module": not overlay_unowned,
        "pass": overlay_ok,
    }

    overall = catalog_ok and modules_ok and overlay_ok
    result["errors"] = errors
    result["overall_pass"] = overall

    payload = json.dumps(result, indent=2, ensure_ascii=False)
    if not args.no_write:
        os.makedirs(os.path.dirname(args.out), exist_ok=True)
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(payload + "\n")
    print(payload)
    print(f"\nRESULT: {'PASS' if overall else 'FAIL'}", file=sys.stderr)
    return 0 if overall else 1


if __name__ == "__main__":
    raise SystemExit(main())
