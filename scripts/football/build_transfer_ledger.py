"""The Money Ledger: transfer spending, receipts and squad-value change, per
club and season, for the six leagues the value series covers.

WHAT THIS IS (scoping note "SoccerSolver - what to take for club football -
2026-09-10.md", use case A). Per club-season, from 2012-13:
  spent      fees paid for players arriving (EUR)
  received   fees received for players leaving
  net        received minus spent (positive = the window made money)
  n_in/n_out arrivals and departures with a fee on record, and the
             count of moves with NO fee recorded (free, loan, unknown)
  v_start    squad value in the July the season opened (build_club_value's
             monthly series), v_end the following June, both with `n`
  appreciation  (v_end - v_start) - (spent - received): the value change
             the squad produced on its own once trading is netted out.
             Buying 100m of players and ending 100m higher is 0; ending
             120m higher is +20m of players the club made better, or the
             market repriced.
The Against Expectation surplus per season is NOT joined here; the page
joins it on slug (lib/clubValueShape.computeValueSurplusJoin already does
the same for value), so one ledger never carries two sources' numbers.

🔴 FEES ONLY. Wages are estimates nobody licenses; fees are documented. A
missing fee is counted as a move with no fee, never as zero money, and the
count of those moves is published beside the totals. Loan fees appear in
the source as fees and are kept.

🔴 THE FILE CARRIES FUTURE-DATED ROWS. transfers.csv lists loan returns
with the loan's end date (2028, 2030); everything after DATA_END is dropped.
A season is the July-June year of the transfer date.

🔴 ATTRIBUTION BY THE ROW'S OWN CLUB IDS, resolved to clubs.csv names. The
value build refuses ids because a valuation's current_club_id is the club
TODAY; a transfer row's from_club_id and to_club_id are the two clubs of
that move on that date, which is exactly the attribution wanted. The names
in the transfers file are Transfermarkt's short forms ("Chelsea", "Wolves",
"Nott'm Forest") and match nothing; the ids match clubs.csv, whose names
the value build and the crosswalk already know.

Source: Transfermarkt via github.com/dcaribou/transfermarkt-datasets (CC0),
data/football/tm/transfers.csv.gz (paused upstream since July 2026).

  python scripts/football/build_transfer_ledger.py --self-test
  python scripts/football/build_transfer_ledger.py --dry
  python scripts/football/build_transfer_ledger.py --write
"""
from __future__ import annotations

import argparse
import csv
import gzip
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
from build_club_value import (  # noqa: E402  one matcher, one month index, one series
    COUNTRIES, MANUAL, SRC, club_countries, mindex, monthly_series, resolve_club,
)
from build_esd_crosswalk import COUNTRY, load_site, load_metros  # noqa: E402

OUT_DIR = os.path.join(ROOT, "public", "data", "football", "money")
FIRST_SEASON = 2012          # the value series floor; earlier fee rows are survivorship
DATA_END = "2026-07-06"      # the paused upstream's last day
SOURCE_CREDIT = ("Transfer fees and player valuations from Transfermarkt via "
                 "github.com/dcaribou/transfermarkt-datasets (CC0)")


def season_of(date: str) -> int:
    """July to June: 2024-08-15 is 2024, 2025-01-31 is 2024."""
    y, m = int(date[:4]), int(date[5:7])
    return y if m >= 7 else y - 1


def season_label(y: int) -> str:
    return "%d-%02d" % (y, (y + 1) % 100)


def club_names_by_id(src=SRC):
    out = {}
    with gzip.open(os.path.join(src, "clubs.csv.gz"), "rt", encoding="utf-8", newline="") as fh:
        for r in csv.DictReader(fh):
            out[r["club_id"]] = r["name"].strip()
    return out


def read_transfers(src=SRC, data_end=DATA_END, names=None):
    """Rows kept: dated on or before the data end, with both clubs named.
    Club names come from clubs.csv by id when the id is known there; a club
    outside clubs.csv keeps the file's short name and will not map."""
    names = names if names is not None else club_names_by_id(src)
    rows = []
    with gzip.open(os.path.join(src, "transfers.csv.gz"), "rt", encoding="utf-8", newline="") as fh:
        for r in csv.DictReader(fh):
            d = r.get("transfer_date") or ""
            if len(d) < 10 or d > data_end:
                continue
            frm = names.get(r.get("from_club_id") or "", (r.get("from_club_name") or "").strip())
            to = names.get(r.get("to_club_id") or "", (r.get("to_club_name") or "").strip())
            if not frm or not to or frm == to:
                continue
            fee_s = r.get("transfer_fee")
            fee = None
            if fee_s not in (None, ""):
                try:
                    fee = float(fee_s)
                except ValueError:
                    fee = None
            rows.append({"date": d, "season": season_of(d), "from": frm, "to": to, "fee": fee,
                         "player": r.get("player_name") or ""})
    return rows


def ledger(rows, first_season=FIRST_SEASON, last_season=None):
    """{club: {season: {spent, received, n_in, n_out, nofee_in, nofee_out, biggest_in, biggest_out}}}."""
    out = defaultdict(lambda: defaultdict(lambda: {"spent": 0.0, "received": 0.0, "n_in": 0, "n_out": 0,
                                                   "nofee_in": 0, "nofee_out": 0, "biggest_in": None, "biggest_out": None}))
    for r in rows:
        s = r["season"]
        if s < first_season or (last_season is not None and s > last_season):
            continue
        fee = r["fee"]
        a = out[r["to"]][s]
        b = out[r["from"]][s]
        if fee is None:
            a["nofee_in"] += 1
            b["nofee_out"] += 1
            continue
        if fee > 0:
            a["spent"] += fee; a["n_in"] += 1
            b["received"] += fee; b["n_out"] += 1
            if a["biggest_in"] is None or fee > a["biggest_in"]["fee"]:
                a["biggest_in"] = {"fee": fee, "player": r["player"], "club": r["from"]}
            if b["biggest_out"] is None or fee > b["biggest_out"]["fee"]:
                b["biggest_out"] = {"fee": fee, "player": r["player"], "club": r["to"]}
        else:
            a["nofee_in"] += 1
            b["nofee_out"] += 1
    return out


def season_values(series, season):
    """(v_start, n_start, v_end, n_end) for a club's monthly series, or Nones."""
    a = series.get(mindex("%d-07" % season))
    b = series.get(mindex("%d-06" % (season + 1)))
    return (a[0] if a else None, a[1] if a else None, b[0] if b else None, b[1] if b else None)


def build(src=SRC):
    rows = read_transfers(src)
    last_season = max(r["season"] for r in rows)
    led = ledger(rows, FIRST_SEASON, last_season)
    series, lo, hi = monthly_series(src)
    ctry_of = club_countries(src)
    site_exact, site_loose = load_site()
    place, by_slug = load_metros()
    payload, unmapped = defaultdict(list), defaultdict(list)
    for club, seasons in led.items():
        slug = COUNTRIES.get(ctry_of.get(club))
        if not slug:
            continue                                  # outside the six; not an error
        r = resolve_club(slug, club, site_exact, site_loose, place)
        ms = MANUAL.get((slug, club)) or r.get("metro_slug")
        if not ms and r.get("metro"):
            ms = next((s for s, m in by_slug.items() if m.get("name") == r["metro"]), None)
        if not ms:
            unmapped[slug].append(club)
            continue
        ser = series.get(club, {})
        out_seasons = []
        for s in range(FIRST_SEASON, last_season + 1):
            e = seasons.get(s)
            vs, ns, ve, ne = season_values(ser, s)
            if e is None and vs is None and ve is None:
                continue
            e = e or {"spent": 0.0, "received": 0.0, "n_in": 0, "n_out": 0, "nofee_in": 0, "nofee_out": 0, "biggest_in": None, "biggest_out": None}
            net = e["received"] - e["spent"]
            appr = (ve - vs) - (e["spent"] - e["received"]) if vs is not None and ve is not None else None
            out_seasons.append({
                "season": season_label(s), "y": s,
                "spent": round(e["spent"] / 1e6, 2), "received": round(e["received"] / 1e6, 2), "net": round(net / 1e6, 2),
                "n_in": e["n_in"], "n_out": e["n_out"], "nofee_in": e["nofee_in"], "nofee_out": e["nofee_out"],
                "v_start": round(vs / 1e6, 1) if vs is not None else None, "n_start": ns,
                "v_end": round(ve / 1e6, 1) if ve is not None else None, "n_end": ne,
                "appreciation": round(appr / 1e6, 1) if appr is not None else None,
                "biggest_in": ({**e["biggest_in"], "fee": round(e["biggest_in"]["fee"] / 1e6, 2)} if e["biggest_in"] else None),
                "biggest_out": ({**e["biggest_out"], "fee": round(e["biggest_out"]["fee"] / 1e6, 2)} if e["biggest_out"] else None),
            })
        if not out_seasons:
            continue
        tot_spent = sum(x["spent"] for x in out_seasons)
        tot_recv = sum(x["received"] for x in out_seasons)
        apprs = [x["appreciation"] for x in out_seasons if x["appreciation"] is not None]
        payload[slug].append({
            "club": club, "slug": r.get("slug"), "site_name": r.get("site_name"),
            "metro": r.get("metro"), "metro_slug": ms,
            "first": out_seasons[0]["season"], "last": out_seasons[-1]["season"],
            "spent": round(tot_spent, 1), "received": round(tot_recv, 1), "net": round(tot_recv - tot_spent, 1),
            "appreciation": round(sum(apprs), 1) if apprs else None, "seasons_valued": len(apprs),
            "seasons": out_seasons,
        })
    return payload, unmapped, last_season


def self_test():
    assert season_of("2024-08-15") == 2024 and season_of("2025-01-31") == 2024 and season_of("2025-07-01") == 2025
    assert season_label(2024) == "2024-25" and season_label(1999) == "1999-00"
    rows = [
        {"date": "2024-08-01", "season": 2024, "from": "A", "to": "B", "fee": 50e6, "player": "p1"},
        {"date": "2024-08-02", "season": 2024, "from": "B", "to": "C", "fee": 20e6, "player": "p2"},
        {"date": "2025-01-10", "season": 2024, "from": "C", "to": "B", "fee": None, "player": "p3"},   # no fee on record
        {"date": "2025-01-11", "season": 2024, "from": "A", "to": "B", "fee": 0.0, "player": "p4"},    # free or loan
        {"date": "2025-08-01", "season": 2025, "from": "B", "to": "A", "fee": 10e6, "player": "p5"},
    ]
    L = ledger(rows, 2024, 2025)
    b24 = L["B"][2024]
    assert b24["spent"] == 50e6 and b24["received"] == 20e6 and b24["n_in"] == 1 and b24["n_out"] == 1, b24
    assert b24["nofee_in"] == 2 and b24["nofee_out"] == 0, b24              # the None and the 0 both count as no fee
    assert b24["biggest_in"]["player"] == "p1" and b24["biggest_out"]["player"] == "p2"
    assert L["A"][2025]["spent"] == 10e6 and L["B"][2025]["received"] == 10e6
    # a row outside the window is dropped, a same-club row is never counted
    assert 2023 not in L["A"]
    # appreciation nets the trading out: buy 50, sell 20, value up 40 => the squad itself gained 10
    vs, ve, spent, recv = 300e6, 340e6, 50e6, 20e6
    assert (ve - vs) - (spent - recv) == 10e6
    # the season's value months
    ser = {mindex("2024-07"): (300e6, 25), mindex("2025-06"): (340e6, 26)}
    assert season_values(ser, 2024) == (300e6, 25, 340e6, 26) and season_values(ser, 2023) == (None, None, None, None)
    print("build_transfer_ledger self-test: OK")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()
    if a.self_test:
        self_test(); return 0
    if not (a.dry or a.write):
        ap.error("pass --self-test, --dry or --write")
    payload, unmapped, last_season = build()
    index = []
    for slug in sorted(payload):
        clubs = sorted(payload[slug], key=lambda c: -c["spent"])
        payload[slug] = clubs
        index.append({"slug": slug, "country": COUNTRY[slug], "clubs": len(clubs), "unmapped": len(unmapped.get(slug, []))})
        top = clubs[0]
        best = max((c for c in clubs if c["appreciation"] is not None), key=lambda c: c["appreciation"], default=None)
        print("%-8s %3d clubs %s..%s  biggest spender %s %.0fm net %+.0fm; best appreciation %s %+.0fm"
              % (slug, len(clubs), FIRST_SEASON, last_season, top["club"], top["spent"], top["net"],
                 best["club"] if best else "-", best["appreciation"] if best else 0))
        if unmapped.get(slug):
            print("         %d unmapped: %s" % (len(unmapped[slug]), ", ".join(sorted(unmapped[slug])[:8])))
    if not a.write:
        print("--dry: nothing written"); return 0
    os.makedirs(OUT_DIR, exist_ok=True)
    for slug, clubs in payload.items():
        with open(os.path.join(OUT_DIR, "%s.json" % slug), "w", encoding="utf-8", newline="\n") as fh:
            json.dump({"meta": {"country": COUNTRY[slug], "first_season": season_label(FIRST_SEASON),
                                "last_season": season_label(last_season), "data_end": DATA_END,
                                "source_credit": SOURCE_CREDIT,
                                "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds")},
                       "clubs": clubs}, fh, separators=(",", ":"), ensure_ascii=False)
    with open(os.path.join(OUT_DIR, "index.json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump({"_meta": {"asOf": DATA_END, "source_credit": SOURCE_CREDIT},
                   "first_season": season_label(FIRST_SEASON), "last_season": season_label(last_season),
                   "countries": index}, fh, separators=(",", ":"))
    print("wrote %d files to %s" % (len(payload) + 1, OUT_DIR))
    return 0


if __name__ == "__main__":
    sys.exit(main())
