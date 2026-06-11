#!/usr/bin/env python3
"""Fetch the weekly Men's World Rugby rankings from Wikimedia Commons.

Source: https://commons.wikimedia.org/wiki/Data:Men%27s_World_Rugby_rankings.tab
(CC-BY-4.0). The .tab page is JSON: schema.fields[0] is an ISO date, the
remaining fields are one per team (English display name in title.en), and
data rows carry the rank numbers (null when a team was unranked that week).

Emits scripts/rugby/wrurankings.txt in the wide-TSV layout the rugby ETL
already parses: a "Date" header row with team columns, then M/D/YYYY rows.

Sanity gates (non-zero exit, so the weekly Action fails without committing):
  - at least 1,100 data rows and 24 team columns
  - latest date must not regress vs the existing wrurankings.txt

Run: python scripts/rugby/fetch_wru_rankings.py [out_path]
Stdlib only; no dependencies.
"""
import io
import json
import os
import sys
import urllib.request

URL = ("https://commons.wikimedia.org/w/index.php"
       "?title=Data:Men%27s_World_Rugby_rankings.tab&action=raw")
UA = ("MetroPowerRankingsBot/1.0 (rugby rankings refresh; "
      "https://github.com/ashwin-desikan) python-urllib")

MIN_ROWS = 1100
MIN_TEAMS = 24


def latest_date_in_existing(path):
    if not os.path.exists(path):
        return None
    best = None
    with io.open(path, encoding="utf-8") as f:
        for line in f:
            cell = line.split("\t", 1)[0].strip()
            parts = cell.split("/")
            if len(parts) == 3 and all(p.isdigit() for p in parts):
                m, d, y = (int(p) for p in parts)
                iso = f"{y:04d}-{m:02d}-{d:02d}"
                best = iso if best is None or iso > best else best
    return best


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "wrurankings.txt")

    req = urllib.request.Request(URL, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        tab = json.loads(resp.read().decode("utf-8"))

    fields = tab["schema"]["fields"]
    assert fields[0]["name"].lower() == "date", "schema drift: first field is not date"
    teams = []
    for f in fields[1:]:
        title = f.get("title") or {}
        teams.append(title.get("en") or f["name"].replace("_", " "))
    rows = tab["data"]

    assert len(rows) >= MIN_ROWS, f"sanity: only {len(rows)} rows (< {MIN_ROWS})"
    assert len(teams) >= MIN_TEAMS, f"sanity: only {len(teams)} team columns (< {MIN_TEAMS})"

    dates = [r[0] for r in rows if r and r[0]]
    latest = max(dates)
    prev_latest = latest_date_in_existing(out_path)
    if prev_latest is not None:
        assert latest >= prev_latest, (
            f"sanity: source latest {latest} is older than existing {prev_latest}")

    lines = ["Date\t" + "\t".join(teams)]
    for r in sorted(rows, key=lambda x: x[0] or ""):
        d = r[0]
        if not d:
            continue
        y, m, dd = d.split("-")
        cells = [f"{int(m)}/{int(dd)}/{int(y)}"]
        for v in r[1:len(teams) + 1]:
            cells.append(str(int(v)) if isinstance(v, (int, float)) and v is not None else "")
        lines.append("\t".join(cells))

    with io.open(out_path, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines) + "\n")

    print(f"wrote {out_path}: {len(rows)} weeks, {len(teams)} teams, latest {latest}"
          + (f" (was {prev_latest})" if prev_latest else ""))


if __name__ == "__main__":
    main()
