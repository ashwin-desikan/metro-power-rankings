#!/usr/bin/env python3
"""
De-bot filter for the Fan Attention Index's Wikipedia pageview inputs.

BACKGROUND
----------
Manchester City F.C. (English Wikipedia) showed monthly "user"-agent views
of about 450k-770k from Jan to May 2024, dropping to about 200k-380k from
June 2024 onward, while "automated"-agent views fell at the same time from
about 200k-400k/month to about 20k-50k/month. Step 1 of this investigation
(see step1_detail.csv and the handback report) confirmed the pattern is
football-wide, concentrated in the largest language editions of football
club pages, and distinct from the roughly 7-15 percent wiki-wide traffic
decline attributed to AI search: a scraping/bot campaign against football
pages was partly flagged by Wikimedia's automated-agent heuristic and partly
slipped through counted as "user" traffic, and that campaign ended or was
blocked around mid-2024.

RULE
----
Per article-language, using monthly user views U(m), automated views A(m),
and that language edition's aggregate monthly "user" pageview total
Lagg(m):

1. CLEAN WINDOW AND BASELINES. Over a reference window believed to be free
   of the effect (default: July 2024 through the latest available month,
   at least MIN_CLEAN_MONTHS months with data):
     - clean_share  = median( U(m) / Lagg(m) )   -- the article's normal
       share of its language's total traffic, which cancels out ordinary
       wiki-wide swings (including the AI-search decline) since both the
       article and the cap move with the language total.
     - clean_frac fracs = A(m) / (U(m) + A(m))  for each clean month, and
       clean_frac = median(fracs), MAD = median absolute deviation of fracs.
   A language with fewer than MIN_CLEAN_MONTHS usable clean months is left
   untouched entirely (fails open to the raw numbers).

2. PER-MONTH, PER-LANGUAGE FLAG. For every month m:
     frac(m) = A(m) / (U(m) + A(m))
     threshold = max(clean_frac + Z_K * 1.4826 * MAD, ABS_FLOOR)
     flagged(m) = frac(m) > threshold
   This is a robust (MAD-based) outlier test against the article's own
   quiet-period automated-traffic norm, with an absolute floor so a language
   with near-zero clean-period MAD cannot be triggered by ordinary noise.

3. CROSS-LANGUAGE CORROBORATION. A bot campaign against a page hits its
   major language editions together; a single real-world traffic spike
   (a playoff run, a signing) usually shows up asymmetrically across
   languages. So a month is only treated as a genuine anomaly for a team if
   at least VOTE_FRAC of its sampled languages (with a valid clean window)
   are flagged that same month.

4. PERSISTENCE. Within a team's corroborated-flag months, only runs of at
   least MIN_RUN consecutive flagged months are capped -- a single-month
   spike (a real event) is not a "campaign ending", a multi-month plateau is.

5. CAP. For each language in a capped run, in each of that run's months:
     expected_user(m) = clean_share * Lagg(m)
     cleaned_U(m) = min( U(m), expected_user(m) * CAP_HEADROOM )
   CAP_HEADROOM (default 1.15) leaves room for genuine organic growth
   coinciding with a flagged month. The rule only ever lowers a value, never
   raises one, and never touches A(m). A team's monthly cleaned figure is
   the sum of cleaned_U(m) across its sampled languages -- unflagged
   languages and unflagged months are passed through unchanged.

TESTED PARAMETERS (see run_sample_test / sample_results.csv, 40-team Step 1
sample): MIN_CLEAN_MONTHS=6, CLEAN_START="202407", Z_K=5, ABS_FLOOR=0.10,
VOTE_FRAC=0.6, MIN_RUN=3, CAP_HEADROOM=1.15. On the sample this cuts the
football Jan-May-2024-vs-clean-rate "cliff ratio" from a raw median of 1.68
to a cleaned median of about 1.2 (a roughly 65 percent reduction of the
excess), while most US-sport teams move by 0 percent and the sample median
move is 0 percent; a small number of individual US teams with unusually
high baseline automated traffic (big-market NBA/NFL franchises) still move
by more than 5 percent -- see the Step 2 section of the handback report for
the honest account of where this first-pass rule falls short of a full
pass, and what a second iteration should add (an events/schedule signal to
separate real spikes from a persistent bot plateau).

NOT APPLIED to data/fans/fan-attention.json or any other existing file by
this script.
"""
import csv
import json
import os
import statistics

MIN_CLEAN_MONTHS = 6
CLEAN_START = "202407"
Z_K = 5
ABS_FLOOR = 0.10
VOTE_FRAC = 0.6
MIN_RUN = 3
CAP_HEADROOM = 1.15

RAW = "data/fans/debot/raw"


def load_series(path):
    if not os.path.exists(path):
        return {}
    d = json.load(open(path, encoding="utf-8"))
    return {it["timestamp"][:6]: it["views"] for it in d.get("items", [])}


def _mad(vals, med):
    d = statistics.median([abs(v - med) for v in vals])
    return d if d > 0 else 0.0001


def lang_baseline(user_series, auto_series, lang_agg_series,
                   clean_start=CLEAN_START, min_clean_months=MIN_CLEAN_MONTHS,
                   z_k=Z_K, abs_floor=ABS_FLOOR):
    """Compute one article-language's clean-period baseline and per-month
    flag. Returns None if there is not enough clean-period data (fail open).
    Otherwise returns (all_months, clean_share, flags) where flags is
    {YYYYMM: bool}."""
    all_months = sorted(set(user_series) | set(auto_series))
    clean_months = [m for m in all_months if m >= clean_start and
                    user_series.get(m, 0) > 0 and lang_agg_series.get(m, 0) > 0]
    if len(clean_months) < min_clean_months:
        return None

    shares = [user_series[m] / lang_agg_series[m] for m in clean_months]
    clean_share = statistics.median(shares)

    fracs = [auto_series.get(m, 0) / (user_series[m] + auto_series.get(m, 0))
             for m in clean_months if (user_series[m] + auto_series.get(m, 0)) > 0]
    if not fracs:
        return None
    clean_frac = statistics.median(fracs)
    mad = _mad(fracs, clean_frac)
    threshold = max(clean_frac + z_k * 1.4826 * mad, abs_floor)

    flags = {}
    for m in all_months:
        u = user_series.get(m, 0)
        a = auto_series.get(m, 0)
        tot = u + a
        flags[m] = tot > 0 and (a / tot) > threshold

    return all_months, clean_share, flags


def team_capped_months(lang_data, vote_frac=VOTE_FRAC, min_run=MIN_RUN):
    """lang_data: {lang: (user_series, auto_series, baseline_or_None)}.
    Returns the set of YYYYMM months where enough of the team's languages
    agree AND the agreement persists for at least min_run consecutive
    months -- the months this rule will actually cap."""
    all_months = sorted({m for _, _, st in lang_data.values() if st for m in st[0]})
    n_langs = sum(1 for _, _, st in lang_data.values() if st)
    if n_langs == 0:
        return set()

    team_flag = {}
    for m in all_months:
        votes = sum(1 for _, _, st in lang_data.values() if st and st[2].get(m))
        team_flag[m] = (votes / n_langs) >= vote_frac

    capped = set()
    i = 0
    while i < len(all_months):
        if team_flag.get(all_months[i]):
            j = i
            while j < len(all_months) and team_flag.get(all_months[j]):
                j += 1
            if j - i >= min_run:
                capped.update(all_months[i:j])
            i = j
        else:
            i += 1
    return capped


def debot_team(team, agg_by_lang, cap_headroom=CAP_HEADROOM):
    """team: {'qid': ..., 'langs': [{'lang': ..}, ...]}. Returns
    (cleaned_monthly_totals, raw_monthly_totals, capped_months) where the
    monthly totals are {YYYYMM: views} summed across the team's sampled
    languages."""
    qid = team["qid"]
    lang_data = {}
    for lg in team["langs"]:
        lang = lg["lang"]
        u = load_series(os.path.join(RAW, f"article_{qid}_{lang}_user.json"))
        a = load_series(os.path.join(RAW, f"article_{qid}_{lang}_automated.json"))
        st = lang_baseline(u, a, agg_by_lang.get(lang, {}))
        lang_data[lang] = (u, a, st)

    capped_months = team_capped_months(lang_data)

    raw_totals = {}
    cleaned_totals = {}
    all_months = sorted({m for u, a, st in lang_data.values() for m in set(u) | set(a)})
    for m in all_months:
        raw_sum = 0.0
        clean_sum = 0.0
        for lang, (u, a, st) in lang_data.items():
            uu = u.get(m, 0)
            raw_sum += uu
            if m in capped_months and st:
                lg_agg = agg_by_lang.get(lang, {}).get(m)
                if lg_agg:
                    uu = min(uu, st[1] * lg_agg * cap_headroom)
            clean_sum += uu
        raw_totals[m] = raw_sum
        cleaned_totals[m] = clean_sum

    return cleaned_totals, raw_totals, capped_months


def run_sample_test():
    """Apply the rule to the Step 1 40-team sample and write
    sample_results.csv: per-team raw vs cleaned totals for Jan-May 2024
    (the anomalous window) and Jun-Dec 2024 (the reference rate), plus the
    resulting "cliff ratio" before and after cleaning."""
    sample = json.load(open("scripts/fans/debot/sample_plan.json", encoding="utf-8"))
    distinct_langs = sorted({lg["lang"] for team in sample for lg in team["langs"]})
    agg_by_lang = {lang: load_series(os.path.join(RAW, f"aggregate_{lang}_user.json"))
                   for lang in distinct_langs}

    jan_may_2024 = [f"2024{m:02d}" for m in range(1, 6)]
    jun_dec_2024 = [f"2024{m:02d}" for m in range(6, 13)]

    rows = []
    for team in sample:
        cleaned, raw, capped = debot_team(team, agg_by_lang)
        raw_jm24 = sum(raw.get(m, 0) for m in jan_may_2024)
        clean_jm24 = sum(cleaned.get(m, 0) for m in jan_may_2024)
        raw_jd24 = sum(raw.get(m, 0) for m in jun_dec_2024)
        clean_jd24 = sum(cleaned.get(m, 0) for m in jun_dec_2024)
        raw_cliff = (raw_jm24 / (raw_jd24 / 7 * 5)) if raw_jd24 else None
        clean_cliff = (clean_jm24 / (clean_jd24 / 7 * 5)) if clean_jd24 else None
        pct_move = ((clean_jm24 - raw_jm24) / raw_jm24 * 100) if raw_jm24 else None
        rows.append({
            "league": team["league"], "team": team["team"], "qid": team["qid"],
            "raw_janmay2024": raw_jm24, "clean_janmay2024": clean_jm24,
            "raw_junedec2024": raw_jd24, "clean_junedec2024": clean_jd24,
            "raw_cliff_ratio": raw_cliff, "clean_cliff_ratio": clean_cliff,
            "pct_move_from_raw_janmay2024": pct_move,
            "n_capped_months": len(capped),
        })

    fieldnames = list(rows[0].keys())
    out_path = "data/fans/debot/sample_results.csv"
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            w.writerow(r)
    return rows, out_path


if __name__ == "__main__":
    rows, path = run_sample_test()
    print(f"wrote {path} ({len(rows)} teams)")
