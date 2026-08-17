"""Turn the unresolved city->metro residue into one sheet Ashwin can rule on.

The standing rule is that an unresolved city->metro is asked about, never guessed.
This does not break that rule: it PROPOSES, marks every proposal as a proposal,
and validates each one against the metro names that actually exist so a ruling
cannot approve a metro this project has never heard of. Nothing here is written
to the database by this script.

Most of the residue is the same shape: a mid-century corporate suburb that no
company is headquartered in TODAY, so the geo authority (built from current
listings) has never needed it. Iselin, Piscataway and Englewood Cliffs are all
New York; West Allis is Milwaukee; Middletown and Hamilton are Cincinnati.

  python propose_metros.py   -> docs/Board A - metro rulings needed.csv
"""
import csv, json, os, sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import OUT, log, select_all  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DOCS = os.path.normpath(os.path.join(HERE, "..", "..", "docs"))
SKIPPED = os.path.join(OUT, "metro_skipped.json")
CSV_OUT = os.path.join(DOCS, "Board A - metro rulings needed.csv")

# My proposals, keyed on (city, state). Every one is a claim that a suburb belongs
# to a metro; each is individually reviewable and none is applied automatically.
PROPOSE = {
    ("Iselin", "New Jersey"): "New York",
    ("Piscataway", "New Jersey"): "New York",
    ("Englewood Cliffs", "New Jersey"): "New York",
    ("Mount Olive", "New Jersey"): "New York",
    ("Parsippany", "New Jersey"): "New York",
    ("Morristown", "New Jersey"): "New York",
    ("Morris Plains", "New Jersey"): "New York",
    ("Madison", "New Jersey"): "New York",
    ("Somerville", "New Jersey"): "New York",
    ("Holmdel", "New Jersey"): "New York",
    ("East Hanover", "New Jersey"): "New York",
    ("Wayne", "New Jersey"): "New York",
    ("Princeton", "New Jersey"): "New York",
    ("Newark", "New Jersey"): "New York",
    ("Camden", "New Jersey"): "Philadelphia",
    ("Harrison", "New York"): "New York",
    ("Rye Brook", "New York"): "New York",
    ("Tuckahoe", "New York"): "New York",
    ("Armonk", "New York"): "New York",
    ("Bethpage", "New York"): "New York",
    ("Farmingdale", "New York"): "New York",
    ("DeWitt", "New York"): "Syracuse",
    ("Middlebury", "Connecticut"): "New Haven",
    ("Danbury", "Connecticut"): "New York",
    ("Old Greenwich", "Connecticut"): "New York",
    ("Hartford", "Connecticut"): "Hartford",
    ("West Allis", "Wisconsin"): "Milwaukee",
    ("Middletown", "Ohio"): "Cincinnati",
    ("Hamilton", "Ohio"): "Cincinnati",
    ("Eastlake", "Ohio"): "Cleveland",
    ("Lyndhurst", "Ohio"): "Cleveland",
    ("Euclid", "Ohio"): "Cleveland",
    ("Mount Vernon", "Ohio"): "Columbus",
    ("Fairlawn", "Ohio"): "Akron",
    ("Orange", "California"): "Los Angeles",
    ("Seal Beach", "California"): "Los Angeles",
    ("Thousand Oaks", "California"): "Los Angeles",
    ("La Jolla", "California"): "San Diego",
    ("Rancho Cordova", "California"): "Sacramento",
    ("Beverly Hills", "California"): "Los Angeles",
    ("Santa Monica", "California"): "Los Angeles",
    ("Bethlehem", "Pennsylvania"): "Allentown",
    ("Chester", "Pennsylvania"): "Philadelphia",
    ("Jackson", "Mississippi"): "Jackson",
    ("Clinton", "Mississippi"): "Jackson",
    ("Dakota City", "Nebraska"): "Sioux City",
    ("Denison", "Iowa"): "",
    ("Maynard", "Massachusetts"): "Boston",
    ("Lexington", "Massachusetts"): "Boston",
    ("Lowell", "Massachusetts"): "Boston",
    ("Worcester", "Massachusetts"): "Worcester",
    ("Battle Creek", "Michigan"): "Battle Creek",
    ("Southfield", "Michigan"): "Detroit",
    ("Highland Park", "Michigan"): "Detroit",
    ("Auburn Hills", "Michigan"): "Detroit",
    ("Northville", "Michigan"): "Detroit",
    ("Bloomington", "Minnesota"): "Minneapolis",
    ("Maplewood", "Minnesota"): "Minneapolis",
    ("Westwood", "Kansas"): "Kansas City",
    ("Overland Park", "Kansas"): "Kansas City",
    ("Bloomington", "Illinois"): "Bloomington",
    ("Glenview", "Illinois"): "Chicago",
    ("Rolling Meadows", "Illinois"): "Chicago",
    ("Deerfield", "Illinois"): "Chicago",
    ("Lake Forest", "Illinois"): "Chicago",
    ("Palatine", "Illinois"): "Chicago",
    ("Hoffman Estates", "Illinois"): "Chicago",
    ("Iselin", "NJ"): "New York",
    ("McLean", "Virginia"): "Washington",
    ("Ashburn", "Virginia"): "Washington",
    ("Bethesda", "Maryland"): "Washington",
    ("Berkeley Heights", "New Jersey"): "New York",
    ("Las Colinas", "Texas"): "Dallas",
    ("Lewisville", "Texas"): "Dallas",
    ("Bartlesville", "Oklahoma"): "Bartlesville",
    ("Greensboro", "North Carolina"): "Greensboro",
    ("Winston-Salem", "North Carolina"): "Winston-Salem",
    ("Providence", "Rhode Island"): "Providence",
    ("Dakota Dunes", "South Dakota"): "Sioux City",
    ("South Bend", "Indiana"): "South Bend",
    ("Salt Lake City", "Utah"): "Salt Lake City",
    ("Englewood", "Colorado"): "Denver",
    ("Corpus Christi", "Texas"): "Corpus Christi",
    ("New Orleans", "Louisiana"): "New Orleans",
    ("Oakland", "California"): "San Francisco-San Jose",
    ("Cupertino", "California"): "San Francisco-San Jose",
    ("Palo Alto", "California"): "San Francisco-San Jose",
    ("El Segundo", "California"): "Los Angeles",
    ("Fairfax", "Virginia"): "Washington",
    ("Fairfax County", "Virginia"): "Washington",
}


METROS_JSON = os.path.normpath(os.path.join(HERE, "..", "..", "public", "data",
                                            "metros.json"))


def main():
    # 🔴 Validate metro NAMES against the workbook spine, not against mktcap_geo.
    # The geo table only knows metros where some company is listed TODAY, so it
    # has never needed Akron, Dayton or Youngstown and would have rejected them as
    # invented. metros.json is the project's actual 4,314-metro spine and is the
    # ground truth for what a metro is called.
    known = set()
    for m in json.load(open(METROS_JSON, encoding="utf-8")):
        if m.get("name"):
            known.add(m["name"])
    log(f"{len(known)} metro names in the workbook spine (metros.json)")

    def candidates(city):
        """Metro names that contain the city name, for a proposal that misses."""
        c = city.lower()
        return sorted({n for n in known if c in n.lower()})[:4]

    data = json.load(open(SKIPPED, encoding="utf-8"))
    rows = []
    for p in data["places"]:
        key = (p["city"], p["state"])
        prop = PROPOSE.get(key, "")
        cands = ""
        if prop and prop not in known:
            cands = " | ".join(candidates(p["city"]) or candidates(prop))
            status = "NAME NOT IN THE SPINE — pick from the candidates"
        elif prop:
            status = "proposal, needs your yes"
        else:
            cands = " | ".join(candidates(p["city"]))
            status = "NO PROPOSAL — I do not know this one"
        rows.append({
            "city": p["city"], "state": p["state"], "eras": p["eras"],
            "proposed_metro": prop, "status": status,
            "spine_candidates": cands,
            "why_unresolved": p["reason"][:90],
            "companies": "; ".join(p["companies"][:5]),
        })
    rows.sort(key=lambda r: (r["status"].startswith("proposal"), -r["eras"]))

    os.makedirs(DOCS, exist_ok=True)
    with open(CSV_OUT, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=["city", "state", "eras", "proposed_metro",
                                          "status", "spine_candidates",
                                          "why_unresolved", "companies"])
        w.writeheader(); w.writerows(rows)

    ok = sum(1 for r in rows if r["status"] == "proposal, needs your yes")
    bad = sum(1 for r in rows if r["status"].startswith("NAME NOT"))
    none = sum(1 for r in rows if r["status"].startswith("NO PROPOSAL"))
    log(f"{len(rows)} places need a ruling")
    log(f"   {ok} carry a proposal whose metro name checks out")
    log(f"   {bad} carry a proposal whose metro name is NOT in the list")
    log(f"   {none} I could not propose at all")
    for r in rows:
        if not r["status"].startswith("proposal"):
            log(f"      {r['city']}, {r['state']} -> {r['proposed_metro'] or '(none)'}")
    log(f"-> {CSV_OUT}")


if __name__ == "__main__":
    main()
