# -*- coding: utf-8 -*-
"""Ethiopia: House of Peoples' Representatives and its predecessors, leg shape.

Five eras in one chamber's name only. An imperial Chamber of Deputies with no
parties at all, a single-party Derg vote, a multiparty transition run by the
rebels who had just won a civil war, an EPRDF era that grew less contested
every cycle until it swept every seat, and a Prosperity Party era voted on
alongside civil war rather than instead of it.
"""

STATUS = "active"
DISSOLVED = None

ERAS = {
    "leg": [
        ("imperial", "The imperial Chamber of Deputies", "1957-1973", 1900, 1973,
         "Haile Selassie's 1955 constitution created an elected Chamber of Deputies, but political parties stayed banned, so every seat went to an independent and competition was between individual notables rather than over a program. Candidates needed real property to qualify to run, which the dump's own sources say made the chamber a vehicle for self-promotion among a narrow elite rather than a forum of popular representation, and the Emperor kept naming and dismissing his prime ministers regardless of who won. Two of these five elections, 1961 and 1965 and 1969, survive in the dump only as a paragraph of background prose with no results table at all."),
        ("derg", "The Derg's single-party vote", "1987", 1974, 1993,
         "Thirteen years of military rule under the Derg passed with no elections whatsoever before one was finally held in June 1987 to seat the 835-member National Shengo. The Workers' Party of Ethiopia was the only legal party and had already governed unopposed for three years, so its 795 seats on a reported 99.2% of the vote confirmed a result nobody doubted rather than decided one. The Shengo sat for barely four years before the EPRDF's rebels took Addis Ababa in 1991."),
        ("transition", "Transition and the first multiparty vote", "1994-1995", 1994, 1999,
         "The Constituent Assembly election of June 1994 was Ethiopia's first ever multiparty vote, called to draft the constitution that would replace the Derg's, and the EPRDF and its ethnic-based allies won 463 of 544 seats against a field still finding its footing after decades of one-party and no-party rule. The following year's Council of Representatives election, the first held under that new constitution, saw four of the country's seven registered national opposition parties boycott outright over what they called unequal conditions, and outside observers called the ruling coalition's majority a foregone conclusion before a vote was cast."),
        ("eprdf", "EPRDF hegemony", "2000-2015", 2000, 2020,
         "Four elections under one dominant coalition, each less contested than the last. The 2005 vote briefly looked like a genuine contest, the opposition Coalition for Unity and Democracy swept Addis Ababa, until disputed results, tens of thousands of arrests and dozens of deaths in the protests that followed; by 2015 the EPRDF and its allies took every one of the 547 seats, a result Human Rights Watch called a sham and the United States said was not credible."),
        ("prosperity", "The Prosperity Party era", "2021-", 2021, 9999,
         "Abiy Ahmed dissolved the EPRDF into a single Prosperity Party in 2019, and the two elections held since have run alongside civil war rather than instead of it. Voting in 2021 left 74 of 547 seats unfilled where fighting or logistics stopped balloting outright, and by 2026, with Tigray excluded entirely and voting suspended in parts of Amhara and Oromia, 61 seats stood vacant. Opposition parties still won real seats in both, and turnout among those able to vote topped 95% in 2026."),
    ],
}

COLORS = {
    "Independents": "#9ca3af",
    "Independent": "#9ca3af",
    "Workers' Party of Ethiopia": "#b91c1c",
    "Ethiopian People's Revolutionary Democratic Front": "#7c2d3f",
    "Amhara National Democratic Movement": "#ca8a04",
    "Tigray People's Liberation Front": "#dc2626",
    "Oromo People's Democratic Organization": "#16a34a",
    "Oromo Peoples' Democratic Organization": "#16a34a",
    "Southern Ethiopian People's Democratic Movement": "#0d9488",
    "Ethiopian Somali People's Democratic Party": "#0ea5e9",
    "Ethiopian Somali Democratic League": "#0369a1",
    "Coalition for Unity and Democracy": "#1d4ed8",
    "United Ethiopian Democratic Forces": "#7c3aed",
    "Afar National Democratic Party": "#f97316",
    "Afar Liberation Front": "#c2410c",
    "Benishangul-Gumuz People's Democratic Party": "#65a30d",
    "Benishangul-Gumuz People's Democratic Unity Front": "#65a30d",
    "Gambela People's Democratic Movement": "#14b8a6",
    "Gambela People's Liberation Movement": "#0e7490",
    "Argoba People's Democratic Organization": "#92400e",
    "Argoba Nationality Democratic Organization": "#92400e",
    "Argoba Nationality Democratic Movement": "#92400e",
    "Hareri National League": "#db2777",
    "Medrek": "#f59e0b",
    "Prosperity Party": "#15803d",
    "Ethiopian Citizens for Social Justice": "#8b5cf6",
    "National Movement of Amhara": "#eab308",
    "Amhara Democratic Force Movement": "#b45309",
    "New Generation Party": "#4f46e5",
    "Ogaden National Liberation Front": "#991b1b",
    "Gedeo People's Democratic Party": "#06b6d4",
    "Ethiopian National Unity Party": "#475569",
    "Ethiopian Democratic Party": "#e11d48",
    "Oromo Federalist Democratic Movement": "#059669",
    "Unity for Democracy and Justice": "#c026d3",
    "Western Somali Democratic Party": "#2563eb",
    "Western Somali Democratic League": "#2563eb",
    "Kebena Nationality Democratic Organization": "#78350f",
    "Wolayta People's Democratic Organization": "#0f766e",
    "Wolaita People's Democratic Movement": "#0f766e",
    "Sidama People's Democratic Organization": "#84cc16",
    "Gamo and Gofa People's Democratic Organization": "#22c55e",
    "Hadiya People's Democratic Organization": "#ec4899",
    "Yem People's Democratic Front": "#d97706",
    "Other parties": "#6b7280",
    "Afar People's Party": "#fb923c",
    "Freedom and Equality Party": "#0891b2",
}

INTRO = {
    "leg": "Every election to the imperial Chamber of Deputies, the Derg's National Shengo, the Constituent Assembly and the House of Peoples' Representatives since 1957, newest first. Parties were banned until 1994; every contest from 1995 on carries a boycott, a dispute or a war that kept part of the country from voting.",
}

ERA_FREEDOM = {
    ("et", "leg", "imperial"): "partial",
    ("et", "leg", "derg"): "unfree",
    ("et", "leg", "transition"): "partial",
    ("et", "leg", "eprdf"): "partial",
    ("et", "leg", "prosperity"): "partial",
}
ERA_CAVEAT = {
    ("et", "leg", "imperial"): "Political parties were banned and candidates needed real property to qualify, so competition was between individual notables rather than a choice of program, and the Emperor kept naming the government regardless of the result.",
    ("et", "leg", "derg"): "The Workers' Party of Ethiopia was the sole legal party and had already governed unopposed for three years; the vote confirmed a result that was never in doubt.",
    ("et", "leg", "transition"): "The EPRDF and its ethnic-based allies dominated both elections of this era; four of Ethiopia's seven registered opposition parties boycotted the 1995 vote outright, alleging unequal conditions.",
    ("et", "leg", "eprdf"): "The European Union, Human Rights Watch and the US State Department all found elections in this era, especially 2005 and 2015, fell short of free and fair, citing fraud, mass arrests and a media crackdown.",
    ("et", "leg", "prosperity"): "Both elections were held with large parts of the country unable to vote because of conflict, so the seat totals are of the seats actually contested, not the full 547.",
}
FREEDOM_OVERRIDE = {
    ("et", "1987"): ("unfree", "The Workers' Party of Ethiopia was the sole legal party and took 795 of 835 seats on a reported 99.2% of the vote."),
    ("et", "1995"): ("partial", "Four of the seven registered national opposition parties boycotted, and observers called the ruling coalition's majority a foregone conclusion before voting began."),
    ("et", "2005"): ("partial", "The opposition CUD swept Addis Ababa and disputed the declared results; the protests that followed prompted more than 60,000 arrests and dozens of deaths."),
    ("et", "2015"): ("unfree", "The EPRDF and its allies won all 547 seats; Human Rights Watch called the count a sham and the United States said the results were not credible."),
    ("et", "2021"): ("partial", "Voting in Harari, SNNPR and Somali was delayed to September, the Oromo Federalist Congress boycotted, and the US State Department said the process was not free or fair for all Ethiopians."),
    ("et", "2026"): ("partial", "Voting did not take place in Tigray or in parts of Amhara and Oromia because of conflict, leaving 61 of 547 seats vacant."),
}

HUB = dict(
    shape="leg",
    name="Ethiopia", adj="Ethiopian", flag="et", capital=("addis-ababa", "Addis Ababa"),
    title="Ethiopian General Elections",
    legNoun="Ethiopian General Election",
    chamber="the House of Peoples' Representatives",
    role="Prime Minister", roleShort="PM",
    locale="en-US",
    chartFrom=1987,
    desc="Every election to Ethiopia's lower house since 1957: an imperial Chamber of Deputies with no parties at all, the Derg's single-party Shengo of 1987, the multiparty transition of 1994-95, four elections of EPRDF hegemony that grew less contested every cycle, and two Prosperity Party elections voted on alongside civil war. The 2026 vote handed the Prosperity Party 438 of 547 seats on 95.7% turnout, with 61 seats left vacant where fighting kept the country from voting at all.",
    sources=["Wikipedia: Ethiopian general election articles 1957-2026 (results tables and infoboxes)",
             "National Election Board of Ethiopia figures as reported there"],
    tiles=[("Seats", "547", "House of Peoples' Representatives"),
           ("Elections since 1957", None, None),
           ("June 2026", "438", "Prosperity Party seats, 95.7% turnout")],
    how=[("From no parties to one party to many",
          "Parties were banned outright until 1994, restricted to one legal party under the Derg, and multiparty ever since, though every multiparty vote so far has been dominated by a single ruling coalition or its successor."),
         ("An ethnic-federalist coalition, not one party",
          "The EPRDF that ran Ethiopia from 1991 to 2019 was itself a coalition of ethnic-based parties, the OPDO, ANDM, TPLF and EPRDF proper chief among them, plus a shifting bench of smaller regional allies who together held almost every seat outside the opposition's best years."),
         ("Boycotts and disputes, not silence",
          "Every multiparty election from 1995 on carries a boycott, a disputed count, or a war that kept part of the country from voting, right through to the 61 seats left vacant in 2026."),
         ("A single dominant party, three names",
          "The Ethiopian People's Revolutionary Democratic Front governed from 1991, dissolved into the Prosperity Party in 2019 under Abiy Ahmed, and has yet to lose a national election under either name.")],
    charts=[("Turnout", "Turnout has run above 80% in every multiparty election on record, from 87.5% in 1994 to a reported 95.7% in 2026, whatever else was contested about the count."),
            ("The largest party's share", "Most of these tables report seats and a seat change but no vote share, so the line only has three points to plot: the Workers' Party's 99.2% in 1987, OPDO's 82.9% within the EPRDF coalition in 1995, and the Prosperity Party's 89.2% in 2021.")],
    links=[("/countries/ethiopia", "Ethiopia"),
           ("/elections/ke", "Kenyan Elections"),
           ("/elections/eg", "Egyptian Elections")],
    records=[
        ("Most seats won", "500", "2015", "The EPRDF and its allies took every one of the 547 seats, a result international observers called neither free nor fair."),
        ("Highest turnout", "95.7%", "2026", "The reported turnout in the Prosperity Party's second election, held with Tigray excluded and 61 seats left vacant."),
        ("Largest single-party win", "795 seats", "1987", "The Workers' Party of Ethiopia's near-sweep of the Derg's 835-member National Shengo, the only legal party on the ballot."),
        ("Most seats left vacant", "74", "2021", "Fighting and logistics kept balloting from happening at all in 74 of the House's 547 seats, more than in any other election on record."),
    ],
    colorRules=[
        (r"Somali.*(Democratic|Federalist|Liberation)", "#0284c7"),
        (r"Afar.*(Democratic|People|Revolutionary|Liberation)", "#ea580c"),
        (r"Amhara.*(Democratic|National|Unity)", "#ca8a04"),
        (r"Oromo.*(Democratic|Liberation|Federalist|Congress)", "#16a34a"),
        (r"Gambela.*(Democratic|Liberation|Unity)", "#0e7490"),
        (r"Benishangul.*(Democratic|Unity|Liberation)", "#65a30d"),
        (r"Gumuz.*(Democratic|Liberation)", "#65a30d"),
        (r"People'?s'? (Democratic|Revolutionary Democratic) (Organization|Movement|Front|Party|Unity)", "#4d7c0f"),
        (r"Democratic (Organization|Movement|Front|Party|League|Unity)", "#57534e"),
    ],
)
