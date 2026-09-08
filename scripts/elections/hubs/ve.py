# -*- coding: utf-8 -*-
"""Venezuela: presidential record from 1936 and legislative record from 1947.

The legislative chamber changes shape and name across the series: a
bicameral Congress (Chamber of Deputies plus Senate) from 1947 to 1998, a
unicameral National Assembly from 2000. This page reports the lower/larger
house throughout (the Chamber of Deputies to 1998, the National Assembly
from 2000) and is titled for the current chamber. Perez Jimenez's 1952
plebiscite is not in the source dump, so the presidential series has a real
gap between 1948 and 1958 that this module does not paper over.
"""

STATUS = "active"
DISSOLVED = None

ERAS = {
    "pres": [
        ("succession", "The Gomez succession and the trienio", "1936-1948", 1900, 1949,
         "Juan Vicente Gomez ruled Venezuela for twenty-seven years and died in office in December 1935. Congress chose his successors in 1936 and 1941, Eleazar Lopez Contreras and then Isaias Medina Angarita, in indirect votes with no popular ballot. A 1945 coup brought Democratic Action to power, and 1947 was, in the article's own words, the first direct presidential election in Venezuelan history and the first free regular election since independence in 1830; Romulo Gallegos won it with 74% before a 1948 coup ended the three-year period known as the trienio."),
        ("puntofijo", "Punto Fijo", "1958-1993", 1950, 1993,
         "The dictatorship of Marcos Perez Jimenez, whose own 1952 plebiscite is not in the source used here, fell in January 1958. The Punto Fijo pact that followed put Democratic Action and Copei in power for every election through 1988, and 1993 broke that duopoly outright: Rafael Caldera won the presidency outside either party at the head of a coalition of seventeen smaller ones, the first time since the pact that neither traditional party's candidate had prevailed."),
        ("chavez", "The Chavez era", "1998-2012", 1994, 2012,
         "Hugo Chavez, a former coup leader, won the presidency in 1998 and ended forty years of two-party rule outright. He was re-elected in 2000 under a newly adopted constitution, survived a 2004 recall referendum not tracked in this series, and won again in 2006 and 2012, the last of these his narrowest margin; he died two months into that fourth term."),
        ("maduro", "The Maduro era", "2013-2025", 2013, 2100,
         "Nicolas Maduro, Chavez's chosen successor, won a special election in 2013 by under two points. His 2018 re-election was boycotted by the main opposition after leading candidates were barred from running, and in 2024 the National Electoral Council declared him the winner without ever publishing precinct-level tallies, while the opposition's own published tally sheets showed Edmundo Gonzalez comfortably ahead."),
    ],
    "leg": [
        ("succession", "The trienio Congress", "1947", 1900, 1949,
         "Congress under Gomez, Lopez Contreras and Medina Angarita is not in the source used here; the record opens with the Constituent Assembly and Chamber elected in 1947, in which Democratic Action's landslide gave it supermajorities of 83 of 110 Chamber seats and 38 of 46 in the Senate before the 1948 coup dissolved it."),
        ("puntofijo", "Punto Fijo", "1958-1993", 1950, 1993,
         "Democratic Action and Copei shared or alternated control of a bicameral Congress at every election from 1958 to 1988. In 1993 the Chamber and Senate were elected on separate ballots under a new mixed-member system for the first time, and the two traditional parties' combined seat share fell sharply as Causa R and Caldera's National Convergence broke through."),
        ("chavez", "The Chavez era", "2000-2010", 1994, 2012,
         "The 1999 constitution replaced the bicameral Congress with a unicameral National Assembly, first elected the same day as Chavez's 2000 re-election. The opposition boycotted the 2005 election over a disputed voting process, leaving Chavez's Fifth Republic Movement and its allies almost the entire chamber; by 2010 the vote was split almost evenly with the opposition Democratic Unity Roundtable, but the government's list still kept a comfortable majority of seats."),
        ("maduro", "The Maduro era", "2015-2025", 2013, 2100,
         "The Democratic Unity Roundtable won an outright majority in 2015, the only opposition win of the Chavista period on this page. The main opposition boycotted both the 2020 and 2025 elections, and the governing coalition's list took the overwhelming majority of seats in the National Assembly both times."),
    ],
}

COLORS = {
    "Democratic Action": "#000000", "AD": "#000000", "AD (ad hoc)": "#000000",
    "Democratic Alliance": "#000000",
    "Copei": "#00843D",
    "Communist Party of Venezuela": "#DA291C", "PCV": "#DA291C",
    "Democratic Republican Union": "#FFC72C", "URD": "#FFC72C",
    "Movement for Socialism": "#F58220", "MAS": "#F58220", "MAS-MIR": "#F58220",
    "MAS–MIR": "#F58220",
    "Radical Cause": "#C8102E", "LCR": "#C8102E",
    "National Convergence": "#4169B2", "CVGC": "#4169B2", "Convergence": "#4169B2",
    "Fifth Republic Movement": "#CC0000", "MVR": "#CC0000",
    "United Socialist Party of Venezuela": "#B00000", "PSUV": "#B00000",
    "Great Patriotic Pole": "#B00000", "GPPSB": "#B00000",
    "Justice First": "#003DA5", "PJ": "#003DA5",
    "A New Era": "#F7941D", "UNT": "#F7941D", "Un Nuevo Tiempo": "#F7941D",
    "UNT–UNICA": "#F7941D",
    "Popular Will": "#FFD100",
    "Project Venezuela": "#4682B4", "PROVE": "#4682B4",
    "Fatherland for All": "#FDB913", "PPT": "#FDB913",
    "Democratic Unity Roundtable": "#4A90D9", "MUD": "#4A90D9",
    "Unitary Platform": "#4A90D9", "PUD": "#4A90D9",
    "New Democratic Generation": "#8D6E63",
    "People's Electoral Movement": "#7B1FA2", "MEP": "#7B1FA2",
    "Authentic Renewal Organization": "#5D4037",
    "Independent": "#9ca3af", "Independents": "#9ca3af",
}

INTRO = {
    "pres": "Every Venezuelan presidential contest on record here, from Congress's indirect vote of 1936 to the disputed count of July 2024, newest first. Perez Jimenez's 1952 plebiscite is not in the source used here, so 1958 follows 1947 directly.",
    "leg": "Every Venezuelan legislative election on record here, newest first, reporting the Chamber of Deputies to 1998 and the National Assembly from 2000.",
}

ERA_FREEDOM = {
    ("ve", "pres", "succession"): "partial",
}
ERA_CAVEAT = {
    ("ve", "pres", "succession"): "Congress, not voters, chose the president in 1936 and 1941; only 1947 was a direct popular election, and a coup ended its Congress the following year.",
}
FREEDOM_OVERRIDE = {
    ("ve", "1936"): ("unfree", "Congress elected Lopez Contreras with 121 of 122 votes; there was no popular ballot."),
    ("ve", "1941"): ("unfree", "Congress elected Medina Angarita with 120 of 137 votes; there was no popular ballot."),
    ("ve", "pres-1936"): ("unfree", "Congress elected Lopez Contreras with 121 of 122 votes; there was no popular ballot."),
    ("ve", "pres-1941"): ("unfree", "Congress elected Medina Angarita with 120 of 137 votes; there was no popular ballot."),
    ("ve", "pres-2018"): ("partial", "Leading opposition figures were barred from running and the main opposition parties boycotted the vote, which international observers widely declined to recognise."),
    ("ve", "pres-2024"): ("partial", "The National Electoral Council declared Maduro the winner but never published tally sheets or precinct-level results; the opposition published tally sheets covering most polling stations that showed Gonzalez ahead."),
    ("ve", "2005"): ("partial", "Five opposition parties withdrew days before the vote in a dispute over the count's integrity, leaving the governing Fifth Republic Movement and its allies almost the entire National Assembly."),
    ("ve", "2020"): ("partial", "The main opposition coalition boycotted the election, which followed the Supreme Tribunal's replacement of several opposition parties' leaderships."),
    ("ve", "2025"): ("partial", "Leading opposition figures called for a boycott following the disputed 2024 presidential election, and most of the opposition did not take part."),
}

HUB = dict(
    shape="combined", name="Venezuela", adj="Venezuelan", flag="ve", capital=("caracas", "Caracas"),
    title="Venezuelan Elections",
    legNoun="Venezuelan Legislative Election", presNoun="Venezuelan Presidential Election",
    chamber="the National Assembly", role="President", roleShort="President",
    presRole="President", presFirst=True, runoffSummary=False,
    legHeadline="Legislative elections",
    desc="Venezuela's presidential record from Congress's indirect 1936 vote to the disputed count of July 2024, and its legislative record from 1947: the trienio and the coup that ended it, the Punto Fijo pact of Democratic Action and Copei, the two-party system Hugo Chavez broke in 1998, and a Maduro era in which the main opposition has boycotted three of the last four legislative elections.",
    sources=["Wikipedia: Venezuelan presidential and general election articles 1936-2025",
             "Consejo Nacional Electoral (CNE) figures as reported there"],
    tiles=[("National Assembly", "285", "143 seats needed for a majority"),
           ("Contests on file", None, None),
           ("July 2024", "Disputed", "CNE declared Maduro the winner with no precinct tallies published")],
    how=[("A president elected in one round",
          "The presidency has always gone to whoever wins a plurality, with no runoff at any point in this record. Term length has varied, from five years under most of the twentieth century's constitutions to six years since 1999."),
         ("A chamber that changed shape twice",
          "Congress was bicameral, a Chamber of Deputies and a Senate, from 1947 to 1998. The 1999 constitution replaced it with a single National Assembly, currently 285 seats chosen by a mix of party lists and single-member districts."),
         ("A vote Congress cast, not the public",
          "Venezuela's president was chosen indirectly, by Congress rather than by popular ballot, in 1936 and 1941 following Juan Vicente Gomez's twenty-seven years in power. Perez Jimenez's own 1952 plebiscite is not in the source used here, so this page's presidential series jumps from the 1948 coup straight to the restored democracy of 1958."),
         ("Boycotts as the opposition's tool",
          "Facing a field it judged rigged against it, the opposition withdrew from the 2005, 2020 and 2025 legislative elections and the 2018 presidential one rather than contest them, leaving the governing coalition close to every seat on offer.")],
    charts=[("Turnout", "Turnout ran above 80% at nearly every Punto Fijo and early Chavez election. It fell to 45.7% for Maduro's boycotted 2018 re-election and to 30.5% for the boycotted 2020 legislative vote, before recovering somewhat once the opposition began contesting again."),
            ("The largest party's presidential share", "Democratic Action and Copei traded wins in the 40 to 57% range for most of Punto Fijo. Chavez cleared 55% at every election he won; Maduro's declared shares since 2013 have run from just over 50% to a disputed 68% in 2018.")],
    links=[("/countries/venezuela", "Venezuela"), ("/elections/co", "Colombian Elections"),
           ("/elections/br", "Brazilian Elections")],
    records=[],
    colorRules=[],
)
