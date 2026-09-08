# -*- coding: utf-8 -*-
"""United Arab Emirates: Federal National Council, leg shape.

Every seat in every one of these five contests went to an independent
because political parties are banned; the dump gives no party or candidate
vote shares at all, only seat counts, turnout and (in the lead prose) the
size of the electoral college that did the voting. The electoral college and
turnout numbers, not a party breakdown, are the story of this hub.
"""

STATUS = "active"
DISSOLVED = None

ERAS = {
    "leg": [
        ("college", "The appointed electoral college", "2006–", 1900, 9999,
         "Half the Federal National Council is elected, and even that half is chosen not by ordinary citizens but by an electoral college the rulers of each emirate handpick. Political parties are banned, so every one of these five contests returned twenty independents to twenty seats, and the only line that moves from election to election is the college itself: 6,595 members in 2006, expanded to 398,879 by 2023."),
    ],
}

COLORS = {
    "Independents": "#9ca3af",
    "Independent": "#9ca3af",
}

INTRO = {
    "leg": "Every Federal National Council election since 2006, newest first. Parties are banned in the United Arab Emirates, so all twenty elected seats return independents every time; what changes is who gets to vote at all, as the handpicked electoral college grew from 6,595 members to 398,879 across five contests.",
}

ERA_FREEDOM = {
    ("ae", "leg", "college"): "partial",
}
ERA_CAVEAT = {
    ("ae", "leg", "college"): "The 20 elected seats are chosen not by citizens at large but by an electoral college the rulers of each emirate select, and the other 20 seats in the council are simply appointed by those same rulers.",
}
FREEDOM_OVERRIDE = {
}

HUB = dict(
    shape="leg",
    name="United Arab Emirates", adj="Emirati", flag="ae", capital=("abu-dhabi", "Abu Dhabi"),
    title="Emirati Federal National Council Elections",
    legNoun="Emirati Federal National Council Election",
    chamber="the Federal National Council",
    role="Speaker", roleShort="Speaker",
    locale="en-US",
    chartFrom=None,
    desc="Every Federal National Council election from 2006 to 2023: twenty of the council's forty seats elected, the other twenty simply appointed, and every one of the elected seats won by an independent because parties are banned. The number that actually moves is the electoral college handpicked to vote, which grew from 6,595 members to 398,879 in five contests while turnout swung between 27.75% and 74.4%.",
    sources=["Wikipedia: Emirati parliamentary election articles 2006-2023 (results tables and infoboxes)",
             "The National and Emirates News Agency (WAM) figures as reported there"],
    tiles=[("FNC seats", "40", "half elected, half appointed by the rulers"),
           ("Elections since 2006", None, None),
           ("2023 college size", "398,879", "up from 6,595 members in 2006")],
    how=[("An electoral college, not a franchise",
          "Only citizens the rulers of each emirate name to the electoral college may vote at all. That college was 6,595 people in 2006 and 398,879 by 2023, still a fraction of the more than 300,000 citizens over 18 the first election's own article counted."),
         ("Half elected, half appointed",
          "The council has 40 seats. Twenty are filled by the electoral college, one non-transferable vote per elector, across seven emirate-based constituencies; the rulers simply appoint the other twenty themselves."),
         ("No parties on the ballot",
          "Political parties are banned in the UAE, so every candidate runs and wins as an independent. The seats table on every one of these five contests reads the same: Independents, twenty seats, no change."),
         ("A gender quota layered on top",
          "Since the 2019 election, half of the council's seats are reserved for women by directive; where an emirate's elected results fall short, its appointed seats are used to make up the balance.")],
    charts=[("Turnout", "Turnout has swung from 74.4% in the first election of 2006, before the college had grown large, down to 27.75% in 2011 and back up to 44.0% by 2023."),
            ("The largest party's share",
             "Empty by construction: parties are banned and every seat goes to an independent, so there is no party vote share to plot. The number that actually tells this story is the electoral college's size, from 6,595 voters in 2006 to 398,879 in 2023.")],
    links=[("/countries/united-arab-emirates", "United Arab Emirates"),
           ("/elections/eg", "Egyptian Elections"),
           ("/elections/iq", "Iraqi Elections"),
           ("/elections/ir", "Iranian Elections")],
    records=[
        ("Largest electoral college", "398,879", "2023", "The college that elected the 2023 council, up from 337,738 in 2019 and sixty times the 6,595 who voted in 2006."),
        ("Smallest electoral college", "6,595", "2006", "The UAE's first ever parliamentary election was decided by a college of 6,595 handpicked citizens, of whom 1,163 were women."),
        ("Highest turnout", "74.4%", "2006", "Turnout at the first election, among the small, handpicked college eligible to vote, was the highest of the five."),
        ("Lowest turnout", "27.75%", "2011", "Turnout fell by nearly 47 points as the college expanded to 129,274 members, its steepest one-election jump."),
    ],
    colorRules=[
    ],
)
