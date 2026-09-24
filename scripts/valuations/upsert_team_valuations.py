#!/usr/bin/env python3
"""Upsert team valuations into Supabase's public.team_valuations.

Added 2026-09-24 (Ashwin's ruling): Supabase is now the ONLY source of truth
for team valuations. OtherLeagues.xlsx is no longer read or written for this
pipeline -- see scripts/valuations/sync_team_valuations.py, which is retired.
This script is the one way valuations data changes going forward.

Reads a CSV with the same columns as scripts/fans/valuations_extended.csv:
  team, league, value_usd_m, year, source, source_url, method, confidence, notes
League is normalised the same way scripts/build-valuations-data.py's readers
expect (competition name -> country, for men's football; everything else
passed through unchanged -- NFL/NBA/MLB/NHL/F1/WNBA/NWSL and any country name
already in that shape).

UPSERTS by (team, league, year) -- never deletes, never truncates. A row that
already exists for that key is updated in place; a new key is inserted. This
is the deliberate opposite of the retired sync script's delete-all-then-
insert.

Refuses (exits 1, writes nothing) if ANY row is missing `source` or `method`:
those are the two fields the /sports/valuations page now shows per row, and a
silently blank one there is worse than a script that stops and says so.

Valid `method` values: "published" (a formal annual valuation exercise),
"transaction" (inferred from a real sale price), or "speculative" (an
unverified estimate -- added 2026-09-24 for scripts/fans/valuations_speculative.csv).
PRECEDENCE: a speculative row never overwrites an existing published or
transaction row for the same (team, league, year) -- it is skipped and
reported, not silently dropped. published/transaction rows always overwrite
each other and any existing speculative row (a real figure supersedes a
guess).

    python scripts/valuations/upsert_team_valuations.py CSV_PATH             # dry run
    python scripts/valuations/upsert_team_valuations.py CSV_PATH --write

Verifies row counts back out of PostgREST after writing, the same discipline
sync_team_valuations.py used: a silent partial write here would ship a board
with stale or missing figures.
"""
import argparse, csv, json, os, sys, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TABLE = "team_valuations"
SB_URL = (os.environ.get("SUPABASE_URL") or "https://nmprqkmymrdknffwnuur.supabase.co").rstrip("/")

# Competition name (as scripts/fans/valuations_extended.csv and similar CSVs
# carry it) -> the country label build-valuations-data.py / lib/valuations.ts
# already expect for men's football rows. Non-football leagues (NFL, NBA,
# WNBA, NWSL, F1, ...) and country labels already in the right shape pass
# through unchanged. Keep this in sync with the equivalent map used when this
# repo's Claude sessions prepare pending CSVs -- see HANDOFF.md if it drifts.
VALID_METHODS = {"published", "transaction", "speculative"}
# Never overwrite a better-evidenced row with a worse one for the same key.
METHOD_RANK = {"speculative": 0, "transaction": 1, "published": 1}

COMP_TO_COUNTRY = {
    "Premier League": "England", "La Liga": "Spain", "Serie A": "Italy",
    "Bundesliga": "Germany", "Ligue 1": "France", "Eredivisie": "Netherlands",
    "Scottish Premiership": "Scotland", "EFL Championship": "England",
    "Liga MX": "Mexico", "Primeira Liga": "Portugal",
}


def normalise_league(league):
    return COMP_TO_COUNTRY.get(league, league)


def service_key():
    k = os.environ.get("SUPABASE_SERVICE_KEY")
    if k:
        return k
    env = os.path.join(ROOT, ".env.local")
    if os.path.exists(env):
        for line in open(env, encoding="utf-8"):
            if line.strip().startswith("SUPABASE_SERVICE_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("FATAL: no SUPABASE_SERVICE_KEY in the environment or .env.local. "
             "Refusing to fall back to the anon key, which cannot write here.")


def call(method, path, key, body=None, extra=None):
    h = {"apikey": key, "Authorization": f"Bearer {key}",
         "Content-Type": "application/json"}
    h.update(extra or {})
    req = urllib.request.Request(f"{SB_URL}{path}", method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers=h)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read().decode() or ""
            return raw, dict(r.headers)
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code} on {method} {path}: {e.read().decode(errors='replace')[:500]}")


def read_csv(path):
    rows = []
    with open(path, encoding="utf-8") as fh:
        for i, r in enumerate(csv.DictReader(fh)):
            where = f"row {i} ({r.get('team', '?')} / {r.get('league', '?')})"
            for req in ("team", "league", "value_usd_m", "year"):
                if not r.get(req):
                    sys.exit(f"FATAL: {where}: missing required column '{req}'")
            if not r.get("source"):
                sys.exit(f"FATAL: {where}: missing 'source' -- refusing to upsert a row with no provenance.")
            if not r.get("method"):
                sys.exit(f"FATAL: {where}: missing 'method' -- refusing to upsert a row with no method.")
            if r["method"].strip() not in VALID_METHODS:
                sys.exit(f"FATAL: {where}: method '{r['method']}' not in {sorted(VALID_METHODS)}")
            rows.append({
                "year": int(r["year"]),
                "team": r["team"].strip(),
                "league": normalise_league(r["league"].strip()),
                "value_m": float(r["value_usd_m"]),
                "source": r["source"].strip(),
                "method": r["method"].strip(),
                "confidence": (r.get("confidence") or "").strip() or None,
                "source_url": (r.get("source_url") or "").strip() or None,
            })
    dupes = {}
    for r in rows:
        k = (r["team"], r["league"], r["year"])
        dupes[k] = dupes.get(k, 0) + 1
    bad = [k for k, n in dupes.items() if n > 1]
    if bad:
        sys.exit(f"FATAL: duplicate (team, league, year) rows in the CSV, upsert key would be ambiguous: {bad}")
    return rows


def existing_index(key):
    """Map (team, league, year) -> {id, method}, for rows already in the table.
    method may be missing (older rows, before the provenance migration) --
    treated as rank 1 (same as published/transaction), never lower than
    speculative, so a legacy row is never quietly clobbered by a guess."""
    out, step, off = {}, 1000, 0
    while True:
        q = f"select=id,team,league,year,method&order=id&limit={step}&offset={off}"
        try:
            raw, _ = call("GET", f"/rest/v1/{TABLE}?{q}", key)
        except SystemExit:
            # Provenance columns (incl. method) not applied yet -- fall back
            # to the base select so this script still works pre-migration.
            q = f"select=id,team,league,year&order=id&limit={step}&offset={off}"
            raw, _ = call("GET", f"/rest/v1/{TABLE}?{q}", key)
        batch = json.loads(raw)
        for r in batch:
            out[(r["team"], r["league"], r["year"])] = {"id": r["id"], "method": r.get("method")}
        if len(batch) < step:
            return out
        off += step


def count(key):
    _, h = call("GET", f"/rest/v1/{TABLE}?select=id&limit=1", key,
                extra={"Prefer": "count=exact", "Range-Unit": "items", "Range": "0-0"})
    cr = h.get("Content-Range") or h.get("content-range") or ""
    return int(cr.split("/")[-1]) if "/" in cr else -1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv_path")
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()

    rows = read_csv(a.csv_path)
    print(f"CSV: {len(rows)} rows read from {a.csv_path}")

    key = service_key()
    before = count(key)
    existing = existing_index(key)

    to_insert = [r for r in rows if (r["team"], r["league"], r["year"]) not in existing]
    candidates_update = [r for r in rows if (r["team"], r["league"], r["year"]) in existing]
    to_update, skipped_precedence = [], []
    for r in candidates_update:
        cur = existing[(r["team"], r["league"], r["year"])]
        cur_rank = METHOD_RANK.get(cur["method"], 1)
        new_rank = METHOD_RANK[r["method"]]
        if new_rank < cur_rank:
            skipped_precedence.append((r, cur["method"]))
        else:
            to_update.append(r)

    print(f"would UPDATE {len(to_update)} existing row(s), INSERT {len(to_insert)} new row(s), "
          f"SKIP {len(skipped_precedence)} row(s) (precedence), DELETE 0 (this script never deletes)")
    for r in to_update:
        print(f"  update: {r['team']} ({r['league']}, {r['year']}) -> {r['value_m']}M [{r['method']}/{r['confidence']}]")
    for r in to_insert:
        print(f"  insert: {r['team']} ({r['league']}, {r['year']}) -> {r['value_m']}M [{r['method']}/{r['confidence']}]")
    for r, cur_method in skipped_precedence:
        print(f"  skip (precedence): {r['team']} ({r['league']}, {r['year']}) -- CSV has "
              f"'{r['method']}', existing row is '{cur_method}'; not overwriting a better-evidenced row with a worse one.")

    if not a.write:
        print("\nDRY RUN. Nothing written. Re-run with --write once this reads right.")
        return 0

    for r in to_update:
        rid = existing[(r["team"], r["league"], r["year"])]["id"]
        call("PATCH", f"/rest/v1/{TABLE}?id=eq.{rid}", key, {
            "value_m": r["value_m"], "source": r["source"], "method": r["method"],
            "confidence": r["confidence"], "source_url": r["source_url"],
        })
    if to_insert:
        for i in range(0, len(to_insert), 500):
            call("POST", f"/rest/v1/{TABLE}", key, to_insert[i:i + 500],
                 extra={"Prefer": "return=minimal"})

    after = count(key)
    expected = before + len(to_insert)
    if after != expected:
        sys.exit(f"FATAL: table now holds {after} rows, expected {expected} (was {before}, "
                 f"+{len(to_insert)} inserted, {len(to_update)} updated in place). Investigate before trusting the board.")
    print(f"OK: {TABLE} now holds {after} rows (was {before}); {len(to_update)} updated, {len(to_insert)} inserted, 0 deleted.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
