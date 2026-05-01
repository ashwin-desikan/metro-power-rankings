#!/usr/bin/env python3
"""Insight Engine: anomaly mining over the metro corpus.

Reads public/data/metros.json (slim) and public/data/details/*.json (full)
and emits a daily digest of candidate stories to digests/YYYY-MM-DD.md plus
a JSON sibling for the future Mission Control dashboard.

Three anomaly categories:
  1. Dimension polarity: metros that rank high on one dimension and low on a
     related one (e.g., big market cap, no metro system; many universities,
     no major league teams). The gap is the story.
  2. Score sensitivity: metros where a single dimension contributes an
     outsized share of the composite. They are fragile to reweighting and
     the dominance itself is often the story.
  3. Obscurity / underrecognised: metros that rank far higher on the
     composite than their population would predict. The gap between rank
     and population rank is the story.

Output is deterministic: same input, same digest. Diff week over week to
track which anomalies persist and which fade.

Usage:
  python3 scripts/mine_anomalies.py [--date YYYY-MM-DD]

Defaults to today's date in UTC. The --date override exists so a missed
day can be backfilled from the data as it is now (digests are
forward-looking, not snapshots; if you need a historical reconstruction,
restore the relevant public/data/ tree first).
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import math
import os
import sys
from pathlib import Path
from typing import Any


# === Configuration ============================================================

# Polarity pairs: (high_dim, low_dim, label, story_template, low_includes_unranked).
# Each pair surfaces metros that sit in the top decile of high_dim and the
# bottom three deciles of low_dim. The label drives the digest section
# heading; the story_template is hydrated with the metro name.
#
# low_includes_unranked controls whether metros with no rank on the low
# dimension count as "low". True is right for pairs where the absence
# itself is the story (a metro with no metro system, no train hub, no
# major league team). False is right for pairs where missing data
# usually means missing data, not absence (universities, museums, market
# cap should all be tracked for any metro that scores).
POLARITY_PAIRS: list[tuple[str, str, str, str, bool]] = [
    (
        "marketCap",
        "metroStations",
        "Capital concentration without transit",
        "How does {name} function as a finance capital without subway infrastructure?",
        True,
    ),
    (
        "marketCap",
        "universities",
        "Corporate without academic depth",
        "{name} carries serious market cap but limited university presence. What does the talent pipeline look like?",
        False,
    ),
    (
        "skyscrapers",
        "museumsLandmarks",
        "Building boom without cultural depth",
        "{name} has built tall but the cultural inventory has not kept pace. Is this a capital city or a corporate park?",
        False,
    ),
    (
        "majorLeagueTeams",
        "culturalEvents",
        "Sports city without cultural pull",
        "{name} is a sports town. Where is the rest of the civic identity?",
        False,
    ),
    (
        "airportScore",
        "trainHubs",
        "Air-dependent connectivity",
        "{name} flies but does not train. What does that say about its regional integration?",
        True,
    ),
    (
        "topUniHospResearch",
        "marketCap",
        "Academic centre without commercial weight",
        "{name} has the universities and hospitals. The companies have not followed. Why?",
        False,
    ),
    (
        "luxuryStars",
        "majorLeagueTeams",
        "Luxury consumption without sports presence",
        "{name} eats and stays luxe but does not field elite teams. Where does the cultural energy go instead?",
        True,
    ),
    (
        "culturalEvents",
        "majorLeagueTeams",
        "Cultural city without sports presence",
        "{name} hosts the events. Sports never stuck. Worth a deep dive on why.",
        True,
    ),
    (
        "museumsLandmarks",
        "marketCap",
        "Heritage without commerce",
        "{name} has the museums and landmarks but not the corporate base. Tourism economy or genuine civic case?",
        False,
    ),
]

# Dimensions used in score-share computation. These are the components in
# the composite formula (matching extract.py and the methodology page).
SCORED_DIMS: list[str] = [
    "majorLeagueTeams",
    "totalTeams",
    "majorSportingEvents",
    "companies",
    "marketCap",
    "culturalEvents",
    "universities",
    "topUniHospResearch",
    "museumsLandmarks",
    "portsExchangesInfra",
    "airportScore",
    "luxuryStars",
    "metroStations",
    "suburbStations",
    "trainHubs",
    "skyscrapers",
]

# Reader-facing dimension labels. Match the methodology page where possible.
DIM_LABELS: dict[str, str] = {
    "majorLeagueTeams": "major league teams",
    "totalTeams": "total teams",
    "majorSportingEvents": "major sporting events",
    "companies": "major companies",
    "marketCap": "market cap",
    "culturalEvents": "cultural events",
    "universities": "universities",
    "topUniHospResearch": "top universities, hospitals, research",
    "museumsLandmarks": "museums and landmarks",
    "portsExchangesInfra": "ports, exchanges, and infrastructure",
    "airportScore": "airport score",
    "luxuryStars": "luxury hospitality",
    "metroStations": "metro stations",
    "suburbStations": "commuter rail",
    "trainHubs": "intercity train hubs",
    "skyscrapers": "skyscrapers",
    "otherTeams": "other professional teams",
    "population": "population scale",
}

# Limits to keep digests scannable.
MAX_FINDINGS_PER_POLARITY_PAIR = 5
MAX_SENSITIVITY_FINDINGS = 12
MAX_OBSCURITY_FINDINGS = 15

# Polarity gates: high decile threshold and low decile threshold (inclusive).
HIGH_DECILE_RANK_PCT = 0.10  # top 10% of metros that have a numeric rank
LOW_DECILE_RANK_PCT = 0.70   # bottom 30% (i.e., rank below 70th percentile)

# Sensitivity gate: a metro is sensitive when the dominant dimension's
# linear contribution exceeds this share of its non-dimension score floor.
DOMINANT_DIM_SHARE_THRESHOLD = 0.35

# Obscurity gate: a metro is underrecognised when its composite rank is
# at least this multiplier better than its population rank.
OBSCURITY_MULTIPLIER_THRESHOLD = 3.0

# Minimum metro score to consider for sensitivity / obscurity (filters out
# the long tail of <1.0 metros which are noisy on these signals).
MIN_SCORE_FOR_OBSCURITY = 5.0
MIN_SCORE_FOR_SENSITIVITY = 5.0


# === I/O =====================================================================

def project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def load_metros() -> list[dict[str, Any]]:
    """Return the slim metros.json list."""
    path = project_root() / "public" / "data" / "metros.json"
    return json.loads(path.read_text())


def load_details(slug: str) -> dict[str, Any] | None:
    """Return the per-metro detail JSON, or None if missing."""
    path = project_root() / "public" / "data" / "details" / f"{slug}.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        return None


# === Helpers =================================================================

def parse_rank(rank_str: Any) -> int | None:
    """Parse a dimension rank like "1", "T-3", "42" into an int. Returns None
    for null / blank / unparseable."""
    if rank_str is None:
        return None
    s = str(rank_str).strip()
    if not s:
        return None
    if s.startswith("T-"):
        s = s[2:]
    try:
        return int(s)
    except ValueError:
        return None


def population_rank_map(metros: list[dict[str, Any]]) -> dict[str, int]:
    """Return slug -> population rank (1 = largest)."""
    sorted_by_pop = sorted(
        metros, key=lambda m: m.get("pop", 0), reverse=True
    )
    return {m["slug"]: i + 1 for i, m in enumerate(sorted_by_pop)}


def composite_total_metros() -> int:
    """How many metros the corpus contains. Used for decile thresholds."""
    return len(load_metros())


def is_high_rank(rank: int | None, total_with_rank: int) -> bool:
    if rank is None:
        return False
    return rank <= max(1, int(total_with_rank * HIGH_DECILE_RANK_PCT))


def is_low_rank(
    rank: int | None,
    total_with_rank: int,
    *,
    allow_unranked: bool = True,
) -> bool:
    """A rank is "low" if it falls below the LOW_DECILE_RANK_PCT cutoff.

    When allow_unranked is True (the default) a missing rank is treated as
    "absent on this dimension" and counts as low. This is appropriate for
    pairs like marketCap vs metroStations where the absence is the story.

    When allow_unranked is False, a missing rank is rejected because for
    that pair an unranked value is more likely to be a coverage gap than
    a meaningful absence (e.g., universities, museums, market cap).
    """
    if rank is None:
        return allow_unranked
    return rank > int(total_with_rank * LOW_DECILE_RANK_PCT)


# === Anomaly detectors =======================================================

def detect_polarity(metros: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """For each polarity pair, surface metros that sit high on the first
    dimension and low on the second."""
    # Build a ranks-by-dim lookup from detail files.
    ranks_by_metro: dict[str, dict[str, int | None]] = {}
    for m in metros:
        d = load_details(m["slug"])
        if not d:
            continue
        dr = d.get("dimRanks") or {}
        ranks_by_metro[m["slug"]] = {
            dim: parse_rank(dr.get(dim)) for dim in SCORED_DIMS
        }

    # For each dimension, count how many metros have a populated rank.
    # That is the denominator for the decile threshold (since not every
    # metro has every dimension).
    total_with_rank: dict[str, int] = {}
    for dim in SCORED_DIMS:
        total_with_rank[dim] = sum(
            1 for slug, ranks in ranks_by_metro.items()
            if ranks.get(dim) is not None
        )

    findings: list[dict[str, Any]] = []
    metro_by_slug = {m["slug"]: m for m in metros}

    for high_dim, low_dim, label, story_template, low_includes_unranked in POLARITY_PAIRS:
        candidates = []
        for slug, ranks in ranks_by_metro.items():
            high = ranks.get(high_dim)
            low = ranks.get(low_dim)
            if not is_high_rank(high, total_with_rank[high_dim]):
                continue
            if not is_low_rank(low, total_with_rank[low_dim], allow_unranked=low_includes_unranked):
                continue
            metro = metro_by_slug.get(slug)
            if not metro:
                continue
            candidates.append({
                "slug": slug,
                "name": metro["name"],
                "country": metro.get("country", ""),
                "score": metro["score"],
                "rank": metro["rank"],
                "high_dim": high_dim,
                "high_rank": high,
                "low_dim": low_dim,
                "low_rank": low,
            })
        # Sort: best high_rank first, then worst low_rank (largest gap).
        candidates.sort(
            key=lambda c: (c["high_rank"], -(c["low_rank"] or 99999))
        )
        for c in candidates[:MAX_FINDINGS_PER_POLARITY_PAIR]:
            c["category"] = "polarity"
            c["pair_label"] = label
            c["story_angle"] = story_template.format(name=c["name"])
            findings.append(c)
    return findings


def _score_share_estimate(detail: dict[str, Any]) -> tuple[str | None, float]:
    """Estimate the dominant dimension's share of the composite score.

    The methodology formula has different shapes per dimension (linear,
    log-scaled, capped, tier-bonused). To approximate without
    re-implementing the entire formula, we compute each dimension's
    contribution using the same shape extract.py uses, then divide by
    the total. Returns (dominant_dim_key, dominant_share).
    """
    metro = detail.get("metro") or {}
    dims = metro.get("dims") or {}
    score = metro.get("score") or 0
    if score <= 0:
        return None, 0.0

    contrib: dict[str, float] = {}

    # Linear contributions (scaled).
    pop = metro.get("pop") or 0
    contrib["population"] = pop / 3_000_000

    market_cap = dims.get("marketCap") or 0
    contrib["marketCap"] = market_cap / 700_000_000_000

    # Capped: major league teams (cap 10), other teams (cap 10).
    major = dims.get("majorLeagueTeams") or 0
    contrib["majorLeagueTeams"] = min(major, 10)

    total = dims.get("totalTeams") or 0
    other = max(0, total - major)
    contrib["otherTeams"] = min(other * 0.25, 10)

    # Combined cultural assets weighted 0.65 each.
    contrib["culturalEvents"] = (dims.get("culturalEvents") or 0) * 0.65
    contrib["museumsLandmarks"] = (dims.get("museumsLandmarks") or 0) * 0.65
    contrib["portsExchangesInfra"] = (dims.get("portsExchangesInfra") or 0) * 0.65

    # Airport score (low weight).
    contrib["airportScore"] = (dims.get("airportScore") or 0) * 0.25

    # Universities split (top 50 vs rest). We do not have a top-50 count
    # per metro; approximate by using topUniHospResearch as the
    # combined universities-plus-hosps signal. Weight × 2.7 (between the
    # 3.5 top-50 weight and 2.2 rest weight).
    contrib["universities"] = (dims.get("topUniHospResearch") or 0) * 2.7

    # Log-scaled dimensions.
    def safe_log(v: float) -> float:
        return math.log10(v) if v > 1 else 0.0

    contrib["metroStations"] = safe_log(dims.get("metroStations") or 0) * 1.0
    contrib["suburbStations"] = safe_log(dims.get("suburbStations") or 0) * 0.5
    contrib["trainHubs"] = safe_log(dims.get("trainHubs") or 0) * 2.0
    contrib["skyscrapers"] = safe_log(dims.get("skyscrapers") or 0) * 5.7
    contrib["luxuryStars"] = safe_log(dims.get("luxuryStars") or 0) * 3.0

    # Major sporting events capped.
    mse = dims.get("majorSportingEvents") or 0
    contrib["majorSportingEvents"] = min(mse * 0.2, 4.0)

    if not contrib:
        return None, 0.0

    total_contrib = sum(contrib.values())
    if total_contrib <= 0:
        return None, 0.0

    dominant = max(contrib.items(), key=lambda kv: kv[1])
    return dominant[0], dominant[1] / total_contrib


def detect_sensitivity(metros: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Find metros where a single dimension dominates the composite. The
    bigger the share, the more fragile the rank is to reweighting."""
    findings: list[dict[str, Any]] = []
    for m in metros:
        if m["score"] < MIN_SCORE_FOR_SENSITIVITY:
            continue
        d = load_details(m["slug"])
        if not d:
            continue
        dom, share = _score_share_estimate(d)
        if dom is None or share < DOMINANT_DIM_SHARE_THRESHOLD:
            continue
        findings.append({
            "category": "sensitivity",
            "slug": m["slug"],
            "name": m["name"],
            "country": m.get("country", ""),
            "score": m["score"],
            "rank": m["rank"],
            "dominant_dim": dom,
            "dominant_share": round(share, 3),
            "story_angle": (
                f"{m['name']}'s composite leans heavily on "
                f"{DIM_LABELS.get(dom, dom)} "
                f"({round(share*100)}% of the score). "
                f"What happens to its identity if that single dimension changes?"
            ),
        })
    findings.sort(key=lambda f: -f["dominant_share"])
    return findings[:MAX_SENSITIVITY_FINDINGS]


def detect_obscurity(metros: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Find metros that rank far better on the composite than their
    population rank would predict."""
    pop_ranks = population_rank_map(metros)
    findings: list[dict[str, Any]] = []
    for m in metros:
        if m["score"] < MIN_SCORE_FOR_OBSCURITY:
            continue
        if not m.get("pop"):
            continue
        score_rank = m["rank"]
        pop_rank = pop_ranks.get(m["slug"])
        if not pop_rank:
            continue
        # Obscurity multiplier: how many times better the score rank is
        # than the population rank.
        if score_rank <= 0:
            continue
        multiplier = pop_rank / score_rank
        if multiplier < OBSCURITY_MULTIPLIER_THRESHOLD:
            continue
        findings.append({
            "category": "obscurity",
            "slug": m["slug"],
            "name": m["name"],
            "country": m.get("country", ""),
            "score": m["score"],
            "score_rank": score_rank,
            "pop_rank": pop_rank,
            "multiplier": round(multiplier, 1),
            "pop": m["pop"],
            "story_angle": (
                f"{m['name']} is rank #{score_rank} by score but "
                f"#{pop_rank} by population: it punches "
                f"{round(multiplier, 1)}x above its weight. "
                f"What concentration of capital makes that possible?"
            ),
        })
    findings.sort(key=lambda f: -f["multiplier"])
    return findings[:MAX_OBSCURITY_FINDINGS]


# === Digest writers ==========================================================

def write_markdown(date_str: str, findings: dict[str, list[dict[str, Any]]],
                   out_path: Path) -> None:
    lines: list[str] = []
    lines.append(f"# Anomaly digest: {date_str}")
    lines.append("")
    total = sum(len(v) for v in findings.values())
    lines.append(
        f"_{total} candidate stories. {len(findings['polarity'])} polarity, "
        f"{len(findings['sensitivity'])} sensitivity, "
        f"{len(findings['obscurity'])} obscurity._"
    )
    lines.append("")

    # Polarity, grouped by pair label.
    if findings["polarity"]:
        lines.append("## Dimension polarity")
        lines.append(
            "Metros that rank high on one dimension and low on a related "
            "one. The gap is usually the story."
        )
        lines.append("")
        # Group by pair_label preserving original order.
        seen_labels: list[str] = []
        by_label: dict[str, list[dict[str, Any]]] = {}
        for f in findings["polarity"]:
            label = f["pair_label"]
            if label not in by_label:
                by_label[label] = []
                seen_labels.append(label)
            by_label[label].append(f)
        for label in seen_labels:
            lines.append(f"### {label}")
            for f in by_label[label]:
                hd = DIM_LABELS.get(f["high_dim"], f["high_dim"])
                ld = DIM_LABELS.get(f["low_dim"], f["low_dim"])
                lines.append(
                    f"- **{f['name']}** (#{f['rank']}, {f['country']}): "
                    f"{hd} #{f['high_rank']} vs {ld} "
                    f"#{f['low_rank'] if f['low_rank'] is not None else 'unranked'}. "
                    f"_{f['story_angle']}_"
                )
            lines.append("")

    if findings["sensitivity"]:
        lines.append("## Score sensitivity")
        lines.append(
            "Metros whose composite leans heavily on a single dimension. "
            "Their identity is easier to characterise and more fragile to "
            "reweighting."
        )
        lines.append("")
        for f in findings["sensitivity"]:
            dom = DIM_LABELS.get(f["dominant_dim"], f["dominant_dim"])
            pct = round(f["dominant_share"] * 100)
            lines.append(
                f"- **{f['name']}** (#{f['rank']}, {f['country']}): "
                f"{pct}% of composite from {dom}. _{f['story_angle']}_"
            )
        lines.append("")

    if findings["obscurity"]:
        lines.append("## Underrecognised metros")
        lines.append(
            "Metros ranked far higher on the composite than on population. "
            "Often the most interesting stories: what concentration makes "
            "this work."
        )
        lines.append("")
        for f in findings["obscurity"]:
            lines.append(
                f"- **{f['name']}** ({f['country']}): score rank "
                f"#{f['score_rank']}, population rank #{f['pop_rank']} "
                f"({f['multiplier']}x). _{f['story_angle']}_"
            )
        lines.append("")

    if total == 0:
        lines.append(
            "_No candidates surfaced today. Either the thresholds are too "
            "tight or the data has not changed enough to produce new "
            "anomalies. Loosen the thresholds in scripts/mine_anomalies.py "
            "if this persists._"
        )
        lines.append("")

    # Method note. Keep it at the bottom so it does not push findings off
    # the first screen, but always present so the percentages and gates
    # are not quoted as exact.
    lines.append("---")
    lines.append("")
    lines.append("**Method note.** Sensitivity percentages are heuristic, "
                 "computed by reconstructing each dimension's contribution "
                 "with the same shape used in the source formula but without "
                 "the GDP tier bonus, the GaWC adjustment, or the annual-events "
                 "bonus. Direction is reliable; precise numbers are not. Do "
                 "not quote the percentages as exact in published pieces.")
    lines.append("")
    lines.append("Polarity findings exclude pairs where the low dimension is "
                 "merely uncovered in the data; the gate keeps unranked-as-low "
                 "only for pairs where absence is genuinely the story "
                 "(no metro system, no train hub, no major league team).")
    lines.append("")

    out_path.write_text("\n".join(lines))


def write_json(date_str: str, findings: dict[str, list[dict[str, Any]]],
               out_path: Path) -> None:
    payload = {
        "date": date_str,
        "generated_at": _dt.datetime.now(_dt.timezone.utc).isoformat(),
        "counts": {k: len(v) for k, v in findings.items()},
        "findings": findings,
    }
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False))


# === Main ====================================================================

def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--date",
        help="Override the digest date (YYYY-MM-DD). Defaults to today UTC.",
    )
    parser.add_argument(
        "--out-dir",
        default=str(project_root() / "digests"),
        help="Where to write the digest files. Defaults to <project>/digests/.",
    )
    args = parser.parse_args(argv)

    if args.date:
        date_str = args.date
    else:
        date_str = _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%d")

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Loading corpus...")
    metros = load_metros()
    print(f"  {len(metros)} metros")

    print(f"Detecting polarity anomalies...")
    polarity = detect_polarity(metros)
    print(f"  {len(polarity)} findings")

    print(f"Detecting sensitivity anomalies...")
    sensitivity = detect_sensitivity(metros)
    print(f"  {len(sensitivity)} findings")

    print(f"Detecting obscurity anomalies...")
    obscurity = detect_obscurity(metros)
    print(f"  {len(obscurity)} findings")

    findings = {
        "polarity": polarity,
        "sensitivity": sensitivity,
        "obscurity": obscurity,
    }

    md_path = out_dir / f"{date_str}.md"
    json_path = out_dir / f"{date_str}.json"
    print(f"Writing {md_path}...")
    write_markdown(date_str, findings, md_path)
    print(f"Writing {json_path}...")
    write_json(date_str, findings, json_path)

    total = sum(len(v) for v in findings.values())
    print(f"\nDone. {total} candidate stories in {date_str}.md.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
