#!/usr/bin/env python3
"""Append new golf/tennis major champions to the public.champions ledger.

Sits after scripts/ingest/majors_ingest.py + scripts/build-majors-data.py in the
daily majors-ingest workflow: once a major's champion is live in golf_majors /
tennis_majors, this appends it to public.champions too, so /sports/champions
(and the Time Machine) pick it up on the same run -- no human step, matching
the AFL/NRL pattern in scripts/ingest/footy_finalize.py stage 3 (champion_row()
idiom: template every competition-shaped field from the previous champion row
of the same comp_slug, set the new champion, flip is_current).

Scope: the 8 tennis Grand Slams (men's + women's) and the 4 men's golf majors.
Women's golf majors are NOT in the champions table (by design) and are left out.

Idempotent: a champions row already at the majors table's latest year is a
no-op ("up to date"). Nothing is ever deleted.

Reads: golf_majors / tennis_majors need only the anon key. public.champions
has RLS that blocks anon SELECT, so reading it (even to decide "up to date")
needs the SAME elevated key as writing -- SUPABASE_WRITE_KEY, or on this box
.env.local's SUPABASE_SERVICE_KEY (same lookup as scripts/apifootball/refresh.py's
supa_key()). Without that key the champions side of the ledger cannot be read,
so every competition is reported unknown rather than guessed.

    python scripts/champions/majors_to_champions.py --self-test
    python scripts/champions/majors_to_champions.py               # dry run
    SUPABASE_WRITE_KEY=... python scripts/champions/majors_to_champions.py --write
"""
import argparse
import datetime
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))

SB_URL = (os.environ.get("SUPABASE_URL") or "https://nmprqkmymrdknffwnuur.supabase.co").rstrip("/")
ANON_KEY = (os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
            or "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tcHJxa215bXJka25mZndudXVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyMDkzNDMsImV4cCI6MjA5ODc4NTM0M30.4RXU3mQ-Yl81ZqC2_a10aizKGu_87B4vt8OK5Pi_-sM")


def find_write_key():
    """SUPABASE_WRITE_KEY, else SUPABASE_SERVICE_KEY, else .env.local's
    SUPABASE_SERVICE_KEY -- same order as scripts/apifootball/refresh.py's
    supa_key(), except this never sys.exit()s: no key just means the
    champions side of the ledger cannot be read or written."""
    for env in ("SUPABASE_WRITE_KEY", "SUPABASE_SERVICE_KEY"):
        v = os.environ.get(env)
        if v and v.strip():
            return v.strip()
    envf = os.path.join(ROOT, ".env.local")
    if os.path.exists(envf):
        with open(envf, encoding="utf-8") as f:
            for line in f:
                if line.startswith("SUPABASE_SERVICE_KEY="):
                    v = line.split("=", 1)[1].strip()
                    if v:
                        return v
    return ""


WRITE_KEY = find_write_key()
# Elevated key can read everything (including champions, which blocks anon
# SELECT); fall back to anon only for the majors tables when no elevated key
# is available at all.
CHAMPIONS_KEY = WRITE_KEY
MAJORS_KEY = WRITE_KEY or ANON_KEY

# comp_slug -> (majors table, tournament string as stored, gender filter).
# Women's golf majors are deliberately absent (Ashwin, 2026-09-11): the
# champions table does not carry them.
MAPPINGS = [
    ("australian-open-mens",   "tennis_majors", "Australian Open", "M"),
    ("australian-open-womens", "tennis_majors", "Australian Open", "W"),
    ("french-open-mens",       "tennis_majors", "French Open",     "M"),
    ("french-open-womens",     "tennis_majors", "French Open",     "W"),
    ("wimbledon-mens",         "tennis_majors", "Wimbledon",       "M"),
    ("wimbledon-womens",       "tennis_majors", "Wimbledon",       "W"),
    ("us-open-mens",           "tennis_majors", "US Open",         "M"),
    ("us-open-womens",         "tennis_majors", "US Open",         "W"),
    ("masters-tournament",     "golf_majors",   "Masters Tournament",   "M"),
    ("pga-championship",       "golf_majors",   "PGA Championship",     "M"),
    ("us-open-championship",   "golf_majors",   "U.S. Open",            "M"),
    ("the-open-championship",  "golf_majors",   "The Open Championship", "M"),
]

# Ordinal words for a repeat champion's team_name suffix, e.g. "(Third reign)".
# reign_number 1 gets no suffix. Falls back to a numeral ordinal ("21st") past
# the mapped range -- majors do not go that deep, but it should never crash.
ORDINAL_WORDS = {
    2: "Second", 3: "Third", 4: "Fourth", 5: "Fifth", 6: "Sixth", 7: "Seventh",
    8: "Eighth", 9: "Ninth", 10: "Tenth", 11: "Eleventh", 12: "Twelfth",
    13: "Thirteenth", 14: "Fourteenth", 15: "Fifteenth",
}


def _numeral_ordinal(n):
    if 10 <= n % 100 <= 20:
        suf = "th"
    else:
        suf = {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suf}"


def ordinal_word(n):
    return ORDINAL_WORDS.get(n) or _numeral_ordinal(n)


def reign_label(champion, prior_count):
    """champion, count of EXISTING champion rows for this comp_slug with the
    same canonical_name -> (team_name, reign_number). reign_number 1 is a
    first title and carries no suffix."""
    reign_number = prior_count + 1
    if reign_number <= 1:
        return champion, reign_number
    return f"{champion} ({ordinal_word(reign_number)} reign)", reign_number


def plus_364(iso):
    """One year on, same weekday -- the convention the majors rows in the
    ledger already use (2026-02-01 -> 2027-01-31, not 2027-02-01). Plain
    +364 days, exact and leap-safe since it is a fixed offset, not a
    calendar-year step."""
    m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", str(iso or "").strip())
    if not m:
        return None
    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    try:
        base = datetime.date(y, mo, d)
    except ValueError:
        return None
    return (base + datetime.timedelta(days=364)).isoformat()


def match_date_for(majors_row, template):
    """golf_majors carries event_date; tennis_majors does not. For tennis,
    fall back to the template champion row's own next_awarded_date -- which
    the ledger already hand-curates to the real date of the upcoming
    edition -- when its year lines up with the majors row being appended.
    Returns (date, estimated) or (None, False) when nothing usable exists."""
    ev = majors_row.get("event_date")
    if ev:
        return ev, False
    nxt = (template or {}).get("next_awarded_date")
    if nxt and str(nxt)[:4] == str(majors_row.get("year")):
        return nxt, True
    return None, False


def build_row(template, comp_slug, champion, year, date, team_name):
    """The public.champions row for the new champion. Everything
    competition-shaped is copied from template (the previous champion row of
    this comp_slug); everything champion-shaped is derived here. Mirrors
    scripts/ingest/footy_finalize.py's champion_row()."""
    return {
        "sport": template["sport"], "competition": template["competition"],
        "comp_slug": comp_slug, "era_name": template["era_name"],
        "country": template.get("country"), "scope": template.get("scope"),
        "scope_type": template.get("scope_type"), "tier": template.get("tier"),
        "tier_guide": template.get("tier_guide"),
        "is_club": template.get("is_club"), "entity_type": template.get("entity_type"),
        "season_basis": template.get("season_basis"), "stewardship": "auto",
        "season": str(year), "year": year, "season_numeric": False,
        "placement": "champion", "team_name": team_name, "canonical_name": champion,
        "metro": None, "metro_slug": None, "metro_status": "unresolved",
        "match_date": date, "date_awarded": date,
        "next_awarded_date": plus_364(date),
        "is_current": True, "source": "majors-ingest",
        "source_ordinal": template.get("source_ordinal"),
    }


def decide(majors_year, champ_year):
    """Pure decision: does the majors table's latest year beat the champions
    ledger's latest year for this comp_slug?"""
    if majors_year is None:
        return "no_majors_row"
    if champ_year is None:
        return "no_template"
    if majors_year > champ_year:
        return "append"
    return "up_to_date"


# --------------------------------------------------------------- HTTP -----

def _headers(key):
    h = {"apikey": key, "Content-Type": "application/json"}
    if not key.startswith("sb_"):
        h["Authorization"] = f"Bearer {key}"
    return h


def sb_get(table, key, params):
    q = urllib.parse.urlencode(params)
    req = urllib.request.Request(f"{SB_URL}/rest/v1/{table}?{q}", headers=_headers(key))
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def sb_post(table, key, rows):
    req = urllib.request.Request(
        f"{SB_URL}/rest/v1/{table}", method="POST",
        data=json.dumps(rows).encode("utf-8"),
        headers={**_headers(key), "Prefer": "return=minimal"})
    with urllib.request.urlopen(req, timeout=60):
        pass


def sb_patch(table, key, row_id, patch):
    req = urllib.request.Request(
        f"{SB_URL}/rest/v1/{table}?id=eq.{row_id}", method="PATCH",
        data=json.dumps(patch).encode("utf-8"),
        headers={**_headers(key), "Prefer": "return=minimal"})
    with urllib.request.urlopen(req, timeout=60):
        pass


def latest_majors_row(table, tournament, gender):
    params = {"select": "*", "tournament": f"eq.{tournament}", "gender": f"eq.{gender}",
              "order": "year.desc", "limit": 1}
    rows = sb_get(table, MAJORS_KEY, params)
    return rows[0] if rows else None


def latest_champ_row(comp_slug):
    params = {"select": "*", "comp_slug": f"eq.{comp_slug}", "placement": "eq.champion",
              "order": "year.desc", "limit": 1}
    rows = sb_get("champions", CHAMPIONS_KEY, params)
    return rows[0] if rows else None


def prior_reign_count(comp_slug, canonical_name):
    rows = sb_get("champions", CHAMPIONS_KEY, {
        "select": "id", "comp_slug": f"eq.{comp_slug}", "placement": "eq.champion",
        "canonical_name": f"eq.{canonical_name}"})
    return len(rows)


# ------------------------------------------------------------------ main --

def run(write):
    if not CHAMPIONS_KEY:
        print("no SUPABASE_WRITE_KEY / SUPABASE_SERVICE_KEY available -- cannot read "
              "public.champions (RLS blocks anon SELECT on it), so every competition "
              "below is unknown. Set SUPABASE_WRITE_KEY to check for real.")
    appended, skipped, up_to_date = 0, 0, 0
    for comp_slug, table, tournament, gender in MAPPINGS:
        label = f"{comp_slug} ({tournament} {gender})"
        if not CHAMPIONS_KEY:
            print(f"  {label}: unknown (no key to read champions)")
            continue
        try:
            majors_row = latest_majors_row(table, tournament, gender)
        except Exception as e:
            print(f"  {label}: ERROR reading {table}: {e}")
            skipped += 1
            continue
        if not majors_row:
            print(f"  {label}: no rows in {table} yet -- skipping")
            skipped += 1
            continue
        try:
            template = latest_champ_row(comp_slug)
        except Exception as e:
            print(f"  {label}: ERROR reading champions: {e}")
            skipped += 1
            continue
        verdict = decide(majors_row.get("year"), (template or {}).get("year"))
        if verdict == "no_template":
            print(f"  {label}: REFUSED -- no previous champions row to template from")
            skipped += 1
            continue
        if verdict == "up_to_date":
            print(f"  {label}: up to date (ledger {template['year']}, majors table {majors_row['year']})")
            up_to_date += 1
            continue

        champion = (majors_row.get("champion") or "").strip()
        if not champion:
            print(f"  {label}: REFUSED -- {majors_row['year']} row has no champion name")
            skipped += 1
            continue
        date, estimated = match_date_for(majors_row, template)
        if not date:
            print(f"  {label}: REFUSED -- {majors_row['year']} {champion} has no event_date "
                  f"and the template's next_awarded_date does not cover {majors_row['year']}")
            skipped += 1
            continue

        try:
            prior = prior_reign_count(comp_slug, champion)
        except Exception as e:
            print(f"  {label}: ERROR reading reign count: {e}")
            skipped += 1
            continue
        team_name, reign_number = reign_label(champion, prior)
        row = build_row(template, comp_slug, champion, majors_row["year"], date, team_name)

        verb = "would append" if not write else "appending"
        est_note = " (date estimated from next_awarded_date)" if estimated else ""
        print(f"  {label}: {verb} {majors_row['year']} -> {team_name}{est_note}")

        if not write:
            continue
        try:
            sb_post("champions", CHAMPIONS_KEY, [row])
            if template.get("is_current"):
                sb_patch("champions", CHAMPIONS_KEY, template["id"], {"is_current": False})
            appended += 1
            print(f"    appended -> {table} {majors_row['year']} {team_name}")
        except Exception as e:
            print(f"    FAILED to append {label}: {e}")
            skipped += 1

    print(f"\nsummary: {appended} appended, {up_to_date} up to date, {skipped} skipped")
    return appended, skipped


# --------------------------------------------------------------- self-test --

def self_test():
    n = [0]

    def check(name, cond):
        n[0] += 1
        if not cond:
            raise SystemExit(f"self-test FAILED: {name}")

    check("plus_364 Aus Open convention", plus_364("2026-02-01") == "2027-01-31")
    check("plus_364 US Open golf convention", plus_364("2026-06-21") == "2027-06-20")
    check("plus_364 bad input", plus_364(None) is None)
    check("plus_364 bad format", plus_364("not-a-date") is None)

    check("reign_label first title, no suffix", reign_label("Rory McIlroy", 0) == ("Rory McIlroy", 1))
    check("reign_label second title", reign_label("Carlos Alcaraz", 1) == ("Carlos Alcaraz (Second reign)", 2))
    check("reign_label third title", reign_label("Muhammad Ali", 2) == ("Muhammad Ali (Third reign)", 3))
    check("reign_label deep fallback", reign_label("X", 20) == ("X (21st reign)", 21))

    check("decide append", decide(2026, 2025) == "append")
    check("decide up to date (equal)", decide(2025, 2025) == "up_to_date")
    check("decide up to date (behind)", decide(2024, 2025) == "up_to_date")
    check("decide no majors row", decide(None, 2025) == "no_majors_row")
    check("decide no template", decide(2026, None) == "no_template")

    tpl = {"sport": "Tennis", "competition": "US Open Men's", "era_name": "US Open Men's",
           "country": None, "scope": "World", "scope_type": "International", "tier": 2,
           "tier_guide": 3, "is_club": True, "entity_type": "individual",
           "season_basis": "calendar", "source_ordinal": 2474, "id": 145171, "is_current": True,
           "year": 2025, "next_awarded_date": "2026-09-13"}
    row = build_row(tpl, "us-open-mens", "Carlos Alcaraz", 2026, "2026-09-13", "Carlos Alcaraz")
    check("build_row lineage", row["source"] == "majors-ingest" and row["stewardship"] == "auto")
    check("build_row identity", row["team_name"] == "Carlos Alcaraz" and row["canonical_name"] == "Carlos Alcaraz"
          and row["season"] == "2026" and row["year"] == 2026 and row["season_numeric"] is False)
    check("build_row competition fields copied", row["era_name"] == "US Open Men's" and row["entity_type"] == "individual"
          and row["is_club"] is True and row["tier"] == 2)
    check("build_row current + metro", row["is_current"] is True and row["metro"] is None
          and row["metro_slug"] is None and row["metro_status"] == "unresolved")
    check("build_row dates", row["match_date"] == "2026-09-13" and row["date_awarded"] == "2026-09-13"
          and row["next_awarded_date"] == "2027-09-12")

    # tennis has no event_date column: falls back to template.next_awarded_date
    # only when its year matches the majors row being appended.
    mrow = {"year": 2026, "champion": "Carlos Alcaraz"}
    date, est = match_date_for(mrow, tpl)
    check("match_date_for tennis fallback", date == "2026-09-13" and est is True)
    check("match_date_for tennis fallback year mismatch refuses",
          match_date_for({"year": 2027, "champion": "X"}, tpl) == (None, False))
    grow = {"year": 2026, "champion": "Rory McIlroy", "event_date": "2026-04-12"}
    check("match_date_for golf uses event_date", match_date_for(grow, tpl) == ("2026-04-12", False))

    check("MAPPINGS has 12 entries, 8 tennis + 4 golf men's", len(MAPPINGS) == 12)
    check("no women's golf majors mapped", not any(t == "golf_majors" and g == "W" for _, t, _, g in MAPPINGS))

    print(f"majors_to_champions self-test OK -- {n[0]} checks")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="apply (default: dry run)")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()
    if args.self_test:
        self_test()
        return
    write = args.write and bool(WRITE_KEY)
    if args.write and not WRITE_KEY:
        print("--write requested but no SUPABASE_WRITE_KEY / SUPABASE_SERVICE_KEY found; running DRY.")
    print(f"majors_to_champions -- {datetime.date.today().isoformat()} -- {'WRITE' if write else 'DRY RUN'}")
    run(write)


if __name__ == "__main__":
    main()
