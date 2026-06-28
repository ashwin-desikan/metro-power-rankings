#!/usr/bin/env python3
"""
refresh-current-leaders.py
==========================
Keeps public/data/leaders/_current.json fresh WITHOUT a Vercel build.

A weekly GitHub Action runs this. It queries Wikidata for the CURRENT head of
state (P35) and head of government (P6) of every country (matched to our slugs
by ISO 3166-1 alpha-2 code), applies the same display rules as the site
(head-of-government-first for parliamentary systems, crowns for monarchs,
warning glyphs for a curated list), and merges the result into _current.json.

Merge policy (preserves curated quality, still propagates changes):
  - If Wikidata's current leader is the SAME person already in _current.json
    (compared on the de-emoji'd name), keep the existing curated entry.
  - If the person has CHANGED, replace with the Wikidata-derived entry.
  - Countries with no prior entry get a fresh Wikidata-derived entry.

The countries hub reads _current.json via ISR from GitHub raw (lib/currentLeaders.ts),
so a change appears within the revalidate window with no deploy. If anything
here fails, the committed _current.json is simply left as-is and the hub still
falls back to build-time data.

Usage:
  python scripts/leaders/refresh-current-leaders.py            # query + merge + write
  python scripts/leaders/refresh-current-leaders.py --self-test # offline logic check
"""
import json, re, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LEADERS_DIR = ROOT / "public" / "data" / "leaders"
COUNTRIES = ROOT / "public" / "data" / "countries.json"
OUT = LEADERS_DIR / "_current.json"

# Parliamentary / PM-led systems: head of government leads, president ceremonial.
PM_LED = {
    "poland","austria","czech-republic","hungary","greece","portugal","finland",
    "ethiopia","iraq","georgia","croatia","bulgaria","bosnia-herzegovina",
    "montenegro","slovenia","slovakia","lithuania",
}
# Current leaders that carry a warning glyph (editorial; cannot be auto-derived).
WARN_NAMES = {
    # Current leaders carrying a warning glyph (atrocities / systemic subversion /
    # criminal conviction). Historical figures are flagged in the per-country
    # history files directly; this set only re-applies the glyph on the live feed.
    "Vladimir Putin","Ali Khamenei","Kim Jong-un","Alexander Lukashenko",
    "Abdel Fattah al-Burhan","Min Aung Hlaing","Donald Trump",
}
ROLE_DEFAULT = ["Supreme Leader","General Secretary","President","Chancellor",
                "Prime Minister","Taoiseach","Premier","Monarch"]
ROLE_PM_LED  = ["Supreme Leader","General Secretary","Chancellor","Prime Minister",
                "Taoiseach","Premier","President","Monarch"]
GOV_ROLES = ["Supreme Leader","General Secretary","Chancellor","Prime Minister","Taoiseach","Premier"]
HOS_TOKENS = ["Monarch","Sovereign","Emir","Sultan","King","Queen","Emperor","President"]
CROWN, WARN = "\U0001f451", "⚠️"

def short_role(r):
    for a,b in [("Prime Minister","PM"),("General Secretary","Gen. Sec."),
                ("Supreme Leader","Sup. Leader"),("Chancellor","Chanc."),("President","Pres.")]:
        r = r.replace(a,b)
    return r

def bare(n):
    return re.sub(r'^[⚠️\U0001f451\s]+','',n).strip()

def pick(slug, cands, pm_led):
    """cands: list of {name, role}. Returns {name, role, second?} or None."""
    if not cands: return None
    order = ROLE_PM_LED if pm_led else ROLE_DEFAULT
    primary = cands[0]
    for role in order:
        m = next((c for c in cands if role in c["role"]), None)
        if m: primary = m; break
    out = {"name": primary["name"], "role": short_role(primary["role"])}
    if any(r in primary["role"] for r in GOV_ROLES):
        for tok in HOS_TOKENS:
            hs = next((c for c in cands if tok in c["role"] and bare(c["name"]) != bare(primary["name"])), None)
            if hs:
                out["second"] = {"name": hs["name"], "role": short_role(hs["role"])}
                break
    return out

def apply_warn(entry):
    """Prefix the warning glyph onto names that are on the curated warn-list."""
    def fix(name):
        b = bare(name)
        if b in WARN_NAMES and not name.startswith(WARN):
            crown = CROWN + " " if name.startswith(CROWN) else ""
            return f"{WARN} {crown}{b}"
        return name
    entry["name"] = fix(entry["name"])
    if entry.get("second"): entry["second"]["name"] = fix(entry["second"]["name"])
    return entry

def hog_role_token(office_label):
    o = (office_label or "").lower()
    if "chancellor" in o: return "Chancellor"
    if "taoiseach" in o: return "Taoiseach"
    if "premier" in o and "prime" not in o: return "Premier"
    return "Prime Minister"

def build_entry(slug, hos_name, hog_name, hog_office, form):
    form_l = (form or "").lower()
    is_monarchy = "monarchy" in form_l
    # Parliamentary republics (and the curated PM-led set) lead with the head of
    # government; presidential and semi-presidential systems lead with the
    # president; monarchies fall through to default (a sitting PM outranks the
    # ceremonial monarch, matching the rest of the site).
    pm_led = (slug in PM_LED) or ("parliamentary" in form_l)
    cands = []
    if hog_name:
        cands.append({"name": hog_name, "role": hog_role_token(hog_office)})
    if hos_name:
        if is_monarchy:
            cands.append({"name": f"{CROWN} {hos_name}", "role": "Monarch"})
        else:
            cands.append({"name": hos_name, "role": "President"})
    res = pick(slug, cands, pm_led)
    return apply_warn(res) if res else None

SPARQL = """
SELECT ?iso ?hosLabel ?hogLabel ?hogOfficeLabel ?formLabel WHERE {
  ?country wdt:P297 ?iso .
  OPTIONAL { ?country wdt:P35 ?hos. }
  OPTIONAL { ?country wdt:P6 ?hog. }
  OPTIONAL { ?country wdt:P1313 ?hogOffice. }
  OPTIONAL { ?country wdt:P122 ?form. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
"""

def query_wikidata():
    import requests
    r = requests.get(
        "https://query.wikidata.org/sparql",
        params={"query": SPARQL, "format": "json"},
        headers={"User-Agent": "metro-power-rankings leaders-refresh/1.0 (github actions)"},
        timeout=120,
    )
    r.raise_for_status()
    rows = r.json()["results"]["bindings"]
    by_iso = {}
    for b in rows:
        iso = b.get("iso",{}).get("value","").upper()
        if not iso: continue
        d = by_iso.setdefault(iso, {})
        for k_out, k_in in [("hos","hosLabel"),("hog","hogLabel"),("office","hogOfficeLabel"),("form","formLabel")]:
            v = b.get(k_in,{}).get("value")
            if v and k_out not in d: d[k_out] = v
    return by_iso

def load_iso_map():
    data = json.loads(COUNTRIES.read_text(encoding="utf-8"))
    rows = data if isinstance(data, list) else data.get("countries", data)
    m = {}
    for c in rows:
        iso = (c.get("isoCode") or c.get("iso2") or "").upper()
        slug = c.get("slug")
        if iso and slug: m[iso] = slug
    return m

def main():
    iso_map = load_iso_map()
    existing = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    wd = query_wikidata()
    changed = 0
    for iso, slug in iso_map.items():
        info = wd.get(iso)
        if not info: continue
        entry = build_entry(slug, info.get("hos"), info.get("hog"), info.get("office"), info.get("form",""))
        if not entry: continue
        prev = existing.get(slug)
        # Keep curated entry if the same person still leads; else replace.
        if prev and bare(prev["name"]) == bare(entry["name"]):
            continue
        existing[slug] = entry
        changed += 1
        print(f"  updated {slug}: {entry['name']} ({entry['role']})")
    OUT.write_text(json.dumps(existing, indent=2, ensure_ascii=False, sort_keys=True), encoding="utf-8")
    print(f"_current.json written: {len(existing)} countries, {changed} updated")

def self_test():
    # parliamentary republic: PM leads, president secondary
    e = build_entry("croatia", "Zoran Milanovic", "Andrej Plenkovic", "Prime Minister of Croatia", "parliamentary republic")
    assert e["name"] == "Andrej Plenkovic" and e["role"] == "PM" and e["second"]["name"] == "Zoran Milanovic", e
    # presidential: president only
    e = build_entry("kenya", "William Ruto", None, None, "presidential system")
    assert e["name"] == "William Ruto" and e["role"] == "Pres." and "second" not in e, e
    # constitutional monarchy: PM first, crowned monarch second
    e = build_entry("sweden", "Carl XVI Gustaf", "Ulf Kristersson", "Prime Minister of Sweden", "constitutional monarchy")
    assert e["name"] == "Ulf Kristersson" and e["second"]["name"].startswith(CROWN), e
    # Germany: parliamentary -> chancellor leads over ceremonial president
    e = build_entry("germany", "Frank-Walter Steinmeier", "Friedrich Merz", "Chancellor of Germany", "parliamentary republic")
    assert e["role"] == "Chanc." and e["second"]["name"] == "Frank-Walter Steinmeier", e
    # presidential + warn-list prefix
    e = build_entry("belarus", "Alexander Lukashenko", "Alexander Turchin", "Prime Minister of Belarus", "presidential republic")
    assert e["name"].startswith(WARN) and "Lukashenko" in e["name"], e
    # semi-presidential not in PM_LED -> president leads (e.g. France/Russia style)
    e = build_entry("france", "Emmanuel Macron", "Some PM", "Prime Minister of France", "semi-presidential system")
    assert e["name"] == "Emmanuel Macron" and e["role"] == "Pres.", e
    print("self-test OK")

if __name__ == "__main__":
    if "--self-test" in sys.argv:
        self_test()
    else:
        main()
