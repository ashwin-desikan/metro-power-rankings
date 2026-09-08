# -*- coding: utf-8 -*-
"""Morocco: House of Representatives general elections, leg shape.

Eleven contests, 1963 to 2021; the 2026 general election, set for 23
September 2026, has no result yet and is left out of the series entirely.
Morocco is a constitutional monarchy: the King appoints the prime minister,
by convention from the party that leads the House, so there is no
presidential series. 1963's article also carries the indirectly chosen House
of Councillors, which is out of this series; a new 1970 constitution then
split the House of Representatives itself between a directly elected
majority and a minority chosen indirectly, by communal councillors and by
professional colleges (agriculture, commerce and industry, artisans and
trade unions), a design phased out by the fully direct 1997 election. 1970
and 1977's results tables give seats by tier but no vote counts at all, so
those two rows carry no votes or vote share, not a wrong number.
"""

STATUS = "active"
DISSOLVED = None

ERAS = {
    "leg": [
        ("founding", "The founding vote, and its interruption", "1963", 1900, 1969,
         "Morocco's first House of Representatives was elected in 1963 under the newly independent kingdom's first constitution, three-quarters of it by direct vote and the rest by an indirectly chosen House of Councillors. King Hassan II dissolved parliament in 1965 and ruled by decree for five years before a new constitution brought the next election in 1970."),
        ("indirect", "A house shared with the colleges", "1970-1993", 1970, 1996,
         "A new constitution adopted by referendum in July 1970 gave the House of Representatives a directly elected majority and an indirect minority chosen by communal councillors and by professional colleges representing agriculture, commerce, artisans and trade unions. Istiqlal and the Union of Popular Forces fared poorly under it for two decades before the 1993 election, held after another new constitution, finally split seats close to evenly among several parties."),
        ("alternance", "A fully elected house again", "1997-2002", 1997, 2006,
         "The 1997 House was the first since 1963 filled entirely by direct vote, and the Socialist Union of Popular Forces topped it, with Abderrahmane Youssoufi becoming prime minister. The Justice and Development Party won its first seats in 2002, entering third with 42, a result the source calls strong gains for an Islamist party even as USFP's outgoing government kept its plurality."),
        ("pjd_rise", "The PJD's rise, and 2011's reform", "2007-2011", 2007, 2015,
         "PJD topped the vote in 2007 but Istiqlal still formed the government on more seats; a BBC correspondent at the time accused the government of redrawing constituencies to keep PJD from winning outright. The 2011 constitution, adopted after protests during the Arab Spring, required the king to appoint his prime minister from the party that had actually won the most votes, and Abdelilah Benkirane's PJD victory that November was the first test of the new rule."),
        ("pjd_govt", "Two PJD governments", "2016-2021", 2016, 2100,
         "PJD topped the poll again in 2016, but a coalition deadlock between Benkirane and RNI's Aziz Akhannouch left Morocco without a government for months; the king dismissed Benkirane in March 2017 and installed his own party colleague Saadeddine Othmani, whose cabinet was not sworn in until 5 April. Five years later PJD's seat count collapsed from 125 to 13 as Akhannouch's RNI took first place in 2021, the sharpest reversal in the series."),
    ],
}

COLORS = {
    "Istiqlal Party": "#DA251D", "Istiqlal": "#DA251D",
    "Socialist Union of Popular Forces": "#F97316", "USFP": "#F97316",
    "National Union of Popular Forces": "#F97316", "UNFP": "#F97316",
    "National Rally of Independents": "#0033A0", "RNI": "#0033A0",
    "Popular Movement": "#059669", "MP": "#059669",
    "National Popular Movement": "#65A30D", "MNP": "#65A30D",
    "Constitutional Union": "#7C3AED", "UC": "#7C3AED",
    "Justice and Development Party": "#1F3864", "PJD": "#1F3864",
    "Authenticity and Modernity Party": "#B45309", "PAM": "#B45309",
    "Party of Progress and Socialism": "#B91C1C", "PPS": "#B91C1C",
    "Moroccan Communist Party": "#B91C1C",
    "National Democratic Party": "#CA8A04", "PND": "#CA8A04",
    "Democratic Independence Party": "#0891B2", "PDI": "#0891B2",
    "Front for the Defence of Constitutional Institutions": "#78716C", "FDIC": "#78716C",
    "Democratic and Social Movement": "#DB2777", "MDS": "#DB2777",
    "Front of Democratic Forces": "#4D7C0F", "FFD": "#4D7C0F",
    "Federation of the Democratic Left": "#4D7C0F",
    "Organisation for Democratic and Popular Action": "#57534E", "ODPA": "#57534E",
    "Action Party": "#9333EA",
    "Constitutional and Democratic Popular Movement": "#0D9488", "MPDC": "#0D9488",
    "Independent": "#9ca3af", "Independents": "#9ca3af",
}

INTRO = {
    "leg": "Every House of Representatives election since Morocco's first in 1963, newest first. The 1970-1993 rows carry a caveat for the seats chosen by communal councillors and professional colleges rather than direct vote; 1970 and 1977 give no vote count at all, only seats, because the source states none.",
}

ERA_FREEDOM = {
    ("ma", "leg", "founding"): "partial",
    ("ma", "leg", "indirect"): "partial",
    ("ma", "leg", "alternance"): None,
    ("ma", "leg", "pjd_rise"): None,
    ("ma", "leg", "pjd_govt"): None,
}
ERA_CAVEAT = {
    ("ma", "leg", "founding"): "A quarter of the House sat alongside an entirely indirectly elected House of Councillors, and the king dissolved parliament and ruled by decree for five years afterward.",
    ("ma", "leg", "indirect"): "Only a majority of seats were filled by direct vote; the rest went to communal councillors and professional colleges rather than to the electorate.",
}

HUB = dict(
    shape="leg",
    name="Morocco", adj="Moroccan", flag="ma", capital=("rabat", "Rabat"),
    title="Moroccan General Elections",
    legNoun="Moroccan General Election",
    chamber="the House of Representatives",
    role="Prime Minister", roleShort="PM",
    locale="en-GB",
    chartFrom=None,
    desc="Every House of Representatives election in Morocco from 1963 to 2021, newest first. A minority of seats went to communal councillors and professional colleges rather than direct vote through 1993; the king has appointed his prime minister from the party that won the most votes since the 2011 constitution, most recently Aziz Akhannouch's National Rally of Independents in 2021. The 2026 general election is set for 23 September 2026.",
    sources=["Wikipedia: Moroccan general election articles 1963-2021 (results tables and infoboxes)",
             "Ministry of the Interior figures as reported there"],
    tiles=[("House seats", "395", "305 local, 90 on regional lists since 2021"),
           ("Elections since 1963", None, None),
           ("2021 turnout", "50.35%", "RNI's Aziz Akhannouch took the premiership")],
    how=[("A house shared with the colleges, 1970-1993",
          "For six elections a majority of seats went to direct vote and the rest to communal councillors and professional colleges representing agriculture, commerce, artisans and trade unions, an arrangement dropped for the fully direct 1997 election."),
         ("A national list alongside the local vote",
          "Since 2002 a proportional national list has topped up the larger, directly elected local tier; by 2011 two thirds of its 90 seats were reserved for women and the rest for men under 40. A 2021 law replaced the national list with twelve regional lists and removed the vote-share threshold that had stood at 6% locally and 3% nationally."),
         ("The king appoints from the largest party",
          "The 2011 constitution, adopted after Arab Spring protests, requires the king to name his prime minister from the party that won the most votes, ending the palace's freer hand in choosing governments before then."),
         ("A landslide reversal in 2021",
          "PJD's seat count fell from 125 to 13 between 2016 and 2021 as RNI, PAM and Istiqlal took the top three places, the sharpest single swing in the series.")],
    charts=[("Turnout", "From a high of 82.36% in 1977 to a low of 37.00% in 2007, before recovering to 50.35% in the most recent, 2021 election."),
            ("The largest party's vote share", "PJD's 27.14% in 2016 is the highest on record where a vote share was recorded at all; 1970 and 1977 print no vote share for any party, only seats.")],
    links=[("/countries/morocco", "Morocco"), ("/elections/eg", "Egyptian Elections"),
           ("/elections/et", "Ethiopian Elections")],
    records=[
        ("Highest turnout", "82.36%", "1977", "The highest turnout on record for a Moroccan general election."),
        ("Lowest turnout", "37.00%", "2007", "PJD topped the vote that year but Istiqlal still formed the government on more seats."),
        ("Largest single-party mandate", "125 of 395 seats", "2016", "PJD's second consecutive first-place finish, before its 2021 collapse to 13 seats."),
        ("Sharpest reversal", "125 seats to 13", "2021", "PJD's seat count fell by 112 between 2016 and 2021 as RNI took first place."),
    ],
    colorRules=[
        (r"Istiqlal", "#DA251D"),
        (r"Socialist Union|National Union of Popular Forces|USFP|UNFP", "#F97316"),
        (r"National Rally of Independents|\bRNI\b", "#0033A0"),
        (r"National Popular Movement|\bMNP\b", "#65A30D"),
        (r"Popular Movement|\bMP\b", "#059669"),
        (r"Constitutional Union|\bUC\b", "#7C3AED"),
        (r"Justice and Development|\bPJD\b", "#1F3864"),
        (r"Authenticity and Modernity|\bPAM\b", "#B45309"),
        (r"Progress and Socialism|Communist|\bPPS\b", "#B91C1C"),
        (r"Independent", "#9ca3af"),
    ],
)
