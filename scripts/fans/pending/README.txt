PENDING, NOT APPLIED. Prepared 2026-09-24 for Ashwin's review/approval.

valuations_pending.csv holds the 54 of 77 rows from
scripts/fans/valuations_extended.csv that fit the site's current sport model
(league already normalised to the site's convention -- e.g. "Premier League"
-> "England" for men's football). To apply, after review:

  python scripts/valuations/upsert_team_valuations.py scripts/fans/pending/valuations_pending.csv            # dry run
  python scripts/valuations/upsert_team_valuations.py scripts/fans/pending/valuations_pending.csv --write

This UPSERTS by (team, league, year) -- it never deletes or truncates
public.team_valuations. Before the --write, supabase/migrations/
20260924171147_team_valuations_provenance_columns.sql needs to be applied
(adds the method/confidence/source_url columns the CSV carries); without it
the upsert script's writes to those three columns will fail.

23 rows are EXCLUDED (see the excluded list below), not in the CSV:
- 11 IPL rows: the site has no Cricket sport type or team-page hub yet.
- 12 college athletic department rows (Ohio State, Texas, Alabama, etc.):
  these are public/nonprofit university departments, not privately owned
  franchises, and the owner data model (scripts/build-team-owners-data.py)
  hard-requires an owner row for every team on the board. Needs a model
  decision from Ashwin before these can go live.

After upsert_team_valuations.py --write, run
python scripts/build-valuations-data.py to regenerate
public/data/valuations/valuations.json, and scripts/build-team-owners-data.py
to confirm every newly-live team still has an owner row (scripts/data/
team-owners-seed.json already carries owner rows for all 54 included rows,
added 2026-09-24; see HANDOFF.md).

Excluded rows:
  Royal Challengers Bengaluru | IPL | 269M (2025)
  Mumbai Indians | IPL | 242M (2025)
  Chennai Super Kings | IPL | 235M (2025)
  Kolkata Knight Riders | IPL | 227M (2025)
  Sunrisers Hyderabad | IPL | 154M (2025)
  Punjab Kings | IPL | 141M (2025)
  Ohio State | College football / College basketball (athletic dept.) | 1318M (2024)
  Texas | College football / College basketball (athletic dept.) | 1281M (2024)
  Texas A&M | College football / College basketball (athletic dept.) | 1264M (2024)
  Michigan | College football / College basketball (athletic dept.) | 1062M (2024)
  Alabama | College football / College basketball (athletic dept.) | 978M (2024)
  Notre Dame | College football / College basketball (athletic dept.) | 969M (2024)
  Georgia | College football / College basketball (athletic dept.) | 950M (2024)
  Nebraska | College football / College basketball (athletic dept.) | 943M (2024)
  Tennessee | College football / College basketball (athletic dept.) | 940M (2024)
  Oklahoma | College football / College basketball (athletic dept.) | 928M (2024)
  Penn State | College football / College basketball (athletic dept.) | 924M (2024)
  USC | College football / College basketball (athletic dept.) | 923M (2024)
  LSU | College football / College basketball (athletic dept.) | 916M (2024)
  Delhi Capitals | IPL | 152M (2025)
  Rajasthan Royals | IPL | 146M (2025)
  Gujarat Titans | IPL | 142M (2025)
  Lucknow Super Giants | IPL | 122M (2025)
