#!/usr/bin/env python3
"""build_trends.py — cross-season trends dataset for /teams/football/seasons.

Reads every public/data/football/hub-*.json (completed seasons) plus
country-coeff-2026-27.json (the live season's country coefficients) and emits a
compact public/data/football/football-trends.json for the SeasonTrends charts:
country coefficient series, club rank/score/form/pedigree/trophy series, per season.
Auto-scales: drop in a new hub-YYYY-YY.json, re-run, and the new point appears.
"""
import json, glob, os
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
DD = os.path.join(ROOT, "public", "data", "football")
def yr(lab): return int(lab[:4])
hubs = sorted(glob.glob(os.path.join(DD, "hub-*.json")), key=lambda p: p)
seasons = []
countries = {}   # country -> {season -> {rank, coef}}
clubs = {}       # name -> {name, country, lookup, pts:{season->{...}}}
for p in hubs:
    h = json.load(open(p, encoding="utf-8"))
    lab = h["season"]; seasons.append(lab)
    for c in h.get("countries", []):
        countries.setdefault(c["country"], {})[lab] = {"rank": c["rank"], "coef": round(float(c["coef"]), 2)}
    for c in h.get("clubs", []):
        d = clubs.setdefault(c["name"], {"name": c["name"], "country": c.get("country"), "lookup": c.get("lookup"), "pts": {}})
        d["pts"][lab] = {"rank": c["rank"], "score": round(c["score"], 3), "form": round(c["form"], 3),
                         "ped": round(c["ped"], 3), "tb": round(c.get("tb", 0), 3)}
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
    last = country_seasons[-1]
    country_out.append({"country": c, "series": ser, "latestRank": countries[c].get(last, {}).get("rank", 99)})
country_out.sort(key=lambda x: x["latestRank"])
club_out = []
for name, d in clubs.items():
    best = min((v["rank"] for v in d["pts"].values()), default=99)
    if best <= 20:
        ser = [dict(season=lab, **d["pts"][lab]) for lab in seasons if lab in d["pts"]]
        club_out.append({"name": name, "country": d["country"], "lookup": d.get("lookup"), "best": best, "series": ser})
club_out.sort(key=lambda x: x["best"])
out = {"seasons": seasons, "countrySeasons": country_seasons, "countries": country_out, "clubs": club_out}
json.dump(out, open(os.path.join(DD, "football-trends.json"), "w", encoding="utf-8"), ensure_ascii=False)
print("seasons:", seasons)
print("country seasons:", country_seasons)
print("countries kept:", len(country_out), "->", [c["country"] for c in country_out])
print("clubs kept:", len(club_out))
print("size KB:", round(os.path.getsize(os.path.join(DD, "football-trends.json")) / 1024, 1))
