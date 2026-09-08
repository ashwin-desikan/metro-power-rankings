# -*- coding: utf-8 -*-
"""Czech Republic with Czechoslovakia as its predecessor (Ashwin, 2026-09-08):
the federal Czechoslovak legislative and presidential record runs straight
into the Czech Chamber of Deputies from 1996 and the direct presidency from
2013. Slovakia's own record, including its own National Council and its own
presidency, is the sibling hub at /elections/sk.

The Czech National Council elections of 1968-1992 (the republic-level house
inside the federation, renamed the Chamber of Deputies in 1993) are left out
of the legislative series on purpose; the "1968 Czech legislative election"
article turned out on inspection to BE the 1968 National Council election
(no federal Czechoslovak election took place that year), so it is excluded
by title in wave5.py alongside 1971-1992. The indirect Czech presidential
elections of 1993-2008, held by parliament before the office went direct in
2013, are not in the source dump and are named as a gap in the intro rather
than silently skipped.

Parser note: Czechoslovakia's bicameral articles (1920-1992) print the
Chamber of Deputies results table directly followed by the Senate's or House
of Nations' own identical "Party | Votes | % | Seats" header, with no blank
line between them. parse_wikidump.py's row reader used to treat that second
header as a data row (with any bare "Senate" caption glued onto it as a
name), which ran the second chamber's rows straight onto the first and
doubled every party in 1920's table (which is why totalSeats and the summed
seats used to disagree there). Fixed by treating a repeated header row as a
table terminator; verified byte-identical on the other seven wave-5 hubs.
"""

STATUS = "active"
DISSOLVED = None

ERAS = {
    "leg": [
        ("first", "The First Republic", "1920-1935", 1900, 1937,
         "Czechoslovakia's founding republic elected both houses of its National Assembly by list PR on a wide and genuinely competitive field, sixteen parties strong at the first vote in 1920. Governments were built afterwards from shifting coalitions of the largest blocs, a pattern historians call the Pětka. It ended not at the ballot box but at Munich."),
        ("1946", "The last free vote before the coup", "1946", 1938, 1947,
         "The only postwar election held before the Communist takeover, contested by four legal parties in the Czech lands and won outright by the Communist Party on just under 40%. Klement Gottwald became prime minister of a coalition government legitimately, then used the ministries he controlled to engineer the February 1948 coup that ended competitive politics for four decades."),
        ("communist", "The National Front single list", "1948-1986", 1948, 1989,
         "From 1948 voters were offered one National Front list with no opposition candidate and no real choice, approved every time with turnout and a yes vote both reported above 90%. Seat totals moved only because the house itself changed size, in 1954 and again at the 1968 federalization. These are the ritual elections a one-party state held to claim a mandate it did not need a vote to keep."),
        ("federal", "The federal elections that ended the federation", "1990-1992", 1990, 1995,
         "The two free federal elections of the post-Communist era, held for the last time as one Czechoslovak state. Civic Forum and its Slovak counterpart Public Against Violence swept 1990 on the strength of the Velvet Revolution; by 1992 both had splintered, and the federal parliament elected that June could not agree on a shared constitution, so a bill in the National Council dissolved Czechoslovakia into the Czech Republic and Slovakia effective 1 January 1993."),
        ("czech", "The Czech Republic", "1996-", 1996, 2100,
         "The Chamber of Deputies is the direct successor of the Czech National Council, the republic-level house that sat inside the federation from 1969 and was simply renamed at independence rather than re-founded; its own elections from 1968 to 1992 are not part of this series; the first Chamber of Deputies vote under the new constitution was 1996. Six governing coalitions later, the 2021 SPOLU-plus-Pirates and Mayors government lost to a resurgent ANO in October 2025."),
    ],
    "pres": [
        ("first", "The First Republic presidency", "1918-1946", 1900, 1947,
         "The president was chosen by the National Assembly sitting as one body, not by the public. Tomáš Garrigue Masaryk was elected by acclamation with no vote in 1918, then won three genuinely contested Assembly ballots against real rivals; Edvard Beneš succeeded him in 1935 over a right-wing challenger. Beneš resigned under German pressure weeks after the 1938 Munich Agreement; his unopposed 1946 re-election, after wartime exile, was the last free presidency before the Communist coup two years later."),
        ("communist", "The communist presidency", "1948-1985", 1948, 1988,
         "Nine Assembly votes over thirty-seven years, every one of them for a single nominee the National Front had already settled on. Only in 1968, the year of the Prague Spring, did the vote itself carry any real drama: Ludvík Svoboda's confirmation drew six recorded abstentions, the only time a communist-era president failed to receive every vote cast."),
        ("transition", "The transition", "1989-1992", 1989, 1993,
         "Václav Havel, the dissident playwright, was elected by the Federal Assembly on 29 December 1989, three weeks after the Velvet Revolution, as its only candidate; he was re-elected the same way in July 1990. His bid for a third term collapsed in 1992 when he could not win enough Slovak votes in the Assembly, and no successor was chosen before Czechoslovakia itself dissolved that December."),
        ("direct", "The direct presidency", "2013-", 2013, 2100,
         "The Czech Republic elected its president directly for the first time in January 2013, after two decades in which parliament had chosen the office indirectly (elections not covered in this record). All three direct elections have gone to a run-off between the top two first-round finishers: Miloš Zeman twice, then the retired general Petr Pavel in 2023."),
    ],
}

COLORS = {
    # Communists, every era.
    "Communist Party of Czechoslovakia": "#A6192E",
    "Communist Party of Bohemia and Moravia": "#A6192E",
    "Communist Party of Slovakia": "#A6192E",
    # Social democrats.
    "Czechoslovak Social Democratic Workers' Party": "#EE7203",
    "Czechoslovak Social Democracy": "#EE7203",
    "Czech Social Democratic Party": "#EE7203",
    # Christian democrats / agrarians.
    "Czechoslovak People's Party": "#F5A623",
    "KDU-ČSL": "#F5A623",
    "Republican Party of Farmers and Peasants": "#4C8C2B",
    "Republican Party of the Czechoslovak Countryside": "#4C8C2B",
    # National / liberal.
    "Czechoslovak National Democracy": "#1B3A6B",
    "Czechoslovak Socialist Party": "#5EB3E4",
    "Czechoslovak National Social Party": "#5EB3E4",
    "Czech National Social Party": "#5EB3E4",
    # German parties of the First Republic.
    "German Social Democratic Workers' Party": "#B35A00",
    "German Christian Social People's Party": "#8C6239",
    "German National Party": "#4A4A4A",
    "German National Socialist Workers' Party": "#3B3B3B",
    # 1989-1992 transition movements.
    "Civic Forum": "#0057A0",
    "Public Against Violence": "#1FA087",
    "Slovak National Party": "#0B5D30",
    "Hlinka's Slovak People's Party": "#7A5C1E",
    # Post-1993 Czech party system.
    "Civic Democratic Party": "#08428C",
    "Civic Democratic Alliance": "#3E6FB0",
    "Green Party": "#4CA82D",
    "TOP 09": "#6E2585",
    "ANO 2011": "#0072BC",
    "ANO": "#0072BC",
    "Czech Pirate Party": "#1A1A1A",
    "Freedom and Direct Democracy": "#0B2E4F",
    "Freedom Union": "#5EB3E4",
    "Democratic Union": "#5EB3E4",
    "SPR-RSČ": "#5C1A1A",
    "SPR–RSČ": "#5C1A1A",
}

INTRO = {
    "leg": "Every Czechoslovak and Czech legislative election on record here, newest first: the National Assembly of the First Republic and the postwar coalition, the National Front's single list, the two free federal votes that ended the union, and the Chamber of Deputies of the Czech Republic since 1996. The Czech National Council, the republic-level house inside the federation from 1968, became the Chamber of Deputies at independence and is not part of this series; Slovakia's own National Council record is on the Slovak hub.",
    "pres": "Every Czechoslovak and Czech presidential vote on record here, newest first: an Assembly-elected presidency under the First Republic and under Communist rule, the Velvet Revolution's Havel, and a directly elected presidency from 2013. The indirect Czech presidential elections parliament held from 1993 to 2008, before the office went direct, are not in the source used for this hub and so are not shown.",
}

ERA_FREEDOM = {
    ("cz", "leg", "first"): "partial",
    ("cz", "leg", "communist"): "unfree",
    ("cz", "pres", "first"): "partial",
    ("cz", "pres", "communist"): "unfree",
}
ERA_CAVEAT = {
    ("cz", "leg", "first"): "Elections were not held in every district (Ruthenia's vote was delayed to 1924, and parts of the Hlučín and Těšín regions were left unfilled in 1920), which is a franchise gap in the map rather than a rigged field.",
    ("cz", "pres", "first"): "The president was chosen by the National Assembly sitting as one body, not by a direct popular vote.",
}
FREEDOM_OVERRIDE = {
    # Presidential rows only ("pres-" prefixed), never the bare year: 1946 is
    # both a genuinely contested legislative election (the last before the
    # coup) and an unopposed presidential one held by the same Assembly a
    # month later, and they do not carry the same caveat. 1918 and 1968 have
    # no legislative contest sharing their id (1918 predates the first
    # legislative vote, 1968's "legislative" article was excluded outright
    # in wave5.py as the Czech National Council, not a federal election), so
    # only the presidential entry is needed for them, but "pres-" is used
    # throughout for consistency and to guard against a future id collision.
    ("cz", "pres-1918"): ("unfree", "Tomáš Garrigue Masaryk was elected by acclamation with no vote taken, as the only candidate for the new republic's first presidency."),
    ("cz", "pres-1946"): ("unfree", "Edvard Beneš was the only candidate and received all 298 votes cast in the National Assembly."),
    ("cz", "pres-1968"): ("unfree", "Ludvík Svoboda was the sole nominee; the only departure from a unanimous communist-era vote was six recorded abstentions rather than a rival candidate."),
    ("cz", "pres-1992"): (None, "Havel ran unopposed but failed to win enough Slovak MPs' votes in the Federal Assembly; no successor was chosen before Czechoslovakia dissolved that December."),
}

HUB = dict(
    shape="combined", name="Czech Republic", adj="Czech", flag="cz", capital=("prague", "Prague"),
    title="Czech and Czechoslovak Elections",
    legNoun="Czechoslovak or Czech Legislative Election", presNoun="Czechoslovak or Czech Presidential Election",
    chamber="the Chamber of Deputies", role="Prime Minister", roleShort="PM",
    presRole="President", presFirst=False, runoffSummary=True,
    legHeadline="Legislative elections",
    desc="Czechoslovakia's legislative and presidential record from the First Republic's founding vote in 1920 through the National Front's one-list rituals and the two federal elections that ended the union, carried here as the Czech Republic's direct predecessor; the Czech Chamber of Deputies continues the series from 1996 and the presidency has been directly elected since 2013. Slovakia's own record, National Council and presidency alike, is on the Slovak hub.",
    sources=["Wikipedia: Czechoslovak and Czech legislative and presidential election articles 1918-2025",
             "Statistical Office / Databáze poslanců figures as reported there"],
    tiles=[("Chamber seats", "200", "101 for a majority; 150 in the 1990-92 federal votes"),
           ("Elections since 1920", None, None),
           ("October 2025", "ANO", "80 of 200 seats, largest party")],
    how=[("One legislative line, two states",
          "The National Assembly of the First Republic, the National Front's single list, and the federal parliament that split Czechoslovakia in two all sit in the same series as the Czech Chamber of Deputies, because the Chamber is their direct institutional descendant. The Czech National Council, the separate republic-level house inside the federation from 1968, is not part of it; it was renamed the Chamber of Deputies at independence in 1993, which is where this page's own chamber begins in substance if not in name."),
         ("A presidency that only went direct in 2013",
          "From Masaryk's 1918 acclamation to Havel's second term in 1990, the presidency was chosen by parliament, not by voters, and for most of the Communist decades by a single unopposed nominee. The Czech Republic's own parliament kept choosing the president indirectly until 2012; the source used for this hub only covers the elections held since the office went direct, so 1993 to 2008 are a stated gap, not an oversight."),
         ("The National Front's one list",
          "From 1948 to 1986 every seat went to the National Front, a single slate the Communist Party controlled, put to voters as a single yes-or-no choice with no rival slate on the ballot. Turnout and the approval share were both reported above 90% at every one of these votes, the signature of a ritual rather than a contest."),
         ("1992 split the state, not just the government",
          "The federal election of June 1992 produced no majority for a shared constitution; Havel's own bid for a third term failed in the Assembly the following month for lack of Slovak support, and by the end of the year the federal parliament had voted itself out of existence. The next legislative and presidential elections on this page are Czech ones, run by a state that did not exist when the decade began.")],
    charts=[("Turnout", "Above 90% at every National Front ritual and at the 1946 and 1990 free votes; down to the high fifties and sixties at Czech elections since 2010, a genuinely competitive multiparty system with genuinely lower participation."),
            ("The largest party's seat share", "A single list took all 200 or so seats under communist rule by definition. Since 1996 the largest Czech party has typically held well under half the Chamber, coalition government rather than majority rule.")],
    links=[("/countries/czech-republic", "Czechia"), ("/elections/sk", "Slovak Elections"),
           ("/elections/at", "Austrian Elections"), ("/elections/hu", "Hungarian Parliamentary Elections")],
    records=[
        ("Largest legislative majority", "128 of 200 seats", "1968", "The Communist Party of Czechoslovakia's share of the National Front list under one-party rule."),
        ("Closest Czech election", "80 vs. 71 seats", "2025", "ANO 2011's return to power over the outgoing SPOLU-led coalition."),
    ],
    colorRules=[
        (r"Communist", "#A6192E"),
        (r"Social Democra", "#EE7203"),
        (r"KDU|People's Party|Christian", "#F5A623"),
        (r"Pirate", "#1A1A1A"),
        (r"SPOLU|Spolu", "#08428C"),
        (r"Republican Party|Agrarian", "#4C8C2B"),
        (r"German", "#8C6239"),
    ],
)
