# -*- coding: utf-8 -*-
"""Build public/data/forecast.json from data/forecast/ inputs. Stdlib only.

Method (documented on /elections/forecast):
  UK — recency-weighted polling average (14-day half-life, latest poll per
  pollster, sample-size dampened), proportional swing applied per party to
  the 650 GE2024 constituency results (Commons Library), 4,000 Monte Carlo
  simulations with horizon-scaled national error plus per-seat noise. NI's
  18 seats are held at their 2024 outcome. The result is a seat RANGE, not
  a call: three years out, national polls carry 6-plus points of error.
  US — mean of the major generic-ballot aggregators, mapped to House seats
  through a seats-votes fit on the 2012-2024 cycles, simulated with the
  historical error of generic-ballot averages at this horizon.
  Error scale informed by FiveThirtyEight's raw-polls archive (CC BY 4.0)
  and Jennings & Wlezien's timeline-of-elections work; the simple weighted
  average follows the validation in the MIT-licensed election-polling-
  aggregator study (5-poll rolling average, 1.3pt MAE on holdout cycles).
"""
import json, math, os, random, sys
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hub_dates  # single source of election dates: lib/electionHubsMeta.ts

sys.stdout.reconfigure(encoding="utf-8")
random.seed(20260722)  # deterministic output per input set
IN = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "data", "forecast")
PUB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "public", "data")
TODAY = date.today()

# Election dates come from lib/electionHubsMeta.ts via hub_dates.resolve().
# The date() literal below each call is the model's OWN assumption, used only
# while the hub has no confirmed date; a confirmed hub date always wins and the
# swap is printed at run time. Never edit a date here without editing the hub.
UK_ELECTION, UK_CONF = hub_dates.resolve("uk", date(2029, 5, 3), "United Kingdom")
US_ELECTION, US_CONF = hub_dates.resolve("us", date(2026, 11, 3), "United States")
UK_PARTIES = ["con", "lab", "ld", "ref", "grn", "snp"]
PARTY_NAMES = {"con": "Conservative", "lab": "Labour", "ld": "Liberal Democrat", "ref": "Reform UK",
               "grn": "Green", "snp": "SNP", "pc": "Plaid Cymru", "oth": "Others", "ni": "NI parties"}

def months_until(d):
    return max(0.5, (d - TODAY).days / 30.44)

# ---------------- UK polling average ----------------

def uk_average(polls):
    HALF_LIFE = 14.0
    WINDOW = 45
    latest = {}
    for p in polls:
        pd = datetime.strptime(p["date"], "%Y-%m-%d").date()
        if (TODAY - pd).days > WINDOW:
            continue
        key = p["pollster"].lower()
        if key not in latest or p["date"] > latest[key]["date"]:
            latest[key] = p
    if not latest:
        return None, 0
    sums, wsum = {k: 0.0 for k in UK_PARTIES}, {k: 0.0 for k in UK_PARTIES}
    for p in latest.values():
        pd = datetime.strptime(p["date"], "%Y-%m-%d").date()
        age = (TODAY - pd).days
        w = 0.5 ** (age / HALF_LIFE)
        if p.get("sample"):
            w *= min(1.4, math.sqrt(min(p["sample"], 5000) / 1500))
        for k in UK_PARTIES:
            if k in p:
                sums[k] += w * p[k]
                wsum[k] += w
    avg = {k: round(sums[k] / wsum[k], 1) for k in UK_PARTIES if wsum[k] > 0}
    return avg, len(latest)

def uk_trend(polls):
    """Fortnightly unweighted means for the tracker chart."""
    buckets = {}
    for p in polls:
        pd = datetime.strptime(p["date"], "%Y-%m-%d").date()
        key = (pd.year, (pd.timetuple().tm_yday - 1) // 14)
        buckets.setdefault(key, []).append(p)
    out = []
    for key in sorted(buckets):
        rows = buckets[key]
        mid = sorted(r["date"] for r in rows)[len(rows) // 2]
        pt = {"date": mid, "n": len(rows)}
        for k in UK_PARTIES:
            vals = [r[k] for r in rows if k in r]
            if vals:
                pt[k] = round(sum(vals) / len(vals), 1)
        out.append(pt)
    return out

# ---------------- UK seat simulation ----------------

def uk_simulate(avg, base_seats, sims=4000):
    gb = [s for s in base_seats if s["country"] != "Northern Ireland"]
    ni = len(base_seats) - len(gb)
    # national 2024 GB shares (unweighted mean over seats is close enough for
    # ratios; the Commons Library national figures differ by <0.3pt)
    nat24 = {}
    for k in UK_PARTIES + ["pc", "oth"]:
        nat24[k] = sum(s["shares"].get(k, 0.0) for s in gb) / len(gb)
    months = months_until(UK_ELECTION)
    horizon = math.sqrt(months / 12.0)
    def sigma(share):
        return min(9.0, max(2.0, (1.2 + 0.20 * share) * horizon))
    seat_noise = 3.0
    tallies = {k: [] for k in UK_PARTIES + ["pc", "oth"]}
    largest = {k: 0 for k in UK_PARTIES + ["pc", "oth"]}
    majority = {k: 0 for k in UK_PARTIES + ["pc", "oth"]}
    MAJ = 326
    for _ in range(sims):
        nat = {}
        for k in UK_PARTIES:
            nat[k] = max(0.5, random.gauss(avg[k], sigma(avg[k])))
        nat["pc"] = max(0.2, random.gauss(nat24["pc"], 0.3))
        nat["oth"] = max(0.5, nat24["oth"])
        ratio = {k: (nat[k] / nat24[k] if nat24[k] > 0.2 else 1.0) for k in nat}
        counts = {k: 0 for k in tallies}
        for s in gb:
            best, bestv = "oth", -1.0
            for k, r in ratio.items():
                v = s["shares"].get(k, 0.0) * r + random.gauss(0, seat_noise)
                if v > bestv:
                    best, bestv = k, v
            counts[best] += 1
        for k, c in counts.items():
            tallies[k].append(c)
        win = max(counts, key=counts.get)
        largest[win] += 1
        for k, c in counts.items():
            if c >= MAJ:
                majority[k] += 1
    def pct(x): return round(100.0 * x / sims, 1)
    seats = {}
    for k, arr in tallies.items():
        arr.sort()
        seats[k] = {"median": arr[len(arr) // 2],
                    "lo": arr[int(sims * 0.05)],
                    "hi": arr[int(sims * 0.95)]}
    hung = sims - sum(majority.values())
    return {
        "seats": seats, "niSeats": ni, "majorityNeeds": MAJ,
        "pLargest": {k: pct(v) for k, v in largest.items() if v > 0},
        "pMajority": {k: pct(v) for k, v in majority.items() if v > 0},
        "pHung": pct(hung),
        "monthsOut": round(months, 1), "sims": sims,
        "nat2024": {k: round(v, 1) for k, v in nat24.items()},
    }

# ---------------- US ----------------

# National House popular-vote margin (D minus R, pts) vs Democratic seats.
US_SEATS_VOTES = [
    (2012, 1.2, 201), (2014, -5.7, 188), (2016, -1.1, 194),
    (2018, 8.6, 235), (2020, 3.1, 222), (2022, -2.8, 213), (2024, -2.7, 215),
]

def us_fit():
    xs = [m for _, m, _ in US_SEATS_VOTES]
    ys = [s for _, _, s in US_SEATS_VOTES]
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)
    a = my - b * mx
    resid = [y - (a + b * x) for x, y in zip(xs, ys)]
    sd = math.sqrt(sum(r * r for r in resid) / (n - 2))
    return a, b, sd

def us_forecast(usdata, sims=20000):
    aggs = usdata.get("aggregators", [])
    if not aggs:
        return None
    margins = [a["dem"] - a["rep"] for a in aggs if "dem" in a and "rep" in a]
    margin = sum(margins) / len(margins)
    months = months_until(US_ELECTION)
    sigma_margin = 2.2 + 0.9 * math.sqrt(months / 12.0)  # generic-ballot avg error at horizon
    a, b, resid_sd = us_fit()
    dem_seats, dem_house = [], 0
    for _ in range(sims):
        m = random.gauss(margin, sigma_margin)
        s = a + b * m + random.gauss(0, resid_sd)
        s = max(150, min(285, round(s)))
        dem_seats.append(s)
        if s >= 218:
            dem_house += 1
    dem_seats.sort()
    return {
        "margin": round(margin, 1), "sigma": round(sigma_margin, 1),
        "aggregators": [{"source": g["source"], "dem": g.get("dem"), "rep": g.get("rep"), "updated": g.get("updated")} for g in aggs],
        "demSeats": {"median": dem_seats[len(dem_seats) // 2],
                     "lo": dem_seats[int(sims * 0.05)], "hi": dem_seats[int(sims * 0.95)]},
        "pDemHouse": round(100.0 * dem_house / sims, 1),
        "fit": {"a": round(a, 1), "b": round(b, 2), "residSd": round(resid_sd, 1),
                "cycles": US_SEATS_VOTES},
        "monthsOut": round(months, 1), "sims": sims,
    }

# ---------------- US Senate ----------------

def senate_forecast(sen, sims=20000):
    """Ratings-based: consensus agency score per race mapped to a win
    probability, simulated with a correlated national-environment draw plus
    per-race noise. The agencies already price in today's environment, so the
    environment term models CHANGE between now and November."""
    races = sen.get("races", [])
    if not races:
        return None
    carry_d = sen["senateNow"]["D"] - sen["seatsUp"]["D"]
    carry_r = sen["senateNow"]["R"] - sen["seatsUp"]["R"]
    K = 1.17          # logistic slope: Solid/Safe (|3|) -> ~97%
    ENV_SD = 0.35     # correlated shift in score units between now and election day
    RACE_SD = 0.30    # idiosyncratic per-race noise
    def logistic(x):
        return 1.0 / (1.0 + math.exp(-K * x))
    d_tot, d_control = [], 0
    for _ in range(sims):
        env = random.gauss(0, ENV_SD)
        d = carry_d
        for r in races:
            p = logistic(r["score"] + env + random.gauss(0, RACE_SD))
            if random.random() < p:
                d += 1
        d_tot.append(d)
        if d >= 51:   # a 50-50 Senate breaks Republican on the VP's vote
            d_control += 1
    d_tot.sort()
    hot = sorted(races, key=lambda r: abs(r["score"]))[:6]
    return {
        "races": len(races), "carryover": {"D": carry_d, "R": carry_r},
        "seatsUp": sen["seatsUp"], "senateNow": sen["senateNow"],
        "demSeats": {"median": d_tot[len(d_tot) // 2],
                     "lo": d_tot[int(sims * 0.05)], "hi": d_tot[int(sims * 0.95)]},
        "pDemControl": round(100.0 * d_control / sims, 1),
        "competitive": [{"state": r["state"], "held": r["incumbentParty"],
                         "score": r["score"], "retiring": r["retiring"],
                         "pDem": round(100 * logistic(r["score"]), 0)} for r in hot],
        "sims": sims,
        "source": sen["source"],
    }

# ---------------- US Governors ----------------

def governors_forecast(gov, sims=20000):
    """Ratings-based, mirroring senate_forecast. Aggregate is the number of
    governorships each party HOLDS after November (out of 50): the carryover
    governors not up this cycle plus the simulated winners of the 36 states on
    the ballot. Unlike the Senate there is no single control threshold — the
    natural summary is total mansions held and the odds of a majority (>=26)."""
    races = gov.get("races", [])
    if not races:
        return None
    carry_d = gov["governorsNow"]["D"] - gov["seatsUp"]["D"]
    carry_r = gov["governorsNow"]["R"] - gov["seatsUp"]["R"]
    K = 1.17          # logistic slope: Solid/Safe (|3|) -> ~97%
    ENV_SD = 0.35     # correlated shift in score units between now and election day
    RACE_SD = 0.30    # idiosyncratic per-race noise
    def logistic(x):
        return 1.0 / (1.0 + math.exp(-K * x))
    d_tot, d_majority, r_majority = [], 0, 0
    for _ in range(sims):
        env = random.gauss(0, ENV_SD)
        d = carry_d
        for r in races:
            p = logistic(r["score"] + env + random.gauss(0, RACE_SD))
            if random.random() < p:
                d += 1
        d_tot.append(d)
        if d >= 26:       # a majority of the 50 governorships
            d_majority += 1
        elif d <= 24:     # Republican majority (d == 25 is an exact 25-25 split)
            r_majority += 1
    d_tot.sort()
    hot = sorted(races, key=lambda r: abs(r["score"]))[:8]
    return {
        "races": len(races), "carryover": {"D": carry_d, "R": carry_r},
        "seatsUp": gov["seatsUp"], "governorsNow": gov["governorsNow"],
        "demSeats": {"median": d_tot[len(d_tot) // 2],
                     "lo": d_tot[int(sims * 0.05)], "hi": d_tot[int(sims * 0.95)]},
        "pDemMajority": round(100.0 * d_majority / sims, 1),
        "pRepMajority": round(100.0 * r_majority / sims, 1),
        "competitive": [{"state": r["state"], "held": r["incumbentParty"],
                         "score": r["score"], "retiring": r["retiring"],
                         "pDem": round(100 * logistic(r["score"]), 0)} for r in hot],
        "sims": sims,
        "source": gov["source"],
    }

# ---------------- shared: recency-weighted average over share rows ----------------

def weighted_recent(rows, window=45, half_life=14.0):
    """rows: [{date, shares:{name: pct}}] -> (weighted avg per name, n, latest date)."""
    sums, wsum, n, latest = {}, {}, 0, None
    for r in rows:
        pd = datetime.strptime(r["date"], "%Y-%m-%d").date()
        if (TODAY - pd).days > window:
            continue
        n += 1
        latest = r["date"] if latest is None else max(latest, r["date"])
        w = 0.5 ** ((TODAY - pd).days / half_life)
        for k, v in r["shares"].items():
            sums[k] = sums.get(k, 0.0) + w * v
            wsum[k] = wsum.get(k, 0.0) + w
    return {k: round(sums[k] / wsum[k], 1) for k in sums}, n, latest

# ---------------- New Zealand (MMP, Sainte-Laguë) ----------------

NZ_ELECTION, NZ_CONF = hub_dates.resolve("nz", date(2026, 10, 17), "New Zealand")
NZ_PARTIES = ["nat", "lab", "grn", "act", "nzf", "tpm", "top"]
NZ_WAIVER = {"act", "tpm"}         # assumed to retain an electorate seat (threshold waiver)

def nz_average(polls):
    HALF_LIFE, WINDOW = 21.0, 90   # NZ polls are roughly monthly
    latest = {}
    for p in polls:
        pd = datetime.strptime(p["date"], "%Y-%m-%d").date()
        if (TODAY - pd).days > WINDOW or "election result" in p["pollster"].lower():
            continue
        key = p["pollster"].lower()
        if key not in latest or p["date"] > latest[key]["date"]:
            latest[key] = p
    if not latest:
        return None, 0
    sums = {k: 0.0 for k in NZ_PARTIES}
    wsum = {k: 0.0 for k in NZ_PARTIES}
    for p in latest.values():
        pd = datetime.strptime(p["date"], "%Y-%m-%d").date()
        w = 0.5 ** ((TODAY - pd).days / HALF_LIFE)
        if p.get("sample"):
            w *= min(1.4, math.sqrt(min(p["sample"], 5000) / 1500))
        for k in NZ_PARTIES:
            if k in p:
                sums[k] += w * p[k]
                wsum[k] += w
    return {k: round(sums[k] / wsum[k], 1) for k in NZ_PARTIES if wsum[k] > 0}, len(latest)

def sainte_lague(shares, seats=120):
    quots = []
    for k, v in shares.items():
        for d in range(seats):
            quots.append((v / (2 * d + 1), k))
    quots.sort(key=lambda q: -q[0])
    alloc = {k: 0 for k in shares}
    for _, k in quots[:seats]:
        alloc[k] += 1
    return alloc

def nz_forecast(nzdata, sims=10000):
    avg, npolls = nz_average(nzdata.get("polls", []))
    if not avg:
        return None
    months = months_until(NZ_ELECTION)
    horizon = math.sqrt(months / 12.0)
    def sigma(share):
        return min(6.0, max(1.2, (1.0 + 0.15 * share) * horizon))
    RIGHT, LEFT = ("nat", "act", "nzf"), ("lab", "grn", "tpm")
    tallies = {k: [] for k in NZ_PARTIES}
    right_maj = left_maj = neither = 0
    for _ in range(sims):
        draw = {k: max(0.0, random.gauss(avg.get(k, 0.0), sigma(avg.get(k, 0.0)))) for k in NZ_PARTIES}
        # 5% party-vote threshold; ACT and Te Pāti Māori assumed to keep an
        # electorate seat, which waives it (approximated as >=1% of the vote)
        qual = {k: v for k, v in draw.items() if v >= 5.0 or (k in NZ_WAIVER and v >= 1.0)}
        if not qual:
            continue
        alloc = sainte_lague(qual)
        for k in NZ_PARTIES:
            tallies[k].append(alloc.get(k, 0))
        r = sum(alloc.get(k, 0) for k in RIGHT)
        l = sum(alloc.get(k, 0) for k in LEFT)
        if r >= 61:
            right_maj += 1
        elif l >= 61:
            left_maj += 1
        else:
            neither += 1
    def rng(arr):
        arr.sort()
        return {"median": arr[len(arr) // 2], "lo": arr[int(len(arr) * 0.05)], "hi": arr[int(len(arr) * 0.95)]}
    return {
        "electionAssumed": NZ_ELECTION.isoformat(),  # legacy key, kept for rollout
        "electionDate": NZ_ELECTION.isoformat(),
        "electionConfidence": NZ_CONF,
        "average": avg, "pollsters": npolls,
        "latestPollDate": nzdata["polls"][-1]["date"] if nzdata.get("polls") else None,
        "seats": {k: rng(v) for k, v in tallies.items() if v},
        "pRightBloc": round(100.0 * right_maj / sims, 1),
        "pLeftBloc": round(100.0 * left_maj / sims, 1),
        "pNeither": round(100.0 * neither / sims, 1),
        "monthsOut": round(months, 1), "sims": sims,
        "sources": [nzdata["source"]],
    }

# ---------------- Israel (seat polls, Gov-bloc column) ----------------

IL_ELECTION, IL_CONF = hub_dates.resolve("il", date(2026, 10, 27), "Israel")

def il_forecast(ildata, sims=8000):
    polls = ildata.get("polls", [])
    if not polls:
        return None
    HALF_LIFE = 21.0
    latest = {}
    for p in polls:
        key = p["pollster"].lower()
        if key not in latest or p["date"] > latest[key]["date"]:
            latest[key] = p
    sums, wsum, govs = {}, {}, []
    for p in latest.values():
        pd = datetime.strptime(p["date"], "%Y-%m-%d").date()
        w = 0.5 ** ((TODAY - pd).days / HALF_LIFE)
        for k, v in p["seats"].items():
            sums[k] = sums.get(k, 0.0) + w * v
            wsum[k] = wsum.get(k, 0.0) + w
        if p.get("gov") is not None:
            govs.append((w, p["gov"]))
    avg = {k: sums[k] / wsum[k] for k in sums}
    total = sum(avg.values())
    if total:
        avg = {k: v * 120.0 / total for k, v in avg.items()}
    months = months_until(IL_ELECTION)
    gov_avg = sum(w * g for w, g in govs) / sum(w for w, _ in govs) if govs else None
    p61 = None
    if gov_avg is not None:
        sig = 2.0 + 2.5 * math.sqrt(months / 12.0)   # bloc-total seat error at horizon
        p61 = round(100.0 * sum(1 for _ in range(sims) if random.gauss(gov_avg, sig) >= 61) / sims, 1)
    return {
        "electionAssumed": IL_ELECTION.isoformat(),  # legacy key, kept for rollout
        "electionDate": IL_ELECTION.isoformat(),
        "electionConfidence": IL_CONF,
        "parties": [{"name": k, "seats": round(v, 1)} for k, v in sorted(avg.items(), key=lambda kv: -kv[1])],
        "polls": len(polls), "pollsters": len(latest),
        "latestPollDate": polls[-1]["date"],
        "gov": {"avg": round(gov_avg, 1) if gov_avg is not None else None, "pMajority": p61},
        "monthsOut": round(months, 1), "sims": sims,
        "sources": [ildata["source"]],
    }

# ---------------- Brazil (two-round presidential) ----------------

BR_ELECTION, BR_CONF = hub_dates.resolve("br", date(2026, 10, 4), "Brazil")

def matchup_forecast(matchups, months, base_sigma, window, sims=10000):
    merged = {}
    for m in matchups:
        key = tuple(m["names"]) if "names" in m else m.get("title", "")
        merged.setdefault(key, []).extend(m["polls"])
    sig = base_sigma + 3.0 * math.sqrt(months / 12.0)
    out = []
    for names, rows in merged.items():
        avg, n, latest = weighted_recent(rows, window=window)
        if len(avg) < 2 or n == 0:
            continue
        a, b = sorted(avg, key=lambda k: -avg[k])[:2]
        margin = avg[a] - avg[b]
        pa = sum(1 for _ in range(sims) if random.gauss(margin, sig) > 0) / sims
        out.append({"a": a, "b": b, "avgA": avg[a], "avgB": avg[b],
                    "pA": round(100.0 * pa, 1), "polls": n, "latest": latest})
    out.sort(key=lambda m: m["latest"] or "", reverse=True)
    return out

def br_forecast(brdata):
    first, n1, latest1 = weighted_recent(brdata.get("firstRound", []), window=45)
    if not first:
        return None
    months = months_until(BR_ELECTION)
    return {
        "election": BR_ELECTION.isoformat(),
        "electionDate": BR_ELECTION.isoformat(),
        "electionConfidence": BR_CONF,
        "firstRound": {"shares": {k: v for k, v in sorted(first.items(), key=lambda kv: -kv[1])},
                       "polls": n1, "latest": latest1},
        "runoffs": matchup_forecast(brdata.get("matchups", []), months, base_sigma=3.0, window=150),
        "monthsOut": round(months, 1),
        "sources": [brdata["source"]],
    }

# ---------------- France (2027 presidential, scenario polling) ----------------

FR_ELECTION, FR_CONF = hub_dates.resolve("fr", date(2027, 4, 11), "France")

def fr_forecast(frdata):
    first, n1, latest1 = weighted_recent(frdata.get("firstRound", []), window=120)
    months = months_until(FR_ELECTION)
    runoffs = matchup_forecast(frdata.get("matchups", []), months, base_sigma=4.0, window=180)
    if not first and not runoffs:
        return None
    return {
        "electionAssumed": FR_ELECTION.isoformat(),  # legacy key, kept for rollout
        "electionDate": FR_ELECTION.isoformat(),
        "electionConfidence": FR_CONF,
        "firstRound": {"shares": {k: v for k, v in sorted(first.items(), key=lambda kv: -kv[1])},
                       "polls": n1, "latest": latest1},
        "runoffs": runoffs,
        "monthsOut": round(months, 1),
        "sources": [frdata["source"]],
    }


# ---------------- eve-of-election freeze ----------------
#
# A forecast that is not written down before the result is not a forecast, it
# is a memory. Every run overwrites the snapshot for each race that has not yet
# voted; the moment election day passes, the file stops being touched and is,
# by construction, the last forecast published before the polls opened. No
# scheduling, no eve-of-poll cron, nothing to forget.
#
# scripts/forecast/score_forecasts.py joins these to data/forecast/results/.
SNAP_DIR = os.path.join(IN, "snapshots")


def freeze_pre_election(blocks):
    """Persist the current forecast for every race still in the future."""
    os.makedirs(SNAP_DIR, exist_ok=True)
    frozen = []
    for code, block in blocks.items():
        if not block:
            continue
        iso = block.get("electionDate") or block.get("election") or block.get("electionAssumed")
        if not iso:
            continue
        try:
            when = datetime.strptime(iso, "%Y-%m-%d").date()
        except ValueError:
            continue
        if when <= TODAY:
            continue  # voted, or voting today: whatever is on disk is final
        path = os.path.join(SNAP_DIR, "%s-%s.json" % (code, iso))
        payload = {"code": code, "election": iso,
                   "confidence": block.get("electionConfidence", "assumed"),
                   "built": TODAY.isoformat(),
                   "daysBefore": (when - TODAY).days,
                   "block": block}
        json.dump(payload, open(path, "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        frozen.append("%s@%s(-%dd)" % (code, iso, (when - TODAY).days))
    if frozen:
        print("froze pre-election snapshots:", ", ".join(frozen))
    return frozen


# ---------------- main ----------------

def main():
    ukdata = json.load(open(os.path.join(IN, "uk_polls.json"), encoding="utf-8"))
    usdata = json.load(open(os.path.join(IN, "us_polls.json"), encoding="utf-8"))
    base = json.load(open(os.path.join(IN, "uk_base_2024.json"), encoding="utf-8"))

    avg, npolls = uk_average(ukdata["polls"])
    print("UK average over", npolls, "pollsters:", avg)
    trend = uk_trend(ukdata["polls"])
    uk = {
        "electionAssumed": UK_ELECTION.isoformat(),  # legacy key, kept for rollout
        "electionDate": UK_ELECTION.isoformat(),
        "electionConfidence": UK_CONF,
        "average": avg, "pollsters": npolls,
        "latestPollDate": ukdata["polls"][-1]["date"] if ukdata["polls"] else None,
        "trend": trend,
        "sim": uk_simulate(avg, base["seats"]),
        "sources": [ukdata["source"], base["source"]],
    }
    print("UK seats:", {k: v for k, v in uk["sim"]["seats"].items() if v["median"] > 0})
    print("UK pLargest:", uk["sim"]["pLargest"], "pMajority:", uk["sim"]["pMajority"], "pHung:", uk["sim"]["pHung"])

    us = us_forecast(usdata)
    if us:
        us["election"] = US_ELECTION.isoformat()
        us["electionDate"] = US_ELECTION.isoformat()
        us["electionConfidence"] = US_CONF
        us["sources"] = [usdata["source"]]
        print("US margin D%+.1f -> D seats" % us["margin"], us["demSeats"], "P(D House)", us["pDemHouse"])
        sen_path = os.path.join(IN, "us_senate.json")
        if os.path.exists(sen_path):
            sen = json.load(open(sen_path, encoding="utf-8"))
            us["senate"] = senate_forecast(sen)
            if us["senate"]:
                us["sources"].append(sen["source"])
                print("US Senate: D seats", us["senate"]["demSeats"], "P(D control)", us["senate"]["pDemControl"],
                      "carryover", us["senate"]["carryover"])
        gov_path = os.path.join(IN, "us_governors.json")
        if os.path.exists(gov_path):
            gov = json.load(open(gov_path, encoding="utf-8"))
            us["governors"] = governors_forecast(gov)
            if us["governors"]:
                us["sources"].append(gov["source"])
                print("US Governors: D seats", us["governors"]["demSeats"], "P(D majority)", us["governors"]["pDemMajority"],
                      "carryover", us["governors"]["carryover"])

    def load_optional(fname, fn, label):
        path = os.path.join(IN, fname)
        if not os.path.exists(path):
            return None
        try:
            res = fn(json.load(open(path, encoding="utf-8")))
            if res:
                print(label, "OK")
            return res
        except Exception as e:
            print(label, "FAILED:", e)
            return None

    nz = load_optional("nz_polls.json", nz_forecast, "NZ")
    il = load_optional("il_polls.json", il_forecast, "IL")
    br = load_optional("br_polls.json", br_forecast, "BR")
    fr = load_optional("fr_polls.json", fr_forecast, "FR")
    if nz:
        print("  NZ avg:", nz["average"], "P(right)", nz["pRightBloc"], "P(left)", nz["pLeftBloc"], "P(neither)", nz["pNeither"])
    if il:
        print("  IL top:", il["parties"][:4], "gov:", il["gov"])
    if br:
        print("  BR R1:", br["firstRound"]["shares"], "runoffs:", br["runoffs"])
    if fr:
        print("  FR R1:", fr["firstRound"]["shares"], "runoffs:", len(fr["runoffs"]))

    # rolling history so the trackers deepen with every weekly run
    hist_path = os.path.join(IN, "history.json")
    hist = json.load(open(hist_path, encoding="utf-8")) if os.path.exists(hist_path) else {"snapshots": []}
    snaps = hist["snapshots"]
    if not snaps or (TODAY - datetime.strptime(snaps[-1]["date"], "%Y-%m-%d").date()).days >= 3:
        snaps.append({"date": TODAY.isoformat(), "uk": avg,
                      "us": {"margin": us["margin"]} if us else None,
                      "ukSeats": {k: v["median"] for k, v in uk["sim"]["seats"].items()},
                      "usDemSeats": us["demSeats"]["median"] if us else None})
        json.dump(hist, open(hist_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    out = {
        "built": TODAY.isoformat(),
        "method": "Recency-weighted poll averages; UK proportional swing on GE2024 constituency results with Monte Carlo error; US seats-votes fit on 2012-2024; NZ Sainte-Laguë; IL seat-poll averages; BR/FR round averages. Full method notes on the page.",
        "uk": uk, "us": us,
        "nz": nz, "il": il, "br": br, "fr": fr,
        "history": hist["snapshots"],
    }
    json.dump(out, open(os.path.join(PUB, "forecast.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("wrote public/data/forecast.json")

    freeze_pre_election({"uk": uk, "us": us, "nz": nz, "il": il, "br": br, "fr": fr})

if __name__ == "__main__":
    main()
