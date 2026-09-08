# -*- coding: utf-8 -*-
"""Romania: legislative record from 1901, presidential record from 1990.

The legislative series runs the censitary kingdom's Chamber of Deputies
through Greater Romania, the royal dictatorship's single list, the falsified
1946 vote, the communist National Front and the post-1989 Chamber, with no
gap the source dump does not itself have (see the wave5.py notes below).
The presidential series is the direct, two-round presidency: 1990-2004 come
from the general-election articles, which carried the presidential vote in
the same infobox as Parliament, and 2009-2025 have their own articles. 2024
and 2025 are two separate rows: the November-December 2024 election was
annulled by the Constitutional Court after its first round, and the office
was filled by a re-run in May 2025.

Parser notes (wave5.py's `ro` entry):

* Seven legislative articles (1901, 1905, 1907, 1912, 1914, 1918, 1926) print
  a "Politics of Romania" navbox where the heading should be, so
  parse_wikidump.py's title scan never finds the real heading and falls back
  to synth_title(), which reconstructs "<year> parliamentary election" from
  the lead sentence and categories, dropping the country name the shared
  parser never needed (the dump is single-country) and not always agreeing
  with the sibling articles on "general" vs "parliamentary". All seven are
  confirmed genuine Chamber (and, from 1907, Senate) elections with real
  tables; the hub's `leg` matcher accepts this shape rather than widening
  the shared title parser for one hub's navbox pages.
* 1992, 1996 and every parliamentary article from 2008 print the Senate's
  results table before the Chamber of Deputies', the reverse of 2000 and
  2004: `legPrefer="leg-large"` keeps every bicameral year on the larger,
  primary Chamber (the same fix already used for Peru's Senate-first
  bicameral articles), and a small per-year override restores the Chamber's
  true size where the infobox's own "N seats" line still names the Senate.
* 1918's lead-sentence date is restored in full; the shared date regex's
  first-punctuation cutoff otherwise truncated it at a comma inside a
  parenthetical aside.

Not fixed: 1922's table is a three-tier "Multi-member / Single-member /
Total" header that the generic readers only partly resolve, so the
extracted party list sums to 286 of the table's own stated 369 seats;
several single-seat minority parties are missing from the list, though the
winner, runner-up and turnout are unaffected. The Chamber's own total (369)
is kept rather than the incomplete sum.

The dump's own navigation strip also lists Romanian elections back to 1864
(1864, 1866 twice, 1867-1879, 1883-1884, 1888 twice, 1891-1899), all outside
the 1901-2025 span of the 43 articles actually in this dump, plus separate
19th-century strips for Moldavia, Wallachia, Bessarabia (1917) and
Transylvania (1918) under other rulers. None of those are in this hub;
they would need their own source articles.
"""

STATUS = "active"
DISSOLVED = None

ERAS = {
    "leg": [
        ("kingdom", "The censitary kingdom", "1901-1918", 1900, 1918,
         "The Chamber of Deputies was elected through three separate electoral colleges of wealth and profession, one for large landowners and urban notables, one for lesser urban property holders, and one for the peasants who made up most of the population but held only a sliver of the vote. It was the government of the day that called each election and ran its machinery, not a neutral administration, and the franchise itself stayed a few percent of the population throughout. The last vote on this system, in 1918, was held under wartime German occupation with the National Liberal Party boycotting."),
        ("greater_romania", "Greater Romania and the electoral bonus", "1919-1937", 1919, 1937,
         "Universal male suffrage arrived with the postwar union of Transylvania, Bessarabia and Bukovina, and the opposition Romanian National Party actually won the first vote, in 1919. From 1926 an electoral bonus law handed any party clearing 40% of the national vote an automatic majority of seats, and it was almost always the party running the interior ministry that cleared it: the 1922 article's own account has army officers campaigning inside polling stations for the governing National Liberals. The system ran out of road in 1937, when nobody reached 40%, no coalition would form, and King Carol II handed the government to the fourth-placed, avowedly antisemitic National Christian Party instead."),
        ("dictatorship", "The royal dictatorship's single list", "1939", 1938, 1939,
         "King Carol II abolished party politics in 1938 and folded every legal party into the National Renaissance Front; by the time voters went to the polls in June 1939, opposition parties were banned outright and the Front was the only name on the ballot. It took 100% of the vote in a system that also raised the voting age and sorted the electorate into occupational groups rather than one national body of voters."),
        ("falsified", "The falsified election of 1946", "1946", 1940, 1947,
         "No election was held during the war years. When Romania voted again in November 1946, the Soviet-backed government of Petru Groza ran the count, and Wikipedia's own account, drawing on Romanian and Soviet-archive historians alike, describes widespread intimidation and outright fraud that inflated the governing bloc's declared 69.8% well past what independent estimates suggest it actually won. Within two years the main opposition parties were dissolved, the king was forced to abdicate, and Romania became a one-party state."),
        ("communist", "The communist single list", "1948-1985", 1948, 1989,
         "From 1948 a single National Front list, later renamed the Front of Socialist Unity and Democracy, ran unopposed at every election; turnout and the yes vote were both reported above 90% every time, and seat totals moved only when the legislature itself changed size. There was no rival candidate on the ballot and no possibility the ruling party could lose."),
        ("republic", "The post-1989 republic", "1990-", 1990, 2100,
         "Romania's first free vote since the war returned a Parliament and a president together in May 1990, and competitive multiparty politics has run continuously since, through six-odd governing coalitions and several minority governments. Turnout has fallen from the near-universal levels of 1990 to the low fifties by 2024, the year far-right parties took roughly a fifth of the vote between them for the first time."),
    ],
    "pres": [
        ("republic", "The directly elected presidency", "1990-", 1990, 2100,
         "The presidency has been directly elected since Ion Iliescu's one-round win in May 1990; every contest since 1992 has used a two-round system that sends the top two finishers to a runoff whenever nobody clears a majority outright first time. The office sits alongside a prime minister who runs the government day to day but controls foreign and defence policy and can dissolve Parliament under specific conditions, the semi-presidential design the 1991 constitution settled on."),
    ],
}

COLORS = {
    "National Liberal Party": "#F9A825",
    "National Liberal Party–Brătianu": "#F9A825",
    "Liberal Union–Brătianu": "#F9A825",
    "Conservative Party": "#37474F",
    "Conservative-Democratic Party": "#5C6BC0",
    "National Peasants' Party": "#4C8C2B",
    "National Peasant Party": "#4C8C2B",
    "Peasants' Party": "#4C8C2B",
    "Peasants' Party–Lupu": "#8BC34A",
    "Christian Democratic National Peasants' Party": "#4C8C2B",
    "Bessarabian Peasants' Party": "#7CB342",
    "Transylvanian Peasants' Party": "#7CB342",
    "Peasant Workers' Bloc": "#7CB342",
    "Romanian National Party": "#8E24AA",
    "People's Party": "#1565C0",
    "National-Christian Defense League": "#4A148C",
    "Legion of the Archangel Michael": "#1B1B1B",
    "National Renaissance Front": "#003366",
    "People's Democratic Front": "#A6192E",
    "Romanian Workers Party": "#A6192E",
    "Ploughmen's Front": "#A6192E",
    "Social Democratic Party": "#E30613",
    "Romanian Social Democratic Party": "#E30613",
    "Socialist Party": "#C62828",
    "National Salvation Front": "#E30613",
    "Democratic Alliance of Hungarians in Romania": "#2E7D32",
    "Democratic Union of Hungarians in Romania": "#2E7D32",
    "UDMR": "#2E7D32",
    "Greater Romania Party": "#B8860B",
    "Save Romania Union": "#6A1B9A",
    "USR": "#6A1B9A",
    "Alliance for the Union of Romanians": "#7B1113",
    "AUR": "#7B1113",
    "Ecologist Party of Romania": "#43A047",
    "Green Party": "#2E7D32",
    "Romanian Democratic Convention": "#1B4F91",
    "Independents": "#9E9E9E",
    "Independent": "#9E9E9E",
    "Other parties": "#BDBDBD",
}

INTRO = {
    "leg": "Every Romanian legislative election on record here, newest first: the narrow-franchise electoral colleges of the constitutional kingdom, Greater Romania's electoral-bonus-law democracy, the royal dictatorship's single list, the falsified 1946 vote, communist Romania's unopposed National Front, and the two-round multiparty republic since 1990. This page reports the Chamber of Deputies throughout; several articles print the Senate's table first, and this series does not follow them there.",
    "pres": "Every direct Romanian presidential election on record here, newest first, from Ion Iliescu's one-round win in 1990 to the annulled and re-run contest of 2024-2025. 1990 to 2004 are drawn from the general-election articles that carried the presidential vote in the same infobox as Parliament; every contest from 2009 has its own dedicated article.",
}

ERA_FREEDOM = {
    ("ro", "leg", "kingdom"): "partial",
    ("ro", "leg", "greater_romania"): "partial",
    ("ro", "leg", "dictatorship"): "unfree",
    ("ro", "leg", "falsified"): "unfree",
    ("ro", "leg", "communist"): "unfree",
}
ERA_CAVEAT = {
    ("ro", "leg", "kingdom"): "The franchise was a few percent of the population, split across three wealth- and profession-based electoral colleges, and it was the government of the day that ran the vote.",
    ("ro", "leg", "greater_romania"): "Governments were organised by whoever held the interior ministry at the time; the 1922 article's own account describes army officers campaigning inside polling stations for the ruling party.",
    ("ro", "leg", "dictatorship"): "Opposition parties were banned and the National Renaissance Front was the only name on the ballot.",
    ("ro", "leg", "falsified"): "Historians describe the count itself as fraudulent, not merely tilted; the declared 69.8% for the governing bloc is widely disputed by contemporaries and later researchers alike.",
    ("ro", "leg", "communist"): "A single approved list, with no rival candidate, stood at every election; the result was never in doubt.",
}
FREEDOM_OVERRIDE = {
    ("ro", "1937"): ("partial", "No party reached the 40% threshold for the automatic majority bonus, and King Carol II handed the government to the fourth-placed, antisemitic National Christian Party rather than to the plurality winner."),
    ("ro", "pres-2024"): (None, "The first round, held 24 November 2024 and won by Călin Georgescu, was annulled by the Constitutional Court on 6 December over allegations of Russian-linked social media interference, and the scheduled second round never took place."),
    ("ro", "pres-2025"): (None, "This was the re-run of the annulled 2024 election, ordered after Georgescu was barred from running in March 2025; George Simion led the first round but Nicușor Dan won the 18 May runoff."),
}

HUB = dict(
    shape="combined", name="Romania", adj="Romanian", flag="ro", capital=("bucharest", "Bucharest"),
    title="Romanian Elections",
    legNoun="Romanian Legislative Election", presNoun="Romanian Presidential Election",
    chamber="the Chamber of Deputies", role="Prime Minister", roleShort="PM",
    presRole="President", presFirst=True, runoffSummary=True,
    legHeadline="Legislative elections",
    desc="Romania's legislative record from the censitary kingdom's 1901 vote to the December 2024 Chamber election, and its presidential record from the two-round republic's founding vote in 1990: three electoral colleges and a tiny franchise, an electoral-bonus law that broke in 1937, a royal dictatorship's single list, a falsified 1946 count, four decades of unopposed communist ritual, and a presidential election annulled by the courts and re-run within a year.",
    sources=["Wikipedia: Romanian legislative and presidential election articles 1901-2025",
             "Biroul Electoral Central / Autoritatea Electorală Permanentă figures as reported there"],
    tiles=[("Chamber seats", "331", "elected by party-list PR since 1990"),
           ("Elections since 1901", None, None),
           ("May 2025", "Nicușor Dan", "won the runoff re-run after 2024's annulment")],
    how=[("Three franchises, one series",
          "The censitary kingdom's three wealth-based colleges gave way to universal male suffrage in 1919, a single list under the royal dictatorship and communist rule from 1938 to 1989, and a genuinely competitive multiparty vote since 1990. Turnout and the freedom of the contest move together across the eras more than any single number in the tables does."),
         ("The 40% bonus that broke in 1937",
          "Greater Romania's electoral law handed any party clearing 40% of the vote an automatic parliamentary majority, which is most of why interwar governments routinely won landslides they had organised themselves. In 1937 nobody reached the threshold, no coalition would form, and King Carol II gave the government to a fourth-placed, avowedly antisemitic party instead, a preview of the dictatorship that followed a year later."),
         ("A presidency chosen twice in one year",
          "Călin Georgescu topped the first round of the November 2024 presidential election before the Constitutional Court annulled it over alleged Russian-linked social media interference; barred from the re-run, he was replaced on the ballot by George Simion, who led the new first round in May 2025 but lost the runoff to Nicușor Dan."),
         ("The Chamber, not the Senate",
          "Several of the source articles from 1992 on print the Senate's results table before the Chamber of Deputies', the smaller of Parliament's two houses. This page reports the Chamber throughout, so its seat totals will not match a reader's memory of the Senate figures the same article leads with.")],
    charts=[("Turnout", "Above 90% at every communist-era ritual and near-universal in 1990, falling to the low fifties by the 2020s as Romanian politics settled into an ordinary competitive multiparty pattern."),
            ("The largest party's seat share", "A single list took every seat by definition under the royal dictatorship and communist rule. The electoral bonus law produced supermajorities for the governing party through most of Greater Romania; no party has cleared even a third of the Chamber since 1990.")],
    links=[("/countries/romania", "Romania"), ("/elections/hu", "Hungarian Elections"), ("/elections/pl", "Polish Elections")],
    records=[
        ("Largest legislative majority", "379 of 414 seats", "1946", "The Bloc of Democratic Parties and its allies, in the election historians describe as fraudulent."),
        ("Widest presidential margin", "85.07%", "1990", "Ion Iliescu's win in the first free postwar election, decided in a single round."),
    ],
    colorRules=[
        (r"Union of|Community of|Federation of|Association of|League of|Cultural Union|Forum of|Committee|Bratstvo", "#B0BEC5"),
        (r"Peasant", "#4C8C2B"),
        (r"Liberal", "#F9A825"),
        (r"Social Democrat|Socialist|Workers", "#E30613"),
        (r"Christian|Conservative", "#5C6BC0"),
        (r"Magyar|Hungarian", "#2E7D32"),
        (r"National.*Unity|Nationalist|Legion", "#4A148C"),
    ],
)
