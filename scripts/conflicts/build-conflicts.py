#!/usr/bin/env python3
"""
build-conflicts.py
Reads public/data/conflicts_raw.json (structured interstate-war records) and
emits public/data/conflicts.json with belligerents normalized to canonical
country slugs. Hybrid mapping: clear continuations are folded onto the modern
country; contested successions (USSR, Yugoslavia, Czechoslovakia) and non-state
actors stay as plain labels (no country link). The first belligerent with a
country slug on each side is marked the principal.

The weekly/monthly GitHub Action regenerates conflicts_raw.json from Wikipedia,
then runs this script and commits conflicts.json with [vercel skip].
"""
import json, sys, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "public/data/conflicts_raw.json"
OUT = ROOT / "public/data/conflicts.json"
COUNTRIES = ROOT / "public/data/countries.json"

# Fold historical / variant names onto a canonical country slug.
ALIAS = {
    "Transjordan": "jordan",
    "Zaire": "congo-dr",
    "Democratic Republic of the Congo": "congo-dr",
    "North Vietnam": "vietnam", "South Vietnam": "vietnam",
    "North Yemen": "yemen", "South Yemen": "yemen",
    "East Germany": "germany", "West Germany": "germany",
    "Democratic Kampuchea": "cambodia", "People's Republic of Kampuchea": "cambodia",
    "Khmer Republic": "cambodia",
    "Republic of China": "taiwan",
    "Kosova": "kosovo",
    "Bosnia and Herzegovina": "bosnia-herzegovina",
    "Antigua and Barbuda": "antigua-barbuda",
    "Saint Vincent and the Grenadines": "st-vincent-the-grenadines",
}
# Intentionally kept as labels (contested successions, breakaway/non-state, annexed).
KEEP_LABEL = {
    "Soviet Union", "Yugoslavia", "Serbia and Montenegro", "Czechoslovakia", "Republika Srpska",
    "Tibet", "Hyderabad", "Ichkeria",
    "Sahrawi Arab Democratic Republic", "Nagorno-Karabakh Republic", "Artsakh",
    "UN Command", "NATO", "Houthis", "Gaza Strip", "DPR", "LPR", "Northern Alliance",
    "Islamic Emirate of Afghanistan", "Afghan Mujahideen", "Afghan Interim Government",
    "Khmer Rouge", "Khmer Issarak", "Pathet Lao", "FNL",
    "AFDL", "SPLA", "UNITA", "ADF", "FLNC", "Interahamwe", "CNDD-FDD", "Ex-FAR/ALiR",
    "DRF", "Azerbaijan People's Government", "Republic of Mahabad", "March 23 Movement",
    "ALiR", "FAR",  # non-state Rwandan Hutu armed groups; source split the old "Ex-FAR/ALiR" label
}

# Scrape noise: generic military-doctrine terms or infobox artifacts that leak into
# the belligerent lists but are not actors. Filtered out before the review gate.
DROP = {"Combat support"}

def load_countries():
    rows = json.loads(COUNTRIES.read_text(encoding="utf-8"))
    rows = rows if isinstance(rows, list) else rows.get("countries", rows)
    nm = {c["name"].lower(): c["slug"] for c in rows if c.get("name") and c.get("slug")}
    slugs = {c["slug"] for c in rows if c.get("slug")}
    return nm, slugs

def main():
    nm, slugs = load_countries()
    bad = sorted({s for s in ALIAS.values() if s not in slugs})
    assert not bad, f"ALIAS targets missing from country slugs: {bad}"
    raw = json.loads(RAW.read_text(encoding="utf-8"))
    unmapped = set()

    def resolve(name):
        if name in ALIAS: return {"name": name, "slug": ALIAS[name]}
        s = nm.get(name.lower())
        if s: return {"name": name, "slug": s}
        if name not in KEEP_LABEL: unmapped.add(name)
        return {"name": name, "slug": None}

    def side(lst):
        out = [resolve(n) for n in lst if n not in DROP]
        pi = next((i for i, e in enumerate(out) if e["slug"]), 0 if out else None)
        for i, e in enumerate(out): e["principal"] = (i == pi)
        return out

    wars = []
    for w in raw:
        mn = w.get("deaths_min")
        wars.append({
            "name": w["name"],
            "url": f"https://en.wikipedia.org/wiki/{w['wiki']}",
            "start": w.get("start"), "end": w.get("end"), "ongoing": bool(w.get("ongoing")),
            "major": (mn is not None and mn >= 10000),
            "deathsMin": mn, "deathsMax": w.get("deaths_max"),
            "sideA": side(w.get("side_a", [])), "sideB": side(w.get("side_b", [])),
        })

    data = {
        "generated": datetime.date.today().isoformat(),
        "source": "https://en.wikipedia.org/wiki/List_of_interstate_wars_since_1945",
        "count": len(wars), "wars": wars,
    }
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {len(wars)} wars -> {OUT.name}")
    if unmapped:
        print("UNMAPPED belligerents (review — add to ALIAS or KEEP_LABEL):")
        for u in sorted(unmapped): print("  ", u)
        sys.exit(2)  # gate: a new/unknown belligerent must be reviewed (alias or keep-label)
    else:
        print("all belligerents resolved (mapped or intentional labels)")

if __name__ == "__main__":
    main()
