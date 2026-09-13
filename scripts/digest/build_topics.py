#!/usr/bin/env python3
"""Derive analytical `topics` for digest stories from vocabularies already in public/data.

Why this exists: `entities` is a PLACE taxonomy (metro/country/club/league) and must resolve
to a live route, so it is precision-locked and omits rather than guesses. 47% of archived
stories are about companies, technology, markets and culture and carry no place at all.
`topics` is the second field: no page required, never rendered as a link, generous by design.

The vocabulary is GENERATED from the site's own data, so every tag uses the site's canonical
name, joins back to site data, and becomes linkable for free if a page ever exists.

Usage (from the repo root):
    python scripts/digest/build_topics.py --probe        # vocabulary sizes + samples, no DB
    python scripts/digest/build_topics.py --dry-run      # match + coverage report, no writes
    python scripts/digest/build_topics.py --write        # write topics back
    python scripts/digest/build_topics.py --self-test    # matcher logic only, no network
    python scripts/digest/build_topics.py --write --date 2026-09-14 [--date ...]

--date (repeatable) limits the run to digest_item rows for those days and writes with a
per-row PATCH of `topics` only, skipping rows whose topics are unchanged. The daily jobs use
this (Ashwin 2026-09-13): newsletter-podcast post-socials.sh after the morning feed push, and
run-evening.sh after the evening append. A PATCH can never re-insert a row, which matters
because the morning push DELETES evening stories that moved to the next day; the whole-table
path below writes back full rows fetched earlier and must not run alongside a push.
"""

from __future__ import annotations

import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "public" / "data"
SUPABASE_URL = "https://nmprqkmymrdknffwnuur.supabase.co"

# Per-type caps. Precision over recall: the long tail of a 10,000-row club list is where
# false positives live.
CAPS = {"company": 3000, "person": 1500, "market": 80, "league": 200,
        "club": 2500, "artist": 2000, "work": 1500}

# Names that are ordinary English words. A case-sensitive match alone is not enough for
# these, so they are dropped entirely rather than half-trusted.
STOP_NAMES = {
    "the", "and", "for", "you", "new", "one", "two", "now", "out", "all", "any", "day",
    "block", "square", "gap", "target", "visa", "shell", "next", "open", "apple pay",
    "up", "on", "in", "at", "it", "is", "as", "so", "to", "of", "a", "an", "or",
    "sun", "star", "post", "times", "mail", "sky", "arm", "bt", "ee", "aa", "rest",
    "match", "class", "range", "group", "first", "second", "capital", "general",
    "national", "international", "united", "city", "real", "sports", "media", "news",
    "energy", "power", "health", "digital", "global", "world", "american", "british",
    # ordinary words that are also a band, a college team or a film title
    "abc", "army", "navy", "rice", "wings", "texas", "chicago", "philadelphia", "argo",
    "up", "her", "it", "them", "heat", "the town", "wild", "brave", "titans", "giants",
    # band names that are ordinary words or places; "America" alone tagged 25 stories
    "america", "boston", "kansas", "europe", "asia", "journey", "yes", "cream", "free",
    "genesis", "queen", "train", "garbage", "air", "phoenix", "blur", "pulp", "ash",
    "elbow", "muse", "oasis", "bread", "heart", "chic", "sparks", "eagles", "doors",
    "who", "band", "police", "clash", "smiths", "cure", "jam", "kiss", "rush", "toto",
    # office titles that leak in from mayors.json / leaders files as if they were names
    "mayor", "governor", "president", "chancellor", "premier", "chair", "chairman",
    "ceo", "director", "minister", "secretary", "commissioner", "vacant", "acting",
}

# A needle is a plain substring, matched against the space-padded lowercase text.
# A needle written "re:<pattern>" is a regular expression instead, for the handful of
# cases a substring cannot express: " ai " misses "AI-written", "AI's capital boom" and
# "AI-designed", which is most of how the word is actually used in headlines, while a
# bare "ai" would match "said", "chair" and "Dubai".
#
# 🔴 These needles are the ONLY thing that decides a theme. A second pass that asked a
# local model to infer themes for the stories these missed was measured on 2026-09-13
# and rolled back the same day: 329 of 334 rows got a theme with no keyword evidence,
# and a twelve-row sample was mostly wrong ("Vandals are destroying license-plate
# cameras" -> public-health). Widening this list is the durable fix, because it is
# auditable and it applies to every future day. Inference is not.
THEMES = [
    # "llm" is a regex, not a substring: as a substring it fired on "Ballmer".
    ("ai", ["artificial intelligence", "a.i.", "re:(?<![a-z])ai(?![a-z])",
            "chatbot", "openai", "genai", "machine learning", "neural network",
            "large language model", "re:(?<![a-z])llms?(?![a-z])"]),
    ("data-centres", ["data centre", "data center", "hyperscaler", "capex",
                      "capital expenditure", "compute spend"]),
    ("antitrust", ["antitrust", "monopol", "competition authority", "ftc sues", "doj sues",
                   "breakup", "break up", "divestiture"]),
    ("tariffs", ["tariff", "trade war", "import duty"]),
    ("streaming-rights", ["streaming rights", "media rights", "broadcast rights", "rights deal"]),
    ("stadium-financing", ["stadium", "arena deal", "ballpark", "naming rights"]),
    ("housing", ["housing", "rent control", "mortgage", "homebuilder", "zoning",
                 "manufactured home", "trailer park", "single-family", "home prices",
                 "house prices", "landlord", "eviction"]),
    ("transit", ["transit", "subway", "light rail", "congestion pricing"]),
    ("elections", ["election", "ballot", "primary race", "referendum"]),
    ("immigration", ["immigration", "visa policy", "deportation",
                     "re:(?<![a-z])borders?(?![a-z])"]),
    ("climate", ["climate", "emissions", "wildfire", "hurricane", "flooding"]),
    ("advertising", ["advertising", "ad spend", "adtech", "ad tech", "programmatic",
                     "ad exchange", "ad market", "advertiser", "ad revenue", "ad load",
                     "upfronts", "re:(?<![a-z])cpm(?![a-z])"]),
    ("private-equity", ["private equity", "buyout", "leveraged"]),
    ("venture-capital", ["venture capital", "seed round", "series a", "series b",
                         "series c", "vc firm", "term sheet", "down round"]),
    # "strike" gets no bare needle in any form. A word boundary is enough to kill
    # "striker" and "strikeout", but not the military sense, which this archive carries
    # constantly: "U.S. strikes Iran", "Trump calls off Iran strikes", "Iran diplomacy
    # ruptures" were all tagged labour on 2026-09-13. There is no qualifier to exclude,
    # so the labour sense has to be named, the same way "nil" is below.
    # "union" needs only lookbehinds: Rugby Union, European Union, credit union.
    ("labour", ["on strike", "go on strike", "strike action", "strike vote",
                "strike ballot", "strike ends", "general strike", "wildcat strike",
                "strike authorization", "writers strike", "writers' strike",
                "actors strike", "actors' strike", "teachers strike",
                "re:(?<!rugby )(?<!european )(?<!credit )(?<![a-z])unions?(?![a-z])",
                "layoff", "collective bargaining", "walkout", "arbitrator", "back pay",
                "reinstate", "severance", "picket", "wrongful termination",
                "return to office"]),
    ("crypto", ["crypto", "bitcoin", "stablecoin", "ethereum"]),
    ("sports-betting", ["sports betting", "sportsbook", "gambling", "prediction market",
                        "betting exchange", "parlay"]),
    ("women-sports", ["women's sport", "nwsl", "wnba", "women's football"]),
    # No bare "nil" needle. In a newsletter that covers football, "nil" is a scoreline
    # ("two-nil") far more often than it is name, image and likeness.
    ("college-sports", ["ncaa", "college football", "college sports", "nil deal",
                        "nil law", "nil rights", "nil era", "student-athlete",
                        "name, image"]),
    ("combat-sports", ["boxing", "re:(?<![a-z])ufc(?![a-z])", "re:(?<![a-z])mma(?![a-z])",
                       "re:(?<![a-z])wwe(?![a-z])", "heavyweight title", "undercard"]),
    ("ipo", ["re:(?<![a-z])ipos?(?![a-z])", "public listing", "direct listing",
             "re:(?<![a-z])spacs?(?![a-z])"]),
    ("m-and-a", ["acquisition", "merger", "takeover bid", "acquires", "sold its stake",
                 "sells its stake", "divests", "all-cash deal"]),
    ("regulation", ["regulator", "regulation", "lawsuit", "court ruled", "settlement",
                    "supreme court", "federal judge", "appeals court", "subpoena",
                    "injunction", "consent decree", "antitrust suit"]),
    ("press-freedom", ["press freedom", "shield law", "source protection",
                       "reporters to testify", "prior restraint", "gag order",
                       "newsroom", "columnist", "editor-in-chief", "masthead"]),
    # "license-plate" alone is not enough: the Roberto Clemente vanity-plate case is a
    # licensing story, not a surveillance one. The camera has to be in the phrase.
    ("surveillance", ["surveillance", "facial recognition", "license-plate camera",
                      "license plate camera", "plate reader", "doorbell camera",
                      "spyware", "data broker", "privacy"]),
    ("robotics", ["robot", "autonomous vehicle", "self-driving", "driverless",
                  "humanoid", "autonomous weapon"]),
    ("art-market", ["art market", "auction house", "sotheby", "christie's", "art basel",
                    "art gallery", "art fair", "collectible"]),
    ("aviation", ["airline", "air travel", "frequent flyer", "airport", "aviation",
                  "jet order"]),
    ("public-health", ["public health", "obesity", "vaccine", "pandemic", "dementia",
                       "menopause", "opioid", "measles", "life expectancy",
                       "re:(?<![a-z])cdc(?![a-z])", "re:(?<![a-z])fda(?![a-z])"]),
    ("space", ["spacex", "satellite", "nasa", "rocket launch"]),
    ("semiconductors", ["semiconductor", "chipmaker", "foundry", "wafer"]),
    ("retail-media", ["retail media", "commerce media"]),
    ("music-industry", ["record label", "catalogue sale", "touring revenue", "streaming payout"]),
    ("film-tv", ["box office", "studio", "showrunner", "streaming series"]),
    # "grid" as a substring tags every gridiron story. Boundary, not substring.
    ("energy", ["oil price", "opec", "natural gas", "renewables",
                "re:(?<![a-z])grids?(?![a-z])"]),
]


# ------------------------------------------------------------------ vocabulary

def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    return "".join(c for c in s if not unicodedata.combining(c))


def slugify(s: str) -> str:
    s = norm(s).lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:60]


def walk_names(obj, keys: tuple[str, ...]) -> list[str]:
    """Pull string values stored under any of `keys`, anywhere in the structure.
    Defensive on purpose: these files are built by several different scripts."""
    # FIFO, not LIFO. These files are ordered by prominence (companies.json is rank 1 =
    # NVIDIA), and a stack reverses that, which silently fills the cap with microcaps.
    from collections import deque
    out: list[str] = []
    q = deque([obj])
    while q:
        cur = q.popleft()
        if isinstance(cur, dict):
            for k, v in cur.items():
                if k in keys and isinstance(v, str) and v.strip():
                    out.append(v.strip())
                elif isinstance(v, (dict, list)):
                    q.append(v)
        elif isinstance(cur, list):
            q.extend(x for x in cur if isinstance(x, (dict, list)))
    return out


def place_names() -> set[str]:
    """Single-word place names, so a band called Texas and a college team called Iowa
    cannot tag every story about the state. Places are what `entities` is for."""
    names: set[str] = set()
    for rel, keys in (("metros.json", ("name", "metro")), ("countries.json", ("name", "country"))):
        d = load(rel)
        if d is None:
            continue
        for n in walk_names(d, keys):
            # Multi-word places count too: a 1947 film called "New Orleans" must not tag
            # every story about the city. An exact alias match only, so "Manchester United"
            # survives while "Manchester" as a standalone alias does not.
            names.add(norm(n).lower())
    names |= {
        "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "delaware",
        "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas",
        "kentucky", "louisiana", "maine", "maryland", "michigan", "minnesota",
        "mississippi", "missouri", "montana", "nebraska", "nevada", "ohio", "oklahoma",
        "oregon", "pennsylvania", "tennessee", "texas", "utah", "vermont", "virginia",
        "washington", "wisconsin", "wyoming", "connecticut", "massachusetts",
    }
    return names


def load(rel: str):
    p = DATA / rel
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception as e:  # a malformed source should not kill the whole run
        print(f"  WARN {rel}: {e}", file=sys.stderr)
        return None


NAME_KEYS = ("name", "company", "companyName", "title", "artist", "team",
             "teamName", "label", "displayName", "shortName")


def build_vocab() -> dict[str, dict]:
    """alias_lower -> {type, id, label, strict}. strict=True means the alias is short or
    ordinary enough that it only counts on a case-sensitive, word-boundary match."""
    sources = [
        ("company", ["business/companies.json", "business/sp500.json", "business/unicorns.json"]),
        ("person",  ["leaders/_current.json", "mayors.json"]),
        ("market",  ["business/markets.json", "business/fx.json"]),
        ("league",  ["sports/league-summary.json"]),
        ("club",    ["sports/all-teams.json"]),
        ("artist",  ["sound/artists.json"]),
        ("work",    ["screen/screen_canon.json"]),
    ]
    vocab: dict[str, dict] = {}
    counts: Counter = Counter()
    places = place_names()

    for vtype, files in sources:
        seen: set[str] = set()
        for rel in files:
            data = load(rel)
            if data is None:
                continue
            for raw in walk_names(data, NAME_KEYS):
                if counts[vtype] >= CAPS.get(vtype, 1000):
                    break
                # Some sources prefix a status glyph ("⚠️ Javier Milei"). Strip anything
                # before the first letter or digit.
                label = re.sub(r"^[^\w(]+", "", raw.strip()).strip()
                low = norm(label).lower()
                if len(low) < 3 or low in STOP_NAMES or low in seen:
                    continue
                if low in places:
                    continue  # a place is entities' job, not a topic's
                if not re.search(r"[a-z]", low):
                    continue
                single = " " not in low and "-" not in low
                # Single-word film titles, band names and college teams are overwhelmingly
                # ordinary nouns: "Network", "Dollar", "Leopold", "Citadel" all tagged
                # wrongly on the first pass. Below 8 characters they are dropped outright.
                if single and len(low) < 8 and vtype in ("work", "artist", "club"):
                    continue
                seen.add(low)
                # "strict" = only counts on a case-sensitive, word-boundary match.
                strict = single and (len(low) < 7 or vtype in ("work", "artist", "club"))
                vocab[low] = {"type": vtype, "id": slugify(label), "label": label,
                              "strict": strict, "orig": label}
                counts[vtype] += 1
    return vocab


# --------------------------------------------------------------------- matching

# 🔴 462 of the 1,843 archived stories (a quarter) carry a `why` that describes the day's
# SECTION rather than the story: "Further reading from the day's section on AI's capital
# boom and its growing guilt." Matching against that text hands a story its NEIGHBOURS'
# topics. Measured 2026-09-13: it is how a Pochettino story sat under an AI tag and how
# theme:surveillance fired on an Appalachian memoir author. For those rows the headline
# is the only text that describes the story, so it is the only text we match.
SECTION_BOILERPLATE = re.compile(r"^\s*further reading from the day", re.I)


def story_text(headline: str, why: str | None) -> str:
    w = (why or "").strip()
    return headline if SECTION_BOILERPLATE.match(w) else f"{headline} {w}".strip()


def find_topics(text: str, vocab: dict[str, dict], limit: int = 8) -> list[dict]:
    hay_low = norm(text).lower()
    hits: dict[str, dict] = {}

    for alias, meta in vocab.items():
        if alias not in hay_low:
            continue
        # word boundary check
        if not re.search(rf"(?<![a-z0-9]){re.escape(alias)}(?![a-z0-9])", hay_low):
            continue
        if meta["strict"]:
            # short/ordinary alias: require the source's own capitalisation to appear
            if not re.search(rf"(?<![A-Za-z0-9]){re.escape(meta['orig'])}(?![A-Za-z0-9])", text):
                continue
        key = f"{meta['type']}:{meta['id']}"
        if key not in hits:
            hits[key] = {"type": meta["type"], "id": meta["id"], "label": meta["label"]}

    for theme_id, needles in THEMES:
        padded = f" {hay_low} "
        if any(re.search(n[3:], padded) if n.startswith("re:") else n in padded
               for n in needles):
            hits[f"theme:{theme_id}"] = {"type": "theme", "id": theme_id,
                                         "label": theme_id.replace("-", " ")}

    # longest label first: prefer "Manchester United" over "Manchester"
    out = sorted(hits.values(), key=lambda h: -len(h["label"]))
    return out[:limit]


# --------------------------------------------------------------------- supabase

def key() -> str:
    for cand in [ROOT / "scripts" / "mktcap" / "supabase_key.txt"]:
        if cand.exists():
            return cand.read_text(encoding="utf-8").strip()
    for var in ("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"):
        k = os.environ.get(var, "").strip()
        if k:
            return k
    # The mini keeps the service key in ~/.config/metro-supabase/env (as push_feed.py reads it);
    # scripts/mktcap/supabase_key.txt does not exist there (checked 2026-09-13).
    mini = Path.home() / ".config" / "metro-supabase" / "env"
    if mini.exists():
        for line in mini.read_text(encoding="utf-8").splitlines():
            m = re.match(r"\s*(?:export\s+)?SUPABASE_SERVICE(?:_ROLE)?_KEY=(.*)$", line)
            if m and m.group(1).strip():
                return m.group(1).strip().strip('"').strip("'")
    # Windows box keeps it in .env.local (gitignored); the mini uses the key file above.
    env = ROOT / ".env.local"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.startswith(("SUPABASE_SERVICE_ROLE_KEY=", "SUPABASE_SERVICE_KEY=")):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("No Supabase key: expected scripts/mktcap/supabase_key.txt, "
             "SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_KEY, or .env.local")


def req(method: str, path: str, body=None, prefer=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/{path}", data=data, method=method)
    k = key()
    r.add_header("apikey", k)
    r.add_header("Authorization", f"Bearer {k}")
    r.add_header("Content-Type", "application/json")
    if prefer:
        r.add_header("Prefer", prefer)
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw.strip() else None
    except urllib.error.HTTPError as e:
        sys.exit(f"Supabase {method} {path} -> {e.code}\n{e.read().decode()[:500]}")


def fetch_stories(table: str, dates: list[str] | None = None) -> list[dict]:
    # select=* because the whole-table write path is a bulk upsert, which must send whole rows.
    # A --date run only PATCHes topics, so it reads just what matching needs.
    select = "select=*"
    if dates:
        select = f"select=id,headline,why,topics&digest_date=in.({','.join(dates)})"
    rows, offset = [], 0
    while True:
        page = req("GET", f"{table}?{select}&order=id&limit=1000&offset={offset}")
        if not page:
            break
        rows.extend(page)
        if len(page) < 1000:
            break
        offset += 1000
    return rows


# -------------------------------------------------------------------- self-test

def self_test() -> None:
    v = {
        "nvidia": {"type": "company", "id": "nvidia", "label": "Nvidia", "strict": False, "orig": "Nvidia"},
        "gap":    {"type": "company", "id": "gap", "label": "Gap", "strict": True, "orig": "Gap"},
        "arsenal": {"type": "club", "id": "arsenal", "label": "Arsenal", "strict": False, "orig": "Arsenal"},
    }
    cases = [
        ("Nvidia to help boost value of old chips", "nvidia", True),
        ("nvidia lowercase in prose", "nvidia", True),          # 6 chars, not strict
        ("There is a gap in the market", "gap", False),          # strict, lowercase -> no
        ("Gap reports weak sales", "gap", True),                 # strict, capitalised -> yes
        ("Arsenalist is not Arsenal-free", "arsenal", True),     # boundary: matches the real one
        ("Gapless playback", "gap", False),                      # boundary
    ]
    bad = 0
    for text, want_id, should in cases:
        got = {h["id"] for h in find_topics(text, v)}
        if (want_id in got) != should:
            print(f"  FAIL {text!r}: {want_id} in {got} != {should}")
            bad += 1
    themed = {h["id"] for h in find_topics("A court declined to force a breakup of Google's ad exchange", v)}
    for expect in ("antitrust", "advertising"):
        if expect not in themed:
            print(f"  FAIL theme {expect} not in {themed}")
            bad += 1

    # Regex needles. The "ai" cases are the reason the mechanism exists: a plain " ai "
    # needle missed the three shapes the word actually takes in a headline, and a bare
    # "ai" substring would have fired on half the English language.
    theme_cases = [
        ("AI-written op-eds are here. Now what?", "ai", True),
        ("Google's AI capex hits $205 billion", "ai", True),
        ("Inside AI's growing guilt", "ai", True),
        ("She said the chair was from Dubai", "ai", False),
        ("Email aid for Thailand", "ai", False),
        ("Zuffa signs 100 fighters in a boxing push", "combat-sports", True),
        ("United won two-nil at the weekend", "college-sports", False),
        ("How the Clemente case could reshape athlete NIL law", "college-sports", True),
        ("Vandals are destroying license-plate cameras", "surveillance", True),
        ("Vandals are destroying license-plate cameras", "public-health", False),
        ("Inside the art market's stellar first half", "art-market", True),
        ("I flew around the world to keep my airline status", "aviation", True),
        ("Gravis Robotics retrofits excavators with autonomy", "robotics", True),
        ("An arbitrator ordered the Post to reinstate its columnist", "labour", True),
        ("An arbitrator ordered the Post to reinstate its columnist", "press-freedom", True),
        ("SoftBank led the seed round", "venture-capital", True),
        # Traps this corpus actually contains: a sports newsletter is full of strikers,
        # strikeouts, Rugby Union, gridiron and Ballmer.
        ("The striker scored twice", "labour", False),
        ("Ohtani recorded ten strikeouts", "labour", False),
        ("The writers' strike enters week six", "labour", True),
        ("U.S. strikes Iran in response to a missile launch", "labour", False),
        ("Trump calls off Iran strikes", "labour", False),
        ("Crew go on strike at the studio", "labour", True),
        ("Rugby Union confirms the calendar", "labour", False),
        ("The European Union opened a case", "labour", False),
        ("Autoworkers vote to join the union", "labour", True),
        ("Steve Ballmer betrayed his fellow billionaires", "ai", False),
        ("A gridiron weekend in Texas", "energy", False),
        ("The grid cannot take another winter", "energy", True),
        ("Upfront costs are rising for buyers", "advertising", False),
    ]
    # Section boilerplate must not lend a story its neighbours' topics.
    boiler = "Further reading from the day's section on AI's capital boom."
    if story_text("Pochettino on the USMNT", boiler) != "Pochettino on the USMNT":
        print("  FAIL story_text kept section boilerplate")
        bad += 1
    if story_text("H", "Nvidia beat estimates") != "H Nvidia beat estimates":
        print("  FAIL story_text dropped a real why")
        bad += 1
    if any(h["id"] == "ai" for h in find_topics(story_text("Pochettino on the USMNT", boiler), v)):
        print("  FAIL boilerplate still tagging ai")
        bad += 1

    for text, theme_id, should in theme_cases:
        got = {h["id"] for h in find_topics(text, v)}
        if (theme_id in got) != should:
            print(f"  FAIL theme {text!r}: {theme_id} in {sorted(got)} != {should}")
            bad += 1
    print("self-test:", "OK" if bad == 0 else f"{bad} FAILURE(S)")
    sys.exit(1 if bad else 0)


# ------------------------------------------------------------------------- main

def main() -> None:
    args = sys.argv[1:]
    if "--self-test" in args:
        self_test()

    print("Building vocabulary from public/data ...")
    vocab = build_vocab()
    by_type = Counter(m["type"] for m in vocab.values())
    print(f"  {len(vocab)} aliases: " + ", ".join(f"{k} {v}" for k, v in sorted(by_type.items())))
    print(f"  themes: {len(THEMES)}")

    if "--probe" in args:
        for t in sorted(by_type):
            sample = [m["label"] for m in list(vocab.values()) if m["type"] == t][:8]
            print(f"  {t}: {sample}")
        return

    write = "--write" in args
    dates = [args[i + 1] for i, a in enumerate(args) if a == "--date" and i + 1 < len(args)]
    if any(not re.match(r"^\d{4}-\d{2}-\d{2}$", d) for d in dates):
        sys.exit(f"--date takes YYYY-MM-DD, got {dates}")
    tables = ("digest_item",) if dates else ("digest_item", "digest_item_textonly")
    if dates:
        print(f"  limited to digest_item on {', '.join(dates)}")
    for table in tables:
        rows = fetch_stories(table, dates)
        if not rows:
            print(f"{table}: no rows")
            continue

        updates, tagged, tag_counts = [], 0, Counter()
        for r in rows:
            text = story_text(r["headline"], r.get("why"))
            topics = find_topics(text, vocab)
            # Carry forward any tag another pass sourced and this one cannot reproduce.
            # topics_llm.py writes company tags stamped src="llm", each one verified to
            # appear verbatim in the story; recomputing from the dictionary alone would
            # delete them without anyone noticing. Dictionary tags carry no src, so they
            # are never duplicated here.
            for prev in (r.get("topics") or []):
                if prev.get("src") and not any(
                    t["type"] == prev.get("type") and t["id"] == prev.get("id")
                    for t in topics
                ):
                    topics.append(prev)
            if topics:
                tagged += 1
                for t in topics:
                    tag_counts[f"{t['type']}:{t['id']}"] += 1
            updates.append({"id": r["id"], "topics": topics})

        pct = 100.0 * tagged / len(rows)
        print(f"\n{table}: {len(rows)} rows, {tagged} tagged ({pct:.1f}%), "
              f"{sum(tag_counts.values())} tags, {len(tag_counts)} distinct")
        print("  top 15:", ", ".join(f"{k}({n})" for k, n in tag_counts.most_common(15)))

        if "--sql" in args:
            # One UPDATE ... FROM (VALUES ...) instead of 1,493 PATCH round trips.
            out = ROOT / f"_topics_{table}.sql"
            rows_sql = ",\n".join(
                "('{}'::uuid, '{}'::jsonb)".format(
                    u["id"], json.dumps(u["topics"]).replace("'", "''"))
                for u in updates)
            out.write_text(
                f"update public.{table} d set topics = v.t\n"
                f"from (values\n{rows_sql}\n) as v(id, t)\nwhere d.id = v.id;\n",
                encoding="utf-8")
            print(f"  wrote SQL for {len(updates)} rows -> {out}")
            continue

        if not write:
            print("  (dry run, nothing written)")
            continue

        # --patch does the same per-row write over the WHOLE table. Slower than the bulk
        # upsert below, and the right choice for a full re-tag after the needle list
        # changes, because a PATCH of `topics` cannot re-insert a row the morning push
        # has deleted. Use it whenever a run might overlap a push.
        if dates or "--patch" in args:
            by_id = {r["id"]: r for r in rows}
            changed = [u for u in updates if (by_id[u["id"]].get("topics") or []) != u["topics"]]
            for n, u in enumerate(changed, start=1):
                req("PATCH", f"{table}?id=eq.{u['id']}", {"topics": u["topics"]}, prefer="return=minimal")
                if n % 100 == 0:
                    print(f"    patched {n}/{len(changed)}")
            print(f"  patched topics on {len(changed)} of {len(updates)} rows ({len(updates) - len(changed)} unchanged)")
            continue

        # Bulk upsert on the primary key: whole rows back, topics replaced. Three requests
        # instead of 1,493, which at ~0.4s each was over ten minutes.
        by_id = {r["id"]: r for r in rows}
        for i in range(0, len(updates), 500):
            payload = []
            for u in updates[i:i + 500]:
                row = dict(by_id[u["id"]])
                row["topics"] = u["topics"]
                payload.append(row)
            req("POST", table, payload,
                prefer="resolution=merge-duplicates,return=minimal")
            print(f"  wrote {min(i + 500, len(updates))}/{len(updates)}")


if __name__ == "__main__":
    main()
