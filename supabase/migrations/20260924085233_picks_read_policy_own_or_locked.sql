-- RLS hardening, part 2 of 2. APPLIED 2026-09-24 08:52Z, recorded upstream as
-- version 20260924085233. Part 1 is 20260924080603_rls_hardening_locks_and_writes.sql.
--
-- Fixes FINDING (c1): every pick was world readable, before the game as well as
-- after, which let a later player copy an earlier one without even holding an
-- account. picks_select_all was SELECT, role PUBLIC, using (true).
--
-- 🔴 THIS WAS PARKED OUTSIDE migrations/ FOR A DAY, ON PURPOSE. With pick_locks
-- empty, pick_is_open() returns true for everything, `not pick_is_open(...)` is
-- never true, and this policy collapses to "your own rows only".
-- app/play/picks/PicksClient.tsx builds the global leaderboard by reading the
-- whole picks table with the BROWSER client, so applying it then would have
-- blanked that board silently, with no error anywhere. It became safe only once
-- scripts/predictions/build_pick_locks.py existed and had filled pick_locks
-- (HANDOFF section AL): 217 rows, and zero of the keys real players had picked
-- left uncovered.
--
-- MEASURED AFTER APPLYING, by simulating each role with set_config on
-- request.jwt.claims rather than by reasoning about the predicate:
--
--   acting as                  | visible | live-event | settled
--   anon                       |     107 |          0 |     107
--   the owning user            |     117 |         10 |     107
--   a different signed-in user |     107 |          0 |     107
--
-- The middle row is the guarantee for the player: your own picks stay visible
-- while the event is live. The first and third are the fix: nobody else can see
-- a live pick, signed in or not. The third row is also what the leaderboard
-- needs, since 107 settled picks are still readable by another account.
--
-- ⚠️ The file's own pre-flight check said "verify the leaderboard lists more
-- than one player". That check could NOT be run, because public.picks holds
-- exactly one distinct user_id today, so there has never been a second player
-- to list. The role simulation above is what was checked instead, and it is
-- strictly more informative: it shows what a second player WOULD see. Re-run it
-- once a second account exists.

drop policy if exists picks_select_all on public.picks;
drop policy if exists picks_select_own_or_locked on public.picks;
create policy picks_select_own_or_locked on public.picks
  for select
  using ((select auth.uid()) = user_id or not public.pick_is_open(league, season, event_key));

-- ROLLBACK, if a leaderboard does go blank:
--   drop policy if exists picks_select_own_or_locked on public.picks;
--   create policy picks_select_all on public.picks for select using (true);
