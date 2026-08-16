"""Harvest the CompaniesMarketCap slug map: slug -> symbol, name, country, rank.

WHY THIS EXISTS
The weekly feed (fetch_source.py, ?download=csv) gives Rank,Name,Symbol,marketcap,
price,country but NO slug. The per-company market cap HISTORY lives at
/<slug>/marketcap/, so without a slug there is no way to reach it. This walks the
paginated ranking (100 rows per page) and pins each slug to the symbol the rest of
the pipeline already keys on (mktcap_companies.company_id, mktcap_geo.symbol).

  python history_slugs.py                  # dry run -> out/cmc_slugs.csv
  python history_slugs.py --write          # + upsert into mktcap_slugs
  python history_slugs.py --max-pages 3    # smoke test (300 rows)

Stdlib only, same as the rest of scripts/mktcap/.
"""
import argparse, csv, html, os, re, sys, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import fetch_url, log, rest  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)

BASE = "https://companiesmarketcap.com"
ROW_RE = re.compile(r"<tr>(.*?)</tr>", re.S)
RANK_RE = re.compile(r'class="rank-td[^"]*"[^>]*data-sort="(\d+)"')
SLUG_RE = re.compile(r'href="/([^"/]+)/marketcap/"')
NAME_RE = re.compile(r'<div class="company-name">(.*?)</div>', re.S)
CODE_RE = re.compile(r'<div class="company-code">(?:<span[^>]*>.*?</span>)?([^<]*)</div>', re.S)
CTRY_RE = re.compile(r'<span class="responsive-hidden">([^<]*)</span>')

# A ranking page that parses to fewer rows than this is either the end of the
# list or a layout change. Either way, stop and say which.
FULL_PAGE = 100


def clean(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s or "")).strip()


def parse_page(raw):
    """-> list of dicts. Rows without a slug or symbol are dropped and counted."""
    doc = raw.decode("utf-8", "replace")
    rows, dropped = [], 0
    for m in ROW_RE.finditer(doc):
        chunk = m.group(1)
        slug = SLUG_RE.search(chunk)
        code = CODE_RE.search(chunk)
        if not slug or not code:
            dropped += 1
            continue
        name = NAME_RE.search(chunk)
        rank = RANK_RE.search(chunk)
        ctry = CTRY_RE.search(chunk)
        sym = clean(code.group(1))
        if not sym:
            dropped += 1
            continue
        rows.append({
            "slug": slug.group(1),
            "symbol": sym,
            "name": clean(name.group(1)) if name else "",
            "country": clean(ctry.group(1)) if ctry else "",
            "rank": int(rank.group(1)) if rank else None,
        })
    return rows, dropped


def crawl(max_pages, delay):
    seen, out, page = set(), [], 1
    while page <= max_pages:
        url = BASE + ("/" if page == 1 else f"/page/{page}/")
        try:
            raw = fetch_url(url, timeout=60)
        except Exception as e:
            sys.exit(f"FATAL: page {page} fetch failed ({e}); crawl aborted with "
                     f"{len(out)} rows harvested. Re-run, it is idempotent.")
        rows, dropped = parse_page(raw)
        if not rows:
            log(f"page {page}: 0 rows -> end of list")
            break
        new = 0
        for r in rows:
            if r["slug"] in seen:
                continue
            seen.add(r["slug"]); out.append(r); new += 1
        log(f"page {page}: {len(rows)} rows ({new} new, {dropped} dropped)")
        if new == 0:
            log(f"page {page}: nothing new -> pagination has wrapped, stopping")
            break
        if len(rows) < FULL_PAGE:
            log(f"page {page}: short page ({len(rows)} < {FULL_PAGE}) -> last page")
            break
        page += 1
        time.sleep(delay)
    return out


def upsert(rows, chunk=500):
    hdr = {"Prefer": "resolution=merge-duplicates,return=minimal"}
    for i in range(0, len(rows), chunk):
        batch = [{"slug": r["slug"], "symbol": r["symbol"], "name": r["name"],
                  "country": r["country"], "rank": r["rank"]} for r in rows[i:i + chunk]]
        rest("POST", "/rest/v1/mktcap_slugs?on_conflict=slug", body=batch, headers=hdr)
        log(f"upserted {min(i + chunk, len(rows))}/{len(rows)}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="upsert into mktcap_slugs")
    ap.add_argument("--max-pages", type=int, default=200)
    ap.add_argument("--delay", type=float, default=1.0)
    a = ap.parse_args()

    rows = crawl(a.max_pages, a.delay)
    if not rows:
        sys.exit("FATAL: zero rows harvested — layout change, not an empty site.")

    path = os.path.join(OUT, "cmc_slugs.csv")
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["slug", "symbol", "name", "country", "rank"])
        w.writeheader(); w.writerows(rows)
    log(f"{len(rows)} slugs -> {path}")

    dupes = len(rows) - len({r["symbol"] for r in rows})
    if dupes:
        log(f"NOTE: {dupes} rows share a symbol with another row (the known "
            f"collision class — Phoenix/PHX.AE, LIFE/ATYR). Slug is the PK here, "
            f"so nothing is lost; the join to mktcap_geo is what has to disambiguate.")

    if a.write:
        upsert(rows)
        log("mktcap_slugs upserted")
    else:
        log("dry run (no --write); nothing sent to Supabase")


if __name__ == "__main__":
    main()
