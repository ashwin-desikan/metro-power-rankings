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
