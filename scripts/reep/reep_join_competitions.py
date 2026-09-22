#!/usr/bin/env python3
"""Dry-run join of the site's football competitions (public.football_competitions + the football rows of
public.champion_competitions) against Reep competitions.csv, using the club matcher's normaliser and the
same no-guess rule. Reep v0 competitions carry no country for 196 of 212 rows, so the match is name-only,
unique-worldwide; anything else is AMB or NONE."""
import csv, sys, argparse
from collections import defaultdict
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from reep_join_clubs import strict_norm, loose_norm, read_csv, COUNTRY_MAP

ap = argparse.ArgumentParser(); ap.add_argument("--site", required=True); ap.add_argument("--reep", required=True)
ap.add_argument("--names", required=True); ap.add_argument("--out", required=True); a = ap.parse_args()
out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
reep = read_csv(a.reep); names = read_csv(a.names)
alias = defaultdict(set)
for r in names:
    if r["key_wikidata"]: alias[r["key_wikidata"]].add(r["alias"])
S, Lz = defaultdict(set), defaultdict(set); by = {}
for r in reep:
    by[r["reep_id"]] = r
    for v in {r["name"]} | alias.get(r["key_wikidata"], set()):
        if v: S[strict_norm(v)].add(r["reep_id"]); Lz[loose_norm(v)].add(r["reep_id"])
def gate(found, country):
    """When the site row names a country and Reep rows carry one, keep only Reep rows in that country."""
    if not country: return found
    ok = {country} | set(COUNTRY_MAP.get(country, []))
    kept = {x for x in found if by[x]["country"] in ok}
    return kept if kept else (found if all(by[x]["country"] == "" for x in found) else set())
rows = []; tally = defaultdict(int)
for s in read_csv(a.site):
    nm = s["name"]; found = gate(S.get(strict_norm(nm), set()), s["country"]); tier = "T1" if found else None
    if not found: found = gate(Lz.get(loose_norm(nm), set()), s["country"]); tier = "T2" if found else None
    if not found: tier = "NONE"
    elif len(found) > 1: tier = "AMB"
    tally[tier] += 1
    r = by[next(iter(found))] if tier in ("T1", "T2") else {}
    rows.append({**s, "tier": tier, "reep_id": r.get("reep_id", ""), "reep_name": r.get("name", ""),
                 "key_wikidata": r.get("key_wikidata", ""), "key_fbref": r.get("key_fbref", ""),
                 "key_transfermarkt": r.get("key_transfermarkt", ""), "key_opta": r.get("key_opta", ""),
                 "candidates": " | ".join(f'{by[x]["name"]}:{by[x]["key_wikidata"]}' for x in sorted(found)) if tier == "AMB" else ""})
with open(out / "reep_competition_matches.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
print(f"site competitions: {len(rows)}"); [print(f"{t:5} {tally[t]}") for t in ["T1", "T2", "AMB", "NONE"]]
