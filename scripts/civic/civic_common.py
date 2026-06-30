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
