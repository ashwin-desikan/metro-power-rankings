#!/usr/bin/env python3
"""refresh_cabinet.py — refresh the President, Vice President, and Cabinet in
public/data/us-congress.json's `executive` block from Wikidata.

Never previously automated: refresh_congress.py explicitly passes `executive`
through untouched (its own self-test asserts this), so President/VP/Cabinet
only ever changed by hand. Same for the mayors/governors/congress feeds this
was extended to match.

Two-phase design (cabinet-positions.json caches phase 1's output), same
pattern as refresh_mayors.py's city-QID cache:
  1. Position discovery (cold-start / self-healing): ONE query for every
     Wikidata item with jurisdiction (P1001) = United States (Q30), matched
     in Python against the curated office list by a keyword substring on the
     label. Jurisdiction is what disambiguates a federal role from a
     state-level one sharing the same name (e.g. "Secretary of State" of
     Texas vs of the United States). 0 or 2+ candidates for an office is
     logged and left uncached rather than guessed.
  2. Holder lookup (hot weekly path): one VALUES query over the cached
     position QIDs for the CURRENT holder (P39, no end date). Requires
     exactly one match per position; 0 or 2+ is logged and left unresolved
     (a genuine vacancy, or a transition Wikidata hasn't settled).

DRY BY DEFAULT: prints what it would change but writes nothing unless --write
is passed. This pipeline has never run before, so the first pass against real
Wikidata data needs a human look before it touches the live site.
--self-test for offline CI."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from civic_common import sanity_ok, bare, load_json, write_json, sparql, qid  # noqa

ROOT = Path(__file__).resolve().parents[2]
CONG = ROOT / "public" / "data" / "us-congress.json"
POSITIONS = Path(__file__).with_name("cabinet-positions.json")
US = "Q30"
# Floor for trusting a "latest start date wins" pick in resolve_holders(): a
# genuinely current appointee's start date should be well within the current
# administration; anything older is presumptively historical/undated noise
# even if it technically has no recorded end date.
MIN_PLAUSIBLE_START = "2020-01-01"

CABINET_OFFICES = [
    # exclude: "vice president of the united states" contains "president of
    # the united states" as a literal substring, so a plain keyword match
    # pulls the VP position in as a false rival candidate (confirmed live:
    # 2026-07-21, Q11699 at 86 sitelinks blocked a clean winner). Filter it
    # back out explicitly rather than loosen the sitelinks-margin safety net.
    {"key": "president", "office": "President of the United States", "keyword": "president of the united states", "exclude": "vice"},
    {"key": "vice-president", "office": "Vice President of the United States", "keyword": "vice president of the united states"},
    {"key": "secretary-of-state", "office": "Secretary of State", "keyword": "secretary of state"},
    {"key": "secretary-of-the-treasury", "office": "Secretary of the Treasury", "keyword": "secretary of the treasury"},
    {"key": "secretary-of-defense", "office": "Secretary of Defense", "keyword": "secretary of defense"},
    {"key": "attorney-general", "office": "Attorney General", "keyword": "attorney general of the united states"},
    {"key": "secretary-of-the-interior", "office": "Secretary of the Interior", "keyword": "secretary of the interior"},
    {"key": "secretary-of-agriculture", "office": "Secretary of Agriculture", "keyword": "secretary of agriculture"},
    {"key": "secretary-of-commerce", "office": "Secretary of Commerce", "keyword": "secretary of commerce"},
    {"key": "secretary-of-labor", "office": "Secretary of Labor", "keyword": "secretary of labor"},
    {"key": "secretary-of-hhs", "office": "Secretary of Health and Human Services", "keyword": "secretary of health and human services"},
    {"key": "secretary-of-hud", "office": "Secretary of Housing and Urban Development", "keyword": "secretary of housing and urban development"},
    {"key": "secretary-of-transportation", "office": "Secretary of Transportation", "keyword": "secretary of transportation"},
    {"key": "secretary-of-energy", "office": "Secretary of Energy", "keyword": "secretary of energy"},
    {"key": "secretary-of-education", "office": "Secretary of Education", "keyword": "secretary of education"},
    {"key": "secretary-of-va", "office": "Secretary of Veterans Affairs", "keyword": "secretary of veterans affairs"},
    {"key": "secretary-of-dhs", "office": "Secretary of Homeland Security", "keyword": "secretary of homeland security"},
    {"key": "chief-of-staff", "office": "White House Chief of Staff", "keyword": "white house chief of staff"},
    {"key": "dni", "office": "Director of National Intelligence", "keyword": "director of national intelligence"},
    {"key": "cia-director", "office": "Director of the Central Intelligence Agency", "keyword": "director of the central intelligence agency"},
    {"key": "ustr", "office": "United States Trade Representative", "keyword": "united states trade representative"},
    {"key": "omb-director", "office": "Director of the Office of Management and Budget", "keyword": "office of management and budget"},
    {"key": "epa-administrator", "office": "Administrator of the Environmental Protection Agency", "keyword": "environmental protection agency"},
    {"key": "sba-administrator", "office": "Administrator of the Small Business Administration", "keyword": "small business administration"},
]
OFFICE_BY_KEY = {o["key"]: o["office"] for o in CABINET_OFFICES}
KEY_BY_OFFICE = {o["office"]: o["key"] for o in CABINET_OFFICES}

def discover_missing_positions(cache):
    """A keyword can match several Wikidata items sharing a jurisdiction --
    duplicate/legacy position items, or narrower sub-roles (confirmed live:
    'president of the united states' alone matched 9 candidates). Same
    disambiguator refresh_mayors.py already proved for same-named cities:
    the REAL, canonical position item is overwhelmingly the one with the
    most sitelinks (hundreds of Wikipedia articles link a real Cabinet
    office; a duplicate/legacy item has few to none). Picks the top
    candidate only when it's unambiguously ahead -- at least 5x the
    runner-up's sitelinks, or the runner-up has none -- otherwise logs and
    leaves it uncached rather than guess a close call."""
    missing = [o for o in CABINET_OFFICES if o["key"] not in cache]
    if not missing:
        return cache
    q = f"""SELECT ?position ?label ?sitelinks WHERE {{
      ?position wdt:P1001 wd:{US} .
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
            print(f"  no US-jurisdiction position matched {o['office']!r} (keyword {kw!r}); will retry next run")
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
        write_json(POSITIONS, cache, sort_keys=True)
    return cache

def resolve_holders(cache):
    """Returns {key: {name, party, start}}.

    Wikidata's 'no end-date = current' assumption, reliable for Senators and
    Governors, is NOT reliable here -- confirmed live: decades-old historical
    secretaries and even fictional TV characters (Josh Lyman, Doug Stamper)
    carry a real Cabinet position with no end date ever recorded. Two
    defenses, applied per position:
      1. Dedupe by name first -- the same real person sometimes has 2+
         near-duplicate statement nodes for the same position.
      2. Among distinct names, require a start date at/after
         MIN_PLAUSIBLE_START and prefer whichever is LATEST -- a genuinely
         current appointee's start date is recent; undated or pre-2020
         entries are dropped as historical/fictional noise. Only resolves
         when there's a single dated, sufficiently-recent name left, or one
         whose start date is strictly later than every other dated
         candidate; a genuine tie or "everyone undated" stays unresolved and
         logged rather than guessed.
    This does NOT fully solve Wikidata's data-quality gap for these
    positions (an acting official with an earlier recorded start could still
    edge out a later-confirmed permanent one in principle) -- it narrows the
    obviously-wrong cases the live run surfaced. Every resolved change still
    needs a human look before --write, same as any first run of a new feed."""
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
        holder, log_line = pick_holder(OFFICE_BY_KEY.get(key, key), raw)
        if holder:
            out[key] = holder
        if log_line:
            print(f"  {log_line}")
    return out

def pick_holder(label, raw):
    """Pure decision logic factored out of resolve_holders() so it can be
    unit-tested offline against the exact messy patterns a live run
    surfaces, without mocking the network. Returns (holder_or_None,
    log_line_or_None)."""
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

def build(existing, holders):
    out = dict(existing)
    exec_ = dict(out.get("executive", {}))
    changed = []

    def apply_single(role_key, role):
        h = holders.get(role_key)
        if not h:
            return role
        prev = role or {}
        if bare(prev.get("name", "")) == bare(h["name"]):
            return role
        changed.append(f"{OFFICE_BY_KEY[role_key]}: {prev.get('name')!r} -> {h['name']!r}")
        return {"name": h["name"], "party": h["party"] or prev.get("party", ""),
                "since": h["start"] or prev.get("since", "")}

    exec_["president"] = apply_single("president", exec_.get("president"))
    exec_["vicePresident"] = apply_single("vice-president", exec_.get("vicePresident"))

    cabinet = [dict(c) for c in exec_.get("cabinet", [])]
    for i, c in enumerate(cabinet):
        role_key = KEY_BY_OFFICE.get(c.get("office"))
        if not role_key:
            continue  # curated office not (yet) in CABINET_OFFICES -- left as-is
        h = holders.get(role_key)
        if not h or bare(c.get("name", "")) == bare(h["name"]):
            continue
        changed.append(f"{c['office']}: {c.get('name')!r} -> {h['name']!r}")
        # Fresh entry, not a spread of `c`: Wikidata gives us no signal for
        # acting-vs-confirmed (the exact gap that produced the Sonderling/
        # Chavez-DeRemer case), so any prior curated "acting" flag must NOT
        # carry forward onto a newly-detected name -- that needs a human to
        # set again deliberately, same as the name/date themselves did here.
        cabinet[i] = {"office": c["office"], "name": h["name"], "since": h["start"] or c.get("since", "")}
    exec_["cabinet"] = cabinet
    out["executive"] = exec_
    return out, changed

def main():
    write = "--write" in sys.argv
    existing = load_json(CONG, None)
    if not existing:
        print("ABORT: us-congress.json missing"); return
    cache = load_json(POSITIONS, {})
    cache = discover_missing_positions(cache)
    still_missing = [o["office"] for o in CABINET_OFFICES if o["key"] not in cache]
    if still_missing:
        print(f"  {len(still_missing)} position(s) still unresolved: {still_missing}")
    try:
        holders = resolve_holders(cache)
    except Exception as e:
        print(f"cabinet refresh error ({e}); no changes."); return
    out, changed = build(existing, holders)
    if not changed:
        print("No executive/cabinet changes detected."); return
    print(f"{len(changed)} change(s) detected:")
    for c in changed:
        print(f"  {c}")
    if write:
        write_json(CONG, out, sort_keys=False)
        print("Written.")
    else:
        print("DRY RUN (pass --write to apply once reviewed).")

def _self_test():
    existing = {
        "senate": {}, "house": {},
        "executive": {
            "president": {"name": "Donald Trump", "party": "Republican", "since": "2025-01-20"},
            "vicePresident": {"name": "JD Vance", "party": "Republican", "since": "2025-01-20"},
            "cabinet": [
                {"office": "Secretary of State", "name": "Marco Rubio", "since": "2025-01-21"},
                {"office": "Director of National Intelligence", "name": "Tulsi Gabbard", "since": "2025-02-12"},
            ],
        },
    }
    # Same person confirmed for president/Secretary of State -> no spurious
    # change; a genuinely new DNI -> update applied and logged.
    holders = {
        "president": {"name": "Donald Trump", "party": "Republican", "start": "2025-01-20"},
        "secretary-of-state": {"name": "Marco Rubio", "party": "Republican", "start": "2025-01-21"},
        "dni": {"name": "Someone New", "party": "Republican", "start": "2026-08-01"},
    }
    out, changed = build(existing, holders)
    assert out["executive"]["president"]["name"] == "Donald Trump"
    assert out["executive"]["vicePresident"]["name"] == "JD Vance"  # untouched, not in holders
    cab = {c["office"]: c for c in out["executive"]["cabinet"]}
    assert cab["Director of National Intelligence"]["name"] == "Someone New"
    assert cab["Director of National Intelligence"]["since"] == "2026-08-01"
    assert cab["Secretary of State"]["name"] == "Marco Rubio"
    assert any("Director of National Intelligence" in c for c in changed)
    assert not any(c.startswith("Secretary of State") for c in changed)
    assert not any("President of the United States" in c for c in changed)

    # No holders at all -> no changes, nothing touched.
    out2, changed2 = build(existing, {})
    assert changed2 == []
    assert out2["executive"] == existing["executive"]

    # A curated "acting" flag must NOT survive a name change onto the new
    # holder (Wikidata gives no acting-vs-confirmed signal) -- confirmed live
    # case: Sonderling took over Labor as Acting Secretary 2026-04-20.
    existing_acting = {
        "senate": {}, "house": {},
        "executive": {
            "president": {"name": "X"}, "vicePresident": {"name": "Y"},
            "cabinet": [{"office": "Secretary of Labor", "name": "Keith Sonderling",
                        "since": "2026-04-20", "acting": True}],
        },
    }
    out3, changed3 = build(existing_acting, {"secretary-of-labor": {"name": "Keith Sonderling", "party": "Republican", "start": "2027-01-05"}})
    assert changed3 == [], changed3  # same person confirmed permanently -> no name change, "acting" flag untouched either way
    assert out3["executive"]["cabinet"][0]["acting"] is True

    out4, changed4 = build(existing_acting, {"secretary-of-labor": {"name": "Someone Else", "party": "Republican", "start": "2027-06-01"}})
    assert any("Secretary of Labor" in c for c in changed4)
    assert "acting" not in out4["executive"]["cabinet"][0], out4["executive"]["cabinet"][0]

    # pick_holder() against the actual messy patterns a live Wikidata run
    # surfaced (2026-07-21): historical secretaries and fictional TV
    # characters with no end date, mixed in with the real current appointee.
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

    print("refresh_cabinet self-test OK")

if __name__ == "__main__":
    _self_test() if "--self-test" in sys.argv else main()
