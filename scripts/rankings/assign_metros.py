"""Assign a metro to each HQ era, reusing the mapping this project already curated.

`mktcap_geo` holds ~5,800 curated city -> metro rows across 535 metros, and it
already knows the thing that matters here: that Stamford, Greenwich and White
Plains are the New York metro, and Troy is Detroit. Building a second mapping
alongside it would drift; this reads it as the authority.

  python assign_metros.py             # resolve and report, write nothing
  python assign_metros.py --write     # set company_hq_spans.metro

  -> curation/metro_assignment.csv    every place and what it resolved to
  -> out/metro_skipped.json           the residue, for a ruling

🔴 NOTHING IS GUESSED. A city that does not resolve goes to the skipped file and
stays NULL in the table. The standing rule on this project is that an unresolved
city→metro is asked about, never inferred from proximity or name similarity.
"""
import argparse, csv, json, os, sys
from collections import defaultdict, Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import OUT, log, rest, select_all  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ASSIGN = os.path.join(HERE, "curation", "metro_assignment.csv")
SKIPPED = os.path.join(OUT, "metro_skipped.json")

# Names the rankings data uses that the geo table spells differently. Deliberately
# a tiny explicit list: every entry is a claim that two strings are the same place,
# and that claim should be reviewable rather than produced by a fuzzy matcher.
ALIAS = {
    "new york city": "new york",
    "fairfax county": "fairfax",
    "morris township": "morristown",
    "northville charter township": "northville",
    "mount olive township": "mount olive",
    "las colinas": "irving",          # a district of Irving, not a municipality
    "cobb county": "marietta",
}

# Keyed on (city, state) where the city alone is ambiguous or absent. Two kinds,
# both explicit claims rather than fuzzy matches:
#   - CONSOLIDATED GOVERNMENTS, where the Census name is not the common name.
#   - CDPs AND DISTRICTS that are not municipalities at all, mapped to the
#     incorporated place that contains them. Every one is a containment fact.
ALIAS_STATE = {
    # The Census keeps the "(balance)" suffix on a consolidated government, and it
    # is part of the name rather than a type, so strip_type() correctly leaves it.
    ("louisville", "kentucky"):
        "louisville/jefferson county metro government (balance)",
    ("nashville", "tennessee"):
        "nashville-davidson metropolitan government (balance)",
    ("washington", "district of columbia"): "washington",
    ("iselin", "new jersey"): "woodbridge",            # CDP in Woodbridge Township
    ("parsippany", "new jersey"): "parsippany-troy hills",
    ("old greenwich", "connecticut"): "greenwich",     # village within Greenwich
    ("armonk", "new york"): "north castle",            # hamlet in North Castle
    ("bethpage", "new york"): "oyster bay",            # CDP in Oyster Bay
    ("la jolla", "california"): "san diego",           # neighbourhood of San Diego
    ("ashburn", "virginia"): "leesburg",               # CDP in Loudoun County
    ("mclean", "virginia"): "vienna",                  # CDP in Fairfax County
    ("dakota dunes", "south dakota"): "north sioux city",
    ("dewitt", "new york"): "syracuse",                # town abutting Syracuse
    # From the company_hq pass: consolidated governments and CDPs again.
    ("indianapolis", "indiana"): "indianapolis city (balance)",
    ("the woodlands", "texas"): "houston",             # CDP, Montgomery County
    ("spring", "texas"): "houston",                    # CDP, Harris County
    ("reston", "virginia"): "herndon",                 # CDP, Fairfax County
    ("chantilly", "virginia"): "herndon",              # CDP, Fairfax County
    ("purchase", "new york"): "harrison",              # hamlet in Harrison
    ("long island city", "new york"): "new york",      # Queens
    ("hunt valley", "maryland"): "towson",             # CDP, Baltimore County
    ("dallas/ft worth airport", "texas"): "irving",
}


# 🔴 Places RULED as belonging to no metro area. This is a finding, not a gap.
# Without it, a settled question returns to the unresolved pile on every run and a
# rollup cannot tell "we do not know" from "there is nothing to know". Same
# principle as the countries board: absence is a positive assertion and needs a
# rule attached, never an empty cell someone infers meaning from.
NO_METRO = {
    ("denison", "iowa"): "Ashwin, 2026-08-17: Denison is no metro area",
}


# A state may arrive as a full name (the curated spans) or as a two-letter code
# (company_hq, which took Fortune's own column). The workbook uses full names, so
# a code has to be expanded or every lookup falls back to city-only and turns
# "New York, NY" into an ambiguous match.
STATE_NAME = {
 "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
 "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware",
 "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho",
 "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
 "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
 "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi",
 "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
 "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York",
 "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
 "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island",
 "SC": "South Carolina", "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas",
 "UT": "Utah", "VT": "Vermont", "VA": "Virginia", "WA": "Washington",
 "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming",
 "DC": "District of Columbia", "PR": "Puerto Rico",
}


def norm(s):
    return " ".join((s or "").lower().replace(".", "").split())


def norm_state(s):
    """Full name, lowercased, whether a code or a name came in."""
    raw = (s or "").strip()
    return norm(STATE_NAME.get(raw.upper(), raw))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()

    # 🔴 THE WORKBOOK IS THE AUTHORITY. MetroAreas.xlsx's Municipality sheet maps
    # 27,217 US municipalities to their metro. An earlier version of this script
    # used `mktcap_geo` — derived from companies listed TODAY — which knows 1,111
    # cities and had never needed Iselin, Piscataway or West Allis. It left 50
    # places unresolved and generated a sheet of questions the workbook answers.
    lookup = os.path.join(OUT, "municipality_lookup.json")
    if not os.path.exists(lookup):
        sys.exit("FATAL: run build_municipality_lookup.py first")
    L = json.load(open(lookup, encoding="utf-8"))
    by_city_state = {tuple(k.split("|", 1)): v for k, v in L["exact"].items()}
    by_city = {c: ms for c, ms in L["by_city"].items()}
    log(f"authority: {L['sheet']} sheet of MetroAreas.xlsx, {L['rows_kept']} US rows, "
        f"{len(by_city_state)} (municipality, state) pairs")

    spans = select_all("/rest/v1/company_hq_spans?select=company_key,company,"
                       "from_year,to_year,city,state,metro", "company_key,from_year")
    places = defaultdict(list)
    for s in spans:
        places[(s["city"], s.get("state") or "")].append(s)
    log(f"{len(spans)} eras across {len(places)} distinct places")

    rows, resolved, unresolved, no_metro = [], {}, [], {}
    for (city, state), ss in sorted(places.items(), key=lambda kv: -len(kv[1])):
        c, st = norm(city), norm_state(state)
        ruled_none = NO_METRO.get((c, st))
        c = ALIAS_STATE.get((c, st), ALIAS.get(c, c))
        metro = how = None
        if ruled_none:
            how = f"RULED: no metro area — {ruled_none}"
            no_metro[(city, state)] = ruled_none
            rows.append({"city": city, "state": state, "eras": len(ss),
                         "metro": "", "how": how,
                         "companies": "; ".join(sorted({s["company"] or s["company_key"]
                                                        for s in ss})[:6])})
            continue
        if (c, st) in by_city_state:
            metro, how = by_city_state[(c, st)], "municipality + state"
        elif c in by_city:
            cand = by_city[c]
            if len(cand) == 1:
                metro, how = cand[0], "municipality only, unambiguous"
            else:
                # A bare municipality name matching several metros is exactly the
                # Springfield/Portland/Columbus problem. Refuse it.
                how = f"AMBIGUOUS across {len(cand)} metros: {', '.join(cand[:4])}"
        else:
            how = "not in the Municipality sheet"

        rows.append({"city": city, "state": state, "eras": len(ss),
                     "metro": metro or "", "how": how,
                     "companies": "; ".join(sorted({s["company"] or s["company_key"]
                                                    for s in ss})[:6])})
        if metro:
            resolved[(city, state)] = metro
        else:
            unresolved.append({"city": city, "state": state, "eras": len(ss),
                               "reason": how,
                               "companies": sorted({s["company"] or s["company_key"]
                                                    for s in ss})})

    with open(ASSIGN, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["city", "state", "eras", "metro", "how",
                                          "companies"])
        w.writeheader(); w.writerows(rows)
    with open(SKIPPED, "w", encoding="utf-8") as f:
        json.dump({"note": "city->metro not resolved; ruled on by Ashwin, never guessed",
                   "places": unresolved}, f, indent=2)

    era_hit = sum(len(places[p]) for p in resolved)
    era_none = sum(len(places[p]) for p in no_metro)
    log(f"resolved {len(resolved)}/{len(places)} places, "
        f"covering {era_hit}/{len(spans)} eras ({era_hit/len(spans)*100:.1f}%)")
    if no_metro:
        log(f"ruled as NO metro area: {len(no_metro)} places / {era_none} eras "
            f"(settled, not missing)")
        for (cty, stt), why in no_metro.items():
            log(f"   {cty}, {stt} — {why}")
    log(f"unresolved places: {len(unresolved)}  -> {SKIPPED}")
    for u in unresolved[:15]:
        log(f"   {u['city']}, {u['state']}  ({u['eras']} eras)  {u['reason'][:60]}")
    log(f"-> {ASSIGN}")

    if not a.write:
        log("dry run (no --write); nothing sent to Supabase")
        return

    # PATCH by place, not upsert by key. An upsert would have to supply every
    # NOT NULL column (provenance among them) on a payload that only means to set
    # `metro`, and would overwrite the provenance we spent two rounds establishing.
    # One PATCH per resolved place updates all its eras and touches nothing else.
    from urllib.parse import quote
    hdr = {"Prefer": "return=minimal"}
    n = 0
    def patch(city, state, payload):
        q = f"city=eq.{quote(city, safe='')}"
        if state:
            q += f"&state=eq.{quote(state, safe='')}"
        rest("PATCH", f"/rest/v1/company_hq_spans?{q}", body=payload, headers=hdr)

    for (city, state), metro in sorted(resolved.items()):
        patch(city, state, {"metro": metro, "metro_status": "assigned"})
        n += len(places[(city, state)])
    log(f"metro set on {n} eras across {len(resolved)} places")

    # Write the ruling explicitly. metro stays NULL because there IS no metro, but
    # metro_status records that we know that, so it never reads as missing data.
    for (city, state), why in sorted(no_metro.items()):
        patch(city, state, {"metro": None, "metro_status": "no_metro"})
        log(f"ruled no_metro: {city}, {state} ({len(places[(city, state)])} eras)")
    log("done")


if __name__ == "__main__":
    main()
