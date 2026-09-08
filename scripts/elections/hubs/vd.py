# -*- coding: utf-8 -*-
"""South Vietnam (Republic of Vietnam), 1956-1971. Defunct 30 April 1975."""

STATUS = "defunct"
DISSOLVED = "30 April 1975"

ERAS = {
    "leg": [
        ("diem", "The First Republic", "1956-1963", 1900, 1963,
         "Ngô Đình Diệm's National Revolutionary Movement or its allied independents took the great majority of seats at every election of the period, while candidates faced government screening over alleged links to the communist Việt Minh and could be barred from the ballot on that basis. The 1959 election was later singled out as the dirtiest and most openly rigged of all South Vietnamese elections. The assembly elected in 1963 never sat: the Buddhist crisis and the coup that killed Diệm that November dissolved it before its first session."),
        ("thieu", "The Second Republic", "1966-1971", 1964, 1975,
         "A Constituent Assembly was elected in 1966 to write a constitution for the government of Nguyễn Văn Thiệu, and the two lower-house elections held under it, in 1967 and 1971, were fought mostly by individuals rather than parties. Only a handful of candidates carried a party label in either contest, so the results survive as constituency winners rather than a party-by-party tally. The 1971 election, with turnout of 79%, was the last one South Vietnam ever held."),
    ],
    "pres": [
        ("diem", "Diệm's re-election", "1961", 1900, 1966,
         "Diệm's only direct re-election as president, held two years before the Buddhist crisis and the coup that ended his rule. The article gives only the candidates' vote shares, not the underlying totals or a turnout figure."),
        ("thieu", "The Thiệu presidency", "1967-1971", 1967, 2100,
         "Nguyễn Văn Thiệu won the presidency twice: in 1967, in a field of eleven the article says is widely considered to have been fraudulent, and in 1971 unopposed after his rivals were barred from the ballot or withdrew. Between them these are the last two presidential elections South Vietnam ever held."),
    ],
}

COLORS = {
    "National Revolutionary Movement": "#B8860B",
    "Pro-government Independents": "#D4AF37",
    "Pro-government independents": "#D4AF37",
    "Opposition independents": "#9ca3af",
    "Independents": "#9ca3af",
    "Citizens' Assembly": "#6A8CAF",
    "Movement to Win and Preserve Freedom": "#8B6C42",
    "Dai-Viet Progressive Party": "#2E7D32",
    "Đại Việt Progressive Party": "#2E7D32",
    "Dai Viet Progressive Party": "#2E7D32",
    "Việt Nam Quốc Dân Đảng": "#1565C0",
    "Personalist Labor Revolutionary Party": "#B8860B",
}

INTRO = {
    "leg": "Every South Vietnamese constitutional assembly and lower-house election, from the constitutional assembly of 1956 to the last lower-house election in 1971, newest first.",
    "pres": "All three direct presidential elections South Vietnam held, from Ngô Đình Diệm's re-election in 1961 to Nguyễn Văn Thiệu's unopposed second term in 1971, newest first.",
}

ERA_FREEDOM = {
    ("vd", "leg", "diem"): "partial",
}
ERA_CAVEAT = {
    ("vd", "leg", "diem"): "Candidates faced government screening over alleged links to the Việt Minh and could be barred from the ballot on that basis; the ruling National Revolutionary Movement or pro-government independents took the great majority of seats at every contest.",
}
FREEDOM_OVERRIDE = {
    ("vd", "1959"): ("unfree", "A 1966 CIA report called this the dirtiest and most openly rigged of all South Vietnamese elections: soldiers were bussed in from outside the district to stuff ballot boxes, and the two independents who won were barred from taking their seats."),
    ("vd", "1967"): (None, "Only a few candidates ran under a party label; most stood as individuals, so no party-by-party result is on file beyond the one bloc, the Việt Nam Quốc Dân Đảng, reported to have won at least nine seats."),
    ("vd", "1971"): (None, "Candidates stood as individuals rather than under party labels, so no party-by-party result is on file. Turnout was 79%, with 5,567,446 of the 7,085,943 registered voters casting a ballot."),
    ("vd", "pres-1967"): ("partial", "The election is widely considered to have been fraudulent: the ruling military junta pushed aside its own strongest potential rival and had soldiers show voters how to mark their ballots, though Thiệu still won only a plurality against ten other candidates."),
    ("vd", "pres-1971"): ("unfree", "Thiệu ran unopposed after his rivals were barred from the ballot or withdrew, and took 100% of the vote."),
}

HUB = dict(
    shape="combined",
    name="South Vietnam", adj="South Vietnamese", flag="vn", capital=("ho-chi-minh-city", "Saigon"),
    title="South Vietnamese Elections",
    legNoun="South Vietnamese Lower-House Election", presNoun="South Vietnamese Presidential Election",
    chamber="the National Assembly",
    role="President", roleShort="President",
    presRole="President", presFirst=True,
    locale="en-GB",
    chartFrom=None,
    desc="Every constitutional assembly, lower-house and presidential election the Republic of Vietnam held before it was overrun in April 1975: the screened, dominated elections of Diệm's First Republic, the 1959 vote a later report called the most openly rigged of them all, the individual-candidate contests of Thiệu's Second Republic, and the unopposed 1971 election that was the country's last.",
    sources=["Wikipedia: South Vietnamese constitutional assembly, lower-house and presidential election articles 1956-1971 (results tables, infoboxes and lead text)",
             "Figures as reported there (Dieter Nohlen et al., Keesing's Research Review, the Congressional Record and contemporary press accounts)"],
    tiles=[("Lower house seats", "117-123", "the seat count changed with each new constitution"),
           ("Contests on file", None, None),
           ("1971", "100%", "Thiệu's unopposed vote share in the republic's last election")],
    how=[("A directly elected president",
          "The president was head of state and government both, elected directly for a term the constitution set at four years. South Vietnam held three such elections in the country's twenty-year life, in 1961, 1967 and 1971."),
         ("A lower house with no fixed electoral system",
          "The 1956 and 1959 assemblies were elected by first-past-the-post in single-member seats. The 1966 Constituent Assembly used first-past-the-post in single-member provinces and the d'Hondt method where a province elected more than one member. By 1971 multi-member provinces used the multiple non-transferable vote instead, so voters there could cast as many ballots as there were seats to fill."),
         ("A dominant government party, then none at all",
          "Diệm's National Revolutionary Movement and its allied independents held the great majority of seats through 1963. After 1966 party labels mostly disappeared from the ballot altogether, and the 1967 and 1971 lower-house results survive as lists of winning individuals rather than a party breakdown."),
         ("A republic that ran out of elections",
          "The last lower-house election was held in August 1971 and the last presidential election that October. Neither was followed by another: North Vietnamese forces took Saigon on 30 April 1975 and the republic ceased to exist.")],
    charts=[("Turnout", "Turnout is only on the record for three of these nine contests: 80.83% for the 1966 Constituent Assembly, 83.17% for the 1967 presidential election and 87.97% for the unopposed 1971 one."),
            ("The largest bloc's seat share", "National Revolutionary Movement or pro-government independents held at least half the lower house at every election through 1963; the 1966 and later results are dominated instead by candidates who ran without any party label.")],
    links=[("/countries/vietnam", "Vietnam"), ("/elections/vn", "Vietnamese Legislative Elections")],
    records=[],
    colorRules=[],
)
