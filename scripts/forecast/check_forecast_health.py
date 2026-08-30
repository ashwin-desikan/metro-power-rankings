# -*- coding: utf-8 -*-
"""Health gate for public/data/forecast.json. Stdlib only.

WHY THIS EXISTS
    On 2026-08-30 the Brazil block had been publishing an EMPTY runoff list for
    an unknown number of runs, five weeks before Brazil votes, because a
    Wikipedia heading moved and fetch_br()'s level-pinned slice returned "".
    Nothing failed. The refresh committed, the page rendered, the block was
    simply blank. A pipeline that cannot tell "no data" from "no news" will do
    that again.

    So every block that publishes declares what it must contain, and this runs
    between build and commit.

EXIT CODES
    0  publishable (warnings may still be printed, and they are the point)
    1  do not publish: the file is unusable or every block is empty
    2  --strict was passed and there was at least one warning

Usage:
    python scripts/forecast/check_forecast_health.py [--strict] [--self-test]
"""
import json
import os
import sys
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hub_dates

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
FORECAST = os.path.join(ROOT, "public", "data", "forecast.json")

# How stale the newest poll in a block may be before it stops being a forecast
# and starts being a museum piece. Deliberately generous: Israeli and Brazilian
# pollsters go quiet for a fortnight at a time, and a false alarm every week
# trains everyone to ignore the real one.
STALE_POLL_DAYS = 28
BUILT_DRIFT_DAYS = 1

# block -> (label, [paths that must be non-empty], [paths that should be],
#           path to the newest poll date or None)
# A path is a dotted walk; a list or dict is "empty" when it has no members,
# a number is never empty, None always is.
SPEC = {
    "uk": ("United Kingdom",
           ["average", "sim.seats"], ["trend", "pollsters"], "latestPollDate"),
    "us": ("United States",
           ["demSeats", "aggregators"], ["senate", "governors"], None),
    "nz": ("New Zealand",
           ["average", "seats"], ["pollsters"], "latestPollDate"),
    "il": ("Israel",
           ["parties"], ["gov.avg"], "latestPollDate"),
    "br": ("Brazil",
           ["firstRound.shares"], ["runoffs"], "firstRound.latest"),
    "fr": ("France",
           ["firstRound.shares"], ["runoffs"], "firstRound.latest"),
}


def walk(obj, path):
    cur = obj
    for part in path.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return None
        cur = cur[part]
    return cur


def is_empty(v):
    if v is None:
        return True
    if isinstance(v, (list, dict, str)):
        return len(v) == 0
    return False


def check(doc, today=None, hub_lookup=None):
    """Return (errors, warnings). Pure: no file or network access."""
    today = today or date.today()
    hub_lookup = hub_lookup or hub_dates.hub_date
    errors, warnings = [], []

    built = doc.get("built")
    if not built:
        errors.append("no `built` date in forecast.json")
    else:
        try:
            b = datetime.strptime(built, "%Y-%m-%d").date()
        except ValueError:
            errors.append("unparseable `built` date %r" % built)
        else:
            drift = (today - b).days
            if drift > BUILT_DRIFT_DAYS:
                warnings.append("built %s is %d days old" % (built, drift))
            elif drift < 0:
                errors.append("built %s is in the future" % built)

    live = 0
    for code, (label, required, expected, poll_path) in SPEC.items():
        block = doc.get(code)
        if block is None:
            # A retired country is a legitimate state: after its election the
            # fetcher and the build entry come out and the block disappears.
            continue
        live += 1

        for path in required:
            if is_empty(walk(block, path)):
                errors.append("%s: required `%s` is empty" % (label, path))
        for path in expected:
            if is_empty(walk(block, path)):
                warnings.append(
                    "%s: `%s` is empty -- data was expected here, so treat this "
                    "as a scrape failure until proven otherwise" % (label, path))

        # The date the block models, against the hub table.
        iso = block.get("electionDate") or block.get("election") or block.get("electionAssumed")
        conf = block.get("electionConfidence")
        if iso:
            try:
                d = datetime.strptime(iso, "%Y-%m-%d").date()
            except ValueError:
                errors.append("%s: unparseable election date %r" % (label, iso))
            else:
                if d < today:
                    warnings.append(
                        "%s: models %s, which has passed -- resolve the race into "
                        "the ledger and retire the block" % (label, iso))
                hub_d, hub_conf = hub_lookup(code)
                if hub_conf == "confirmed" and hub_d and hub_d != d:
                    errors.append(
                        "%s: hub has a CONFIRMED date of %s but the forecast models "
                        "%s" % (label, hub_d.isoformat(), iso))
                if hub_conf == "confirmed" and conf != "confirmed":
                    warnings.append(
                        "%s: hub date is confirmed but the block still says %r"
                        % (label, conf))
        else:
            warnings.append("%s: no election date on the block" % label)

        if poll_path:
            latest = walk(block, poll_path)
            if isinstance(latest, str):
                try:
                    ld = datetime.strptime(latest, "%Y-%m-%d").date()
                except ValueError:
                    warnings.append("%s: unparseable poll date %r" % (label, latest))
                else:
                    age = (today - ld).days
                    if age > STALE_POLL_DAYS:
                        warnings.append(
                            "%s: newest poll is %d days old (%s)" % (label, age, latest))

    if live == 0:
        errors.append("no country blocks at all -- the build produced nothing")

    return errors, warnings


def _report(errors, warnings, strict):
    for w in warnings:
        print("WARN  " + w)
    for e in errors:
        print("ERROR " + e)
    if errors:
        print("forecast health: FAIL (%d errors, %d warnings)" % (len(errors), len(warnings)))
        return 1
    if warnings and strict:
        print("forecast health: warnings present and --strict was passed")
        return 2
    print("forecast health: OK (%d warnings)" % len(warnings))
    return 0


# ---------------------------------------------------------------- self-test --

def _fixture():
    return {
        "built": "2026-08-30",
        "br": {"electionDate": "2026-10-04", "electionConfidence": "confirmed",
               "firstRound": {"shares": {"Lula": 40.0, "Bolsonaro": 34.0},
                              "latest": "2026-08-26"},
               "runoffs": [{"a": "Lula", "b": "Bolsonaro"}]},
        "nz": {"electionDate": "2026-11-07", "electionConfidence": "confirmed",
               "average": {"nat": 30.0}, "seats": {"nat": {"median": 39}},
               "pollsters": 5, "latestPollDate": "2026-08-21"},
    }


def _self_test():
    fails = []
    TODAY = date(2026, 8, 30)
    hubs = {"br": (date(2026, 10, 4), "confirmed"),
            "nz": (date(2026, 11, 7), "confirmed")}
    look = lambda c: hubs.get(c, (None, "expected"))

    def run(doc):
        return check(doc, today=TODAY, hub_lookup=look)

    def check_eq(label, got, want):
        if got != want:
            fails.append("%s: got %r, want %r" % (label, got, want))

    # A healthy file is silent.
    e, w = run(_fixture())
    check_eq("clean errors", e, [])
    check_eq("clean warnings", w, [])

    # THE BRAZIL CASE: first round present, runoffs empty. Must warn, and must
    # NOT fail, because the first round is still publishable.
    d = _fixture()
    d["br"]["runoffs"] = []
    e, w = run(d)
    check_eq("empty runoffs does not error", e, [])
    check_eq("empty runoffs warns", len(w), 1)
    if w and "runoffs" not in w[0]:
        fails.append("empty-runoff warning does not name the field: %r" % w[0])

    # A required field going empty is an error, not a warning.
    d = _fixture()
    d["br"]["firstRound"]["shares"] = {}
    e, w = run(d)
    check_eq("empty first round errors", len(e), 1)

    # A confirmed hub date the build ignored is the 2026-08-30 New Zealand bug.
    d = _fixture()
    d["nz"]["electionDate"] = "2026-10-17"
    e, w = run(d)
    check_eq("date divergence errors", len(e), 1)
    if e and "CONFIRMED" not in e[0]:
        fails.append("divergence error does not say confirmed: %r" % e[0])

    # A date that has passed warns rather than errors: the block is still valid
    # output, it just needs resolving into the ledger.
    d = _fixture()
    d["br"]["electionDate"] = "2026-08-01"
    e, w = run(d)
    if not any("has passed" in x for x in w):
        fails.append("a passed date did not warn: %r" % w)

    # Stale polling warns.
    d = _fixture()
    d["nz"]["latestPollDate"] = "2026-06-01"
    e, w = run(d)
    if not any("days old" in x for x in w):
        fails.append("stale polls did not warn: %r" % w)

    # An empty file must fail outright.
    e, w = run({"built": "2026-08-30"})
    check_eq("no blocks errors", len(e), 1)

    # A retired country (block absent) is fine.
    d = _fixture()
    del d["br"]
    e, w = run(d)
    check_eq("retired block is fine", e, [])

    if fails:
        print("SELF-TEST FAILED")
        for f in fails:
            print("  -", f)
        return 1
    print("check_forecast_health self-test OK (8 cases)")
    return 0


def main():
    if "--self-test" in sys.argv:
        return _self_test()
    try:
        with open(FORECAST, encoding="utf-8") as fh:
            doc = json.load(fh)
    except (OSError, ValueError) as exc:
        print("ERROR cannot read %s: %s" % (FORECAST, exc))
        return 1
    errors, warnings = check(doc)
    return _report(errors, warnings, "--strict" in sys.argv)


if __name__ == "__main__":
    sys.exit(main())
