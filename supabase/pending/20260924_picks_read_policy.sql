-- RLS hardening, part 2 of 2. NOT APPLIED, AND DELIBERATELY NOT IN migrations/.
--
-- Part 1 is supabase/migrations/20260924080603_rls_hardening_locks_and_writes.sql,
-- applied 2026-09-24 08:06Z. This file is the remaining half: the fix for
-- finding c1, that every pick is world readable before the game as well as
-- after, which lets a later player copy an earlier one without even holding an
-- account.
--
-- 🔴 WHY IT IS NOT A MIGRATION FILE. Anything under supabase/migrations/ gets
-- applied by `supabase db push`. This statement is safe to run only AFTER the
-- prerequisites below, so giving it a migration-shaped name would leave a
-- loaded gun in the tree for whoever next runs a push.
--
-- ⚠️ WHAT IT BREAKS IF APPLIED TODAY. With pick_locks empty, pick_is_open is
-- true for every event, so `not pick_is_open(...)` is never true and the policy
-- collapses to "your own rows only". app/play/picks/PicksClient.tsx builds the
-- global leaderboard by reading the entire picks table with the BROWSER client
-- (see the `sb.from("picks").select(...).limit(20000)` call and its comment,
-- "Leaderboard data (signed-in only; RLS makes picks world-readable)"). Applying
-- this without doing one of the things below turns that leaderboard into a board
-- with one player on it, silently, with no error anywhere.
--
-- PREREQUISITES, either one is sufficient:
--
--   A. Populate pick_locks and keep it current. A job writes one row per event
--      with its real lock time, service key only. Then the policy does what it
--      says: your own picks always, everyone else's once the event has locked,
--      and the leaderboard keeps working for settled events. This is the end
--      state the design wants. The feed does not exist yet and is the real
--      prerequisite; it is the Notion backlog row "pick_locks feed".
--
--   B. Move the leaderboard read server side. A route handler using the service
--      key returns only what a leaderboard needs, and the browser stops reading
--      the picks table directly. This fixes c1 without waiting for the feed,
--      and is the smaller change, but it is app work rather than SQL.
--
-- Whichever is chosen, verify afterwards that the leaderboard still lists more
-- than one player, as anon and as a signed-in user. That check is the whole
-- point, and nothing automated covers it.

begin;

-- Your own picks always; everyone else's only once the event has locked.
drop policy if exists picks_select_all on public.picks;
drop policy if exists picks_select_own_or_locked on public.picks;
create policy picks_select_own_or_locked on public.picks
  for select
  using ((select auth.uid()) = user_id or not public.pick_is_open(league, season, event_key));

commit;

-- ROLLBACK, if the leaderboard does go blank:
--   drop policy if exists picks_select_own_or_locked on public.picks;
--   create policy picks_select_all on public.picks for select using (true);
