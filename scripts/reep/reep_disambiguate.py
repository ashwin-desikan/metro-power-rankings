#!/usr/bin/env python3
"""
Disambiguation with evidence, for rows the name matcher left with several candidates.

Each rule below is deterministic and is applied in order; a rule decides only when it leaves exactly
one candidate. Every decision carries the rule name and the evidence it used, so a wrong pick can be
traced and the rule fixed rather than the row.

  R1 exact       the Lookup name (Team, Cur. Name, UEFA Name, API Name) equals one candidate's label
  R2 subset      after expanding club-form abbreviations (CA -> club atletico, CD -> club deportivo, ...),
                 every distinctive token of the Lookup name is in one candidate's label and that candidate
                 carries NO distinctive token the Lookup name lacks ('CA Del Plata' -> 'Club Atlético Del
                 Plata', not 'La Plata Fútbol Club'; 'Johnstone' -> 'Johnstone F.C.', not 'Johnstone Athletic')
  R3 city        the Lookup City or Metro Area appears in one candidate's label or aliases
                 ('Club de Gimnasia y Esgrima' in Jujuy -> 'Gimnasia Jujuy')
  R4 api-id      the workbook's API Teams id for this row equals one candidate's api_football key
  R5 qualifier   a parenthetical in the Lookup name ('(SP)', '(1881)', '(old)') matches one candidate's
                 aliases, founding year or label
  R6 duplicate   the candidates carry the identical label and exactly one has any provider key beyond
                 Wikidata (a Wikidata duplicate item); applied, but listed for review
  R7 current     the Lookup row has a Level (it plays now) and exactly one candidate sat in a current season;
                 runs right after R1, before the name rules, because a dead namesake can be the better name match
  else           ruling, with every rule's evidence written out

Usage: reep_disambiguate.py --lookup Lookup.csv --apiteams API_Teams.csv --amb <ambiguous.csv> --teams <teams csv>
       --names <aliases csv> [--latest reep_team_descriptors.csv] --out <decisions.csv>
"""
import argparse, csv, re, sys
from collections import defaultdict
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from reep_join_clubs import strict_norm, edge_norm, FORM_TOKENS, WOMEN, side_flag, BASES, BASE_TOKENS

# Each abbreviation lists full alternatives; an alternative counts only when ALL its words are present.
ABBREV = {
    "ca": [("club", "atletico")], "cd": [("club", "deportivo"), ("clube", "desportivo")], "cs": [("club", "sportivo")],
    "cf": [("club", "futbol"), ("club", "de", "futbol")], "sc": [("sport", "club"), ("sporting", "club"), ("sport", "clube"), ("sporting", "clube")],
    "ec": [("esporte", "clube")], "fc": [("futebol", "clube"), ("football", "club"), ("fussball", "club"), ("futbol", "club")],
    "ac": [("atletico", "clube"), ("athletic", "club"), ("associazione", "calcio"), ("atletico", "club")],
    "sd": [("sociedad", "deportiva")], "ud": [("union", "deportiva")], "ad": [("asociacion", "deportiva"), ("agrupacion", "deportiva")],
    "as": [("association", "sportive"), ("associazione", "sportiva")], "us": [("union", "sportive"), ("unione", "sportiva")],
    "rc": [("racing", "club")], "ss": [("societa", "sportiva")], "gd": [("grupo", "desportivo")], "afc": [("association", "football", "club")],
    "sv": [("sportverein",)], "tsv": [("turn", "und", "sportverein")], "vfb": [("verein", "fur", "bewegungsspiele")],
    "fk": [("fotbollsklubb",), ("fudbalski", "klub"), ("futbalovy", "klub")], "ik": [("idrottsklubben",)], "if": [("idrottsforening",)],
}
FULL_TO_ABBR = {}
for ab, alts in ABBREV.items():
    for alt in alts:
        for w in alt: FULL_TO_ABBR.setdefault(w, set()).add(ab)

IGNORE = {"1", "1st", "the"}
# club-type suffixes: 'Johnstone' and 'Johnstone F.C.' are the same name; 'Johnstone Athletic' is not
SUFFIX = {"fc", "afc", "cf", "sc", "ac", "ec", "club", "clube", "calcio", "fk", "sk", "ik", "if", "bk", "kf", "nk", "sv", "tsv",
          "klub", "cd", "ca", "cs", "ud", "sd", "ad", "as", "us", "rc", "ss", "gd", "vfb", "vfl", "fsv", "bsc", "pfc", "ofk", "mks", "lks", "gks"}
def year(t): return bool(re.fullmatch(r"1[89]\d\d|20\d\d|\d\d", t))

def toks(name):
    return [t for t in strict_norm(re.sub(r"\([^)]*\)", " ", name)).split()]

def content(name):
    """Every token except years and pure ordinals. Articles and form words are kept on purpose: they are
    what separates 'La Plata' from 'Del Plata' and 'Johnstone' from 'Johnstone Athletic'."""
    return [t for t in toks(name) if not year(t) and t not in IGNORE]

def covered(t, mine, theirs):
    """Token t of one name is accounted for by the other name: present verbatim; or t is an abbreviation
    and one of its full alternatives is spelled out in theirs; or t is a full word and the other side
    carries an abbreviation whose alternative, containing t, is fully spelled out on MY side."""
    if t in theirs: return True
    if t in ABBREV and any(set(alt) <= theirs for alt in ABBREV[t]): return True
    for ab in FULL_TO_ABBR.get(t, ()):
        if ab in theirs and any(t in alt and set(alt) <= mine for alt in ABBREV[ab]): return True
    return False

def qualifier(name):
    m = re.search(r"\(([^)]+)\)", name)
    return strict_norm(m.group(1)) if m else ""

def rd(p):
    with open(p, newline="", encoding="utf-8-sig") as f: return list(csv.DictReader(f))

def main():
    ap = argparse.ArgumentParser()
    for k in ["lookup", "apiteams", "amb", "teams", "names", "out"]: ap.add_argument("--" + k, required=True)
    ap.add_argument("--latest", default="")
    ap.add_argument("--tables", default="", help="site_tables.csv, for the founding-year rule")
    a = ap.parse_args()

    teams = {r["reep_id"]: r for r in rd(a.teams)}
    for r in teams.values():
        BASES.add(edge_norm(r["name"])); e = edge_norm(r["name"]).split()
        if e and e[-1] not in ("ii", "iii", "b"): BASE_TOKENS[r["country"]].add(frozenset(e))
    key_cols = [k for k in next(iter(teams.values())) if k.startswith("key_") and k not in ("key_wikidata", "key_gender", "key_namespaces", "key_status")]
    aliases = defaultdict(set)
    for r in rd(a.names):
        if r.get("key_wikidata"): aliases[r["key_wikidata"]].add(r["alias"])
    def cand_aliases(c):   # v1 aliases are keyed by reep id (stored in key_wikidata); v0 by QID
        return aliases.get(c["key_wikidata"], set()) | aliases.get(c["reep_id"], set())
    latest = {}
    if a.latest and Path(a.latest).exists():
        latest = {r["reep_v1_id"]: int(r["latest_season"]) for r in rd(a.latest) if r["latest_season"]}
    CURRENT = max(latest.values()) - 1 if latest else 9999

    lookup = rd(a.lookup); L = {str(i): r for i, r in enumerate(lookup, start=2)}
    span = {}   # (team, country) -> (first table year, last table year)
    if a.tables and Path(a.tables).exists():
        for r in rd(a.tables):
            try: y = int(float(r["end_year"]))
            except ValueError: continue
            k = (r["team"], r["country"]); lo, hi = span.get(k, (9999, 0)); span[k] = (min(lo, y), max(hi, y))
    api = {}
    for r in rd(a.apiteams):
        if r["Team Name"] and r["Team Name"] not in api: api[r["Team Name"]] = r["Team ID"]

    decisions = []
    for row in rd(a.amb):
        sr = row["sheet_row"]; lk = L[sr]
        cands = list({c.split(":")[0]: teams[c.split(":")[0]] for c in row["candidates"].split(" | ") if c.split(":")[0] in teams}.values())
        cands = [c for c in cands if not WOMEN.search(c["name"]) and c.get("key_gender", "") != "women"] or cands
        lf = side_flag(lk["Team"], lk["Country"])
        cands = [c for c in cands if (side_flag(c["name"], c["country"]) == "") == (lf == "")] or cands
        if len(cands) == 1:
            decisions.append({"sheet_row": sr, "team": lk["Team"], "country": lk["Country"], "city": lk.get("City", ""), "level": lk.get("Level", ""),
                              "decision": cands[0]["reep_id"], "decision_label": cands[0]["name"], "rule": "R0 side", "why": "the other candidates are women's, reserve or youth sides",
                              "candidates": row["candidates"], "rules_tried": "R0"}); continue
        names = [lk[k] for k in ("Team", "Cur. Name", "UEFA Name", "API Name") if lk.get(k)]
        team = lk["Team"]; tried = []
        pick, rule, why = None, "", ""
        qualifier_failed = False

        # R1 exact
        hits = [c for c in cands if any(strict_norm(c["name"]) == strict_norm(n) for n in names)]
        tried.append(f"R1 exact: {len(hits)}")
        if len(hits) == 1: pick, rule, why = hits[0], "R1 exact", f"label equals '{[n for n in names if strict_norm(hits[0]['name']) == strict_norm(n)][0]}'"

        # R4 api-football id. Ashwin 2026-09-22: the workbook's API Teams ids take precedence over every other rule.
        if not pick and lk.get("API Name") and api.get(lk["API Name"]):
            aid = api[lk["API Name"]]
            hits = [c for c in cands if aid in c.get("key_api_football", "").split("|")]
            tried.append(f"R4 api id {aid}: {len(hits)}")
            if len(hits) == 1: pick, rule, why = hits[0], "R4 api-id", f"workbook API Teams id {aid} matches"

        # The pool: candidates whose label accounts for every token of the Lookup name (abbreviations
        # expanded) and whose parenthetical, if any, names this club's place. Every later rule chooses
        # WITHIN the pool; a candidate that does not carry the club's name cannot win on a date or a season.
        need = content(team); mine = set(need)
        place = {t for p in (lk.get("City", ""), lk.get("Metro Area", "")) for t in strict_norm(p).split()}
        def in_pool(c):
            theirs = set(content(c["name"])); q = qualifier(c["name"])
            if q and not (set(q.split()) & (place | mine)): return False
            return all(covered(t, mine, theirs) for t in need)
        pool = [c for c in cands if in_pool(c)]
        same_label = len({strict_norm(c["name"]) for c in cands}) == 1
        if same_label: pool = cands
        # the loose pool ignores club-type suffixes on the Lookup side ('FC Arges' is carried by 'Argeș');
        # used only by the current-season rule, which has its own evidence
        need_core = [t for t in need if t not in SUFFIX]
        loose_pool = [c for c in cands if all(covered(t, mine, set(content(c["name"]))) for t in need_core)
                      and not (qualifier(c["name"]) and not (set(qualifier(c["name"]).split()) & (place | mine)))]
        tried.append(f"pool (carry the name): {[c['name'] for c in pool]}")

        # R7 current season for levelled rows: a row with a Level plays NOW, so a candidate that stopped playing
        # years ago is a predecessor or namesake whatever its name says. Runs before the name rules.
        if not pick and lk.get("Level") in ("1", "2", "3", "4") and latest and loose_pool:
            cur = [c for c in loose_pool if latest.get(c["reep_id"], 0) >= CURRENT]
            tried.append(f"R7 current: {len(cur)} of {len(loose_pool)} name-carrying candidates sat in a {CURRENT}+ season")
            if len(cur) == 1: pick, rule, why = cur[0], "R7 current", f"Level {lk['Level']} row; only this candidate played in {latest[cur[0]['reep_id']]}"

        # R2 subset with zero extras
        if not pick:
            scored, detail = [], []
            lookup_has_suffix = any(t in SUFFIX for t in need)
            seen = set()
            for c in cands:
                if c["reep_id"] in seen: continue
                seen.add(c["reep_id"])
                theirs = set(content(c["name"]))
                q = qualifier(c["name"])
                # a candidate qualified with another place ('Al-Merreikh (Obayed)' for a club in Omdurman) is not this club
                if q and not (set(q.split()) & (place | mine)):
                    detail.append(f"{c['name']}: qualifier '{q}' is not this club's place"); continue
                if all(covered(t, mine, theirs) for t in need):
                    extras = {u for u in content(c["name"]) if not covered(u, theirs, mine)} - place   # the club's own city is not an extra
                    if not lookup_has_suffix: extras -= SUFFIX   # 'Johnstone' == 'Johnstone F.C.'
                    if not lookup_has_suffix: extras = {u for u in extras if not (u in ABBREV and any(set(alt) <= (SUFFIX | {"club", "clube"}) for alt in ABBREV[u]))}
                    scored.append((len(extras), c, extras)); detail.append(f"{c['name']}: extras {sorted(extras)}")
                else:
                    detail.append(f"{c['name']}: missing {[t for t in need if not covered(t, mine, theirs)]}")
            zero = [x for x in scored if x[0] == 0]
            tried.append(f"R2 subset: " + "; ".join(detail))
            if len(zero) == 1: pick, rule, why = zero[0][1], "R2 subset", "; ".join(detail)

        # R3 city
        if not pick:
            places = {p for p in (lk.get("City", ""), lk.get("Metro Area", "")) if p}
            # a city token already inside the club's own name proves nothing (Mar del Plata / La Plata / Del Plata)
            ptoks = {t for p in places for t in strict_norm(p).split() if len(t) >= 4 and t not in set(toks(team))}
            hits = []
            for c in cands:
                bag = set(toks(c["name"])) | {t for al in cand_aliases(c) for t in toks(al)}
                if ptoks & bag: hits.append(c)
            tried.append(f"R3 city {sorted(ptoks)}: {len(hits)}")
            if len(hits) == 1: pick, rule, why = hits[0], "R3 city", f"city token {sorted(ptoks & (set(toks(hits[0]['name'])) | {t for al in cand_aliases(hits[0]) for t in toks(al)}))} in label or alias"

        # R5 qualifier in parentheses
        if not pick:
            q = re.findall(r"\(([^)]+)\)", team) or [t for t in toks(team) if year(t) and not any(t in toks(c["name"]) for c in cands)]
            if q:
                qn = strict_norm(q[0]); hits = []
                for c in cands:
                    bag = strict_norm(c["name"]) + " " + " ".join(strict_norm(al) for al in cand_aliases(c)) + " " + c.get("founded", "")
                    if qn and qn in bag: hits.append(c)
                tried.append(f"R5 qualifier '{q[0]}': {len(hits)}")
                if len(hits) == 1: pick, rule, why = hits[0], "R5 qualifier", f"'{q[0]}' found in label, alias or founding year"
                elif not hits: qualifier_failed = True   # the row names a year or place no candidate has: none of them is it

        # R6 identical-label duplicates: the keyed one
        if not pick and same_label and not qualifier_failed:
            keyed = [c for c in cands if any(c.get(k) for k in key_cols)]
            tried.append(f"R6 duplicate label: {len(keyed)} of {len(cands)} carry provider keys")
            if len(keyed) == 1: pick, rule, why = keyed[0], "R6 duplicate", "identical labels; only this one carries provider keys (the other is a Wikidata duplicate item)"

        # R8 founding year against the club's own table years (v0 carries `founded`). Two franchises with one
        # name (Toronto Blizzard 1971 and 1986): the one founded before the club's first table season, and
        # among those the latest, is the one that played those seasons.
        if not pick and (team, lk["Country"]) in span and len(pool) >= 2:
            lo, hi = span[(team, lk["Country"])]
            dated = [(int(c["founded"][:4]), c) for c in pool if re.match(r"\d{4}", c.get("founded", ""))]
            ok = [(y, c) for y, c in dated if y <= lo + 1]
            tried.append(f"R8 founded vs tables {lo}-{hi}: founded {[y for y, _ in dated]}, {len(ok)} founded before first season")
            ok.sort(key=lambda x: x[0])
            if len(dated) == len(pool) and ok and (len(ok) == 1 or ok[-1][0] > ok[-2][0]):
                y, c = ok[-1]; pick, rule, why = c, "R8 founded", f"founded {y}; the club's tables run {lo}-{hi}; other candidates founded {[yy for yy, cc in dated if cc is not c]}"

        # R6b identical labels, several keyed: Reep's own duplicate. Take the richer record when it is
        # clearly richer (at least 3 providers and at least twice the other's count); either id names the
        # same club, so the choice is about which record carries the bridges we want.
        if not pick and same_label and not qualifier_failed:
            counts = sorted(((sum(1 for k in key_cols if c.get(k)), c) for c in cands), key=lambda x: -x[0])
            tried.append(f"R6b richer duplicate: provider counts {[n for n, _ in counts]}")
            if len(counts) >= 2 and counts[0][0] >= 3 and counts[0][0] >= 2 * counts[1][0]:
                pick, rule, why = counts[0][1], "R6b richer duplicate", f"identical labels; {counts[0][0]} providers against {counts[1][0]} (Reep duplicate record)"

        # R6c identical labels, none keyed: two Wikidata items for one club. Either QID names the club; take
        # the item that carries a founding date or a stadium, else the older (lower-numbered) item.
        if not pick and same_label and not qualifier_failed and not any(c.get(k) for c in cands for k in key_cols):
            info = sorted(cands, key=lambda c: (-(bool(c.get("founded")) + bool(c.get("stadium"))), int(re.sub(r"\D", "", c.get("key_wikidata", "0") or "0") or 0)))
            tried.append("R6c bare duplicate: no provider keys on any candidate")
            pick, rule, why = info[0], "R6c bare duplicate", "identical labels, no provider keys on either; took the item with founding/stadium data, else the older Wikidata item"

        decisions.append({"sheet_row": sr, "team": team, "country": lk["Country"], "city": lk.get("City", ""), "level": lk.get("Level", ""),
                          "decision": pick["reep_id"] if pick else "", "decision_label": pick["name"] if pick else "", "rule": rule, "why": why,
                          "candidates": " | ".join(f"{c['reep_id']}={c['name']}" for c in cands), "rules_tried": "; ".join(tried)})
    with open(a.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(decisions[0].keys())); w.writeheader(); w.writerows(decisions)
    n = sum(1 for d in decisions if d["decision"])
    by = defaultdict(int)
    for d in decisions: by[d["rule"] or "unresolved"] += 1
    print(f"{len(decisions)} ambiguous rows: {n} decided, {len(decisions) - n} left; by rule: {dict(by)}")

if __name__ == "__main__":
    main()
