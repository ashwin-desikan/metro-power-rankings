# -*- coding: utf-8 -*-
"""Canonical club -> (home city, country) for the domestic basketball hub.

Hand-curated. The city is the club's home city as the club itself uses it; the
matcher then resolves city -> metro against metros.json with the country as a
guard, and the EuroLeague hub's own metro_slug takes precedence wherever it has
one. Anything absent here, or whose city does not resolve, is written to the
table with a NULL metro and metro_status='unresolved' rather than guessed.

NOT_A_CLUB holds entries that are real champions but not clubs: Soviet-era
republic and city selections from the Spartakiad years. They get a city where
one genuinely exists (Team Moscow) and are marked so they can be excluded from
any club-level analysis.
"""

NOT_A_CLUB = {
    "Team Moscow", "Team Leningrad", "Team Ural", "Team Ukraine SSR",
    "Ukrainian SSR Team", "Latvian SSR Team", "Estonian SSR Team",
    "Georgian SSR Team",
}

CLUB_CITY = {
    # ---------------- China (CBA) -----------------------------------------
    "Bayi Rockets": ("Ningbo", "China"),
    "Beijing Ducks": ("Beijing", "China"),
    "Guangdong Southern Tigers": ("Guangzhou", "China"),   # Ashwin: Dongguan is Guangzhou
    "Jiangsu Dragons": ("Nanjing", "China"),
    "Liaoning Flying Leopards": ("Shenyang", "China"),
    "Liaoning Hunters": ("Shenyang", "China"),
    "Shandong Gold Lions": ("Jinan", "China"),
    "Shanghai Sharks": ("Shanghai", "China"),
    "Sichuan Blue Whales": ("Chengdu", "China"),
    "Xinjiang Flying Tigers": ("Urumqi", "China"),
    "Zhejiang Golden Bulls": ("Hangzhou", "China"),
    "Zhejiang Guangsha Lions": ("Hangzhou", "China"),

    # ---------------- Spain -----------------------------------------------
    "Real Madrid Baloncesto": ("Madrid", "Spain"),
    "FC Barcelona Basquet": ("Barcelona", "Spain"),
    "Joventut Badalona": ("Badalona", "Spain"),
    "Saski Baskonia": ("Vitoria-Gasteiz", "Spain"),
    "Valencia Basket": ("Valencia", "Spain"),
    "Unicaja Málaga": ("Málaga", "Spain"),
    "Bàsquet Manresa": ("Manresa", "Spain"),
    "CB Estudiantes": ("Madrid", "Spain"),
    "Real Betis Baloncesto": ("Seville", "Spain"),
    "Bilbao Basket": ("Bilbao", "Spain"),
    "CB Gran Canaria": ("Las Palmas", "Spain"),
    "UCAM Murcia": ("Murcia", "Spain"),
    "Picadero JC": ("Barcelona", "Spain"),
    "Orillo Verde Sabadell": ("Sabadell", "Spain"),
    "TAU Cerámica": ("Vitoria-Gasteiz", "Spain"),

    # ---------------- Italy -----------------------------------------------
    "Olimpia Milano": ("Milan", "Italy"),
    "Virtus Bologna": ("Bologna", "Italy"),
    "Fortitudo Bologna": ("Bologna", "Italy"),
    "Pallacanestro Varese": ("Varese", "Italy"),
    "Pallacanestro Cantù": ("Cantù", "Italy"),
    "Mens Sana Basketball Siena": ("Siena", "Italy"),
    "Benetton Treviso": ("Treviso", "Italy"),
    "Reyer Venezia": ("Venice", "Italy"),
    "Dinamo Sassari": ("Sassari", "Italy"),
    "Victoria Libertas": ("Pesaro", "Italy"),
    "Virtus Roma": ("Rome", "Italy"),
    "JuveCaserta Basket": ("Caserta", "Italy"),
    "Pallacanestro Reggiana": ("Reggio Emilia", "Italy"),
    "Aquila Basket Trento": ("Trento", "Italy"),
    "Pallacanestro Brescia": ("Brescia", "Italy"),
    "Libertas Livorno": ("Livorno", "Italy"),
    "Pallacanestro Trieste": ("Trieste", "Italy"),
    "Assi Milano": ("Milan", "Italy"),
    "Internazionale Milano": ("Milan", "Italy"),
    "Ginnastica Roma": ("Rome", "Italy"),
    "Costanza": ("Milan", "Italy"),

    # ---------------- Greece ----------------------------------------------
    "Panathinaikos BC": ("Athens", "Greece"),
    "Olympiacos BC": ("Piraeus", "Greece"),
    "AEK BC": ("Athens", "Greece"),
    "Aris BC": ("Thessaloniki", "Greece"),
    "PAOK BC": ("Thessaloniki", "Greece"),
    "Iraklis BC": ("Thessaloniki", "Greece"),
    "Panellinios BC": ("Athens", "Greece"),
    "Panionios BC": ("Athens", "Greece"),
    "Maroussi BC": ("Athens", "Greece"),
    "Lavrio BC": ("Lavrio", "Greece"),
    "Promitheas Patras": ("Patras", "Greece"),
    "Athens University": ("Athens", "Greece"),
    "Near East": ("Athens", "Greece"),

    # ---------------- Turkey ----------------------------------------------
    "Galatasaray Basketball": ("Istanbul", "Turkey"),
    "Fenerbahçe Basketball": ("Istanbul", "Turkey"),
    "Anadolu Efes": ("Istanbul", "Turkey"),
    "Beşiktaş Basketbol": ("Istanbul", "Turkey"),
    "Daçka Basketbol": ("Istanbul", "Turkey"),
    "Ülker": ("Istanbul", "Turkey"),
    "Eczacıbaşı SK": ("Istanbul", "Turkey"),
    "Beykoz": ("Istanbul", "Turkey"),
    "Modaspor": ("Istanbul", "Turkey"),
    "İTÜ": ("Istanbul", "Turkey"),
    "Karşıyaka Basket": ("Izmir", "Turkey"),
    "Altınordu": ("Izmir", "Turkey"),
    "Tofaş SK": ("Bursa", "Turkey"),
    "Türk Telekom BK": ("Ankara", "Turkey"),
    "Harp Okulu": ("Ankara", "Turkey"),
    "Muhafızgücü": ("Ankara", "Turkey"),

    # ---------------- Adriatic / former Yugoslavia -------------------------
    "KK Partizan": ("Belgrade", "Serbia"),
    "KK Crvena zvezda": ("Belgrade", "Serbia"),
    "OKK Beograd": ("Belgrade", "Serbia"),
    "KK Radnički Belgrade": ("Belgrade", "Serbia"),
    "Yugoslav Army": ("Belgrade", "Serbia"),
    "KK FMP": ("Belgrade", "Serbia"),
    "KK Mega Basket": ("Belgrade", "Serbia"),
    "KK Vršac": ("Vršac", "Serbia"),
    "KK Proleter Zrenjanin": ("Zrenjanin", "Serbia"),
    "KK Radnički Kragujevac": ("Kragujevac", "Serbia"),
    "KK Cibona": ("Zagreb", "Croatia"),
    "KK Cedevita Junior": ("Zagreb", "Croatia"),
    "KK Zagreb": ("Zagreb", "Croatia"),
    "KK Zadar": ("Zadar", "Croatia"),
    "KK Šibenik": ("Šibenik", "Croatia"),
    "KK Split": ("Split", "Croatia"),
    "KK Cedevita Olimpija": ("Ljubljana", "Slovenia"),
    "KK Krka": ("Novo Mesto", "Slovenia"),
    "Pivovarna Laško BC": ("Laško", "Slovenia"),
    "KK Budućnost": ("Podgorica", "Montenegro"),
    "KK Mornar Bar": ("Bar", "Montenegro"),
    "KK Bosna": ("Sarajevo", "Bosnia-Herzegovina"),
    "KK Igokea": ("Laktaši", "Bosnia-Herzegovina"),
    "Dubai Basketball": ("Dubai", "United Arab Emirates"),

    # ---------------- Russia / Soviet Union --------------------------------
    "PBC CSKA Moscow": ("Moscow", "Russia"),
    "MBC Dynamo Moscow": ("Moscow", "Russia"),
    "BC Khimki": ("Moscow", "Russia"),
    "Lokomotiv Moscow": ("Moscow", "Russia"),
    "Stroitel Moscow": ("Moscow", "Russia"),
    "VVS Moscow": ("Moscow", "Russia"),
    "Team Moscow": ("Moscow", "Russia"),
    "BC Spartak Saint Petersburg": ("St. Petersburg", "Russia"),
    "BC Zenit Saint Petersburg": ("St. Petersburg", "Russia"),
    "Burevestnik Leningrad": ("St. Petersburg", "Russia"),
    "GOLIFK Leningrad": ("St. Petersburg", "Russia"),
    "Red Dawn Leningrad": ("St. Petersburg", "Russia"),
    "Team Leningrad": ("St. Petersburg", "Russia"),
    "BC UNICS Kazan": ("Kazan", "Russia"),
    "BC Avtodor": ("Saratov", "Russia"),
    "BC Samara": ("Samara", "Russia"),
    "BC Nizhny Novgorod": ("Nizhny Novgorod", "Russia"),
    "PBC Lokomotiv Kuban": ("Krasnodar", "Russia"),
    "Ural Great Perm": ("Perm", "Russia"),
    "BC Dinamo Tbilisi": ("Tbilisi", "Georgia"),
    "Armia Tbilisi": ("Tbilisi", "Georgia"),
    "Lokomotiv Tbilisi": ("Tbilisi", "Georgia"),
    "Rīgas ASK": ("Riga", "Latvia"),
    "BC Budivelnyk": ("Kyiv", "Ukraine"),
    "CSKA Kyiv": ("Kyiv", "Ukraine"),
    "BC Kalev": ("Tallinn", "Estonia"),
    "USK Tartu": ("Tartu", "Estonia"),
    "SKIF Kaunas": ("Kaunas", "Lithuania"),
    "Alma-Ata": ("Almaty", "Kazakhstan"),

    # ---------------- Israel ------------------------------------------------
    "Maccabi Tel Aviv BC": ("Tel Aviv", "Israel"),
    "Hapoel Tel Aviv BC": ("Tel Aviv", "Israel"),
    "Hapoel Jerusalem BC": ("Jerusalem", "Israel"),
    "Hapoel Holon": ("Holon", "Israel"),
    "Maccabi Haifa BC": ("Haifa", "Israel"),
    "Hapoel Haifa BC": ("Haifa", "Israel"),
    "Maccabi Rishon LeZion BC": ("Rishon LeZion", "Israel"),
    "Maccabi Ra'anana BC": ("Ra'anana", "Israel"),
    "Bnei Herzliya": ("Herzliya", "Israel"),
    "Elitzur Netanya": ("Netanya", "Israel"),
    "Hapoel Eilat": ("Eilat", "Israel"),
    "Ironi Nahariya": ("Nahariya", "Israel"),
    "Ironi Ramat Gan": ("Ramat Gan", "Israel"),
    "Hapoel Ramat Gan": ("Ramat Gan", "Israel"),
    "Maccabi Ashdod": ("Ashdod", "Israel"),

    # ---------------- France ------------------------------------------------
    "ASVEL Basket": ("Villeurbanne", "France"),
    "Limoges CSP": ("Limoges", "France"),
    "Élan Béarnais": ("Pau", "France"),
    "AS Monaco Basket": ("Monaco", "Monaco"),
    "Paris Basketball": ("Paris", "France"),
    "Paris Basket Racing": ("Paris", "France"),
    "PUC": ("Paris", "France"),
    "Stade Français": ("Paris", "France"),
    "Championnet Sports": ("Paris", "France"),
    "Métro": ("Paris", "France"),
    "Metropolitans 92": ("Levallois-Perret", "France"),
    "Nanterre 92": ("Nanterre", "France"),
    "Le Mans Sarthe Basket": ("Le Mans", "France"),
    "SIG Strasbourg": ("Strasbourg", "France"),
    "SLUC Nancy Basket": ("Nancy", "France"),
    "Élan Chalon": ("Chalon-sur-Saône", "France"),
    "Chorale Roanne": ("Roanne", "France"),
    "Cholet Basket": ("Cholet", "France"),
    "Olympique Antibes": ("Antibes", "France"),
    "Orléans Loiret Basket": ("Orléans", "France"),
    "BCM Gravelines": ("Gravelines", "France"),
    "JDA Dijon": ("Dijon", "France"),
    "ASPO Tours": ("Tours", "France"),
    "Berck": ("Berck", "France"),
    "Denain Voltaire": ("Denain", "France"),
    "Grenoble": ("Grenoble", "France"),
    "ESSMG Lyon": ("Lyon", "France"),
    "ICAM Lille": ("Lille", "France"),
    "Olympique Lillois": ("Lille", "France"),
    "École Normale Arras": ("Arras", "France"),
    "Étoile Charleville-Mézières": ("Charleville-Mézières", "France"),
    "Alsace de Bagnolet": ("Bagnolet", "France"),
    "CAUFA Reims": ("Reims", "France"),
    "Union athlétique de Marseille": ("Marseille", "France"),

    # ---------------- Lithuania ---------------------------------------------
    "BC Žalgiris": ("Kaunas", "Lithuania"),
    "BC Rytas": ("Vilnius", "Lithuania"),
    "Neptūnas Klaipėda": ("Klaipėda", "Lithuania"),
    "BC Lietkabelis": ("Panevėžys", "Lithuania"),
    "BC Juventus": ("Utena", "Lithuania"),
    "BC Šiauliai": ("Šiauliai", "Lithuania"),
    "BC Atletas": ("Kaunas", "Lithuania"),
    "BC Olimpas": ("Plungė", "Lithuania"),
    "BC Sakalai": ("Vilnius", "Lithuania"),
}

# Clubs I could not place to a city with confidence. Deliberately empty of
# guesses: these go into the table with metro_status='unresolved'.
UNKNOWN_CITY = {
    "FAM",          # 1920s Paris-region club, initials unresolved
    "SCPO",         # 1930s French club, initials unresolved
    "CAM",          # 1930s French club, initials unresolved
    "Hapoel Gvat/Yagur",   # kibbutz joint side, Jezreel Valley, no metro
    "Hapoel Galil Elyon",  # regional side, Upper Galilee, no single city
    "Hapoel Galil Elyon BC",
    "Hapoel Gilboa Galil",
}
