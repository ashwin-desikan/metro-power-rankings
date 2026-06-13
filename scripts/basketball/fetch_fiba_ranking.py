#!/usr/bin/env python3
"""Fetch the current FIBA World Ranking (Men), presented by Nike.

Source: https://www.fiba.basketball/en/ranking/men

FIBA's site is a Next.js App Router page: the ranking is server-rendered into
the React Flight payload (self.__next_f script chunks) rather than a public
JSON API. Each national-team record is a clean JSON object once the chunks are
decoded, e.g.:
  {"worldRank":1,"countryName":"USA","zoneRank":1,"iocCode":"USA",
   "fibaCode":"USA","currentPoints":893.8,"worldRankVariation":0, ...}

We decode the chunks, pull those records, dedupe by world rank (the Biggest
Climbers/Droppers widgets repeat a few), and write a committed seed file. Zone
membership and portal-node mapping are applied later by the basketball ETL.

Output (committed): scripts/basketball/fiba_ranking.json
  {"date":"2026-03-03","label":"Mar 3, 2026","source":"...","fetched":"...",
   "teams":[{"rank":1,"country":"USA","ioc":"USA","zoneRank":1,
             "pts":893.8,"delta":0}, ...]}

Sanity gates (assert -> non-zero exit, so the scheduled Action fails WITHOUT
committing garbage): >=120 teams, contiguous rank 1, strictly-known date, and
the ranking date must not regress versus the existing file.

Run: python scripts/basketball/fetch_fiba_ranking.py [out_path]
Stdlib only; no dependencies.
"""
import io
import json
import os
import re
import sys
import urllib.request

URL = "https://www.fiba.basketball/en/ranking/men"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) MetroPowerRankingsBot/1.0 "
      "(FIBA ranking refresh; https://github.com/ashwin-desikan)")
SOURCE = "FIBA World Ranking (Men) presented by Nike - fiba.basketball/en/ranking/men"
MIN_TEAMS = 120

_MONTHS = {m: i for i, m in enumerate(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
     "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], start=1)}

_CHUNK = re.compile(r'self\.__next_f\.push\(\[\d+,("(?:[^"\\]|\\.)*")\]\)', re.S)
_REC = re.compile(
    r'\{"worldRank":(\d+),"countryName":"((?:[^"\\]|\\.)*?)","zoneRank":(\d+),'
    r'"iocCode":(?:"([^"]*)"|null),"fibaCode":"([^"]*)","currentPoints":([\d.]+),'
    r'"worldRankVariation":(-?\d+)')
_DATELABEL = re.compile(r'\b([A-Z][a-z]{2}) (\d{1,2}), (20\d\d)\b')
_SELOPT = re.compile(r'value="(20\d\d-\d\d-\d\d)T[^"]*"\s+selected')
_INVMON = {i: m for m, i in _MONTHS.items()}


def _flight_text(html):
    parts = []
    for c in _CHUNK.finditer(html):
        try:
            parts.append(json.loads(c.group(1)))
        except ValueError:
            pass
    return "".join(parts)


def _ranking_date(html):
    # Authoritative: the selected <option> in the ranking-date dropdown.
    m = _SELOPT.search(html)
    if m:
        iso = m.group(1)
        y, mo, d = iso.split("-")
        return iso, "%s %d, %s" % (_INVMON[int(mo)], int(d), y)
    # Fallback: the latest human-readable label in the rendered selector.
    best = None
    for mon, day, yr in _DATELABEL.findall(html):
        if mon not in _MONTHS:
            continue
        iso = "%s-%02d-%02d" % (yr, _MONTHS[mon], int(day))
        if best is None or iso > best[0]:
            best = (iso, "%s %d, %s" % (mon, int(day), yr))
    return best


def _existing_date(path):
    if not os.path.exists(path):
        return None
    try:
        return json.load(io.open(path, encoding="utf-8")).get("date")
    except (ValueError, OSError):
        return None


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "fiba_ranking.json")

    req = urllib.request.Request(URL, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        html = resp.read().decode("utf-8", "replace")

    text = _flight_text(html) or html.replace('\\"', '"')

    seen, teams = set(), []
    for m in _REC.finditer(text):
        rank = int(m.group(1))
        if rank in seen:
            continue
        seen.add(rank)
        teams.append({
            "rank": rank,
            "country": json.loads('"' + m.group(2) + '"'),
            "ioc": m.group(4) or m.group(5),
            "zoneRank": int(m.group(3)),
            "pts": float(m.group(6)),
            "delta": int(m.group(7)),
        })
    teams.sort(key=lambda t: t["rank"])

    assert len(teams) >= MIN_TEAMS, "sanity: only %d teams (< %d)" % (len(teams), MIN_TEAMS)
    assert teams[0]["rank"] == 1, "sanity: no rank-1 team"
    ranks = [t["rank"] for t in teams]
    assert ranks == sorted(set(ranks)), "sanity: duplicate or non-monotonic ranks"
    assert teams[0]["pts"] >= teams[-1]["pts"], "sanity: points not descending with rank"

    dl = _ranking_date(html)
    assert dl, "sanity: could not find a ranking date label"
    date_iso, date_label = dl
    prev = _existing_date(out_path)
    assert prev is None or date_iso >= prev, (
        "sanity: fetched date %s is older than existing %s" % (date_iso, prev))

    # Deterministic output (no fetch timestamp), so an unchanged ranking
    # produces no diff and the weekly Action is a clean no-op.
    doc = {
        "date": date_iso,
        "label": date_label,
        "source": SOURCE,
        "teams": teams,
    }
    with io.open(out_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")

    print("wrote %s: %d teams, date %s%s" % (
        out_path, len(teams), date_iso,
        " (was %s)" % prev if prev else ""))


if __name__ == "__main__":
    main()
