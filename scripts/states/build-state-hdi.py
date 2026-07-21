#!/usr/bin/env python3
"""
build-state-hdi.py -- subnational HDI layer for /states from Global Data Lab SHDI.

Reads the GDL "Subnational HDI" CSV (--gdl), matches its Subnat regions to the
first-level divisions of our 20 target countries, and writes
public/data/state-hdi.json  ->  {slug: {hdi, hdiYear}}  (loader merges it).

GDL keys on region NAME (no ISO 3166-2) and often in the native language, so we
match each GDL region against BOTH the English name (states.json) and the endonym
(states-facts.json), after accent/prefix normalization. Countries where GDL only
publishes AGGREGATED macro-regions stay blank by design (Japan, Switzerland,
Russia, Turkey, Portugal, Ukraine; France's file is pre-2016 regions). Re-run
whenever GDL updates:  python scripts/states/build-state-hdi.py --gdl <csv>
"""
import csv, json, os, re, unicodedata, argparse

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, "public", "data")
ISO3 = {"United States":"USA","Canada":"CAN","Australia":"AUS","Mexico":"MEX","Germany":"DEU",
        "Italy":"ITA","Spain":"ESP","India":"IND","Japan":"JPN","Brazil":"BRA","Switzerland":"CHE",
        "China":"CHN","Russia":"RUS","France":"FRA","Poland":"POL","Netherlands":"NLD",
        "Belgium":"BEL","Portugal":"PRT","Turkey":"TUR","Ukraine":"UKR"}
STOP = (r"\b(freistaat|freie|hansestadt|und|land|comunidad|comunitat|autonoma|autonomo|foral|"
        r"generalitat|principado|principat|prov|province|provincia|voivodeship|wojewodztwo|oblast|"
        r"prefecture|canton|region|republic|krai|okrug|city|state|of|the|de|del|di|do|da)\b")

def norm(s):
    if not s: return ""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(STOP, " ", s)
    return re.sub(r"[^a-z0-9]", "", s)

def load(p):
    with open(p, "rb") as f: return json.loads(f.read().decode("utf-8"))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gdl", required=True, help="Global Data Lab SHDI CSV")
    a = ap.parse_args()
    states = load(os.path.join(DATA, "states.json"))
    facts = load(os.path.join(DATA, "states-facts.json"))
    gdl = list(csv.DictReader(open(a.gdl, encoding="utf-8-sig")))
    years = [str(y) for y in range(2023, 1989, -1)]

    def latest(row):
        for y in years:
            v = (row.get(y) or "").strip()
            if v:
                try: return round(float(v), 3), int(y)
                except ValueError: pass
        return None, None

    out = {}
    for country, code in ISO3.items():
        divs = [s for s in states if s["mainCountry"] == country and s["country"] == country]
        key2slug = {}
        for s in divs:
            for k in (norm(s["name"]), norm((facts.get(s["slug"]) or {}).get("endonym"))):
                if k and len(k) >= 3: key2slug.setdefault(k, s["slug"])
        seen = set()
        for r in gdl:
            if r["ISO_Code"] != code or r["Level"] != "Subnat": continue
            sl = key2slug.get(norm(r["Region"]))
            if sl and sl not in seen:
                hv, yr = latest(r)
                if hv is not None:
                    out[sl] = {"hdi": hv, "hdiYear": yr}; seen.add(sl)
    dst = os.path.join(DATA, "state-hdi.json")
    with open(dst, "wb") as f:
        f.write(json.dumps(out, ensure_ascii=False, indent=1).encode("utf-8"))
    print("wrote", dst, "->", len(out), "divisions")

if __name__ == "__main__":
    main()
