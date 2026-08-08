#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Assert that public.champions agrees with the workbook about WHEN a title was won.

Why this exists
---------------
The Champions League workbook's standings sheets carry three year-bearing fields
per row and only one of them is authoritative:

    key       "2017Toronto FC"   <- the season, prefixed
    end_year  2017               <- AUTHORITATIVE
    season    "2017-18"          <- a label, fabricated for calendar-year leagues
    year      2018               <- derived from the label, therefore wrong there

The original football load read `year`. For the 30-odd leagues that play a
calendar season (MLS, Allsvenskan, CSL, K League, J1, Veikkausliiga, and the
historical calendar eras of Denmark, Poland, Hungary, Russia, Romania,
Bulgaria, Czechoslovakia, the DDR and Yugoslavia) the workbook renders that
season as "2017-18" anyway, so `year` came out one too high on 855 rows.

That is not merely cosmetic. Toronto FC's 2017 MLS Cup was filed as 2018, which
put it a year away from the same title in the champions-history lineage, so the
alias de-duplication could not see the two as the same trophy and Toronto
rendered it twice.

`end_year` is right in every regime: for a calendar league it is the season, for
an autumn-spring league it is the season's end year, which is the convention the
rest of the site already uses. The `key` prefix corroborates `end_year` on all
4,666 champion rows, and every calendar/split boundary the rule implies lands on
the year the league actually switched.

Run this after any reload of the cl_league_history lineage. Non-zero exit means
the loader has gone back to reading `year`.

    python scripts/champions/check_year_integrity.py
"""

import sys
from pathlib import Path

import requests

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = Path(__file__).resolve().parent.parent.parent
URL = "https://nmprqkmymrdknffwnuur.supabase.co"
KEY = (ROOT / "scripts" / "mktcap" / "supabase_key.txt").read_text(encoding="utf-8").strip()
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}


def get_all(path, params):
    out, offset = [], 0
    while True:
        p = dict(params, limit=1000, offset=offset)
        r = requests.get(f"{URL}/rest/v1/{path}", headers=H, params=p, timeout=120)
        r.raise_for_status()
        b = r.json()
        out.extend(b)
        if len(b) < 1000:
            return out
        offset += 1000


def main():
    raw = get_all("cl_league_history",
                  {"select": "country,league,season,team,end_year", "champions": "eq.Y"})
    # (country, team, end_year) survives the season relabel; season alone does not.
    truth = {}
    for r in raw:
        truth.setdefault((r["country"], r["team"]), set()).add(int(float(r["end_year"])))

    rows = get_all("champions",
                   {"select": "id,comp_slug,country,season,year,team_name",
                    "source": "eq.cl_league_history"})
    print(f"cl_league_history rows in champions: {len(rows):,}")

    bad = []
    for c in rows:
        years = truth.get((c.get("country"), c.get("team_name")))
        if years is None:
            continue          # renamed club; the season check below still applies
        if c["year"] not in years:
            bad.append(c)

    # A calendar-league row must not carry a split-year label, and vice versa.
    mislabelled = [c for c in rows
                   if len(str(c["season"])) == 4 and str(c["season"]) != str(c["year"])]

    print(f"rows whose year is not a season this club actually won: {len(bad)}")
    for c in bad[:15]:
        print(f"   {c['comp_slug']}  {c['season']}  y={c['year']}  {c['team_name']}")
    print(f"rows with a plain season label that disagrees with year: {len(mislabelled)}")

    if bad or mislabelled:
        print("\nFAIL: the loader is reading cl_league_history.year again. "
              "Use end_year. See the docstring.")
        sys.exit(1)
    print("\nOK: every year traces back to the workbook's end_year.")


if __name__ == "__main__":
    main()
