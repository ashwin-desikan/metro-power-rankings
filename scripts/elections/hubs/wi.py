# -*- coding: utf-8 -*-
"""West Indies Federation, 1958-1962. Defunct 31 May 1962.

One federal election, ever: 25 March 1958, for the House of Representatives
of a federation of ten British Caribbean territories. The Federation
dissolved a little over four years later, before a second election could be
held.
"""

STATUS = "defunct"
DISSOLVED = "1962-05-31"

ERAS = {
    "leg": [
        ("only", "The Federation's only election", "1958", 1900, 2100,
         "Ten British Caribbean territories, from Jamaica to Trinidad and Tobago, elected a single federal House of Representatives on 25 March 1958, the West Indies Federal Labour Party winning 25 of its 45 seats against the Democratic Labour Party's 19 and a single seat for the Barbados National Party. Grantley Adams of Barbados became the Federation's first and only Prime Minister, chosen over Norman Manley and Eric Williams, the premiers of Jamaica and Trinidad, neither of whom had stood for a federal seat and so were ineligible for the post."),
    ],
}

COLORS = {
    "West Indies Federal Labour Party": "#006400",
    "West Indies Democratic Labour Party": "#FFD700",
    "Barbados National Party": "#1B3F8B",
}

INTRO = {
    "leg": "The one election the West Indies Federation ever held, 25 March 1958. The Federation dissolved a little over four years later, before a second could be called.",
}

ERA_FREEDOM = {}
ERA_CAVEAT = {}
FREEDOM_OVERRIDE = {}

HUB = dict(
    shape="leg",
    name="West Indies Federation", adj="West Indian", flag="wi", capital=("port-of-spain", "Port of Spain"),
    title="West Indies Federal Elections",
    legNoun="West Indies Federal Election",
    chamber="the House of Representatives",
    role="Prime Minister", roleShort="PM",
    locale="en-GB",
    chartFrom=None,
    desc="The West Indies Federation held one election, on 25 March 1958, across ten British Caribbean territories from Jamaica to Trinidad and Tobago. The West Indies Federal Labour Party won 25 of 45 seats against the Democratic Labour Party's 19, and Grantley Adams of Barbados became the Federation's only Prime Minister. The Federation dissolved on 31 May 1962, four years and two months later, without holding a second.",
    sources=["Wikipedia: 1958 West Indies federal elections (results tables and infobox)",
             "The Gleaner and caribbeanelections.com figures as reported there"],
    tiles=[("House seats", "45", "across ten territories, Jamaica to Trinidad"),
           ("Elections held", "1", "25 March 1958, the Federation's only one")],
    how=[("Ten territories, one House",
          "Every unit territory of the Federation, from Antigua to Trinidad and Tobago, elected members to a single 45-seat House of Representatives; Jamaica alone returned 17 of them, elected across its parishes and three counties."),
         ("Two Federation-wide parties, built from island parties",
          "The West Indies Federal Labour Party and the Democratic Labour Party were both organised by Jamaican politicians, Norman Manley and Alexander Bustamante, as confederations of each territory's existing local party."),
         ("A Prime Minister who was not the obvious choice",
          "Grantley Adams of Barbados became Prime Minister on a 23-21 vote in the House rather than Norman Manley or Eric Williams, the premiers of Jamaica and Trinidad and Tobago, because neither had contested a federal seat and both were staying in control of their own island governments instead."),
         ("A federation that did not survive to a second election",
          "The Federation dissolved on 31 May 1962, four years and two months after its only election, as Jamaica and Trinidad and Tobago moved toward independence on their own.")],
    charts=[("Turnout", "No turnout figure is recorded for the Federation's only election; the source gives seats won, not votes or turnout."),
            ("The largest party's vote share", "No vote share is recorded either: the source's results table gives each party's seats only, so this line has no points to plot.")],
    links=[("/elections/jm", "Jamaican General Elections"), ("/elections/cu", "Cuban Elections")],
    records=[
        ("Only election held", "25 March 1958", "1958", "The West Indies Federation's first and last election."),
        ("Largest territorial delegation", "17 of 45 seats", "1958", "Jamaica, including the Cayman Islands and the Turks and Caicos Islands, returned more members than any other territory."),
    ],
    colorRules=[
        (r"West Indies Federal Labour|WIFLP", "#006400"),
        (r"Democratic Labour Party|\bDLP\b", "#FFD700"),
        (r"Barbados National", "#1B3F8B"),
    ],
)
