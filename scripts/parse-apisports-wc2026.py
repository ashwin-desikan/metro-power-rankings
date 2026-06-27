#!/usr/bin/env python3
"""
Parse an API-Football (api-sports.io) /fixtures response into our results file.

The agent/CI fetches one call:
  GET https://v3.football.api-sports.io/fixtures?league=1&season=2026
  header: x-apisports-key: <key>
That single response holds all 104 World Cup matches, so this REBUILDS
public/data/international/wc2026-results.json from scratch each run (no merge,
no duplicates), keeping only finished matches.

Round labels come straight from league.round ("Group Stage - 1", "Round of 32",
"Quarter-finals", ...). Team names are mapped to our slugs with the same
normalizer + overrides as the ESPN parser. Exits non-zero on an API error
payload so the CI can fall back to ESPN.

Usage: python3 scripts/parse-apisports-wc2026.py /tmp/apisports.json
"""
import sys, os, json, re, unicodedata, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INTL = os.path.join(ROOT, "public", "data", "international")
OUT = os.path.join(INTL, "wc2026-results.json")

FINISHED = {"FT", "AET", "PEN", "AWD", "WO"}

OVERRIDES = {
    "czechia": "czech-republic",
    "turkiye": "turkey",
    "ivorycoast": "cote-d-ivoire",
    "drcongo": "congo-dr",
    "congodr": "congo-dr",
    "usa": "united-states",
    "unitedstatesofamerica": "united-states",
    "iriran": "iran",
    "caboverde": "cape-verde",
    "capeverdeislands": "cape-verde",
    "korearepublic": "south-korea",
    "republicofkorea": "south-korea",
}


def norm(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "", s.lower())


def build_name_map():
    wc = json.load(open(os.path.join(INTL, "wc2026.json")))
    m = {}
    for g in wc["group_stage"].values():
        for t in g:
            if t.get("slug"):
                m[norm(t["cur_name"])] = t["slug"]
    m.update(OVERRIDES)
    return m


def classify_round(r):
    s = (r or "").lower()
    if s.startswith("group"):
        return "Group"
    if "round of 32" in s:
        return "Round of 32"
    if "round of 16" in s:
        return "Round of 16"
    if "quarter" in s:
        return "Quarterfinals"
    if "semi" in s:
        return "Semifinals"
    if "3rd place" in s or "third" in s:
        return "Third Place Game"
    if s == "final" or s.endswith("final"):
        return "Final"
    return None


def main():
    if len(sys.argv) < 2:
        print("usage: parse-apisports-wc2026.py <fixtures.json>")
        sys.exit(2)
    doc = json.load(open(sys.argv[1]))

    errs = doc.get("errors")
    if errs:  # non-empty dict or list means the API rejected the call
        print("api-sports returned errors:", json.dumps(errs)[:300])
        sys.exit(2)
    if "response" not in doc:
        print("api-sports payload missing 'response'")
        sys.exit(2)

    name_map = build_name_map()
    events, warnings = {}, []
    for fx in doc["response"]:
        status = ((fx.get("fixture") or {}).get("status") or {}).get("short")
        if status not in FINISHED:
            continue
        rnd = classify_round((fx.get("league") or {}).get("round"))
        if rnd is None:
            warnings.append(f"unclassified round '{(fx.get('league') or {}).get('round')}'")
            continue
        teams = fx.get("teams") or {}
        goals = fx.get("goals") or {}
        home, away = teams.get("home") or {}, teams.get("away") or {}
        a_slug = name_map.get(norm(home.get("name")))
        b_slug = name_map.get(norm(away.get("name")))
        if not a_slug:
            warnings.append(f"UNMAPPED api-sports name '{home.get('name')}'")
        if not b_slug:
            warnings.append(f"UNMAPPED api-sports name '{away.get('name')}'")
        if not a_slug or not b_slug:
            continue
        if goals.get("home") is None or goals.get("away") is None:
            continue
        winner = None
        if rnd != "Group":
            if home.get("winner"):
                winner = a_slug
            elif away.get("winner"):
                winner = b_slug
        fid = (fx.get("fixture") or {}).get("id")
        events[f"apisports-{fid}"] = {
            "round": rnd,
            "a_slug": a_slug, "a_score": int(goals["home"]),
            "b_slug": b_slug, "b_score": int(goals["away"]),
            "winner_slug": winner,
            "completed": True,
        }

    out = {
        "source": "API-Football (api-sports.io) league=1 season=2026",
        "as_of": datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        "events": events,
    }
    json.dump(out, open(OUT, "w"), indent=1)
    grp = sum(1 for e in events.values() if e["round"] == "Group")
    print(f"wrote {OUT}: {len(events)} finished matches ({grp} group, {len(events) - grp} knockout)")
    for w in sorted(set(warnings)):
        print("  WARN:", w)


if __name__ == "__main__":
    main()
