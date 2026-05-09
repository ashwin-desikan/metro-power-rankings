#!/usr/bin/env python3
"""Quiz question generator for the /play daily mechanic.

Generates a forward-looking JSON queue at public/data/quiz_queue.json.
Each issue contains 5 questions arranged on the tier-stacked multiplier
ladder (Q1 ×1 to Q5 ×3). The queue stores ONLY load-bearing fields:
answer slug, mode, multiplier, clue template, hook dimension, tier band.
All display copy (clue text, factoid, tier badge, adjacents, dimension
chart) composes at render time from current public/data/.

Six modes:
  1. pinpoint            "Where is [metro name]?"
  2. dimension-capital   "This metro ranks top-N globally on [dim]"
  3. tier-reveal         "This metro is the only [tier] in [country]"
  4. top-teams           "The dominant team plays at [venue]"
  5. badge-holder        "This metro carries the [badge] badge"
  6. conurbation-member  "This metro anchors the [cluster] cluster"

Tier-stacked daily:
  Q1 (×1): composite < 20 (Regional Hub or below) — calibration
  Q2 (×1): composite 10-49
  Q3 (×2): composite 20-99
  Q4 (×3): composite 50-99
  Q5 (×3): composite 50+

Mode-tier compatibility: each slot's tier band intersects the mode's
candidate pool. The selector falls back gracefully if a slot has no
viable mode; in practice the dataset is deep enough that every slot
has multiple options.

Run:
  python3 scripts/generate_quiz_questions.py [--days 30] [--start YYYY-MM-DD]

Idempotency: existing locked issues (lockedAt set, date <= today) are
preserved verbatim. Forward issues (date > today, lockedAt unset) are
regenerated against current data. The CLI flag --regenerate-locked
overrides this for emergencies; do not use in normal operation.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import os
import random
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field, asdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data"
DETAILS = DATA / "details"
QUEUE_PATH = DATA / "quiz_queue.json"

# --- Tiers ---------------------------------------------------------------

TIER_GLOBAL_CAPITAL = "global-capital"
TIER_CONTINENTAL = "continental-city"
TIER_MAJOR_METRO = "major-metro"
TIER_REGIONAL_HUB = "regional-hub"
TIER_ESTABLISHED = "established-city"
TIER_EMERGING = "emerging-city"
TIER_LOCAL = "local-city"

TIER_LABELS = {
    TIER_GLOBAL_CAPITAL: "Global Capital",
    TIER_CONTINENTAL: "Continental City",
    TIER_MAJOR_METRO: "Major Metro",
    TIER_REGIONAL_HUB: "Regional Hub",
    TIER_ESTABLISHED: "Established City",
    TIER_EMERGING: "Emerging City",
    TIER_LOCAL: "Local City",
}

def tier_of(score: float) -> str:
    if score >= 100: return TIER_GLOBAL_CAPITAL
    if score >= 50: return TIER_CONTINENTAL
    if score >= 20: return TIER_MAJOR_METRO
    if score >= 10: return TIER_REGIONAL_HUB
    if score >= 5: return TIER_ESTABLISHED
    if score >= 1: return TIER_EMERGING
    return TIER_LOCAL


# --- Multiplier slots ----------------------------------------------------

@dataclass(frozen=True)
class Slot:
    n: int                # 1..5
    multiplier: int       # 1, 1, 2, 3, 3
    score_min: float
    score_max: float

SLOTS = [
    Slot(1, 1, 5.0, 19.999),     # Established / Regional Hub
    Slot(2, 1, 10.0, 49.999),    # Regional Hub / Major Metro
    Slot(3, 2, 20.0, 99.999),    # Major Metro / Continental
    Slot(4, 3, 50.0, 99.999),    # Continental
    Slot(5, 3, 50.0, 9999.0),    # Continental / Global Capital
]


# --- Dimension labels (short form, for clue template metadata) -----------

DIM_LABELS = {
    "majorLeagueTeams": "major league teams",
    "totalTeams": "total sports teams",
    "majorSportingEvents": "major sporting events",
    "companies": "headquartered companies",
    "marketCap": "corporate market cap",
    "culturalEvents": "cultural events",
    "universities": "top-50 universities",
    "topUniHospResearch": "research institutions",
    "museumsLandmarks": "museums and landmarks",
    "portsExchangesInfra": "ports and exchanges",
    "airportScore": "airport score",
    "luxuryStars": "Michelin and luxury hospitality",
    "metroStations": "metro stations",
    "suburbStations": "suburban rail stations",
    "trainHubs": "intercity train hubs",
    "skyscrapers": "skyscrapers",
}


# --- Loading -------------------------------------------------------------

def load_metros() -> tuple[list[dict], dict[str, dict]]:
    metros = json.loads((DATA / "metros.json").read_text())
    by_slug = {m["slug"]: m for m in metros}
    return metros, by_slug

def load_details(slug: str) -> dict | None:
    p = DETAILS / f"{slug}.json"
    if not p.exists(): return None
    try:
        return json.loads(p.read_text())
    except Exception:
        return None

def parse_dim_rank(raw) -> int | None:
    """Parse dimRanks values like 'T-19', '19', None into integers."""
    if raw is None: return None
    if isinstance(raw, (int, float)): return int(raw)
    s = str(raw).strip()
    if not s or s.lower() == "none": return None
    m = re.match(r"T?-?(\d+)", s)
    if m: return int(m.group(1))
    return None

def load_clusters() -> dict[str, dict]:
    """Returns {cluster_id: {tier, members: [...], score_sum, name}}."""
    out: dict[str, dict] = {}
    with (DATA / "conurbations.csv").open() as fh:
        for row in csv.DictReader(fh):
            cid = row["cluster_id"]
            members = [s for s in row["cluster_member_slugs"].split(";") if s]
            if cid in out:
                continue
            out[cid] = {
                "id": cid,
                "tier": row.get("tier") or "?",
                "members": members,
                "size": int(row["cluster_size"]),
                "score_sum": float(row["cluster_score_sum"]),
                "diameter_km": float(row["cluster_diameter_km"]),
                "lead_slug": row["slug"],
                "lead_name": row["name"],
            }
    return out

BADGE_FILES = {
    "academic-gravity-wells": "Academic Gravity Wells",
    "conurbations": "Conurbations",
    "cosmopolitan-capital": "Cosmopolitan Capital",
    "culture-capital": "Culture Capital",
    "emerging-standout": "Emerging Standout",
    "finance-capital": "Finance Capital",
    "frozen-conurbations": "Frozen Conurbations",
    "global-gateway": "Global Gateway",
    "greying-power": "Greying Power",
    "isolated-capital": "Isolated Capital",
    "megaregions": "Megaregions",
    "overperformer": "Overperformer",
    "rail-hub": "Rail Hub",
    "skyline-cities": "Skyline Cities",
    "sports-mecca": "Sports Mecca",
    "twin-metros": "Twin Metros",
}

def load_badges() -> dict[str, list[str]]:
    """Returns {metro_slug: [badge_slug, ...]}."""
    out: dict[str, list[str]] = defaultdict(list)
    for badge_slug in BADGE_FILES:
        p = DATA / f"{badge_slug}.csv"
        if not p.exists(): continue
        with p.open() as fh:
            for row in csv.DictReader(fh):
                s = row.get("slug")
                if s: out[s].append(badge_slug)
    return out


# --- Geography -----------------------------------------------------------

def haversine_km(lat1, lon1, lat2, lon2) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


# --- Mode candidate pools -----------------------------------------------

def pool_pinpoint(metros: list[dict], slot: Slot) -> list[str]:
    """Any metro in the slot's tier band."""
    return [m["slug"] for m in metros if slot.score_min <= m["score"] <= slot.score_max]

def pool_dimension_capital(metros: list[dict], by_slug: dict, slot: Slot) -> list[tuple[str, str, str]]:
    """Returns (slug, dim_key, tier_band) where tier_band is 'top-3', 'top-10', or 'top-50'.

    A metro qualifies for dimension-capital mode if it has at least one
    dimRanks entry that resolves to a top-50 ranking AND its composite
    falls in the slot's band. We bias clue text toward durable bands.
    """
    out = []
    for m in metros:
        if not (slot.score_min <= m["score"] <= slot.score_max): continue
        d = load_details(m["slug"])
        if not d: continue
        dim_ranks = d.get("dimRanks", {})
        for dim_key, raw in dim_ranks.items():
            n = parse_dim_rank(raw)
            if n is None: continue
            if n <= 3: band = "top-3"
            elif n <= 10: band = "top-10"
            elif n <= 50: band = "top-50"
            else: continue
            out.append((m["slug"], dim_key, band))
    return out

def pool_tier_reveal(metros: list[dict], slot: Slot) -> list[tuple[str, str]]:
    """Returns (slug, country_rank_label).

    Two flavors:
      - "only Continental City in {country}" — country has exactly one
        metro at Continental tier or above
      - "second-ranked metro in {country}" — country has 2+ metros and
        this is rank #2

    The slot's tier band must contain the metro.
    """
    # Group by country
    by_country: dict[str, list[dict]] = defaultdict(list)
    for m in metros:
        by_country[m["country"]].append(m)
    for ms in by_country.values():
        ms.sort(key=lambda x: -x["score"])

    out = []
    for country, ms in by_country.items():
        high = [m for m in ms if m["score"] >= 50]
        # Single Continental-or-higher in country
        if len(high) == 1:
            m = high[0]
            if slot.score_min <= m["score"] <= slot.score_max:
                tier_label = TIER_LABELS[tier_of(m["score"])]
                out.append((m["slug"], f"only-{tier_label.lower().replace(' ', '-')}-in-country"))
        # Second-ranked metro overall in country (where country has 2+)
        if len(ms) >= 2:
            second = ms[1]
            if slot.score_min <= second["score"] <= slot.score_max and second["score"] >= 10:
                out.append((second["slug"], "second-ranked-in-country"))
    return out

# Sport leagues that count as "real" teams for top-teams mode
TOP_TEAMS_REAL_LEAGUES = {
    "NFL", "MLB", "NBA", "NHL", "MLS", "NWSL",
    "Premier League", "La Liga", "Bundesliga", "Serie A", "Ligue 1",
    "Eredivisie", "Primeira Liga", "Belgian Pro League", "Scottish Premiership",
    "Süper Lig", "Russian Premier League", "Ukrainian Premier League",
    "J1 League", "K League 1", "Chinese Super League",
    "A-League", "Liga MX", "Brasileirão", "Argentine Primera",
    "AFL", "NRL", "Super Rugby", "Top 14", "Premiership Rugby",
    "Indian Premier League", "Big Bash League", "T20 Blast",
    "Champions League", "Europa League", "Champions Cup",
    "EuroLeague", "Liga ACB", "LNB Pro A",
}

def pool_top_teams(metros: list[dict], slot: Slot) -> list[tuple[str, str]]:
    """Returns (slug, marquee_team_name).

    A metro qualifies if it has at least one team in TOP_TEAMS_REAL_LEAGUES.
    Slot tier band biases toward Major Metro and above (where real teams cluster).
    """
    out = []
    for m in metros:
        if not (slot.score_min <= m["score"] <= slot.score_max): continue
        if m["score"] < 20: continue   # No realistic top-team coverage below Major Metro
        d = load_details(m["slug"])
        if not d: continue
        for t in d.get("teams", []):
            if t.get("league") in TOP_TEAMS_REAL_LEAGUES and t.get("level") == "1":
                team_name = t.get("team") or ""
                if team_name:
                    out.append((m["slug"], team_name))
                    break  # one is enough
    return out

def pool_badge_holder(metros: list[dict], by_slug: dict, badges_by_metro: dict, slot: Slot) -> list[tuple[str, str]]:
    """Returns (slug, badge_slug)."""
    out = []
    for m in metros:
        if not (slot.score_min <= m["score"] <= slot.score_max): continue
        for b in badges_by_metro.get(m["slug"], []):
            # Some badges only make sense at certain tiers. Keep simple here:
            # any badge holder is a candidate. Mode rotation handles diversity.
            out.append((m["slug"], b))
    return out

def pool_conurbation_member(metros: list[dict], clusters: dict, slot: Slot) -> list[tuple[str, str]]:
    """Returns (slug, cluster_id)."""
    out = []
    # Build slug -> cluster_id reverse lookup, restricted to multi-member clusters
    slug_to_cluster = {}
    for cid, c in clusters.items():
        if c["size"] < 2: continue
        for s in c["members"]:
            slug_to_cluster[s] = cid
    for m in metros:
        if not (slot.score_min <= m["score"] <= slot.score_max): continue
        if m["slug"] in slug_to_cluster:
            out.append((m["slug"], slug_to_cluster[m["slug"]]))
    return out


# --- Mode rotation ------------------------------------------------------

# Per-slot mode preference, descending priority. Generator picks the first
# mode whose candidate pool has at least one viable metro not yet used.
SLOT_MODE_PREFERENCE = {
    1: ["pinpoint", "badge-holder"],
    2: ["pinpoint", "tier-reveal", "badge-holder"],
    3: ["tier-reveal", "badge-holder", "top-teams", "conurbation-member"],
    4: ["dimension-capital", "top-teams", "conurbation-member", "badge-holder"],
    5: ["dimension-capital", "conurbation-member", "top-teams", "badge-holder"],
}


# --- Issue generation ---------------------------------------------------

@dataclass
class Question:
    mode: str
    multiplier: int
    answerSlug: str
    clueTemplate: str
    hookDimension: str | None = None
    tierBand: str | None = None
    extra: dict = field(default_factory=dict)

@dataclass
class Issue:
    issue: int
    date: str
    lockedAt: str | None
    questions: list[dict]


def pick_question(
    slot: Slot,
    used_slugs_in_round: set,
    used_recent_slugs: set,
    used_modes_in_round: Counter,
    metros: list[dict],
    by_slug: dict,
    badges_by_metro: dict,
    clusters: dict,
    rng: random.Random,
) -> Question | None:
    """Pick a question for this slot.

    Tries each mode in slot preference order. For each mode, prefers
    candidates not in the recency window, but falls back to any candidate
    at the right tier if the window is exhausted (necessary for Q4/Q5
    which have ~33-42 total candidates against a 30-day forward window).
    """
    # Shuffle the slot's mode preference each round so the same mode does
    # not always win the same slot across days. Same-day diversity still
    # enforced by the cap.
    mode_options = list(SLOT_MODE_PREFERENCE[slot.n])
    rng.shuffle(mode_options)
    for mode in mode_options:
        if used_modes_in_round[mode] >= 1:
            continue  # one of each mode per round so the daily slate is diverse
        candidates = []
        if mode == "pinpoint":
            candidates = [(s, None, None) for s in pool_pinpoint(metros, slot)]
        elif mode == "dimension-capital":
            candidates = pool_dimension_capital(metros, by_slug, slot)
            candidates = [(s, dim, band) for (s, dim, band) in candidates]
        elif mode == "tier-reveal":
            candidates = [(s, label, None) for (s, label) in pool_tier_reveal(metros, slot)]
        elif mode == "top-teams":
            candidates = [(s, team, None) for (s, team) in pool_top_teams(metros, slot)]
        elif mode == "badge-holder":
            candidates = [(s, b, None) for (s, b) in pool_badge_holder(metros, by_slug, badges_by_metro, slot)]
        elif mode == "conurbation-member":
            candidates = [(s, cid, None) for (s, cid) in pool_conurbation_member(metros, clusters, slot)]

        # Always exclude same-day repeats
        candidates = [c for c in candidates if c[0] not in used_slugs_in_round]
        if not candidates: continue

        # Prefer candidates outside recency window; fall back to all candidates
        preferred = [c for c in candidates if c[0] not in used_recent_slugs]
        pool = preferred if preferred else candidates

        # Random pick within mode for variety
        slug, primary, band = rng.choice(pool)

        if mode == "pinpoint":
            return Question(mode=mode, multiplier=slot.multiplier, answerSlug=slug,
                            clueTemplate="pinpoint")
        if mode == "dimension-capital":
            return Question(mode=mode, multiplier=slot.multiplier, answerSlug=slug,
                            clueTemplate=f"dimension-capital:{primary}:{band}",
                            hookDimension=primary, tierBand=band)
        if mode == "tier-reveal":
            return Question(mode=mode, multiplier=slot.multiplier, answerSlug=slug,
                            clueTemplate=f"tier-reveal:{primary}",
                            extra={"variant": primary})
        if mode == "top-teams":
            return Question(mode=mode, multiplier=slot.multiplier, answerSlug=slug,
                            clueTemplate="top-teams:marquee-team",
                            extra={"team": primary})
        if mode == "badge-holder":
            return Question(mode=mode, multiplier=slot.multiplier, answerSlug=slug,
                            clueTemplate=f"badge-holder:{primary}",
                            extra={"badge": primary})
        if mode == "conurbation-member":
            return Question(mode=mode, multiplier=slot.multiplier, answerSlug=slug,
                            clueTemplate=f"conurbation-member:{primary}",
                            extra={"clusterId": primary})
    return None


def generate_issue(
    issue_num: int,
    issue_date: date,
    used_recent_slugs: set,
    metros, by_slug, badges_by_metro, clusters, rng: random.Random,
) -> Issue:
    used_in_round: set = set()
    used_modes: Counter = Counter()
    questions: list[dict] = []
    for slot in SLOTS:
        q = pick_question(slot, used_in_round, used_recent_slugs, used_modes,
                          metros, by_slug, badges_by_metro, clusters, rng)
        if q is None:
            # Last-resort fallback: pure pinpoint at the slot tier, ignore
            # recency entirely
            pool = [s for s in pool_pinpoint(metros, slot) if s not in used_in_round]
            if pool:
                q = Question(mode="pinpoint", multiplier=slot.multiplier,
                             answerSlug=rng.choice(pool), clueTemplate="pinpoint")
        if q is None:
            raise RuntimeError(f"No viable question for slot Q{slot.n} on {issue_date}")
        used_in_round.add(q.answerSlug)
        used_modes[q.mode] += 1
        questions.append({k: v for k, v in asdict(q).items() if v not in (None, {}, [])})
    return Issue(issue=issue_num, date=issue_date.isoformat(),
                 lockedAt=None, questions=questions)


# --- Main ---------------------------------------------------------------

def load_existing_queue() -> dict:
    if QUEUE_PATH.exists():
        try:
            return json.loads(QUEUE_PATH.read_text())
        except Exception:
            return {"issues": []}
    return {"issues": []}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=30,
                    help="How many days of forward queue to maintain (default 30)")
    ap.add_argument("--start", type=str, default=None,
                    help="ISO date YYYY-MM-DD to start generation from (default: tomorrow)")
    ap.add_argument("--regenerate-locked", action="store_true",
                    help="Regenerate issues even if their lockedAt timestamp is set. Emergency use only.")
    ap.add_argument("--seed", type=int, default=None,
                    help="Random seed for reproducible generation")
    args = ap.parse_args()

    rng = random.Random(args.seed) if args.seed is not None else random.Random()

    metros, by_slug = load_metros()
    badges_by_metro = load_badges()
    clusters = load_clusters()

    existing = load_existing_queue()
    existing_issues_by_date = {i["date"]: i for i in existing.get("issues", [])}

    today = datetime.now(timezone.utc).date()
    # Implicit freeze: any issue dated at or before this cutoff is treated
    # as locked. Today's issue and tomorrow's issue are both frozen so the
    # leaderboard cannot split mid-day and the next-up issue is stable
    # against any ETL run that happens to land in the 24h window before it
    # goes live. Removes the need for a separate freeze cron.
    frozen_cutoff = today + timedelta(days=1)
    if args.start:
        start_date = date.fromisoformat(args.start)
    else:
        start_date = frozen_cutoff + timedelta(days=1)  # first regenerable date

    # Issue numbering: continue from highest existing, or start at 1
    base_issue_num = max((i["issue"] for i in existing.get("issues", [])), default=0)

    # Recent answer slugs: prefer not to repeat within a sliding window.
    # Window depends on slot tier-band depth: high-tier slots have ~33-42
    # candidates total, so a 30-day window is impossible. Use 7 days as the
    # default recency window. Generator falls back to ignoring the window
    # entirely if no candidates are available.
    RECENCY_WINDOW_DAYS = 7
    recent_slugs = set()
    for i in existing.get("issues", []):
        try:
            d = date.fromisoformat(i["date"])
        except Exception:
            continue
        if today - timedelta(days=RECENCY_WINDOW_DAYS) <= d <= today + timedelta(days=args.days):
            for q in i["questions"]:
                recent_slugs.add(q["answerSlug"])

    new_issues = []
    for offset in range(args.days):
        d = start_date + timedelta(days=offset)
        date_str = d.isoformat()
        if date_str in existing_issues_by_date:
            existing_issue = existing_issues_by_date[date_str]
            if existing_issue.get("lockedAt") and not args.regenerate_locked:
                # Preserve locked issue verbatim
                new_issues.append(existing_issue)
                continue
        # Regenerate this issue
        issue_num = base_issue_num + offset + 1
        if existing_issues_by_date.get(date_str):
            issue_num = existing_issues_by_date[date_str]["issue"]
        issue = generate_issue(issue_num, d, recent_slugs, metros, by_slug,
                               badges_by_metro, clusters, rng)
        new_issues.append({
            "issue": issue.issue,
            "date": issue.date,
            "lockedAt": issue.lockedAt,
            "questions": issue.questions,
        })
        # Update sliding window of recent slugs
        for q in issue.questions:
            recent_slugs.add(q["answerSlug"])


    # Preserve historical issues (date < start) as-is. For any historical
    # issue whose date is at or before the freeze cutoff (today + 1 day) and
    # that has no lockedAt timestamp, set lockedAt now. This is the implicit
    # freeze: it auto-records the lock when the issue crosses the cutoff,
    # giving the queue file a forensic record of when each issue locked.
    now_iso = datetime.now(timezone.utc).isoformat(timespec="seconds")
    historical = [i for i in existing.get("issues", []) if i["date"] < start_date.isoformat()]
    for h in historical:
        try:
            hd = date.fromisoformat(h["date"])
        except Exception:
            continue
        if hd <= frozen_cutoff and not h.get("lockedAt"):
            h["lockedAt"] = now_iso

    out = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "schemaVersion": 1,
        "issues": historical + new_issues,
    }
    QUEUE_PATH.write_text(json.dumps(out, indent=2) + "\n")

    # Summary
    mode_counts: Counter = Counter()
    tier_counts: Counter = Counter()
    for issue in new_issues:
        for q in issue["questions"]:
            mode_counts[q["mode"]] += 1
            tier_counts[tier_of(by_slug[q["answerSlug"]]["score"])] += 1
    print(f"Generated {len(new_issues)} issues ({sum(len(i['questions']) for i in new_issues)} questions).")
    print(f"Frozen cutoff (auto-locked): {frozen_cutoff}")
    print(f"Mode distribution:")
    for m, n in mode_counts.most_common():
        print(f"  {m}: {n}")
    print(f"Tier distribution:")
    for t, n in tier_counts.most_common():
        print(f"  {t}: {n}")
    print(f"Queue written to {QUEUE_PATH}")


if __name__ == "__main__":
    main()
