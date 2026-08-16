"""Fetch end-of-year market cap history from CompaniesMarketCap, one page per company.

WHY THIS EXISTS
CMC runs no API (their own /stockmarket-api/ page says so and lists third parties).
But every company page carries an "End of year Market Cap" table — Apple's runs
1996..2026 — and that is TRUE historical market cap, not price back-cast through
today's share count. That distinction is the whole point: applying a current share
count to an old price silently converts a market cap series into a price-return
index, and the error is largest on exactly the mega-caps that dominate a metro
total. robots.txt disallows /annual-reports/, /financial-statements/ and the other
filings paths; /<slug>/marketcap/ is not disallowed.

BUDGET GATE (see feedback_bulk_jobs_need_a_budget_gate)
Defaults to a 20-company pilot, prints a projection for the full sweep, and refuses
to sweep without --full. ~11.2k companies at the default delay is a multi-hour job
and belongs on the mini, not in a session.

  python history_fetch.py                      # 20-company pilot + projection
  python history_fetch.py --pilot 50
  python history_fetch.py --full --resume      # the real sweep, restartable
"""
import argparse, csv, html, os, re, sys, time
import urllib.error

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import fetch_url, log  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)

SLUGS_CSV = os.path.join(OUT, "cmc_slugs.csv")
ANNUAL_CSV = os.path.join(OUT, "cmc_annual.csv")
FAILED_CSV = os.path.join(OUT, "cmc_annual_failed.csv")

BASE = "https://companiesmarketcap.com"
HEADING = "End of year Market Cap"
ROW_RE = re.compile(
    r"<tr>\s*<td>\s*(\d{4})\s*</td>\s*<td>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*</tr>", re.S)
MULT = {"T": 1e12, "B": 1e9, "M": 1e6, "K": 1e3}
FIELDS = ["slug", "symbol", "year", "marketcap", "change_pct"]


def clean(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s or "")).strip()


def parse_money(s):
    """'$4.464 T' -> 4.464e12. Returns None on anything unrecognised rather than 0 —
    a zero would read as 'company was worth nothing that year'."""
    t = clean(s).replace("$", "").replace(",", "").strip()
    if not t or t in ("-", "N/A"):
        return None
    m = re.match(r"^(-?[\d.]+)\s*([TBMK])?$", t, re.I)
    if not m:
        return None
    try:
        v = float(m.group(1))
    except ValueError:
        return None
    return v * MULT.get((m.group(2) or "").upper(), 1.0)


def parse_pct(s):
    t = clean(s).replace("%", "").replace(",", "").strip()
    if not t or t in ("-", "N/A"):
        return None
    try:
        return float(t)
    except ValueError:
        return None


def parse_history(raw):
    """-> list of (year, marketcap, change_pct). Scoped to the End-of-year section so
    an unrelated table elsewhere on the page can never be mistaken for history."""
    doc = raw.decode("utf-8", "replace")
    i = doc.find(HEADING)
    if i < 0:
        return []
    j = doc.find("</table>", i)
    section = doc[i:j if j > 0 else len(doc)]
    out = []
    for m in ROW_RE.finditer(section):
        mc = parse_money(m.group(2))
        if mc is None:
            continue
        out.append((int(m.group(1)), mc, parse_pct(m.group(3))))
    return out


def load_slugs():
    if not os.path.exists(SLUGS_CSV):
        sys.exit(f"FATAL: {SLUGS_CSV} missing. Run history_slugs.py first.")
    with open(SLUGS_CSV, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        sys.exit("FATAL: slug map is empty.")
    return rows


def done_slugs():
    if not os.path.exists(ANNUAL_CSV):
        return set()
    with open(ANNUAL_CSV, encoding="utf-8") as f:
        return {r["slug"] for r in csv.DictReader(f) if r.get("slug")}


def fetch_one(slug, tries=3):
    url = f"{BASE}/{slug}/marketcap/"
    for attempt in range(tries):
        try:
            return fetch_url(url, timeout=60)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code in (429, 500, 502, 503, 504) and attempt < tries - 1:
                time.sleep(5 * (attempt + 1)); continue
            raise
        except Exception:
            if attempt < tries - 1:
                time.sleep(5 * (attempt + 1)); continue
            raise
    return None


def run(targets, delay, append):
    mode = "a" if append and os.path.exists(ANNUAL_CSV) else "w"
    ok = empty = failed = 0
    t0 = time.time()
    with open(ANNUAL_CSV, mode, newline="", encoding="utf-8") as f, \
         open(FAILED_CSV, mode, newline="", encoding="utf-8") as ff:
        w, wf = csv.writer(f), csv.writer(ff)
        if mode == "w":
            w.writerow(FIELDS); wf.writerow(["slug", "symbol", "reason"])
        for n, r in enumerate(targets, 1):
            slug, sym = r["slug"], r["symbol"]
            try:
                raw = fetch_one(slug)
            except Exception as e:
                failed += 1; wf.writerow([slug, sym, f"fetch:{e}"]); f.flush(); ff.flush()
                log(f"{n}/{len(targets)} {slug}: FETCH FAILED ({e})")
                time.sleep(delay); continue
            if raw is None:
                failed += 1; wf.writerow([slug, sym, "404"]); ff.flush()
                log(f"{n}/{len(targets)} {slug}: 404")
                time.sleep(delay); continue
            hist = parse_history(raw)
            if not hist:
                empty += 1; wf.writerow([slug, sym, "no-history-table"]); ff.flush()
                log(f"{n}/{len(targets)} {slug}: no end-of-year table")
                time.sleep(delay); continue
            for year, mc, pct in hist:
                w.writerow([slug, sym, year, f"{mc:.0f}", "" if pct is None else pct])
            f.flush()
            ok += 1
            if n % 25 == 0 or n == len(targets):
                log(f"{n}/{len(targets)} ok={ok} empty={empty} failed={failed} "
                    f"({(time.time()-t0)/n:.2f}s/company)")
            time.sleep(delay)
    return ok, empty, failed, time.time() - t0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pilot", type=int, default=20)
    ap.add_argument("--full", action="store_true", help="sweep the whole slug map")
    ap.add_argument("--resume", action="store_true", help="skip slugs already in cmc_annual.csv")
    ap.add_argument("--delay", type=float, default=1.0)
    a = ap.parse_args()

    slugs = load_slugs()
    skip = done_slugs() if a.resume else set()
    pending = [r for r in slugs if r["slug"] not in skip]
    if skip:
        log(f"resume: {len(skip)} slugs already done, {len(pending)} pending")

    targets = pending if a.full else pending[:a.pilot]
    if not targets:
        log("nothing to do"); return

    ok, empty, failed, elapsed = run(targets, a.delay, append=a.resume or a.full)
    per = elapsed / max(len(targets), 1)
    log(f"DONE ok={ok} empty={empty} failed={failed} in {elapsed:.0f}s ({per:.2f}s/company)")

    if not a.full:
        remaining = len(pending)
        eta = remaining * per
        print()
        print("=" * 68)
        print("  BUDGET GATE — full sweep projection")
        print(f"  companies pending : {remaining}")
        print(f"  measured rate     : {per:.2f}s each (delay {a.delay}s)")
        print(f"  projected wall    : {eta/3600:.1f} hours ({eta/60:.0f} min)")
        print(f"  pilot yield       : {ok}/{len(targets)} with history, "
              f"{empty} empty, {failed} failed")
        print("  network egress    : ~70KB/page, so ~%.1f GB for the sweep"
              % (remaining * 70 / 1024 / 1024))
        print()
        print("  This is a batch job. Get approval, then run on the mini:")
        print("    python history_fetch.py --full --resume")
        print("=" * 68)


if __name__ == "__main__":
    main()
