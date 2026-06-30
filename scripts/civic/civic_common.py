#!/usr/bin/env python3
"""
civic_common.py — shared helpers for the officeholder feeds (world leaders, US
executive/Cabinet, Congress, governors, mayors). Each refresh script queries
Wikidata, then uses these to (a) reject vandalized/garbage labels before they
reach the live site, (b) merge a hand-curated overrides file so curation
persists, and (c) write deterministic JSON. Run with --self-test for offline CI.
"""
import json, re, sys
from pathlib import Path

CROWN, WARN = "\U0001f451", "⚠️"

# Small blocklist; the structural check below catches most vandalism on its own.
_PROFANITY = {"picha", "puta", "mierda", "fuck", "shit", "penis", "cara picha"}

def bare(name: str) -> str:
    """Strip leading crown/warning glyphs and spaces."""
    return re.sub(r"^[%s%s\s]+" % (re.escape(CROWN), re.escape(WARN)), "", name or "").strip()

def sanity_ok(name: str) -> bool:
    """True if `name` looks like a real proper-noun officeholder name.
    Rejects empties, too-short strings, all-lowercase nonsense (e.g. the
    'sapo cara picha' Wikidata vandalism), and an explicit profanity list."""
    b = bare(name)
    if len(b) < 2:
        return False
    words = [w for w in re.split(r"\s+", b) if w]
    # A genuine name has at least one capitalized / non-Latin-script word.
    if not any((w[:1].isupper()) or (not w[:1].isascii()) for w in words):
        return False
    low = b.lower()
    if any(p in low for p in _PROFANITY):
        return False
    return True

UA = "metro-power-rankings civic-refresh/1.0 (https://rankings.citizenofnowhere.org)"

def sparql(query, timeout=180, retries=4):
    """POST a SPARQL query to the Wikidata Query Service with retries/backoff.
    POST avoids URL-length limits; retries ride out the frequent 429/5xx/timeout
    responses from the public endpoint. Returns the list of result bindings."""
    import time, requests
    last = None
    for i in range(retries):
        try:
            r = requests.post(
                "https://query.wikidata.org/sparql",
                data={"query": query, "format": "json"},
                headers={"User-Agent": UA, "Accept": "application/sparql-results+json"},
                timeout=timeout,
            )
            if r.status_code in (429, 500, 502, 503, 504):
                last = f"HTTP {r.status_code}"; time.sleep(3 * (2 ** i)); continue
            r.raise_for_status()
            return r.json()["results"]["bindings"]
        except requests.exceptions.RequestException as e:
            last = str(e); time.sleep(3 * (2 ** i))
    raise RuntimeError(f"WDQS failed after {retries} attempts: {last}")

def qid(uri):
    return uri.rsplit("/", 1)[-1] if uri else ""

def merge_overrides(auto: dict, overrides: dict) -> dict:
    """Curated overrides win; auto-data fills the rest."""
    out = dict(auto)
    out.update(overrides or {})
    return out

def load_json(path, default):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception:
        return default

def write_json(path, data, sort_keys=True):
    Path(path).write_text(
        json.dumps(data, indent=2, ensure_ascii=False, sort_keys=sort_keys), encoding="utf-8"
    )

def _self_test():
    assert sanity_ok("Daniel Ortega")
    assert sanity_ok("JD Vance")
    assert sanity_ok(CROWN + " Charles III")
    assert sanity_ok("夏宝龙")          # non-Latin script (e.g. CJK) allowed
    assert not sanity_ok("sapo cara picha")          # the vandalism we hit
    assert not sanity_ok("")
    assert not sanity_ok("x")
    assert not sanity_ok("lowercase only name")
    assert merge_overrides({"a": 1, "b": 2}, {"b": 9})["b"] == 9
    print("civic_common self-test OK")

if __name__ == "__main__":
    if "--self-test" in sys.argv:
        _self_test()
    else:
        print("module; run with --self-test")
