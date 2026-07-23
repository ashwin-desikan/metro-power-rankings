"""Fetch the two upstream sources into out/ as normalized CSVs.

  source_public.csv   Rank,Name,Symbol,marketcap,price,country   (companiesmarketcap.com)
  source_unicorns.csv Company,ValuationBn,DateJoined,Country,City,Industry,Investors (CB Insights)

Fallback: if a fetch fails, looks for a manually-saved file in drop/
(drop/companiesmarketcap.csv, drop/unicorns.html or drop/unicorns.csv).
Exits non-zero if a source is unavailable from both routes.
"""
import csv, io, os, re, sys
from html.parser import HTMLParser
from common import fetch_url, log

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out"); DROP = os.path.join(HERE, "drop")
os.makedirs(OUT, exist_ok=True)

CMC_URL = "https://companiesmarketcap.com/?download=csv"
CBI_URL = "https://www.cbinsights.com/research-unicorn-companies"
MIN_PUBLIC, MIN_UNICORNS = 9500, 1100

def norm_num(s):
    if s is None: return None
    s = str(s).replace("$", "").replace(",", "").strip()
    if s in ("", "-", "N/A"): return None
    try: return float(s)
    except ValueError: return None

def parse_public(raw):
    text = raw.decode("utf-8-sig", errors="replace")
    rows = list(csv.reader(io.StringIO(text)))
    if not rows: sys.exit("FATAL: empty public CSV")
    hdr = [h.strip().lower() for h in rows[0]]
    def col(*names):
        for n in names:
            if n in hdr: return hdr.index(n)
        sys.exit(f"FATAL: public CSV missing column {names}; header={hdr}")
    iR, iN, iS = col("rank"), col("name"), col("symbol")
    iM, iP, iC = col("marketcap", "market cap"), col("price (usd)", "price"), col("country")
    out = []
    for r in rows[1:]:
        if len(r) <= max(iR, iN, iS, iM, iP, iC): continue
        name, sym = r[iN].strip(), r[iS].strip()
        if not name or not sym: continue   # a parsed CSV has no split rows; blanks = malformed, skip+count
        out.append([r[iR].strip(), name, sym, norm_num(r[iM]) or 0, norm_num(r[iP]), r[iC].strip()])
    return out

class TableParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.rows = []; self._row = None; self._cell = None
    def handle_starttag(self, tag, attrs):
        if tag == "tr": self._row = []
        elif tag in ("td", "th") and self._row is not None: self._cell = []
    def handle_endtag(self, tag):
        if tag in ("td", "th") and self._cell is not None and self._row is not None:
            self._row.append("".join(self._cell).strip()); self._cell = None
        elif tag == "tr" and self._row is not None:
            if self._row: self.rows.append(self._row)
            self._row = None
    def handle_data(self, data):
        if self._cell is not None: self._cell.append(data)

DATE_RE = re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{4})$")
def parse_unicorns_html(raw):
    p = TableParser(); p.feed(raw.decode("utf-8", errors="replace"))
    out = []
    for r in p.rows:
        if len(r) < 6: continue
        val = norm_num(r[1]); m = DATE_RE.match(r[2].strip())
        if val is None or not m: continue   # header/nav rows
        mm, dd, yyyy = m.groups()
        out.append([r[0].strip(), val, f"{yyyy}-{int(mm):02d}-{int(dd):02d}",
                    r[3].strip(), r[4].strip(), r[5].strip(),
                    r[6].strip() if len(r) > 6 else ""])
    return out

def get(url, dropfile, kind):
    try:
        raw = fetch_url(url); log(f"{kind}: fetched {len(raw)/1024:.0f}KB from source"); return raw
    except Exception as e:
        log(f"{kind}: FETCH FAILED ({e}); trying drop/{dropfile}")
        path = os.path.join(DROP, dropfile)
        if os.path.exists(path):
            return open(path, "rb").read()
        sys.exit(f"FATAL: {kind} unavailable — fetch failed and no drop/{dropfile}. "
                 f"Save the file there manually and re-run.")

def main():
    pub = parse_public(get(CMC_URL, "companiesmarketcap.csv", "public"))
    if len(pub) < MIN_PUBLIC: sys.exit(f"FATAL: public rows {len(pub)} < {MIN_PUBLIC} sanity floor")
    with open(os.path.join(OUT, "source_public.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(["Rank","Name","Symbol","marketcap","price","country"]); w.writerows(pub)
    log(f"public: {len(pub)} rows written")

    croppath = os.path.join(DROP, "unicorns.csv")
    if os.path.exists(croppath):
        uni = [r for r in csv.reader(open(croppath, encoding="utf-8-sig"))][1:]
        log(f"unicorns: using drop/unicorns.csv ({len(uni)} rows)")
    else:
        uni = parse_unicorns_html(get(CBI_URL, "unicorns.html", "unicorns"))
    if len(uni) < MIN_UNICORNS: sys.exit(f"FATAL: unicorn rows {len(uni)} < {MIN_UNICORNS} sanity floor")
    with open(os.path.join(OUT, "source_unicorns.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(["Company","ValuationBn","DateJoined","Country","City","Industry","Investors"]); w.writerows(uni)
    log(f"unicorns: {len(uni)} rows written")

if __name__ == "__main__":
    main()
