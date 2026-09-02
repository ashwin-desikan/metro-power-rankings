-- hermes_readonly: a verification-only database role for the Hermes agent.
--
-- STATUS: FOR REVIEW. Do not run this until Ashwin has read it.
-- Written 2026-09-02 by Claude. Not executed by any agent.
--
-- WHY THIS EXISTS
-- Hermes was initially handed the Supabase SERVICE-ROLE key. That key bypasses
-- RLS on every table in the project (95 at the time of writing) and can write
-- as well as read. Hermes needs neither. Its job is to check claims: row counts,
-- table shapes, whether a rating table matches what a memo says it does.
--
-- WHAT IS DELIBERATELY EXCLUDED
-- picks, pick_profiles and follows hold live user data from a signed-in game.
-- No verification task needs them, and an agent that can enumerate every pick
-- every user has ever made, in order to check a rugby standings table, is
-- holding far more than the job requires. They are revoked below, AFTER the
-- blanket grant, because ALL TABLES would otherwise include them.
--
-- WHAT TO CHECK BEFORE RUNNING
--   1. Replace the password placeholder. Do not paste the real value into a
--      chat, a commit, or this file. Set it in the SQL editor at run time.
--   2. Confirm the three excluded tables are still the right three. If a new
--      table starts holding user rows, add it to the REVOKE list and re-run
--      that statement.
--   3. ALTER DEFAULT PRIVILEGES applies only to tables created by the role
--      that runs it. Run this as the same role that owns the schema, or new
--      tables will not be covered.
--   4. Supabase connections go through the pooler. Confirm the role can
--      actually connect before assuming a failure is a permissions problem.

-- 1. The role itself. No superuser, no DDL, no role creation.
CREATE ROLE hermes_readonly
  LOGIN
  PASSWORD 'REPLACE_ME_AT_RUN_TIME'
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT;

-- 2. Schema visibility. Without this the role authenticates and then sees
--    nothing at all, which reads like a broken connection rather than a
--    missing grant.
GRANT USAGE ON SCHEMA public TO hermes_readonly;

-- 3. Read everything in public...
GRANT SELECT ON ALL TABLES IN SCHEMA public TO hermes_readonly;

-- 4. ...except the user tables.
REVOKE SELECT ON public.picks          FROM hermes_readonly;
REVOKE SELECT ON public.pick_profiles  FROM hermes_readonly;
REVOKE SELECT ON public.follows        FROM hermes_readonly;

-- 5. Cover tables created later, so a new table is not invisible until
--    somebody remembers to re-grant.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO hermes_readonly;

-- 6. Verification. Expect the three user tables to be absent from this list.
--    Run as hermes_readonly:
--      SELECT table_name FROM information_schema.table_privileges
--      WHERE grantee = 'hermes_readonly' AND privilege_type = 'SELECT'
--      ORDER BY table_name;

-- TO REVOKE ACCESS ENTIRELY, later:
--   REVOKE ALL ON ALL TABLES IN SCHEMA public FROM hermes_readonly;
--   REVOKE ALL ON SCHEMA public FROM hermes_readonly;
--   DROP ROLE hermes_readonly;
