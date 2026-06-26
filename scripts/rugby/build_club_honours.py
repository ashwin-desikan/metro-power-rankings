#!/usr/bin/env python3
"""Build club rugby honours: winners-only rolls for seven competitions, matched
to the Team List's rugby union clubs (user decision 2026-06-12: no tables,
winners only; fold into the /teams/rugby-union hub; metro cards get chips).

Inputs (committed alongside this script):
  domestic-winners.txt  - user-compiled: European Cup (Heineken+Champions),
                          Top 14 finals 1892->, Premiership, Super Rugby,
                          Currie Cup
  urc-japan-winners.tsv - URC/Pro14/Celtic League + Japan Top League/League One
                          (compiled from public record, user-reviewed)

Outputs:
  public/data/rugby-union/clubs.json     - per Team List club: honours
  public/data/rugby-union/club-rolls.json - per-competition winner rolls
Prints unmatched winners (NEVER guessed into the data) for user review.

Run from repo root: python scripts/rugby/build_club_honours.py
"""
import io
import json
import os
import re
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
WINNERS = os.path.join(HERE, "domestic-winners.txt")
EXTRA = os.path.join(HERE, "urc-japan-winners.tsv")
ALL_TEAMS = os.path.join(ROOT, "public", "data", "sports", "all-teams.json")
METROS = os.path.join(ROOT, "public", "data", "metros.json")
OUT_DIR = os.path.join(ROOT, "public", "data", "rugby-union")

COUNTRIES = ["England", "France", "Ireland", "Wales", "Scotland", "Italy",
             "South Africa", "New Zealand", "Australia"]

# Winner-name -> Team List team name. League renames and franchise lineages
# (well-established successions only; anything else stays unmatched).
ALIASES = {
    # European / Top 14
    "Toulouse": "Stade Toulousain",
    "Stade Toulousain": "Stade Toulousain",
    "Stade Francais": "Stade Français Paris",
    "Stade Français": "Stade Français Paris",
    "Toulon": "RC Toulon",
    "RC Toulonnais": "RC Toulon",
    "La Rochelle": "Stade Rochelais",
    "Bordeaux Begles": "Union Bordeaux Bègles",
    "Bordeaux Bègles": "Union Bordeaux Bègles",
    "Union Bordeaux Begles": "Union Bordeaux Bègles",
    "Clermont": "ASM Clermont",
    "ASM Clermont Auvergne": "ASM Clermont",
    "AS Montferrand": "ASM Clermont",
    "Castres": "Castres Olympique",
    "Racing Club de France": "Racing 92",
    "Racing Metro 92": "Racing 92",
    "Racing Métro 92": "Racing 92",
    "Section Paloise": "Section Paloise",
    "Pau": "Section Paloise",
    "Bayonne": "Aviron Bayonnais",
    "Aviron Bayonnais": "Aviron Bayonnais",
    "Montpellier": "Montpellier HR",
    "Lyon": "Lyon OU",
    "Lyon OU": "Lyon OU",
    "Perpignan": "USA Perpignan",
    "Montauban": "US Montauban",
    "US Montauban": "US Montauban",
    # Premiership
    "Leicester": "Leicester Tigers",
    "Leicester Tigers": "Leicester Tigers",
    "Northampton": "Northampton Saints",
    "Northampton Saints": "Northampton Saints",
    "Newcastle": "Newcastle Red Bulls",
    "Newcastle Falcons": "Newcastle Red Bulls",
    "Sale": "Sale Sharks",
    "Sale Sharks": "Sale Sharks",
    "Bristol": "Bristol Bears",
    "Bristol Bears": "Bristol Bears",
    "Exeter": "Exeter Chiefs",
    "Exeter Chiefs": "Exeter Chiefs",
    # URC
    "Llanelli Scarlets": "Scarlets",
    "Cardiff": "Cardiff Rugby",
    "Cardiff Blues": "Cardiff Rugby",
    # Super Rugby (franchise lineages)
    "Auckland Blues": "Blues",
    "Canterbury Crusaders": "Crusaders",
    "ACT Brumbies": "Brumbies",
    "Otago Highlanders": "Highlanders (rugby union)",
    "Highlanders": "Highlanders (rugby union)",
    "Natal Sharks": "Sharks",
    "Waikato Chiefs": "Chiefs",
    "Queensland Reds": "Reds",
    "NSW Waratahs": "Waratahs",
    # Currie Cup (provincial union renames)
    "Northern Transvaal": "Blue Bulls",
    "Transvaal": "Golden Lions",
    "Gauteng Lions": "Golden Lions",
    "Golden Lions": "Golden Lions",
    "Natal": "Sharks",
    "Orange Free State": "Free State Cheetahs",
    "Free State": "Free State Cheetahs",
    "Griqualand West": "Griquas",
    "Border": "Border Bulldogs",
    "Eastern Province": "Eastern Province Elephants",
    "Western Province": "Stormers XXIII",
    "Boland": "Boland Cavaliers",
    # Japan
    "Toshiba": "Brave Lupus Tokyo",
    "Toshiba Brave Lupus": "Brave Lupus Tokyo",
    "Brave Lupus": "Brave Lupus Tokyo",
    "Suntory Sungoliath": "Tokyo Sungoliath",
    "Suntory": "Tokyo Sungoliath",
    "Sanyo Wild Knights": "Saitama Wild Knights",
    "Panasonic Wild Knights": "Saitama Wild Knights",
    "Panasonic": "Saitama Wild Knights",
    "Wild Knights": "Saitama Wild Knights",
    "Kubota Spears": "Spears Funabashi",
    "Kobe Steelers": "Kobe Steelers",
    "Kobelco Kobe Steelers": "Kobe Steelers",
    # Pro D2 lineages
    "Brive": "CA Brive",
    "AS Beziers": "AS Béziers (rugby)",
    "AS Béziers": "AS Béziers (rugby)",
    "SU Agen": "SU Agen (rugby)",
    "FC Grenoble": "FC Grenoble Rugby",
    "Stade Montois": "Stade Montois (rugby)",
    "US Colomiers": "Colomiers Rugby",
    "Colomiers": "Colomiers Rugby",
    # Same-club lineages
    "US Perpignan": "USA Perpignan",
    "AS Perpignan": "USA Perpignan",
    "Montpellier Herault Rugby": "Montpellier HR",
    "Montpellier Hérault Rugby": "Montpellier HR",
    "CA Beglais": "Union Bordeaux Bègles",
    "CA Béglais": "Union Bordeaux Bègles",
    "CA Bordeaux-Begles Gironde": "Union Bordeaux Bègles",
    "CA Bordeaux-Bègles Gironde": "Union Bordeaux Bègles",
}

# Per-competition preferred Team List league when one name exists in several
# (Sharks/Bulls/Stormers live in both URC and Currie Cup).
COMP_LEAGUE_PREF = {
    "european": ["Premiership", "Top 14", "URC", "Pro D2"],
    "top14": ["Top 14", "Pro D2"],
    "premiership": ["Premiership"],
    "super": ["Super Rugby", "URC"],
    "currie": ["Currie Cup"],
    "urc": ["URC"],
    "japan": ["Japan Rugby League One"],
}

COMP_LABEL = {
    "european": "Champions Cup",
    "top14": "Top 14",
    "premiership": "Premiership",
    "super": "Super Rugby",
    "currie": "Currie Cup",
    "urc": "URC",
    "japan": "Japan League One",
}


def clean(s):
    s = s.replace(" ", " ").strip()
    for c in COUNTRIES:
        if s.startswith(c + " "):
            s = s[len(c) + 1:]
    s = re.sub(r"[§†‡]", "", s)
    s = re.sub(r"\[\w+\]", "", s)
    s = re.sub(r"(?<=[a-z])\d+$", "", s)  # trailing footnote digits (Sharks6)
    s = re.sub(r"\s+", " ", s).strip()
    if "cancel" in s.lower():
        return ""
    return s


def season_year(s):
    m = re.search(r"(\d{4})", s)
    return int(m.group(1)) if m else None


# Display-name normalization (user-approved 2026-06-25): show the full era name
# consistently across rolls. Short colloquial names -> full club name for clubs
# that never renamed; rename/sponsor-era names handled per-year below. The crest
# "team" field is untouched. Only affects the displayed "winner".
DISPLAY_ALIASES = {
    "Toulouse": "Stade Toulousain", "Toulon": "RC Toulon",
    "La Rochelle": "Stade Rochelais", "Brive": "CA Brive",
    "Bordeaux B\u00e8gles": "Union Bordeaux B\u00e8gles",
    "Leicester": "Leicester Tigers", "Exeter": "Exeter Chiefs",
    "Northampton": "Northampton Saints", "Sale": "Sale Sharks",
}
def display_name(winner, season):
    y = season_year(season) or 0
    if winner == "Newcastle":
        return "Newcastle Falcons"
    if winner == "Wasps":
        return "London Wasps" if y >= 1999 else "Wasps"
    return DISPLAY_ALIASES.get(winner, winner)


def parse_domestic(path):
    lines = io.open(path, encoding="utf-8").read().splitlines()
    section = None
    rolls = defaultdict(list)
    for raw in lines:
        s = raw.strip()
        if s in ("Heineken Cup era", "Champions Cup era"):
            section = "european"
            continue
        if s == "France":
            section = "top14"
            continue
        if s == "Premiership":
            section = "premiership"
            continue
        if s.startswith("Super Rugby"):
            section = "super"
            continue
        if s.startswith("Currie Cup"):
            section = "currie"
            continue
        if not section or "\t" not in raw:
            continue
        cells = [c.strip() for c in raw.split("\t")]
        if section == "european":
            if re.match(r"^\d{4}[–-]\d{2}$", cells[0]) and len(cells) >= 4:
                rolls["european"].append({
                    "season": cells[0], "winner": clean(cells[1]),
                    "ru": clean(cells[3]) if len(cells) > 3 else "",
                })
        elif section == "top14":
            m = re.match(r"^(?:\d{1,2} \w+ )?(\d{4})$", cells[0])
            if m and len(cells) >= 2 and cells[1]:
                rolls["top14"].append({
                    "season": m.group(1), "winner": clean(cells[1]),
                    "ru": clean(cells[3]) if len(cells) > 3 and "–" not in cells[2] else
                          (clean(cells[3]) if len(cells) > 3 else ""),
                })
        elif section == "premiership":
            if re.match(r"^\d{4}[–-]\d{2}$", cells[0]) and len(cells) >= 2:
                rolls["premiership"].append({
                    "season": cells[0], "winner": clean(cells[1]), "ru": "",
                })
        elif section == "super":
            if re.match(r"^\d{4}$", cells[0]) and len(cells) >= 3:
                rolls["super"].append({
                    "season": cells[0], "winner": clean(cells[2]),
                    "ru": clean(cells[4]) if len(cells) > 4 else "",
                })
        elif section == "currie":
            m = re.match(r"^(\d{4})", cells[0])
            if m and len(cells) >= 2 and cells[1]:
                winner = clean(cells[1])
                shared = re.split(r"\s*&\s*", winner.replace("(shared)", "").strip())
                for w in shared:
                    if w:
                        rolls["currie"].append({
                            "season": m.group(1), "winner": w.strip(),
                            "ru": clean(cells[2]) if len(cells) > 2 else "",
                            "shared": len(shared) > 1 or None,
                        })
    return rolls


def parse_extra(path):
    rolls = defaultdict(list)
    for raw in io.open(path, encoding="utf-8").read().splitlines():
        if not raw.strip() or raw.startswith("#"):
            continue
        comp, season, winner, ru = (raw.split("\t") + ["", ""])[:4]
        rolls[comp].append({"season": season, "winner": winner.strip(), "ru": ru.strip()})
    return rolls


def main():
    teams = json.load(io.open(ALL_TEAMS, encoding="utf-8"))
    teams = teams if isinstance(teams, list) else teams.get("teams", [])
    ru_teams = [t for t in teams
                if "rugby" in str(t.get("sport", "")).lower()
                and "league" not in str(t.get("sport", "")).lower()]
    by_name = defaultdict(list)  # name -> [(league, metro)]
    for t in ru_teams:
        nm = t.get("team") or t.get("name")
        by_name[nm].append((t.get("league"), t.get("metro")))

    metro_slugs = {}
    def walk(x):
        if isinstance(x, dict):
            if "name" in x and "slug" in x:
                metro_slugs.setdefault(x["name"], x["slug"])
            for v in x.values():
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)
    walk(json.load(io.open(METROS, encoding="utf-8")))

    rolls = parse_domestic(WINNERS)
    for comp, rows in parse_extra(EXTRA).items():
        rolls[comp].extend(rows)

    honours = defaultdict(lambda: defaultdict(list))  # (name, league) -> comp -> years
    unmatched = defaultdict(list)

    def resolve(comp, winner):
        target = ALIASES.get(winner, winner)
        if target in by_name:
            prefs = COMP_LEAGUE_PREF[comp]
            entries = by_name[target]
            for p in prefs:
                for (lg, _m) in entries:
                    if lg == p:
                        return (target, lg)
            return (target, entries[0][0])
        return None

    metro_of = {}  # (name, league) -> metro name
    for t in ru_teams:
        metro_of[((t.get("team") or t.get("name")), t.get("league"))] = t.get("metro")

    for comp, rows in rolls.items():
        for r in rows:
            if not r["winner"]:
                continue
            hit = resolve(comp, r["winner"])
            if hit:
                honours[hit][comp].append(r["season"])
                r["team"] = hit[0]
                m = metro_of.get(hit)
                r["metro_slug"] = metro_slugs.get(m) if m else None
            else:
                r["team"] = None
                r["metro_slug"] = None
                unmatched[r["winner"]].append(f"{COMP_LABEL[comp]} {r['season']}")

    clubs = []
    for t in ru_teams:
        nm = t.get("team") or t.get("name")
        lg = t.get("league")
        h = honours.get((nm, lg), {})
        clubs.append({
            "name": nm, "league": lg, "metro": t.get("metro"),
            "metro_slug": metro_slugs.get(t.get("metro")),
            "honours": [{
                "comp": COMP_LABEL[c], "titles": len(ys),
                "years": sorted(ys, key=lambda x: season_year(x) or 0),
            } for c, ys in sorted(h.items(), key=lambda kv: -len(kv[1]))],
        })

    rolls = {comp: [r for r in rows if r["winner"]] for comp, rows in rolls.items()}
    roll_out = {comp: sorted(rows, key=lambda r: -(season_year(r["season"]) or 0))
                for comp, rows in rolls.items()}
    for _rows in roll_out.values():
        for _r in _rows:
            _r["winner"] = display_name(_r["winner"], _r.get("season"))
    most = {}
    for comp, rows in rolls.items():
        counts = defaultdict(int)
        wt = {}  # winner short name -> resolved Team List name (for crest lookup)
        for r in rows:
            counts[r["winner"]] += 1
            if r.get("team") and r["winner"] not in wt:
                wt[r["winner"]] = r["team"]
        most[comp] = sorted(
            [{"winner": DISPLAY_ALIASES.get(w, w), "titles": n, "team": wt.get(w)} for w, n in counts.items()],
            key=lambda x: -x["titles"])[:8]

    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(clubs, io.open(os.path.join(OUT_DIR, "clubs.json"), "w", encoding="utf-8"),
              separators=(",", ":"), ensure_ascii=False)
    json.dump({"rolls": roll_out, "most_titled": most, "labels": COMP_LABEL},
              io.open(os.path.join(OUT_DIR, "club-rolls.json"), "w", encoding="utf-8"),
              separators=(",", ":"), ensure_ascii=False)

    print("rolls:", {c: len(r) for c, r in rolls.items()})
    print("clubs with honours:", sum(1 for c in clubs if c["honours"]),
          "of", len(clubs))
    print("\nUNMATCHED winners (left out of club cards; review):")
    for w, occ in sorted(unmatched.items(), key=lambda kv: -len(kv[1])):
        print(f"  {w}  x{len(occ)}  ({occ[0]}{'...' if len(occ) > 1 else ''})")


if __name__ == "__main__":
    main()
