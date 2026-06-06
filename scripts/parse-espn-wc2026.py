#!/usr/bin/env python3
"""
Parse raw ESPN fifa.world scoreboard JSON into our results file.

ESPN cannot be fetched from this script (web access is via the agent's
web_fetch tool only). The flow is:
  1. Agent saves one or more raw ESPN scoreboard payloads to disk, e.g.
       https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260627
     saved as scripts/.cache/espn-YYYYMMDD.json
  2. This script reads those raw files, extracts COMPLETED matches, maps
     ESPN team names to our slugs, classifies the round by match date, and
     merges everything (keyed by ESPN event id) into:
       public/data/international/wc2026-results.json
  3. build-wc2026-simulation.py reads that file and conditions on it.

Usage:
  python3 scripts/parse-espn-wc2026.py scripts/.cache/espn-*.json
"""
import sys, os, glob, json, re, unicodedata, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INTL = os.path.join(ROOT, "public", "data", "international")
OUT = os.path.join(INTL, "wc2026-results.json")

# Round windows (UTC dates) from the ESPN league calendar for 2026.
ROUND_WINDOWS = [
    ("Group", "2026-06-11", "2026-06-27"),
    ("Round of 32", "2026-06-28", "2026-07-03"),
    ("Round of 16", "2026-07-04", "2026-07-07"),
    ("Quarterfinals", "2026-07-09", "2026-07-11"),
    ("Semifinals", "2026-07-14", "2026-07-15"),
    ("Third Place Game", "2026-07-18", "2026-07-18"),
    ("Final", "2026-07-19", "2026-07-19"),
]

# ESPN spellings that do not normalize to our cur_name. Keyed by normalized
# ESPN name -> our slug.
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
    return m, {t["slug"] for g in wc["group_stage"].values() for t in g if t.get("slug")}


def classify_round(date_iso):
    d = date_iso[:10]
    for name, lo, hi in ROUND_WINDOWS:
        if lo <= d <= hi:
            return name
    return None


def main():
    inputs = []
    for arg in sys.argv[1:]:
        inputs.extend(sorted(glob.glob(arg)))
    name_map, valid_slugs = build_name_map()

    existing = {"events": {}}
    if os.path.exists(OUT):
        try:
            existing = json.load(open(OUT))
        except Exception:
            pass
    events = existing.get("events", {})

    warnings = []
    added = 0
    for path in inputs:
        try:
            doc = json.load(open(path))
        except Exception as e:
            warnings.append(f"could not read {path}: {e}")
            continue
        for ev in doc.get("events", []):
            comp = (ev.get("competitions") or [{}])[0]
            status = (comp.get("status") or {}).get("type") or {}
            if not status.get("completed"):
                continue
            date_iso = ev.get("date") or comp.get("date") or ""
            rnd = classify_round(date_iso)
            if rnd is None:
                warnings.append(f"event {ev.get('id')} date {date_iso} outside round windows")
                continue
            comps = comp.get("competitors") or []
            if len(comps) != 2:
                continue
            parsed = {}
            for c in comps:
                nm = (c.get("team") or {}).get("displayName") or (c.get("team") or {}).get("name") or ""
                slug = name_map.get(norm(nm))
                if not slug:
                    warnings.append(f"UNMAPPED ESPN name '{nm}' (event {ev.get('id')})")
                try:
                    score = int(c.get("score"))
                except (TypeError, ValueError):
                    score = None
                parsed[c.get("homeAway", "?")] = {
                    "slug": slug, "score": score, "winner": bool(c.get("winner")),
                }
            home, away = parsed.get("home"), parsed.get("away")
            if not home or not away or not home["slug"] or not away["slug"]:
                continue
            if home["score"] is None or away["score"] is None:
                continue
            winner = None
            if rnd != "Group":
                if home["winner"]:
                    winner = home["slug"]
                elif away["winner"]:
                    winner = away["slug"]
                elif home["score"] != away["score"]:
                    winner = home["slug"] if home["score"] > away["score"] else away["slug"]
            events[str(ev.get("id"))] = {
                "round": rnd,
                "a_slug": home["slug"], "a_score": home["score"],
                "b_slug": away["slug"], "b_score": away["score"],
                "winner_slug": winner,
                "completed": True,
            }
            added += 1

    out = {
        "source": "ESPN fifa.world scoreboard",
        "as_of": datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        "events": events,
    }
    json.dump(out, open(OUT, "w"), indent=1)
    grp = sum(1 for e in events.values() if e["round"] == "Group")
    ko = len(events) - grp
    print(f"wrote {OUT}: {len(events)} completed matches ({grp} group, {ko} knockout); {added} processed this run")
    for w in warnings:
        print("  WARN:", w)


if __name__ == "__main__":
    main()
