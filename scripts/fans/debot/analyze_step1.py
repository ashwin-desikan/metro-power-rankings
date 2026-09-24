#!/usr/bin/env python3
"""Step 1 analysis: load raw pageview JSON, compute normalised 2024 vs 2025
user-share, automated/user ratio by month, and break-month detection for the
40-team sample. Prints a by-league summary table and writes a detail CSV."""
import csv
import json
import os
import statistics

RAW = "data/fans/debot/raw"
OUT_DIR = "data/fans/debot"

def load(name):
    p = os.path.join(RAW, name)
    if not os.path.exists(p):
        return None
    return json.load(open(p, encoding="utf-8"))

def series(data):
    """timestamp(YYYYMM) -> views"""
    if not data:
        return {}
    return {it["timestamp"][:6]: it["views"] for it in data.get("items", [])}

def months_range(a, b):
    out = []
    y, m = int(a[:4]), int(a[4:6])
    ey, em = int(b[:4]), int(b[4:6])
    while (y, m) <= (ey, em):
        out.append(f"{y:04d}{m:02d}")
        m += 1
        if m > 12:
            m = 1
            y += 1
    return out

ALL_MONTHS = months_range("202301", "202608")
JAN_MAY_2024 = [f"2024{m:02d}" for m in range(1, 6)]
JAN_MAY_2025 = [f"2025{m:02d}" for m in range(1, 6)]

sample = json.load(open("scripts/fans/debot/sample_plan.json", encoding="utf-8"))

# aggregate user totals by lang
agg_user = {}
distinct_langs = sorted({lg["lang"] for team in sample for lg in team["langs"]})
for lang in distinct_langs:
    d = load(f"aggregate_{lang}_user.json")
    agg_user[lang] = series(d)

detail_rows = []
league_teams = {}

for team in sample:
    qid = team["qid"]
    league = team["league"]
    league_teams.setdefault(league, []).append(team)
    team_user_by_lang = {}
    team_auto_by_lang = {}
    for lg in team["langs"]:
        lang = lg["lang"]
        u = series(load(f"article_{qid}_{lang}_user.json"))
        a = series(load(f"article_{qid}_{lang}_automated.json"))
        team_user_by_lang[lang] = u
        team_auto_by_lang[lang] = a

        agg = agg_user.get(lang, {})
        u24 = sum(u.get(m, 0) for m in JAN_MAY_2024)
        u25 = sum(u.get(m, 0) for m in JAN_MAY_2025)
        agg24 = sum(agg.get(m, 0) for m in JAN_MAY_2024)
        agg25 = sum(agg.get(m, 0) for m in JAN_MAY_2025)
        share24 = (u24 / agg24) if agg24 else None
        share25 = (u25 / agg25) if agg25 else None
        norm_change = None
        if share24 and share25 is not None and share24 > 0:
            norm_change = (share25 - share24) / share24

        # break detection: month-over-month drop in user views around mid-2024,
        # flagged when a month's user views fall by >40% from the prior month
        # AND stay down (not a one-month blip): compare trailing-3 average
        # before vs after.
        break_month = None
        months_sorted = ALL_MONTHS
        vals = [u.get(m, 0) for m in months_sorted]
        for i in range(3, len(months_sorted) - 3):
            before = statistics.mean(vals[i-3:i]) if i >= 3 else None
            after = statistics.mean(vals[i:i+3])
            if before and before > 0 and after < before * 0.6:
                break_month = months_sorted[i]
                break

        auto_user_ratio = {}
        for m in months_sorted:
            uv = u.get(m, 0)
            av = a.get(m, 0)
            auto_user_ratio[m] = (av / uv) if uv else None

        pre_ratios = [auto_user_ratio[m] for m in months_sorted if m < "202406" and auto_user_ratio[m] is not None]
        post_ratios = [auto_user_ratio[m] for m in months_sorted if m >= "202407" and auto_user_ratio[m] is not None]
        pre_med = statistics.median(pre_ratios) if pre_ratios else None
        post_med = statistics.median(post_ratios) if post_ratios else None

        detail_rows.append({
            "league": league, "team": team["team"], "qid": qid, "lang": lang,
            "u_janmay2024": u24, "u_janmay2025": u25,
            "agg_janmay2024": agg24, "agg_janmay2025": agg25,
            "share2024": share24, "share2025": share25, "norm_change": norm_change,
            "break_month": break_month,
            "auto_user_ratio_pre_jun2024_median": pre_med,
            "auto_user_ratio_post_jun2024_median": post_med,
        })

# write detail csv
fieldnames = list(detail_rows[0].keys())
with open(os.path.join(OUT_DIR, "step1_detail.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=fieldnames)
    w.writeheader()
    for r in detail_rows:
        w.writerow(r)

# league summary
print(f"{'League':<15} {'n_pairs':>7} {'median_norm_chg':>16} {'share_break_Jun24':>18} {'other_break_months':>20} {'top_lang_carrying_drop':>24}")
for league, teams in league_teams.items():
    rows = [r for r in detail_rows if r["league"] == league]
    changes = [r["norm_change"] for r in rows if r["norm_change"] is not None]
    med_change = statistics.median(changes) if changes else None
    n = len(rows)
    n_break_jun = sum(1 for r in rows if r["break_month"] == "202406")
    other_breaks = sorted({r["break_month"] for r in rows if r["break_month"] and r["break_month"] != "202406"})
    # which lang has largest median negative norm_change
    by_lang = {}
    for r in rows:
        if r["norm_change"] is not None:
            by_lang.setdefault(r["lang"], []).append(r["norm_change"])
    lang_meds = {l: statistics.median(v) for l, v in by_lang.items()}
    worst_lang = min(lang_meds, key=lambda l: lang_meds[l]) if lang_meds else None
    print(f"{league:<15} {n:>7} {med_change*100 if med_change is not None else float('nan'):>15.1f}% {f'{n_break_jun}/{n}':>18} {','.join(other_breaks) or '-':>20} {f'{worst_lang}:{lang_meds.get(worst_lang,0)*100:.0f}%' if worst_lang else '-':>24}")

print()
print("Overall automated/user ratio, pre vs post June 2024 (median across all sample rows):")
pre = [r["auto_user_ratio_pre_jun2024_median"] for r in detail_rows if r["auto_user_ratio_pre_jun2024_median"] is not None]
post = [r["auto_user_ratio_post_jun2024_median"] for r in detail_rows if r["auto_user_ratio_post_jun2024_median"] is not None]
print(f"  pre-Jun2024 median ratio: {statistics.median(pre):.4f}")
print(f"  post-Jun2024 median ratio: {statistics.median(post):.4f}")

# football vs US sports comparison
football_leagues = {"Premier League", "La Liga", "Bundesliga", "Serie A"}
us_leagues = {"NFL", "NBA", "MLB", "NHL"}
def league_group_stats(leagues_set):
    rows = [r for r in detail_rows if r["league"] in leagues_set]
    changes = [r["norm_change"] for r in rows if r["norm_change"] is not None]
    breaks = sum(1 for r in rows if r["break_month"] == "202406")
    return statistics.median(changes) if changes else None, breaks, len(rows)

fm, fb, fn = league_group_stats(football_leagues)
um, ub, un = league_group_stats(us_leagues)
print()
print(f"Football (Prem/LaLiga/Bund/SerieA) median norm change 2024->2025: {fm*100:.1f}%  break@Jun2024: {fb}/{fn}")
print(f"US sports (NFL/NBA/MLB/NHL) median norm change 2024->2025: {um*100:.1f}%  break@Jun2024: {ub}/{un}")
