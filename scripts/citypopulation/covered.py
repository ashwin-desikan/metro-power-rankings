#!/usr/bin/env python3
"""Covered-country set for the citypopulation.de watcher.

Single-sourced from the repo's own data so it self-maintains as coverage grows:
every country that appears in public/data/metros.json (the metros we track) or
public/data/countries.json (the country directory). citypopulation.de names a
handful of countries differently (slugs like `uk`, `usa`, `uae`, or short forms
like `czechrep`) — CP_ALIASES bridges just those; everything else matches on a
punctuation/spacing-insensitive normalize().

Note: our coverage spans ~all countries, so this filter is deliberately broad —
it only drops genuinely-uncovered micro-territories. The real noise control is
the week-over-week diff in watch_feed.py, not this set.
"""
import json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
METROS = ROOT / "public" / "data" / "metros.json"
COUNTRIES = ROOT / "public" / "data" / "countries.json"

# citypopulation.de form (slug or label) -> our country name. Only the ones that
# don't already string-match; verified against the live /en/help/new/ feed.
CP_ALIASES = {
    "uk": "United Kingdom",
    "usa": "United States",
    "uae": "United Arab Emirates",
    "czechrep": "Czech Republic",
    "domrep": "Dominican Republic",
    "faroe": "Faroe Islands",
    "micronesia": "Federated States of Micronesia",
    "saotome": "São Tomé and Príncipe",
    "stlucia": "Saint Lucia",
    "stvincent": "St. Vincent & the Grenadines",
    # "World" = a global data refresh (e.g. "World: agglomerations"); kept in
    # coverage on purpose since it can touch many of our metros at once.
    "world": "World",
}

def normalize_country(s: str) -> str:
    """Lowercase, drop everything but a-z0-9 — so 'United States', 'united-states'
    and 'UNITED STATES' all collapse to the same key."""
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())

def _names():
    names = set()
    try:
        d = json.loads(METROS.read_text(encoding="utf-8"))
        rows = d if isinstance(d, list) else d.get("metros", d)
        names |= {r.get("country", "") for r in rows if r.get("country")}
    except Exception:
        pass
    try:
        d = json.loads(COUNTRIES.read_text(encoding="utf-8"))
        rows = d if isinstance(d, list) else d.get("countries", d)
        names |= {r.get("name", "") for r in rows if r.get("name")}
    except Exception:
        pass
    return {n for n in names if n}

def covered_keys():
    """Set of normalized keys that count as in-coverage: every tracked country,
    plus the citypopulation alias slugs and their expansions."""
    keys = {normalize_country(n) for n in _names()}
    keys |= {normalize_country(slug) for slug in CP_ALIASES}
    keys |= {normalize_country(v) for v in CP_ALIASES.values()}
    return keys

def is_covered(signal: str, keys=None) -> bool:
    keys = keys if keys is not None else covered_keys()
    return normalize_country(signal) in keys

def _self_test():
    keys = covered_keys()
    assert is_covered("Germany", keys)
    assert is_covered("united-states", keys)   # slug form
    assert is_covered("uk", keys)              # alias slug
    assert is_covered("United Kingdom", keys)  # alias expansion
    assert is_covered("World", keys)           # global refresh kept in coverage
    assert not is_covered("Atlantis", keys)    # not a real/covered place
    assert normalize_country("Côte d'Ivoire") == "ctedivoire"
    print("covered self-test OK")

if __name__ == "__main__":
    _self_test()
