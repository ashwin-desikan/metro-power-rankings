# -*- coding: utf-8 -*-
"""Cuba: the republic's general elections, 1901-1958, and the National
Assembly of People's Power, 1976-2023.

The republic's presidency and House of Representatives were elected inside
the same general-election articles for every contest but 1928, a
presidential-only vote; the House series also carries the Senate table on
thirteen of these articles, printed first, so "leg-large" keeps it on the
larger House throughout. 1958's article carries no Senate table at all
(House only). No election was held between 1959's revolution and 1976's
first National Assembly; that fourteen-year gap is a fact about the source,
not a missing article. 1976, 1981 and 1986 indirectly elected the National
Assembly through municipal assemblies and carry no results table, only the
infobox's own seat total, so those three rows stand as summaries. Every
election since 1993 has been direct, and each one returns a single approved
list, the Communist Party of Cuba and its affiliated mass organisations,
whose declared seat total equals the number of seats.
"""

STATUS = "active"
DISSOLVED = None

ERAS = {
    "leg": [
        ("founding", "The young republic", "1901-1908", 1900, 1908,
         "Cuba's first House of Representatives was elected under American oversight after the 1898 war, and the 1905 election that followed handed the Moderate Party 31 of the House's 32 seats amid an electoral roll a US commission called inflated by 150,000 names. A peace commission sent by Theodore Roosevelt found the 1905 vote so tainted by fraud that it suspended Congress outright the following year."),
        ("interwar", "Fraud, coalitions and a one-party sham", "1912-1928", 1909, 1928,
         "Multi-party coalitions filled the House through the 1920s, but the period's two biggest results carry a shadow: the Liberal Party's 1920 accusation of fraud against the ruling Conservatives was substantiated by the US ambassador and forced new elections in four provinces, and the 1924 vote that made Gerardo Machado's coalition the largest in the House was itself deemed fraudulent before he turned the presidency into a dictatorship. No House was elected in 1928 at all; that year's article covers only Machado's unopposed re-election."),
        ("constitution", "The 1940 constitution's decade", "1936-1958", 1929, 1975,
         "Women voted for the first time in 1936 and seven were elected to the House that year, and the 1940 constitution that followed brought Cuba's most genuinely competitive stretch of multi-party elections, ending with a four-party presidential field in 1948. Batista's 1952 coup pre-empted the next scheduled vote; 1954's contest went ahead with the main opposition candidate withdrawing before polling day, and 1958's, held against a public rebel boycott call, elected a House and a president who never took office once the revolution triumphed that January."),
        ("onerule", "The National Assembly of People's Power", "1976-2023", 1976, 2100,
         "Cuba's post-revolutionary legislature was chosen indirectly through municipal assemblies for its first three elections, 1976 to 1986, before a 1992 electoral law moved to direct election in 1993. Every election since has offered one list, the Communist Party of Cuba and its affiliated mass organisations, and the declared result has always equalled the number of seats: the National Assembly's own size."),
    ],
    "pres": [
        ("founding", "Palma and the first republic", "1901-1908", 1900, 1908,
         "Tomás Estrada Palma won Cuba's first presidential election unopposed after his only rival withdrew citing irregularities, and won a second term in 1905 in a vote a US peace commission later found so tainted by fraud that it suspended the Congress the election had also produced."),
        ("fraud", "A fraudulent decade, then Machado", "1912-1928", 1909, 1928,
         "Real multi-candidate contests decided the presidency through the 1920s, but 1920's result was accepted only after the US ambassador substantiated Liberal fraud accusations against it, and 1924's, which made Gerardo Machado president, was itself deemed fraudulent before he abolished the one-term pledge he had campaigned on. His 1928 re-election had no other candidate on the ballot at all, and the opposition was repressed."),
        ("democratic", "The competitive years", "1936-1948", 1929, 1950,
         "Cuba's most consistently competitive presidential elections, run under the new 1940 constitution, with genuine multi-candidate fields each time and no fraud recorded in the source. 1948's four-way race was the widest field the republic's presidency ever saw."),
        ("batista", "Batista's return", "1954-1958", 1951, 2100,
         "Fulgencio Batista seized power in a 1952 coup that pre-empted that year's scheduled election, then won the 1954 vote after the main opposition candidate withdrew before polling day. His chosen successor won the 1958 election against a public rebel boycott call and never took office: the Cuban Revolution triumphed nine weeks after the vote."),
    ],
}

COLORS = {
    "Liberal Party of Cuba": "#C8102E", "Liberal": "#C8102E", "Liberal Coalition": "#C8102E",
    "National Liberal Party": "#C8102E", "Unionist Liberal Party": "#C8102E",
    "Provincial Liberal Party": "#C8102E",
    "National Conservative Party": "#1B3F8B", "PNC": "#1B3F8B",
    "Moderate Party": "#4C6EF5",
    "Republican": "#5C6BC0", "Republican Party": "#5C6BC0",
    "Republican Democratic Party": "#5C6BC0", "Republican Party of Havana": "#5C6BC0",
    "Federal Republican": "#3949AB", "Federal Republican Party": "#3949AB",
    "Partido Auténtico": "#F2A900", "Auténtico": "#F2A900",
    "Auténtico–Republican Alliance": "#F2A900", "Auténtico-Republican Alliance": "#F2A900",
    "Partido Ortodoxo": "#E8590C", "Ortodoxo": "#E8590C",
    "Popular Socialist Party": "#7A1F1F",
    "Democratic Party": "#2E7D32", "Democratic-Nationalist Party": "#2E7D32",
    "Progressive Action Party": "#6A0DAD", "National Progressive Coalition": "#6A0DAD",
    "Radical Union": "#00838F",
    "Nationalist Union": "#556B2F",
    "Republican Action": "#37474F",
    "Democratic National Association": "#8D6E63",
    "ABC": "#B08D57",
    "Cuban Popular Party": "#00A651", "Popular Party": "#00A651",
    "Cuban Unionist Party": "#8E24AA",
    "Partido del Pueblo Libre": "#0E7C7B",
    "Partido Unión Cubana": "#F9A825",
    "Communist Revolutionary Union": "#7A1F1F",
    "Socialist": "#7A1F1F",
    "Tripartite Coalition": "#9E7B3C",
    "Communist Party of Cuba and affiliated (entire list)": "#A6192E",
    "PCC": "#A6192E",
    "Others": "#9ca3af", "Independents": "#9ca3af",
}

INTRO = {
    "leg": "Every general-election House of Representatives result the Cuban republic recorded, 1901 to 1958, then every National Assembly of People's Power election since, 1976 to 2023, newest first. No election was held between 1959 and 1976, and the National Assembly rows since 1993 carry the same caveat every time: one list, no contest.",
    "pres": "Every presidential election the Cuban republic held, 1901 to 1958, newest first. The republic elected no president after 1958; the National Assembly, not a popular vote, has chosen Cuba's head of government since.",
}

ERA_FREEDOM = {
    ("cu", "leg", "onerule"): "unfree",
}
ERA_CAVEAT = {
    ("cu", "leg", "onerule"): "The Communist Party of Cuba and its affiliated mass organisations are the only names on the ballot; the declared result has equalled the National Assembly's own seat total at every election since 1993, and the first three, 1976 to 1986, were chosen indirectly through municipal assemblies with no results table on file at all.",
}
FREEDOM_OVERRIDE = {
    ("cu", "1905"): ("partial", "A US peace commission later found the vote so tainted by fraud that it suspended the Congress the election had produced; a Cuban minister told American commissioners it was impossible to hold an election in Cuba without fraud."),
    ("cu", "1920"): ("partial", "The Liberal Party accused the ruling coalition of election fraud, the US ambassador substantiated it, and new elections were held in four provinces as a result."),
    ("cu", "1924"): ("partial", "The election was deemed to be fraudulent, and the winning coalition's leader, Gerardo Machado, established a dictatorship that lasted until his overthrow in 1933."),
    ("cu", "1954"): ("partial", "Held after Fulgencio Batista's 1952 coup pre-empted the scheduled election, with the main opposition candidate withdrawing his own candidacy before polling day."),
    ("cu", "1958"): ("partial", "Rebels publicly called for an election boycott before the vote, and the winner and every other elected official were unable to take office once the Cuban Revolution triumphed weeks later."),
    ("cu", "pres-1901"): ("partial", "The only other candidate, Bartolomé Masó, withdrew from the election citing irregularities, though he still received 55,000 votes."),
    ("cu", "pres-1905"): ("partial", "A US peace commission later found the vote so tainted by fraud that it suspended the Congress the election had also produced."),
    ("cu", "pres-1916"): (None, "The article names Mario García Menocal's re-election over Alfredo Zayas but records no vote count or turnout for this contest."),
    ("cu", "pres-1920"): ("partial", "The Liberal Party accused the winning candidate and his Conservatives of election fraud, and the US ambassador to Cuba substantiated it."),
    ("cu", "pres-1924"): ("partial", "The election was deemed to be fraudulent, and the winner, Gerardo Machado, established a dictatorship that lasted until his overthrow in 1933."),
    ("cu", "pres-1928"): ("unfree", "Machado ran as the only candidate after abandoning his one-term pledge, and the opposition was repressed."),
    ("cu", "pres-1954"): ("partial", "The main opposition candidate, Ramón Grau, withdrew his candidacy before election day, after Batista's 1952 coup pre-empted the vote originally scheduled that year."),
    ("cu", "pres-1958"): ("partial", "Rebels publicly called for an election boycott before the vote, and the declared winner was unable to take office once the Cuban Revolution triumphed nine weeks later."),
}

HUB = dict(
    shape="combined",
    name="Cuba", adj="Cuban", flag="cu", capital=("havana", "Havana"),
    title="Cuban Elections",
    legNoun="Cuban Legislative Election", presNoun="Cuban Presidential Election",
    chamber="the National Assembly",
    role="Prime Minister", roleShort="PM",
    presRole="President", presFirst=True,
    locale="en-GB",
    chartFrom=None,
    desc="Every general election the Cuban republic held, 1901 to 1958, its House of Representatives elected alongside a presidency that saw real fraud accusations, one openly unopposed re-election and a revolution that stopped a winner from ever taking office, then every National Assembly of People's Power election since, 1976 to 2023, in which the Communist Party of Cuba's single list has always won exactly as many seats as there are to fill.",
    sources=["Wikipedia: Cuban general, parliamentary and presidential election articles 1901-2023 (results tables and infoboxes)",
             "Dieter Nohlen, Elections in the Americas: A data handbook, as reported there"],
    tiles=[("National Assembly seats", "470", "one list, one result, since 1993"),
           ("Elections since 1901", None, None),
           ("2023 turnout", "75.84%", "down nearly 10 points on 2018, the sharpest drop on record")],
    how=[("A republic that never quite escaped fraud",
          "Cuba's House of Representatives and presidency were elected together in every general election from 1901 to 1958 but one, and the source records real fraud accusations, substantiated by a US ambassador in 1920 and by a peace commission in 1905, at several of them."),
         ("A revolution mid-count",
          "The 1958 election proceeded despite a public rebel boycott call and elected a House and a president neither of whom ever took office: the Cuban Revolution triumphed on 1 January 1959, nine weeks after the vote."),
         ("Fourteen years with no election at all",
          "The republic's Congress was not replaced by anything elected until 1976, when voters chose municipal assembly members who in turn chose the first National Assembly of People's Power."),
         ("One list, every seat, since 1993",
          "Direct election of the National Assembly began in 1993, and the Communist Party of Cuba's single approved list has taken every seat at every election since, its declared result always exactly equal to the Assembly's own size.")],
    charts=[("Turnout", "Turnout in the competitive republic ran as high as 78.70% in 1948; the National Assembly era has recorded turnout above 85% at every election through 2013 before falling to 75.84% in 2023, the lowest the National Assembly has recorded."),
            ("The largest party or list's share", "The republic's largest share on record is the Moderate Party's fraud-tainted 31 of 32 House seats in 1905; every National Assembly election since 1993 has returned the Communist Party of Cuba's list on 100% of the seats it contested.")],
    links=[("/countries/cuba", "Cuba"), ("/elections/ve", "Venezuelan Elections"),
           ("/elections/dd", "East German Elections")],
    records=[
        ("Widest presidential field", "4 candidates", "1948", "Carlos Prío Socarrás's win over Ricardo Núñez Portuondo, Eduardo Chibás and Juan Marinello, the republic's most contested presidential race."),
        ("Largest single-party sweep", "31 of 32 House seats", "1905", "The Moderate Party's result in an election a US peace commission later found so tainted by fraud that it suspended the Congress it produced."),
        ("Longest gap between elections", "14 years", "1959-1976", "No election was held in Cuba between the revolution and the first National Assembly of People's Power."),
        ("Highest National Assembly turnout", "97.64%", "2003", "Recorded a year after Fidel Castro told voters the Assembly's list was, in his words, unanimous by design."),
    ],
    colorRules=[
        (r"Liberal", "#C8102E"),
        (r"National Conservative|\bPNC\b", "#1B3F8B"),
        (r"Moderate", "#4C6EF5"),
        (r"Republican Action", "#37474F"),
        (r"Republic", "#5C6BC0"),
        (r"Auténtico", "#F2A900"),
        (r"Ortodoxo", "#E8590C"),
        (r"Popular Socialist|Communist Revolutionary|Socialist", "#7A1F1F"),
        (r"Democratic National", "#8D6E63"),
        (r"Democratic", "#2E7D32"),
        (r"Progressive Action|National Progressive", "#6A0DAD"),
        (r"Radical Union", "#00838F"),
        (r"Nationalist Union", "#556B2F"),
        (r"Communist Party of Cuba|\bPCC\b", "#A6192E"),
        (r"Independent", "#9ca3af"),
    ],
)
