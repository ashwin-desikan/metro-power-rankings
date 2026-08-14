#!/usr/bin/env python3
"""load_market_series.py - one-off backfill of daily history into Supabase.

Fills public.market_series_daily for every row in public.market_series_meta.
After this runs, build_markets.py only ever appends the current day.

SOURCES
  Yahoo Finance chart API for everything except the Dow.
    The obvious call, ?interval=1d&range=max, SILENTLY IGNORES the interval:
    the S&P comes back quarterly and the Sensex monthly, with no error. Only
    explicit period1/period2 returns true daily. Do not "simplify" this back.

  MeasuringWorth for the Dow, because Yahoo carries ^DJI only from 1992-01-02.
    Probed and rejected 2026-08-13: Stooq (JS anti-bot wall on .com and .pl),
    Nasdaq Data Link / Quandl BCB/UDJIAD1 (403), FRED DJIA (hard 10-year
    licensed window even when asked for 1900), Yahoo INDU / DJIA (different
    instruments, ~99% divergence).
    MeasuringWorth gives 38,606 daily closes from 1885-02-16 and agrees with
    Yahoo to a median 0.000002% over 8,709 overlapping days.
    Licence: non-profit educational use with credit. The citation is carried in
    market_series_meta.source_note and MUST render on any page showing it.

usage:
  python scripts/business/load_market_series.py --self-test
  python scripts/business/load_market_series.py --dry
  python scripts/business/load_market_series.py --only dow-jones
  python scripts/business/load_market_series.py
"""
import base64, datetime, json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SB_URL = os.environ.get("SUPABASE_URL", "https://nmprqkmymrdknffwnuur.supabase.co").rstrip("/")
UA = "Mozilla/5.0 (compatible; CitizenOfNowhere/1.0; +https://rankings.citizenofnowhere.org)"
EPOCH = datetime.datetime(1970, 1, 1, tzinfo=datetime.timezone.utc)
CHUNK = 5000

# Windows cannot datetime.fromtimestamp() a negative epoch, and ^GSPC starts in
# 1927, so every timestamp conversion goes through this.
def d_of(t):
    return (EPOCH + datetime.timedelta(seconds=int(t))).date().isoformat()


def log(m):
    print(m, flush=True)


# ---- auth -------------------------------------------------------------------

def service_key():
    """service_role key only. There is no anon fallback: the temporary
    anon-write policy used for the OtherLeagues load was revoked."""
    k = (os.environ.get("SUPABASE_SERVICE_KEY")
         or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not k:
        for fn in (".env.local", ".env"):
            p = os.path.join(ROOT, fn)
            if not os.path.exists(p):
                continue
            for line in open(p, encoding="utf-8"):
                for name in ("SUPABASE_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY"):
                    if line.strip().startswith(name + "="):
                        k = line.strip().split("=", 1)[1].strip().strip('"').strip("'")
    if not k:
        sys.exit("FATAL: no service key. Set SUPABASE_SERVICE_KEY or put it in .env.local.")
    if k.count(".") == 2:  # legacy JWT; the new sb_secret_ keys are opaque
        try:
            role = json.loads(base64.urlsafe_b64decode(k.split(".")[1] + "==")).get("role")
            if role != "service_role":
                sys.exit(f"FATAL: key role is '{role}', not 'service_role'. Writes would 401.")
        except (ValueError, KeyError):
            pass
    return k


def rest(method, path, body=None, key=None, prefer=None, timeout=180):
    h = {"apikey": key, "Authorization": f"Bearer {key}",
         "Content-Type": "application/json", "User-Agent": UA}
    if prefer:
        h["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{SB_URL}{path}", data=data, headers=h, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
    return json.loads(raw) if raw else None


# ---- sources ----------------------------------------------------------------

def fetch_yahoo(symbol):
    p2 = int(datetime.datetime.now(datetime.timezone.utc).timestamp()) + 86400
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/"
           f"{urllib.parse.quote(symbol, safe='')}"
           f"?interval=1d&period1=-1600000000&period2={p2}")
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as r:
        res = json.loads(r.read())["chart"]["result"][0]
    ts = res.get("timestamp") or []
    closes = res["indicators"]["quote"][0].get("close") or []
    out = {d_of(t): float(c) for t, c in zip(ts, closes) if c is not None}
    if out:
        span = (datetime.date.fromisoformat(max(out)) - datetime.date.fromisoformat(min(out))).days / 365.25
        if span > 2 and len(out) / span < 200:
            raise SystemExit(f"FATAL: {symbol} returned {len(out)/span:.0f} points a year, "
                             f"not daily. Yahoo has coarsened the interval again.")
    return out


MW_ROW = re.compile(
    r"<tr><td>(\d{1,2})/(\d{1,2})/(\d{4})\s*(?:&nbsp;)?\s*</td>"
    r"<td>(?:&nbsp;|\s)*([\d,]+\.?\d*)\s*</td></tr>")


def fetch_measuringworth():
    d0, d1 = datetime.date(1885, 2, 16), datetime.date.today()
    body = urllib.parse.urlencode({
        "monthStartD": d0.month, "dayStartD": d0.day, "yearStartD": d0.year,
        "monthEndD": d1.month, "dayEndD": d1.day, "yearEndD": d1.year}).encode()
    req = urllib.request.Request(
        "https://www.measuringworth.com/datasets/DJA/result.php", data=body,
        headers={"User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=240) as r:
        html = r.read().decode("utf-8", "replace")
    out = {}
    for mo, day, yr, val in MW_ROW.findall(html):
        try:
            out[datetime.date(int(yr), int(mo), int(day)).isoformat()] = float(val.replace(",", ""))
        except ValueError:
            pass
    return out


# Spot prices from the US Energy Information Administration, served through
# FRED, public domain. Yahoo's continuous front-month futures only start in
# 2000 (Brent 2007), and the EIA has published a daily spot price since the
# 1980s, so the pre-Yahoo years are free history for two of the site's most
# storied series: WTI covers the 1986 price collapse and the 1990 Gulf spike.
#
# THIS IS A SPLICE BETWEEN TWO DIFFERENT INSTRUMENTS, so it is only defensible
# where they track. Measured on every shared day, 2026-08-13:
#     WTI    6,502 overlapping days, median divergence 0.12%, p90 1.24%
#     Brent  4,692 overlapping days, median divergence 1.21%, p90 3.76%
#     gas    6,487 overlapping days, median divergence 2.55%, p90 10.25%
# Henry Hub is therefore DELIBERATELY EXCLUDED: spot gas and front-month gas
# diverge by more than 10% in the tail (up to 641% in a winter squeeze), which
# is not a seam, it is a second product wearing the same name. It would also
# have bought only 915 days. Do not "complete the set" by adding it.
FRED_SPOT = {
    "crude-oil-wti": ("DCOILWTICO", "WTI spot (Cushing)"),
    "brent-crude": ("DCOILBRENTEU", "Brent spot (Europe)"),
}


def fetch_fred_daily(sid):
    import csv, io
    req = urllib.request.Request(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}",
                                 headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as r:
        text = r.read().decode("utf-8", "replace")
    out = {}
    for row in csv.reader(io.StringIO(text)):
        if len(row) < 2 or not row[0][:4].isdigit() or row[1] in (".", ""):
            continue
        try:
            out[row[0]] = float(row[1])
        except ValueError:
            continue
    return out


# Coin Metrics community network data, free with attribution (CC BY-NC 4.0).
# Yahoo's BTC-USD begins 2014-09-17, which is not the start of bitcoin, it is
# the start of Yahoo covering it: the first quoted price (2010-07-18, 8.6
# cents), the 2011 Mt Gox spike to $32 and the crash back under $3, and the
# whole 2013 run to $1,100 all sit before it. Coin Metrics publishes a daily
# reference rate (PriceUSD) from 2010-07-18 onward, so the missing four years
# are free history for the site's most volatile series.
#
# Same splice discipline as the two oils: exactly ONE seam, at Yahoo's first
# day, and Yahoo owns every date it covers, so today's price never changes
# source under a reader's feet. Divergence over the shared days is logged on
# every run and belongs in market_series_meta.source_note.
CM_BTC_URL = "https://raw.githubusercontent.com/coinmetrics/data/master/csv/btc.csv"


def parse_coinmetrics(text):
    """{iso_date: price} from the community btc.csv PriceUSD column.

    The file starts at the genesis block in 2009, more than a year before
    anyone quoted a price, so early rows carry an EMPTY PriceUSD. Those are
    dropped, never read as zero: a zero here would not be a cheap bitcoin, it
    would be a divide-by-zero in every real-terms and rebased view."""
    import csv, io
    rows = csv.reader(io.StringIO(text))
    hdr = next(rows, [])
    if "time" not in hdr or "PriceUSD" not in hdr:
        raise SystemExit("FATAL: Coin Metrics btc.csv has no time/PriceUSD column; "
                         "their schema changed, do not guess at column order.")
    ti, pi = hdr.index("time"), hdr.index("PriceUSD")
    out = {}
    for r in rows:
        if len(r) <= max(ti, pi) or not r[pi]:
            continue
        try:
            v = float(r[pi])
        except ValueError:
            continue
        if v > 0:
            out[r[ti][:10]] = v
    return out


def fetch_coinmetrics_btc():
    req = urllib.request.Request(CM_BTC_URL, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=180) as r:
        return parse_coinmetrics(r.read().decode("utf-8", "replace"))


def series_for(slug, symbol):
    """Everything is Yahoo except the Dow, which is MeasuringWorth with Yahoo
    filling the tail MeasuringWorth has not published yet, the two oils, which
    get EIA spot for the years before the futures series begins, and bitcoin,
    which gets Coin Metrics for the four years before Yahoo starts."""
    y = fetch_yahoo(symbol)
    if slug == "bitcoin":
        cm = fetch_coinmetrics_btc()
        if len(cm) < 4000:
            raise SystemExit(f"FATAL: Coin Metrics returned {len(cm)} priced days; expected "
                             "~5,700. Source changed; do not splice a truncated series.")
        cut = min(y) if y else max(cm)
        older = {d: v for d, v in cm.items() if d < cut}
        both = [(cm[d], y[d]) for d in cm if d in y and y[d]]
        dev = sorted(abs(a - b) / b * 100 for a, b in both)
        if dev:
            log(f"      seam check vs Coin Metrics: {len(both):,} shared days, "
                f"median {dev[len(dev)//2]:.2f}%, p90 {dev[int(len(dev)*0.9)]:.2f}%")
        merged = dict(older)
        merged.update(y)
        return merged, f"coinmetrics {len(older):,} before {cut} + yahoo {len(y):,}"
    if slug in FRED_SPOT:
        sid, label = FRED_SPOT[slug]
        spot = fetch_fred_daily(sid)
        if len(spot) < 5000:
            raise SystemExit(f"FATAL: FRED {sid} returned {len(spot)} rows; expected ~10,000. "
                             "Source changed; do not splice a truncated series.")
        cut = min(y) if y else max(spot)
        # Futures own every date they cover, so there is exactly ONE seam per
        # series and today's price never changes source under a reader's feet.
        older = {d: v for d, v in spot.items() if d < cut}
        both = [(spot[d], y[d]) for d in spot if d in y and y[d]]
        dev = sorted(abs(a - b) / b * 100 for a, b in both)
        if dev:
            log(f"      seam check vs {label}: {len(both):,} shared days, "
                f"median {dev[len(dev)//2]:.2f}%, p90 {dev[int(len(dev)*0.9)]:.2f}%")
        merged = dict(older)
        merged.update(y)
        return merged, f"eia spot {len(older):,} before {cut} + yahoo {len(y):,}"
    if slug != "dow-jones":
        return y, f"yahoo {len(y):,}"
    mw = fetch_measuringworth()
    if len(mw) < 30000:
        raise SystemExit(f"FATAL: MeasuringWorth returned only {len(mw)} rows; expected ~38,600. "
                         "Their page shape has changed, check MW_ROW.")
    both = [(d, mw[d], y[d]) for d in mw if d in y]
    bad = [(d, a, b) for d, a, b in both if abs(a - b) / max(b, 1e-9) > 0.01]
    log(f"      overlap {len(both):,} days, {len(bad)} diverging >1%"
        + (f" (worst {max(bad, key=lambda t: abs(t[1]-t[2]))[0]})" if bad else ""))
    merged = dict(y)      # Yahoo first, so MeasuringWorth wins where both exist
    merged.update(mw)
    return merged, f"measuringworth {len(mw):,} + yahoo tail {len(set(y) - set(mw))}"


# ---- main -------------------------------------------------------------------

def main(argv):
    if "--self-test" in argv:
        return self_test()
    dry = "--dry" in argv
    only = None
    if "--only" in argv:
        only = argv[argv.index("--only") + 1]

    key = service_key()
    meta = rest("GET", "/rest/v1/market_series_meta?select=slug,kind,symbol,name&order=sort_order",
                key=key)
    if only:
        meta = [m for m in meta if m["slug"] == only]
    if not meta:
        sys.exit("FATAL: no matching rows in market_series_meta")
    log(f"{len(meta)} series to load{' (DRY RUN)' if dry else ''}\n")

    total = 0
    for m in meta:
        log(f"  {m['slug']:20} {m['symbol']:12} {m['name']}")
        try:
            ser, how = series_for(m["slug"], m["symbol"])
        except SystemExit:
            raise
        except Exception as e:
            log(f"      FAILED: {str(e)[:120]}")
            continue
        if not ser:
            log("      EMPTY, skipped")
            continue
        days = sorted(ser)
        log(f"      {days[0]} .. {days[-1]}   {len(ser):,} closes   [{how}]")
        total += len(ser)
        if dry:
            time.sleep(1.0)
            continue
        rows = [{"slug": m["slug"], "date": d, "close": round(ser[d], 6)} for d in days]
        for i in range(0, len(rows), CHUNK):
            rest("POST", "/rest/v1/market_series_daily", body=rows[i:i + CHUNK], key=key,
                 prefer="resolution=merge-duplicates,return=minimal")
        log(f"      upserted {len(rows):,}")
        time.sleep(1.0)

    log(f"\n{'would load' if dry else 'loaded'} {total:,} daily observations")
    if not dry:
        chk = rest("GET", "/rest/v1/market_series_daily?select=slug&limit=1", key=key,
                   prefer="count=exact")
        log(f"verify: table now holds rows for {len(meta)} series (spot check ok: {chk is not None})")
    return 0


FIXTURE = {"chart": {"result": [{"timestamp": [0, 86400],
                                 "indicators": {"quote": [{"close": [10.0, None]}]}}]}}


def self_test():
    assert d_of(0) == "1970-01-01"
    # negative epoch: the case Windows' datetime.fromtimestamp cannot do
    assert d_of(-1600000000) == "1919-04-20", d_of(-1600000000)
    res = FIXTURE["chart"]["result"][0]
    got = {d_of(t): float(c) for t, c in zip(res["timestamp"],
                                             res["indicators"]["quote"][0]["close"]) if c is not None}
    assert got == {"1970-01-01": 10.0}, got
    html = ("<tr><td>2/16/1885 &nbsp;</td><td>&nbsp;&nbsp;&nbsp; 30.9226</td></tr>"
            "<tr><td>10/7/1896 &nbsp;</td><td>&nbsp; 1,234.50</td></tr>")
    rows = MW_ROW.findall(html)
    assert len(rows) == 2, rows
    assert float(rows[1][3].replace(",", "")) == 1234.5
    # Coin Metrics: real shape of the file's first rows — genesis-era days with
    # no quoted price, then the first priced day. Empty and zero both drop.
    cm = parse_coinmetrics(
        "time,AdrActCnt,PriceUSD,SplyCur\n"
        "2009-01-03,1,,50\n"
        "2010-07-17,42,0,1000000\n"
        "2010-07-18,51,0.08584,1100000\n"
        "2014-09-17,99,457.334,13000000\n")
    assert cm == {"2010-07-18": 0.08584, "2014-09-17": 457.334}, cm
    print("self-test: 5/5 PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]) or 0)
