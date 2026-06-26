"""Shared metro resolver for DEFUNCT franchises across leagues.

Resolves a franchise's city (or, for the NBA, its approved display name) to a
canonical metro from public/data/metros.json. Final-city-first so relocated
franchises resolve to their best-known metro. Returns (metro_name, metro_slug)
or ("", None) to skip (per product decision: don't guess unknown cities).
"""
import json, os, re

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def _slugify(s):
    s = (s or "").lower().strip()
    s = re.sub(r"[^a-z0-9\s/-]", "", s)
    s = re.sub(r"\s+", "-", s); s = re.sub(r"-+", "-", s)
    return s.strip("-")

_IDX = None
def _idx():
    global _IDX
    if _IDX is None:
        p = os.path.join(_ROOT, "public", "data", "metros.json")
        raw = open(p, encoding="utf-8").read()
        try:
            A = json.loads(raw)
        except Exception:
            A = json.loads(raw[:raw.rfind("]") + 1])  # tolerate truncated tail
        d = {}
        for m in A:
            if not isinstance(m, dict):
                continue
            for k in (m.get("slug"), _slugify(m.get("name", "")), _slugify(m.get("primaryCity", ""))):
                if k:
                    d.setdefault(k, (m["slug"], m["name"]))
        _IDX = d
    return _IDX

def _look(slug):
    for s, n in _idx().values():
        if s == slug:
            return (n, s)
    return None

# City strings that belong to a combined/parent metro (high confidence only).
_ALIAS = {
    "baltimore": "washington-baltimore", "washington": "washington-baltimore",
    "brooklyn": "new-york", "staten island": "new-york",
    "frankford": "philadelphia", "hammond": "chicago", "tonawanda": "buffalo",
    "akron": "cleveland", "canton": "cleveland", "muncie": "indianapolis",
    "racine": "milwaukee", "rock island": "davenport", "oorang": "columbus",
    "moncton": "moncton", "berlin": "kitchener-waterloo", "renfrew": "renfrew",
    "kenora": "kenora-on", "sydney": "cape-breton",
    "cornwall": "cornwall-on", "morrisburg": "cornwall-on",
    "port arthur": "thunder-bay", "brockville": "ottawa",
    "mcgill": "montreal", "queen's": "kingston-on", "halifax": "halifax-ns",
    "galt": "kitchener-waterloo", "smiths falls": "ottawa",
    "cobalt": "renfrew",
}

def resolve_city(cityblob):
    """(metro_name, metro_slug) or ('', None). Tries each city in the history,
    final city first, then aliases, then a direct slug match."""
    parts = [p.strip() for p in re.split(r"[/\-]", str(cityblob or "")) if p.strip()]
    for p in reversed(parts):
        a = _ALIAS.get(p.lower())
        if a:
            r = _look(a)
            if r:
                return r
        hit = _idx().get(_slugify(p))
        if hit:
            return (hit[1], hit[0])
    return ("", None)

# NBA defunct franchises store states/multi-city strings, so resolve by the
# approved display name's home metro instead. Unknowns intentionally omitted.
_NBA = {
    "San Diego Conquistadors": "san-diego", "Utah Stars": "salt-lake-city-provo",
    "Spirits of St. Louis": "st-louis", "Kentucky Colonels": "louisville",
    "The Floridians": "miami", "New Orleans Buccaneers": "new-orleans",
    "Virginia Squires": "norfolk", "Pittsburgh Pipers": "pittsburgh",
    "Denver Nuggets (1949–50)": "denver", "Indianapolis Olympians": "indianapolis",
    "Sheboygan Red Skins": "sheboygan", "Indianapolis Jets": "indianapolis",
    "Baltimore Bullets (1947–54)": "washington-baltimore", "Chicago Stags": "chicago",
    "Cleveland Rebels": "cleveland", "Detroit Falcons": "detroit",
    "Pittsburgh Ironmen": "pittsburgh", "Providence Steamrollers": "providence",
    "St. Louis Bombers": "st-louis", "Toronto Huskies": "toronto",
    "Washington Capitols": "washington-baltimore",
    "Anderson Packers": "indianapolis", "Waterloo Hawks": "waterloo-ia",
}

def resolve_nba(display_name):
    slug = _NBA.get(display_name)
    if not slug:
        return ("", None)
    r = _look(slug)
    return r if r else ("", None)


# Per-franchise NHL overrides (canonical Name -> metro slug) for cases the
# city string cannot resolve safely (e.g. "Minnesota" would also catch the
# Cleveland Crusaders, whose history is "Cleveland/Minnesota").
_NHL_OVERRIDE = {
    "Fighting Saints (1)": "minneapolis",
    "Bulls (B)": "birmingham-al",  # Birmingham Bulls (WHA) -> Birmingham, Alabama, not UK Birmingham
}

def resolve_nhl(canonical, cityblob):
    slug = _NHL_OVERRIDE.get(canonical)
    if slug:
        r = _look(slug)
        if r:
            return r
    return resolve_city(cityblob)


_NFL_OVERRIDE = {
    "Bulldogs (Boston)": "pottsville",  # Pottsville Maroons (briefly Boston)
}

def resolve_nfl(canonical, cityblob):
    slug = _NFL_OVERRIDE.get(canonical)
    if slug:
        r = _look(slug)
        if r:
            return r
    return resolve_city(cityblob)


_NHL_METROS = {
    "Senators (Org)": ["ottawa"],
    "Tigers (Ham)": ["quebec-city", "hamilton"],
}

def resolve_nhl_metros(canonical, cityblob):
    """List of (name, slug) metros for a defunct NHL franchise."""
    slugs = _NHL_METROS.get(canonical)
    if slugs:
        out = [_look(sl) for sl in slugs]
        out = [x for x in out if x]
        if out:
            return out
    r = resolve_nhl(canonical, cityblob)
    return [r] if r[1] else []
