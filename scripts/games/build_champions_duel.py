#!/usr/bin/env python3
"""
build_champions_duel.py — multi-sport finals data for the Champions Duel game.

Generates public/play/games/pools/champions-duel-data.js (window.DUEL={FINALS})
from real repo data, one entry per final with the winner precomputed:

  ⚽ Champions League / European Cup  — the original 63 finals (Supabase-sourced
     snapshot embedded below; append future finals here)
  🌍 FIFA World Cup finals            — public/data/international/finals.json
  ⭐ Euros finals                     — same source, European Championship
  🏈 Super Bowls                      — public/data/nfl/championship-appearances.json
  🏀 NBA Finals                       — public/data/nba/championship-appearances.json
  ⚾ World Series                     — public/data/mlb/championship-appearances.json
  🏒 Stanley Cup finals               — public/data/nhl/championship-appearances.json

Entry: {end, comp, sport, h, a, hlogo, alogo, w (0/1 winner index), s, p}
Logos: club badges /team-badges/, league logo dirs /data/{lg}/logos/, or
flagcdn images for nations (never flag emoji — Windows). Entries whose logos
can't be resolved keep name-only cards (the game hides broken images).
"""
import json, os, sys

ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", ".."))
def load(rel):
    return json.load(open(os.path.join(ROOT, rel), encoding="utf-8"))

out_entries = []
def add(end, comp, sport, h, a, hlogo, alogo, w, s=None, p=None, note=None):
    out_entries.append({"end": end, "comp": comp, "sport": sport,
                        "h": h, "a": a, "hlogo": hlogo, "alogo": alogo,
                        "w": w, "s": s, "p": p, "note": note})

# ---------------------------------------------------------------- ⚽ CL / European Cup
# Snapshot of the original curated finals (wave-2, Supabase champions_history).
CL = json.load(open("/tmp/cl_finals.json")) if os.path.exists("/tmp/cl_finals.json") else []
CL_FILE = os.path.join(os.path.dirname(__file__), "champions_duel_cl_finals.json")
if os.path.exists(CL_FILE):
    CL = json.load(open(CL_FILE, encoding="utf-8"))
for f in CL:
    hg, ag = map(int, f["s"].split("-"))
    note = None
    if hg != ag:
        w = 0 if hg > ag else 1
    elif f.get("p"):
        ph, pa = map(int, f["p"].split("-"))
        w = 0 if ph > pa else 1
    elif f["end"] == 1974:
        # drawn final, decided by a REPLAY (the only one) — latent crash in the old game
        w = 0
        note = "Bayern Munich won the replay 4–0 two days later!"
    else:
        continue  # cannot determine a winner; skip rather than guess
    comp = "European Cup Final" if f["end"] <= 1992 else "Champions League Final"
    add(f["end"], comp, "⚽", f["h"], f["a"],
        "/team-badges/%s.png" % f["hslug"], "/team-badges/%s.png" % f["aslug"],
        w, f["s"], f.get("p"), note)

# ---------------------------------------------------------------- 🌍 World Cup + ⭐ Euros
cfacts = load("public/data/country-facts.json")["countries"]
ISO_ALIAS = {"england": "gb-eng", "scotland": "gb-sct", "wales": "gb-wls",
             "northern-ireland": "gb-nir", "west-germany": "de",
             "czech-republic": "cz", "united-states": "us", "south-korea": "kr"}
def nation_flag(slug):
    if slug in ISO_ALIAS:
        return "https://flagcdn.com/w160/%s.png" % ISO_ALIAS[slug]
    iso = (cfacts.get(slug) or {}).get("iso3166") or ""
    return "https://flagcdn.com/w160/%s.png" % iso.lower() if len(iso) == 2 else None

intl = load("public/data/international/finals.json")
COMPS = {"World Cup": ("World Cup Final", "🌍"), "European Championship": ("Euros Final", "⭐")}
pairs = {}
for slug, finals in intl.items():
    for e in finals:
        if e.get("competition") not in COMPS:
            continue
        key = (e["competition"], e["year"])
        pairs.setdefault(key, {})[e["result"]] = dict(e, slug=slug)
def nation_name(slug, entry):
    # prefer the display name the opponent record carries
    return entry.get("team_as") or slug.replace("-", " ").title().replace("Of", "of")
for (comp, year), sides in sorted(pairs.items()):
    wside = sides.get("W")
    if not wside:
        continue
    lname = wside["opp_cur_name"]; lslug = wside["opp_slug"]
    wname = nation_name(wside["slug"], wside)
    hg, ag = wside.get("for_goals"), wside.get("against_goals")
    s = "%d-%d" % (hg, ag) if hg is not None and ag is not None else None
    p = None
    if s and hg == ag:
        lside = sides.get("L")
        wp, lp = wside.get("penalty_kicks"), (lside or {}).get("penalty_kicks")
        if wp is not None and lp is not None:
            p = "%d-%d" % (wp, lp)
    label, emoji = COMPS[comp]
    add(year, label, emoji, wname, lname,
        nation_flag(wside["slug"]), nation_flag(lslug), 0, s, p)

# ---------------------------------------------------------------- US leagues
def us_league(lg, era_ok, comp, emoji, name_of, logo_of, won_of, min_year=0):
    apps = load("public/data/%s/championship-appearances.json" % lg)
    by_year = {}
    for team, entries in apps.items():
        for e in entries:
            if not era_ok(e) or e.get("year", 0) < min_year:
                continue
            by_year.setdefault(e["year"], []).append((team, e))
    n = 0
    for year, sides in sorted(by_year.items()):
        if len(sides) != 2:
            continue
        wons = [won_of(e) for _, e in sides]
        if wons.count(True) != 1:
            continue
        wi = wons.index(True)
        (wt, we), (lt, le) = sides[wi], sides[1 - wi]
        add(year, comp, emoji, name_of(wt, we), name_of(lt, le),
            logo_of(wt, we), logo_of(lt, le), 0)
        n += 1
    print("%s: %d finals" % (comp, n))

nfl_fr = {f["canonical"]: f["slug"] for f in load("public/data/nfl/franchises.json")}
def logo_if_exists(path):
    return path if os.path.exists(os.path.join(ROOT, "public", path.lstrip("/"))) else None
us_league("nfl", lambda e: e.get("era") == "sb", "Super Bowl", "🏈",
          lambda t, e: "%s %s" % (e.get("season_city", ""), e.get("season_team", t)),
          lambda t, e: logo_if_exists("/data/nfl/logos/%s.png" % nfl_fr.get(t, "")),
          lambda e: bool(e.get("is_winner")))
us_league("nba", lambda e: e.get("era") == "nba", "NBA Finals", "🏀",
          lambda t, e: "%s %s" % (e.get("city", ""), e.get("team", t)),
          lambda t, e: logo_if_exists("/data/nba/logos/%s.png" % t.lower().replace(" ", "-")),
          lambda e: bool(e.get("won")))
us_league("mlb", lambda e: e.get("era") == "ws", "World Series", "⚾",
          lambda t, e: "%s %s" % (e.get("city", ""), e.get("team", t)),
          lambda t, e: logo_if_exists("/data/mlb/logos/%s.png" % t.lower().replace(" ", "-")),
          lambda e: bool(e.get("won")))
us_league("nhl", lambda e: e.get("era") == "stanley", "Stanley Cup Final", "🏒",
          lambda t, e: "%s %s" % (e.get("city", ""), e.get("team", t)),
          lambda t, e: logo_if_exists("/data/nhl/logos/%s.png" % t),
          lambda e: e.get("result") == "Won", min_year=1927)

# ---------------------------------------------------------------- write
out = os.path.join(ROOT, "public/play/games/pools/champions-duel-data.js")
with open(out, "w", encoding="utf-8") as f:
    f.write("window.DUEL=" + json.dumps({"FINALS": out_entries}, ensure_ascii=False) + ";\n")
from collections import Counter
print("champions-duel-data.js: %d finals %s" % (len(out_entries),
      dict(Counter(e["comp"] for e in out_entries))))
