#!/usr/bin/env python3
"""Reshape Reep v1 bundle files (reep.football/downloads, CC0) into the column layout that
reep_join_clubs.py and reep_join_competitions.py read.

Inputs (in <reep-v1 dir>):
  teams.csv, competitions.csv                          the entity files
  derived/bridges_teams.csv                            bridges.csv filtered to reep_id ^rt (awk on the device;
                                                       the full file is 456 MB and over the staging cap)
  derived/aliases_teams_comps.csv                      aliases.csv filtered to ^r[tls]
Outputs (in <out dir>):
  teams_v1full.csv        reep_id, key_wikidata(=reep_id, so the matcher's alias index keys on it), name, country,
                          plus key_<provider> columns from the bridges (namespace=team only)
  names_v1.csv            aliases for teams, keyed by reep_id in key_wikidata
  competitions_v1full.csv, names_comps_v1.csv    the same for competitions
Women's rows are dropped. Blank-gender rows are kept because the senior club often has no gender set
(Rangers, Manchester United in release 20260915T203651Z).

NOTE on rungs: every bridge row carries an evidence tier. ESPN is corroborated-mint and UEFA first-party;
api_football, clubelo, capology, fm, sportmonks are name-nationality (a name match). Keep the rung in
mind before treating a key as authoritative.

Usage: python reshape_v1.py <reep-v1 dir> <out dir>
"""
import sys
from pathlib import Path
import pandas as pd

src, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
rd = lambda p: pd.read_csv(p, dtype=str, keep_default_na=False)

T = rd(src / "teams.csv"); T = T[T.gender.isin(["men", ""])]
Ball = rd(src / "derived" / "bridges_teams.csv")
# Reep v1 files a country's football ASSOCIATION as an rt entity with the same label as its national
# team (Afghanistan = the men's team, and Afghanistan = the federation whose only bridge is
# fifa/association/AFG). The federation is not a team: drop any entity whose bridges are all in the
# association namespace. Measured 2026-09-22: this alone produced 195 false ambiguities.
assoc_only = set(Ball.groupby("reep_id").namespace.agg(lambda s: set(s) == {"association"}).pipe(lambda x: x[x].index))
T = T[~T.reep_id.isin(assoc_only)]
B = Ball[Ball.namespace == "team"]
piv = (B.groupby(["reep_id", "provider"]).external_id.agg(lambda s: "|".join(sorted(set(s)))).unstack(fill_value=""))
piv.columns = ["key_" + c for c in piv.columns]
ns = Ball.groupby("reep_id").namespace.agg(lambda s: "|".join(sorted(set(s)))).rename("key_namespaces")
teams = pd.DataFrame({"reep_id": T.reep_id.values, "key_wikidata": T.reep_id.values, "name": T.label.values,
                      "country": T.country.values, "founded": "", "stadium": "", "key_gender": T.gender.values}).set_index("reep_id")
teams = teams.join(piv, how="left").join(ns, how="left").fillna("")
teams.insert(0, "reep_id", teams.index)
teams.to_csv(out / "teams_v1full.csv", index=False)

AL = rd(src / "derived" / "aliases_teams_comps.csv")
A = AL[AL.reep_id.str.startswith("rt")]
pd.DataFrame({"reep_id": A.reep_id, "key_wikidata": A.reep_id, "name": "", "alias": A.alias}).to_csv(out / "names_v1.csv", index=False)

C = rd(src / "competitions.csv"); C = C[C.gender.isin(["men", ""])]
pd.DataFrame({"reep_id": C.reep_id, "key_wikidata": C.reep_id, "name": C.label, "country": C.country}).to_csv(out / "competitions_v1full.csv", index=False)
Ac = AL[AL.reep_id.str.startswith("rl")]
pd.DataFrame({"reep_id": Ac.reep_id, "key_wikidata": Ac.reep_id, "name": "", "alias": Ac.alias}).to_csv(out / "names_comps_v1.csv", index=False)
print(len(teams), "teams,", len(A), "team aliases,", len(C), "competitions,", len(Ac), "competition aliases ->", out)
