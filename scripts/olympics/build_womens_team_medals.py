#!/usr/bin/env python3
"""Extract WOMEN'S team-sport Olympic medals (by nation/year/season/sport) so the
Zone Zero Cup can split women's team sports out of the gender-mixed
medals-breakdown.json into their own pillars, WITHOUT modifying that shared file
(the Olympics hub/edition pages keep using it unchanged). Same lineage fold and
slug mapping as build_olympics_breakdown.py so the men's = mixed - women's
subtraction in the engine is exact. Emits public/data/olympics/womens-team-medals.json.
"""
import json, os, sys
from collections import defaultdict
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from parse_medals import parse_file

LINEAGE = {"URS":"RUS","EUN":"RUS","ROC":"RUS","YUG":"SRB","SCG":"SRB",
           "TCH":"CZE","BOH":"CZE","FRG":"GER","UAR":"EGY"}
MED = {"Gold":0,"Silver":1,"Bronze":2}
TEAM_SPORTS = {"Basketball","3x3 Basketball","Volleyball","Beach Volleyball",
               "Handball","Field Handball","Hockey","Water Polo"}

def norm_season(r):
    if r["year"] == 1906: return "Intercalated"
    if r["city"] == "Stockholm" and r["year"] == 1956: return "Summer"
    return r["season"]

def main():
    data_dir = os.path.normpath(os.path.join(HERE, "..", "..", "public", "data", "olympics"))
    teams = json.load(open(os.path.join(data_dir, "teams.json")))
    code2slug = {t["code"]: t["slug"] for t in teams}
    sr,_ = parse_file(os.path.join(HERE, "sources", "summeroly.txt"), "Summer")
    wr,_ = parse_file(os.path.join(HERE, "sources", "winter_intercalated.txt"), "Winter")
    agg = defaultdict(lambda: [0,0,0])
    for r in sr + wr:
        if r["sport"] not in TEAM_SPORTS: continue
        if "women" not in (r.get("event") or "").lower(): continue
        r["season"] = norm_season(r)
        ent = LINEAGE.get(r["noc"], r["noc"]); slug = code2slug.get(ent)
        if not slug: continue
        seas = 1 if r["season"] == "Winter" else 0
        agg[(slug, r["year"], seas, r["sport"])][MED[r["medal"]]] += 1
    slugs = sorted(set(k[0] for k in agg)); sports = sorted(set(k[3] for k in agg))
    si = {s:i for i,s in enumerate(slugs)}; spi = {s:i for i,s in enumerate(sports)}
    out_rows = [[si[k[0]], k[1], k[2], spi[k[3]], v[0], v[1], v[2]] for k,v in agg.items()]
    out = os.path.join(data_dir, "womens-team-medals.json")
    json.dump({"slugs": slugs, "sports": sports, "rows": out_rows},
              open(out, "w"), ensure_ascii=False, separators=(",",":"))
    print("wrote %s (%d rows, %d nations, sports=%s)" % (out, len(out_rows), len(slugs), sports))
    # sanity: USA women's basketball golds
    usa_bball_g = sum(v[0] for (s,y,se,sp),v in agg.items() if s=="united-states" and sp=="Basketball")
    print("USA women's basketball golds:", usa_bball_g)
    # top women's basketball gold nations
    g=defaultdict(int)
    for (s,y,se,sp),v in agg.items():
        if sp=="Basketball": g[s]+=v[0]
    print("top women's basketball golds:", sorted(g.items(),key=lambda x:-x[1])[:5])

if __name__ == "__main__":
    main()
