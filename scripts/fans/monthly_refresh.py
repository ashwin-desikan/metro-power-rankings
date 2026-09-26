#!/usr/bin/env python3
"""
scripts/fans/monthly_refresh.py -- monthly incremental refresh for the Fan
Attention Index (see fan_index/README.md REVISION 8/9 for the full method,
and scripts/fans/README.md for how this script fits the monthly cadence).

Run by mac-mini-jobs runners/fans-monthly.sh on the 3rd of each month
(jobs.toml id "fans-monthly"). Self-contained: reads and writes only inside
scripts/fans/** and data/fans/**, per the repo's read-only rule for
this pipeline. Does NOT depend on any path outside the repo (the original
research pipeline in fan_index/ lives on Ashwin's own machine and is not
reachable from the mini).

What it does, one pass:
  1. Determines the previous completed calendar month (YYYYMM).
  2. Loads scripts/fans/universe_state.json (one row per team: qid, en_title,
     group, league, team, sitelink_langs, in_flux, home_langs, monthly, ...).
  3. Fetches that one month's Wikipedia pageviews for every (team, language)
     pair in sitelink_langs, all-language, summed into one figure per team.
  4. Best-effort Google Trends refresh for the groups currently blended
     (those with a non-null trends_index on any row) -- fails open: on any
     pytrends error the group's LAST trends_index is kept unchanged and a
     note is logged, never a hard failure.
  5. Appends the month to data/fans/history/fan-attention-YYYY-MM.json,
     rolls the 12-month window on universe_state.json's "monthly" per team,
     recomputes wiki_baseline_12m, the blend-rescale (fan_index_raw), and the
     cross-sport score (reading scripts/fans/league_revenue_anchor.csv).
  6. Regenerates data/fans/fan-attention.json via csv_to_json.py.
  7. Updates data/fans/history/index.json's month list and re-checks
     the 8MB history budget.

Self-test (--self-test): validates universe_state.json and the anchor CSV
parse, that every league in universe_state.json has an anchor row, and that
the previous-month calculation is correct for a few fixed "today" values.
No network calls.
"""
import argparse
import bz2
import csv
import json
import math
import os
import statistics
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import date, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
STATE_PATH = os.path.join(HERE, "universe_state.json")
ANCHOR_PATH = os.path.join(HERE, "league_revenue_anchor.csv")
# 2026-09-24: moved out of public/ so the raw JSON is no longer directly
# downloadable; the /fans page now serves it only via the auth-gated
# app/api/fans/route.ts. See scripts/fans/README.md for the full note.
HISTORY_DIR = os.path.join(REPO, "data", "fans", "history")
OUT_JSON = os.path.join(REPO, "data", "fans", "fan-attention.json")
SCRATCH_CSV_DIR = os.path.join(HERE, "_scratch_csv")

UA = "CitizenOfNowhere-FanIndex/0.1 (ashwind@gmail.com; monthly job)"
HISTORY_BUDGET_BYTES = 8 * 1024 * 1024


def prev_completed_month(today):
    """The last fully-completed calendar month before `today` (a date), as
    YYYYMM. Run on the 3rd, so "today" is always past the previous month's
    end; kept as a pure function so --self-test can check it without a clock."""
    first_of_this_month = today.replace(day=1)
    last_of_prev_month = first_of_this_month - timedelta(days=1)
    return last_of_prev_month.strftime("%Y%m")


def log(msg):
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}", flush=True)


# --- the monthly dump ------------------------------------------------------
# ONE download replaces 26,602 per-article REST calls. Switched 2026-09-24 after
# the per-article path failed its own validation gate: measured on the mini, a
# 0.8 percent 429 rate fanned out across up to 143 language editions per club
# gave a 63 percent per-team failure chance, and the retry ladder turned that
# into 1.51 req/s effective against a 90 minute step timeout, so a run reached
# 31 percent of the roster before being killed. See HANDOFF section AV.
#
# 🔴 THE DUMP IS SPLIT BY ACCESS METHOD, AND THAT IS THE PARITY TRAP. One article
# has up to three lines (desktop, mobile-web, mobile-app). The REST endpoint this
# replaces asked for `all-access`, so a faithful figure is the SUM of those lines,
# not the first one found. Reading one line per article would silently under-count
# by roughly the mobile share, which on Wikipedia is most of the traffic.
#
# Line format, space separated, verified against the real 2026-08 file:
#   wiki_code  article_title  page_id  access_method  views  hourly_breakdown
#   aa.wikibooks Administrator null desktop 1 Y1
# Titles are underscored raw UTF-8, NOT percent-encoded, which is why the lookup
# key is title.replace(" ", "_") with no quoting.
#
# `-user`, not `-automated`: it matches the `agent=user` the REST path requested.
DUMP_URL = ("https://dumps.wikimedia.org/other/pageview_complete/monthly/"
            "{y}/{y}-{mm}/pageviews-{ym}-user.bz2")

# Share of requested keys that must appear before the result is trusted. A dump
# whose format changed, or a truncated stream, would otherwise yield zeros for
# every team and look exactly like a quiet month: the same shape as the NPB
# HScore bug on the Silent failure register, where a null-safe reader of the
# wrong field is indistinguishable from no news. Measured coverage is around
# 0.75, since some sitelinks are to articles with no views in a given month.
MIN_MATCH_RATE = float(os.environ.get("FANS_MIN_MATCH_RATE", "0.55"))


def dump_url(ym):
    return DUMP_URL.format(y=ym[:4], mm=ym[4:6], ym=ym)


def dump_key(lang, title):
    """The first two dump fields joined, as bytes: the whole lookup key. Kept as
    bytes so the hot loop never decodes any of the ~465 million lines."""
    return (f"{lang}.wikipedia {title.replace(' ', '_')}").encode("utf-8")


def accumulate_line(line, wanted, totals):
    """Add one dump line's views to totals when its (wiki, title) is wanted.

    Pure and bytes-only so --self-test can pin it without a network. Two finds
    on the reject path, which is almost every line."""
    i = line.find(b" ")
    if i < 0:
        return
    j = line.find(b" ", i + 1)
    if j < 0:
        return
    key = line[:j]
    if key not in wanted:
        return
    k = line.find(b" ", j + 1)          # end of page_id
    if k < 0:
        return
    m = line.find(b" ", k + 1)          # end of access_method
    if m < 0:
        return
    n = line.find(b" ", m + 1)          # end of views
    field = line[m + 1:] if n < 0 else line[m + 1:n]
    try:
        totals[key] = totals.get(key, 0) + int(field)
    except ValueError:
        return


def fetch_month_from_dump(ym, wanted, log_every=60):
    """Stream the month's dump once and return {key: all-access user views}.

    Raises on a transport or decode failure rather than returning partial data:
    a short read must never be recorded as low view counts."""
    url = dump_url(ym)
    log(f"dump: {url}")
    totals = {}
    dec = bz2.BZ2Decompressor()
    tail = b""
    n_lines = 0
    n_bytes = 0
    t0 = time.time()
    next_log = log_every
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as resp:
        while True:
            chunk = resp.read(1 << 20)
            if not chunk:
                break
            n_bytes += len(chunk)
            buf = tail + dec.decompress(chunk)
            lines = buf.split(b"\n")
            tail = lines.pop()
            for line in lines:
                accumulate_line(line, wanted, totals)
            n_lines += len(lines)
            el = time.time() - t0
            if el >= next_log:
                next_log += log_every
                log(f"  dump: {n_bytes / 1e9:.2f} GB read, {n_lines / 1e6:.0f}M lines, "
                    f"{len(totals):,} keys matched, {el / 60:.1f} min")
    if tail:
        accumulate_line(tail, wanted, totals)
        n_lines += 1
    log(f"dump done: {n_bytes / 1e9:.2f} GB, {n_lines / 1e6:.0f}M lines, "
        f"{len(totals):,}/{len(wanted):,} keys matched, {(time.time() - t0) / 60:.1f} min")
    rate = len(totals) / max(1, len(wanted))
    if rate < MIN_MATCH_RATE:
        raise RuntimeError(
            f"dump matched only {rate:.1%} of {len(wanted):,} requested keys "
            f"(floor {MIN_MATCH_RATE:.0%}); refusing to record this as the month's "
            f"views. Check the line format and the wiki_code mapping before lowering "
            f"FANS_MIN_MATCH_RATE.")
    return totals


def load_anchors():
    anchors = {}
    with open(ANCHOR_PATH, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            anchors[row["competition"]] = row
    return anchors


LEAGUE_ANCHOR_ALIAS = {"Championship": "EFL Championship"}


def anchor_for_league(anchors, league):
    a = anchors.get(league)
    if a is None:
        a = anchors.get(LEAGUE_ANCHOR_ALIAS.get(league))
    return a


def fetch_trends_for_group(group_name, rows):
    """Best-effort Trends refresh for one blended group. Returns
    {team: new_trends_index} or {} on any failure (fail-open: caller keeps
    the existing trends_index for every row when this returns {})."""
    try:
        from pytrends.request import TrendReq
    except ImportError:
        log(f"  trends[{group_name}]: pytrends not installed, skipping (keeping last value)")
        return {}
    try:
        pytrend = TrendReq(hl="en-US", tz=0)
        out = {}
        # Anchor-chained batches of 5 (pytrends' own cap), same scheme as the
        # research pipeline's trends_fetch.py: one shared anchor team per
        # group so every batch's scale can be chained back to a single base.
        # v0.8: 12 months (52 weeks) of weekly interest, and the metric is
        # sum(52 weeks) + peak 4-consecutive-week window (the peak month
        # counts twice) -- the same peak-weighting rule as the wiki baseline,
        # replacing the old 3-month mean.
        def peak_plus_52(series):
            n = len(series)
            if n == 0:
                return 0.0
            total = sum(series)
            if n >= 4:
                best4 = max(sum(series[i:i + 4]) for i in range(n - 3))
            else:
                best4 = total
            return total + best4

        teams = [r["team"] for r in rows]
        anchor_team = teams[0]
        base_anchor_value = None
        for i in range(0, len(teams), 4):
            batch = [anchor_team] + [t for t in teams[i:i + 4] if t != anchor_team]
            pytrend.build_payload(batch, timeframe="today 12-m")
            df = pytrend.interest_over_time()
            if df is None or df.empty:
                continue
            df = df.drop(columns=[c for c in ("isPartial",) if c in df.columns])
            metrics = {col: peak_plus_52(df[col].tolist()) for col in df.columns}
            anchor_val = metrics.get(anchor_team)
            if not anchor_val:
                continue
            if base_anchor_value is None:
                base_anchor_value = anchor_val
            scale = base_anchor_value / anchor_val
            for t in batch:
                if t in metrics:
                    out[t] = float(metrics[t]) * scale
            time.sleep(1.0)
        return out
    except Exception as e:
        log(f"  trends[{group_name}]: FAILED ({e}), keeping last value for every team in this group")
        return {}


def recompute_blend_and_cross_sport(u, anchors):
    """Same formulas as fan_index/README.md REVISION 9 stages 2b and 3.
    Order-preserving within each group/league; only each group's TOTAL and
    the final cross-sport score change."""
    by_group = defaultdict(list)
    for r in u:
        by_group[r["group"]].append(r)

    for g, rows in by_group.items():
        wiki_total = sum(r["wiki_baseline_12m"] for r in rows) or 1
        trend_total = sum(r["trends_index"] for r in rows if r.get("trends_index")) or 0
        for r in rows:
            r["wiki_share"] = r["wiki_baseline_12m"] / wiki_total
            r["trends_share"] = (r["trends_index"] / trend_total) if (r.get("trends_index") and trend_total) else None

    for r in u:
        wiki_w = 0.4
        w_val = r["wiki_share"] * (0.5 if r.get("in_flux") else 1.0)
        if r.get("trends_share") is not None and r["trends_share"] > 0:
            t_val = r["trends_share"]
            t_w = 0.3
            total_w = wiki_w + t_w
            blended_share = (w_val ** (wiki_w / total_w)) * (t_val ** (t_w / total_w))
            r["signal"] = "blend"
        else:
            blended_share = w_val
            r["signal"] = "wiki only"
        r["blended_share"] = blended_share

    for g, rows in by_group.items():
        target_total = sum(r["wiki_baseline_12m"] * (0.5 if r.get("in_flux") else 1.0) for r in rows)
        raw_sum = sum(r["blended_share"] for r in rows) or 1
        scale = target_total / raw_sum if raw_sum else 0.0
        for r in rows:
            r["fan_index_raw"] = r["blended_share"] * scale

    grp_max = defaultdict(float)
    for r in u:
        grp_max[r["group"]] = max(grp_max[r["group"]], r["fan_index_raw"])
    for r in u:
        r["score_in_group"] = round(100 * r["fan_index_raw"] / grp_max[r["group"]], 1) if grp_max[r["group"]] else 0.0

    by_league = defaultdict(list)
    for r in u:
        by_league[r["league"]].append(r)
    missing_anchor = [lg for lg in by_league if anchor_for_league(anchors, lg) is None]
    if missing_anchor:
        raise SystemExit(f"no revenue anchor for league(s): {missing_anchor} -- add to league_revenue_anchor.csv first")
    for lg, rows in by_league.items():
        a = anchor_for_league(anchors, lg)
        R_L = float(a["revenue_usd_m"])
        W_L = sum(r["wiki_baseline_12m"] for r in rows)
        k_L = math.sqrt(R_L / W_L) if W_L > 0 else 0.0
        for r in rows:
            r["cross_raw"] = r["fan_index_raw"] * k_L
            r["k_league"] = k_L
            r["anchor_revenue_usd_m"] = R_L
            r["anchor_source"] = a["source_title"]
            r["anchor_confidence"] = a["confidence"]

    cross_max = max(r["cross_raw"] for r in u)
    for r in u:
        r["global_score"] = round(100 * r["cross_raw"] / cross_max, 2)
    u.sort(key=lambda r: -r["global_score"])
    for i, r in enumerate(u):
        r["global_rank"] = i + 1
    for g in by_group:
        rows = sorted(by_group[g], key=lambda r: -r["fan_index_raw"])
        for i, r in enumerate(rows):
            r["rank_in_group"] = i + 1
    for lg in by_league:
        rows = sorted(by_league[lg], key=lambda r: -r["fan_index_raw"])
        for i, r in enumerate(rows):
            r["rank_in_league"] = i + 1
    return u


def self_test():
    ok = True
    u = json.load(open(STATE_PATH, encoding="utf-8"))
    assert isinstance(u, list) and len(u) > 0, "universe_state.json must be a non-empty list"
    print(f"universe_state.json: {len(u)} rows, OK")

    anchors = load_anchors()
    assert len(anchors) > 0, "league_revenue_anchor.csv is empty"
    leagues = {r["league"] for r in u}
    missing = [lg for lg in leagues if anchor_for_league(anchors, lg) is None]
    if missing:
        print(f"FAIL: leagues with no anchor row: {missing}")
        ok = False
    else:
        print(f"anchor coverage: {len(leagues)}/{len(leagues)} leagues OK")

    cases = [
        (date(2026, 10, 3), "202609"),
        (date(2026, 1, 3), "202512"),
        (date(2026, 3, 3), "202602"),
    ]
    for today, expected in cases:
        got = prev_completed_month(today)
        if got != expected:
            print(f"FAIL: prev_completed_month({today}) = {got}, expected {expected}")
            ok = False
    if ok:
        print("prev_completed_month: 3 cases OK")

    idx_path = os.path.join(HISTORY_DIR, "index.json")
    if os.path.exists(idx_path):
        idx = json.load(open(idx_path, encoding="utf-8"))
        assert "months" in idx and "no_trends" in idx, "history/index.json missing expected keys"
        print(f"history/index.json: {len(idx['months'])} months on record, OK")
    else:
        print("history/index.json: not present yet (first run will create it) -- OK")

    # 2026-09-26 carry-forward gate: the six us_* fields (US cross-league
    # attention blend, Major American sports tab) are seeded once by
    # scripts/fans/seed_us_attention.py and carried forward unchanged every
    # month (the US Wiki + US Trends pipeline itself is not ported into this
    # script yet). Every row with us_attention set must also have
    # us_wiki_share (they are computed together upstream, so one without the
    # other means a partial or corrupted carry-forward), and the seeded count
    # must not have silently dropped below its 2026-09-26 baseline of 301.
    n_us_attention = sum(1 for r in u if r.get("us_attention") is not None)
    n_us_partial = sum(1 for r in u if r.get("us_attention") is not None and r.get("us_wiki_share") is None)
    if n_us_partial:
        print(f"FAIL: {n_us_partial} row(s) have us_attention but no us_wiki_share "
              f"-- the us_* carry-forward from seed_us_attention.py looks partial")
        ok = False
    elif n_us_attention < 250:
        print(f"FAIL: only {n_us_attention} rows carry us_attention (expected >= 250, "
              f"baseline 301 as of 2026-09-26) -- the us_attention carry-forward looks "
              f"lost; re-run scripts/fans/seed_us_attention.py --write")
        ok = False
    else:
        print(f"us_attention carry-forward: {n_us_attention} rows OK")

    if not ok:
        print("SELF-TEST FAILED")
        sys.exit(1)
    # --- the dump parser -------------------------------------------------
    # Real lines, copied from the 2026-08 file rather than invented.
    assert dump_url("202608").endswith(
        "/monthly/2026/2026-08/pageviews-202608-user.bz2"), "dump url shape"
    assert dump_key("en", "Real Madrid CF") == b"en.wikipedia Real_Madrid_CF", "key shape"
    assert dump_key("ky", "Барселона (футбол клубу)") == \
        "ky.wikipedia Барселона_(футбол_клубу)".encode("utf-8"), "non-ASCII key is raw UTF-8, not quoted"

    # 🔴 THE ACCESS-METHOD SUM. This is the assertion that matters: three lines
    # for one article must add up, because the endpoint this replaced asked for
    # all-access. Reading one line would under-count by the mobile share, which
    # is most of Wikipedia's traffic, and every downstream number would still
    # look plausible.
    want = {b"en.wikipedia Arsenal_F.C."}
    tot = {}
    for ln in (b"en.wikipedia Arsenal_F.C. 12345 desktop 100 A1B2",
               b"en.wikipedia Arsenal_F.C. 12345 mobile-web 250 C3",
               b"en.wikipedia Arsenal_F.C. 12345 mobile-app 40 D4"):
        accumulate_line(ln, want, tot)
    assert tot == {b"en.wikipedia Arsenal_F.C.": 390}, f"access methods must sum, got {tot}"

    # Rejects, each of which appeared in the real file
    tot2 = {}
    accumulate_line(b"aa.wikibooks Administrator null desktop 1 Y1", want, tot2)
    assert tot2 == {}, "an unwanted project must be ignored"
    accumulate_line(b"en.wikipedia Arsenal_F.C. null desktop 7 Y1", want, tot2)
    assert tot2 == {b"en.wikipedia Arsenal_F.C.": 7}, "a null page_id is still a real row"
    accumulate_line(b"en.wikipedia - null desktop 92 A19", want, tot2)
    assert list(tot2.values()) == [7], "the '-' title must not match anything wanted"
    for junk in (b"", b"no-spaces", b"en.wikipedia Arsenal_F.C.", b"en.wikipedia Arsenal_F.C. 1 desktop"):
        accumulate_line(junk, want, tot2)
    assert list(tot2.values()) == [7], f"short or malformed lines must be skipped, got {tot2}"
    accumulate_line(b"en.wikipedia Arsenal_F.C. 1 desktop notanumber X", want, tot2)
    assert list(tot2.values()) == [7], "a non-numeric views field must be skipped, not crash"
    # A trailing line with no breakdown column still carries a usable count.
    tot3 = {}
    accumulate_line(b"en.wikipedia Arsenal_F.C. 1 desktop 55", want, tot3)
    assert tot3 == {b"en.wikipedia Arsenal_F.C.": 55}, "views must parse as the last field too"
    print("dump parser: url, keys, access-method sum and 9 reject cases OK")

    print("monthly_refresh self-test OK")


def append_history_month(u, ym, anchors):
    os.makedirs(HISTORY_DIR, exist_ok=True)
    by_group = defaultdict(list)
    by_league = defaultdict(list)
    for r in u:
        by_group[r["group"]].append(r)
        by_league[r["league"]].append(r)
    rows_out = []
    for r in u:
        rows_out.append({
            "qid": r["qid"], "team": r["team"], "group": r["group"], "league": r["league"],
            "wiki_baseline_12m": round(r["wiki_baseline_12m"], 1),
            "home_views_12m": r.get("home_views_12m"),
            "rank_in_group": r["rank_in_group"], "rank_in_league": r["rank_in_league"],
            "cross_sport_score": r["global_score"],
        })
    out = {
        "year_month": f"{ym[:4]}-{ym[4:]}",
        "method": ("rolling 12-month all-language wiki baseline; cross_sport_score computed with "
                   "the CURRENT anchors at write time, not the anchors in effect that month; no Trends"),
        "teams": rows_out,
    }
    fname = f"fan-attention-{ym[:4]}-{ym[4:]}.json"
    path = os.path.join(HISTORY_DIR, fname)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))

    idx_path = os.path.join(HISTORY_DIR, "index.json")
    if os.path.exists(idx_path):
        idx = json.load(open(idx_path, encoding="utf-8"))
    else:
        idx = {
            "generated_note": ("Fan-attention history: rolling 12-month all-language wiki baseline "
                                "per month. No Trends in history. cross_sport_score in each monthly "
                                "file is computed with the anchors in effect when that file was "
                                "written (see league_revenue_anchor.csv history in git), not "
                                "re-derived retroactively when anchors change."),
            "source": "Wikimedia REST Pageviews API, all-language sitelinks, summed per team",
            "no_trends": True,
            "files": [],
        }
    ym_disp = f"{ym[:4]}-{ym[4:]}"
    if ym_disp not in idx.get("months", []):
        idx.setdefault("months", []).append(ym_disp)
        idx["months"].sort()
    rel = f"history/{fname}"
    if rel not in idx.get("files", []):
        idx.setdefault("files", []).append(rel)
        idx["files"].sort()
    with open(idx_path, "w", encoding="utf-8") as f:
        json.dump(idx, f, indent=1)

    total = sum(
        os.path.getsize(os.path.join(HISTORY_DIR, fn))
        for fn in os.listdir(HISTORY_DIR)
        if fn.endswith(".json")
    )
    log(f"history dir total: {total / 1024 / 1024:.2f} MB (budget 8 MB)")
    if total > HISTORY_BUDGET_BYTES:
        log("WARNING: history/ is over its 8MB budget -- consider pruning the oldest months")
    return total


def run(ym=None, dry_run=False):
    u = json.load(open(STATE_PATH, encoding="utf-8"))
    anchors = load_anchors()
    target_ym = ym or prev_completed_month(date.today())
    log(f"target month: {target_ym[:4]}-{target_ym[4:]}")

    n_teams = len(u)

    # One pass over the month's dump, then arithmetic. There is no per-team
    # failure mode any more: either the whole dump read (and the match-rate gate
    # passed), or fetch_month_from_dump raised and this run makes no claim about
    # the month at all. That is deliberate. The old per-article path could record
    # a partial month as if it were the truth, team by team, and did.
    wanted = {}
    for i, r in enumerate(u):
        for lang, title in (r.get("langs") or {}).items():
            wanted.setdefault(dump_key(lang, title), []).append(i)
    log(f"{n_teams} teams, {len(wanted):,} distinct (wiki, title) keys")
    totals = fetch_month_from_dump(target_ym, wanted)

    per_team = [0] * n_teams
    for key, idxs in wanted.items():
        v = totals.get(key)
        if not v:
            continue
        for i in idxs:
            per_team[i] += v

    n_zero = 0
    for i, r in enumerate(u):
        month_total = per_team[i]
        if month_total == 0:
            n_zero += 1
        monthly = r.setdefault("monthly", {})
        ym_disp_key = target_ym  # keep the same "YYYYMM" key style already in monthly_long.csv
        monthly[ym_disp_key] = month_total
        # roll: keep only the trailing 12 months
        if len(monthly) > 12:
            for old_ym in sorted(monthly.keys())[:-12]:
                del monthly[old_ym]
        vals = list(monthly.values())
        while len(vals) < 12:
            vals.append(0)
        # v0.8: sum of the 12 months + the peak month (the peak month counts
        # twice), replacing the old median-month x 12 rule.
        r["wiki_baseline_12m"] = sum(vals) + max(vals)
        r["peak_month_all_lang"] = max(vals)
    log(f"pageviews done: {n_teams} teams, {n_zero} with zero views this month")

    # Wikipedia's own overall traffic total, needed by /fans/trends to
    # normalize away Wikipedia's site-wide decline (see app/api/fans/
    # history/route.ts's normalized-series comment). Fail-open: this file
    # is a small input to one page's charts, not the index itself, so a
    # fetch problem here must never fail the whole monthly run. On error
    # the existing data/fans/wikipedia_totals_monthly.json (if any) is left
    # in place untouched and this run's log just notes it is stale.
    wiki_totals_script = os.path.join(HERE, "fetch_wikipedia_totals.py")
    wiki_totals_result = subprocess.run([sys.executable, wiki_totals_script], cwd=REPO)
    if wiki_totals_result.returncode != 0:
        log("WARNING: fetch_wikipedia_totals.py failed (see above); "
            "data/fans/wikipedia_totals_monthly.json was NOT updated this run "
            "-- /fans/trends will keep using whatever it last had.")
    else:
        log("wikipedia_totals_monthly.json refreshed")

    trends_groups = defaultdict(list)
    for r in u:
        if r.get("trends_index") is not None:
            trends_groups[r["group"]].append(r)
    for g, rows in trends_groups.items():
        log(f"trends refresh: {g} ({len(rows)} teams)")
        new_vals = fetch_trends_for_group(g, rows)
        for r in rows:
            if r["team"] in new_vals:
                r["trends_index"] = new_vals[r["team"]]

    recompute_blend_and_cross_sport(u, anchors)

    # 🔴 THE DRY-RUN CHECK MUST COME BEFORE append_history_month, WHICH WRITES.
    # It creates public/data/fans/history/fan-attention-YYYY-MM.json and updates
    # index.json, so with the call above this check a "dry run" left two
    # generated files behind. On the mini that matters more than it sounds: the
    # clone is shared with the dispatcher, and an uncommitted generated file
    # stops every job that fast-forwards, which cost about fourteen hours on
    # 2026-09-24 (HANDOFF section AI). jobs.toml tells the next person to
    # DRY_RUN-validate this job by hand before its first live slot, so the dry
    # run has to be safe to do in place.
    if dry_run:
        log("DRY_RUN: writing nothing (no history month, no universe_state.json, no CSVs, no fan-attention.json)")
        return

    history_size = append_history_month(u, target_ym, anchors)

    with open(STATE_PATH, "w", encoding="utf-8") as f:
        json.dump(u, f, ensure_ascii=False, separators=(",", ":"))
    log("universe_state.json written")

    os.makedirs(SCRATCH_CSV_DIR, exist_ok=True)
    write_scratch_csvs(u, SCRATCH_CSV_DIR)
    subprocess.run(
        [sys.executable, os.path.join(HERE, "csv_to_json.py"),
         "--fan-index-dir", SCRATCH_CSV_DIR, "--out", OUT_JSON],
        check=True, cwd=REPO,
    )
    log(f"fan-attention.json regenerated; history dir {history_size / 1024 / 1024:.2f} MB")

    # Push the freshly regenerated JSON (and this month's history file) to
    # Supabase. 2026-09-24: data/fans/fan-attention.json and data/fans/
    # history/ are gitignored now (see scripts/fans/README.md), so this push
    # is the ONLY way this month's numbers reach production -- there is no
    # commit of the JSON for a Vercel build to pick up any more. Fails open:
    # a push failure is logged loudly but does not fail the refresh run,
    # matching every other Supabase loader in this repo (see
    # scripts/business/load_market_series.py's service_key() note).
    push = subprocess.run(
        [sys.executable, os.path.join(HERE, "push_to_supabase.py")],
        cwd=REPO,
    )
    if push.returncode != 0:
        log("WARNING: push_to_supabase.py failed (see above); Supabase was NOT "
            "updated this run. data/fans/fan-attention.json is regenerated and "
            "correct locally -- re-run scripts/fans/push_to_supabase.py by hand "
            "once the problem is fixed.")
    else:
        log("pushed to Supabase (fan_attention_teams + fan_attention_history)")


def write_scratch_csvs(u, out_dir):
    u_sorted = sorted(u, key=lambda r: (r["group"], r["league"], -r["fan_index_raw"]))
    # us_attention, us_wiki_share, us_trends_area, us_trends_share, us_attention_rank,
    # us_attention_rank_in_league: the US cross-league attention blend (Major American
    # sports tab). 2026-09-26 carry-forward -- the US Wiki + US Trends pipeline is not
    # ported into this script yet (Backlog: "Fan Index: port us_attention into
    # monthly_refresh.py before 3 Oct"), so these six fields are only ever copied
    # through from the previous universe_state.json row (seeded once by
    # scripts/fans/seed_us_attention.py) and never recomputed here. They must stay in
    # this column list so csv_to_json.py keeps reading real values instead of the
    # None it silently falls back to when a column is missing from the CSV header.
    cols = ["category", "group", "league", "conference", "team", "display_name", "qid", "en_title",
            "wiki_baseline_12m", "peak_month_all_lang", "wiki_spike_ratio", "lang_count", "top5_langs",
            "social_followers", "social_asof",
            "reddit_subscribers", "subreddit", "trends_index", "trends_excluded_reason", "signal",
            "in_flux", "inclusion_rule", "fan_index_raw", "score_in_group", "rank_in_group",
            "rank_in_league", "anchor_revenue_usd_m", "anchor_source", "anchor_confidence", "k_league",
            "global_score", "global_rank", "has_valuation", "value_m", "val_year", "val_league",
            "val_source", "residual_pct", "p31", "desc_en", "home_langs", "home_views_12m", "global_reach_pct",
            "us_attention", "us_wiki_share", "us_trends_area", "us_trends_share",
            "us_attention_rank", "us_attention_rank_in_league"]
    with open(os.path.join(out_dir, "teams_fan_attention.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for r in u_sorted:
            row = []
            for c in cols:
                v = r.get(c)
                if c == "p31" and isinstance(v, list):
                    v = "|".join(v)
                row.append("" if v is None else v)
            w.writerow(row)
    with open(os.path.join(out_dir, "teams_monthly_long.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["group", "league", "team", "qid", "year_month", "all_lang_views"])
        for r in u_sorted:
            for ym, v in sorted((r.get("monthly") or {}).items()):
                w.writerow([r["group"], r["league"], r["team"], r["qid"], ym, v])
    val_rows = [r for r in u_sorted if r.get("value_m")]
    with open(os.path.join(out_dir, "teams_fan_vs_valuation.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        cols2 = ["group", "league", "team", "qid", "en_title", "fan_index_raw", "score_in_group",
                 "value_m", "val_year", "val_league", "val_source", "residual_pct", "in_flux"]
        w.writerow(cols2)
        for r in val_rows:
            w.writerow([r.get(c, "") if r.get(c) is not None else "" for c in cols2])


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--month", help="override target YYYYMM (default: previous completed month)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    if args.self_test:
        self_test()
    else:
        run(ym=args.month, dry_run=args.dry_run)
