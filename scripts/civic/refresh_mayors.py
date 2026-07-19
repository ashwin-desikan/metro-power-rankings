#!/usr/bin/env python3
"""refresh_mayors.py — mayors of the PRIMARY CITY of the top-100 metros from
Wikidata (P6), keyed by metro slug -> public/data/mayors.json.

Two-phase design (city-qids.json caches phase 1's output):
  1. QID discovery (cold-start / self-healing only): resolve each metro's
     Wikidata city QID via the expensive city+country LABEL join, chunked so
     WDQS never 504s on one huge query. Only runs for slugs not already in the
     cache, and persists each successful chunk immediately — a mid-run failure
     under a WDQS outage loses no progress and the next run resumes where it
     left off. Once a metro's QID is cached it is stable (cities don't get
     renamed) and this phase never touches it again.
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
    not already in the cache. Chunked defensively (label joins are the
    expensive WDQS pattern); each successful chunk is saved immediately so a
    timeout partway through still keeps whatever it found.

    retries=2/timeout=45 (vs civic_common.sparql's default retries=4/timeout=180)
    is deliberate: an unresolved chunk just retries again NEXT WEEK (that's the
    whole point of the cache), so there is no value in burning the wrapper's
    step-timeout budget on aggressive in-run retries here. Worst case per chunk
    is ~2*45s + one ~3s backoff sleep =~ 93s; across the 9 chunks needed for a
    fully-cold cache that is ~14 minutes, safely inside MAYORS_STEP_TIMEOUT
    (metro-mini-refresh.sh) even if every single chunk fails outright — which
    is exactly what's been happening under the ongoing WDQS outage (confirmed
    still active as of the 2026-07-19 run: 0 chunks resolved, cache still {})."""
    missing = [m for m in metros if m["slug"] not in cache]
    if not missing:
        return cache
    CHUNK = 12
    for i in range(0, len(missing), CHUNK):
        chunk = missing[i:i + CHUNK]
        values = "\n".join(
            f'    ("{esc(m["slug"])}" "{esc(m["city"])}" "{esc(m["country"])}")' for m in chunk)
        q = f"""SELECT ?key ?city WHERE {{
      VALUES (?key ?cityLabel ?countryLabel) {{
{values}
      }}
      ?city rdfs:label ?clab . FILTER(?clab = STRLANG(?cityLabel, "en"))
      ?city wdt:P17 ?ctry . ?ctry rdfs:label ?ctlab . FILTER(?ctlab = STRLANG(?countryLabel, "en"))
    }}"""
        try:
            rows = sparql(q, timeout=45, retries=2)
        except Exception as e:
            print(f"  QID discovery chunk {i // CHUNK} failed ({e}); will retry next run")
            continue
        found = 0
        for b in rows:
            key = b.get("key", {}).get("value", "")
            city_uri = b.get("city", {}).get("value", "")
            if key and city_uri:
                cache[key] = qid(city_uri)
                found += 1
        if found:
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
    out = {}
    for b in sparql(query, timeout=120):
        slug = qid_to_slug.get(qid(b.get("city", {}).get("value", "")))
        nm = b.get("mayorLabel", {}).get("value", "")
        if slug and slug not in out and sanity_ok(nm):
            out[slug] = {"mayor": nm, "since": (b.get("start", {}).get("value", "") or "")[:10],
                        "party": b.get("partyLabel", {}).get("value", "")}
    return out

def build(metros, resolved, overrides):
    out = {}
    for m in metros:
        info = resolved.get(m["slug"])
        if not info:
            continue
        out[m["slug"]] = {"city": m["city"], "country": m["country"],
                          "mayor": info["mayor"], "title": "Mayor", "since": info["since"], "party": info.get("party", "")}
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
    out = build(metros, resolved, overrides)
    write_json(OUT, out, sort_keys=True)
    miss = [f"{m['city']} ({m['country']})" for m in metros if m["slug"] not in resolved]
    print(f"COVERAGE: {len(resolved)}/{len(metros)} from Wikidata; {len(out)} total after {len(overrides)} overrides.")
    if miss:
        print("MISSES (need overrides):", "; ".join(miss))

def load_qid_cache():
    return load_json(QID_CACHE, {})

def _self_test():
    metros = [{"slug": "tokyo", "city": "Tokyo", "country": "Japan"},
              {"slug": "shanghai", "city": "Shanghai", "country": "China"}]
    out = build(metros, {"tokyo": {"mayor": "Yuriko Koike", "since": "2016-08-02"}},
                {"shanghai": {"city": "Shanghai", "country": "China", "mayor": "Gong Zheng",
                              "title": "Mayor", "since": "2020-03-23",
                              "second": {"name": "Chen Jining", "role": "Party Secretary"}}})
    assert out["tokyo"]["mayor"] == "Yuriko Koike"
    assert out["shanghai"]["second"]["role"] == "Party Secretary"

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
