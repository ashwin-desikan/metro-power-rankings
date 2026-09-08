"""Shared schema helpers for the policy-rate builders.

Every builder under scripts/macro/rates/ writes through this module so the
JSON shape defined in RATES-CONTRACT.md cannot drift between banks.
"""

import csv
import json
import os
import re
from datetime import date, datetime, timedelta

# ---------------------------------------------------------------------------
# Paths and constants

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
SCRATCH = os.path.join(REPO_ROOT, "_scratch", "macro")
OUT_DIR = os.path.join(REPO_ROOT, "public", "data", "business", "economy", "rates")
BIS_CSV = os.path.join(SCRATCH, "bis", "WS_CBPOL_csv_flat.csv")

BUILT_DATE = "2026-09-08"  # today, per the environment; stamped into every file

MAX_DISAGREEMENT_RATE = 0.02  # 2% refusal rule
MIN_OVERLAP_FOR_REFUSAL = 10  # don't refuse on a handful of noisy overlap dates
LEVEL_TOLERANCE = 0.011  # per cent; guards against float rounding, not real gaps

os.makedirs(OUT_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# BIS economy metadata (49 economies present in WS_CBPOL_csv_flat.csv)

BIS_ECONOMIES = {
    "AR": "Argentina",
    "AT": "Austria",
    "AU": "Australia",
    "BE": "Belgium",
    "BR": "Brazil",
    "CA": "Canada",
    "CH": "Switzerland",
    "CL": "Chile",
    "CN": "China",
    "CO": "Colombia",
    "CZ": "Czechia",
    "DE": "Germany",
    "DK": "Denmark",
    "ES": "Spain",
    "FR": "France",
    "GB": "United Kingdom",
    "GR": "Greece",
    "HK": "Hong Kong SAR",
    "HR": "Croatia",
    "HU": "Hungary",
    "ID": "Indonesia",
    "IL": "Israel",
    "IN": "India",
    "IS": "Iceland",
    "IT": "Italy",
    "JP": "Japan",
    "KR": "Korea",
    "KW": "Kuwait",
    "MA": "Morocco",
    "MK": "North Macedonia",
    "MX": "Mexico",
    "MY": "Malaysia",
    "NL": "Netherlands",
    "NO": "Norway",
    "NZ": "New Zealand",
    "PE": "Peru",
    "PH": "Philippines",
    "PL": "Poland",
    "PT": "Portugal",
    "RO": "Romania",
    "RS": "Serbia",
    "RU": "Russia",
    "SA": "Saudi Arabia",
    "SE": "Sweden",
    "TH": "Thailand",
    "TR": "Turkiye",
    "US": "United States",
    "XM": "Euro area",
    "ZA": "South Africa",
}

CURRENCY_BY_ISO2 = {
    "AR": "ARS", "AT": "EUR", "AU": "AUD", "BE": "EUR", "BR": "BRL",
    "CA": "CAD", "CH": "CHF", "CL": "CLP", "CN": "CNY", "CO": "COP",
    "CZ": "CZK", "DE": "EUR", "DK": "DKK", "ES": "EUR", "FR": "EUR",
    "GB": "GBP", "GR": "EUR", "HK": "HKD", "HR": "EUR", "HU": "HUF",
    "ID": "IDR", "IL": "ILS", "IN": "INR", "IS": "ISK", "IT": "EUR",
    "JP": "JPY", "KR": "KRW", "KW": "KWD", "MA": "MAD", "MK": "MKD",
    "MX": "MXN", "MY": "MYR", "NL": "EUR", "NO": "NOK", "NZ": "NZD",
    "PE": "PEN", "PH": "PHP", "PL": "PLN", "PT": "EUR", "RO": "RON",
    "RS": "RSD", "RU": "RUB", "SA": "SAR", "SE": "SEK", "TH": "THB",
    "TR": "TRY", "US": "USD", "XM": "EUR", "ZA": "ZAR",
}

# XM (euro area) special-cased per the contract: bis-xm, "Euro area (BIS)".
BIS_CODE_OVERRIDES = {
    "XM": {"code": "bis-xm", "name": "Euro area (BIS)"},
}


def bis_code_for(iso2):
    if iso2 in BIS_CODE_OVERRIDES:
        return BIS_CODE_OVERRIDES[iso2]["code"]
    return "bis-" + iso2.lower()


def bis_name_for(iso2):
    if iso2 in BIS_CODE_OVERRIDES:
        return BIS_CODE_OVERRIDES[iso2]["name"]
    return BIS_ECONOMIES[iso2]


# ---------------------------------------------------------------------------
# Small date helpers

def iso(d):
    """Accepts a date/datetime or an ISO string and returns YYYY-MM-DD."""
    if isinstance(d, str):
        return d[:10]
    return d.strftime("%Y-%m-%d")


def parse_iso(s):
    return datetime.strptime(s[:10], "%Y-%m-%d").date()


MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12,
}


def parse_loose_date(text, default_day=1, default_month=1):
    """Parses free-text dates like '2 Aug 1990', 'Sep 2009', '1997' into ISO.

    Returns None if nothing recognisable is found. Used for BIS COMPILATION
    era text, which mixes day-month-year, month-year, and bare-year dates.
    """
    text = text.strip().strip(".")
    m = re.match(r"^(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})$", text)
    if m:
        day, mon, year = m.groups()
        mon_num = MONTHS.get(mon.lower()[:4]) or MONTHS.get(mon.lower()[:3])
        if mon_num:
            try:
                return date(int(year), mon_num, int(day)).isoformat()
            except ValueError:
                return None
    m = re.match(r"^([A-Za-z]+)\.?\s+(\d{4})$", text)
    if m:
        mon, year = m.groups()
        mon_num = MONTHS.get(mon.lower()[:4]) or MONTHS.get(mon.lower()[:3])
        if mon_num:
            return date(int(year), mon_num, default_day).isoformat()
    m = re.match(r"^(\d{4})$", text)
    if m:
        return date(int(m.group(1)), default_month, default_day).isoformat()
    return None


# ---------------------------------------------------------------------------
# Core schema helpers

def round4(x):
    if x is None:
        return None
    return round(float(x) + 0.0, 4)


def derive_changes_from_daily(rows, instrument=None):
    """Turns a sorted, deduped-by-date list of daily/near-daily observations
    into the contract's change list: one row per date the level differs from
    the previous KEPT level (or the first row of the input).

    rows: iterable of dicts sorted ascending by 'date', each with a numeric
    'level' and optionally 'lower', 'upper' (range instruments). A row whose
    level equals the previous kept level is dropped -- a level that repeats
    must not emit a change.

    instrument: optional name stamped onto every emitted row (a single string
    covering the whole input), or omit it and set 'instrument' per input row.
    """
    changes = []
    prev_level = None
    for r in rows:
        level = round4(r["level"])
        if level is None:
            continue
        if prev_level is not None and level == prev_level:
            continue
        row = {
            "date": iso(r["date"]),
            "level": level,
            "change": None if prev_level is None else round4(level - prev_level),
        }
        lower = r.get("lower")
        upper = r.get("upper")
        if lower is not None:
            row["lower"] = round4(lower)
        if upper is not None:
            row["upper"] = round4(upper)
        inst = r.get("instrument", instrument)
        if inst:
            row["instrument"] = inst
        changes.append(row)
        prev_level = level
    return changes


def instrument_break_row(date_str, note, instrument=None):
    """A row marking an instrument change: 'break': true, never a silent
    restart. The next real change row after this still carries change=null."""
    row = {"date": iso(date_str), "break": True, "note": note}
    if instrument:
        row["instrument"] = instrument
    return row


def compare_to_bis(own_changes, bis_rows, tolerance=LEVEL_TOLERANCE, from_date=None):
    """Disagreement rate between an own-spine change list and BIS daily
    levels, on overlapping change dates.

    own_changes: the change list about to be published (break rows ignored).
    bis_rows: list of {'date','level'} daily BIS observations (any gaps ok).
    from_date: optional ISO date; only own_changes on/after it are compared
    (used where BIS and the bank's own instrument concept diverge before a
    known date, e.g. the Fed's discount-rate era).

    Returns {'overlap', 'disagree', 'rate', 'disagree_dates'}.
    """
    bis_changes = derive_changes_from_daily(sorted(bis_rows, key=lambda r: r["date"]))
    own_by_date = {
        c["date"]: c["level"]
        for c in own_changes
        if not c.get("break") and (from_date is None or c["date"] >= from_date)
    }
    bis_by_date = {c["date"]: c["level"] for c in bis_changes}
    overlap = sorted(set(own_by_date) & set(bis_by_date))
    disagree = [d for d in overlap if abs(own_by_date[d] - bis_by_date[d]) > tolerance]
    rate = (len(disagree) / len(overlap)) if overlap else 0.0
    return {
        "overlap": len(overlap),
        "disagree": len(disagree),
        "rate": rate,
        "disagree_dates": disagree,
    }


def check_bis_agreement(own_changes, bis_rows, bank_code, from_date=None,
                         min_overlap=MIN_OVERLAP_FOR_REFUSAL):
    """Runs compare_to_bis and enforces the contract's 2% refusal rule.

    Raises RuntimeError (never writes a file) if the own spine disagrees with
    BIS on more than 2% of overlapping change dates, provided there is enough
    overlap to trust the signal. Always prints the result so a run's console
    output carries the disagreement rate even when it passes.
    """
    result = compare_to_bis(own_changes, bis_rows, from_date=from_date)
    print(
        "  BIS cross-check: {overlap} overlapping change dates, "
        "{disagree} disagree ({rate:.1%})".format(**result)
    )
    if result["overlap"] >= min_overlap and result["rate"] > MAX_DISAGREEMENT_RATE:
        raise RuntimeError(
            "{}: disagrees with BIS on {:.1%} of {} overlapping change dates "
            "(> 2% refusal threshold), refusing to write. First disagreement "
            "dates: {}".format(
                bank_code, result["rate"], result["overlap"],
                result["disagree_dates"][:10],
            )
        )
    return result


# ---------------------------------------------------------------------------
# Era kind classification (policy vs market) and short-name derivation

# Hard-coded overrides for era text the keyword rule would misjudge (checked
# by hand): the Bank of Japan and SNB/RBNZ "operating target (BIS-derived)"
# style names are the bank's own announced target, just sourced via BIS
# daily data for convenience, so they stay "policy" even though a couple of
# them use market-sounding words. Norway's 1987-1990 BIS bridge, by
# contrast, is explicitly the general "operative rate" during a gap where
# Norges Bank published no decision table at all, which is what BIS's own
# daily series over a market-priced instrument looks like, so it is marked
# "market".
KIND_OVERRIDES = {
    "Call rate target / policy rate (BIS-derived)": "policy",
    "BIS-derived (operative rate)": "market",
    # Brazil's SELIC and Korea's base rate are both explicitly named
    # "target" rates in their own BIS COMPILATION text, but each also
    # contains a market keyword ("money market", "call rate") that the
    # default rule would misread.
    "Central Bank target, money market (SELIC) overnight rate": "policy",
    "target overnight call rate(base rate)": "policy",
    # Greece's discount-rate text incidentally uses "the rate becomes
    # effective" (a methodology note about WHEN a change took effect, not a
    # market-traded rate) -- the "effective" keyword is a false positive.
    "rate imposed on trade advances at the head offices of the National "
    "Bank of Greece (NBG) in Athens and the discount rate by the Bank of "
    "Greece sourced from Lazaretou (2014). Between 1956 and 1993, the day "
    "the rate becomes effective is assumed to be the first day of the "
    "month.  Before 1956, whenever the day of changes is not available, "
    "it is set to the end-of-month": "policy",
    # Argentina's post-2025 text explicitly says there is no set target;
    # whatever BIS publishes there is a prevailing market level, not a
    # decision.
    "no policy rate adopted": "market",
    # These two Argentina eras average auction-clearing outcomes ("accepted
    # offers", "weighted average ... at the last auction"), a market-priced
    # result even though the instrument is central-bank paper.
    "average interest rate of the accepted offers for the liquidity bills": "market",
    "weighted average interest rate of minimum term LELIQ issued at the "
    "last auction process": "market",
    # New Zealand before the OCR framework (from 1999-03-17): the cash rate
    # was market-determined, exactly as in Australia before 1990.
    "overnight cash rate": "market",
}

# Keywords that mark a traded/market-observed proxy rate, never a rate the
# bank sets by decision. "middle of ... range" is handled separately below
# per the contract (it counts as policy even though "range" alone does not
# imply anything either way); an announced call-rate TARGET ("the BOJ
# encourages the ... call rate to remain at", "target overnight call
# rate") is also policy despite containing "call rate", so that check runs
# before the generic keyword loop.
MARKET_KEYWORDS = (
    "interbank", "call rate", "effective", "money market",
    "market-determined", "market determined", "market rate",
)


def classify_kind(text):
    """'policy' (the bank sets it by decision) or 'market' (a traded rate
    BIS uses as a proxy), decided from the era text by keyword, with
    hard-coded overrides for the handful of genuinely ambiguous cases."""
    if text in KIND_OVERRIDES:
        return KIND_OVERRIDES[text]
    t = text.lower()
    if "middle of" in t and "range" in t:
        return "policy"
    if "call rate" in t and ("encourages" in t or "target" in t or "guideline" in t):
        return "policy"
    for kw in MARKET_KEYWORDS:
        if kw in t:
            return "market"
    return "policy"


# Short-name overrides for era text longer than 40 characters, or where the
# generic splitter's result reads worse than a hand-picked label.
SHORT_NAME_OVERRIDES = {
    "Policy rate (repo rate until 2022-06-08)": "Policy rate",
    "Call rate target / policy rate (BIS-derived)": "Call rate target",
    "Interbank overnight cash rate (BIS-derived, market rate)": "Interbank overnight cash rate",
    "Federal funds target range": "Fed funds target range",
    "Federal funds target rate": "Fed funds target rate",
}

SHORT_NAME_MAX = 40


def derive_short_name(text):
    """A short (<40 char) label for an era, the bank's own term where
    possible. Checks SHORT_NAME_OVERRIDES first, then tries splitting the
    text at the first natural break, then falls back to a hard truncation."""
    if text in SHORT_NAME_OVERRIDES:
        return SHORT_NAME_OVERRIDES[text]
    t = text.strip()
    if len(t) <= SHORT_NAME_MAX:
        return t
    for sep in (" (", ", ", ": ", "; "):
        if sep in t:
            head = t.split(sep)[0].strip()
            if 0 < len(head) <= SHORT_NAME_MAX:
                return head
    return t[:SHORT_NAME_MAX - 3].rstrip() + "..."


def write_bank(code, name, short, country, iso2, currency, founded,
                instruments, changes, coverage, sources, out_dir=OUT_DIR):
    """Validates and writes public/data/business/economy/rates/<code>.json.

    `instruments` comes in as [{'from','to','name'}] (the builder's era
    boundaries; 'name' is treated as the full source description). `changes`
    comes in as a flat, date-sorted list of already-deduped level rows (each
    optionally carrying 'lower'/'upper'/'secondary') plus break rows, exactly
    as produced by derive_changes_from_daily()/instrument_break_row() -- a
    per-row 'instrument' string is tolerated but ignored: era membership is
    decided purely by date against `instruments`, which is more robust than
    trusting a string a builder might have set by hand.

    On write, this function:
      - classifies each era 'policy' or 'market' (classify_kind, with
        overrides) and gives it a short `name` (derive_short_name) alongside
        the full `text`; prints every era's verdict for review.
      - splits `changes` rows by era kind: policy-era rows keep their place
        in `changes` (era = index into instruments[]), break rows always
        stay in `changes`; market-era rows are summarised into `market`
        (one entry per market era: observation count, first/last/min/max)
        and never appear as individual rows in `changes`.
      - builds a compact `path` of [date, level] points spanning the whole
        series for charting: every point for policy eras, thinned to at
        most one point per ISO week (keeping each era's first and last
        point) for market eras.
    """
    dated = sorted(changes, key=lambda c: c["date"])
    if dated != changes:
        raise RuntimeError("{}: changes not sorted ascending".format(code))

    for row in changes:
        if row["date"] > BUILT_DATE:
            raise RuntimeError(
                "{}: change on {} is after the build date {}".format(
                    code, row["date"], BUILT_DATE
                )
            )

    if not instruments:
        raise RuntimeError("{}: no instruments, refusing to write".format(code))

    # classify + name every era, print the verdicts for review
    print("  instrument eras for {}:".format(code))
    built_instruments = []
    for era in instruments:
        text = era["name"]
        kind = classify_kind(text)
        short_name = derive_short_name(text)
        built_instruments.append({
            "from": era["from"], "to": era["to"],
            "name": short_name, "text": text, "kind": kind,
        })
        print("    [{}] {:<7} {:<32} ({} to {})".format(
            len(built_instruments) - 1, kind, short_name,
            era["from"], era["to"] or "present"))

    # assign each row (break or not) to an era purely by date
    def era_index(d):
        for i, era in enumerate(built_instruments):
            if (era["from"] is None or d >= era["from"]) and (era["to"] is None or d <= era["to"]):
                return i
        return None

    final_changes = []
    market_rows_by_era = {}
    all_rows_by_era = {}  # policy + market, for first_change/last_change fallback
    for row in changes:
        idx = era_index(row["date"])
        if idx is None:
            raise RuntimeError(
                "{}: row on {} falls outside every instrument era".format(code, row["date"])
            )
        if row.get("break"):
            out = {k: v for k, v in row.items() if k != "instrument"}
            out["era"] = idx
            final_changes.append(out)
            continue
        all_rows_by_era.setdefault(idx, []).append(row)
        if built_instruments[idx]["kind"] == "policy":
            out = {k: v for k, v in row.items() if k != "instrument"}
            out["era"] = idx
            final_changes.append(out)
        else:
            market_rows_by_era.setdefault(idx, []).append(row)

    final_changes.sort(key=lambda c: c["date"])

    # market[] summary, one entry per market era with any rows
    market = []
    for idx in sorted(market_rows_by_era):
        rows = sorted(market_rows_by_era[idx], key=lambda r: r["date"])
        levels = [r["level"] for r in rows]
        market.append({
            "era": idx,
            "from": rows[0]["date"],
            "to": rows[-1]["date"],
            "observations": len(rows),
            "first": levels[0],
            "last": levels[-1],
            "min": min(levels),
            "max": max(levels),
        })

    # path: every point for policy eras, thinned to <=1/week for market eras,
    # concatenated in era order
    path = []
    for idx in range(len(built_instruments)):
        rows = sorted(all_rows_by_era.get(idx, []), key=lambda r: r["date"])
        if not rows:
            continue
        if built_instruments[idx]["kind"] == "policy":
            keep = rows
        else:
            keep = _thin_weekly(rows)
        path.extend([[r["date"], r["level"]] for r in keep])

    # first_change/last_change: prefer the real decision record; for a bank
    # with no policy rows at all (an all-market run), fall back to the full
    # series span so the file still carries a meaningful date range.
    policy_only = [c for c in final_changes if not c.get("break")]
    if policy_only:
        first_change = policy_only[0]["date"]
        last_change = policy_only[-1]["date"]
    else:
        all_dates = [r["date"] for rows in all_rows_by_era.values() for r in rows]
        if not all_dates:
            raise RuntimeError("{}: no data rows at all, refusing to write".format(code))
        first_change = min(all_dates)
        last_change = max(all_dates)

    data = {
        "code": code,
        "name": name,
        "short": short,
        "country": country,
        "iso2": iso2,
        "currency": currency,
        "founded": founded,
        "first_change": first_change,
        "last_change": last_change,
        "built": BUILT_DATE,
        "instruments": built_instruments,
        "changes": final_changes,
        "market": market,
        "path": path,
        "coverage": coverage,
        "sources": sources,
    }

    path_out = os.path.join(out_dir, "{}.json".format(code))
    with open(path_out, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    return path_out


def _thin_weekly(rows):
    """Keeps at most one row per ISO (year, week), always keeping the first
    and last row of the run so the span's endpoints are never lost."""
    if len(rows) <= 2:
        return list(rows)
    out = [rows[0]]
    last_week = parse_iso(rows[0]["date"]).isocalendar()[:2]
    for r in rows[1:-1]:
        wk = parse_iso(r["date"]).isocalendar()[:2]
        if wk != last_week:
            out.append(r)
            last_week = wk
    if rows[-1]["date"] != out[-1]["date"]:
        out.append(rows[-1])
    return out


# ---------------------------------------------------------------------------
# Index helpers

def trailing_365_changes(real_changes, built=BUILT_DATE):
    cutoff = (parse_iso(built) - timedelta(days=365)).isoformat()
    return [c for c in real_changes if c["date"] > cutoff and c["date"] <= built]


def direction_from_changes(trailing):
    moves = [c["change"] for c in trailing if c.get("change") not in (None, 0)]
    if not moves:
        return "hold"
    signs = set(1 if m > 0 else -1 for m in moves)
    if signs == {1}:
        return "hiking"
    if signs == {-1}:
        return "cutting"
    return "mixed"


def compute_index_entry(bank):
    """Index counts (changes, changes_12m, direction_12m, hold_days) use
    policy-era rows only, per the contract. `series_from` is the file's
    overall span start (first_change: real founding for own-spine banks
    where known, a BIS series start otherwise); `founded` is the real
    institutional founding date and is null when the builder doesn't know
    one (every BIS-only file)."""
    policy_changes = [c for c in bank["changes"] if not c.get("break")]
    instruments = bank.get("instruments") or []
    latest_kind = instruments[-1]["kind"] if instruments else None

    entry = {
        "code": bank["code"],
        "name": bank["name"],
        "short": bank["short"],
        "iso2": bank["iso2"],
        "founded": bank.get("founded"),
        "series_from": bank["first_change"],
        "last_change": bank["last_change"],
        "spine": bank["coverage"]["spine"],
    }

    if policy_changes:
        last = policy_changes[-1]
        trailing = trailing_365_changes(policy_changes, bank["built"])
        hold_days = (parse_iso(bank["built"]) - parse_iso(last["date"])).days
        level = last["level"]
        if latest_kind == "market" and bank.get("market"):
            level = bank["market"][-1]["last"]
        entry.update({
            "level": level,
            "changes": len(policy_changes),
            "changes_12m": len(trailing),
            "hold_days": hold_days,
            "direction_12m": "market" if latest_kind == "market" else direction_from_changes(trailing),
        })
    else:
        # no policy-era decisions in the file at all (an all-market run)
        market = bank.get("market") or []
        last_obs = market[-1] if market else None
        entry.update({
            "level": last_obs["last"] if last_obs else None,
            "changes": 0,
            "changes_12m": 0,
            "hold_days": None,
            "direction_12m": "market",
        })
    return entry


# ---------------------------------------------------------------------------
# BIS CSV streaming reader

def stream_bis_daily(iso2_filter=None):
    """Streams WS_CBPOL_csv_flat.csv once, yielding
    (iso2, date, level, compilation_text) for FREQ=D rows only.

    iso2_filter: optional set/list of iso2 codes to keep; None keeps all 49.
    Never loads the file whole -- uses csv.reader over an open file handle.
    """
    keep = set(iso2_filter) if iso2_filter else None
    with open(BIS_CSV, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader)
        assert header[3].startswith("FREQ"), "unexpected BIS column layout"
        for row in reader:
            freq = row[3].split(":")[0].strip()
            if freq != "D":
                continue
            area = row[4].split(":")[0].strip()
            if keep is not None and area not in keep:
                continue
            val = row[6].strip()
            if not val or val.upper() == "NAN":
                continue
            try:
                level = float(val)
            except ValueError:
                continue
            yield area, row[5].strip(), level, row[10]


def load_bis_daily(iso2):
    """Convenience: one BIS economy's full daily series as a list of
    {'date','level'} dicts sorted ascending, plus its COMPILATION text
    (taken from the first row that carries one)."""
    rows = []
    compilation = ""
    for area, d, level, comp in stream_bis_daily({iso2}):
        rows.append({"date": d, "level": level})
        if comp and not compilation:
            compilation = comp
    rows.sort(key=lambda r: r["date"])
    return rows, compilation


def load_bis_daily_all(iso2_list=None):
    """One streaming pass over the 470MB BIS CSV, returning every requested
    economy's daily series at once: {iso2: (rows, compilation)}. Use this
    instead of calling load_bis_daily() in a loop -- each load_bis_daily
    call is its own full pass, and 49 of them is far slower than one."""
    keep = set(iso2_list) if iso2_list else None
    buckets = {}
    compilations = {}
    for area, d, level, comp in stream_bis_daily(keep):
        buckets.setdefault(area, []).append({"date": d, "level": level})
        if comp and area not in compilations:
            compilations[area] = comp
    for area in buckets:
        buckets[area].sort(key=lambda r: r["date"])
    return {area: (buckets[area], compilations.get(area, "")) for area in buckets}


# ---------------------------------------------------------------------------
# BIS COMPILATION-text era parser

_ERA_SPLIT_RE = re.compile(r";\s*")
_MISSING_SEMICOLON_RE = re.compile(
    r"(:\s*)(from\s+\d{1,2}\s+[A-Za-z]+\.?\s+\d{4})", re.IGNORECASE
)
# Some BIS economies (e.g. Croatia) separate dated clauses with ". From"
# instead of "; from" -- normalise that to a semicolon too, but only before
# a capital "From" that starts a new dated clause, so an ordinary sentence
# ending in "." is left alone.
_PERIOD_FROM_RE = re.compile(r"\.\s+(From\s+\d{1,2}\s+[A-Za-z]+\.?\s+\d{4})")
# A date token, matched strictly (not a lazy .+?) so the optional separator
# in _PRIOR_RE can't make the whole date match collapse to one character:
# "D Mon YYYY", "Mon YYYY", or a bare "YYYY".
_DATE_TOKEN = r"\d{1,2}\s+[A-Za-z]+\.?\s+\d{4}|[A-Za-z]+\.?\s+\d{4}|\d{4}"
_ONWARDS_RE = re.compile(r"^from\s+({})\s+onwards[:,]?\s*(.+)$".format(_DATE_TOKEN), re.IGNORECASE)
_RANGE_RE = re.compile(r"^from\s+({})\s+(?:to|till)\s+({})[:,]\s*(.+)$".format(_DATE_TOKEN, _DATE_TOKEN), re.IGNORECASE)
_PRIOR_RE = re.compile(r"^(?:prior to|before)\s+({})[:,]?\s*(.+)$".format(_DATE_TOKEN), re.IGNORECASE)
_FROM_ONLY_RE = re.compile(r"^from\s+({})[:,]\s*(.+)$".format(_DATE_TOKEN), re.IGNORECASE)
_NOT_ITEMISED_RE = re.compile(r"refer to|https?://", re.IGNORECASE)


def parse_instrument_eras(text):
    """Parses BIS COMPILATION-style text ("From D Mon YYYY onwards: X; from
    ... to ...: Y; ...") into a list of {'from','to','name'} eras, oldest
    first. Returns [] if the text does not parse into any dated segment (the
    caller should fall back to a single undated instrument in that case).

    A handful of BIS economies write two dated clauses back to back with a
    colon instead of a semicolon between them (no "; " separator), or use
    "till" instead of "to" -- both are normalised before splitting."""
    if not text:
        return []
    normalised = _PERIOD_FROM_RE.sub(r"; \1", text.strip())
    normalised = _MISSING_SEMICOLON_RE.sub(r"\1; \2", normalised)
    segments = [s.strip() for s in _ERA_SPLIT_RE.split(normalised) if s.strip()]
    eras = []
    for seg in segments:
        m = _RANGE_RE.match(seg)
        if m:
            d1, d2, name = m.groups()
            f = parse_loose_date(d1)
            t = parse_loose_date(d2, default_day=28, default_month=12)
            if f:
                eras.append({"from": f, "to": t, "name": name.strip().rstrip(".").rstrip(":").strip()})
            continue
        m = _ONWARDS_RE.match(seg)
        if m:
            d1, name = m.groups()
            f = parse_loose_date(d1)
            if f:
                eras.append({"from": f, "to": None, "name": name.strip().rstrip(".").rstrip(":").strip()})
            continue
        m = _PRIOR_RE.match(seg)
        if m:
            d1, name = m.groups()
            t = parse_loose_date(d1)
            if t:
                clean_name = name.strip().rstrip(".").rstrip(":").strip()
                if _NOT_ITEMISED_RE.search(clean_name):
                    clean_name = "Policy rate (not itemised by BIS before {})".format(t)
                eras.append({"from": None, "to": t, "name": clean_name})
            continue
        m = _FROM_ONLY_RE.match(seg)
        if m:
            d1, name = m.groups()
            f = parse_loose_date(d1)
            if f:
                eras.append({"from": f, "to": None, "name": name.strip().rstrip(".").rstrip(":").strip()})
            continue
    eras.sort(key=lambda e: e["from"] or "0000-00-00")
    return eras


def instrument_name_for_date(eras, d, fallback):
    for era in eras:
        if (era["from"] is None or d >= era["from"]) and (era["to"] is None or d <= era["to"]):
            return era["name"]
    return fallback


# ---------------------------------------------------------------------------
# No-em-dash guard (contract style rule for text we author into JSON/code)

def assert_no_em_dash(*texts):
    for t in texts:
        if t and "—" in t:
            raise RuntimeError("em dash found in authored text: {!r}".format(t))
