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
# NB: Wikidata's P122 for some of these comes back as a bare "republic" (not
# "parliamentary republic"), so the form-string heuristic in build_entry misses
# them -- they must be listed here explicitly. India is one such case: it returned
# form="republic", so it rendered President-first (and shipped a vandalized
# ceremonial name as the world's #5 most powerful person) until added here.
PM_LED = {
    "germany","poland","austria","czech-republic","hungary","greece","portugal","finland",
    "ethiopia","iraq","georgia","croatia","bulgaria","bosnia-herzegovina",
    "montenegro","slovenia","slovakia","lithuania","india","israel",
}
# Windows consoles default to cp1252, which cannot print the crown/warn glyphs
# and crashed a live run mid-loop (2026-08-03). Harmless no-op elsewhere.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# Curated overrides for countries where Wikidata is stale or wrong about the
# office holder. Applied verbatim in main() (still glyph-processed by apply_warn),
# and preserved across re-scrapes. Update deliberately, by hand, with a real change.
CURATED_OVERRIDES = {
    # Wikidata returns King Salman for BOTH P35 (head of state) and P6 (head of
    # government), with a 2015 accession date -- it has no knowledge of MBS as PM.
    # Mohammed bin Salman has been Prime Minister (head of government) since
    # 2022-09-27; we track heads of government, so this is the PM, not the King.
    "saudi-arabia": {"name": "Mohammed bin Salman", "role": "PM", "since": "2022-09-27"},
    # Wikidata's P6 for Hungary is an unresolved QID (Q124488292, no en label), so
    # it degrades to acting-President Forsthoffer. Péter Magyar has been PM since
    # 2026-05-09 (news-verified). Remove this override once Wikidata resolves the label.
    "hungary": {"name": "Péter Magyar", "role": "PM", "since": "2026-05-09"},
    # Wikidata's P6 for Bulgaria is stale (still Kiril Petkov, 2021). Rumen Radev
    # resigned the presidency and was elected PM on 2026-05-08 (news-verified).
    # Remove this override once Wikidata catches up.
    "bulgaria": {"name": "Rumen Radev", "role": "PM", "since": "2026-05-08"},
    # Wikidata's P6 for Kuwait still lists Sabah Al-Khalid Al-Sabah, who left the
    # premiership in 2022 and has been CROWN PRINCE since 1 Jun 2024. Ahmad
    # Al-Abdullah Al-Sabah has been PM since 15 May 2024 (Wikipedia/news-verified
    # 2026-08-03). Remove once Wikidata's claim is corrected.
    "kuwait": {"name": "Ahmad Al-Abdullah Al-Sabah", "role": "PM", "since": "2024-05-15",
               "second": {"name": "👑 Mishal Al-Ahmad Al-Jaber Al-Sabah", "role": "Monarch"}},
}
# Monarchies whose Wikidata P122 label doesn't say "monarchy" (missing or an
# unusual label), which degraded their sovereign to a bare "President" row.
# These are structural facts, not current events — safe to curate.
FORCE_MONARCHY = {"brunei", "jordan"}
# Curated accession/appointment dates for leaders whose CURRENT Wikidata claim
# carries no P580 start qualifier (checked 2026-08-03; all Wikipedia-verified).
# Keyed by (slug, name prefix) — matched against the bare primary name via
# prefix, so labels like "Abdullah II of Jordan" match and a SUCCESSION
# automatically invalidates the fallback instead of mislabeling the new
# leader's tenure. Switzerland is deliberately absent: the Federal Council is
# collective and carries no single accession date (Ashwin, 2026-08-03).
SINCE_FALLBACK = {
    ("brunei", "Hassanal Bolkiah"): "1967-10-05",                        # Sultan since 5 Oct 1967
    ("jordan", "Abdullah II"): "1999-02-07",                             # King since 7 Feb 1999
    ("united-arab-emirates", "Mohammed bin Rashid Al Maktoum"): "2006-02-11",  # PM since 11 Feb 2006
}

def since_fallback(slug, name):
    b = bare(name)
    for (s, prefix), d in SINCE_FALLBACK.items():
        if s == slug and b.startswith(prefix):
            return d
    return None
# Executive monarchies where the sovereign (not the appointed head of government) leads.
MONARCH_LED = {"monaco","eswatini","oman","brunei"}
# Commonwealth realms: share King Charles III as head of state (crowned monarch),
# but the head of government leads. Wikidata often lacks P6/P122 for the smaller
# realms, which previously degraded them to a bare "Charles III, President"; this
# set forces correct monarchy + PM-led treatment.
COMMONWEALTH_REALMS = {
    "united-kingdom","canada","australia","new-zealand","antigua-barbuda","bahamas",
    "belize","grenada","jamaica","papua-new-guinea","st-kitts-nevis","saint-lucia",
    "st-vincent-the-grenadines","solomon-islands","tuvalu",
}
# Current leaders that carry a warning glyph (editorial; cannot be auto-derived).
WARN_NAMES = {
    # Current leaders carrying a warning glyph (atrocities / systemic subversion /
    # criminal conviction). Historical figures are flagged in the per-country
    # history files directly; this set only re-applies the glyph on the live feed.
    "Vladimir Putin","Ali Khamenei","Mojtaba Khamenei","Kim Jong-un","Alexander Lukashenko",
    "Abdel Fattah al-Burhan","Min Aung Hlaing","Donald Trump",
    "Abdel Fattah el-Sisi","Kais Saied","Benjamin Netanyahu","Mohammed bin Salman","Recep Tayyip Erdoğan",
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
    if primary.get("start"):
        out["since"] = primary["start"]
    else:
        fb = since_fallback(slug, primary["name"])
        if fb: out["since"] = fb
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

def build_entry(slug, hos_name, hog_name, hog_office, form, hos_start=None, hog_start=None):
    form_l = (form or "").lower()
    is_monarchy = "monarchy" in form_l or slug in FORCE_MONARCHY
    # Parliamentary republics (and the curated PM-led set) lead with the head of
    # government; presidential and semi-presidential systems lead with the
    # president; monarchies fall through to default (a sitting PM outranks the
    # ceremonial monarch, matching the rest of the site).
    pm_led = (slug in PM_LED) or ("parliamentary" in form_l)
    if slug in COMMONWEALTH_REALMS:
        is_monarchy = True   # crown the shared sovereign (Charles III)
        pm_led = True        # head of government leads, monarch second
    # Filter candidate names through _plausible so a vandalized head-of-state or
    # head-of-government label is dropped entirely -- never selected as primary AND
    # never surfaced as the ceremonial "second" (which main()'s primary-only check
    # would otherwise miss).
    cands = []
    if hog_name and _plausible(hog_name) and slug not in MONARCH_LED:
        cands.append({"name": hog_name, "role": hog_role_token(hog_office), "start": hog_start})
    if hos_name and _plausible(hos_name):
        if is_monarchy:
            cands.append({"name": f"{CROWN} {hos_name}", "role": "Monarch", "start": hos_start})
        else:
            cands.append({"name": hos_name, "role": "President", "start": hos_start})
    res = pick(slug, cands, pm_led)
    return apply_warn(res) if res else None

SPARQL = """
SELECT ?iso ?hosLabel ?hogLabel ?hosStart ?hogStart ?hogOfficeLabel ?formLabel WHERE {
  ?country wdt:P297 ?iso .
  OPTIONAL { ?country p:P35 ?hosSt. ?hosSt ps:P35 ?hos. FILTER NOT EXISTS { ?hosSt pq:P582 ?hosEnd } OPTIONAL { ?hosSt pq:P580 ?hosStart } }
  OPTIONAL { ?country p:P6 ?hogSt. ?hogSt ps:P6 ?hog. FILTER NOT EXISTS { ?hogSt pq:P582 ?hogEnd } OPTIONAL { ?hogSt pq:P580 ?hogStart } }
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
        for k_out, k_in in [("hos","hosLabel"),("hog","hogLabel"),("office","hogOfficeLabel"),
                            ("form","formLabel"),("hos_start","hosStart"),("hog_start","hogStart")]:
            v = b.get(k_in,{}).get("value")
            if v and k_out not in d:
                d[k_out] = v[:10] if k_out.endswith("_start") else v
    return by_iso

ISO2_BY_SLUG = Path(__file__).with_name("iso2_by_slug.json")

def load_slug_iso():
    """slug -> ISO 3166-1 alpha-2. Prefers the curated iso2_by_slug.json map
    (countries.json's isoCode field holds display NAMES, not codes), and falls
    back to isoCode only when it is already a valid alpha-2 string."""
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

# Name particles that legitimately stay lowercase mid-name (bin Salman, da Silva,
# van der Bellen, ...). Anything else lowercase mid-name is treated as vandalism.
_PARTICLES = {"bin","bint","ibn","al","van","von","de","da","del","dos","di","der",
              "ter","of","the","e","du","la","le","y","dos","das"}

def _plausible(name):
    """Reject unresolved QIDs (Q22686), all-lowercase vandalism (sapo cara picha),
    AND capitalized-first / lowercased-rest vandalism (Ganesh rajput) before it
    reaches _current.json / the live site. The last case is the one the earlier
    guard missed: "Ganesh" is capitalized so the has-an-uppercase check passed,
    but "rajput" is a lowercase non-particle word -- the vandalism signature."""
    b = bare(name)
    if len(b) < 2: return False
    if re.fullmatch(r"Q\d+", b): return False
    words = [w for w in re.split(r"\s+", b) if w]
    if not any(w[:1].isupper() or (w[:1] and not w[:1].isascii()) for w in words):
        return False
    for w in words[1:]:
        if w.isascii() and w.isalpha() and w.islower() and w.lower() not in _PARTICLES:
            return False
    return True


CHANGES = LEADERS_DIR / "_changes.json"
ROLE_FULL = {
    "PM": "Prime Minister", "Pres.": "President", "Federal Chanc.": "Federal Chancellor",
    "Chanc.": "Chancellor", "Sup. Leader": "Supreme Leader", "Taoiseach": "Taoiseach",
    "Monarch": "Monarch", "Pope": "Pope", "Chief Adviser": "Chief Adviser",
    "Acting Pres.": "President", "Gen. Sec.": "General Secretary",
}

def _office_family(role):
    r = (role or "").lower()
    if any(k in r for k in ("monarch", "king", "queen", "emperor", "sovereign")):
        return "monarch"
    if any(k in r for k in ("pm", "prime minister", "chanc", "taoiseach", "chief adviser", "premier")):
        return "gov"
    return "state"

def _tenure(start, end):
    import datetime
    try:
        s = datetime.date.fromisoformat(start[:10]); e = datetime.date.fromisoformat(end[:10])
        days = (e - s).days
        if days < 0: return ""
        return f"{days // 365}y {(days % 365) // 30}m {(days % 365) % 30}d"
    except Exception:
        return ""

def _slug_country_name():
    try:
        cj = json.loads(COUNTRIES.read_text(encoding="utf-8"))
        rows = cj if isinstance(cj, list) else (cj.get("countries") or list(cj.values())[0])
        return {r["slug"]: r.get("name", r["slug"]) for r in rows if isinstance(r, dict) and r.get("slug")}
    except Exception:
        return {}

def _update_history(slug, new_name, abbrev_role, since):
    """Conservatively retire the outgoing current entry for the changed office
    and insert the incoming one in the per-country history file. Returns the
    office label; only mutates the file when exactly one current entry matches
    the changed office family (skips ambiguous cases, still logs the change)."""
    office_full = ROLE_FULL.get(abbrev_role, abbrev_role or "Head of government")
    fpath = LEADERS_DIR / f"{slug}.json"
    fam = _office_family(abbrev_role)
    if not fpath.exists():
        return office_full
    try:
        d = json.loads(fpath.read_text(encoding="utf-8"))
    except Exception:
        return office_full
    cur = [i for i, x in enumerate(d) if x.get("current") and _office_family(x.get("role")) == fam]
    if len(cur) != 1:
        return office_full
    idx = cur[0]; old = d[idx]
    if bare(old.get("name", "")) == bare(new_name):
        return office_full
    old["current"] = False
    old["end"] = since
    if old.get("start"):
        old["tenure"] = _tenure(old["start"], since)
    new = {"name": new_name, "role": old.get("role") or office_full, "start": since,
           "end": None, "current": True, "tenure": "in office", "party": "", "era": old.get("era")}
    if "metros" in old:
        new["metros"] = old["metros"]
    d.insert(idx + 1, new)
    fpath.write_text(json.dumps(d, indent=2, ensure_ascii=False), encoding="utf-8")
    return office_full

def _append_changes(records):
    import datetime
    today = datetime.date.today().isoformat()
    data = {"updated": today, "changes": []}
    if CHANGES.exists():
        try: data = json.loads(CHANGES.read_text(encoding="utf-8"))
        except Exception: pass
    seen = {(c.get("slug"), c.get("to"), c.get("date")) for c in data.get("changes", [])}
    added = 0
    for r in records:
        key = (r.get("slug"), r.get("to"), r.get("date"))
        if key in seen: continue
        data.setdefault("changes", []).insert(0, r); seen.add(key); added += 1
    data["updated"] = today
    data["changes"] = data.get("changes", [])[:500]
    CHANGES.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"_changes.json: +{added} new (total {len(data['changes'])})")


def main(add_only=False):
    import datetime
    slug_iso = load_slug_iso()
    existing = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    name_by_slug = _slug_country_name()
    change_log = []
    wd = query_wikidata()
    changed = 0
    for slug, iso in slug_iso.items():
        info = wd.get(iso)
        if slug in CURATED_OVERRIDES:
            entry = apply_warn(dict(CURATED_OVERRIDES[slug]))   # override wins over stale Wikidata
        elif info:
            entry = build_entry(slug, info.get("hos"), info.get("hog"), info.get("office"), info.get("form",""), info.get("hos_start"), info.get("hog_start"))
        else:
            continue
        if not entry: continue
        if not _plausible(entry["name"]):
            print(f"  skip {slug}: implausible name {entry['name']!r}")
            continue
        prev = existing.get(slug)
        # --add-only: never touch a country that already has a (curated) entry.
        if add_only and prev:
            continue
        # Same person still leads: never a succession, but MERGE in fields the
        # refresh can now supply — a missing since, a monarch crown/role fix, a
        # newly resolvable second — keeping any prev-only fields (e.g. a curated
        # since the new fetch lacks). Nothing is logged to _changes.json: same
        # leader = curation, not succession. (Brunei/Jordan/UAE sat since-less
        # for weeks because this branch used to freeze name-only entries.)
        # MUST run before the realm safeguard: a same-person Pres.→Monarch fix
        # (Brunei, Jordan) is a correction, not the regression it guards against.
        if prev and bare(prev["name"]) == bare(entry["name"]):
            # FILL-ONLY: the fresh entry supplies fields prev lacks (since,
            # second); prev wins every conflict so curated values are never
            # clobbered by a Wikidata flap. One deliberate exception: the
            # Pres.→Monarch mislabel correction takes the fresh role AND name
            # (crown glyph) — that's the Brunei/Jordan fix, not a flap.
            merged = {**{k: v for k, v in entry.items() if v}, **prev}
            if entry.get("role") == "Monarch" and prev.get("role") in ("Pres.", "President"):
                merged["role"] = entry["role"]
                merged["name"] = entry["name"]
            if merged != prev:
                existing[slug] = merged
                changed += 1
                print(f"  refreshed {slug}: same leader, fields filled ({bare(entry['name'])})")
            continue
        # Realm safeguard: if Wikidata dropped the head of government and we'd
        # regress a curated PM entry to a DIFFERENT monarch-only one, keep the
        # curated entry (same-person corrections were already handled above).
        if prev and not add_only and entry.get("role") == "Monarch" \
           and "second" not in entry and prev.get("role") != "Monarch":
            continue
        existing[slug] = entry
        changed += 1
        print(f"  {'added' if not prev else 'updated'} {slug}: {entry['name']} ({entry['role']})")
        if prev:  # a genuine leadership change, not a first-time gap fill
            since = entry.get("since") or datetime.date.today().isoformat()
            office = _update_history(slug, entry["name"], entry.get("role", ""), since)
            change_log.append({
                "date": since, "slug": slug,
                "country": name_by_slug.get(slug, slug.replace("-", " ").title()),
                "office": office, "from": bare(prev.get("name", "")) or None,
                "to": bare(entry["name"]), "source": "wikidata",
            })
    OUT.write_text(json.dumps(existing, indent=2, ensure_ascii=False, sort_keys=True), encoding="utf-8")
    print(f"_current.json written: {len(existing)} countries, {changed} changed (add_only={add_only})")
    if change_log:
        _append_changes(change_log)

def self_test():
    # parliamentary republic: PM leads, president secondary
    e = build_entry("croatia", "Zoran Milanovic", "Andrej Plenkovic", "Prime Minister of Croatia", "parliamentary republic")
    assert e["name"] == "Andrej Plenkovic" and e["role"] == "PM" and e["second"]["name"] == "Zoran Milanovic", e
    # presidential: president only
    e = build_entry("kenya", "William Ruto", None, None, "presidential system", hos_start="2022-09-13")
    assert e["name"] == "William Ruto" and e["role"] == "Pres." and "second" not in e, e
    assert e.get("since") == "2022-09-13", e
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
    # executive monarchy: sovereign leads, head of government suppressed
    e = build_entry("monaco", "Albert II", "Christophe Mirmand", "Minister of State", "constitutional monarchy")
    assert e["role"] == "Monarch" and "second" not in e, e
    # Commonwealth realm: PM leads, Charles crowned as Monarch second, even with blank form
    e = build_entry("jamaica", "Charles III", "Andrew Holness", "Prime Minister of Jamaica", "")
    assert e["name"] == "Andrew Holness" and e["role"] == "PM" and e["second"]["name"].startswith(CROWN) and "Charles III" in e["second"]["name"], e
    # realm with missing head of government -> crowned monarch only (main() guard preserves curated PM)
    e = build_entry("tuvalu", "Charles III", None, None, "")
    assert e["role"] == "Monarch" and e["name"].startswith(CROWN), e
    # India: Wikidata returns form="republic" (not "parliamentary"), so it relies on
    # the PM_LED set to lead with the PM. A vandalized head-of-state label
    # ("Ganesh rajput") is dropped by the plausibility filter, NOT surfaced as second.
    e = build_entry("india", "Ganesh rajput", "Narendra Modi", "Prime Minister of India",
                    "republic", hos_start="2022-07-25", hog_start="2014-05-26")
    assert e == {"name": "Narendra Modi", "role": "PM", "since": "2014-05-26"}, e
    # _plausible: rejects capitalized-first / lowercased-rest vandalism and QIDs;
    # keeps real names and legitimate lowercase particles.
    assert _plausible("Narendra Modi") and _plausible("Mohammed bin Salman") and _plausible("Lula da Silva")
    assert not _plausible("Ganesh rajput") and not _plausible("Q42") and not _plausible("sapo cara picha")
    # curated override entries are well-formed and glyph-processed (MBS is warn-listed)
    assert "saudi-arabia" in CURATED_OVERRIDES
    assert apply_warn(dict(CURATED_OVERRIDES["saudi-arabia"]))["name"] == f"{WARN} Mohammed bin Salman"
    # SINCE_FALLBACK: prefix-matches decorated/qualified labels, dies with succession
    assert since_fallback("jordan", f"{CROWN} Abdullah II of Jordan") == "1999-02-07"
    assert since_fallback("jordan", "Hussein bin Abdullah") is None       # next king: no stale date
    assert since_fallback("switzerland", "Swiss Federal Council") is None  # collective: no date by design
    # FORCE_MONARCHY: Brunei's sultan crowns + dates even with a blank P122 form
    e = build_entry("brunei", "Hassanal Bolkiah I of Brunei", None, None, "")
    assert e["role"] == "Monarch" and e["name"].startswith(CROWN) and e["since"] == "1967-10-05", e
    # Kuwait override is well-formed: PM + emir second + verified date
    kw = CURATED_OVERRIDES["kuwait"]
    assert kw["since"] == "2024-05-15" and kw["second"]["role"] == "Monarch"
    # change side-effects helpers
    assert _office_family("PM") == "gov" and _office_family("Pres.") == "state" and _office_family("Monarch") == "monarch"
    assert _office_family("Federal Chanc.") == "gov" and _office_family("Sup. Leader") == "state"
    assert _tenure("2024-07-05", "2026-07-21").startswith("2y")
    assert _tenure("2026-07-21", "2026-07-01") == ""  # negative guarded
    assert ROLE_FULL["PM"] == "Prime Minister"
    print("self-test OK")

if __name__ == "__main__":
    if "--self-test" in sys.argv:
        self_test()
    else:
        main(add_only="--add-only" in sys.argv)
