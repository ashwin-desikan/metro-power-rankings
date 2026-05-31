"""
Fixes the 2025 Club World Cup / Intercontinental Cup entries in european-tournaments.json:

  2025 FIFA Club World Cup (2025-26):    Chelsea champion, PSG runner-up
  2025-26 Intercontinental Cup:          PSG champion, Flamengo runner-up
"""
import json, os

PROJ = r"C:\Users\ashwi\Desktop\Projects\Metro Area Project"
TARGET = os.path.join(PROJ, "public", "data", "football", "european-tournaments.json")

with open(TARGET, encoding="utf-8") as f:
    data = json.load(f)

cwc = data["club-world-cup"]

# 1. Fix PSG champion: competition → Intercontinental Cup, season → 2025-26
for c in cwc["champions"]:
    if c["year"] == 2025 and c["cur_name"] == "Paris Saint-Germain":
        c["competition"] = "Intercontinental Cup"
        c["season"] = "2025-26"
        print("Champions: PSG 2025 → Intercontinental Cup, season 2025-26")
        break

# 2. Fix 2025 CWC finalist: Flamengo → PSG
for f in cwc["finalists"]:
    if f["year"] == 2025 and f["competition"] == "FIFA Club World Cup" and f["cur_name"] == "Flamengo":
        f["cur_name"] = "Paris Saint-Germain"
        f["slug"] = "paris-saint-germain"
        print("Finalists: 2025 CWC runner-up → PSG")
        break

# 3. Add Flamengo as 2025-26 Intercontinental Cup runner-up
existing = {(f["year"], f["competition"]) for f in cwc["finalists"]}
if (2025, "Intercontinental Cup") not in existing:
    cwc["finalists"].insert(1, {
        "year": 2025,
        "season": "2025-26",
        "cur_name": "Flamengo",
        "slug": None,
        "competition": "Intercontinental Cup",
    })
    print("Finalists: added Flamengo as 2025-26 Intercontinental Cup runner-up")

with open(TARGET, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print("Done.")
