-- PENDING, NOT APPLIED. Run only AFTER valuations_round3_sourced_supabase.csv is upserted.
-- Removes 11 unsourced speculative guess rows that the round-3 load supersedes but cannot
-- overwrite (the new row has a different year, and upsert_team_valuations.py never deletes).
-- lib/valuations.ts shows the HIGHEST value per team on team pages, and /sports/valuations
-- lists every row, so leaving these would keep stale guesses visible.
-- Guarded by method='speculative' so a published/transaction row can never be hit.
begin;
delete from public.team_valuations
where method = 'speculative' and year = 2025 and (team, league) in (
  ('AS Monaco','France'), ('OGC Nice','France'), ('LOSC Lille','France'),
  ('Stade Rennais','France'), ('RC Lens','France'), ('Stade Brestois','France'),
  ('FC Nantes','France'),
  ('SS Lazio','Italy'), ('SSC Napoli','Italy'), ('Atalanta','Italy'),
  ('RB Leipzig','Germany')
);
-- expect: DELETE 11. If not 11, ROLLBACK and investigate.
commit;
