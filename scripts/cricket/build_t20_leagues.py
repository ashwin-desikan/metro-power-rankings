#!/usr/bin/env python3
"""Domestic T20 league champions from the local cricsheet archive.

Input: data/cricket/matches.json (gitignored, 17.6k matches incl. franchise
leagues). Champions = winners of matches tagged event_stage "Final" per
(league, season). Winners-only by design, mirroring Domestic Rugby.

Output: public/data/cricket/t20-leagues.json
  { rolls: {key: [{season, winner, ru}]}, most_titled, labels,
    honours: [{name, league, titles, years}] }  (honours matched to Team List)

Leagues NOT in the archive (no champions emitted; tracked for later):
Major League Cricket, Nepal T20 League, Afghanistan Premier League,
Zimbabwe T20, WPL, The Hundred Women, Euro T20 Slam (never completed).

Run from repo root: python scripts/cricket/build_t20_leagues.py
"""
import io
import json
import os
import re
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MATCHES = os.path.join(ROOT, "data", "cricket", "matches.json")
ALL_TEAMS = os.path.join(ROOT, "public", "data", "sports", "all-teams.json")
OUT = os.path.join(ROOT, "public", "data", "cricket", "t20-leagues.json")
HERE = os.path.dirname(os.path.abspath(__file__))
# Manually-supplied champions for leagues/seasons cricsheet hasn't published yet
# (e.g. a just-completed 2026 final). Merged in main(); cricsheet wins on conflict.
SUPPLEMENT = os.path.join(HERE, "manual-t20-champions.tsv")

# cricsheet event name -> (league key, Team List league name)
EVENTS = {
    "Indian Premier League": ("ipl", "IPL"),
    "Big Bash League": ("bbl", "Big Bash League"),
    "Pakistan Super League": ("psl", "Pakistan Super League"),
    "Caribbean Premier League": ("cpl", "CPL"),
    "Bangladesh Premier League": ("bpl", "BPL"),
    "Vitality Blast": ("blast", "T20 Blast"),
    "Vitality Blast Men": ("blast", "T20 Blast"),
    "NatWest T20 Blast": ("blast", "T20 Blast"),
    "Super Smash": ("smash", "Super Smash"),
    "The Hundred Men's Competition": ("hundred", "The Hundred"),
    "SA20": ("sa20", "SA20"),
    "International League T20": ("ilt20", "International League T20"),
    "Lanka Premier League": ("lpl", "Lanka Premier League"),
}

LABELS = {
    "ipl": "IPL", "bbl": "Big Bash League", "psl": "Pakistan Super League",
    "cpl": "Caribbean Premier League", "bpl": "Bangladesh Premier League",
    "blast": "T20 Blast", "smash": "Super Smash", "hundred": "The Hundred",
    "sa20": "SA20", "ilt20": "International League T20",
    "lpl": "Lanka Premier League",
}

# TWO MAPS, TWO JOBS. Do not merge them back into one.
#
# Until 2026-08-19 a single ALIASES map did both jobs below, so the roll printed
# TODAY'S name on YESTERDAY'S season: The Hundred read "MI London" for 2023,
# 2024 and 2025, when the team was Oval Invincibles and the rebrand did not
# happen until 2026. That is the same defect the corporate rankings board fixed
# with dated era names, and it is worse here, because it tells a reader that
# Oval Invincibles never won anything.
#
# ERA_BRAND: cricsheet's raw name -> the name the team carried IN THAT
# COMPETITION AT THE TIME. APPLIED TO THE ROLL. cricsheet files the Blast under
# bare county names and the Super Smash under association names; the brand is
# what the competition itself called them, so this makes the roll MORE
# era-correct, not less. Spelling and whitespace normalisation belongs here too.
ERA_BRAND = {
    # normalisation, not a rename
    "Adelaide Strikers ": "Adelaide Strikers",
    "St Kitts and Nevis Patriots": "St Kitts & Nevis Patriots",
    "St Lucia Kings": "Saint Lucia Kings",
    # T20 Blast: county -> the brand that county plays the Blast under
    "Nottinghamshire": "Notts Outlaws",
    "Hampshire": "Hampshire Hawks",
    "Kent": "Kent Spitfires",
    "Essex": "Essex Eagles",
    "Worcestershire": "Worcestershire Rapids",
    "Northamptonshire": "Northants Steelbacks",
    "Lancashire": "Lancashire Lightning",
    "Warwickshire": "Birmingham Bears",
    # Super Smash: association -> the brand it plays under
    "Northern Districts": "Northern Brave",
    "Central Districts": "Central Stags",
    "Wellington": "Wellington Firebirds",
}

# LINEAGE: a name a franchise USED TO carry -> the franchise's current Team List
# name. NEVER APPLIED TO THE ROLL. Used only to fold a franchise's titles onto
# one row for the honours layer and the most-titled table, so that a rename does
# not split a club's trophy count in two.
#
# 🔴 An entry here is undated, so it folds the WHOLE history of the old name
# onto the new one. That is right for aggregation and wrong for display, which
# is exactly why it must not touch the roll.
LINEAGE = {
    # The Hundred: renamed for 2026 after the 2025 franchise sales
    "Oval Invincibles": "MI London",
    "Manchester Originals": "Manchester Super Giants",
    "Northern Superchargers": "Sunrisers Leeds",
    # IPL renames
    "Royal Challengers Bangalore": "Royal Challengers Bengaluru",
    "Delhi Daredevils": "Delhi Capitals",
    "Kings XI Punjab": "Punjab Kings",
    # CPL renames / lineages
    "St Lucia Zouks": "Saint Lucia Kings",
    "Barbados Tridents": "Barbados Royals",
    "Trinidad & Tobago Red Steel": "Trinbago Knight Riders",
    # LPL lineages
    "Jaffna Kings": "Jaffna",
    "Jaffna Stallions": "Jaffna",
    "B-Love Kandy": "Kandy Falcons",
}

# T20 finals are stored under the era competition brand (Vitality Blast names
# Warwickshire as "Birmingham Bears", etc.) so the rolls/hub stay era-correct.
# Metro cards look honours up by Team List franchise name, so the honours layer
# must be re-keyed brand -> Team List name. Keep rolls on the brand.
BRAND_TO_TEAMLIST = {
    "Birmingham Bears": "Warwickshire Bears",
    "Essex Eagles": "Essex",
    "Northants Steelbacks": "Northamptonshire Steelbacks",
}


def load_supplement():
    """Manually-supplied champions -> [(key, season, winner, ru)]."""
    rows = []
    if not os.path.exists(SUPPLEMENT):
        return rows
    for line in io.open(SUPPLEMENT, encoding="utf-8"):
        line = line.rstrip("\n")
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        parts = [p.strip() for p in line.split("\t")]
        if len(parts) < 3 or not (parts[0] and parts[1] and parts[2]):
            continue
        rows.append((parts[0], parts[1], parts[2], parts[3] if len(parts) > 3 else ""))
    return rows


def _year(s):
    m = re.search(r"(\d{4})", str(s))
    return int(m.group(1)) if m else 0


def _canon(name):
    """A roll's era name -> the current Team List franchise it belongs to.

    Lineage first (an old franchise name becomes the current one), then the
    brand -> Team List re-key. This is the AGGREGATION key only. Never write
    the result of this back into a roll row.
    """
    n = LINEAGE.get(name, name)
    return BRAND_TO_TEAMLIST.get(n, n)


def cricsheet_rolls():
    """Champions from the local cricsheet archive: winners of Final-stage
    matches per league+season. Returns {key: [{season, winner, ru}]}."""
    d = json.load(io.open(MATCHES, encoding="utf-8"))
    rows = d if isinstance(d, list) else d.get("matches", [])
    finals = defaultdict(dict)  # key -> season -> row (last final per season wins)
    for r in rows:
        ev = str(r.get("event") or "")
        if ev not in EVENTS:
            continue
        if str(r.get("event_stage") or "").strip().lower() != "final":
            continue
        key, _tl_league = EVENTS[ev]
        season = str(r.get("season") or "")
        winner = ERA_BRAND.get(str(r.get("winner") or "").strip(),
                               str(r.get("winner") or "").strip())
        if not winner:
            continue  # no-result final
        both = [str(x).strip() for x in (r.get("teams") or [])]
        ru = next((ERA_BRAND.get(t, t) for t in both if ERA_BRAND.get(t, t) != winner), "")
        # Keep the LAST final per season (covers double-headers / replays).
        finals[key][season] = {"season": season, "winner": winner, "ru": ru,
                               "date": str(r.get("date") or "")}
    rolls = {}
    for key, by_season in finals.items():
        out = sorted(by_season.values(), key=lambda x: x["date"], reverse=True)
        for r in out:
            r.pop("date", None)
        rolls[key] = out
    return rolls


def main():
    teams_doc = json.load(io.open(ALL_TEAMS, encoding="utf-8"))
    teams_doc = teams_doc if isinstance(teams_doc, list) else teams_doc.get("teams", [])
    tl_names = defaultdict(set)
    for t in teams_doc:
        if "cricket" in str(t.get("sport", "")).lower():
            tl_names[t.get("league")].add(t.get("team") or t.get("name"))

    # Base rolls: cricsheet if the archive is present (full rebuild), else the
    # committed t20-leagues.json, so this runs in CI / anywhere without the 17k
    # gitignored match archive. The manual supplement is merged on top of either.
    if os.path.exists(MATCHES):
        rolls = cricsheet_rolls()
        print("base: cricsheet archive")
    else:
        prev = json.load(io.open(OUT, encoding="utf-8")) if os.path.exists(OUT) else {"rolls": {}}
        rolls = {k: [dict(r) for r in v] for k, v in prev.get("rolls", {}).items()}
        print("base: committed t20-leagues.json (matches.json absent)")

    for key, season, winner, ru in load_supplement():
        if key not in LABELS:
            print(f"supplement: unknown league key '{key}' skipped")
            continue
        roll = rolls.setdefault(key, [])
        if any(str(r.get("season")) == season for r in roll):
            continue  # cricsheet (or an earlier row) already has this season
        roll.append({"season": season, "winner": winner, "ru": ru})
        print(f"supplement: added {key} {season} {winner} (def. {ru or 'N/A'})")

    for k in rolls:
        rolls[k].sort(key=lambda r: -_year(r["season"]))

    # A CREST BELONGS TO THE FRANCHISE, NOT TO THE NAME IT USED THAT SEASON.
    # The roll displays the era name, so a crest looked up on that string misses
    # for every renamed club (Oval Invincibles, Manchester Originals, B-Love
    # Kandy all have no badge of their own). Carry the canonical franchise
    # alongside the display name and let the page resolve the crest on that.
    # Emitted only where it differs, so the file stays small and the diff honest.
    for k, rs in rolls.items():
        for r in rs:
            for field, keyfield in (("winner", "winnerKey"), ("ru", "ruKey")):
                nm = r.get(field) or ""
                canon = _canon(nm) if nm else ""
                if canon and canon != nm:
                    r[keyfield] = canon

    honours = defaultdict(lambda: defaultdict(list))  # (name, tl_league) -> years
    unmatched = defaultdict(list)
    key_to_league = {v[0]: v[1] for v in EVENTS.values()}
    for key, rs in rolls.items():
        tl_league = key_to_league.get(key)
        for r in rs:
            tl_name = _canon(r["winner"])
            if tl_league and tl_name in tl_names.get(tl_league, set()):
                honours[(tl_name, tl_league)][key].append(r["season"])
            else:
                unmatched[r["winner"]].append(f"{LABELS.get(key, key)} {r['season']}")

    # AGGREGATE ON THE FRANCHISE, DISPLAY THE FRANCHISE. The roll now keeps the
    # era name, so counting raw winner strings would split Oval Invincibles (2)
    # from MI London (1) and report neither as a three-time champion. Fold
    # through the same canonical key the honours layer uses.
    most = {}
    for key, rs in rolls.items():
        tally = defaultdict(int)
        for r in rs:
            tally[_canon(r["winner"])] += 1
        most[key] = sorted(
            [{"winner": w, "titles": n} for w, n in tally.items()],
            key=lambda x: (-x["titles"], x["winner"]))[:5]

    honour_rows = [{
        "name": name, "league": lg,
        "titles": sum(len(v) for v in comps.values()),
        "years": sorted({s for v in comps.values() for s in v}),
    } for (name, lg), comps in honours.items()]

    json.dump({"rolls": rolls, "most_titled": most, "labels": LABELS,
               "honours": honour_rows},
              io.open(OUT, "w", encoding="utf-8", newline=""),
              separators=(",", ":"), ensure_ascii=False)

    print("rolls:", {k: len(v) for k, v in sorted(rolls.items())})
    print("matched honour teams:", len(honour_rows))
    print("UNMATCHED champions (review; not on cards):")
    for w, occ in sorted(unmatched.items(), key=lambda kv: -len(kv[1])):
        print(f"  {w}  x{len(occ)}  ({occ[0]}{'...' if len(occ) > 1 else ''})")


if __name__ == "__main__":
    main()
