# -*- coding: utf-8 -*-
"""Jamaica: House of Representatives general elections, 1944-2025.

The dump carries one article per election year, spelled "Jamaica general
election" for most of the pre-2002 contests and "Jamaican general election"
for 2002 onward; no year appears under both spellings, so the series needs
no deduplication. The default leg matcher, anchored only on the year and
"general election", reads either spelling the same way.
"""

STATUS = "active"
DISSOLVED = None

ERAS = {
    "leg": [
        ("colonial", "Universal suffrage under the crown", "1944-1959", 1900, 1959,
         "Jamaica's first election under universal adult suffrage, in December 1944, launched the two-party system that has run the island ever since: Alexander Bustamante's Jamaica Labour Party against Norman Manley's People's National Party, the two men cousins who had led the 1938 labour disturbances together before splitting into rival parties. Self-government advanced steadily through the 1950s, and by 1959 Jamaica's head of government carried the colonial title of Premier rather than Prime Minister."),
        ("independence", "Independence and its first alternation", "1962-1980", 1960, 1980,
         "Jamaica became independent in August 1962, months after Bustamante's JLP won the last election of the colonial era; the two parties traded power twice more before Michael Manley's PNP won a landslide re-election in 1976 on a democratic-socialist platform. The 1980 election that ended it was the most violent in the island's history, fought amid IMF austerity and gun violence that claimed dozens of lives, and it swept Edward Seaga's JLP to power on a reversal of 38 seats."),
        ("twoparty", "The two-party system since the boycott", "1983-2025", 1981, 2100,
         "The PNP's boycott of the snap 1983 election left the JLP unopposed for every seat; the two parties returned to genuine competition in 1989 and have alternated in office at nearly every election since, with the National Democratic Movement, a JLP splinter, contesting without winning a seat through the 1990s and 2000s. Andrew Holness's JLP won a third consecutive term in September 2025, Jamaica's most recent election."),
    ],
}

COLORS = {
    "Jamaica Labour Party": "#005DAA", "JLP": "#005DAA",
    "People's National Party": "#FF8200", "PNP": "#FF8200",
    "National Democratic Movement": "#00A651", "NDM": "#00A651",
    "National Democratic Movement–Jamaica National Alliance for Unity": "#00A651",
    "Republican Party": "#7B1FA2",
    "Jamaica Democratic Party": "#8D6E63",
    "United Party of Jamaica": "#6D4C41",
    "Farmers' Party": "#66BB6A",
    "Christian Democratic Party": "#1565C0",
    "Independents": "#9ca3af", "Independent": "#9ca3af",
    "Other parties": "#9ca3af",
}

INTRO = {
    "leg": "Every Jamaican general election from the first held under universal adult suffrage in 1944 to September 2025, newest first. 1983's caveat is the sharpest in the series: the PNP boycotted, and the JLP took every seat in a House nobody else contested.",
}

ERA_FREEDOM = {}
ERA_CAVEAT = {}
FREEDOM_OVERRIDE = {
    ("jm", "1983"): ("partial", "The main opposition party, the PNP, boycotted the election to protest the ruling JLP's refusal to update the electoral roll amid allegations of voter fraud; the JLP won all 60 seats with national turnout of about 3%."),
}

HUB = dict(
    shape="leg",
    name="Jamaica", adj="Jamaican", flag="jm", capital=("kingston", "Kingston"),
    title="Jamaican General Elections",
    legNoun="Jamaican General Election",
    chamber="the House of Representatives",
    role="Prime Minister", roleShort="PM",
    locale="en-GB",
    chartFrom=None,
    desc="Every Jamaican general election from the first held under universal adult suffrage in December 1944 to September 2025. The Jamaica Labour Party and the People's National Party have alternated in office through independence in 1962 and the violent 1980 election, save for 1983, when a PNP boycott of the electoral roll dispute left the JLP to take all 60 seats unopposed. Andrew Holness's JLP won a third consecutive term in 2025.",
    sources=["Wikipedia: Jamaican general election articles 1944-2025 (results tables and infoboxes)",
             "Electoral Office of Jamaica figures as reported there"],
    tiles=[("House seats", "63", "grown from 32 at the first election in 1944"),
           ("Elections since 1944", None, None),
           ("2025 turnout", "39.96%", "Holness's JLP held on for a third term")],
    how=[("Two parties since the beginning",
          "Every Jamaican election on record has been decided between the Jamaica Labour Party and the People's National Party, founded within a year of each other by the cousins Alexander Bustamante and Norman Manley out of the 1938 labour disturbances."),
         ("A boycott, not a landslide",
          "1983's all-JLP House did not reflect 60 seats freely won: the PNP boycotted over an outdated electoral roll, and turnout fell to about 3% nationally, the lowest by far in the series."),
         ("Independence changed the title, not the system",
          "Jamaica's head of government held the colonial title of Premier as late as 1962 and Prime Minister after independence that August, but the same first-past-the-post House of Representatives elections have chosen the government throughout."),
         ("A third challenger that never broke through",
          "The National Democratic Movement, formed by JLP defectors in 1995, contested four elections from 1997 to 2011 without winning a seat, and the two founding parties have held the House between them at every election since.")],
    charts=[("Turnout", "Turnout peaked at 87% in the violent 1980 election and collapsed to about 3% in the boycotted 1983 vote before recovering; it has fallen steadily since 2002, to 39.96% in 2025."),
            ("The largest party's seat share", "The JLP's 60 of 60 seats in 1983 is the highest share on record, a result of the PNP's boycott rather than a contested landslide; the PNP's 52 of 60 in 1993 is the largest share won in a fully contested election.")],
    links=[("/countries/jamaica", "Jamaica"), ("/elections/wi", "West Indies Federation"),
           ("/elections/cu", "Cuban Elections")],
    records=[
        ("Highest turnout", "87%", "1980", "The most violent election in Jamaican history, fought amid IMF austerity and gun violence; Seaga's JLP reversed a 38-seat deficit to take power."),
        ("Lowest turnout", "2.68%", "1983", "The PNP boycotted over an unupdated electoral roll, leaving the JLP to win all 60 seats against minor-party and independent candidates in only six of them."),
        ("Largest contested majority", "52 of 60 seats", "1993", "The PNP's result under Prime Minister P. J. Patterson, the largest won in a fully contested Jamaican election."),
        ("Narrowest margin", "50.54% to 49.16%", "2025", "The JLP's third consecutive win, though it lost 14 seats to the PNP in the process."),
    ],
    colorRules=[
        (r"Jamaica Labour|\bJLP\b", "#005DAA"),
        (r"People's National|\bPNP\b", "#FF8200"),
        (r"National Democratic Movement|\bNDM\b", "#00A651"),
        (r"Independent", "#9ca3af"),
    ],
)
