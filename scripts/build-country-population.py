#!/usr/bin/env python3
"""build-country-population.py - annual population history per country page.

WHY A SECOND POPULATION NUMBER. The workbook is already ground truth for a
country's current population and stays that way; nothing here overwrites it.
What the site has never had is the SHAPE: Japan peaked in 2009 and has been
shrinking since, Nigeria is 5.3x its 1960 self, and Ukraine has lost a fifth of
its people this century. A single current figure cannot say any of that, and
the shape is the part that explains the metro rankings underneath it.

Reads Supabase's country_population (loaded by
scripts/business/load_population_series.py from Our World in Data) and joins it
to the site's country slugs through country-indicators.json, which already
carries the iso3 for each slug. Writes a single local JSON, because this
changes once a year and has no business going through the GH-raw ISR path that
exists for daily data.

TWO KINDS OF YEAR, AND WHY IT MATTERS HERE (2026-08-14). The source series is
1800-2023 estimates plus 2024-2025 UN WPP projections, tagged `kind` in the
table. This script keeps them apart on purpose:

  * The CHART gets everything, 1800-2025, so the line reaches the present.
  * Every HEADLINE - the ranked figure, the share of world, the peak, the
    decline from it - is computed on ESTIMATES ONLY.

That second rule is the whole point. "Past its peak" is a claim about what has
happened; if a projection is allowed to set the peak, the site starts telling
readers a country has begun shrinking because a forecast says it will. Same for
rank: a projected rank is a guess about 2025 wearing the clothes of a fact.
The projected tail is carried separately as projectedTo/projectedValue so the
page can show it clearly labelled rather than blended into the headline.

usage:
  python scripts/build-country-population.py --self-test
  python scripts/build-country-population.py --dry
  python scripts/build-country-population.py
"""
import datetime, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(HERE, "business"))
from load_market_series import service_key, rest, log  # noqa: E402

INDICATORS = os.path.join(ROOT, "public", "data", "country-indicators.json")
OUT = os.path.join(ROOT, "public", "data", "country-population.json")
WORLD = "WLD"
PAGE = 1000

# A country whose modern territory has a PREDECESSOR the source covers and the
# modern code does not. Ireland is the only one: IRL is the 26 counties and
# begins in 1950, while OWID's uncoded "Ireland (whole island)" runs 1800-1920
# and is the only place the Great Famine appears - 8.15m in 1841 down to 6.77m
# by 1851. Attached as a SEPARATE series, never concatenated, because the drop
# from 4.32m in 1920 to 2.91m in 1950 is mostly partition rather than
# emigration, and one continuous line would state that as depopulation.
# No scalar on the page is computed from it.
PRIOR_SERIES = {
    "IRL": ("IRL_WHOLE", "the whole island, before partition"),
}

# ---------------------------------------------------------------- polities --
# States that existed and ended, for the Time Machine's polity view. Curated
# here because the leaders layer cannot supply it: _defunct.json holds 104
# polities but they are the ancient and medieval ones plus a scatter of modern
# oddities, and the three dissolutions this view exists for - the USSR,
# Yugoslavia, Czechoslovakia - are all absent from it.
#
# `replaces` is the set of MODERN site slugs whose territory the polity covered.
# While a polity is alive its replaces-set is suppressed from the top level and
# available underneath it, which is the expandable breakdown this feature was
# asked for.
#
# 🔴 VALUE = SUM OF PARTS, NOT THE SOURCE'S OWN PARENT SERIES, wherever a
# replaces-set exists. Verified 2026-08-14 and the reason is not cosmetic:
#
#     USSR 1927/1956/1990   sum vs OWID parent   +0.000% every time
#     Czechoslovakia        within 0.18%
#     Yugoslavia 1991       +3.3%
#     Serbia and Montenegro +1.7% to +3.4%
#     Ethiopia (former)     -3.8%
#
# OWID's parent series for the Balkan and Ethiopian cases come from a different
# construction (round Gapminder-style estimates) than the UN WPP back-casts its
# successor territories carry. Displaying the parent series while offering the
# children as its breakdown would put a visible contradiction on the page: the
# rows would not add up to the total directly above them. Summing the atoms
# makes the two views consistent BY CONSTRUCTION, which is the entire premise
# of this design. The source's own parent series is kept as `sourceSeries` so
# the divergence is inspectable rather than discarded.
#
# `partitionOf` marks a polity that was a SLICE of one modern country rather
# than a parent of several - East and West Germany, the two Yemens. There is
# nothing to sum for those, so they use the source series and say so.
# ---------------------------------------------------- the land empires ------
# COLDAT covers EUROPEAN OVERSEAS colonies and nothing else, so without this
# block the board asserted that Ukraine and Poland were independent states in
# 1914. They were not, and neither was most of central and eastern Europe.
# Sovereignty was the DEFAULT for any territory no rule claimed, which turned
# the absence of information into a positive claim - the exact failure the rest
# of this design exists to avoid. Ashwin caught it on the 1914 board.
#
# Curated, because no dataset supplies it: COW's system membership answers "was
# there a state called X" but not "whose was this ground", and V-Dem's coverage
# is not a sovereignty test (it codes Finland separately in 1914 while Finland
# was a Grand Duchy of Russia). Dates are the conventional ones and are listed
# here so they can be argued with rather than discovered by reading code.
#
# WHOLE TERRITORIES ONLY. A modern country appears under an empire only if
# essentially all of it sat inside that empire. Anything split between two or
# more powers goes in PARTITIONED below and is never summed into either, so no
# empire total double-counts and none of them silently swallows a territory it
# only half-held.
# A member is a slug, or [slug, joined] when it joined LATER than the empire's
# own start year. Without that the Russian Empire would hold Turkmenistan in
# 1800, eighty-five years before the conquest of Merv, and the board would be
# making up history in the confident voice it uses for everything else.
LAND_EMPIRES = [
    {"code": "LAND_RUS", "name": "Russian Empire", "from": 1800, "to": 1917,
     "replaces": [
        "russia", "belarus", "lithuania", "latvia", "estonia",   # by the 1795 partitions
        ["georgia", 1801], ["azerbaijan", 1813], ["moldova", 1812],  # Bessarabia
        ["finland", 1809], ["armenia", 1828],
        ["kazakhstan", 1847], ["uzbekistan", 1868], ["tajikistan", 1868],
        ["kyrgyzstan", 1876], ["turkmenistan", 1885],
     ]},
    # 🔴 THE AUSTRIAN EMPIRE WAS PROCLAIMED IN 1804, so a row starting there
    # left 1800-1803 uncovered and the board showed Bohemia, Hungary, Croatia,
    # Slovakia and Slovenia as five sovereign states in 1800. The ground was
    # held throughout - by the Habsburg Monarchy, the composite realm the
    # Empire was declared out of - so it gets its own row rather than the
    # Empire being back-dated to a title it did not yet hold.
    {"code": "LAND_HAB", "name": "Habsburg Monarchy", "from": 1800, "to": 1803,
     "replaces": ["austria", "hungary", "czech-republic", "slovakia", "slovenia",
                  "croatia"]},
    # Before the 1867 Compromise the same ground was the Austrian Empire, and
    # without this Czechia and Hungary read as sovereign states in 1850.
    {"code": "LAND_AUS", "name": "Austrian Empire", "from": 1804, "to": 1866,
     "replaces": ["austria", "hungary", "czech-republic", "slovakia", "slovenia",
                  "croatia"]},
    {"code": "LAND_AUH", "name": "Austria-Hungary", "from": 1867, "to": 1918,
     "replaces": ["austria", "hungary", "czech-republic", "slovakia", "slovenia",
                  "croatia", ["bosnia-herzegovina", 1878]]},   # occupied 1878, annexed 1908
    # 🔴 THE OTTOMAN EMPIRE WAS NOT AN ARAB EMPIRE. The first version of this
    # row held the Levant and Iraq and stopped, which left the Balkans and
    # Ottoman North Africa outside it - so the empire's total understated it by
    # roughly a third of its people, and Greece, Bulgaria, Albania, Macedonia,
    # Kosovo and Bosnia were rendered as their own rows tagged "partitioned"
    # rather than sitting inside the state that actually governed them. Ashwin
    # asked for the Balkans specifically; North Africa and Cyprus are the same
    # omission pointing south.
    #
    # Each member carries its OWN LEAVE YEAR, because the empire did not end in
    # one piece - it was dismantled over ninety years, and a single end date
    # would put Greece inside it in 1900 and Turkey outside it in 1880.
    # Dates are the settlements, not the first shot fired: Greece 1830 (London
    # Protocol), Serbia and Bosnia and Bulgaria and Cyprus 1878 (Berlin),
    # Albania, Macedonia and Kosovo 1912-13 (the Balkan Wars).
    {"code": "LAND_OTT", "name": "Ottoman Empire", "from": 1800, "to": 1922,
     "replaces": [
        "turkey", "syria", "lebanon", "jordan", "israel", "palestine", "iraq",
        # --- the Balkans ---
        ["greece", 1800, 1829],
        ["serbia", 1800, 1877],              # autonomous from 1815, independent at Berlin
        ["bosnia-herzegovina", 1800, 1877],  # Austria-Hungary takes over in 1878
        ["bulgaria", 1800, 1877],
        ["north-macedonia", 1800, 1912],
        ["albania", 1800, 1911],
        ["kosovo", 1800, 1912],
        ["cyprus", 1800, 1877],              # British administration from 1878
        # --- North Africa. Autonomous in practice, Ottoman in law, and in
        # every case it was a EUROPEAN POWER that ended the arrangement.
        ["algeria", 1800, 1829],             # France, 1830
        ["tunisia", 1800, 1880],             # France, 1881
        ["libya", 1800, 1910],               # Italy, 1911
        ["egypt", 1800, 1881],               # Britain occupies in 1882
        # --- the Gulf ---
        ["kuwait", 1800, 1898],              # British protection from 1899
     ]},
]

# Slugs that head their OWN empire row in country-colonisers.json. A land
# empire must never contain one, or the board renders the same state twice:
# "German Empire" (the metropole alone) beside "Germany and its colonies" (the
# colonies without their metropole), which is exactly what shipped on the 1914
# board until Ashwin spotted it. Kept in step with METROPOLE in
# scripts/build-colonisers.py by the assertion in the self-test.
COLDAT_METROPOLES = {
    "united-kingdom", "france", "spain", "portugal",
    "netherlands", "belgium", "germany", "italy",
}


def members(p):
    """-> [(slug, from, to)] for a polity, honouring per-member join dates."""
    out = []
    for m in p["replaces"]:
        if isinstance(m, str):
            out.append((m, p["from"], p["to"]))
        else:
            slug, joined = m[0], m[1]
            left = m[2] if len(m) > 2 else p["to"]
            out.append((slug, max(joined, p["from"]), min(left, p["to"])))
    return out

# Modern territories that were SPLIT between powers, with the holders named.
# These are never summed into an empire. They render as their own row, tagged
# with what actually held them, because "partitioned between Russia, Germany
# and Austria-Hungary" is the true answer for Poland in 1914 and "independent"
# is not.
PARTITIONED = [
    {"slug": "poland", "from": 1800, "to": 1918,
     "between": ["Russian Empire", "German Empire", "Austria-Hungary"]},
    {"slug": "ukraine", "from": 1800, "to": 1917,
     "between": ["Russian Empire", "Austria-Hungary"]},
    # Wallachia and Moldavia were Ottoman vassals; Transylvania was Habsburg
    # and Bessarabia Russian from 1812. Genuinely split three ways, so this one
    # stays here rather than joining the Ottoman row.
    {"slug": "romania", "from": 1800, "to": 1877,
     "between": ["Ottoman Empire", "Austria-Hungary", "Russian Empire"]},
    {"slug": "italy", "from": 1800, "to": 1860,
     "between": ["Austria-Hungary", "the Papal States", "the Two Sicilies", "Sardinia-Piedmont"]},
    # 🔴 Greece, Serbia, Bulgaria, Albania, Macedonia, Kosovo and Bosnia USED
    # TO BE HERE, each "partitioned between the Ottoman Empire" - a single
    # holder, which is not a partition at all. They are now members of
    # LAND_OTT, so they sit inside the empire that governed them and count
    # towards its total. What remains here is only genuinely divided ground.
    #
    # The Arabian peninsula stays: the Ottomans held the Hejaz and Al-Hasa
    # while the Saud and Rashid emirates held the Najd, and in Yemen the Zaidi
    # imamate never submitted and Aden was British from 1839.
    {"slug": "saudi-arabia", "from": 1800, "to": 1931,
     "between": ["Ottoman Empire", "the Emirate of Diriyah", "the Rashidi emirate"]},
    {"slug": "yemen", "from": 1800, "to": 1917,
     "between": ["Ottoman Empire", "the Zaidi imamate", "the United Kingdom"]},
    # Eastern Armenia was Persian until Turkmanchay in 1828, when it passed to
    # Russia; western Armenia stayed Ottoman. Without this the board showed
    # Armenia as a sovereign state in 1800.
    {"slug": "armenia", "from": 1800, "to": 1827,
     "between": ["Qajar Persia", "Ottoman Empire"]},
    {"slug": "norway", "from": 1800, "to": 1904, "between": ["Denmark", "Sweden"]},
    {"slug": "iceland", "from": 1800, "to": 1943, "between": ["Denmark"]},
    {"slug": "ireland", "from": 1800, "to": 1921, "between": ["the United Kingdom"]},
]

POLITIES = [
    # 🔴 The Baltics were INDEPENDENT STATES from 1918 to 1940, and Moldova was
    # Romanian over the same span. Without these windows the board put Estonia,
    # Latvia and Lithuania inside the Soviet Union in 1930, which erases twenty
    # years of independence - the same class of error as showing Ukraine as a
    # country in 1914, pointing the other way.
    {"code": "OWID_USS", "name": "Soviet Union", "from": 1922, "to": 1991,
     "replaces": ["russia", "ukraine", "belarus", "uzbekistan", "kazakhstan", "georgia",
                  "azerbaijan", "kyrgyzstan", "tajikistan", "armenia", "turkmenistan",
                  ["lithuania", 1940], ["latvia", 1940], ["estonia", 1940],
                  ["moldova", 1940]]},
    # 🔴 YUGOSLAVIA CEASED TO EXIST IN APRIL 1941 and was not reconstituted
    # until 1945. The country was invaded on the 6th, capitulated on the 17th,
    # and was carved between Germany, Italy, Hungary, Bulgaria and two client
    # states. Without this gap the 1942 board showed Yugoslavia as a going
    # concern of sixteen million people while every one of its seven pieces
    # carried an occupation tag that the polity then suppressed - the exact
    # error Czechoslovakia was fixed for, sitting undetected one row below it.
    {"code": "OWID_YGS", "name": "Yugoslavia", "from": 1918, "to": 1992,
     "replaces": ["serbia", "croatia", "bosnia-herzegovina", "slovenia",
                  "north-macedonia", "montenegro", "kosovo"],
     # 1941 through 1944. The country was back in 1945 - the Democratic
     # Federal Yugoslavia in March, the republic in November - and the sweep
     # caught the off-by-one immediately, because Kosovo, Montenegro and
     # Macedonia were left standing as sovereign states for exactly one year.
     "gaps": [[1941, 1944]]},
    # 🔴 Czechoslovakia CEASED TO EXIST between the German occupation of March
    # 1939 and the liberation in 1945: Bohemia and Moravia became a German
    # protectorate and Slovakia a client state. Showing it as a going concern
    # in 1942 is the same error as showing Ukraine as a country in 1914 - a
    # state on the board that was not there.
    {"code": "OWID_CZS", "name": "Czechoslovakia", "from": 1918, "to": 1993,
     "replaces": ["czech-republic", "slovakia"], "gaps": [[1939, 1945]]},
    {"code": "OWID_SRM", "name": "Serbia and Montenegro", "from": 1992, "to": 2006,
     "replaces": ["serbia", "montenegro", "kosovo"]},
    # OWID calls this "Ethiopia (former)", which tells a reader nothing about
    # what changed. What changed is Eritrea leaving in 1993, so say that.
    {"code": "OWID_ERE", "name": "Ethiopia and Eritrea", "from": 1800, "to": 1993,
     "replaces": ["ethiopia", "eritrea"]},
    # ---- Taken from the leaders layer's _defunct.json, which dates 41 polities
    # that ended in 1800 or later and maps each to modern territory. Only those
    # covering the WHOLE of their modern slugs are here: Bavaria, Saxony and
    # Hanover all map to "germany", so deriving the file wholesale would put six
    # German states on the board each claiming Germany's entire population.
    # The rest are tagged as partial holdings instead.
    {"code": "DEF_KOR", "name": "Korea", "from": 1800, "to": 1910,
     "replaces": ["south-korea", "north-korea"]},
    # 🔴 PANAMA WAS COLOMBIAN UNTIL 1903 and the board had it standing alone
    # from 1822 (Ashwin, 2026-08-14). It joined Gran Colombia of its own accord
    # in November 1821 and stayed with the successor republic through every one
    # of its four names, until the secession the United States backed in 1903.
    # Eighty-one years of a country that did not exist yet.
    {"code": "DEF_GCO", "name": "Gran Colombia", "from": 1819, "to": 1831,
     "replaces": ["colombia", "venezuela", "ecuador", ["panama", 1821]]},
    # The successor republic, under all four of its names (New Granada, the
    # Granadine Confederation, the United States of Colombia, and Colombia from
    # 1886). Named for its two modern territories rather than for any one of
    # those, on the same principle as "Ethiopia and Eritrea": the name should
    # tell a reader what changed, and what changed in 1903 was Panama leaving.
    {"code": "DEF_CPA", "name": "Colombia and Panama", "from": 1832, "to": 1903,
     "replaces": ["colombia", "panama"]},
    # 🔴 SUDAN WAS ONE COUNTRY UNTIL 9 JULY 2011. South Sudan used to render as
    # its own row tagged "partly held by sudan" for the whole period, which is
    # neither true nor countable. This is the window in which the two shared a
    # government AND that government was their own: before 1956 they shared a
    # coloniser instead, and that is modelled as two colonies of the same
    # empire in build-colonisers.py, exactly like every other colony pair.
    {"code": "DEF_SUD", "name": "Sudan and South Sudan", "from": 1956, "to": 2011,
     "replaces": ["sudan", "south-sudan"]},
    # ⚠️ NO United Kingdom of the Netherlands POLITY, deliberately. It looks
    # like the obvious next entry and it would be a REGRESSION: Belgium and
    # Luxembourg 1815-1830 are already curated in build-colonisers.py as
    # annexed by the Netherlands, with a note naming the United Kingdom of the
    # Netherlands, and that curation exists because Ashwin asked the question
    # in the first place. A polity here would win over that entry, delete the
    # Netherlands' own row for sixteen years, and leave two contradictory
    # descriptions of the same ground in two files. The one thing it would
    # genuinely improve is the framing — Vienna merged two territories into a
    # new state rather than the Dutch annexing the Belgians — and that is a
    # wording change to the existing note, not a new row.
    {"code": "DEF_FCA", "name": "Federal Republic of Central America", "from": 1823, "to": 1841,
     "replaces": ["guatemala", "el-salvador", "honduras"]},
    {"code": "DEF_WIF", "name": "West Indies Federation", "from": 1958, "to": 1962,
     "replaces": ["jamaica", "trinidad-tobago", "barbados"]},
    {"code": "DEF_RHO", "name": "Rhodesia", "from": 1965, "to": 1979,
     "replaces": ["zimbabwe"]},
    # Not in _defunct.json, and Ashwin asked for it by name.
    {"code": "DEF_UAR", "name": "United Arab Republic", "from": 1958, "to": 1961,
     "replaces": ["egypt", "syria"]},

    {"code": "OWID_GDR", "name": "East Germany", "from": 1949, "to": 1990,
     "replaces": [], "partitionOf": "germany"},
    {"code": "OWID_GFR", "name": "West Germany", "from": 1949, "to": 1990,
     "replaces": [], "partitionOf": "germany"},
    {"code": "OWID_YAR", "name": "North Yemen", "from": 1962, "to": 1990,
     "replaces": [], "partitionOf": "yemen"},
    {"code": "OWID_YPR", "name": "South Yemen", "from": 1967, "to": 1990,
     "replaces": [], "partitionOf": "yemen"},
    # 🔴 THE ONE PAIR ON THIS BOARD WHOSE NUMBERS ARE DERIVED. Germany, Yemen
    # and Korea split because the source publishes both halves; Vietnam does
    # not, and for one session that was the reason it stayed whole. The fix is
    # not a second source pretending to be the first: COW's two halves sit
    # 5-8% below OWID's Vietnam, so used raw they would have shown 43.97m in
    # 1975 and 47.68m in 1976 — a 3.7m jump in a year nothing happened.
    #
    # So COW supplies the SHARE and OWID supplies the TOTAL, and the two halves
    # add to the Vietnam figure exactly (see COW_SPLIT in
    # scripts/business/load_population_series.py, where the sum is asserted).
    # Ashwin approved the apportionment knowing it is an apportionment. Anyone
    # reading these two rows as measurements is reading them wrong.
    #
    # Dates are Geneva to the fall of Saigon. Formal reunification was July
    # 1976, but the division on the ground ended in April 1975, and this board
    # dates the settlement rather than the paperwork everywhere else.
    # 🔴 `derived` EXISTS BECAUSE basis="source" LIES ABOUT THESE TWO. The board
    # prints "this is the source's own series" under every partition row, which
    # is true of East Germany and both Yemens and FALSE here. A rule that holds
    # for the four rows it was written against and quietly misdescribes the
    # fifth is the same failure this feature keeps producing, so the row now
    # carries its own sentence.
    {"code": "COW_VDR", "name": "North Vietnam", "from": 1954, "to": 1975,
     "replaces": [], "partitionOf": "vietnam",
     "derived": "Apportioned, not measured: no source publishes the two halves on "
                "the same basis as the rest of this board, so the Correlates of War "
                "figures supply the North/South share and Our World in Data supplies "
                "the Vietnam total. The two rows add to that total exactly."},
    {"code": "COW_VNS", "name": "South Vietnam", "from": 1954, "to": 1975,
     "replaces": [], "partitionOf": "vietnam",
     "derived": "Apportioned, not measured: no source publishes the two halves on "
                "the same basis as the rest of this board, so the Correlates of War "
                "figures supply the North/South share and Our World in Data supplies "
                "the Vietnam total. The two rows add to that total exactly."},
]

# ------------------------------------------------------------------ regions --
# 🔴 A REGION IS NOT A STATE, AND THIS LIST MUST NEVER IMPLY IT WAS. Everything
# above is a polity: a government that held the ground and can be named. This
# is the opposite case - ground no single government held, which the board
# should still show as ONE ROW because the modern countries under it did not
# exist either.
#
# Ashwin, 2026-08-14: combine India, Pakistan and Bangladesh into one line for
# the years before the Raj. The three rows the board used to show were each
# individually correct and together they were misleading. Rendering them
# separately says the 1820 subcontinent contained a Pakistan-shaped thing and a
# Bangladesh-shaped thing, and it did not: it contained the Company's three
# presidencies, the Maratha powers, the Sikh empire, Mysore, Hyderabad and
# several hundred princely states, and the borders that divide those three rows
# were drawn in 1947. Three "not yet one country" tags on three separate rows
# state the fact and still draw the wrong picture.
#
# The mechanism is the polity one with the one difference that matters: a
# region renders TAGGED "not yet one country" rather than as a sovereign state,
# so combining rows never becomes a claim that the combination was a country.
# Its members stay in FRAGMENTED in build-colonisers.py, so the breakdown
# underneath still says what each piece was.
#
# 🔴 WHOLE TERRITORIES AND ONE SHARED WINDOW ONLY, the same discipline the land
# empires follow. A region whose members' fragmented windows end in different
# years would have to extend some or truncate others, and both invent a date.
# That is the entire reason this list is short: Central Asia looks like an
# obvious second entry until you notice Kazakhstan falls in 1846 and
# Turkmenistan in 1884, thirty-eight years apart.
REGIONS = [
    # Ends in 1856 rather than 1857 because the colonial run starts in 1857 and
    # the two must abut exactly - an overlap would have the region absorbing
    # territories COLDAT simultaneously reports as colonised. If the open
    # question about dating the Raj from the Company rather than the Crown is
    # ever settled the other way, this end year moves with it.
    {"code": "REG_SAS", "name": "Indian subcontinent", "from": 1800, "to": 1856,
     "region": True,
     "note": "the Company's presidencies, the Maratha powers, the Sikh empire "
             "and several hundred princely states; the borders dividing these "
             "three territories were drawn in 1947",
     "replaces": ["india", "pakistan", "bangladesh"]},
]


def build_polities(est, countries, polities=None):
    """-> [polity] with a series that is the SUM of its parts where it has
    parts, and the source's own series where it does not."""
    by_slug = {s: dict(v["series"]) for s, v in countries.items()}
    out = []
    for p in (POLITIES + LAND_EMPIRES + REGIONS if polities is None else polities):
        src = est.get(p["code"]) or {}
        gaps = p.get("gaps") or []
        years = [y for y in range(p["from"], p["to"] + 1)
                 if not any(a <= y <= b for a, b in gaps)]
        if p["replaces"]:
            mem = members(p)
            series, parts_missing = [], set()
            for y in years:
                vals = []
                for slug, a, b in mem:
                    if y < a or y > b:
                        continue
                    v = by_slug.get(slug, {}).get(y)
                    if v is None:
                        parts_missing.add(slug)
                    else:
                        vals.append(v)
                if vals:
                    series.append([y, sum(vals)])
            basis = "sum"
        else:
            series = [[y, src[y]] for y in years if y in src]
            parts_missing, basis = set(), "source"
        if not series:
            raise SystemExit(f"FATAL: {p['code']} produced no series; the polity view "
                             "would silently lose a state.")
        # Keep the source's own parent series alongside, so the divergence this
        # design deliberately overrides stays visible instead of vanishing.
        sourceSeries = [[y, src[y]] for y in years if y in src]
        rec = {k: p[k] for k in ("code", "name", "from", "to") if k in p}
        if gaps:
            rec["gaps"] = gaps
        rec.update({
            "replaces": [m[0] for m in members(p)],
            "memberWindows": [[m[0], m[1], m[2]] for m in members(p)],
            "basis": basis,
            "series": series,
            "sourceSeries": sourceSeries,
        })
        if p.get("partitionOf"):
            rec["partitionOf"] = p["partitionOf"]
        # A region carries its own not-yet-one-country note. Without the flag
        # the client would render it as a sovereign state, which is the single
        # thing this list must never be allowed to say.
        if p.get("region"):
            rec["region"] = True
            rec["note"] = p["note"]
        if p.get("derived"):
            rec["derived"] = p["derived"]
        if parts_missing:
            rec["partsMissingSomeYears"] = sorted(parts_missing)
        out.append(rec)
    return out


def slug_to_iso3():
    doc = json.load(open(INDICATORS, encoding="utf-8"))
    out = {}
    for slug, c in (doc.get("countries") or {}).items():
        iso = (c.get("iso3") or "").strip()
        if len(iso) == 3:
            out[slug] = iso
    if len(out) < 100:
        raise SystemExit(f"FATAL: only {len(out)} slug->iso3 pairs from country-indicators.json; "
                         "run scripts/build-country-indicators.py first.")
    return out


def fetch_population(key):
    rows, off = [], 0
    while True:
        page = rest("GET", f"/rest/v1/country_population?select=iso3,year,population,source,kind"
                           f"&order=iso3.asc,year.asc&limit={PAGE}&offset={off}", key=key)
        rows += page
        if len(page) < PAGE:
            break
        off += PAGE
    return rows


def split(rows):
    """-> (estimates, projections, sources), each keyed iso3 -> {year: pop}."""
    est, prj, src = {}, {}, {}
    for r in rows:
        bucket = prj if r.get("kind") == "projection" else est
        bucket.setdefault(r["iso3"], {})[int(r["year"])] = int(r["population"])
        src[r["iso3"]] = r.get("source") or ""
    return est, prj, src


def build(est, prj, s2i, aggregates, sources=None):
    """slug -> {series, rank, peak, share}. Ranks are computed over REAL
    countries only, at the last ESTIMATE year."""
    world_est = est.get(WORLD) or {}
    if not world_est:
        raise SystemExit("FATAL: no WLD estimates in country_population; shares would be unavailable.")
    last = max(world_est)

    # A country that stopped existing has no value in the common year, which is
    # exactly what separates the living from the defunct without a hardcoded
    # list. This also retires the old `latest_value` fallback that existed only
    # because the World Bank omitted Taiwan and its substitute source ended
    # short: every living country now comes from one series and reaches `last`.
    real = {i: s for i, s in est.items()
            if i not in aggregates and i != WORLD and last in s}

    ranked = sorted(real.items(), key=lambda kv: -kv[1][last])
    rank_of = {i: n + 1 for n, (i, s) in enumerate(ranked)}

    out = {}
    for slug, iso in sorted(s2i.items()):
        s = est.get(iso)
        if not s:
            continue
        years = sorted(s)
        first, latest = years[0], years[-1]
        peak = max(years, key=lambda y: s[y])

        def share(y):
            return round(s[y] / world_est[y] * 100, 3) if world_est.get(y) and s.get(y) else None

        p = prj.get(iso) or {}
        tail = sorted(y for y in p if y > latest)
        full = [[y, s[y]] for y in years] + [[y, p[y]] for y in tail]

        out[slug] = {
            "iso3": iso,
            "source": (sources or {}).get(iso, ""),
            "first": first,
            # The last year that is not a forecast. Every figure below is as of
            # this year, and the page says so.
            "latest": latest,
            "value": s[latest],
            "rank": rank_of.get(iso),
            "peakYear": peak, "peakValue": s[peak],
            "declineFromPeak": round((s[peak] - s[latest]) / s[peak] * 100, 2) if peak != latest else 0.0,
            "multiple": round(s[latest] / s[first], 3) if s[first] else None,
            "share": share(latest), "shareFirst": share(first),
            # Carried apart from `value` so the page cannot accidentally rank,
            # compare or headline a projection.
            "projectedTo": tail[-1] if tail else None,
            "projectedValue": p[tail[-1]] if tail else None,
            "series": full,
        }

        prior = PRIOR_SERIES.get(iso)
        if prior and prior[0] in est:
            ps = est[prior[0]]
            out[slug]["prior"] = {
                "label": prior[1],
                "series": [[y, ps[y]] for y in sorted(ps)],
            }
    return out, world_est, prj.get(WORLD) or {}, last, len(rank_of)


def main(argv):
    if "--self-test" in argv:
        return self_test()
    dry = "--dry" in argv

    s2i = slug_to_iso3()
    key = service_key()
    est, prj, sources = split(fetch_population(key))
    ents = rest("GET", "/rest/v1/wb_entity?select=iso3&is_aggregate=is.true", key=key)
    aggregates = {e["iso3"] for e in ents}
    log(f"{len(est)} estimate series · {len(prj)} with projections · "
        f"{len(aggregates)} aggregates excluded from ranks · {len(s2i)} site countries carry an iso3")

    countries, world_est, world_prj, last, ranked = build(est, prj, s2i, aggregates, sources)
    missing = sorted(set(s2i) - set(countries))
    log(f"matched {len(countries)} of {len(s2i)} site countries; {ranked} ranked at {last}")
    if missing:
        log(f"  no population series for {len(missing)}: {missing[:14]}")

    # Not all of these are defunct: Akrotiri and Dhekelia is a live territory
    # whose series simply stops in 2008. The test is "has no value in the
    # common year", which is what actually governs ranking, so the log says
    # that rather than asserting a cause it has not checked.
    unranked = sorted(i for i in est if i.startswith("OWID_"))
    log(f"  {len(unranked)} OWID-coded series with no value at {last}, held for the "
        f"polity view and unranked: " + ", ".join(unranked))

    for slug, v in countries.items():
        if v.get("prior"):
            ps = v["prior"]["series"]
            log(f"  {slug}: prior series {ps[0][0]}-{ps[-1][0]} ({len(ps)} pts), "
                f"peak {max(p[1] for p in ps):,} - held apart, never concatenated")

    polities = build_polities(est, countries)
    missing_slug = sorted({d["slug"] for d in PARTITIONED} - set(countries))
    if missing_slug:
        raise SystemExit(f"FATAL: PARTITIONED names slugs that do not exist: {missing_slug}")
    dup = sorted({m[0] for e in LAND_EMPIRES for m in members(e)} & COLDAT_METROPOLES)
    if dup:
        raise SystemExit(f"FATAL: {dup} heads its own empire row AND sits inside a land "
                         "empire; the board would show that state twice.")
    # 🔴 THE SAME GUARD FOR POLITIES AND REGIONS. It used to cover LAND_EMPIRES
    # only, which left the far more tempting mistake unguarded: a polity for the
    # United Kingdom of the Netherlands, absorbing the Netherlands 1815-1830.
    # The failure is not a double-count there, it is a DISAPPEARANCE. The client
    # skips any empire row whose metropole has been absorbed, so the Dutch
    # empire row would vanish for sixteen years and Indonesia and Suriname would
    # scatter to the bottom of the board as loose territories, with nothing
    # anywhere saying so. Found 2026-08-14 while checking exactly that idea.
    swallowed = sorted({m[0] for p in POLITIES + REGIONS for m in members(p)}
                       & COLDAT_METROPOLES)
    if swallowed:
        raise SystemExit(
            f"FATAL: {swallowed} heads its own empire row AND is absorbed by a polity or "
            "region. The empire row would be dropped for those years and its colonies "
            "would scatter as loose territories. Model the relationship as a curated "
            "holding in build-colonisers.py instead.")
    # OVERLAPPING YEARS, not overlapping slugs. Armenia was divided between
    # Persia and the Ottomans until 1828 and Russian afterwards; that is two
    # true statements about different decades, not a contradiction.
    overlap = sorted({d["slug"] for d in PARTITIONED
                      for e in LAND_EMPIRES
                      for s, a, b in members(e)
                      if s == d["slug"] and max(d["from"], a) <= min(d["to"], b)})
    if overlap:
        raise SystemExit(f"FATAL: {overlap} is both partitioned and wholly inside an empire; "
                         "one of the two claims is wrong and the sum would double-count.")
    for p in polities:
        note = ""
        if p["basis"] == "sum" and p["sourceSeries"]:
            sm = dict(p["series"]); sr = dict(p["sourceSeries"])
            common = sorted(set(sm) & set(sr))
            if common:
                y = common[-1]
                note = f" · vs source at {y}: {(sm[y] - sr[y]) / sr[y] * 100:+.2f}%"
        log(f"  polity {p['name']:<22} {p['from']}-{p['to']} "
            f"{len(p['series'])} pts, basis={p['basis']}{note}")

    withproj = sum(1 for v in countries.values() if v["projectedTo"])
    log(f"  {withproj} of {len(countries)} carry a projected tail to "
        f"{max((v['projectedTo'] or 0) for v in countries.values())}")

    shrinking = sorted(((v["declineFromPeak"], s) for s, v in countries.items()
                        if v["declineFromPeak"] > 0.5), reverse=True)[:8]
    log("  past peak: " + ", ".join(f"{s} -{d:.1f}% since {countries[s]['peakYear']}"
                                    for d, s in shrinking))

    if dry:
        return 0

    world_years = sorted(world_est) + sorted(y for y in world_prj if y > last)
    doc = {
        "_meta": {
            "source": next(iter(sources.values()), "Our World in Data population"),
            "license": "CC BY 4.0",
            "fetchedAt": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "first": min(world_est), "last": last,
            "projectedTo": max(world_prj) if world_prj else None,
            "countries": len(countries),
            "note": ("Figures are as of the last ESTIMATE year; 2024 onward are UN WPP "
                     "medium-variant projections, carried on the chart and in projectedTo "
                     "but never used for a rank, a peak or a share. Ranks cover reporting "
                     "territories only and exclude aggregates. The workbook remains ground "
                     "truth for a country's current population; this file is the history."),
        },
        "world": [[y, (world_est.get(y) or world_prj.get(y))] for y in world_years],
        "countries": countries,
        "polities": polities,
        "partitioned": PARTITIONED,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    log(f"wrote country-population.json: {len(countries)} countries, "
        f"{os.path.getsize(OUT) / 1024:.0f} KB")
    return 0


def self_test():
    rows = (
        [{"iso3": "WLD", "year": y, "population": p, "source": "OWID", "kind": "estimate"}
         for y, p in ((1800, 100), (2009, 380), (2023, 400))]
        + [{"iso3": "WLD", "year": 2025, "population": 420, "source": "OWID", "kind": "projection"}]
        + [{"iso3": "JPN", "year": y, "population": p, "source": "OWID", "kind": "estimate"}
           for y, p in ((1800, 20), (2009, 40), (2023, 36))]
        # Japan's projection is BELOW its 2023 figure; a peak computed over
        # everything would be unaffected, but see NGA for the case that bites.
        + [{"iso3": "JPN", "year": 2025, "population": 35, "source": "OWID", "kind": "projection"}]
        + [{"iso3": "NGA", "year": y, "population": p, "source": "OWID", "kind": "estimate"}
           for y, p in ((1800, 5), (2023, 60))]
        + [{"iso3": "NGA", "year": 2025, "population": 66, "source": "OWID", "kind": "projection"}]
        + [{"iso3": "EUU", "year": 2023, "population": 90, "source": "OWID", "kind": "estimate"}]
        # A defunct polity: real numbers, no value in the common year.
        + [{"iso3": "OWID_USS", "year": y, "population": p, "source": "OWID", "kind": "estimate"}
           for y, p in ((1800, 30), (1989, 289))]
        + [{"iso3": "TWN", "year": y, "population": p, "source": "OWID", "kind": "estimate"}
           for y, p in ((1800, 11), (2023, 38))]
        + [{"iso3": "IRL", "year": y, "population": p, "source": "OWID", "kind": "estimate"}
           for y, p in ((1950, 3), (2023, 5))]
        + [{"iso3": "IRL_WHOLE", "year": y, "population": p, "source": "OWID", "kind": "estimate"}
           for y, p in ((1800, 5), (1841, 8), (1920, 4))]
        + [{"iso3": "OWID_GDR", "year": y, "population": p, "source": "OWID", "kind": "estimate"}
           for y, p in ((1949, 18), (1990, 16))]
        # A successor territory, so the USSR's sum path has something to add up.
        # It has no value in the common year, so it is correctly unranked.
        + [{"iso3": "RUS", "year": y, "population": p, "source": "OWID", "kind": "estimate"}
           for y, p in ((1922, 90), (1991, 148))]
    )
    est, prj, srcs = split(rows)
    s2i = {"japan": "JPN", "nigeria": "NGA", "european-union": "EUU",
           "taiwan": "TWN", "ussr": "OWID_USS", "ireland": "IRL", "nowhere": "XXX",
           "russia": "RUS"}
    out, world_est, world_prj, last, ranked = build(est, prj, s2i, {"EUU"}, srcs)

    assert last == 2023, "the common year is the last ESTIMATE year, never a projected one"
    assert "nowhere" not in out, "a slug with no series is dropped, not zero-filled"

    jp = out["japan"]
    assert jp["latest"] == 2023 and jp["value"] == 36, jp
    assert jp["peakYear"] == 2009 and jp["declineFromPeak"] == 10.0, jp
    assert jp["projectedTo"] == 2025 and jp["projectedValue"] == 35, jp
    assert jp["series"][-1] == [2025, 35], "the chart runs through the projected tail"
    assert jp["series"][-2] == [2023, 36], jp

    ng = out["nigeria"]
    assert ng["peakYear"] == 2023 and ng["peakValue"] == 60, (
        "the peak must come from estimates only: Nigeria's 2025 projection is "
        "higher, and letting a forecast set the peak would make the site claim "
        "a country had already reached a size it has not reached")
    assert ng["declineFromPeak"] == 0.0, "a country at its peak is not in decline"
    assert ng["multiple"] == 12.0, ng
    assert ng["value"] == 60, "the headline figure is never the projected one"

    assert out["ussr"]["rank"] is None, (
        "a state that ended has no value in the common year, so it is unranked "
        "without anyone maintaining a list of dead countries")
    assert out["ussr"]["projectedTo"] is None, out["ussr"]
    assert (out["nigeria"]["rank"], out["taiwan"]["rank"], out["japan"]["rank"],
            out["ireland"]["rank"]) == (1, 2, 3, 4), out
    assert ranked == 4, "the EU aggregate must not occupy a rank"
    assert out["european-union"]["rank"] is None, "an aggregate still renders, it just has no rank"

    ie = out["ireland"]
    assert ie["first"] == 1950 and ie["value"] == 5, (
        "every scalar stays on the modern 26-county series")
    assert ie["peakYear"] == 2023, (
        "the whole-island 1841 figure is larger but belongs to a different "
        "territory; letting it set the peak would have the page claim the "
        "Republic is far below a size it never held")
    assert ie["prior"]["series"] == [[1800, 5], [1841, 8], [1920, 4]], ie["prior"]
    assert max(p[1] for p in ie["prior"]["series"]) > ie["peakValue"], (
        "the fixture must actually exercise the trap: the prior territory was "
        "LARGER than the modern one, which is the whole reason it cannot set the peak")
    assert ie["series"][0][0] == 1950, "the prior series is NEVER concatenated onto the main one"
    assert "prior" not in out["japan"], "only countries with a mapping get one"

    # Only the two the fixture carries parts for; the production call uses every
    # polity and hard-fails if any comes back empty, which is the point.
    # Selected BY CODE: an index broke silently the moment entries were inserted
    # above it, and the failure surfaced as "DEF_KOR produced no series".
    pick = {p["code"]: p for p in POLITIES + LAND_EMPIRES}
    pol = build_polities(est, out, [pick["OWID_USS"], pick["OWID_GDR"]])
    uss = next(p for p in pol if p["code"] == "OWID_USS")
    assert uss["basis"] == "sum", "a polity with parts is the sum of its parts"
    assert uss["series"] == [[1922, 90], [1991, 148]], (
        "only the successor territories present in the data contribute; the "
        "source's own parent series is never mixed in")
    assert out["russia"]["rank"] is None, (
        "a successor with no value in the common year stays unranked")
    gdr = next(p for p in pol if p["code"] == "OWID_GDR")
    assert gdr["basis"] == "source" and gdr["partitionOf"] == "germany", (
        "a polity that was a slice of ONE modern country has nothing to sum and "
        "must fall back to the source's own series")
    # 🔴 THE TEST IS AN OVERLAP TEST, NOT A MEMBERSHIP TEST. The first version
    # compared slug sets and so refused to let a territory be split in one
    # century and inside an empire in the next - which is the normal case, not
    # a contradiction: eastern Armenia was divided between Persia and the
    # Ottomans until Turkmanchay in 1828 and Russian from 1828. What must never
    # happen is the SAME YEAR appearing in both, because that is the year a
    # total double-counts.
    clash = [(d["slug"], e["code"], max(d["from"], a), min(d["to"], b))
             for d in PARTITIONED
             for e in LAND_EMPIRES
             for s, a, b in members(e)
             if s == d["slug"] and max(d["from"], a) <= min(d["to"], b)]
    assert not clash, (
        "a territory cannot be both wholly inside one empire and split between "
        "several IN THE SAME YEAR; that contradiction is what makes a total "
        "double-count", clash)
    assert all(d["from"] <= d["to"] for d in PARTITIONED), PARTITIONED
    assert all(e["from"] <= e["to"] for e in LAND_EMPIRES), LAND_EMPIRES
    assert not ({m[0] for e in LAND_EMPIRES for m in members(e)} & COLDAT_METROPOLES), (
        "a territory that heads its own empire row must not also sit inside a "
        "land empire: 1914 showed 'German Empire' and 'Germany and its "
        "colonies' as two rows, one of them Germany without its colonies and "
        "the other its colonies without Germany")

    # ---- the Ottoman Empire, which Ashwin asked for by name ---------------
    ott = dict((m[0], (m[1], m[2])) for m in members(
        next(e for e in LAND_EMPIRES if e["code"] == "LAND_OTT")))
    for slug in ("greece", "bulgaria", "serbia", "albania", "north-macedonia",
                 "kosovo", "bosnia-herzegovina", "cyprus"):
        assert slug in ott, (
            f"{slug} was Ottoman ground and must sit inside the empire's total, "
            "not beside it as a row 'partitioned between the Ottoman Empire' - "
            "one holder is not a partition", sorted(ott))
    assert ott["greece"][1] == 1829 and ott["bulgaria"][1] == 1877, (
        "each territory leaves at its OWN settlement; a single end date would "
        "hold Greece into the twentieth century", ott)
    assert ott["north-macedonia"][1] == 1912 and ott["egypt"][1] == 1881, ott
    assert ott["turkey"][1] == 1922, ott
    # The Habsburg years before the Empire was proclaimed.
    hab = next(e for e in LAND_EMPIRES if e["code"] == "LAND_HAB")
    aus = next(e for e in LAND_EMPIRES if e["code"] == "LAND_AUS")
    assert hab["to"] + 1 == aus["from"] and hab["from"] == 1800, (
        "1800-1803 was uncovered because the Austrian Empire was not declared "
        "until 1804, and five Habsburg lands read as sovereign states", hab, aus)
    assert set(hab["replaces"]) == set(aus["replaces"]), (hab, aus)

    rus = next(e for e in LAND_EMPIRES if e["code"] == "LAND_RUS")
    win = dict((m[0], (m[1], m[2])) for m in members(rus))
    wif = next(e for e in POLITIES if e["code"] == "DEF_WIF")
    assert wif["replaces"] == ["jamaica", "trinidad-tobago", "barbados"], wif
    assert not any(e["replaces"] == ["germany"] for e in POLITIES), (
        "a polity covering only PART of a modern territory cannot be summed "
        "from it; Bavaria mapped to 'germany' would claim all of Germany")

    czs = next(e for e in POLITIES if e["code"] == "OWID_CZS")
    assert czs.get("gaps") == [[1939, 1945]], (
        "Czechoslovakia was dissolved by the German occupation and did not "
        "exist again until 1945", czs.get("gaps"))

    uss = next(e for e in POLITIES if e["code"] == "OWID_USS")
    uw = dict((m[0], (m[1], m[2])) for m in members(uss))
    assert uw["estonia"][0] == 1940 and uw["russia"][0] == 1922, (
        "the Baltic states were independent 1918-1940 and must not sit inside "
        "the USSR before the annexation", uw)

    assert win["turkmenistan"][0] == 1885 and win["russia"][0] == 1800, (
        "a member that joined late must not be counted from the empire's own "
        "start year; Merv fell in 1885, not 1800", win)
    assert all(a <= b for a, b in win.values()), win
    assert "poland" not in {m[0] for e in LAND_EMPIRES for m in members(e)}, (
        "Poland in 1914 was split three ways and must never be summed whole "
        "into any one of them - this is the case that started all of it")

    assert all(p["from"] <= y <= p["to"] for p in pol for y, _ in p["series"]), (
        "a polity must never carry a year outside its own lifespan, or the board "
        "would show a state that had not started or had already ended")

    assert jp["share"] == 9.0 and jp["shareFirst"] == 20.0, jp
    assert world_prj == {2025: 420}, world_prj
    print("self-test: 43/43 PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]) or 0)
