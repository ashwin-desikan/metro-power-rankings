# -*- coding: utf-8 -*-
"""Slovakia: its own assemblies from the 1928 provincial election through the
Slovak National Council to today's National Council, plus the presidency
(indirect 1993 and 1998, direct from 1999).

The federal Czechoslovak parliamentary and presidential record (1920-1992)
lives on the Czech and Czechoslovak hub, built alongside this one; only the
Slovak-level bodies are here. The 1928 and 1935 articles are titled "Slovak
provincial election", not "... parliamentary election", so this hub's line in
wave5.py matches that word directly rather than routing through the shared
leg_re helper, which only recognises "general/parliamentary/legislative/
Constitutional Assembly/Constituent Assembly election".
"""

STATUS = "active"
DISSOLVED = None

ERAS = {
    "leg": [
        ("province", "The Slovak Province", "1928-1935", 1900, 1935,
         "Two-thirds of the 54-seat Assembly of Slovak Province were elected and a third appointed by the national government in Prague, a compromise struck when the interwar Czechoslovak republic replaced its historic counties with four larger provinces in 1928. Both votes returned a genuinely fragmented field, with Hlinka's Slovak People's Party first among many rather than a majority on its own."),
        ("wartime", "The Slovak State", "1938", 1938, 1938, "The Munich Agreement and the loss of southern Slovakia to Hungary were followed within weeks by a single-list election for a new Diet, held under the wartime Hlinka-dominated regime that would declare full independence three months later. Voters were offered one slate to approve or reject, and it took 97.5% of the vote."),
        ("democratic-win", "The Democratic Party's win", "1946", 1946, 1946, "The Slovak National Council elected in August 1946 was the last genuinely contested vote before the Communist coup of February 1948: the Democratic Party won it outright against the Communist Party of Slovakia, the only time a non-Communist party topped a Czechoslovak-era ballot."),
        ("national-front", "The National Front decades", "1948-1986", 1947, 1989, "Every Slovak National Council election from 1948 to 1986 offered a single National Front list and returned it with support in the high nineties, the same ritual repeated nine times running. These rows are marked unfree."),
        ("velvet", "The Velvet Revolution and a sovereign Slovakia", "1990-1992", 1990, 1993, "The Slovak National Council elections of 1990 and 1992 were the first free votes since 1946: Public Against Violence swept 1990 on the wave of the revolution, then splintered, and Vladimír Mečiar's Movement for a Democratic Slovakia won 1992 on a platform that led directly to Czechoslovakia's dissolution on 1 January 1993."),
        ("republic", "The National Council of independent Slovakia", "1994-", 1994, 2100, "Since independence the 150-seat National Council has been elected by closed-list proportional representation with a nationwide 5% threshold, and no election has needed a runoff to form a government because none is held for parliament at all: coalitions are built afterward. Mečiar's HZDS dominated the 1990s, Direction-Social Democracy the 2010s, and the 2023 return of Robert Fico followed the shortest-lived reform government in the country's history."),
    ],
    "pres": [
        ("indirect", "Elected by parliament", "1993-1998", 1993, 1998, "Slovakia's first constitution gave the presidency to the National Council itself, requiring a three-fifths majority. Michal Kováč was elected that way in January 1993, weeks before independence; when his term ended in 1998 parliament tried and failed across nine ballots through the year to find a successor, leaving the office vacant until a constitutional amendment moved the election to the voters."),
        ("direct", "Direct election, two rounds", "1999-", 1999, 2100, "A 1999 constitutional amendment, passed in direct response to the 1998 deadlock, made the presidency a popular vote decided by an outright majority or a runoff between the top two. Every election since has gone to a second round; Zuzana Čaputová's 2019 win made her the country's first woman president, and Peter Pellegrini's 2024 runoff against Ivan Korčok was the closest and most polarised of the six."),
    ],
}

COLORS = {
    "Hlinka's Slovak People's Party": "#4B5320",
    "Republican Party of Farmers and Peasants": "#7CB342",
    "Communist Party of Czechoslovakia": "#C8102E",
    "Czechoslovak Social Democratic Workers' Party": "#E4572E",
    "Czechoslovak People's Party": "#1565C0",
    "Czechoslovak National Socialist Party": "#1976D2",
    "Slovak National Party": "#0B3D91",
    "Czechoslovak Traders' Party": "#8D6E63",
    "Independents": "#9ca3af",
    "Independents and others": "#9ca3af",
    "Democratic Party": "#1565C0",
    "Communist Party of Slovakia": "#C8102E",
    "National Front": "#C8102E",
    "Freedom Party": "#8D6E63",
    "Party of Slovak Revival": "#8D6E63",
    "Christian Democratic Movement": "#F5A200",
    "Green Party": "#4CAF50",
    "Social Democracy": "#E4572E",
    "Movement for a Democratic Slovakia": "#1B5E20",
    "People's Party – Movement for a Democratic Slovakia": "#1B5E20",
    "Party of the Democratic Left": "#E4572E",
    "Roma Civic Initiative": "#6A1B9A",
    "Slovak People's Party": "#4B5320",
    "Union of the Workers of Slovakia": "#B71C1C",
    "Party of the Hungarian Coalition": "#1E88A8",
    "Party of the Hungarian Community": "#1E88A8",
    "Slovak National Unity": "#4B5320",
    "B–Revolutionary Workers' Party": "#B71C1C",
    "Alliance of the New Citizen": "#2196F3",
    "Movement for Democracy": "#66BB6A",
    "Civic Conservative Party": "#37474F",
    "Left Bloc": "#C62828",
    "Direction – Social Democracy": "#DA251C",
    "Slovak Democratic and Christian Union – Democratic Party": "#003DA5",
    "Free Forum": "#26A69A",
    "Freedom and Solidarity": "#FFE000",
    "Most–Híd": "#7B3F98",
    "People's Party Our Slovakia": "#7A0C0C",
    "99% – Civic Voice": "#78909C",
    "We Are Family": "#F58220",
    "Slovak Revival Movement": "#689F38",
    "Progressive Slovakia": "#A346FF",
    "Voice – Social Democracy": "#00A19A",
    "Party of Civic Understanding": "#FFA000",
    "Public Against Violence": "#4CAF93",
    "Independent": "#9ca3af",
}

INTRO = {
    "leg": "Every election to Slovakia's own assembly since the 1928 Slovak provincial election, newest first: the interwar Slovak Province, the wartime Slovak State's single list, the Slovak National Council under the National Front, and the National Council of independent Slovakia since 1994.",
    "pres": "Every Slovak presidential contest since 1993, newest first. The first two were decided by parliament, the second of which never elected anyone; every direct election since 1999 has gone to a runoff.",
}

ERA_FREEDOM = {
    ("sk", "leg", "wartime"): "unfree",
    ("sk", "leg", "national-front"): "unfree",
}
ERA_CAVEAT = {
    ("sk", "leg", "wartime"): "A single Hlinka-dominated list was offered for approval, with no opposing slate on the ballot.",
    ("sk", "leg", "national-front"): "A single National Front list was offered for approval at every election from 1948 to 1986, with no opposing slate on the ballot.",
}
FREEDOM_OVERRIDE = {
    ("sk", "pres-1998"): ("unfree", "The National Council tried and failed across nine ballots to elect a president with the required three-fifths majority, leaving the office vacant for the rest of the year."),
}

HUB = dict(
    shape="combined",
    name="Slovakia", adj="Slovak", flag="sk", capital=("bratislava", "Bratislava"),
    title="Slovak Elections",
    legNoun="Slovak National Council Election", presNoun="Slovak Presidential Election",
    chamber="the National Council",
    role="Prime Minister", roleShort="PM",
    presRole="President", presFirst=True, runoffSummary=True,
    legHeadline="National Council elections",
    locale="en-GB",
    chartFrom=None,
    desc="Slovakia's own assemblies from the 1928 provincial election to the 2023 National Council, and its presidency from 1993, all one record separate from the federal Czechoslovak elections on the Czech and Czechoslovak hub: the interwar Slovak Province, the wartime single list, the Democratic Party's 1946 win before the Communist coup, four decades of unopposed National Front ballots, the Velvet Revolution, and independence in 1993.",
    sources=["Wikipedia: Slovak provincial, parliamentary, National Council and presidential election articles 1928-2024 (results tables and infoboxes)",
             "Statistical Office of the Slovak Republic and predecessor commission figures as reported there"],
    tiles=[("National Council seats", "150", "76 for a majority"),
           ("Elections since 1928", None, None),
           ("Apr 2024", "53.1%", "Pellegrini's runoff win over Korčok")],
    how=[("Closed-list PR with a 5% threshold",
          "The 150-seat National Council is elected in a single nationwide constituency by closed-list proportional representation. No election chooses the Prime Minister directly; the president appoints one after coalition talks, which is why the chronology's tags are formed rather than elected."),
         ("A president elected twice over",
          "Slovakia tried indirect election first: a three-fifths vote of the National Council chose Michal Kováč in 1993. When his successor could not be agreed after nine attempts in 1998, the constitution was amended within months to put the choice directly to voters, on two rounds if no one clears a majority in the first."),
         ("Four decades of one list",
          "From 1948 to 1986 the ballot offered a single National Front slate, and it was reported as taking support in the high nineties at every vote. Those rows carry the numbers the source gives and a label saying what they were."),
         ("From province to republic",
          "The body being elected has changed name and power three times since 1928: an appointed-and-elected provincial assembly under interwar Czechoslovakia, a Slovak National Council with real authority only after 1990, and the fully sovereign National Council since 1 January 1993.")],
    charts=[("Turnout", "Above 95% through the National Front decades, when a ballot was compulsory and unopposed; down to the 60s and 70s since 1994, with the 2006 low of 54.7% the freest election's quietest one."),
            ("The largest party's seat share", "HZDS's 1994 and 1998 pluralities, Direction-Social Democracy's outright 2012 majority (the only one since 1994), and the fragmentation that has followed it since.")],
    links=[("/elections/cz", "Czech and Czechoslovak Elections"), ("/countries/slovakia", "Slovakia"),
           ("/elections/hu", "Hungarian Parliamentary Elections"), ("/elections/at", "Austrian Elections")],
    records=[
        ("Largest legislative majority", "83 of 150 seats", "2012", "Direction-Social Democracy under Robert Fico, the only outright National Council majority since independence."),
        ("Lowest legislative turnout", "54.67%", "2006", "The freest era's quietest election."),
        ("Closest presidential runoff", "53.12% to 46.88%", "pres-2024", "Peter Pellegrini's win over Ivan Korčok."),
    ],
    colorRules=[
        (r"Hlinka|Slovak People's Party", "#4B5320"),
        (r"Kotleb|People's Party Our Slovakia", "#7A0C0C"),
        (r"Communist", "#C8102E"),
        (r"Direction|Smer", "#DA251C"),
        (r"Hungarian", "#1E88A8"),
        (r"Movement for a Democratic Slovakia|HZDS", "#1B5E20"),
        (r"Christian Democratic", "#F5A200"),
        (r"Democratic and Christian Union", "#003DA5"),
    ],
)
