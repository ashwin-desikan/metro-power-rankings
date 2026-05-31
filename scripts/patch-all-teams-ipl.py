"""
Injects IPL franchise entries into public/data/sports/all-teams.json.
Run from anywhere: python patch-all-teams-ipl.py
"""
import json, os, sys

PROJ = r"C:\Users\ashwi\Desktop\Projects\Metro Area Project"
TARGET = os.path.join(PROJ, "public", "data", "sports", "all-teams.json")

IPL_ENTRIES = [
  ("mumbai-indians",         "Mumbai Indians",              "Mumbai",     "Maharashtra",     "Mumbai",     "mumbai",     19.0760, 72.8777),
  ("chennai-super-kings",    "Chennai Super Kings",         "Chennai",    "Tamil Nadu",      "Chennai",    "chennai",    13.0827, 80.2707),
  ("kolkata-knight-riders",  "Kolkata Knight Riders",       "Kolkata",    "West Bengal",     "Calcutta",   "calcutta",   22.5726, 88.3639),
  ("rcb",                    "Royal Challengers Bengaluru", "Bengaluru",  "Karnataka",       "Bangalore",  "bangalore",  12.9716, 77.5946),
  ("sunrisers-hyderabad",    "Sunrisers Hyderabad",         "Hyderabad",  "Telangana",       "Hyderabad",  "hyderabad",  17.3850, 78.4867),
  ("delhi-capitals",         "Delhi Capitals",              "Delhi",      "NCT of Delhi",    "Delhi",      "delhi",      28.6139, 77.2090),
  ("rajasthan-royals",       "Rajasthan Royals",            "Jaipur",     "Rajasthan",       "Jaipur",     "jaipur",     26.9124, 75.7873),
  ("punjab-kings",           "Punjab Kings",                "Chandigarh", "Chandigarh (UT)", "Chandigarh", "chandigarh", 30.7333, 76.7794),
  ("gujarat-titans",         "Gujarat Titans",              "Ahmedabad",  "Gujarat",         "Ahmedabad",  "ahmedabad",  23.0225, 72.5714),
  ("lucknow-super-giants",   "Lucknow Super Giants",        "Lucknow",    "Uttar Pradesh",   "Lucknow",    "lucknow",    26.8467, 80.9462),
  ("deccan-chargers",        "Deccan Chargers",             "Hyderabad",  "Telangana",       "Hyderabad",  "hyderabad",  17.3850, 78.4867),
  ("kochi-tuskers",          "Kochi Tuskers Kerala",        "Kochi",      "Kerala",          "Kochi",      "kochi",       9.9312, 76.2673),
  ("pune-warriors",          "Pune Warriors India",         "Pune",       "Maharashtra",     "Pune",       "pune",       18.5204, 73.8567),
  ("gujarat-lions",          "Gujarat Lions",               "Rajkot",     "Gujarat",         "Rajkot",     "rajkot",     22.3039, 70.8022),
  ("rising-pune-supergiant", "Rising Pune Supergiant",      "Pune",       "Maharashtra",     "Pune",       "pune",       18.5204, 73.8567),
]

with open(TARGET, encoding="utf-8") as f:
    data = json.load(f)

before = len(data)
data = [t for t in data if t.get("source") != "ipl_injection"]

for slug, name, city, state, metro, metro_slug, lat, lng in IPL_ENTRIES:
    data.append({
        "city": city, "country": "India", "country_iso2": "IN",
        "division": None, "lat": lat,
        "league": "IPL", "league_raw": "IPL", "level": "Major", "lng": lng,
        "main_div": None, "metro": metro, "metro_slug": metro_slug,
        "source": "ipl_injection", "sport": "T20 Cricket", "state": state,
        "team": name, "team_page_url": f"/teams/ipl/{slug}",
        "wikidata_qid": None, "wikipedia_url": None, "workbook_level": "1",
    })

with open(TARGET, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print(f"Done. {before} → {len(data)} entries (+{len(data)-before} IPL).")
