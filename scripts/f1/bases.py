"""Where each Formula 1 team physically built its cars, town by town, dated.

Nothing in the Ergast/Jolpica archive says where a team is. The archive has a
`nationality` field, and that field is a licence, not an address: Haas is
"American" and builds in Banbury and Maranello; Racing Bulls is "Italian" and
does its aerodynamics in Milton Keynes; Red Bull is "Austrian" and has never
built a car outside Buckinghamshire. A metro site cannot use nationality for
anything, so the geography has to be curated, the same way `era_names.csv` and
`hq_spans_master.csv` are curated on the rankings board.

## Rules

1. TOWN, NOT ADDRESS. The unit is the place a metro can be resolved from. Street
   addresses are recorded in the note where a source gives one, and never in the
   town field.
2. EVERY ROW CARRIES A SOURCE. A row without one does not go in.
3. REFUSE RATHER THAN GUESS. Teams whose base could not be sourced are absent
   from this file, and their pages simply do not show a base. Aston Martin's
   1959-60 works entry, the two ATS teams, Anglo American Racers and De Tomaso
   are all missing for that reason and not because they were overlooked.
4. SPANS ARE CLAIMS ABOUT THE WORLD, so unlike the spans in lineages.py they are
   real years and are asserted. Where a move year is disputed the row carries
   contested=1 and the page says so.
5. ROLE MATTERS. "main" is where the car is designed and built. A team can have
   more than one site and the second one can be the more important in practice:
   Haas's Kannapolis headquarters is an office, and Banbury is where the race
   team actually works.

## Why this is the point of the whole exercise

Formula 1 is the most geographically concentrated industry in world sport, and
no F1 site frames it that way because no F1 site is a metro site. Six of the
eleven 2026 teams build their cars in England, inside a circle about sixty miles
across centred near Bicester; nine of the eleven have a significant English
site. That is a fact about metros, and this file is what lets the board say it.
"""

OPEN = 9999

# Sources, keyed so a URL is written once and cited many times.
SRC = {
    "autosport-bases": "https://www.autosport.com/f1/news/where-are-f1-teams-based/10348715/",
    "enstone": "https://en.wikipedia.org/wiki/Team_Enstone",
    "williams": "https://www.williamsf1.com/articles/8b059f3c-a18b-4d32-8334-f277c45e9082/grove-the-home-of-atlassian-williams-f1-team",
    "williamsdb": "https://www.williamsdb.com/moving-factory-didcot-grove/",
    "mclaren": "https://en.wikipedia.org/wiki/McLaren",
    "mtc": "https://en.wikipedia.org/wiki/McLaren_Technology_Centre",
    "amr-campus": "https://www.astonmartinf1.com/en-GB/news/announcement/amf1-team-technology-campus-opens-ahead-of-the-british-grand-prix",
    "bar": "https://en.wikipedia.org/wiki/British_American_Racing",
    "merc-f1": "https://en.wikipedia.org/wiki/Mercedes-Benz_in_Formula_One",
    "stewart": "https://en.wikipedia.org/wiki/Stewart_Grand_Prix",
    "rb-bicester": "https://racingnews365.com/rb-confirms-closure-of-bicester-facility-ahead-of-move",
    "minardi": "https://en.wikipedia.org/wiki/Minardi",
    "haas": "https://en.wikipedia.org/wiki/Haas_F1_Team",
    "audi": "https://en.wikipedia.org/wiki/Audi_in_Formula_One",
    "cadillac": "https://www.motorsport.com/f1/news/cadillac-to-run-f1-2026-operation-from-silverstone-while-us-base-under-construction/10760242/",
    "lotus-cars": "https://en.wikipedia.org/wiki/Lotus_Cars",
    "brabham": "https://en.wikipedia.org/wiki/Brabham",
    "brm": "https://en.wikipedia.org/wiki/British_Racing_Motors",
    "cooper": "https://en.wikipedia.org/wiki/Cooper_Car_Company",
    "march": "https://en.wikipedia.org/wiki/March_Engineering",
    "renault-elf": "https://en.wikipedia.org/wiki/Renault_Elf",
    "matra": "https://en.wikipedia.org/wiki/Equipe_Matra_Sports",
    "ligier": "https://www.grandprix.com/gpe/con-ligie.html",
    "ligier-f1t": "https://www.f1technical.net/f1db/teams/69",
    "tmg": "https://en.wikipedia.org/wiki/Toyota_Gazoo_Racing_Europe",
    "honda-f1": "https://en.wikipedia.org/wiki/Honda_in_Formula_One",
    "alfa-corse": "https://en.wikipedia.org/wiki/Alfa_Corse",
    "autodelta": "https://en.wikipedia.org/wiki/Autodelta",
    "euroracing": "https://it.wikipedia.org/wiki/Euroracing",
    "maserati": "https://en.wikipedia.org/wiki/Maserati",
    "vanwall": "https://en.wikipedia.org/wiki/Vanwall",
    "caterham": "https://en.wikipedia.org/wiki/Caterham_F1",
    "manor": "https://en.wikipedia.org/wiki/Manor_Racing",
    "addresses": "https://www.silhouet.com/motorsport/address.html",
    "arrows": "https://www.grandprix.com/gpe/con-arrow.html",
    "shadow": "https://www.motorsportmagazine.com/archive/article/april-2010/96/paint-it-black/",
    "wolf": "https://www.grandprix.com/gpe/con-walte.html",
    "hesketh": "https://www.grandprix.com/gpe/con-heske.html",
    "surtees": "https://www.f1technical.net/f1db/teams/106",
    "ensign": "https://en.wikipedia.org/wiki/Ensign_Racing",
    "osella": "https://www.f1technical.net/f1db/teams/85",
    "larrousse": "https://www.grandprix.com/gpe/con-larro.html",
    "larrousse-wp": "https://en.wikipedia.org/wiki/Larrousse",
    "prost-move": "https://www.grandprix.com/news/prost-moving-house.html",
    "scuderia-italia": "https://www.f1technical.net/f1db/teams/30",
    "dallara": "https://en.wikipedia.org/wiki/Dallara",
    "zakspeed": "https://en.wikipedia.org/wiki/Zakspeed",
    "coloni": "https://en.wikipedia.org/wiki/Scuderia_Coloni",
    "hrt": "https://en.wikipedia.org/wiki/HRT_Formula_1_Team",
    "hrt-f1t": "https://www.f1technical.net/f1db/teams/139",
    "eurobrun": "https://www.f1technical.net/f1db/teams/39",
    "super-aguri": "https://en.wikipedia.org/wiki/Super_Aguri_F1",
    "pacific": "https://www.f1technical.net/f1db/teams/86",
    "rial": "https://www.grandprix.com/constructors/rial.html",
    "fondmetal": "https://www.grandprix.com/constructors/fondmetal-f1-spa.html",
    "forti": "https://en.wikipedia.org/wiki/Forti",
    "onyx": "https://www.f1technical.net/f1db/teams/83",
    "simtek": "https://en.wikipedia.org/wiki/Simtek",
    "lola": "https://www.lolaheritage.co.uk/lola_story.html",
    "lola-slough": "http://www.postcards-from-slough.co.uk/home/le-mans-and-formula-one/lola/",
}

BASES = []


def base(lineage, town, region, country, frm, to, role="main", src="",
         contested=0, note=""):
    """One site, one span. `region` is the workbook's Region value where the
    town name is ambiguous on its own (there are Groves and Bournes all over
    England); it is a disambiguation hint, not display copy."""
    assert src in SRC, f"{lineage}/{town}: unknown source key {src!r}"
    BASES.append({"lineage": lineage, "town": town, "region": region,
                  "country": country, "from": frm, "to": to, "role": role,
                  "source": SRC[src], "contested": contested, "note": note})


# ── The 2026 grid ───────────────────────────────────────────────────────────

base("ferrari", "Maranello", "Modena", "Italy", 1950, OPEN, src="autosport-bases",
     note="The only 2026 team with no facility in England.")

base("mercedes", "Ockham", "Surrey", "England", 1968, 1998, src="addresses", note=(
     "Ken Tyrrell's works, at Long Reach between Ockham and Ripley. Period "
     "directories render the same address as both, which is a postal variant "
     "rather than a second site."))
base("mercedes", "Brackley", "West Northamptonshire", "England", 1999, OPEN,
     src="bar", note=(
     "Built for BAR's 1999 debut by Adrian Reynard's Reynard Motorsport, and "
     "the same building through Honda, Brawn and Mercedes."))
base("mercedes", "Brixworth", "West Northamptonshire", "England", 2010, OPEN,
     role="engine", src="merc-f1",
     note="Mercedes-AMG High Performance Powertrains. Engines only.")

base("red-bull", "Milton Keynes", "Milton Keynes", "England", 1997, OPEN,
     src="stewart", note=(
     "One site, three owners: Stewart from 1997, Jaguar from 2000, Red Bull "
     "from 2005."))

base("mclaren", "Colnbrook", "Slough", "England", 1966, 1980, src="mclaren")
base("mclaren", "Woking", "Surrey", "England", 1981, OPEN, src="mtc", note=(
     "The McLaren Technology Centre opened in 2004; the team had been in Woking "
     "since 1981."))

base("aston-martin", "Silverstone", "West Northamptonshire", "England", 1991, OPEN,
     src="amr-campus", note=(
     "One site continuously since Jordan built it in 1991, through Midland, "
     "Spyker, Force India and Racing Point. The AMR Technology Campus that "
     "replaced it opened in 2023 on the same land."))

base("alpine", "Witney", "Oxfordshire", "England", 1981, 1991, src="enstone")
base("alpine", "Enstone", "Oxfordshire", "England", 1992, OPEN, src="enstone", note=(
     "Whiteways Technical Centre, occupied over the winter of 1991-92 and "
     "unchanged through Benetton, Renault, Lotus and Alpine."))
base("alpine", "Viry-Chatillon", "Essonne", "France", 2002, 2025, role="engine",
     src="enstone", note=(
     "Renault's F1 engine works, and the reason the team read as French. Renault "
     "closed the programme after 2025 and Alpine runs Mercedes power units from "
     "2026, which leaves Enstone as the single base."))

base("williams", "Didcot", "Oxfordshire", "England", 1977, 1996, src="williamsdb",
     note=(
     "Two buildings: a former carpet warehouse on Station Road from 1977, then "
     "purpose-built premises on Basil Hill Road from 1984."))
base("williams", "Grove", "Oxfordshire", "England", 1996, OPEN, src="williams", note=(
     "The wind tunnel moved on 28 April 1996 and the factory was formally opened "
     "that October."))

base("racing-bulls", "Faenza", "Ravenna", "Italy", 1985, OPEN, src="minardi", note=(
     "Minardi's works, and the same company through Toro Rosso, AlphaTauri and "
     "Racing Bulls."))
base("racing-bulls", "Bicester", "Oxfordshire", "England", 2009, 2024, role="design",
     src="rb-bicester")
base("racing-bulls", "Milton Keynes", "Milton Keynes", "England", 2025, OPEN,
     role="design", src="rb-bicester",
     note="Aerodynamics and design, moved from Bicester for 2025.")

base("haas-f1-team", "Kannapolis", "North Carolina", "United States", 2016, OPEN,
     role="hq", src="haas",
     note="The registered headquarters, inside Haas Automation's NASCAR campus.")
base("haas-f1-team", "Banbury", "Oxfordshire", "England", 2016, OPEN, src="haas", note=(
     "Race operations, and in practice the team's working base. Listed as the "
     "main site for that reason rather than the American headquarters."))
base("haas-f1-team", "Maranello", "Modena", "Italy", 2016, OPEN, role="design",
     src="haas", note="Design office. The chassis itself is built by Dallara.")

base("audi", "Hinwil", "Zurich", "Switzerland", 1993, OPEN, src="audi", note=(
     "Sauber's works since 1993, unchanged through BMW Sauber, Alfa Romeo, "
     "Stake and now Audi."))
base("audi", "Neuburg an der Donau", "Bavaria", "Germany", 2026, OPEN, role="engine",
     src="audi")
base("audi", "Bicester", "Oxfordshire", "England", 2025, OPEN, role="design",
     src="audi", note="Audi F1 technical centre.")

base("cadillac-f1-team", "Fishers", "Indiana", "United States", 2026, OPEN,
     role="hq", src="cadillac",
     note="The designated headquarters, still under construction through 2026.")
base("cadillac-f1-team", "Silverstone", "West Northamptonshire", "England", 2026,
     OPEN, src="cadillac", note=(
     "The 2026 car is being run from Silverstone while Fishers is completed, so "
     "the newest American team's first season is an English operation."))


# ── The great historical teams ──────────────────────────────────────────────

base("team-lotus", "Hornsey", "Greater London", "England", 1958, 1959, src="lotus-cars",
     note="Chapman's original works in north London, behind a stable yard.")
base("team-lotus", "Cheshunt", "Hertfordshire", "England", 1959, 1966, src="lotus-cars")
base("team-lotus", "Hethel", "Norfolk", "England", 1966, 1994, src="lotus-cars", note=(
     "A former RAF bomber station. Lotus laid its test track on the perimeter "
     "runways, which is why the place is a village and an aerodrome at once."))

base("brabham", "New Haw", "Surrey", "England", 1962, 1977, src="brabham",
     note="Motor Racing Developments, near Weybridge.")
base("brabham", "Chessington", "Greater London", "England", 1977, 1992, src="brabham")

base("cooper", "Surbiton", "Greater London", "England", 1950, 1965, src="cooper", note=(
     "A garage behind the family home. The team that put the engine behind the "
     "driver and ended the front-engined era worked out of a suburban high "
     "street."))
base("cooper", "Byfleet", "Surrey", "England", 1965, 1969, src="cooper")

base("brm", "Bourne", "Lincolnshire", "England", 1951, 1977, src="brm", note=(
     "Raymond Mays's works behind Eastgate House, with a private test track on "
     "the disused Folkingham aerodrome a few miles away."))

base("march", "Bicester", "Oxfordshire", "England", 1970, 1992, src="march")

base("shadow", "Northampton", "Northamptonshire", "England", 1973, 1980,
     src="shadow", note=(
     "An American team on paper. Tony Southgate's account places the works in a "
     "UOP-owned factory on Weedon Road in Northampton from late 1972, taken on "
     "to build the DN1."))

base("arrows", "Milton Keynes", "Milton Keynes", "England", 1978, 1996,
     src="addresses", note="Water Eaton industrial estate, Bletchley.")
base("arrows", "Leafield", "Oxfordshire", "England", 1996, 2002, src="arrows",
     note="Tom Walkinshaw's TWR headquarters, taken over in April 1996.")

base("wolf", "Reading", "Reading", "England", 1976, 1979, src="wolf",
     note="The Bennett Road premises Walter Wolf took over from Frank Williams.")

base("hesketh", "Towcester", "Northamptonshire", "England", 1974, 1978,
     src="hesketh", note=(
     "Converted stables on Lord Hesketh's Easton Neston estate, about six miles "
     "from Silverstone."))

base("surtees", "Edenbridge", "Kent", "England", 1970, 1978, src="surtees")

base("ensign", "Walsall", "West Midlands", "England", 1973, 1980, src="ensign")
base("ensign", "Lichfield", "Staffordshire", "England", 1981, 1982, src="ensign",
     contested=1, note=(
     "Sources disagree between Chasetown and Trent Valley Road in Lichfield, "
     "four miles apart. Recorded as Lichfield because that is the more specific "
     "claim, but the building is unsettled."))

base("lola", "Bromley", "Bromley", "England", 1962, 1963, src="lola")
base("lola", "Slough", "Slough", "England", 1963, 1970, src="lola-slough",
     note="Yeovil Road, on the Slough Trading Estate.")
base("lola", "Huntingdon", "Cambridgeshire", "England", 1970, 1997, src="addresses")

base("vanwall", "Maidenhead", "Windsor and Maidenhead", "England", 1954, 1960, src="vanwall",
     note=(
     "The racing shop was at Cox Green. Acton in west London was Vandervell "
     "Products, the bearing company that paid for it, and is often given as the "
     "team's address by mistake."))


# ── Continental Europe ──────────────────────────────────────────────────────

base("mercedes-works", "Stuttgart", "Baden-Wurttemberg", "Germany", 1954, 1955,
     src="merc-f1", note="The Daimler-Benz Rennabteilung at Untertuerkheim.")

base("renault-works", "Viry-Chatillon", "Essonne", "France", 1977, 1985,
     src="renault-elf", note=(
     "The former Gordini works, to which all Renault racing moved at the end of "
     "1976. Where the turbo engine entered Formula 1."))

base("matra", "Romorantin-Lanthenay", "Loir-et-Cher", "France", 1967, 1969,
     src="matra")
base("matra", "Velizy-Villacoublay", "Yvelines", "France", 1969, 1972, src="matra")

base("ligier", "Abrest", "Allier", "France", 1976, 1988, src="ligier", note=(
     "Usually written as Vichy, the neighbouring town. The plant at Abrest is "
     "still Ligier's."))
base("ligier", "Magny-Cours", "Nievre", "France", 1988, 1996, src="ligier-f1t",
     contested=1, note=(
     "The move year is not settled. grandprix.com and f1technical both place it "
     "in 1988; the 1990 and 1991 dates that circulate elsewhere appear to belong "
     "to the circuit's reconstruction and the French Grand Prix moving there, "
     "which are different events."))

base("prost", "Magny-Cours", "Nievre", "France", 1997, 1998, src="prost-move",
     note="Prost bought Ligier and inherited the Magny-Cours works.")
base("prost", "Guyancourt", "Yvelines", "France", 1998, 2001, src="prost-move")

base("alfa-romeo", "Milan", "Milan", "Italy", 1950, 1951, src="alfa-corse",
     note="Alfa Corse, at the Portello plant.")
base("alfa-romeo", "Settimo Milanese", "Milan", "Italy", 1979, 1982, src="autodelta",
     note="Autodelta.")
base("alfa-romeo", "Senago", "Milan", "Italy", 1983, 1985, src="euroracing",
     note="Euroracing took the entry over from Autodelta for 1983.")

base("maserati", "Modena", "Modena", "Italy", 1950, 1960, src="maserati",
     note="Viale Ciro Menotti, where Maserati still is.")

base("osella", "Volpiano", "Turin", "Italy", 1980, 1990, src="osella")
base("forti", "Alessandria", "Piedmont", "Italy", 1995, 1996, src="forti")
base("fondmetal", "Palosco", "Bergamo", "Italy", 1991, 1992, src="fondmetal")
base("coloni", "Passignano sul Trasimeno", "Perugia", "Italy", 1987, 1991,
     src="coloni")
base("euro-brun", "Senago", "Milan", "Italy", 1988, 1990, src="eurobrun",
     note="The Euroracing works, two years after Alfa Romeo left them.")

base("dallara", "Brescia", "Brescia", "Italy", 1988, 1992, role="hq",
     src="scuderia-italia", note="Scuderia Italia's own offices.")
base("dallara", "Varano de' Melegari", "Parma", "Italy", 1988, 1992,
     src="dallara", note=(
     "Where the cars were actually built. Scuderia Italia entered them; Dallara "
     "designed and made them."))

base("zakspeed", "Niederzissen", "Rhineland-Palatinate", "Germany", 1985, 1989,
     src="zakspeed")
base("rial", "Fussgonheim", "Rhineland-Palatinate", "Germany", 1988, 1989,
     src="rial", note="Near Ludwigshafen.")

base("toyota", "Cologne", "North Rhine-Westphalia", "Germany", 2002, 2009,
     src="tmg", note=(
     "Toyota Motorsport GmbH, in Cologne since 1979 and the largest single "
     "facility any manufacturer has built for Formula 1 outside England."))

base("hrt", "Murcia", "Murcia", "Spain", 2010, 2011, role="hq", src="hrt",
     contested=1, note=(
     "HRT never had one base. Offices in Murcia, a technical centre at Alzira "
     "near Valencia, and a 2010 car designed and built by Dallara in Italy."))
base("hrt", "Alzira", "Valencia", "Spain", 2010, 2011, role="design", src="hrt")
base("hrt", "Madrid", "Madrid", "Spain", 2012, 2012, src="hrt-f1t",
     note="Consolidated into the Caja Magica complex for the final season.")


# ── The modern back of the grid, and Honda's first go ───────────────────────

base("honda-works", "Tokyo", "Tokyo", "Japan", 1964, 1964, src="honda-f1",
     note="Sources give only Tokyo for the first season.")
base("honda-works", "Amsterdam", "North Holland", "Netherlands", 1965, 1966,
     src="honda-f1")
base("honda-works", "Slough", "Slough", "England", 1967, 1968, src="honda-f1",
     note=(
     "Honda Racing's European base, with the RA300 chassis built by Lola at "
     "Slough. Japan's first works team finished its Formula 1 career in "
     "Berkshire."))

base("manor", "Dinnington", "South Yorkshire", "England", 2010, 2011, src="manor")
base("manor", "Banbury", "Oxfordshire", "England", 2012, 2016, src="manor")

base("caterham", "Hingham", "Norfolk", "England", 2010, 2011, src="caterham")
base("caterham", "Leafield", "Oxfordshire", "England", 2012, 2014, src="caterham",
     note="The former Arrows and Super Aguri works, taken on in January 2012.")

base("super-aguri", "Leafield", "Oxfordshire", "England", 2006, 2008,
     src="super-aguri", note=(
     "Registered in Tokyo, built in Oxfordshire, in the factory Arrows left."))

base("simtek", "Banbury", "Oxfordshire", "England", 1994, 1995, src="simtek",
     note="Acres industrial estate.")
base("pacific", "Thetford", "Norfolk", "England", 1994, 1995, src="pacific")
base("onyx", "Littlehampton", "West Sussex", "England", 1989, 1990, src="onyx",
     note=(
     "Peter Monteverdi bought the team in 1990 and moved it to Switzerland "
     "before it folded; no source names the Swiss town, so it is not recorded."))

base("larrousse", "Antony", "Hauts-de-Seine", "France", 1987, 1990, src="larrousse")
base("larrousse", "Signes", "Var", "France", 1990, 1994, src="larrousse-wp",
     note="Next to the Paul Ricard circuit.")


# ── Deliberately absent ─────────────────────────────────────────────────────
# Recorded so the gap reads as a decision rather than an oversight.
NO_BASE = {
    "aston-martin-works": "The 1959-60 DBR4 works entry. Not sourced.",
    "ats-italy": "The 1963 Italian team. Not sourced.",
    "ats-germany": "Guenter Schmid's German team, 1978-84. Not sourced.",
    "eagle": "Anglo American Racers ran from both California and Sussex; the "
             "split between the two is not sourced well enough to date.",
    "de-tomaso": "Modena is likely and unsourced, so it is left out.",
    "watson": "An Indianapolis roadster builder, not a Formula 1 team.",
}


def self_test():
    """Cheap invariants. A bad span here would silently mislabel a decade."""
    ok = True
    seen = set()
    for b in BASES:
        key = (b["lineage"], b["town"], b["from"])
        if key in seen:
            print(f"  FAIL duplicate row {key}"); ok = False
        seen.add(key)
        if b["from"] > b["to"]:
            print(f"  FAIL {b['lineage']}/{b['town']}: from > to"); ok = False
        if not (1900 <= b["from"] <= 2100):
            print(f"  FAIL {b['lineage']}/{b['town']}: from {b['from']}"); ok = False
        if b["role"] not in ("main", "engine", "design", "hq"):
            print(f"  FAIL {b['lineage']}/{b['town']}: role {b['role']!r}"); ok = False
    # Two MAIN sites must not overlap in time for one lineage. A team is in one
    # place at a time, and the move year is shared by the leaving and arriving
    # rows only at its boundary.
    by_lin = {}
    for b in BASES:
        if b["role"] != "main":
            continue
        by_lin.setdefault(b["lineage"], []).append(b)
    for lin, rows in by_lin.items():
        rows.sort(key=lambda r: r["from"])
        for a, c in zip(rows, rows[1:]):
            if c["from"] < a["to"]:
                print(f"  FAIL {lin}: main sites overlap, "
                      f"{a['town']} to {a['to']} vs {c['town']} from {c['from']}")
                ok = False
    print(f"bases self-test: {'PASS' if ok else 'FAIL'} "
          f"({len(BASES)} rows, {len(by_lin)} lineages with a main site)")
    return ok


if __name__ == "__main__":
    import sys
    sys.exit(0 if self_test() else 1)
