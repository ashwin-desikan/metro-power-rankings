#!/usr/bin/env python3
"""Cache football-data.co.uk's English Premier League season files.

    python scripts/football/fetch_e0.py            # fetch anything missing
    python scripts/football/fetch_e0.py --refresh  # re-fetch the current season too

Writes data/football/e0/E0-<season>.csv, which
scripts/football/build_expectation.py reads for two things: the seasons the
AllFootball.xlsx spine does not carry (2023-24 onward) and the closing-odds
market layer.

`data/` is gitignored, so this cache is per-machine and the ledger can only be
rebuilt where the cache and the workbook live. That is deliberate - the shipped
artefact is public/data/football/expectation/, not the inputs.

🔴 The pre-2000 files are NOT UTF-8 (stray 0xA0 bytes in referee names). They
are stored here byte-for-byte; the decode fallback lives in the build.
🔴 Network: reachable from the Windows box and CI, NOT from the Cowork cloud
sandbox.
"""
import argparse, os, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "data", "football", "e0")
FIRST_SEASON = 1993  # football-data.co.uk starts at 1993-94
UA = {"User-Agent": "Mozilla/5.0 (citizenofnowhere-elo)"}
MIN_BYTES = 5000  # a real season file; anything smaller is an error page


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true",
                    help="re-fetch seasons already on disk (the live one changes weekly)")
    ap.add_argument("--last", type=int, default=None,
                    help="last season start year to fetch (default: this year)")
    a = ap.parse_args()
    last = a.last if a.last else time.gmtime().tm_year
    os.makedirs(OUT, exist_ok=True)
    ok = skip = fail = 0
    pending = []  # the live season is often not posted until it has games
    for start in range(FIRST_SEASON, last + 1):
        code = "%02d%02d" % (start % 100, (start + 1) % 100)
        season = "%d-%02d" % (start, (start + 1) % 100)
        dest = os.path.join(OUT, "E0-%s.csv" % season)
        if os.path.exists(dest) and os.path.getsize(dest) > MIN_BYTES and not a.refresh:
            skip += 1
            continue
        url = "https://www.football-data.co.uk/mmz4281/%s/E0.csv" % code
        try:
            data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30).read()
            if len(data) < MIN_BYTES:
                raise ValueError("short body, %d bytes" % len(data))
            open(dest, "wb").write(data)
            ok += 1
            print("OK   %s  %d bytes" % (season, len(data)), flush=True)
        except Exception as e:
            # 🔴 The season that has only just kicked off may not be posted yet,
            # and that is not a failure. Only a missing HISTORICAL season is.
            if start >= last:
                pending.append(season)
                print("PEND %s  not posted yet (%r)" % (season, e), flush=True)
            else:
                fail += 1
                print("FAIL %s  %s  %r" % (season, url, e), flush=True)
        time.sleep(0.7)  # one person's free server; do not hammer it
    print("done: %d fetched, %d already cached, %d failed, %d not posted yet%s"
          % (ok, skip, fail, len(pending), (": " + ", ".join(pending)) if pending else ""))
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main())
