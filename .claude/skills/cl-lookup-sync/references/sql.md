# The five queries

All five run through the Supabase MCP against project `nmprqkmymrdknffwnuur`.
Steps 2, 3 and 5 use the same canonical row expression. It has to stay
byte-identical to `canon()` in `scripts/cl_lookup.py`, because a difference in
how a single NULL or decimal is rendered makes every row look changed.

The shared expression, used verbatim below:

```sql
md5(concat_ws(chr(31),
  coalesce(cur_name,''), coalesce(team,''), coalesce(lookup_name,''),
  coalesce(uefa_name,''), coalesce(uefa_name_2,''), coalesce(uefa_name_3,''),
  coalesce(efs_name,''), coalesce(api_name,''), coalesce(api_name_2,''),
  coalesce(country,''), coalesce(city,''), coalesce(metro_area,''),
  coalesce(county,''), coalesce(continent,''), coalesce(league,''),
  coalesce(level::text,''),
  coalesce(to_char(lat,'FM999999990.000000'),''),
  coalesce(to_char("long",'FM999999990.000000'),'')))
```

Field order matters. `chr(31)` is the unit separator, chosen because no club
name contains it. `FM999999990.000000` renders a float the same way Python's
`%.6f` does, including the sign and the trailing zeros.

---

## Step 2 - per-country hashes

Returns one row with one long `packed` string: `country~count~hash10|...`.
Save that value to `~/cl-lookup-sync/supabase_countries.txt` on the device.

```sql
with c as (
  select coalesce(country,'~none~') as country,
         md5(concat_ws(chr(31),
           coalesce(cur_name,''), coalesce(team,''), coalesce(lookup_name,''),
           coalesce(uefa_name,''), coalesce(uefa_name_2,''), coalesce(uefa_name_3,''),
           coalesce(efs_name,''), coalesce(api_name,''), coalesce(api_name_2,''),
           coalesce(country,''), coalesce(city,''), coalesce(metro_area,''),
           coalesce(county,''), coalesce(continent,''), coalesce(league,''),
           coalesce(level::text,''),
           coalesce(to_char(lat,'FM999999990.000000'),''),
           coalesce(to_char("long",'FM999999990.000000'),''))) as h
  from public.football_lookup
), g as (
  select country, count(*) as n, left(md5(string_agg(h,'' order by h)),10) as ch
  from c group by country
)
select string_agg(country||'~'||n||'~'||ch, '|' order by country) as packed from g;
```

## Step 3 - per-row hashes, only for the countries that differ

Replace the `in (...)` list with the countries `cl_lookup.py countries` printed.
Save the `packed` value to `~/cl-lookup-sync/supabase_rows.txt`.

```sql
with c as (
  select country, team,
         left(md5(concat_ws(chr(31),
           coalesce(cur_name,''), coalesce(team,''), coalesce(lookup_name,''),
           coalesce(uefa_name,''), coalesce(uefa_name_2,''), coalesce(uefa_name_3,''),
           coalesce(efs_name,''), coalesce(api_name,''), coalesce(api_name_2,''),
           coalesce(country,''), coalesce(city,''), coalesce(metro_area,''),
           coalesce(county,''), coalesce(continent,''), coalesce(league,''),
           coalesce(level::text,''),
           coalesce(to_char(lat,'FM999999990.000000'),''),
           coalesce(to_char("long",'FM999999990.000000'),''))),8) as h
  from public.football_lookup
  where country in ('REPLACE','ME')
)
select string_agg(country||'^'||coalesce(team,'')||'^'||h, '|' order by country, team) as packed from c;
```

## Step 4 - apply

Run the statements from `~/cl-lookup-sync/apply.sql`, one `execute_sql` call each,
reading each one before you run it. Deletes are emitted commented out on purpose.

## Step 5 - verify

Excluding the protected rows, the workbook and the table should now hash
identically. Add one `and not (...)` line per entry in `protected_rows.json`.

```sql
with c as (
  select md5(concat_ws(chr(31),
           coalesce(cur_name,''), coalesce(team,''), coalesce(lookup_name,''),
           coalesce(uefa_name,''), coalesce(uefa_name_2,''), coalesce(uefa_name_3,''),
           coalesce(efs_name,''), coalesce(api_name,''), coalesce(api_name_2,''),
           coalesce(country,''), coalesce(city,''), coalesce(metro_area,''),
           coalesce(county,''), coalesce(continent,''), coalesce(league,''),
           coalesce(level::text,''),
           coalesce(to_char(lat,'FM999999990.000000'),''),
           coalesce(to_char("long",'FM999999990.000000'),''))) as h
  from public.football_lookup
  where not (country='Argentina' and team='San Martín de San Juan')
    and not (country='Venezuela'  and team='Estudiantes de Mérida')
)
select (select count(*) from public.football_lookup) as total_rows,
       count(*) as compared_rows,
       md5(string_agg(h,'' order by h)) as hash_excl_protected
from c;
```

Then on the device, print the workbook's matching figure:

```bash
python3 - <<'PY'
import json, hashlib, os, sys
sys.path.insert(0, os.path.expanduser("~/mnt/Desktop--Projects--Metro Area Project/.claude/skills/cl-lookup-sync/scripts"))
from cl_lookup import rowhash
rows = json.load(open(os.path.expanduser("~/cl-lookup-sync/lookup.json")))["rows"]
held = {("Argentina", "San Martín de San Juan"), ("Venezuela", "Estudiantes de Mérida")}
hs = [rowhash(r) for r in rows if (r["country"], r["team"]) not in held]
print("workbook total     :", len(rows))
print("compared_rows      :", len(hs))
print("hash_excl_protected:", hashlib.md5("".join(sorted(hs)).encode()).hexdigest())
PY
```

Both `compared_rows` and `hash_excl_protected` must match. If they do, the sync
is complete and provably so. If the hash differs but the counts match, something
in the canonical form drifted between the SQL and the Python.
