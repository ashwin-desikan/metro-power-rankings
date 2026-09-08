"""Finland: Eduskunta 1907-2023 plus the 2024 presidential election.

The parliamentary dump holds all 39 Eduskunta elections. The 2024 presidential
article arrived separately the same day (Ashwin, 2026-09-08) and is appended
to /tmp/hubs/fi.txt; the six direct elections of 1994-2018 and the
electoral-college era are still to come, so the presidential series is one
row and the page's charts read the legislative series.
"""

STATUS = "active"
DISSOLVED = None

ERAS = {
    "leg": [
        ("granddutchy", "The Grand Duchy", "1907-1917", 1900, 1918,
         "Finland's first Eduskunta election, in March 1907, was held under universal and equal suffrage for everyone over 24, a first in Europe and the first in the world to seat women as MPs; the old four-estate Diet of nobles, clergy, burghers and peasants was gone. It did the Social Democrats little lasting good: the Russian Emperor dissolved the new parliament repeatedly through the Grand Duchy's last decade of autonomy, and it barely sat at all once the First World War began."),
        ("young", "The young republic", "1919-1939", 1919, 1944,
         "Independence in 1917 was followed by civil war in 1918, and the republic's elections through the interwar years were fought over how far the new state should tilt right. The 1930 election came after the Lapua Movement's campaign to outlaw the Communist Party by force, including the kidnapping of left-wing politicians; the Communists' front organisations were banned that year and stayed off the ballot until 1945. Parliament itself was dissolved early more than once in the period, most often over budget and salary fights the government of the day could not carry."),
        ("warandkekkonen", "War and the Paasikivi-Kekkonen years", "1945-1979", 1945, 1980,
         "The 1945 election, held as Communists returned to the ballot for the first time since 1930, opened three and a half decades in which Finnish governments were built around keeping Moscow reassured, the foreign policy line named for presidents Paasikivi and Kekkonen. Kekkonen himself dissolved parliament early in 1961 during a Soviet diplomatic pressure campaign known as the Note Crisis, and coalitions across these years ran from centre-left to broad multi-party governments assembled to survive recurring recessions."),
        ("rainbow", "Recession and the Rainbow Coalition", "1983-2003", 1983, 2006,
         "The 1991 election, held deep in a recession that followed the Soviet collapse, threw out the Social Democrats for the Centre Party's Esko Aho, whose austerity government was in turn swept out in 1995 by the SDP's best result since the Second World War. What followed it was Paavo Lipponen's five-party Rainbow Coalition, Social Democrats governing alongside the National Coalition, Left Alliance, Swedish People's Party and Greens at once, a combination that carried Finland into the European Union in 1995 and held through two more elections."),
        ("multibloc", "The modern multi-bloc era", "2007-2023", 2007, 2100,
         "No single party has approached a majority since 2007, so every government here is a multi-party coalition assembled after weeks of talks, and several have broken apart mid-term. The 2023 election put the National Coalition first by a narrow margin over the Finns Party and the governing Social Democrats, and the coalition Petteri Orpo built with the Finns brought the nationalist right into government for the first time; the two elections either side of it, in 2019 and 2023, were fought against the backdrop of Russia's invasion of Ukraine and Finland's decision to join NATO."),
    ],
    "pres": [
        ("direct", "The direct presidency", "1994-", 1900, 2100,
         "Finland has elected its president directly since 1994; before that an electoral college chose the head of state, and the office carried real foreign-policy power until the 2000 constitution trimmed it. The one contest on file is 2024, the first presidential election since Finland joined NATO, decided in the closest runoff the country has held: Alexander Stubb over Pekka Haavisto by 3.2 points. The direct elections of 1994 to 2018 and the electoral-college era join when their articles do."),
    ],
}

COLORS = {
    "Social Democratic Party": "#E10600",
    "National Coalition Party": "#0060A9",
    "Agrarian League": "#00923F", "Centre Party": "#00923F",
    "Finns Party": "#003580", "Finnish Rural Party": "#003580",
    "Left Alliance": "#A6192E", "Finnish People's Democratic League": "#A6192E",
    "Communist Party": "#A6192E", "Communist Workers' Party": "#A6192E",
    "Communist Workers' Party – For Peace and Socialism": "#A6192E",
    "Green League": "#62A925", "Greens": "#62A925",
    "Ecological Party the Greens": "#62A925",
    "Swedish People's Party": "#FDB913",
    "Christian Democrats": "#00A9CE", "Finnish Christian League": "#00A9CE",
    "National Progressive Party": "#5BC2E7", "Liberal People's Party": "#5BC2E7",
    "Liberal League": "#5BC2E7", "Liberals": "#5BC2E7",
    "Finnish Party": "#7B3F00", "Young Finnish Party": "#C08552",
    "Patriotic People's Movement": "#4B4B4B",
    "Christian Workers' Union": "#C97586",
    "People's Party": "#9CA3AF",
    "Independents": "#9CA3AF", "Independent": "#9CA3AF",
    "Others": "#9CA3AF",
    "Movement Now": "#FF8200",
    "Pirate Party": "#4C1E63",
    "Small Farmers' Party": "#8A9A5B", "Small Farmers Party": "#8A9A5B",
    "Åland Coalition": "#FDB913",
}

INTRO = {
    "leg": "Every Eduskunta election since Finland's first, under universal suffrage in 1907, newest first. The Grand Duchy years carry a caveat for the parliament's repeated dissolution by the Russian Emperor.",
    "pres": "Finland's direct presidential elections, newest first. Only 2024 is on file so far; the six direct elections from 1994 to 2018 and the electoral-college era before them join when their articles are added.",
}

ERA_FREEDOM = {
    ("fi", "leg", "granddutchy"): "partial",
}
ERA_CAVEAT = {
    ("fi", "leg", "granddutchy"): "The Eduskunta itself was elected on a genuinely universal franchise, but the Russian Emperor dissolved it repeatedly through this period and it barely sat once the First World War began.",
}
FREEDOM_OVERRIDE = {
}

HUB = dict(
    shape="combined",
    name="Finland", adj="Finnish", flag="fi", capital=("helsinki", "Helsinki"),
    title="Finnish Elections",
    legNoun="Finnish Parliamentary Election", presNoun="Finnish Presidential Election",
    chamber="the Eduskunta",
    role="Prime Minister", roleShort="PM",
    presRole="President", presFirst=True, runoffSummary=True,
    legHeadline="Eduskunta elections",
    locale="en-GB",
    chartFrom=None,
    desc="Finland's Eduskunta elections from 1907, the first in Europe held under universal suffrage and the first anywhere to seat women, through the 2023 election that brought the nationalist Finns Party into government for the first time. The presidency has been directly elected since 1994, most recently in January and February 2024, but no presidential election article is in this dump yet, so the presidential series here is empty.",
    sources=["Wikipedia: Finnish parliamentary election articles 1907-2023 (results tables and infoboxes)"],
    tiles=[("Eduskunta seats", "200", "one chamber, proportional by district"),
           ("Elections since 1907", None, None),
           ("Apr 2023", "48 seats", "National Coalition Party finished first")],
    how=[("A single 200-seat chamber",
          "The unicameral Eduskunta has held 200 seats since the first election in 1907, filled by proportional representation across multi-member districts with no legal threshold, which is why joint lists and small parties have always won a share of seats."),
         ("The president elected directly since 1994",
          "Finland's president was chosen by an electoral college until a 1991 constitutional change; every election since 1994 has been a direct popular vote, with a runoff between the top two if nobody passes 50% in the first round. No presidential election article has made it into this dump yet, direct or electoral-college, so none appear below."),
         ("Coalitions, not majorities",
          "No party has won an outright Eduskunta majority since the Social Democrats' single-party government of 1917, so every government here is a multi-party coalition, and several have fallen apart mid-term over budget or foreign-policy disputes."),
         ("From the Tsar's Diet to NATO",
          "The Eduskunta replaced Finland's four-estate Diet in 1907 while the country was still a Grand Duchy of the Russian Empire; independence followed a decade later. The 2023 election was fought as Finland completed its accession to NATO, ending the military neutrality it had kept since the Second World War.")],
    charts=[("Turnout", "Turnout ran above 70% at almost every Eduskunta election on file."),
            ("The largest party's seat share", "No party has approached a majority since the Social Democrats' 103 of 200 seats in 1916; the largest party's share has mostly sat in the 20 to 25 percent range since the 1990s.")],
    links=[("/countries/finland", "Finland"), ("/elections/se", "Swedish Elections"),
           ("/elections/no", "Norwegian Elections")],
    records=[
        ("Largest seat total on record", "103 of 200 seats", "1916", "The only time a single party has held an outright Eduskunta majority; the Social Democrats lost it when parliament was dissolved and re-elected in October 1917."),
        ("Closest three-way finish", "48-46-43 seats", "2023", "The National Coalition Party finished first over the Finns Party and the governing Social Democrats by a margin of a few points each way."),
    ],
    colorRules=[
        (r"Social Democrat", "#E10600"),
        (r"National Coalition", "#0060A9"),
        (r"Centre Party|Agrarian", "#00923F"),
        (r"Finns Party|Rural Party", "#003580"),
        (r"Left Alliance|People's Democratic League|Communist", "#A6192E"),
        (r"Green", "#62A925"),
        (r"Swedish People's Party", "#FDB913"),
        (r"Christian", "#00A9CE"),
        (r"Progressive|Liberal", "#5BC2E7"),
    ],
)
