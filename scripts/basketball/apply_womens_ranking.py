#!/usr/bin/env python3
"""Push the fetched FIBA Women's World Ranking into the Cup's ranking feed.

This is the step that closes the loop. fetch_fiba_ranking.py --gender women
writes scripts/basketball/fiba_ranking_women.json; this maps its IOC codes onto
engine slugs and rewrites the "Women's Basketball" block of
public/data/rankings/zzc-extra.json, which the Zone Zero Cup reads through
extra_ranking_contribs. The weekly mini job runs both, then the Cup rebuild
picks the new numbers up on its own.

WHY THE MAPPING IS LOUD. Before 2026-09-04 the women's basketball ranking here
was a hand-kept top ten, and when it was first replaced with the real table two
nations were silently dropped, Mali and Bosnia and Herzegovina, because the slug
check ran against olympics/teams.json, which knows only the 151 nations that have
ever won an Olympic medal. Mali has been in three of the last four Afrobasket
finals. So the slug universe here is countries.json, which is the whole world,
and anything that still fails to map is printed and counted; past a threshold the
script exits non-zero rather than quietly writing a shorter ranking. A ranking
that loses countries is worse than no ranking, because it looks complete.

Run: python scripts/basketball/apply_womens_ranking.py [--dry-run]
Stdlib only.
"""
import io
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
DATA = os.path.join(ROOT, "public", "data")
SRC = os.path.join(HERE, "fiba_ranking_women.json")
DEST = os.path.join(DATA, "rankings", "zzc-extra.json")
SPORT = "Women's Basketball"
MAX_UNMAPPED = 12
MIN_MAPPED = 60

# IOC codes whose engine slug is not simply the country's lowercased name, plus
# the handful FIBA spells its own way. Keep this list short and explicit: a
# guessed mapping credits the wrong country, which is worse than dropping one.
IOC_SLUG = {
    "USA": "united-states", "GBR": "great-britain", "KOR": "south-korea",
    "PRK": "north-korea", "TPE": "chinese-taipei", "CIV": "ivory-coast",
    "COD": "congo-dr", "CGO": "congo", "CPV": "cape-verde", "TUR": "turkey",
    "IRI": "iran", "RSA": "south-africa", "PUR": "puerto-rico",
    "BIH": "bosnia-herzegovina", "CZE": "czechia", "NED": "netherlands",
    "GER": "germany", "SUI": "switzerland", "DEN": "denmark", "CRO": "croatia",
    "SLO": "slovenia", "SVK": "slovakia", "LAT": "latvia", "LTU": "lithuania",
    "GRE": "greece", "POR": "portugal", "MNE": "montenegro", "SRB": "serbia",
    "HKG": "hong-kong", "UAE": "united-arab-emirates", "DOM": "dominican-republic",
    "SSD": "south-sudan", "ESA": "el-salvador", "CRC": "costa-rica",
    "ISV": "united-states-virgin-islands", "IVB": "british-virgin-islands", "VIN": "st-vincent-and-the-grenadines",
    "ANT": "antigua-barbuda", "TTO": "trinidad-tobago", "MAS": "malaysia",
    "INA": "indonesia", "PHI": "philippines", "SIN": "singapore", "VIE": "vietnam",
    "NGR": "nigeria", "ALG": "algeria", "EGY": "egypt", "MAD": "madagascar",
    "MTN": "mauritania", "NZL": "new-zealand", "COK": "cook-islands",
    "BUL": "bulgaria", "MKD": "north-macedonia", "MDA": "moldova",
    "KSA": "saudi-arabia", "BRU": "brunei", "SRI": "sri-lanka", "NEP": "nepal",
    "BAN": "bangladesh", "CHI": "chile", "URU": "uruguay", "PAR": "paraguay",
    "SUD": "sudan", "ZIM": "zimbabwe", "ZAM": "zambia", "BOT": "botswana",
    "GEQ": "equatorial-guinea", "GUI": "guinea", "GBS": "guinea-bissau",
    "LBA": "libya", "LBN": "lebanon", "PLE": "palestine", "TAH": "tahiti",
    "FIJ": "fiji", "SAM": "samoa", "PNG": "papua-new-guinea",
}


# Names FIBA spells differently from countries.json. The IOC code resolves most
# nations on its own, but the fetcher records a null code for some federations,
# so the name path has to be able to stand alone.
NAME_SLUG = {
    "turkiye": "turkey", "türkiye": "turkey",
    "czechia": "czechia", "czech republic": "czechia",
    "great britain": "great-britain", "united kingdom": "great-britain",
    "bosnia and herzegovina": "bosnia-herzegovina",
    "chinese taipei": "chinese-taipei", "taiwan": "chinese-taipei",
    "virgin islands": "united-states-virgin-islands",
    "dr congo": "congo-dr", "congo dr": "congo-dr",
    "st.vincent and the grenadines": "st-vincent-and-the-grenadines",
    "st vincent and the grenadines": "st-vincent-and-the-grenadines",
    "hong kong, china": "hong-kong", "hong kong": "hong-kong",
    "korea": "south-korea", "korea republic": "south-korea",
    "ivory coast": "ivory-coast", "cote d'ivoire": "ivory-coast",
    "cape verde": "cape-verde", "north macedonia": "north-macedonia",
    "united states": "united-states", "usa": "united-states",
}


def slug_universe():
    """Every slug the Cup engine will actually recognise, and a name index.

    NOT countries.json alone. That file is the site's country directory and uses
    its own spellings, czech-republic and united-kingdom and taiwan, where the
    engine says czechia and great-britain and chinese-taipei. Validating against
    it would reject four real nations as unknown. The engine's own slug universe
    is the previous zone-zero-cup.json build, with countries.json folded in so a
    nation the Cup does not yet score is still recognised.
    """
    by_slug, by_name = set(), {}
    cup = os.path.join(DATA, "zone-zero-cup.json")
    if os.path.exists(cup):
        for r in json.load(io.open(cup, encoding="utf-8")).get("nations") or []:
            if r.get("slug"):
                by_slug.add(r["slug"])
                n = (r.get("name") or "").strip().lower()
                if n:
                    by_name.setdefault(n, r["slug"])
    doc = json.load(io.open(os.path.join(DATA, "countries.json"), encoding="utf-8"))
    rows = doc if isinstance(doc, list) else doc.get("countries") or []
    for r in rows:
        if r.get("slug"):
            by_slug.add(r["slug"])
            n = (r.get("name") or "").strip().lower()
            if n:
                by_name.setdefault(n, r["slug"])
    return by_slug, by_name


def resolve(team, by_slug, by_name):
    ioc = (team.get("ioc") or "").upper()
    if ioc in IOC_SLUG:
        s = IOC_SLUG[ioc]
        return s if s in by_slug else None
    name = (team.get("country") or "").strip().lower()
    if name in NAME_SLUG and NAME_SLUG[name] in by_slug:
        return NAME_SLUG[name]
    if name in by_name:
        return by_name[name]
    guess = name.replace("'", "").replace(".", "").replace(" ", "-")
    return guess if guess in by_slug else None


def main():
    dry = "--dry-run" in sys.argv
    if not os.path.exists(SRC):
        sys.exit("missing %s; run fetch_fiba_ranking.py --gender women first" % SRC)
    src = json.load(io.open(SRC, encoding="utf-8"))
    teams = src.get("teams") or []
    by_slug, by_name = slug_universe()

    ranks, unmapped = [], []
    for t in teams:
        s = resolve(t, by_slug, by_name)
        if s:
            ranks.append([s, int(t["rank"])])
        else:
            unmapped.append("%s (%s, rank %s)" % (t.get("country"), t.get("ioc"), t.get("rank")))
    ranks.sort(key=lambda r: r[1])

    if unmapped:
        print("UNMAPPED, no rank credited:")
        for u in unmapped:
            print("   ", u)
    print("mapped %d of %d teams, ranking date %s" % (len(ranks), len(teams), src.get("date")))
    assert len(ranks) >= MIN_MAPPED, "sanity: only %d mapped (< %d)" % (len(ranks), MIN_MAPPED)
    assert len(unmapped) <= MAX_UNMAPPED, (
        "sanity: %d unmapped nations (> %d). Add them to IOC_SLUG rather than "
        "letting the ranking quietly shrink." % (len(unmapped), MAX_UNMAPPED))

    doc = json.load(io.open(DEST, encoding="utf-8"))
    before = len(doc["sports"].get(SPORT, {}).get("ranks") or [])
    if dry:
        print("dry run: would write %d ranks (was %d)" % (len(ranks), before))
        return
    doc["sports"][SPORT] = {"ranks": ranks}
    doc.setdefault("_meta", {})["asOf"] = src.get("date")
    with io.open(DEST, "w", encoding="utf-8", newline="\n") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print("wrote %s: %s now %d ranks (was %d)" % (DEST, SPORT, len(ranks), before))


if __name__ == "__main__":
    main()
