#!/usr/bin/env python3
"""
Honda Semantic Watchdog — Phase 1A GENERIC recursive contract validator + self-tests.

Design-only (no records authored). Enforcement is driven by machine-readable JSON-Schema-like
definitions in docs/halo/contract/phase1/record-schemas.json, interpreted by a GENERIC recursive
engine (validate_instance) supporting: type, enum, const, pattern, format(semver|iso_datetime),
items, minItems, nonempty, minimum/maximum, properties, required, additionalProperties=false,
$vocab (closed-vocab membership), $ref (record composition). On top of structural validation,
explicit CROSS-RECORD invariants enforce: module ownership; Service-overlay strictness; full
disposition<->evaluation and disposition<->source_existence consistency; SIP/GNA rules;
calculation-kind conditionals; scoring (approved+active+compatible); registered source/candidate ID
resolution and frozen-catalog membership; the source_existence<->acquisition pair matrix; exact
fail-closed-stop inheritance; and machine-semantic blast-radius + vault-gate exactness.

Self-tests are generated RECURSIVELY from the schemas (drop each required field at any depth; inject
a type/enum/pattern/format/const violation at each leaf) so coverage is exhaustive, not example-
based. Plus the 17 named malformed probes reproduced by the impartial reviewer.

Reads only local files; no network/Gmail/VinSolutions access. Exit 0==PASS, 1==FAIL.
Usage: python3 scripts/halo-phase1/validate_phase1_contracts.py [--out <path>] [--no-write]
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import re
import sys
from datetime import datetime

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CONTRACT_DIR = os.path.join(REPO_ROOT, "docs", "halo", "contract", "phase1")
MATRIX = os.path.join(REPO_ROOT, "docs", "halo", "contract", "semantic-watchdog-feasibility-matrix-295.json")
DEFAULT_OUT = os.path.join(REPO_ROOT, "docs", "halo", "evidence", "honda-watchdog", "phase1a", "PHASE1A_CONTRACT_CHECKS.json")

SW = re.compile(r"^SW-\d{3}$")
CAND = re.compile(r"^CAND-\d{4}$")
SEMVER = re.compile(r"^\d+\.\d+\.\d+$")


def valid_iso_datetime(s):
    """Calendar-valid, timezone-AWARE ISO-8601 (not just regex shape).
    Rejects impossible dates/times (e.g. 2026-13-40T25:61:61Z) and naive (tz-less) timestamps."""
    if not isinstance(s, str):
        return False
    t = s.strip()
    if t.endswith("Z"):
        t = t[:-1] + "+00:00"
    try:
        d = datetime.fromisoformat(t)
    except ValueError:
        return False
    return d.tzinfo is not None  # contract requires timezone-aware

sys.path.insert(0, os.path.join(REPO_ROOT, "scripts", "halo-phase0"))
import validate_phase0_catalog as p0  # noqa: E402


def load(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


FV = load(os.path.join(CONTRACT_DIR, "frozen-vocabularies.json"))["closed_vocabularies"]
RS = load(os.path.join(CONTRACT_DIR, "record-schemas.json"))
DEFS = RS["definitions"]
FCS = load(os.path.join(CONTRACT_DIR, "fail-closed-stops.json"))

DISP = FV["disposition"]
CALC_REQ = FV["calculation_kind"]["required_fields_by_kind"]
SEM_REQ = FV["calculation_kind"]["semantic_requires"]
OVERLAY = set(FV["boundary_class"]["service_overlay_ids"])
DISP_EVAL = FV["disposition_evaluation_consistency"]["map"]
DISP_SES = FV["source_existence_state"]["disposition_consistency"]
SES_ACQ = FV["source_existence_acquisition_matrix"]["allowed_pairs"]
CATALOG = set(range(1, 296))
SRC_DEP_FIELDS = {"direct_source_fields", "numerator", "denominator", "formula", "zero_denominator_behavior"}

# ---------------------------------------------------------------- RELATIONAL Phase 0 authority anchor
# Canonical stops / blast-radius / vault-gate semantics are NOT hard-coded literals (which could be
# co-mutated with the contract). They are DERIVED from a machine-readable authority representation
# (phase0-derived-authority.json) whose every value is RELATIONALLY verified to appear in the pinned,
# immutable Phase 0 evidence (07/09) and reviewed SPEC. A value is accepted only if its token/phrase
# literally appears in the unchanged Phase 0 / SPEC text, so co-mutating validator + contract fails
# while Phase 0 authority is unchanged.
P07 = os.path.join(REPO_ROOT, "docs/halo/evidence/honda-watchdog/phase0/07_vault_vs_brain_topology.md")
P09 = os.path.join(REPO_ROOT, "docs/halo/evidence/honda-watchdog/phase0/09_conflict_register.json")
PSPEC = os.path.join(REPO_ROOT, "docs/halo/planning/HONDA_SEMANTIC_WATCHDOG_EXECUTION_SPEC.md")
AUTH_PATH = os.path.join(CONTRACT_DIR, "phase0-derived-authority.json")
PHASE0_AUTHORITY = {
    P07: "9d3bb62894701d5f973b275ad8f68ebc47863aa45abf9f88c34cde22e7d74b2d",
    P09: "0357992bcc60b7a085ceb2f2b7d83b8c4549941de26d8dbb68d43af5490d2504",
    PSPEC: "fedd957b9431521591155763327147d86c25fe3da11e2996470c134eaf9d785e",
}
AUTH_SHA = "2e8bdb60da09faf02bd88dcf3bd3485356f4868833884e260a78f71fe05a1827"


def _read_text(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def _relational_derive(auth, src):
    """Validate an authority payload against immutable source TEXT; derive canon/blast/vault.
    A value is accepted only if its token/phrase literally appears in the unchanged text, so a
    co-mutated (weakened) payload fails here even when Phase 0 files are untouched."""
    if not isinstance(auth, dict):
        return None, ["authority payload not an object"]
    errs = []
    try:
        v = auth["vault"]["value"]
        for f, toks in auth["vault"]["relational_tokens"].items():
            for tok in toks:
                if tok not in src.get(f, ""):
                    errs.append(f"vault token {tok!r} not in {f}")
        if ("`%s`" % v.get("required_dir_mode")) not in src.get("vault_topology_07", ""):
            errs.append("vault required_dir_mode not backed by Phase 0 07")
        if ("`%s`" % v.get("required_file_mode")) not in src.get("vault_topology_07", ""):
            errs.append("vault required_file_mode not backed by Phase 0 07")
        if v.get("status_must_contain", "\0") not in src.get("conflict_register_09", ""):
            errs.append("vault status token not backed by Phase 0 09")
        if v.get("fail_closed") is not True or "fail closed" not in src.get("vault_topology_07", ""):
            errs.append("vault fail_closed not backed by Phase 0 07")
        blast = auth["blast"]["value"]
        for tok in auth["blast"]["relational_tokens"].get("spec", []):
            if tok not in src.get("spec", ""):
                errs.append(f"blast token {tok!r} not in SPEC")
        if "cannot block unrelated modules" in src.get("spec", "") and blast.get("blocks_unrelated_modules") is not False:
            errs.append("blast blocks_unrelated_modules must be false per SPEC")
        if "blocks only its dependent IDs" in src.get("spec", "") and blast.get("one_source_failure_scope") != "dependent_ids_only":
            errs.append("blast one_source_failure_scope must be dependent_ids_only per SPEC")
        canon = []
        for st in auth["canonical_stops"]:
            ph = st.get("spec_phrase")
            if not ph or ph not in src.get("spec", ""):
                errs.append(f"canonical stop phrase {ph!r} not in SPEC")
            canon.append(st.get("key"))
        if len(canon) != 11:
            errs.append("authority canonical stops != 11")
    except (KeyError, TypeError, AttributeError) as ex:
        return None, [f"authority payload malformed: {ex}"]
    if errs:
        return None, errs
    return {"vault": v, "blast": blast, "canon": canon}, errs


def _load_phase0_src():
    return {"vault_topology_07": _read_text(P07), "conflict_register_09": _read_text(P09), "spec": _read_text(PSPEC)}


def derive_authority():
    """Verify immutable hashes (Phase 0 07/09 + SPEC + authority representation), then derive."""
    errs = []
    pins = dict(PHASE0_AUTHORITY); pins[AUTH_PATH] = AUTH_SHA
    for path, want in pins.items():
        try:
            got = sha256_file(path)
        except OSError:
            errs.append(f"authority file missing {os.path.basename(path)}"); continue
        if got != want:
            errs.append(f"authority {os.path.basename(path)} hash drift (anchor broken)")
    if errs:
        return None, errs
    derived, derrs = _relational_derive(load(AUTH_PATH), _load_phase0_src())
    return derived, errs + derrs


DERIVED, DERIVE_ERRORS = derive_authority()
VAULT_SEM = DERIVED["vault"] if DERIVED else {}
BLAST_SEM = DERIVED["blast"] if DERIVED else {}
CANON_STOPS = DERIVED["canon"] if DERIVED else []


def validate_canon_list(lst):
    if not CANON_STOPS:
        return ["canonical stops not derived from Phase 0 authority"]
    if lst != CANON_STOPS:
        return ["canonical_stop_names != Phase 0-derived authority (rename / co-mutation attempt)"]
    return []


def owner_map():
    o = {}
    for num, _t, _dc, ranges in p0.MODULES:
        for i in p0.expand(ranges):
            o.setdefault(i, []).append(num)
    return o


OWNER = owner_map()


# ----------------------------------------------------------------- generic recursive schema engine
def resolve(schema):
    while isinstance(schema, dict) and "$ref" in schema:
        schema = DEFS[schema["$ref"]]
    return schema


def validate_instance(obj, schema, path, errs):
    schema = resolve(schema)
    if "$vocab" in schema:
        allowed = set(FV[schema["$vocab"]]["values"].keys())
        if not isinstance(obj, str):
            errs.append(f"{path}: vocab value must be a string, got {type(obj).__name__}")
            return
        if obj not in allowed:
            errs.append(f"{path}: '{obj}' not in vocab {schema['$vocab']}")
        return
    if "const" in schema:
        if obj != schema["const"]:
            errs.append(f"{path}: must equal const {schema['const']!r}")
        return
    t = schema.get("type")
    if t == "object":
        if not isinstance(obj, dict):
            errs.append(f"{path}: not object"); return
        props = schema.get("properties", {})
        for r in schema.get("required", []):
            if r not in obj:
                errs.append(f"{path}.{r}: required property missing")
        if schema.get("additionalProperties") is False:
            for k in obj:
                if k not in props:
                    errs.append(f"{path}.{k}: additional property not allowed")
        for k, v in obj.items():
            if k in props:
                validate_instance(v, props[k], f"{path}.{k}", errs)
        return
    if t == "array":
        if not isinstance(obj, list):
            errs.append(f"{path}: not array"); return
        if "minItems" in schema and len(obj) < schema["minItems"]:
            errs.append(f"{path}: fewer than minItems {schema['minItems']}")
        if "items" in schema:
            for i, el in enumerate(obj):
                validate_instance(el, schema["items"], f"{path}[{i}]", errs)
        return
    if t == "string":
        if not isinstance(obj, str):
            errs.append(f"{path}: not string"); return
        if schema.get("nonempty") and obj == "":
            errs.append(f"{path}: empty string")
        if "enum" in schema and obj not in schema["enum"]:
            errs.append(f"{path}: '{obj}' not in enum")
        if "pattern" in schema and not re.match(schema["pattern"], obj):
            errs.append(f"{path}: fails pattern")
        fmt = schema.get("format")
        if fmt == "semver" and not SEMVER.match(obj):
            errs.append(f"{path}: not semver")
        if fmt == "iso_datetime" and not valid_iso_datetime(obj):
            errs.append(f"{path}: not a calendar-valid timezone-aware ISO datetime")
        return
    if t == "integer":
        if isinstance(obj, bool) or not isinstance(obj, int):
            errs.append(f"{path}: not integer"); return
        if "minimum" in schema and obj < schema["minimum"]:
            errs.append(f"{path}: below minimum")
        if "maximum" in schema and obj > schema["maximum"]:
            errs.append(f"{path}: above maximum")
        return
    if t == "boolean":
        if not isinstance(obj, bool):
            errs.append(f"{path}: not boolean")
        return
    if "enum" in schema:
        if not isinstance(obj, (str, int, bool)) or obj not in schema["enum"]:
            errs.append(f"{path}: '{obj}' not in enum")


# ----------------------------------------------------------------- cross-record invariants
def _measurable(r):
    return (r.get("disposition") in ("measured_validated", "data_acquired_calculation_pending")
            or r.get("evaluation_state") in ("measured_unscored", "measured_graded", "measured_abstained"))


def cross_metric(r, ctx, e):
    disp, es, bc = r.get("disposition"), r.get("evaluation_state"), r.get("boundary_class")
    mid, ck = r.get("metric_id"), r.get("calculation_kind")
    # membership-safety: only string values participate in vocab-map lookups (type errors are
    # already reported by the generic schema engine; cross-checks must never raise on bad types)
    if not isinstance(disp, str):
        disp = None
    if not isinstance(es, str):
        es = None
    if not isinstance(bc, str):
        bc = None
    if not isinstance(ck, str):
        ck = None
    if isinstance(mid, str) and SW.match(mid):
        n = int(mid.split("-")[1])
        if n not in CATALOG:
            e.append("metric_id not in frozen 295")
        elif r.get("module") != OWNER.get(n, [None])[0]:
            e.append("module != frozen owner")
    if disp in DISP_EVAL and es not in DISP_EVAL[disp]:
        e.append(f"evaluation_state '{es}' inconsistent with disposition '{disp}'")
    if disp in DISP_SES and r.get("source_existence_state") not in DISP_SES[disp]:
        e.append("source_existence_state inconsistent with disposition")
    if isinstance(mid, str) and mid in OVERLAY:
        if not (bc == "separate_serra_service" and disp == "outside_sales_domain"
                and r.get("source_existence_state") == "proved_outside_sales_domain"
                and r.get("gradable") is False and es == "not_measured"
                and r.get("customer_visibility") == "appendix_id_label_only"):
            e.append("Service overlay id must be separate_serra_service/outside_sales_domain/proved_outside_sales_domain/gradable=false/not_measured/appendix_id_label_only")
    if bc and bc != "sales":
        if r.get("gradable") is True or r.get("customer_visibility") == "full" or es not in ("not_measured", "measured_unscored"):
            e.append("non-sales boundary must be disposition-only, non-gradable, not customer-full")
    if disp == "source_investigation_pending":
        if es != "not_measured":
            e.append("SIP evaluation_state must be not_measured")
        if r.get("gradable") is not False:
            e.append("SIP gradable must be false")
        if r.get("customer_visibility") != "hidden":
            e.append("SIP customer_visibility must be hidden (no customer projection)")
        for f in ("owner", "next_action", "review_point", "evidence_as_of", "finite_investigation_ref"):
            if not r.get(f):
                e.append(f"SIP missing {f}")
        if r.get("source_existence_state") not in ("unproved", "investigation_pending"):
            e.append("SIP source_existence must be unproved/investigation_pending")
    if disp == "genuinely_not_available" and not r.get("affirmative_investigation_evidence_ref"):
        e.append("genuinely_not_available requires affirmative_investigation_evidence_ref")
    if ck in CALC_REQ:
        for f in CALC_REQ[ck]:
            if f in SRC_DEP_FIELDS and not _measurable(r):
                continue
            if not r.get(f):
                e.append(f"calc_kind {ck} requires {f}")
    if ck == "semantic" and (r.get("sensitivity_class") != SEM_REQ["sensitivity_class"] or r.get("protected_content") is not SEM_REQ["protected_content"]):
        e.append("semantic calc_kind requires sensitivity_class=protected_content + protected_content=true")
    if _measurable(r) and not r.get("source_dependency_ids"):
        e.append("measurable metric requires nonempty source_dependency_ids")
    sdi = r.get("source_dependency_ids")
    for s in sdi if isinstance(sdi, list) else []:
        if ctx is not None and isinstance(s, str) and s not in ctx.get("source_ids", set()):
            e.append(f"source_dependency '{s}' not a registered source id")
    def _d(x):
        return x if isinstance(x, dict) else {}
    if es == "measured_graded":
        gt = _d(r.get("grade_target_contract"))
        if r.get("gradable") is not True or disp != "measured_validated":
            e.append("measured_graded requires gradable + measured_validated")
        if gt.get("approval_state") != "approved" or gt.get("status") != "active" or gt.get("compatibility_result") != "compatible":
            e.append("measured_graded requires approved+active+compatible grade_target")
    if r.get("gradable") is False and es == "measured_graded":
        e.append("gradable=false cannot be measured_graded")
    # protected-content envelope: measured_abstained iff fully authorized envelope
    env_ok = (r.get("protected_content") is True and r.get("sensitivity_class") == "protected_content"
              and bool(r.get("protected_content_envelope_ref")) and r.get("envelope_authorization") == "approved")
    if es == "measured_abstained" and not env_ok:
        e.append("measured_abstained requires protected_content=true, sensitivity_class=protected_content, an envelope reference, and envelope_authorization=approved")
    if r.get("protected_content") is True and not env_ok and es not in ("not_measured", "measured_unscored"):
        e.append("protected content without an approved envelope can only be not_measured/measured_unscored")
    ids = [_d(r.get("detection_threshold_contract")).get("threshold_id"),
           _d(r.get("comparison_reference_contract")).get("reference_id"),
           _d(r.get("grade_target_contract")).get("grade_target_id")]
    ids = [i for i in ids if isinstance(i, str)]
    if len(set(ids)) != len(ids):
        e.append("sub-contract ids (threshold/reference/grade_target) must be distinct")


def validate_metric_row(r, ctx=None):
    e = []
    validate_instance(r, {"$ref": "metric_row"}, "metric", e)
    if isinstance(r, dict):
        cross_metric(r, ctx, e)
    return e


def cross_source_node(n, ctx, e):
    dmi = n.get("dependent_metric_ids")
    for m in dmi if isinstance(dmi, list) else []:
        if isinstance(m, str) and SW.match(m) and int(m.split("-")[1]) not in CATALOG:
            e.append(f"dependent_metric_id {m} not in frozen 295")
    dci = n.get("dependent_candidate_ids")
    for c in dci if isinstance(dci, list) else []:
        if ctx is not None and isinstance(c, str) and c not in ctx.get("candidate_ids", set()):
            e.append(f"dependent_candidate_id {c} not a registered candidate")
    se, aq = n.get("source_existence_state"), n.get("acquisition_admission_state")
    if isinstance(se, str) and isinstance(aq, str) and se in SES_ACQ and aq not in SES_ACQ[se]:
        e.append(f"source_existence/admission pair ({se},{aq}) not allowed")


def validate_source_dag(nodes, ctx=None):
    e = []
    if not isinstance(nodes, list):
        return ["source dag input is not a list"]
    seen = set()
    for n in nodes:
        validate_instance(n, {"$ref": "source_node"}, "source", e)
        if not isinstance(n, dict):
            e.append("source node is not an object")
            continue
        cross_source_node(n, ctx, e)
        # hashable dedupe key even if a component is a bad (non-scalar) type (schema flags the type)
        key = tuple(x if isinstance(x, (str, int, float, bool, type(None))) else repr(x)
                    for x in (n.get("profile"), n.get("family"), n.get("period"), n.get("schema_revision")))
        if key in seen:
            e.append(f"duplicate acquisition dedupe key {key}")
        seen.add(key)
    return e


def validate_candidate(c):
    e = []
    validate_instance(c, {"$ref": "candidate"}, "candidate", e)
    if not isinstance(c, dict):
        return e
    if c.get("relationship_to_295") == "refines_existing" and not c.get("related_sw_id"):
        e.append("refines_existing requires related_sw_id")
    rsw = c.get("related_sw_id")
    if isinstance(rsw, str) and SW.match(rsw) and int(rsw.split("-")[1]) not in CATALOG:
        e.append("related_sw_id not in frozen 295")
    return e


def validate_packet(p, ctx=None):
    e = []
    validate_instance(p, {"$ref": "packet"}, "packet", e)
    if not isinstance(p, dict):
        return e
    tids = p.get("target_ids")
    tids = tids if isinstance(tids, list) else []
    for t in tids:
        if isinstance(t, str) and SW.match(t) and OWNER.get(int(t.split("-")[1]), [None])[0] != p.get("module"):
            e.append(f"{t} not owned by module {p.get('module')}")
    if not (5 <= len(tids) <= 12) and not p.get("size_reason"):
        e.append("target_ids out of 5..12 without size_reason")
    part = p.get("partitions_target")
    part = part if isinstance(part, dict) else {}

    def _idset(v):
        return {x for x in v if isinstance(x, str)} if isinstance(v, list) else set()
    a, b, c = _idset(part.get("accepted_measured_ids")), _idset(part.get("accepted_disposition_only_ids")), _idset(part.get("rejected_ids"))
    if (a & b) or (a & c) or (b & c):
        e.append("partitions not mutually exclusive")
    if (a | b | c) != {t for t in tids if isinstance(t, str)}:
        e.append("partitions union != target_ids")
    sc = p.get("stop_conditions")
    sc = sc if isinstance(sc, dict) else {}
    if sc.get("inherited_canonical") != CANON_STOPS:
        e.append("stop_conditions.inherited_canonical must equal canonical_stop_names exactly")
    adm = p.get("admission_contract")
    adm = adm if isinstance(adm, dict) else {}
    gates = adm.get("inherited_admission_gates")
    gates = gates if isinstance(gates, list) else []
    if "vault_policy_nonconformance_admission_gate" not in gates:
        e.append("admission_contract must inherit vault_policy_nonconformance_admission_gate")
    sdeps = p.get("source_dependencies")
    for s in sdeps if isinstance(sdeps, list) else []:
        if ctx is not None and isinstance(s, str) and s not in ctx.get("source_ids", set()):
            e.append(f"packet source_dependency '{s}' not registered")
    return e


def validate_blast_radius(br):
    """Compare against the Phase-0-DERIVED blast semantics (not a literal, not the contract expected)."""
    if not BLAST_SEM:
        return ["blast semantics not derived from Phase 0 authority"]
    if not isinstance(br, dict):
        return ["blast_radius not an object"]
    e = []
    for k, v in BLAST_SEM.items():
        if br.get(k) != v:
            e.append(f"blast_radius {k} != {v!r} (Phase 0-derived)")
    return e


def validate_vault_gate(vg):
    """Compare against the Phase-0-DERIVED vault semantics (not a literal, not the contract expected)."""
    if not VAULT_SEM:
        return ["vault semantics not derived from Phase 0 authority"]
    if not isinstance(vg, dict):
        return ["vault gate not an object"]
    e = []
    if vg.get("fail_closed") is not VAULT_SEM.get("fail_closed"):
        e.append("vault gate fail_closed must be true")
    if vg.get("required_dir_mode") != VAULT_SEM["required_dir_mode"]:
        e.append("vault gate required_dir_mode must be 0700")
    if vg.get("required_file_mode") != VAULT_SEM["required_file_mode"]:
        e.append("vault gate required_file_mode must be 0600")
    if vg.get("current_conformance") != VAULT_SEM["current_conformance"]:
        e.append("vault gate current_conformance must be nonconforming")
    if vg.get("gate_phase") != VAULT_SEM["gate_phase"]:
        e.append("vault gate gate_phase must be phase3_admission_gate")
    if VAULT_SEM["status_must_contain"] not in str(vg.get("status", "")):
        e.append("vault gate status must state NONCONFORMING")
    if not vg.get("rule"):
        e.append("vault gate rule required")
    return e


# ----------------------------------------------------------------- fixtures + registries
CTX = {"source_ids": {"SRC-cage_kpi-0001", "SRC-appointments-0001", "SRC-sales_comm_log-0001"}, "candidate_ids": {"CAND-0001"}}


def _sub(pfx, approved=True):
    ap = ("approved", "active") if approved else ("proposed", "draft")
    comp = "compatible" if approved else "unresolved"
    return {
        "detection_threshold_contract": {"threshold_id": f"TH-{pfx}", "version": "1.0.0", "rule": ">x", "provenance": "p", "effective_dates": "2026-09", "approval_state": ap[0], "status": ap[1]},
        "comparison_reference_contract": {"reference_id": f"CR-{pfx}", "version": "1.0.0", "basis": "dealer_history", "formula": "f", "provenance": "p", "publication_date": "2026-08", "valid_period": "2026", "compatibility_result": comp, "assumptions": "a", "confidence": "high", "approval_state": ap[0], "status": ap[1]},
        "grade_target_contract": {"grade_target_id": f"GT-{pfx}", "version": "1.0.0", "basis": "dealer_history", "value_or_range": "0.5", "provenance": "p", "effective_dates": "2026-09", "compatibility_result": comp, "approval_state": ("approved" if approved else "unresolved"), "status": ap[1]},
    }


def good_metric():
    r = {"metric_id": "SW-011", "definition_version": "1.0.0", "module": OWNER[11][0],
         "business_question": "Are leads reached quickly?", "boundary_class": "sales",
         "population": "internet sales leads", "calculation_kind": "rate", "null_missing_behavior": "missing_not_zero",
         "zero_denominator_behavior": "undefined_withheld", "numerator": "touched_le_15m", "denominator": "eligible",
         "formula": "num/den", "direct_source_fields": ["first_touch_ts", "lead_created_ts"], "unit": "pct",
         "polarity": "higher_is_better", "window": "prev_week", "timezone": "America/New_York", "cadence": "weekly",
         "impact_method": "operational_only", "impact_status": "not_estimated", "gradable": True,
         "sensitivity_class": "none", "protected_content": False, "authorization": "none_required",
         "disposition": "measured_validated", "source_existence_state": "acquired_local",
         "evaluation_state": "measured_graded", "source_dependency_ids": ["SRC-cage_kpi-0001"],
         "evidence_ref": "ev", "evidence_as_of": "2026-08-31T00:00:00Z", "owner": "claude_studio",
         "internal_visibility": True, "customer_visibility": "full", "confidence": "high",
         "explainability_ref": "expl", "evidence_index_ref": "idx"}
    r.update(_sub("011", approved=True))
    return r


def good_sip():
    r = {"metric_id": "SW-012", "definition_version": "1.0.0", "module": OWNER[12][0],
         "business_question": "Is after-hours coverage staffed?", "boundary_class": "sales",
         "population": "after-hours leads", "calculation_kind": "rate", "null_missing_behavior": "missing_not_zero",
         "unit": "pct", "polarity": "higher_is_better", "window": "prev_week", "timezone": "America/New_York",
         "cadence": "weekly", "impact_method": "operational_only", "impact_status": "not_applicable",
         "gradable": False, "sensitivity_class": "none", "protected_content": False, "authorization": "none_required",
         "disposition": "source_investigation_pending", "source_existence_state": "investigation_pending",
         "evaluation_state": "not_measured", "source_dependency_ids": [], "evidence_ref": "ev",
         "evidence_as_of": "2026-09-02T00:00:00Z", "owner": "codex", "next_action": "one finite pass",
         "review_point": "2026-09-16", "finite_investigation_ref": "INV-0012", "internal_visibility": True,
         "customer_visibility": "hidden", "confidence": "not_applicable", "explainability_ref": "expl",
         "evidence_index_ref": "idx"}
    r.update(_sub("012", approved=False))
    return r


def good_gna():
    r = good_sip()
    r.update({"metric_id": "SW-013", "module": OWNER[13][0], "disposition": "genuinely_not_available",
              "source_existence_state": "proved_not_available", "affirmative_investigation_evidence_ref": "INV-0013-neg"})
    r.update(_sub("013", approved=False))
    return r


def good_overlay():
    r = {"metric_id": "SW-079", "definition_version": "1.0.0", "module": OWNER[79][0],
         "business_question": "separately governed domain", "boundary_class": "separate_serra_service",
         "population": "n/a", "calculation_kind": "direct", "null_missing_behavior": "not_applicable",
         "unit": "id", "polarity": "neutral_control", "window": "prev_week", "timezone": "America/New_York",
         "cadence": "weekly", "impact_method": "none", "impact_status": "not_applicable", "gradable": False,
         "sensitivity_class": "none", "protected_content": False, "authorization": "none_required",
         "disposition": "outside_sales_domain", "source_existence_state": "proved_outside_sales_domain",
         "evaluation_state": "not_measured", "source_dependency_ids": [], "evidence_ref": "ev",
         "evidence_as_of": "2026-09-02T00:00:00Z", "owner": "codex", "internal_visibility": True,
         "customer_visibility": "appendix_id_label_only", "confidence": "not_applicable",
         "explainability_ref": "x", "evidence_index_ref": "x"}
    r.update(_sub("079", approved=False))
    return r


def good_abstained():
    r = {"metric_id": "SW-142", "definition_version": "1.0.0", "module": OWNER[142][0],
         "business_question": "Objection resolution quality", "boundary_class": "sales",
         "population": "objection threads", "calculation_kind": "semantic", "null_missing_behavior": "missing_not_zero",
         "unit": "pct", "polarity": "higher_is_better", "window": "prev_week", "timezone": "America/New_York",
         "cadence": "weekly", "impact_method": "operational_only", "impact_status": "not_applicable",
         "gradable": False, "sensitivity_class": "protected_content", "protected_content": True,
         "authorization": "compliance_required", "disposition": "data_acquired_calculation_pending",
         "source_existence_state": "acquired_local", "evaluation_state": "measured_abstained",
         "source_dependency_ids": ["SRC-sales_comm_log-0001"], "evidence_ref": "ev",
         "evidence_as_of": "2026-08-31T00:00:00Z", "owner": "claude_studio", "internal_visibility": True,
         "customer_visibility": "hidden", "confidence": "abstain", "explainability_ref": "x", "evidence_index_ref": "x",
         "direct_source_fields": ["thread_text_ref"], "protected_content_envelope_ref": "ENV-0001",
         "envelope_authorization": "approved"}
    r.update(_sub("142", approved=False))
    return r


def good_packet():
    return {"packet_id": "PKT-02-01", "module": 2, "target_ids": ["SW-011", "SW-012", "SW-013", "SW-014", "SW-015"],
            "management_question": "Is speed-to-lead healthy?", "prerequisites": ["PKT-00-00"],
            "source_dependencies": ["SRC-cage_kpi-0001"],
            "admission_contract": {"family": "cage_kpi", "dedupe_key": "serra-honda|cage_kpi|2026-08-24..2026-08-30|v1", "sales_only_receipt": "R", "expected_admission_state": "admitted_held", "inherited_admission_gates": ["vault_policy_nonconformance_admission_gate"]},
            "transform_contract": {"normalized_spec": "s", "row_key_set_hash_method": "m", "join_keys": ["k"], "reconciliation": "r"},
            "persist_contract": {"target_tables": ["watchdog_metric_observation"], "append_only": True, "idempotent_key": "k"},
            "test_contract": {"positive_golden": "g", "negative_tests": ["neg"], "missing_is_not_zero_test": "t"},
            "report_fragment_contract": {"subsection_outputs": ["metric_table"], "customer_language_scope": "s", "internal_companion_scope": "i"},
            "stop_conditions": {"inherited_canonical": list(CANON_STOPS), "packet_specific": ["bdc_roster_absent"]},
            "two_delta_proof": {"evidence_delta": "raw->norm", "meaning_delta": "norm->metric"},
            "partitions_target": {"accepted_measured_ids": ["SW-011", "SW-012"], "accepted_disposition_only_ids": ["SW-013", "SW-014"], "rejected_ids": ["SW-015"]}}


def good_source():
    return {"source_id": "SRC-appointments-0001", "profile": "serra-honda", "family": "appointments",
            "period": "2026-08-24..2026-08-30", "schema_revision": "v1", "source_type": "native_xlsx",
            "source_existence_state": "acquired_local", "acquisition_admission_state": "admitted_held",
            "provenance_ref": "gmail:msgid", "sales_only_receipt": "R", "dependent_metric_ids": ["SW-031", "SW-032"],
            "dependent_candidate_ids": []}


def good_candidate():
    return {"candidate_id": "CAND-0001", "proposed_name": "Website VDP views by model", "description": "d",
            "observed_source": "Website Vehicle Views", "rationale": "r", "boundary_class": "sales",
            "relationship_to_295": "net_new", "candidate_state": "candidate_review_pending",
            "authorization_required": True, "owner": "codex", "evidence_ref": "ev"}


# ----------------------------------------------------------------- recursive mutation generator
def leaf_bad_values(spec, path):
    spec = resolve(spec)
    out = []
    t = spec.get("type")
    if "$vocab" in spec or "const" in spec or (t == "string" and "enum" in spec):
        out.append((f"{path}.badenum", "__BAD__"))
    if t == "string":
        out.append((f"{path}.badtype", 12345))
        if spec.get("pattern"):
            out.append((f"{path}.badpattern", "bad value!"))
        if spec.get("format") == "semver":
            out.append((f"{path}.badsemver", "1.0"))
        if spec.get("format") == "iso_datetime":
            out.append((f"{path}.badiso", "2026-13-40"))
    elif t == "integer":
        out.append((f"{path}.badtype", "NaN"))
    elif t == "boolean":
        out.append((f"{path}.badtype", "yes"))
    elif t == "array":
        out.append((f"{path}.badtype", "notarray"))
    return out


def gen_mutations(valid, schema, path):
    schema = resolve(schema)
    muts = []
    if schema.get("type") == "object" and isinstance(valid, dict):
        for r in schema.get("required", []):
            if r in valid:
                m = copy.deepcopy(valid); del m[r]
                muts.append((f"{path}.drop.{r}", m))
        for f, spec in schema.get("properties", {}).items():
            if f not in valid:
                continue
            rspec = resolve(spec)
            if rspec.get("type") == "object":
                for lbl, submut in gen_mutations(valid[f], spec, f"{path}.{f}"):
                    m = copy.deepcopy(valid); m[f] = submut
                    muts.append((lbl, m))
            else:
                for lbl, bad in leaf_bad_values(spec, f"{path}.{f}"):
                    m = copy.deepcopy(valid); m[f] = bad
                    muts.append((lbl, m))
    return muts


# ----------------------------------------------------------------- transitions
def _trans(vocab_name, frm, to, ctx=None):
    node = FV[vocab_name]
    if to not in node["transitions"].get(frm, []):
        return False
    if vocab_name == "disposition":
        for r in DISP.get("context_receipts", {}).get(f"{frm}->{to}", []):
            if not (ctx or {}).get(r):
                return False
    return True


# ----------------------------------------------------------------- self-tests
def run_self_tests():
    results = []

    def rec(name, expect_accept, errs):
        acc = (len(errs) == 0)
        results.append({"test": name, "expected": "accept" if expect_accept else "reject",
                        "got": "accept" if acc else "reject", "pass": acc == expect_accept,
                        "sample_error": errs[0] if errs else None})

    RECORDS = [
        ("metric", "metric_row", good_metric(), lambda o: validate_metric_row(o, CTX)),
        ("metric_sip", "metric_row", good_sip(), lambda o: validate_metric_row(o, CTX)),
        ("metric_gna", "metric_row", good_gna(), lambda o: validate_metric_row(o, CTX)),
        ("metric_overlay", "metric_row", good_overlay(), lambda o: validate_metric_row(o, CTX)),
        ("metric_abstained", "metric_row", good_abstained(), lambda o: validate_metric_row(o, CTX)),
        ("packet", "packet", good_packet(), lambda o: validate_packet(o, CTX)),
        ("source", "source_node", good_source(), lambda o: validate_source_dag([o], CTX)),
        ("candidate", "candidate", good_candidate(), validate_candidate),
    ]
    # canonical valids accept, then EVERY recursive mutation rejects
    for name, defname, valid, fn in RECORDS:
        rec(f"{name}.valid", True, fn(valid))
        for lbl, mut in gen_mutations(valid, {"$ref": defname}, name):
            rec(f"mut.{lbl}", False, fn(mut))

    # cross-record specific rejects not covered by simple leaf mutation
    rec("cross.gna_measured_unscored", False, validate_metric_row(dict(good_gna(), evaluation_state="measured_unscored"), CTX))
    rec("cross.sip_measured_unscored", False, validate_metric_row(dict(good_sip(), evaluation_state="measured_unscored"), CTX))
    rec("cross.overlay_wrong_disposition", False, validate_metric_row(dict(good_overlay(), disposition="measured_validated"), CTX))
    rec("cross.nongradable_graded", False, validate_metric_row(dict(good_metric(), gradable=False), CTX))
    rec("cross.graded_incompatible_target", False, validate_metric_row(dict(good_metric(), grade_target_contract=dict(good_metric()["grade_target_contract"], compatibility_result="incompatible")), CTX))
    rec("cross.unregistered_source_dep", False, validate_metric_row(dict(good_metric(), source_dependency_ids=["SRC-x-9999"]), CTX))
    rec("cross.subcontract_ids_not_distinct", False, validate_metric_row(dict(good_metric(), comparison_reference_contract=dict(good_metric()["comparison_reference_contract"], reference_id="TH-011")), CTX))
    rec("cross.wrong_module_owner", False, validate_metric_row(dict(good_metric(), module=3), CTX))
    rec("cross.source_bad_pair", False, validate_source_dag([dict(good_source(), source_existence_state="unproved", acquisition_admission_state="admitted_promoted")], CTX))
    rec("cross.source_dep_sw_out_of_range", False, validate_source_dag([dict(good_source(), dependent_metric_ids=["SW-999"])], CTX))
    rec("cross.source_dedupe_dup", False, validate_source_dag([good_source(), good_source()], CTX))
    rec("cross.candidate_refines_no_related", False, validate_candidate(dict(good_candidate(), relationship_to_295="refines_existing")))
    rec("cross.candidate_related_out_of_range", False, validate_candidate(dict(good_candidate(), relationship_to_295="refines_existing", related_sw_id="SW-999")))
    rec("cross.packet_inherited_not_exact", False, validate_packet(dict(good_packet(), stop_conditions={"inherited_canonical": CANON_STOPS[:-1] + ["x"], "packet_specific": ["y"]}), CTX))
    rec("cross.packet_missing_vault_gate", False, validate_packet(dict(good_packet(), admission_contract=dict(good_packet()["admission_contract"], inherited_admission_gates=["other"])), CTX))
    rec("cross.packet_partition_overlap", False, validate_packet(dict(good_packet(), partitions_target={"accepted_measured_ids": ["SW-011", "SW-012"], "accepted_disposition_only_ids": ["SW-012", "SW-014"], "rejected_ids": ["SW-015"]}), CTX))
    rec("cross.packet_wrong_module_owner", False, validate_packet(dict(good_packet(), module=3), CTX))
    # abstained / envelope
    rec("cross.abstained_valid", True, validate_metric_row(good_abstained(), CTX))
    rec("cross.abstained_protected_false", False, validate_metric_row(dict(good_abstained(), protected_content=False, sensitivity_class="none", calculation_kind="count", formula="c", direct_source_fields=["x"]), CTX))
    rec("cross.abstained_no_envelope_ref", False, validate_metric_row({k: v for k, v in good_abstained().items() if k != "protected_content_envelope_ref"}, CTX))
    rec("cross.abstained_not_approved", False, validate_metric_row(dict(good_abstained(), envelope_authorization="requested"), CTX))
    # ISO real parsing
    rec("cross.iso_impossible_datetime", False, validate_metric_row(dict(good_metric(), evidence_as_of="2026-13-40T25:61:61Z"), CTX))
    rec("cross.iso_naive_no_tz", False, validate_metric_row(dict(good_metric(), evidence_as_of="2026-09-02T00:00:00"), CTX))
    rec("cross.iso_valid_offset", True, validate_metric_row(dict(good_metric(), evidence_as_of="2026-09-02T00:00:00+00:00"), CTX))
    # anti-tautology: canonical stops / blast / vault anchored to validator constants
    rec("anchor.canon_rename_rejected", False, validate_canon_list([f"stop_{i}" for i in range(11)]))
    rec("anchor.canon_ok", True, validate_canon_list(list(CANON_STOPS)))
    rec("anchor.blast_weakened_rejected", False, validate_blast_radius({"one_source_failure_scope": "all", "blocks_unrelated_modules": True, "blocks_independent_metrics": True, "rejected_id_blocks_final_completion_only": False}))
    rec("anchor.vault_weakened_rejected", False, validate_vault_gate({"fail_closed": False, "required_dir_mode": "0777", "required_file_mode": "0666", "current_conformance": "conforming", "gate_phase": "none", "status": "OK", "rule": "x"}))
    rec("anchor.packet_renamed_canonical_rejected", False, validate_packet(dict(good_packet(), stop_conditions={"inherited_canonical": [f"stop_{i}" for i in range(11)], "packet_specific": ["x"]}), CTX))
    # RELATIONAL anti-tautology: co-mutate the authority PAYLOAD in memory (as if code+contract were
    # weakened together) and confirm it fails against the UNCHANGED Phase 0 source text.
    _p0src = _load_phase0_src()
    _wv = copy.deepcopy(load(AUTH_PATH)); _wv["vault"]["value"]["required_dir_mode"] = "0777"; _wv["vault"]["relational_tokens"]["vault_topology_07"] = ["`0777`"]
    rec("anchor.relational_vault_comutation_rejected", False, _relational_derive(_wv, _p0src)[1])
    _wb = copy.deepcopy(load(AUTH_PATH)); _wb["blast"]["value"]["blocks_unrelated_modules"] = True
    rec("anchor.relational_blast_comutation_rejected", False, _relational_derive(_wb, _p0src)[1])
    _wc = copy.deepcopy(load(AUTH_PATH)); _wc["canonical_stops"][0]["spec_phrase"] = "weakened phrase absent from spec"
    rec("anchor.relational_canon_comutation_rejected", False, _relational_derive(_wc, _p0src)[1])
    rec("anchor.relational_authority_ok", True, _relational_derive(load(AUTH_PATH), _p0src)[1])

    # transitions + context receipts
    rec("trans.sip_to_crm", True, [] if _trans("disposition", "source_investigation_pending", "crm_available_acquisition_pending") else ["x"])
    rec("trans.sip_to_measured_forbidden", False, [] if _trans("disposition", "source_investigation_pending", "measured_validated") else ["x"])
    rec("trans.sip_to_data_acquired_forbidden", False, [] if _trans("disposition", "source_investigation_pending", "data_acquired_calculation_pending") else ["x"])
    rec("trans.sip_to_outside_needs_receipt", False, [] if _trans("disposition", "source_investigation_pending", "outside_sales_domain") else ["x"])
    rec("trans.sip_to_outside_with_receipt", True, [] if _trans("disposition", "source_investigation_pending", "outside_sales_domain", {"boundary_correction_ref": "x"}) else ["x"])
    rec("trans.sip_to_gna_needs_affirmative", False, [] if _trans("disposition", "source_investigation_pending", "genuinely_not_available") else ["x"])
    rec("trans.sip_to_gna_with_receipt", True, [] if _trans("disposition", "source_investigation_pending", "genuinely_not_available", {"affirmative_investigation_evidence_ref": "x"}) else ["x"])
    rec("trans.ses_unproved_to_acquired_forbidden", False, [] if _trans("source_existence_state", "unproved", "acquired_local") else ["x"])
    rec("trans.ses_unproved_to_investigation_ok", True, [] if _trans("source_existence_state", "unproved", "investigation_pending") else ["x"])
    rec("trans.mes_not_measured_to_graded_forbidden", False, [] if _trans("metric_evaluation_state", "not_measured", "measured_graded") else ["x"])
    rec("trans.mes_unscored_to_graded_ok", True, [] if _trans("metric_evaluation_state", "measured_unscored", "measured_graded") else ["x"])
    rec("trans.acq_quarantine_to_admitted_forbidden", False, [] if _trans("acquisition_admission_state", "quarantined", "admitted_held") else ["x"])
    rec("trans.acq_held_to_promoted_ok", True, [] if _trans("acquisition_admission_state", "admitted_held", "admitted_promoted") else ["x"])

    # blast-radius + vault-gate exactness
    rec("fcs.blast_radius_ok", True, validate_blast_radius(FCS["blast_radius_rule"]))
    rec("fcs.blast_radius_weakened", False, validate_blast_radius(dict(FCS["blast_radius_rule"], blocks_unrelated_modules=True)))
    rec("fcs.vault_gate_ok", True, validate_vault_gate(FCS["inherited_admission_gates"]["vault_policy_nonconformance_admission_gate"]))
    rec("fcs.vault_gate_empty", False, validate_vault_gate({}))
    rec("fcs.vault_gate_weakened", False, validate_vault_gate(dict(FCS["inherited_admission_gates"]["vault_policy_nonconformance_admission_gate"], fail_closed=False)))

    return results


# ----------------------------------------------------------------- 17 named reviewer probes
def run_probes():
    probes = []

    def rec(name, fn):
        # crash-resistant: a raised exception is a FAIL (must be a clean validation error, never a crash)
        try:
            errs = fn()
        except Exception as ex:  # noqa: BLE001
            probes.append({"probe": name, "expected": "reject_no_crash", "got": "CRASH",
                           "pass": False, "n_errors": 0, "sample_error": f"{type(ex).__name__}: {ex}"})
            return
        probes.append({"probe": name, "expected": "reject", "got": "reject" if errs else "accept",
                       "pass": bool(errs), "n_errors": len(errs), "sample_error": errs[0] if errs else None})

    M = lambda **kw: validate_metric_row(dict(good_metric(), **kw), CTX)  # noqa: E731
    # --- the 17 reviewer-reproduced false positives ---
    rec("01_metric_business_question_123", lambda: M(business_question=123))
    rec("02_metric_invalid_evidence_as_of", lambda: M(evidence_as_of="2026-13-40T25:61:61Z"))
    rec("03_metric_bad_definition_version", lambda: M(definition_version="1.0"))
    rec("04_metric_source_dep_ids_123_BAD", lambda: M(source_dependency_ids=[123, "BAD"]))
    rec("05_metric_threshold_rule_123", lambda: M(detection_threshold_contract=dict(good_metric()["detection_threshold_contract"], rule=123)))
    rec("06_sip_with_value_grade_narrative", lambda: validate_metric_row(dict(good_sip(), value=1, grade="A", narrative="n"), CTX))
    rec("07_gna_plus_measured_unscored", lambda: validate_metric_row(dict(good_gna(), evaluation_state="measured_unscored"), CTX))
    rec("08_sw079_wrong_disposition", lambda: validate_metric_row(dict(good_overlay(), disposition="measured_validated"), CTX))
    rec("09_packet_mgmt_123_prereq_string", lambda: validate_packet(dict(good_packet(), management_question=123, prerequisites="notarray"), CTX))
    rec("10_source_period_123_provenance_456", lambda: validate_source_dag([dict(good_source(), period=123, provenance_ref=456)], CTX))
    rec("11_source_dependent_sw_999", lambda: validate_source_dag([dict(good_source(), dependent_metric_ids=["SW-999"])], CTX))
    rec("12_source_unregistered_cand_9999", lambda: validate_source_dag([dict(good_source(), dependent_candidate_ids=["CAND-9999"])], CTX))
    rec("13_source_unproved_admitted_promoted", lambda: validate_source_dag([dict(good_source(), source_existence_state="unproved", acquisition_admission_state="admitted_promoted")], CTX))
    rec("14_candidate_name_123_auth_yes", lambda: validate_candidate(dict(good_candidate(), proposed_name=123, authorization_required="yes")))
    rec("15_candidate_related_sw_999", lambda: validate_candidate(dict(good_candidate(), relationship_to_295="refines_existing", related_sw_id="SW-999")))
    rec("16_weakened_blast_radius", lambda: validate_blast_radius(dict(FCS["blast_radius_rule"], blocks_independent_metrics=True)))
    rec("17_empty_vault_gate", lambda: validate_vault_gate({}))
    # --- fix 1: ISO real calendar parsing + tz-aware ---
    rec("18_iso_impossible_calendar", lambda: M(evidence_as_of="2026-13-40T25:61:61Z"))
    rec("19_iso_naive_no_timezone", lambda: M(evidence_as_of="2026-09-02T12:00:00"))
    # --- fix 2: measured_abstained without authorized envelope ---
    rec("20_abstained_protected_false", lambda: validate_metric_row(dict(good_abstained(), protected_content=False, sensitivity_class="none", calculation_kind="count", formula="c", direct_source_fields=["x"]), CTX))
    rec("21_abstained_no_envelope_ref", lambda: validate_metric_row({k: v for k, v in good_abstained().items() if k != "protected_content_envelope_ref"}, CTX))
    rec("22_abstained_authorization_not_approved", lambda: validate_metric_row(dict(good_abstained(), envelope_authorization="requested"), CTX))
    # --- fix 3: crash-resistance ($vocab / nested must fail closed, never TypeError) ---
    rec("23_crash_boundary_class_list", lambda: M(boundary_class=[]))
    rec("24_crash_disposition_dict", lambda: M(disposition={}))
    rec("25_crash_calc_kind_int", lambda: M(calculation_kind=123))
    rec("26_crash_source_period_list_provenance_dict", lambda: validate_source_dag([dict(good_source(), period=[], provenance_ref={})], CTX))
    rec("27_crash_packet_nested_nonobjects", lambda: validate_packet(dict(good_packet(), partitions_target="x", stop_conditions=5, admission_contract=[]), CTX))
    # --- fix 4 + shadow finding: anti-tautology anchors (co-mutation must still reject) ---
    rec("28_blast_actual_and_expected_coweakened", lambda: validate_blast_radius({"one_source_failure_scope": "all", "blocks_unrelated_modules": True, "blocks_independent_metrics": True, "rejected_id_blocks_final_completion_only": False}))
    rec("29_vault_actual_and_expected_coweakened", lambda: validate_vault_gate({"fail_closed": False, "required_dir_mode": "0777", "required_file_mode": "0666", "current_conformance": "conforming", "gate_phase": "none", "status": "ok", "rule": "x"}))
    rec("30_canonical_wholesale_rename", lambda: validate_canon_list([f"renamed_stop_{i}" for i in range(11)]))
    rec("31_packet_canonical_renamed", lambda: validate_packet(dict(good_packet(), stop_conditions={"inherited_canonical": [f"renamed_stop_{i}" for i in range(11)], "packet_specific": ["x"]}), CTX))
    # --- independent FRESH malformed cases (not the reviewer list) ---
    rec("F1_metric_unknown_property", lambda: M(foo=1))
    rec("F2_metric_module_out_of_range", lambda: M(module=99))
    rec("F3_metric_semver_two_part", lambda: M(definition_version="2.5"))
    rec("F4_source_bad_profile_const", lambda: validate_source_dag([dict(good_source(), profile="serra-nissan")], CTX))
    rec("F5_candidate_boundary_list", lambda: validate_candidate(dict(good_candidate(), boundary_class=["sales"])))
    # --- reviewer #4 exact crash cases: JSON-valid malformed roots / unhashable nested collections ---
    rec("32_root_metric_list", lambda: validate_metric_row([], CTX))
    rec("33_root_packet_none", lambda: validate_packet(None, CTX))
    rec("34_root_candidate_list", lambda: validate_candidate([]))
    rec("35_root_sourcedag_list_of_list", lambda: validate_source_dag([[]], CTX))
    rec("36_packet_source_deps_dict_item", lambda: validate_packet(dict(good_packet(), source_dependencies=[{}]), CTX))
    rec("37_packet_partition_dict_item", lambda: validate_packet(dict(good_packet(), partitions_target={"accepted_measured_ids": [{}], "accepted_disposition_only_ids": [], "rejected_ids": []}), CTX))
    # --- reviewer #4 relational co-mutation adversarial (code+contract weakened, Phase 0 unchanged) ---
    _src = _load_phase0_src()
    def _mut(mutator):
        payload = copy.deepcopy(load(AUTH_PATH)); mutator(payload); return _relational_derive(payload, _src)[1]
    rec("38_relational_vault_comutation", lambda: _mut(lambda a: (a["vault"]["value"].update({"required_dir_mode": "0777"}), a["vault"]["relational_tokens"].update({"vault_topology_07": ["`0777`"]}))))
    rec("39_relational_blast_comutation", lambda: _mut(lambda a: a["blast"]["value"].update({"blocks_unrelated_modules": True})))
    rec("40_relational_canon_comutation", lambda: _mut(lambda a: a["canonical_stops"][0].update({"spec_phrase": "absent from spec"})))
    return probes


def _paths(obj, prefix=()):
    """Yield the path tuple of EVERY reachable dict key and list index, at any depth."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield prefix + (k,)
            yield from _paths(v, prefix + (k,))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield prefix + (i,)
            yield from _paths(v, prefix + (i,))


def _getpath(obj, path):
    cur = obj
    for p in path:
        cur = cur[p]
    return cur


def _setpath(obj, path, val):
    o = copy.deepcopy(obj)
    cur = o
    for p in path[:-1]:
        cur = cur[p]
    cur[path[-1]] = val
    return o


def run_fuzz():
    """RECURSIVE crash fuzz over a finite, stated universe: every reachable nested dict-key / list-
    index path of each valid fixture is set to each hostile JSON value, plus hostile items are
    appended into every list (incl. empty identifier arrays) to exercise unhashable-in-array paths.
    This metric counts ONLY uncaught exceptions; semantic rejections are expected and NOT counted."""
    HOSTILE = [None, [], {}, [{}], [None], 0, True, "x", [[]], [{"a": 1}], [123], [{"k": "v"}]]
    APPEND = [{}, [], None, [{}], 123, {"a": 1}]
    fixtures = [
        ("metric", good_metric(), lambda o: validate_metric_row(o, CTX)),
        ("packet", good_packet(), lambda o: validate_packet(o, CTX)),
        ("source", good_source(), lambda o: validate_source_dag([o], CTX)),
        ("candidate", good_candidate(), validate_candidate),
    ]
    universe = 0
    exceptions = []

    def run(label, fn, obj):
        nonlocal universe
        universe += 1
        try:
            fn(obj)
        except Exception as ex:  # noqa: BLE001
            exceptions.append(f"{label}: {type(ex).__name__}: {ex}")

    # 1) hostile at the record ROOT
    for name, _valid, fn in fixtures:
        for h in HOSTILE:
            run(f"{name}:root={h!r}", fn, h)
    # 2) hostile at EVERY reachable nested path (recursive)
    for name, valid, fn in fixtures:
        allpaths = list(_paths(valid))
        for path in allpaths:
            for h in HOSTILE:
                run(f"{name}:path={path}:set={h!r}", fn, _setpath(valid, path, h))
        # 3) append hostile (incl. unhashable) items into EVERY list, incl. empty identifier arrays
        for path in allpaths:
            node = _getpath(valid, path)
            if isinstance(node, list):
                for h in APPEND:
                    run(f"{name}:path={path}:append={h!r}", fn, _setpath(valid, path, node + [h]))
    # 4) hostile as the source-dag container itself
    for h in HOSTILE:
        run(f"source_dag:container={h!r}", lambda o: validate_source_dag(o, CTX), h)
    return {"tested_universe": universe, "exceptions": len(exceptions), "exception_samples": exceptions[:15],
            "universe_description": "roots + EVERY reachable nested dict-key/list-index path of each valid fixture (recursive), each set to 12 hostile JSON values (None,[],{},[{}],[None],0,true,'x',[[]],[{a:1}],[123],[{k:v}]); plus 6 hostile-item appends into every list incl. empty identifier arrays; plus source-dag container over 12 hostiles. Counts ONLY uncaught exceptions; semantic rejections are expected and reported separately (per-record errors), not here."}


# ----------------------------------------------------------------- structure / vocab
def check_structure(errors):
    matrix = load(MATRIX)
    nums = sorted(int(e.get("metric_id").split("-")[1]) for e in matrix)
    if not (len(matrix) == 295 and nums == list(range(1, 296))):
        errors.append("STRUCTURE: catalog not 295 contiguous")
    if len(p0.MODULES) != 11 or sorted(OWNER) != list(range(1, 296)) or any(len(v) != 1 for v in OWNER.values()):
        errors.append("STRUCTURE: 11-module map not exactly-once over 295")
    if sorted(OVERLAY) != sorted(p0.sw(i) for i in p0.SERVICE_OVERLAY) or len(OVERLAY) != 18:
        errors.append("STRUCTURE: overlay != SPEC 18")


def check_vocab(errors):
    if len(DISP["values"]) != 8 or DISP.get("count") != 8:
        errors.append("VOCAB: disposition must have 8 values")
    sip = set(DISP["transitions"].get("source_investigation_pending", []))
    if sip != set(DISP["invariants"]["source_investigation_pending_allowed_targets_exact"]) or \
       sip & set(DISP["invariants"]["source_investigation_pending_forbidden_direct_targets"]):
        errors.append("VOCAB: SIP allowed/forbidden targets wrong")
    for name in ("boundary_class", "disposition", "source_existence_state", "metric_evaluation_state",
                 "acquisition_admission_state", "report_acceptance_state", "calculation_kind"):
        if not FV[name].get("closed") or not FV[name].get("values"):
            errors.append(f"VOCAB: {name} not closed/nonempty")
    for name in ("source_existence_state", "metric_evaluation_state", "acquisition_admission_state", "disposition"):
        node = FV[name]
        for frm, tos in node["transitions"].items():
            if frm not in node["values"] or any(t not in node["values"] for t in tos):
                errors.append(f"VOCAB: {name} transition references unknown state")
    if FV["acquisition_admission_state"]["transitions"].get("quarantined") != [] or \
       FV["acquisition_admission_state"]["transitions"].get("admitted_held") != ["admitted_promoted"]:
        errors.append("VOCAB: acquisition quarantine/promotion invariants broken")
    # disposition<->evaluation consistency map covers all 8 dispositions
    if set(DISP_EVAL.keys()) != set(DISP["values"].keys()):
        errors.append("VOCAB: disposition_evaluation_consistency must cover all 8 dispositions")
    # fail-closed-stops exactness
    for de in DERIVE_ERRORS:
        errors.append(f"VOCAB: authority-derive: {de}")
    if not DERIVED:
        errors.append("VOCAB: Phase 0 authority could not be derived (anchor broken)")
    else:
        if FCS.get("count") != 11 or len(CANON_STOPS) != 11:
            errors.append("VOCAB: fail-closed-stops count != 11")
        if validate_canon_list(FCS.get("canonical_stop_names")):
            errors.append("VOCAB: canonical_stop_names (contract) != Phase 0-derived authority")
        if sorted((FCS.get("canonical_stops") or {}).keys()) != sorted(CANON_STOPS):
            errors.append("VOCAB: canonical_stops keys != Phase 0-derived authority (rename attempt)")
        if validate_blast_radius(FCS.get("blast_radius_rule", {})):
            errors.append("VOCAB: blast_radius_rule actual != Phase 0-derived")
        if FCS.get("blast_radius_expected") != BLAST_SEM:
            errors.append("VOCAB: blast_radius_expected (embedded) != Phase 0-derived (co-weakening attempt)")
        vg = FCS.get("inherited_admission_gates", {}).get("vault_policy_nonconformance_admission_gate", {})
        if validate_vault_gate(vg):
            errors.append("VOCAB: vault admission gate actual != Phase 0-derived")
        vge = FCS.get("vault_gate_expected", {})
        if any(vge.get(k) != VAULT_SEM[k] for k in ("required_dir_mode", "required_file_mode", "current_conformance", "gate_phase", "status_must_contain")) or vge.get("fail_closed") is not True:
            errors.append("VOCAB: vault_gate_expected (embedded) != Phase 0-derived (co-weakening attempt)")


# ----------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--no-write", action="store_true")
    args = ap.parse_args()

    errors = []
    contract_files = ["frozen-vocabularies.json", "record-schemas.json", "metric-row-schema.json",
                      "packet-schema.json", "source-registry-dag-schema.json",
                      "beyond-295-candidate-intake-schema.json", "fail-closed-stops.json",
                      "phase0-derived-authority.json"]
    contract_hashes = {}
    for cf in contract_files:
        p = os.path.join(CONTRACT_DIR, cf)
        try:
            load(p); contract_hashes[cf] = sha256_file(p)
        except Exception as ex:  # noqa: BLE001
            errors.append(f"CONTRACT parse failure {cf}: {ex}")

    check_structure(errors)
    check_vocab(errors)
    self_tests = run_self_tests()
    probes = run_probes()
    fuzz = run_fuzz()
    failed_tests = [t for t in self_tests if not t["pass"]]
    failed_probes = [p for p in probes if not p["pass"]]
    overall = (not errors) and (not failed_tests) and (not failed_probes) and (fuzz["exceptions"] == 0)

    result = {
        "check": "honda_watchdog_phase1a_contracts",
        "phase": "Phase 1A — design-only GENERIC recursive schema-driven contract freeze + self-tests",
        "engine": "generic JSON-Schema-like recursive validator (record-schemas.json) + cross-record invariants; canon/blast/vault semantics RELATIONALLY derived from immutable Phase 0 authority (07/09/SPEC)",
        "contract_files": contract_hashes,
        "phase0_authority_derived": bool(DERIVED),
        "structure_295_11_18": "PASS" if not any(e.startswith("STRUCTURE") for e in errors) else "FAIL",
        "vocab_closure": "PASS" if not any(e.startswith("VOCAB") for e in errors) else "FAIL",
        "self_tests_total": len(self_tests),
        "self_tests_failed": len(failed_tests),
        "named_probes_total": len(probes),
        "named_probes_failed": len(failed_probes),
        "crash_fuzz": fuzz,
        "named_probes": probes,
        "self_tests": self_tests,
        "errors": errors,
        "overall_pass": overall,
        "note": "Design-only: no records authored. Mutations are generated RECURSIVELY from the schemas (drop each required field at any depth; inject a type/enum/pattern/format/const violation at each leaf); plus named reviewer probes; plus a crash-fuzz over a stated hostile universe (0 crashes required). canon/blast/vault are derived from immutable Phase 0 authority, not literals. Generic engine — not example patches.",
    }
    payload = json.dumps(result, indent=2, ensure_ascii=False)
    if not args.no_write:
        os.makedirs(os.path.dirname(args.out), exist_ok=True)
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(payload + "\n")
    print(payload)
    print(f"\nRESULT: {'PASS' if overall else 'FAIL'} "
          f"(self_tests {len(self_tests)-len(failed_tests)}/{len(self_tests)}, "
          f"probes {len(probes)-len(failed_probes)}/{len(probes)}, "
          f"fuzz {fuzz['tested_universe']-fuzz['exceptions']}/{fuzz['tested_universe']} no-exception)", file=sys.stderr)
    return 0 if overall else 1


if __name__ == "__main__":
    raise SystemExit(main())
