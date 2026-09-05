#!/usr/bin/env python3
"""Fetch the current FIBA World Ranking, presented by Nike. Men or women.

Sources: https://www.fiba.basketball/en/ranking/men
         https://www.fiba.basketball/en/ranking/women

The women's ranking was added 2026-09-04. It is the same Next.js page with the
same Flight payload and the same record shape, so it is the same parser with a
different URL rather than a second script. Before that the Cup carried a
hand-kept top TEN for women's basketball, which is not a short ranking but a
ranking that stops exactly where women's basketball outside the traditional
powers begins: Mali, three times an Afrobasket finalist, sat 148th on the board.

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
                    scripts/basketball/fiba_ranking_women.json
  {"date":"2026-03-03","label":"Mar 3, 2026","source":"...","fetched":"...",
   "teams":[{"rank":1,"country":"USA","ioc":"USA","zoneRank":1,
             "pts":893.8,"delta":0}, ...]}

Sanity gates (assert -> non-zero exit, so the scheduled Action fails WITHOUT
committing garbage): >=120 teams, contiguous rank 1, strictly-known date, and
the ranking date must not regress versus the existing file.

Run: python scripts/basketball/fetch_fiba_ranking.py [--gender men|women] [out_path]
Stdlib only; no dependencies.
"""
import io
import json
import os
import re
import sys
import urllib.request

GENDERS = {
    "men": ("https://www.fiba.basketball/en/ranking/men",
            "FIBA World Ranking (Men) presented by Nike - fiba.basketball/en/ranking/men",
            "fiba_ranking.json"),
    "women": ("https://www.fiba.basketball/en/ranking/women",
              "FIBA Women's World Ranking presented by Nike - fiba.basketball/en/ranking/women",
              "fiba_ranking_women.json"),
}
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) MetroPowerRankingsBot/1.0 "
      "(FIBA ranking refresh; https://github.com/ashwin-desikan)")
# 🔴 PER GENDER, because the two tables are not the same size and one global
# floor cannot serve both. The women's table is genuinely 119 long: verified
# 2026-09-05 against fiba.basketball/en/ranking/women, which lists ranks 1 to
# 119 with Georgia last on 19.5 points. A single MIN_TEAMS of 120 therefore
# failed a HEALTHY parse for a year, and the temptation on seeing "119 < 120"
# is to drop the number by one, which would leave the gate one team from
# useless.
#
# These are SET from observed table sizes with headroom, not derived: men 154
# on 2026-07-13 and 159 on 2026-09-01, women 119 on 2026-04-01. The floor
# catches a CLEAN truncation (a top-ten parse has contiguous ranks and would
# pass every other gate); the contiguity assert below catches a gappy one.
# Re-observe before moving either, and say which of the two a new number is.
MIN_TEAMS = {"men": 140, "women": 105}

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
    args = [a for a in sys.argv[1:]]
    gender = "men"
    if "--gender" in args:
        i = args.index("--gender")
        gender = args[i + 1]
        del args[i:i + 2]
    if gender not in GENDERS:
        sys.exit("usage: fetch_fiba_ranking.py [--gender men|women] [out_path]")
    url, source, default_name = GENDERS[gender]
    out_path = args[0] if args else os.path.join(
        os.path.dirname(os.path.abspath(__file__)), default_name)

    req = urllib.request.Request(url, headers={"User-Agent": UA})
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

    floor = MIN_TEAMS[gender]
    assert len(teams) >= floor, (
        "sanity: only %d %s teams (< %d). If the federation really did shrink "
        "the table, re-observe the live page and move the floor deliberately; "
        "do not shave it to clear this run." % (len(teams), gender, floor))
    assert teams[0]["rank"] == 1, "sanity: no rank-1 team"
    ranks = [t["rank"] for t in teams]
    assert ranks == sorted(set(ranks)), "sanity: duplicate or non-monotonic ranks"
    # FIBA publishes an unbroken 1..N on both tables (men 1..154 on 2026-07-13,
    # women 1..119 on 2026-04-01). A hole means the record regex stopped
    # matching partway, which no count floor would catch.
    assert ranks == list(range(1, len(teams) + 1)), (
        "sanity: ranks are not contiguous 1..%d, so the parse dropped rows "
        "mid-table" % len(teams))
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
        "source": source,
        "teams": teams,
    }
    with io.open(out_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")

    print("wrote %s (%s): %d teams, date %s%s" % (
        out_path, gender, len(teams), date_iso,
        " (was %s)" % prev if prev else ""))


if __name__ == "__main__":
    main()
