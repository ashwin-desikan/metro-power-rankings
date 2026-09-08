# -*- coding: utf-8 -*-
"""Vietnam: National Assembly, leg shape. North Vietnam 1946-1975, unified
Vietnam 1976-present, sixteen elections on file.
"""

STATUS = "active"
DISSOLVED = None

ERAS = {
    "leg": [
        ("founding", "The founding assembly", "1946", 1900, 1946,
         "Ho Chi Minh's Democratic Republic of Vietnam held its first National Assembly election on 6 January 1946 in the areas it controlled, and five parties won seats: the Indochinese Communist Party took the most, followed by the Democratic Party, the Socialist Party, the Vietnam Nationalist Party (Việt Nam Quốc Dân Đảng) and the Revolutionary League. The Viet Minh ran the election and the ballot was not secret, and a further seventy seats went to the Nationalist Party and the Revolutionary League by pre-election agreement rather than by vote."),
        ("oneList", "One list, one front", "1960-1987", 1947, 1987,
         "From 1960 the Vietnamese Fatherland Front, the Communist Party's umbrella organisation, was the only body allowed to nominate candidates, and it took every seat at every election, first in North Vietnam alone and then, from the reunification vote of 1976, across the whole country. The 1976 assembly seated 249 members elected in the former North and 243 in the former South under the same single list."),
        ("doiMoi", "Đổi Mới opens a narrow door", "1992-2011", 1988, 2011,
         "Non-party and independent candidates were allowed to stand for the first time in 1992, six years into the Đổi Mới economic reforms, though every candidate still had to be nominated through the Fatherland Front. Independents and non-party members won a few dozen seats a cycle at most, and from 2011 a candidate could nominate themselves rather than be put forward by an organisation, though officials cut the self-nominated field hard before it reached the ballot."),
        ("current", "Self-nomination on a vetted field", "2016-", 2012, 9999,
         "The ballot has counted self-nominated candidates as their own line since 2016, when 11 stood and 2 won; by 2026 only 5 of 864 candidates were self-nominated. The Communist Party has not fallen below 96% of the seats in any of these elections, and the field it faces is set by the Fatherland Front before campaigning ever begins."),
    ],
}

COLORS = {
    "Indochinese Communist Party": "#DA251D",
    "Communist Party of Vietnam": "#DA251D",
    "Workers' Party of Vietnam and other groups": "#DA251D",
    "Vietnamese Fatherland Front": "#B5261C",
    "National Liberation Front–Vietnam Alliance of National, Democratic and Peaceful Forces": "#C2410C",
    "Democratic Party": "#D4AF37",
    "Socialist Party": "#2E7D32",
    "Việt Nam Quốc Dân Đảng": "#1565C0",
    "Revolutionary League": "#6A8CAF",
    "Independents": "#6b7280",
    "Non-party members": "#9ca3af",
    "Independents (organization-nominated)": "#9ca3af",
    "Independents (self-nominated)": "#6b7280",
    "Reserved seats": "#9ca3af",
}

INTRO = {
    "leg": "Every Vietnamese and North Vietnamese National Assembly election from the founding vote of 1946 to the 15 March 2026 election, newest first. From 1960 to 1987 the Vietnamese Fatherland Front was the only body allowed to nominate candidates and took every seat; since 1992 non-party and, from 2011, self-nominated candidates have been allowed to stand on a field the Fatherland Front still vets.",
}

ERA_FREEDOM = {
    ("vn", "leg", "founding"): "partial",
    ("vn", "leg", "oneList"): "unfree",
    ("vn", "leg", "doiMoi"): "partial",
    ("vn", "leg", "current"): "partial",
}
ERA_CAVEAT = {
    ("vn", "leg", "founding"): "The Viet Minh ran the election, the ballot was not secret, and a further seventy seats went to the Vietnam Nationalist Party and the Revolutionary League by pre-election agreement rather than by vote.",
    ("vn", "leg", "oneList"): "The Vietnamese Fatherland Front was the only organisation allowed to nominate candidates, and it took every seat at every election of the period.",
    ("vn", "leg", "doiMoi"): "Every candidate, party member or not, still had to be nominated through the Communist-led Fatherland Front, and non-party and independent candidates never took more than a few dozen of several hundred seats.",
    ("vn", "leg", "current"): "Self-nominated candidates reach the ballot only after the Fatherland Front's own vetting rounds cut their numbers hard, and the Communist Party has kept well over 95% of the seats at every election since.",
}
FREEDOM_OVERRIDE = {
    ("vn", "2011"): ("partial", "82 people applied to run as self-nominated candidates; Fatherland Front officials allowed 15 onto the ballot and 4 were elected, while several pro-democracy figures who were refused approval were later jailed."),
    ("vn", "2026"): ("partial", "Nearly 93% of the 864 candidates for 500 seats were Communist Party members and only 5 were self-nominated; an independent journalist was arrested and beaten by police after criticising the election's legitimacy online."),
}

HUB = dict(
    shape="leg",
    name="Vietnam", adj="Vietnamese", flag="vn", capital=("hanoi", "Hanoi"),
    title="Vietnamese National Assembly Elections",
    legNoun="Vietnamese National Assembly Election",
    chamber="the National Assembly",
    role="Prime Minister", roleShort="PM",
    locale="en-US",
    chartFrom=None,
    desc="Vietnam's National Assembly has held sixteen elections since the first, contested by five parties, met in Hanoi in January 1946. Every one after 1960 ran under the sole umbrella of the Vietnamese Fatherland Front, and for nearly three decades that meant one list taking every seat. Since 1992 non-party and independent candidates have been allowed to stand, and since 2011 to nominate themselves, though the Fatherland Front still vets who actually reaches the ballot and the Communist Party has never won less than 96% of the seats.",
    sources=["Wikipedia: Vietnamese and North Vietnamese National Assembly election articles 1946-2026 (results tables and infoboxes)",
             "Dieter Nohlen, Florian Grotz and Christof Hartmann, Elections in Asia: A data handbook, Volume II (2001), as cited there"],
    tiles=[("Seats", "500", "how many the Assembly now holds"),
           ("Elections since 1946", None, None),
           ("2026 turnout", "99.7%", "last election, 15 March 2026")],
    how=[("One party, one front",
          "The Communist Party of Vietnam is the only party the constitution recognises. Every candidate, whatever their party status, is nominated through the Vietnamese Fatherland Front before appearing on a ballot."),
         ("Independents on a narrow field",
          "Non-party and independent candidates have been allowed to stand since 1992. They have won a few dozen seats a cycle at most, out of several hundred."),
         ("Self-nomination, then a filter",
          "Since 2011 a would-be candidate can put themselves forward rather than be nominated by an organisation, but the Fatherland Front's vetting rounds cut the field hard before it reaches the ballot: 82 applied in 2011 and 15 were allowed to run."),
         ("The Assembly elects the leadership, not the ballot",
          "The National Assembly elects the state president and prime minister after each election. The Communist Party's general secretary, chosen separately by the party congress, holds the actual power regardless of who sits in those seats.")],
    charts=[("Turnout", "Turnout has stayed inside a three-point band since 1960, dipping only to 97.96% in 1981."),
            ("The ruling party's seat share", "The Communist Party and its Fatherland Front predecessors have taken every seat, or all but a handful of them, at every election since 1960.")],
    links=[("/countries/vietnam", "Vietnam"),
           ("/elections/vd", "South Vietnamese Elections")],
    records=[
        ("Highest turnout", "99.9%", "1960", "North Vietnam's first Fatherland Front election under Ho Chi Minh returned the highest turnout on file."),
        ("Lowest turnout", "97.96%", "1981", "The lowest turnout on record for this hub, though still officially above 97 percent, a floor these elections have never fallen below."),
        ("Most self-nominated candidates", "11", "2016", "The 2016 ballot was the first to report self-nominated candidates as their own line: 11 ran, and 2 won seats."),
        ("Self-nomination filtered hardest", "15 of 82", "2011", "82 people applied to stand as self-nominated candidates in 2011. Officials allowed 15 onto the ballot, and 4 of them were elected."),
    ],
    colorRules=[
        (r"Independent", "#6b7280"),
        (r"Non-party", "#9ca3af"),
        (r"Communist", "#DA251D"),
    ],
)
