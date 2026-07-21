#!/usr/bin/env python3
"""
build-state-facts.py  -- civic-facts enrichment layer for /states pages.

Produces public/data/states-facts.json, a slug-keyed enrichment layer on TOP of
the workbook-derived states.json. The workbook stays ground truth for the core
(name, pop, capital, languages, metros); this adds the "At a glance" civic pack.

Scope: 11 first-level-division countries (US CA AU MX DE IT ES IN JP BR CH).
ISO 3166-2 is the Wikidata join key. scripts/states/iso_overrides.json fills the
AU/CH gaps AND corrects stale workbook codes (2023 ISO changes, Mexico City 2016);
overrides take PRECEDENCE over the workbook value.

CIVIC PACK pulled here (Wikidata): flag P41, emblem P94, area P2046, founded P571,
demonym P1549 (English only), nickname P1449 (English only), legislature P194.
Deliberately NOT here: GDP / HDI (Wikidata coverage is ~5% and mixed currency/year
-- those come from dedicated sources in the economy cluster) and LEADERS (they live
in governors.json / state-leaders.json -- no second source of truth).

MODES
  --self-test   Offline. Asserts parse_wdqs() over mock WDQS responses (ISO join
                and name-fallback) plus add-only/fresh merge. No network.
  --dry-run     Offline. Resolves ISO for every division, writes a SEED file.
  --enrich      NETWORK (run in Ashwin's env). ISO->fields via P300, then a
                name+country fallback for any division whose ISO didn't match
                (handles code drift / missing P300, e.g. Chandigarh). ADD-ONLY
                unless --fresh.
  --fresh       With --enrich: ignore the existing file and regenerate from
                scratch (safe while nothing is hand-curated yet).
"""
import argparse, json, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STATES = os.path.join(ROOT, "public", "data", "states.json")
OUT = os.path.join(ROOT, "public", "data", "states-facts.json")
OVERRIDES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "iso_overrides.json")
NAME_OVERRIDES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "name_overrides.json")

TARGET_COUNTRIES = {
    "United States", "Canada", "Australia", "Mexico", "Germany", "Italy",
    "Spain", "India", "Japan", "Brazil", "Switzerland",
    "China", "Russia", "France", "Poland", "Netherlands", "Belgium",
    "Portugal", "Turkey", "Ukraine",
    "South Africa", "Egypt", "Indonesia", "Malaysia", "Austria", "Sweden",
    "Greece", "Czech Republic", "Romania", "New Zealand", "Denmark", "Hungary",
}
WDQS = "https://query.wikidata.org/sparql"
UA = "CitizenOfNowhere-states-facts/1.0 (https://rankings.citizenofnowhere.org)"

CIVIC_FIELDS = ["flag", "emblem", "areaKm2", "founded", "demonym", "nickname", "endonym", "legislature"]

# Division-endonym language per country. Countries whose divisions are English-
# named or too multilingual for a single language (US/CA/AU/NZ/India/Switzerland/
# South Africa) are omitted -> no separate endonym is shown.
COUNTRY_LANG = {
    "Ukraine": "uk", "Russia": "ru", "Egypt": "ar", "Japan": "ja", "China": "zh",
    "Greece": "el", "Turkey": "tr", "Poland": "pl", "Portugal": "pt",
    "Netherlands": "nl", "Germany": "de", "Italy": "it", "Spain": "es",
    "France": "fr", "Brazil": "pt", "Mexico": "es", "Sweden": "sv",
    "Austria": "de", "Hungary": "hu", "Romania": "ro", "Czech Republic": "cs",
    "Denmark": "da", "Indonesia": "id", "Malaysia": "ms", "Belgium": "nl",
}


def lang_of(country):
    return COUNTRY_LANG.get(country, "")


# Endonym comes from rdfs:label in the division's own language (?lang, bound per
# row) rather than P1705, whose first value was often the wrong language (a
# Ukrainian oblast labelled in Russian, Tamil Nadu in Kannada, etc.). ?lang="" =>
# the FILTER matches only untagged labels (none) => no endonym, which is intended
# for English-named / multilingual countries.
_CORE_OPTIONALS = """
  OPTIONAL { ?sub wdt:P41 ?flag. }
  OPTIONAL { ?sub wdt:P94 ?emblem. }
  OPTIONAL { ?sub wdt:P2046 ?area. }
  OPTIONAL { ?sub wdt:P571 ?founded. }
  OPTIONAL { ?sub wdt:P1549 ?demonym. FILTER(lang(?demonym) = "en") }
  OPTIONAL { ?sub wdt:P1449 ?nickname. FILTER(lang(?nickname) = "en") }
  OPTIONAL { ?sub wdt:P194 ?legislature. }
  OPTIONAL { ?sub wdt:P610 ?hp. OPTIONAL { ?hp wdt:P2044 ?hpElev. } }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
"""


def load_json(p, default=None):
    if not os.path.exists(p):
        return default
    with open(p, "rb") as f:
        return json.loads(f.read().decode("utf-8"))


def load_targets():
    states = load_json(STATES, [])
    overrides = load_json(OVERRIDES, {})
    out = []
    for s in states:
        if s.get("mainCountry") not in TARGET_COUNTRIES:
            continue
        iso = overrides.get(s["slug"]) or s.get("iso")  # override WINS (corrects stale codes)
        out.append({"slug": s["slug"], "name": s["name"], "country": s["mainCountry"],
                    "iso": iso, "type": s.get("type")})
    return out


def build_sparql_by_iso(iso_list):
    values = " ".join('"%s"' % i for i in iso_list if i)
    return ("SELECT ?iso ?flag ?emblem ?area ?founded ?demonym ?nickname ?legislatureLabel ?hpLabel ?hpElev WHERE {\n"
            "  VALUES ?iso { %s }\n  ?sub wdt:P300 ?iso .\n%s}" % (values, _CORE_OPTIONALS))


def build_sparql_endonym(iso_list, lang):
    # Separate pass with a LITERAL language in the filter (?lang from VALUES
    # silently matched nothing). No label service needed.
    values = " ".join('"%s"' % i for i in iso_list if i)
    return ("SELECT ?iso ?endonym WHERE {\n"
            "  VALUES ?iso { %s }\n  ?sub wdt:P300 ?iso .\n"
            '  ?sub wdt:P1705 ?endonym. FILTER(lang(?endonym) = "%s")\n}' % (values, lang))


def build_sparql_by_name(pairs):
    # pairs: list of (name, iso2 country code). Match exact English label within
    # the right country (P17 -> P297 alpha-2) so 'Distrito Federal' etc. resolve.
    vals = " ".join('("%s"@en "%s")' % (n.replace('"', '\\"'), c) for n, c in pairs)
    return ("SELECT ?name ?flag ?emblem ?area ?founded ?demonym ?nickname ?legislatureLabel ?hpLabel ?hpElev WHERE {\n"
            "  VALUES (?name ?iso2) { %s }\n"
            "  ?sub rdfs:label ?name .\n"
            "  ?sub wdt:P17 ?country . ?country wdt:P297 ?iso2 .\n%s}" % (vals, _CORE_OPTIONALS))


def _year(v):
    if not v:
        return None
    neg = v.startswith("-")
    body = v[1:] if neg else v
    try:
        y = int(body.split("-", 1)[0])
        return -y if neg else y
    except ValueError:
        return None


def parse_wdqs(payload, key="iso"):
    """WDQS JSON -> {keyValue: {field: value}}. Pure; unit-tested by --self-test."""
    out = {}
    for b in payload.get("results", {}).get("bindings", []):
        k = b.get(key, {}).get("value")
        if not k:
            continue
        rec = out.setdefault(k, {})
        for var, fld in (("flag", "flag"), ("emblem", "emblem")):
            if var in b and fld not in rec:
                rec[fld] = b[var]["value"]
        if "area" in b and "areaKm2" not in rec:
            try:
                rec["areaKm2"] = round(float(b["area"]["value"]), 1)
            except ValueError:
                pass
        if "founded" in b and "founded" not in rec:
            yr = _year(b["founded"]["value"])
            if yr is not None:
                rec["founded"] = yr
        for var, fld in (("demonym", "demonym"), ("nickname", "nickname"),
                         ("endonym", "endonym"),
                         ("legislatureLabel", "legislature"),
                         ("hpLabel", "highestPoint")):
            if var in b and fld not in rec:
                rec[fld] = b[var]["value"]
        if "hpElev" in b and "highestPointM" not in rec:
            try:
                rec["highestPointM"] = round(float(b["hpElev"]["value"]))
            except ValueError:
                pass
    return out


def merge(existing, incoming_by_slug, fresh=False):
    for slug, fields in incoming_by_slug.items():
        cur = existing.setdefault(slug, {})
        for k, v in fields.items():
            if fresh or cur.get(k) in (None, "", []):
                cur[k] = v
    return existing


def write_out(data):
    tmp = OUT + ".tmp"
    with open(tmp, "wb") as f:
        f.write(json.dumps(data, ensure_ascii=False, indent=1).encode("utf-8"))
    os.replace(tmp, OUT)


def _seed(facts, targets, fresh=False):
    for t in targets:
        rec = facts.setdefault(t["slug"], {})
        if fresh or rec.get("iso") in (None, ""):
            rec["iso"] = t["iso"]
        rec.setdefault("name", t["name"])
        rec.setdefault("country", t["country"])
    return facts


def _run(query, tries=4):
    import urllib.parse, urllib.request, urllib.error, time
    data = urllib.parse.urlencode({"query": query, "format": "json"}).encode("utf-8")
    for attempt in range(tries):
        req = urllib.request.Request(
            WDQS,
            data=data,  # POST body -> no URL/header size limit
            headers={
                "User-Agent": UA,
                "Accept": "application/sparql-results+json",
                "Content-Type": "application/x-www-form-urlencoded",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code in (408, 429, 500, 502, 503, 504) and attempt < tries - 1:
                time.sleep(3 * (attempt + 1)); continue
            raise
        except urllib.error.URLError:
            if attempt < tries - 1:
                time.sleep(3 * (attempt + 1)); continue
            raise


def cmd_dry_run():
    targets = load_targets()
    facts = _seed(load_json(OUT, {}) or {}, targets)
    write_out(facts)
    have = sum(1 for t in targets if t["iso"])
    print("dry-run: %d divisions, %d with ISO join key, %d without" % (len(targets), have, len(targets) - have))
    print("wrote", OUT, "->", len(facts), "slugs")


def cmd_enrich(fresh=False):
    targets = load_targets()
    iso_map = {t["iso"]: t["slug"] for t in targets if t["iso"]}
    iso_lang = {t["iso"]: lang_of(t["country"]) for t in targets if t["iso"]}
    isos = list(iso_map)
    by_iso = {}
    CHUNK = 50
    for i in range(0, len(isos), CHUNK):
        part = isos[i:i + CHUNK]
        by_iso.update(parse_wdqs(_run(build_sparql_by_iso(part)), key="iso"))
        print("  iso batch %d-%d -> %d matched so far" % (i + 1, i + len(part), len(by_iso)))
    by_slug = {iso_map[i2]: f for i2, f in by_iso.items() if i2 in iso_map}

    # Name fallback for divisions whose ISO did not resolve (code drift / no P300).
    unmatched = [t for t in targets if t["iso"] and t["slug"] not in by_slug]
    if unmatched:
        name_ov = load_json(NAME_OVERRIDES, {})
        pairs, name_slug = [], {}
        for t in unmatched:
            iso2 = t["iso"].split("-", 1)[0]
            label = name_ov.get(t["slug"]) or t["name"]
            pairs.append((label, iso2))
            name_slug[label] = t["slug"]
        resolved = 0
        for i in range(0, len(pairs), 5):
            try:
                bn = parse_wdqs(_run(build_sparql_by_name(pairs[i:i + 20])), key="name")
            except Exception as e:  # never let a fallback hiccup lose the ISO data
                print("  name-fallback batch %d failed (%s); skipping" % (i // 20, e))
                continue
            for nm, ff in bn.items():
                if nm in name_slug:
                    by_slug.setdefault(name_slug[nm], {}).update(ff); resolved += 1
        print("name-fallback: %d attempted, %d resolved" % (len(unmatched), resolved))

    from collections import defaultdict
    by_lang = defaultdict(list)
    for iso in iso_map:
        l = iso_lang.get(iso)
        if l:
            by_lang[l].append(iso)
    n_endo = 0
    for lang, isos_l in by_lang.items():
        for i in range(0, len(isos_l), 60):
            try:
                res = parse_wdqs(_run(build_sparql_endonym(isos_l[i:i + 60], lang)), key="iso")
            except Exception as e:
                print("  endonym batch (%s) failed: %s" % (lang, e)); continue
            for iso2, fields in res.items():
                sl = iso_map.get(iso2)
                if sl and fields.get("endonym"):
                    by_slug.setdefault(sl, {})["endonym"] = fields["endonym"]
                    n_endo += 1
    print("endonym pass: %d resolved" % n_endo)

    facts = {} if fresh else (load_json(OUT, {}) or {})
    facts = _seed(facts, targets, fresh=fresh)
    facts = merge(facts, by_slug, fresh=fresh)
    write_out(facts)
    print("enrich: %d ISO queried, %d divisions enriched" % (len(iso_map), len(by_slug)))
    print("wrote", OUT, "->", len(facts), "slugs")


# ---------------- offline self-test ----------------
MOCK_ISO = {"results": {"bindings": [
    {"iso": {"value": "US-CA"},
     "flag": {"value": "http://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20California.svg"},
     "area": {"value": "423967"}, "founded": {"value": "1850-09-09T00:00:00Z"},
     "demonym": {"value": "Californian", "xml:lang": "en"},
     "nickname": {"value": "The Golden State", "xml:lang": "en"},
     "endonym": {"value": "California", "xml:lang": "en"},
     "legislatureLabel": {"value": "California State Legislature"},
     "hpLabel": {"value": "Mount Whitney"}, "hpElev": {"value": "4421"}},
    # Bavaria row where the ONLY demonym is Italian -> our SPARQL FILTER(lang=en)
    # means the server never returns it; simulate that (no demonym key present):
    {"iso": {"value": "DE-BY"}, "area": {"value": "70550.19"},
     "founded": {"value": "1919-01-01T00:00:00Z"},
     "legislatureLabel": {"value": "Landtag of Bavaria"}},
]}}
MOCK_NAME = {"results": {"bindings": [
    {"name": {"value": "Chandigarh", "xml:lang": "en"}, "area": {"value": "114"},
     "legislatureLabel": {"value": "Chandigarh Administration"}},
]}}


def cmd_self_test():
    r = parse_wdqs(MOCK_ISO, key="iso")
    ca = r["US-CA"]
    assert ca["nickname"] == "The Golden State" and ca["demonym"] == "Californian", ca
    assert ca["areaKm2"] == 423967.0 and ca["founded"] == 1850, ca
    assert ca["legislature"] == "California State Legislature", ca
    assert ca["endonym"] == "California", ca
    assert ca["highestPoint"] == "Mount Whitney" and ca["highestPointM"] == 4421, ca
    by = r["DE-BY"]
    assert "demonym" not in by and by["founded"] == 1919, by  # non-en demonym never arrives
    rn = parse_wdqs(MOCK_NAME, key="name")
    assert rn["Chandigarh"]["areaKm2"] == 114.0, rn
    # add-only keeps curated; fresh overwrites
    assert merge({"x": {"nickname": "CURATED"}}, {"x": {"nickname": "wiki"}})["x"]["nickname"] == "CURATED"
    assert merge({"x": {"nickname": "CURATED"}}, {"x": {"nickname": "wiki"}}, fresh=True)["x"]["nickname"] == "wiki"
    print("self-test OK: iso+name parse, en-only demonym/nickname, add-only vs fresh")


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--self-test", action="store_true")
    g.add_argument("--dry-run", action="store_true")
    g.add_argument("--enrich", action="store_true")
    ap.add_argument("--fresh", action="store_true", help="with --enrich: full regen, ignore existing file")
    a = ap.parse_args()
    if a.self_test:
        cmd_self_test()
    elif a.dry_run:
        cmd_dry_run()
    elif a.enrich:
        cmd_enrich(fresh=a.fresh)


if __name__ == "__main__":
    main()
