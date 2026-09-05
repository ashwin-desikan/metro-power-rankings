#!/usr/bin/env python3
"""Club -> metro for the five continental Against Expectation ledgers.

    python scripts/football/build_esd_crosswalk.py --dry
    python scripts/football/build_esd_crosswalk.py --write

🔴 THE METRO IS THE PRODUCT, THE CLUB PAGE IS A BONUS. What the ledger needs to
join the metro board is a metro. Which club page holds the record is a separate,
STRICTER question, and conflating them is how a rating history gets rewritten.
So a club earns `metro` on weaker evidence than it earns `slug`, and a club can
carry a metro with no club link at all.

🔴 NEVER MATCH ON A SIMILARITY SCORE. Measured on this data, token overlap puts
`Espanyol Barcelona` closer to FC Barcelona (0.50) than to RCD Espanyol (0.33),
and `Atletico Tetuan`, a club that played out of Morocco, closest to Atlético de
Madrid. A scorer tuned to fix those two breaks a third. Every rule below is
deterministic and refuses on ambiguity.

RESOLUTION ORDER, strongest first:
  exact   the site club index, country-scoped, on a normalised name. slug+metro.
  loose   the same after dropping legal and sponsor tokens, ACCEPTED ONLY IF
          EXACTLY ONE site club survives. slug+metro.
  city    a place token in the club name that uniquely names one metro in that
          country, including one arm of a hyphenated conurbation. METRO ONLY:
          this says where the club plays, never which club it is.
  manual  MANUAL below, hand-checked, one line of reasoning each.
  else    UNRESOLVED must list it with a reason, or the build refuses.

The site's own club index decides the metro wherever it has an opinion, exactly
as MetroResolver does for England: one site, one answer.
"""
import argparse, json, os, re, sys, unicodedata
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
CLUB_INDEX = os.path.join(ROOT, "public", "data", "football", "index.json")
METROS = os.path.join(ROOT, "public", "data", "metros.json")
LEDGERS = os.path.join(ROOT, "public", "data", "football", "expectation", "intl")
OUT = os.path.join(HERE, "esd-club-crosswalk.json")

COUNTRY = {"spain": "Spain", "italy": "Italy", "germany": "Germany",
           "france": "France", "holland": "Netherlands"}

# Tokens that identify a legal form, a founding year or a sponsor, never a club.
NOISE = {
    "fc", "cf", "ac", "as", "sc", "ss", "ssc", "us", "usc", "cd", "ud", "rc",
    "rcd", "sv", "sd", "ca", "ce", "acf", "afc", "bv", "bvv", "vv", "vfb",
    "vfl", "tsv", "tsg", "fsv", "bsc", "sg", "spvgg", "dsc", "kfc", "calcio",
    "club", "de", "del", "der", "die", "the", "und", "and", "sport", "sports",
    "sportivo", "sportive", "association", "associazione", "footbal",
    "football", "voetbal", "olympique", "olimpico", "athletic", "atletico",
    "real", "sporting", "racing", "union", "unione", "stade", "stadio",
}
YEAR = re.compile(r"^(1[6-9]\d\d|0\d|\d{2})$")


def strip_accents(s):
    s = unicodedata.normalize("NFKD", s or "")
    return "".join(c for c in s if not unicodedata.combining(c))


def tokens(s):
    s = strip_accents(s).lower()
    s = s.replace("&", " ").replace("-", " ").replace("'", " ").replace(".", " ")
    return [t for t in re.sub(r"[^a-z0-9 ]", " ", s).split() if t]


def key_exact(s):
    return "".join(tokens(s))


def key_loose(s):
    """Drop legal, sponsor and year tokens, BUT NEVER ALL OF THEM. `Real Union`
    and `Racing Club de France` are made entirely of words that are noise
    elsewhere; stripping them leaves an empty key that matches nothing, or
    worse, matches every other club whose name also emptied out."""
    t = tokens(s)
    kept = [x for x in t if x not in NOISE and not YEAR.match(x)]
    return " ".join(kept if kept else t)


def load_site():
    clubs = json.load(open(CLUB_INDEX, encoding="utf-8"))["clubs"]
    exact, loose = defaultdict(dict), defaultdict(lambda: defaultdict(list))
    for c in clubs:
        ctry, name = c.get("country"), c.get("cur_name")
        if not ctry or not name:
            continue
        exact[ctry][key_exact(name)] = c
        loose[ctry][key_loose(name)].append(c)
    return exact, loose


def load_metros():
    d = json.load(open(METROS, encoding="utf-8"))
    rows = d["metros"] if isinstance(d, dict) and "metros" in d else d
    # place token -> set of metros. A conurbation answers to each of its arms,
    # so "Den Haag" reaches Rotterdam-The Hague the way Bradford reaches
    # Leeds-Bradford on the English board.
    place = defaultdict(set)
    by_slug = {}
    for r in rows:
        ctry, name, slug = r.get("country"), r.get("name"), r.get("slug")
        if not (ctry and name and slug):
            continue
        by_slug[slug] = r
        names = {name}
        if r.get("primaryCity"):
            names.add(r["primaryCity"])
        for n in list(names):
            for arm in n.split("-"):
                names.add(arm.strip())
        for n in names:
            k = " ".join(tokens(n))
            if k:
                place[(ctry, k)].add(slug)
    return place, by_slug


# Dutch and German clubs name their city in a form the metro file does not use.
CITY_ALIAS = {
    ("Netherlands", "den haag"): "the hague",
    ("Netherlands", "s gravenhage"): "the hague",
    ("Netherlands", "den bosch"): "s hertogenbosch",
    ("Germany", "munchen"): "munich",
    ("Germany", "koln"): "cologne",
    ("Germany", "nurnberg"): "nuremberg",
    ("Germany", "braunschweig"): "brunswick",
    ("Germany", "hannover"): "hanover",
    ("Italy", "milano"): "milan",
    ("Italy", "torino"): "turin",
    ("Italy", "roma"): "rome",
    ("Italy", "napoli"): "naples",
    ("Italy", "firenze"): "florence",
    ("Italy", "genova"): "genoa",
    ("Italy", "venezia"): "venice",
    ("Italy", "padova"): "padua",
    ("Spain", "sevilla"): "seville",
    ("Spain", "zaragoza"): "saragossa",
    ("France", "marseille"): "marseille",
}

# Hand-checked, one line of evidence each. A club earns `slug` only where the
# site index names the same club; where only the town is certain, `slug` stays
# null and the metro alone is asserted. That split is deliberate: a metro is a
# claim about where a club played, a slug is a claim about whose record it is.
def M(slug, metro_slug, why):
    return {"slug": slug, "metro": None, "metro_slug": metro_slug, "why": why}

MANUAL = {
    # --- Spain
    ("spain", "Arenas de Getxo"): M("arenas-de-guecho", "bilbao",
        "same club; the index carries the Spanish spelling Guecho and gives city=Getxo"),
    ("spain", "Real Union"): M("real-union-irun", "san-sebastian",
        "the index carries Real Union Irun; Irun sits in the San Sebastian metro"),
    # --- Italy
    ("italy", "Inter"): M("internazionale", "milan",
        "94 seasons, 1929-30 to 2024-25, i.e. every Serie A season: Internazionale"),
    ("italy", "US Anconitana"): M(None, "ancona",
        "one season, 1945-46, in Ancona; club lineage to the modern Ancona not asserted"),
    ("italy", "SPAL 1907 Ferrara"): M("spal", "ferrara",
        "index carries Spal but with no metro; the club is Ferrara"),
    ("italy", "AC Liguria"): M(None, "genoa",
        "five seasons 1937-38 to 1942-43, a Genoa club of that era; no index entry"),
    # --- Germany
    ("germany", "Bor. Monchengladbach"): M("borussia-monchengladbach", "rhine-ruhr",
        "Bor. is the standard abbreviation of Borussia"),
    ("germany", "Frankfurter SG Eintracht"): M("eintracht-frankfurt", "frankfurt",
        "the club formal name; the index carries Eintracht Frankfurt"),
    ("germany", "Rot-Weiss Essen"): M("rot-weiss-essen", "rhine-ruhr",
        "index spells it Rot-Weiss Essen with an eszett"),
    ("germany", "Rot-Weiss Oberhausen"): M("rot-weiss-oberhausen", "rhine-ruhr",
        "index spells it Rot-Weiss Oberhausen with an eszett"),
    ("germany", "Meidericher SV"): M("msv-duisburg", "rhine-ruhr",
        "Meiderich is a Duisburg district; the club became MSV Duisburg in 1967"),
    # --- France
    ("france", "Racing Club de France"): M("rc-france", "paris",
        "index carries RC France but with no metro; the club is Paris"),
    # AS Monaco plays in the French league from a metro the site files under
    # Monaco, not France. The country-scoped metro lookup cannot see it, so it
    # is named here rather than the lookup being loosened for everyone.
    ("france", "AS Monaco"): M("as-monaco", "monaco",
        "French league club, Monaco metro, filed under country Monaco"),
    ("france", "Chamois Niortais"): M("chamois-niort-fc", "niort",
        "index carries Chamois Niort FC, city Niort"),
    ("france", "Montpellier La Paillade SC"): M("montpellier-hsc", "montpellier",
        "the earlier name of Montpellier HSC"),
    ("france", "Stade Francais FC"): M("stade-francais", "paris",
        "index carries Stade Francais, city Paris"),
    ("france", "Stade Olympique Montpellierain"): M(None, "montpellier",
        "a Montpellier club; identity against Montpellier HSC not asserted"),
    ("france", "Stade de Paris FC"): M(None, "paris",
        "a Paris club; the index carries several and none is a clear match"),
    ("france", "Matra Racing"): M(None, "paris",
        "one season, 1987-88, the Paris Racing club under its sponsor name"),
    ("france", "AS Aixoise"): M(None, "marseille",
        "one season, 1967-68, Aix-en-Provence, which this site covers inside Marseille"),
    ("france", "Association Sportive Avignonaise"): M(None, "avignon",
        "an Avignon club; no index entry"),
    # --- Netherlands
    ("holland", "Feijenoord"): M("feyenoord", "rotterdam-the-hague",
        "the pre-1974 spelling of Feyenoord"),
    ("holland", "SBV Excelsior"): M("excelsior-rotterdam", "rotterdam-the-hague",
        "SBV Excelsior is the Rotterdam Excelsior, not the Haarlem one"),
    ("holland", "SBV Haarlem"): M("hfc-haarlem", "amsterdam",
        "the Haarlem club the index carries as HFC Haarlem"),
    ("holland", "FC Den Bosch '67"): M("fc-den-bosch", "den-bosch",
        "index carries FC Den Bosch, city Den Bosch"),
    ("holland", "BVV"): M("bvv-den-bosch", "den-bosch",
        "two seasons 1956-58; the index carries BVV Den Bosch"),
    ("holland", "Groninger VAV"): M(None, "groningen",
        "GVAV, the Groningen club that became FC Groningen in 1971; lineage not asserted"),
    ("holland", "FC Xerxes"): M(None, "rotterdam-the-hague",
        "a Rotterdam club; the index carries only the later merged XerxesDZB"),
    ("holland", "Xerxes/D.H.C."): M(None, "rotterdam-the-hague",
        "the Xerxes and DHC combination, Rotterdam and Delft, inside one metro"),
    # --- ruled by Ashwin, 2026-09-05. All four were declared unresolvable by
    # this script and all four were wrong to be: the metro existed each time.
    # Two of them he settled by naming the club current name, which is the
    # index own vocabulary, and two by naming the town.
    ("spain", "Atletico Tetuan"): M(None, "tetouan",
        "Tetouan. The index also carries Moghreb Tetouan, filed under country "
        "Spain with metro Tetouan, which looks like the successor club; the "
        "lineage was not ruled on, so no slug is asserted"),
    ("holland", "Rapid JC Heerlen"): M(None, "kerkrade",
        "Kerkrade. Consistent with Roda JC, the successor club, which the index "
        "already places in the Kerkrade metro"),
    ("holland", "Drechtsteden '79"): M("fc-dordrecht", "rotterdam-the-hague",
        "current name FC Dordrecht, which the index places in Rotterdam-The Hague"),
    ("holland", "SHS"): M("svv", "rotterdam-the-hague",
        "current name SVV, which the index places in Rotterdam-The Hague"),
}

# Declared as having no metro on this site. The build refuses on anything that
# is neither resolved nor listed here. These are not failures to try: in each
# case the town is known and the site simply publishes no metro for it, so
# inventing one would put a club in a place the rest of the site disagrees with.
UNRESOLVED = {}


def _all_places(ctry, toks, place):
    """True when every token names a town or metro in this country. Such a key
    locates a club, it does not identify one."""
    return bool(toks) and all((ctry, t) in place or
                              (ctry, CITY_ALIAS.get((ctry, t), t)) in place
                              for t in toks)


def resolve(country_slug, name, site_exact, site_loose, place):
    ctry = COUNTRY[country_slug]
    c = site_exact[ctry].get(key_exact(name))
    if c:
        return {"method": "exact", "slug": c.get("slug"), "metro": c.get("metro"),
                "site_name": c.get("cur_name")}
    cands = site_loose[ctry].get(key_loose(name), [])
    if len(cands) == 1:
        c = cands[0]
        return {"method": "loose", "slug": c.get("slug"), "metro": c.get("metro"),
                "site_name": c.get("cur_name")}
    # containment: one distinctive-token set wholly inside the other, and
    # EXACTLY ONE site club qualifying. `Vitesse` sits inside `Vitesse Arnhem`;
    # `Hertha BSC` inside `Hertha BSC Berlin`. It refuses on two candidates, so
    # `Espanyol Barcelona` still does not reach FC Barcelona: neither name
    # contains the other.
    mine = set(key_loose(name).split())
    if mine and not _all_places(ctry, mine, place):
        hit = []
        for k, cl in site_loose[ctry].items():
            if not k:
                continue
            theirs = set(k.split())
            if not (mine < theirs or theirs < mine):
                continue
            # 🔴 THE SMALLER SIDE MUST CARRY IDENTITY, NOT JUST A PLACE.
            # `TSV 1860 München` reduces to `munchen` once the legal token and
            # the founding year are stripped, and `munchen` is a subset of
            # `bayern munchen`. Containment therefore handed Bayern Munich's
            # entire record to 1860 Munich. A town name is not a club name: if
            # the shorter key is nothing but places, this is a coincidence of
            # geography and the match is refused.
            smaller = mine if len(mine) < len(theirs) else theirs
            if _all_places(ctry, smaller, place):
                continue
            hit += cl if False else [c for c in cl]
        uniq = {c["slug"]: c for c in hit if c.get("slug")}
        if len(uniq) == 1:
            c = next(iter(uniq.values()))
            return {"method": "contains", "slug": c.get("slug"),
                    "metro": c.get("metro"), "site_name": c.get("cur_name")}
    # city token -> metro only
    hits = set()
    toks = tokens(name)
    for i in (2, 1):
        for j in range(len(toks) - i + 1):
            frag = " ".join(toks[j:j + i])
            frag = CITY_ALIAS.get((ctry, frag), frag)
            got = place.get((ctry, frag))
            if got:
                hits |= got
    if len(hits) == 1:
        return {"method": "city", "slug": None, "metro": None,
                "metro_slug": next(iter(hits)), "site_name": None}
    return None


def self_test():
    """Regression guards for the two ways this script has been wrong."""
    ok = True
    site_exact, site_loose = load_site()
    place, _ = load_metros()

    # 1. A place-only key must never carry identity. `TSV 1860 München` reduces
    # to `munchen`, which is a subset of `bayern munchen`; before the guard,
    # containment handed Bayern Munich's whole record to 1860 Munich.
    r = resolve("germany", "Bayern Munchen", site_exact, site_loose, place)
    if r and r.get("slug") == "tsv-1860-munchen":
        ok = False; print("  FAIL Bayern Munchen resolves to TSV 1860 Munchen")
    elif r and r.get("metro_slug") == "munich" and not r.get("slug"):
        print("  ok  Bayern Munchen takes the Munich metro and no club page")
    else:
        ok = False; print("  FAIL Bayern Munchen resolved to %r" % (r,))

    # 2. The pair that made a similarity score untenable.
    r = resolve("spain", "Espanyol Barcelona", site_exact, site_loose, place)
    if not r or r.get("slug") != "rcd-espanyol":
        ok = False; print("  FAIL Espanyol Barcelona resolved to %r" % (r,))
    else:
        print("  ok  Espanyol Barcelona resolves to RCD Espanyol, not Barcelona")

    # 3. A name made entirely of otherwise-noise words must keep a key.
    if not key_loose("Real Union"):
        ok = False; print("  FAIL 'Real Union' reduces to an empty key")
    else:
        print("  ok  an all-noise name keeps its tokens")
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()
    if getattr(a, "self_test"):
        return self_test()
    if not (a.dry or a.write):
        ap.error("pass --self-test, --dry or --write")

    site_exact, site_loose = load_site()
    place, by_slug = load_metros()
    metro_slug_by_name = {}
    for slug, r in by_slug.items():
        metro_slug_by_name.setdefault((r.get("country"), r.get("name")), slug)

    out, stats, pending = {}, defaultdict(int), defaultdict(list)
    for cs in COUNTRY:
        p = json.load(open(os.path.join(LEDGERS, "%s.json" % cs), encoding="utf-8"))
        for cl in p["clubs"]:
            name = cl["club"]
            if (cs, name) in MANUAL:
                r = dict(MANUAL[(cs, name)]); r["method"] = "manual"
            elif (cs, name) in UNRESOLVED:
                r = {"method": "unresolved", "slug": None, "metro": None,
                     "metro_slug": None, "why": UNRESOLVED[(cs, name)]}
            else:
                r = resolve(cs, name, site_exact, site_loose, place)
            if r is None:
                pending[cs].append(name)
                stats["pending"] += 1
                continue
            if r.get("metro") and not r.get("metro_slug"):
                r["metro_slug"] = metro_slug_by_name.get((COUNTRY[cs], r["metro"]))
            if r.get("metro_slug") and not r.get("metro"):
                r["metro"] = by_slug[r["metro_slug"]]["name"]
            stats[r["method"]] += 1
            if r["method"] != "unresolved" and not r.get("metro_slug"):
                stats["no_metro"] += 1
            out["%s/%s" % (cs, name)] = r

    tot = sum(stats[k] for k in ("exact", "loose", "contains", "city", "manual",
                                 "unresolved", "pending"))
    print("clubs %d" % tot)
    for k in ("exact", "loose", "contains", "city", "manual", "unresolved",
              "pending", "no_metro"):
        print("  %-11s %d" % (k, stats[k]))
    if pending:
        print("\nUNDECIDED - add to MANUAL or UNRESOLVED:")
        for cs, v in pending.items():
            print("  %s (%d): %s" % (cs, len(v), ", ".join(sorted(v))))
        print("\nREFUSING to write while %d clubs are undecided." % stats["pending"])
        return 1
    if a.write:
        with open(OUT, "w", encoding="utf-8") as fh:
            json.dump(out, fh, indent=1, ensure_ascii=False, sort_keys=True)
        print("\nwrote %s (%d entries)" % (OUT, len(out)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
