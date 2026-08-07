# OtherLeagues → Supabase migration & season-update protocols

Supabase (project `nmprqkmymrdknffwnuur`) is the **source of truth** for the
competitions formerly held in `OtherLeagues.xlsx`. Build scripts read Supabase
and emit the same `public/data/**` JSON as before (byte-identical), which the
`lib/*.ts` modules consume. The workbook is retired as master for migrated
sheets (kept only as a historical archive).

## The pattern (per competition)
1. **Schema**: one table per sheet, snake_case, mirroring the meaningful columns.
   `enable row level security` + a read-only policy: `for select to anon, authenticated using (true)` (public sports data, no PII).
   Add a natural unique key (e.g. `unique(year, team)`) so updates upsert.
2. **Load** (one-time historical): insert the sheet rows.
3. **Rewire the build script**: replace the `openpyxl.load_workbook(...)` read
   with a Supabase REST fetch (`/rest/v1/<table>`, `apikey`+`Authorization: Bearer`).
   Keep the aggregation and JSON output identical.
4. **Parity check**: order/collation-independent content checksum
   (`md5(string_agg(md5(<cols>) order by md5(...)))`) must equal the same checksum
   computed from the xlsx; and the rebuilt JSON must equal the committed JSON
   (ignoring the daily `generated` field).
5. **Season-update protocol** (below), since Supabase is now source of truth.

Build reads use the public anon key (RLS allows select). Loads/updates use the
service key and run where there is Supabase egress (your machine or the mini —
the Cowork bash sandbox has none; the Supabase MCP does).

## Phase 1 — CWS (baseball) — DONE
- Table: `public.cws_standings` (bin, year, team, w, l, win_pct, finals, champion; unique(year,team)).
- Build: `scripts/build-cws-data.py` → `public/data/baseball/cws.json` (read by `lib/cws.ts`).
- Season update (each June, when the CWS final ends): upsert ~8 rows for the new
  year (one per bracket team; `finals=true` for the two finalists, `champion=true`
  for the winner), then re-run the build and commit the JSON:
  ```sql
  insert into public.cws_standings (bin, year, team, w, l, win_pct, finals, champion) values
    ('2027Champ', 2027, 'Champ', 5, 0, 1.0, true, true),
    ('2027RunnerUp', 2027, 'RunnerUp', 3, 2, 0.6, true, false),
    -- ... remaining CWS field teams (finals=false, champion=false) ...
  on conflict (year, team) do update set
    w=excluded.w, l=excluded.l, win_pct=excluded.win_pct,
    finals=excluded.finals, champion=excluded.champion;
  ```
  Then: `python scripts/build-cws-data.py` and commit `public/data/baseball/cws.json`.
  (Automatable later via an NCAA results scraper on the mini with the approved alert-gate.)

## Load mechanism — ⚠️ CORRECTED 2026-08-07. DO NOT USE THE RECIPE BELOW.

**The write credential is the `sb_secret_…` service key** (Supabase dashboard → Settings → API), which bypasses RLS. See `mac-mini-jobs/REBUILD-RUNBOOK.md` §5 and `scripts/mktcap/README.md`. The 401 recorded here on 2026-07-08 was a *legacy* service key on this project's newer key system, not a property of service keys as such.

**The temporary-anon-insert-policy workaround below is exactly the pattern that migration `lock_down_mktcap_pipeline_writes` (2026-08-02) was written to eliminate**, after a review found that the public anon key ships in every browser bundle, so a temporary anon write grant is a temporary write grant to the entire internet. Those grants have been revoked. Do not re-create them. The paragraph is kept only as a record of what was done in July.

<details><summary>Superseded July 2026 recipe (record only)</summary>

### Load mechanism (IMPORTANT — this project's service_role key is rejected)
Writes with a `service_role` key 401 ("Invalid API key"): this project is on
Supabase's newer key system and the legacy service key is disabled. Working load
path: (a) create table + anon read policy (MCP); (b) add a TEMPORARY anon
insert+update policy (MCP); (c) run the loader natively — it forces the public
anon key: `python scripts/supabase/load_other_leagues.py <key>`; (d) drop the
temp policy (MCP). Tiny tables (<~25 rows) are inserted directly via MCP
`execute_sql` (privileged, bypasses RLS — no policy or loader needed). Build read
path uses the public anon key + the RLS read policy.

</details>

## Phase 2 — Basketball — DONE
- `euroleague_seasons` (1047 rows); `scripts/basketball/build_intl_basketball.py`
  `parse_euroleague()` rewired; euroleague/nations/hub.json byte-identical.
  Order by `id` preserves sheet order so title_years stay identical.
- `wnba_seasons` (365) + `wnba_franchises` (20, current/defunct classification);
  `scripts/build-wnba-data.py` rewired; wnba/data.json byte-identical. Two tables
  because the WNBA sheet also holds current/defunct franchise side-lists (so
  expansion sides appear before results). Numeric care: games-back is int-or-float
  per row — store float8, coerce int-if-whole in the build (`_N`).

## Phase 3 — IPL (cricket) — DONE
- `ipl_standings` (166) + `ipl_playoff_matches` (74, unique(season,round)); loader `ipl` key
  loads both sheets. NO committed builder existed for the IPL sheets, so
  `scripts/build-ipl-data.py` was written from scratch to reproduce the committed
  `public/data/ipl/data.json` byte-for-byte. Curated franchise metadata (slug,
  abbr, colours, city/state/metro, and DISPLAY ORDER) is a fixed list in the
  builder (carried over from the committed file); all stats computed from
  `ipl_standings`. Read by `lib/ipl.ts`.
- LESSON for pretty-printed (`indent=2`) outputs: on Windows `open(...,"w")`
  translates \n -> \r\n. Pin `newline="\n"` AND add a trailing `\n` (the committed
  file ends with one) or the byte-diff is off by CRLFs + one byte. Compact
  (`separators`) builders don't hit this because they emit a single line.
