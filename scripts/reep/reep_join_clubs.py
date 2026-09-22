#!/usr/bin/env python3
"""
Dry-run join: Champions League-201516.xlsx `Lookup` (men's club source of truth)
against the Reep Register teams file (CC0).

Writes nothing to the workbook or to Supabase. Emits:
  out/reep_club_matches.csv     one row per Lookup row, with tier + reep_id + QID + provider keys
  out/reep_club_ambiguous.csv   Lookup rows with more than one candidate (never auto-picked)
  out/reep_club_unmatched.csv   Lookup rows with no candidate
  out/reep_club_summary.txt     coverage by tier and by country

Usage:
  python reep_join_clubs.py --lookup Lookup.csv --reep reep/data/teams.csv --names reep/data/names.csv --out out/
  (Lookup.csv is the `Lookup` sheet dumped as-is; header row = sheet row 1.)

Matching rules (no fuzzy scoring, ever):
  T1  strict-normalised name  + country match, exactly one candidate
  T2a edge-normalised name (form tokens stripped from the ends only) + country, exactly one candidate
  T2b loose-normalised name (all form tokens stripped) + country, exactly one candidate
  (each of the above runs first against Reep primary names, then again with Wikidata aliases; the
   alias pass is tagged "-alias" in the tier column)
  T3  strict-normalised primary name, exactly one candidate worldwide, Reep country blank
  NAT national teams (Lookup Club column starts with "Country"): matched by country to the senior men's
      entity (national_football_teams bridge, or label equal to the country), never by name
  AMB more than one candidate at the first tier that produced any
  NONE no candidate at any tier
Strict normalisation: NFKD -> ASCII, lowercase, punctuation -> space, collapse spaces.
Loose normalisation: strict, then drop club-form tokens (fc, cf, sc, ac, afc, ... see FORM_TOKENS)
and a leading/trailing parenthetical.
"""
import argparse, csv, re, sys, unicodedata
from collections import defaultdict
from pathlib import Path

# Lookup country label -> extra Reep country labels to try after the label itself. Reep v0 (Wikidata)
# says United Kingdom; Reep v1 says England / Scotland / Wales / Northern Ireland, so both are tried.
COUNTRY_MAP = {
    "England": ["United Kingdom"], "Scotland": ["United Kingdom"], "Wales": ["United Kingdom"],
    "Northern Ireland": ["United Kingdom"],
    "Congo DR": ["DR Congo", "Democratic Republic of the Congo"], "Congo": ["Republic of the Congo"],
    "São Tomé and Príncipe": ["Sao Tome and Principe", "São Tomé Príncipe", "São Tomé e Príncipe"],
    "Brunei": ["Brunei Darussalam"], "Macau": ["Macao"], "Taiwan": ["Chinese Taipei"],
    "Soviet Union": ["USSR"], "Zaire": ["DR Congo"],
    "China": ["People's Republic of China"], "Côte d'Ivoire": ["Ivory Coast"],
    "Macedonia": ["North Macedonia"], "Bosnia-Herzegovina": ["Bosnia and Herzegovina"],
    "Trinidad & Tobago": ["Trinidad and Tobago"], "St. Kitts & Nevis": ["St. Kitts and Nevis", "Saint Kitts and Nevis"],
    "St. Vincent & the Grenadines": ["St. Vincent and the Grenadines", "St. Vincent / Grenadines", "Saint Vincent and the Grenadines"],
    "Gambia": ["The Gambia"],
    "East Timor": ["Timor-Leste"], "Swaziland": ["Eswatini"], "Bahamas": ["The Bahamas"],
    "Antigua & Barbuda": ["Antigua and Barbuda"], "East Germany": ["German Democratic Republic", "Germany"],
    "Saar": ["Germany"], "US Virgin Islands": ["United States Virgin Islands"],
    "Turks & Caicos Islands": ["Turks and Caicos Islands"], "South Vietnam": ["Vietnam"],
    "South Yemen": ["Yemen"], "Tahiti": ["France"], "New Caledonia": ["France"], "Réunion": ["France"],
    "Guadeloupe": ["France"], "Martinique": ["France"], "French Guiana": ["France"], "Mayotte": ["France"],
    "Saint Martin": ["France"], "Saint Barthélemy": ["France"], "Saint Pierre and Miquelon": ["France"],
    "Wallis and Futuna": ["France"], "Bermuda": ["United Kingdom"], "Cayman Islands": ["United Kingdom"],
    "Montserrat": ["United Kingdom"], "Falkland Islands": ["United Kingdom"], "Chagos Islands": ["United Kingdom"],
    "Guam": ["United States"], "American Samoa": ["United States"], "Northern Mariana Islands": ["United States"],
    "Cook Islands": ["New Zealand"], "Niue": ["New Zealand"], "Netherlands Antilles": ["Curaçao", "Netherlands"],
    "Bonaire": ["Netherlands"], "Zanzibar": ["Tanzania"], "Somaliland": ["Somalia"], "Kurdistan": ["Iraq"],
    "Tibet": ["People's Republic of China"], "Western Sahara": ["Morocco"], "Nauru": ["Nauru"],
    "Marshall Islands": ["Marshall Islands"],
}

# National teams only: a renamed state is the same team (Soviet Union -> USSR). A territory's parent
# state is NOT (Saar is not Germany, Kurdistan is not Iraq), so COUNTRY_MAP is not used for them.
NAT_RENAMES = {
    "Soviet Union": ["USSR"], "Zaire": ["DR Congo"], "Congo DR": ["DR Congo"], "East Germany": ["East Germany"],
    "Swaziland": ["Eswatini"], "Macedonia": ["North Macedonia"], "Taiwan": ["Chinese Taipei"], "Macau": ["Macao"],
    "Brunei": ["Brunei Darussalam"], "Côte d'Ivoire": ["Ivory Coast"], "Czech Republic": ["Czech Republic", "Czechia"],
    "São Tomé and Príncipe": ["Sao Tome and Principe", "São Tomé e Príncipe"], "Bosnia-Herzegovina": ["Bosnia-Herzegovina"],
    "St. Kitts & Nevis": ["St. Kitts and Nevis"], "St. Vincent & the Grenadines": ["St. Vincent and the Grenadines"],
    "Trinidad & Tobago": ["Trinidad and Tobago"], "Antigua & Barbuda": ["Antigua and Barbuda"], "Gambia": ["Gambia", "The Gambia"],
    "East Timor": ["Timor-Leste"], "Turks & Caicos Islands": ["Turks and Caicos Islands"], "US Virgin Islands": ["US Virgin Islands"],
    "Netherlands Antilles": ["Netherlands Antilles"], "Bahamas": ["Bahamas"], "China": ["China"],
}

FORM_TOKENS = {
    "fc", "cf", "sc", "ac", "afc", "cd", "ca", "cs", "ud", "ad", "sd", "as", "us", "fk", "nk", "sk", "kf", "ks",
    "club", "clube", "futebol", "football", "futbol", "fussball", "calcio", "sportclub", "sport", "sports",
    "sportif", "sportive", "sportivo", "sportiva", "deportivo", "deportiva", "atletico", "athletic",
    "the", "de", "da", "do", "del", "di", "la", "le", "el", "los", "las", "of", "und", "e", "y", "et",
    "esporte", "esportiva", "esportivo", "clube", "associacao", "associacion", "asociacion", "association",
    "verein", "sv", "tsv", "vfb", "vfl", "fsv", "spvgg", "tsg", "sg", "fv", "bsc", "bv", "1", "1st",
    "athletico", "ssc", "ssd", "asd", "cfp", "ss", "ac", "gs", "ae", "pae",
    "cska", "fk", "pfc", "pfk", "ofk", "kf", "sk", "ks", "mks", "lks", "gks", "zks", "rks", "ks", "vv", "sv",
    "sc", "rc", "rcd", "ue", "cp", "ce", "cdf", "sad", "sa",
}

# Deterministic exclusion: when a name matches more than one Reep record, drop records that are plainly
# not the senior men's club. Applied only to break a tie, never to create a match from nothing.
NOT_SENIOR_MEN = re.compile(
    r"(women|womens|women's|ladies|feminin|femenin|feminil|frauen|dames|"
    r"\bu-?\d\d\b|under-?\d\d|\bu\d\d\b|youth|junior|academy|reserve|\bii\b|\biii\b|\bb\b|b-team|"
    r"season\b|futsal|beach|esports|e-sports|amateur)", re.I)

WOMEN = re.compile(r"(women|womens|women's|ladies|feminin|femenin|feminil|femminile|frauen|dames|kvinner|kvinnor|damer|kobiet|zenska|ženska|\bw\b|\bwfc\b|\bwsc\b)", re.I)
YOUTH = re.compile(r"(\bu-?\d\d\b|under-?\d\d|youth|junior|juniors|academy|reserve|reserves|b-team|\bjong\b|\bii\b|\biii\b|\bb\b)", re.I)

BASES = set()   # edge-normalised name of every entity; filled in main, used to tell 'Willem II' from 'Sturm Graz II'
BASE_TOKENS = defaultdict(set)   # country -> set of frozenset(tokens) of every entity name
LOOKUP_BASES = set()   # (edge-normalised Team name, country) of every Lookup row: 'Olympiakos CFP B' is a reserve because
                       # 'Olympiakos CFP' is itself a Lookup row, whatever Reep calls the parent club
RES_MARK = re.compile(r"\b(u-?\d\d|under \d\d|next gen|ii|iii|b|reserve|reserves|res)$")
def reserve_base(name):
    """'Juventus U23' -> 'juventus', 'Olympiakos CFP B' -> 'olympiakos cfp', 'Jong Ajax' -> 'ajax'; '' for a senior name."""
    n = strict_norm(name); toks = n.split()
    if toks and toks[0] == "jong": return edge_norm(" ".join(toks[1:]))
    m = RES_MARK.search(n)
    return edge_norm(n[:m.start()]) if m and m.start() > 0 else ""

def side_flag(name: str, country: str = None) -> str:
    """'' for a senior side, else a marker. A reserve marker (II, III, B) counts only as the LAST token, so
    'B 1913' and 'Holbæk B&I' stay senior and 'Sturm Graz II' does not. Lookup carries reserve and U21
    sides as rows of their own (they sit in league tables), so both sides carry the flag and a match
    requires the flags to agree: a senior row never lands on a reserve entity and vice versa."""
    n = strict_norm(name); toks = n.split()
    if re.search(r"\bu-?\d\d\b|under \d\d|youth|junior|juniors|academy|reserve|reserves|\bres\b|b team|next gen", n) or (toks and toks[0] == "jong"):
        return "youth"
    if len(toks) >= 2 and toks[-1] in ("ii", "iii", "b"):
        base = edge_norm(" ".join(toks[:-1])); bt = set(base.split())
        # 'Willem II' is a senior club (no entity 'Willem' exists); 'Sturm Graz II' is a reserve side, and so is
        # 'HB Tórshavn II' because the entity 'HB' sits inside the base name, and 'Olympiakos CFP B' because
        # 'Olympiakos CFP' is a Lookup row of the same country.
        if country is None or base in BASES or (base, country) in LOOKUP_BASES or any(e <= bt for e in BASE_TOKENS.get(country, ())):
            return "reserve"
    return ""
# "united", "city", "town" are deliberately NOT form tokens: stripping them merges Manchester United,
# Manchester City and F.C. United of Manchester (measured 2026-09-22).

INITIALISM = re.compile(r"\b(?:[A-Za-z]\.){2,}")   # A.F.C. -> AFC, S.S.C. -> SSC

# letters NFKD cannot decompose: without this 'Zagłębie' becomes 'zagebie' and never meets 'Zaglebie'
TRANSLIT = str.maketrans({"ł": "l", "Ł": "L", "ø": "o", "Ø": "O", "đ": "d", "Đ": "D", "ß": "ss", "æ": "ae", "Æ": "Ae",
                          "œ": "oe", "Œ": "Oe", "ð": "d", "Ð": "D", "þ": "th", "Þ": "Th", "ı": "i", "ħ": "h", "Ħ": "H"})

def strict_norm(s: str) -> str:
    s = INITIALISM.sub(lambda m: m.group(0).replace(".", ""), s)
    s = unicodedata.normalize("NFKD", s.translate(TRANSLIT)).encode("ascii", "ignore").decode()
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()

def edge_norm(s: str) -> str:
    """Strip form tokens and years only from the ends: 'Manchester United F.C.' -> 'manchester united',
    'FC Bayern Munich' -> 'bayern munich'. Inner tokens are kept."""
    s = re.sub(r"\([^)]*\)", " ", s)
    toks = strict_norm(s).split()
    def junk(t): return t in FORM_TOKENS or re.fullmatch(r"1[89]\d\d|20\d\d", t)
    while toks and junk(toks[0]): toks.pop(0)
    while toks and junk(toks[-1]): toks.pop()
    return " ".join(toks)

def loose_norm(s: str) -> str:
    s = re.sub(r"\([^)]*\)", " ", s)
    toks = [t for t in strict_norm(s).split() if t not in FORM_TOKENS and not re.fullmatch(r"1[89]\d\d|20\d\d", t)]
    return " ".join(toks)

def read_csv(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lookup", required=True); ap.add_argument("--reep", required=True)
    ap.add_argument("--names", required=True); ap.add_argument("--out", required=True)
    a = ap.parse_args()
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)

    reep = read_csv(a.reep)
    names = read_csv(a.names)
    key_cols = [c for c in reep[0].keys() if c.startswith("key_")]

    # alias table keyed by QID -> set of alias strings
    alias_by_qid = defaultdict(set)
    for r in names:
        if r["key_wikidata"]:
            alias_by_qid[r["key_wikidata"]].add(r["alias"])

    # index: (norm, country) -> [reep rows]; (norm,) -> [reep rows]
    idx_strict_c, idx_edge_c, idx_loose_c, idx_strict_any = defaultdict(set), defaultdict(set), defaultdict(set), defaultdict(set)
    by_id = {}
    def is_national_entity(r):
        """The country's national team: label equals its country and it carries a national_football_teams
        bridge but no ClubElo (AS Monaco is filed as 'Monaco' with a national_football_teams bridge AND ClubElo)."""
        return bool(r.get("key_national_football_teams")) and strict_norm(r["name"]) == strict_norm(r["country"]) and not r.get("key_clubelo")
    for r in reep:
        BASES.add(edge_norm(r["name"]))
        e = edge_norm(r["name"]).split()
        if e and not (e[-1] in ("ii", "iii", "b")): BASE_TOKENS[r["country"]].add(frozenset(e))
    for r in reep:
        by_id[r["reep_id"]] = r
        if WOMEN.search(r["name"]) or r.get("key_gender") == "women":
            continue   # women's sides are never candidates for the men's Lookup
        variants = [(r["name"], True)] + [(a, False) for a in alias_by_qid.get(r["key_wikidata"], set())]
        for v, primary in variants:
            if not v: continue
            sn, en, ln = strict_norm(v), edge_norm(v), loose_norm(v)
            tag = (r["reep_id"], primary)
            if sn:
                idx_strict_c[(sn, r["country"])].add(tag)
                idx_strict_any[sn].add(tag)
            if en:
                idx_edge_c[(en, r["country"])].add(tag)
            if ln:
                idx_loose_c[(ln, r["country"])].add(tag)

    lookup = read_csv(a.lookup)
    # the dumped sheet has duplicate header names; DictReader keeps the LAST of duplicates, so re-read raw
    with open(a.lookup, newline="", encoding="utf-8") as f:
        rows = list(csv.reader(f))
    hdr = rows[0]
    def col(name, nth=0):
        hits = [i for i, h in enumerate(hdr) if h == name]
        return hits[nth]
    C = {k: col(k) for k in ["Team", "City", "Metro Area", "Country", "Lookup", "UEFA Name", "EFS Name",
                             "Cur. Name", "API Name", "API Name 2", "UEFA Name 2", "UEFA Name 3", "Level", "Club"]}
    for row in rows[1:]:
        for k in ("Team", "Lookup"):
            if row[C[k]]: LOOKUP_BASES.add((edge_norm(row[C[k]]), row[C["Country"]]))
    # reserve/youth Reep entities by (parent base, country): 'Juventus U21', 'Juventus Next Gen', 'Juventus II' all sit under ('juventus','Italy')
    res_idx = defaultdict(set)
    for r in reep:
        if WOMEN.search(r["name"]) or r.get("key_gender") == "women": continue
        for v in [r["name"]] + list(alias_by_qid.get(r["key_wikidata"], set())):
            if v and side_flag(v, r["country"]):
                b = reserve_base(v)
                if b: res_idx[(b, r["country"])].add(r["reep_id"])
    # National teams (Lookup `Club` column = Country / Country - Rename / Country - Defunct) match by COUNTRY,
    # not by name: the senior men's side is the entity in that country whose label carries no age or
    # women's marker and that has a national_football_teams bridge (Reep v1) or whose label equals the
    # country (v0). Reep v1 gives age-group sides the bare country name as an alias (China PR U22 has
    # alias "China"), so a name match lands on the wrong entity. Measured 2026-09-22.
    by_country = defaultdict(list)
    NAT_LABEL = re.compile(r"^(.*?)\s+national\s+(association\s+)?football\s+team$", re.I)
    for r in reep:
        if not NOT_SENIOR_MEN.search(r["name"]) and r.get("key_gender", "men") in ("men", ""):
            by_country[r["country"]].append(r["reep_id"])

    matches, amb, none, defects = [], [], [], []
    tier_count = defaultdict(int)
    per_country = defaultdict(lambda: [0, 0])
    for i, row in enumerate(rows[1:], start=2):
        team = row[C["Team"]]
        country = row[C["Country"]]
        # The row's own name first. `Cur. Name` is tried only when nothing else matches: the workbook carries
        # paste errors there (Persijap Jepara and Malut United both say "Sriwijaya"), and a wrong Cur. Name
        # must not outvote the Team name. Rows where Cur. Name alone would have matched a different entity
        # are written to reep_workbook_defects.csv.
        names_team = [row[C[k]] for k in ["Team", "Lookup"] if row[C[k]]]
        names_alt = [row[C[k]] for k in ["UEFA Name", "UEFA Name 2", "UEFA Name 3", "EFS Name", "API Name", "API Name 2"] if row[C[k]]]
        names_cur = [row[C["Cur. Name"]]] if row[C["Cur. Name"]] else []
        names_own = names_team + names_alt
        cands_names = names_own
        # Try the Lookup label as-is first (Reep v1 uses England/Scotland), then the Wikidata labels (v0).
        rc_list = [country] + [c for c in COUNTRY_MAP.get(country, []) if c != country]
        found, tier = set(), None
        is_national = row[C["Club"]].startswith("Country")
        if is_national:
            # A territory's own label first (Wales, Réunion); the parent state (United Kingdom, France)
            # only if the territory has no entity of its own.
            for rc in [country] + [c for c in NAT_RENAMES.get(country, []) if c != country]:
                cands = by_country.get(rc, [])
                senior = [rid for rid in cands if by_id[rid].get("key_national_football_teams", "")]
                if not senior:
                    def nat_label(rid):
                        n = by_id[rid]["name"]; m = NAT_LABEL.match(n)
                        return strict_norm(m.group(1)) if m else strict_norm(n)
                    senior = [rid for rid in cands if nat_label(rid) in {strict_norm(n) for n in cands_names} | {strict_norm(rc)}]
                # Accept only when the Lookup row IS that country's team (Team == Country), or the Reep
                # label shares a token with the team name, or the country is a known rename. Saba sits
                # under Country = Bonaire in Lookup and must not become Bonaire's team.
                ok = (team == country) or any(
                    set(strict_norm(team).split()) & set(strict_norm(by_id[rid]["name"]).split()) or rc in NAT_RENAMES.get(country, [])
                    for rid in senior)
                if senior and ok:
                    found, tier = set(senior), "NAT"; break
            # a national-team row is matched by country or not at all; it never falls through to club name matching
            if not found:
                per_country[country][1] += 1; none.append({"sheet_row": i, "team": team, "city": row[C["City"]], "metro_area": row[C["Metro Area"]],
                    "country": country, "level": row[C["Level"]]}); tier_count["NONE"] += 1
                continue
        # Pass 1 uses only Reep primary names; pass 2 adds Wikidata aliases. A community alias
        # ("Manchester United" on F.C. United of Manchester) must never outrank a primary label.
        lf = side_flag(team, country)
        def run_tiers(names_to_try):
            f, t = set(), None
            for primary_only, sfx in ((True, ""), (False, "-alias")):
                def hits(idx, key):
                    return {rid for rid, p in idx.get(key, set()) if (p or not primary_only)
                            and not is_national_entity(by_id[rid]) and (side_flag(by_id[rid]["name"], by_id[rid]["country"]) == "") == (lf == "")}
                for tname, idx, fn in (("T1", idx_strict_c, strict_norm), ("T2a", idx_edge_c, edge_norm), ("T2b", idx_loose_c, loose_norm)):
                    for nm in names_to_try:
                        for rc in rc_list:
                            f |= hits(idx, (fn(nm), rc))
                    if f:
                        t = tname + sfx; break
                if f: break
            return f, t
        if not found:
            # priority: the Team name itself, then the UEFA/EFS/API spellings, then Cur. Name; a lower-priority
            # column that points elsewhere is reported as a workbook defect, never used to overrule the Team name
            found, tier = run_tiers(names_team)
            for label, extra in (("alt", names_alt), ("curname", names_cur)):
                if not extra: continue
                f_x, t_x = run_tiers(extra)
                if found and f_x and f_x != found:
                    defects.append({"sheet_row": i, "team": team, "country": country, "column": label, "value": " / ".join(extra),
                                    "team_matches": " | ".join(by_id[r]["name"] for r in sorted(found)),
                                    "column_matches": " | ".join(by_id[r]["name"] for r in sorted(f_x)),
                                    "note": f"{label} column points at a different entity than Team; check the workbook cell"})
                elif not found and f_x:
                    found, tier = f_x, t_x + "-" + label
        for primary_only, sfx in ():
            def hits(idx, key):
                # club rows never land on a national-team entity, and the reserve/youth flag must agree
                return {rid for rid, p in idx.get(key, set()) if (p or not primary_only)
                        and not is_national_entity(by_id[rid]) and (side_flag(by_id[rid]["name"], by_id[rid]["country"]) == "") == (lf == "")}
            for tname, idx, fn in (("T1", idx_strict_c, strict_norm), ("T2a", idx_edge_c, edge_norm), ("T2b", idx_loose_c, loose_norm)):
                for nm in cands_names:
                    for rc in rc_list:
                        found |= hits(idx, (fn(nm), rc))
                if found:
                    tier = tname + sfx; break
            if found: break
        # T2r: a reserve/youth row matches the reserve/youth entities of the same parent club ('Juventus U23' ->
        # every non-senior Reep entity under 'juventus'); the II/B/U21/U23/Next Gen marker is not compared, because
        # the workbook and Reep name the same second team differently. Age groups under 20 are excluded unless the
        # row carries that age itself. Several candidates go to the disambiguator (current-season table decides).
        if not found and not is_national and lf:
            for nm in names_own:
                b = reserve_base(nm)
                if not b: continue
                row_age = re.search(r"\bu-?(1\d)\b|under (1\d)", strict_norm(nm))
                for rc in rc_list:
                    for rid in res_idx.get((b, rc), set()):
                        cand_age = re.search(r"\bu-?(1\d)\b|under (1\d)", strict_norm(by_id[rid]["name"]))
                        if cand_age and not row_age: continue
                        if not is_national_entity(by_id[rid]): found.add(rid)
            if found: tier = "T2r"
        # T3: strict primary name, worldwide unique, Reep country blank
        if not found and not is_national:
            for nm in cands_names:
                ids = {rid for rid, p in idx_strict_any.get(strict_norm(nm), set()) if p and not is_national_entity(by_id[rid])}
                if len(ids) == 1 and by_id[next(iter(ids))]["country"] == "":
                    found |= ids
            if found: tier = "T3"
        if len(found) > 1 and not is_national:
            keep = {rid for rid in found if side_flag(by_id[rid]["name"], by_id[rid]["country"]) == side_flag(team, country)}
            if len(keep) >= 1:
                found = keep
        per_country[country][1] += 1
        base = {"sheet_row": i, "team": team, "city": row[C["City"]], "metro_area": row[C["Metro Area"]],
                "country": country, "level": row[C["Level"]]}
        if not found:
            none.append(base); tier_count["NONE"] += 1
        elif len(found) > 1:
            cs = [by_id[r] for r in sorted(found)]
            withkeys = [c for c in cs if any(c[k] for k in key_cols if k != "key_wikidata")]
            suggest = withkeys[0]["reep_id"] if len(withkeys) == 1 else ""
            amb.append({**base, "tier": tier, "n_candidates": len(cs), "suggested_if_only_one_has_keys": suggest,
                        "candidates": " | ".join(f'{c["reep_id"]}:{c["name"]}:{c["country"]}:{c["key_wikidata"]}' for c in cs)})
            tier_count["AMB"] += 1
        else:
            r = by_id[next(iter(found))]
            m = {**base, "tier": tier, "reep_id": r["reep_id"], "reep_name": r["name"], "reep_country": r["country"],
                 "reep_stadium": r["stadium"], "reep_founded": r["founded"]}
            for k in key_cols: m[k] = r[k]
            matches.append(m); tier_count[tier] += 1; per_country[country][0] += 1

    def dump(name, rows_):
        if not rows_: Path(out, name).write_text(""); return
        with open(out / name, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(rows_[0].keys())); w.writeheader(); w.writerows(rows_)
    dump("reep_club_matches.csv", matches); dump("reep_club_ambiguous.csv", amb); dump("reep_club_unmatched.csv", none)
    dump("reep_workbook_defects.csv", defects)

    total = len(rows) - 1
    lines = [f"Lookup rows: {total}", f"workbook defects (Cur. Name disagrees with Team): {len(defects)}", ""]
    for t in ["NAT", "T1", "T2a", "T2b", "T1-alias", "T2a-alias", "T2b-alias", "T2r", "T3", "AMB", "NONE"]:
        lines.append(f"{t:5} {tier_count[t]:6}  {100*tier_count[t]/total:5.1f}%")
    matched = sum(v for t, v in tier_count.items() if t not in ("AMB", "NONE"))
    lines += ["", f"matched (all T tiers): {matched} ({100*matched/total:.1f}%)", ""]
    for lv in ["1", "2", "3"]:
        tot = sum(1 for r in rows[1:] if r[C["Level"]] == lv)
        mt = sum(1 for m in matches if m["level"] == lv)
        am = sum(1 for m in amb if m["level"] == lv)
        lines.append(f"Level {lv}: {mt}/{tot} matched ({100*mt/max(tot,1):.1f}%), {am} ambiguous")
    lines.append("")
    # provider key fill among matched
    lines.append("provider keys present among matched rows:")
    for k in key_cols:
        n = sum(1 for m in matches if m[k]); lines.append(f"  {k:28} {n:6}")
    lines += ["", "coverage by country (matched/total), worst 25 among countries with >=20 rows:"]
    worst = sorted(((v[0] / v[1], c, v) for c, v in per_country.items() if v[1] >= 20))[:25]
    for pct, c, v in worst: lines.append(f"  {c:28} {v[0]:5}/{v[1]:<5} {100*pct:5.1f}%")
    Path(out, "reep_club_summary.txt").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))

if __name__ == "__main__":
    main()
