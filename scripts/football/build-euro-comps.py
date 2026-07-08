#!/usr/bin/env python3
"""Fetch UEFA Champions/Europa/Conference League fixtures from API-Football
(api-sports.io) and write public/data/football/euro-comps.json for the club-
competition hub pages. Job-only (needs APISPORTS_KEY); mirrors the WC2026 setup
(scripts/parse-apisports-wc2026.py). Run daily via a scheduled job; commit the
JSON [vercel skip]. The rendered phase (qualifying now, league phase from Sep,
knockouts in 2027) follows naturally from whichever fixtures are current.

    APISPORTS_KEY=... python3 scripts/football/build-euro-comps.py
Env: APISPORTS_KEY (required), EURO_SEASON (optional; default current UEFA season).
"""
import os, sys, json, datetime, urllib.request, urllib.parse, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "public", "data", "football", "euro-comps.json")
API = "https://v3.football.api-sports.io/fixtures"
KEY = os.environ.get("APISPORTS_KEY", "").strip()
# API-Football league ids; season = starting year of the UEFA campaign.
COMPS = [("champions-league", 2, "Champions League"),
         ("europa-league", 3, "Europa League"),
         ("conference-league", 848, "Conference League")]
_now = datetime.datetime.now(datetime.timezone.utc)
SEASON = int(os.environ.get("EURO_SEASON") or (_now.year if _now.month >= 6 else _now.year - 1))

LIVE = {"1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT"}
DONE = {"FT", "AET", "PEN"}

def _get(league):
    q = urllib.parse.urlencode({"league": league, "season": SEASON})
    req = urllib.request.Request(f"{API}?{q}", headers={"x-apisports-key": KEY})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

def phase_of(rnd):
    s = (rnd or "").lower()
    if "qualif" in s or "preliminary" in s or "play-off" in s and "knockout" not in s:
        return "qualifying"
    if "league stage" in s or "group" in s:
        return "league"
    return "knockout"

def match(fx):
    fixture = fx.get("fixture") or {}
    st = ((fixture.get("status") or {}).get("short")) or ""
    status = "live" if st in LIVE else "recent" if st in DONE else "upcoming"
    league = fx.get("league") or {}
    teams = fx.get("teams") or {}
    goals = fx.get("goals") or {}
    home, away = teams.get("home") or {}, teams.get("away") or {}
    gh, ga = goals.get("home"), goals.get("away")
    return {
        "date": fixture.get("date") or "", "round": league.get("round") or "",
        "phase": phase_of(league.get("round")),
        "home": home.get("name") or "", "away": away.get("name") or "",
        "homeGoals": gh if status != "upcoming" else None,
        "awayGoals": ga if status != "upcoming" else None,
        "status": status, "statusShort": st,
    }

def parse_doc(doc):
    live, upcoming, recent = [], [], []
    for fx in (doc.get("response") or []):
        m = match(fx)
        if not m["home"] or not m["away"]:
            continue
        (live if m["status"] == "live" else recent if m["status"] == "recent" else upcoming).append(m)
    upcoming.sort(key=lambda m: m["date"])
    recent.sort(key=lambda m: m["date"], reverse=True)
    horizon = (_now + datetime.timedelta(days=21)).isoformat()
    floor = (_now - datetime.timedelta(days=10)).isoformat()
    return {"live": live,
            "upcoming": [m for m in upcoming if m["date"] <= horizon][:20],
            "recent": [m for m in recent if m["date"] >= floor][:12]}

def main():
    if not KEY:
        sys.exit("APISPORTS_KEY not set; refusing to fetch.")
    comps = {}
    for slug, league_id, label in COMPS:
        doc = _get(league_id)
        errs = doc.get("errors")
        if errs:
            sys.exit(f"api-sports errors for {slug}: {json.dumps(errs)[:200]}")
        comps[slug] = {"label": label, "season": SEASON, **parse_doc(doc)}
    out = {"generated": _now.strftime("%Y-%m-%d"), "season": SEASON, "comps": comps}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    tot = sum(len(c["live"]) + len(c["upcoming"]) + len(c["recent"]) for c in comps.values())
    print(f"euro-comps.json: season {SEASON}, {tot} fixtures across {len(comps)} competitions")

if __name__ == "__main__":
    main()
