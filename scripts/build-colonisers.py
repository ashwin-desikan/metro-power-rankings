#!/usr/bin/env python3
"""build-colonisers.py - who governed whom, for the /countries Time Machine.

WHY THIS EXISTS. The polity view can already show a state that dissolved into
successors, because Our World in Data publishes the USSR and Yugoslavia as
entities. It cannot show an EMPIRE, because nobody publishes "the British
Empire" as a population series - and it is the more interesting case, since for
most of the period this site now covers the largest political units on earth
were empires rather than states.

WHAT IT DOES INSTEAD. COLDAT 3.0 (Bastian Becker), served through Our World in
Data's grapher CSV under CC BY, gives a coloniser for every colonised territory
for every year from 1462 to 2022. Join that to the population this repo already
holds for each modern territory and the empire falls out of a sum: the British
Empire in 1930 is the United Kingdom plus the 53 territories COLDAT says it
held that year. No new population data, no new estimate, just a grouping.

THE HONEST LIMIT, STATED ON THE PAGE. These are MODERN territories carrying
that year's people. "British India in 1940" is therefore India plus Pakistan
plus Bangladesh plus Myanmar as four rows, not one Raj census. It answers how
many people lived in the area an empire governed, which is a real question, and
it is not the same question as what the empire's own returns said.

usage:
  python scripts/build-colonisers.py --self-test
  python scripts/build-colonisers.py --dry
  python scripts/build-colonisers.py
"""
import csv, datetime, io, json, os, re, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
INDICATORS = os.path.join(ROOT, "public", "data", "country-indicators.json")
OUT = os.path.join(ROOT, "public", "data", "country-colonisers.json")

UA = "Mozilla/5.0 (compatible; CitizenOfNowhere/1.0; +https://rankings.citizenofnowhere.org)"
URL = ("https://ourworldindata.org/grapher/european-overseas-colonies-and-their-colonizers.csv"
       "?v=1&csvType=full&useColumnShortNames=true")
COL = "colonizer_grouped"
SOURCE = "COLDAT 3.0 (Becker) via Our World in Data (CC BY)"

# COLDAT's sentinel values. They sort to the end of the alphabet on purpose so
# they group last in a chart legend, which is why they carry the z-prefixes.
# None of them is a coloniser and none may become an empire row.
NOT_A_COLONISER = {
    "zzz. Not colonized",
    "zzzz. No longer colonized",
    "zz. Colonizer",
    "z. Multiple colonizers",
}

# The eight colonising powers COLDAT codes, each mapped to the site slug of the
# METROPOLE, so an empire row can include the home country rather than being
# only its possessions. An empire without its metropole would understate
# Britain in 1930 by about 46 million people.
METROPOLE = {
    "United Kingdom": "united-kingdom",
    "France": "france",
    "Spain": "spain",
    "Portugal": "portugal",
    "Netherlands": "netherlands",
    "Belgium": "belgium",
    "Germany": "germany",
    "Italy": "italy",
}

# Below this the "empire" is the metropole and a rounding error, and a board
# with eleven one-colony empires on it is noise rather than history.
MIN_COLONIES = 2

# SELF-GOVERNING DOMINIONS. COLDAT codes these as colonised until formal
# independence - Canada to 1982, Australia and New Zealand to 1986 - which is a
# defensible reading of the statute book and a poor description of the world.
# Canada in 1914 had its own parliament, its own prime minister and its own
# budget; it was not held the way India was held, and folding it into a British
# Empire total the way India is folded in tells the reader something false.
#
# From the year given, a dominion leaves the empire grouping and stands as its
# own row tagged "dominion of X". It is NOT jointly held, so unlike a
# partitioned territory it does not leave the empire's total understated - it
# was simply never the same kind of possession.
#
# Dates are responsible self-government at the level people mean by it:
# Confederation, Federation, dominion status. Argue with them here rather than
# in the rendering code.
DOMINIONS = [
    {"slug": "canada", "from": 1867, "of": "United Kingdom"},
    {"slug": "australia", "from": 1901, "of": "United Kingdom"},
    {"slug": "new-zealand", "from": 1907, "of": "United Kingdom"},
    {"slug": "south-africa", "from": 1910, "of": "United Kingdom"},
]


def log(m):
    print(m, flush=True)


def slug_by_iso3():
    doc = json.load(open(INDICATORS, encoding="utf-8"))
    out = {}
    for slug, c in (doc.get("countries") or {}).items():
        iso = (c.get("iso3") or "").strip()
        if len(iso) == 3:
            out[iso] = slug
    if len(out) < 100:
        raise SystemExit(f"FATAL: only {len(out)} iso3->slug pairs; "
                         "run scripts/build-country-indicators.py first.")
    return out


def fetch(timeout=300):
    req = urllib.request.Request(URL, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return list(csv.DictReader(io.StringIO(r.read().decode("utf-8", "replace"))))


def parse(rows, i2s):
    """-> {slug: [[from, to, coloniser], ...]} as inclusive runs.

    Runs, not a year-keyed map: 180 territories x 560 years is 100k entries of
    mostly-repeated strings, and the page only ever asks "who held this in
    year Y", which a short run list answers just as well at a fraction of the
    document."""
    if not rows or COL not in rows[0]:
        raise SystemExit(f"FATAL: no {COL!r} column; got {list(rows[0]) if rows else 'nothing'}. "
                         "OWID changed the dataset shape.")
    by = {}
    for r in rows:
        iso = (r.get("code") or "").strip()
        slug = i2s.get(iso)
        if not slug:
            continue
        name = (r.get(COL) or "").strip()
        if name in NOT_A_COLONISER or name not in METROPOLE:
            continue
        try:
            y = int(r["year"])
        except (TypeError, ValueError, KeyError):
            continue
        by.setdefault(slug, {})[y] = name

    runs = {}
    for slug, years in by.items():
        out = []
        for y in sorted(years):
            n = years[y]
            if out and out[-1][2] == n and y == out[-1][1] + 1:
                out[-1][1] = y
            else:
                out.append([y, y, n])
        runs[slug] = out
    return runs


# Era-correct names. An empire row is labelled by what the thing was called at
# the time, the same principle the champions ledger uses for competitions:
# 1914 should read "German Empire", not "Germany and its colonies". Only the
# unambiguous case is filled in; the others are Ashwin's to name.
ERA_NAMES = {
    "Germany": [[1871, 1918, "German Empire"]],
}


# CURRENT dependencies come from the site's own country hierarchy
# (public/data/countries.json parent_slug), which is what the /countries
# directory already uses to nest Gibraltar under the United Kingdom and Guam
# under the United States. COLDAT never covers these, because COLDAT is a
# dataset about DECOLONISATION and these territories never decolonised.
#
# 🔴 Current parentage is not history. Hong Kong and Macau list China as their
# parent today and were British and Portuguese in 1914, so a blanket roll-up
# would file Hong Kong under China during the Qing dynasty. Anything whose
# holder changed gets an explicit window here, and these win over the parent.
# ---------------------------------------------- what COLDAT cannot know -----
# COLDAT codes EIGHT EUROPEAN POWERS. Everything else that ever held territory
# is simply absent, which left three visible holes on the board:
#
#   * The Philippines read SOVEREIGN from 1899, because COLDAT ends its Spanish
#     run in 1898 and has no concept of an American one.
#   * Taiwan and Korea read sovereign through the whole Japanese period,
#     because Japan is not a coloniser in the dataset at all.
#   * No wartime occupation appeared anywhere, so 1942 showed a Europe of
#     independent states.
#
# `kind` matters and is not decoration. A COLONY rolls up into its holder. An
# OCCUPIED territory does NOT, by default: occupation is not possession, the
# occupied state usually still existed, and summing Vichy France into Germany
# would state something most readers would reject. Ashwin's original ruling
# stands - sovereign and colony on by default, occupied and annexed behind the
# toggle. ANNEXED sits with occupied: contested, and shown only on request.
#
# Dates are the conventional ones. This is curation, not a dataset, and it is
# meant to be argued with here rather than discovered in the rendering code.
EXTRA_HOLDINGS = [
    # --- United States ---
    {"slug": "philippines", "from": 1898, "to": 1946, "holder": "united-states", "kind": "colony"},

    # Spanish Pacific and Caribbean, before 1898. Without these Guam simply
    # vanishes from every board before it became American, which reads as if
    # nobody governed it.
    {"slug": "guam", "from": 1800, "to": 1898, "holder": "spain", "kind": "colony"},
    {"slug": "northern-mariana-islands", "from": 1800, "to": 1899, "holder": "spain", "kind": "colony"},
    {"slug": "northern-mariana-islands", "from": 1900, "to": 1914, "holder": "germany", "kind": "colony"},

    # --- Empire of Japan ---
    {"slug": "taiwan", "from": 1895, "to": 1945, "holder": "japan", "kind": "colony"},
    {"slug": "south-korea", "from": 1910, "to": 1945, "holder": "japan", "kind": "colony"},
    {"slug": "north-korea", "from": 1910, "to": 1945, "holder": "japan", "kind": "colony"},
    {"slug": "palau", "from": 1919, "to": 1945, "holder": "japan", "kind": "colony"},
    {"slug": "marshall-islands", "from": 1919, "to": 1945, "holder": "japan", "kind": "colony"},
    {"slug": "federated-states-of-micronesia", "from": 1919, "to": 1945,
     "holder": "japan", "kind": "colony"},
    {"slug": "northern-mariana-islands", "from": 1915, "to": 1945, "holder": "japan", "kind": "colony"},
    # Japanese wartime conquests: occupation, not possession.
    {"slug": "philippines", "from": 1942, "to": 1945, "holder": "japan", "kind": "occupied"},
    {"slug": "indonesia", "from": 1942, "to": 1945, "holder": "japan", "kind": "occupied"},
    {"slug": "malaysia", "from": 1942, "to": 1945, "holder": "japan", "kind": "occupied"},
    {"slug": "singapore", "from": 1942, "to": 1945, "holder": "japan", "kind": "occupied"},
    {"slug": "myanmar", "from": 1942, "to": 1945, "holder": "japan", "kind": "occupied"},
    {"slug": "vietnam", "from": 1940, "to": 1945, "holder": "japan", "kind": "occupied"},
    {"slug": "hong-kong", "from": 1941, "to": 1945, "holder": "japan", "kind": "occupied"},

    # PARTIAL: held in part only, so it can never be summed into the holder
    # without claiming more than Japan ever held. Manchuria fell in 1931 and
    # much of the eastern seaboard from 1937, but the Chongqing government held
    # the west throughout and Japan never took the whole country. Manchuria is
    # not a modern country slug, so there is no way to sum "the occupied part"
    # - the honest move is to tag China and say what was taken.
    {"slug": "china", "from": 1931, "to": 1945, "holder": "japan", "kind": "partial",
     "note": "Manchuria from 1931 and much of the east from 1937; the west never fell"},

    # --- Qing periphery ---
    # 🔴 Bosnia, Kosovo and Cyprus USED TO BE HERE as Ottoman holdings. They
    # are now MEMBERS of the Ottoman Empire in build-country-population.py, so
    # they roll up into its total instead of hanging off it as tagged rows.
    # Anything left here that the Ottomans held would be double-counted.
    {"slug": "taiwan", "from": 1800, "to": 1895, "holder": "china", "kind": "colony"},
    {"slug": "mongolia", "from": 1800, "to": 1911, "holder": "china", "kind": "colony"},
    # Hong Kong was Qing territory until the Treaty of Nanking. Without this it
    # rendered as a sovereign country in 1818, which is the Guam error again.
    {"slug": "hong-kong", "from": 1800, "to": 1841, "holder": "china", "kind": "colony"},
    # The Central Asian khanates were conquered between 1868 and 1885; before
    # that these borders described Bukhara, Khiva and Kokand, not the modern
    # republics, so they are "not yet one country" rather than held.
    {"slug": "singapore", "from": 1826, "to": 1963, "holder": "united-kingdom", "kind": "colony"},
    {"slug": "cyprus", "from": 1878, "to": 1960, "holder": "united-kingdom", "kind": "colony"},

    # --- The Low Countries, 1800-1890 ---
    # 🔴 Ashwin: "Why isn't Belgium in the Netherlands in the early 1800s?"
    # Because nothing covered it, so it defaulted to sovereign - alongside
    # Luxembourg and, for the French years, the Netherlands itself. Belgium
    # did not become a state until 1830 and was not recognised until 1839.
    # The Southern Netherlands and Luxembourg were annexed by France in 1795
    # and stayed French until Napoleon fell.
    {"slug": "belgium", "from": 1800, "to": 1814, "holder": "france", "kind": "annexed",
     "note": "annexed by France in 1795 as the departements reunis"},
    {"slug": "luxembourg", "from": 1800, "to": 1814, "holder": "france", "kind": "annexed",
     "note": "the departement des Forets"},
    # The Dutch Republic went the same way in stages: a French client as the
    # Batavian Republic and then the Kingdom of Holland, and formally part of
    # France from 1810.
    {"slug": "netherlands", "from": 1800, "to": 1809, "holder": "france", "kind": "client",
     "note": "the Batavian Republic, then the Kingdom of Holland from 1806"},
    {"slug": "netherlands", "from": 1810, "to": 1813, "holder": "france", "kind": "annexed"},
    # Vienna put all three under one crown, but not in the same way, which is
    # the correction of 2026-08-14: Belgium was merged into a new state and
    # Luxembourg was not.
    #
    # Belgium was one of the two halves Vienna WELDED TOGETHER, not a country
    # the Dutch took. `annexed` is the nearest kind this vocabulary has and it
    # points the wrong way on its own, so the note carries the constitutional
    # fact: the United Kingdom of the Netherlands was a NEW state, and the
    # north entered it too.
    #
    # ⚠️ There is deliberately NO polity for it, which would be the obvious
    # way to say "one state, two modern territories". A polity absorbs its
    # members, the client drops any empire row whose metropole is absorbed, and
    # the Netherlands is a COLDAT metropole — so a United Kingdom of the
    # Netherlands polity would silently delete "Netherlands and its colonies"
    # from the 1815-1830 board and scatter Indonesia and Suriname to the bottom
    # as loose territories. See the guard now enforcing that in
    # build-country-population.py.
    {"slug": "belgium", "from": 1815, "to": 1830, "holder": "netherlands", "kind": "annexed",
     "note": "merged with the northern Netherlands into the new United Kingdom "
             "of the Netherlands at the Congress of Vienna"},
    # 🔴 LUXEMBOURG WAS NEVER ANNEXED BY ANYONE IN 1815. Vienna created the
    # Grand Duchy as a state in its own right, in PERSONAL UNION with the King
    # of the Netherlands and simultaneously a member of the German Confederation
    # with a Prussian garrison in the fortress. The board used to file 1815-1830
    # as "annexed by the Netherlands" and 1831-1890 as "client of the
    # Netherlands": the same arrangement under two different tags, split at a
    # year when nothing about the arrangement changed. 1830 is BELGIUM's date.
    # The old note even contradicted its own tag — "a Grand Duchy held by the
    # Dutch king, inside the German Confederation" describes a personal union,
    # which is what `client` is for.
    #
    # Luxembourg's own dates are 1839, 1867 and 1890.
    {"slug": "luxembourg", "from": 1815, "to": 1866, "holder": "netherlands", "kind": "client",
     "note": "a Grand Duchy in personal union with the Dutch crown, and a member "
             "state of the German Confederation with a Prussian garrison in the "
             "fortress; until the 1839 partition it also covered the Belgian "
             "province that still carries its name"},
    # The 1867 Treaty of London settled the Luxembourg Crisis: perpetual
    # neutrality, the Prussian garrison withdrawn, the fortress dismantled. That
    # left the shared monarch as the only remaining tie, and it lasted until
    # William III died without a son in 1890 and the Salic succession sent the
    # Dutch crown to Wilhelmina and the Grand Duchy to Adolphe of Nassau.
    {"slug": "luxembourg", "from": 1867, "to": 1890, "holder": "netherlands", "kind": "client",
     "note": "perpetually neutral under the 1867 Treaty of London and no longer "
             "garrisoned; by then the personal union with the Dutch crown was the "
             "only tie left, and it ended with the succession of 1890"},

    # --- Montenegro ---
    # Not partitioned and not really ruled: the Prince-Bishopric, and from 1852
    # the Principality, paid the Ottomans nominal deference and governed
    # itself. Filing it as an Ottoman member would credit the empire with
    # people it never counted; filing it as sovereign would pre-date its
    # recognition at Berlin by seventy years. It is a client, and says so.
    {"slug": "montenegro", "from": 1800, "to": 1877, "holder": "turkey", "kind": "client",
     "note": "nominal Ottoman suzerainty over a state that governed itself"},

    # --- Egypt and the Sudan after the Ottomans ---
    {"slug": "egypt", "from": 1882, "to": 1922, "holder": "united-kingdom", "kind": "occupied",
     "note": "occupied from 1882, a formal protectorate from 1914"},
    {"slug": "south-sudan", "from": 1821, "to": 1898, "holder": "egypt", "kind": "partial",
     "note": "the Turco-Egyptian Sudan, and the Mahdist state from 1885"},

    # --- Mandates and protectorates COLDAT does not carry ---
    # Found by scripts/audit-sovereignty.py, which listed these as sovereign
    # states in 1942. None of them were.
    {"slug": "papua-new-guinea", "from": 1902, "to": 1975, "holder": "australia", "kind": "colony"},
    # The Japanese landing is filed once, below with the rest of the Pacific,
    # and as PARTIAL rather than occupied: Port Moresby never fell. Two entries
    # for one fact rendered as "occupied by Japan, partial by Japan".
    {"slug": "palestine", "from": 1920, "to": 1948, "holder": "united-kingdom", "kind": "colony"},
    {"slug": "namibia", "from": 1915, "to": 1990, "holder": "south-africa", "kind": "colony"},
    # 🔴 SOUTH SUDAN IS NOT A THING SUDAN "PARTLY HELD". It WAS Sudan, until
    # 9 July 2011 (Ashwin, 2026-08-14). A `partial` tag left it standing as its
    # own row for 112 years, captioned "partly held by sudan" — which reads as
    # a border dispute rather than as one country, and never rolled up into
    # anything, so no total on the board ever contained it.
    #
    # It is now split at independence, which is the year the two territories
    # stopped sharing a government:
    #   1899-1955  a British colony alongside Sudan, so it sits inside the
    #              British Empire with it, exactly as every other colony does
    #   1956-2011  a member of the DEF_SUD polity in build-country-population.py,
    #              which is the row a reader sees for the undivided country
    # Before 1899 the Turco-Egyptian entry above still stands.
    {"slug": "south-sudan", "from": 1899, "to": 1955, "holder": "united-kingdom",
     "kind": "colony", "note": "the southern provinces of Anglo-Egyptian Sudan"},
    {"slug": "malta", "from": 1800, "to": 1964, "holder": "united-kingdom", "kind": "colony"},
    {"slug": "samoa", "from": 1900, "to": 1914, "holder": "germany", "kind": "colony"},
    {"slug": "samoa", "from": 1914, "to": 1962, "holder": "new-zealand", "kind": "colony"},
    # An Anglo-French condominium: two powers at once, so it is named for both
    # and summed into neither. COLDAT files it as "multiple colonizers" and
    # therefore drops it, which is why it read as independent.
    {"slug": "vanuatu", "from": 1906, "to": 1980, "holder": "united-kingdom", "kind": "colony"},
    {"slug": "vanuatu", "from": 1906, "to": 1980, "holder": "france", "kind": "colony"},
    {"slug": "morocco", "from": 1912, "to": 1956, "holder": "france", "kind": "colony"},
    {"slug": "morocco", "from": 1912, "to": 1956, "holder": "spain", "kind": "colony"},

    # --- Germany, 1938-1945 ---
    {"slug": "austria", "from": 1938, "to": 1945, "holder": "germany", "kind": "annexed"},
    # Bohemia and Moravia: a German protectorate from March 1939.
    {"slug": "czech-republic", "from": 1939, "to": 1945, "holder": "germany", "kind": "occupied"},
    # Slovakia was NOT occupied in 1939 - it was a nominally independent client
    # state under German protection, which is a different thing and is why it
    # gets its own kind rather than being filed with the Protectorate.
    {"slug": "slovakia", "from": 1939, "to": 1944, "holder": "germany", "kind": "client"},
    {"slug": "slovakia", "from": 1944, "to": 1945, "holder": "germany", "kind": "occupied"},
    # 🔴 Poland 1939-41 was held by BOTH, under the Molotov-Ribbentrop line:
    # Germany west, the Soviet Union east. Two holders in one year is not an
    # error to resolve in favour of the bigger one - it is the fact - so the
    # board names both and sums it into neither.
    {"slug": "poland", "from": 1939, "to": 1945, "holder": "germany", "kind": "occupied"},
    {"slug": "poland", "from": 1939, "to": 1941, "holder": "russia", "kind": "occupied"},
    {"slug": "denmark", "from": 1940, "to": 1945, "holder": "germany", "kind": "occupied"},
    {"slug": "norway", "from": 1940, "to": 1945, "holder": "germany", "kind": "occupied"},
    {"slug": "netherlands", "from": 1940, "to": 1945, "holder": "germany", "kind": "occupied"},
    {"slug": "belgium", "from": 1940, "to": 1944, "holder": "germany", "kind": "occupied"},
    {"slug": "luxembourg", "from": 1940, "to": 1941, "holder": "germany", "kind": "occupied"},
    {"slug": "luxembourg", "from": 1942, "to": 1944, "holder": "germany", "kind": "annexed"},
    # The south was Vichy, unoccupied, until Case Anton in November 1942.
    {"slug": "france", "from": 1940, "to": 1942, "holder": "germany", "kind": "partial",
     "note": "the north and west; the southern zone was Vichy until November 1942"},
    {"slug": "france", "from": 1943, "to": 1944, "holder": "germany", "kind": "occupied"},
    # Greece was occupied by three powers at once: Germany, Italy until the 1943
    # armistice, and Bulgaria in the north-east. Naming only Germany was the
    # same single-holder error that hid the Soviet half of Poland.
    {"slug": "greece", "from": 1941, "to": 1944, "holder": "germany", "kind": "occupied"},
    {"slug": "greece", "from": 1941, "to": 1943, "holder": "italy", "kind": "occupied"},
    {"slug": "greece", "from": 1941, "to": 1944, "holder": "bulgaria", "kind": "occupied"},
    # --- The partition of Yugoslavia, April 1941 ---
    # My first pass filed all of this under Germany, which is wrong almost
    # everywhere: the country was carved between five powers and two client
    # states, and Vardar Macedonia went to BULGARIA.
    {"slug": "serbia", "from": 1941, "to": 1944, "holder": "germany", "kind": "occupied"},
    # Croatia and Bosnia were the Independent State of Croatia - an Axis client
    # with its own government, not a territory under military administration.
    {"slug": "croatia", "from": 1941, "to": 1945, "holder": "germany", "kind": "client"},
    {"slug": "bosnia-herzegovina", "from": 1941, "to": 1945, "holder": "germany", "kind": "client"},
    # Slovenia was cut three ways, so it is tagged and summed into none.
    {"slug": "slovenia", "from": 1941, "to": 1945, "holder": "germany", "kind": "partial",
     "note": "divided between Germany, Italy and Hungary"},
    # Vardar Macedonia: Bulgarian, with the west attached to Italian Albania.
    {"slug": "north-macedonia", "from": 1941, "to": 1944, "holder": "bulgaria", "kind": "annexed"},
    {"slug": "montenegro", "from": 1941, "to": 1943, "holder": "italy", "kind": "occupied"},
    {"slug": "montenegro", "from": 1943, "to": 1944, "holder": "germany", "kind": "occupied"},
    # Kosovo was attached to Italian-run Greater Albania, then German-held.
    {"slug": "kosovo", "from": 1941, "to": 1943, "holder": "italy", "kind": "annexed"},
    {"slug": "kosovo", "from": 1943, "to": 1944, "holder": "germany", "kind": "occupied"},
    # Hungary was an Axis ALLY until the Wehrmacht occupied it in March 1944;
    # only the occupation is shown, because an ally is not a possession.
    {"slug": "hungary", "from": 1944, "to": 1945, "holder": "germany", "kind": "occupied"},
    # Northern Italy after the armistice, when Germany occupied its former ally.
    {"slug": "italy", "from": 1943, "to": 1945, "holder": "germany", "kind": "partial",
     "note": "the north and centre after the 1943 armistice; the south was Allied"},

    # German occupation of Soviet territory, 1941-1944. These were legally
    # Soviet republics throughout, so they still sit inside the USSR on the
    # board; the tag records who actually held the ground.
    {"slug": "belarus", "from": 1941, "to": 1944, "holder": "germany", "kind": "occupied"},
    {"slug": "ukraine", "from": 1941, "to": 1944, "holder": "germany", "kind": "occupied"},
    {"slug": "lithuania", "from": 1941, "to": 1944, "holder": "germany", "kind": "occupied"},
    {"slug": "latvia", "from": 1941, "to": 1944, "holder": "germany", "kind": "occupied"},
    {"slug": "estonia", "from": 1941, "to": 1944, "holder": "germany", "kind": "occupied"},
    {"slug": "moldova", "from": 1941, "to": 1944, "holder": "romania", "kind": "occupied"},

    # --- Polities covering PART of a modern territory ---
    # From _defunct.json, but each covers only a slice of the slug it maps to,
    # so summing it would hand the polity the whole country. Tagged instead.
    # holder "" means INTERNALLY divided rather than held by an outside power:
    # nobody else governed these, they simply were not one state that year.
    {"slug": "china", "from": 1912, "to": 1951, "holder": "", "kind": "partial",
     "note": "Tibet was separately governed until 1951"},
    {"slug": "united-states", "from": 1861, "to": 1865, "holder": "", "kind": "partial",
     "note": "the Confederate States held the south"},
    # ⚠️ NOTHING HERE FOR 1954-1975 ANY MORE, and that is deliberate. This used
    # to be a `partial` tag reading "divided at the 17th parallel", because no
    # source we had published the two halves separately. Ashwin asked whether
    # data existed; Correlates of War carries both, so Vietnam is now genuinely
    # SPLIT into North and South partition rows (COW_VDR / COW_VNS in
    # build-country-population.py) and the vietnam slug is absorbed by them for
    # those years. A `partial` tag on top would be a second, quieter
    # description of the same fact, and the two would drift.
    {"slug": "yemen", "from": 1967, "to": 1990, "holder": "", "kind": "partial",
     "note": "divided into North and South"},
    {"slug": "tanzania", "from": 1963, "to": 1964, "holder": "", "kind": "partial",
     "note": "Zanzibar was separate until the union"},
    {"slug": "germany", "from": 1947, "to": 1957, "holder": "france", "kind": "partial",
     "note": "the Saar was a French protectorate"},

    # --- Soviet occupations after 1944 ---
    # Romania, Hungary and Bulgaria were Axis ALLIES, not occupied, until the
    # Red Army arrived. Their alliance is not modelled: being on a side is not
    # being held, and folding an ally into an empire misdescribes both.
    {"slug": "romania", "from": 1944, "to": 1958, "holder": "russia", "kind": "occupied"},
    {"slug": "bulgaria", "from": 1944, "to": 1947, "holder": "russia", "kind": "occupied"},
    {"slug": "hungary", "from": 1945, "to": 1991, "holder": "russia", "kind": "occupied"},
    {"slug": "poland", "from": 1945, "to": 1993, "holder": "russia", "kind": "occupied"},

    # --- Italy ---
    {"slug": "ethiopia", "from": 1936, "to": 1941, "holder": "italy", "kind": "occupied"},
    {"slug": "albania", "from": 1939, "to": 1943, "holder": "italy", "kind": "occupied"},
    {"slug": "albania", "from": 1943, "to": 1944, "holder": "germany", "kind": "occupied"},

    # --- French Indochina, staged ---
    # 🔴 Ashwin asked why Vietnam is independent in the early 1800s. It was:
    # Nguyen Anh finished the Tay Son wars in 1802, took the throne as Gia Long
    # and ruled a unified Dai Nam from Hue. That is a sovereign empire and the
    # board is right to say so - see FRAGMENTED for the two contested years
    # before it. What the board got WRONG was the other end: COLDAT dates
    # French rule from 1887, the year the Union indochinoise was constituted,
    # which silently handed Vietnam twenty-five extra years of independence it
    # did not have. The conquest ran from 1858 and was finished in 1883.
    {"slug": "vietnam", "from": 1862, "to": 1882, "holder": "france", "kind": "partial",
     "note": "Cochinchina, ceded in 1862 and completed in 1867; the north was still Nguyen"},
    {"slug": "vietnam", "from": 1883, "to": 1886, "holder": "france", "kind": "colony",
     "note": "the Treaties of Hue made Annam and Tonkin protectorates"},
    # Cambodia was nobody's idea of a sovereign state in 1818: it survived by
    # paying tribute to Siam and to Vietnam at the same time, and spent
    # 1835-1847 under direct Vietnamese administration. COLDAT starts France in
    # 1884; the protectorate treaty was 1863.
    {"slug": "cambodia", "from": 1800, "to": 1862, "holder": "", "kind": "partial",
     "note": "a tributary of both Siam and Vietnam, and under direct Vietnamese rule 1835-1847"},
    {"slug": "cambodia", "from": 1863, "to": 1883, "holder": "france", "kind": "colony",
     "note": "the protectorate treaty of 1863"},
    # Laos was three kingdoms under Siamese overlordship, not a country - see
    # FRAGMENTED - and Siam kept them until the Franco-Siamese war of 1893.

    # --- German Micronesia, 1885-1914 ---
    # COLDAT runs Spain to 1899 and this file already had Japan from 1919,
    # which left the German fifteen years as a hole these islands spent
    # rendered as sovereign countries. Germany bought the Carolines, Palau and
    # the Marianas from Spain in 1899 and had taken the Marshalls in 1885.
    {"slug": "marshall-islands", "from": 1885, "to": 1914, "holder": "germany", "kind": "colony"},
    {"slug": "federated-states-of-micronesia", "from": 1899, "to": 1914,
     "holder": "germany", "kind": "colony"},
    # Germany claimed Palau in 1885 and LOST the arbitration: Leo XIII found
    # for Spain, and Germany only bought the islands in 1899. The interregnum
    # rule would otherwise read COLDAT's two German runs as continuous and hand
    # Berlin fourteen years it spent losing a papal case.
    {"slug": "palau", "from": 1800, "to": 1898, "holder": "spain", "kind": "colony",
     "note": "Spanish; the German claim of 1885 went to papal arbitration and failed"},
    {"slug": "palau", "from": 1899, "to": 1914, "holder": "germany", "kind": "colony"},
    # The Straits Settlements from 1826, sixty years before COLDAT starts its
    # British run at the founding of British Malaya.
    {"slug": "malaysia", "from": 1826, "to": 1887, "holder": "united-kingdom", "kind": "colony",
     "note": "the Straits Settlements; the peninsular sultanates came under protection from 1874"},
    {"slug": "solomon-islands", "from": 1893, "to": 1918, "holder": "united-kingdom",
     "kind": "colony", "note": "the British Solomon Islands Protectorate, declared in 1893"},
    {"slug": "nauru", "from": 1888, "to": 1914, "holder": "germany", "kind": "colony"},
    {"slug": "nauru", "from": 1914, "to": 1968, "holder": "australia", "kind": "colony",
     "note": "administered by Australia under a League mandate, then a UN trusteeship"},
    # Japan took the German islands in 1914, five years before the mandate.
    {"slug": "marshall-islands", "from": 1914, "to": 1918, "holder": "japan", "kind": "occupied"},
    {"slug": "federated-states-of-micronesia", "from": 1914, "to": 1918,
     "holder": "japan", "kind": "occupied"},
    {"slug": "palau", "from": 1914, "to": 1918, "holder": "japan", "kind": "occupied"},
    # The American trusteeship, between Japan and independence.
    {"slug": "marshall-islands", "from": 1945, "to": 1986, "holder": "united-states", "kind": "colony"},
    {"slug": "federated-states-of-micronesia", "from": 1945, "to": 1986,
     "holder": "united-states", "kind": "colony"},
    {"slug": "palau", "from": 1945, "to": 1994, "holder": "united-states", "kind": "colony"},

    # --- Places COLDAT hands back and forth, where the truth is one holder ---
    # Britain returned Senegal to France in 1817, thirty-seven years before
    # COLDAT restarts the French run.
    {"slug": "senegal", "from": 1818, "to": 1853, "holder": "france", "kind": "colony",
     "note": "Saint-Louis and Goree, returned by Britain in 1817; the interior was still Wolof and Fouta"},
    {"slug": "belize", "from": 1800, "to": 1862, "holder": "united-kingdom", "kind": "colony",
     "note": "the Bay settlement, a formal colony from 1862"},
    {"slug": "equatorial-guinea", "from": 1800, "to": 1826, "holder": "spain", "kind": "colony",
     "note": "Fernando Po and Annobon, Spanish from 1778"},
    {"slug": "dominica", "from": 1800, "to": 1804, "holder": "united-kingdom", "kind": "colony",
     "note": "ceded by France at Paris in 1763"},
    {"slug": "seychelles", "from": 1800, "to": 1813, "holder": "united-kingdom", "kind": "colony",
     "note": "captured in 1794, confirmed at Paris in 1814"},
    # The Banda Oriental: Spanish, then taken by Portugal in 1817 and held as
    # the Cisplatina by Brazil until the 1828 settlement made Uruguay a state.
    {"slug": "uruguay", "from": 1817, "to": 1828, "holder": "brazil", "kind": "annexed",
     "note": "the Cisplatina, occupied by Portugal in 1817 and annexed by Brazil in 1822"},
    # Haiti held the whole island for twenty-two years. Neither COLDAT nor any
    # European-colonisation dataset can see it, because the holder was not
    # European - the same blind spot that hid the Empire of Japan.
    {"slug": "dominican-republic", "from": 1822, "to": 1843, "holder": "haiti",
     "kind": "annexed", "note": "the Haitian unification of Hispaniola"},

    # ==== closed by the full 1800-2025 sweep ==============================
    # Everything below was found by scripts/audit-sovereignty.py --sweep, which
    # walks every year rather than nine benchmarks. All of it sits in the SEAMS
    # between rules that were each correct on their own: the Ottoman Empire
    # ends in 1829 and COLDAT's France begins in 1848, the Russian Empire ends
    # in 1917 and the Soviet Union begins in 1922, Japan leaves Korea in 1945
    # and the republics arrive in 1948. Every seam rendered as independence.

    # Algeria between the fall of the Regency and COLDAT's French run.
    {"slug": "algeria", "from": 1830, "to": 1847, "holder": "france", "kind": "colony",
     "note": "the conquest from 1830; French Algeria was constituted in 1848"},

    # --- the Russian Civil War, 1918-1921 ---
    # The empire ended in 1917 and the Union was not founded until December
    # 1922, so seven republics spent four years on the board as independent
    # countries. They were not: the ground was contested between Bolshevik,
    # White and short-lived national governments, and no single power held it.
    # Named and summed into nobody, which is what "contested" is for.
    *[{"slug": s, "from": 1918, "to": 1921, "holder": "", "kind": "partial",
       "note": "the Russian Civil War; Bolshevik, White and national governments all claimed it"}
      for s in ("ukraine", "belarus", "kazakhstan", "kyrgyzstan", "tajikistan",
                "turkmenistan", "uzbekistan")],
    # The three Caucasus republics were REAL STATES in 1918-1920, which is why
    # they are not in the list above. What ended them was the Red Army, and
    # each fell on its own date.
    {"slug": "azerbaijan", "from": 1920, "to": 1921, "holder": "russia", "kind": "annexed",
     "note": "the Red Army entered Baku in April 1920"},
    {"slug": "armenia", "from": 1920, "to": 1921, "holder": "russia", "kind": "annexed",
     "note": "sovietised in December 1920"},
    {"slug": "georgia", "from": 1921, "to": 1921, "holder": "russia", "kind": "annexed",
     "note": "the Red Army took Tbilisi in February 1921"},
    # Bessarabia went to ROMANIA in 1918 and stayed there until the Soviet
    # ultimatum of 1940, which is where the USSR's member window starts.
    {"slug": "moldova", "from": 1918, "to": 1939, "holder": "romania", "kind": "annexed",
     "note": "Bessarabia, united with Romania in 1918"},

    # --- the Balkan Wars and the First World War in the south ---
    # Serbia took Kosovo and Vardar Macedonia in 1913; both were then fought
    # over until Yugoslavia was formed in 1918.
    {"slug": "kosovo", "from": 1913, "to": 1915, "holder": "serbia", "kind": "annexed"},
    {"slug": "north-macedonia", "from": 1913, "to": 1915, "holder": "serbia", "kind": "annexed"},
    {"slug": "kosovo", "from": 1916, "to": 1917, "holder": "", "kind": "partial",
     "note": "occupied by Austria-Hungary and Bulgaria"},
    {"slug": "north-macedonia", "from": 1916, "to": 1917, "holder": "bulgaria",
     "kind": "occupied"},
    # After Serbia and Montenegro dissolved in 2006, Kosovo was still formally
    # Serbian and actually run by the UN mission until the 2008 declaration.
    {"slug": "kosovo", "from": 2006, "to": 2007, "holder": "serbia", "kind": "partial",
     "note": "administered by the United Nations mission, formally part of Serbia"},

    # --- the seam between Japan and the two Korean states ---
    {"slug": "south-korea", "from": 1945, "to": 1947, "holder": "united-states",
     "kind": "occupied", "note": "the American military government, until the republic of 1948"},
    {"slug": "north-korea", "from": 1945, "to": 1947, "holder": "russia",
     "kind": "occupied", "note": "the Soviet Civil Administration, until the republic of 1948"},

    # --- other seams ---
    {"slug": "bangladesh", "from": 1947, "to": 1970, "holder": "pakistan", "kind": "partial",
     "note": "East Pakistan, until the war of 1971"},
    {"slug": "singapore", "from": 1963, "to": 1964, "holder": "malaysia", "kind": "partial",
     "note": "a state of Malaysia until the separation of 1965"},
    {"slug": "northern-mariana-islands", "from": 1945, "to": 1946,
     "holder": "united-states", "kind": "occupied",
     "note": "under American military government before the 1947 trusteeship"},
    {"slug": "mongolia", "from": 1919, "to": 1921, "holder": "china", "kind": "occupied",
     "note": "the Republic of China revoked the autonomy of 1911 and reoccupied Urga"},
    # The Mandate ended in 1948 and no Palestinian state followed it.
    {"slug": "palestine", "from": 1949, "to": 1966, "holder": "", "kind": "partial",
     "note": "the West Bank administered by Jordan and the Gaza Strip by Egypt"},
    {"slug": "palestine", "from": 1967, "to": 1993, "holder": "israel", "kind": "occupied",
     "note": "the territories occupied in 1967, until the Oslo accords"},

    # ==== THE WAR YEARS ===================================================
    # Ashwin: "I want a perfect resolution for the war years, I should be able
    # to know who was occupied each year." The rest of this file is a rule per
    # territory; this section is a rule per YEAR, and it is checked as one by
    # scripts/audit-occupation.py, which holds the expected occupied set for
    # every year of both wars and fails if the data stops matching it.
    #
    # THREE DISTINCTIONS THE BOARD MUST NOT BLUR, because the popular memory of
    # these years blurs all three:
    #   * An ALLY is not a possession. Romania, Bulgaria, Hungary, Finland and
    #     Thailand fought alongside the Axis as sovereign states with their own
    #     governments and armies. Each was occupied EVENTUALLY, and the year it
    #     happened is the interesting fact - Hungary March 1944, Romania and
    #     Bulgaria September 1944 - so filing them as occupied from 1941 would
    #     destroy the only thing worth knowing about them.
    #   * A CLIENT is not a possession either. Slovakia and the Independent
    #     State of Croatia had their own governments.
    #   * NEUTRALS stayed neutral. Sweden, Switzerland, Spain, Portugal,
    #     Ireland and Turkey are not on this list because nobody held them.

    # --- the First World War, 1914-1918 ---
    {"slug": "belgium", "from": 1914, "to": 1918, "holder": "germany", "kind": "occupied",
     "note": "all but the sliver behind the Yser"},
    {"slug": "luxembourg", "from": 1914, "to": 1918, "holder": "germany", "kind": "occupied"},
    {"slug": "france", "from": 1914, "to": 1918, "holder": "germany", "kind": "partial",
     "note": "ten departements in the north-east, and the industrial heart of the country"},
    {"slug": "serbia", "from": 1915, "to": 1918, "holder": "", "kind": "partial",
     "note": "overrun in 1915 and divided between Austria-Hungary and Bulgaria"},
    # Austria-Hungary has no modern slug of its own, so an occupation by it is
    # keyed to Austria, the successor that heads the empire row. It cannot
    # double-count: Austria is itself inside Austria-Hungary these years, so
    # the aggregation rule skips it and the row simply reads as tagged.
    {"slug": "montenegro", "from": 1916, "to": 1918, "holder": "austria", "kind": "occupied",
     "note": "occupied by Austria-Hungary in January 1916"},
    {"slug": "romania", "from": 1916, "to": 1918, "holder": "", "kind": "partial",
     "note": "Wallachia held by Germany, Austria-Hungary and Bulgaria; the government kept Moldavia"},
    {"slug": "albania", "from": 1914, "to": 1920, "holder": "", "kind": "partial",
     "note": "fought over by Italy, Austria-Hungary, Serbia, France and Greece"},
    # Ober Ost: the German military government of the eastern front, which ran
    # from Poland to the Baltic and stayed until after the armistice.
    *[{"slug": s, "from": 1915, "to": 1918, "holder": "germany", "kind": "occupied",
       "note": "under Ober Ost, the German military government in the east"}
      for s in ("poland", "lithuania", "latvia", "belarus")],
    {"slug": "estonia", "from": 1918, "to": 1918, "holder": "germany", "kind": "occupied",
     "note": "occupied in February 1918, after Brest-Litovsk"},
    {"slug": "ukraine", "from": 1918, "to": 1918, "holder": "germany", "kind": "occupied",
     "note": "occupied under Brest-Litovsk, with the Hetmanate as a client government"},
    {"slug": "greece", "from": 1916, "to": 1917, "holder": "", "kind": "partial",
     "note": "the National Schism: two governments, with the Allies holding Salonika"},
    {"slug": "iran", "from": 1914, "to": 1921, "holder": "", "kind": "partial",
     "note": "neutral on paper, with Russian, Ottoman and British armies on Persian soil"},
    # The Ottoman collapse: the capital and the straits under Allied control,
    # Izmir and its hinterland held by Greece until the 1922 counter-offensive.
    {"slug": "turkey", "from": 1918, "to": 1922, "holder": "", "kind": "partial",
     "note": "Istanbul and the straits under Allied occupation, Izmir held by Greece from 1919"},
    # Kosovo and Vardar Macedonia in 1916-17 are already listed above, with the
    # Balkan Wars; they are the same occupation seen from the other war.

    # --- the run-up, 1936-1939 ---
    {"slug": "czech-republic", "from": 1938, "to": 1938, "holder": "germany", "kind": "partial",
     "note": "the Sudetenland, ceded at Munich; the Protectorate followed in March 1939"},

    # --- the Second World War: what the existing entries above did not cover -
    # Denmark's occupation is already listed; from August 1943 the fiction of a
    # co-operating Danish government ended and the Germans governed directly.
    {"slug": "iceland", "from": 1940, "to": 1941, "holder": "united-kingdom", "kind": "occupied",
     "note": "occupied in May 1940 to keep it out of German hands, Denmark having fallen"},
    {"slug": "iceland", "from": 1941, "to": 1945, "holder": "united-states", "kind": "occupied",
     "note": "the American garrison relieved the British in July 1941"},
    {"slug": "faroe-islands", "from": 1940, "to": 1945, "holder": "united-kingdom",
     "kind": "occupied", "note": "occupied in April 1940, days after Denmark fell"},
    {"slug": "greenland", "from": 1941, "to": 1945, "holder": "united-states", "kind": "occupied",
     "note": "under American protection while Denmark was occupied"},
    {"slug": "monaco", "from": 1942, "to": 1943, "holder": "italy", "kind": "occupied"},
    {"slug": "monaco", "from": 1943, "to": 1944, "holder": "germany", "kind": "occupied"},
    # The Anglo-Soviet invasion of August 1941: Britain in the south, the
    # Soviet Union in the north, the Shah deposed and his son installed.
    {"slug": "iran", "from": 1941, "to": 1946, "holder": "", "kind": "partial",
     "note": "invaded by Britain and the Soviet Union in August 1941 and divided between them"},
    {"slug": "iraq", "from": 1941, "to": 1947, "holder": "united-kingdom", "kind": "occupied",
     "note": "reoccupied after the Anglo-Iraqi war of May 1941"},
    # Egypt was sovereign in law and a British base in fact, which is a partial
    # holding rather than an occupation - the 1936 treaty was signed by an
    # Egyptian government, and the 1942 ultimatum was delivered to a king who
    # kept his throne.
    {"slug": "egypt", "from": 1939, "to": 1945, "holder": "united-kingdom", "kind": "partial",
     "note": "sovereign, with British forces in the country under the 1936 treaty"},

    # --- the Pacific, where the board had Japan holding half of what it took -
    {"slug": "guam", "from": 1941, "to": 1944, "holder": "japan", "kind": "occupied",
     "note": "taken in December 1941, retaken by the United States in July 1944"},
    {"slug": "cambodia", "from": 1941, "to": 1945, "holder": "japan", "kind": "occupied",
     "note": "Japanese forces from 1941 alongside the Vichy administration, and direct rule from March 1945"},
    {"slug": "laos", "from": 1941, "to": 1945, "holder": "japan", "kind": "occupied",
     "note": "Japanese forces from 1941 alongside the Vichy administration, and direct rule from March 1945"},
    {"slug": "east-timor", "from": 1942, "to": 1945, "holder": "japan", "kind": "occupied",
     "note": "invaded in February 1942, though Portugal was neutral"},
    {"slug": "nauru", "from": 1942, "to": 1945, "holder": "japan", "kind": "occupied"},
    {"slug": "kiribati", "from": 1941, "to": 1943, "holder": "japan", "kind": "occupied",
     "note": "the Gilberts, taken in December 1941 and retaken at Tarawa in 1943"},
    {"slug": "solomon-islands", "from": 1942, "to": 1945, "holder": "japan", "kind": "partial",
     "note": "the northern and western islands; the campaign from Guadalcanal took three years"},
    {"slug": "papua-new-guinea", "from": 1942, "to": 1945, "holder": "japan", "kind": "partial",
     "note": "the north coast and New Britain; Port Moresby never fell"},

    # --- and afterwards, which was as much an occupation as the war was ------
    # Without these Germany, Austria and Japan all read as ordinary sovereign
    # countries from the moment they surrendered.
    {"slug": "germany", "from": 1945, "to": 1948, "holder": "", "kind": "partial",
     "note": "divided into American, British, French and Soviet occupation zones"},
    {"slug": "austria", "from": 1945, "to": 1955, "holder": "", "kind": "partial",
     "note": "four occupation zones until the State Treaty of 1955"},
    {"slug": "japan", "from": 1945, "to": 1951, "holder": "united-states", "kind": "occupied",
     "note": "the Allied occupation, until the San Francisco treaty took effect in 1952"},
]

# --------------------------------------------- not yet one country ---------
# A modern country's borders often describe a colony, not a state that existed
# before it. Nigeria in 1818 was the Sokoto Caliphate, the Yoruba states, Benin
# and the Igbo polities; Bangladesh and Pakistan were parts of a subcontinent
# nobody administered as those shapes. Rendering them as ordinary rows, ranked
# beside France, says they were countries. They were not.
#
# DERIVED, not hand-listed: for a colonised territory the window runs from 1800
# to the year before COLDAT's first colonial run begins. Enumerating a hundred
# countries by hand would be a hundred chances to be wrong; this asks the one
# question that has a sourced answer - when did the administration that drew
# these borders arrive.
#
# THE EXCEPTION LIST IS THE CURATED PART. Plenty of colonised places WERE
# coherent states first and must not be labelled this way: Vietnam under the
# Nguyen, Morocco, Egypt, Ethiopia, Korea, Sri Lanka, Nepal, Iran, Myanmar
# under the Konbaung. Being colonised later does not mean you were a patchwork
# before. Ashwin should review this list; it is a judgment, not a lookup.
# NOTE: "laos" is deliberately absent. It was three Siamese vassal kingdoms,
# not a state, and it carries an explicit FRAGMENTED window instead.
PRE_COLONIAL_STATES = {
    "vietnam", "cambodia", "myanmar", "thailand", "korea", "south-korea",
    "north-korea", "sri-lanka", "nepal", "bhutan", "iran", "afghanistan",
    "morocco", "tunisia", "algeria", "egypt", "ethiopia", "eritrea", "oman",
    "yemen", "madagascar", "china", "japan", "mongolia", "turkey", "iraq",
    "syria", "lebanon", "jordan", "israel", "palestine", "saudi-arabia",
    "malta", "cyprus", "iceland", "ireland", "haiti",
}

# Places that were never colonised but were also not one country yet. Curated,
# because there is no colonisation date to derive a window from.
FRAGMENTED = [
    {"slug": "uzbekistan", "from": 1800, "to": 1867,
     "note": "the khanates of Bukhara, Khiva and Kokand, not one country"},
    {"slug": "tajikistan", "from": 1800, "to": 1867,
     "note": "under the Emirate of Bukhara"},
    {"slug": "turkmenistan", "from": 1800, "to": 1884,
     "note": "Turkmen tribal confederations, not one country"},
    {"slug": "kyrgyzstan", "from": 1800, "to": 1875,
     "note": "under the Khanate of Kokand"},
    {"slug": "germany", "from": 1800, "to": 1870,
     "note": "the Holy Roman Empire until 1806, then the German Confederation - dozens of separate states"},
    {"slug": "italy", "from": 1800, "to": 1860,
     "note": "Austrian Lombardy-Venetia, the Papal States, the Two Sicilies, Sardinia-Piedmont and the duchies"},
    # Derived would give India the generic note; the subcontinent deserves the
    # specific one, and Bangladesh and Pakistan fall out of the same history.
    {"slug": "india", "from": 1800, "to": 1856,
     "note": "Company territory alongside the Maratha powers and hundreds of princely states"},

    # --- found by the 1818 sweep, where each of these read as a country ---
    # Vietnam is the narrow case Ashwin's question actually lands on: the
    # Nguyen empire was sovereign from 1802, but in 1800 and 1801 the country
    # was still two halves at war.
    {"slug": "vietnam", "from": 1800, "to": 1801,
     "note": "the Tay Son held the north and the Nguyen the south until the unification of 1802"},
    {"slug": "laos", "from": 1800, "to": 1892,
     "note": "the kingdoms of Luang Prabang, Vientiane and Champasak, all vassals of Siam"},
    {"slug": "malaysia", "from": 1800, "to": 1825,
     "note": "the Malay sultanates, with Dutch Malacca and British Penang on the coast"},
    {"slug": "kazakhstan", "from": 1800, "to": 1846,
     "note": "the three Kazakh zhuz, under Russian protection and not one country"},
    {"slug": "liberia", "from": 1800, "to": 1846,
     "note": "settled from 1822 by the American Colonization Society; a republic in 1847"},
    {"slug": "south-sudan", "from": 1800, "to": 1820,
     "note": "the Shilluk, Azande and Dinka polities, before the Turco-Egyptian conquest"},
    {"slug": "american-samoa", "from": 1800, "to": 1899,
     "note": "the Samoan chiefdoms, before the Tripartite Convention divided them"},
    {"slug": "new-caledonia", "from": 1800, "to": 1852,
     "note": "the Kanak clans, before the French annexation of 1853"},
]


def fragmented(runs):
    """-> [{slug, from, to, note}] for territories that were not yet one
    country: the curated cases, plus every colonised territory before the
    administration that drew its borders arrived."""
    out = {f["slug"]: dict(f) for f in FRAGMENTED}
    for slug, rr in sorted(runs.items()):
        if slug in PRE_COLONIAL_STATES or slug in out:
            continue
        first = min(a for a, _b, _n in rr)
        if first <= 1800:
            continue  # already colonised when this board starts
        out[slug] = {
            "slug": slug, "from": 1800, "to": first - 1,
            "note": f"today's borders were drawn under colonial rule from {first}",
        }
    return [out[k] for k in sorted(out)]


# ------------------------------------------------------- the interregnum ---
# 🔴 THE LARGEST REMAINING SOURCE OF FALSE SOVEREIGNTY, and it is a dataset
# artefact rather than a curation gap. COLDAT records discrete RUNS of colonial
# rule, one per power, and does not bridge a handover. So Senegal's British run
# ends in 1817 and its French run starts in 1854, Ghana's British run stops in
# 1883 and resumes in 1917, the Gold Coast having gone nowhere in between.
# Every one of those gaps rendered as an independent country on the board, and
# each looked exactly like a real fact: a flag, a population, a rank.
#
# Ashwin found Ukraine, Guam, Poland and Belgium one at a time. This is the
# same failure with thirty more instances, so it gets a rule instead of thirty
# more lines:
#
#   * SAME power on both sides of the gap -> it never left. Attribute the gap
#     to that power. (Ghana 1884-1916, Somalia 1905-1936.)
#   * DIFFERENT powers -> something happened that COLDAT does not record, and
#     guessing which one held it would be inventing history. Mark the years
#     contested, name both administrations, and sum them into neither.
#
# Years already covered by a curated EXTRA_HOLDINGS entry are left alone: the
# hand-written answer always beats the derived one.
#
# RESTORED_INDEPENDENCE is the exception, and it is short because genuine
# independence between two colonial periods is rare. Anything listed here is a
# gap the rule must NOT close.
RESTORED_INDEPENDENCE = {
    # Independent from 1844, briefly Spanish again 1861-65, then occupied by
    # the United States. The middle gap is a real republic, not a handover.
    "dominican-republic": [(1844, 1860), (1866, 1915)],
    # Independent in 1804 and never colonised again; the later American
    # occupation is a separate run.
    "haiti": [(1804, 1914)],
}


def interregnum(runs, curated=None, frag=()):
    """-> [holding] closing the gaps BETWEEN COLDAT runs, which are handovers
    rather than restorations of independence.

    `frag` is the not-yet-one-country windows. Those already answer the year,
    and their answer is better: "the Malay sultanates" beats "between
    administrations" for 1800-1825."""
    curated = EXTRA_HOLDINGS if curated is None else curated
    covered = {}
    for h in list(curated) + list(frag):
        covered.setdefault(h["slug"], set()).update(range(h["from"], h["to"] + 1))
    out = []
    for slug, rr in sorted(runs.items()):
        rr = sorted(rr)
        for (_a1, b1, n1), (a2, _b2, n2) in zip(rr, rr[1:]):
            lo, hi = max(b1 + 1, 1800), a2 - 1
            if hi < lo:
                continue
            free = sorted(y for y in range(lo, hi + 1)
                          if y not in covered.get(slug, ())
                          and not any(x <= y <= z
                                      for x, z in RESTORED_INDEPENDENCE.get(slug, [])))
            if not free:
                continue
            same = n1 == n2
            for a, b in spans(free):
                out.append({
                    "slug": slug, "from": a, "to": b,
                    "holder": METROPOLE[n1] if same and n1 in METROPOLE else "",
                    "kind": "colony" if same else "partial",
                    "note": (f"{n1} throughout; the source records the period as two runs"
                             if same else
                             f"between administrations: {n1} until {b1}, {n2} from {a2}"),
                    "derived": True,
                })
    return out


def spans(years):
    """-> [(from, to)] contiguous runs from a sorted list of years."""
    out = []
    for y in years:
        if out and y == out[-1][1] + 1:
            out[-1][1] = y
        else:
            out.append([y, y])
    return [(a, b) for a, b in out]


# ---------------------------------------------------------------------------
# ERA-CORRECT NAMES. Read for BOTH the country rows and the ad-hoc empire rows.
#
# 🔴 THE BOARD USED TO PUT MODERN NAMES ON EVERY HISTORICAL ROW. A 1900 view
# listed Iran, Thailand, Sri Lanka, Myanmar, Zimbabwe and Burkina Faso, none of
# which anyone alive in 1900 had heard of. It is the same failure as the rest
# of this feature — a confident label on a year that cannot support it — and it
# was the one the board made most often, on every row, in every year.
#
# THE TEST FOR ADDING ONE, inherited from ERA_NAME_COUNTRIES below: would a
# reader IN THAT YEAR have given this as the territory's name? Persia and Siam
# and the Gold Coast pass. Abyssinia and Formosa do not — those are exonyms
# other people used, not what the place called itself. Mesopotamia does not: it
# is a region, not a state.
#
# Renames only, never a change of STATE. Where the ground was held by a
# different polity the polity list already owns it: Rhodesia 1965-1979, the
# Ottoman Empire, the USSR, Gran Colombia. A name here must be the same
# territory under a different word.
#
# ⚠️ THE FLAG STAYS MODERN, and that is a known compromise. A 1900 row reading
# "Persia" flies the current Iranian flag, because the site has period artwork
# for exactly four historical states (see HISTORICAL_FLAG in the client). The
# polity rows solve this by flying nothing at all; a country row cannot, since
# it is the same country. Better a right name with an anachronistic flag than a
# wrong name with a matching one, but it is a compromise and not a solution.
#
# ⚠️ Türkiye is deliberately absent. It is a live naming question about the
# PRESENT, not a historical rename, and the whole site says Turkey; changing it
# here alone would make the Time Machine disagree with every other page.
EXTRA_ERA_NAMES = {
    "japan": [[1895, 1947, "Empire of Japan"]],

    # --- the same state under a different name ---
    "iran": [[1800, 1934, "Persia"]],
    # Renamed in 1939, reverted in 1945, renamed again in 1949. The revert is
    # not a technicality: it is the point of the whole exercise, because a
    # board that shows Thailand in 1946 is wrong in the same way it was wrong
    # in 1900, just for three years instead of a century.
    "thailand": [[1800, 1938, "Siam"], [1945, 1948, "Siam"]],
    "sri-lanka": [[1800, 1971, "Ceylon"]],
    "myanmar": [[1800, 1988, "Burma"]],
    "oman": [[1800, 1969, "Muscat and Oman"]],
    "eswatini": [[1800, 2017, "Swaziland"]],
    "benin": [[1800, 1974, "Dahomey"]],
    "burkina-faso": [[1919, 1983, "Upper Volta"]],
    "cambodia": [[1975, 1988, "Kampuchea"]],
    "north-macedonia": [[1991, 2018, "Macedonia"]],
    "jordan": [[1921, 1948, "Transjordan"]],
    "ireland": [[1922, 1936, "Irish Free State"]],
    "bangladesh": [[1947, 1970, "East Pakistan"]],
    "congo-dr": [[1885, 1907, "Congo Free State"], [1908, 1959, "Belgian Congo"],
                 [1971, 1996, "Zaire"]],

    # --- colonial-era names, where the territory's own name was different ---
    # The row already says "colony of the United Kingdom"; what it did not say
    # was that the colony was called the Gold Coast.
    "ghana": [[1821, 1956, "Gold Coast"]],
    "malawi": [[1907, 1963, "Nyasaland"]],
    "zambia": [[1911, 1963, "Northern Rhodesia"]],
    # 1965-1979 belongs to the Rhodesia polity, not here.
    "zimbabwe": [[1898, 1964, "Southern Rhodesia"]],
    "botswana": [[1885, 1965, "Bechuanaland"]],
    "lesotho": [[1868, 1965, "Basutoland"]],
    "tanzania": [[1885, 1918, "German East Africa"], [1919, 1963, "Tanganyika"]],
    "namibia": [[1884, 1989, "South West Africa"]],
    "vanuatu": [[1906, 1979, "New Hebrides"]],
    "belize": [[1862, 1972, "British Honduras"]],
    "indonesia": [[1800, 1949, "Dutch East Indies"]],
    "kiribati": [[1892, 1978, "Gilbert Islands"]],
    "tuvalu": [[1892, 1977, "Ellice Islands"]],
    "east-timor": [[1800, 1974, "Portuguese Timor"]],
    "malaysia": [[1948, 1962, "Federation of Malaya"]],
    # 1815-1830 the northern Netherlands was not "the Netherlands" as a reader
    # means it today, it was the northern half of a larger state that also
    # contained Belgium. Belgium's own row says it was merged into that state;
    # without this the Dutch row said nothing at all and the merger read as a
    # thing that happened only to the Belgians.
    #
    # This is also the SAFE way to say it. The obvious alternative, a polity
    # covering both, would absorb the Netherlands and take the Dutch empire row
    # down with it — see the guard in build-country-population.py. An era name
    # relabels the row without changing what it contains, so Indonesia and
    # Suriname stay where they belong.
    "netherlands": [[1815, 1830, "United Kingdom of the Netherlands"]],
}

# 🔴 WHEN the current holder acquired it. Without this every dependency was
# attributed to its MODERN holder all the way back to 1800, which put Guam and
# the Northern Marianas under the United States in 1818 - eighty years before
# the US took them, and while they were Spanish. Hong Kong and Macau were fixed
# case by case first; that was treating instances of a class as if they were
# the class. This is the class.
#
# Only dependencies with a population series can reach the board, and there are
# fifteen. Those that predate 1800 are listed anyway, at 1800, so that every one
# is a deliberate entry rather than an assumption nobody wrote down.
DEPENDENCY_SINCE = {
    # Acquired after this board starts.
    "guam": 1898,                      # Spanish from 1668, ceded at Paris
    "northern-mariana-islands": 1947,  # Spanish, then German 1899, Japanese 1914
    "american-samoa": 1900,            # Tripartite Convention
    "new-caledonia": 1853,             # annexed by France
    # Held well before 1800; stated, not assumed.
    "bermuda": 1800, "british-virgin-islands": 1800, "cayman-islands": 1800,
    "gibraltar": 1800, "isle-of-man": 1800,
    "faroe-islands": 1800, "greenland": 1800,
    "aruba": 1800, "curacao": 1800,
    # Both carry a DEPENDENCY_OVERRIDE window; their modern holder is recent.
    "hong-kong": 1997, "macau": 1999,
}

DEPENDENCY_OVERRIDES = [
    {"slug": "hong-kong", "from": 1842, "to": 1997, "holder": "united-kingdom"},
    {"slug": "macau", "from": 1800, "to": 1999, "holder": "portugal"},
]


def era_name(coloniser, a, b):
    """The label when ONE name covers the whole span. Mostly it does not - the
    German colonial period runs 1884-1922 and straddles the end of the Empire -
    so the periodised list is emitted too and resolved against the selected
    year at render time, the way the champions ledger resolves competition
    names against the month being viewed."""
    for lo, hi, name in ERA_NAMES.get(coloniser, []):
        if a >= lo and b <= hi:
            return name
    return f"{coloniser} and its colonies"


def dominion_from(slug):
    for d in DOMINIONS:
        if d["slug"] == slug:
            return d
    return None


def empires(runs):
    """-> [{name, metropole, from, to}] for colonisers worth showing."""
    span = {}
    count = {}
    for slug, rr in runs.items():
        d = dominion_from(slug)
        for a, b, name in rr:
            # A dominion stops counting toward its coloniser's empire from the
            # year it governed itself.
            hi_b = min(b, d["from"] - 1) if d and d["of"] == name else b
            if hi_b < a:
                continue
            lo, hi = span.get(name, (a, hi_b))
            span[name] = (min(lo, a), max(hi, hi_b))
            count.setdefault(name, set()).add(slug)
    out = []
    for name, (a, b) in sorted(span.items()):
        if len(count[name]) < MIN_COLONIES:
            continue
        out.append({
            "name": era_name(name, a, b),
            "eraNames": ERA_NAMES.get(name, []),
            "coloniser": name,
            "metropole": METROPOLE[name],
            "from": a,
            "to": b,
            "territories": len(count[name]),
        })
    return sorted(out, key=lambda e: e["from"])


# 🔴 ONLY these countries take an era name from the leaders layer.
#
# Reading every country's `era` was a mistake I shipped and Ashwin caught in
# about a minute: Iran rendered as "Pahlavi dynasty" in 1942, Argentina as
# "Infamous Decade / Concordancia", Hungary as "Kingdom/Regency". Those are
# labels for a REGIME, which is what a leaders board wants. They are not the
# name of the state, which is what a population board shows. Iran in 1942 was
# Iran, governed by the Pahlavis.
#
# The test for adding one: would a reader in that year have given this as the
# country's NAME? "Nazi Germany" and "German Empire" pass. "Concordancia"
# does not. Turkey and Russia are absent because the Ottoman Empire and the
# Soviet Union are already modelled as states in their own right.
ERA_NAME_COUNTRIES = {"germany"}


def country_eras():
    """-> {slug: [[from, to, name]]} from the LEADERS layer's own `era` field.

    Read from public/data/leaders/*.json rather than curated here, so the
    Time Machine and the World Leaders time machine cannot drift apart: 1940
    says "Nazi Germany" on both boards because both read the same field.

    THE ERA COVERING TODAY IS DROPPED. Germany's current era is "Federal
    Republic", and relabelling the present-day row that would be worse than
    leaving it alone - the country's own name is the right name for now.

    OVERLAPS RESOLVE TO THE LATEST START. Weimar runs 1918-1934 and Nazi
    Germany 1933-1945 because the leaders they cover overlap at the handover;
    1933 belongs to the regime that had just begun, not the one ending.
    """
    import glob
    out = {}
    this_year = 2026
    for path in sorted(glob.glob(os.path.join(ROOT, "public", "data", "leaders", "*.json"))):
        slug = os.path.splitext(os.path.basename(path))[0]
        if slug.startswith("_") or slug not in ERA_NAME_COUNTRIES:
            continue
        try:
            rows = json.load(open(path, encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(rows, list):
            continue
        span = {}
        for r in rows:
            era = (r.get("era") or "").strip()
            if not era:
                continue
            a = _year(r.get("start"))
            b = _year(r.get("end")) or this_year
            if a is None:
                continue
            lo, hi = span.get(era, (a, b))
            span[era] = (min(lo, a), max(hi, b))
        eras = [[a, b, e] for e, (a, b) in span.items() if not (a <= this_year <= b)]
        if eras:
            out[slug] = sorted(eras)
    return out


def _year(v):
    m = re.search(r"(-?\d{3,4})", str(v or ""))
    return int(m.group(1)) if m else None


def dependencies():
    """-> {slug: parent_slug} from the site's own country hierarchy."""
    path = os.path.join(ROOT, "public", "data", "countries.json")
    rows = json.load(open(path, encoding="utf-8"))
    out = {}
    for r in rows:
        sl, ps = (r.get("slug") or "").strip(), (r.get("parent_slug") or "").strip()
        if sl and ps:
            out[sl] = ps
    if not out:
        raise SystemExit("FATAL: no parent_slug pairs in countries.json; the empire view "
                         "would silently lose every dependent territory.")
    return out


def main(argv):
    if "--self-test" in argv:
        return self_test()
    dry = "--dry" in argv

    i2s = slug_by_iso3()
    # A typo in a slug is a SILENT no-op: the rule simply never matches and the
    # territory keeps rendering as an independent country. "micronesia" was
    # written where the slug is "federated-states-of-micronesia", and nothing
    # said so until the sovereignty audit listed it as a state in 1942.
    known = {c["slug"] for c in json.load(
        open(os.path.join(ROOT, "public", "data", "countries.json"), encoding="utf-8"))}
    bad = sorted({h["slug"] for h in EXTRA_HOLDINGS if h["slug"] not in known}
                 | {h["holder"] for h in EXTRA_HOLDINGS if h["holder"] and h["holder"] not in known}
                 | {d["slug"] for d in DEPENDENCY_OVERRIDES if d["slug"] not in known}
                 | {d["slug"] for d in DOMINIONS if d["slug"] not in known}
                 | {s for s in DEPENDENCY_SINCE if s not in known})
    if bad:
        raise SystemExit(f"FATAL: unknown slug(s) {bad}. A rule keyed on a slug that does "
                         "not exist never fires, and the territory silently keeps its "
                         "default status.")
    rows = fetch()
    runs = parse(rows, i2s)
    emp = empires(runs)
    deps = dependencies()
    frag = fragmented(runs)
    eras = country_eras()

    log(f"colonised territories matched to a site slug: {len(runs)}")
    holders = {}
    for sl, ps in deps.items():
        holders.setdefault(ps, []).append(sl)
    log(f"current dependencies from countries.json: {len(deps)} under {len(holders)} holders")
    for h in sorted(holders, key=lambda k: -len(holders[k]))[:6]:
        log(f"  {h:<16} {len(holders[h])}: {', '.join(sorted(holders[h])[:6])}")
    bridged = interregnum(runs, frag=frag)
    holdings = EXTRA_HOLDINGS + bridged
    kinds = {}
    for h in EXTRA_HOLDINGS:
        kinds[h["kind"]] = kinds.get(h["kind"], 0) + 1
    hold = sorted({h["holder"] for h in EXTRA_HOLDINGS})
    log(f"curated holdings COLDAT cannot know: {len(EXTRA_HOLDINGS)} "
        f"({', '.join(f'{v} {k}' for k, v in sorted(kinds.items()))}) under {', '.join(hold)}")
    log(f"interregnum gaps closed between COLDAT runs: {len(bridged)} "
        f"({sum(1 for b in bridged if b['holder'])} attributed, "
        f"{sum(1 for b in bridged if not b['holder'])} left contested)")
    for b in bridged:
        log(f"  {b['slug']:<28} {b['from']}-{b['to']}  {b['holder'] or 'contested':<16} {b['note'][:64]}")
    # A dependency with no acquisition year would silently be attributed from
    # 1800, which is the bug this table exists to stop. Name them.
    try:
        popdoc = json.load(open(os.path.join(ROOT, "public", "data", "country-population.json"),
                                encoding="utf-8"))
        onboard = set(popdoc.get("countries") or {})
    except Exception:
        onboard = set()
    undated = sorted(s for s in deps if s in onboard and s not in DEPENDENCY_SINCE)
    if undated:
        raise SystemExit(f"FATAL: {undated} reach the board but have no DEPENDENCY_SINCE year, "
                         "so they would be attributed to their modern holder from 1800.")
    log(f"dependency acquisition years: {len(DEPENDENCY_SINCE)} "
        f"({sum(1 for v in DEPENDENCY_SINCE.values() if v > 1800)} acquired after 1800)")
    log(f"era-correct country names from the leaders layer: {len(eras)} countries, "
        f"{sum(len(v) for v in eras.values())} eras")
    for k in ("germany", "china", "russia", "turkey"):
        if k in eras:
            log(f"  {k}: " + "; ".join(f"{a}-{b} {n}" for a, b, n in eras[k][:5]))
    log(f"not-yet-one-country windows: {len(frag)} "
        f"({len(FRAGMENTED)} curated, {len(frag) - len(FRAGMENTED)} derived from colonisation dates)")
    for f in frag[:6]:
        log(f"  {f['slug']:<16} {f['from']}-{f['to']}  {f['note'][:60]}")
    log(f"dependency overrides (holder changed): "
        + ", ".join(f"{d['slug']}->{d['holder']} to {d['to']}" for d in DEPENDENCY_OVERRIDES))
    log(f"empires worth a row (>= {MIN_COLONIES} territories): {len(emp)}")
    for e in emp:
        log(f"  {e['coloniser']:<16} {e['from']}-{e['to']}  {e['territories']} territories")

    unmatched = {(r.get("code") or "").strip() for r in rows
                 if (r.get(COL) or "").strip() in METROPOLE} - set()
    missing = sorted(c for c in unmatched if c and c not in i2s)
    if missing:
        # Not fatal: a colonised territory with no site slug simply cannot be
        # summed. Named so the count can be checked rather than trusted.
        log(f"  {len(missing)} colonised code(s) have no site slug: {missing[:12]}")

    for probe, yr in (("india", 1930), ("kenya", 1930), ("indonesia", 1930)):
        rr = runs.get(probe) or []
        who = next((n for a, b, n in rr if a <= yr <= b), None)
        log(f"  {probe} in {yr}: {who}")

    if dry:
        return 0

    doc = {
        "_meta": {
            "source": SOURCE,
            "license": "CC BY 4.0",
            "fetchedAt": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "note": ("Modern territories carrying that year's people. An empire is the sum of "
                     "the territories it held plus its metropole, not a contemporaneous return."),
        },
        "empires": emp,
        "dominions": DOMINIONS,
        "fragmented": frag,
        "extraHoldings": holdings,
        "extraEraNames": EXTRA_ERA_NAMES,
        "dependencies": deps,
        "dependencySince": DEPENDENCY_SINCE,
        "countryEras": eras,
        "dependencyOverrides": DEPENDENCY_OVERRIDES,
        "colonisers": {k: runs[k] for k in sorted(runs)},
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    log(f"wrote country-colonisers.json: {len(runs)} territories, {len(emp)} empires, "
        f"{os.path.getsize(OUT) / 1024:.0f} KB")
    return 0


FIXTURE = [
    {"entity": "India", "code": "IND", "year": "1929", COL: "United Kingdom"},
    {"entity": "India", "code": "IND", "year": "1930", COL: "United Kingdom"},
    {"entity": "India", "code": "IND", "year": "1950", COL: "zzzz. No longer colonized"},
    {"entity": "Kenya", "code": "KEN", "year": "1930", COL: "United Kingdom"},
    {"entity": "Indonesia", "code": "IDN", "year": "1930", COL: "Netherlands"},
    {"entity": "Nowhere", "code": "XXX", "year": "1930", COL: "United Kingdom"},
    {"entity": "France", "code": "FRA", "year": "1930", COL: "zz. Colonizer"},
    {"entity": "Sweden", "code": "SWE", "year": "1930", COL: "zzz. Not colonized"},
    {"entity": "Vanuatu", "code": "VUT", "year": "1930", COL: "z. Multiple colonizers"},
]


def self_test():
    i2s = {"IND": "india", "KEN": "kenya", "IDN": "indonesia",
           "FRA": "france", "SWE": "sweden", "VUT": "vanuatu"}
    runs = parse(FIXTURE, i2s)

    assert runs["india"] == [[1929, 1930, "United Kingdom"]], (
        "consecutive years under one coloniser collapse into a single run", runs["india"])
    assert "sweden" not in runs, "'Not colonized' is a sentinel, not a coloniser"
    assert "france" not in runs, (
        "'zz. Colonizer' marks the METROPOLE's own row; treating it as being "
        "colonised would put France inside its own empire twice")
    assert "vanuatu" not in runs, (
        "'z. Multiple colonizers' cannot be summed into one empire without "
        "double-counting its people, so it is left out rather than guessed")
    assert "XXX" not in runs and len(runs) == 3, (
        "a code with no site slug has no population to sum and is dropped", runs)

    emp = empires(runs)
    names = {e["coloniser"] for e in emp}
    assert names == {"United Kingdom"}, (
        "the Netherlands holds one territory in this fixture, below MIN_COLONIES, "
        "so it is not an empire row", emp)
    uk = emp[0]
    assert uk["metropole"] == "united-kingdom", (
        "an empire must carry its metropole or it understates itself by the "
        "population of the colonising country")
    assert (uk["from"], uk["to"]) == (1929, 1930) and uk["territories"] == 2, uk

    assert all(h["kind"] in ("colony", "occupied", "annexed", "partial", "client")
               for h in EXTRA_HOLDINGS), (
        "kind drives whether a territory rolls up; an unknown value would "
        "silently fall through to the default and change a total")
    assert all(h["from"] <= h["to"] for h in EXTRA_HOLDINGS), EXTRA_HOLDINGS
    pl = [h for h in EXTRA_HOLDINGS if h["slug"] == "poland" and h["from"] <= 1940 <= h["to"]]
    assert {h["holder"] for h in pl} == {"germany", "russia"}, (
        "Poland in 1940 was partitioned between Germany and the Soviet Union; "
        "a model that allows one holder per year cannot say so", pl)

    assert any(h["slug"] == "federated-states-of-micronesia" for h in EXTRA_HOLDINGS), (
        "the slug is federated-states-of-micronesia; 'micronesia' matched "
        "nothing and the rule silently did not exist")
    van = [h for h in EXTRA_HOLDINGS if h["slug"] == "vanuatu"]
    assert {h["holder"] for h in van} == {"united-kingdom", "france"}, (
        "the New Hebrides were an Anglo-French condominium; COLDAT files it as "
        "'multiple colonizers' and drops it, which is why it read as a country")

    mk = [h for h in EXTRA_HOLDINGS if h["slug"] == "north-macedonia"]
    assert mk and mk[0]["holder"] == "bulgaria", (
        "Vardar Macedonia was Bulgarian from 1941, not German", mk)
    gr = [h for h in EXTRA_HOLDINGS if h["slug"] == "greece" and h["from"] <= 1942 <= h["to"]]
    assert {h["holder"] for h in gr} == {"germany", "italy", "bulgaria"}, (
        "Greece was a three-power occupation; naming one is the single-holder "
        "error that hid the Soviet half of Poland", gr)
    hr = next(h for h in EXTRA_HOLDINGS if h["slug"] == "croatia")
    assert hr["kind"] == "client", (
        "the Independent State of Croatia had its own government; filing it as "
        "occupied territory describes a client state as a possession")

    sk = [h for h in EXTRA_HOLDINGS if h["slug"] == "slovakia" and h["from"] <= 1941 <= h["to"]]
    assert sk and sk[0]["kind"] == "client", (
        "Slovakia in 1941 was a nominally independent client state, not an "
        "occupied territory like the Protectorate next door", sk)
    assert not any(h["slug"] == "sweden" for h in EXTRA_HOLDINGS), (
        "Sweden was neutral and never occupied; its absence is a statement, "
        "not an omission")

    hu = [h for h in EXTRA_HOLDINGS if h["slug"] == "hungary"]
    assert min(h["from"] for h in hu) == 1944, (
        "Hungary was an Axis ALLY before March 1944; showing it as held before "
        "the Wehrmacht arrived would describe an alliance as a possession")

    ph = [h for h in EXTRA_HOLDINGS if h["slug"] == "philippines"]
    assert {h["holder"] for h in ph} == {"united-states", "japan"}, (
        "the Philippines was American from 1898 and occupied by Japan from "
        "1942; COLDAT ends its Spanish run in 1898 and knows neither", ph)
    us = next(h for h in ph if h["holder"] == "united-states")
    jp = next(h for h in ph if h["holder"] == "japan")
    assert us["kind"] == "colony" and jp["kind"] == "occupied", (
        "possession and wartime occupation are different things and must not "
        "aggregate the same way", us, jp)
    assert not any(h["holder"] and h["holder"] == h["slug"] for h in EXTRA_HOLDINGS), (
        "a territory cannot hold itself")
    assert all(h["holder"] or h["kind"] == "partial" for h in EXTRA_HOLDINGS), (
        "only a PARTIAL holding may have no holder: it means the country was "
        "internally divided, not that someone else governed it")
    cn = next(h for h in EXTRA_HOLDINGS if h["slug"] == "china")
    assert cn["kind"] == "partial" and cn.get("note"), (
        "Japan held Manchuria and much of eastern China but never the whole "
        "country, and Manchuria is not a modern slug, so China can only be "
        "tagged - summing it would hand Japan 400m people it never governed")

    fr = fragmented({"nigeria": [[1861, 1960, "United Kingdom"]],
                     "vietnam": [[1887, 1954, "France"]],
                     "india": [[1857, 1947, "United Kingdom"]]})
    byslug = {f["slug"]: f for f in fr}
    assert byslug["nigeria"]["to"] == 1860, (
        "the window ends the year before the administration that drew the "
        "borders arrived", byslug.get("nigeria"))
    # Vietnam is in PRE_COLONIAL_STATES, so the DERIVED rule must not touch it:
    # being colonised later does not make you a patchwork before. It does carry
    # a curated two-year window for the end of the Tay Son wars, and the test
    # is that the window is that one and not 1800-1886.
    assert byslug["vietnam"]["to"] == 1801 and "Tay Son" in byslug["vietnam"]["note"], (
        "Vietnam was a state under the Nguyen from 1802; the only window it may "
        "carry is the curated one for the civil war that ended in 1802, never a "
        "window derived from the year the French finished arriving",
        byslug.get("vietnam"))
    assert byslug["india"]["to"] == 1856 and "princely" in byslug["india"]["note"], (
        "India is curated rather than derived, so the note names the actual "
        "polities instead of the generic colonial-borders line", byslug.get("india"))
    assert byslug["germany"]["to"] == 1870 and byslug["italy"]["to"] == 1860, byslug
    assert all(f["from"] <= f["to"] for f in fr), fr

    # ---- the interregnum rule -------------------------------------------
    assert spans([1804, 1805, 1806, 1810, 1811]) == [(1804, 1806), (1810, 1811)], spans(
        [1804, 1805, 1806, 1810, 1811])
    ir = interregnum({
        # same power either side: the Gold Coast did not become a country in 1884
        "ghana": [[1874, 1883, "United Kingdom"], [1917, 1957, "United Kingdom"]],
        # different powers: something happened, and guessing would be inventing
        "senegal": [[1693, 1817, "United Kingdom"], [1854, 1960, "France"]],
        # a gap the curated table already answers must be left alone
        "belize": [[1524, 1797, "Spain"], [1863, 1981, "United Kingdom"]],
        # a real republic between two colonial periods is NOT a handover
        "dominican-republic": [[1600, 1821, "Spain"], [1861, 1865, "Spain"]],
    }, curated=[{"slug": "belize", "from": 1800, "to": 1862,
                 "holder": "united-kingdom", "kind": "colony"}])
    by = {}
    for h in ir:
        by.setdefault(h["slug"], []).append(h)
    assert by["ghana"][0]["holder"] == "united-kingdom" and by["ghana"][0]["kind"] == "colony", (
        "the same power on both sides of a gap means it never left, so the gap "
        "is that power's", by.get("ghana"))
    assert by["ghana"][0]["from"] == 1884 and by["ghana"][0]["to"] == 1916, by["ghana"]
    assert by["senegal"][0]["holder"] == "" and by["senegal"][0]["kind"] == "partial", (
        "two different powers means the source does not say who held it; "
        "picking one would be inventing history", by.get("senegal"))
    assert "belize" not in by, (
        "a curated holding always beats a derived one, or the rule would "
        "overwrite a hand-checked answer with a guess", by.get("belize"))
    # The exception cuts the gap rather than cancelling it. Spain leaves in
    # 1821, Haiti holds the island 1822-1843, and the republic of 1844 is a
    # real state - so the rule may close the first half and must not touch the
    # second.
    assert [(h["from"], h["to"]) for h in by["dominican-republic"]] == [(1822, 1843)], (
        "RESTORED_INDEPENDENCE must subtract the years of genuine independence "
        "from a bridged gap without discarding the rest of it",
        by.get("dominican-republic"))
    assert all(h["from"] >= 1800 for h in ir), (
        "the board starts in 1800; a bridged span before it is wasted work", ir)

    assert "iran" not in ERA_NAME_COUNTRIES and "argentina" not in ERA_NAME_COUNTRIES, (
        "a leaders-board era names a REGIME, not a state; renaming Iran to "
        "'Pahlavi dynasty' on a population board says the country was called "
        "that, and it was not")

    # --- the curated rename table ---
    for slug, eras in EXTRA_ERA_NAMES.items():
        for a, b, nm in eras:
            assert 1800 <= a <= b <= 2025, (slug, a, b, "an era must run forwards, inside the board")
            assert nm and nm.strip() == nm, (slug, nm, "a blank or padded name renders as a gap")
        # NOT `spans` — that is a module-level function this file uses below,
        # and shadowing it here broke the self-test one assertion later.
        windows = sorted((a, b) for a, b, _ in eras)
        for (a1, b1), (a2, _) in zip(windows, windows[1:]):
            assert b1 < a2, (
                slug, windows, "two names for one territory in the same year; the "
                "client resolves ties by latest start, so an overlap makes the "
                "label depend on list order rather than on history")
    assert EXTRA_ERA_NAMES["iran"] == [[1800, 1934, "Persia"]], (
        "Persia is the canary for this whole table: it is the example Ashwin "
        "raised, and 1935 is the year Reza Shah asked the world to use Iran")
    assert len(EXTRA_ERA_NAMES["thailand"]) == 2, (
        "Siam reverted in 1945 and became Thailand again in 1949; collapsing "
        "that to one span puts Thailand on a 1946 board")
    assert "turkey" not in EXTRA_ERA_NAMES, (
        "Türkiye is a live naming question about the present, not a historical "
        "rename, and this board must not disagree with the rest of the site")
    assert not (set(EXTRA_ERA_NAMES) & ERA_NAME_COUNTRIES), (
        "a slug named in both tables would take whichever the client merged "
        "last, which is not a decision anyone made")

    assert _year("1933-01-30") == 1933 and _year(None) is None, _year("1933-01-30")
    assert _year("1871") == 1871

    assert DEPENDENCY_SINCE["guam"] == 1898, (
        "Guam was Spanish until Paris; attributing it to the United States from "
        "1800 is the bug this table exists to prevent")
    assert DEPENDENCY_SINCE["northern-mariana-islands"] == 1947, DEPENDENCY_SINCE
    assert all(isinstance(v, int) and 1800 <= v <= 2025 for v in DEPENDENCY_SINCE.values()), (
        DEPENDENCY_SINCE)
    prior = {(h["slug"], h["holder"]) for h in EXTRA_HOLDINGS}
    assert ("guam", "spain") in prior, (
        "a territory that changed hands needs its EARLIER holder too, or it "
        "disappears from every board before the handover")

    ov = {d["slug"]: d for d in DEPENDENCY_OVERRIDES}
    assert ov["hong-kong"]["holder"] == "united-kingdom" and ov["hong-kong"]["to"] == 1997, (
        "Hong Kong's CURRENT parent is China; without this window the 1914 "
        "board would file it under the Qing dynasty")
    assert all(d["from"] <= d["to"] for d in DEPENDENCY_OVERRIDES), DEPENDENCY_OVERRIDES

    assert not (set(METROPOLE) & NOT_A_COLONISER), (
        "a sentinel must never also be a coloniser")

    assert all(d["of"] in METROPOLE for d in DOMINIONS), (
        "a dominion must name a coloniser this file actually knows about")
    assert era_name("Germany", 1884, 1918) == "German Empire", era_name("Germany", 1884, 1918)
    assert era_name("Germany", 1884, 1922) == "Germany and its colonies", (
        "a span that straddles the end of the Empire cannot take the Empire's "
        "name wholesale; that is why eraNames is emitted for the client to "
        "resolve against the year actually being viewed")
    assert era_name("United Kingdom", 1607, 1984).endswith("and its colonies"), (
        "an empire with no era name falls back to the plain label rather than "
        "this file inventing one")
    assert dominion_from("canada")["from"] == 1867 and dominion_from("india") is None, (
        "Canada self-governed from Confederation; India did not, which is the "
        "whole distinction this table exists to draw")

    # A dominion must drop out of its empire's territory count from its own
    # year, or the 1914 board folds Canada in beside British India.
    dom_runs = {"canada": [[1800, 1950, "United Kingdom"]],
                "kenya": [[1800, 1950, "United Kingdom"]],
                "india": [[1800, 1950, "United Kingdom"]]}
    e = empires(dom_runs)[0]
    assert e["to"] == 1950 and e["territories"] == 3, e
    print("self-test: 50/50 PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]) or 0)
