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
    if re.fullmatch(r"Q\d+", b):          # unresolved Wikidata QID (label didn't resolve)
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

# ─── Position discovery + current-holder resolution ────────────────────────
# Shared by refresh_cabinet.py and refresh_house_leadership.py -- both need
# the same two-phase pattern refresh_mayors.py proved for city QIDs, applied
# to Wikidata POSITION items instead: discover each curated office's position
# QID once (cached), then look up its current holder on the fast hot path.
# Built and hardened against two live runs against real Wikidata data
# (2026-07-21) resolving the US Cabinet: naive keyword/no-end-date matching
# pulled in duplicate legacy position items, decades-old historical office
# holders, AND fictional TV characters (Josh Lyman, Doug Stamper, Jack Ryan)
# that some Wikidata edit tagged with the real position and never dated.

# Floor for trusting a "latest start date wins" pick in pick_holder(): a
# genuinely current officeholder's start date should be well within recent
# memory; anything older is presumptively historical/undated noise even if it
# technically has no recorded end date.
MIN_PLAUSIBLE_START = "2020-01-01"

def discover_positions_by_sitelinks(offices, cache, cache_path, jurisdiction_qid="Q30"):
    """offices: [{key, office, keyword, exclude?}, ...]. cache: {key: qid},
    mutated in place and returned; persisted to cache_path when anything new
    resolves. A keyword can match several Wikidata items sharing a
    jurisdiction -- duplicate/legacy position items, or a substring collision
    (e.g. "president of the united states" is literally inside "vice
    president of the united states"; use `exclude` for that case). The real,
    canonical position item is overwhelmingly the one with the most sitelinks
    (hundreds of Wikipedia interlanguage links for a real government office;
    a duplicate/legacy item has few to none) -- same disambiguator
    refresh_mayors.py already proved for same-named cities. Only accepts the
    top candidate when it's unambiguously ahead (>=5x the runner-up's
    sitelinks, or the runner-up has none); otherwise logs and leaves it
    uncached rather than guess a close call."""
    missing = [o for o in offices if o["key"] not in cache]
    if not missing:
        return cache
    q = f"""SELECT ?position ?label ?sitelinks WHERE {{
      ?position wdt:P1001 wd:{jurisdiction_qid} .
      ?position rdfs:label ?label . FILTER(LANG(?label) = "en")
      OPTIONAL {{ ?position wikibase:sitelinks ?sitelinks }}
    }}"""
    try:
        rows = sparql(q, timeout=90, retries=2)
    except Exception as e:
        print(f"  position discovery failed ({e}); will retry next run")
        return cache
    by_label = {}
    for b in rows:
        lbl = b.get("label", {}).get("value", "").strip().lower()
        pos_uri = b.get("position", {}).get("value", "")
        try:
            links = int(b.get("sitelinks", {}).get("value", "0"))
        except ValueError:
            links = 0
        if lbl and pos_uri:
            by_label.setdefault(lbl, {})[qid(pos_uri)] = links
    found_any = False
    for o in missing:
        kw, excl = o["keyword"], o.get("exclude")
        candidates = {}  # qid -> sitelinks, deduped across every matching label
        for lbl, qmap in by_label.items():
            if kw in lbl and not (excl and excl in lbl):
                for q_, links in qmap.items():
                    candidates[q_] = max(candidates.get(q_, 0), links)
        if not candidates:
            print(f"  no jurisdiction-matched position for {o['office']!r} (keyword {kw!r}); will retry next run")
            continue
        ranked = sorted(candidates.items(), key=lambda kv: -kv[1])
        top_qid, top_links = ranked[0]
        runner_up_links = ranked[1][1] if len(ranked) > 1 else 0
        if len(ranked) == 1 or top_links >= max(5 * runner_up_links, 1) or (top_links > 0 and runner_up_links == 0):
            cache[o["key"]] = top_qid
            found_any = True
        else:
            print(f"  {len(candidates)} candidate positions matched {o['office']!r} (keyword {kw!r}), "
                  f"no clear sitelinks winner: {ranked[:5]} -- ambiguous, not caching, needs a manual look")
    if found_any:
        write_json(cache_path, cache, sort_keys=True)
    return cache

def pick_holder(label, raw):
    """raw: [{name, party, start}, ...] every raw current-holder (no end
    date) row Wikidata returned for one position. Returns
    (holder_or_None, log_line_or_None).

    Wikidata's "no end-date = current" assumption, reliable for Senators and
    Governors, is NOT reliable for less actively-maintained position items --
    confirmed live: decades-old historical officeholders and even fictional
    characters carry a real position with no end date ever recorded. Two
    defenses:
      1. Dedupe by name first -- the same real person sometimes has 2+
         near-duplicate statement nodes for the same position.
      2. Among distinct names, require a start date at/after
         MIN_PLAUSIBLE_START and prefer whichever is LATEST -- a genuinely
         current officeholder's start date is recent; undated or pre-floor
         entries are dropped as historical/fictional noise. Only resolves
         when there's a single dated, sufficiently-recent name left, or one
         whose start date is strictly later than every other dated
         candidate; a genuine tie or "everyone undated" stays unresolved and
         logged rather than guessed."""
    by_name = {}
    for h in raw:
        b = bare(h["name"])
        if b not in by_name or (not by_name[b]["start"] and h["start"]):
            by_name[b] = h
    holders = list(by_name.values())
    if len(holders) == 1:
        return holders[0], None
    dated = sorted((h for h in holders if h["start"] >= MIN_PLAUSIBLE_START),
                    key=lambda h: h["start"], reverse=True)
    if len(dated) == 1 or (len(dated) > 1 and dated[0]["start"] > dated[1]["start"]):
        others = [h["name"] for h in holders if h is not dated[0]]
        return dated[0], (f"{label}: resolved to {dated[0]['name']} (start {dated[0]['start']}) among "
                          f"{len(holders)} raw current-holder name(s); discarded undated/older: {others}")
    names = [h["name"] for h in holders]
    return None, (f"{label}: {len(holders)} current holders, no clear latest-plausible-start "
                  f"winner {names} -- ambiguous, left unchanged")

def resolve_current_holders(cache, office_by_key):
    """cache: {key: qid}. office_by_key: {key: display label} for logging.
    Returns {key: {name, party, start}} via pick_holder() per position."""
    qid_to_key = {q: k for k, q in cache.items() if q}
    if not qid_to_key:
        return {}
    values = " ".join(f"wd:{q}" for q in qid_to_key)
    query = f"""SELECT ?position ?personLabel ?partyLabel ?start WHERE {{
      VALUES ?position {{ {values} }}
      ?person p:P39 ?st . ?st ps:P39 ?position .
      FILTER NOT EXISTS {{ ?st pq:P582 ?end }}
      OPTIONAL {{ ?person wdt:P102 ?party }}
      OPTIONAL {{ ?st pq:P580 ?start }}
      SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
    }}"""
    rows = sparql(query, timeout=120)
    by_key = {}
    for b in rows:
        key = qid_to_key.get(qid(b.get("position", {}).get("value", "")))
        nm = b.get("personLabel", {}).get("value", "")
        if not key or not sanity_ok(nm):
            continue
        by_key.setdefault(key, []).append({
            "name": nm,
            "party": b.get("partyLabel", {}).get("value", ""),
            "start": (b.get("start", {}).get("value", "") or "")[:10],
        })
    out = {}
    for key, raw in by_key.items():
        holder, log_line = pick_holder(office_by_key.get(key, key), raw)
        if holder:
            out[key] = holder
        if log_line:
            print(f"  {log_line}")
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
    assert not sanity_ok("Q22686")          # raw QID rejected
    assert merge_overrides({"a": 1, "b": 2}, {"b": 9})["b"] == 9

    # pick_holder() against the actual messy patterns a live Wikidata run
    # surfaced (2026-07-21, resolving the US Cabinet): historical office
    # holders and fictional TV characters with no end date, mixed in with the
    # real current appointee.
    h, log = pick_holder("Secretary of Transportation", [
        {"name": "Claude Brinegar", "party": "", "start": "1973-02-02"},
        {"name": "William Thaddeus Coleman, Jr.", "party": "", "start": "1975-03-07"},
        {"name": "Andrew L. Lewis, Jr.", "party": "Republican", "start": "1981-01-23"},
        {"name": "Sean Duffy", "party": "Republican", "start": "2025-01-28"},
    ])
    assert h and h["name"] == "Sean Duffy", h
    assert log and "discarded" in log

    h, log = pick_holder("White House Chief of Staff", [
        {"name": "Susie Wiles", "party": "", "start": "2025-01-20"},
        {"name": "Josh Lyman", "party": "", "start": ""},          # fictional, undated
        {"name": "Doug Stamper", "party": "", "start": ""},        # fictional, undated
        {"name": 'Edwin "Pa" Watson', "party": "", "start": "1939-09-09"},  # historical, pre-floor
    ])
    assert h and h["name"] == "Susie Wiles", h

    # Duplicate statement nodes for the SAME real person (e.g. RFK Jr. showed
    # up twice live) dedupe to one before any date comparison is needed.
    h, log = pick_holder("Secretary of Health and Human Services", [
        {"name": "Robert F. Kennedy Jr.", "party": "Republican", "start": "2025-02-13"},
        {"name": "Robert F. Kennedy Jr.", "party": "", "start": ""},
        {"name": "Eric Hargan", "party": "Republican", "start": "2017-04-28"},
    ])
    assert h and h["name"] == "Robert F. Kennedy Jr.", h

    # Genuine ambiguity (two plausibly-recent dated names, no clear latest,
    # or nobody dated at all) must NOT guess.
    h, log = pick_holder("Ambiguous Office", [
        {"name": "Alice Example", "party": "", "start": "2025-01-01"},
        {"name": "Bob Example", "party": "", "start": "2025-01-01"},
    ])
    assert h is None and "ambiguous" in log, (h, log)

    h, log = pick_holder("All Undated", [
        {"name": "Old Historical Figure", "party": "", "start": ""},
        {"name": "Another Old Figure", "party": "", "start": ""},
    ])
    assert h is None and "ambiguous" in log, (h, log)

    print("civic_common self-test OK")

if __name__ == "__main__":
    if "--self-test" in sys.argv:
        _self_test()
    else:
        print("module; run with --self-test")
