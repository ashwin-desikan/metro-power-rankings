#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build the club football "greatest games" data from Supabase
(football_gamescore joined to football_matches) and write
public/data/football/top-club-games.json (hub boards: all-time, Europe,
league, by decade) plus top-club-games-by-team.json (top 10 per club slug,
for club pages).

The Game Score itself is computed by the WP3 scorer and lives in
football_gamescore (gs, closeness, stakes, quality, upset, floored, base);
this script only shapes it for the site. Scoring universe per the 2026-08-31
rulings: top-flight league matches (Exclude respected) plus every UEFA
competition match (Exclude ignored). A floored row carries the curated floor
in gs and the model's own number in base, and the page shows both.

Native run on the box (needs .env.local SUPABASE_SERVICE_KEY):
    python scripts/football/build_club_top_games.py
"""
import json, os, re, sys, time, datetime, urllib.request
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "data" / "football"
BASE = "https://nmprqkmymrdknffwnuur.supabase.co/rest/v1"
ALL_N, CLASS_N, DECADE_N, TEAM_N = 50, 50, 10, 10

def service_key():
    for line in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines():
        if line.startswith("SUPABASE_SERVICE_KEY="):
            return line.strip().split("=", 1)[1]
    sys.exit("SUPABASE_SERVICE_KEY not found in .env.local")

KEY = service_key()
HEAD = {"apikey": KEY, "Authorization": "Bearer " + KEY}

def fetch(path, page=1000):
    rows, off = [], 0
    while True:
        req = urllib.request.Request(BASE + path + "&limit=%d&offset=%d" % (page, off), headers=HEAD)
        for attempt in range(4):
            try:
                with urllib.request.urlopen(req, timeout=120) as r:
                    batch = json.loads(r.read().decode("utf-8"))
                break
            except Exception:
                if attempt == 3:
                    raise
                time.sleep(3 * (attempt + 1))
        rows += batch
        if len(batch) < page:
            return rows
        off += page

def ntn(s):
    # mirrors lib/football normalizeTeamName / scripts/uefa/build_trends.py
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()

# UEFA lineages: badge + display name. Everything else in the universe is league.
EURO = {
    "eur|european-cup": ("EC", "European Cup"),
    "eur|champions-league": ("CL", "Champions League"),
    "eur|uefa-cup": ("UC", "UEFA Cup"),
    "eur|europa-league": ("EL", "Europa League"),
    "eur|cup-winners-cup": ("CWC", "Cup Winners' Cup"),
    "eur|inter-cities-fairs-cup": ("FCUP", "Fairs Cup"),
    "eur|europa-conference-league": ("ECL", "Conference League"),
}

# WP5 (ruled 2026-08-31): the ten major domestic cups score and get their own
# class on the boards. Badge CUP for all of them; the comp name disambiguates.
DOMESTIC_CUPS = {
    "england|fa-cup": "FA Cup",
    "england|league-cup": "League Cup",
    "spain|copa-del-rey": "Copa del Rey",
    "italy|coppa-italia": "Coppa Italia",
    "germany|dfb-pokal": "DFB-Pokal",
    "france|coupe-de-france": "Coupe de France",
    "scotland|scottish-cup": "Scottish Cup",
    "scotland|scottish-league-cup": "Scottish League Cup",
    "netherlands|knvb-beker": "KNVB Beker",
    "portugal|taca-de-portugal": "Taça de Portugal",
}

def league_label(comp_key):
    tail = comp_key.split("|", 1)[-1]
    return " ".join(w.capitalize() if len(w) > 2 else w.upper() for w in tail.split("-"))

def main():
    resolver = {}
    sl = json.loads((OUT / "slug-lookup.json").read_text(encoding="utf-8"))
    for k, v in sl.items():
        resolver[k] = v
    def slug(name):
        return resolver.get(ntn(name))

    # Rivalry names for row context (ruled 2026-08-31): pair -> rivalry name,
    # from the curated rivalries file. Display-only here; the rivalry stakes
    # floor lives in the scorer.
    riv = {}
    rv = json.loads((ROOT / "public" / "data" / "rivalries.json").read_text(encoding="utf-8"))
    for r in rv.get("all", []):
        if r.get("sport") == "Football":
            pk = frozenset((r["team"]["name"], r["rival"]["name"]))
            if len(pk) == 2:
                riv[pk] = r["rivalry"]

    print("fetching gamescore...", flush=True)
    G = fetch("/football_gamescore?select=match_id,gs,base,closeness,stakes,quality,upset,floored&order=match_id")
    print("fetching matches...", flush=True)
    M = fetch("/football_matches?select=id,match_date,season,comp_key,home_cur_name,away_cur_name,"
              "home_name_played,away_name_played,hg,ag,round,leg,pens,neutral,is_european&order=id")
    MI = {m["id"]: m for m in M}
    print("gamescore rows: %d | matches: %d" % (len(G), len(M)), flush=True)

    # leg-1 lookup so second legs can carry the aggregate score
    leg1 = {}
    for m in M:
        if (m["comp_key"] in EURO or m["comp_key"] in DOMESTIC_CUPS) and m.get("leg") == 1:
            leg1[(m["comp_key"], m["season"], m.get("round"),
                  frozenset((m["home_cur_name"], m["away_cur_name"])))] = m

    def agg_for(m):
        if (m["comp_key"] not in EURO and m["comp_key"] not in DOMESTIC_CUPS) or m.get("leg") != 2:
            return None
        l1 = leg1.get((m["comp_key"], m["season"], m.get("round"),
                       frozenset((m["home_cur_name"], m["away_cur_name"]))))
        if not l1:
            return None
        if l1["home_cur_name"] == m["home_cur_name"]:
            h1, a1 = l1["hg"], l1["ag"]
        else:
            h1, a1 = l1["ag"], l1["hg"]
        return "%d-%d" % (m["hg"] + h1, m["ag"] + a1)

    # Editorial omissions from the boards. Currently empty: the 2026-08-31
    # ruling is that matches played to a finish stay on the boards whatever
    # surrounded them (Heysel 1985 included). The mechanism stays for any
    # future ruling.
    OMIT = set()

    rows = []
    for g in G:
        m = MI.get(g["match_id"])
        if m is None:
            continue
        if (m["match_date"], m["home_cur_name"], m["away_cur_name"]) in OMIT:
            continue
        ck = m["comp_key"]
        euro = ck in EURO
        cup = ck in DOMESTIC_CUPS
        if euro:
            badge, comp = EURO[ck]
        elif cup:
            badge, comp = "CUP", DOMESTIC_CUPS[ck]
        else:
            badge, comp = "LG", league_label(ck)
        rows.append({
            "date": m["match_date"],
            "comp": comp,
            "cls": badge,
            "round": (m.get("round") or None) if (euro or cup) else None,
            # Display the ERA name (as played that season); canon carries the
            # canonical identity for crests, and the slug links the club page.
            "home": m.get("home_name_played") or m["home_cur_name"],
            "homeCanon": m["home_cur_name"], "homeSlug": slug(m["home_cur_name"]),
            "away": m.get("away_name_played") or m["away_cur_name"],
            "awayCanon": m["away_cur_name"], "awaySlug": slug(m["away_cur_name"]),
            "hg": m["hg"], "ag": m["ag"], "pens": m.get("pens") or None,
            "rivalry": riv.get(frozenset((m["home_cur_name"], m["away_cur_name"]))),
            "leg": m.get("leg") if (euro or cup) else None,
            "agg": agg_for(m),
            "neutral": bool(m.get("neutral")),
            "gs": float(g["gs"]), "base": float(g["base"]) if g.get("base") is not None else float(g["gs"]),
            "floored": bool(g["floored"]),
            "cl": float(g["closeness"]), "st": float(g["stakes"]),
            "q": float(g["quality"]), "u": float(g["upset"]),
        })
    rows.sort(key=lambda r: (-r["gs"], r["date"]))

    top = rows[:ALL_N]
    europe = [r for r in rows if r["cls"] not in ("LG", "CUP")][:CLASS_N]
    league = [r for r in rows if r["cls"] == "LG"][:CLASS_N]
    cups = [r for r in rows if r["cls"] == "CUP"][:CLASS_N]
    # Per-decade boards, per class, so the decade filter works on every view.
    by_decade = {}
    for r in rows:
        d = r["date"][:3] + "0"
        dd = by_decade.setdefault(d, {"all": [], "europe": [], "league": [], "cups": []})
        if len(dd["all"]) < DECADE_N:
            dd["all"].append(r)
        cls_key = "league" if r["cls"] == "LG" else ("cups" if r["cls"] == "CUP" else "europe")
        if len(dd[cls_key]) < DECADE_N:
            dd[cls_key].append(r)

    by_team = defaultdict(list)
    for r in rows:
        for s in (r["homeSlug"], r["awaySlug"]):
            if s and len(by_team[s]) < TEAM_N:
                by_team[s].append(r)

    hub = {
        "generated": datetime.date.today().isoformat(),
        "method": "GS = 100*(0.34*closeness + 0.34*stakes + 0.22*quality + 0.10*upset)*(0.80+0.20*closeness) "
                  "over the unified club Elo. Universe: top-flight league + UEFA competitions + ten major "
                  "domestic cups, 1871-present. "
                  "Curated floor for all-time classics; floored rows carry the model's own score in base.",
        "count": len(rows),
        "top": top, "europe": europe, "league": league, "cups": cups,
        "by_decade": {k: by_decade[k] for k in sorted(by_decade)},
    }
    (OUT / "top-club-games.json").write_text(json.dumps(hub, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (OUT / "top-club-games-by-team.json").write_text(
        json.dumps(dict(by_team), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    unmapped = sorted({r[k] for r in rows[:2000] for k, sk in (("home", "homeSlug"), ("away", "awaySlug")) if not r[sk]})
    print("wrote top-club-games.json (%d rows scored) + by-team (%d clubs)" % (len(rows), len(by_team)), flush=True)
    print("unmapped names in the top 2000:", unmapped[:20], flush=True)
    for r in top[:10]:
        print("%.1f%s %s %s %d-%d %s [%s/%s]" % (r["gs"], "*" if r["floored"] else "", r["date"],
              r["home"], r["hg"], r["ag"], r["away"], r["cls"], r["round"] or "lg"), flush=True)

if __name__ == "__main__":
    main()
