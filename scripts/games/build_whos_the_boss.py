#!/usr/bin/env python3
"""
build_whos_the_boss.py — pool builder for the "Who's the Boss?" Play & Learn game.

The hand-written 15-card entry level (US President / UK PM / UK King) stays in
the HTML unchanged as the warm-up. This script builds the two harder levels
that ramp the game to real-world scale: 200+ real, current heads of
state/government, joined from the site's own leaders + countries data.

Reads  public/data/leaders/_current.json   (slug -> {name, role, since, second?})
       public/data/countries.json          (slug, name, continent, ... -- NOTE:
                                             its own "isoCode" field is NOT a
                                             real ISO-3166 code in this dataset,
                                             it duplicates "name" for every
                                             country except the UK, so it is
                                             useless for flag URLs)
       public/data/country-facts.json      (slug -> {iso3166}) -- this is the
                                             file that actually carries a real
                                             two-letter code, and is what
                                             build_in_the_club.py already uses
                                             for the same purpose.
Writes public/play/games/pools/whos-the-boss.js  (window.BOSS = {LEADERS:[...]})

Filtering:
  - slug must resolve in countries.json
  - country-facts.json must carry a real 2-letter iso3166 for that slug
    (this alone drops England/Scotland, whose "leader" in the raw data is
    just the UK's, and a handful of others with no code)
  - "since" must be present (drops Switzerland, whose entry is a rotating
    collective "Swiss Federal Council" with no single date -- not a person,
    not a fact this game can state a year for)

Cleanup:
  - a few names in the source carry a leading emoji annotation (a crown for a
    handful of monarchs whose role field already says Monarch, a warning
    triangle for a handful of leaders the source flags for some other reason,
    a cross for the Pope). Those emoji are not part of the person's name, so
    they are stripped before the name reaches a children's game.

Role labels are collapsed to five child-friendly, table-legible words, plus a
catch-all -- per PLAY-MASTERY-SPEC's plain-language rule (no reading a raw
title like "Pres. (Sovereignty Council Chairman)" aloud to an 8-year-old):
    Pres.           -> President
    PM              -> Prime Minister
    Monarch         -> King or Queen
    Federal Chanc.  -> Chancellor
    Sup. Leader     -> Supreme Leader
    (anything else) -> Leader

Level 3 ("What's the Job?") only quizzes the five NAMED labels above (the
"Leader" catch-all is not itself a guessable option), so its round is built
in the HTML from a filtered slice of this same pool rather than a second file.
"""
import json, os, re, sys

ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", ".."))

leaders = json.load(open(os.path.join(ROOT, "public/data/leaders/_current.json"), encoding="utf-8"))
countries = {c["slug"]: c for c in json.load(open(os.path.join(ROOT, "public/data/countries.json"), encoding="utf-8"))}
facts = json.load(open(os.path.join(ROOT, "public/data/country-facts.json"), encoding="utf-8"))["countries"]
country_order = [c["slug"] for c in json.load(open(os.path.join(ROOT, "public/data/countries.json"), encoding="utf-8"))]

ROLE_MAP = {
    "Pres.": "President",
    "PM": "Prime Minister",
    "Monarch": "King or Queen",
    "Federal Chanc.": "Chancellor",
    "Sup. Leader": "Supreme Leader",
}
def role_label(role):
    return ROLE_MAP.get(role, "Leader")

def clean_name(name):
    name = name or ""
    # Strip a leading emoji/symbol annotation that isn't part of the name.
    return re.sub(r"^[^\w(]+\s*", "", name, flags=re.UNICODE).strip()

def iso2(slug):
    iso = (facts.get(slug) or {}).get("iso3166") or ""
    return iso.lower() if len(iso) == 2 else ""

def year_of(since):
    if not since or len(since) < 4:
        return None
    return since[:4]

LEADERS = []
for slug in country_order:
    v = leaders.get(slug)
    if not v:
        continue
    c = countries.get(slug)
    if not c:
        continue
    iso = iso2(slug)
    if not iso:
        continue
    since_year = year_of(v.get("since"))
    if not since_year:
        continue

    entry = {
        "slug": slug,
        "country": c["name"],
        "iso": iso,
        "continent": c.get("continent") or "",
        "name": clean_name(v.get("name")),
        "role": v.get("role") or "",
        "roleLabel": role_label(v.get("role") or ""),
        "since": since_year,
    }
    second = v.get("second")
    if second and second.get("name"):
        entry["second"] = {
            "name": clean_name(second.get("name")),
            "role": second.get("role") or "",
            "roleLabel": role_label(second.get("role") or ""),
        }
    LEADERS.append(entry)

out = os.path.join(ROOT, "public/play/games/pools/whos-the-boss.js")
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, "w", encoding="utf-8") as f:
    f.write("window.BOSS=" + json.dumps({"LEADERS": LEADERS}, ensure_ascii=False) + ";\n")

by_continent = {}
by_role = {}
for e in LEADERS:
    by_continent[e["continent"]] = by_continent.get(e["continent"], 0) + 1
    by_role[e["roleLabel"]] = by_role.get(e["roleLabel"], 0) + 1
named = {"President", "Prime Minister", "King or Queen", "Chancellor", "Supreme Leader"}
level3_count = sum(1 for e in LEADERS if e["roleLabel"] in named)
print("whos-the-boss.js: %d leaders" % len(LEADERS))
print("  by continent: %s" % by_continent)
print("  by roleLabel: %s" % by_role)
print("  eligible for Level 3 (named roles only): %d" % level3_count)
print("  with a second leader: %d" % sum(1 for e in LEADERS if "second" in e))
