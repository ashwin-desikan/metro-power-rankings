#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Promote newly crowned cricket champions into public.champions.

WHY THIS EXISTS. Cricket had no producer at all. `is_current` reached the
Champions board only through the Windows workbook ritual, and even that could
not add a competition that was not already on the board, because
merge-champions-sources.py sets "Is Current" only for a competition already
present in champions.json and champions.json is built FROM "Is Current". So the
County Championship and nine other competitions sat in the all-time ledger and
the Time Machine with a champion, and never appeared under Current. Ashwin
found it on 2026-09-19 and the nine were promoted by hand that day; this is the
thing that stops it happening again. ALWAYS_CURRENT in build-champions-data.py
is the matching fix on the workbook side.

WHAT IT DOES, per competition in REGISTRY:
  1. Reads the season article's infobox on Wikipedia (`champions` and `todate`).
     An unfinished season has no `champions` field, which is the natural "no
     champion yet" signal, so the job is a quiet no-op for most of the year.
  2. Skips if the ledger already carries that competition and season.
  3. Appends the champion with source='cricket-finalizer' and is_current=True,
     and clears the previous holder's flag. sync_history.push() only deletes
     source='champions-history.json', so these rows survive workbook re-pushes,
     and build_champions.py carries the source in its base stream so the
     champion reaches /sports/champions, the Time Machine and the metro pages.

WHY THE SEASON ARTICLE AND NOT THE COMPETITION ARTICLE. The competition
article's infobox does carry `champions`, but it gives no season and no date,
and it cannot distinguish a side retaining its title from the page simply not
having been edited. The season article carries all three. Measured 2026-09-19
across all eleven competitions, the parse reproduced the ledger EXACTLY, dates
included: IPL 2026 RCB 31 May, BBL 2025/26 Perth Scorchers 25 Jan, CPL 2025
Trinbago 21 Sep, T20 Blast 2026 Northamptonshire 18 Jul, County 2025
Nottinghamshire 27 Sep, PSL 2026 Peshawar Zalmi 3 May, SA20 2025/26 Sunrisers
Eastern Cape 25 Jan, BPL 2025/26 Rajshahi Warriors 23 Jan, ILT20 2025/26 Desert
Vipers 4 Jan, Super Smash 2025/26 Northern Brave 31 Jan, The Hundred 2026
Manchester Super Giants 16 Aug. Eleven independent confirmations of rows that
got there by a completely different route is the reason to trust it.

🔴 THE MEN'S AND WOMEN'S COMPETITIONS SHARE AN ARTICLE, AND THE LEDGER TRACKS
THE MEN'S. The Hundred's season infobox reads "'''W''': Trent Rockets ...
'''M''': Manchester Super Giants", and Super Smash splits into two articles
entirely. Taking the first name on the page would silently record the women's
champion as the men's. This is not hypothetical: the honours strand in Supabase
has The Hundred 2025 as "MI London" while the workbook has Oval Invincibles,
and the 2025 season article settles it ("'''M''': Oval Invincibles (3rd
title)"), so the honours row is the wrong one. GENDER_MARKER below is what
keeps that straight, and a competition whose article gains a split later will
need one adding.

NOTHING IS EVER GUESSED, which is the same rule footy_finalize.py follows:
  * a champion whose club has never won this competition before cannot have its
    metro resolved from history, so the row is REFUSED and reported rather than
    landing with a missing or invented metro;
  * a season article with a champion but no parseable date is REFUSED, because
    date_awarded is the reign's start date in the Time Machine and a plausible
    guess there is worse than a gap;
  * the previous champion row is the template for sport/competition/tier/scope,
    so a competition with no history at all is refused outright.
Anything refused is printed under NEEDS ATTENTION and the runner alerts on it.

Usage:
    python scripts/ingest/cricket_finalize.py --self-test
    python scripts/ingest/cricket_finalize.py              # dry run, all comps
    python scripts/ingest/cricket_finalize.py --write
    python scripts/ingest/cricket_finalize.py --only cpl --write

Env: SUPABASE_WRITE_KEY (or SUPABASE_SERVICE_KEY) required for --write; reads
are anon. Wikipedia egress required.
"""
import argparse
import datetime as dt
import json
import os
import re
import sys
import unicodedata
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))

SB_URL = (os.environ.get("SUPABASE_URL") or "https://nmprqkmymrdknffwnuur.supabase.co").rstrip("/")
ANON = ("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tcHJxa215bXJka25mZndudXVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyMDkzNDMsImV4cCI6MjA5ODc4NTM0M30."
        "4RXU3mQ-Yl81ZqC2_a10aizKGu_87B4vt8OK5Pi_-sM")
WRITE_KEY = (os.environ.get("SUPABASE_WRITE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY") or "").strip()

SOURCE = "cricket-finalizer"
UA = {"User-Agent": "CitizenOfNowhere/1.0 (+https://rankings.citizenofnowhere.org)"}

# How far ahead of the ledger to look. Two is deliberate: one covers the normal
# case of the next season, and the second covers a season we missed entirely
# (the job was off, or a competition skipped a year) without the job scanning
# the whole history every night.
LOOKAHEAD = 2

# SEASON STYLES.
#   "calendar" -- the season is one year and the article is "2026 X".
#   "split"    -- the season straddles a new year and the article is
#                 "2025-26 X" with an EN DASH. `year` in the ledger is the END
#                 year, so 2026 means the 2025-26 season.
CALENDAR, SPLIT = "calendar", "split"

# page: a %s template taking the season label. gender: the marker to select
# inside a shared men's/women's infobox field, or None when the article is
# already single-sex (Super Smash has separate articles, so its PAGE carries
# the qualifier and no marker is needed).
REGISTRY = {
    "ipl":                      {"page": "%s Indian Premier League",            "style": CALENDAR, "gender": None},
    "cpl":                      {"page": "%s Caribbean Premier League",         "style": CALENDAR, "gender": None},
    # Added 2026-09-21. The LPL sat on the board with NO current holder for two months
    # after the 8 Aug 2026 final (the 2025 edition was postponed and never played), and
    # only the dormant check in check_overdue_titles.py said so. Calendar style: the
    # split-season labels ("2022/23") ended with the 2023 edition.
    "lanka-premier-league":     {"page": "%s Lanka Premier League",             "style": CALENDAR, "gender": None},
    "t20-blast":                {"page": "%s T20 Blast",                        "style": CALENDAR, "gender": None},
    "county-championship":      {"page": "%s County Championship",              "style": CALENDAR, "gender": None},
    "pakistan-super-league":    {"page": "%s Pakistan Super League",            "style": CALENDAR, "gender": None},
    "sa20":                     {"page": "%s SA20",                             "style": CALENDAR, "gender": None},
    "the-hundred":              {"page": "%s The Hundred season",               "style": CALENDAR, "gender": "M"},
    "big-bash-league":          {"page": "%s Big Bash League season",           "style": SPLIT,    "gender": None},
    "bpl":                      {"page": "%s Bangladesh Premier League",        "style": SPLIT,    "gender": None},
    "international-league-t20": {"page": "%s International League T20",         "style": SPLIT,    "gender": None},
    "super-smash":              {"page": "%s Super Smash (men's cricket)",      "style": SPLIT,    "gender": None},
}

# The two "nothing to see here" outcomes. They are the normal state for most
# competitions most of the year, so they must stay SILENT: a job that reports
# eleven non-problems every night trains you to ignore it.
NO_CHAMPION_YET = "no champion yet"
NO_SEASON_ARTICLE = "season article does not exist yet"
QUIET = {NO_CHAMPION_YET, NO_SEASON_ARTICLE}

MONTHS = {m.lower(): i for i, m in enumerate(
    ["January", "February", "March", "April", "May", "June", "July",
     "August", "September", "October", "November", "December"], 1)}


# ------------------------------------------------------------------ pure ----

def season_label_fixed(style, year):
    if style == CALENDAR:
        return str(year)
    return "%d–%02d" % (year - 1, year % 100)


def season_value(style, year):
    """What goes in champions.season, matching the rows already there:
       "2026" for a calendar season, "2025/26" for a split one."""
    return str(year) if style == CALENDAR else "%d/%02d" % (year - 1, year % 100)


def strip_wiki(s):
    """Unwrap the wikitext constructs that appear in an infobox value."""
    s = s or ""
    s = re.sub(r"<ref[^>]*?(/>|>.*?</ref>)", "", s, flags=re.S)
    for _ in range(5):
        s = re.sub(r"\{\{(?:center|small|nowrap|nobr|nobold|resize|flagicon)\|([^{}]*)\}\}", r"\1", s, flags=re.I)
        s = re.sub(r"\{\{[Ss]ort(?:name)?\|[^{}]*\|([^{}]*)\}\}", r"\1", s)
        s = re.sub(r"\{\{[^{}]*\}\}", "", s)
        s = re.sub(r"\[\[[^\[\]|]*\|([^\[\]]*)\]\]", r"\1", s)   # [[A|B]] -> B
        s = re.sub(r"\[\[([^\[\]]*)\]\]", r"\1", s)              # [[A]]   -> A
    s = re.sub(r"<[^>]+>", " ", s)
    s = s.replace("'''", "").replace("''", "")
    return re.sub(r"\s+", " ", s).strip()


def infobox_fields(text):
    """Fields of the article's Infobox template.

    Scans from `{{Infobox` and tracks brace depth, rather than taking the first
    template on the page: these articles open with hatnotes such as
    {{Use dmy dates}}, and a naive first-template scan returns those instead
    (measured, it returned nothing usable for all five pages tried).
    """
    m = re.search(r"\{\{\s*Infobox", text, re.I)
    if not m:
        return {}
    i = m.start()
    depth, j, end = 0, m.start(), len(text)
    while j < len(text) - 1:
        if text[j:j + 2] == "{{":
            depth += 1; j += 2; continue
        if text[j:j + 2] == "}}":
            depth -= 1; j += 2
            if depth == 0:
                end = j; break
            continue
        j += 1
    # END-2, NOT END. The scan stops AFTER the closing "}}", and including
    # those two characters appends them to the LAST field's value, because the
    # field regex runs to the end of the block. Caught by the self-test's
    # unfinished-season fixture, where `champions` is last and came back as
    # "}}" instead of empty, which read as a champion literally named "}}"
    # rather than as a season still being played. Any article whose champions
    # field is last would have hit this.
    block = text[i:max(i, end - 2)]
    name = re.match(r"\{\{\s*([^\n|}]*)", block)
    out = {"__template__": (name.group(1).strip() if name else "")}
    for mm in re.finditer(r"^\s*\|\s*([A-Za-z_0-9 ]+?)\s*=\s*(.*?)\s*(?=^\s*\||\Z)",
                          block, re.M | re.S):
        out[mm.group(1).strip().lower()] = mm.group(2).strip()
    return out


def pick_gendered(value, marker):
    """Select one side of a shared men's/women's field.

    The field reads "'''W''': Trent Rockets (1st title) <br />'''M''':
    Manchester Super Giants (1st title)". Returns None when the marker is
    absent, which must REFUSE rather than fall back to the whole string: a
    fallback here records the women's champion as the men's.
    """
    if not marker:
        return value
    parts = re.split(r"<\s*br\s*/?\s*>", value, flags=re.I)
    for p in parts:
        if re.match(r"\s*'''\s*%s\s*'''\s*:" % re.escape(marker), p):
            return re.sub(r"^\s*'''\s*%s\s*'''\s*:" % re.escape(marker), "", p)
    return None


def clean_team(s):
    s = strip_wiki(s)
    s = re.sub(r"\(\s*\d+(st|nd|rd|th)\s+title[s]?\s*\)", "", s, flags=re.I)
    s = re.sub(r"\(\s*shared\s*\)", "", s, flags=re.I)
    s = re.sub(r"[{}\[\]|]", " ", s)
    return re.sub(r"\s+", " ", s).strip(" ,;:-\u2013")


def parse_date(s, fallback_year):
    """'18 July 2026' -> '2026-07-18'. A value with no year takes the season's
       end year, which is the only year the article can mean. Returns None when
       there is no day and month to read, and the caller refuses the row."""
    s = strip_wiki(s)
    m = re.search(r"\b(\d{1,2})\s+([A-Za-z]+)\s*(\d{4})?", s)
    if not m:
        return None
    day, mon, yr = int(m.group(1)), MONTHS.get(m.group(2).lower()), m.group(3)
    if not mon or not (1 <= day <= 31):
        return None
    year = int(yr) if yr else fallback_year
    try:
        return dt.date(year, mon, day).isoformat()
    except ValueError:
        return None


def norm(s):
    """Loose team-name key: accents, case, punctuation and the words that come
       and go between a club's formal and playing names."""
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()
    s = s.lower()
    s = re.sub(r"\b(county )?cricket club\b", " ", s)
    s = re.sub(r"[^a-z0-9]+", "", s)
    return s


def read_season(fields, gender, end_year):
    """(champion, date) from an infobox, or (None, why)."""
    # 🔴 A YEAR WITH NO SEASON ARTICLE REDIRECTS TO THE COMPETITION ARTICLE,
    # whose infobox also has a `champions` field holding the REIGNING champion.
    # Reading that would re-crown the current holder for a season that has not
    # been played. The two are told apart by the template: every one of the
    # eleven real season articles uses "Infobox cricket tournament", and the
    # competition article uses "Infobox cricket tournament main" (measured
    # 2026-09-19 across all of them). Today the competition infobox also has no
    # todate, so the date check would have caught it, but that is an accident
    # of their markup and not something to rely on.
    if fields.get("__template__", "").lower().endswith("main"):
        return None, NO_SEASON_ARTICLE
    champ_raw = fields.get("champions") or fields.get("champion") or fields.get("winners")
    if not champ_raw:
        return None, NO_CHAMPION_YET
    side = pick_gendered(champ_raw, gender)
    if side is None:
        return None, "gender marker %r not found in champions field" % gender
    team = clean_team(side)
    if not team:
        return None, "champions field present but unreadable"
    date = parse_date(fields.get("todate") or fields.get("dates") or "", end_year)
    if not date:
        return None, "champion %s but no parseable final date" % team
    return (team, date), None


# ------------------------------------------------------------------ http ----

def wiki_raw(page, depth=0):
    url = "https://en.wikipedia.org/wiki/%s?action=raw" % urllib.parse.quote(page.replace(" ", "_"))
    req = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            text = r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise
    m = re.match(r"\s*#REDIRECT\s*\[\[([^\]]+)\]\]", text, re.I)
    if m and depth < 3:
        return wiki_raw(m.group(1), depth + 1)
    return text


def _headers(write=False):
    """Reads use the service key too, when there is one.

    footy_finalize.py reads as anon, and that no longer works: measured
    2026-09-19, the project's legacy anon key AND its publishable key both
    return 401 on the champions table, so anon is not a working fallback here.
    ANON stays as a last resort rather than being deleted, because it costs
    nothing and a project setting can be changed back.
    """
    key = WRITE_KEY or ANON
    h = {"apikey": key, "Content-Type": "application/json"}
    # Only a JWT goes in Authorization; an sb_secret_/sb_publishable_ key is an
    # apikey and sending it as a Bearer token is rejected.
    if key.count(".") == 2:
        h["Authorization"] = "Bearer %s" % key
    return h


def _req(method, path, params=None, body=None, write=False, prefer=None):
    url = "%s/rest/v1/%s" % (SB_URL, path)
    if params:
        url += "?" + urllib.parse.urlencode(params)
    h = _headers(write)
    if prefer:
        h["Prefer"] = prefer
    req = urllib.request.Request(url, method=method, headers=h,
                                 data=json.dumps(body).encode() if body is not None else None)
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read()
        return json.loads(raw) if raw else None


# ----------------------------------------------------------------- stages ---

TEMPLATE_COLS = ("id,sport,competition,comp_slug,era_name,country,scope,scope_type,"
                 "tier,tier_guide,season_basis,season_numeric,source_ordinal,is_current,"
                 "year,season,team_name,canonical_name,city,metro,metro_slug,metro_status,"
                 "is_club,entity_type,stewardship,placement")


def ledger_rows(comp_slug):
    return _req("GET", "champions", {
        "select": TEMPLATE_COLS, "comp_slug": "eq.%s" % comp_slug,
        "placement": "eq.champion", "order": "year.desc.nullslast,id.desc"}) or []


def resolve_club(rows, team):
    """Reuse the identity this club already has in THIS competition. Returns
       None for a first-time champion, which the caller refuses: a metro is
       curation and must not be invented."""
    key = norm(team)
    for r in rows:
        if key and key in (norm(r.get("team_name")), norm(r.get("canonical_name"))):
            return r
    return None


def build_row(template, club, spec, year, team, date):
    return {
        "sport": template["sport"], "competition": template["competition"],
        "comp_slug": template["comp_slug"], "era_name": template.get("era_name"),
        "country": template.get("country"), "scope": template.get("scope"),
        "scope_type": template.get("scope_type"), "tier": template.get("tier"),
        "tier_guide": template.get("tier_guide"),
        "season_basis": template.get("season_basis"),
        "season_numeric": template.get("season_numeric"),
        "season": season_value(spec["style"], year), "year": year,
        "placement": "champion",
        # The club's own recorded identity, not the Wikipedia spelling: the
        # article calls Northamptonshire "Northamptonshire Steelbacks" while
        # the ledger has team_name "Northants Steelbacks", and the team pages
        # and metro links are keyed on the ledger's spelling.
        "team_name": club["team_name"], "canonical_name": club.get("canonical_name"),
        "city": club.get("city"), "metro": club.get("metro"),
        "metro_slug": club.get("metro_slug"), "metro_status": club.get("metro_status"),
        "is_club": club.get("is_club"), "entity_type": club.get("entity_type"),
        "stewardship": club.get("stewardship"),
        "match_date": date, "date_awarded": date,
        # Left null on purpose. build_champions.py mints "a year on" at emit
        # time and MARKS IT ESTIMATED; writing a value here would present the
        # same guess as a published fact.
        "next_awarded_date": None,
        "is_current": True, "source": SOURCE,
        "source_ordinal": template.get("source_ordinal"),
    }


def run_one(comp_slug, spec, write, today):
    rows = ledger_rows(comp_slug)
    if not rows:
        return None, "%s: no champions history to template from; refusing to invent one" % comp_slug
    template = rows[0]
    have_seasons = {str(r.get("season") or "").strip() for r in rows}
    have_years = {r.get("year") for r in rows if r.get("year") is not None}
    base = max(have_years) if have_years else today.year

    for year in range(base, base + LOOKAHEAD + 1):
        if year in have_years or season_value(spec["style"], year) in have_seasons:
            continue
        page = spec["page"] % season_label_fixed(spec["style"], year)
        text = wiki_raw(page)
        if text is None:
            continue                      # season article not created yet
        got, why = read_season(infobox_fields(text), spec["gender"], year)
        if not got:
            if why in QUIET:
                continue                  # the ordinary case, most of the year
            return None, "%s %s: %s (%s)" % (comp_slug, year, why, page)
        team, date = got
        if date > today.isoformat():
            return None, "%s %s: article dates the final %s, in the future; not trusting it" % (
                comp_slug, year, date)
        club = resolve_club(rows, team)
        if not club:
            return None, ("%s %s: %r has never won this competition, so its metro cannot be "
                          "resolved from history. Add the club by hand, then this runs clean."
                          % (comp_slug, year, team))
        row = build_row(template, club, spec, year, team, date)
        print("  NEW: %s %s -> %s (%s), won %s" % (
            row["competition"], row["season"], row["team_name"], row["metro"], date))
        if write:
            _req("POST", "champions", None, [row], write=True, prefer="return=minimal")
            for r in rows:
                if r.get("is_current"):
                    _req("PATCH", "champions", {"id": "eq.%d" % r["id"]},
                         {"is_current": False}, write=True, prefer="return=minimal")
            print("    written; previous holder's is_current cleared")
        return row, None
    return None, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--only", help="one comp_slug from REGISTRY")
    args = ap.parse_args()

    if args.self_test:
        return self_test()
    if args.write and not WRITE_KEY:
        sys.exit("SUPABASE_WRITE_KEY not set; refusing --write.")

    today = dt.date.today()
    todo = {args.only: REGISTRY[args.only]} if args.only else REGISTRY
    if args.only and args.only not in REGISTRY:
        sys.exit("unknown comp_slug %r" % args.only)

    written, problems = [], []
    for slug, spec in todo.items():
        try:
            row, why = run_one(slug, spec, args.write, today)
        except Exception as e:                       # one bad page must not stop the rest
            problems.append("%s: %s: %s" % (slug, type(e).__name__, e))
            continue
        if row:
            written.append(row)
        if why:
            problems.append(why)

    print("\n%d new champion(s)%s; %d needing attention" % (
        len(written), "" if args.write else " (DRY RUN, nothing written)", len(problems)))
    if problems:
        print("NEEDS ATTENTION")
        for p in problems:
            print("  - %s" % p)
    if written and args.write:
        print("\nNOTE: run scripts/champions/build_champions.py to re-emit the JSON.")
    return 0


# -------------------------------------------------------------- self-test ---

HUNDRED_2025 = """
{{Use dmy dates|date=August 2025}}
{{Infobox cricket tournament
| name = 2025 The Hundred
| fromdate = 5 August 2025
| todate = 31 August 2025
| champions = '''W''': [[Northern Superchargers]] (1st title)<br />'''M''': [[Oval Invincibles]] (3rd title)
| participants = 8
}}
Body text.
"""

BLAST_2026 = """
{{Short description|Cricket season}}
{{Infobox cricket tournament
| name = 2026 T20 Blast
| fromdate = 22 May
| todate = 18 July 2026
| champions = [[Northamptonshire County Cricket Club|Northamptonshire Steelbacks]]
| count = 3
}}
"""

# What "2027 County Championship" actually serves: a redirect to the
# competition article, whose champions field is the REIGNING champion. The
# season has not been played. Nothing here may be read as a 2027 champion.
COMPETITION_PAGE = """
{{Infobox cricket tournament main
| name = County Championship
| last = [[2026 County Championship|2026]]
| champions = [[Nottinghamshire County Cricket Club|Nottinghamshire]]  (7 titles)
| most successful = [[Yorkshire County Cricket Club|Yorkshire]] (33 titles including 1 shared)
}}
"""

UNFINISHED = """
{{Infobox cricket tournament
| name = 2027 Caribbean Premier League
| fromdate = 1 August 2027
| champions =
}}
"""


def self_test():
    n = [0]

    def check(name, cond):
        n[0] += 1
        if not cond:
            raise SystemExit("self-test FAILED: %s" % name)

    check("calendar label", season_label_fixed(CALENDAR, 2026) == "2026")
    check("split label uses en dash", season_label_fixed(SPLIT, 2026) == "2025–26")
    check("split label pads", season_label_fixed(SPLIT, 2005) == "2004–05")
    check("calendar season value", season_value(CALENDAR, 2026) == "2026")
    check("split season value", season_value(SPLIT, 2026) == "2025/26")

    f = infobox_fields(BLAST_2026)
    check("infobox skips hatnote", f.get("todate") == "18 July 2026")
    got, why = read_season(f, None, 2026)
    check("blast champion", got == ("Northamptonshire Steelbacks", "2026-07-18"))

    f = infobox_fields(HUNDRED_2025)
    got, why = read_season(f, "M", 2025)
    # The women's champion is FIRST in the field; taking it would be the bug
    # this marker exists to prevent.
    check("hundred takes the men's side", got == ("Oval Invincibles", "2025-08-31"))
    got_w, _ = read_season(f, "W", 2025)
    check("hundred women's side still readable", got_w[0] == "Northern Superchargers")
    got_x, why_x = read_season(f, "X", 2025)
    check("missing marker refuses", got_x is None and "not found" in why_x)

    got, why = read_season(infobox_fields(UNFINISHED), None, 2027)
    check("unfinished season is quiet", got is None and why == NO_CHAMPION_YET)

    f = infobox_fields(COMPETITION_PAGE)
    check("competition infobox is recognised", f["__template__"].lower().endswith("main"))
    got, why = read_season(f, None, 2027)
    check("competition page never yields a champion", got is None)
    check("competition page is quiet, not an alert", why == NO_SEASON_ARTICLE)
    check("both no-op reasons are quiet", QUIET == {NO_CHAMPION_YET, NO_SEASON_ARTICLE})

    check("date with no year takes the season", parse_date("4 January", 2026) == "2026-01-04")
    check("bad date refused", parse_date("TBD", 2026) is None)
    check("date strips refs", parse_date("18 July 2026<ref>x</ref>", 2026) == "2026-07-18")

    check("norm drops cricket club", norm("Northamptonshire County Cricket Club") == norm("Northamptonshire"))
    check("norm is accent blind", norm("Sunrisers Eastern Cape") == norm("sunrisers  eastern-cape"))

    rows = [{"team_name": "Northants Steelbacks", "canonical_name": "Northamptonshire Steelbacks"},
            {"team_name": "Somerset", "canonical_name": "Somerset"}]
    check("resolves via canonical", resolve_club(rows, "Northamptonshire Steelbacks")["team_name"] == "Northants Steelbacks")
    # A bare formal name is NOT forced to match a differently-named playing
    # side: "Northamptonshire" is not "Northamptonshire Steelbacks" and
    # pretending otherwise invites a false positive between two clubs from
    # one county. It does not need to match, because the article links
    # [[Northamptonshire County Cricket Club|Northamptonshire Steelbacks]]
    # and strip_wiki keeps the DISPLAY name, which is the row's canonical.
    # Where the playing name is the county name, the suffix strip does match.
    check("bare formal name does not force a match",
          resolve_club(rows, "Northamptonshire County Cricket Club") is None)
    check("suffix strip matches a plain county",
          resolve_club(rows, "Somerset County Cricket Club")["team_name"] == "Somerset")
    check("first-time champion unresolved", resolve_club(rows, "Durham") is None)

    check("every registry entry has a page and style",
          all(s.get("page") and s.get("style") in (CALENDAR, SPLIT) for s in REGISTRY.values()))
    check("registry pages take exactly one slot",
          all(s["page"].count("%s") == 1 for s in REGISTRY.values()))

    print("self-test OK (%d checks)" % n[0])
    return 0


if __name__ == "__main__":
    sys.exit(main())
