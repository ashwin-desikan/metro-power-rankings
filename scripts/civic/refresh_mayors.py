#!/usr/bin/env python3
"""refresh_mayors.py — mayors of the PRIMARY CITY of the top-100 metros, from
Wikidata (head of government, P6, of the city resolved by label+country). Writes
public/data/mayors.json keyed by metro slug. Also a COVERAGE PROBE: prints how
many of the 100 resolved and lists the misses, so we know how much manual
curation the overrides file needs. China: a curated override carries the city's
party secretary as a second line. --self-test for offline CI."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from civic_common import sanity_ok, merge_overrides, load_json, write_json, sparql  # noqa

ROOT = Path(__file__).resolve().parents[2]
METROS = ROOT / "public" / "data" / "metros.json"
OUT = ROOT / "public" / "data" / "mayors.json"
OVR = Path(__file__).with_name("mayors-overrides.json")
TOP_N = 100

def top_metros():
    d = load_json(METROS, [])
    rows = d if isinstance(d, list) else d.get("metros", d)
    rows = sorted(rows, key=lambda r: r.get("rank", 99999))[:TOP_N]
    return [{"slug": r["slug"], "city": r.get("primaryCity") or r.get("name"),
             "country": r.get("country", "")} for r in rows]

def esc(s): return (s or "").replace('"', '\\"')

def resolve_mayor(city, country):
    q = f"""SELECT ?mayorLabel ?start WHERE {{
      ?city rdfs:label "{esc(city)}"@en .
      ?city wdt:P31/wdt:P279* wd:Q486972 .          # human settlement
      ?city wdt:P17 ?c . ?c rdfs:label "{esc(country)}"@en .
      ?city p:P6 ?st . ?st ps:P6 ?mayor .
      FILTER NOT EXISTS {{ ?st pq:P582 ?e }}
      OPTIONAL {{ ?st pq:P580 ?start }}
      SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
    }} LIMIT 1"""
    rows = sparql(q, timeout=60)
    if not rows:
        return None
    b = rows[0]
    nm = b.get("mayorLabel", {}).get("value", "")
    if not sanity_ok(nm):
        return None
    return {"mayor": nm, "since": (b.get("start", {}).get("value", "") or "")[:10]}

def build(metros, resolved, overrides):
    out = {}
    for m in metros:
        info = resolved.get(m["slug"])
        if not info:
            continue
        out[m["slug"]] = {"city": m["city"], "country": m["country"],
                          "mayor": info["mayor"], "title": "Mayor", "since": info["since"]}
    return merge_overrides(out, overrides)   # curated (China seconds, fixes) win

def main():
    metros = top_metros()
    resolved, misses = {}, []
    for m in metros:
        try:
            info = resolve_mayor(m["city"], m["country"])
        except Exception as e:
            info = None
            print(f"  query error {m['slug']}: {e}")
        if info:
            resolved[m["slug"]] = info
        else:
            misses.append(f"{m['city']} ({m['country']})")
    overrides = load_json(OVR, {})
    out = build(metros, resolved, overrides)
    write_json(OUT, out, sort_keys=True)
    print(f"COVERAGE: {len(resolved)}/{len(metros)} resolved from Wikidata; "
          f"{len(out)} total after {len(overrides)} overrides.")
    if misses:
        print("MISSES (need overrides):", "; ".join(misses))

def _self_test():
    metros = [{"slug": "tokyo", "city": "Tokyo", "country": "Japan"},
              {"slug": "shanghai", "city": "Shanghai", "country": "China"}]
    resolved = {"tokyo": {"mayor": "Yuriko Koike", "since": "2016-08-02"},
                "shanghai": {"mayor": "sapo cara picha", "since": ""}}  # vandalism filtered upstream
    out = build(metros, {"tokyo": resolved["tokyo"]},
                {"shanghai": {"city": "Shanghai", "country": "China", "mayor": "Gong Zheng",
                              "title": "Mayor", "since": "2020-03-23",
                              "second": {"name": "Chen Jining", "role": "Party Secretary"}}})
    assert out["tokyo"]["mayor"] == "Yuriko Koike"
    assert out["shanghai"]["second"]["role"] == "Party Secretary"   # China override applied
    print("refresh_mayors self-test OK")

if __name__ == "__main__":
    _self_test() if "--self-test" in sys.argv else main()
