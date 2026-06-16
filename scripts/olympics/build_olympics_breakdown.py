#!/usr/bin/env python3
"""Build public/data/olympics/medals-breakdown.json for the all-time table's
linked Year / Sport filters.

Per-team / year / season / sport medal counts, lineage-folded to the same
entities as teams.json (Soviet Union -> Russia, etc.). Validated to fold back to
the exact teams.json totals. Run:  python scripts/olympics/build_olympics_breakdown.py
"""
import json, os, sys
from collections import defaultdict
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from parse_medals import parse_file

LINEAGE = {"URS":"RUS","EUN":"RUS","ROC":"RUS","YUG":"SRB","SCG":"SRB",
           "TCH":"CZE","BOH":"CZE","FRG":"GER","UAR":"EGY"}
MED = {"Gold":0,"Silver":1,"Bronze":2}

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
    rows = sr + wr
    agg = defaultdict(lambda: [0,0,0])
    for r in rows:
        r["season"] = norm_season(r)
        ent = LINEAGE.get(r["noc"], r["noc"]); slug = code2slug.get(ent)
        if not slug: continue
        seas = 1 if r["season"] == "Winter" else 0
        agg[(slug, r["year"], seas, r["sport"])][MED[r["medal"]]] += 1
    slugs = sorted(set(k[0] for k in agg)); sports = sorted(set(k[3] for k in agg))
    si = {s:i for i,s in enumerate(slugs)}; spi = {s:i for i,s in enumerate(sports)}
    out_rows = [[si[k[0]], k[1], k[2], spi[k[3]], v[0], v[1], v[2]] for k,v in agg.items()]
    out = os.path.join(data_dir, "medals-breakdown.json")
    json.dump({"slugs": slugs, "sports": sports, "rows": out_rows},
              open(out, "w"), ensure_ascii=False, separators=(",",":"))
    # validate fold
    tot = defaultdict(lambda: [0,0,0])
    for (slug,yr,seas,sp),v in agg.items():
        for i in range(3): tot[slug][i] += v[i]
    bad = [t["slug"] for t in teams if [t["g"],t["s"],t["b"]] != tot[t["slug"]]]
    print("wrote %s (%d rows, %d teams, %d sports)" % (out, len(out_rows), len(slugs), len(sports)))
    print("fold mismatches vs teams.json:", len(bad), bad[:10])

if __name__ == "__main__":
    main()
