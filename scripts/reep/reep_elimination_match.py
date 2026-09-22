#!/usr/bin/env python3
"""
Elimination matching through league history (Ashwin's method, 2026-09-22).

The site's league tables (workbook sheets Leagues History, Stand2nd, StandOth, World; the same rows
live in public.cl_league_history) say which clubs sat in which competition in which season. Reep v1's
relationships file says which Reep teams participated in which Reep season. For every site table
(country, league, end_year):

  1. Find the Reep season it corresponds to: the season (competition in the same country, label ending
     in that year) whose participants overlap most with the site clubs that ALREADY have a Reep id.
     Accepting it needs at least MIN_KNOWN known clubs and MIN_OVERLAP of them present.
  2. Remove the known clubs from both sides. What is left on the site side are clubs with no Reep id;
     what is left on the Reep side are participants nobody claimed.
  3. If exactly one is left on each side, they are the same club (tier ELIM-1). If several are left, a
     name match within that tiny set is safe (tier ELIM-name). Anything else is written out as a
     candidate list for a ruling.
  4. Evidence is pooled across seasons: a club is matched when every season that produced evidence
     agrees, and at least MIN_SEASONS seasons did.

By-product: a competition crosswalk, site (country, league) -> Reep competition id, from the seasons
that were accepted in step 1.

Usage:
  reep_elimination_match.py --tables site_tables.csv --lookup Lookup.csv --combined reep_club_combined_v0_v1.csv
      --teams teams_v1full.csv --seasons seasons.csv --relationships relationships_seasons.csv
      --competitions competitions.csv --out <dir>
"""
import argparse, csv, re, sys
from collections import defaultdict, Counter
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from reep_join_clubs import strict_norm, edge_norm, loose_norm, NOT_SENIOR_MEN, COUNTRY_MAP, FORM_TOKENS, side_flag, WOMEN, BASES, LOOKUP_BASES, reserve_base

def sig_tokens(name):
    """Distinctive tokens: 4+ letters, not a club-form word, not a bare year."""
    return {t for t in strict_norm(name).split() if len(t) >= 4 and t not in FORM_TOKENS and not t.isdigit()}

def share(a, b, weak=()):
    """Two names share a distinctive token, allowing a 5+ letter prefix (valmiera / valmieras). Tokens in `weak`
    (the row's own city) do not count: 'Odense BK' and 'KFUM Odense' share only the city and are different clubs."""
    for x in sig_tokens(a) - set(weak):
        for y in sig_tokens(b) - set(weak):
            if x == y or (len(x) >= 5 and len(y) >= 5 and (x.startswith(y) or y.startswith(x))): return True
    return False

def short_form(a, b):
    """Every content token of the shorter name sits in the longer one: 'KÍ' in 'KÍ Klaksvík', 'OB' in 'OB Odense',
    'NEC' in 'NEC Nijmegen'. Initialisms are too short for share() but are the club's own name."""
    ta = {t for t in strict_norm(a).split() if t not in FORM_TOKENS and not t.isdigit()}
    tb = {t for t in strict_norm(b).split() if t not in FORM_TOKENS and not t.isdigit()}
    if not ta or not tb: return False
    small, big = (ta, tb) if len(ta) <= len(tb) else (tb, ta)
    return small <= big

CUP = re.compile(r"\b(cup|pokal|pokalen|copa|coupe|coppa|cupa|ta[cç]a|beker|kubok|kupa|puchar|pohar|pokal|cupen|bikar|kuppi|kubk|karika|taca|trophy|trophée|shield)\b", re.I)

MIN_KNOWN, MIN_OVERLAP, MIN_SEASONS = 3, 0.5, 1

def rd(p):
    with open(p, newline="", encoding="utf-8-sig") as f: return list(csv.DictReader(f))

def season_end_year(label):
    m = re.match(r"^(\d{4})(?:/(\d{2,4}))?", label)
    if not m: return None
    a, b = m.group(1), m.group(2)
    if b is None: return int(a)
    return int(b) if len(b) == 4 else int(a[:2] + b)

def main():
    ap = argparse.ArgumentParser()
    for k in ["tables", "lookup", "combined", "teams", "seasons", "relationships", "competitions", "out"]: ap.add_argument("--" + k, required=True)
    a = ap.parse_args(); out = Path(a.out); out.mkdir(parents=True, exist_ok=True)

    teams = {r["reep_id"]: r for r in rd(a.teams) if not WOMEN.search(r["name"]) and r.get("key_gender", "") != "women"}
    for r in teams.values(): BASES.add(edge_norm(r["name"]))
    comps = {r["reep_id"]: r for r in rd(a.competitions)}
    seasons = {r["reep_id"]: r for r in rd(a.seasons)}
    season_comp, stage_season = {}, {}
    part = defaultdict(set)           # season -> set(team)
    for r in rd(a.relationships):
        if r["kind"] == "season_of": season_comp[r["from_id"]] = r["to_id"]
        elif r["kind"] == "stage_of": stage_season[r["from_id"]] = r["to_id"]
    for r in rd(a.relationships):
        if r["kind"] == "participates_in":
            s = r["to_id"] if r["to_id"].startswith("rs") else stage_season.get(r["to_id"])
            if s and r["from_id"] in teams: part[s].add(r["from_id"])
    # index seasons by (country, end_year)
    by_cy = defaultdict(list)
    for s, ts in part.items():
        c = season_comp.get(s);
        if not c or c not in comps: continue
        y = season_end_year(seasons.get(s, {}).get("label", ""))
        if y: by_cy[(comps[c]["country"], y)].append(s)

    # site side: team name -> Lookup sheet_row -> reep id (from the combined file)
    lookup = rd(a.lookup)
    name_to_rows = defaultdict(set)
    city_tokens = defaultdict(set)   # (norm name, country) -> the row's City / Metro Area tokens, which are weak evidence
    for i, r in enumerate(lookup, start=2):
        for k in ("Team", "Cur. Name", "Lookup", "UEFA Name", "EFS Name"):
            if r.get(k):
                name_to_rows[(strict_norm(r[k]), r["Country"])].add(str(i))
                city_tokens[(strict_norm(r[k]), r["Country"])] |= sig_tokens(r.get("City", "")) | sig_tokens(r.get("Metro Area", ""))
        for k in ("Team", "Lookup"):
            if r.get(k): LOOKUP_BASES.add((edge_norm(r[k]), r["Country"]))
    aliases = defaultdict(set)
    names_path = Path(a.teams).parent / "names_v1.csv"
    if names_path.exists():
        for r in rd(names_path):
            if r["alias"]: aliases[r["reep_id"]].add(r["alias"])
    row_names = defaultdict(set)   # sheet_row -> every name column the workbook holds for the row
    for i, r in enumerate(lookup, start=2):
        for k in ("Team", "Lookup", "UEFA Name", "UEFA Name 2", "UEFA Name 3", "EFS Name", "API Name", "API Name 2"):
            if r.get(k): row_names[str(i)].add(r[k])
    def name_evidence(n, country, t):
        """The table name (or any workbook name column of its row) and the Reep entity (or any alias) share a
        distinctive token, or one is the short form of the other. The row's own city does not count."""
        weak = city_tokens.get((strict_norm(n), country), set())
        sr = site_row(n, country)
        mine = {n} | (row_names.get(sr, set()) if sr else set())
        theirs = {teams[t]["name"]} | aliases.get(t, set())
        return any(share(x, y, weak) or short_form(x, y) for x in mine for y in theirs)
    comb = {r["sheet_row"]: r for r in rd(a.combined)}
    def site_row(name, country):
        rows = name_to_rows.get((strict_norm(name), country), set())
        return next(iter(rows)) if len(rows) == 1 else None

    # ambiguous rows from the name matcher: which candidate actually sat in the tables this club sat in?
    amb_path = Path(a.combined).parent / "reep_club_ambiguous.csv"
    amb_cands = {}
    if amb_path.exists():
        for r in rd(amb_path):
            amb_cands[r["sheet_row"]] = [c.split(":")[0] for c in r["candidates"].split(" | ")]
    amb_hits = defaultdict(lambda: defaultdict(list))   # sheet_row -> reep_id -> [season label]

    tables = defaultdict(set)
    for r in rd(a.tables):
        try: y = int(float(r["end_year"]))
        except ValueError: continue
        tables[(r["country"], r["league"], y)].add(r["team"])

    evidence = defaultdict(lambda: defaultdict(list))   # sheet_row -> reep_id -> [season labels]
    verified = {}   # sheet_row -> (reep_v1_id, season label): the matched entity sat in the aligned CURRENT season of this club's own table
    unresolved = []                                       # (country, league, year, leftovers site, leftovers reep)
    comp_votes = defaultdict(Counter)                     # (country, league) -> Counter(reep comp)
    season_log = []
    for (country, league, year), names in sorted(tables.items()):
        rc_list = [country] + COUNTRY_MAP.get(country, [])
        rows = {n: site_row(n, country) for n in names}
        known = {comb[r]["reep_v1_id"]: n for n, r in rows.items() if r and comb.get(r, {}).get("reep_v1_id")}
        unknown = [n for n, r in rows.items() if not (r and comb.get(r, {}).get("reep_v1_id"))]
        if len(known) < MIN_KNOWN: season_log.append([country, league, year, len(names), len(known), "", "", "too few known"]); continue
        cands = [s for rc in rc_list for s in by_cy.get((rc, year), [])]
        # the season whose participants overlap the known clubs most; on a near-tie the SMALLER season wins
        # (a national cup with 900 entrants overlaps everything; the league season is the one the table is)
        ranked = sorted(((len(set(known) & part[s]) / len(known), -len(part[s]), s) for s in cands), key=lambda x: (round(x[0], 1), x[1]), reverse=True)
        best, best_ov = (ranked[0][2], ranked[0][0]) if ranked else (None, 0.0)
        if not best or best_ov < MIN_OVERLAP:
            season_log.append([country, league, year, len(names), len(known), "", f"{best_ov:.2f}", "no season reached overlap"]); continue
        comp = season_comp[best]; comp_votes[(country, league)][comp] += 1
        if year >= 2025:
            for rid, n in known.items():
                if rid in part[best]: verified[rows[n]] = (rid, f"{seasons[best]['label']} {comps[comp]['label']}")
        for n, r in rows.items():
            if r in amb_cands:
                for cnd in amb_cands[r]:
                    if cnd in part[best]: amb_hits[r][cnd].append(f"{seasons[best]['label']} {comps[comp]['label']}")
        left_reep = list(part[best] - set(known))
        season_log.append([country, league, year, len(names), len(known), comps[comp]["label"], f"{best_ov:.2f}", f"left site {len(unknown)} / reep {len(left_reep)}"])
        if not unknown: continue
        matched_here = {}
        # pair senior with senior and reserve/youth with reserve/youth; a senior row never lands on a II side
        senior_u = [n for n in unknown if side_flag(n, country) == ""]; other_u = [n for n in unknown if side_flag(n, country) != ""]
        senior_r = [t for t in left_reep if side_flag(teams[t]["name"], teams[t]["country"]) == ""]; other_r = [t for t in left_reep if t not in senior_r]
        is_cup = bool(CUP.search(comps[comp]["label"]))
        for u_side, r_side in ((senior_u, senior_r), (other_u, other_r)):
            if len(u_side) == 1 and len(r_side) == 1:
                n, t = u_side[0], r_side[0]
                named = name_evidence(n, country, t)
                # a reserve/youth row must sit under the same parent as the entity: 'Juventus U23' is never 'Atalanta II'
                pb, tb = reserve_base(n), reserve_base(teams[t]["name"])
                if side_flag(n, country) and pb and tb and not (share(pb, tb) or short_form(pb, tb)): continue
                if named: matched_here[n] = (t, "ELIM-1")
                elif not is_cup: matched_here[n] = (t, "ELIM-1-blind")   # one left on each side, no shared token: evidence only across seasons
                # a cup season with no name evidence is noise: cups hold amateur entrants Reep never lists
        if not matched_here:
            # name match inside the small leftover set only
            for n in unknown:
                same = lambda t: (side_flag(teams[t]["name"], teams[t]["country"]) == "") == (side_flag(n, country) == "")
                hits = {t for t in left_reep if same(t) and (edge_norm(teams[t]["name"]) == edge_norm(n) or loose_norm(teams[t]["name"]) == loose_norm(n))}
                if len(hits) == 1: matched_here[n] = (next(iter(hits)), "ELIM-name")
            # inside the leftover set only: a distinctive shared token, unique in both directions
            for n in [u for u in unknown if u not in matched_here]:
                pool = [t for t in left_reep if t not in {v[0] for v in matched_here.values()} and (side_flag(teams[t]["name"], teams[t]["country"]) == "") == (side_flag(n, country) == "")]
                weak = city_tokens.get((strict_norm(n), country), set())
                hits = [t for t in pool if share(teams[t]["name"], n, weak)]
                if len(hits) == 1 and sum(1 for u in unknown if u not in matched_here and share(teams[hits[0]]["name"], u, weak)) == 1:
                    matched_here[n] = (hits[0], "ELIM-token")
            # inside the leftover set only: the entity's label or alias is the short form of the workbook name (OB / OB Odense)
            for n in [u for u in unknown if u not in matched_here]:
                pool = [t for t in left_reep if t not in {v[0] for v in matched_here.values()} and (side_flag(teams[t]["name"], teams[t]["country"]) == "") == (side_flag(n, country) == "")]
                hits = [t for t in pool if name_evidence(n, country, t)]
                if len(hits) == 1 and sum(1 for u in unknown if u not in matched_here and name_evidence(u, country, hits[0])) == 1:
                    matched_here[n] = (hits[0], "ELIM-short")
        for n, (t, tier) in matched_here.items():
            r = rows[n] or f"?{n}|{country}"
            evidence[r][t].append(f"{seasons[best]['label']} {comps[comp]['label']} {tier}")
        rest_site = [n for n in unknown if n not in matched_here]
        rest_reep = [t for t in left_reep if t not in {v[0] for v in matched_here.values()}]
        if rest_site and rest_reep:
            unresolved.append([country, league, year, comps[comp]["label"], "; ".join(rest_site), "; ".join(f"{t}={teams[t]['name']}" for t in rest_reep)])

    # carry forward evidence from a previous pass (the combined file already treats those clubs as known,
    # so this pass would otherwise drop them); a club is settled once, then only its evidence count grows
    prior_path = out / "reep_elimination_matches.csv"
    if prior_path.exists():
        for r in rd(prior_path):
            if r["tier"] == "CONFLICT" or not r["sheet_row"]: continue
            key = r["sheet_row"]
            if key not in evidence:
                evidence[key][r["reep_v1_id"]] = [f"(prior pass) {r['evidence'].split(' | ')[0]}"] * int(r["seasons_of_evidence"])
    # pool evidence
    rows_out = []
    for r, byid in evidence.items():
        if len(byid) == 1:
            t, ev = next(iter(byid.items()))
            blind = all(e.endswith("ELIM-1-blind") for e in ev)
            if blind and len(ev) < 3: continue   # a blind pair needs three league seasons before it is even offered
            if len(ev) >= MIN_SEASONS:
                sr = r if not r.startswith("?") else ""
                name = lookup[int(sr) - 2]["Team"] if sr else r[1:].split("|")[0]
                country = lookup[int(sr) - 2]["Country"] if sr else r[1:].split("|")[1]
                rows_out.append({"sheet_row": sr, "team": name, "country": country, "reep_v1_id": t, "reep_v1_label": teams[t]["name"],
                                 "reep_country": teams[t]["country"], "seasons_of_evidence": len(ev), "tier": ev[0].split()[-1],
                                 "evidence": " | ".join(ev[:6]), "in_lookup": "yes" if sr else "no (table name not in Lookup)"})
        else:
            sr = r if not r.startswith("?") else ""
            rows_out.append({"sheet_row": sr, "team": (lookup[int(sr) - 2]["Team"] if sr else r[1:].split("|")[0]), "country": "",
                             "reep_v1_id": "", "reep_v1_label": "", "reep_country": "", "seasons_of_evidence": sum(len(v) for v in byid.values()),
                             "tier": "CONFLICT", "evidence": " || ".join(f"{t}={teams[t]['name']}: " + " | ".join(ev[:3]) for t, ev in byid.items()), "in_lookup": "yes" if sr else "no"})
    # latest season each Reep team sat in (any competition), for "which entity is the club today"
    latest = defaultdict(int)
    for sid, ts in part.items():
        y = season_end_year(seasons.get(sid, {}).get("label", "")) or 0
        for t in ts: latest[t] = max(latest[t], y)
    CURRENT = max(latest.values()) - 1 if latest else 2025
    # descriptor per Reep team, for the rulings file
    def describe(t):
        r = teams[t]; g = r.get("key_gender", "") or "gender blank"
        provs = [k[4:] for k in r if k.startswith("key_") and k not in ("key_wikidata", "key_gender", "key_namespaces", "key_status") and r[k]]
        return f"{r['name']} [{g}; last season {latest.get(t) or 'none'}; {len(provs)} providers: {', '.join(sorted(provs)[:5])}]"
    with open(out / "reep_team_descriptors.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(["reep_v1_id", "descriptor", "latest_season"])
        for t in teams: w.writerow([t, describe(t), latest.get(t, "")])
    amb_rows = []
    for r, byid in amb_hits.items():
        name = lookup[int(r) - 2]["Team"]
        if len(byid) == 1:
            t, ev = next(iter(byid.items()))
            amb_rows.append({"sheet_row": r, "team": name, "reep_v1_id": t, "reep_v1_label": teams[t]["name"], "seasons_of_evidence": len(ev), "tier": "AMB-history", "evidence": " | ".join(ev[:6]), "predecessor_ids": ""})
        elif sum(1 for t in byid if latest.get(t, 0) >= CURRENT) == 1:
            # two Reep entities for one lineage: the one still playing is the club today, the other its predecessor
            t = next(t for t in byid if latest.get(t, 0) >= CURRENT); ev = byid[t]
            amb_rows.append({"sheet_row": r, "team": name, "reep_v1_id": t, "reep_v1_label": teams[t]["name"], "seasons_of_evidence": len(ev), "tier": "AMB-current",
                             "evidence": " | ".join(ev[:6]), "predecessor_ids": "; ".join(f"{x}={teams[x]['name']} (last {latest.get(x)})" for x in byid if x != t)})
        else:
            amb_rows.append({"sheet_row": r, "team": name, "reep_v1_id": "", "reep_v1_label": "", "seasons_of_evidence": sum(len(v) for v in byid.values()), "tier": "CONFLICT",
                             "evidence": " || ".join(f"{t}={teams[t]['name']}: " + " | ".join(ev[:3]) for t, ev in byid.items()), "predecessor_ids": ""})
    def dump(name, rows, hdr=None):
        with open(out / name, "w", newline="", encoding="utf-8") as f:
            if hdr: w = csv.writer(f); w.writerow(hdr); w.writerows(rows)
            else:
                w = csv.DictWriter(f, fieldnames=list(rows[0].keys()) if rows else ["empty"]); w.writeheader(); w.writerows(rows)
    dump("reep_elimination_matches.csv", rows_out)
    with open(out / "reep_current_table_verified.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(["sheet_row", "reep_v1_id", "verified_by"])
        for sr, (rid, lab) in sorted(verified.items()): w.writerow([sr, rid, lab])
    print(f"current-season table verification: {len(verified)} Lookup rows confirmed in a 2025+ Reep season")
    dump("reep_ambiguous_resolved_by_history.csv", amb_rows)
    dump("reep_elimination_unresolved.csv", unresolved, ["country", "league", "end_year", "reep_competition", "site_clubs_left", "reep_teams_left"])
    dump("reep_elimination_season_log.csv", season_log, ["country", "league", "end_year", "site_clubs", "known", "reep_competition", "overlap", "note"])
    cw = [[c, l, comp, comps[comp]["label"], n, sum(v.values())] for (c, l), v in comp_votes.items() for comp, n in [v.most_common(1)[0]]]
    dump("reep_competition_crosswalk_from_tables.csv", sorted(cw), ["country", "league", "reep_competition_id", "reep_competition_label", "seasons_agreeing", "seasons_total"])
    n_ok = sum(1 for r in rows_out if r["tier"] != "CONFLICT"); n_lk = sum(1 for r in rows_out if r["tier"] != "CONFLICT" and r["in_lookup"] == "yes")
    print(f"ambiguous rows resolved by history: {sum(1 for r in amb_rows if r['tier'] != 'CONFLICT')} of {len(amb_cands)} ({sum(1 for r in amb_rows if r['tier'] == 'CONFLICT')} conflicts)")
    print(f"tables: {len(tables)}; seasons identified: {sum(1 for s in season_log if s[5])}; new club matches: {n_ok} ({n_lk} on Lookup rows); "
          f"conflicts: {len(rows_out) - n_ok}; unresolved leftover sets: {len(unresolved)}; competitions crosswalked: {len(cw)}")

if __name__ == "__main__":
    main()
