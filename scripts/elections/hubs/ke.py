# -*- coding: utf-8 -*-
"""Kenya: presidential and National Assembly elections, combined shape.

The dump runs from the colonial Legislative Council (1920) through the 2022
general election. Colonial LegCo elections (1920-1956/57) are summary-only:
the source carries no member-by-member or party-by-party table for them, only
the franchise rules and, from 1956/57, the shape of the result by race. From
1969 the single-party era (1969-1988) has real seat and vote tables even
though only KANU was legally permitted to contest; the presidency in that
period was unopposed and carries no table at all. 1978, 1979 and 1983 are the
first years the dump gives the unopposed presidency its own article; 1969,
1974 and 1988 were also unopposed but the dump has no separate presidential
article for them, so the presidential series begins in 1978. The October 2017
presidential re-run, ordered after the Supreme Court annulled the August
result, is its own row (pres-2017-october) rather than folded into August's.
"""

STATUS = "active"
DISSOLVED = None

ERAS = {
    "leg": [
        ("colonial", "The Legislative Council", "1920-1957", 1900, 1960,
         "Kenya's Legislative Council was filled by a race-based franchise: eleven European seats were elected outright, with a handful of Indian and Arab seats decided on separate rolls, and the majority Black population had no vote at all, only a few members nominated by the Governor. That changed only at the margins in 1956-57, when eight constituencies elected an African member for the first time. None of these elections were contested on party lines that a results table records, so they appear here as dated, uncontested rows rather than tables of names."),
        ("transition", "The transfer of power", "1961-1963", 1961, 1966,
         "The last two colonial elections were genuine multi-party contests fought under a widened, largely non-racial franchise: Jomo Kenyatta's KANU against Ronald Ngala's KADU in 1961, then again in the May 1963 election that carried Kenya to independence in December. KANU has never lost a National Assembly election since."),
        ("oneparty", "The one-party state", "1969-1988", 1967, 1991,
         "The Kenya People's Union was banned in October 1969, leaving KANU the only party on the ballot, and Section 2A of the constitution made that arrangement law in 1982. Within it the seat contests were often real: hundreds of KANU candidates stood for nomination at every election, and dozens of sitting MPs, including ministers, lost their seats each time."),
        ("multiparty", "Multi-party Kenya", "1992-2007", 1992, 2009,
         "Section 2A was repealed in 1991 under pressure from a pro-democracy movement and foreign donors, and KANU held on through a fractured opposition in 1992 and 1997 before Mwai Kibaki's National Rainbow Coalition ended its 39-year rule in 2002. The 2007 election, contested on a genuinely open field, was followed by a disputed presidential count and the worst post-election violence in Kenya's history; the parliamentary result that year is not itself in dispute in the source, only the presidential one."),
        ("devolved", "The 2010 constitution", "2013-", 2010, 2100,
         "The 2013 constitution created the Senate alongside an enlarged National Assembly and devolved counties, so general elections since have elected six offices at once: president, senators, MPs, governors, county women representatives and county assembly members. Uhuru Kenyatta's Jubilee coalition, then William Ruto's Kenya Kwanza, have each organised the National Assembly since, and coalitions rather than single parties now carry most of the chamber."),
    ],
    "pres": [
        ("unopposed", "The unopposed presidency", "1978-1988", 1900, 1991,
         "Under the one-party constitution the president was elected unopposed at every general election from 1969 to 1988: KANU nominated one candidate, no other party could contest, and no vote was held. Jomo Kenyatta held the office until his death in 1978; Daniel arap Moi succeeded him and was returned the same way in 1979 and 1983. These rows carry a date and a name and no figures, because none exist to record."),
        ("multiparty", "Moi, Kibaki and a fractured opposition", "1992-2002", 1992, 2003,
         "Direct multi-party presidential elections began in 1992. Moi won both 1992 and 1997 with well under half the vote against an opposition split among several candidates; Mwai Kibaki's National Rainbow Coalition finally unified that opposition in 2002 and won by a landslide, ending 24 years of KANU presidents."),
        ("crisis", "The 2007 crisis", "2007", 2004, 2009,
         "Kibaki's re-election over Raila Odinga was announced by a divided electoral commission chairman who later said he did not know who had actually won; European Union and United States observers both raised concerns about the count. Odinga rejected the result, and the weeks that followed were the most violent in Kenya's post-independence history. Kofi Annan mediated a power-sharing deal that made Kibaki president and Odinga prime minister rather than settling the count itself."),
        ("devolved", "The 2010 constitution", "2013-", 2010, 2100,
         "The 2010 constitution requires an outright majority plus 25% of the vote in at least 24 of Kenya's 47 counties, with a runoff otherwise; no election since has gone to one. Uhuru Kenyatta beat Raila Odinga in 2013 and again in August 2017, when the Supreme Court annulled the result over irregularities in the transmission of results, an unprecedented step for an African presidential election. Odinga withdrew from the October re-run, and William Ruto beat Odinga in 2022 by 1.6 points."),
    ],
}

COLORS = {
    "Kenya African National Union": "#BE0000", "KANU": "#BE0000",
    "Democratic Party": "#1F4E96", "Democratic Party of Kenya": "#1F4E96",
    "FORD–Kenya": "#0B6E4F", "FORD-Kenya": "#0B6E4F", "FORD-K": "#0B6E4F",
    "FORD–People": "#6A1B9A", "FORD-People": "#6A1B9A",
    "FORD–Asili": "#14807A", "FORD-Asili": "#14807A",
    "National Rainbow Coalition": "#F5821F", "NARC": "#F5821F",
    "National Rainbow Coalition – Kenya": "#C77A2E", "NARC–Kenya": "#C77A2E",
    "Orange Democratic Movement": "#F7941D", "ODM": "#F7941D",
    "Orange Democratic Movement–Kenya": "#B36A17", "ODM–Kenya": "#B36A17",
    "Party of National Unity": "#003087", "PNU": "#003087",
    "The National Alliance": "#8B0000", "TNA": "#8B0000",
    "United Republican Party": "#29ABE2", "URP": "#29ABE2",
    "Jubilee Party": "#E4032E", "Jubilee Alliance": "#E4032E",
    "Wiper Democratic Movement – Kenya": "#046A38", "Wiper": "#046A38",
    "United Democratic Alliance": "#FFD100", "UDA": "#FFD100",
    "Azimio la Umoja": "#F7941D", "Azimio": "#F7941D",
    "Kenya Kwanza": "#FFD100",
    "Amani National Congress": "#00A0DC", "Amani": "#00A0DC",
    "Safina": "#4C9A2A",
    "Shirikisho Party of Kenya": "#7B3F00",
    "KADU–Asili": "#4A5D9E", "KADU-Asili": "#4A5D9E",
    "Kenya African Democratic Union": "#4A5D9E",
    "Independent": "#9ca3af", "Independents": "#9ca3af",
    "Appointed members": "#9ca3af",
}

INTRO = {
    "leg": "Every National Assembly election since the colonial Legislative Council of 1920, newest first. The colonial elections and the one-party era before 1992 carry a caveat in the article's own terms.",
    "pres": "Every Kenyan presidential contest on file since 1978, newest first. The one-party years carry no vote at all; October 2017 is the re-run ordered after the Supreme Court annulled the August result.",
}

ERA_FREEDOM = {
    ("ke", "leg", "colonial"): "unfree",
    ("ke", "leg", "oneparty"): "partial",
    ("ke", "pres", "unopposed"): "unfree",
}
ERA_CAVEAT = {
    ("ke", "leg", "colonial"): "Filled by a race-based franchise; the majority Black population had no vote and was represented, if at all, by a handful of members nominated by the Governor.",
    ("ke", "leg", "oneparty"): "KANU was the sole legal party, but its own primaries turned over a large share of sitting MPs at every election.",
    ("ke", "pres", "unopposed"): "KANU's sole nominee stood unopposed and no vote was held.",
}
FREEDOM_OVERRIDE = {
    ("ke", "pres-2007"): ("partial",
        "The result was announced by a divided electoral commission whose own chairman later said he did not know who had won, foreign observers raised concerns about the count, and the dispute was resolved by a power-sharing deal rather than by settling it."),
    ("ke", "pres-2017-august"): (None,
        "The Supreme Court annulled this result for irregularities in the transmission of results and ordered a fresh election, an unprecedented step for an African presidential election."),
    ("ke", "pres-2017-october"): ("partial",
        "Raila Odinga withdrew before the re-run, saying the electoral commission had not shown it would fix the problems that led to the annulment, leaving Kenyatta to face token opposition."),
}

HUB = dict(
    shape="combined",
    name="Kenya", adj="Kenyan", flag="ke", capital=("nairobi", "Nairobi"),
    title="Kenyan Elections",
    legNoun="Kenyan National Assembly Election", presNoun="Kenyan Presidential Election",
    chamber="the National Assembly",
    role="President", roleShort="President",
    presRole="President", presFirst=True,
    legHeadline="National Assembly elections",
    locale="en-GB",
    chartFrom=None,
    desc="Kenya's elections from the racially restricted colonial Legislative Council of 1920 to the 2022 general election: the 1963 transfer of power, a one-party state formalised in 1982, the return of multi-party competition in 1992, the disputed 2007 count and the violence that followed it, and the 2010 constitution's devolved, six-office general elections, including the 2017 presidential result the Supreme Court annulled and re-ran.",
    sources=["Wikipedia: Kenyan general and presidential election articles 1920-2022 (results tables and infoboxes)",
             "Independent Electoral and Boundaries Commission and predecessor commission figures as reported there"],
    tiles=[("National Assembly seats", "349", "290 constituency, 47 women, 12 nominated"),
           ("Elections since 1920", None, None),
           ("Aug 2022", "50.5%", "Ruto's first-round win over Odinga")],
    how=[("President elected outright or by runoff",
          "Since the 2010 constitution the president needs an absolute majority plus 25% of the vote in at least 24 of Kenya's 47 counties, or a runoff between the top two follows. No election has gone to one; the closest, 2022, was decided by 1.6 points in the first round."),
         ("An Assembly elected three ways",
          "290 members are elected by first-past-the-post in single-member constituencies. A further 47 seats, one per county, are reserved for women, and 12 more are nominated by parties in proportion to their strength, for 349 seats in total."),
         ("The one-party interlude",
          "KANU was Kenya's only legal party from 1982 to 1991, and the sole party on the ballot from 1969. The presidency went unopposed at every election in that period; the National Assembly did not, since KANU's own primaries were genuinely contested and turned over many sitting MPs."),
         ("2007 and 2017, twice disputed",
          "Kenya's presidential count has been challenged twice: in 2007, when a disputed Kibaki win was resolved by a power-sharing deal after nationwide violence, and in 2017, when the Supreme Court annulled Kenyatta's re-election outright and ordered a re-run that Odinga then boycotted.")],
    charts=[("Turnout", "Above 80% at every direct multi-party presidential election except the boycotted October 2017 re-run, which fell to 39%."),
            ("The largest party or coalition's National Assembly seat share", "KANU held the chamber outright through the one-party era; since 2013 the largest bloc has generally needed a coalition partner to govern.")],
    links=[("/countries/kenya", "Kenya"), ("/elections/et", "Ethiopian Elections"),
           ("/elections/ae", "Emirati Elections"), ("/elections/bd", "Bangladeshi Elections")],
    records=[
        ("Largest National Assembly majority", "158 of 158 elected", "1974", "Every elected seat was contested by KANU alone; no other party was on the ballot."),
        ("Lowest presidential turnout", "39.03%", "pres-2017-october", "Raila Odinga withdrew and urged a boycott after the annulled August vote."),
        ("Closest presidential result", "1.6 points", "pres-2022", "William Ruto's 50.49% against Raila Odinga's 48.85%."),
    ],
    colorRules=[
        (r"KANU|Kenya African National Union", "#BE0000"),
        (r"ODM|Orange Democratic Movement", "#F7941D"),
        (r"Jubilee", "#E4032E"),
        (r"FORD", "#0B6E4F"),
        (r"Democratic Party", "#1F4E96"),
        (r"Wiper", "#046A38"),
        (r"UDA|United Democratic Alliance|Kenya Kwanza", "#FFD100"),
        (r"NARC|Rainbow", "#F5821F"),
    ],
)
