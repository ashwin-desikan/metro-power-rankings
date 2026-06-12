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
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MATCHES = os.path.join(ROOT, "data", "cricket", "matches.json")
ALL_TEAMS = os.path.join(ROOT, "public", "data", "sports", "all-teams.json")
OUT = os.path.join(ROOT, "public", "data", "cricket", "t20-leagues.json")

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

# cricsheet winner name -> Team List name (renames/lineages).
ALIASES = {
    # IPL renames
    "Royal Challengers Bangalore": "Royal Challengers Bengaluru",
    "Delhi Daredevils": "Delhi Capitals",
    "Kings XI Punjab": "Punjab Kings",
    "Adelaide Strikers ": "Adelaide Strikers",
    # T20 Blast: county -> brand names
    "Nottinghamshire": "Notts Outlaws",
    "Hampshire": "Hampshire Hawks",
    "Kent": "Kent Spitfires",
    "Essex": "Essex Eagles",
    "Worcestershire": "Worcestershire Rapids",
    "Northamptonshire": "Northants Steelbacks",
    "Lancashire": "Lancashire Lightning",
    "Warwickshire": "Birmingham Bears",
    # Super Smash: association -> brand names
    "Northern Districts": "Northern Brave",
    "Central Districts": "Central Stags",
    "Wellington": "Wellington Firebirds",
    # CPL renames / lineages
    "St Lucia Kings": "Saint Lucia Kings",
    "St Lucia Zouks": "Saint Lucia Kings",
    "St Kitts and Nevis Patriots": "St Kitts & Nevis Patriots",
    "Barbados Tridents": "Barbados Royals",
    "Trinidad & Tobago Red Steel": "Trinbago Knight Riders",
    # The Hundred: 2026 rebrands
    "Oval Invincibles": "MI London",
    "Manchester Originals": "Manchester Super Giants",
    "Northern Superchargers": "Sunrisers Leeds",
    # LPL lineages
    "Jaffna Kings": "Jaffna",
    "Jaffna Stallions": "Jaffna",
    "B-Love Kandy": "Kandy Falcons",
}


def main():
    d = json.load(io.open(MATCHES, encoding="utf-8"))
    rows = d if isinstance(d, list) else d.get("matches", [])

    teams_doc = json.load(io.open(ALL_TEAMS, encoding="utf-8"))
    teams_doc = teams_doc if isinstance(teams_doc, list) else teams_doc.get("teams", [])
    tl = {}  # (league, name) presence + name set per league
    tl_names = defaultdict(set)
    for t in teams_doc:
        if "cricket" in str(t.get("sport", "")).lower():
            tl_names[t.get("league")].add(t.get("team") or t.get("name"))

    finals = defaultdict(dict)  # key -> season -> {winner, ru}
    for r in rows:
        ev = str(r.get("event") or "")
        if ev not in EVENTS:
            continue
        stage = str(r.get("event_stage") or "").strip().lower()
        if stage != "final":
            continue
        key, _tl_league = EVENTS[ev]
        season = str(r.get("season") or "")
        winner = ALIASES.get(str(r.get("winner") or "").strip(),
                             str(r.get("winner") or "").strip())
        if not winner:
            continue  # no-result final
        both = [str(x).strip() for x in (r.get("teams") or [])]
        ru = next((ALIASES.get(t, t) for t in both if ALIASES.get(t, t) != winner), "")
        # Keep the LAST final per season (covers double-headers / replays).
        finals[key][season] = {"season": season, "winner": winner, "ru": ru,
                               "date": str(r.get("date") or "")}

    rolls = {}
    honours = defaultdict(lambda: defaultdict(list))  # (name, tl_league) -> years
    unmatched = defaultdict(list)
    for key, by_season in finals.items():
        tl_league = next(v[1] for k, v in EVENTS.items() if v[0] == key)
        out = sorted(by_season.values(), key=lambda x: x["date"], reverse=True)
        for r in out:
            r.pop("date", None)
            if r["winner"] in tl_names.get(tl_league, set()):
                honours[(r["winner"], tl_league)][key].append(r["season"])
            else:
                unmatched[r["winner"]].append(f"{LABELS[key]} {r['season']}")
        rolls[key] = out

    most = {key: sorted(
        [{"winner": w, "titles": sum(1 for r in rs if r["winner"] == w)}
         for w in {r["winner"] for r in rs}],
        key=lambda x: -x["titles"])[:5]
        for key, rs in rolls.items()}

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
