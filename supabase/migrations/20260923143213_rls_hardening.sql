-- RLS hardening. DRAFT, NOT APPLIED. Written 2026-09-23 for review.
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

begin;

-- ---------------------------------------------------------------------------
-- A record of the policies as they stood when this was drafted, so the change
-- can be reasoned about and reversed without digging through history.
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

-- ---------------------------------------------------------------------------
-- FINDING (c1): every pick is world readable, before the game as well as after.
--
--   picks_select_all : SELECT, role PUBLIC, using (true)
--
-- So an anonymous caller can read what anyone has picked while the pick is
-- still live. For a picks game that is the whole contest: it lets a later
-- player copy an earlier one, and it does not need an account to do it.
--
-- FINDING (c2): a player can rewrite or delete a pick after the event starts.
--
--   picks_update_own : UPDATE, using/with check auth.uid() = user_id
--   picks_delete_own : DELETE, using auth.uid() = user_id
--
-- Neither carries any time condition, so a pick can be changed once the result
-- is known. Ownership is enforced; timing is not.
--
-- 🔴 WHY THE OBVIOUS ONE-LINER IS NOT POSSIBLE. There is nothing in the
-- database to compare a lock against. public.picks is
-- (user_id, league, season, event_key, mode, pick, confidence, picked_at) and
-- carries no kickoff or lock column, and no table maps event_key to a start
-- time: the keys are league-shaped, "2026-08-21:arsenal" for the Premier
-- League and bare ESPN event ids such as 401872656 for the NFL and college
-- football, while football_fixtures is keyed on api-football ids and the ESPN
-- schedule lives in committed JSON rather than in Postgres. A policy cannot
-- read a JSON file. So the lock time has to be brought INTO the database
-- before any policy can enforce it, which is what this section does. Review
-- this part hardest: it adds a table and a writer, not just a grant.
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
-- changes no behaviour on day one, which is what makes it safe to apply before
-- the lock feed exists. It also means an event missing from pick_locks is
-- editable for ever, so the guarantee is only as good as the feed that fills
-- the table. Flipping the default to false is the fail-closed choice and would
-- freeze every pick the moment this lands, including for events nobody has
-- loaded yet. Do not flip it until pick_locks is populated and a job keeps it
-- current; that job does not exist yet and is the real prerequisite here.

-- Ownership AND timing on writes.
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

-- Your own picks always; everyone else's only once the event has locked.
drop policy if exists picks_select_all on public.picks;
create policy picks_select_own_or_locked on public.picks
  for select
  using ((select auth.uid()) = user_id or not public.pick_is_open(league, season, event_key));

-- ⚠️ READ THIS BEFORE APPLYING. With pick_locks empty, pick_is_open is true
-- everywhere, so the SELECT policy above hides EVERY other player's picks and
-- any leaderboard that reads picks with the anon key goes blank. That is the
-- correct end state and the wrong first move. Either populate pick_locks in
-- the same change, or land the write policies first and the read policy after
-- the feed exists. Check which key the leaderboard reads with before choosing.

commit;
