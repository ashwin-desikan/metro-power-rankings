# -*- coding: utf-8 -*-
"""East Germany (German Democratic Republic), 1949-1990. Defunct 3 October 1990.

Eleven Volkskammer elections, but only one of them was a contest: 18 March
1990, called after the Peaceful Revolution, is the sole free vote in the
country's forty-one years and this hub's centre of gravity. The nine
National Front rituals of 1950 to 1986 offered a single preapproved list and
report a yes-vote of 99% or more every time; 1949, the founding vote for the
Third German People's Congress, offered the same single-list mechanism but
recorded a markedly lower 66.07% approval, the lowest the GDR ever saw, so it
carries its own caveat rather than sharing the National Front one. 1967 and
1971 print only a one-row "National Front: 127" summary: their results
tables split the seats column into Elected/East Berlin/Total/change
sub-columns that this extraction cannot read cleanly, so the party breakdown
is left out rather than guessed; the totals themselves (127 of 500) come
straight from the infobox and are correct.
"""

STATUS = "defunct"
DISSOLVED = "3 October 1990"

ERAS = {
    "leg": [
        ("constituent", "The founding vote", "1949", 1900, 1949,
         "East Germany's first election chose the Third German People's Congress, which went on to adopt the country's first constitution and proclaim the German Democratic Republic that October. Voters were offered a single Unity List built around the Socialist Unity Party (SED) and asked only to approve or reject it, and it passed with 66.07% in favour, a margin the sources call the lowest any SED-dominated bloc would ever record."),
        ("nationalfront", "The National Front rituals", "1950–1986", 1950, 1986,
         "For nine elections running, every seat in the Volkskammer was filled by a single National Front list whose seats were apportioned to each bloc party by a fixed quota before a vote was cast, not by the count itself. Voters could only accept or reject the whole slate, and a No vote meant crossing out every name in a watched booth rather than using a secret ballot box, since separate Yes and No boxes were removed after 1950. The list was reported passing with between 99.46% and 99.95% approval at every one of these nine elections."),
        ("peaceful", "The free election", "1990", 1990, 2100,
         "The Volkskammer election of 18 March 1990, called after the Peaceful Revolution swept the SED from its monopoly on power, was the only genuinely competitive vote the German Democratic Republic ever held. The Alliance for Germany, a coalition around a reconstituted Christian Democratic Union campaigning for rapid reunification, won 192 of 400 seats against a Social Democratic Party that had led the early polling. The grand coalition it formed spent four and a half months dismantling the East German state before the Volkskammer voted itself out of existence; the GDR ceased to exist on 3 October 1990."),
    ],
}

COLORS = {
    "Socialist Unity Party": "#8B1A1A",
    "Socialist Unity Party of Germany": "#8B1A1A",
    "Christian Democratic Union": "#000000",
    "Liberal Democratic Party": "#FFD500",
    "Liberal Democratic Party of Germany": "#FFD500",
    "National Democratic Party": "#1F4E79",
    "National Democratic Party of Germany": "#1F4E79",
    "Democratic Farmers' Party": "#4C9A2A",
    "Democratic Farmers' Party of Germany": "#4C9A2A",
    "Free German Trade Union Federation": "#F39200",
    "Free German Youth": "#005CA9",
    "Cultural Association": "#009999",
    "Cultural Association of the GDR": "#009999",
    "Democratic Women's League": "#92278F",
    "Democratic Women's League of Germany": "#92278F",
    "Peasants Mutual Aid Association": "#A9A400",
    "Union of Persecutees of the Nazi Regime": "#707070",
    "Cooperatives": "#9CA3AF",
    "Independents": "#9CA3AF",
    "National Front": "#8C8C8C",
    "Social Democratic Party": "#E3000F",
    "Social Democratic Party (East Berlin)": "#E3000F",
    "Social Democratic Party/SDA (East Berlin)": "#E3000F",
    "Party of Democratic Socialism": "#BE3075",
    "German Social Union": "#0033A0",
    "Democratic Awakening": "#6699CC",
    "Association of Free Democrats": "#FFCB05",
    "Alliance 90": "#46962B",
    "Green Party–Independent Women's Association": "#2E8B57",
    "United Left": "#9CA3AF",
}

INTRO = {
    "leg": "Every Volkskammer election East Germany ever held, from the 1949 vote that founded the republic to the free election of 18 March 1990 that seven months later dissolved it, newest first. Nine of these eleven were National Front rituals whose result was fixed before polling day; only the last one was a real contest.",
}

ERA_FREEDOM = {
    ("dd", "leg", "constituent"): "unfree",
    ("dd", "leg", "nationalfront"): "unfree",
    ("dd", "leg", "peaceful"): None,
}
ERA_CAVEAT = {
    ("dd", "leg", "constituent"): "Voters could only approve or reject a single Unity List dominated by the Socialist Unity Party; it passed with 66.07% in favour, the lowest margin the sources say any SED-dominated bloc would ever record, under conditions they describe as significantly constraining genuine political competition.",
    ("dd", "leg", "nationalfront"): "Voters could only accept or reject one preapproved National Front list whose seats were fixed by quota before the vote, not decided by it; a No vote meant crossing out every name in a watched booth, and the list was reported passing with 99% or more of the vote each time.",
}
FREEDOM_OVERRIDE = {
}

HUB = dict(
    shape="leg",
    name="East Germany", adj="East German", flag="dd", capital=("berlin", "East Berlin"),
    title="East German Volkskammer Elections",
    legNoun="East German Volkskammer Election",
    chamber="the Volkskammer",
    role="Chairman of the Council of Ministers", roleShort="Premier",
    locale="en-GB",
    chartFrom=None,
    desc="Eleven Volkskammer elections span the German Democratic Republic's entire life, from the 1949 vote that installed the Congress that proclaimed the republic to the 18 March 1990 election that voted it out of existence. Between them lie nine National Front rituals, 1950 to 1986, in which one preapproved list took over 99% of the vote every time and each bloc party's seats were fixed before a ballot was cast. Only the last vote, held after the Peaceful Revolution, was a real contest, and the republic dissolved that October.",
    sources=["Wikipedia: East German general election articles 1949-1990 (results tables and infoboxes)",
             "Nohlen & Stöver, Elections in Europe: A data handbook, as reported there"],
    tiles=[("Volkskammer seats", "400", "the house's final size, fixed in 1990"),
           ("Elections since 1949", None, None),
           ("Free elections", "1", "18 March 1990, in 41 years of one-party rule")],
    how=[("A single National Front list, not a choice", "For nine elections from 1950 to 1986, and in its own way in 1949 too, voters were handed one preapproved list rather than a contest between parties. Each bloc party's seats were fixed by quota before a single vote was cast, and the list was reported passing with well over 99% approval in every one of the nine National Front elections."),
         ("Approve or reject, in public", "Voters could only accept or reject the whole list. After 1950 the ballot's separate Yes and No boxes were removed, so casting a No meant visibly using a screened booth to cross out every name while Stasi informants watched the polling site, and abstention itself was treated as an oppositional act."),
         ("A house that barely moved", "Bloc-party seat totals stayed close to fixed across four decades: the SED held between 110 and 127 seats and the smaller parties around 50 or 52 apiece at nearly every election from 1950 to 1986, whatever the vote actually said."),
         ("One free vote, then dissolution", "The Peaceful Revolution forced a genuinely competitive election on 18 March 1990, the only one this hub marks as free. The coalition it produced spent four and a half months dismantling the East German state before the Volkskammer voted itself out of existence on 3 October 1990.")],
    charts=[("Turnout", "Turnout sat above 93% at all eleven of these elections, National Front rituals and the one free vote alike, so this line barely moves and reads more as a floor than as a measure of enthusiasm."),
            ("The largest party's share", "Flat near 99 to 100% at every National Front election with a reported vote share, from 1950 to 1986 (1967 and 1971 print no share at all and are missing from this line), well above the 1949 founding vote's 66.07%, then a single real data point: the Alliance for Germany's 40.82% in the free election of 18 March 1990, the only figure this line shows that an actual vote decided.")],
    links=[("/countries/germany", "Germany"), ("/elections/de", "German Federal Elections")],
    records=[
        ("Highest list share", "99.95%", "1963", "The National Front list's declared vote share, the highest of the nine near-unanimous elections from 1950 to 1986."),
        ("Lowest list share", "66.07%", "1949", "The founding Unity List's approval margin, the lowest the GDR would ever record, in the one election this hub treats separately from the National Front era."),
        ("Lowest turnout", "93.38%", "1990", "Turnout in the only free election fell short of every single-list ritual that came before it."),
        ("Largest coalition total", "192 of 400", "1990", "The Alliance for Germany's combined seats (CDU, German Social Union and Democratic Awakening), nine short of the 201 needed to govern alone."),
    ],
    colorRules=[
    ],
)
