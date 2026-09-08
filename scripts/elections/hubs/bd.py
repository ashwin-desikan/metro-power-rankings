# -*- coding: utf-8 -*-
"""Bangladesh: Jatiya Sangsad general elections, leg shape.

Thirteen contests from independence to the first election after the July
2024 uprising. The Bengal and East Pakistan provincial-assembly articles in
the dump are colonial and Pakistani-era bodies, not this parliament, and are
excluded on purpose. February and June 1996 are two separate elections held
four months apart and carry the ids "1996-february" and "1996-june".
"""

STATUS = "active"
DISSOLVED = None

ERAS = {
    "leg": [
        ("founding", "The founding parliament", "1973–1975", 1900, 1978,
         "Bangladesh's first election, seven weeks after the Liberation War anniversary, returned Sheikh Mujibur Rahman's Awami League with 293 of 300 seats. The dump's own account calls the count unnecessarily rigged: the government pushed to sweep every seat, and eleven went to AL candidates unopposed. Mujib was assassinated in 1975 and no election followed for four years."),
        ("ershad", "Zia, Ershad, and martial law", "1979–1988", 1979, 1990,
         "Ziaur Rahman's military government organised a vote in 1979 that some opposition parties agreed to contest after partial concessions; Zia was assassinated in 1981, and Hussain Muhammad Ershad seized power in a 1982 coup. His 1986 election ran under martial law with the BNP boycotting and British observers calling it a tragedy for democracy; his 1988 election was boycotted by nearly every major party and dismissed by a Western diplomat as a mockery of an election."),
        ("caretaker", "The caretaker republic", "1991–2008", 1991, 2013,
         "A 1990 uprising toppled Ershad, and the 1991 election that followed was widely called free and fair. The BNP's landslide re-election in February 1996 on a 21% turnout, boycotted by the opposition, triggered strikes that forced a constitutional amendment installing a neutral caretaker government to run elections; the fresh vote it produced in June 1996 was credible, and so were 2001 and 2008. Power alternated between the Awami League and the BNP at every one of these five contests."),
        ("dominance", "One-party dominance", "2014–2024", 2014, 2025,
         "Parliament abolished the caretaker system in 2011. Without it, the Awami League won three elections in a row that international observers and the US State Department repeatedly called neither free nor fair: a 2014 vote the BNP boycotted outright, leaving 153 of 300 seats uncontested; a 2018 vote nicknamed the midnight election after reports of ballot boxes stuffed before polls opened; and a 2024 vote the BNP again boycotted, which The Economist said left Bangladesh effectively a one-party state."),
        ("uprising", "After the uprising", "2026–", 2026, 9999,
         "A student-led uprising in July 2024 forced Sheikh Hasina to flee the country after fifteen years in power, and an interim government under Muhammad Yunus governed until the first election since: 12 February 2026, held alongside a referendum on the July Charter, with the Awami League itself barred from taking part. The Bangladesh Nationalist Party won a landslide."),
    ],
}

COLORS = {
    "Awami League": "#006A4D", "Bangladesh Awami League": "#006A4D",
    "Bangladesh Nationalist Party": "#EE1B24",
    "Jatiya Party": "#F2A900", "Jatiya Party (Ershad)": "#F2A900",
    "Jatiya Party (Manju)": "#D6940A", "Jatiya Party (Siraj)": "#D6940A",
    "Bangladesh Jamaat-e-Islami": "#0C4A2E",
    "Combined Opposition Party": "#5B7FA6",
    "National Citizen Party": "#1D4ED8",
    "Workers Party of Bangladesh": "#C8102E",
    "Communist Party of Bangladesh": "#8B0000",
    "Jatiya Samajtantrik Dal": "#C2410C",
    "Jatiya Samajtantrik Dal (Rab)": "#C2410C",
    "Jatiya Samajtantrik Dal (Siraj)": "#B8460A",
    "Jatiya Samajtantrik Dal (Inu)": "#9A3B08",
    "Bangladesh Islami Front": "#166534",
    "Islami Oikya Jote": "#15803D",
    "Bangladesh Khilafat Andolan": "#065F46",
    "Bangladesh Khelafat Majlis": "#047857",
    "Zaker Party": "#F97316",
    "Bangladesh Muslim League": "#0E7490",
    "Ganatantri Party": "#78716C",
    "Gono Odhikar Parishad": "#7C3AED",
    "Ganosanhati Andolan": "#7C2D12",
    "National Awami Party (Muzaffar)": "#991B1B",
    "National Awami Party (Bhashani)": "#B91C1C",
    "Bangladesh Freedom Party": "#64748B",
    "Bangladesh Krishak Sramik Awami League": "#A16207",
    "Independent": "#9ca3af", "Independents": "#9ca3af",
    "AL": "#006A4D", "BNP": "#EE1B24", "JP(E)": "#F2A900", "Jamaat": "#0C4A2E",
    "NCP": "#1D4ED8",
}

INTRO = {
    "leg": "Every Jatiya Sangsad general election since independence, newest first, era by era. Two of them, boycotted, land 300 seats a landslide on their own; 1988, 2014, 2018 and 2024 carry a caveat saying so in the article's own terms.",
}

ERA_FREEDOM = {
    ("bd", "leg", "founding"): None,
    ("bd", "leg", "ershad"): None,
    ("bd", "leg", "caretaker"): None,
    ("bd", "leg", "dominance"): None,
}
ERA_CAVEAT = {
}
FREEDOM_OVERRIDE = {
    ("bd", "1973"): ("partial",
        "The Awami League government pushed to sweep every seat; the count is described as unnecessarily rigged, and eleven constituencies went to AL candidates unopposed."),
    ("bd", "1979"): ("partial",
        "Organised by Ziaur Rahman's military government under martial law; only some opposition parties agreed to take part after concessions fell short of their demands."),
    ("bd", "1986"): ("partial",
        "Held under Ershad's martial law with the BNP boycotting; a British observer team that included a former minister and a BBC journalist called it a tragedy for democracy and a cynically frustrated exercise."),
    ("bd", "1988"): ("unfree",
        "Nearly every major party, including the Awami League, the BNP, Jamaat-e-Islami and the Communists, boycotted; a Western diplomat at the time called it a mockery of an election."),
    ("bd", "1996-february"): ("unfree",
        "The three main opposition parties boycotted, turnout was 21%, the lowest in Bangladesh's history, and most seats went uncontested; the government it produced lasted twelve days."),
    ("bd", "2014"): ("unfree",
        "Almost all opposition parties boycotted after a crackdown that put Khaleda Zia under house arrest, leaving 153 of 300 seats uncontested; the source states the election was not free and fair."),
    ("bd", "2018"): ("unfree",
        "Widely described by observers as unfair, with reports of ballot boxes already stuffed before polling stations opened, which is why it is known as the midnight election."),
    ("bd", "2024"): ("unfree",
        "The BNP boycotted after a crackdown on its leaders; the US State Department said the vote was not free and fair, and the UK government said it lacked the preconditions of democracy."),
}

HUB = dict(
    shape="leg",
    name="Bangladesh", adj="Bangladeshi", flag="bd", capital=("dhaka", "Dhaka"),
    title="Bangladeshi General Elections",
    legNoun="Bangladeshi General Election",
    chamber="the Jatiya Sangsad",
    role="Prime Minister", roleShort="PM",
    locale="en-GB",
    chartFrom=None,
    desc="Every Jatiya Sangsad general election from independence in 1973 to the first vote after the July 2024 uprising: the rigged founding landslide, Ershad's martial-law ballots, the caretaker-government era that gave Bangladesh five credible elections in a row, and the decade after the caretaker system was abolished in which three straight elections were boycotted, uncontested, or both.",
    sources=["Wikipedia: Bangladeshi general election articles 1973-2026 (results tables and infoboxes)",
             "Bangladesh Election Commission figures as reported there"],
    tiles=[("Jatiya Sangsad seats", "350", "300 directly elected, 50 reserved for women"),
           ("Elections since 1973", None, None),
           ("Feb 1996 turnout", "20.97%", "the lowest on record, in a boycotted vote")],
    how=[("300 seats by plurality, one round",
          "Members are elected one per constituency by first-past-the-post voting, no runoff. A further block, 15 seats at independence and 50 today, is reserved for women and shared out among the parties in proportion to the general seats they won, so the reserved bench amplifies whoever came first."),
         ("The caretaker interlude, 1996 to 2011",
          "After the boycotted February 1996 vote, parliament amended the constitution to hand power to a neutral caretaker government for ninety days around every election. It produced five elections in a row that observers called credible before being abolished in 2011, which is the single biggest break on this page."),
         ("The boycott cycle since 2014",
          "Without a caretaker government to hand power to, the party in office has organised its own re-election three times running, and the opposition has answered twice by sitting the vote out entirely: 153 of 300 seats went uncontested in 2014, and the BNP boycotted again in 2024."),
         ("A field still resetting in 2026",
          "The July 2024 uprising forced Sheikh Hasina from power and the Awami League was barred from the 2026 election that followed, so the party that had won every election since 2008 is not on this page's most recent row at all.")],
    charts=[("Turnout", "From 87.13% in 2008, the highest on record, down to 20.97% in the boycotted February 1996 vote, the lowest. The 2014 and 2024 rows sit near the bottom for the same reason: an opposition boycott, not apathy."),
            ("The largest party's share", "Reads as two different countries: a governing party topping 68% to 75% of the vote whenever the main opposition sat out (1988, 2014, 2018, 2024), against contests in the thirties and forties whenever both sides actually competed.")],
    links=[("/countries/bangladesh", "Bangladesh"), ("/elections/pk", "Pakistani Elections"),
           ("/elections/in", "Indian General Elections"), ("/elections/id", "Indonesian Elections")],
    records=[
        ("Largest seat share", "300 of 350", "2018", "The Awami League's count in what observers called the midnight election, after reports of ballots stuffed before polls opened."),
        ("Lowest turnout", "20.97%", "1996-february", "The three main opposition parties boycotted; the government the vote produced lasted twelve days."),
        ("Highest turnout", "87.13%", "2008", "The last caretaker-government election, and the highest turnout Bangladesh has recorded."),
        ("Most seats uncontested", "153 of 300", "2014", "Handed to the Awami League and its allies by default after nearly every opposition party boycotted."),
    ],
    colorRules=[
        (r"Jatiya Samajtantrik Dal", "#C2410C"),
        (r"National Awami Party", "#991B1B"),
        (r"Jamaat", "#0C4A2E"),
        (r"Muslim League", "#0E7490"),
        (r"Khilafat|Khelafat", "#065F46"),
        (r"Communist|Sarbahara|Samyabadi", "#8B0000"),
        (r"Workers Party", "#C8102E"),
        (r"Islami|Islamic", "#15803D"),
        (r"Awami League", "#006A4D"),
        (r"Nationalist", "#EE1B24"),
        (r"Jatiya Party|Jatiyo", "#F2A900"),
    ],
)
