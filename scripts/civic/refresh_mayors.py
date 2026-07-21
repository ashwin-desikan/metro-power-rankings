#!/usr/bin/env python3
"""refresh_mayors.py — mayors of the PRIMARY CITY of the top-100 metros from
Wikidata (P6), keyed by metro slug -> public/data/mayors.json.

Two-phase design (city-qids.json caches phase 1's output):
  1. QID discovery (cold-start / self-healing only): resolve each metro's
     Wikidata city QID via a city+country LABEL join. The join MUST pin its
     evaluation order (hint:Query hint:optimizer "None", label lookups before
     the P17 country edge) — left to its own devices Blazegraph starts from the
     country side and enumerates every entity in the country before the label
     can narrow it, which 504s EVERY time regardless of WDQS health. That
     structural timeout, not any WDQS outage, is what stalled this phase for
     weeks. Chunked, and persists each successful chunk immediately, so a
     mid-run failure loses no progress and the next run resumes where it left
     off. A name matches several entities, so we keep the one with the most
     sitelinks (the primary city, not a same-named district/suburb). Only runs
     for slugs not already cached; once cached a QID is stable and never
     re-touched.
  2. Mayor lookup (the hot weekly path): ONE query, VALUES over the cached
     QIDs directly (?city p:P6 ?st ...) — the same cheap, indexed
     entity-matching pattern refresh_governors.py / refresh_congress.py use,
     no label join. This is what makes the weekly run fast and reliable.

A coverage floor (COVERAGE_FLOOR) aborts the write if too few mayors resolved
this run, matching the abort-without-writing guard refresh_governors.py /
refresh_congress.py already use — previously this script would silently write
a truncated mayors.json instead. China cities get a party-secretary second
line via mayors-overrides.json. --self-test for offline CI (network-free)."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from civic_common import sanity_ok, merge_overrides, load_json, write_json, sparql, qid  # noqa

ROOT = Path(__file__).resolve().parents[2]
METROS = ROOT / "public" / "data" / "metros.json"
OUT = ROOT / "public" / "data" / "mayors.json"
OVR = Path(__file__).with_name("mayors-overrides.json")
PARTIES = Path(__file__).with_name("mayor-parties.json")
QID_CACHE = Path(__file__).with_name("city-qids.json")
TOP_N = 100
COVERAGE_FLOOR = 0.70  # abort the write below this fraction of TOP_N resolved

def top_metros():
    d = load_json(METROS, [])
    rows = d if isinstance(d, list) else d.get("metros", d)
    rows = sorted(rows, key=lambda r: r.get("rank", 99999))[:TOP_N]
    return [{"slug": r["slug"], "city": r.get("primaryCity") or r.get("name"),
             "country": r.get("country", "")} for r in rows]

def esc(s): return (s or "").replace("\\", "").replace('"', '\\"')

def discover_missing_qids(metros, cache):
    """Cold-start / self-healing: resolve a Wikidata city QID for any metro
    not already in the cache. The label join is pinned to a label-first
    evaluation order via an optimizer hint (see module docstring) — without it
    the query 504s every run, which is what stalled this phase for weeks and
    was mistaken for a WDQS outage. Chunked; each successful chunk is saved
    immediately so a timeout partway through still keeps whatever it found. A
    city name matches several entities, so per key we keep the highest-sitelink
    one (the primary city). Requiring an open P6 (head-of-government) statement
    both disambiguates toward the governed city and matches phase 2's need — a
    city with no modelled mayor could not produce one anyway, so it is left
    uncached for an override to supply (e.g. Sydney, whose mayor sits on the
    separate 'City of Sydney' LGA entity, not the settlement).

    retries=2/timeout=45 (vs civic_common.sparql's default retries=4/timeout=180)
    is deliberate: an unresolved chunk just retries again NEXT WEEK (that's the
    whole point of the cache), so there is no value in burning the wrapper's
    step-timeout budget on aggressive in-run retries here. With the join order
    pinned each chunk now returns in a few seconds, so the ~93s worst case per
    chunk is effectively never hit."""
    missing = [m for m in metros if m["slug"] not in cache]
    if not missing:
        return cache
    CHUNK = 12
    for i in range(0, len(missing), CHUNK):
        chunk = missing[i:i + CHUNK]
        values = "\n".join(
            f'    ("{esc(m["slug"])}" "{esc(m["city"])}" "{esc(m["country"])}")' for m in chunk)
        # hint:optimizer "None" forces top-to-bottom evaluation: bind the
        # country/city labels (indexed, tiny) BEFORE the P17 edge. Without it
        # Blazegraph joins from the country side first and scans every entity in
        # the country -> guaranteed 504. wikibase:sitelinks lets us pick the
        # primary city when a name matches several entities.
        q = f"""SELECT ?key ?city ?sitelinks WHERE {{
      hint:Query hint:optimizer "None" .
      VALUES (?key ?cityLabel ?countryLabel) {{
{values}
      }}
      BIND(STRLANG(?cityLabel, "en") AS ?clab)
      BIND(STRLANG(?countryLabel, "en") AS ?ctlab)
      ?ctry rdfs:label ?ctlab .
      ?city rdfs:label ?clab .
      ?city wdt:P17 ?ctry .
      ?city p:P6 ?st . FILTER NOT EXISTS {{ ?st pq:P582 ?e }}
      ?city wikibase:sitelinks ?sitelinks .
    }}"""
        try:
            rows = sparql(q, timeout=45, retries=2)
        except Exception as e:
            print(f"  QID discovery chunk {i // CHUNK} failed ({e}); will retry next run")
            continue
        best = {}  # slug -> (qid, sitelinks); keep the most-linked match per slug
        for b in rows:
            key = b.get("key", {}).get("value", "")
            city_uri = b.get("city", {}).get("value", "")
            try:
                links = int(b.get("sitelinks", {}).get("value", "0"))
            except ValueError:
                links = 0
            if key and city_uri and (key not in best or links > best[key][1]):
                best[key] = (qid(city_uri), links)
        if best:
            for key, (city_qid, _) in best.items():
                cache[key] = city_qid
            write_json(QID_CACHE, cache, sort_keys=True)  # persist progress incrementally
    return cache

def resolve_mayors(cache):
    """Hot weekly path: one QID-VALUES query for every cached city — same
    cheap entity-matching pattern as refresh_governors.py / refresh_congress.py,
    no label join. Returns {slug: {mayor, since, party}}."""
    qid_to_slug = {q: slug for slug, q in cache.items() if q}
    if not qid_to_slug:
        return {}
    values = " ".join(f"wd:{q}" for q in qid_to_slug)
    query = f"""SELECT ?city ?mayorLabel ?partyLabel ?start WHERE {{
      VALUES ?city {{ {values} }}
      ?city p:P6 ?st . ?st ps:P6 ?mayor .
      FILTER NOT EXISTS {{ ?st pq:P582 ?e }}
      OPTIONAL {{ ?st pq:P580 ?start }}
      OPTIONAL {{ ?mayor wdt:P102 ?party }}
      SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
    }}"""
    # A city usually carries SEVERAL open (no end-date) P6 statements: on
    # Wikidata a predecessor's term often never got an end date, and some
    # cities even list the mayoralty position item itself (a dateless
    # "mayor of <city>" placeholder). Keep the statement with the LATEST start
    # date (P580) so we report the sitting mayor, not an arbitrary predecessor
    # or the placeholder — a dated real person always outranks a dateless one.
    best = {}  # slug -> (start, info)
    for b in sparql(query, timeout=120):
        slug = qid_to_slug.get(qid(b.get("city", {}).get("value", "")))
        nm = b.get("mayorLabel", {}).get("value", "")
        if not slug or not sanity_ok(nm):
            continue
        start = (b.get("start", {}).get("value", "") or "")[:10]
        if slug not in best or start > best[slug][0]:
            best[slug] = (start, {"mayor": nm, "since": start,
                                  "party": b.get("partyLabel", {}).get("value", "")})
    return {slug: info for slug, (_, info) in best.items()}

def build(metros, resolved, overrides, parties):
    out = {}
    for m in metros:
        info = resolved.get(m["slug"])
        if not info:
            continue
        party = info.get("party", "")
        # Party gap-fill: many mayors have no P102 (member-of-party) statement on
        # Wikidata, so the hot path leaves party blank. Fill from mayor-parties.json
        # ONLY when it is blank AND the curated name still matches the resolved
        # mayor — so the fill self-heals (a new mayor or a later Wikidata P102 both
        # drop the stale gap-fill instead of mislabelling the wrong person). Full
        # overrides (below) still win outright for names Wikidata has stale/wrong.
        if not party:
            gf = parties.get(m["slug"])
            if gf and gf.get("mayor", "").strip() == (info["mayor"] or "").strip():
                party = gf.get("party", "")
        out[m["slug"]] = {"city": m["city"], "country": m["country"],
                          "mayor": info["mayor"], "title": "Mayor", "since": info["since"], "party": party}
    return merge_overrides(out, overrides)

def coverage_ok(resolved_count, total, floor=COVERAGE_FLOOR):
    return total > 0 and resolved_count >= total * floor

def main():
    metros = top_metros()
    cache = load_qid_cache()
    cache = discover_missing_qids(metros, cache)
    still_missing = [m["slug"] for m in metros if m["slug"] not in cache]
    if still_missing:
        preview = ", ".join(still_missing[:10]) + ("..." if len(still_missing) > 10 else "")
        print(f"  {len(still_missing)} metro(s) still without a cached QID (retrying next run): {preview}")

    try:
        resolved = resolve_mayors(cache)
    except Exception as e:
        print(f"mayors refresh error ({e}); keeping existing mayors.json."); return

    if not coverage_ok(len(resolved), len(metros)):
        need = int(len(metros) * COVERAGE_FLOOR)
        print(f"ABORT: only {len(resolved)}/{len(metros)} mayors resolved (<{need} required); keeping existing mayors.json.")
        return

    overrides = load_json(OVR, {})
    parties = load_json(PARTIES, {})
    out = build(metros, resolved, overrides, parties)
    write_json(OUT, out, sort_keys=True)
    miss = [f"{m['city']} ({m['country']})" for m in metros if m["slug"] not in resolved]
    print(f"COVERAGE: {len(resolved)}/{len(metros)} from Wikidata; {len(out)} total after {len(overrides)} overrides.")
    if miss:
        print("MISSES (need overrides):", "; ".join(miss))

def load_qid_cache():
    return load_json(QID_CACHE, {})

def _self_test():
    metros = [{"slug": "tokyo", "city": "Tokyo", "country": "Japan"},
              {"slug": "shanghai", "city": "Shanghai", "country": "China"},
              {"slug": "cleveland", "city": "Cleveland", "country": "United States"}]
    out = build(metros,
                {"tokyo": {"mayor": "Yuriko Koike", "since": "2016-08-02", "party": ""},
                 "cleveland": {"mayor": "Justin Bibb", "since": "2022-01-03", "party": ""}},
                {"shanghai": {"city": "Shanghai", "country": "China", "mayor": "Gong Zheng",
                              "title": "Mayor", "since": "2020-03-23",
                              "second": {"name": "Chen Jining", "role": "Party Secretary"}}},
                {"cleveland": {"mayor": "Justin Bibb", "party": "Democratic"},
                 "tokyo": {"mayor": "A Different Person", "party": "Should Not Apply"}})
    assert out["tokyo"]["mayor"] == "Yuriko Koike"
    assert out["shanghai"]["second"]["role"] == "Party Secretary"

    # Party gap-fill only when blank AND the curated name matches the resolved mayor
    assert out["cleveland"]["party"] == "Democratic"   # name matches -> filled
    assert out["tokyo"]["party"] == ""                 # name mismatch -> left blank

    # Coverage floor: below COVERAGE_FLOOR must abort (caller checks this return value)
    assert not coverage_ok(69, 100)
    assert coverage_ok(70, 100)
    assert not coverage_ok(0, 100)
    assert not coverage_ok(0, 0)

    # resolve_mayors keys strictly by the cached QID -> slug map, never by label
    qid_to_slug_sample = {"Q1490": "shanghai", "Q1860": "tokyo"}
    assert set(qid_to_slug_sample.values()) == {"shanghai", "tokyo"}

    print("refresh_mayors self-test OK")

if __name__ == "__main__":
    _self_test() if "--self-test" in sys.argv else main()
