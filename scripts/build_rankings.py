#!/usr/bin/env python3
"""
Build current world-ranking data files for three national-team sports, scraped
2026-06-19 from the official federations:
  - IIHF men's ice hockey  (iihf.com, as of 2026-06-03)
  - WBSC men's baseball     (wbsc.org, as of 2026-03-26)
  - FIFA women's football   (fifa.com, as of 2026-04-21)

Emits public/data/rankings/{hockey-men,baseball-men,womens-football}.json with
rows [{rank, name, points, slug, engineSlug}] where:
  slug       = countries.json slug (for /countries/[slug] hub links), or null
  engineSlug = Olympic-NOC slug used by the Zone Zero Cup engine, or null

Run from anywhere: python scripts/build_rankings.py
"""
import json
import os
import re
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, "public", "data")
OUT_DIR = os.path.join(D, "rankings")

# ---------------------------------------------------------------- raw data
# IIHF men, 2026-06-03. "Name|points" in rank order; Russia/Belarus suspended.
HOCKEY = """Switzerland|5335
Canada|5305
United States|5305
Finland|5240
Sweden|5100
Czechia|5090
Germany|4910
Slovakia|4900
Latvia|4845
Denmark|4760
Norway|4755
Austria|4555
Slovenia|4375
Kazakhstan|4370
France|4350
Italy|4295
Hungary|4275
Great Britain|4260
Ukraine|3995
Poland|3965
Japan|3965
Romania|3835
Lithuania|3795
South Korea|3750
Estonia|3655
China|3635
Spain|3490
Netherlands|3400
Croatia|3350
Serbia|3340
Iceland|2985
Georgia|2790
Bulgaria|2775
Chinese Taipei|2750
Turkiye|2630
Thailand|2520
South Africa|2505
United Arab Emirates|2280
Australia|2210
Belgium|2200
Israel|2160
New Zealand|2025
Kyrgyzstan|1800
Turkmenistan|1650
Mexico|1645
Bosnia and Herzegovina|1605
Luxembourg|1505
Hong Kong, China|1400
DPR Korea|1305
Mongolia|1280
Philippines|1280
Singapore|1250
Kuwait|1110
Iran|1080
Indonesia|1060
Malaysia|1000
Uzbekistan|960
Armenia|805"""
HOCKEY_SUSPENDED = """Russia|5510
Belarus|4270"""

# WBSC men's baseball, 2026-03-26. IOC code:points in rank order.
BASEBALL = ("JPN:6337,TPE:5302,USA:4357,KOR:4239,VEN:3992,PUR:3298,MEX:3227,PAN:2744,AUS:2425,"
            "NED:2358,DOM:2334,CUB:2291,COL:1973,ITA:1776,NCA:1283,CZE:1255,GER:996,CHN:894,"
            "CAN:886,GBR:880,ISR:709,BRA:693,RSA:479,PHI:465,FRA:388,ESP:359,AUT:358,HKG:319,"
            "CUW:252,THA:216,PER:183,CRO:176,ARG:175,SWE:172,SUI:167,GUM:159,PLE:159,BEL:148,"
            "CRC:136,BAH:128,ISV:112,GUA:108,PAK:97,LTU:90,HON:90,SGP:87,LAO:84,HUN:83,UGA:81,"
            "GRE:80,CHI:71,ECU:58,SRI:55,INA:50,ESA:50,POL:50,ZIM:43,ARU:39,MNP:34,NZL:33,"
            "SVK:32,PLW:30,KEN:26,IND:25,IRI:25,SXM:25,SSD:25,NOR:22,SRB:20,IRL:18,MAS:17,"
            "SLO:14,UKR:14,VIE:12,FSM:10,BAN:9,ROU:8,BEN:7,FIN:5,CAM:5,AFG:4,TAN:4,BUL:3,FIJ:3,TUR:3")

# FIFA women's football, 2026-04-21. "Name~points" in rank order (top ~190).
WOMENS = """Spain~2105.36
USA~2057.92
Germany~2028.99
England~2027.13
Japan~1998.83
France~1983.84
Brazil~1976.73
Sweden~1937.94
Canada~1936.90
Netherlands~1911.75
Korea DPR~1910.63
Denmark~1910.20
Italy~1891.83
Norway~1878.52
Australia~1830.66
China PR~1799.13
Iceland~1792.32
Belgium~1786.01
Korea Republic~1780.68
Colombia~1775.96
Republic of Ireland~1769.74
Portugal~1751.11
Austria~1749.66
Finland~1744.99
Scotland~1743.49
Switzerland~1734.18
Russia~1718.14
Mexico~1715.13
Poland~1694.17
Argentina~1683.00
Wales~1668.82
New Zealand~1645.41
Czechia~1641.00
Ukraine~1634.21
Serbia~1633.90
Nigeria~1601.56
Vietnam~1593.71
Slovenia~1579.19
Philippines~1566.44
Chinese Taipei~1565.81
Jamaica~1550.17
Venezuela~1527.00
Costa Rica~1523.57
Paraguay~1511.01
Hungary~1506.51
Turkiye~1497.30
Haiti~1490.83
Chile~1487.00
Thailand~1485.04
Northern Ireland~1481.66
Uzbekistan~1474.15
Belarus~1473.09
Romania~1472.28
Slovakia~1467.43
Myanmar~1460.70
Panama~1457.45
South Africa~1451.15
Papua New Guinea~1450.33
Greece~1430.17
Ghana~1429.23
Ecuador~1418.82
Uruguay~1418.66
Croatia~1406.00
Morocco~1402.24
Zambia~1390.14
Israel~1382.64
Albania~1376.23
IR Iran~1370.37
India~1368.70
Bosnia and Herzegovina~1361.08
Cameroon~1358.15
Cote d'Ivoire~1338.92
Peru~1331.32
Algeria~1318.95
Azerbaijan~1317.93
Jordan~1299.21
Puerto Rico~1294.95
El Salvador~1294.40
Senegal~1286.33
Fiji~1282.20
Hong Kong, China~1280.53
Trinidad and Tobago~1269.08
Guatemala~1267.25
Mali~1263.53
Kosovo~1262.78
Montenegro~1250.20
Samoa~1246.84
Nepal~1238.74
Solomon Islands~1234.03
Equatorial Guinea~1229.60
Guyana~1217.37
Malta~1216.36
Dominican Republic~1211.22
Lithuania~1208.47
Malaysia~1208.12
Nicaragua~1205.13
Cuba~1204.21
Guam~1201.73
Egypt~1199.25
Kazakhstan~1199.11
Estonia~1198.56
Tunisia~1197.50
Faroe Islands~1187.00
New Caledonia~1184.36
Latvia~1179.91
Congo DR~1179.60
Bangladesh~1171.05
Vanuatu~1168.10
Bulgaria~1166.44
Indonesia~1162.58
Congo~1161.03
Bolivia~1153.64
Cambodia~1153.44
Luxembourg~1152.87
Tonga~1152.53
Bahrain~1146.97
Laos~1143.00
Burkina Faso~1140.68
Moldova~1137.64
Cabo Verde~1131.67
American Samoa~1130.42
Tanzania~1129.13
Tahiti~1127.92
United Arab Emirates~1126.67
Namibia~1124.29
Honduras~1115.28
Zimbabwe~1114.75
Kenya~1111.84
Palestine~1111.40
Lebanon~1100.95
Cook Islands~1099.76
Georgia~1098.68
Togo~1092.99
The Gambia~1082.47
Cyprus~1076.22
North Macedonia~1075.20
Kyrgyz Republic~1070.63
Ethiopia~1068.12
Benin~1066.55
Suriname~1065.77
Turkmenistan~1063.88
Bermuda~1053.17
Guinea~1048.64
Central African Republic~1045.87
Uganda~1036.27
Mongolia~1035.67
Armenia~1030.03
Botswana~1029.20
Gabon~1028.74
St Kitts and Nevis~1026.93
Singapore~1025.38
Sierra Leone~1021.39
Malawi~1018.89
Pakistan~1008.65
Angola~989.68
Chad~985.55
Saudi Arabia~971.11
Timor-Leste~965.35
Tajikistan~954.78
St Vincent and the Grenadines~947.14
Bhutan~933.09
Syria~931.42
Barbados~924.87
St Lucia~923.18
Sri Lanka~915.58
Iraq~910.49
Maldives~906.97
Belize~903.05
Rwanda~892.39
Dominica~884.73
Liberia~882.37
Grenada~878.19
Mozambique~874.79
Niger~863.94
Seychelles~849.52
Macau~846.53
Guinea-Bissau~838.58
Lesotho~836.43
Burundi~822.10
Curacao~821.91
Andorra~816.80
Antigua and Barbuda~807.20
Aruba~801.27
Eswatini~797.06
US Virgin Islands~790.28
Cayman Islands~777.07
Comoros~745.47
Libya~739.94
Gibraltar~734.15
Liechtenstein~725.35"""


# ---------------------------------------------------------------- slug maps
def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\b(?:and|the|of|republic|pr|dr|ir|fr)\b", " ", s)
    return re.sub(r"[^a-z0-9]+", "", s)


countries = json.load(open(os.path.join(D, "countries.json"), encoding="utf-8"))
oly = json.load(open(os.path.join(D, "olympics", "teams.json"), encoding="utf-8"))
cslug = {c["slug"] for c in countries}
cbyname = {norm(c["name"]): c["slug"] for c in countries}
cnameBySlug = {c["slug"]: c["name"] for c in countries}
obyname = {norm(t["name"]): t["slug"] for t in oly}
obycode = {(t.get("code") or "").upper(): t["slug"] for t in oly if t.get("code")}

# federation name -> (countries slug, engine/oly slug). Only the divergent ones.
NAME_ALIAS = {
    "great britain": ("united-kingdom", "great-britain"),
    "czechia": ("czech-republic", "czechia"),
    "chinese taipei": ("taiwan", "chinese-taipei"),
    "turkiye": ("turkey", "turkey"),
    "korea republic": ("south-korea", "south-korea"),
    "south korea": ("south-korea", "south-korea"),
    "korea dpr": ("north-korea", "north-korea"),
    "dpr korea": ("north-korea", "north-korea"),
    "china pr": ("china", "china"),
    "china": ("china", "china"),
    "republic of ireland": ("ireland", "ireland"),
    "hong kong, china": ("hong-kong", "hong-kong"),
    "hong kong china": ("hong-kong", "hong-kong"),
    "cote d'ivoire": ("cote-divoire", "ivory-coast"),
    "ir iran": ("iran", "iran"),
    "cabo verde": ("cape-verde", "cape-verde"),
    "kyrgyz republic": ("kyrgyzstan", "kyrgyzstan"),
    "usa": ("united-states", "united-states"),
    "timor-leste": ("east-timor", "east-timor"),
    "st lucia": ("saint-lucia", "saint-lucia"),
}
# IOC code -> countries slug for baseball codes not resolvable via Olympic teams
CODE_ALIAS = {
    "GBR": "united-kingdom", "TPE": "taiwan", "CZE": "czech-republic", "IRI": "iran",
    "CUW": "curacao", "PLE": "palestine", "ISV": "us-virgin-islands", "SXM": "sint-maarten",
    "MNP": "northern-mariana-islands", "PLW": "palau", "FSM": "micronesia", "SSD": "south-sudan",
    "HKG": "hong-kong", "TUR": "turkey",
    "NCA": "nicaragua", "GUM": "guam", "HON": "honduras", "LAO": "laos", "ESA": "el-salvador",
    "ARU": "aruba", "BAN": "bangladesh", "BEN": "benin", "CAM": "cambodia",
}


def resolve_country(name):
    n = norm(name)
    if name.strip().lower() in NAME_ALIAS:
        return NAME_ALIAS[name.strip().lower()][0]
    if n in cbyname:
        return cbyname[n]
    # via Olympic name -> its name -> countries
    return None


def resolve_engine(name):
    if name.strip().lower() in NAME_ALIAS:
        return NAME_ALIAS[name.strip().lower()][1]
    n = norm(name)
    if n in obyname:
        return obyname[n]
    if n in cbyname:
        return cbyname[n]
    return None


def emit(fname, source, as_of, rows, suspended=None):
    out = {"_meta": {"sport": fname, "source": source, "asOf": as_of, "count": len(rows)},
           "rows": rows}
    if suspended:
        out["suspended"] = suspended
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(out, open(os.path.join(OUT_DIR, fname + ".json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    miss = [r["name"] for r in rows if not r["slug"]]
    print("%-18s %3d rows | unmatched country slug: %s" % (fname, len(rows), miss[:12]))


def build_named(raw, sep):
    rows = []
    for i, line in enumerate(raw.strip().splitlines(), 1):
        name, pts = line.rsplit(sep, 1)
        name = name.strip()
        rows.append({"rank": i, "name": name, "points": float(pts),
                     "slug": resolve_country(name), "engineSlug": resolve_engine(name)})
    return rows


def build_baseball(raw):
    rows = []
    for i, tok in enumerate(raw.split(","), 1):
        code, pts = tok.split(":")
        code = code.upper()
        eng = obycode.get(code)
        ctry = None
        if eng and eng in cslug:
            ctry = eng
        if not ctry:
            ctry = CODE_ALIAS.get(code)
        if not ctry and eng:
            # map via olympic name -> countries norm
            onm = next((t["name"] for t in oly if t["slug"] == eng), None)
            if onm:
                ctry = cbyname.get(norm(onm))
        disp = cnameBySlug.get(ctry, code)
        rows.append({"rank": i, "code": code, "name": disp, "points": float(pts),
                     "slug": ctry, "engineSlug": eng or CODE_ALIAS.get(code)})
    return rows


hockey = build_named(HOCKEY, "|")
hockey_susp = build_named(HOCKEY_SUSPENDED, "|")
emit("hockey-men", "IIHF World Ranking", "2026-06-03", hockey,
     suspended=[{"name": r["name"], "points": r["points"], "slug": r["slug"],
                 "engineSlug": r["engineSlug"]} for r in hockey_susp])
emit("baseball-men", "WBSC World Ranking", "2026-03-26", build_baseball(BASEBALL))
emit("womens-football", "FIFA/Coca-Cola Women's World Ranking", "2026-04-21",
     build_named(WOMENS, "~"))
