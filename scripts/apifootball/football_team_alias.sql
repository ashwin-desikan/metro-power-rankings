-- scripts/apifootball/football_team_alias.sql
-- Canonical seed for public.football_team_alias (Supabase project nmprqkmymrdknffwnuur).
--
-- api-football sometimes issues a SECOND team_id for a club that is already mapped to a single
-- primary id (a re-registered/renamed/ghost duplicate). refresh.py folds the duplicate onto the
-- primary at ingest (load_aliases -> apply_aliases), so it never collides in football_team nor
-- orphans a standings row. This is the reason the collision guard refuses to link a second id.
--
-- The table is DB-only state; THIS FILE is its version-controlled source of truth. Re-apply it to
-- rebuild the table from scratch after a disaster-recovery / project rebuild:
--     psql "$SUPABASE_DB_URL" -f scripts/apifootball/football_team_alias.sql
-- Idempotent: CREATE IF NOT EXISTS + upsert, safe to run repeatedly. When you add a new duplicate,
-- add the row HERE (not only in the live DB) so it survives a rebuild.

create table if not exists public.football_team_alias (
  dup_team_id     integer primary key,
  primary_team_id integer not null,
  canonical_name  text,
  note            text,
  updated_at      timestamptz not null default now()
);

insert into public.football_team_alias (dup_team_id, primary_team_id, canonical_name, note) values
  (860,   24612, 'Extremadura UD',    'api id 860 (old Extremadura UD, dissolved 2022) duplicates primary 24612'),
  (1648,  1657,  'TuS RW Koblenz',    'duplicate api id for TuS RW Koblenz'),
  (1833,  16992, 'North Ferriby Utd', 'duplicate api id for North Ferriby United (defunct 2019)'),
  (4504,  4486,  'Hapoel Jerusalem',  'duplicate api id for Hapoel Jerusalem'),
  (5252,  9581,  'CD Calahorra',      'duplicate api id for CD Calahorra'),
  (5304,  5303,  'AC Libertas',       'duplicate api id for AC Libertas (San Marino)'),
  (7492,  4638,  'Unirea Ungheni',    'duplicate api id for FC Ungheni / Unirea Ungheni'),
  (7524,  5268,  'Melilla CD',        'duplicate api id for Melilla CD'),
  (22722, 132,   'Chapecoense',       'ghost Chapecoense B duplicate remapped onto real Chapecoense 132; supersedes the old SKIP_TEAMS={22722} hack (added by the mac mini 2026-07-28)')
on conflict (dup_team_id) do update set
  primary_team_id = excluded.primary_team_id,
  canonical_name  = excluded.canonical_name,
  note            = excluded.note,
  updated_at      = now();
