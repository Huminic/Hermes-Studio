#!/usr/bin/env python3
"""Gate 6 - Halo Sales Performance Report Card PDF generator (deterministic, parameterized).

Reads EXACTLY ONE accepted Gate 5B one-file model
(docs/halo/evidence/m1r/gate5b/gate5b-report-model-<dealer>.json) and renders one polished,
customer-facing Sales Performance Report Card PDF. It reads no other JSON (no Gate 5B bundles,
appendix, ledgers, Gate 5A, internal audit, or raw evidence).

Fail-closed: the model must be present, safe, and carry exactly 295 coverage (17 evaluated + 278
not-measured, exact SW-001..SW-295). The PDF layer invents no value, baseline, rank, dollar, causal
claim, or unavailable metric - it only renders what the accepted model already contains.

Determinism: reportlab invariant mode fixes producer/date/document-id so a rerun is byte-identical.

Usage:
  build_report_cards.py                      # build all three accepted dealer models
  build_report_cards.py --model X --out Y    # build one arbitrary accepted model
"""
import argparse
import hashlib as _hashlib
import json
import re
import sys
from pathlib import Path

# Python 3.8 compatibility shim: reportlab 4.x calls md5(usedforsecurity=False), a 3.9+ kwarg.
# Neutralize the kwarg BEFORE importing reportlab so deterministic (invariant) generation works.
_ORIG_MD5 = _hashlib.md5


def _md5_compat(*args, **kwargs):
    kwargs.pop("usedforsecurity", None)
    return _ORIG_MD5(*args, **kwargs)


_hashlib.md5 = _md5_compat

from reportlab import rl_config

rl_config.invariant = 1  # fixed CreationDate + document ID => byte-identical reruns

from reportlab.lib import colors  # noqa: E402
from reportlab.lib.enums import TA_CENTER, TA_LEFT  # noqa: E402
from reportlab.lib.pagesizes import LETTER  # noqa: E402
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet  # noqa: E402
from reportlab.lib.units import inch  # noqa: E402
from reportlab.platypus import (  # noqa: E402
    BaseDocTemplate,
    Frame,
    KeepTogether,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

REPO = Path(__file__).resolve().parents[2]
GATE5B = REPO / "docs/halo/evidence/m1r/gate5b"
OUT_DIR = REPO / "output/pdf"

DEALERS = {
    "21043": "serra-honda",
    "21044": "serra-nissan",
    "21047": "tony-serra-ford",
}
PERIOD = "2026-08-24..2026-08-30"
PERIOD_HUMAN = "August 24 - 30, 2026"

# Palette: navy / teal / restrained gold / white-off-white.
NAVY = colors.HexColor("#0B2545")
NAVY_MID = colors.HexColor("#13315C")
TEAL = colors.HexColor("#1B7A8C")
TEAL_LT = colors.HexColor("#E3F0F2")
GOLD = colors.HexColor("#B8892B")
OFFWHITE = colors.HexColor("#F7F7F4")
GREYTEXT = colors.HexColor("#3A3A3A")
LINE = colors.HexColor("#C9D2DB")
HEALTHY = colors.HexColor("#1B7A4B")
WATCH = colors.HexColor("#9A7B12")
BREACH = colors.HexColor("#A5321F")

# Fail-closed customer-safety guard (mirrors the Gate 5B reader; no person-name heuristic for titles).
FORBIDDEN = re.compile(
    r"\b(service|parts|VinSolutions|Dashboard|Custom Reporting|Desk Log|Deal Performance|DMS|"
    r"Sales Flat|Is Show|Is No Show|Actual Response Time|First Contact Attempt|Originated After Hours|"
    r"quarantin|blocker_class|frozen_e1|rep_token|nlp_content|withheld|spine-ledger|internal audit|"
    r"raw evidence)\b|docs/halo|\bsrc/|scripts/|\.json\b|\.ts\b|\b\d{3}-\d{2}-\d{4}\b|"
    r"@[a-z0-9.\-]+\.[a-z]{2,}|gate\s*5a",
    re.I,
)

_ASCII_MAP = {
    "—": "-", "–": "-", "−": "-", "‑": "-", "­": "-",
    "×": "x", "→": "->", "≥": ">=", "≤": "<=",
    "…": "...", "’": "'", "‘": "'", "“": '"', "”": '"',
    " ": " ", "·": "-", "•": "-",
}


def ascii_clean(s):
    """Fold the known Unicode punctuation to ASCII (ASCII hyphens only), then drop any stray."""
    if s is None:
        return ""
    out = str(s)
    for k, v in _ASCII_MAP.items():
        out = out.replace(k, v)
    return out.encode("ascii", "ignore").decode("ascii")


def fail(msg):
    print(f"Gate 6 FAIL: {msg}", file=sys.stderr)
    sys.exit(2)


EXPECTED_IDS = [f"SW-{i:03d}" for i in range(1, 296)]


def load_and_validate(model_path):
    p = Path(model_path)
    if not p.is_file():
        fail(f"model not found: {model_path}")
    model = json.loads(p.read_text())
    for k in (
        "dealer", "dealer_id", "accepted_week", "executive_narrative", "clusters",
        "cross_cluster_synthesis", "ranked_opportunities", "vehicle_opportunity_scenario",
        "notification_candidates", "coverage", "visibility_plan", "evaluated", "not_measured",
        "appendix",
    ):
        if k not in model:
            fail(f"model missing required section: {k}")
    cov = model["coverage"]
    if cov != {"evaluated": 17, "not_measured": 278, "total": 295}:
        fail(f"coverage not 17/278/295: {cov}")
    if len(model["evaluated"]) != 17 or len(model["not_measured"]) != 278:
        fail("evaluated/not_measured counts wrong")
    if len(model["appendix"]) != 295:
        fail("appendix != 295")
    ids = sorted(c["metric_id"] for c in model["appendix"])
    if ids != EXPECTED_IDS:
        fail("appendix is not exactly SW-001..SW-295")
    if model["accepted_week"] != PERIOD:
        fail(f"accepted_week {model['accepted_week']} != {PERIOD}")
    # Defense in depth: scan every string value in the model for forbidden customer language.
    _scan(model, "model")
    return model


def _scan(x, where):
    if isinstance(x, str):
        m = FORBIDDEN.search(x)
        if m:
            fail(f"forbidden customer language at {where}: '{m.group(0)}' in '{x[:80]}'")
    elif isinstance(x, list):
        for i, v in enumerate(x):
            _scan(v, f"{where}[{i}]")
    elif isinstance(x, dict):
        for k, v in x.items():
            _scan(v, f"{where}.{k}")


# ---------------------------------------------------------------------------
# Styles
# ---------------------------------------------------------------------------
def styles():
    ss = getSampleStyleSheet()
    S = {}
    S["cover_title"] = ParagraphStyle(
        "cover_title", parent=ss["Title"], fontName="Helvetica-Bold", fontSize=30,
        leading=34, textColor=colors.white, alignment=TA_LEFT, spaceAfter=6,
    )
    S["cover_sub"] = ParagraphStyle(
        "cover_sub", fontName="Helvetica", fontSize=14, leading=19,
        textColor=colors.white, alignment=TA_LEFT,
    )
    S["cover_promise"] = ParagraphStyle(
        "cover_promise", fontName="Helvetica", fontSize=11.5, leading=17,
        textColor=colors.white, alignment=TA_LEFT,
    )
    S["h1"] = ParagraphStyle(
        "h1", fontName="Helvetica-Bold", fontSize=17, leading=21, textColor=NAVY,
        spaceBefore=6, spaceAfter=8,
    )
    S["h2"] = ParagraphStyle(
        "h2", fontName="Helvetica-Bold", fontSize=12.5, leading=16, textColor=TEAL,
        spaceBefore=10, spaceAfter=4,
    )
    S["body"] = ParagraphStyle(
        "body", fontName="Helvetica", fontSize=10, leading=14.5, textColor=GREYTEXT,
        spaceAfter=6,
    )
    S["small"] = ParagraphStyle(
        "small", fontName="Helvetica", fontSize=8.3, leading=11, textColor=GREYTEXT,
    )
    S["smallc"] = ParagraphStyle(
        "smallc", fontName="Helvetica", fontSize=8.3, leading=11, textColor=GREYTEXT,
        alignment=TA_CENTER,
    )
    S["cell"] = ParagraphStyle(
        "cell", fontName="Helvetica", fontSize=8.6, leading=11.5, textColor=GREYTEXT,
    )
    S["cellb"] = ParagraphStyle(
        "cellb", fontName="Helvetica-Bold", fontSize=8.6, leading=11.5, textColor=NAVY,
    )
    S["cellhdr"] = ParagraphStyle(
        "cellhdr", fontName="Helvetica-Bold", fontSize=8.4, leading=11, textColor=colors.white,
    )
    S["claim"] = ParagraphStyle(
        "claim", fontName="Helvetica-Oblique", fontSize=8.5, leading=11, textColor=TEAL,
        spaceBefore=2,
    )
    S["kicker"] = ParagraphStyle(
        "kicker", fontName="Helvetica-Bold", fontSize=8.5, leading=11, textColor=GOLD,
        spaceBefore=4, spaceAfter=1,
    )
    return S


CLAIM_LABEL = {
    "fact": "Direct result",
    "inference": "Consultant interpretation",
    "hypothesis": "Testable possibility",
    "recommendation": "Recommended action",
}


def P(text, style):
    return Paragraph(ascii_clean(text), style)


def claim_block(S, obj, prefix=""):
    """Render a typed claim with a plain-language label + cited metric IDs."""
    label = CLAIM_LABEL.get(obj.get("claim", ""), "Note")
    cites = obj.get("cites", [])
    cite_txt = f"  [based on {', '.join(cites)}]" if cites else ""
    body = f"<b>{prefix}{label}:</b> {ascii_clean(obj.get('text',''))}{ascii_clean(cite_txt)}"
    return Paragraph(body, S["body"])


def rating_color(standing):
    s = (standing or "").lower()
    if "on target" in s:
        return HEALTHY
    if "near" in s or "watch" in s:
        return WATCH
    return BREACH


STANDING = {"healthy": "On target", "watch": "Near target", "breach": "Off target"}


def _thead(S, labels):
    return [Paragraph(f'<font color="white">{l}</font>', S["cellhdr"]) for l in labels]


def _metric_table(S, facts, usable):
    head = _thead(S, ["Metric", "Result", "Target", "Standing", "Peer rank", "Confidence", "Source / data age"])
    rows = [head]
    stylecmds = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, OFFWHITE]),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    for i, f in enumerate(facts, start=1):
        standing = STANDING.get(f["rating"], f["rating"])
        pr = f["peer_rank"]
        rows.append([
            P(f["label"], S["cellb"]),
            P(f["value_display"], S["cell"]),
            P(f["operational_target"]["value_display"], S["cell"]),
            P(standing, S["cell"]),
            P(f'{pr["rank"]} of {pr["of"]}', S["cell"]),
            P(f["confidence"].title(), S["cell"]),
            P(f'{f["evidence"]["source"]}; {f["evidence"]["freshness"]}', S["small"]),
        ])
        stylecmds.append(("TEXTCOLOR", (3, i), (3, i), rating_color(standing)))
    widths = [w * usable for w in (0.28, 0.10, 0.10, 0.12, 0.10, 0.11, 0.19)]
    t = Table(rows, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle(stylecmds))
    return t


def _kv_table(S, pairs, usable, w0=0.24):
    rows = [[P(f"<b>{k}</b>", S["cell"]), P(v, S["cell"])] for k, v in pairs]
    t = Table(rows, colWidths=[w0 * usable, (1 - w0) * usable])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), TEAL_LT),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return t


def _action_block(S, a):
    return _kv_table(S, [
        ("Recommended action", a["action"]),
        ("Owner", a["owner"]),
        ("Cadence", a["cadence"]),
        ("Success measure", a["success_measure"]),
        ("Effort / impact", f'{a["effort"].title()} effort / {a["impact"].title()} impact'),
    ], USABLE)


def build_flowables(model, S):
    global USABLE
    story = []
    dealer = ascii_clean(model["dealer"])
    did = ascii_clean(model["dealer_id"])

    # ---- Cover (own page template drawn by _cover_bg) ----
    story.append(Spacer(1, 3.1 * inch))
    story.append(P("Halo Sales Performance Report Card", S["cover_title"]))
    story.append(P(f"{dealer}  -  Store #{did}", S["cover_sub"]))
    story.append(P(f"Reporting week: {PERIOD_HUMAN}", S["cover_sub"]))
    story.append(Spacer(1, 0.35 * inch))
    story.append(P(
        "A practical, week-over-week read on how your Sales team handles new leads, holds quality "
        "conversations, converts leads to shown appointments, and executes on the showroom floor - "
        "with clear, prioritized next steps you can act on this month.",
        S["cover_promise"],
    ))
    story.append(Spacer(1, 0.25 * inch))
    story.append(P("Prepared by Huminic - Halo consulting analytics", S["cover_promise"]))
    story.append(NextPageTemplate("body"))
    story.append(PageBreak())

    # ---- Executive opening ----
    ex = model["executive_narrative"]
    story.append(P("Executive summary", S["h1"]))
    story.append(P(
        "This report separates four kinds of statements so you can act with confidence: "
        "<b>direct results</b> (measured this week), <b>consultant interpretation</b> (a bounded reading "
        "of the measurements), <b>testable possibilities</b> (worth checking before acting), and "
        "<b>recommended actions</b>.",
        S["body"],
    ))
    story.append(P("What is working", S["h2"]))
    story.append(claim_block(S, ex["what_is_working"]))
    story.append(P("Largest controllable opportunity", S["h2"]))
    story.append(claim_block(S, ex["largest_controllable_opportunity"]))
    story.append(P("How the evidence connects", S["h2"]))
    story.append(claim_block(S, ex["how_evidence_connects"]))

    # ---- Scorecard ----
    story.append(P("At-a-glance scorecard", S["h1"]))
    story.append(P(
        "All 17 measured metrics for the week. The <b>scorecard is driven by operational targets</b> "
        "(practical starting thresholds for your stores). Published external market studies are listed "
        "later for context only and are not used to score your store where their definitions differ.",
        S["body"],
    ))
    story.append(_metric_table(S, model["evaluated"], USABLE))
    story.append(P(
        "Peer rank compares your three rooftops for the same metric (rank 1 is strongest); it is not "
        "an industry ranking. Confidence reflects the number of observations behind each measure.",
        S["small"],
    ))

    # ---- Four sections ----
    section_intro = {
        "A": "How quickly and how evenly new leads get a first response.",
        "B": "The quality and personalization of customer messaging.",
        "C": "How leads move to set, shown, and written appointments.",
        "D": "Showroom follow-through, test-drives, and lead ownership.",
    }
    for c in model["clusters"]:
        key = c["cluster"]
        story.append(Spacer(1, 12))
        # Keep the section heading + intro + its metric table together so a heading never orphans
        # and the table never starts alone at a page foot.
        story.append(KeepTogether([
            P(f'{c["title"]}', S["h1"]),
            P(section_intro.get(key, ""), S["body"]),
            _metric_table(S, c["facts"], USABLE),
        ]))
        story.append(KeepTogether([
            P("What the evidence says", S["h2"]),
            claim_block(S, c["narrative"]),
        ]))
        story.append(claim_block(S, c["implication"]))
        if c["hypotheses"]:
            hblock = [P("Worth testing", S["h2"])]
            for h in c["hypotheses"]:
                hblock.append(claim_block(S, h))
            story.append(KeepTogether(hblock))
        if c["actions"]:
            ablock = [P("Recommended actions", S["h2"])]
            for a in c["actions"]:
                ablock.append(_action_block(S, a))
                ablock.append(Spacer(1, 5))
            story.append(KeepTogether(ablock))

    # ---- Cross-metric synthesis ----
    story.append(Spacer(1, 12))
    story.append(P("What the metrics say together", S["h1"]))
    story.append(P(
        "The strongest insights come from reading metrics in combination. Each statement below cites "
        "the specific measures behind it.",
        S["body"],
    ))
    for x in model["cross_cluster_synthesis"]:
        story.append(claim_block(S, x))

    # ---- Impact roadmap ----
    story.append(P("Impact roadmap", S["h1"]))
    story.append(P(
        "Opportunities ordered by a deterministic evidence weight (off-target severity, three-store "
        "peer position, and confidence). This orders where to focus; it does not assert cause or blame.",
        S["body"],
    ))
    head = _thead(S, ["Priority", "Opportunity", "Area", "Standing", "Peer rank", "Evidence score"])
    rows = [head]
    area = {"A": "Response consistency", "B": "Conversation effectiveness",
            "C": "Appointment conversion", "D": "Showroom execution"}
    for i, o in enumerate(model["ranked_opportunities"], start=1):
        rows.append([
            P(str(i), S["cell"]),
            P(o["label"], S["cellb"]),
            P(area.get(o["cluster"], o["cluster"]), S["cell"]),
            P(STANDING.get(o["rating"], o["rating"]), S["cell"]),
            P(f'{o["rank"]} of 3', S["cell"]),
            P(f'{o["weight"]:.1f}', S["cell"]),
        ])
    t = Table(rows, colWidths=[w * USABLE for w in (0.10, 0.34, 0.20, 0.12, 0.11, 0.13)], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, OFFWHITE]),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(t)

    # ---- Vehicle opportunity scenario ----
    story.append(Spacer(1, 12))
    roi = model["vehicle_opportunity_scenario"]
    story.append(P("Vehicle opportunity scenario", S["h1"]))
    story.append(P(
        "A transparent, bounded scenario - not a forecast or a promise. It estimates the additional "
        "shown appointments available if the lead-to-appointment set rate reached the operational "
        "target, then applies a labeled range of show-to-sale assumptions.",
        S["body"],
    ))
    iu = roi["incremental_units"]
    story.append(_kv_table(S, [
        ("Step 1 - appointment gap to target", f'{roi["formulas"]["appointment_gap_to_target"]} = {roi["appointment_gap_to_target"]} appointments'),
        ("Step 2 - additional shown appointments", f'{roi["formulas"]["additional_shows"]} = {roi["additional_shows_if_gap_closed"]} shows'),
        ("Step 3 - incremental vehicles (range)", f'low 20%: {iu["low"]}  |  base 30%: {iu["base"]}  |  high 41%: {iu["high"]}'),
    ], USABLE, w0=0.34))
    story.append(P("Assumptions", S["h2"]))
    for a in roi["assumptions"]:
        story.append(P(f"- {ascii_clean(a)}", S["small"]))
    story.append(P("Important", S["h2"]))
    for w in roi["warnings"]:
        story.append(P(f"- {ascii_clean(w)}", S["small"]))
    story.append(P(
        "No dollar figure is shown: the accepted model carries no store-specific gross with lineage "
        "this cycle, so a dollar estimate would be invented and is deliberately omitted.",
        S["small"],
    ))

    # ---- Notifications / automation ----
    story.append(P("Notification and automation opportunities", S["h1"]))
    story.append(P(
        "The following alerts are <b>available - not activated</b>. Nothing here sends a message or "
        "changes your systems. Each would require your explicit approval to turn on.",
        S["body"],
    ))
    for n in model["notification_candidates"]:
        kind = "Notification only" if n["kind"] == "notification_only" else "External action - requires separate approval"
        # Keep each candidate's heading + full detail table together (no orphaned fragment page).
        story.append(KeepTogether([
            P("Available - not activated", S["kicker"]),
            _kv_table(S, [
                ("Trigger", n["trigger"]),
                ("Audience", n["audience"]),
                ("Timing", n["timing"]),
                ("What it shows", n["payload"]),
                ("Guardrails", n["guardrails"]),
                ("Type", kind),
            ], USABLE),
            Spacer(1, 6),
        ]))

    # ---- Visibility expansion ----
    story.append(Spacer(1, 12))
    vp = model["visibility_plan"]
    story.append(P("Visibility expansion plan", S["h1"]))
    story.append(P(
        f'{vp["unresolved_total"]} additional signals are <b>not measured this cycle</b>. They are not '
        "failures - they are the next things this report can show once the underlying data is in place. "
        "They are grouped below by theme, with the practical next visibility unlock for each.",
        S["body"],
    ))
    head = _thead(S, ["Theme", "Count", "What it could reveal", "Next visibility unlock"])
    rows = [head]
    for th in sorted(vp["themes"], key=lambda t: (-t["count"], t["theme"])):
        rows.append([
            P(th["theme"], S["cellb"]),
            P(str(th["count"]), S["cell"]),
            P(th["what_it_would_reveal"], S["cell"]),
            P(th["next_visibility_unlock"], S["cell"]),
        ])
    t = Table(rows, colWidths=[w * USABLE for w in (0.22, 0.08, 0.35, 0.35)], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, OFFWHITE]),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(t)

    # ---- Complete metric appendix (SW-001..SW-295) ----
    story.append(Spacer(1, 12))
    story.append(P("Complete metric appendix", S["h1"]))
    story.append(P(
        "Every one of the 295 Semantic Watchdog signals, one row each. Measured rows show the result, "
        "target, peer rank, confidence, and data source. Rows not measured this cycle show the specific "
        "signal and its next visibility unlock. A small number belong to a separate operational domain "
        "and are listed neutrally.",
        S["body"],
    ))
    head = _thead(S, ["ID", "Signal", "Result", "Target", "Rank", "Detail"])
    rows = [head]
    ap = sorted(model["appendix"], key=lambda c: int(c["metric_id"][3:]))
    for c in ap:
        if c["status"] == "evaluated":
            result = ascii_clean(c["value"])
            target = ascii_clean(c["target"])
            rank = f'{c["peer_rank"]} of 3'
            detail = f'{c["source"]}; {c["freshness"]}'
        else:
            result = "Not measured this cycle"
            target = "-"
            rank = "-"
            detail = ascii_clean(c["next_visibility_unlock"])
        rows.append([
            P(c["metric_id"], S["small"]),
            P(c["label"], S["small"]),
            P(result, S["small"]),
            P(target, S["small"]),
            P(rank, S["smallc"]),
            P(detail, S["small"]),
        ])
    t = Table(rows, colWidths=[w * USABLE for w in (0.09, 0.36, 0.15, 0.10, 0.07, 0.23)], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, OFFWHITE]),
        ("GRID", (0, 0), (-1, -1), 0.3, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(t)

    # ---- References / method ----
    story.append(Spacer(1, 12))
    story.append(P("References and method note", S["h1"]))
    story.append(P(
        "Your store is scored against operational targets, not against the studies below. These public "
        "market studies are provided for context only. Where a study's definition differs from how a "
        "metric is measured here, it is explicitly not used to score your store.",
        S["body"],
    ))
    refs = [
        ("Foureyes - Q1 2026 dealership funnel study", "https://www.foureyes.io/blog/dealership-close-rates-by-metro"),
        ("Foureyes - sales-process definitions", "https://support.foureyes.io/en/articles/8504360-keep-your-eyes-on-the-prize-with-sales-process-performance"),
        ("Foureyes - dealership appointment study", "https://www.foureyes.io/blog/dealership-data-study-appointment-rates"),
        ("Foureyes - 2026 dealer benchmarks", "https://www.foureyes.io/blog/2026-automotive-dealer-benchmarks-report"),
        ("Pied Piper - 2026 Internet Lead Effectiveness study", "https://www.piedpiperpsi.com/press/press-release-infiniti-dealers-rank-highest-in-2026-web-lead-response-study-ai-and-automation-drive-industry-improvement-512.htm"),
    ]
    for name, url in refs:
        story.append(Paragraph(
            f'- {ascii_clean(name)}: <a href="{url}" color="#1B7A8C">{ascii_clean(url)}</a>',
            S["small"],
        ))
    story.append(Spacer(1, 6))
    story.append(P(
        "Definition note: the appointment-show and appointment-set market figures use denominators "
        "(appointments set / contacted opportunities) that differ from this report's measured "
        "definitions, so they are context only and are not used to score your store. The web-lead "
        "response study is a 24-hour-answer composite, which differs from this report's median "
        "business-hours response measure.",
        S["small"],
    ))

    # ---- Final: 30-day cadence ----
    story.append(Spacer(1, 12))
    story.append(P("Your next 30 days", S["h1"]))
    story.append(P(
        "A simple management cadence to convert this report into results. Keep it light and consistent.",
        S["body"],
    ))
    top = model["ranked_opportunities"][:3]
    cadence = [
        ("Week 1", "Stand up a daily first-response sweep so no business-hours lead passes 30 minutes "
                   "without a tracked first response; brief the team on this report's top opportunity."),
        ("Week 2", "Tighten the set-and-confirm routine: a same-day appointment ask on every worked "
                   "lead and a confirmation touch the day before."),
        ("Week 3", "Run a short weekly message-quality review: personalize the opening, balance texts "
                   "with a call attempt, and confirm test-drive and visit logging at the desk."),
        ("Week 4", "Review the scorecard again, confirm the top opportunity is moving, and decide "
                   "whether to turn on any of the available (not activated) alerts."),
    ]
    story.append(_kv_table(S, cadence, USABLE, w0=0.14))
    story.append(P("Top three opportunities to watch", S["h2"]))
    for i, o in enumerate(top, start=1):
        story.append(P(f'{i}. {ascii_clean(o["label"])} ({area.get(o["cluster"], o["cluster"])})', S["body"]))
    story.append(Spacer(1, 8))
    story.append(P(
        "Questions on any figure in this report? Your Huminic analytics contact can walk your team "
        "through the evidence behind every number.",
        S["small"],
    ))
    return story


# ---------------------------------------------------------------------------
# Page decoration
# ---------------------------------------------------------------------------
def _cover_bg(canvas, doc):
    canvas.saveState()
    w, h = LETTER
    canvas.setFillColor(NAVY)
    canvas.rect(0, 0, w, h, fill=1, stroke=0)
    canvas.setFillColor(TEAL)
    canvas.rect(0, h - 1.5 * inch, w, 0.06 * inch, fill=1, stroke=0)
    canvas.setFillColor(GOLD)
    canvas.rect(0, h - 1.56 * inch, w, 0.02 * inch, fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 12)
    canvas.drawString(0.9 * inch, h - 1.1 * inch, "HUMINIC  |  HALO")
    canvas.restoreState()


def _body_deco(canvas, doc):
    canvas.saveState()
    w, h = LETTER
    canvas.setFillColor(NAVY)
    canvas.rect(0, h - 0.62 * inch, w, 0.62 * inch, fill=1, stroke=0)
    canvas.setFillColor(GOLD)
    canvas.rect(0, h - 0.64 * inch, w, 0.02 * inch, fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 9)
    canvas.drawString(0.7 * inch, h - 0.4 * inch, "Halo Sales Performance Report Card")
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(w - 0.7 * inch, h - 0.4 * inch, ascii_clean(doc._halo_dealer))
    canvas.setFillColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(0.7 * inch, 0.62 * inch, w - 0.7 * inch, 0.62 * inch)
    canvas.setFillColor(GREYTEXT)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(0.7 * inch, 0.42 * inch, f"Reporting week: {PERIOD_HUMAN}")
    canvas.drawCentredString(w / 2.0, 0.42 * inch, "Prepared by Huminic - Halo consulting analytics")
    canvas.drawRightString(w - 0.7 * inch, 0.42 * inch, f"Page {canvas.getPageNumber()}")
    canvas.restoreState()


USABLE = LETTER[0] - 1.4 * inch


def build_pdf(model_path, out_path):
    model = load_and_validate(model_path)
    S = styles()
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    doc = BaseDocTemplate(
        str(out_path),
        pagesize=LETTER,
        leftMargin=0.7 * inch, rightMargin=0.7 * inch,
        topMargin=0.85 * inch, bottomMargin=0.8 * inch,
        title="Halo Sales Performance Report Card",
        author="Huminic",
        subject=f'{model["dealer"]} #{model["dealer_id"]} - {PERIOD_HUMAN}',
        creator="Huminic Halo",
    )
    doc._halo_dealer = f'{model["dealer"]} #{model["dealer_id"]}'
    frame_cover = Frame(0.9 * inch, 0.9 * inch, LETTER[0] - 1.8 * inch, LETTER[1] - 1.8 * inch, id="cover")
    frame_body = Frame(0.7 * inch, 0.72 * inch, USABLE, LETTER[1] - 1.65 * inch, id="body")
    doc.addPageTemplates([
        PageTemplate(id="cover", frames=[frame_cover], onPage=_cover_bg),
        PageTemplate(id="body", frames=[frame_body], onPage=_body_deco),
    ])
    story = build_flowables(model, S)
    doc.build(story)
    print(f"wrote {out_path}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model")
    ap.add_argument("--out")
    args = ap.parse_args()
    if args.model and args.out:
        build_pdf(args.model, args.out)
        return
    for did, slug in DEALERS.items():
        model = GATE5B / f"gate5b-report-model-{did}.json"
        out = OUT_DIR / f"halo-sales-performance-report-card-{slug}-{did}-2026-08-24-to-2026-08-30.pdf"
        build_pdf(str(model), str(out))


if __name__ == "__main__":
    main()
