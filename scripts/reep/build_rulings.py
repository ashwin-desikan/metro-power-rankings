#!/usr/bin/env python3
"""Build reep_club_combined_v0_v1.csv and RULINGS_NEEDED.csv from a v0 run dir and a v1 run dir.
Usage: build_rulings.py <Lookup.csv> <API_Teams.csv> <v0 out dir> <v1 out dir>"""
import sys, re, pandas as pd
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from reep_join_clubs import edge_norm
lookup, apiteams, d0, d1 = sys.argv[1], sys.argv[2], Path(sys.argv[3]), Path(sys.argv[4])
elim_dir = Path(sys.argv[5]) if len(sys.argv) > 5 else None   # optional: output dir of reep_elimination_match.py
rd = lambda p: pd.read_csv(p, dtype=str, keep_default_na=False, encoding="utf-8-sig")
L = rd(lookup); AT = rd(apiteams)
M1 = rd(d1/"reep_club_matches.csv"); A1 = rd(d1/"reep_club_ambiguous.csv"); M0 = rd(d0/"reep_club_matches.csv"); A0 = rd(d0/"reep_club_ambiguous.csv")
if "key_wikidata" in M1.columns and (M1.key_wikidata == M1.reep_id).all(): M1 = M1.drop(columns=["key_wikidata"])
m1, m0 = M1.set_index("sheet_row"), M0.set_index("sheet_row"); a1, a0 = A1.set_index("sheet_row"), A0.set_index("sheet_row")
M0v = {}
try:
    M0v = rd(Path(__file__).parent.parent.parent / "reep" / "data" / "teams.csv").set_index("reep_id").key_wikidata.to_dict()
except Exception:
    pass
if not M0v:
    for cand in [Path("reep/data/teams.csv"), Path("/tmp/claude-0/-home-claude/080128b3-6eff-5da0-939b-a9878871d241/scratchpad/reep/data/teams.csv")]:
        if cand.exists(): M0v = rd(cand).set_index("reep_id").key_wikidata.to_dict(); break
g = lambda o, k: (o[k] if o is not None and k in o.index else "")
rows = []
for i, r in L.iterrows():
    sr = str(i + 2); v1 = m1.loc[sr] if sr in m1.index else None; v0 = m0.loc[sr] if sr in m0.index else None
    if v1 is not None and v0 is not None: st = "agree" if edge_norm(v1.reep_name) == edge_norm(v0.reep_name) else "both-matched-names-differ"
    elif v1 is not None: st = "v1-only"
    elif v0 is not None: st = "v0-only"
    elif sr in a1.index or sr in a0.index: st = "ambiguous"
    else: st = "none"
    rows.append({"sheet_row": sr, "team": r["Team"], "country": r["Country"], "level": r["Level"], "status": st,
        "reep_v1_id": g(v1, "reep_id"), "reep_v1_label": g(v1, "reep_name"), "v1_tier": g(v1, "tier"),
        "espn_id": g(v1, "key_espn"), "uefa_id": g(v1, "key_uefa"), "api_football_id_reep": g(v1, "key_api_football"),
        "clubelo_label": g(v1, "key_clubelo"), "fotmob_id": g(v1, "key_fotmob"), "sportmonks_id": g(v1, "key_sportmonks"), "opta_id": g(v1, "key_opta"),
        "reep_v0_id": g(v0, "reep_id"), "wikidata_qid": g(v0, "key_wikidata"), "reep_v0_name": g(v0, "reep_name"), "v0_tier": g(v0, "tier"),
        "fbref_id": g(v0, "key_fbref"), "transfermarkt_id": g(v0, "key_transfermarkt")})
D = pd.DataFrame(rows); D["match_source"] = D.reep_v1_id.map(lambda x: "name" if x else "")
# evidence-based disambiguation (reep_disambiguate.py) for rows the name matcher left ambiguous
DIS = {}
for reg, path in (("v1", d1/"reep_disambiguation_v1.csv"), ("v0", d0/"reep_disambiguation_v0.csv")):
    if path.exists():
        X = rd(path); DIS[reg] = X
        for _, e in X[X.decision != ""].iterrows():
            i = D.index[D.sheet_row == e.sheet_row]
            if not len(i): continue
            i = i[0]
            if reg == "v1" and D.at[i, "reep_v1_id"] == "":
                D.at[i, "reep_v1_id"] = e.decision; D.at[i, "reep_v1_label"] = e.decision_label; D.at[i, "v1_tier"] = e.rule
                D.at[i, "match_source"] = f"disambiguated {e.rule}: {e.why}"[:300]
            if reg == "v0" and D.at[i, "reep_v0_id"] == "":
                D.at[i, "reep_v0_id"] = e.decision; D.at[i, "reep_v0_name"] = e.decision_label; D.at[i, "v0_tier"] = e.rule
                D.at[i, "wikidata_qid"] = M0v.get(e.decision, "")
            v1, v0 = D.at[i, "reep_v1_id"], D.at[i, "reep_v0_id"]
            D.at[i, "status"] = ("agree" if (v1 and v0 and edge_norm(D.at[i, "reep_v1_label"]) == edge_norm(D.at[i, "reep_v0_name"])) else
                                 "both-matched-names-differ" if (v1 and v0) else "v1-only" if v1 else "v0-only" if v0 else D.at[i, "status"])
# Ashwin's rulings override everything
RUL = Path(__file__).parent / "rulings" / "club_rulings.csv"
if RUL.exists():
    for _, e in rd(RUL).iterrows():
        i = D.index[D.sheet_row == e.sheet_row]
        if len(i):
            i = i[0]; D.at[i, "reep_v1_id"] = e.reep_v1_id; D.at[i, "reep_v1_label"] = e.reep_v1_label; D.at[i, "v1_tier"] = "RULED"
            D.at[i, "match_source"] = f"ruled by {e.ruled_by} {e.ruled_on}"; D.at[i, "status"] = "v1-only" if D.at[i, "wikidata_qid"] == "" else "agree"
E = None
if elim_dir and (elim_dir/"reep_elimination_matches.csv").exists():
    E = rd(elim_dir/"reep_elimination_matches.csv"); E["n"] = E.seasons_of_evidence.astype(int)
    # a blind pair (one club left on each side of a league table, no shared name token) is never applied by itself
    strong = E[(E.tier != "CONFLICT") & (E.tier != "ELIM-1-blind") & (E.in_lookup == "yes") & (E.n >= 3)].set_index("sheet_row")
    for sr, e in strong.iterrows():
        i = D.index[D.sheet_row == sr]
        if len(i) and D.at[i[0], "reep_v1_id"] == "":
            D.at[i[0], "reep_v1_id"] = e.reep_v1_id; D.at[i[0], "reep_v1_label"] = e.reep_v1_label; D.at[i[0], "v1_tier"] = e.tier
            D.at[i[0], "match_source"] = f"elimination ({e.seasons_of_evidence} seasons)"
            D.at[i[0], "status"] = "v1-only" if D.at[i[0], "wikidata_qid"] == "" else ("agree" if edge_norm(e.reep_v1_label) == edge_norm(D.at[i[0], "reep_v0_name"]) else "both-matched-names-differ")
desc, latest = {}, {}
if elim_dir and (elim_dir/"reep_team_descriptors.csv").exists():
    td = rd(elim_dir/"reep_team_descriptors.csv").set_index("reep_v1_id")
    desc = td.descriptor.to_dict(); latest = {k: int(v) for k, v in td.latest_season.items() if v}
CURRENT = max(latest.values()) - 1 if latest else 2025
# calendar-year leagues (Brazil, Scandinavia, Japan) lag Reep's 2025/26 European seasons by a year: "current" is
# judged per country, against the latest season Reep holds for ANY entity of that country
T1 = rd(d1.parent / "shaped" / "teams_v1full.csv") if (d1.parent / "shaped" / "teams_v1full.csv").exists() else None
cur_by_country = {}
if T1 is not None:
    for rid, c in T1.set_index("reep_id").country.items():
        if rid in latest: cur_by_country[c] = max(cur_by_country.get(c, 0), latest[rid])
    tid_country = T1.set_index("reep_id").country.to_dict()
else: tid_country = {}
def current_for(rid): return cur_by_country.get(tid_country.get(rid, ""), CURRENT + 1) - 1

# Lineage conflicts (elimination evidence on two Reep entities for one row). Reep splits a club at a refoundation
# where the workbook keeps one row. Rule (Ashwin 2026-09-22, "the current tables are the key"): cup-season token
# evidence never counts (a candidate carried only by that is noise); among what is
# left, if exactly one entity is still playing (latest >= CURRENT) it is the club today and the others are its
# predecessors, kept in reep_v1_predecessors for joins against historical tables.
D["reep_v1_predecessors"] = ""
CUP = re.compile(r"\b(cup|pokal|pokalen|copa|coupe|coppa|cupa|ta[cç]a|beker|kubok|kupa|puchar|pohar|cupen|bikar|trophy|shield)\b", re.I)
def parse_conflict(ev):
    cands = []
    for part in ev.split(" || "):
        m = re.match(r"(rt[0-9a-f]{14})=(.*?): (.*)$", part)
        if not m: continue
        rid, label, evs = m.groups()
        real = [e for e in evs.split(" | ") if not (CUP.search(e) and e.endswith("ELIM-token")) and not e.endswith("ELIM-1-blind")]
        cands.append((rid, label, len(real)))
    return cands
lineage_resolved = set()
if E is not None:
    conf = E[(E.tier == "CONFLICT") & (E.in_lookup == "yes")]
    for _, e in conf.iterrows():
        i = D.index[D.sheet_row == e.sheet_row]
        if not len(i): continue
        cands = parse_conflict(e.evidence)
        # a name match that landed on one of the lineage's entities is the same question, so it is re-decided here
        if D.at[i[0], "reep_v1_id"] != "" and (D.at[i[0], "reep_v1_id"] not in {c[0] for c in cands} or D.at[i[0], "v1_tier"] == "RULED"): continue
        cands = [c for c in cands if c[2] >= 1]   # a candidate carried only by cup-season tokens is noise
        if not cands: continue
        cur = [c for c in cands if latest.get(c[0], 0) >= current_for(c[0])]
        pick = cur[0] if len(cur) == 1 else (cands[0] if len(cands) == 1 and cands[0][2] >= 3 else None)
        if pick is None: continue
        preds = [c for c in cands if c[0] != pick[0]]
        D.at[i[0], "reep_v1_id"] = pick[0]; D.at[i[0], "reep_v1_label"] = pick[1]; D.at[i[0], "v1_tier"] = "ELIM-lineage" if preds else "ELIM-name"
        D.at[i[0], "reep_v1_predecessors"] = "; ".join(f"{c[0]}={c[1]} (last {latest.get(c[0], '?')})" for c in preds)
        D.at[i[0], "match_source"] = f"elimination lineage: current entity ({pick[2]} seasons), {len(preds)} predecessor(s)" if preds else f"elimination ({pick[2]} seasons, noise dropped)"
        D.at[i[0], "status"] = "v1-only" if D.at[i[0], "wikidata_qid"] == "" else ("agree" if edge_norm(pick[1]) == edge_norm(D.at[i[0], "reep_v0_name"]) else "both-matched-names-differ")
        lineage_resolved.add(e.sheet_row)
# Ashwin 2026-09-22: a row with a Level is in THIS season's tables. A v1 entity whose last recorded season
# is years ago cannot be that club, whatever the name match said (Sriwijaya, last 2018, was carrying two
# Liga 1 clubs through a Reep alias). Reject it; the elimination pass then finds the club from the table.
if latest:
    for i in D.index[D.level.isin(["1", "2", "3", "4"]) & (D.reep_v1_id != "") & (D.v1_tier != "RULED")]:
        rid = D.at[i, "reep_v1_id"]; y = latest.get(rid, 0)
        if rid in latest and y < current_for(rid):
            D.at[i, "match_source"] = f"v1 candidate {rid} '{D.at[i, 'reep_v1_label']}' rejected: last season {y}, row plays now (Level {D.at[i, 'level']})"
            D.at[i, "reep_v1_id"] = ""; D.at[i, "reep_v1_label"] = ""; D.at[i, "v1_tier"] = ""
            for k in ("espn_id", "uefa_id", "api_football_id_reep", "clubelo_label", "fotmob_id", "sportmonks_id", "opta_id"): D.at[i, k] = ""
            D.at[i, "status"] = "v0-only" if D.at[i, "wikidata_qid"] else "none"
D.to_csv(d1/"reep_club_combined_v0_v1.csv", index=False, encoding="utf-8-sig")
def dsc(rid, label):
    return desc.get(rid, label)
print("combined:", D.status.value_counts().to_dict()); print("Level 1:", D[D.level == "1"].status.value_counts().to_dict())
print("either id:", ((D.reep_v1_id != "") | (D.wikidata_qid != "")).sum())

at = AT[AT["Team Name"] != ""].drop_duplicates("Team Name").set_index("Team Name")["Team ID"]
L["sheet_row"] = (L.index + 2).astype(str); L["api_id_sheet"] = L["API Name"].map(at).fillna("")
out = []
for _, r in D[D.status == "ambiguous"].iterrows():
    if r.reep_v1_id or r.reep_v0_id: continue   # settled by a rule, by history or by ruling
    src = "v1" if r.sheet_row in a1.index else "v0"; a = (a1 if src == "v1" else a0).loc[r.sheet_row]
    c = [x.split(":") for x in a.candidates.split(" | ")]
    trace = ""
    if src in DIS:
        t = DIS[src][DIS[src].sheet_row == r.sheet_row]
        if len(t): trace = t.rules_tried.iloc[0]
    out.append({"ruling_type": "1 ambiguous: pick the candidate", "sheet_row": r.sheet_row, "team": r.team, "country": r.country, "level": r.level, "register": src,
        "option_a": f"{c[0][0]} = {dsc(c[0][0], c[0][1])}", "option_b": f"{c[1][0]} = {dsc(c[1][0], c[1][1])}" if len(c) > 1 else "", "more_options": " | ".join(f"{x[0]} = {dsc(x[0], x[1])}" for x in c[2:]),
        "suggested": a.get("suggested_if_only_one_has_keys", ""), "ruling": "", "how_to_rule": "write the reep id of the correct senior men's club in ruling, or NONE. Rules tried: " + trace})
# Ashwin 2026-09-22: the workbook's API Teams ids take precedence over Reep's api_football bridges (which are
# name matches). No ruling row; the combined file carries the workbook id and keeps Reep's as a note.
j = m1.join(L.set_index("sheet_row")[["api_id_sheet", "API Name"]])
D["api_football_id"] = ""
for sr, r in j.iterrows():
    i = D.index[D.sheet_row == sr]
    if not len(i): continue
    ws, rp = r.api_id_sheet, r.key_api_football
    D.at[i[0], "api_football_id"] = ws or rp
    if ws and rp and ws != rp: D.at[i[0], "api_football_id_reep"] = f"{rp} (overridden by workbook {ws})"
D.to_csv(d1/"reep_club_combined_v0_v1.csv", index=False, encoding="utf-8-sig")
VER = {}
if elim_dir and (elim_dir/"reep_current_table_verified.csv").exists():
    VER = rd(elim_dir/"reep_current_table_verified.csv").set_index("sheet_row").verified_by.to_dict()
D["current_table_verified"] = D.sheet_row.map(VER).fillna("")
# Ashwin 2026-09-22: a club with a Level is in THIS season's tables; if the v1 entity sits in the aligned Reep
# season of that table, v1 is the key and a differently named v0 item is not a conflict. Same for national
# teams (NAT), rulings, and elimination matches with 3+ seasons: v1 wins, v0 is dropped from the row.
strong_v1 = (D.v1_tier.isin(["NAT", "RULED"]) | D.v1_tier.str.startswith("ELIM") | (D.current_table_verified != "")
             | (D.level.isin(["1", "2", "3", "4"]) & D.reep_v1_id.map(lambda r: latest.get(r, 0) >= current_for(r))))   # plays now, and v1 plays now
fix = D.index[(D.status == "both-matched-names-differ") & strong_v1]
for i in fix:
    D.at[i, "match_source"] = (D.at[i, "match_source"] + f"; v0 item '{D.at[i, 'reep_v0_name']}' dropped (v1 verified by {'current table ' + D.at[i, 'current_table_verified'] if D.at[i, 'current_table_verified'] else D.at[i, 'v1_tier']})")[:400]
    D.at[i, "reep_v0_id"] = ""; D.at[i, "wikidata_qid"] = ""; D.at[i, "reep_v0_name"] = ""; D.at[i, "v0_tier"] = ""; D.at[i, "fbref_id"] = ""; D.at[i, "transfermarkt_id"] = ""
    D.at[i, "status"] = "v1-only"
D.to_csv(d1/"reep_club_combined_v0_v1.csv", index=False, encoding="utf-8-sig")
toks = lambda s: set(edge_norm(s).split())
nc = D[D.status == "both-matched-names-differ"]
nc = nc[nc.apply(lambda r: not (toks(r.reep_v1_label) & toks(r.reep_v0_name)) and not (toks(r.team) & toks(r.reep_v1_label) & toks(r.reep_v0_name)), axis=1)]
for _, r in nc.iterrows():
    out.append({"ruling_type": "3 v0/v1 point at differently named records", "sheet_row": r.sheet_row, "team": r.team, "country": r.country, "level": r.level, "register": "both",
        "option_a": f"v1 {r.reep_v1_id} = {dsc(r.reep_v1_id, r.reep_v1_label)} ({r.v1_tier})", "option_b": f"v0 {r.reep_v0_id} = {r.reep_v0_name} ({r.v0_tier}, QID {r.wikidata_qid})", "more_options": "",
        "suggested": "", "ruling": "", "how_to_rule": "BOTH if same club under two labels, V1 or V0 if only one is right, NONE if neither"})
if E is not None:
    weak = E[(E.tier != "CONFLICT") & (E.in_lookup == "yes") & ((E.n < 3) | (E.tier == "ELIM-1-blind"))]
    for _, e in weak.iterrows():
        blind = e.tier == "ELIM-1-blind"
        out.append({"ruling_type": "4b elimination: only club left on each side of the table, names do NOT match" if blind else "4 elimination match on thin evidence (1-2 seasons)",
            "sheet_row": e.sheet_row, "team": e.team, "country": e.country,
            "level": L.set_index("sheet_row").Level.get(e.sheet_row, ""), "register": "v1", "option_a": f"{e.reep_v1_id} = {dsc(e.reep_v1_id, e.reep_v1_label)}", "option_b": "NONE",
            "more_options": e.evidence, "suggested": "" if blind else e.reep_v1_id, "ruling": "", "how_to_rule": "write the reep id to accept, or NONE"})
    conflicts = E[(E.tier == "CONFLICT") & (E.in_lookup == "yes")]
    AH = rd(elim_dir/"reep_ambiguous_resolved_by_history.csv") if (elim_dir/"reep_ambiguous_resolved_by_history.csv").exists() else None
    if AH is not None: conflicts = pd.concat([conflicts, AH[AH.tier == "CONFLICT"].assign(country="", in_lookup="yes")], ignore_index=True)
    for _, e in conflicts.iterrows():
        if e.sheet_row in set(D[D.reep_v1_id != ""].sheet_row): continue
        out.append({"ruling_type": "5 evidence points at two Reep ids across eras and neither is current", "sheet_row": e.sheet_row, "team": e.team, "country": "",
            "level": L.set_index("sheet_row").Level.get(e.sheet_row, ""), "register": "v1", "option_a": "", "option_b": "", "more_options": e.evidence,
            "suggested": "", "ruling": "", "how_to_rule": "write the reep id that is the club today; note the other as a predecessor"})
R = pd.DataFrame(out)
ruled_rows = set(rd(RUL).sheet_row.astype(str)) if RUL.exists() else set()
R = R[~R.sheet_row.astype(str).isin(ruled_rows)]   # a row Ashwin has ruled on never comes back for a ruling
R["k"] = R.level.replace("", "9"); R = R.sort_values(["ruling_type", "k", "country", "team"]).drop(columns="k")
R.to_csv(d1/"RULINGS_NEEDED.csv", index=False, encoding="utf-8-sig")   # BOM so Excel shows Tórshavn, not TÃ³rshavn
print("rulings:", R.ruling_type.value_counts().to_dict(), "| Level 1:", (R.level == "1").sum())
