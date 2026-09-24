#!/usr/bin/env python3
"""
scripts/fans/fetch_wikipedia_totals.py

Fetches Wikipedia's own total monthly HUMAN ("user") pageviews across all
editions, from the Wikimedia REST API's pageviews/aggregate endpoint, and
writes data/fans/wikipedia_totals_monthly.json as {"YYYY-MM": views}.

Why this exists: app/api/fans/history/route.ts uses this file to normalise
a team's or league's Wikipedia attention against Wikipedia's OWN overall
traffic that same month. Human Wikipedia traffic has been declining (AI
search increasingly answers a lookup straight off the search results page,
without a click through to Wikipedia), which otherwise makes every sport on
/fans/trends look like it is declining even when nothing about relative fan
attention has actually moved -- this file is what lets that platform-wide
trend be divided back out.

MUST BE RUN FROM ASHWIN'S OWN MACHINE, not the cloud pipeline: the cloud
container's shared egress IP gets rate-limited (429) on this endpoint
quickly. Run it by hand via device_bash when refreshing this file, or let
scripts/fans/monthly_refresh.py call it (see that script's own call site
comment for the fail-open behaviour: a fetch error here must never block
the monthly refresh, and must never wipe out an existing, still-useful
copy of this file).

Endpoint:
    https://wikimedia.org/api/rest_v1/metrics/pageviews/aggregate/
        <project>/all-access/user/monthly/2022120100/<last full month>0100

<project> is "all-wikipedia-projects" first (every language edition of
Wikipedia specifically, excluding sister projects like Wiktionary/Commons);
if that token 404s or errors, falls back to "all-projects" (every Wikimedia
project) so this script still produces a usable, if slightly broader,
denominator rather than failing outright.

Usage:
    python3 scripts/fans/fetch_wikipedia_totals.py
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

START_TOKEN = "2022120100"  # first day of Dec 2022 -- 11 months before the
                             # Fan Attention Index history archive's own
                             # earliest month (2023-12), so a full trailing
                             # 12-month window can be built for every month
                             # that archive carries.
USER_AGENT = (
    "CitizenOfNowhere-FanAttentionIndex/1.0 "
    "(https://rankings.citizenofnowhere.org/fans; contact: hello@citizenofnowhere.org) "
    "scripts/fans/fetch_wikipedia_totals.py"
)
PROJECT_TOKENS = ["all-wikipedia-projects", "all-projects"]
OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "data", "fans", "wikipedia_totals_monthly.json")


def end_token():
    """The last FULL calendar month before today, as a YYYYMM0100 token --
    the current month is still in progress and its aggregate would be a
    partial, misleadingly low figure."""
    now = datetime.now(timezone.utc)
    year, month = now.year, now.month - 1
    if month == 0:
        year -= 1
        month = 12
    return f"{year:04d}{month:02d}0100"


def fetch(project_token, end):
    url = (
        "https://wikimedia.org/api/rest_v1/metrics/pageviews/aggregate/"
        f"{project_token}/all-access/user/monthly/{START_TOKEN}/{end}"
    )
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def main():
    end = end_token()
    data = None
    used_token = None
    last_err = None
    for token in PROJECT_TOKENS:
        try:
            data = fetch(token, end)
            used_token = token
            break
        except urllib.error.HTTPError as e:
            last_err = e
            print(f"[fetch_wikipedia_totals] {token} failed: HTTP {e.code}", file=sys.stderr)
            time.sleep(1)
        except Exception as e:  # noqa: BLE001 -- any failure tries the next token, then gives up loudly
            last_err = e
            print(f"[fetch_wikipedia_totals] {token} failed: {e}", file=sys.stderr)
            time.sleep(1)

    if data is None:
        print(f"[fetch_wikipedia_totals] both project tokens failed, last error: {last_err}", file=sys.stderr)
        sys.exit(1)

    out = {}
    for item in data.get("items", []):
        ts = item.get("timestamp", "")  # "YYYYMM0100"
        if len(ts) < 6:
            continue
        year_month = f"{ts[0:4]}-{ts[4:6]}"
        out[year_month] = item.get("views")

    if not out:
        print("[fetch_wikipedia_totals] response had no usable items; not overwriting any existing file", file=sys.stderr)
        sys.exit(1)

    out_abspath = os.path.abspath(OUT_PATH)
    os.makedirs(os.path.dirname(out_abspath), exist_ok=True)
    with open(out_abspath, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, sort_keys=True)
    print(f"[fetch_wikipedia_totals] wrote {out_abspath} ({len(out)} months, project={used_token})")


if __name__ == "__main__":
    main()
