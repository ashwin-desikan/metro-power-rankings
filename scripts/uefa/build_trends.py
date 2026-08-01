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
# Merge defunct UEFA nations into their modern successor for the cross-season country race, so the
# line runs continuously (Russia carries the Soviet years, Serbia the Yugoslav years, Czech Republic
# the Czechoslovak years). The per-hub country table keeps the historical label; only the race merges.
SUCCESSOR = {"Soviet Union": "Russia", "Yugoslavia": "Serbia", "Czechoslovakia": "Czech Republic"}

hubs = sorted(glob.glob(os.path.join(DD, "hub-*.json")))
seasons, countries, clubs = [], {}, {}
for p in hubs:
    h = json.load(open(p, encoding="utf-8"))
    lab = h["season"]; seasons.append(lab)
    for c in h.get("countries", []):
        cname = SUCCESSOR.get(c["country"], c["country"])
        prev = countries.setdefault(cname, {}).get(lab)
        # On a transition season both the old and new name can appear; keep the better (lower) rank.
        if prev is None or c["rank"] < prev["rank"]:
            countries[cname][lab] = {"rank": c["rank"], "coef": round(float(c["coef"]), 2)}
    for c in h.get("clubs", []):
        # Key the cross-season aggregation on the RESOLVED SLUG (the club-page identity), not the
        # display name — clubs[].name is now the season name (e.g. "Wimbledon" pre-2004) and keying on
        # it would split a renamed club into two timelines. Slug is stable across name changes AND the
        # 2012-13/2013-14 generator boundary; fall back to lookup/name only when a club is unresolved.
        # The display label is refreshed each hub so the most recent season's name wins (hubs globbed
        # chronologically), giving aggregate surfaces the club's current name.
        sl = resolve_slug(c["name"], c.get("lookup"))
        key = sl or c.get("lookup") or c["name"]
        d = clubs.setdefault(key, {"name": c["name"], "country": c.get("country"), "lookup": c.get("lookup"), "slug": sl, "pts": {}})
        d["name"] = c["name"]
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
for key, d in clubs.items():
    best = min((v["rank"] for v in d["pts"].values()), default=99)
    if best <= 20:
        club_out.append({"name": d["name"], "country": d["country"], "lookup": d.get("lookup"), "best": best,
                         "series": [dict(season=lab, **d["pts"][lab]) for lab in seasons if lab in d["pts"]]})
club_out.sort(key=lambda x: x["best"])
json.dump({"seasons": seasons, "countrySeasons": country_seasons, "countries": country_out, "clubs": club_out},
          open(os.path.join(DD, "football-trends.json"), "w", encoding="utf-8"), ensure_ascii=False)

# ---- per-club rank/score history, keyed by club-page slug ----
hist = {}
unresolved = 0
for key, d in clubs.items():
    slug = d.get("slug")
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
