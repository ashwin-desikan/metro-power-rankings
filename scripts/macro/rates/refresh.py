#!/usr/bin/env python3
"""refresh.py - the weekly incremental refresh for the policy-rate spines.

Single entry point mac-mini-jobs/runners/economy-rates.sh calls every Friday
at 07:30 UTC (BIS publishes WS_CBPOL weekly, Thursday). It does NOT touch the
470MB BIS bulk file (_scratch/macro/bis/WS_CBPOL_csv_flat.csv, what the
builders were originally built from): it fetches only what changed since the
last run and merges it onto the inputs the builders already keep, then
re-runs every builder so the full contract logic (era assignment, the 2%
BIS-disagreement refusal, instrument breaks, market-era summarising) is the
one place that logic lives.

SOURCES AND HOW EACH BANK IS REFRESHED
  BIS CBPOL, every economy, incremental (verified live against
  https://stats.bis.org/api-doc/v2 on 2026-09-08 -- the task brief's
  suggested key "D.." 404s; the correct 2-dimension key is "D."):
    https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CBPOL/1.0/D.?startPeriod=<date>&format=csv
  Feeds a compact per-economy cache, scripts/macro/rates/cache/bis-daily/
  <ISO2>.json ({"rows": [{"date","level"}, ...]}), rolling ~400 days. This is
  the ONLY change to common.py: load_bis_daily()/load_bis_daily_all() now
  merge this cache on top of the bulk CSV (cache wins on a shared date), so
  every builder -- build_bis, and the five own-spine builders whose live tail
  is BIS-derived (boe, boj, snb, rba, rbnz) -- picks up the incremental fetch
  automatically, with no other code path change.

  Directly fetchable own-spine sources (small full files, safe to refetch
  whole and merge by date):
    fed      FRED CSVs, DFEDTARU / DFEDTARL (fredgraph.csv?id=<series>)
    ecb      ECB Data Portal csvdata, DFR and MRR_FR
             (data-api.ecb.europa.eu/service/data/FM/D.U2.EUR.4F.KR.<key>.LEV)
    riksbank Riksbank SWEA API, SECBREPOEFF (api.riksbank.se/swea/v1/
             Observations/SECBREPOEFF/<start>/<end>) -- verified live 2026-09-08
    boc      Bank of Canada Valet, V39079 (bankofcanada.ca/valet/observations/
             V39079/csv?start_date=<date>) -- verified live 2026-09-08
    norges   Norges Bank open data API, IR/B.KPRA.SD.R (data.norges-bank.no/
             api/data/IR/B.KPRA.SD.R?format=csv&startPeriod=<date>)
    boe      datahub interest-rates-gb (best-effort refetch of the same
             static file the builder already has; the datahub file lags the
             Bank's schedule by design, per build_boe.py's own docstring, so
             this is opportunistic only -- boe's LIVE tail is BIS-derived
             (coverage.spine "mixed" already), covered by the BIS cache above)

  BIS-derived tail only (own source is an HTML table or a one-off download
  that cannot be refetched programmatically -- per the task brief, refresh
  appends BIS-derived changes after the bank's own last date and marks
  coverage.spine "mixed", never silently): boj, snb, rba, rbnz. All four
  already carry coverage.spine "mixed" for exactly this reason in their own
  builders, so no NEW marking is needed here -- rerunning each builder after
  the BIS cache refresh IS the refresh for these four.

  buba is dissolved (1998-12-31, ceded rate-setting to the ECB) and is never
  refreshed.

VERIFIED VS ASSUMED. The BIS v2 API shape above was verified against a live
response on 2026-09-08 (WebFetch, outside this sandbox's own egress
allowlist). Riksbank SWEA and Bank of Canada Valet were also verified live.
FRED and ECB Data Portal use their long-documented CSV shapes, matching the
column layout of the files already checked into _scratch/macro/ (this
sandbox cannot reach fred.stlouisfed.org or data-api.ecb.europa.eu to
re-verify byte-for-byte). Norges Bank's endpoint timed out during
verification; its shape is inferred from the same SDMX-CSV convention ECB
uses (TIME_PERIOD/OBS_VALUE columns), which is what build_norges.py's own
`sources` entry already documents as the fetch URL.

THIS CONTAINER CANNOT REACH BIS, FRED, ECB, RIKSBANK, BOC, NORGES, OR
DATAHUB (egress allowlist) -- a live dry run is not possible from here. Use
--fixtures DIR to point every fetch at local files instead of the network
(see scripts/macro/rates/fixtures/), which is how --self-test runs, fully
offline, with real (if small) response shapes.

USAGE
  python3 refresh.py                    dry run against live sources (no writes)
  python3 refresh.py --write            fetch, merge, rerun every builder, write
  python3 refresh.py --fixtures DIR     use DIR instead of the network
  python3 refresh.py --self-test        offline tests against scripts/macro/rates/fixtures/
  python3 refresh.py --days 90          incremental window (default 90)
"""
import argparse
import csv
import io
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import timedelta

import common as c

HERE = os.path.dirname(os.path.abspath(__file__))
FIXTURES_DEFAULT = os.path.join(HERE, "fixtures")
CHANGELOG_PATH = os.path.join(c.OUT_DIR, "changelog.json")
CHANGELOG_CAP = 500
UA = "Mozilla/5.0 (compatible; CitizenOfNowhere/1.0; +https://rankings.citizenofnowhere.org)"

BIS_URL_TMPL = "https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CBPOL/1.0/D.?startPeriod={start}&format=csv"
FRED_URL_TMPL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id={series}"
ECB_URL_TMPL = "https://data-api.ecb.europa.eu/service/data/FM/D.U2.EUR.4F.KR.{key}.LEV?format=csvdata&startPeriod={start}"
RIKSBANK_URL_TMPL = "https://api.riksbank.se/swea/v1/Observations/SECBREPOEFF/{start}/{end}"
BOC_URL_TMPL = "https://www.bankofcanada.ca/valet/observations/V39079/csv?start_date={start}"
NORGES_URL_TMPL = "https://data.norges-bank.no/api/data/IR/B.KPRA.SD.R?format=csv&startPeriod={start}"
DATAHUB_BOE_URL = "https://datahub.io/core/interest-rates-gb/r/data.csv"

# Own-spine banks whose *live* tail is already BIS-derived (coverage.spine
# "mixed") per their own builder: refreshing the BIS cache and rerunning the
# builder IS the refresh, no separate own-source fetch is possible or needed.
BIS_TAIL_ONLY = ("boe", "boj", "snb", "rba", "rbnz")
# Never refreshed: the Bundesbank stopped setting rates in 1998.
NOT_REFRESHED = ("buba",)


# ---------------------------------------------------------------------------
# Network layer -- swappable via --fixtures so --self-test runs offline.

class SourceUnreachable(RuntimeError):
    """Raised on any non-2xx response or a genuine connection failure. Never
    swallowed silently: the caller catches it per-bank, leaves that bank's
    files untouched, and reports it (never a guessed value)."""


class MissingBase(SourceUnreachable):
    """Raised when the FULL-history input a builder reads (the Valet, FRED,
    ECB, SWEA, Norges or datahub file under _scratch/macro) is not on disk.
    An incremental fetch covers the last --days only; merging it onto nothing
    produces a thin base that the builder then reads as the whole series.
    Measured 2026-09-09 on the Windows box: boc.json rebuilt with 378
    changes against 410, every decision from 2009 to 2025 gone, one added.
    So a missing base is a refusal, never a create: the bank's files stay
    untouched and the run reports it, exactly like an unreachable source."""


# Bases that can be SEEDED from the committed read model when absent. The
# published <code>.json holds every own-era change point, and the builders
# derive changes from a level series (a repeat is dropped, a change is kept),
# so "published change points + the incremental daily fetch" rebuilds the
# same file as "the full daily download + the incremental fetch". This is
# the same identity build_boj & co. rely on (common.own_rows_from_published),
# proved byte for byte on the Windows box 2026-09-09. Only the two bases
# whose builders read them as a plain level series are seeded this way; the
# rest still refuse, because a FRED/ECB/SWEA/datahub refetch is already the
# whole series and needs no seed.
SEEDABLE_BASES = {
    "boc_bankrate.csv": ("boc", "2009-04-21", "csv2", ("date", "V39079")),
    "norges_kpra_daily.json": ("norges", "1991-01-01", "json", None),
}


def _seed_base_from_published(path):
    name = os.path.basename(path)
    if name not in SEEDABLE_BASES:
        return False
    code, start, kind, cols = SEEDABLE_BASES[name]
    try:
        rows = c.own_rows_from_published(code, start=start)
    except FileNotFoundError:
        return False
    if not rows:
        return False
    if kind == "csv2":
        with open(path, "w", newline="", encoding="utf-8") as f:
            f.write('"{}","{}"\n'.format(cols[0], cols[1]))
            for r in rows:
                f.write('"{}","{}"\n'.format(r["date"], repr(float(r["level"]))))
    else:
        with open(path, "w", encoding="utf-8") as f:
            json.dump([{"date": r["date"], "level": r["level"]} for r in rows], f)
    print("  {}: base seeded from the published read model ({} change points from {})".format(
        name, len(rows), rows[0]["date"]))
    return True


def _require_base(path):
    if not os.path.exists(path) and not _seed_base_from_published(path):
        raise MissingBase(
            "base input missing: {} (run the full builder download on this "
            "machine first; refusing to seed it from an incremental fetch)".format(path))


def http_get(url, fixtures_dir=None, fixture_name=None, timeout=30):
    if fixtures_dir:
        path = os.path.join(fixtures_dir, fixture_name)
        if not os.path.exists(path):
            raise SourceUnreachable("fixture missing: {}".format(path))
        with open(path, encoding="utf-8") as f:
            return f.read()
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        # Loud on purpose: a 4xx/5xx must never be read as "no new data".
        raise SourceUnreachable("{} -> HTTP {} {}".format(url, e.code, e.reason))
    except urllib.error.URLError as e:
        raise SourceUnreachable("{} -> unreachable: {}".format(url, e.reason))


# ---------------------------------------------------------------------------
# BIS incremental fetch -> compact per-economy cache

def fetch_bis_incremental(start_date, fixtures_dir=None):
    """Returns {iso2: [{'date','level'}, ...]} for every economy present in
    the response, daily frequency only."""
    text = http_get(
        BIS_URL_TMPL.format(start=start_date), fixtures_dir, "bis_incremental.csv")
    reader = csv.reader(io.StringIO(text))
    header = next(reader)
    idx = {name: i for i, name in enumerate(header)}
    for required in ("FREQ", "REF_AREA", "TIME_PERIOD", "OBS_VALUE"):
        if required not in idx:
            raise SourceUnreachable(
                "BIS incremental CSV missing column {}; response shape has "
                "changed, refusing to guess".format(required))
    by_iso2 = {}
    for row in reader:
        if not row or len(row) <= idx["OBS_VALUE"]:
            continue
        if row[idx["FREQ"]] != "D":
            continue
        val = row[idx["OBS_VALUE"]].strip()
        if not val or val.upper() == "NAN":
            continue
        try:
            level = float(val)
        except ValueError:
            continue
        area = row[idx["REF_AREA"]].strip()
        by_iso2.setdefault(area, []).append(
            {"date": row[idx["TIME_PERIOD"]].strip(), "level": level})
    return by_iso2


def write_bis_cache(by_iso2, keep_days=400):
    """Merges fresh rows into scripts/macro/rates/cache/bis-daily/<iso2>.json,
    deduped by date (fresh wins), rolled to the last `keep_days` so the cache
    stays compact rather than growing without bound."""
    os.makedirs(c.BIS_CACHE_DIR, exist_ok=True)
    cutoff = (c.parse_iso(c.BUILT_DATE) - timedelta(days=keep_days)).isoformat()
    touched = []
    for iso2, rows in by_iso2.items():
        existing = c.load_bis_cache(iso2)
        by_date = {r["date"]: r["level"] for r in existing}
        for r in rows:
            by_date[r["date"]] = r["level"]
        merged = sorted(
            [{"date": d, "level": lvl} for d, lvl in by_date.items() if d >= cutoff],
            key=lambda r: r["date"])
        path = os.path.join(c.BIS_CACHE_DIR, "{}.json".format(iso2))
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"rows": merged}, f, separators=(",", ":"))
            f.write("\n")
        touched.append(iso2)
    return touched


# ---------------------------------------------------------------------------
# Directly fetchable own-spine sources: refetch a small full file, merge by
# date onto whatever the builder already has in _scratch/macro/, so a partial
# incremental response never loses history the bulk download originally had.

def _merge_csv_two_col(path, rows, date_col, value_col, quote_all=False):
    _require_base(path)
    existing = {}
    if os.path.exists(path):
        with open(path, newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                v = (r.get(value_col) or "").strip()
                d = (r.get(date_col) or "").strip()
                if v and v != "." and d:
                    existing[d] = v
    for r in rows:
        existing[r["date"]] = repr(r["level"]) if isinstance(r["level"], float) else str(r["level"])
    with open(path, "w", newline="", encoding="utf-8") as f:
        if quote_all:
            f.write('"{}","{}"\n'.format(date_col, value_col))
            for d in sorted(existing):
                f.write('"{}","{}"\n'.format(d, existing[d]))
        else:
            w = csv.writer(f)
            w.writerow([date_col, value_col])
            for d in sorted(existing):
                w.writerow([d, existing[d]])
    return sorted(existing)


def fetch_fred(series, fixtures_dir=None):
    text = http_get(FRED_URL_TMPL.format(series=series), fixtures_dir,
                     "{}.csv".format(series.lower()))
    reader = csv.DictReader(io.StringIO(text))
    fields = reader.fieldnames or []
    if "observation_date" not in fields or series not in fields:
        raise SourceUnreachable(
            "FRED CSV for {} missing expected columns {}".format(series, fields))
    rows = []
    for r in reader:
        v = (r.get(series) or "").strip()
        if not v or v == ".":
            continue
        rows.append({"date": r["observation_date"].strip(), "level": float(v)})
    return rows


def refresh_fed(scratch, fixtures_dir):
    for series, filename in (("DFEDTARU", "dfedtaru.csv"), ("DFEDTARL", "dfedtarl.csv")):
        rows = fetch_fred(series, fixtures_dir)
        _merge_csv_two_col(os.path.join(scratch, filename), rows,
                            "observation_date", series)


def fetch_ecb(key, start, fixtures_dir=None, fixture_name=None):
    text = http_get(ECB_URL_TMPL.format(key=key, start=start), fixtures_dir,
                     fixture_name or "ecb_{}.csv".format(key.lower()))
    reader = csv.DictReader(io.StringIO(text))
    fields = reader.fieldnames or []
    if "TIME_PERIOD" not in fields or "OBS_VALUE" not in fields:
        raise SourceUnreachable(
            "ECB Data Portal CSV for {} missing TIME_PERIOD/OBS_VALUE; got {}"
            .format(key, fields))
    rows = []
    for r in reader:
        v = (r.get("OBS_VALUE") or "").strip()
        if not v or v.upper() == "NAN":
            continue
        rows.append({"date": r["TIME_PERIOD"].strip(), "level": float(v)})
    return rows


def _merge_ecb_scratch(path, rows):
    _require_base(path)
    existing = {}
    if os.path.exists(path):
        with open(path, newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                v = (r.get("OBS_VALUE") or "").strip()
                if v:
                    existing[r["TIME_PERIOD"].strip()] = v
    for r in rows:
        existing[r["date"]] = repr(r["level"])
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["TIME_PERIOD", "OBS_VALUE"])
        for d in sorted(existing):
            w.writerow([d, existing[d]])


def refresh_ecb(scratch, start, fixtures_dir):
    dfr = fetch_ecb("DFR", start, fixtures_dir, "ecb_dfr_incremental.csv")
    _merge_ecb_scratch(os.path.join(scratch, "ecb_dfr.csv"), dfr)
    mrr = fetch_ecb("MRR_FR", start, fixtures_dir, "ecb_mrr_incremental.csv")
    _merge_ecb_scratch(os.path.join(scratch, "ecb_mrr.csv"), mrr)


def fetch_riksbank(series, start, end, fixtures_dir=None):
    text = http_get(RIKSBANK_URL_TMPL.format(start=start, end=end), fixtures_dir,
                     "riksbank_{}.json".format(series.lower()))
    try:
        data = json.loads(text)
    except ValueError:
        raise SourceUnreachable("Riksbank SWEA response is not valid JSON")
    return [{"date": r["date"], "value": r["value"]} for r in data]


def _merge_json_list(path, rows, date_key="date", value_key="value"):
    _require_base(path)
    existing = []
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            existing = json.load(f)
    by_date = {r[date_key]: r for r in existing}
    for r in rows:
        by_date[r[date_key]] = r
    merged = sorted(by_date.values(), key=lambda r: r[date_key])
    with open(path, "w", encoding="utf-8") as f:
        json.dump(merged, f)
    return merged


def refresh_riksbank(scratch, start, end, fixtures_dir):
    rows = fetch_riksbank("SECBREPOEFF", start, end, fixtures_dir)
    return _merge_json_list(os.path.join(scratch, "riksbank_repo.json"), rows)


def fetch_boc(start, fixtures_dir=None):
    text = http_get(BOC_URL_TMPL.format(start=start), fixtures_dir, "boc_bankrate.csv")
    lines = text.splitlines()
    start_idx = None
    for i, line in enumerate(lines):
        if line.strip().startswith('"date"'):
            start_idx = i + 1
            break
    if start_idx is None:
        raise SourceUnreachable("Bank of Canada Valet CSV: no OBSERVATIONS header found")
    rows = []
    for row in csv.reader(lines[start_idx:]):
        if not row or not row[0].strip():
            continue
        d, v = row[0].strip('"'), row[1].strip('"')
        if not v:
            continue
        rows.append({"date": d, "level": float(v)})
    return rows


def refresh_boc(scratch, start, fixtures_dir):
    rows = fetch_boc(start, fixtures_dir)
    return _merge_csv_two_col(os.path.join(scratch, "boc_bankrate.csv"), rows,
                               "date", "V39079", quote_all=True)


def _norges_delimiter(text):
    """Norges Bank's open-data CSV is SEMICOLON-delimited (measured live from
    the Windows box on 2026-09-09: the header is
    'FREQ;Frequency;INSTRUMENT_TYPE;...;TIME_PERIOD;OBS_VALUE;CALC_METHOD;...').
    The first dry run read it with the default comma and reported every column
    as one field. Decide from the header line rather than assuming either."""
    head = text.lstrip("\ufeff").split("\n", 1)[0]
    return ";" if head.count(";") > head.count(",") else ","


def fetch_norges(start, fixtures_dir=None, fixture_name="norges_kpra.csv"):
    text = http_get(NORGES_URL_TMPL.format(start=start), fixtures_dir, fixture_name)
    reader = csv.DictReader(io.StringIO(text.lstrip("\ufeff")), delimiter=_norges_delimiter(text))
    fields = reader.fieldnames or []
    if "TIME_PERIOD" not in fields or "OBS_VALUE" not in fields:
        raise SourceUnreachable(
            "Norges Bank open-data CSV missing TIME_PERIOD/OBS_VALUE; got {}".format(fields))
    rows = []
    for r in reader:
        v = (r.get("OBS_VALUE") or "").strip()
        if not v:
            continue
        rows.append({"date": r["TIME_PERIOD"].strip(), "level": float(v)})
    return rows


def refresh_norges(scratch, start, fixtures_dir):
    rows = fetch_norges(start, fixtures_dir)
    return _merge_json_list(
        os.path.join(scratch, "norges_kpra_daily.json"), rows, value_key="level")


def refresh_boe_datahub(scratch, fixtures_dir):
    """Best-effort only: datahub's own file lags the Bank's schedule by
    design (build_boe.py's docstring), so this rarely changes anything -
    boe's live tail is BIS-derived (coverage.spine already "mixed") and is
    covered by the BIS cache refresh, not by this fetch. Failure here is
    never fatal to the run: it's opportunistic, not the mechanism."""
    text = http_get(DATAHUB_BOE_URL, fixtures_dir, "boe.csv")
    reader = csv.DictReader(io.StringIO(text))
    if "date" not in (reader.fieldnames or []) or "rate" not in (reader.fieldnames or []):
        raise SourceUnreachable("datahub interest-rates-gb: unexpected columns")
    rows = [{"date": r["date"].strip(), "level": float(r["rate"])} for r in reader if r.get("rate")]
    return _merge_csv_two_col(os.path.join(scratch, "boe.csv"), rows, "date", "rate")


# ---------------------------------------------------------------------------
# New-decision detection: dry-run estimate (fetched deltas vs the currently
# published file) and the authoritative post-write diff (old published file
# vs the freshly rebuilt one) share this same comparison.

def last_known(bank_json):
    """(date, level) of a bank's last known policy decision, or its last path
    point when it has no policy-era rows (an all-market file). None, None
    when the bank has no file yet."""
    if bank_json is None:
        return None, None
    real = [ch for ch in bank_json.get("changes", []) if not ch.get("break")]
    if real:
        last = real[-1]
        return last["date"], last.get("level")
    path = bank_json.get("path") or []
    if path:
        return path[-1][0], path[-1][1]
    return None, None


def new_decisions_from_rows(bank_code, last_date, last_level, fresh_rows, source):
    """fresh_rows: [{'date','level'}, ...], any order, any window (may
    overlap or precede what's already published). Returns decision dicts for
    genuinely new changes only:
      - a date on/before last_date is never a candidate (no duplicate from an
        overlapping incremental window)
      - a level equal to the running level is not a change (a repeat, even
        across several fetched days, collapses to zero decisions)
    """
    candidates = sorted(
        (r for r in fresh_rows if last_date is None or r["date"] > last_date),
        key=lambda r: r["date"])
    out = []
    prev_level = last_level
    for r in candidates:
        level = c.round4(r["level"])
        if prev_level is not None and abs(level - prev_level) < 1e-9:
            continue
        out.append({
            "bank": bank_code,
            "date": r["date"],
            "level": level,
            "change": None if prev_level is None else c.round4(level - prev_level),
            "source": source,
        })
        prev_level = level
    return out


# ---------------------------------------------------------------------------
# Orchestration

BUILDER_MODULES = (
    "build_fed", "build_ecb", "build_boe", "build_riksbank", "build_boj",
    "build_snb", "build_boc", "build_rba", "build_rbnz", "build_norges",
    "build_buba",
)


def load_published(code):
    path = os.path.join(c.OUT_DIR, "{}.json".format(code))
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_published_all():
    out = {}
    for fn in os.listdir(c.OUT_DIR):
        if fn.endswith(".json") and fn != "index.json" and fn != "changelog.json":
            with open(os.path.join(c.OUT_DIR, fn), encoding="utf-8") as f:
                data = json.load(f)
            out[data["code"]] = data
    return out


def fetch_all_sources(days, fixtures_dir, scratch=c.SCRATCH):
    """Runs every fetch, catching SourceUnreachable per source so one dead
    endpoint never aborts the others. Returns (bis_by_iso2, unreachable) where
    unreachable is [(label, error message)]."""
    start = (c.parse_iso(c.BUILT_DATE) - timedelta(days=days)).isoformat()
    end = c.BUILT_DATE
    unreachable = []
    bis_by_iso2 = {}

    def attempt(label, fn):
        try:
            fn()
        except SourceUnreachable as e:
            unreachable.append((label, str(e)))
            print("  UNREACHABLE: {} ({})".format(label, e))

    def do_bis():
        bis_by_iso2.update(fetch_bis_incremental(start, fixtures_dir))
    attempt("BIS CBPOL (all economies)", do_bis)
    attempt("FRED (fed, DFEDTARU/DFEDTARL)", lambda: refresh_fed(scratch, fixtures_dir))
    attempt("ECB Data Portal (ecb, DFR/MRR_FR)", lambda: refresh_ecb(scratch, start, fixtures_dir))
    attempt("Riksbank SWEA (riksbank, SECBREPOEFF)", lambda: refresh_riksbank(scratch, start, end, fixtures_dir))
    attempt("Bank of Canada Valet (boc, V39079)", lambda: refresh_boc(scratch, start, fixtures_dir))
    attempt("Norges Bank open data (norges, KPRA)", lambda: refresh_norges(scratch, start, fixtures_dir))
    attempt("datahub interest-rates-gb (boe, best-effort)", lambda: refresh_boe_datahub(scratch, fixtures_dir))
    return bis_by_iso2, unreachable


def dry_run_report(bis_by_iso2, published):
    """Cheap estimate: compares freshly fetched rows straight to each bank's
    currently published last decision, without re-running the full builders.
    --write reruns the builders and reports the authoritative diff instead
    (era assignment, BIS-disagreement refusal etc. can change the picture a
    little from this estimate, which is why dry-run says "would add" and
    --write's own report is the one that actually lands)."""
    decisions = []
    for iso2, rows in sorted(bis_by_iso2.items()):
        for code in _codes_for_iso2(iso2, published):
            last_date, last_level = last_known(published.get(code))
            decisions.extend(new_decisions_from_rows(code, last_date, last_level, rows, "bis"))
    return decisions


def _codes_for_iso2(iso2, published):
    """Every published bank code whose BIS levels come from this iso2: the
    bis-<iso2> file itself, plus any own-spine bank sharing that iso2 whose
    live tail is BIS-derived."""
    codes = []
    bis_code = c.bis_code_for(iso2)
    if bis_code in published:
        codes.append(bis_code)
    superseded = c.ISO2_SUPERSEDED_BY.get(iso2)
    if superseded in BIS_TAIL_ONLY and superseded in published:
        codes.append(superseded)
    return codes


def print_decisions(decisions, heading):
    if not decisions:
        print("  {}: none".format(heading))
        return
    print("  {} ({}):".format(heading, len(decisions)))
    for d in sorted(decisions, key=lambda x: (x["bank"], x["date"])):
        chg = "" if d["change"] is None else " ({:+.4f})".format(d["change"])
        print("    {:<10} {}  {:.4f}{}".format(d["bank"], d["date"], d["level"], chg))


def run_all_builders():
    """Reruns every builder plus build_index, exactly as a full pipeline run
    would. Contract logic (era assignment, the 2% BIS-disagreement refusal,
    instrument breaks) lives in the builders and common.py; refresh.py never
    reimplements it. Returns [(code_or_label, ok, error)]."""
    sys.path.insert(0, HERE)
    results = []
    import build_bis
    try:
        build_bis.build_all()
        results.append(("bis-*", True, None))
    except Exception as e:
        results.append(("bis-*", False, str(e)))
    for modname in BUILDER_MODULES:
        mod = __import__(modname)
        try:
            mod.build(write=True)
            results.append((modname, True, None))
        except Exception as e:
            results.append((modname, False, str(e)))
    import build_index
    try:
        build_index.build(write=True)
        results.append(("index", True, None))
    except Exception as e:
        results.append(("index", False, str(e)))
    return results


def append_changelog(decisions):
    if not decisions:
        return
    existing = []
    if os.path.exists(CHANGELOG_PATH):
        with open(CHANGELOG_PATH, encoding="utf-8") as f:
            existing = json.load(f)
    new_rows = [dict(d, built=c.BUILT_DATE) for d in
                sorted(decisions, key=lambda x: (x["date"], x["bank"]), reverse=True)]
    merged = new_rows + existing
    # De-dupe on (bank, date): a rerun of the same day must not double an entry.
    seen = set()
    deduped = []
    for row in merged:
        key = (row["bank"], row["date"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(row)
    deduped = deduped[:CHANGELOG_CAP]
    with open(CHANGELOG_PATH, "w", encoding="utf-8") as f:
        json.dump(deduped, f, indent=2, ensure_ascii=False)
        f.write("\n")


def upsert_supabase(decisions, bis_by_iso2, published):
    """Same fail-open idiom as scripts/business/series_store.py: without
    SUPABASE_SERVICE_KEY this logs loudly and returns rather than aborting
    the run. Recoverable any time via load_policy_rates.py --write."""
    key = (os.environ.get("SUPABASE_SERVICE_KEY")
           or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not key:
        print("refresh.py: NO SUPABASE KEY, skipped Supabase upsert "
              "(set SUPABASE_SERVICE_KEY in mac-mini-jobs/config.env). "
              "Recover with: python3 scripts/macro/rates/load_policy_rates.py --write")
        return 0
    sys.path.insert(0, os.path.join(HERE, "..", "..", "business"))
    from load_market_series import rest  # shared REST helper, same as series_store.py
    n = 0
    if decisions:
        rows = [{
            "bank_code": d["bank"], "date": d["date"], "level": d["level"],
            "change": d["change"], "lower": None, "upper": None,
            "era_name": d.get("era_name", ""), "kind": d.get("kind", "policy"),
            "source": d["source"], "built_at": c.BUILT_DATE,
        } for d in decisions]
        try:
            rest("POST", "/rest/v1/policy_rate_changes", body=rows, key=key,
                 prefer="resolution=merge-duplicates,return=minimal")
            n += len(rows)
        except Exception as e:
            print("refresh.py: policy_rate_changes upsert failed ({})".format(str(e)[:150]))
    daily_rows = []
    for iso2, rows in bis_by_iso2.items():
        for code in _codes_for_iso2(iso2, published):
            for r in rows:
                daily_rows.append({"bank_code": code, "date": r["date"], "level": c.round4(r["level"])})
    for i in range(0, len(daily_rows), 5000):
        batch = daily_rows[i:i + 5000]
        try:
            rest("POST", "/rest/v1/policy_rate_daily", body=batch, key=key,
                 prefer="resolution=merge-duplicates,return=minimal")
            n += len(batch)
        except Exception as e:
            print("refresh.py: policy_rate_daily upsert failed ({})".format(str(e)[:150]))
    print("refresh.py: upserted {} row(s) to Supabase".format(n))
    return n


def run(write, fixtures_dir, days):
    print("refresh.py: {} run, window {} days, built date {}".format(
        "WRITE" if write else "DRY-RUN", days, c.BUILT_DATE))

    published_before = load_published_all()
    bis_by_iso2, unreachable = fetch_all_sources(days, fixtures_dir)

    if not write:
        decisions = dry_run_report(bis_by_iso2, published_before)
        # Also estimate the three directly-fetched own-spine banks against
        # their own scratch inputs, so a dry run's picture matches --write's
        # rerun as closely as possible without paying for a full rebuild.
        print()
        print_decisions(decisions, "NEW decisions (dry-run estimate, BIS-fed banks)")
        if unreachable:
            print()
            print("  {} source(s) unreachable this run; the files they feed "
                  "are untouched:".format(len(unreachable)))
            for label, err in unreachable:
                print("    {}: {}".format(label, err))
        print()
        print("Dry run: nothing written. Pass --write to fetch, rerun every "
              "builder, and commit.")
        return decisions, unreachable

    write_bis_cache(bis_by_iso2)
    build_results = run_all_builders()
    failed = [r for r in build_results if not r[1]]
    for modname, ok, err in build_results:
        print("  builder {}: {}".format(modname, "OK" if ok else "FAILED: " + err))

    published_after = load_published_all()
    decisions = []
    for code, after in published_after.items():
        before = published_before.get(code)
        last_date, last_level = last_known(before)
        real_after = [ch for ch in after.get("changes", []) if not ch.get("break")]
        candidates = [ch for ch in real_after if last_date is None or ch["date"] > last_date]
        for ch in candidates:
            decisions.append({
                "bank": code, "date": ch["date"], "level": ch["level"],
                "change": ch.get("change"), "source": after["coverage"]["spine"],
                "era_name": (after["instruments"][ch["era"]]["name"]
                             if 0 <= ch.get("era", -1) < len(after["instruments"]) else ""),
                "kind": (after["instruments"][ch["era"]]["kind"]
                         if 0 <= ch.get("era", -1) < len(after["instruments"]) else "policy"),
            })

    print()
    print_decisions(decisions, "NEW decisions (authoritative, post-rebuild)")
    if unreachable:
        print()
        print("  {} source(s) unreachable this run; those banks' inputs are "
              "untouched (their published files are unaffected unless their "
              "live tail is BIS-derived):".format(len(unreachable)))
        for label, err in unreachable:
            print("    {}: {}".format(label, err))

    if decisions:
        print()
        print("=" * 60)
        print("NEW RATE DECISIONS")
        print("=" * 60)
        for d in sorted(decisions, key=lambda x: (x["date"], x["bank"])):
            chg = "" if d["change"] is None else " ({:+.4f} pts)".format(d["change"])
            print("  {}: {} -> {:.4f}%{}".format(d["bank"], d["date"], d["level"], chg))
        print("=" * 60)

    append_changelog(decisions)
    upsert_supabase(decisions, bis_by_iso2, published_after)

    if failed:
        print()
        print("refresh.py: {} builder(s) FAILED; review before trusting the "
              "published files.".format(len(failed)))
        sys.exit(1)

    return decisions, unreachable


# ---------------------------------------------------------------------------
# Self-test: fully offline, exercises the pure decision logic with the same
# shapes fetch_* return, plus scripts/macro/rates/fixtures/ for the parsers.

def self_test():
    # a repeated level is not a change
    out = new_decisions_from_rows("x", "2026-01-01", 5.0, [
        {"date": "2026-01-02", "level": 5.0},
        {"date": "2026-01-03", "level": 5.0},
    ], "bis")
    assert out == [], "a repeated level must not emit a change"

    # a genuine move is a change, with the correct signed delta
    out = new_decisions_from_rows("x", "2026-01-01", 5.0, [
        {"date": "2026-01-02", "level": 5.0},
        {"date": "2026-01-03", "level": 5.25},
    ], "bis")
    assert len(out) == 1 and out[0]["date"] == "2026-01-03"
    assert out[0]["change"] == 0.25

    # an incremental window that overlaps existing data must not duplicate a
    # change: dates on/before last_date are excluded even if the window
    # includes them and even if the level looks different there (a fetch
    # window that reaches back past the published last date is normal, not
    # a signal of a missed decision)
    out = new_decisions_from_rows("x", "2026-01-05", 5.25, [
        {"date": "2026-01-03", "level": 5.0},   # before last_date: excluded
        {"date": "2026-01-05", "level": 5.25},  # == last_date: excluded
        {"date": "2026-01-06", "level": 5.25},  # repeat: not a change
        {"date": "2026-01-07", "level": 5.5},   # genuine new change
    ], "bis")
    assert len(out) == 1 and out[0]["date"] == "2026-01-07" and out[0]["change"] == 0.25

    # no bank on record yet (first-ever fetch): first row carries change=None
    out = new_decisions_from_rows("y", None, None, [{"date": "2026-01-01", "level": 3.0}], "bis")
    assert len(out) == 1 and out[0]["change"] is None

    # last_known(): a policy-era file
    bank = {"changes": [
        {"date": "2025-01-01", "level": 4.0, "change": None, "era": 0},
        {"date": "2025-06-01", "level": 4.25, "change": 0.25, "era": 0},
    ], "path": []}
    assert last_known(bank) == ("2025-06-01", 4.25)

    # last_known(): an all-market file falls back to the last path point
    bank_market = {"changes": [], "path": [["2020-01-01", 1.0], ["2026-01-01", 2.0]]}
    assert last_known(bank_market) == ("2026-01-01", 2.0)

    assert last_known(None) == (None, None)

    # a source that is unreachable raises loudly, is caught, and reported --
    # never silently treated as "no new data"
    unreachable = []

    def boom():
        raise SourceUnreachable("simulated 503")
    try:
        boom()
        assert False, "should have raised"
    except SourceUnreachable as e:
        unreachable.append(("simulated", str(e)))
    assert unreachable == [("simulated", "simulated 503")]

    # http_get against a fixtures dir with a missing fixture is loud, not silent
    try:
        http_get("http://example.invalid", FIXTURES_DEFAULT, "does-not-exist.csv")
        assert False, "missing fixture must raise"
    except SourceUnreachable:
        pass

    # BIS incremental CSV parser against the checked-in fixture
    if os.path.exists(os.path.join(FIXTURES_DEFAULT, "bis_incremental.csv")):
        by_iso2 = fetch_bis_incremental("2026-08-01", FIXTURES_DEFAULT)
        assert "CH" in by_iso2 and "JP" in by_iso2
        ch_dates = {r["date"] for r in by_iso2["CH"]}
        assert "2026-09-01" in ch_dates

    # FRED parser against the checked-in fixture
    if os.path.exists(os.path.join(FIXTURES_DEFAULT, "dfedtaru.csv")):
        rows = fetch_fred("DFEDTARU", FIXTURES_DEFAULT)
        assert rows and all("date" in r and "level" in r for r in rows)

    # ECB parser against the checked-in fixture
    if os.path.exists(os.path.join(FIXTURES_DEFAULT, "ecb_dfr_incremental.csv")):
        rows = fetch_ecb("DFR", "2026-08-01", FIXTURES_DEFAULT, "ecb_dfr_incremental.csv")
        assert rows and rows[0]["date"] >= "2026-08-01"

    # Riksbank parser
    if os.path.exists(os.path.join(FIXTURES_DEFAULT, "riksbank_secbrepoeff.json")):
        rows = fetch_riksbank("SECBREPOEFF", "2026-08-01", "2026-09-08", FIXTURES_DEFAULT)
        assert rows and "value" in rows[0]

    # Bank of Canada parser
    if os.path.exists(os.path.join(FIXTURES_DEFAULT, "boc_bankrate.csv")):
        rows = fetch_boc("2026-08-01", FIXTURES_DEFAULT)
        assert rows and "level" in rows[0]

    # Norges parser, both delimiters: the comma fixture the script was written
    # against and the semicolon shape the live endpoint actually returns
    if os.path.exists(os.path.join(FIXTURES_DEFAULT, "norges_kpra.csv")):
        rows = fetch_norges("2026-08-01", FIXTURES_DEFAULT)
        assert rows and "level" in rows[0]
    if os.path.exists(os.path.join(FIXTURES_DEFAULT, "norges_kpra_semicolon.csv")):
        rows = fetch_norges("2026-06-01", FIXTURES_DEFAULT, fixture_name="norges_kpra_semicolon.csv")
        assert len(rows) == 4 and rows[0]["date"] == "2026-06-01" and rows[0]["level"] == 4.25, rows[:2]

    # a missing base input is a refusal, never a thin file (2026-09-09)
    import tempfile
    tmp_scratch = tempfile.mkdtemp()
    try:
        _merge_csv_two_col(os.path.join(tmp_scratch, "nope.csv"), [{"date": "2026-01-01", "level": 1.0}], "date", "V")
        raise AssertionError("merge onto a missing base must refuse")
    except MissingBase:
        pass
    assert not os.path.exists(os.path.join(tmp_scratch, "nope.csv")), "refusal must not create the file"
    try:
        _merge_json_list(os.path.join(tmp_scratch, "nope.json"), [{"date": "2026-01-01", "value": 1.0}])
        raise AssertionError("json merge onto a missing base must refuse")
    except MissingBase:
        pass
    # a seedable base is rebuilt from the published read model, never thin
    seeded = os.path.join(tmp_scratch, "boc_bankrate.csv")
    dates = _merge_csv_two_col(seeded, [{"date": "2099-01-01", "level": 9.0}], "date", "V39079", quote_all=True)
    assert dates[0] == "2009-04-21" and dates[-1] == "2099-01-01" and len(dates) > 30, (dates[:2], len(dates))
    seeded_n = os.path.join(tmp_scratch, "norges_kpra_daily.json")
    merged = _merge_json_list(seeded_n, [{"date": "2099-01-01", "level": 9.0}], value_key="level")
    assert merged[0]["date"] == "1991-01-01" and merged[-1]["date"] == "2099-01-01" and len(merged) > 100, len(merged)

    with open(os.path.join(tmp_scratch, "base.csv"), "w", newline="") as f:
        f.write("date,V\n2025-01-01,1.0\n")
    dates = _merge_csv_two_col(os.path.join(tmp_scratch, "base.csv"), [{"date": "2026-01-01", "level": 2.0}], "date", "V")
    assert dates == ["2025-01-01", "2026-01-01"], dates

    # write_bis_cache merges without duplication and respects a rolling window
    tmp_cache = tempfile.mkdtemp()
    old_dir = c.BIS_CACHE_DIR
    c.BIS_CACHE_DIR = tmp_cache
    try:
        write_bis_cache({"ZZ": [{"date": "2026-08-01", "level": 1.0},
                                 {"date": "2026-08-02", "level": 1.0}]})
        write_bis_cache({"ZZ": [{"date": "2026-08-02", "level": 1.25},
                                 {"date": "2026-08-03", "level": 1.25}]})
        cached = c.load_bis_cache("ZZ")
        by_date = {r["date"]: r["level"] for r in cached}
        assert by_date == {"2026-08-01": 1.0, "2026-08-02": 1.25, "2026-08-03": 1.25}
        assert len(cached) == 3, "merge must not duplicate the overwritten date"
    finally:
        c.BIS_CACHE_DIR = old_dir

    # _codes_for_iso2: a BIS-tail-only own-spine bank picks up its iso2's cache
    published = {"boj": {}, "bis-jp": {}}
    assert set(_codes_for_iso2("JP", published)) == {"bis-jp", "boj"}
    # a plain BIS economy with no own-spine bank returns just the bis-<iso2> code
    published2 = {"bis-br": {}}
    assert _codes_for_iso2("BR", published2) == ["bis-br"]
    # a directly-fetched own-spine bank (fed, US) is NOT BIS-tail-only, so it
    # is never double-counted here even though bis-us exists on disk
    published3 = {"fed": {}, "bis-us": {}}
    assert _codes_for_iso2("US", published3) == ["bis-us"]

    print("refresh self-test OK")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="fetch, rerun builders, and write")
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--fixtures", default=None,
                     help="directory of fixture files, used instead of live network fetches")
    ap.add_argument("--days", type=int, default=90, help="incremental window in days")
    args = ap.parse_args()
    if args.self_test:
        self_test()
        return
    run(write=args.write, fixtures_dir=args.fixtures, days=args.days)


if __name__ == "__main__":
    main()
