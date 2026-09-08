# -*- coding: utf-8 -*-
"""Thailand: House of Representatives general elections, leg shape.

Twenty-eight contests, Siam's first election in 1933 to Thailand's 2026
vote. 1933-1946 filled half the House by direct vote and half by royal or
government appointment, a transitional arrangement from the 1932
constitution; the post-1947 elections kept a shrinking appointed share
through 1957. Six military coups (1947, 1957, 1976, 1991, 2006, 2014) each
interrupt the series, with 2006 annulled by the Constitutional Court after
an opposition boycott and 2014 voided outright before a single seat was
counted. February and December 1957 are two separate elections held ten
months apart, as are March and September 1992; they carry the ids
"1957-february"/"1957-december" and "1992-march"/"1992-september". The 2026
constitutional referendum, held the same day as that election, is out of
this series entirely.
"""

STATUS = "active"
DISSOLVED = None

ERAS = {
    "leg": [
        ("first", "The 1932 experiment", "1933-1946", 1900, 1947,
         "Siam's 1932 revolution replaced absolute monarchy with a constitution, and the first House of Representatives split its seats exactly down the middle: half chosen by voters, half appointed by the government, meant as a bridge to full representative rule. It held for four elections, 1933 to 1946, while the country renamed itself Thailand along the way."),
        ("coup1947", "Coup, and half-appointed houses", "1948-1957", 1948, 1958,
         "A 1947 coup abolished the parliament elected the year before and installed a new bicameral system, still with a large appointed bloc alongside the elected seats. Turnout in the February 1957 election jumped to 57%, which the source itself calls an indicator of heavy fraud, and Sarit Thanarat's own coup that September forced a rerun that December, the last vote before twelve years without an election."),
        ("interlude", "The generals' interlude", "1969", 1959, 1974,
         "Sarit and then Thanom Kittikachorn governed without a parliament for twelve years. When an election finally returned in 1969, it was the first in which every seat was elected rather than appointed, though 72 of 219 went to independents; the House was dissolved again within two years and Thailand went another six years without a vote."),
        ("brief", "A crowded field, twice", "1975-1976", 1975, 1978,
         "Elections in January 1975 and again in April 1976, after the House was dissolved early, both returned fractured parliaments of a dozen or more parties and short-lived coalitions. A coup in October 1976 shut elections down again, this time for three years."),
        ("prem", "The Prem years", "1979-1988", 1979, 1990,
         "Prem Tinsulanonda governed as an unelected prime minister through elections in 1979, 1983 and 1986 before Chatichai Choonhavan became the first elected prime minister in over a decade in 1988. A coup by the National Peace Keeping Council removed him in February 1991."),
        ("black_may", "Black May, and its rerun", "1991-2000", 1991, 2000,
         "The March 1992 election handed power to Suchinda Kraprayoon, the coup leader turned unelected prime minister, and his appointment triggered the Black May protests that forced his resignation within weeks. A caretaker government called a fresh election that September, and two more followed in 1995 and 1996 as coalitions rose and fell within a few years of each other."),
        ("thaksin", "Thaksin, and a coup", "2001-2006", 2001, 2006,
         "The 1997 constitution gave Thailand its first 500-seat House with party-list seats alongside constituency ones. Thaksin Shinawatra's Thai Rak Thai won comfortably in 2001 and by landslide in 2005, then won a boycotted, nearly single-party rerun in 2006 that the Constitutional Court annulled months later, shortly before a September coup removed him from power outright."),
        ("post2006", "Two constitutions, two coups", "2007-2014", 2007, 2018,
         "A junta-drafted constitution produced the 2007 election, won by a party aligned with the ousted Thaksin, and his sister Yingluck Shinawatra won again in 2011. Her snap election for February 2014 was blocked by opposition protesters occupying polling stations in parts of the country, voided by the Constitutional Court for not being held on a single nationwide day, and never rerun: a May 2014 coup ended the attempt."),
        ("junta2019", "The junta's constitution", "2019-", 2019, 9999,
         "The 2017 constitution, drafted under the military government that took power in 2014, let an entirely junta-appointed Senate join the House in choosing the prime minister, and did so in both 2019 and 2023 regardless of which party had actually won the most seats or votes. That provision expired before the 2026 election, the first since 2011 whose result determined the government on its own."),
    ],
}

COLORS = {
    "Democrat Party": "#2E9DD1", "Democrat": "#2E9DD1",
    "Thai Rak Thai": "#DA251D", "Thai Rak Thai Party": "#DA251D",
    "Pheu Thai Party": "#EC1C24", "Pheu Thai": "#EC1C24",
    "People's Power": "#B91C1C", "People's Power Party": "#B91C1C",
    "Palang Pracharath Party": "#1F3864", "Palang Pracharat Party": "#1F3864",
    "Bhumjaithai Party": "#0033A0",
    "Move Forward Party": "#F97316", "Future Forward Party": "#F97316",
    "People's Party": "#F97316",
    "United Thai Nation Party": "#7C2D12",
    "Chart Thai": "#9333EA", "Thai Nation Party": "#9333EA", "Chartthaipattana Party": "#9333EA",
    "New Aspiration Party": "#0D9488",
    "Social Action Party": "#65A30D",
    "Palang Dharma Party": "#16A34A",
    "Justice Unity Party": "#B45309",
    "National Development Party": "#CA8A04",
    "Prachachat Party": "#059669",
    "Thai Liberal Party": "#0891B2",
    "Thai Sang Thai Party": "#DB2777",
    "Seri Manangkhasila Party": "#78716C",
    "Sahaphum Party": "#78716C",
    "United Thai People's Party": "#57534E",
    "Mass Party": "#A16207",
    "Thai Citizen Party": "#4D7C0F",
    "New Force Party": "#7C2D12",
    "Independents": "#9ca3af", "Independent": "#9ca3af", "Independent Party": "#9ca3af",
    "Royal appointees": "#6b7280", "Appointed members": "#6b7280",
    "None of the above": "#d1d5db",
}

INTRO = {
    "leg": "Every Siamese and Thai House of Representatives election since 1933, newest first, era by era. Six coups and two court-annulled results interrupt the count; the 1933-1957 rows carry a caveat where half or more of the House was appointed rather than elected.",
}

ERA_FREEDOM = {
    ("th", "leg", "first"): "partial",
    ("th", "leg", "coup1947"): "partial",
    ("th", "leg", "interlude"): None,
    ("th", "leg", "brief"): None,
    ("th", "leg", "prem"): None,
    ("th", "leg", "black_may"): None,
    ("th", "leg", "thaksin"): None,
    ("th", "leg", "post2006"): None,
    ("th", "leg", "junta2019"): None,
}
ERA_CAVEAT = {
    ("th", "leg", "first"): "Exactly half the House was appointed by the government rather than put to a vote.",
    ("th", "leg", "coup1947"): "Roughly half the House was still appointed rather than elected, a holdover from the 1932 constitution's transitional design.",
}
FREEDOM_OVERRIDE = {
    ("th", "1957-february"): ("partial",
        "Turnout of 57%, far above any earlier election, is described by the source as an indicator of heavy fraud, and 123 of the 283 seats still went to appointees rather than a vote."),
    ("th", "2006"): ("partial",
        "The main opposition boycotted after a rule requiring even an unopposed candidate to clear 20% of the registered vote, leaving 39 seats vacant, and the Constitutional Court annulled the whole result months later."),
    ("th", "2014"): ("partial",
        "Opposition protesters blocked candidate registration and polling in parts of the south, the Constitutional Court voided the result for not being held on a single nationwide day, and a May coup ended the attempt to rerun it before any seat was filled."),
    ("th", "2019"): ("partial",
        "The 250-seat Senate that would help choose the prime minister was appointed entirely by the outgoing junta and constituency boundaries were redrawn shortly before polling, an arrangement widely described at the time as a skewed race."),
}

HUB = dict(
    shape="leg",
    name="Thailand", adj="Thai", flag="th", capital=("bangkok", "Bangkok"),
    title="Thai General Elections",
    legNoun="Thai General Election",
    chamber="the House of Representatives",
    role="Prime Minister", roleShort="PM",
    locale="en-GB",
    chartFrom=None,
    desc="Every House of Representatives election in Siam and Thailand from 1933 to 2026, newest first. The earliest elections split seats between voters and government appointees; six military coups since 1947 have each interrupted the count, and the courts annulled the results outright in 2006 and 2014. A junta-appointed Senate helped choose the prime minister in 2019 and 2023 regardless of who won the House, a rule that expired only for the 2026 election.",
    sources=["Wikipedia: Siamese and Thai general election articles 1933-2026 (results tables and infoboxes)",
             "Election Commission of Thailand figures as reported there"],
    tiles=[("House seats", "500", "400 by constituency, 100 by party list"),
           ("Elections since 1933", None, None),
           ("2026 turnout", "71.42%", "the first result to settle government on its own")],
    how=[("Appointed seats, 1933 to 1957",
          "The first four elections split the House exactly in half between elected members and government appointees. The post-1947 constitutions kept a shrinking appointed bloc through the 1957 elections, after which every seat has been elected."),
         ("Two ballots, one house",
          "Since the 1997 constitution the House has mixed single-member constituency seats with a nationwide party-list tier, voted on two separate ballots in most years. 2019 was the exception: a single ballot decided both tiers at once, a system dropped again by 2023."),
         ("A junta-appointed Senate chose the prime minister",
          "Under the 2017 constitution's transitional rules, the prime minister was chosen by the full National Assembly, House and Senate together, and every one of the Senate's 250 members had been appointed by the military government. That provision expired before the 2026 election."),
         ("Six coups in a century",
          "The military has removed an elected or newly elected government in 1947, 1957, 1976, 1991, 2006 and 2014, and rewrote the constitution before most of the elections that followed.")],
    charts=[("Turnout", "From lows near 30% in the appointed-seat era of the 1940s to a record 75.64% in 2023, turnout has climbed almost every decade Thailand has voted."),
            ("The largest party's vote share", "Thai Rak Thai's 60% in 2005 sits well above every other contested field on record; Democrat's 17% in the crowded 1975 vote, the lowest, still needed a dozen coalition partners to govern. Several early and post-coup years printed no vote-share column at all, so those rows are missing from the line, not zero.")],
    links=[("/countries/thailand", "Thailand"), ("/elections/my", "Malaysian General Elections"),
           ("/elections/id", "Indonesian Elections")],
    records=[
        ("Highest turnout", "75.64%", "2023", "The record for any Thai election, in the vote Move Forward topped before being blocked from government."),
        ("Lowest turnout", "29.50%", "1948", "Half the House was still government appointees rather than elected members at this point."),
        ("Largest mandate", "377 of 500", "2005", "Thai Rak Thai's landslide re-election, three fifths of the vote, the year before the party was ousted by a boycotted rerun and a coup."),
        ("Won seats, lost the vote", "79 seats on fewer votes", "1992-march", "The Justice Unity Party became the largest party in the House despite receiving fewer votes than the New Aspiration Party."),
    ],
    colorRules=[
        (r"Social", "#65A30D"),
        (r"Thai Nation|Chart Thai|Chartthaipattana", "#9333EA"),
        (r"Liberal", "#0891B2"),
        (r"Economist", "#CA8A04"),
        (r"Nationalist", "#B45309"),
        (r"Independent", "#9ca3af"),
        (r"Appointed|Royal appointee", "#6b7280"),
        (r"Democrat", "#2E9DD1"),
        (r"Pheu Thai|Thai Rak Thai", "#EC1C24"),
        (r"Bhumjaithai", "#0033A0"),
        (r"Palang Pracharat", "#1F3864"),
        (r"Move Forward|Future Forward|People's Party", "#F97316"),
    ],
)
