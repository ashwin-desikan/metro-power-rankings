#!/usr/bin/env python3
"""build_trends.py — cross-season trends + per-club history for the football hubs.

Reads every public/data/football/hub-*.json (completed seasons) plus
country-coeff-2026-27.json (live) and emits two datasets, both auto-scaling
(drop in a new hub-YYYY-YY.json, re-run, and the new point appears everywhere):
  - public/data/football/football-trends.json : country + top-club series for /teams/football/seasons
  - public/data/football/club-history.json     : every club's rank+score per season, keyed by the
    club-page slug (resolved via slug-lookup.json), read on each club page for its history chart.
"""
import json, glob, os, re
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
DD = os.path.join(ROOT, "public", "data", "football")
def yr(lab): return int(lab[:4])
SLUG = json.load(open(os.path.join(DD, "slug-lookup.json"), encoding="utf-8")) if os.path.exists(os.path.join(DD, "slug-lookup.json")) else {}
def ntn(s): return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()   # mirrors lib/football normalizeTeamName
def resolve_slug(name, lookup): return SLUG.get(ntn(lookup)) or SLUG.get(ntn(name))

hubs = sorted(glob.glob(os.path.join(DD, "hub-*.json")))
seasons, countries, clubs = [], {}, {}
for p in hubs:
    h = json.load(open(p, encoding="utf-8"))
    lab = h["season"]; seasons.append(lab)
    for c in h.get("countries", []):
        countries.setdefault(c["country"], {})[lab] = {"rank": c["rank"], "coef": round(float(c["coef"]), 2)}
    for c in h.get("clubs", []):
        d = clubs.setdefault(c["name"], {"name": c["name"], "country": c.get("country"), "lookup": c.get("lookup"), "pts": {}})
        d["pts"][lab] = {"rank": c["rank"], "score": round(c["score"], 3), "form": round(c["form"], 3), "ped": round(c["ped"], 3), "tb": round(c.get("tb", 0), 3)}
seasons = sorted(set(seasons), key=yr)
live = "2026-27"
cc = os.path.join(DD, "country-coeff-2026-27.json")
if os.path.exists(cc):
    for c in json.load(open(cc, encoding="utf-8")).get("countries", []):
        countries.setdefault(c["country"], {})[live] = {"rank": c["rank"], "coef": round(float(c["coef"]), 2)}
country_seasons = sorted(set(seasons + [live]), key=yr)
def topN(lab, n): return sorted([c for c, sv in countries.items() if lab in sv], key=lambda c: countries[c][lab]["rank"])[:n]
keep = set()
for lab in country_seasons: keep |= set(topN(lab, 6))
country_out = []
for c in keep:
    ser = [dict(season=lab, **countries[c][lab]) for lab in country_seasons if lab in countries[c]]
    country_out.append({"country": c, "series": ser, "latestRank": countries[c].get(country_seasons[-1], {}).get("rank", 99)})
country_out.sort(key=lambda x: x["latestRank"])
club_out = []
for name, d in clubs.items():
    best = min((v["rank"] for v in d["pts"].values()), default=99)
    if best <= 20:
        club_out.append({"name": name, "country": d["country"], "lookup": d.get("lookup"), "best": best,
                         "series": [dict(season=lab, **d["pts"][lab]) for lab in seasons if lab in d["pts"]]})
club_out.sort(key=lambda x: x["best"])
json.dump({"seasons": seasons, "countrySeasons": country_seasons, "countries": country_out, "clubs": club_out},
          open(os.path.join(DD, "football-trends.json"), "w", encoding="utf-8"), ensure_ascii=False)

# ---- per-club rank/score history, keyed by club-page slug ----
hist = {}
unresolved = 0
for name, d in clubs.items():
    slug = resolve_slug(d["name"], d.get("lookup"))
    if not slug:
        unresolved += 1; continue
    h = hist.setdefault(slug, {})
    for lab, v in d["pts"].items():
        if lab not in h or v["rank"] < h[lab]["rank"]:
            h[lab] = {"season": lab, "rank": v["rank"], "score": v["score"]}
club_history = {slug: sorted(v.values(), key=lambda x: yr(x["season"])) for slug, v in hist.items()}
json.dump(club_history, open(os.path.join(DD, "club-history.json"), "w", encoding="utf-8"), ensure_ascii=False)
print("seasons:", seasons)
print("countries kept:", len(country_out), "| top clubs:", len(club_out))
print("club-history: slugs", len(club_history), "| unresolved club-names", unresolved,
      "| KB", round(os.path.getsize(os.path.join(DD, "club-history.json")) / 1024, 1))
for s in ("real-madrid", "girondins-bordeaux", "bordeaux", "leicester-city", "ajax"):
    if s in club_history: print(f"  {s}: {[(x['season'], x['rank'], x['score']) for x in club_history[s]]}")
