# -*- coding: utf-8 -*-
"""Per-hub editorial module. Copy to <cc>.py and fill every field.

Loaded by hub_editorial.py (names starting with "_" are skipped) and read by
build_hub_json.py and gen_hub_code.py. Everything here is WRITTEN, not parsed:
eras, colours, page copy, honesty labels. Keep the site's rules: no em dashes
anywhere in user-visible prose, one short sentence of caveat per label, and
say only what the source says.
"""

# "active" (default) or "defunct". A defunct polity keeps every election and
# every page; the site drops it from the map and the countdown and prints the
# dissolution instead of a next date.
STATUS = "active"
DISSOLVED = None            # e.g. "3 October 1990"

# (key, label, span, from_year, to_year, blurb). Eras must cover every year
# the series holds; a year outside every era falls into the last one.
ERAS = {
    "leg": [
        ("first", "The first republic", "1957–1973", 1900, 1973, "Two or three sentences on what the period was and why its elections read as they do."),
    ],
    # "pres": [...]   only for shape "pres" or "combined"
}

# Exact party (or candidate-party) name -> colour. Names must match the
# results tables as extracted. Independents take grey by default.
COLORS = {
    "Example Party": "#C8102E",
}

# Chronology intros, one sentence or two, newest-first framing.
INTRO = {
    "leg": "Every ... election since ..., newest first. ...",
    # "pres": "...",
}

# Honesty labels, keyed exactly as in build_hub_json.py. "unfree" is a ritual
# whose result was never in doubt; "partial" a real contest on a restricted
# or tilted field. Override keys: (cc, id) for legislative rows and
# (cc, "pres-" + id) for presidential rows of a combined hub.
ERA_FREEDOM = {
    # ("xx", "leg", "first"): "partial",
}
ERA_CAVEAT = {
    # ("xx", "leg", "first"): "One sentence saying which restriction applied.",
}
FREEDOM_OVERRIDE = {
    # ("xx", "1977"): ("partial", "One sentence in the article's own terms."),
}

HUB = dict(
    shape="leg",                       # "leg" | "pres" | "combined"
    name="Examplia", adj="Examplian", flag="xx", capital=("example-city", "Example City"),
    title="Examplian General Elections",
    legNoun="Examplian General Election",      # heading suffix on a legislative detail page
    # presNoun="Examplian Presidential Election",  # for pres / combined
    chamber="the National Assembly",
    role="Prime Minister", roleShort="PM",     # roleShort is the tag on chronology rows
    # presRole="President", presFirst=True, runoffSummary=True,   # combined hubs
    # legHeadline="Congressional elections",   # combined: heading of the legislative chronology
    locale="en-GB",                            # toLocaleString locale for integers
    chartFrom=None,                            # first year the charts plot, or None for all
    desc="One paragraph, 60 to 90 words, that a reader would want above the fold: the span, the turning points, what the series shows.",
    sources=["Wikipedia: Examplian general election articles 1957-2026 (results tables and infoboxes)",
             "Electoral commission figures as reported there"],
    tiles=[("Seats", "547", "how they are filled, in six words"),
           ("Elections since 1957", None, None),       # None value = contest count
           ("June 2026", "438", "one fact a reader remembers")],
    how=[("Card title, six words at most", "Two to four sentences."),
         ("Second card", "..."),
         ("Third card", "..."),
         ("Fourth card", "...")],
    charts=[("Turnout", "One sentence reading the turnout line."),
            ("The largest party's share", "One sentence reading the share line.")],
    links=[("/countries/examplia", "Examplia"), ("/elections/ke", "Kenyan Elections")],
    records=[
        # ("Label", "value", "election-id", "detail sentence"),
    ],
    colorRules=[
        # (r"regex", "#hex"),   fallbacks after the exact map, in order
    ],
)
