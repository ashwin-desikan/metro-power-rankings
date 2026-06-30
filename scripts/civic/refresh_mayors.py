#!/usr/bin/env python3
"""refresh_mayors.py — mayors of the PRIMARY CITY of the top-100 metros from
Wikidata (P6), keyed by metro slug -> public/data/mayors.json. ONE batched
SPARQL (VALUES of all 100 city/country pairs) so it runs in seconds, not 30
minutes. Coverage probe prints hits/misses. China cities get a party-secretary
second line via mayors-overrides.json. --self-test for offline CI."""
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

def esc(s): return (s or "").replace("\\", "").replace('"', '\\"')

def resolve_all(metros):
    """Chunked batched queries (small VALUES sets) so WDQS never 504s on one
    huge label-filter query. A failed chunk is skipped, not fatal."""
    out = {}
    CHUNK = 12
    for i in range(0, len(metros), CHUNK):
        chunk = metros[i:i + CHUNK]
        values = "\n".join(
            f'    ("{esc(m["slug"])}" "{esc(m["city"])}" "{esc(m["country"])}")' for m in chunk)
        q = f"""SELECT ?key ?mayorLabel ?start WHERE {{
      VALUES (?key ?cityLabel ?countryLabel) {{
{values}
      }}
      ?city rdfs:label ?clab . FILTER(?clab = STRLANG(?cityLabel, "en"))
      ?city wdt:P17 ?ctry . ?ctry rdfs:label ?ctlab . FILTER(?ctlab = STRLANG(?countryLabel, "en"))
      ?city p:P6 ?st . ?st ps:P6 ?mayor .
      FILTER NOT EXISTS {{ ?st pq:P582 ?e }}
      OPTIONAL {{ ?st pq:P580 ?start }}
      SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
    }}"""
        try:
            rows = sparql(q, timeout=60)
        except Exception as e:
            print(f"  mayors chunk {i // CHUNK} failed ({e}); skipping")
            continue
        for b in rows:
            key = b.get("key", {}).get("value", "")
            nm = b.get("mayorLabel", {}).get("value", "")
            if key and key not in out and sanity_ok(nm):
                out[key] = {"mayor": nm, "since": (b.get("start", {}).get("value", "") or "")[:10]}
    return out

def build(metros, resolved, overrides):
    out = {}
    for m in metros:
        info = resolved.get(m["slug"])
        if not info:
            continue
        out[m["slug"]] = {"city": m["city"], "country": m["country"],
                          "mayor": info["mayor"], "title": "Mayor", "since": info["since"]}
    return merge_overrides(out, overrides)

def main():
    metros = top_metros()
    try:
        resolved = resolve_all(metros)
    except Exception as e:
        print(f"mayors refresh error ({e}); keeping existing mayors.json."); return
    if not resolved:
        print("No mayors resolved this run; keeping existing mayors.json."); return
    overrides = load_json(OVR, {})
    out = build(metros, resolved, overrides)
    write_json(OUT, out, sort_keys=True)
    miss = [f"{m['city']} ({m['country']})" for m in metros if m["slug"] not in resolved]
    print(f"COVERAGE: {len(resolved)}/{len(metros)} from Wikidata; {len(out)} total after {len(overrides)} overrides.")
    if miss:
        print("MISSES (need overrides):", "; ".join(miss))

def _self_test():
    metros = [{"slug": "tokyo", "city": "Tokyo", "country": "Japan"},
              {"slug": "shanghai", "city": "Shanghai", "country": "China"}]
    out = build(metros, {"tokyo": {"mayor": "Yuriko Koike", "since": "2016-08-02"}},
                {"shanghai": {"city": "Shanghai", "country": "China", "mayor": "Gong Zheng",
                              "title": "Mayor", "since": "2020-03-23",
                              "second": {"name": "Chen Jining", "role": "Party Secretary"}}})
    assert out["tokyo"]["mayor"] == "Yuriko Koike"
    assert out["shanghai"]["second"]["role"] == "Party Secretary"
    print("refresh_mayors self-test OK")

if __name__ == "__main__":
    _self_test() if "--self-test" in sys.argv else main()
