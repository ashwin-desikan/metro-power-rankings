#!/usr/bin/env python3
"""
scripts/fans/monthly_refresh.py -- monthly incremental refresh for the Fan
Attention Index (see fan_index/README.md REVISION 8/9 for the full method,
and scripts/fans/README.md for how this script fits the monthly cadence).

Run by mac-mini-jobs runners/fans-monthly.sh on the 3rd of each month
(jobs.toml id "fans-monthly"). Self-contained: reads and writes only inside
scripts/fans/** and public/data/fans/**, per the repo's read-only rule for
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
  5. Appends the month to public/data/fans/history/fan-attention-YYYY-MM.json,
     rolls the 12-month window on universe_state.json's "monthly" per team,
     recomputes wiki_baseline_12m, the blend-rescale (fan_index_raw), and the
     cross-sport score (reading scripts/fans/league_revenue_anchor.csv).
  6. Regenerates public/data/fans/fan-attention.json via csv_to_json.py.
  7. Updates public/data/fans/history/index.json's month list and re-checks
     the 8MB history budget.

Self-test (--self-test): validates universe_state.json and the anchor CSV
parse, that every league in universe_state.json has an anchor row, and that
the previous-month calculation is correct for a few fixed "today" values.
No network calls.
"""
import argparse
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
HISTORY_DIR = os.path.join(REPO, "public", "data", "fans", "history")
OUT_JSON = os.path.join(REPO, "public", "data", "fans", "fan-attention.json")
SCRATCH_CSV_DIR = os.path.join(HERE, "_scratch_csv")

UA = "CitizenOfNowhere-FanIndex/0.1 (ashwind@gmail.com; monthly job)"
RATE = float(os.environ.get("FANS_MONTHLY_RATE", "10"))  # requests/sec
MIN_INTERVAL = 1.0 / RATE
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


_last_call = [0.0]


def throttled_get_json(url):
    wait = MIN_INTERVAL - (time.time() - _last_call[0])
    if wait > 0:
        time.sleep(wait)
    _last_call[0] = time.time()
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=25) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return {"items": []}
            if e.code == 429:
                time.sleep(min(3.0 * (attempt + 1), 15.0))
                continue
            time.sleep(2.0)
        except Exception:
            time.sleep(2.0)
    return None  # give up this run; caller must not cache a failure as zero


def fetch_month_views(lang, title, ym):
    """One month of all-access/user pageviews for one language edition."""
    enc = urllib.parse.quote(title.replace(" ", "_"), safe="")
    start = ym + "01"
    end_date = date(int(ym[:4]), int(ym[4:6]), 1)
    next_month = (end_date.replace(day=28) + timedelta(days=4)).replace(day=1)
    end = (next_month - timedelta(days=1)).strftime("%Y%m%d")
    url = (
        f"https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/"
        f"{lang}.wikipedia/all-access/user/{enc}/monthly/{start}/{end}"
    )
    data = throttled_get_json(url)
    if data is None:
        return None  # fetch failed after retries
    total = sum(item.get("views", 0) for item in data.get("items", []))
    return total


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
        teams = [r["team"] for r in rows]
        anchor_team = teams[0]
        base_anchor_value = None
        for i in range(0, len(teams), 4):
            batch = [anchor_team] + [t for t in teams[i:i + 4] if t != anchor_team]
            pytrend.build_payload(batch, timeframe="today 3-m")
            df = pytrend.interest_over_time()
            if df is None or df.empty:
                continue
            means = df.drop(columns=[c for c in ("isPartial",) if c in df.columns]).mean()
            anchor_val = means.get(anchor_team)
            if not anchor_val:
                continue
            if base_anchor_value is None:
                base_anchor_value = anchor_val
            scale = base_anchor_value / anchor_val
            for t in batch:
                if t in means:
                    out[t] = float(means[t]) * scale
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

    if not ok:
        print("SELF-TEST FAILED")
        sys.exit(1)
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
    n_fail = 0
    for i, r in enumerate(u):
        langs = r.get("langs") or {}
        month_total = 0
        any_fail = False
        for lang, title in langs.items():
            v = fetch_month_views(lang, title, target_ym)
            if v is None:
                any_fail = True
                continue
            month_total += v
        if any_fail:
            n_fail += 1
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
        median_month = statistics.median(vals)
        r["wiki_baseline_12m"] = median_month * 12
        r["median_month_all_lang"] = median_month
        if (i + 1) % 50 == 0:
            log(f"  fetched {i + 1}/{n_teams} teams (fails so far: {n_fail})")
    log(f"pageviews fetch done: {n_teams} teams, {n_fail} had at least one language fetch fail this month")

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
    history_size = append_history_month(u, target_ym, anchors)

    if dry_run:
        log("DRY_RUN: not writing universe_state.json / CSVs / fan-attention.json")
        return

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


def write_scratch_csvs(u, out_dir):
    u_sorted = sorted(u, key=lambda r: (r["group"], r["league"], -r["fan_index_raw"]))
    cols = ["category", "group", "league", "conference", "team", "display_name", "qid", "en_title",
            "wiki_baseline_12m", "median_month_all_lang", "wiki_spike_ratio", "lang_count", "top5_langs",
            "social_followers", "social_asof",
            "reddit_subscribers", "subreddit", "trends_index", "trends_excluded_reason", "signal",
            "in_flux", "inclusion_rule", "fan_index_raw", "score_in_group", "rank_in_group",
            "rank_in_league", "anchor_revenue_usd_m", "anchor_source", "anchor_confidence", "k_league",
            "global_score", "global_rank", "has_valuation", "value_m", "val_year", "val_league",
            "val_source", "residual_pct", "p31", "desc_en", "home_langs", "home_views_12m", "global_reach_pct"]
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
