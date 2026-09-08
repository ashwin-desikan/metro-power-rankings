# -*- coding: utf-8 -*-
"""Peru: presidential record from 1866 and congressional record from 1931.

Peru's Congress has changed shape three times in this record: bicameral
(Senate + Chamber of Deputies) from 1931 to 1992, unicameral (a single
Congress of the Republic) from 1995 to 2021, and bicameral again (Senate +
Chamber of Deputies) from 2026. The legislative series on this page reports
the CHAMBER OF DEPUTIES throughout the bicameral years, the same lower house
the 1995-2021 unicameral Congress descends from in size and method, rather
than switching to the smaller Senate whenever an article prints it first.
Say so in the intro so a reader who compares this page against the Senate
figures in a source article understands why the numbers differ.
"""

STATUS = "active"
DISSOLVED = None

ERAS = {
    "pres": [
        ("colegios", "Caudillos and the electoral college", "1866-1876", 1800, 1884,
         "The four earliest contests here were run on a franchise limited to literate men, and 1868 was decided, in the article's own words, 'in the electoral college' rather than by a direct national count. Manuel Pardo's win in 1872 was still a real turning point: the first civilian, and the first opposition candidate, to take the presidency from Peru's caudillo generals."),
        ("aristocratica", "The Aristocratic Republic", "1886-1919", 1885, 1929,
         "The Civilista Party's landed and mercantile elite held the presidency for most of this period, and six of these nine contests returned a single candidate running unopposed. The franchise stayed restricted to literate men throughout. The one real race, in 1919, put Augusto Leguía in office by a genuine two-candidate vote, and he used it to launch an eleven-year personal dictatorship that called no further election."),
        ("depression", "Depression, dictatorship and annulled elections", "1931-1963", 1930, 1979,
         "Still on a literacy-restricted franchise, this generation saw two elections annulled outright: Óscar Benavides stopped the count in 1936 when his chosen successor started losing, and the armed forces annulled Víctor Raúl Haya de la Torre's 1962 plurality, then ran the 1963 rerun themselves to keep him from winning it. Manuel Odría's 1950 return to office had no opponent on the ballot."),
        ("restaurada", "Civilian rule and the return of the runoff", "1980-1990", 1980, 1990,
         "The 1979 constitution ended twelve years of military government and, for the first time, let illiterate Peruvians vote; 1980 was the country's first election on a genuinely universal franchise. Belaúnde and García each won outright in one round, and it took Alberto Fujimori's surprise defeat of novelist Mario Vargas Llosa in 1990 to produce Peru's first runoff."),
        ("unicameral", "The 1993 constitution and a fraud-marred re-election", "1991-2025", 1991, 2025,
         "Fujimori's 1992 self-coup produced a new constitution the following year, and with it a legal theory that let him seek a third term in 2000 on a campaign the article documents in detail: a forged-signature ring, army pressure on protest leaders, stolen pre-filled ballots and an opposition boycott of the runoff. He resigned by fax from Japan seven months later. Every other election on this stretch of the page was a genuinely competitive two-round contest, through five presidencies in the five years after 2016."),
        ("bicameral2026", "The Senate returns", "2026-2026", 2026, 2100,
         "Congress restored a Senate for 2026, overruling the 2018 referendum that had abolished it, against a backdrop The Economist and V-Dem both describe as a hybrid or backsliding democracy. Keiko Fujimori won a runoff decided by roughly fifty thousand votes and settled largely by ballots cast abroad, a result her opponent still disputed after the count closed."),
    ],
    "leg": [
        ("colegios", "Caudillos and the electoral college", "1866-1876", 1800, 1884,
         "No Congress results table survives from this period in the source used here; the two general-election articles that do exist carry only the presidential count, on the same literacy-restricted franchise as the era's presidential race."),
        ("aristocratica", "The Aristocratic Republic", "1886-1919", 1885, 1929,
         "No congressional results table survives from the Aristocratic Republic in the source used here either. The presidential pattern of the period, an elite party and a restricted franchise, applied equally to the Congress it sat alongside."),
        ("depression", "A bicameral Congress on a restricted franchise", "1931-1963", 1930, 1979,
         "Peru's Congress was bicameral throughout this period, a Senate and a larger Chamber of Deputies elected the same day as the president, on the same literacy-restricted franchise. This page reports the Chamber of Deputies. No Chamber table survives for 1936, since Congress annulled that whole election, president and legislature together, before the count finished; the Chamber elected alongside Haya de la Torre's annulled 1962 presidential result was dissolved with it."),
        ("restaurada", "The bicameral Congress of the restored democracy", "1980, 1990", 1980, 1990,
         "The Chamber of Deputies grew to 180 seats under the 1979 constitution, elected by open-list proportional representation in regional constituencies, and Popular Action and then APRA took landslide majorities in it alongside their presidential wins. This page continues to report the Chamber of Deputies rather than the smaller Senate elected alongside it."),
        ("unicameral", "A single chamber, 1995 to 2021", "1995-2021", 1991, 2025,
         "The 1993 constitution abolished the Senate and left a single 120-seat Congress of the Republic, expanded to 130 seats from 2011. Every seat is contested nationally in open-list proportional representation across regional districts, the same method the Chamber of Deputies had used before it, which is why this page's seat totals run continuously through the change of chamber name."),
        ("bicameral2026", "A Chamber of Deputies alongside a new Senate", "2026-2026", 2026, 2100,
         "Congress restored a 60-seat Senate for 2026 while keeping the 130-seat Chamber of Deputies this page has reported all along, so the totals here carry straight on from 2021 with no break in the series."),
    ],
}

COLORS = {
    "Popular Force": "#FF6600", "Popular Action": "#FF0000",
    "American Popular Revolutionary Alliance": "#FF0000", "APRA": "#FF0000",
    "Together for Peru": "#8B0000", "Free Peru": "#B22222",
    "Popular Renewal": "#003893", "Party of Good Government": "#0033A0",
    "Civic Party OBRAS": "#F7A800", "Ahora Nación": "#00838F",
    "Country for All": "#4B0082", "Cambio 90": "#2E9E4F",
    "Cambio 90 – New Majority": "#2E9E4F", "C90–NM": "#2E9E4F", "C90-NM": "#2E9E4F",
    "Peru 2000": "#2E9E4F", "Possible Peru": "#00A0DC",
    "Union for Peru": "#8B0000", "Peru Wins": "#B22222",
    "National Solidarity": "#003893", "Alliance for Progress": "#0033A0",
    "Podemos Perú": "#4169B2", "We Are Peru": "#FFD100",
    "Christian People's Party": "#4169B2", "Christian Democrat Party": "#00838F",
    "Democratic Convergence": "#4169B2", "United Left": "#C8102E",
    "National Front of Workers and Peasants": "#C8102E",
    "Revolutionary Union": "#000080", "Concentración Nacional": "#4169B2",
    "National Democratic Front": "#C8102E", "Restoration Party": "#003893",
    "Odriist lists": "#003893", "Odriist National Union": "#003893",
    "Pradist Democratic Movement": "#4169B2", "Constitutional Party": "#4169B2",
    "Democratic Party": "#8B0000", "Civilista Party": "#003893",
    "Democratic Front": "#00A0DC", "Popular Christian Party": "#4169B2",
    "Alliance for the Future": "#FF6600", "Alliance for the Great Change": "#00A0DC",
}

INTRO = {
    "pres": "Every Peruvian presidential election on record here, from the electoral-college count of 1866 to the fraud-clouded margin of June 2026, newest first.",
    "leg": "Every Peruvian congressional election on record here, newest first, reporting the Chamber of Deputies throughout the bicameral years (1931-1990 and 2026) so the series stays on one chamber even where an article prints the Senate's table first.",
}

ERA_FREEDOM = {
    ("pe", "pres", "colegios"): "partial",
    ("pe", "pres", "aristocratica"): "partial",
    ("pe", "pres", "depression"): "partial",
    ("pe", "leg", "colegios"): "partial",
    ("pe", "leg", "aristocratica"): "partial",
    ("pe", "leg", "depression"): "partial",
}
ERA_CAVEAT = {
    ("pe", "pres", "colegios"): "The franchise was limited to literate men, and 1868 was decided in the electoral college rather than by a direct count.",
    ("pe", "pres", "aristocratica"): "The franchise stayed limited to literate men, and the Civilista Party's own machine ran most of these ballots unopposed.",
    ("pe", "pres", "depression"): "The franchise was still limited to literate men, illiterate Peruvians could not vote until the 1979 constitution.",
    ("pe", "leg", "colegios"): "The franchise was limited to literate men.",
    ("pe", "leg", "aristocratica"): "The franchise was limited to literate men, under the same Civilista-dominated system as the presidency.",
    ("pe", "leg", "depression"): "The franchise was still limited to literate men, illiterate Peruvians could not vote until the 1979 constitution.",
}
FREEDOM_OVERRIDE = {
    ("pe", "1868"): ("partial", "Balta's 82% was, in the article's words, 'the vote in the electoral college,' not a direct national count, on a franchise limited to literate men."),
    ("pe", "1886"): ("unfree", "Andrés Avelino Cáceres was the only candidate after supporters of Nicolás de Piérola's Democratic Party boycotted the vote."),
    ("pe", "1894"): ("unfree", "Andrés Avelino Cáceres was elected unopposed."),
    ("pe", "1895"): ("unfree", "Nicolás de Piérola was elected unopposed."),
    ("pe", "1903"): ("unfree", "Manuel Candamo was elected unopposed."),
    ("pe", "1904"): ("unfree", "José Pardo y Barreda was elected unopposed."),
    ("pe", "1908"): ("unfree", "Augusto B. Leguía was elected unopposed."),
    ("pe", "1936"): ("unfree", "Outgoing president Benavides ordered the count halted when the opposition candidate appeared to be winning, and Congress annulled the result under his pressure; he stayed in office."),
    ("pe", "1950"): ("unfree", "Manuel Odría was the only candidate after the electoral authority invalidated his sole rival's registration."),
    ("pe", "1962"): ("unfree", "Haya de la Torre's plurality fell just short of the constitutional one-third threshold, and a military coup annulled the result before Congress could settle it."),
    ("pe", "1963"): ("partial", "The military junta that had annulled 1962 ran this rerun and, in the article's own words, largely controlled the electoral process to keep Haya de la Torre from winning."),
    ("pe", "2000"): ("partial", "Fujimori's third-term bid rested on a legally questionable reading of the term-limit clause; the campaign involved a forged-signature ring, army pressure on protesters and stolen pre-filled ballots, the opposition boycotted the runoff, and an OAS mediation helped force his resignation seven months later."),
    ("pe", "pres-1868"): ("partial", "Balta's 82% was, in the article's words, 'the vote in the electoral college,' not a direct national count, on a franchise limited to literate men."),
    ("pe", "pres-1886"): ("unfree", "Andrés Avelino Cáceres was the only candidate after supporters of Nicolás de Piérola's Democratic Party boycotted the vote."),
    ("pe", "pres-1894"): ("unfree", "Andrés Avelino Cáceres was elected unopposed."),
    ("pe", "pres-1895"): ("unfree", "Nicolás de Piérola was elected unopposed."),
    ("pe", "pres-1903"): ("unfree", "Manuel Candamo was elected unopposed."),
    ("pe", "pres-1904"): ("unfree", "José Pardo y Barreda was elected unopposed."),
    ("pe", "pres-1908"): ("unfree", "Augusto B. Leguía was elected unopposed."),
    ("pe", "pres-1936"): ("unfree", "Outgoing president Benavides ordered the count halted when the opposition candidate appeared to be winning, and Congress annulled the result under his pressure; he stayed in office."),
    ("pe", "pres-1950"): ("unfree", "Manuel Odría was the only candidate after the electoral authority invalidated his sole rival's registration."),
    ("pe", "pres-1962"): ("unfree", "Haya de la Torre's plurality fell just short of the constitutional one-third threshold, and a military coup annulled the result before Congress could settle it."),
    ("pe", "pres-1963"): ("partial", "The military junta that had annulled 1962 ran this rerun and, in the article's own words, largely controlled the electoral process to keep Haya de la Torre from winning."),
    ("pe", "pres-2000"): ("partial", "Fujimori's third-term bid rested on a legally questionable reading of the term-limit clause; the campaign involved a forged-signature ring, army pressure on protesters and stolen pre-filled ballots, the opposition boycotted the runoff, and an OAS mediation helped force his resignation seven months later."),
}

HUB = dict(
    shape="combined", name="Peru", adj="Peruvian", flag="pe", capital=("lima", "Lima"),
    title="Peruvian Elections",
    legNoun="Peruvian Congressional Election", presNoun="Peruvian Presidential Election",
    chamber="the Chamber of Deputies", role="President", roleShort="President",
    presRole="President", presFirst=True, runoffSummary=True,
    legHeadline="Congressional elections",
    desc="Peru's presidential record from the electoral college of 1866 to the disputed runoff of June 2026, and its congressional record from 1931: a literacy bar on the franchise that lasted until 1979, two elections annulled outright, a self-coup that rewrote the constitution, a third-term election the article documents as fraudulent, and a Congress that has swung from two chambers to one and, in 2026, back to two.",
    sources=["Wikipedia: Peruvian presidential and general election articles 1866-2026",
             "Oficina Nacional de Procesos Electorales (ONPE) figures as reported there"],
    tiles=[("Chamber seats", "130", "D'Hondt in 27 districts; a new 60-seat Senate returned in 2026"),
           ("Contests on file", None, None),
           ("June 2026", "50.1%", "Fujimori's runoff margin over Sánchez, disputed by his campaign")],
    how=[("A president elected in two rounds since 1990",
          "A first-round majority wins outright; short of that, the top two meet in a runoff four to eight weeks later. Every election from 1980 was decided this way in principle, but it took Fujimori's surprise 1990 win over Mario Vargas Llosa to produce the first actual runoff."),
         ("A lower house that keeps outliving the upper one",
          "Congress was bicameral from 1931 to 1992, unicameral from 1995 to 2021, and bicameral again from 2026. This page reports the Chamber of Deputies through every one of those changes, the chamber the 1995-2021 unicameral Congress descends from directly, rather than switching to whichever chamber's table a given article happens to print first."),
         ("The literacy bar and the Aristocratic Republic",
          "Illiterate Peruvians could not vote until the 1979 constitution, and for much of the Civilista-dominated period before 1930 that restricted franchise elected a single unopposed candidate. Universal suffrage and the elections it produced both date from 1980."),
         ("Two annulled elections and two self-coups",
          "Benavides annulled the 1936 result when his chosen successor started losing, and a 1962 military coup annulled Haya de la Torre's presidential plurality outright. Fujimori's 1992 self-coup rewrote the constitution that governs every election since 1995, and Pedro Castillo's own attempted self-coup in December 2022 ended his own presidency between two of the elections on this page.")],
    charts=[("Turnout", "From the high eighties and low nineties under the mandatory-voting rules of the 1950s-60s down to 70.1% in 2021, the lowest first-round figure on record, before recovering slightly to 73.8% in 2026."),
            ("The winner's decisive-round share", "Unopposed Aristocratic Republic candidates cleared 100% by definition. Every runoff since 1990 has been far tighter: Fujimori's 1990 landslide aside, no winner has cleared 63%, and three of the last four, 2016, 2021 and 2026, were decided by about a point.")],
    links=[("/countries/peru", "Peru"), ("/elections/co", "Colombian Elections"),
           ("/elections/cl", "Chilean Elections"), ("/elections/br", "Brazilian Elections")],
    records=[],
    colorRules=[],
)
