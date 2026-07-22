#!/usr/bin/env python3
"""Weekly citypopulation.de /en/help/new/ watcher.

Fetches the "what's new" changelog, keeps only entries whose country is in our
covered set (see covered.py), diffs against the committed snapshot, and pushes a
notification listing the NEW in-coverage entries. No new entries -> silent.

stdlib-only (urllib + html.parser), matching scripts/forecast/*: it runs under
whatever python3 the weekly job uses, no pip. The snapshot is written but NOT
committed here — the mini's weekly job (metro-mini-refresh.sh) sweeps
public/data into one commit, same as every other refresh step. Run with
--self-test for offline CI.

Design note: the country filter is intentionally broad (we cover ~all
countries); the week-over-week diff is what keeps this low-noise.
"""
import json, re, sys
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from covered import covered_keys, is_covered  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SNAPSHOT = ROOT / "public" / "data" / "citypopulation-feed.json"
FEED_URL = "https://www.citypopulation.de/en/help/new/"
BASE = "https://www.citypopulation.de"
UA = "metro-area-watcher/1.0 (https://rankings.citizenofnowhere.org)"

class _FeedParser(HTMLParser):
    """Extracts the changelog rows: each <tr onclick=...> holds a
    <td class="date">, a <td class="updtext"> (the entry), and a country <a>."""
    def __init__(self):
        super().__init__()
        self.rows = []
        self._row = None
        self._cell = None
        self._buf = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "tr" and "onclick" in a:
            self._row = {"date": "", "updtext": "", "href": ""}
        elif tag == "td" and self._row is not None:
            self._cell = (a.get("class") or "").strip()
            self._buf = []
        elif tag == "a" and self._row is not None and not self._row["href"]:
            if a.get("href"):
                self._row["href"] = a["href"]

    def handle_data(self, data):
        if self._cell is not None:
            self._buf.append(data)

    def handle_endtag(self, tag):
        if tag == "td" and self._cell is not None and self._row is not None:
            text = " ".join("".join(self._buf).split())
            if self._cell == "date":
                self._row["date"] = text
            elif self._cell == "updtext":
                self._row["updtext"] = text
            self._cell = None
            self._buf = []
        elif tag == "tr" and self._row is not None:
            if self._row["date"] or self._row["updtext"]:
                self.rows.append(self._row)
            self._row = None

def _country_signals(row):
    """Candidate country strings for an entry: the /en/<slug>/ URL slug (most
    reliable) and the leading word of the entry text (e.g. 'Portugal
    (municipalities)' -> 'Portugal'). Either matching = in coverage."""
    sigs = []
    m = re.match(r"/en/([^/]+)/", row.get("href", ""))
    if m:
        sigs.append(m.group(1))
    head = re.split(r"[:\-–(]", row.get("updtext", ""))[0].strip()
    if head:
        sigs.append(head)
    return sigs

def parse_entries(html):
    p = _FeedParser()
    p.feed(html)
    out = []
    for r in p.rows:
        href = r["href"]
        url = (BASE + href) if href.startswith("/") else (href or FEED_URL)
        out.append({
            "date": r["date"],
            "title": r["updtext"],
            "url": url,
            "countries": _country_signals(r),
        })
    return out

def key(e):
    return f"{e['date']}|{e['title']}|{e['url']}"

def filter_covered(entries, keys=None):
    keys = keys if keys is not None else covered_keys()
    return [e for e in entries if any(is_covered(c, keys) for c in e["countries"])]

def load_seen():
    if not SNAPSHOT.exists():
        return None  # None signals "first run / seeding"
    try:
        return {key(e) for e in json.loads(SNAPSHOT.read_text(encoding="utf-8")).get("entries", [])}
    except Exception:
        return set()

def write_snapshot(in_coverage):
    # Sorted, no timestamp -> the file only changes when the entry set changes,
    # so it doesn't churn a commit every week for nothing.
    entries = sorted(in_coverage, key=lambda e: (e["date"], e["title"]), reverse=True)
    SNAPSHOT.write_text(json.dumps({"entries": entries}, indent=2, ensure_ascii=False) + "\n",
                        encoding="utf-8")

def notify(fresh):
    title = f"citypopulation.de: {len(fresh)} new update(s) in coverage"
    body = "\n".join(f"{e['date']}  {e['title']}" for e in fresh[:20])
    if len(fresh) > 20:
        body += f"\n… +{len(fresh) - 20} more"
    try:
        sys.path.insert(0, str(ROOT / "mac-mini-jobs"))
        from notify import notify as push  # noqa: E402
        if not push(title, body, 0):
            print("  notify: push returned False (check NOTIFY_* env in config.env)", file=sys.stderr)
    except Exception as e:
        print(f"  notify: could not send push ({e})", file=sys.stderr)

def fetch_html():
    req = urllib.request.Request(FEED_URL, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")

def main():
    try:
        html = fetch_html()
    except Exception as e:
        print(f"citypopulation watcher: fetch failed ({e}); leaving snapshot untouched", file=sys.stderr)
        return 1

    entries = parse_entries(html)
    if not entries:
        print("citypopulation watcher: parsed 0 rows (feed layout may have changed); "
              "leaving snapshot untouched", file=sys.stderr)
        return 1  # never overwrite a good snapshot with an empty parse

    keys = covered_keys()
    in_coverage = filter_covered(entries, keys)
    seen = load_seen()
    seeding = seen is None
    fresh = [] if seeding else [e for e in in_coverage if key(e) not in seen]

    write_snapshot(in_coverage)

    if seeding:
        print(f"citypopulation watcher: seeded snapshot with {len(in_coverage)} "
              f"in-coverage entries (of {len(entries)} total); no notifications on first run")
    elif fresh:
        notify(fresh)
        for e in fresh:
            print(f"  NEW  {e['date']}  {e['title']}")
        print(f"citypopulation watcher: {len(fresh)} new in-coverage update(s) — notified")
    else:
        print(f"citypopulation watcher: no new in-coverage updates "
              f"({len(in_coverage)} in coverage of {len(entries)} total)")
    return 0

# ---------------------------------------------------------------------------
_FIXTURE = """
<table>
<tr onclick="cp.clickById('3')"><td class="date">2026-07-01</td>
  <td class="update">update</td><td class="updtext"><a href="/en/germany/">Germany</a></td></tr>
<tr onclick="cp.clickById('2')"><td class="date">2026-06-30</td>
  <td class="update">update</td><td class="updtext"><a href="/en/uk/">United Kingdom (municipalities)</a></td></tr>
<tr onclick="cp.clickById('1')"><td class="date">2026-06-29</td>
  <td class="update">update</td><td class="updtext"><a href="/en/atlantis/">Atlantis</a></td></tr>
</table>
"""

def _self_test():
    entries = parse_entries(_FIXTURE)
    assert len(entries) == 3, len(entries)
    assert entries[0] == {"date": "2026-07-01", "title": "Germany",
                          "url": "https://www.citypopulation.de/en/germany/",
                          "countries": ["germany", "Germany"]}, entries[0]

    in_cov = filter_covered(entries)
    titles = {e["title"] for e in in_cov}
    assert "Germany" in titles                       # direct match
    assert "United Kingdom (municipalities)" in titles  # via uk alias
    assert not any(e["title"] == "Atlantis" for e in in_cov)  # filtered out

    # Diff: with Germany already seen, only the UK entry is fresh (Atlantis is
    # out of coverage and never counts).
    seen = {key(entries[0])}
    fresh = [e for e in in_cov if key(e) not in seen]
    assert len(fresh) == 1 and fresh[0]["url"].endswith("/en/uk/"), fresh
    print("watch_feed self-test OK")

if __name__ == "__main__":
    sys.exit(_self_test() if "--self-test" in sys.argv else main() or 0)
