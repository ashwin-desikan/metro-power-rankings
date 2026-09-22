#!/usr/bin/env python3
"""Turn the combined dry-run file into football_team_reep.json for load_bridge.py.

    python3 scripts/reep/build_bridge_json.py --lookup <Lookup.csv> --combined <dryrun>/reep_club_combined_v0_v1.csv \
        --teams <v1 shaped>/teams_v1full.csv --names <v1 shaped>/names_v1.csv --bridges <v1derived>/bridges_teams.csv \
        --out <dryrun>/football_team_reep.json

One object per Lookup row. `provider_keys` = {provider: [{id, rung}]} for the providers the site can use;
`names` = [{n, norm, src}] over the workbook name columns (Cur. Name only when it is the row's own name or the
row was carried by the Cur. Name lineage rule), the Reep label and the Reep aliases, deduplicated on norm with
workbook columns first.
"""
import argparse, csv, json, sys
from collections import defaultdict
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from reep_join_clubs import strict_norm

KEEP = {"espn", "uefa", "api_football", "clubelo", "fotmob", "sportmonks", "opta", "transfermarkt", "worldfootball", "fifa"}
WB = ["Team", "Lookup", "UEFA Name", "UEFA Name 2", "UEFA Name 3", "EFS Name", "API Name", "API Name 2", "Cur. Name"]

def rd(p):
    with open(p, newline="", encoding="utf-8-sig") as f: return list(csv.DictReader(f))

def main():
    ap = argparse.ArgumentParser()
    for k in ["lookup", "combined", "teams", "names", "bridges", "out"]: ap.add_argument("--" + k, required=True)
    a = ap.parse_args()
    C = rd(a.combined); ids = {r["reep_v1_id"] for r in C if r["reep_v1_id"]}
    L = {str(i): r for i, r in enumerate(rd(a.lookup), start=2)}
    keys = defaultdict(lambda: defaultdict(list))
    for r in rd(a.bridges):
        if r["reep_id"] in ids and r["provider"] in KEEP and r["namespace"] in ("team", "verein", "team_numeric"):
            keys[r["reep_id"]][r["provider"]].append({"id": r["external_id"], "rung": r["rung"] or "unranked"})
    names = defaultdict(dict)
    for r in rd(a.teams):
        if r["reep_id"] in ids: names[r["reep_id"]][strict_norm(r["name"])] = {"n": r["name"], "src": "reep:label"}
    for r in rd(a.names):
        if r["reep_id"] in ids and r["alias"]: names[r["reep_id"]].setdefault(strict_norm(r["alias"]), {"n": r["alias"], "src": "reep:alias"})
    nz = lambda x: x or None
    out = []
    for r in C:
        lk = L[r["sheet_row"]]; rid = r["reep_v1_id"]; nm = {}
        if rid:
            for k in WB:
                v = lk.get(k, "")
                if v and not (k == "Cur. Name" and v != lk["Team"] and r["v1_tier"] != "CURNAME"): nm.setdefault(strict_norm(v), {"n": v, "src": "workbook:" + k})
            for norm, d in names[rid].items(): nm.setdefault(norm, d)
        out.append({"sheet_row": int(r["sheet_row"]), "country": r["country"], "team": r["team"], "cur_name": nz(r["cur_name"]), "level": int(r["level"]) if r["level"] else None,
            "reep_v1_id": nz(rid), "reep_v1_label": nz(r["reep_v1_label"]), "reep_v1_predecessors": nz(r["reep_v1_predecessors"]), "wikidata_qid": nz(r["wikidata_qid"]), "reep_v0_id": nz(r["reep_v0_id"]),
            "espn_id": nz(r["espn_id"]), "uefa_id": nz(r["uefa_id"]), "api_football_id": nz(r["api_football_id"]), "api_football_id_reep": nz(r["api_football_id_reep"]),
            "clubelo_label": nz(r["clubelo_label"]), "fotmob_id": nz(r["fotmob_id"]), "sportmonks_id": nz(r["sportmonks_id"]), "opta_id": nz(r["opta_id"]), "fbref_id": nz(r["fbref_id"]), "transfermarkt_id": nz(r["transfermarkt_id"]),
            "match_tier": nz(r["v1_tier"]), "match_source": nz(r["match_source"]), "current_table_verified": nz(r["current_table_verified"]), "status": r["status"],
            "provider_keys": ({p: v for p, v in keys[rid].items()} if rid else None),
            "names": ([{"n": d["n"], "norm": k, "src": d["src"]} for k, d in nm.items()] if rid else None)})
    json.dump(out, open(a.out, "w", encoding="utf-8"), ensure_ascii=False)
    print(len(out), "rows;", sum(1 for o in out if o["reep_v1_id"]), "with a Reep v1 id ->", a.out)

if __name__ == "__main__": main()
