#!/usr/bin/env python3
"""
scripts/fans/build_fan_index.py -- Fan Attention Index builder.

Source: the Wikimedia Pageviews API (per-article, all-access, agent=user --
human traffic only, no bots/spiders), for the English Wikipedia article of
each team plus every other language edition on its Wikidata item's sitelinks
(via https://www.wikidata.org/wiki/Special:EntityData/{QID}.json). Nothing
here is a survey or a third-party popularity estimate; it is a direct read of
Wikipedia's own traffic logs.

Window: 12 full months, 2025-09-01 through 2026-08-31, monthly granularity.

User-Agent requirement: every Wikimedia/Wikidata call MUST carry a real,
identifying User-Agent (see UA below) per Wikimedia's API etiquette policy.
Requests without one, or with a generic one, are throttled harder and are
more likely to be blocked outright.

Network note: RUN THIS ON THE MAC MINI OR A RESIDENTIAL IP. Shared cloud IPs
(GitHub Actions runners, most CI/sandbox environments) get HTTP 429 from the
Wikimedia pageviews endpoint under sustained request volume; this script
retries with backoff (honoring Retry-After), but on a rate-limited IP that
just means it runs much slower, not that it fails cleanly. See CLAUDE.md's
notes on egress-sensitive jobs for the same pattern elsewhere in this repo.

Design: fully resumable via a JSON file cache under CACHE_DIR. Each run works
for up to --budget seconds (default 100), processing whatever cache-miss work
remains, in stage order: resolve -> en_pageviews -> sitelinks ->
lang_pageviews. Once all fetch stages are complete (mode=status and
mode=status_ext both show 0 remaining), run mode=aggregate_universe to build
the final CSVs (teams_fan_attention.csv, teams_monthly_long.csv,
teams_fan_vs_valuation.csv) and then public/data/fans/fan-attention.json for
the site (no network needed for that step; it also runs standalone as
mode=site_json, or via scripts/fans/csv_to_json.py directly against existing
CSVs).

Run modes:
  python3 build_fan_index.py fetch --budget 100        # original 152-team fetch
  python3 build_fan_index.py status                    # remaining work, original 152
  python3 build_fan_index.py aggregate                  # build original CSVs (no join)
  python3 build_fan_index.py fetch_ext --budget 100     # fetch the 72 extension teams
  python3 build_fan_index.py status_ext                 # remaining work, extension teams
  python3 build_fan_index.py check_universe              # sanity-check the valuations join
  python3 build_fan_index.py aggregate_universe           # full 224-team CSVs + site JSON
  python3 build_fan_index.py site_json                    # rebuild only the site JSON
"""
import csv
import json
import os
import re
import statistics
import sys
import time
import unicodedata
import urllib.parse
from collections import defaultdict

import math
import numpy as np
import requests
from bs4 import BeautifulSoup

CACHE_DIR = os.path.expanduser("~/fan_cache")
OUT_DIR = os.environ.get("FAN_INDEX_OUT", os.path.expanduser("~/mnt/Job Search/fan_index"))
UA = "CitizenOfNowhere-FanIndex/0.1 (ashwind@gmail.com)"
HEADERS = {"User-Agent": UA}
START, END = "20250901", "20260831"
RATE_LIMIT_PER_SEC = 15.0
MIN_INTERVAL = 1.0 / RATE_LIMIT_PER_SEC

for d in ["resolve", "en", "sitelinks", "lang"]:
    os.makedirs(os.path.join(CACHE_DIR, d), exist_ok=True)
os.makedirs(OUT_DIR, exist_ok=True)

import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

SESSION = requests.Session()
SESSION.headers.update(HEADERS)
_adapter = requests.adapters.HTTPAdapter(pool_connections=32, pool_maxsize=32)
SESSION.mount("https://", _adapter)
_last_call = [0.0]
_rate_lock = threading.Lock()
_stats_lock = threading.Lock()
_stats = {"requests": 0, "429s": 0}


def throttled_get(url, **kw):
    for attempt in range(3):
        with _rate_lock:
            now = time.time()
            wait = MIN_INTERVAL - (now - _last_call[0])
            if wait > 0:
                time.sleep(wait)
            _last_call[0] = time.time()
        r = SESSION.get(url, timeout=25, **kw)
        with _stats_lock:
            _stats["requests"] += 1
            if r.status_code == 429:
                _stats["429s"] += 1
        if r.status_code == 429 and attempt < 2:
            retry_after = r.headers.get("retry-after")
            try:
                delay = float(retry_after) if retry_after else 3.0
            except ValueError:
                delay = 3.0
            time.sleep(min(delay, 15.0))
            continue
        return r
    return r


def slug(league, name):
    s = unicodedata.normalize("NFKD", f"{league}_{name}")
    s = re.sub(r"[^A-Za-z0-9]+", "_", s).strip("_")
    return s.lower()


# ---------------------------------------------------------------------------
# TEAM LIST (152)
# ---------------------------------------------------------------------------
NFL = [
    "Arizona Cardinals", "Atlanta Falcons", "Baltimore Ravens", "Buffalo Bills",
    "Carolina Panthers", "Chicago Bears", "Cincinnati Bengals", "Cleveland Browns",
    "Dallas Cowboys", "Denver Broncos", "Detroit Lions", "Green Bay Packers",
    "Houston Texans", "Indianapolis Colts", "Jacksonville Jaguars", "Kansas City Chiefs",
    "Las Vegas Raiders", "Los Angeles Chargers", "Los Angeles Rams", "Miami Dolphins",
    "Minnesota Vikings", "New England Patriots", "New Orleans Saints", "New York Giants",
    "New York Jets", "Philadelphia Eagles", "Pittsburgh Steelers", "San Francisco 49ers",
    "Seattle Seahawks", "Tampa Bay Buccaneers", "Tennessee Titans", "Washington Commanders",
]

NBA = [
    "Atlanta Hawks", "Boston Celtics", "Brooklyn Nets", "Charlotte Hornets",
    "Chicago Bulls", "Cleveland Cavaliers", "Dallas Mavericks", "Denver Nuggets",
    "Detroit Pistons", "Golden State Warriors", "Houston Rockets", "Indiana Pacers",
    "Los Angeles Clippers", "Los Angeles Lakers", "Memphis Grizzlies", "Miami Heat",
    "Milwaukee Bucks", "Minnesota Timberwolves", "New Orleans Pelicans", "New York Knicks",
    "Oklahoma City Thunder", "Orlando Magic", "Philadelphia 76ers", "Phoenix Suns",
    "Portland Trail Blazers", "Sacramento Kings", "San Antonio Spurs", "Toronto Raptors",
    "Utah Jazz", "Washington Wizards",
]

MLB = [
    "Arizona Diamondbacks", "Atlanta Braves", "Baltimore Orioles", "Boston Red Sox",
    "Chicago Cubs", "Chicago White Sox", "Cincinnati Reds", "Cleveland Guardians",
    "Colorado Rockies", "Detroit Tigers", "Houston Astros", "Kansas City Royals",
    "Los Angeles Angels", "Los Angeles Dodgers", "Miami Marlins", "Milwaukee Brewers",
    "Minnesota Twins", "New York Mets", "New York Yankees", "Athletics (baseball team)",
    "Philadelphia Phillies", "Pittsburgh Pirates", "San Diego Padres", "San Francisco Giants",
    "Seattle Mariners", "St. Louis Cardinals", "Tampa Bay Rays", "Texas Rangers (baseball)",
    "Toronto Blue Jays", "Washington Nationals",
]

NHL = [
    "Anaheim Ducks", "Boston Bruins", "Buffalo Sabres", "Calgary Flames",
    "Carolina Hurricanes", "Chicago Blackhawks", "Colorado Avalanche", "Columbus Blue Jackets",
    "Dallas Stars", "Detroit Red Wings", "Edmonton Oilers", "Florida Panthers",
    "Los Angeles Kings", "Minnesota Wild", "Montreal Canadiens", "Nashville Predators",
    "New Jersey Devils", "New York Islanders", "New York Rangers", "Ottawa Senators",
    "Philadelphia Flyers", "Pittsburgh Penguins", "San Jose Sharks", "Seattle Kraken",
    "St. Louis Blues", "Tampa Bay Lightning", "Toronto Maple Leafs", "Utah Mammoth",
    "Vancouver Canucks", "Vegas Golden Knights", "Washington Capitals", "Winnipeg Jets",
]

EPL = [
    "Arsenal F.C.", "Aston Villa F.C.", "AFC Bournemouth", "Brentford F.C.",
    "Brighton & Hove Albion F.C.", "Burnley F.C.", "Chelsea F.C.", "Crystal Palace F.C.",
    "Everton F.C.", "Fulham F.C.", "Leeds United F.C.", "Liverpool F.C.",
    "Manchester City F.C.", "Manchester United F.C.", "Newcastle United F.C.",
    "Nottingham Forest F.C.", "Sunderland A.F.C.", "Tottenham Hotspur F.C.",
    "West Ham United F.C.", "Wolverhampton Wanderers F.C.",
]

EUROPE_OTHER = [
    "Real Madrid CF", "FC Barcelona", "FC Bayern Munich", "Paris Saint-Germain F.C.",
    "Juventus F.C.", "Bologna F.C. 1909", "Borussia Dortmund", "Inter Milan",
]

TEAMS = (
    [("NFL", t) for t in NFL]
    + [("NBA", t) for t in NBA]
    + [("MLB", t) for t in MLB]
    + [("NHL", t) for t in NHL]
    + [("EPL", t) for t in EPL]
    + [("Europe other", t) for t in EUROPE_OTHER]
)
assert len(TEAMS) == 152, len(TEAMS)

# ---------------------------------------------------------------------------
# Stage: resolve title -> (qid, canonical en title)
# ---------------------------------------------------------------------------

def wiki_api(params):
    params = dict(params)
    params["format"] = "json"
    url = "https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode(params)
    r = throttled_get(url)
    r.raise_for_status()
    return r.json()


def resolve_one(league, name):
    path = os.path.join(CACHE_DIR, "resolve", slug(league, name) + ".json")
    if os.path.exists(path):
        return json.load(open(path))
    result = {"league": league, "input_name": name, "resolved": False}
    for attempt in range(2):
        try:
            title_try = name if attempt == 0 else None
            if attempt == 1:
                # search fallback
                data = wiki_api({"action": "query", "list": "search", "srsearch": name, "srlimit": 1})
                hits = data.get("query", {}).get("search", [])
                if not hits:
                    continue
                title_try = hits[0]["title"]
            data = wiki_api({
                "action": "query", "titles": title_try, "redirects": 1,
                "prop": "pageprops", "ppprop": "wikibase_item|disambiguation",
            })
            pages = data.get("query", {}).get("pages", {})
            page = None
            for pid, p in pages.items():
                if pid != "-1" and "missing" not in p:
                    page = p
                    break
            if page is None:
                continue
            pageprops = page.get("pageprops", {})
            if "disambiguation" in pageprops:
                # landed on a disambiguation page (e.g. bare "Texas Rangers" ->
                # the law-enforcement/disambig article, not the ballclub) --
                # reject and fall through to the search-fallback attempt.
                continue
            qid = pageprops.get("wikibase_item")
            canonical_title = page.get("title")
            if not qid or not canonical_title:
                continue
            result = {
                "league": league, "input_name": name, "resolved": True,
                "qid": qid, "en_title": canonical_title,
            }
            break
        except requests.RequestException as e:
            result["error"] = str(e)
            continue
    if result.get("resolved"):
        json.dump(result, open(path, "w"))
    else:
        # do not permanently cache a failed resolution after only this run's 2 attempts;
        # still write it so pending_counts() doesn't loop forever within one run, but
        # aggregate will report it as a genuine resolve_failed (per stop-condition: record & move on)
        json.dump(result, open(path, "w"))
    return result


# ---------------------------------------------------------------------------
# Stage: pageviews fetch (shared for en + every language)
# ---------------------------------------------------------------------------

def fetch_pageviews_monthly(lang, title):
    enc_title = urllib.parse.quote(title.replace(" ", "_"), safe="")
    url = (
        f"https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/"
        f"{lang}.wikipedia/all-access/user/{enc_title}/monthly/{START}/{END}"
    )
    r = throttled_get(url)
    if r.status_code == 404:
        return {"monthly": {}, "total": 0, "status": "no_data"}
    r.raise_for_status()
    data = r.json()
    monthly = {}
    for item in data.get("items", []):
        ym = item["timestamp"][:6]
        monthly[ym] = monthly.get(ym, 0) + item["views"]
    return {"monthly": monthly, "total": sum(monthly.values()), "status": "ok"}


def en_pageviews_one(qid, en_title):
    path = os.path.join(CACHE_DIR, "en", qid + ".json")
    if os.path.exists(path):
        return json.load(open(path))
    try:
        result = fetch_pageviews_monthly("en", en_title)
        result["ok"] = True
    except requests.RequestException as e:
        # do not cache transient failures -- leave uncached so next run retries
        return {"ok": False, "error": str(e), "_transient": True}
    json.dump(result, open(path, "w"))
    return result


# ---------------------------------------------------------------------------
# Stage: sitelinks
# ---------------------------------------------------------------------------
EXCLUDE_SITE_IDS = {
    "commonswiki", "specieswiki", "metawiki", "mediawikiwiki", "wikidatawiki",
    "incubatorwiki", "outreachwiki", "testwiki", "test2wiki", "betawikiversitywiki",
    "loginwiki", "votewiki", "qualitywiki", "wikifunctionswiki", "sourceswiki",
    "wikimaniawiki",
}


def is_language_wikipedia_site(site_id):
    if not site_id.endswith("wiki"):
        return False
    if site_id in EXCLUDE_SITE_IDS:
        return False
    if "wikimania" in site_id:
        return False
    prefix = site_id[:-4]
    if not prefix:
        return False
    # language codes: lowercase letters, digits, hyphens (e.g. zh-yue, be-tarask, nds-nl)
    if not re.fullmatch(r"[a-z0-9\-]+", prefix):
        return False
    return True


def sitelinks_one(qid):
    path = os.path.join(CACHE_DIR, "sitelinks", qid + ".json")
    if os.path.exists(path):
        return json.load(open(path))
    url = f"https://www.wikidata.org/wiki/Special:EntityData/{qid}.json"
    try:
        r = throttled_get(url)
        r.raise_for_status()
        data = r.json()
        entity = data["entities"][qid]
        sitelinks = entity.get("sitelinks", {})
        langs = {}
        for site_id, sl in sitelinks.items():
            if is_language_wikipedia_site(site_id):
                lang = site_id[:-4]
                langs[lang] = sl["title"]
        result = {"ok": True, "langs": langs}
    except (requests.RequestException, KeyError) as e:
        return {"ok": False, "error": str(e), "langs": {}, "_transient": True}
    json.dump(result, open(path, "w"))
    return result


def lang_pageviews_one(qid, lang, title):
    fname = f"{qid}__{lang}.json"
    path = os.path.join(CACHE_DIR, "lang", fname)
    if os.path.exists(path):
        return json.load(open(path))
    try:
        result = fetch_pageviews_monthly(lang, title)
        result["ok"] = True
    except requests.RequestException as e:
        # do not cache transient failures -- leave uncached so next run retries
        return {"ok": False, "error": str(e), "_transient": True}
    json.dump(result, open(path, "w"))
    return result


# ---------------------------------------------------------------------------
# work-remaining helpers
# ---------------------------------------------------------------------------

def all_resolved(teams=None):
    teams = TEAMS if teams is None else teams
    out = []
    for league, name in teams:
        p = os.path.join(CACHE_DIR, "resolve", slug(league, name) + ".json")
        if os.path.exists(p):
            out.append(json.load(open(p)))
        else:
            out.append(None)
    return out


def pending_counts(teams=None):
    teams = TEAMS if teams is None else teams
    resolved = all_resolved(teams)
    n_unresolved = sum(1 for r in resolved if r is None)
    n_resolve_failed = sum(1 for r in resolved if r and not r.get("resolved"))
    good = [r for r in resolved if r and r.get("resolved")]
    n_en_missing = sum(1 for r in good if not os.path.exists(os.path.join(CACHE_DIR, "en", r["qid"] + ".json")))
    n_sitelinks_missing = sum(1 for r in good if not os.path.exists(os.path.join(CACHE_DIR, "sitelinks", r["qid"] + ".json")))
    n_lang_pending = 0
    for r in good:
        sp = os.path.join(CACHE_DIR, "sitelinks", r["qid"] + ".json")
        if not os.path.exists(sp):
            continue
        sdata = json.load(open(sp))
        for lang in sdata.get("langs", {}):
            lp = os.path.join(CACHE_DIR, "lang", f"{r['qid']}__{lang}.json")
            if not os.path.exists(lp):
                n_lang_pending += 1
    return {
        "total_teams": len(teams),
        "unresolved_new": n_unresolved,
        "resolve_failed": n_resolve_failed,
        "resolved_ok": len(good),
        "en_pageviews_missing": n_en_missing,
        "sitelinks_missing": n_sitelinks_missing,
        "lang_pageviews_pending": n_lang_pending,
    }


# ---------------------------------------------------------------------------
# fetch driver
# ---------------------------------------------------------------------------

def run_fetch(budget_seconds, teams=None):
    teams = TEAMS if teams is None else teams
    t0 = time.time()

    def time_left():
        return budget_seconds - (time.time() - t0)

    n_done_this_run = 0

    # Stage 1: resolve
    for league, name in teams:
        if time_left() <= 2:
            print(f"[budget exhausted during resolve] done={n_done_this_run}")
            return
        p = os.path.join(CACHE_DIR, "resolve", slug(league, name) + ".json")
        if os.path.exists(p):
            continue
        resolve_one(league, name)
        n_done_this_run += 1

    resolved = [r for r in all_resolved(teams) if r and r.get("resolved")]

    # Stage 2: en pageviews
    for r in resolved:
        if time_left() <= 2:
            print(f"[budget exhausted during en_pageviews] done={n_done_this_run}")
            return
        p = os.path.join(CACHE_DIR, "en", r["qid"] + ".json")
        if os.path.exists(p):
            continue
        en_pageviews_one(r["qid"], r["en_title"])
        n_done_this_run += 1

    # Stage 3: sitelinks
    for r in resolved:
        if time_left() <= 2:
            print(f"[budget exhausted during sitelinks] done={n_done_this_run}")
            return
        p = os.path.join(CACHE_DIR, "sitelinks", r["qid"] + ".json")
        if os.path.exists(p):
            continue
        sitelinks_one(r["qid"])
        n_done_this_run += 1

    # Stage 4: lang pageviews (parallel, rate-limited via throttled_get's shared lock)
    tasks = []
    for r in resolved:
        sp = os.path.join(CACHE_DIR, "sitelinks", r["qid"] + ".json")
        if not os.path.exists(sp):
            continue
        sdata = json.load(open(sp))
        for lang, title in sdata.get("langs", {}).items():
            lp = os.path.join(CACHE_DIR, "lang", f"{r['qid']}__{lang}.json")
            if os.path.exists(lp):
                continue
            tasks.append((r["qid"], lang, title))

    if tasks:
        pool = ThreadPoolExecutor(max_workers=20)
        futures = {pool.submit(lang_pageviews_one, qid, lang, title): (qid, lang) for qid, lang, title in tasks}
        try:
            for fut in as_completed(futures, timeout=None):
                try:
                    fut.result()
                except Exception:
                    pass
                n_done_this_run += 1
                if time_left() <= 3:
                    print(f"[budget exhausted during lang_pageviews] done={n_done_this_run}")
                    print(f"[stats] {_stats}")
                    pool.shutdown(wait=False, cancel_futures=True)
                    return
        finally:
            pool.shutdown(wait=False, cancel_futures=True)

    print(f"[all fetch stages complete] done_this_run={n_done_this_run}")
    print(f"[stats] {_stats}")


# ---------------------------------------------------------------------------
# aggregate
# ---------------------------------------------------------------------------

def run_aggregate():
    resolved = all_resolved()
    monthly_long_rows = []
    league_totals = defaultdict(float)
    missing_teams = []

    per_team = []
    for (league, name), r in zip(TEAMS, resolved):
        if r is None or not r.get("resolved"):
            missing_teams.append({"league": league, "team": name, "reason": "resolve_failed"})
            continue
        qid, en_title = r["qid"], r["en_title"]
        en_path = os.path.join(CACHE_DIR, "en", qid + ".json")
        sl_path = os.path.join(CACHE_DIR, "sitelinks", qid + ".json")
        if not os.path.exists(en_path) or not os.path.exists(sl_path):
            missing_teams.append({"league": league, "team": name, "reason": "fetch_incomplete"})
            continue
        en_data = json.load(open(en_path))
        sl_data = json.load(open(sl_path))
        en_views = en_data.get("total", 0) if en_data.get("ok", True) else 0

        lang_totals = {}
        lang_monthly = {}
        for lang, title in sl_data.get("langs", {}).items():
            lp = os.path.join(CACHE_DIR, "lang", f"{qid}__{lang}.json")
            if not os.path.exists(lp):
                continue
            ldata = json.load(open(lp))
            total = ldata.get("total", 0) if ldata.get("ok", True) else 0
            lang_totals[lang] = total
            lang_monthly[lang] = ldata.get("monthly", {})

        all_lang_views = sum(lang_totals.values())
        lang_count = len(lang_totals)
        top5 = sorted(lang_totals.items(), key=lambda kv: -kv[1])[:5]
        top5_str = "; ".join(
            f"{lg}:{v}({(v/all_lang_views*100):.1f}%)" if all_lang_views else f"{lg}:0(0.0%)"
            for lg, v in top5
        )

        month_sums_for_team = defaultdict(int)
        for lang, monthly in lang_monthly.items():
            for ym, v in monthly.items():
                month_sums_for_team[ym] += v
        month_values = list(month_sums_for_team.values())
        # pad to 12 months with 0 for any missing month so the median reflects
        # a full 12-month baseline even if a language had a data gap
        while len(month_values) < 12:
            month_values.append(0)
        median_month = statistics.median(month_values)
        baseline_12m = median_month * 12
        max_month = max(month_values) if month_values else 0
        spike_ratio = (max_month / median_month) if median_month else float("inf") if max_month else 0

        per_team.append({
            "league": league, "team": name, "qid": qid, "en_title": en_title,
            "en_views_12m": en_views, "all_lang_views_12m": all_lang_views,
            "lang_count": lang_count, "top5_langs": top5_str,
            "median_month_all_lang": median_month, "baseline_12m": baseline_12m,
            "spike_ratio": round(spike_ratio, 3) if spike_ratio != float("inf") else "",
        })
        league_totals[league] += all_lang_views

        month_sums = defaultdict(int)
        for lang, monthly in lang_monthly.items():
            for ym, v in monthly.items():
                month_sums[ym] += v
        for ym in sorted(month_sums):
            monthly_long_rows.append({
                "league": league, "team": name, "qid": qid,
                "year_month": ym, "all_lang_views": month_sums[ym],
            })

    epl_europe_total = league_totals.get("EPL", 0) + league_totals.get("Europe other", 0)
    baseline_league_totals = defaultdict(float)
    for row in per_team:
        baseline_league_totals[row["league"]] += row["baseline_12m"]
    baseline_epl_europe_total = baseline_league_totals.get("EPL", 0) + baseline_league_totals.get("Europe other", 0)

    for row in per_team:
        lg = row["league"]
        row["league_share"] = row["all_lang_views_12m"] / league_totals[lg] if league_totals[lg] else 0
        if lg in ("EPL", "Europe other"):
            row["europe_share"] = row["all_lang_views_12m"] / epl_europe_total if epl_europe_total else 0
        else:
            row["europe_share"] = ""
        row["baseline_league_share"] = row["baseline_12m"] / baseline_league_totals[lg] if baseline_league_totals[lg] else 0

    by_league = defaultdict(list)
    for row in per_team:
        by_league[row["league"]].append(row)
    for lg, rows_lg in by_league.items():
        rows_lg.sort(key=lambda r: -r["all_lang_views_12m"])
        for i, row in enumerate(rows_lg, 1):
            row["rank_in_league"] = i
        rows_lg2 = sorted(rows_lg, key=lambda r: -r["baseline_12m"])
        for i, row in enumerate(rows_lg2, 1):
            row["baseline_rank_in_league"] = i

    per_team.sort(key=lambda r: (r["league"], r["rank_in_league"]))

    out_csv = os.path.join(OUT_DIR, "teams_fan_attention.csv")
    fields = ["league", "team", "qid", "en_title", "en_views_12m", "all_lang_views_12m",
              "lang_count", "top5_langs", "league_share", "europe_share", "rank_in_league",
              "median_month_all_lang", "baseline_12m", "spike_ratio",
              "baseline_league_share", "baseline_rank_in_league"]
    with open(out_csv, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for row in per_team:
            w.writerow(row)

    out_monthly = os.path.join(OUT_DIR, "teams_monthly_long.csv")
    with open(out_monthly, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["league", "team", "qid", "year_month", "all_lang_views"])
        w.writeheader()
        for row in sorted(monthly_long_rows, key=lambda r: (r["league"], r["team"], r["year_month"])):
            w.writerow(row)

    missing_path = os.path.join(CACHE_DIR, "missing_teams.json")
    json.dump(missing_teams, open(missing_path, "w"), indent=2)

    print(f"teams_fan_attention.csv rows={len(per_team)}")
    print(f"teams_monthly_long.csv rows={len(monthly_long_rows)}")
    print(f"missing_teams={len(missing_teams)}: {missing_teams}")
    top5_overall = sorted(per_team, key=lambda r: -r["all_lang_views_12m"])[:5]
    print("TOP5 all_lang_views_12m:")
    for r in top5_overall:
        print(f"  {r['team']} ({r['league']}): {r['all_lang_views_12m']}")


# ---------------------------------------------------------------------------
# UNIVERSE EXTENSION: join with Metro Area Project valuations.json
# ---------------------------------------------------------------------------
VALUATIONS_PATH = os.path.expanduser(
    "~/mnt/Metro Area Project/public/data/valuations/valuations.json"
)

# (cache_league_tag, wiki_resolve_name) -- resolve_name is what gets looked up
# on Wikipedia; it is an explicit disambiguating alias for names that collide
# with a non-team topic (a car company, a Greek myth, an Italian region, a
# Mexican city, etc.) rather than the raw valuations.json name. The mapping
# back to the valuations.json name + group + val_league is in NEW_TEAMS_META.
NEW_TEAMS = [
    # --- MLS (league="United States" in valuations.json) ---
    ("MLS", "Inter Miami CF"), ("MLS", "Los Angeles FC"), ("MLS", "Los Angeles Galaxy"),
    ("MLS", "Atlanta United FC"), ("MLS", "New York City FC"), ("MLS", "Seattle Sounders FC"),
    ("MLS", "Austin FC"), ("MLS", "Columbus Crew"), ("MLS", "FC Cincinnati"),
    ("MLS", "San Diego FC"), ("MLS", "Charlotte FC"), ("MLS", "D.C. United"),
    ("MLS", "Portland Timbers"), ("MLS", "Philadelphia Union"), ("MLS", "Toronto FC"),
    ("MLS", "Chicago Fire FC"), ("MLS", "Sporting Kansas City"), ("MLS", "St. Louis City SC"),
    ("MLS", "Nashville SC"), ("MLS", "New York Red Bulls"), ("MLS", "Minnesota United FC"),
    ("MLS", "Houston Dynamo FC"), ("MLS", "San Jose Earthquakes"), ("MLS", "Real Salt Lake"),
    ("MLS", "Orlando City SC"), ("MLS", "New England Revolution"), ("MLS", "FC Dallas"),
    ("MLS", "Colorado Rapids"), ("MLS", "Vancouver Whitecaps FC"), ("MLS", "CF Montreal"),
    # --- WNBA ---
    ("WNBA", "Golden State Valkyries"), ("WNBA", "New York Liberty"), ("WNBA", "Indiana Fever"),
    ("WNBA", "Seattle Storm"), ("WNBA", "Phoenix Mercury"), ("WNBA", "Las Vegas Aces"),
    ("WNBA", "Los Angeles Sparks"), ("WNBA", "Minnesota Lynx"), ("WNBA", "Dallas Wings"),
    # --- NWSL ---
    ("NWSL", "Angel City FC"),
    # --- F1 constructors (aliased -- bare brand names collide with car makers etc.) ---
    ("F1", "Scuderia Ferrari"), ("F1", "Mercedes-AMG Petronas F1 Team"),
    ("F1", "McLaren Racing"), ("F1", "Red Bull Racing"), ("F1", "Aston Martin F1 Team"),
    ("F1", "Williams Racing"), ("F1", "Alpine F1 Team"), ("F1", "Racing Bulls F1 Team"),
    ("F1", "Sauber Motorsport"), ("F1", "Haas F1 Team"),
    # --- Spain (new; Real Madrid/Barcelona already in the original 152) ---
    ("EUR_ESP", "Atletico Madrid"), ("EUR_ESP", "Real Sociedad"), ("EUR_ESP", "Sevilla FC"),
    # --- Germany (new; Bayern Munich/Dortmund already in the original 152) ---
    ("EUR_GER", "Eintracht Frankfurt"), ("EUR_GER", "RB Leipzig"),
    # --- Italy (new; Juventus/Inter Milan already in the original 152) ---
    ("EUR_ITA", "AC Milan"), ("EUR_ITA", "SSC Napoli"), ("EUR_ITA", "AS Roma"),
    ("EUR_ITA", "Atalanta B.C."), ("EUR_ITA", "S.S. Lazio"),
    # --- France (new; PSG already in the original 152) ---
    ("EUR_FRA", "Olympique de Marseille"), ("EUR_FRA", "Olympique Lyonnais"),
    ("EUR_FRA", "LOSC Lille"),
    # --- Portugal ---
    ("EUR_POR", "S.L. Benfica"), ("EUR_POR", "FC Porto"),
    # --- Netherlands ---
    ("EUR_NED", "PSV Eindhoven"), ("EUR_NED", "AFC Ajax"), ("EUR_NED", "Feyenoord"),
    # --- Turkey ---
    ("EUR_TUR", "Galatasaray S.K. (football)"),
    # --- Mexico (Liga MX) ---
    ("MX", "Club America"), ("MX", "C.D. Guadalajara"), ("MX", "C.F. Monterrey"),
]
assert len(NEW_TEAMS) == 72, len(NEW_TEAMS)

# maps (cache_league_tag, wiki_resolve_name) -> the exact "team" string used
# in valuations.json, so the join and display name are correct even where the
# resolve_name above is an alias rather than the valuations.json spelling.
NEW_TEAMS_VAL_NAME_OVERRIDE = {
    ("MLS", "Atlanta United FC"): "Atlanta United",
    ("MLS", "D.C. United"): "DC United",
    ("MLS", "Chicago Fire FC"): "Chicago Fire",
    ("MLS", "Minnesota United FC"): "Minnesota United",
    ("MLS", "Houston Dynamo FC"): "Houston Dynamo",
    ("MLS", "CF Montreal"): "CF Montr\u00e9al",
    ("F1", "Scuderia Ferrari"): "Ferrari",
    ("F1", "Mercedes-AMG Petronas F1 Team"): "Mercedes",
    ("F1", "McLaren Racing"): "McLaren",
    ("F1", "Aston Martin F1 Team"): "Aston Martin",
    ("F1", "Williams Racing"): "Williams",
    ("F1", "Alpine F1 Team"): "Alpine",
    ("F1", "Racing Bulls F1 Team"): "Racing Bulls",
    ("F1", "Sauber Motorsport"): "Kick Sauber",
    ("EUR_ESP", "Atletico Madrid"): "Atl\u00e9tico de Madrid",
    ("EUR_ITA", "Atalanta B.C."): "Atalanta",
    ("EUR_ITA", "S.S. Lazio"): "Lazio",
    ("EUR_FRA", "Olympique de Marseille"): "Olympique Marseille",
    ("EUR_FRA", "LOSC Lille"): "Lille OSC",
    ("EUR_POR", "S.L. Benfica"): "Benfica",
    ("EUR_NED", "AFC Ajax"): "Ajax",
    ("EUR_TUR", "Galatasaray S.K. (football)"): "Galatasaray SK",
    ("MX", "Club America"): "CF Am\u00e9rica",
    ("MX", "C.D. Guadalajara"): "Chivas Guadalajara",
    ("MX", "C.F. Monterrey"): "Monterrey",
}

CACHE_LEAGUE_TO_GROUP = {
    "MLS": "MLS", "WNBA": "WNBA/NWSL", "NWSL": "WNBA/NWSL", "F1": "F1",
    "EUR_ESP": "European football", "EUR_GER": "European football",
    "EUR_ITA": "European football", "EUR_FRA": "European football",
    "EUR_POR": "European football", "EUR_NED": "European football",
    "EUR_TUR": "European football", "MX": "Liga MX",
}
CACHE_LEAGUE_TO_VAL_LEAGUE = {
    "MLS": "United States", "WNBA": "WNBA", "NWSL": "NWSL", "F1": "F1",
    "EUR_ESP": "Spain", "EUR_GER": "Germany", "EUR_ITA": "Italy", "EUR_FRA": "France",
    "EUR_POR": "Portugal", "EUR_NED": "Netherlands", "EUR_TUR": "Turkey", "MX": "Mexico",
}

TEAMS_FULL = TEAMS + NEW_TEAMS


def normalize_name(s):
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower()
    s = re.sub(r"\(.*?\)", " ", s)
    s = re.sub(r"\b(f\.?c\.?|c\.?f\.?|a\.?f\.?c\.?|s\.?c\.?|s\.?s\.?c\.?|"
               r"s\.?l\.?|a\.?s\.?|s\.?s\.?|club|the|baseball|team)\b", " ", s)
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    s = re.sub(r"\s+", " ", s)
    return s


def load_valuations():
    return json.load(open(VALUATIONS_PATH))["rows"]


OLD_LEAGUE_TO_VAL_LEAGUES = {
    "NFL": ["NFL"], "NBA": ["NBA"], "MLB": ["MLB"], "NHL": ["NHL"],
    "EPL": ["England"],
    "Europe other": ["Spain", "Germany", "Italy", "France", "Portugal", "Netherlands", "Turkey"],
}


def group_for_old_league(league):
    if league in ("NFL", "NBA", "MLB", "NHL"):
        return league
    return "European football"  # EPL, Europe other


# Wikipedia's common/display name doesn't always match the valuation
# source's team label even after suffix-stripping normalization (e.g. Inter
# Milan's Wikipedia title vs. "Internazionale" in the Sportico/Football
# Benchmark data) -- explicit alias for that one known case.
OLD_TEAM_VAL_NAME_ALIASES = {
    ("Europe other", "Inter Milan"): "Internazionale",
}


def match_old_team_to_valuation(league, display_name, en_title, val_rows_by_league):
    candidates = OLD_LEAGUE_TO_VAL_LEAGUES.get(league, [])
    norm_display = normalize_name(display_name)
    norm_title = normalize_name(en_title)
    alias = OLD_TEAM_VAL_NAME_ALIASES.get((league, display_name))
    norm_alias = normalize_name(alias) if alias else None
    for vl in candidates:
        for row in val_rows_by_league.get(vl, []):
            nv = normalize_name(row["team"])
            if nv == norm_display or nv == norm_title or (norm_alias and nv == norm_alias):
                return row
    return None


def build_universe_rows():
    """Returns list of dicts: one per team in the full 224-team universe,
    with league/team/qid/en_title/pageview metrics + group/val_league/
    value_m/val_year/val_source/has_valuation."""
    val_rows = load_valuations()
    val_rows_by_league = defaultdict(list)
    for r in val_rows:
        val_rows_by_league[r["league"]].append(r)
    val_used = set()  # ids of (league, team) already matched, to catch dupes

    resolved_old = dict(zip(TEAMS, all_resolved(TEAMS)))
    resolved_new = dict(zip(NEW_TEAMS, all_resolved(NEW_TEAMS)))

    universe = []
    unresolved_report = []

    # --- old 152 ---
    for (league, name), r in resolved_old.items():
        if r is None or not r.get("resolved"):
            unresolved_report.append({"league": league, "team": name, "reason": "resolve_failed"})
            continue
        qid, en_title = r["qid"], r["en_title"]
        vrow = match_old_team_to_valuation(league, name, en_title, val_rows_by_league)
        group = group_for_old_league(league)
        universe.append({
            "cache_league": league, "league": league, "team": name, "qid": qid,
            "en_title": en_title, "group": group,
            "val_league": vrow["league"] if vrow else "",
            "value_m": vrow["value_m"] if vrow else None,
            "val_year": vrow["year"] if vrow else None,
            "val_source": vrow["source"] if vrow else "",
            "has_valuation": 1 if vrow else 0,
        })
        if vrow:
            val_used.add((vrow["league"], vrow["team"]))

    # --- new 72 ---
    for (cache_league, resolve_name), r in resolved_new.items():
        val_name = NEW_TEAMS_VAL_NAME_OVERRIDE.get((cache_league, resolve_name), resolve_name)
        group = CACHE_LEAGUE_TO_GROUP[cache_league]
        val_league = CACHE_LEAGUE_TO_VAL_LEAGUE[cache_league]
        vrow = None
        for row in val_rows_by_league.get(val_league, []):
            if row["team"] == val_name or normalize_name(row["team"]) == normalize_name(val_name):
                vrow = row
                break
        if r is None or not r.get("resolved"):
            unresolved_report.append({"league": group, "team": val_name, "reason": "resolve_failed"})
            continue
        universe.append({
            "cache_league": cache_league, "league": group, "team": val_name, "qid": r["qid"],
            "en_title": r["en_title"], "group": group,
            "val_league": vrow["league"] if vrow else "",
            "value_m": vrow["value_m"] if vrow else None,
            "val_year": vrow["year"] if vrow else None,
            "val_source": vrow["source"] if vrow else "",
            "has_valuation": 1 if vrow else 0,
        })
        if vrow:
            val_used.add((vrow["league"], vrow["team"]))

    all_val_ids = {(r["league"], r["team"]) for r in val_rows}
    unmatched_valuations = sorted(all_val_ids - val_used)

    return universe, unresolved_report, unmatched_valuations


def compute_team_metrics(qid, en_title):
    """Returns (en_views, all_lang_views, lang_count, top5_str, median_month, baseline_12m, spike_ratio, monthly_rows)"""
    en_path = os.path.join(CACHE_DIR, "en", qid + ".json")
    sl_path = os.path.join(CACHE_DIR, "sitelinks", qid + ".json")
    if not os.path.exists(en_path) or not os.path.exists(sl_path):
        return None
    en_data = json.load(open(en_path))
    sl_data = json.load(open(sl_path))
    en_views = en_data.get("total", 0) if en_data.get("ok", True) else 0

    lang_totals, lang_monthly = {}, {}
    for lang, title in sl_data.get("langs", {}).items():
        lp = os.path.join(CACHE_DIR, "lang", f"{qid}__{lang}.json")
        if not os.path.exists(lp):
            continue
        ldata = json.load(open(lp))
        total = ldata.get("total", 0) if ldata.get("ok", True) else 0
        lang_totals[lang] = total
        lang_monthly[lang] = ldata.get("monthly", {})

    all_lang_views = sum(lang_totals.values())
    lang_count = len(lang_totals)
    top5 = sorted(lang_totals.items(), key=lambda kv: -kv[1])[:5]
    top5_str = "; ".join(
        f"{lg}:{v}({(v/all_lang_views*100):.1f}%)" if all_lang_views else f"{lg}:0(0.0%)"
        for lg, v in top5
    )

    month_sums = defaultdict(int)
    for lang, monthly in lang_monthly.items():
        for ym, v in monthly.items():
            month_sums[ym] += v
    month_values = list(month_sums.values())
    while len(month_values) < 12:
        month_values.append(0)
    median_month = statistics.median(month_values)
    baseline_12m = median_month * 12
    max_month = max(month_values) if month_values else 0
    spike_ratio = round(max_month / median_month, 3) if median_month else ("" if not max_month else "")

    monthly_rows = [{"year_month": ym, "all_lang_views": month_sums[ym]} for ym in sorted(month_sums)]

    return {
        "en_views_12m": en_views, "all_lang_views_12m": all_lang_views,
        "lang_count": lang_count, "top5_langs": top5_str,
        "median_month_all_lang": median_month, "baseline_12m": baseline_12m,
        "spike_ratio": spike_ratio, "monthly_rows": monthly_rows,
    }


def loglog_ols(xs, ys):
    """xs, ys: parallel lists of positive values. Returns (slope, intercept, r2) in log space,
    or None if fewer than 3 points or non-positive values present."""
    pts = [(x, y) for x, y in zip(xs, ys) if x and y and x > 0 and y > 0]
    if len(pts) < 3:
        return None
    lx = np.array([math.log(x) for x, _ in pts])
    ly = np.array([math.log(y) for _, y in pts])
    slope, intercept = np.polyfit(lx, ly, 1)
    pred = slope * lx + intercept
    ss_res = float(np.sum((ly - pred) ** 2))
    ss_tot = float(np.sum((ly - ly.mean()) ** 2))
    r2 = 1 - ss_res / ss_tot if ss_tot else float("nan")
    return {"slope": float(slope), "intercept": float(intercept), "r2": r2, "n": len(pts)}


def run_aggregate_universe():
    universe, unresolved_report, unmatched_valuations = build_universe_rows()

    full_rows = []
    monthly_long_rows = []
    league_totals = defaultdict(float)
    baseline_league_totals = defaultdict(float)

    for u in universe:
        m = compute_team_metrics(u["qid"], u["en_title"])
        if m is None:
            unresolved_report.append({"league": u["league"], "team": u["team"], "reason": "fetch_incomplete"})
            continue
        row = dict(u)
        row.update({k: v for k, v in m.items() if k != "monthly_rows"})
        full_rows.append(row)
        league_totals[u["league"]] += m["all_lang_views_12m"]
        baseline_league_totals[u["league"]] += m["baseline_12m"]
        for mr in m["monthly_rows"]:
            monthly_long_rows.append({
                "league": u["league"], "team": u["team"], "qid": u["qid"],
                "year_month": mr["year_month"], "all_lang_views": mr["all_lang_views"],
            })

    epl_europe_total = league_totals.get("EPL", 0) + league_totals.get("Europe other", 0)
    baseline_epl_europe_total = baseline_league_totals.get("EPL", 0) + baseline_league_totals.get("Europe other", 0)

    for row in full_rows:
        lg = row["league"]
        row["league_share"] = row["all_lang_views_12m"] / league_totals[lg] if league_totals[lg] else 0
        if lg in ("EPL", "Europe other"):
            row["europe_share"] = row["all_lang_views_12m"] / epl_europe_total if epl_europe_total else 0
        else:
            row["europe_share"] = ""
        row["baseline_league_share"] = row["baseline_12m"] / baseline_league_totals[lg] if baseline_league_totals[lg] else 0

    by_league = defaultdict(list)
    for row in full_rows:
        by_league[row["league"]].append(row)
    for lg, rows_lg in by_league.items():
        for i, row in enumerate(sorted(rows_lg, key=lambda r: -r["all_lang_views_12m"]), 1):
            row["rank_in_league"] = i
        for i, row in enumerate(sorted(rows_lg, key=lambda r: -r["baseline_12m"]), 1):
            row["baseline_rank_in_league"] = i

    full_rows.sort(key=lambda r: (r["group"], r["league"], r["rank_in_league"]))

    out_csv = os.path.join(OUT_DIR, "teams_fan_attention.csv")
    fields = ["group", "league", "val_league", "team", "qid", "en_title", "has_valuation",
              "value_m", "val_year", "val_source",
              "en_views_12m", "all_lang_views_12m", "lang_count", "top5_langs",
              "league_share", "europe_share", "rank_in_league",
              "median_month_all_lang", "baseline_12m", "spike_ratio",
              "baseline_league_share", "baseline_rank_in_league"]
    with open(out_csv, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for row in full_rows:
            w.writerow({k: row.get(k, "") for k in fields})

    out_monthly = os.path.join(OUT_DIR, "teams_monthly_long.csv")
    with open(out_monthly, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["league", "team", "qid", "year_month", "all_lang_views"])
        w.writeheader()
        for row in sorted(monthly_long_rows, key=lambda r: (r["league"], r["team"], r["year_month"])):
            w.writerow(row)

    # ---- valuation-only file with regression ----
    val_rows = [r for r in full_rows if r["has_valuation"]]
    by_group = defaultdict(list)
    for row in val_rows:
        by_group[row["group"]].append(row)

    group_models = {}
    for g, rows_g in by_group.items():
        xs = [r["baseline_12m"] for r in rows_g]
        ys = [r["value_m"] for r in rows_g]
        group_models[g] = loglog_ols(xs, ys)

    overall_model = loglog_ols([r["baseline_12m"] for r in val_rows], [r["value_m"] for r in val_rows])

    for row in val_rows:
        row["value_per_1k_baseline"] = (
            row["value_m"] * 1e6 / (row["baseline_12m"] / 1000) if row["baseline_12m"] else ""
        )
        gm = group_models.get(row["group"])
        if gm and row["baseline_12m"] > 0:
            pred = math.exp(gm["slope"] * math.log(row["baseline_12m"]) + gm["intercept"])
            row["predicted_value_m"] = pred
            row["residual_pct"] = row["value_m"] / pred - 1 if pred else ""
        else:
            row["predicted_value_m"] = ""
            row["residual_pct"] = ""
        if overall_model and row["baseline_12m"] > 0:
            predo = math.exp(overall_model["slope"] * math.log(row["baseline_12m"]) + overall_model["intercept"])
            row["predicted_value_m_overall"] = predo
            row["residual_pct_overall"] = row["value_m"] / predo - 1 if predo else ""
        else:
            row["predicted_value_m_overall"] = ""
            row["residual_pct_overall"] = ""

    for g, rows_g in by_group.items():
        for i, row in enumerate(sorted(rows_g, key=lambda r: -r["baseline_12m"]), 1):
            row["attention_rank_in_group"] = i
        for i, row in enumerate(sorted(rows_g, key=lambda r: -r["value_m"]), 1):
            row["value_rank_in_group"] = i
        for row in rows_g:
            row["rank_gap"] = row["attention_rank_in_group"] - row["value_rank_in_group"]

    val_rows.sort(key=lambda r: (r["group"], r["attention_rank_in_group"]))

    out_val_csv = os.path.join(OUT_DIR, "teams_fan_vs_valuation.csv")
    val_fields = ["group", "league", "val_league", "team", "qid", "en_title",
                  "value_m", "val_year", "val_source",
                  "en_views_12m", "all_lang_views_12m", "baseline_12m", "spike_ratio",
                  "value_per_1k_baseline", "predicted_value_m", "residual_pct",
                  "predicted_value_m_overall", "residual_pct_overall",
                  "attention_rank_in_group", "value_rank_in_group", "rank_gap"]
    with open(out_val_csv, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=val_fields)
        w.writeheader()
        for row in val_rows:
            w.writerow({k: row.get(k, "") for k in val_fields})

    print(f"teams_fan_attention.csv rows={len(full_rows)}")
    print(f"teams_monthly_long.csv rows={len(monthly_long_rows)}")
    print(f"teams_fan_vs_valuation.csv rows={len(val_rows)}")
    print(f"unresolved/incomplete: {len(unresolved_report)}: {unresolved_report}")
    print(f"unmatched valuation rows (in valuations.json but no team found): {len(unmatched_valuations)}: {unmatched_valuations}")
    print("R^2 per group:")
    for g, gm in group_models.items():
        print(f"  {g}: n={gm['n'] if gm else 0} r2={gm['r2'] if gm else 'insufficient data (<3 valued teams)'}")
    print(f"Overall R^2: n={overall_model['n'] if overall_model else 0} r2={overall_model['r2'] if overall_model else 'n/a'}")

    top5 = sorted(val_rows, key=lambda r: -r["residual_pct"] if isinstance(r["residual_pct"], (int, float)) else float("-inf"))[:5]
    bot5 = sorted(val_rows, key=lambda r: r["residual_pct"] if isinstance(r["residual_pct"], (int, float)) else float("inf"))[:5]
    print("TOP5 residual_pct (most overvalued vs attention):", [(r["team"], round(r["residual_pct"], 3)) for r in top5 if isinstance(r["residual_pct"], (int, float))])
    print("BOTTOM5 residual_pct (most undervalued vs attention):", [(r["team"], round(r["residual_pct"], 3)) for r in bot5 if isinstance(r["residual_pct"], (int, float))])

    json.dump({
        "group_r2": {g: (gm["r2"] if gm else None) for g, gm in group_models.items()},
        "overall_r2": overall_model["r2"] if overall_model else None,
        "unresolved": unresolved_report,
        "unmatched_valuations": unmatched_valuations,
    }, open(os.path.join(CACHE_DIR, "universe_aggregate_summary.json"), "w"), indent=2)

    write_site_json()


def write_site_json():
    """
    Regenerate public/data/fans/fan-attention.json from the CSVs this script
    just wrote in OUT_DIR, via scripts/fans/csv_to_json.py (same directory,
    imported by path so this file has no import-order dependency on being
    run as part of a package).
    """
    import importlib.util
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    csv_to_json_path = os.path.join(os.path.dirname(__file__), "csv_to_json.py")
    spec = importlib.util.spec_from_file_location("csv_to_json", csv_to_json_path)
    csv_to_json = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(csv_to_json)
    out_path = os.path.join(repo_root, "public", "data", "fans", "fan-attention.json")
    csv_to_json.build_json(OUT_DIR, out_path)


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "status"
    if mode == "fetch":
        budget = float(sys.argv[2]) if len(sys.argv) > 2 else 100.0
        run_fetch(budget)
    elif mode == "status":
        print(json.dumps(pending_counts(), indent=2))
    elif mode == "aggregate":
        run_aggregate()
    elif mode == "fetch_ext":
        budget = float(sys.argv[2]) if len(sys.argv) > 2 else 100.0
        run_fetch(budget, teams=NEW_TEAMS)
    elif mode == "status_ext":
        print(json.dumps(pending_counts(NEW_TEAMS), indent=2))
    elif mode == "check_universe":
        universe, unresolved, unmatched = build_universe_rows()
        print("universe rows:", len(universe))
        print("unresolved:", unresolved)
        print("unmatched valuation rows (no team found for them):", unmatched)
        has_val = sum(1 for u in universe if u["has_valuation"])
        print("has_valuation=1:", has_val, " =0:", len(universe) - has_val)
    elif mode == "aggregate_universe":
        run_aggregate_universe()
    elif mode == "site_json":
        write_site_json()
    else:
        print("unknown mode", mode)
        sys.exit(1)
