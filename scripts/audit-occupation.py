#!/usr/bin/env python3
"""audit-occupation.py - who was occupied, in every year of both wars.

WHY A SECOND AUDIT. audit-sovereignty.py asks "does the board claim this was a
country when it was not". That question is blind to the war years, because an
occupied state usually still EXISTED: Denmark in 1942 was a sovereign kingdom
under German occupation, so a sovereignty audit is satisfied either way and the
board can quietly forget the occupation entirely. It did, in thirteen cases, and
the reason was structural rather than a missing entry - a territory absorbed by
a live polity had its holding suppressed, so Ukraine, Belarus, the Baltics and
all seven pieces of Yugoslavia carried a German or Italian tag that never
reached the screen.

So this asks the other question, and it asks it of every single year rather
than a sample. EXPECTED below is the ledger: for each year, who was under
someone else's control. A territory in the ledger that the data does not tag is
a MISS. A territory the data tags that the ledger does not expect is an EXTRA -
not necessarily wrong, but it must be looked at, because that is how a rule
with a sloppy end date announces itself.

THE THREE DISTINCTIONS THIS FILE EXISTS TO KEEP:
  * an ALLY is not a possession (Romania, Bulgaria, Hungary, Finland, Thailand)
  * a CLIENT is not a possession (Slovakia, the Independent State of Croatia)
  * a NEUTRAL is not a possession (Sweden, Switzerland, Spain, Portugal,
    Ireland, Turkey after 1923)
Each of those is a thing popular memory gets wrong, and each would be easy to
"fix" into the data by someone reading a map of Axis-controlled Europe.

usage:
  python scripts/audit-occupation.py --self-test
  python scripts/audit-occupation.py                # both wars, summary
  python scripts/audit-occupation.py 1942           # one year, in full
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "public", "data")

WW1 = range(1914, 1924)
WW2 = range(1936, 1947)
HELD = {"occupied", "annexed", "partial", "client"}

# The ledger. slug -> [(from, to)] spans of foreign control, INCLUSIVE at both
# ends, because unlike an independence date an occupation has a real last year.
# Dates are the year the control began and the year it ended on the ground, not
# the year a treaty acknowledged it.
EXPECTED = {
    # ---- the First World War ------------------------------------------------
    "belgium": [(1914, 1918), (1940, 1944)],
    "luxembourg": [(1914, 1918), (1940, 1944)],
    "france": [(1914, 1918), (1940, 1944)],
    "serbia": [(1915, 1918), (1941, 1944)],
    "montenegro": [(1916, 1918), (1941, 1944)],
    "romania": [(1916, 1918), (1944, 1946)],   # ally until August 1944
    "albania": [(1914, 1920), (1939, 1944)],
    "poland": [(1915, 1918), (1939, 1945)],
    "greece": [(1916, 1917), (1941, 1944)],
    "iran": [(1914, 1921), (1941, 1946)],
    "turkey": [(1918, 1922)],                  # neutral in the second war
    # ---- the run-up and the Second World War --------------------------------
    "ethiopia": [(1936, 1941)],
    "austria": [(1938, 1945)],
    "czech-republic": [(1938, 1945)],
    "slovakia": [(1939, 1945)],                # client, then occupied in 1944
    "denmark": [(1940, 1945)],
    "norway": [(1940, 1945)],
    "netherlands": [(1940, 1945)],
    "iceland": [(1940, 1945)],
    "faroe-islands": [(1940, 1945)],
    "greenland": [(1941, 1945)],
    "monaco": [(1942, 1944)],
    "croatia": [(1941, 1945)],
    "bosnia-herzegovina": [(1941, 1945)],
    "slovenia": [(1941, 1945)],
    "north-macedonia": [(1916, 1917), (1941, 1944)],
    "kosovo": [(1916, 1917), (1941, 1944)],
    "hungary": [(1944, 1946)],                 # ally until March 1944
    "bulgaria": [(1944, 1946)],                # ally until September 1944
    "italy": [(1943, 1945)],                   # its own ally occupied it
    "ukraine": [(1918, 1918), (1941, 1944)],
    "belarus": [(1915, 1918), (1941, 1944)],
    "lithuania": [(1915, 1918), (1941, 1944)],
    "latvia": [(1915, 1918), (1941, 1944)],
    "estonia": [(1918, 1918), (1941, 1944)],
    "moldova": [(1941, 1944)],
    "iraq": [(1941, 1947)],
    "egypt": [(1939, 1945)],
    # ---- the Pacific --------------------------------------------------------
    "philippines": [(1942, 1945)],
    "indonesia": [(1942, 1945)],
    "malaysia": [(1942, 1945)],
    "singapore": [(1942, 1945)],
    "myanmar": [(1942, 1945)],
    "vietnam": [(1940, 1945)],
    "cambodia": [(1941, 1945)],
    "laos": [(1941, 1945)],
    "hong-kong": [(1941, 1945)],
    "east-timor": [(1942, 1945)],
    "guam": [(1941, 1944)],
    "nauru": [(1942, 1945)],
    "kiribati": [(1941, 1943)],
    "solomon-islands": [(1942, 1945)],
    "papua-new-guinea": [(1942, 1945)],
    "china": [(1937, 1945)],
    # ---- the German Pacific, taken in 1914 and mandated in 1919 -------------
    # Japan seized these five weeks into the First World War, and the League
    # only regularised it in 1919. The OCCUPATION is 1914-18; from 1919 they
    # were an ordinary mandate, which is a possession rather than a conquest
    # and so is filed as a colony and lives in STANDING below. Keeping the
    # distinction is the point: a mandate and a landing party are not the
    # same fact about a place.
    "federated-states-of-micronesia": [(1914, 1918)],
    "marshall-islands": [(1914, 1918)],
    "palau": [(1914, 1918)],
    "northern-mariana-islands": [(1945, 1946)],   # American military government
    # ---- the African colonies that changed hands mid-war --------------------
    # The gap between the German administration falling and the mandate
    # arriving, which the source records as two runs and nothing in between.
    "cameroon": [(1917, 1921)], "togo": [(1917, 1921)], "rwanda": [(1916, 1921)],
    # ---- the Russian Civil War, which is the eastern front's afterlife ------
    "kazakhstan": [(1918, 1921)], "kyrgyzstan": [(1918, 1921)],
    "tajikistan": [(1918, 1921)], "turkmenistan": [(1918, 1921)],
    "uzbekistan": [(1918, 1921)],
    "armenia": [(1920, 1921)], "azerbaijan": [(1920, 1921)], "georgia": [(1921, 1921)],
    # ---- and the peace ------------------------------------------------------
    "germany": [(1945, 1948)],
    "japan": [(1945, 1951)],
}

# Territories that were under someone else's flag for the WHOLE of both wars as
# ordinary colonies, mandates or dependencies. They are held, but they are not
# what the question is about, so they are excluded from the EXTRA report rather
# than listed year by year in EXPECTED.
STANDING = {
    "india", "pakistan", "bangladesh", "sri-lanka", "myanmar", "malaysia",
    "singapore", "indonesia", "vietnam", "cambodia", "laos", "philippines",
    "south-korea", "north-korea", "taiwan", "palestine", "jordan", "syria",
    "lebanon", "iraq", "libya", "eritrea", "somalia", "namibia", "south-sudan",
    "papua-new-guinea", "samoa", "vanuatu", "morocco", "cyprus", "malta",
    "hong-kong", "macau", "ireland", "iceland", "kuwait", "qatar", "bahrain",
    "united-arab-emirates", "oman", "yemen", "saudi-arabia", "mongolia",
    "nepal", "bhutan", "afghanistan",
    # Japanese mandates from 1919: a possession, not a conquest, so they are
    # filed as colonies and only their 1914-18 seizure is an occupation.
    "federated-states-of-micronesia", "marshall-islands", "palau",
    "northern-mariana-islands", "nauru", "kiribati", "solomon-islands",
    "east-timor", "guam", "american-samoa", "new-caledonia", "greenland",
    "faroe-islands",
}


def load(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


def held_in(year, col):
    """-> {slug: [(holder, kind)]} for every territory under control that year,
    from the DATA rather than the ledger."""
    out = {}
    for h in col["extraHoldings"]:
        if h["from"] <= year <= h["to"] and h["kind"] in HELD:
            out.setdefault(h["slug"], []).append((h["holder"] or "(divided)", h["kind"]))
    return out


def expected_in(year):
    return {s for s, spans in EXPECTED.items() if any(a <= year <= b for a, b in spans)}


def check(year, col):
    """-> (missing, extra). Missing is the failure; extra is a prompt to look."""
    actual = held_in(year, col)
    want = expected_in(year)
    missing = sorted(want - set(actual))
    extra = sorted(s for s in actual if s not in want and s not in STANDING
                   and s not in EXPECTED)
    return missing, extra


def main(argv):
    if "--self-test" in argv:
        return self_test()
    col = load("country-colonisers.json")
    years = [int(a) for a in argv if a.isdigit()]
    if years:
        for y in years:
            actual = held_in(y, col)
            print(f"\n=== {y}: {len(actual)} territories under foreign control ===")
            for slug in sorted(actual):
                who = ", ".join(f"{h} ({k})" for h, k in actual[slug])
                print(f"  {slug:<28} {who}")
            miss, extra = check(y, col)
            if miss:
                print(f"  MISSING: {', '.join(miss)}")
            if extra:
                print(f"  unexpected (look, do not assume wrong): {', '.join(extra)}")
        return 0

    total = 0
    for label, span in (("First World War", WW1), ("Second World War", WW2)):
        print(f"\n=== {label} ===")
        for y in span:
            miss, extra = check(y, col)
            total += len(miss)
            n = len(held_in(y, col))
            flag = f"  MISSING {', '.join(miss)}" if miss else ""
            note = f"  [{', '.join(extra)}]" if extra else ""
            print(f"  {y}  {n:>3} held{flag}{note}")
    print(f"\n{total} missing occupation(s) across both wars.")
    return 1 if total else 0


def self_test():
    col = {"extraHoldings": [
        {"slug": "denmark", "from": 1940, "to": 1945, "holder": "germany", "kind": "occupied"},
        {"slug": "sweden", "from": 1940, "to": 1945, "holder": "germany", "kind": "occupied"},
        {"slug": "india", "from": 1858, "to": 1947, "holder": "united-kingdom", "kind": "colony"},
        {"slug": "pakistan", "from": 1900, "to": 1947, "holder": "united-kingdom",
         "kind": "annexed"},
    ]}
    h = held_in(1942, col)
    assert "denmark" in h, h
    assert "india" not in h, (
        "an ordinary colony is not what this audit is about; only occupied, "
        "annexed, partial and client count as being under control here", h)

    miss, extra = check(1942, col)
    assert "norway" in miss and "france" in miss, (
        "the ledger expects Norway and France in 1942 and the fixture has "
        "neither, so both must be reported missing", miss)
    assert "sweden" in extra, (
        "Sweden was NEUTRAL; data claiming otherwise must be surfaced, because "
        "a wrong occupation is as bad as a missing one", extra)
    assert "pakistan" not in extra, (
        "a territory held for the whole of both wars as an ordinary possession "
        "is in STANDING and must not clutter the report", extra)

    # An ally is not a possession, and the year it stopped being an ally is the
    # only interesting thing about it.
    assert "hungary" not in expected_in(1942) and "hungary" in expected_in(1944), (
        "Hungary was an Axis ALLY until the Wehrmacht occupied it in March "
        "1944; filing it as occupied from 1941 would erase that")
    assert "romania" not in expected_in(1942) and "romania" in expected_in(1944)
    assert "bulgaria" not in expected_in(1942) and "bulgaria" in expected_in(1944)
    assert "finland" not in EXPECTED, (
        "Finland was never occupied: it fought the Soviet Union as a "
        "co-belligerent and then fought the Germans out of Lapland")
    # Both wars in one ledger, and the years between them are peace.
    assert "belgium" in expected_in(1916) and "belgium" in expected_in(1942)
    assert "belgium" not in expected_in(1930), (
        "the spans are per-war; the interwar years must be clear")
    assert "turkey" in expected_in(1920) and "turkey" not in expected_in(1942), (
        "the Allied occupation of Istanbul ended in 1923, and Turkey was "
        "neutral for almost all of the second war")
    assert "germany" in expected_in(1946) and "japan" in expected_in(1946), (
        "the occupations that FOLLOWED the war are the same kind of fact and "
        "the board showed both countries as ordinary sovereign states")
    print("self-test: 12/12 PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
