-- RLS hardening, part 1 of 2. APPLIED 2026-09-24 08:06Z, recorded upstream as
-- version 20260924080603. Renamed from 20260923143213_rls_hardening.sql, which
-- was the unapplied draft and also carried part 2; see the note at the bottom.
--
-- Audited against the live database first, read only, and TWO OF THE FOUR
-- THINGS THIS FILE WAS ASKED TO DO TURN OUT TO BE ALREADY DONE. They are
-- recorded here as verified no-ops rather than written as SQL, because a
-- DROP POLICY for a policy that does not exist either errors or, worse,
-- succeeds silently and reads in review as though it had removed something.
--
-- 1. ANON WRITE POLICIES: NONE EXIST. Every policy in `public` whose cmd is
--    INSERT, UPDATE or DELETE belongs to follows, pick_profiles or picks, and
--    each carries `auth.uid() = user_id`. Those are declared for role PUBLIC,
--    which reads alarming in pg_policies, but PUBLIC only means the policy is
--    not role-restricted: for an anon caller auth.uid() is NULL, so the
--    predicate is NULL and the row is refused. The "temporary anon-write"
--    pattern the audit went looking for was real in July 2026 and was removed
--    by migration lock_down_mktcap_pipeline_writes on 2026-08-02;
--    scripts/supabase/OTHER-LEAGUES-SUPABASE.md keeps the old recipe only as a
--    record and says in terms not to recreate it. Loaders now use the
--    sb_secret service key, which bypasses RLS and needs no grant.
--
-- 2. TABLES WITH RLS OFF: NONE. The query returned zero rows: every ordinary
--    table in `public` has relrowsecurity set.
--
-- What is left is real, and it is all about picks.
--
-- FINDING (c2), FIXED HERE: a player could rewrite or delete a pick after the
-- event started. picks_update_own and picks_delete_own enforced ownership and
-- nothing about timing, so a pick could be changed once the result was known.
--
-- FINDING (c1), NOT FIXED HERE: every pick is world readable, before the game
-- as well as after. That is the read policy, and it is part 2. See the bottom.
--
-- 🔴 WHY THE OBVIOUS ONE-LINER WAS NOT POSSIBLE. There was nothing in the
-- database to compare a lock against. public.picks is
-- (user_id, league, season, event_key, mode, pick, confidence, picked_at) and
-- carries no kickoff or lock column, and no table mapped event_key to a start
-- time: the keys are league-shaped, "2026-08-21:arsenal" for the Premier
-- League and bare ESPN event ids such as 401872656 for the NFL and college
-- football, while football_fixtures is keyed on api-football ids and the ESPN
-- schedule lives in committed JSON rather than in Postgres. A policy cannot
-- read a JSON file. So the lock time had to be brought INTO the database
-- before any policy could enforce it, which is what this migration does.

begin;

-- A record of the policies as they stood when this was applied, so the change
-- can be reasoned about and reversed without digging through history. 98 rows
-- captured.
create table if not exists public._rls_audit_20260923 (
  captured_at timestamptz not null default now(),
  tablename   text,
  policyname  text,
  cmd         text,
  roles       text,
  qual        text,
  with_check  text
);

insert into public._rls_audit_20260923 (tablename, policyname, cmd, roles, qual, with_check)
select tablename, policyname, cmd, roles::text, qual, with_check
  from pg_policies where schemaname = 'public';

alter table public._rls_audit_20260923 enable row level security;
-- No policy on it, so it is readable only by a key that bypasses RLS.

create table if not exists public.pick_locks (
  league     text not null,
  season     text not null,
  event_key  text not null,
  locks_at   timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (league, season, event_key)
);

alter table public.pick_locks enable row level security;

-- Readable by anyone: a lock time is public information and the client needs
-- it to grey out a pick. Writes are service-key only, so no policy is created
-- for INSERT, UPDATE or DELETE.
drop policy if exists pick_locks_public_read on public.pick_locks;
create policy pick_locks_public_read on public.pick_locks
  for select using (true);

-- True when the event has no recorded lock time yet, or that time is still in
-- the future. STABLE, not IMMUTABLE: it reads a table and the clock.
--
-- security invoker, deliberately. The subquery is therefore subject to
-- pick_locks' own RLS, which is why that table needs the public read policy
-- above: without it the subquery would return no row, coalesce would fall to
-- true, and every event would read as open. Verified after applying that anon
-- and authenticated both hold EXECUTE here and can see pick_locks.
create or replace function public.pick_is_open(p_league text, p_season text, p_event_key text)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    (select l.locks_at > now()
       from public.pick_locks l
      where l.league = p_league and l.season = p_season and l.event_key = p_event_key),
    true  -- unknown event: OPEN. See the note below before changing this.
  );
$$;

-- 🔴 THE DEFAULT ABOVE IS A DELIBERATE CHOICE AND IT IS THE RISKY ONE.
-- With pick_locks empty, `true` means nothing is locked and this migration
-- changed no behaviour on the day it landed, which is what made it safe to
-- apply before the lock feed exists. It also means an event missing from
-- pick_locks is editable for ever, so the guarantee is only as good as the feed
-- that fills the table. Flipping the default to false is the fail-closed choice
-- and would freeze every pick immediately, including for events nobody has
-- loaded yet. Do not flip it until pick_locks is populated and a job keeps it
-- current; that job does not exist yet and is the real prerequisite here.

-- Ownership AND timing on writes. With pick_locks empty these are equivalent to
-- the policies they replace; they begin to bite when the lock feed exists.
drop policy if exists picks_update_own on public.picks;
create policy picks_update_own on public.picks
  for update
  using       ((select auth.uid()) = user_id and public.pick_is_open(league, season, event_key))
  with check  ((select auth.uid()) = user_id and public.pick_is_open(league, season, event_key));

drop policy if exists picks_delete_own on public.picks;
create policy picks_delete_own on public.picks
  for delete
  using ((select auth.uid()) = user_id and public.pick_is_open(league, season, event_key));

-- Inserting a pick for an event that has already locked is the same hole by
-- another route, so the insert policy gains the same condition.
drop policy if exists picks_insert_own on public.picks;
create policy picks_insert_own on public.picks
  for insert
  with check ((select auth.uid()) = user_id and public.pick_is_open(league, season, event_key));

commit;

-- ---------------------------------------------------------------------------
-- 🔴 PART 2 IS NOT IN THIS FILE, AND NOT IN migrations/ AT ALL.
--
-- The draft also replaced picks_select_all with picks_select_own_or_locked.
-- That is the fix for finding c1 and it is the ONLY part that changes
-- behaviour while pick_locks is empty: pick_is_open is true everywhere, so the
-- policy would hide every other player's rows. app/play/picks/PicksClient.tsx
-- builds the global leaderboard by reading the whole picks table with the
-- BROWSER client, and its own comment says so ("Leaderboard data (signed-in
-- only; RLS makes picks world-readable)"), so applying it would have blanked
-- the leaderboard for everyone.
--
-- It lives in supabase/pending/20260924_picks_read_policy.sql, outside
-- migrations/ on purpose, so `supabase db push` cannot apply it by accident.
-- That file carries the prerequisites.
