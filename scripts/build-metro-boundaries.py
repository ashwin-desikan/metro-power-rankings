"""
Multi-country metro boundary GeoJSON generator.

Reads:
  - Overture Maps division_area Parquet (filtered to US + CA + MX)
  - MetroAreas.xlsx Counties sheet (rows with Metro Area assignment)
  - public/data/metros.json (for slug resolution)

Writes:
  - public/data/metro-boundaries/{slug}.geojson (one per metro)

Reports unmatched Metro Areas + counties for editorial follow-up.

Dependencies:
  pip install geopandas openpyxl pyarrow

Run from project root:
  python scripts/build-metro-boundaries.py
  python scripts/build-metro-boundaries.py --verbose

Source Parquet path defaults to the user's local layout but is overridable
via the OVERTURE_DIVISION_AREA env var.

Editorial decisions baked in:

US:
1. VA / MD city-vs-county collisions: Fairfax County vs Fairfax (city),
   Baltimore County vs Baltimore. Keyed by (region, base, has_county_suffix).
2. DC: subtype=region, not subtype=county. Special branch routes
   type=Federal District lookups to it.
3. CT planning regions: " Planning Region" treated as a county-style
   admin suffix (CT abolished its 8 counties in 2022).
4. RI Washington County: aliased to Overture's colloquial "South County".
5. NH Coös County: ASCII-fold normalization.
6. NC Nash County: subtype=neighborhood mis-tag fallback.
7. James City / Charles City VA: " City" preserved as part of name.
8. Carson City NV: same — preserved as part of name.

CA:
9. Provincial admin systems vary widely. Census Division (AB/SK/MB/NL),
   County (NB/NS/PEI/ON), Regional District (BC), Regional Municipality
   (ON), District (ON), Region (NT/NU), United Counties (ON), Territory
   equivalent (QC). Suffixes and prefixes stripped to a common base.

MX:
10. 2,453 Municipios + 16 CDMX boroughs ("alcaldías"). All bare-named
    in Overture. ASCII-fold handles accents (Yucatán, Querétaro, etc.).
"""

import os
import json
import re
import sys
import unicodedata
from pathlib import Path
from collections import defaultdict

import geopandas as gpd
import openpyxl
from shapely.ops import unary_union
from shapely.geometry import mapping

SOURCE_PARQUET = os.environ.get(
    "OVERTURE_DIVISION_AREA",
    r"C:\Users\ashwi\Desktop\Projects\MapData\global-division-area.parquet",
)
WORKBOOK = "MetroAreas.xlsx"
METROS_JSON = "public/data/metros.json"
OUT_DIR = Path("public/data/metro-boundaries")

SIMPLIFY_TOLERANCE_DEG = 0.005

US_STATE_TO_ISO = {
    "Alabama": "US-AL", "Alaska": "US-AK", "Arizona": "US-AZ", "Arkansas": "US-AR",
    "California": "US-CA", "Colorado": "US-CO", "Connecticut": "US-CT",
    "Delaware": "US-DE", "DC": "US-DC", "District of Columbia": "US-DC",
    "Florida": "US-FL", "Georgia": "US-GA", "Hawaii": "US-HI", "Idaho": "US-ID",
    "Illinois": "US-IL", "Indiana": "US-IN", "Iowa": "US-IA", "Kansas": "US-KS",
    "Kentucky": "US-KY", "Louisiana": "US-LA", "Maine": "US-ME", "Maryland": "US-MD",
    "Massachusetts": "US-MA", "Michigan": "US-MI", "Minnesota": "US-MN",
    "Mississippi": "US-MS", "Missouri": "US-MO", "Montana": "US-MT",
    "Nebraska": "US-NE", "Nevada": "US-NV", "New Hampshire": "US-NH",
    "New Jersey": "US-NJ", "New Mexico": "US-NM", "New York": "US-NY",
    "North Carolina": "US-NC", "North Dakota": "US-ND", "Ohio": "US-OH",
    "Oklahoma": "US-OK", "Oregon": "US-OR", "Pennsylvania": "US-PA",
    "Rhode Island": "US-RI", "South Carolina": "US-SC", "South Dakota": "US-SD",
    "Tennessee": "US-TN", "Texas": "US-TX", "Utah": "US-UT", "Vermont": "US-VT",
    "Virginia": "US-VA", "Washington": "US-WA", "West Virginia": "US-WV",
    "Wisconsin": "US-WI", "Wyoming": "US-WY",
}

CA_STATE_TO_ISO = {
    "Alberta": "CA-AB", "British Columbia": "CA-BC", "Manitoba": "CA-MB",
    "New Brunswick": "CA-NB", "Newfoundland and Labrador": "CA-NL",
    "Newfoundland": "CA-NL", "Nova Scotia": "CA-NS", "Northwest Territories": "CA-NT",
    "Nunavut": "CA-NU", "Ontario": "CA-ON",
    "Prince Edward Island": "CA-PE", "Quebec": "CA-QC", "Québec": "CA-QC",
    "Saskatchewan": "CA-SK", "Yukon": "CA-YT",
}

MX_STATE_TO_ISO = {
    "Aguascalientes": "MX-AGU", "Baja California": "MX-BCN",
    "Baja California Sur": "MX-BCS", "Campeche": "MX-CAM",
    "Chiapas": "MX-CHP", "Chihuahua": "MX-CHH",
    "Mexico City": "MX-CMX", "Ciudad de México": "MX-CMX", "Distrito Federal": "MX-CMX",
    "Coahuila": "MX-COA", "Colima": "MX-COL", "Durango": "MX-DUR",
    "Guanajuato": "MX-GUA", "Guerrero": "MX-GRO", "Hidalgo": "MX-HID",
    "Jalisco": "MX-JAL", "México": "MX-MEX", "State of Mexico": "MX-MEX",
    "Mexico State": "MX-MEX", "Michoacán": "MX-MIC", "Michoacan": "MX-MIC",
    "Morelos": "MX-MOR", "Nayarit": "MX-NAY",
    "Nuevo León": "MX-NLE", "Nuevo Leon": "MX-NLE",
    "Oaxaca": "MX-OAX", "Puebla": "MX-PUE",
    "Querétaro": "MX-QUE", "Queretaro": "MX-QUE",
    "Quintana Roo": "MX-ROO",
    "San Luis Potosí": "MX-SLP", "San Luis Potosi": "MX-SLP",
    "Sinaloa": "MX-SIN", "Sonora": "MX-SON", "Tabasco": "MX-TAB",
    "Tamaulipas": "MX-TAM", "Tlaxcala": "MX-TLA",
    "Veracruz": "MX-VER", "Yucatán": "MX-YUC", "Yucatan": "MX-YUC",
    "Zacatecas": "MX-ZAC",
}

# Brazil (27 federal units)
BR_STATE_TO_ISO = {
    "Acre": "BR-AC", "Alagoas": "BR-AL", "Amapá": "BR-AP", "Amazonas": "BR-AM",
    "Bahia": "BR-BA", "Ceará": "BR-CE", "Distrito Federal": "BR-DF",
    "Espírito Santo": "BR-ES", "Goiás": "BR-GO", "Maranhão": "BR-MA",
    "Mato Grosso": "BR-MT", "Mato Grosso do Sul": "BR-MS", "Minas Gerais": "BR-MG",
    "Pará": "BR-PA", "Paraíba": "BR-PB", "Paraná": "BR-PR", "Pernambuco": "BR-PE",
    "Piauí": "BR-PI", "Rio de Janeiro": "BR-RJ", "Rio Grande do Norte": "BR-RN",
    "Rio Grande do Sul": "BR-RS", "Rondônia": "BR-RO", "Roraima": "BR-RR",
    "Santa Catarina": "BR-SC", "São Paulo": "BR-SP", "Sergipe": "BR-SE",
    "Tocantins": "BR-TO",
}

# Australia (8 states/territories + offshore)
AU_STATE_TO_ISO = {
    "Australian Capital Territory": "AU-ACT", "New South Wales": "AU-NSW",
    "Northern Territory": "AU-NT", "Queensland": "AU-QLD",
    "South Australia": "AU-SA", "Tasmania": "AU-TAS", "Victoria": "AU-VIC",
    "Western Australia": "AU-WA",
    "Christmas Island": "AU-CX", "Cocos (Keeling) Islands": "AU-CC",
    "Jervis Bay": "AU-JBT", "Norfolk Island": "AU-NF",
}

# India (28 states + 8 union territories)
IN_STATE_TO_ISO = {
    "Andhra Pradesh": "IN-AP", "Arunachal Pradesh": "IN-AR", "Assam": "IN-AS",
    "Bihar": "IN-BR", "Chhattisgarh": "IN-CG", "Goa": "IN-GA", "Gujarat": "IN-GJ",
    "Haryana": "IN-HR", "Himachal Pradesh": "IN-HP", "Jharkhand": "IN-JH",
    "Karnataka": "IN-KA", "Kerala": "IN-KL", "Madhya Pradesh": "IN-MP",
    "Maharashtra": "IN-MH", "Manipur": "IN-MN", "Meghalaya": "IN-ML",
    "Mizoram": "IN-MZ", "Nagaland": "IN-NL", "Odisha": "IN-OD", "Punjab": "IN-PB",
    "Rajasthan": "IN-RJ", "Sikkim": "IN-SK", "Tamil Nadu": "IN-TN",
    "Telangana": "IN-TS", "Tripura": "IN-TR", "Uttar Pradesh": "IN-UP",
    "Uttarakhand": "IN-UK", "West Bengal": "IN-WB",
    # Union Territories:
    "Andaman & Nicobar Islands": "IN-AN", "Andaman and Nicobar Islands": "IN-AN",
    "Chandigarh": "IN-CH",
    "Dadra & Nagar Haveli and Daman & Diu": "IN-DH",
    "Delhi": "IN-DL", "NCT of Delhi": "IN-DL",
    "Jammu & Kashmir": "IN-JK", "Jammu and Kashmir": "IN-JK",
    "Ladakh": "IN-LA", "Lakshadweep": "IN-LD", "Puducherry": "IN-PY",
}

# Japan (47 prefectures, ISO uses numeric: JP-01 to JP-47)
JP_STATE_TO_ISO = {
    "Hokkaido": "JP-01", "Aomori": "JP-02", "Iwate": "JP-03", "Miyagi": "JP-04",
    "Akita": "JP-05", "Yamagata": "JP-06", "Fukushima": "JP-07", "Ibaraki": "JP-08",
    "Tochigi": "JP-09", "Gunma": "JP-10", "Saitama": "JP-11", "Chiba": "JP-12",
    "Tokyo": "JP-13", "Kanagawa": "JP-14", "Niigata": "JP-15", "Toyama": "JP-16",
    "Ishikawa": "JP-17", "Fukui": "JP-18", "Yamanashi": "JP-19", "Nagano": "JP-20",
    "Gifu": "JP-21", "Shizuoka": "JP-22", "Aichi": "JP-23", "Mie": "JP-24",
    "Shiga": "JP-25", "Kyoto": "JP-26", "Osaka": "JP-27", "Hyogo": "JP-28",
    "Nara": "JP-29", "Wakayama": "JP-30", "Tottori": "JP-31", "Shimane": "JP-32",
    "Okayama": "JP-33", "Hiroshima": "JP-34", "Yamaguchi": "JP-35", "Tokushima": "JP-36",
    "Kagawa": "JP-37", "Ehime": "JP-38", "Kochi": "JP-39", "Fukuoka": "JP-40",
    "Saga": "JP-41", "Nagasaki": "JP-42", "Kumamoto": "JP-43", "Oita": "JP-44",
    "Miyazaki": "JP-45", "Kagoshima": "JP-46", "Okinawa": "JP-47",
}

# Netherlands (12 provinces)
NL_STATE_TO_ISO = {
    "Drenthe": "NL-DR", "Flevoland": "NL-FL", "Friesland": "NL-FR",
    "Fryslân": "NL-FR", "Gelderland": "NL-GE", "Groningen": "NL-GR",
    "Limburg": "NL-LI", "Noord-Brabant": "NL-NB", "North Brabant": "NL-NB",
    "Noord-Holland": "NL-NH", "North Holland": "NL-NH",
    "Overijssel": "NL-OV", "Utrecht": "NL-UT",
    "Zeeland": "NL-ZE", "Zuid-Holland": "NL-ZH", "South Holland": "NL-ZH",
}

# Turkey (81 provinces, ISO uses 01-81)
TR_STATE_TO_ISO = {
    "Adana": "TR-01", "Adıyaman": "TR-02", "Afyonkarahisar": "TR-03", "Ağrı": "TR-04",
    "Amasya": "TR-05", "Ankara": "TR-06", "Antalya": "TR-07", "Artvin": "TR-08",
    "Aydın": "TR-09", "Balıkesir": "TR-10", "Bilecik": "TR-11", "Bingöl": "TR-12",
    "Bitlis": "TR-13", "Bolu": "TR-14", "Burdur": "TR-15", "Bursa": "TR-16",
    "Çanakkale": "TR-17", "Çankırı": "TR-18", "Çorum": "TR-19", "Denizli": "TR-20",
    "Diyarbakır": "TR-21", "Edirne": "TR-22", "Elazığ": "TR-23", "Erzincan": "TR-24",
    "Erzurum": "TR-25", "Eskişehir": "TR-26", "Gaziantep": "TR-27", "Giresun": "TR-28",
    "Gümüşhane": "TR-29", "Hakkâri": "TR-30", "Hatay": "TR-31", "Isparta": "TR-32",
    "Mersin": "TR-33", "İstanbul": "TR-34", "Istanbul": "TR-34", "İzmir": "TR-35",
    "Izmir": "TR-35", "Kars": "TR-36", "Kastamonu": "TR-37", "Kayseri": "TR-38",
    "Kırklareli": "TR-39", "Kırşehir": "TR-40", "Kocaeli": "TR-41", "Konya": "TR-42",
    "Kütahya": "TR-43", "Malatya": "TR-44", "Manisa": "TR-45", "Kahramanmaraş": "TR-46",
    "Mardin": "TR-47", "Muğla": "TR-48", "Muş": "TR-49", "Nevşehir": "TR-50",
    "Niğde": "TR-51", "Ordu": "TR-52", "Rize": "TR-53", "Sakarya": "TR-54",
    "Samsun": "TR-55", "Siirt": "TR-56", "Sinop": "TR-57", "Sivas": "TR-58",
    "Tekirdağ": "TR-59", "Tokat": "TR-60", "Trabzon": "TR-61", "Tunceli": "TR-62",
    "Şanlıurfa": "TR-63", "Uşak": "TR-64", "Van": "TR-65", "Yozgat": "TR-66",
    "Zonguldak": "TR-67", "Aksaray": "TR-68", "Bayburt": "TR-69", "Karaman": "TR-70",
    "Kırıkkale": "TR-71", "Batman": "TR-72", "Şırnak": "TR-73", "Bartın": "TR-74",
    "Ardahan": "TR-75", "Iğdır": "TR-76", "Yalova": "TR-77", "Karabük": "TR-78",
    "Kilis": "TR-79", "Osmaniye": "TR-80", "Düzce": "TR-81",
}

# China — workbook uses province names in English/Pinyin. ISO uses CN-XX.
CN_STATE_TO_ISO = {
    "Anhui": "CN-AH", "Beijing": "CN-BJ", "Chongqing": "CN-CQ", "Fujian": "CN-FJ",
    "Gansu": "CN-GS", "Guangdong": "CN-GD", "Guangxi": "CN-GX", "Guizhou": "CN-GZ",
    "Hainan": "CN-HI", "Hebei": "CN-HE", "Heilongjiang": "CN-HL", "Henan": "CN-HA",
    "Hubei": "CN-HB", "Hunan": "CN-HN", "Inner Mongolia": "CN-NM", "Jiangsu": "CN-JS",
    "Jiangxi": "CN-JX", "Jilin": "CN-JL", "Liaoning": "CN-LN", "Ningxia": "CN-NX",
    "Qinghai": "CN-QH", "Shaanxi": "CN-SN", "Shandong": "CN-SD", "Shanghai": "CN-SH",
    "Shanxi": "CN-SX", "Sichuan": "CN-SC", "Tianjin": "CN-TJ", "Tibet": "CN-XZ",
    "Xinjiang": "CN-XJ", "Yunnan": "CN-YN", "Zhejiang": "CN-ZJ",
    # SARs are usually separate countries in workbook but include just in case
    "Hong Kong": "CN-HK", "Macau": "CN-MO", "Taiwan": "CN-TW",
}

# South Korea (17 first-level admin areas, ISO uses numeric)
KR_STATE_TO_ISO = {
    "Seoul": "KR-11", "Busan": "KR-26", "Daegu": "KR-27", "Incheon": "KR-28",
    "Gwangju": "KR-29", "Daejeon": "KR-30", "Ulsan": "KR-31", "Sejong": "KR-50",
    "Gyeonggi": "KR-41", "Gangwon": "KR-42", "Chungcheongbuk": "KR-43",
    "Chungcheongnam": "KR-44", "Jeollabuk": "KR-45", "Jeollanam": "KR-46",
    "Gyeongsangbuk": "KR-47", "Gyeongsangnam": "KR-48", "Jeju": "KR-49",
}

# Russia (85 federal subjects, ISO uses RU-XXX). Mapping common English names
# (workbook uses English transliterations).
RU_STATE_TO_ISO = {
    "Adygea": "RU-AD", "Altai": "RU-AL", "Altai Krai": "RU-ALT",
    "Amur Oblast": "RU-AMU", "Arkhangelsk Oblast": "RU-ARK",
    "Astrakhan Oblast": "RU-AST", "Bashkortostan": "RU-BA",
    "Belgorod Oblast": "RU-BEL", "Bryansk Oblast": "RU-BRY",
    "Buryatia": "RU-BU", "Chechnya": "RU-CE", "Chelyabinsk Oblast": "RU-CHE",
    "Chukotka": "RU-CHU", "Chuvashia": "RU-CU", "Dagestan": "RU-DA",
    "Ingushetia": "RU-IN", "Irkutsk Oblast": "RU-IRK",
    "Ivanovo Oblast": "RU-IVA", "Jewish Autonomous Oblast": "RU-YEV",
    "Kabardino-Balkaria": "RU-KB", "Kaliningrad Oblast": "RU-KGD",
    "Kalmykia": "RU-KL", "Kaluga Oblast": "RU-KLU",
    "Kamchatka Krai": "RU-KAM", "Karachay-Cherkessia": "RU-KC",
    "Karelia": "RU-KR", "Kemerovo Oblast": "RU-KEM",
    "Khabarovsk Krai": "RU-KHA", "Khakassia": "RU-KK",
    "Khanty-Mansi Autonomous Okrug": "RU-KHM", "Khanty-Mansi-Yugra": "RU-KHM", "Yugra": "RU-KHM",
    "Kirov Oblast": "RU-KIR", "Komi": "RU-KO", "Kostroma Oblast": "RU-KOS",
    "Krasnodar Krai": "RU-KDA", "Krasnoyarsk Krai": "RU-KYA",
    "Kurgan Oblast": "RU-KGN", "Kursk Oblast": "RU-KRS",
    "Leningrad Oblast": "RU-LEN", "Lipetsk Oblast": "RU-LIP",
    "Magadan Oblast": "RU-MAG", "Mari El": "RU-ME", "Mordovia": "RU-MO",
    "Moscow": "RU-MOW", "Moscow Oblast": "RU-MOS",
    "Murmansk Oblast": "RU-MUR", "Nenets Autonomous Okrug": "RU-NEN", "Nenets": "RU-NEN",
    "Nizhny Novgorod Oblast": "RU-NIZ", "North Ossetia-Alania": "RU-SE",
    "Novgorod Oblast": "RU-NGR", "Novosibirsk Oblast": "RU-NVS",
    "Omsk Oblast": "RU-OMS", "Orenburg Oblast": "RU-ORE",
    "Oryol Oblast": "RU-ORL", "Penza Oblast": "RU-PNZ",
    "Perm Krai": "RU-PER", "Primorsky Krai": "RU-PRI",
    "Pskov Oblast": "RU-PSK", "Rostov Oblast": "RU-ROS",
    "Ryazan Oblast": "RU-RYA", "Saint Petersburg": "RU-SPE",
    "Sakha": "RU-SA", "Sakha Republic": "RU-SA", "Yakutia": "RU-SA",
    "Sakhalin Oblast": "RU-SAK", "Samara Oblast": "RU-SAM",
    "Saratov Oblast": "RU-SAR", "Smolensk Oblast": "RU-SMO",
    "Stavropol Krai": "RU-STA", "Sverdlovsk Oblast": "RU-SVE",
    "Tambov Oblast": "RU-TAM", "Tatarstan": "RU-TA",
    "Tomsk Oblast": "RU-TOM", "Tula Oblast": "RU-TUL",
    "Tuva": "RU-TY", "Tver Oblast": "RU-TVE",
    "Tyumen Oblast": "RU-TYU", "Udmurtia": "RU-UD",
    "Ulyanovsk Oblast": "RU-ULY", "Vladimir Oblast": "RU-VLA",
    "Volgograd Oblast": "RU-VGG", "Vologda Oblast": "RU-VLG",
    "Voronezh Oblast": "RU-VOR",
    "Yamalo-Nenets Autonomous Okrug": "RU-YAN", "Yamalo-Nenets": "RU-YAN",
    "Yaroslavl Oblast": "RU-YAR", "Zabaykalsky Krai": "RU-ZAB",
}

# Germany (16 states)
DE_STATE_TO_ISO = {
    "Baden-Württemberg": "DE-BW", "Bavaria": "DE-BY", "Bayern": "DE-BY",
    "Berlin": "DE-BE", "Brandenburg": "DE-BB", "Bremen": "DE-HB",
    "Hamburg": "DE-HH", "Hesse": "DE-HE", "Hessen": "DE-HE",
    "Lower Saxony": "DE-NI", "Niedersachsen": "DE-NI",
    "Mecklenburg-Vorpommern": "DE-MV", "Mecklenburg-Western Pomerania": "DE-MV",
    "North Rhine-Westphalia": "DE-NW", "Nordrhein-Westfalen": "DE-NW",
    "Rhineland-Palatinate": "DE-RP", "Rheinland-Pfalz": "DE-RP",
    "Saarland": "DE-SL", "Saxony": "DE-SN", "Sachsen": "DE-SN",
    "Saxony-Anhalt": "DE-ST", "Sachsen-Anhalt": "DE-ST",
    "Schleswig-Holstein": "DE-SH",
    "Thuringia": "DE-TH", "Thüringen": "DE-TH",
}

# France (13 metropolitan regions, post-2016 reorganization)
FR_STATE_TO_ISO = {
    "Auvergne-Rhône-Alpes": "FR-ARA", "Bourgogne-Franche-Comté": "FR-BFC",
    "Brittany": "FR-BRE", "Bretagne": "FR-BRE",
    "Centre-Val de Loire": "FR-CVL", "Corsica": "FR-20R", "Corse": "FR-20R",
    "Grand Est": "FR-GES", "Hauts-de-France": "FR-HDF",
    "Île-de-France": "FR-IDF", "Ile-de-France": "FR-IDF",
    "Normandy": "FR-NOR", "Normandie": "FR-NOR",
    "Nouvelle-Aquitaine": "FR-NAQ", "Occitanie": "FR-OCC",
    "Pays de la Loire": "FR-PDL",
    "Provence-Alpes-Côte d'Azur": "FR-PAC", "Provence-Alpes-Cote d'Azur": "FR-PAC",
}

# Italy (20 regions)
IT_STATE_TO_ISO = {
    "Abruzzo": "IT-65", "Aosta Valley": "IT-23", "Valle d'Aosta": "IT-23",
    "Apulia": "IT-75", "Puglia": "IT-75", "Basilicata": "IT-77",
    "Calabria": "IT-78", "Campania": "IT-72", "Emilia-Romagna": "IT-45",
    "Friuli-Venezia Giulia": "IT-36", "Lazio": "IT-62", "Liguria": "IT-42",
    "Lombardy": "IT-25", "Lombardia": "IT-25",
    "Marche": "IT-57", "Molise": "IT-67", "Piedmont": "IT-21", "Piemonte": "IT-21",
    "Sardinia": "IT-88", "Sardegna": "IT-88", "Sicily": "IT-82", "Sicilia": "IT-82",
    "Trentino-South Tyrol": "IT-32", "Trentino-Alto Adige": "IT-32",
    "Tuscany": "IT-52", "Toscana": "IT-52", "Umbria": "IT-55",
    "Veneto": "IT-34",
}

# Spain (17 autonomous communities + 2 autonomous cities)
ES_STATE_TO_ISO = {
    "Andalusia": "ES-AN", "Andalucía": "ES-AN",
    "Aragon": "ES-AR", "Aragón": "ES-AR",
    "Asturias": "ES-AS",
    "Balearic Islands": "ES-IB", "Islas Baleares": "ES-IB",
    "Basque Country": "ES-PV", "País Vasco": "ES-PV", "Pais Vasco": "ES-PV",
    "Canary Islands": "ES-CN", "Islas Canarias": "ES-CN",
    "Cantabria": "ES-CB",
    "Castile and León": "ES-CL", "Castile-León": "ES-CL", "Castilla y León": "ES-CL",
    "Castilla-La Mancha": "ES-CM",
    "Catalonia": "ES-CT", "Cataluña": "ES-CT", "Catalunya": "ES-CT",
    "Ceuta": "ES-CE", "Extremadura": "ES-EX",
    "Galicia": "ES-GA", "La Rioja": "ES-RI", "Madrid": "ES-MD",
    "Melilla": "ES-ML", "Murcia": "ES-MC",
    "Navarre": "ES-NC", "Navarra": "ES-NC",
    "Valencian Community": "ES-VC", "Valencia": "ES-VC", "Comunitat Valenciana": "ES-VC",
}

# Switzerland (26 cantons)
CH_STATE_TO_ISO = {
    "Aargau": "CH-AG",
    "Appenzell Ausserrhoden": "CH-AR", "Appenzell Innerrhoden": "CH-AI",
    "Basel-Landschaft": "CH-BL", "Basel-Land": "CH-BL",
    "Basel-Stadt": "CH-BS", "Bern": "CH-BE", "Berne": "CH-BE",
    "Fribourg": "CH-FR", "Freiburg": "CH-FR",
    "Geneva": "CH-GE", "Genève": "CH-GE", "Genf": "CH-GE",
    "Glarus": "CH-GL", "Graubünden": "CH-GR", "Grisons": "CH-GR",
    "Jura": "CH-JU", "Lucerne": "CH-LU", "Luzern": "CH-LU",
    "Neuchâtel": "CH-NE", "Neuchatel": "CH-NE",
    "Nidwalden": "CH-NW", "Obwalden": "CH-OW",
    "Schaffhausen": "CH-SH", "Schwyz": "CH-SZ",
    "Solothurn": "CH-SO", "St. Gallen": "CH-SG", "Sankt Gallen": "CH-SG",
    "Thurgau": "CH-TG", "Ticino": "CH-TI",
    "Uri": "CH-UR", "Valais": "CH-VS", "Wallis": "CH-VS",
    "Vaud": "CH-VD", "Zug": "CH-ZG",
    "Zürich": "CH-ZH", "Zurich": "CH-ZH",
}

# Poland (16 voivodeships)
PL_STATE_TO_ISO = {
    "Greater Poland": "PL-30", "Wielkopolska": "PL-30",
    "Kuyavian-Pomeranian": "PL-04", "Kujawsko-Pomorskie": "PL-04",
    "Lesser Poland": "PL-12", "Małopolskie": "PL-12", "Malopolskie": "PL-12",
    "Lower Silesian": "PL-02", "Dolnośląskie": "PL-02", "Dolnoslaskie": "PL-02",
    "Lublin": "PL-06", "Lubelskie": "PL-06",
    "Lubusz": "PL-08", "Lubuskie": "PL-08",
    "Łódź": "PL-10", "Lodzkie": "PL-10", "Łódzkie": "PL-10",
    "Masovian": "PL-14", "Mazowieckie": "PL-14",
    "Opole": "PL-16", "Opolskie": "PL-16",
    "Podkarpackie": "PL-18", "Subcarpathian": "PL-18",
    "Podlaskie": "PL-20", "Pomeranian": "PL-22", "Pomorskie": "PL-22",
    "Silesian": "PL-24", "Śląskie": "PL-24", "Slaskie": "PL-24",
    "Świętokrzyskie": "PL-26", "Swietokrzyskie": "PL-26",
    "Warmian-Masurian": "PL-28", "Warmińsko-Mazurskie": "PL-28",
    "West Pomeranian": "PL-32", "Zachodniopomorskie": "PL-32",
}

# Austria (9 federal states)
AT_STATE_TO_ISO = {
    "Burgenland": "AT-1", "Carinthia": "AT-2", "Kärnten": "AT-2",
    "Lower Austria": "AT-3", "Niederösterreich": "AT-3",
    "Salzburg": "AT-5", "Styria": "AT-6", "Steiermark": "AT-6",
    "Tyrol": "AT-7", "Tirol": "AT-7",
    "Upper Austria": "AT-4", "Oberösterreich": "AT-4",
    "Vienna": "AT-9", "Wien": "AT-9",
    "Vorarlberg": "AT-8",
}

# Portugal (18 districts + 2 autonomous regions)
PT_STATE_TO_ISO = {
    "Aveiro": "PT-01", "Beja": "PT-02", "Braga": "PT-03", "Bragança": "PT-04",
    "Castelo Branco": "PT-05", "Coimbra": "PT-06", "Évora": "PT-07",
    "Faro": "PT-08", "Guarda": "PT-09", "Leiria": "PT-10", "Lisbon": "PT-11",
    "Lisboa": "PT-11", "Portalegre": "PT-12", "Porto": "PT-13",
    "Santarém": "PT-14", "Setúbal": "PT-15", "Viana do Castelo": "PT-16",
    "Vila Real": "PT-17", "Viseu": "PT-18",
    "Azores Islands": "PT-20", "Azores": "PT-20", "Açores": "PT-20",
    "Madeira Islands": "PT-30", "Madeira": "PT-30",
}

# Belgium (11: 10 provinces + Brussels)
BE_STATE_TO_ISO = {
    "Antwerp": "BE-VAN", "Antwerpen": "BE-VAN",
    "Brussels": "BE-BRU", "Brussels-Capital Region": "BE-BRU",
    "East Flanders": "BE-VOV", "Oost-Vlaanderen": "BE-VOV",
    "Flemish Brabant": "BE-VBR", "Vlaams-Brabant": "BE-VBR",
    "Hainaut": "BE-WHT",
    "Liège": "BE-WLG", "Luik": "BE-WLG",
    "Limburg": "BE-VLI",
    "Luxembourg": "BE-WLX",
    "Namur": "BE-WNA",
    "Walloon Brabant": "BE-WBR", "Brabant Wallon": "BE-WBR",
    "West Flanders": "BE-VWV", "West-Vlaanderen": "BE-VWV",
}

# Ireland: workbook uses provinces (Connacht/Leinster/Munster/Ulster), but
# Overture indexes counties (IE-CO, IE-D, IE-G, etc.). Map all four provinces to
# the sentinel "IE" so the country-wide locality fallback handles lookups.
IE_STATE_TO_ISO = {None: "IE"}

# DR Congo (26 provinces post-2015 reform)
CD_STATE_TO_ISO = {
    "Bas-Uele": "CD-BU", "Equateur": "CD-EQ", "Haut-Katanga": "CD-HK",
    "Haut-Lomami": "CD-HL", "Haut-Uele": "CD-HU", "Ituri": "CD-IT",
    "Kasaï": "CD-KS", "Kasai": "CD-KS",
    "Kasaï-Central": "CD-KC", "Kasai-Central": "CD-KC",
    "Kasaï-Oriental": "CD-KE", "Kasai-Oriental": "CD-KE",
    "Kinshasa": "CD-KN", "Kongo Central": "CD-BC",
    "Kwango": "CD-KG", "Kwilu": "CD-KL", "Lomami": "CD-LO",
    "Lualaba": "CD-LU", "Mai-Ndombe": "CD-MN", "Maniema": "CD-MA",
    "Mongala": "CD-MO", "Nord-Kivu": "CD-NK", "Nord-Ubangi": "CD-NU",
    "Sankuru": "CD-SA", "Sud-Kivu": "CD-SK", "Sud-Ubangi": "CD-SU",
    "Tanganyika": "CD-TA", "Tshopo": "CD-TO", "Tshuapa": "CD-TU",
}

# UK constituent countries handled by mapping workbook "England"/"Scotland"/etc.
# to a single-region map. Workbook state column has county/council-area names
# that may not directly resolve, so we use country-level fallback heavily.
# ISO 3166-2 for GB is GB-ENG / GB-SCT / GB-WLS / GB-NIR at the constituent
# country level. Below that there's a deep hierarchy of council areas / 
# unitary authorities / districts. We map workbook country to GB-XXX uniformly,
# treating any state value as the same constituent-country region.
def _make_single_region(iso): return {None: iso}  # any state maps to this iso
GB_ENG_MAP = {None: "GB-ENG"}
GB_SCT_MAP = {None: "GB-SCT"}
GB_WLS_MAP = {None: "GB-WLS"}
GB_NIR_MAP = {None: "GB-NIR"}

# Microstates and small territories: a single region/iso applies to everything.
LU_MAP = {None: "LU"}
MT_MAP = {None: "MT"}
AD_MAP = {None: "AD"}
VA_MAP = {None: "VA"}
LI_MAP = {None: "LI"}
GG_MAP = {None: "GG"}
IM_MAP = {None: "IM"}
JE_MAP = {None: "JE"}

# French overseas territories: each is its own ISO 3166-1 country
GF_MAP = {None: "GF"}  # French Guiana
GP_MAP = {None: "GP"}  # Guadeloupe
MQ_MAP = {None: "MQ"}  # Martinique
RE_MAP = {None: "RE"}  # Réunion
PM_MAP = {None: "PM"}  # Saint Pierre and Miquelon

# Workbook Country column → state-to-ISO map
COUNTRY_TO_STATE_MAP = {
    "United States": US_STATE_TO_ISO,
    "Canada": CA_STATE_TO_ISO,
    "Mexico": MX_STATE_TO_ISO,
    "Brazil": BR_STATE_TO_ISO,
    "Australia": AU_STATE_TO_ISO,
    "India": IN_STATE_TO_ISO,
    "Japan": JP_STATE_TO_ISO,
    "Netherlands": NL_STATE_TO_ISO,
    "Turkey": TR_STATE_TO_ISO,
    "China": CN_STATE_TO_ISO,
    "South Korea": KR_STATE_TO_ISO,
    "Russia": RU_STATE_TO_ISO,
    "Germany": DE_STATE_TO_ISO,
    "France": FR_STATE_TO_ISO,
    "Italy": IT_STATE_TO_ISO,
    "Spain": ES_STATE_TO_ISO,
    "Switzerland": CH_STATE_TO_ISO,
    "Poland": PL_STATE_TO_ISO,
    "Austria": AT_STATE_TO_ISO,
    "Portugal": PT_STATE_TO_ISO,
    "Belgium": BE_STATE_TO_ISO,
    "Ireland": IE_STATE_TO_ISO,
    "Congo DR": CD_STATE_TO_ISO,
    "England": GB_ENG_MAP, "Scotland": GB_SCT_MAP,
    "Wales": GB_WLS_MAP, "Northern Ireland": GB_NIR_MAP,
    "Luxembourg": LU_MAP, "Malta": MT_MAP,
    "Andorra": AD_MAP, "Vatican City": VA_MAP,
    "Liechtenstein": LI_MAP, "Guernsey": GG_MAP,
    "Isle of Man": IM_MAP, "Jersey": JE_MAP,
    "French Guiana": GF_MAP, "Guadeloupe": GP_MAP,
    "Martinique": MQ_MAP, "Réunion": RE_MAP, "Reunion": RE_MAP,
    "Saint Pierre and Miquelon": PM_MAP,
}


# Workbook country name → 2-letter ISO 3166-1 alpha-2 code. Used by the
# country-wide locality / country-polygon fallbacks for places where workbook
# state values don't align with Overture's region tagging (Ireland provinces
# vs counties, Belgium provinces vs regions, microstates with empty regions).
COUNTRY_NAME_TO_ISO = {
    "United States": "US", "Canada": "CA", "Mexico": "MX",
    "Brazil": "BR", "Australia": "AU", "India": "IN",
    "Japan": "JP", "Netherlands": "NL", "Turkey": "TR",
    "China": "CN", "South Korea": "KR", "Russia": "RU",
    "Germany": "DE", "France": "FR", "Italy": "IT",
    "Spain": "ES", "Switzerland": "CH", "Poland": "PL",
    "Austria": "AT", "Portugal": "PT", "Belgium": "BE",
    "Ireland": "IE", "Congo DR": "CD",
    "England": "GB", "Scotland": "GB",
    "Wales": "GB", "Northern Ireland": "GB",
    "Luxembourg": "LU", "Malta": "MT", "Andorra": "AD",
    "Vatican City": "VA", "Liechtenstein": "LI",
    "Guernsey": "GG", "Isle of Man": "IM", "Jersey": "JE",
    "French Guiana": "GF", "Guadeloupe": "GP",
    "Martinique": "MQ", "Réunion": "RE", "Reunion": "RE",
    "Saint Pierre and Miquelon": "PM",
}

# County-style admin suffixes. Stripped during normalization. Presence is
# also used to distinguish suffixed counties (Fairfax County) from bare-name
# independent cities (Fairfax) within the same region.
COUNTY_SUFFIXES = (
    " County", " Counties", " Parish", " Borough", " Census Area",
    " Municipality", " Municipio", " Planning Region",
    # CA-specific:
    " Regional District", " Regional Municipality", " District Municipality",
    " United Counties", " Region", " Rural District", " District",
    # CN-specific (Pinyin, post-ASCII-fold drops tone marks):
    " Shi", " Xian", " Qu", " Zizhizhou",
    # Pudong "Xīnqū" (新区 = "new district") collapses to "Xinqu" after fold
    # without a separating space, so " Qu" alone doesn't strip it.
    " Xinqu", " Xin Qu",
    # JP-specific:
    " Shi", " Ku", " Cho", " Son",
    # KR-specific (with hyphen, since Overture has "Yeosu-si" / "Haeundae-gu"):
    "-si", "-gu", "-gun",
    # RU/EN-alias suffixes:
    " Urban District", " Rural Settlement", " Urban Settlement",
)

# CA-specific prefix patterns. Stripped to leave just the place name.
# "Rural Municipality of Stuartburn" -> "Stuartburn"
# "Village of Elnora" -> "Elnora"
# "Town of Grand Bay-Westfield" -> "Grand Bay-Westfield"
# "Regional Municipality of Niagara" -> "Niagara"
# "Municipality of the County of Richmond" -> "Richmond" (NS oddity)
# Prefix patterns to strip. Covers CA "Rural Municipality of X" /
# "Village of X" forms and MX "Municipio de X" form.
ADMIN_PREFIX_PATTERN = re.compile(
    r"^(rural municipality of|summer village of|regional municipality of|"
    r"municipio de|region of|"
    r"municipality of(?: the county of)?|village of|town of|city of|"
    r"district of|county of|"
    r"ville de|paroisse de|"
    # QC: "Agglomération de Longueuil" → "Longueuil"
    r"agglom(?:e|é)ration de|"
    # AU patterns (Overture: "Shire Of Gingin", "City of Cockburn"):
    r"shire of|borough of|council of)\s+",
    re.IGNORECASE,
)

# Editorial aliases for counties whose Overture name differs from the
# Counties sheet. RI Washington County is colloquially "South County".
COUNTY_ALIASES = {
    ("US-RI", "washington"): "south",
    # BC: Greater Vancouver Regional District is published by Overture as
    # "Metro Vancouver Regional District". Both names are in current use.
    ("CA-BC", "greater vancouver"): "metro vancouver",
    # QC: Workbook uses old MRC name; Overture uses current rebranded form.
    ("CA-QC", "le saguenay-et-son-fjord"): "le fjord-du-saguenay",
    # ON: Haldimand-Norfolk was split into separate counties in 2001;
    # Overture has just "Haldimand County" now.
    ("CA-ON", "haldimand-norfolk"): "haldimand",
    # MX: Fortín de las Flores is the formal name; workbook abbreviates.
    ("MX-VER", "fortin"): "fortin de las flores",
    # IN: workbook uses anglicized "Hardwar" but Overture uses Hindi-correct
    # "Haridwar" (Roorkee metro is in Haridwar district, Uttarakhand).
    ("IN-UK", "hardwar"): "haridwar",
}


# Editorial boundary overrides keyed by metro slug. When a slug appears here,
# the boundary is built from the listed region ISO 3166-2 codes (using the
# region_index "*REGION*" sentinel) instead of from member-county lookups.
#
# Why this exists: Russia's "городской округ" (urban-district) restructuring
# produces disjoint city-center polygons when matched piecemeal — workbook
# entries for surrounding raions resolve to small urban-core polygons rather
# than the full administrative district, leaving rural gaps between matched
# polygons. The cleanest fix for the city + oblast metros is to fall back to
# the region polygons directly.
METRO_BOUNDARY_OVERRIDES = {
    # Moscow city + Moscow Oblast
    "moscow": ["RU-MOW", "RU-MOS"],
    # Saint Petersburg city + Leningrad Oblast
    "saint-petersburg": ["RU-SPE", "RU-LEN"],
}


def has_county_suffix(name: str) -> bool:
    if not name:
        return False
    return any(name.endswith(s) for s in COUNTY_SUFFIXES)


def strip_admin_suffixes(name: str) -> str:
    """Strip County / Parish / Planning Region / Regional District / etc.
    Does NOT strip ' City' (some real names contain it: James City County
    VA, Carson City NV). City-suffixed workbook entries get pre-stripped
    in lookup based on the Type column.
    """
    if not name:
        return ""
    s = str(name).strip()
    # Try the longest suffixes first so " Regional Municipality" beats
    # " Municipality" when both could match.
    for suffix in sorted(COUNTY_SUFFIXES, key=len, reverse=True):
        if s.endswith(suffix):
            s = s[: -len(suffix)].strip()
            break
    return s


def strip_admin_prefixes(name: str) -> str:
    """Strip 'Rural Municipality of', 'Village of', etc. (CA patterns)."""
    return ADMIN_PREFIX_PATTERN.sub("", str(name).strip())


def normalize_base(name: str) -> str:
    # Strip trailing parenthetical / bracketed alt-names. Handles
    # MX "Benito Juárez (Cancún)", QC "L'Assomption (MRC)",
    # "Playas de Rosarito [Rosarito Beach]" (BCN), "X (← Y)" arrow notation.
    name = str(name)
    name = re.sub(r"\s*\([^)]*\)\s*$", "", name).strip()
    name = re.sub(r"\s*\[[^\]]*\]\s*$", "", name).strip()
    # Take everything before " / " separator. Handles ON "Greater Sudbury /
    # Grand Sudbury" by keeping the English form on the left side.
    if " / " in name:
        name = name.split(" / ", 1)[0].strip()
    # ASCII-fold BEFORE suffix matching so diacritic variants resolve
    # consistently (CN Pinyin "Qū" → "Qu" matches the " Qu" suffix; JP "Tōkyō"
    # matches lookup keys; QC "Saint-Élie" matches editorial aliases).
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    s = strip_admin_suffixes(s)
    s = strip_admin_prefixes(s)
    s = s.lower().replace(".", "").replace("'", "").replace("’", "")
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"^saint\s+", "st ", s)
    s = re.sub(r"^sainte\s+", "ste ", s)
    s = re.sub(r"^fort\s+", "ft ", s)
    s = re.sub(r"^mount\s+", "mt ", s)
    s = re.sub(r"^(de|la|le|du|des)\s+", lambda m: m.group(1), s)
    return s


def strip_disambiguator(metro_name: str) -> str:
    return re.sub(r"\s*\([^)]*\)\s*$", "", metro_name).strip()


def load_overture(path):
    print(f"[1/5] Reading Overture Parquet: {path}")
    gdf = gpd.read_parquet(path, columns=["country", "subtype", "region", "names", "geometry"])
    target_countries = [
        "US", "CA", "MX", "BR", "AU", "IN", "JP", "NL", "TR", "CN", "KR", "RU",
        "DE", "FR", "IT", "ES", "CH", "PL", "AT", "PT", "BE", "IE", "CD", "GB",
        "LU", "MT", "AD", "VA", "LI", "GG", "IM", "JE",
        "GF", "GP", "MQ", "RE", "PM",
        # Australian external territories with their own ISO 3166-1 codes:
        "CX", "CC", "NF",
    ]
    nam = gdf[gdf["country"].isin(target_countries)].copy()
    nam["primary"] = nam["names"].apply(lambda n: n.get("primary") if isinstance(n, dict) else None)
    # Keep all rows with a primary name. Microstate territories (GF, GP, MQ,
    # RE, PM, GG, JE, IM, VA, CX, CC, NF) have region=None — those are
    # legitimate top-level polygons we need for country-wide / country-polygon
    # fallbacks. Downstream indexes filter region.notna() where needed.
    nam = nam[nam["primary"].notna()].copy()

    # Brazil has 0 subtype=county rows. All BR municipios live in subtype=locality.
    # Include them in the county index for BR specifically.
    counties_mask = (nam["subtype"] == "county") | (
        (nam["country"] == "BR") & (nam["subtype"] == "locality")
    ) | (
        # Belgium: only 10 county-subtype rows. The 2,821 BE municipalities
        # (gemeenten / communes) live in subtype=locality.
        (nam["country"] == "BE") & (nam["subtype"] == "locality")
    ) | (
        # Luxembourg: communes are subtype=county already (100 rows), no need
        # for locality there. French overseas + microstates: include localities
        # so per-county Overture rows for GP/MQ/RE/GF/GG/JE/IM/AD resolve.
        (nam["country"].isin(["GF", "GP", "MQ", "RE", "GG", "JE", "IM", "AD", "MT"]))
        & (nam["subtype"] == "locality")
    ) | (
        # China: prefecture-level districts (Pudong, Minhang, Wujin, etc.) are
        # subtype=localadmin in Overture, with English aliases like "Pudong"
        # and "Wujin District". The county subtype is sparse for CN; localadmin
        # is the right granularity for the Municipality sheet's District rows.
        (nam["country"] == "CN") & (nam["subtype"] == "localadmin")
    )
    counties = nam[counties_mask].copy()
    # Region-keyed indexes (poly_index, qc_locality_index, locality_index,
    # region_index) require a non-null region. Country-keyed indexes
    # (country_locality_index, country_polygon) handle the null-region rows.
    counties_with_region = counties[counties["region"].notna()].copy()
    counties_with_region["base"] = counties_with_region["primary"].apply(normalize_base)
    counties_with_region["has_suffix"] = counties_with_region["primary"].apply(has_county_suffix)
    counties["base"] = counties["primary"].apply(normalize_base)
    print(f"      county-subtype rows (incl BR localities + microstate localities): {len(counties):,}")
    print(f"        with non-null region (region-keyed index): {len(counties_with_region):,}")

    poly_index = {}
    for _, row in counties_with_region.iterrows():
        # Primary key (the row's primary name)
        key = (row["region"], row["base"], row["has_suffix"])
        poly_index.setdefault(key, row["geometry"])
        # Also index by names.common["en"] alias when available — catches
        # CN/KR/RU where primary is in native script ("合肥市" / "여수시") and
        # workbook uses Latin transliteration ("Hefei", "Yeosu", "Chukotsky").
        names = row["names"]
        if isinstance(names, dict):
            common = names.get("common")
            if common is not None:
                # common may be a list of (lang, value) tuples
                try:
                    common_dict = dict(common)
                except (TypeError, ValueError):
                    common_dict = {}
                en = common_dict.get("en")
                if en:
                    en_base = normalize_base(en)
                    if en_base and en_base != row["base"]:
                        en_key = (row["region"], en_base, has_county_suffix(en))
                        poly_index.setdefault(en_key, row["geometry"])

    # Fallback: subtype=neighborhood rows with county-style suffix.
    # Catches Overture mis-tags like Nash County NC.
    fallback = nam[
        (nam["subtype"] == "neighborhood")
        & nam["primary"].apply(has_county_suffix)
    ].copy()
    fallback["base"] = fallback["primary"].apply(normalize_base)
    added = 0
    for _, row in fallback.iterrows():
        key = (row["region"], row["base"], True)
        if key not in poly_index:
            poly_index[key] = row["geometry"]
            added += 1
    print(f"      mis-tagged county-named neighborhoods recovered: {added}")

    # DC: only tagged subtype=region. Special-cased on lookup.
    dc_region = nam[(nam["region"] == "US-DC") & (nam["subtype"] == "region")]
    dc_poly = dc_region.iloc[0]["geometry"] if len(dc_region) > 0 else None
    print(f"      DC region polygon: {'found' if dc_poly is not None else 'MISSING'}")

    # Quebec amalgamated cities (Montréal, Laval, etc. tagged Type='Territory'
    # in workbook) are subtype=locality in Overture, not subtype=county.
    # Build a separate locality index scoped to CA-QC for fallback lookup.
    qc_locality = nam[(nam["region"] == "CA-QC") & (nam["subtype"] == "locality")].copy()
    qc_locality["base"] = qc_locality["primary"].apply(normalize_base)
    qc_locality_index = {}
    for _, row in qc_locality.iterrows():
        qc_locality_index.setdefault(row["base"], row["geometry"])
    print(f"      QC locality fallback index: {len(qc_locality_index)} entries")

    # Metro-level fallback locality index. Catches metros where the workbook
    # county doesn't exist in Overture but the metro lead-city does. Examples:
    # Calgary (workbook says "Division No. 6", Overture has "Calgary"
    # subtype=county), Bethel AK (workbook says "Bethel" type=Census Area,
    # Overture has "Bethel" subtype=locality), Maykop RU (Cyrillic primary
    # but English alias matches workbook).
    locality_all = nam[nam["subtype"] == "locality"].copy()
    locality_all["base"] = locality_all["primary"].apply(normalize_base)
    locality = locality_all[locality_all["region"].notna()].copy()
    locality_index = {}
    for _, row in locality.iterrows():
        locality_index.setdefault((row["region"], row["base"]), row["geometry"])
        # Also index by english alias for non-Latin scripts
        names = row["names"]
        if isinstance(names, dict):
            common = names.get("common")
            if common is not None:
                try:
                    en = dict(common).get("en")
                except (TypeError, ValueError):
                    en = None
                if en:
                    en_base = normalize_base(en)
                    if en_base and en_base != row["base"]:
                        locality_index.setdefault((row["region"], en_base), row["geometry"])
    print(f"      locality fallback index: {len(locality_index):,} entries")

    # Region fallback index. Catches province-level metros where the entire
    # state is the metro extent (Beijing, Shanghai, Tianjin, Chongqing all
    # tagged subtype=region only; ACT for Canberra; etc.).
    region_subtype = nam[(nam["subtype"] == "region") & nam["region"].notna()].copy()
    region_subtype["base"] = region_subtype["primary"].apply(normalize_base)
    region_index = {}
    for _, row in region_subtype.iterrows():
        region_index.setdefault((row["region"], row["base"]), row["geometry"])
        names = row["names"]
        if isinstance(names, dict):
            common = names.get("common")
            if common is not None:
                try:
                    en = dict(common).get("en")
                except (TypeError, ValueError):
                    en = None
                if en:
                    en_base = normalize_base(en)
                    if en_base and en_base != row["base"]:
                        region_index.setdefault((row["region"], en_base), row["geometry"])
        # Also index by region-iso alone (so Beijing → CN-BJ region polygon
        # is reachable without name match). Stored as (iso, "*REGION*").
        region_index.setdefault((row["region"], "*REGION*"), row["geometry"])
    print(f"      region fallback index: {len(region_index):,} entries")

    # Country-wide locality fallback. Catches workbook entries whose state
    # doesn't resolve to Overture's region tagging (Ireland provinces, Belgium
    # province mismatches, Spain regional mistags, microstate municipalities
    # tagged subtype=region rather than locality). Indexed by
    # (country_code, normalized_base).
    # country_locality_index entries are (geom, region) tuples. The region
    # lets lookup_polygon reject cross-province matches (e.g., Saskatchewan
    # "Brock" was being returned for Ontario "Brock Township" because the
    # country-wide index dropped province context).
    country_locality_index = {}
    def _add_country(c_code, base, geom, region, names_dict):
        country_locality_index.setdefault((c_code, base), (geom, region))
        if isinstance(names_dict, dict):
            common = names_dict.get("common")
            if common is not None:
                try:
                    en = dict(common).get("en")
                except (TypeError, ValueError):
                    en = None
                if en:
                    en_base = normalize_base(en)
                    if en_base and en_base != base:
                        country_locality_index.setdefault((c_code, en_base), (geom, region))
    # Localities (the bulk) — including region=None microstate localities.
    for _, row in locality_all.iterrows():
        _add_country(row["country"], row["base"], row["geometry"], row["region"], row["names"])
    # localadmin rows (BE communes are dually tagged; CD east cities may show up).
    localadmin = nam[nam["subtype"] == "localadmin"].copy()
    localadmin["base"] = localadmin["primary"].apply(normalize_base)
    for _, row in localadmin.iterrows():
        _add_country(row["country"], row["base"], row["geometry"], row["region"], row["names"])
    # subtype=region rows for microstates (AD/LI/MT cities are tagged as region,
    # not locality). Restrict to microstates so we don't pollute the index with
    # full state polygons elsewhere.
    micro_country_codes = {"AD", "LI", "MT", "VA"}
    micro_regions = nam[
        (nam["subtype"] == "region") & nam["country"].isin(micro_country_codes)
    ].copy()
    micro_regions["base"] = micro_regions["primary"].apply(normalize_base)
    for _, row in micro_regions.iterrows():
        _add_country(row["country"], row["base"], row["geometry"], row["region"], row["names"])
    print(f"      country-wide locality fallback: {len(country_locality_index):,} entries")

    # Country polygon fallback for true microstates (Andorra, Vatican, Liechtenstein,
    # Malta) and small dependencies (Guernsey, Jersey, Isle of Man, French overseas,
    # Saint Pierre & Miquelon) where the metro IS the entire jurisdiction.
    # Prefer subtype=country, then subtype=dependency, then largest subtype=region.
    country_polygon = {}
    for c_code in ["AD", "VA", "LI", "MT", "LU", "GG", "JE", "IM",
                   "GF", "GP", "MQ", "RE", "PM", "IE", "BE",
                   "CX", "CC", "NF"]:
        sub_country = nam[(nam["country"] == c_code) & (nam["subtype"] == "country")]
        if len(sub_country) > 0:
            country_polygon[c_code] = sub_country.iloc[0]["geometry"]
            continue
        sub_dep = nam[(nam["country"] == c_code) & (nam["subtype"] == "dependency")]
        if len(sub_dep) > 0:
            country_polygon[c_code] = sub_dep.iloc[0]["geometry"]
            continue
        # Largest region polygon as last resort (PM has only locality+dependency
        # so this is mostly a no-op for true microstates).
        sub_region = nam[(nam["country"] == c_code) & (nam["subtype"] == "region")]
        if len(sub_region) > 0:
            country_polygon[c_code] = sub_region.iloc[0]["geometry"]
    print(f"      country polygon fallback: {len(country_polygon)} entries")

    return (poly_index, dc_poly, qc_locality_index, locality_index,
            region_index, country_locality_index, country_polygon)


# Tokyo Special Wards Area: workbook treats the 23 special wards (区) as one row.
# Overture has each ward as subtype=county with English primary name. We expand
# the workbook entry into 23 county-style rows so each polygon resolves cleanly.
TOKYO_23_WARDS = [
    "Chiyoda", "Chuo", "Minato", "Shinjuku", "Bunkyo", "Taito", "Sumida",
    "Koto", "Shinagawa", "Meguro", "Ota", "Setagaya", "Shibuya", "Nakano",
    "Suginami", "Toshima", "Kita", "Arakawa", "Itabashi", "Nerima", "Adachi",
    "Katsushika", "Edogawa",
]


def load_counties_sheet(path):
    print(f"[2/5] Reading Counties sheet from {path}")
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb["Counties"]
    rows = list(ws.iter_rows(values_only=True))
    out = []
    skipped_country = defaultdict(int)
    for r in rows[1:]:
        if not r:
            continue
        country = r[0]
        if country not in COUNTRY_TO_STATE_MAP:
            if country:
                skipped_country[country] += 1
            continue
        # User editorial choice: for China, use the Municipality sheet only.
        # Counties sheet has prefecture-level cities (Sūzhōu Shì, Wúxī Shì) that
        # bloat metro boundaries when mixed with district-level Municipality
        # rows; the Municipality sheet is the canonical source.
        if country == "China":
            skipped_country["China (using Municipality)"] += 1
            continue
        county = r[1]
        state_full = r[2]
        county_type = r[6]
        metro_area = r[7]
        if not (county and state_full and metro_area):
            continue
        # Tokyo Special Wards Area: expand single row into 23 ward rows.
        if (country == "Japan" and state_full == "Tokyo"
                and str(county_type or "").strip() == "Special Wards Area"):
            state_map = COUNTRY_TO_STATE_MAP[country]
            iso = state_map.get(str(state_full).strip()) if None not in state_map else state_map[None]
            for ward in TOKYO_23_WARDS:
                out.append({
                    "country": country,
                    "county": ward,
                    "state_full": str(state_full).strip(),
                    "type": "Special Ward",
                    "metro_display": str(metro_area).strip(),
                    "norm": normalize_base(ward),
                    "iso": iso,
                    "src": "Counties",
                })
            continue
        state_map = COUNTRY_TO_STATE_MAP[country]
        if None in state_map:
            iso = state_map[None]
        else:
            iso = state_map.get(str(state_full).strip())
        out.append({
            "country": country,
            "county": str(county).strip(),
            "state_full": str(state_full).strip(),
            "type": str(county_type or "").strip(),
            "metro_display": str(metro_area).strip(),
            "norm": normalize_base(str(county).strip()),
            "iso": iso,
            "src": "Counties",
        })
    print(f"      rows kept (US/CA/MX with metro): {len(out):,}")
    by_country = defaultdict(int)
    for c in out:
        by_country[c["country"]] += 1
    for k, v in by_country.items():
        print(f"        {k}: {v:,}")
    if skipped_country:
        print(f"      countries skipped (not yet supported):")
        for k, v in sorted(skipped_country.items(), key=lambda x: -x[1])[:10]:
            print(f"        {k}: {v}")
    return out


def load_municipality_sheet(path):
    """Read MetroAreas.xlsx Municipality sheet (same dict shape as load_counties_sheet).
    Different column layout: country=col 1, name=col 2, state=col 4, type=col 7,
    metro=col 6. Used for Europe + UK constituent countries + microstates +
    French overseas territories where boundary data is at municipality level.
    For COUNTRY_TO_STATE_MAP entries that are single-region (microstates, GB
    constituents, French overseas), any state value resolves to the same ISO.
    """
    print(f"[2b/5] Reading Municipality sheet from {path}")
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb["Municipality"]
    rows = list(ws.iter_rows(values_only=True))
    out = []
    skipped_country = defaultdict(int)
    for r in rows[1:]:
        if not r:
            continue
        country = r[1]
        if country not in COUNTRY_TO_STATE_MAP:
            if country:
                skipped_country[country] += 1
            continue
        municipality = r[2]
        state_full = r[4]
        county_type = r[7]
        metro_area = r[6]
        if not (municipality and metro_area):
            continue
        state_map = COUNTRY_TO_STATE_MAP[country]
        # Single-region maps (microstates etc.) have None as the only key
        # and resolve any state value to that single ISO.
        if None in state_map:
            iso = state_map[None]
        else:
            iso = state_map.get(str(state_full).strip()) if state_full else None
        out.append({
            "country": country,
            "county": str(municipality).strip(),
            "state_full": str(state_full or "").strip(),
            "type": str(county_type or "").strip(),
            "metro_display": str(metro_area).strip(),
            "norm": normalize_base(str(municipality).strip()),
            "iso": iso,
            "src": "Municipality",
        })
    print(f"      Municipality rows kept: {len(out):,}")
    by_country = defaultdict(int)
    for c in out:
        by_country[c["country"]] += 1
    for k, v in sorted(by_country.items(), key=lambda x: -x[1])[:15]:
        print(f"        {k}: {v:,}")
    return out


def load_metros_index(path):
    """Build (norm_name, country) -> slug index. Country is used as
    disambiguator so 'York' UK doesn't collide with 'York' (PA, US).
    """
    with open(path, "r", encoding="utf-8") as f:
        metros = json.load(f)
    # metros.json may use "United Kingdom" while the workbook uses
    # constituent countries. Map both directions.
    UK_MAPPING = {"United Kingdom"}
    idx = {}
    for m in metros:
        country = m.get("country", "")
        if country not in COUNTRY_TO_STATE_MAP and country not in UK_MAPPING:
            continue
        name_norm = strip_disambiguator(m.get("name", "")).lower().strip()
        state = m.get("primaryState") or ""
        idx[(name_norm, state, country)] = m["slug"]
        idx.setdefault((name_norm, None, country), m["slug"])
        # If metro is in UK, also index by each constituent country
        # so workbook entries with country=England/Scotland/Wales/NIR resolve.
        if country in UK_MAPPING:
            for constituent in ("England", "Scotland", "Wales", "Northern Ireland"):
                idx.setdefault((name_norm, state, constituent), m["slug"])
                idx.setdefault((name_norm, None, constituent), m["slug"])
    return idx


def resolve_slug(c, metros_index):
    base = strip_disambiguator(c["metro_display"]).lower().strip()
    return (
        metros_index.get((base, c["state_full"], c["country"]))
        or metros_index.get((base, None, c["country"]))
    )


def lookup_polygon(c, poly_index, dc_poly, qc_locality_index,
                   country_locality_index=None, locality_index=None):
    iso = c["iso"]
    norm = c["norm"]
    type_l = c["type"].lower() if c["type"] else ""
    src = c.get("src")
    label = f"{c['county']} ({iso or '???'}, type={c['type']!r})"

    # DC special case
    if "federal district" in type_l or iso == "US-DC":
        if dc_poly is not None:
            return dc_poly, None
        return None, label + " [no DC region polygon]"

    # Country-code resolution for country-wide fallbacks (used by IE province
    # workbook entries, microstates, and as a last resort for region mistags).
    country_code = COUNTRY_NAME_TO_ISO.get(c.get("country"))

    def _country_lookup(name):
        # Country-wide fallback with region guard: rejects a match whose
        # polygon region differs from the workbook iso. Prevents cross-province
        # leakage (e.g., Saskatchewan "Brock" was being returned for Ontario
        # "Brock Township" because the country-wide index dropped province context).
        if not (country_code and country_locality_index is not None):
            return None
        entry = country_locality_index.get((country_code, name))
        if entry is None:
            return None
        geom, geom_region = entry
        if iso and geom_region and geom_region != iso:
            return None  # cross-region — reject
        return geom

    if not iso:
        # No iso (Ireland provinces, microstates with sentinel iso=country_code,
        # etc.). Try country-wide locality lookup. No region guard since iso
        # is None by definition here.
        if country_code and country_locality_index is not None:
            entry = country_locality_index.get((country_code, norm))
            if entry is not None:
                return entry[0], None
        return None, label + " [state not in ISO map]"

    # QC amalgamated cities (Type='Territory'): consult locality index first.
    # These are single-city merged municipalities (Montréal, Laval, Longueuil,
    # Gatineau, Quebec, Lévis, Sherbrooke, etc.) that exist in Overture as
    # subtype=locality rather than subtype=county.
    if iso == "CA-QC" and "territory" in type_l:
        if norm in qc_locality_index:
            return qc_locality_index[norm], None

    # Editorial aliases (e.g. RI Washington -> South)
    alias_key = (iso, norm)
    if alias_key in COUNTY_ALIASES:
        norm = COUNTY_ALIASES[alias_key]

    is_city_type = type_l == "city"
    primary_key = (iso, norm, not is_city_type)
    fallback_key = (iso, norm, is_city_type)

    # Municipality-sheet rows (CA + Europe) are sub-county by editorial intent.
    # Try region-keyed locality FIRST so a Town/Township/Village/Parish doesn't
    # accidentally claim a same-name County polygon (e.g., Perth Town in Lanark
    # was matching Perth County in southwestern Ontario).
    if src == "Municipality" and locality_index is not None:
        geom = locality_index.get((iso, norm))
        if geom is not None:
            return geom, None

    if primary_key in poly_index:
        return poly_index[primary_key], None
    if fallback_key in poly_index:
        return poly_index[fallback_key], None

    # type='City' fallback: try with " city" suffix stripped
    if is_city_type and norm.endswith(" city"):
        stripped = norm[: -len(" city")].strip()
        for k in [(iso, stripped, False), (iso, stripped, True)]:
            if k in poly_index:
                return poly_index[k], None

    # Region-keyed locality lookup (Counties-sheet rows reach this only after
    # the county tier misses; preserves province context before we drop down to
    # the country-wide fallback).
    if locality_index is not None:
        geom = locality_index.get((iso, norm))
        if geom is not None:
            return geom, None

    # Country-wide locality fallback. Catches Spain region mistags (Burgos
    # tagged ES-AN by Overture), Belgium province mismatches. Region guard
    # prevents this tier from picking up a same-name match in a different
    # province (the source of the Canada cross-province leakage bug).
    geom = _country_lookup(norm)
    if geom is not None:
        return geom, None

    return None, label


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    (poly_index, dc_poly, qc_locality_index, locality_index, region_index,
     country_locality_index, country_polygon) = load_overture(SOURCE_PARQUET)
    counties = load_counties_sheet(WORKBOOK)
    municipalities = load_municipality_sheet(WORKBOOK)
    counties.extend(municipalities)
    metros_index = load_metros_index(METROS_JSON)

    print("[3/5] Grouping by metro slug")
    by_slug = defaultdict(list)
    unmatched_metros = set()
    for c in counties:
        slug = resolve_slug(c, metros_index)
        if slug is None:
            unmatched_metros.add(f"{c['metro_display']} ({c['country']})")
            continue
        by_slug[slug].append(c)
    # Dedupe within each metro: when the same (iso, norm) appears in both
    # Counties and Municipality sheets (e.g., Hamilton ON, where the workbook
    # has the city listed both as a Census Division and as a City), prefer the
    # Counties row. The Counties row hits poly_index (the actual amalgamated
    # city polygon); the Municipality row would otherwise fire locality_index
    # and pick up an unrelated same-name township.
    deduped_by_slug = {}
    for slug, members in by_slug.items():
        counties_keys = {(m["iso"], m["norm"]) for m in members if m.get("src") == "Counties"}
        kept = []
        for m in members:
            if m.get("src") == "Municipality" and (m["iso"], m["norm"]) in counties_keys:
                continue
            kept.append(m)
        deduped_by_slug[slug] = kept
    by_slug = deduped_by_slug
    print(f"      Metros resolved to slugs: {len(by_slug)}")
    print(f"      Metros unmatched (display name not in metros.json): {len(unmatched_metros)}")
    if unmatched_metros and "--verbose" in sys.argv:
        for m in sorted(unmatched_metros)[:20]:
            print(f"        - {m}")
        if len(unmatched_metros) > 20:
            print(f"        ... and {len(unmatched_metros) - 20} more")

    print("[4/5] Resolving polygons + dissolving per metro")
    written = 0
    skipped = 0
    skipped_metros = []
    unmatched_total = 0
    metro_fallback_count = 0
    for slug, members in by_slug.items():
        polys = []
        unmatched_local = []

        # Editorial boundary override: use region polygons directly.
        if slug in METRO_BOUNDARY_OVERRIDES:
            for region_iso in METRO_BOUNDARY_OVERRIDES[slug]:
                geom = region_index.get((region_iso, "*REGION*"))
                if geom is not None:
                    polys.append(geom)
            if polys:
                # Mark members as recovered via override so the unmatched
                # array reads cleanly.
                unmatched_local = [
                    f"[boundary override: {' + '.join(METRO_BOUNDARY_OVERRIDES[slug])}]"
                ]
                metro_fallback_count += 1

        if not polys:
            for c in members:
                geom, fail = lookup_polygon(c, poly_index, dc_poly, qc_locality_index,
                                             country_locality_index=country_locality_index,
                                             locality_index=locality_index)
                if geom is not None:
                    polys.append(geom)
                if fail:
                    unmatched_local.append(fail)

        # Metro-level fallback: when no member counties match, try the metro's
        # display name as a county or locality lookup. Catches CA Census
        # Divisions (Calgary, Edmonton, Saskatoon, etc.) that don't exist in
        # Overture but where the lead city does.
        if not polys and members:
            iso = members[0]["iso"]
            metro_display = members[0]["metro_display"]

            # AU external territories: workbook says country=Australia but the
            # data is under their own ISO 3166-1 codes (CX/CC/NF). Route by
            # metro display name.
            au_external = {
                "Christmas Island": "CX",
                "Cocos (Keeling) Islands": "CC",
                "Norfolk Island": "NF",
            }
            if members[0]["country"] == "Australia" and metro_display in au_external:
                ext_code = au_external[metro_display]
                ext_geom = country_polygon.get(ext_code)
                if ext_geom is not None:
                    polys.append(ext_geom)
                    metro_fallback_count += 1
                    unmatched_local = [f"[recovered via AU external territory polygon: {metro_display}]"]

            if not polys and iso and metro_display:
                norm_metro = normalize_base(strip_disambiguator(metro_display))
                # Try county index in both has-suffix flavors
                fallback_geom = None
                for k in [(iso, norm_metro, True), (iso, norm_metro, False)]:
                    if k in poly_index:
                        fallback_geom = poly_index[k]
                        break
                # Try locality index
                if fallback_geom is None:
                    fallback_geom = locality_index.get((iso, norm_metro))
                # Try region index (province-level metros: Beijing, Shanghai,
                # ACT, Tianjin, etc. that exist only as subtype=region).
                if fallback_geom is None:
                    fallback_geom = region_index.get((iso, norm_metro))
                # Last resort: the whole region polygon for cases where the
                # metro IS the entire province (Beijing CN-BJ, Shanghai CN-SH,
                # Australian Capital Territory AU-ACT). Workbook metro_display
                # may not match the region's primary name. Gated to len==1 so
                # we don't return e.g. all of Newfoundland for Corner Brook
                # when Overture coverage of NL is too sparse to resolve any of
                # its 27 member localities.
                if fallback_geom is None and iso and len(members) == 1:
                    fallback_geom = region_index.get((iso, "*REGION*"))
                # Country-wide locality fallback. Unpacks the (geom, region)
                # tuple stored in the index. No region guard here since this is
                # the metro-name fallback used when no per-member match worked.
                if fallback_geom is None:
                    country_code = COUNTRY_NAME_TO_ISO.get(members[0]["country"])
                    if country_code:
                        entry = country_locality_index.get(
                            (country_code, norm_metro))
                        if entry is not None:
                            fallback_geom = entry[0]
                # Country polygon fallback (Andorra, Vatican, Liechtenstein,
                # Malta, French overseas — metro IS the country/dependency).
                if fallback_geom is None:
                    country_code = COUNTRY_NAME_TO_ISO.get(members[0]["country"])
                    if country_code:
                        fallback_geom = country_polygon.get(country_code)
                if fallback_geom is not None:
                    polys.append(fallback_geom)
                    metro_fallback_count += 1
                    # Replace per-member misses with a single "recovered" note
                    # so the boundary file's unmatched array reads cleanly.
                    unmatched_local = [f"[recovered via metro-name fallback: {metro_display}]"]

        if not polys:
            skipped += 1
            skipped_metros.append((slug, members[0]["metro_display"] if members else "?", members[0]["country"] if members else "?"))
            continue
        unmatched_total += len(unmatched_local)
        dissolved = unary_union(polys)
        simplified = dissolved.simplify(SIMPLIFY_TOLERANCE_DEG, preserve_topology=True)
        feature = {
            "type": "Feature",
            "properties": {
                "slug": slug,
                "member_count": len(members),
                "matched_count": len(polys),
                "unmatched": unmatched_local,
                "source": "Overture Maps division_area (CC-BY 4.0)",
            },
            "geometry": mapping(simplified),
        }
        fc = {"type": "FeatureCollection", "features": [feature]}
        with open(OUT_DIR / f"{slug}.geojson", "w", encoding="utf-8") as f:
            json.dump(fc, f, separators=(",", ":"))
        written += 1

    print()
    print("[5/5] Done")
    print("=== Summary ===")
    print(f"Metros written:                {written}")
    print(f"  via metro-name fallback:     {metro_fallback_count}")
    print(f"Metros skipped (no polygons):  {skipped}")
    print(f"Total unmatched counties:      {unmatched_total}")
    print(f"Output dir:                    {OUT_DIR.resolve()}")
    if skipped_metros and "--verbose" in sys.argv:
        print("\nSkipped metros:")
        for slug, display, country in skipped_metros:
            print(f"  {slug:40s} ({country}) - {display}")


if __name__ == "__main__":
    main()
