#!/usr/bin/env python3
"""Regenerate city_metro_review.csv from city_metro_skipped.json + suggestion dicts."""
import json, csv
O='/sessions/magical-tender-noether/mnt/outputs/cricket'
un=json.load(open(f'{O}/city_metro_skipped.json'))
SUG = {
 'Al Amarat': ('Muscat','locality in Muscat governorate (Al Amerat)'),
 'Kirtipur': ('Kathmandu','Kathmandu Valley municipality (Tribhuvan Univ. ground)'),
 'Kigali City': ('Kigali','name variant'),
 'Bali': ('Denpasar','Udayana ground is in Denpasar metro'),
 'Marsa': ('Valletta-Malta Island','Marsa is within Valletta urban area'),
 'St Kitts': ('Basseterre','Warner Park is in Basseterre'),
 'Mount Maunganui': ('Tauranga','Bay Oval; Mt Maunganui is part of Tauranga'),
 'St Lucia': ('Castries','Daren Sammy NCS, Gros Islet — confirm within Castries'),
 'Gros Islet': ('Castries','as above — confirm'),
 'Lauderhill': ('Miami','Central Broward Park, Miami metro'),
 'Episkopi': ('Limassol','Happy Valley Ground, Limassol district'),
 'King City': ('Toronto','Maple Leaf CC, Greater Toronto'),
 'Bangi': ('Kuala Lumpur','UKM oval, Klang Valley'),
 'Krefeld': ('Rhine-Ruhr','workbook Germany convention'),
 'Ilfov County': ('Bucharest','Moara Vlasiei, Bucharest/Ilfov'),
 'Mong Kok': ('Hong Kong','Kowloon district'),
 'Hove': ('Brighton & Hove','name part'),
 'Cuttack': ('Bhubaneswar','twin city'),
 'New Chandigarh': ('Chandigarh','Mullanpur, Chandigarh tricity'),
 'Fatullah': ('Dhaka','Narayanganj, Greater Dhaka'),
 'Kingstown': ('Kingstown (STV)','suffixed workbook name'),
 "St George's": ("St. George's (GRE)",'suffixed workbook name'),
 'Grenada': ("St. George's (GRE)","National Stadium is in St George's"),
 'St Vincent': ('Kingstown (STV)','Arnos Vale is in Kingstown'),
 'Tarouba': ('San Fernando (TT)','Brian Lara Stadium adjoins San Fernando'),
 'Victoria': ('Geelong','venue is Simonds Stadium, South Geelong'),
 'Carrara': ('Gold Coast','Carrara Oval, Gold Coast'),
 'Morrisville': ('Raleigh-Durham','Research Triangle'),
 'Pearland': ('Houston','Houston suburb'),
 'George Town': ('George Town (CAY)','Jimmy Powell Oval, Cayman'),
 'Bready': ('Derry','Magheramason, Derry area — confirm'),
 'Castel': ('St Peter Port','Guernsey, KGV ground'),
 'Port  Soif': ('St Peter Port','Guernsey'),
 'Walferdange': ('Luxembourg City','Luxembourg City suburb'),
 'Kerava': ('Helsinki','Helsinki commuter belt'),
 'Vantaa': ('Helsinki','Helsinki metro'),
 'Brondby': ('Copenhagen','Copenhagen suburb'),
 'Koge': ('Copenhagen','Copenhagen metro — confirm'),
 'Ishoj': ('Copenhagen','Copenhagen suburb'),
 'Szodliget': ('Budapest','Budapest commuter belt — confirm'),
 'Pianoro': ('Bologna','Bologna province'),
 'Naucalpan': ('Mexico City','Mexico City metro'),
 'Zemst': ('Brussels','Brussels periphery'),
 'Albergaria': ('Aveiro','Albergaria-a-Velha, Aveiro district — confirm'),
 'Benoni': ('Johannesburg',"East Rand/Ekurhuleni — depends on Jo'burg bounds"),
 'Paarl': ('Cape Town','Cape Winelands ~60km — boundary call'),
 'Entebbe': ('Kampala','35km from Kampala — boundary call'),
 'Los Angeles': ('Los Angeles','Woodley Park, US — collision was diacritic Chile variant'),
 'Dehra Dun': ('Dehradun','spelling variant'),
 'Comber': ('Belfast','Greater Belfast/Ards — boundary call'),
 'Gosforth': ('Newcastle','Gosforth is in Newcastle'),
 'Coolidge': ("St. John's (ANT)",'Coolidge CG, Antigua'),
 'Dominica': ('Roseau','Windsor Park is in Roseau'),
 'Dasmarinas': ('Manila','Cavite — boundary call'),
 'Spinaceto': ('Rome','Rome suburb'),
 'Rangiora': ('Christchurch','commuter belt — boundary call'),
 'Malkerns': ('Mbabane','between Mbabane and Manzini — boundary call'),
 'Waterloo': ('Brussels','Royal Brussels CC is in Waterloo, Belgium — boundary call'),
 'St Martin': ('Saint Helier','Farmers CC, St Martin parish, Jersey'),
 'St Saviour': ('Saint Helier','Grainville, Jersey'),
 'Moratuwa': ('Colombo','Moratuwa is within Colombo metro'),
 'Panadura': ('Colombo','boundary call'),
 'Radlett': ('London','Hertfordshire commuter belt — boundary call'),
 'Beckenham': ('London','Beckenham is Greater London'),
 'Northwood': ('London','Greater London edge'),
 'Guildford': ('London','Surrey commuter belt — boundary call'),
}
NEW_METRO = {
 'Gelephu': 'Bhutan — Gelephu Mindfulness City; only Thimphu in workbook',
 'Nelson': 'New Zealand — Saxton Oval; no Nelson metro',
 'Whangarei': 'New Zealand — no metro',
 'Queenstown': 'New Zealand — John Davies Oval; no NZ Queenstown metro',
 'New Plymouth': 'New Zealand — Pukekura Park; no metro',
 'Alexandra': 'New Zealand — Central Otago; no metro',
 'Dreux': 'France — 80km from Paris; boundary call',
 'Latschach': 'Austria — Villach area; neither in workbook',
 'Maggona': 'Sri Lanka — Kalutara coast; no Kalutara metro',
 'Kaluthara': 'Sri Lanka — no Kalutara metro',
}
with open('/tmp/city_metro_review.csv','w',newline='',encoding='utf-8') as f:
    w=csv.writer(f)
    w.writerow(['city','matches','first','last','intl_evidence','suggested_metro','basis','status','top_venue','top_events'])
    for u in un:
        c=u['city']
        if c in SUG: sm,b,st = SUG[c][0],SUG[c][1],'SUGGESTED — approve?'
        elif c in NEW_METRO: sm,b,st = '',NEW_METRO[c],'NEW METRO / BOUNDARY CALL'
        else: sm,b,st='','','UNRESOLVED'
        w.writerow([c,u['matches'],u['first'],u['last'],'; '.join(u['intl_team_evidence'][:3]),sm,b,st,
                    u['top_venues'][0] if u['top_venues'] else '','; '.join(u['top_events'][:2])])
print('review rows:', len(un))
