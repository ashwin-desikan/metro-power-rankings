# -*- coding: utf-8 -*-
"""Hand mapping for clubs whose home city is not inferable from the name.

The rule for every entry: **the city the club plays its home matches in.**
That is what makes an English county side resolvable at all — Yorkshire CCC is
Headingley in Leeds, Somerset is Taunton, Glamorgan is Cardiff. The county is
not a metro; the ground is in one.

These are fed through the SAME two tiers as the automatic matches (metro name,
then workbook member row), so a city name I spell wrongly fails loudly instead
of resolving to something plausible.
"""

HAND_CITY = {
    # ---- English & Welsh county cricket: the county ground's city ---------
    "Derbyshire": "Derby",                     # Derby, County Ground
    "Essex": "Chelmsford",
    "Essex Eagles": "Chelmsford",
    "Glamorgan": "Cardiff",                    # Sophia Gardens
    "Gloucestershire": "Bristol",              # Nevil Road, Bristol
    "Hampshire": "Southampton",                # the Rose Bowl
    "Hampshire Hawks": "Southampton",
    "Kent": "Canterbury",                      # St Lawrence Ground
    "Kent Spitfires": "Canterbury",
    "Lancashire": "Manchester",                # Old Trafford
    "Lancashire Lightning": "Manchester",
    "Leicestershire": "Leicester",
    "Middlesex": "London",                     # Lord's
    "Northamptonshire": "Northampton",
    "Northants Steelbacks": "Northampton",
    "Nottinghamshire": "Nottingham",           # Trent Bridge
    "Notts Outlaws": "Nottingham",
    "Somerset": "Taunton",
    "Surrey": "London",                        # the Oval
    "Sussex": "Brighton & Hove",               # Hove
    "Warwickshire": "Birmingham",              # Edgbaston
    "Worcestershire": "Worcester",
    "Worcestershire Rapids": "Worcester",
    "Yorkshire": "Leeds",                      # Headingley

    # ---- The Hundred -----------------------------------------------------
    "Southern Brave": "Southampton",
    "Trent Rockets": "Nottingham",

    # ---- IPL -------------------------------------------------------------
    "Deccan Chargers": "Hyderabad",
    "Gujarat Titans": "Ahmedabad",
    "Punjab Kings": "Chandigarh",              # Mohali, in the Chandigarh metro
    "Rajasthan Royals": "Jaipur",
    "Royal Challengers Bengaluru": "Bangalore",

    # ---- Caribbean Premier League ---------------------------------------
    "Barbados Royals": "Bridgetown",
    "Guyana Amazon Warriors": "Georgetown (GUY)",
    "Jamaica Tallawahs": "Kingston",
    "Saint Lucia Kings": "Castries",
    "St Kitts": "Basseterre",
    "Nevis Patriots": "Basseterre",            # Warner Park, St Kitts & Nevis
    "Trinbago Knight Riders": "Port of Spain",

    # ---- Bangladesh ------------------------------------------------------
    "Chattogram Royals": "Chittagong",
    "Fortune Barishal": "Barisal",

    # ---- ILT20 (UAE) -----------------------------------------------------
    "Desert Vipers": "Dubai-Sharjah",
    "Dubai Capitals": "Dubai-Sharjah",
    "Gulf Giants": "Dubai-Sharjah",
    "MI Emirates": "Abu Dhabi",

    # ---- SA20 ------------------------------------------------------------
    "Pretoria Capitals": "Johannesburg",     # Ashwin: Pretoria is Johannesburg
    "Sunrisers Eastern Cape": "Port Elizabeth",   # Gqeberha

    # ---- Super Smash (NZ): provincial sides, home ground city ------------
    "Canterbury": "Christchurch",
    "Central Stags": "Napier",
    "Northern Brave": "Hamilton",

    # ---- Rugby league (Britain) ------------------------------------------
    "Batley": "Kirklees",
    "Broughton": "Salford",
    "Castleford": "Wakefield",
    "Catalans": "Perpignan",
    "Dewsbury": "Kirklees",
    "Featherstone Rovers": "Wakefield",
    "Halifax": "Calderdale",
    "Huddersfield": "Kirklees",
    "Hunslet": "Leeds",                        # a district of Leeds
    "Leigh": "Wigan",
    "Manningham": "Bradford",                  # a district of Bradford
    "Swinton": "Salford",
    "Widnes": "Liverpool",                   # Ashwin: Widnes is Liverpool

    # ---- Handball (Germany) ----------------------------------------------
    "Berliner SV 1892": "Berlin",
    "Grün-Weiß Dankersen": "Minden",
    "Rhein-Neckar Löwen": "Mannheim",
    "SG Wallau-Massenheim": "Hofheim am Taunus",

    # ---- KHL --------------------------------------------------------------
    "HC Lev Praha": "Prague",
    "HC MVD": "Balashikha",
    "SKA Saint Petersburg": "St. Petersburg",

    # ---- Volleyball: Italy uses English metro names on this site ---------
    "Asystel Milano": "Milan",
    "Mediolanum Milano": "Milan",
    "Misura Milano": "Milan",
    "Klippan Torino": "Turin",
    "Robe di Kappa Torino": "Turin",
    "Torino": "Turin",
    "Ruini Firenze": "Florence",
    "Diatec Trentino": "Trento",
    "Itas Diatec Trentino": "Trento",
    "Itas Trentino": "Trento",
    "Cucine Lube Civitanova": "Macerata",      # Civitanova Marche

    # ---- Volleyball: Poland ----------------------------------------------
    "Asseco Resovia": "Rzeszów",
    "Ivett Jastrzębie Borynia": "Jastrzębie-Zdrój",
    "Jastrzębski Węgiel": "Jastrzębie-Zdrój",
    "Mostostal Azoty Kędzierzyn-Koźle": "Opole",   # Ashwin
    "ZAKSA Kędzierzyn-Koźle": "Opole",             # Ashwin
}
