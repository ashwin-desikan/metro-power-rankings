#!/usr/bin/env python3
"""
pull-history.py
===============
Backfills per-country SUCCESSION HISTORY files (public/data/leaders/<slug>.json)
from Wikidata, the same way refresh-current-leaders.py backfills the CURRENT
snapshot. It exists because ~97 sovereign states have a current entry but no
history file, so the /leaders time machine and all-time view have nothing to
show for them before today.

For each target country (matched to our slug by ISO 3166-1 alpha-2), it pulls
the FULL list of heads of government (P6) and heads of state (P35) with their
start (P580) and end (P582) date qualifiers, then formats each term into the
site's history-row shape:
    {name, role, start, end, current, tenure, party, era}
applying the same conventions as the rest of the site (crowned monarchs, warn
glyphs on the curated list, PM/President/Chancellor role tokens).

DESIGN NOTES / KNOWN LIMITS (curate after the run):
  - Head-of-state rows are labelled Monarch vs President from the country's
    CURRENT form of government (P122). A state that switched monarchy<->republic
    will mislabel its pre-switch heads of state; fix those by hand.
  - Commonwealth realms pull only P6 (prime ministers). Their shared sovereign
    (Elizabeth II -> Charles III) is rendered from a single timeline in the app,
    so we do not duplicate the British monarch into every realm file.
  - party is left null (P102 is noisy); era is left null. Add by hand where it
    matters.
  - Acting leaders, disputed states and vandalised labels need a human eye. A
    plausibility filter drops QID-labels and all-lowercase junk, but is not a
    substitute for review.

Because Wikidata is blocked from the Cowork sandbox, RUN THIS LOCALLY (same as
refresh-current-leaders.py). It is add-only by default and never overwrites an
existing history file, so it cannot damage the curated 107.

Usage:
  python scripts/leaders/pull-history.py                 # fill every slug that has no history file
  python scripts/leaders/pull-history.py --only kenya    # one slug (writes even if the file exists? no; see --overwrite)
  python scripts/leaders/pull-history.py --only kenya --overwrite
  python scripts/leaders/pull-history.py --limit 5       # first 5 targets (polite testing)
  python scripts/leaders/pull-history.py --list          # print the target slugs and exit
  python scripts/leaders/pull-history.py --self-test     # offline logic check, no network
"""
import json, re, sys, time
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LEADERS_DIR = ROOT / "public" / "data" / "leaders"
COUNTRIES = ROOT / "public" / "data" / "countries.json"
ISO2_BY_SLUG = Path(__file__).with_name("iso2_by_slug.json")

MONARCH_LED = {"monaco", "eswatini", "oman", "brunei"}
COMMONWEALTH_REALMS = {
    "united-kingdom", "canada", "australia", "new-zealand", "antigua-barbuda", "bahamas",
    "belize", "grenada", "jamaica", "papua-new-guinea", "st-kitts-nevis", "st-lucia",
    "st-vincent-the-grenadines", "solomon-islands", "tuvalu",
}

# The warning glyph is curated in ONE place, scripts/data/warn-flags.json, with a
# written criterion and dated acts behind every name. It used to be three
# hardcoded sets in three scripts, which is a list that drifts and a judgement
# about living people with no evidence attached. Missing file is a hard failure:
# silently shipping an unflagged feed would be worse than not shipping one.
WARN_FLAGS = ROOT / "scripts" / "data" / "warn-flags.json"


def load_warn_names(scope):
    with open(WARN_FLAGS, encoding="utf-8") as fh:
        people = json.load(fh)["people"]
    return {
        name for name, v in people.items()
        if v.get("scope") == scope and v.get("status") != "removed"
    }

WARN_NAMES = load_warn_names("leader")
CROWN, WARN = "\U0001f451", "⚠️"

def bare(n):
    return re.sub(r'^[⚠️\U0001f451\s]+', '', n).strip()

def hog_role_token(office_label):
    o = (office_label or "").lower()
    if "chancellor" in o: return "Chancellor"
    if "taoiseach" in o: return "Taoiseach"
    if "premier" in o and "prime" not in o: return "Premier"
    if "president" in o: return "President"   # some HoG offices are titled president of the council
    return "Prime Minister"

def _plausible(name):
    b = bare(name)
    if len(b) < 2: return False
    if re.fullmatch(r"Q\d+", b): return False
    words = [w for w in re.split(r"\s+", b) if w]
    if not any(w[:1].isupper() or (w[:1] and not w[:1].isascii()) for w in words):
        return False
    return True

def tenure(start, end):
    """Approximate 'Xy Ym Zd' between two ISO dates (end defaults to today)."""
    if not start: return None
    try:
        y0, m0, d0 = (int(x) for x in start[:10].split("-"))
        s = date(y0, m0, d0)
    except Exception:
        return None
    if end:
        try:
            y1, m1, d1 = (int(x) for x in end[:10].split("-"))
            e = date(y1, m1, d1)
        except Exception:
            e = date.today()
    else:
        e = date.today()
    if e < s: return None
    y = e.year - s.year
    m = e.month - s.month
    d = e.day - s.day
    if d < 0:
        m -= 1
        # borrow days from the previous month
        pm = e.month - 1 or 12
        py = e.year if e.month != 1 else e.year - 1
        from calendar import monthrange
        d += monthrange(py, pm)[1]
    if m < 0:
        y -= 1
        m += 12
    parts = []
    if y: parts.append(f"{y}y")
    if m: parts.append(f"{m}m")
    parts.append(f"{d}d")
    return " ".join(parts)

def hos_role_and_name(name, is_monarchy):
    if is_monarchy:
        return "Monarch", f"{CROWN} {name}"
    return "President", name

def apply_warn(name):
    b = bare(name)
    if b in WARN_NAMES and not name.startswith(WARN):
        crown = CROWN + " " if name.startswith(CROWN) else ""
        return f"{WARN} {crown}{b}"
    return name

def build_rows(slug, hog_terms, hos_terms, form):
    """hog_terms / hos_terms: list of {name, start, end, office?}. Returns the
    ordered, de-duplicated history rows for one country."""
    form_l = (form or "").lower()
    is_monarchy = ("monarchy" in form_l) or (slug in MONARCH_LED) or (slug in COMMONWEALTH_REALMS)
    rows = []
    # Heads of government (skip for executive monarchies where they are suppressed).
    if slug not in MONARCH_LED:
        for t in hog_terms:
            rows.append(_row(t, hog_role_token(t.get("office"))))
    # Heads of state (skip for realms: shared British monarch handled centrally).
    if slug not in COMMONWEALTH_REALMS:
        for t in hos_terms:
            role, nm = hos_role_and_name(t["name"], is_monarchy)
            rows.append(_row({**t, "name": nm}, role))
    # De-duplicate identical (name, role, start), drop dateless rows, order by start.
    seen = set()
    clean = []
    for r in rows:
        if not r or not r["start"] or not _plausible(r["name"]):
            continue
        key = (bare(r["name"]), r["role"], r["start"])
        if key in seen: continue
        seen.add(key)
        clean.append(r)
    clean.sort(key=lambda r: r["start"])
    return clean

def _row(term, role):
    start = (term.get("start") or "")[:10] or None
    end = (term.get("end") or "")[:10] or None
    is_current = end is None
    return {
        "name": apply_warn(term["name"]),
        "role": role,
        "start": start,
        "end": end,
        "current": is_current,
        "tenure": tenure(start, end),
        "party": None,
        "era": None,
    }

def load_slug_iso():
    data = json.loads(COUNTRIES.read_text(encoding="utf-8"))
    rows = data if isinstance(data, list) else data.get("countries", data)
    override = json.loads(ISO2_BY_SLUG.read_text(encoding="utf-8")) if ISO2_BY_SLUG.exists() else {}
    out = {}
    for c in rows:
        slug = c.get("slug")
        if not slug: continue
        iso = override.get(slug)
        if not iso:
            cand = (c.get("isoCode") or c.get("iso2") or "").upper()
            if re.fullmatch(r"[A-Z]{2}", cand): iso = cand
        if iso: out[slug] = iso.upper()
    return out

def targets(only=None):
    """Slugs to fill: those with a current entry (from _current.json) but no
    history file. --only overrides."""
    current = json.loads((LEADERS_DIR / "_current.json").read_text(encoding="utf-8"))
    slug_iso = load_slug_iso()
    result = []
    for slug in current:
        if only and slug != only: continue
        if slug not in slug_iso: continue          # no ISO code -> cannot query (territories/curated)
        if (LEADERS_DIR / f"{slug}.json").exists() and not only: continue
        result.append(slug)
    return result, slug_iso

SPARQL = """
SELECT ?prop ?personLabel ?start ?end ?officeLabel ?formLabel WHERE {
  ?country wdt:P297 "%s" .
  OPTIONAL { ?country wdt:P122 ?form. }
  {
    ?country p:P6 ?st. ?st ps:P6 ?person. BIND("P6" AS ?prop)
    OPTIONAL { ?st pq:P580 ?start } OPTIONAL { ?st pq:P582 ?end }
    OPTIONAL { ?st pq:P2937 ?office } OPTIONAL { ?person wdt:P39 ?office }
  } UNION {
    ?country p:P35 ?st. ?st ps:P35 ?person. BIND("P35" AS ?prop)
    OPTIONAL { ?st pq:P580 ?start } OPTIONAL { ?st pq:P582 ?end }
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
}
"""

def query_country(iso):
    import requests
    r = requests.get(
        "https://query.wikidata.org/sparql",
        params={"query": SPARQL % iso, "format": "json"},
        headers={"User-Agent": "metro-power-rankings leaders-history/1.0"},
        timeout=120,
    )
    r.raise_for_status()
    hog, hos, form = [], [], ""
    for b in r.json()["results"]["bindings"]:
        if not form and b.get("formLabel", {}).get("value"):
            form = b["formLabel"]["value"]
        name = b.get("personLabel", {}).get("value")
        if not name: continue
        term = {"name": name,
                "start": b.get("start", {}).get("value"),
                "end": b.get("end", {}).get("value"),
                "office": b.get("officeLabel", {}).get("value")}
        (hog if b["prop"]["value"] == "P6" else hos).append(term)
    return hog, hos, form

def main(argv):
    only = None
    if "--only" in argv:
        only = argv[argv.index("--only") + 1]
    overwrite = "--overwrite" in argv
    limit = None
    if "--limit" in argv:
        limit = int(argv[argv.index("--limit") + 1])
    tgts, _ = targets(only)
    if "--list" in argv:
        print("\n".join(tgts)); print(f"[{len(tgts)} targets]"); return
    if limit: tgts = tgts[:limit]
    print(f"pulling history for {len(tgts)} countries...")
    filled = skipped = 0
    for i, slug in enumerate(tgts, 1):
        path = LEADERS_DIR / f"{slug}.json"
        if path.exists() and not overwrite:
            skipped += 1; continue
        _, slug_iso = targets(only)
        iso = slug_iso[slug]
        try:
            hog, hos, form = query_country(iso)
        except Exception as e:
            print(f"  [{i}/{len(tgts)}] {slug}: QUERY FAILED {e}")
            continue
        rows = build_rows(slug, hog, hos, form)
        if not rows:
            print(f"  [{i}/{len(tgts)}] {slug}: no dated terms on Wikidata (curate by hand)")
            continue
        path.write_text(json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8")
        filled += 1
        cur = next((r for r in rows if r["current"]), rows[-1])
        print(f"  [{i}/{len(tgts)}] {slug}: {len(rows)} terms, current {cur['name']} ({cur['role']})")
        time.sleep(1.0)   # be polite to the endpoint
    print(f"done: {filled} files written, {skipped} already existed.")

def self_test():
    # presidential republic: presidents only, ordered, current flag + tenure
    hos = [
        {"name": "Old President", "start": "2000-01-01", "end": "2010-01-01"},
        {"name": "New President", "start": "2010-01-01", "end": None},
    ]
    rows = build_rows("kenyaish", [], hos, "presidential republic")
    assert [r["name"] for r in rows] == ["Old President", "New President"], rows
    assert rows[0]["role"] == "President" and rows[1]["current"] is True, rows
    assert rows[0]["tenure"] == "10y 0d", rows[0]["tenure"]
    # constitutional monarchy: HoS crowned as Monarch
    rows = build_rows("bhutanish", [{"name": "A PM", "start": "2018-01-01", "end": None, "office": "Prime Minister"}],
                      [{"name": "The King", "start": "2006-01-01", "end": None}], "constitutional monarchy")
    king = [r for r in rows if r["role"] == "Monarch"][0]
    assert king["name"].startswith(CROWN), king
    # warn glyph applied to a current warned leader in history
    rows = build_rows("belarusish", [], [{"name": "Alexander Lukashenko", "start": "1994-07-20", "end": None}], "presidential republic")
    assert rows[0]["name"].startswith(WARN), rows[0]
    # realm: only P6 kept, British monarch (P35) dropped
    rows = build_rows("jamaica", [{"name": "Some PM", "start": "2016-03-03", "end": None, "office": "Prime Minister"}],
                      [{"name": "Charles III", "start": "2022-09-08", "end": None}], "")
    assert all("Charles" not in r["name"] for r in rows) and rows[0]["role"] == "Prime Minister", rows
    # executive monarchy: head of government suppressed
    rows = build_rows("monaco", [{"name": "A Minister", "start": "2016-01-01", "end": None}],
                      [{"name": "Albert II", "start": "2005-04-06", "end": None}], "constitutional monarchy")
    assert all(r["role"] == "Monarch" for r in rows), rows
    # plausibility filter: QID and lowercase junk dropped
    rows = build_rows("junkland", [], [{"name": "Q12345", "start": "2000-01-01", "end": None},
                                        {"name": "sapo cara picha", "start": "2001-01-01", "end": None}], "republic")
    assert rows == [], rows
    print("self-test OK")

if __name__ == "__main__":
    if "--self-test" in sys.argv:
        self_test()
    else:
        main(sys.argv[1:])
