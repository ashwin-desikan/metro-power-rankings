"""Backfill headquarters for the companies Fortune never gave one, from Wikidata.

Per-entity REST only. SPARQL/WDQS is deliberately NOT used: it was 429ing hard on
2026-08-16, and it is the wrong instrument for ~1,942 point lookups anyway.

  python hq_wikidata.py --self-test        # offline, pure decision logic, no network
  python hq_wikidata.py                    # 20-company pilot + cost projection
  python hq_wikidata.py --full --resume    # the sweep, only after the pilot is read
  python hq_wikidata.py --load --write     # push ACCEPTED rows only into company_hq

NOTHING IS ACCEPTED ON A NAME MATCH ALONE. Two automated shortcuts have already been
measured and rejected on this dataset (difflib alias matching, numeric entity
linking across the 1995/96 boundary), so a candidate here must clear FOUR gates:

  1. TYPE   its P31 must be an organisation type on the allow-list
  2. NAME   company_key(label or an en alias) must EQUAL the key being resolved
  3. DATE   its lifespan (P571..P576) must contain the first year we saw it listed
  4. PLACE  P159 must resolve to a place entity with a label

Two or more candidates clearing all four is AMBIGUOUS and resolves to nothing.
Every rejection is written to the review CSV with its reason, because a company
that is simply absent from Wikidata and a company we refused to guess at are
different facts and the residue has to be readable.

HQ is period-correct where Wikidata allows it. P159 statements carry P580/P582
qualifiers (Boeing: Seattle -> Chicago 2001 -> Arlington 2022), so the statement
chosen is the one whose window covers the midpoint of the years the company was
actually listed, not whichever one is current today.
"""
import argparse, csv, json, os, re, sys, time, urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import OUT, log, select_all, rest  # noqa: E402
from common import company_key  # noqa: E402

REVIEW = os.path.join(OUT, "hq_wikidata.csv")
PLACE_CACHE = os.path.join(OUT, "raw", "wd_places.json")
API = "https://www.wikidata.org/w/api.php"
ENTITY = "https://www.wikidata.org/wiki/Special:EntityData/{}.json"
PILOT = 20
SLEEP = 0.25          # polite; Wikidata tolerates far more, we do not need it
# Longest listing span a single undated HQ value is allowed to describe. Above
# this the company had room to relocate mid-span and the value is not certifiable.
LONG_SPAN = 20

# P31 values that mean "this is a company". Deliberately a flat allow-list rather
# than a subclass walk: a walk costs an extra fetch per candidate and the long tail
# it buys is exactly where false accepts live.
ORG_TYPES = {
    "Q4830453": "business",              "Q6881511": "enterprise",
    "Q891723": "public company",         "Q167037": "corporation",
    "Q783794": "company",                "Q1589009": "privately held company",
    "Q219577": "holding company",        "Q43229": "organization",
    "Q18388277": "technology company",   "Q1058914": "software company",
    "Q1416657": "railway company",       "Q46970": "airline",
    "Q22687": "bank",                    "Q806718": "commercial bank",
    "Q3623811": "investment bank",       "Q2143354": "savings bank",
    "Q4358176": "insurance company",     "Q2401749": "steel producer",
    "Q880371": "energy company",         "Q1341478": "oil and gas company",
    "Q507619": "retail chain",           "Q2085381": "publisher",
    "Q1331793": "media company",         "Q1762059": "film production company",
    "Q1074055": "record label",          "Q18127": "record label (alt)",
}

FIELDS = ["company_key", "company", "first_year", "last_year", "peak_rank",
          "verdict", "hq_confidence", "reason", "qid", "entity_label", "hq_city",
          "hq_state", "hq_country", "lat", "lon", "hq_asof"]


# ---------------------------------------------------------------------------
# PURE DECISION LOGIC — no network below this line until fetch_* . Everything
# here is covered by --self-test with the real messy cases, not happy paths.
# ---------------------------------------------------------------------------

def claim_ids(entity, prop):
    """Every item-valued claim for a property, in statement order."""
    out = []
    for c in (entity.get("claims") or {}).get(prop, []):
        v = ((c.get("mainsnak") or {}).get("datavalue") or {}).get("value")
        if isinstance(v, dict) and v.get("id"):
            out.append(v["id"])
    return out


def claim_year(entity, prop):
    """First time-valued claim as a year int. Wikidata times look like
    '+1901-01-01T00:00:00Z'; a leading '-' is BC and is returned negative."""
    for c in (entity.get("claims") or {}).get(prop, []):
        v = ((c.get("mainsnak") or {}).get("datavalue") or {}).get("value")
        if isinstance(v, dict) and v.get("time"):
            m = re.match(r"([+-])(\d{1,5})-", v["time"])
            if m:
                y = int(m.group(2))
                return -y if m.group(1) == "-" else y
    return None


def labels_and_aliases(entity, lang="en"):
    """en first (it is what we display), then every other language.

    Chrysler Corporation (Q12306354) carries NO English label at all — only an
    English description and labels in other languages. Reading en only rejected
    the single correct entity for one of the largest companies in the dataset,
    which is a name gate failing on presentation rather than on identity."""
    out, seen = [], set()
    for src in ((entity.get("labels") or {}), ):
        for lg, v in src.items():
            if isinstance(v, dict) and v.get("value"):
                if lg == lang:
                    out.insert(0, v["value"])
                else:
                    out.append(v["value"])
    for lg, arr in (entity.get("aliases") or {}).items():
        for a in arr:
            if a.get("value"):
                out.append(a["value"])
    return [x for x in out if not (x in seen or seen.add(x))]


def display_label(entity):
    """What a human should see. The English label if there is one, otherwise the
    first label in any language — never an alias, and never whichever language
    happened to sort first (the review CSV briefly labelled Walmart 沃尔玛)."""
    labs = entity.get("labels") or {}
    en = (labs.get("en") or {}).get("value")
    if en:
        return en
    for v in labs.values():
        if isinstance(v, dict) and v.get("value"):
            return v["value"]
    return ""


def want_keys(company_name, key):
    """The key(s) an entity is allowed to match.

    The stored company_key is built from Fortune's own string, and Fortune
    abbreviates: 'Intl. Business Machines' keys to `intl business machines`, which
    no Wikidata label will ever equal. IBM was found by the widened search and then
    thrown away by this gate. Expanding the abbreviation on OUR side too is not a
    loosening — it is still exact equality, just against a spelling of the same
    name rather than the same typography."""
    out, seen = [], set()
    for cand in (key, company_key(company_name or "")):
        exp = company_name or ""
        for pat, rep in _ABBREV:
            exp = re.sub(pat, rep, exp, flags=re.I)
        for k in (cand, company_key(exp)):
            if k and k not in seen:
                seen.add(k)
                out.append(k)
    return out


def name_ok(entity, want_key):
    """Gate 2. A label or alias in ANY language must reduce to EXACTLY one of the
    keys we accept. No fuzz, no substring, no difflib — 292 difflib matches on this
    dataset were sampled and were mostly false ('Alco Products' -> 'Avon
    Products', 'Allen Group' -> 'Carlyle Group')."""
    want = want_key if isinstance(want_key, (list, tuple, set)) else [want_key]
    return any(company_key(n) in set(want) for n in labels_and_aliases(entity))


# Resolved P31 -> bool, so an unknown type costs one fetch once, not once per row.
_TYPE_VERDICT = {}
# The roots a company type must reach. business / organization / enterprise.
ORG_ROOTS = {"Q4830453", "Q43229", "Q6881511", "Q783794", "Q167037"}


def type_ok(entity, resolver=None):
    """Gate 1, as a CLASS test rather than a list membership test.

    The flat allow-list was the wrong shape: the pilot lost Amoco and Gulf Oil to
    P31=Q14941854 ('oil company'), which is plainly a company type and was simply
    not enumerated. Extending the list one type at a time is the failure this
    project already has a name for. An unknown P31 is now walked up P279
    (subclass of) two hops, and accepted if it reaches business/organization.

    resolver(qid) -> the type entity, injected so the self-test stays offline."""
    ids = claim_ids(entity, "P31")
    hit = [i for i in ids if i in ORG_TYPES]
    if hit:
        return (True, ids, hit)
    if resolver is None:
        return (False, ids, [])
    for i in ids:
        if i in _TYPE_VERDICT:
            if _TYPE_VERDICT[i]:
                return (True, ids, [i])
            continue
        good = False
        try:
            frontier, seen = [i], {i}
            for _ in range(2):
                nxt = []
                for t in frontier:
                    parents = claim_ids(resolver(t), "P279")
                    if ORG_ROOTS & set(parents):
                        good = True
                        break
                    nxt += [p for p in parents if p not in seen]
                    seen.update(parents)
                if good:
                    break
                frontier = nxt[:6]      # keep the walk bounded
        except Exception:
            good = False
        _TYPE_VERDICT[i] = good
        if good:
            return (True, ids, [i])
    return (False, ids, [])


def date_ok(entity, first_year, last_year):
    """Gate 3. The entity's lifespan must contain the first year we saw the company
    listed. Catches the common failure where a modern company has taken a dead
    company's name: Fortune's 1955 'Foo Industries' is not the Foo Industries
    incorporated in 1998. Missing dates do NOT reject — most dead companies have
    neither — they simply fail to help.

    A one-year tolerance either side absorbs the offset between a Fortune list
    year and the fiscal year it reports on."""
    inc, dis = claim_year(entity, "P571"), claim_year(entity, "P576")
    if inc is not None and inc > first_year + 1:
        return (False, f"inception {inc} postdates first listing {first_year}")
    if dis is not None and dis < first_year - 1:
        return (False, f"dissolved {dis} before first listing {first_year}")
    return (True, f"inception={inc} dissolved={dis}")


def statement_window(claim):
    """(start, end) years from a P159 statement's P580/P582 qualifiers."""
    q = claim.get("qualifiers") or {}

    def yr(prop):
        for s in q.get(prop, []):
            v = (s.get("datavalue") or {}).get("value")
            if isinstance(v, dict) and v.get("time"):
                m = re.match(r"[+-](\d{1,5})-", v["time"])
                if m:
                    return int(m.group(1))
        return None
    return (yr("P580"), yr("P582"))


def pick_hq_statement(entity, first_year, last_year):
    """Gate 4's chooser, and the reason this board can be period-correct at all.

    Boeing has three P159 statements (Seattle, Chicago from 2001, Arlington from
    2022). Taking the current one would stamp Arlington on its 1997 listing. The
    statement chosen is the one whose window covers the MIDPOINT of the years the
    company was actually listed; failing that, a statement with no dates (the
    common case for a company with one HQ its whole life); failing that, the
    earliest-starting statement, which is nearer the truth than the latest.

    Returns (place_qid, asof_label, None) or (None, None, reason)."""
    claims = (entity.get("claims") or {}).get("P159") or []
    scored = []
    for c in claims:
        v = ((c.get("mainsnak") or {}).get("datavalue") or {}).get("value")
        if not (isinstance(v, dict) and v.get("id")):
            continue
        scored.append((v["id"], statement_window(c)))
    if not scored:
        return (None, None, "no P159 headquarters statement")

    mid = (first_year + last_year) // 2
    # A start date is required. An open-start window ("until 2011") says nothing
    # about when the company arrived, so it cannot certify an early listing year.
    covering = [(q, w) for q, w in scored
                if w[0] is not None and w[0] <= mid
                and (w[1] is None or w[1] >= mid)]
    if covering:
        q, w = covering[0]
        return (q, f"{w[0] or '?'}-{w[1] or 'present'}", None)

    # Nothing certifies. Pick the most plausible value anyway for the reviewer to
    # look at — it will be labelled below 'period' and will never auto-load.
    #
    # Prefer an OPEN-START statement that ends after the midpoint. Boeing's Seattle
    # sits on (None, 2001) because Boeing was founded there, so for a 1997 listing
    # Seattle is the best value on offer even though the window cannot prove it.
    # Chiquita's Cincinnati sits on the identical shape and is wrong for 1968.
    # The two are indistinguishable from the data, which is precisely why neither
    # is certified — but "the era's best guess" still beats the successor's city.
    open_start = [(q, w) for q, w in scored
                  if w[0] is None and w[1] is not None and w[1] >= mid]
    if open_start:
        q, w = open_start[0]
        return (q, f"?-{w[1]}", None)

    undated = [(q, w) for q, w in scored if w == (None, None)]
    if undated:
        return (undated[0][0], "undated", None)

    scored.sort(key=lambda s: (s[1][0] is None, s[1][0] or 0))
    q, w = scored[0]
    return (q, f"{w[0] or '?'}-{w[1] or 'present'} (no statement covers {mid})", None)


def asof_is_period(asof):
    """Is this statement window strong enough to CERTIFY the listing years?

    🔴 An OPEN START cannot certify anything. A statement that says only "until
    2011" was treated as covering every year before 2011, which put Chiquita
    Brands in Cincinnati for 1968 — it was Boston, and then New York, and only
    reached Cincinnati in the mid-1980s. The window has to say when it BEGAN.
    An open end is fine: it means the company never left.

    Written to read off the stored `hq_asof` label rather than the entity, so a
    review CSV produced before this rule existed is re-judged correctly at load
    time without re-crawling 1,900 companies."""
    if not asof or asof == "undated" or "no statement covers" in asof:
        return False
    return not asof.startswith("?")


def hq_confidence(entity, asof, first_year, last_year, this_year=2026):
    """How much the chosen HQ can be trusted for the years this company was listed.

    This is the pilot's most important finding and it is a correctness problem, not
    a coverage one. Where Wikidata dates its P159 statements the answer is genuinely
    period-correct. Where it does not, taking the single value stamps TODAY'S
    headquarters on a span that may predate the move by decades:

      ExxonMobil      -> Spring, Texas   (the 1955-1995 rows were New York)
      Philip Morris   -> Richmond, Va.   (the 1996-2002 rows were New York)
      Mobil           -> Fairfax, Va.    (right for 1999, wrong for 1955)

    All three looked like clean accepts. So:
      period  the statement's own window covers the midpoint of the listing span
      stable  undated, but the company died within a few years of its last listing,
              so there was no later era for the value to have drifted in from
      today   undated and the company outlived its listing span — this is a
              present-day value wearing a historical date, and must not auto-load
    """
    if asof_is_period(asof):
        return "period"

    # ABSORPTION DRIFT — the failure neither the date gate nor the span rule can
    # see, and the one that put wrong values in the loadable bucket. Wikidata's
    # item for a company that was bought often carries the BUYER's headquarters:
    #   Trans World Airlines -> Fort Worth   (American Airlines', not TWA's)
    #   Hammermill Paper     -> Mittineague  (via a Strathmore alias)
    #   BFGoodrich           -> Charlotte    (Goodrich Corp's later home)
    # All three passed every gate and two were labelled 'stable', because dying on
    # schedule is exactly what an acquired company does. So: a company with a
    # parent or an owner, whose HQ statement carries no dates of its own, cannot
    # have that HQ certified as its own.
    if claim_ids(entity, "P749") or claim_ids(entity, "P127"):
        return "absorbed"

    # A dead company cannot have moved AFTER its last listing, but it had every
    # chance to move DURING it. Mobil was listed 1955-1999 and Wikidata's one
    # undated value is Fairfax, which it moved to in the 1980s. So the span itself
    # is the risk: one undated HQ can only describe a span short enough not to
    # contain a relocation.
    span = last_year - first_year
    dissolved = claim_year(entity, "P576")
    ended_here = dissolved is not None and dissolved <= last_year + 3
    if span <= LONG_SPAN and (ended_here or last_year >= this_year - 3):
        return "stable"
    return "today"


US = "Q30"


def decide(candidates, want_key, first_year, last_year, resolver=None,
           prefer_country=US):
    """The whole gate stack over a list of fetched candidate entities.

    Returns (verdict, reason, entity, place_qid, asof). Verdicts:
      accepted | ambiguous | no_candidate | type_reject | name_reject
      | date_reject | no_place

    Two candidates clearing every gate is AMBIGUOUS and yields nothing. The
    project's standing rule is that unresolved data is logged and left alone, not
    guessed at — 'Genesis Energy' and 'Genesis Energy, L.P.' were separately
    listed for four straight years and share a key, so this is a live case, not a
    theoretical one."""
    if not candidates:
        return ("no_candidate", "wbsearchentities returned nothing", None, None, None)

    passed, why = [], []
    for e in candidates:
        qid = e.get("id", "?")
        ok, ids, hit = type_ok(e, resolver)
        if not ok:
            why.append(f"{qid} type_reject P31={','.join(ids) or 'none'}")
            continue
        if not name_ok(e, want_key):
            why.append(f"{qid} name_reject label={display_label(e) or '?'!r}")
            continue
        dok, dwhy = date_ok(e, first_year, last_year)
        if not dok:
            why.append(f"{qid} date_reject {dwhy}")
            continue
        place, asof, perr = pick_hq_statement(e, first_year, last_year)
        if not place:
            why.append(f"{qid} no_place {perr}")
            continue
        passed.append((e, place, asof, ORG_TYPES.get(hit[0], hit[0])))

    if len(passed) > 1:
        # A principled tie-break, not a coin toss. An entity whose OWN NAME is the
        # name we are resolving beats one that merely carries it as an alias:
        # Chevron lists "Texaco" as an alias because it bought it, so a search for
        # Texaco returns both and only one of them IS Texaco.
        want = set(want_key if isinstance(want_key, (list, tuple, set)) else [want_key])
        primary = [p for p in passed
                   if company_key(display_label(p[0])) in want]
        if len(primary) == 1:
            passed = primary

    if len(passed) > 1 and prefer_country:
        # The Fortune 500 is a list of AMERICAN companies. When a name resolves to
        # several real companies, the national subsidiaries and the foreign
        # namesakes are not the one Fortune ranked: 'General Electric' returns the
        # British General Electric Company plc, 'International Business Machines'
        # returns IBM Germany and IBM France. Scoped to the source deliberately —
        # Board B (FT Global 500) is global and must NOT inherit this.
        home = [p for p in passed if prefer_country in claim_ids(p[0], "P17")]
        if len(home) == 1:
            passed = home

    if len(passed) == 1:
        e, place, asof, kind = passed[0]
        # A lone candidate gets none of the scrutiny the tie-break applies. If it
        # matched only through an ALIAS and not through its own name, it is very
        # often the successor rather than the company: Hammermill Paper resolved
        # to Strathmore Paper, which carries the Hammermill name because it ended
        # up owning it. Flag it rather than silently trusting it.
        want = set(want_key if isinstance(want_key, (list, tuple, set)) else [want_key])
        via_alias = company_key(display_label(e)) not in want
        return ("accepted_alias" if via_alias else "accepted",
                f"{kind}; hq window {asof}"
                + ("; matched via an alias, not its own name" if via_alias else ""),
                e, place, asof)
    if len(passed) > 1:
        ids = ", ".join(f"{p[0].get('id','?')} ({display_label(p[0])})" for p in passed)
        return ("ambiguous", f"{len(passed)} candidates cleared every gate: {ids}",
                None, None, None)

    # Report the gate that the best candidate died on, not just "no".
    order = ["no_place", "date_reject", "name_reject", "type_reject"]
    for tag in order:
        for w in why:
            if tag in w:
                return (tag, "; ".join(why[:3]), None, None, None)
    return ("no_candidate", "; ".join(why[:3]) or "no candidate survived",
            None, None, None)


# ---------------------------------------------------------------------------
# NETWORK
# ---------------------------------------------------------------------------

def _get_json(url, tries=3):
    from common import fetch_url
    # Wikidata asks crawlers to identify themselves and throttles anonymous
    # browser-shaped UAs harder. The pilot lost Bethlehem Steel to a 429 that four
    # seconds of backoff could not clear.
    ua = "CitizenOfNowhere-data/1.0 (https://rankings.citizenofnowhere.org) python-urllib"
    last = None
    for a in range(tries):
        try:
            return json.loads(fetch_url(url, timeout=45, ua=ua).decode("utf-8", "replace"))
        except Exception as e:
            last = e
            if "429" in str(e):
                time.sleep(10 * (a + 1))     # rate limit: back off hard
            else:
                time.sleep(2 * (a + 1))
    raise RuntimeError(f"{url} -> {last}")


# NB the trailing (?!\w) rather than \b: "Intl." ends in a full stop, and there is
# no word boundary between '.' and the following space, so \b never fires on the
# abbreviations that actually carry one. Cost the whole expansion pass silently
# until the self-test caught it.
_ABBREV = [(r"\bIntl\.?(?!\w)", "International"), (r"\bInt'l\.?(?!\w)", "International"),
           (r"\bMfg\.?(?!\w)", "Manufacturing"), (r"\bMtg\.?(?!\w)", "Mortgage"),
           (r"\bIndus\.?(?!\w)", "Industries"), (r"\bNatl\.?(?!\w)", "National"),
           (r"\bAmer\.?(?!\w)", "American"), (r"\bBros\.?(?!\w)", "Brothers"),
           (r"\bSvcs?\.?(?!\w)", "Services"), (r"\bTech\.?(?!\w)", "Technologies"),
           (r"\bCos\.?(?!\w)", "Companies"), (r"\bMgmt\.?(?!\w)", "Management"),
           (r"\bEqpt\.?(?!\w)", "Equipment"), (r"\bPetrol\.?(?!\w)", "Petroleum")]


def search_terms(name, key):
    """The literal Fortune string, then progressively less literal forms.

    Fortune abbreviates in the source ('Intl. Business Machines'), and
    wbsearchentities is a prefix/alias matcher, not a fuzzy one — it returned
    NOTHING for three of the twenty largest companies in the pilot, IBM among
    them. Widening the SEARCH is safe; the four gates still decide."""
    out, seen = [], set()
    for t in (name, re.sub(r",?\s+(Inc|Corp|Co|Ltd|Company|Corporation)\.?$", "",
                           name or "", flags=re.I), key):
        t = (t or "").strip()
        for pat, rep in _ABBREV:
            t = re.sub(pat, rep, t, flags=re.I)
        t = re.sub(r"\s+", " ", t).strip()
        if t and t.lower() not in seen:
            seen.add(t.lower())
            out.append(t)
    return out


def search_entities(name, limit=7):
    """wbsearchentities, NOT SPARQL. Returns candidate QIDs, best match first."""
    q = urllib.parse.urlencode({"action": "wbsearchentities", "search": name[:250],
                                "language": "en", "uselang": "en", "type": "item",
                                "limit": limit, "format": "json"})
    d = _get_json(f"{API}?{q}")
    return [h["id"] for h in d.get("search", []) if h.get("id")]


def get_entity(qid, cache=None):
    if cache is not None and qid in cache:
        return cache[qid]
    d = _get_json(ENTITY.format(qid))
    e = (d.get("entities") or {}).get(qid) or {}
    if cache is not None:
        cache[qid] = e
    return e


def resolve_place(qid, cache):
    """Place QID -> {city, state, country, lat, lon}. Cached on disk across runs:
    a few hundred distinct cities serve a few thousand companies, and re-fetching
    Pittsburgh 40 times is the difference between a polite crawl and a rude one."""
    if qid in cache:
        return cache[qid]
    e = get_entity(qid)
    label = ((e.get("labels") or {}).get("en") or {}).get("value") or ""
    country = ""
    for c in claim_ids(e, "P17")[:1]:
        ce = get_entity(c)
        country = ((ce.get("labels") or {}).get("en") or {}).get("value") or ""
    lat = lon = None
    for c in (e.get("claims") or {}).get("P625", []):
        v = ((c.get("mainsnak") or {}).get("datavalue") or {}).get("value") or {}
        if "latitude" in v:
            lat, lon = v["latitude"], v["longitude"]
            break
    # One hop up the admin chain, and only kept when it is a US state — the board's
    # disambiguation problem is Springfield/Columbus/Portland, which is a US problem.
    state = ""
    for c in claim_ids(e, "P131")[:2]:
        pe = get_entity(c)
        if "Q35657" in claim_ids(pe, "P31"):
            state = ((pe.get("labels") or {}).get("en") or {}).get("value") or ""
            break
    out = {"city": label, "state": state, "country": country, "lat": lat, "lon": lon}
    cache[qid] = out
    return out


def load_place_cache():
    if os.path.exists(PLACE_CACHE):
        try:
            return json.load(open(PLACE_CACHE, encoding="utf-8"))
        except Exception:
            log("place cache unreadable, starting a new one")
    return {}


def save_place_cache(c):
    json.dump(c, open(PLACE_CACHE, "w", encoding="utf-8"), indent=0)


# ---------------------------------------------------------------------------
# RUNNER
# ---------------------------------------------------------------------------

def targets():
    """Companies in company_hq with no HQ city, worst-first by peak rank so the
    pilot is spent on the companies a reader is most likely to look for."""
    rows = select_all(
        "/rest/v1/company_hq?select=company_key,company,first_year,last_year,"
        "peak_rank,hq_city,metro&hq_city=is.null", "company_key")
    rows.sort(key=lambda r: (r.get("peak_rank") or 10**6))
    return rows


def read_done():
    if not os.path.exists(REVIEW):
        return {}
    with open(REVIEW, encoding="utf-8") as f:
        return {r["company_key"]: r for r in csv.DictReader(f)}


def write_review(rows):
    with open(REVIEW, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)


def run(full, resume, sample=False, out_path=None):
    global REVIEW
    if out_path:
        REVIEW = out_path
    todo = targets()
    done = read_done() if resume else {}
    if resume and done:
        log(f"resuming: {len(done)} already in {os.path.basename(REVIEW)}")
        todo = [t for t in todo if t["company_key"] not in done]
    if not full:
        if sample:
            # The rank-sorted pilot is the WORST case on purpose: the biggest
            # companies are also the longest-listed, and listing span is exactly
            # what the confidence rule penalises. A fixed-seed random sample is
            # what the other 1,900 actually look like. Seeded so the same 20 come
            # back on a re-run and the numbers are comparable.
            import random
            random.Random(1955).shuffle(todo)
        todo = todo[:PILOT]

    places = load_place_cache()
    out = list(done.values())
    t0, calls = time.time(), 0

    for i, t in enumerate(todo, 1):
        key, name = t["company_key"], t["company"]
        fy = t.get("first_year") or 1955
        ly = t.get("last_year") or fy
        row = {f: "" for f in FIELDS}
        row.update({"company_key": key, "company": name, "first_year": fy,
                    "last_year": ly, "peak_rank": t.get("peak_rank") or ""})
        try:
            ecache, verdict, reason, ent, place_qid, asof = {}, None, "", None, None, None
            for term in search_terms(name, key):
                qids = search_entities(term)
                calls += 1
                ents = []
                for q in qids:
                    ents.append(get_entity(q, ecache))
                    calls += 1
                    time.sleep(SLEEP)
                verdict, reason, ent, place_qid, asof = decide(
                    ents, want_keys(name, key), fy, ly,
                    resolver=lambda t: get_entity(t, ecache))
                if verdict in ("accepted", "accepted_alias", "ambiguous"):
                    break          # a decisive answer; stop widening the search
            row["verdict"], row["reason"] = verdict, reason[:300]
            if verdict in ("accepted", "accepted_alias"):
                row["hq_confidence"] = hq_confidence(ent, asof, fy, ly)
                p = resolve_place(place_qid, places)
                calls += 3
                row.update({"qid": ent.get("id", ""),
                            "entity_label": display_label(ent),
                            "hq_city": p["city"], "hq_state": p["state"],
                            "hq_country": p["country"], "lat": p["lat"] or "",
                            "lon": p["lon"] or "", "hq_asof": asof or ""})
                if not p["city"]:
                    row["verdict"], row["reason"] = "no_place", "place entity has no en label"
        except Exception as e:
            row["verdict"], row["reason"] = "error", str(e)[:300]
        out.append(row)
        time.sleep(SLEEP)
        if i % 25 == 0 or i == len(todo):
            log(f"{i}/{len(todo)}  {time.time()-t0:.0f}s")
            write_review(out)
            save_place_cache(places)

    write_review(out)
    save_place_cache(places)

    counts = {}
    for r in out:
        counts[r["verdict"]] = counts.get(r["verdict"], 0) + 1
    dur = time.time() - t0
    log(f"-> {REVIEW}")
    for v, n in sorted(counts.items(), key=lambda kv: -kv[1]):
        log(f"  {v:<14} {n}")
    if todo:
        per = dur / len(todo)
        remaining = len(targets()) - len(out)
        log(f"rate: {per:.2f}s/company, {calls} HTTP calls this run")
        log(f"PROJECTION for the remaining {remaining}: "
            f"{remaining*per/60:.0f} min ({remaining*per/3600:.1f} h)")
    if not full:
        log("PILOT ONLY. Read the CSV, then re-run with --full --resume.")


def load(write):
    """Push ACCEPTED rows only into company_hq. Never touches metro: that column is
    Ashwin's and the metro assignment step's, and load_rankings.py already goes out
    of its way not to clobber it."""
    every = read_done().values()
    all_ok = [r for r in every if r.get("verdict") in ("accepted", "accepted_alias")]
    # Ashwin's ruling, 2026-08-17: ONLY provably period-correct HQs are loaded.
    # 'stable' was a reasoned approximation and is no longer good enough — nothing
    # approximate enters a column that a metro rollup will later sum.
    # Re-judged from hq_asof at load time, not trusted from the stored column: the
    # open-start rule post-dates the sweep and would otherwise let Chiquita in.
    rows = [r for r in all_ok if r.get("verdict") == "accepted"
            and r.get("hq_confidence") == "period"
            and asof_is_period(r.get("hq_asof"))]
    held = len(all_ok) - len(rows)
    if held:
        by = {}
        for r in all_ok:
            if r not in rows:
                tag = ("alias-only" if r["verdict"] == "accepted_alias"
                       else r.get("hq_confidence") or "?")
                by[tag] = by.get(tag, 0) + 1
        log(f"HOLDING BACK {held} of {len(all_ok)} accepted rows: "
            + ", ".join(f"{n} {k}" for k, n in sorted(by.items(), key=lambda kv: -kv[1])))
        log("  'today' = a present-day HQ on a historical span; 'absorbed' = the "
            "acquirer's HQ; 'alias-only' = matched by an alias, not its own name.")
        log("  They stay in the CSV for a ruling. Nothing here is guessed at.")
    if not all_ok:
        sys.exit("nothing accepted in the review CSV; run the pilot first")
    body = []
    for r in rows:
        body.append({"company_key": r["company_key"],
                     "hq_city": r["hq_city"] or None,
                     "hq_state": r["hq_state"] or None,
                     "hq_country": r["hq_country"] or None,
                     "qid": r["qid"] or None,
                     "lat": float(r["lat"]) if r.get("lat") else None,
                     "lon": float(r["lon"]) if r.get("lon") else None,
                     "hq_source": f"wikidata:{r['qid']}"})
    log(f"{len(body)} period-correct rows ready for company_hq")
    # The QID is an IDENTITY fact, not an address, and it cleared all four gates
    # even where the HQ could not be dated. Writing it for the held-back rows costs
    # nothing, asserts no location, and is what every later backfill (era names,
    # industry, inception dates, a better HQ source) will join on. Nothing here
    # touches hq_city / hq_state / lat / lon.
    ident = [{"company_key": r["company_key"], "qid": r["qid"]}
             for r in all_ok if r not in rows and r.get("qid")]
    log(f"{len(ident)} held-back rows still carry a verified QID; writing identity only")

    if not write:
        log("dry run (no --write); nothing sent to Supabase")
        for r in rows[:10]:
            log(f"  {r['company']} -> {r['hq_city']}, {r['hq_state'] or r['hq_country']}"
                f"  [{r['qid']} {r['hq_asof']}]")
        return

    hdr = {"Prefer": "resolution=merge-duplicates,return=minimal"}
    for i in range(0, len(body), 500):
        rest("POST", "/rest/v1/company_hq?on_conflict=company_key",
             body=body[i:i + 500], headers=hdr)
        log(f"company_hq: {min(i+500, len(body))}/{len(body)}")
    for i in range(0, len(ident), 500):
        rest("POST", "/rest/v1/company_hq?on_conflict=company_key",
             body=ident[i:i + 500], headers=hdr)
        log(f"company_hq qid: {min(i+500, len(ident))}/{len(ident)}")
    log("loaded")


# ---------------------------------------------------------------------------
# SELF-TEST — pure decision logic, no network. Cases are the ones this dataset
# actually produced, not invented happy paths.
# ---------------------------------------------------------------------------

def _e(qid, label, p31, aliases=(), inception=None, dissolved=None, hq=()):
    """Build a minimal entity. hq is a list of (place_qid, start, end)."""
    def timeval(y):
        return [{"mainsnak": {"datavalue": {"value": {"time": f"+{y:04d}-01-01T00:00:00Z"}}}}]
    claims = {"P31": [{"mainsnak": {"datavalue": {"value": {"id": p}}}} for p in p31]}
    if inception:
        claims["P571"] = timeval(inception)
    if dissolved:
        claims["P576"] = timeval(dissolved)
    if hq:
        st = []
        for pq, s, en in hq:
            c = {"mainsnak": {"datavalue": {"value": {"id": pq}}}, "qualifiers": {}}
            if s:
                c["qualifiers"]["P580"] = [{"datavalue": {"value": {"time": f"+{s:04d}-01-01T00:00:00Z"}}}]
            if en:
                c["qualifiers"]["P582"] = [{"datavalue": {"value": {"time": f"+{en:04d}-01-01T00:00:00Z"}}}]
            st.append(c)
        claims["P159"] = st
    return {"id": qid, "labels": {"en": {"value": label}},
            "aliases": {"en": [{"value": a} for a in aliases]}, "claims": claims}


def self_test():
    ok = fail = 0

    def check(name, got, want):
        nonlocal ok, fail
        if got == want:
            ok += 1
        else:
            fail += 1
            print(f"  FAIL {name}\n       got  {got!r}\n       want {want!r}")

    BIZ = ["Q4830453"]

    # --- gate 2: the two shortcuts already measured and rejected on this data ---
    avon = _e("Q1", "Avon Products", BIZ, hq=[("QNY", None, None)])
    check("alco is not avon", decide([avon], "alco products", 1955, 1968)[0], "name_reject")
    carlyle = _e("Q2", "The Carlyle Group", BIZ, hq=[("QDC", None, None)])
    check("allen group is not carlyle",
          decide([carlyle], "allen group", 1970, 1990)[0], "name_reject")
    nacco = _e("Q3", "NACCO Industries", BIZ, hq=[("QCLE", None, None)])
    check("acf is not nacco", decide([nacco], "acf industries", 1955, 1980)[0], "name_reject")

    # A legal-form difference must still match: the key strips it on both sides.
    beth = _e("Q4", "Bethlehem Steel Corporation", BIZ, inception=1857, dissolved=2003,
              hq=[("QBETH", None, None)])
    check("legal form folds", decide([beth], "bethlehem steel", 1955, 2001)[0], "accepted")

    # --- gate 1 ---
    person = _e("Q5", "Bethlehem Steel", ["Q5"], hq=[("QX", None, None)])
    check("a human is not a company",
          decide([person], "bethlehem steel", 1955, 2001)[0], "type_reject")
    city = _e("Q6", "Bethlehem Steel", ["Q515"], hq=[("QX", None, None)])
    check("a city is not a company",
          decide([city], "bethlehem steel", 1955, 2001)[0], "type_reject")

    # --- gate 3: a modern company wearing a dead one's name ---
    revival = _e("Q7", "Pan Am", BIZ, inception=1998, hq=[("QX", None, None)])
    check("1998 revival rejected for a 1955 listing",
          decide([revival], "pan am", 1955, 1991)[0], "date_reject")
    check("dissolved long before rejected",
          decide([_e("Q8", "Foo", BIZ, dissolved=1930, hq=[("QX", None, None)])],
                 "foo", 1955, 1960)[0], "date_reject")
    check("one-year tolerance holds",
          decide([_e("Q9", "Foo", BIZ, inception=1956, hq=[("QX", None, None)])],
                 "foo", 1955, 1960)[0], "accepted")
    check("missing dates never reject",
          decide([_e("Q10", "Foo", BIZ, hq=[("QX", None, None)])], "foo", 1955, 1960)[0],
          "accepted")

    # --- gate 4 + period-correct HQ: the Boeing case, stated in the docstring ---
    boeing = _e("Q11", "Boeing", BIZ, inception=1916,
                hq=[("QSEA", None, 2001), ("QCHI", 2001, 2022), ("QARL", 2022, None)])
    # Seattle is still the value offered for a 1997 listing, but its window has an
    # open start, so it is offered as a best guess and NOT certified.
    check("1997 listing still gets Seattle",
          pick_hq_statement(boeing, 1955, 1997)[0], "QSEA")
    check("but Seattle is not certifiable for it",
          asof_is_period(pick_hq_statement(boeing, 1955, 1997)[1]), False)
    check("2005 listing gets Chicago",
          pick_hq_statement(boeing, 2001, 2010)[0], "QCHI")
    check("2026 listing gets Arlington",
          pick_hq_statement(boeing, 2023, 2026)[0], "QARL")
    check("undated statement wins when nothing covers",
          pick_hq_statement(_e("Q12", "F", BIZ, hq=[("QA", None, None)]), 1960, 1970)[0],
          "QA")
    check("no P159 is a place failure",
          decide([_e("Q13", "Foo", BIZ)], "foo", 1955, 1960)[0], "no_place")

    # --- ambiguity: Genesis Energy vs Genesis Energy, L.P. ---
    g1 = _e("Q14", "Genesis Energy", BIZ, hq=[("QHOU", None, None)])
    g2 = _e("Q15", "Genesis Energy, L.P.", BIZ, hq=[("QDAL", None, None)])
    v, reason, ent, _, _ = decide([g1, g2], "genesis energy", 1996, 2000)
    check("two clean candidates resolve to nothing", v, "ambiguous")
    check("ambiguity names both", ("Q14" in reason and "Q15" in reason), True)
    check("ambiguity yields no entity", ent, None)

    # --- aliases count, and the empty-input case ---
    alias = _e("Q16", "International Business Machines", BIZ, aliases=("IBM",),
               hq=[("QARM", None, None)])
    check("an alias still proves identity, but is marked as such",
          decide([alias], "ibm", 1955, 2026)[0], "accepted_alias")
    check("no candidates", decide([], "foo", 1955, 1960)[0], "no_candidate")

    # --- claim parsers ---
    check("claim_year reads a year", claim_year(beth, "P571"), 1857)
    check("claim_year on a missing prop", claim_year(beth, "P999"), None)
    check("statement window", statement_window(boeing["claims"]["P159"][1]), (2001, 2022))
    check("company_key still folds legal forms",
          company_key("Carlyle Group L.P."), "carlyle group")

    # --- gate 1 as a CLASS test: the Amoco / Gulf Oil loss ---
    # Q14941854 'oil company' is not enumerated, but subclasses business.
    FAKE = {"Q14941854": {"claims": {"P279": [
                {"mainsnak": {"datavalue": {"value": {"id": "Q4830453"}}}}]}},
            "Q99999": {"claims": {"P279": [
                {"mainsnak": {"datavalue": {"value": {"id": "Q7397"}}}}]}},
            "Q7397": {"claims": {}}}
    _TYPE_VERDICT.clear()
    amoco = _e("Q17", "Amoco", ["Q14941854"], inception=1889, dissolved=1998,
               hq=[("QCHI", None, None)])
    check("unenumerated company type is walked, not rejected",
          decide([amoco], "amoco", 1955, 1998, resolver=FAKE.get)[0], "accepted")
    _TYPE_VERDICT.clear()
    software = _e("Q18", "Amoco", ["Q99999"], hq=[("QX", None, None)])
    check("a non-company type still fails the walk",
          decide([software], "amoco", 1955, 1998, resolver=FAKE.get)[0], "type_reject")
    _TYPE_VERDICT.clear()
    check("no resolver falls back to the allow-list",
          decide([amoco], "amoco", 1955, 1998)[0], "type_reject")

    # --- gate 2 must not depend on an English label existing (Chrysler) ---
    nolabel = {"id": "Q19", "labels": {"de": {"value": "Chrysler Corporation"}},
               "aliases": {}, "claims": {
                   "P31": [{"mainsnak": {"datavalue": {"value": {"id": "Q4830453"}}}}],
                   "P159": [{"mainsnak": {"datavalue": {"value": {"id": "QDET"}}}}]}}
    check("a non-English label still proves identity",
          decide([nolabel], "chrysler", 1955, 1998)[0], "accepted")

    # --- search widening ---
    check("abbreviations expand",
          "International Business Machines" in search_terms("Intl. Business Machines",
                                                            "intl business machines"),
          True)
    check("legal suffix dropped as a variant",
          "ITT Industries" in search_terms("ITT Industries, Inc.", "itt industries"),
          True)
    check("the literal name is always tried first",
          search_terms("Intl. Business Machines", "k")[0] != "Intl. Business Machines",
          True)   # first term is the abbreviation-expanded literal, not the raw key

    # --- want_keys: the IBM loss ---
    wk = want_keys("Intl. Business Machines", "intl business machines")
    check("abbreviated key expands to the real one",
          "international business machines" in wk, True)
    check("the stored key is still honoured", "intl business machines" in wk, True)
    ibm = _e("Q22", "IBM", BIZ, aliases=("International Business Machines Corporation",),
             hq=[("QARM", None, None)])
    check("IBM matches via the expanded key",
          decide([ibm], wk, 1955, 1995)[0], "accepted_alias")
    check("expansion is not a loosening",
          decide([_e("Q23", "International Paper", BIZ, hq=[("QX", None, None)])],
                 wk, 1955, 1995)[0], "name_reject")

    # --- ambiguity tie-break: Chevron carries 'Texaco' as an alias ---
    tex = _e("Q24", "Texaco", BIZ, hq=[("QNY", None, None)])
    chev = _e("Q25", "Chevron Corporation", BIZ, aliases=("Texaco",),
              hq=[("QSR", None, None)])
    v2, r2, e2, _, _ = decide([tex, chev], "texaco", 1955, 2001)
    check("the entity that IS Texaco wins over the one that owns it", v2, "accepted")
    check("and it is the right one", e2.get("id"), "Q24")
    both = _e("Q26", "Texaco", BIZ, hq=[("QLA", None, None)])
    check("two entities genuinely named the same stay ambiguous",
          decide([tex, both], "texaco", 1955, 2001)[0], "ambiguous")

    # --- display label ---
    check("English label preferred for display",
          display_label({"labels": {"zh": {"value": "沃尔玛"},
                                    "en": {"value": "Walmart"}}}), "Walmart")
    check("falls back when there is no English label",
          display_label({"labels": {"de": {"value": "Chrysler"}}}), "Chrysler")

    # --- hq_confidence: the pilot's three false-looking accepts ---
    dead = _e("Q20", "Bethlehem Steel", BIZ, inception=1857, dissolved=2003)
    check("a short span ending in dissolution is stable",
          hq_confidence(dead, "undated", 1990, 2001), "stable")
    check("the SAME company over a 46-year span is not",
          hq_confidence(dead, "undated", 1955, 2001), "today")
    alive = _e("Q21", "ExxonMobil", BIZ, inception=1870)
    check("a survivor with an undated HQ is today's, not the era's",
          hq_confidence(alive, "undated", 1955, 1995), "today")
    check("a dated statement is period-correct",
          hq_confidence(alive, "1989-1999", 1996, 1999), "period")
    check("a short recent span is stable",
          hq_confidence(alive, "undated", 2010, 2026), "stable")
    check("a long span ending today is still not certifiable",
          hq_confidence(alive, "undated", 1970, 2026), "today")
    # --- the open-start hole: Chiquita in Cincinnati for 1968 ---
    check("an open-start window cannot certify",
          asof_is_period("?-2011"), False)
    check("a closed window can", asof_is_period("1976-1995"), True)
    check("an open END is fine", asof_is_period("1993-present"), True)
    check("undated is not period", asof_is_period("undated"), False)
    check("open-start falls through to the undated/today path",
          hq_confidence(alive, "?-2011", 1968, 1995), "today")
    chiquita = _e("Q35", "Chiquita", BIZ,
                  hq=[("QCIN", None, 2011), ("QCHA", 2011, None)])
    q_c, asof_c, _ = pick_hq_statement(chiquita, 1968, 1995)
    check("Cincinnati is still offered as the era's best guess", q_c, "QCIN")
    check("but its open start is not certified", asof_is_period(asof_c), False)
    check("and the successor's city is NOT what gets offered", q_c != "QCHA", True)
    check("'no statement covers' is not period-correct",
          hq_confidence(alive, "1990-2000 (no statement covers 1960)", 1955, 1965),
          "today")
    # Mobil and Texaco, the two the earlier rule waved through.
    mobil = _e("Q27", "Mobil", BIZ, dissolved=1999)
    check("Mobil's 45-year span is held back",
          hq_confidence(mobil, "undated", 1955, 1999), "today")
    texaco = _e("Q28", "Texaco", BIZ, dissolved=2001)
    check("Texaco's 46-year span is held back",
          hq_confidence(texaco, "undated", 1955, 2001), "today")

    # --- absorption drift: TWA, Hammermill, BFGoodrich ---
    twa = _e("Q32", "Trans World Airlines", BIZ, dissolved=2001)
    twa["claims"]["P749"] = [{"mainsnak": {"datavalue": {"value": {"id": "QAA"}}}}]
    check("an acquired company's undated HQ is the acquirer's",
          hq_confidence(twa, "undated", 1995, 2001), "absorbed")
    check("absorption outranks a short clean span",
          hq_confidence(twa, "undated", 2000, 2001), "absorbed")
    check("but a DATED statement is still period-correct",
          hq_confidence(twa, "1964-2001", 1995, 2001), "period")
    owned = _e("Q33", "Hammermill Paper", BIZ)
    owned["claims"]["P127"] = [{"mainsnak": {"datavalue": {"value": {"id": "QIP"}}}}]
    check("owned-by counts the same as parent-organisation",
          hq_confidence(owned, "undated", 1961, 1986), "absorbed")
    check("an independent company is unaffected",
          hq_confidence(_e("Q34", "Montana Power", BIZ, dissolved=2002),
                        "undated", 1996, 2000), "stable")

    # --- country tie-break, and its scoping ---
    def withc(qid, label, country):
        e = _e(qid, label, BIZ, hq=[("QX", None, None)])
        e["claims"]["P17"] = [{"mainsnak": {"datavalue": {"value": {"id": country}}}}]
        return e
    ge_us = withc("Q29", "General Electric", "Q30")
    ge_uk = withc("Q30x", "General Electric", "Q145")
    check("the American company wins a Fortune 500 tie",
          decide([ge_us, ge_uk], "general electric", 1955, 1995)[2].get("id"), "Q29")
    check("but not when the preference is switched off (Board B)",
          decide([ge_us, ge_uk], "general electric", 1955, 1995,
                 prefer_country=None)[0], "ambiguous")
    check("two American namesakes stay ambiguous",
          decide([ge_us, withc("Q31x", "General Electric", "Q30")],
                 "general electric", 1955, 1995)[0], "ambiguous")

    print(f"self-test: {ok} passed, {fail} failed")
    return 1 if fail else 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--full", action="store_true", help="sweep every company, not the pilot")
    ap.add_argument("--resume", action="store_true", help="skip company_keys already in the CSV")
    ap.add_argument("--load", action="store_true", help="push accepted rows to company_hq")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--sample", action="store_true",
                    help="pilot a seeded RANDOM 20 instead of the top 20 by rank")
    ap.add_argument("--out", help="write the review CSV somewhere else")
    a = ap.parse_args()

    if a.self_test:
        sys.exit(self_test())
    if a.load:
        load(a.write)
        return
    run(a.full, a.resume, sample=a.sample, out_path=a.out)


if __name__ == "__main__":
    main()
