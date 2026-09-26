-- EuroLeague live-season ingest (scripts/ingest/euroleague_ingest.py).
--
-- 1. Unique key for the idempotent upsert. The ingest POSTs with
--    ?on_conflict=season,competition,team and Prefer: resolution=merge-duplicates.
--    Checked 2026-09-25 over all 1,047 rows: no duplicate (season, competition, team)
--    and no duplicate (season, team). competition is in the key because the split
--    2000-01 season ran two competitions (SuproLeague, FIBA Euroleague).
--
-- 2. Defaults on the season-outcome flags. The ingest writes standings columns only
--    and leaves playoffs / qf_app / final_four_app / final_app / champion for a
--    season-end finalizer. A new row therefore arrives without them, so they need a
--    default (false) rather than NULL, or the build's bool() reads are the only guard.
--
-- 3. Re-seat the id sequence. The table was bulk-migrated from OtherLeagues.xlsx with
--    explicit ids 1..1047 (id 1 = newest season). If the sequence was never advanced,
--    the first ingest INSERT would collide on the primary key. Guarded: no-op when the
--    column has no owned sequence.

alter table public.euroleague_seasons
  add constraint euroleague_seasons_season_comp_team_key
  unique (season, competition, team);

alter table public.euroleague_seasons
  alter column playoffs       set default false,
  alter column qf_app         set default false,
  alter column final_four_app set default false,
  alter column final_app      set default false,
  alter column champion       set default false;

do $$
declare seq text := pg_get_serial_sequence('public.euroleague_seasons', 'id');
begin
  if seq is not null then
    perform setval(seq, (select coalesce(max(id), 0) from public.euroleague_seasons));
  end if;
end $$;
