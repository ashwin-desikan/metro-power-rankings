#!/usr/bin/env python3
"""Fill public.pick_locks from the prediction ledgers, so RLS can enforce a lock.

WHY THIS EXISTS. Migration 20260924080603 gave public.picks write policies that
call public.pick_is_open(league, season, event_key), and that function reads
public.pick_locks. With pick_locks empty it returns TRUE for everything, so the
policies allow every write and the lock is decorative. This script is the feed
that makes them real, and it is the prerequisite for the read policy parked in
supabase/pending/20260924_picks_read_policy.sql.

  usage:
    build_pick_locks.py                 report only, touches nothing
    build_pick_locks.py --write         upsert into pick_locks
    build_pick_locks.py --check-coverage  compare against the real picks table
    build_pick_locks.py --self-test     pin the key and lock rules

Env: SUPABASE_WRITE_KEY (or SUPABASE_SERVICE_KEY) required for --write and for
--check-coverage. Reads the ledgers from public/data on disk.

🔴 THE KEY DERIVATION IS A MIRROR, NOT A DESIGN. lib/picksGame.ts owns it, the
browser writes picks with it, and a row here whose key differs by one character
is invisible: pick_is_open finds no row, coalesce falls through to TRUE, and the
event stays open for ever with nothing logged. The two rules, copied verbatim
from eventKey() and lockTime():

    eventKey  = (league != "pl" and e.event_id) ? e.event_id
                                                : f"{e.date}:{e.home_slug}"
    lockTime  = e.kickoff if parseable else f"{e.date}T00:00:00Z"

PL is the exception on purpose. Its ledger carries no event_id, and the comment
in picksGame.ts says changing PL's key would orphan every stored pick, so the
`league != "pl"` guard has to be here too even though it looks redundant today.
--self-test pins both rules, including that guard, so a future edit to either
side fails loudly instead of silently un-locking a league.

MLB is two shapes in one file: `ledger` games keyed like any other, and `series`
entries keyed `series:<round>:<series_id>` by seriesKey(). Both get rows. The
series list is empty until October, which is why an empty MLB file is normal
rather than a fault.

🔴 A MISSING ROW FAILS OPEN, A WRONG ROW FAILS CLOSED. Those are not equally
bad, and this script is built around the asymmetry. A missing row leaves a pick
editable, which is the hole we are closing. A row with a locks_at that is too
early freezes a pick nobody should have lost, which is worse for the player and
invisible to us. So an entry whose date and kickoff are both unusable is SKIPPED
AND REPORTED rather than given a guessed lock time.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / "public" / "data"

# Same set and order as ALL_LEAGUES in lib/picksGame.ts. Keep the two in step:
# a league added to the game and not here is a league whose picks never lock.
LEAGUES = ("pl", "nfl", "cfb", "mlb", "ucl")

SB_URL = (os.environ.get("SUPABASE_URL") or "https://nmprqkmymrdknffwnuur.supabase.co").rstrip("/")
WRITE_KEY = (os.environ.get("SUPABASE_WRITE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY") or "").strip()

# Sent explicitly on every row rather than left to the column default. The
# default fires on INSERT only, so an upsert of an unchanged row would leave
# updated_at frozen at the first insert and "when did the feed last run" would
# be unanswerable from the table itself. Staleness must be observable.
NOW = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")


def _headers():
    """Only a JWT goes in Authorization; an sb_secret_ key is an apikey only.
    Same rule as scripts/ingest/cricket_finalize.py, for the same reason."""
    h = {"apikey": WRITE_KEY, "Content-Type": "application/json"}
    if WRITE_KEY.count(".") == 2:
        h["Authorization"] = "Bearer %s" % WRITE_KEY
    return h


def _req(method, path, params=None, body=None, prefer=None):
    url = "%s/rest/v1/%s" % (SB_URL, path)
    if params:
        url += "?" + urllib.parse.urlencode(params)
    h = _headers()
    if prefer:
        h["Prefer"] = prefer
    req = urllib.request.Request(
        url, method=method, headers=h,
        data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as ex:
        detail = ex.read().decode("utf-8", "replace")[:400]
        raise SystemExit("HTTP %s on %s %s: %s" % (ex.code, method, path, detail))


# --- the mirrored rules ------------------------------------------------------

def event_key(league, e):
    """Mirror of eventKey() in lib/picksGame.ts."""
    ev = e.get("event_id")
    if league != "pl" and ev:
        return str(ev)
    return "%s:%s" % (e.get("date"), e.get("home_slug"))


def _parse_iso(s):
    if not isinstance(s, str) or not s.strip():
        return None
    try:
        return datetime.fromisoformat(s.strip().replace("Z", "+00:00"))
    except ValueError:
        return None


def lock_time(e):
    """Mirror of lockTime(): kickoff when usable, else 00:00 UTC on match day.
    Returns an ISO-Z string, or None when neither is usable."""
    t = _parse_iso(e.get("kickoff"))
    if t is None:
        d = e.get("date")
        t = _parse_iso("%sT00:00:00+00:00" % d) if isinstance(d, str) and d else None
    if t is None:
        return None
    if t.tzinfo is None:
        t = t.replace(tzinfo=timezone.utc)
    return t.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")


def series_key(s):
    """Mirror of seriesKey() in lib/picksGame.ts."""
    return "series:%s:%s" % (s.get("round"), s.get("series_id"))


# --- building ----------------------------------------------------------------

def build_rows(data_dir=DATA, leagues=LEAGUES):
    """Returns (rows, report). rows are upsert-ready dicts; report lists what
    was skipped and why, because a skip is a hole in the guarantee."""
    rows, report = [], []
    seen = set()
    for lg in leagues:
        path = data_dir / ("%s-predictions.json" % lg)
        if not path.exists():
            report.append((lg, "ledger file missing: %s" % path.name, None))
            continue
        try:
            doc = json.loads(path.read_text())
        except (OSError, ValueError) as ex:
            report.append((lg, "unreadable ledger: %s" % type(ex).__name__, None))
            continue
        season = str((doc.get("meta") or {}).get("season") or "").strip()
        if not season:
            report.append((lg, "meta.season missing, cannot key rows", None))
            continue

        for e in (doc.get("ledger") or []):
            key = event_key(lg, e)
            at = lock_time(e)
            if at is None or key.endswith(":None") or key.startswith("None:"):
                report.append((lg, "unusable date and kickoff, skipped", key))
                continue
            ident = (lg, season, key)
            if ident in seen:
                report.append((lg, "duplicate key within the ledger, kept first", key))
                continue
            seen.add(ident)
            rows.append({"league": lg, "season": season, "event_key": key,
                         "locks_at": at, "updated_at": NOW})

        for s in (doc.get("series") or []):
            key = series_key(s)
            at = lock_time(s)
            if at is None or "None" in key:
                report.append((lg, "series with no usable lock time, skipped", key))
                continue
            ident = (lg, season, key)
            if ident in seen:
                report.append((lg, "duplicate series key, kept first", key))
                continue
            seen.add(ident)
            rows.append({"league": lg, "season": season, "event_key": key,
                         "locks_at": at, "updated_at": NOW})
    return rows, report


def upsert(rows, chunk=500):
    """merge-duplicates on the primary key, so a moved kickoff is corrected
    rather than duplicated. updated_at is left to the column default."""
    done = 0
    for i in range(0, len(rows), chunk):
        batch = rows[i:i + chunk]
        _req("POST", "pick_locks", params={"on_conflict": "league,season,event_key"},
             body=batch, prefer="resolution=merge-duplicates,return=minimal")
        done += len(batch)
    return done


def check_coverage():
    """The check that actually matters: every (league, season, event_key) that
    real players have picked should have a lock row. An uncovered key is an
    event whose picks can still be rewritten after the result."""
    picks = _req("GET", "picks", params={"select": "league,season,event_key", "limit": "20000"}) or []
    locks = _req("GET", "pick_locks", params={"select": "league,season,event_key", "limit": "50000"}) or []
    have = {(l["league"], l["season"], l["event_key"]) for l in locks}
    want = {(p["league"], p["season"], p["event_key"]) for p in picks}
    missing = sorted(want - have)
    print("coverage: %d distinct picked event(s), %d lock row(s), %d uncovered"
          % (len(want), len(locks), len(missing)))
    for m in missing[:25]:
        print("  UNCOVERED %s %s %s" % m)
    if len(missing) > 25:
        print("  ... and %d more" % (len(missing) - 25))
    return len(missing)


# --- self-test ---------------------------------------------------------------

def self_test():
    ok = fail = 0

    def check(label, got, want):
        nonlocal ok, fail
        if got == want:
            ok += 1
            print("  ok    %s" % label)
        else:
            fail += 1
            print("  FAIL  %s (got %r, want %r)" % (label, got, want))

    pl = {"date": "2026-08-21", "home_slug": "arsenal", "kickoff": "2026-08-21T19:00:00Z"}
    check("PL keys on date:home_slug", event_key("pl", pl), "2026-08-21:arsenal")
    # The guard that looks redundant and is not: PL must ignore an event_id even
    # if a future builder starts emitting one, or every stored PL pick orphans.
    check("PL ignores an event_id if one appears",
          event_key("pl", dict(pl, event_id="999")), "2026-08-21:arsenal")
    nfl = {"event_id": "401872656", "date": "2026-09-10", "home_slug": "seattle-seahawks",
           "kickoff": "2026-09-10T00:20:00Z"}
    check("NFL keys on the ESPN event id", event_key("nfl", nfl), "401872656")
    check("non-PL without an event_id falls back to date:home_slug",
          event_key("nfl", {"date": "2026-09-10", "home_slug": "x"}), "2026-09-10:x")

    check("lock is the kickoff when present", lock_time(nfl), "2026-09-10T00:20:00+00:00")
    check("lock falls back to 00:00 UTC on match day",
          lock_time({"date": "2026-09-10"}), "2026-09-10T00:00:00+00:00")
    check("an unparseable kickoff still falls back to the date",
          lock_time({"date": "2026-09-10", "kickoff": "not-a-time"}), "2026-09-10T00:00:00+00:00")
    check("no date and no kickoff yields None", lock_time({}), None)
    check("a non-UTC kickoff is normalised to UTC",
          lock_time({"kickoff": "2026-09-10T02:20:00+02:00"}), "2026-09-10T00:20:00+00:00")
    check("series key is namespaced",
          series_key({"round": "ALDS", "series_id": "2026-ALDS-nyy-bos"}),
          "series:ALDS:2026-ALDS-nyy-bos")

    # build_rows against a synthetic tree, so the skip and dedupe paths are real
    # rather than argued. tempfile keeps it out of public/data.
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        d = Path(td)
        (d / "pl-predictions.json").write_text(json.dumps({
            "meta": {"season": "2026-27"},
            "ledger": [pl, pl, {"home_slug": "nodate"}],
        }))
        (d / "mlb-predictions.json").write_text(json.dumps({
            "meta": {"season": 2026},
            "ledger": [],
            "series": [{"round": "WS", "series_id": "s1", "kickoff": "2026-10-24T00:08:00Z"}],
        }))
        (d / "cfb-predictions.json").write_text(json.dumps({"meta": {}, "ledger": [nfl]}))
        rows, report = build_rows(d, ("pl", "mlb", "cfb", "nfl"))
        check("one row per unique event", len(rows), 2)
        check("the duplicate was dropped",
              sum(1 for r in rows if r["event_key"] == "2026-08-21:arsenal"), 1)
        check("the series row is present",
              any(r["event_key"] == "series:WS:s1" for r in rows), True)
        check("season is stringified", {r["season"] for r in rows}, {"2026-27", "2026"})
        check("every row carries updated_at", all(r.get("updated_at") for r in rows), True)
        check("row shape is exactly the four columns pick_locks takes",
              {k for r in rows for k in r},
              {"league", "season", "event_key", "locks_at", "updated_at"})
        reasons = " | ".join(r[1] for r in report)
        check("the undateable entry was reported", "unusable date and kickoff" in reasons, True)
        check("the duplicate was reported", "duplicate key" in reasons, True)
        check("a ledger with no meta.season was refused, not guessed",
              "meta.season missing" in reasons, True)
        check("a missing ledger file was reported", "ledger file missing" in reasons, True)

    print("build_pick_locks self-test: %d passed, %d failed" % (ok, fail))
    return 1 if fail else 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="upsert into pick_locks")
    ap.add_argument("--check-coverage", action="store_true",
                    help="compare pick_locks against the real picks table")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()

    if args.self_test:
        return self_test()

    if args.check_coverage:
        if not WRITE_KEY:
            sys.exit("SUPABASE_WRITE_KEY not set; coverage needs to read picks.")
        return 1 if check_coverage() else 0

    rows, report = build_rows()
    by_league = {}
    for r in rows:
        by_league[r["league"]] = by_league.get(r["league"], 0) + 1
    print("build_pick_locks: %d row(s) from %d league(s)" % (len(rows), len(by_league)))
    for lg in LEAGUES:
        print("  %-4s %d" % (lg, by_league.get(lg, 0)))
    for lg, why, key in report:
        print("  NOTE %-4s %s%s" % (lg, why, (" [%s]" % key) if key else ""))

    if not args.write:
        print("dry run; pass --write to upsert. Nothing was sent.")
        return 0
    if not WRITE_KEY:
        sys.exit("SUPABASE_WRITE_KEY not set; refusing --write.")
    if not rows:
        print("nothing to write.")
        return 0
    n = upsert(rows)
    print("upserted %d row(s) into pick_locks." % n)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
