#!/usr/bin/env python3
"""F1 data-source adapter: read/write the F1 dataset from the local CSVs OR the
Supabase mirror tables, behind read_records / read_df / write_df.

Each cell is stored verbatim as text, so:
  read_records(name) == csv.DictReader of the original CSV (all strings)
  read_df(name)      == pd.read_csv of the original CSV (same dtype inference)
  write_df(name, df) == df.to_csv(...) then stored verbatim (full-table replace)

Backend (env):
  F1_SUPABASE=1          -> Supabase (needs SUPABASE_URL + SUPABASE_SERVICE_KEY)
  F1_LOCAL_MIRROR=<json> -> a local JSON dump {name:[[cells...]]} (parity tests)
  (neither)              -> local CSVs in F1_DATA_DIR or the given csv_dir
"""
import os, io, csv, json as _json

F1_TABLES = {
 "race_tracks": {
  "table": "f1_race_tracks",
  "headers": [
   "Season",
   "Grand Prix",
   "Race",
   "Date",
   "Circuit",
   "City",
   "Metro Area",
   "Country",
   "Type",
   "Direction",
   "Current Length",
   "Starters",
   "Laps",
   "Winner",
   "Pole",
   "Qualifying Time",
   "Led Most",
   "Fastest Lap",
   "Points Leader",
   "Average Speed (kph)",
   "Lead Changes",
   "Leaders",
   "Lead Lap Cars"
  ],
  "cols": [
   "season",
   "grand_prix",
   "race",
   "date",
   "circuit",
   "city",
   "metro_area",
   "country",
   "type",
   "direction",
   "current_length",
   "starters",
   "laps",
   "winner",
   "pole",
   "qualifying_time",
   "led_most",
   "fastest_lap",
   "points_leader",
   "average_speed_kph",
   "lead_changes",
   "leaders",
   "lead_lap_cars"
  ]
 },
 "race_meta": {
  "table": "f1_race_meta",
  "headers": [
   "season",
   "round",
   "race_name",
   "circuit_id",
   "country",
   "locality",
   "date"
  ],
  "cols": [
   "season",
   "round",
   "race_name",
   "circuit_id",
   "country",
   "locality",
   "date"
  ]
 },
 "results": {
  "table": "f1_results",
  "headers": [
   "season",
   "round",
   "race_name",
   "driver_id",
   "driver",
   "constructor_id",
   "constructor",
   "grid",
   "position",
   "position.1",
   "finish_order",
   "points",
   "laps",
   "time_gap",
   "status",
   "fastest_lap_time",
   "fastest_lap_speed"
  ],
  "cols": [
   "season",
   "round",
   "race_name",
   "driver_id",
   "driver",
   "constructor_id",
   "constructor",
   "grid",
   "position",
   "position_1",
   "finish_order",
   "points",
   "laps",
   "time_gap",
   "status",
   "fastest_lap_time",
   "fastest_lap_speed"
  ]
 },
 "sprint_results": {
  "table": "f1_sprint_results",
  "headers": [
   "season",
   "round",
   "race_name",
   "driver_id",
   "driver",
   "constructor_id",
   "constructor",
   "grid",
   "position",
   "position.1",
   "finish_order",
   "points",
   "laps",
   "time_gap",
   "status",
   "fastest_lap_time"
  ],
  "cols": [
   "season",
   "round",
   "race_name",
   "driver_id",
   "driver",
   "constructor_id",
   "constructor",
   "grid",
   "position",
   "position_1",
   "finish_order",
   "points",
   "laps",
   "time_gap",
   "status",
   "fastest_lap_time"
  ]
 },
 "poles": {
  "table": "f1_poles",
  "headers": [
   "season",
   "round",
   "race_name",
   "pole_driver"
  ],
  "cols": [
   "season",
   "round",
   "race_name",
   "pole_driver"
  ]
 },
 "driver_standings": {
  "table": "f1_driver_standings",
  "headers": [
   "season",
   "round",
   "driver_id",
   "position",
   "points",
   "wins"
  ],
  "cols": [
   "season",
   "round",
   "driver_id",
   "position",
   "points",
   "wins"
  ]
 },
 "constructor_standings": {
  "table": "f1_constructor_standings",
  "headers": [
   "season",
   "round",
   "constructor_id",
   "position",
   "points",
   "wins"
  ],
  "cols": [
   "season",
   "round",
   "constructor_id",
   "position",
   "points",
   "wins"
  ]
 },
 "drivers": {
  "table": "f1_drivers",
  "headers": [
   "driver_id",
   "driver",
   "code",
   "permanent_number",
   "dob",
   "nationality",
   "wikipedia"
  ],
  "cols": [
   "driver_id",
   "driver",
   "code",
   "permanent_number",
   "dob",
   "nationality",
   "wikipedia"
  ]
 },
 "constructors": {
  "table": "f1_constructors",
  "headers": [
   "constructor_id",
   "constructor",
   "nationality",
   "wikipedia"
  ],
  "cols": [
   "constructor_id",
   "constructor",
   "nationality",
   "wikipedia"
  ]
 },
 "circuits": {
  "table": "f1_circuits",
  "headers": [
   "circuit_id",
   "circuit_name",
   "locality",
   "country",
   "latitude",
   "longitude",
   "alt",
   "wikipedia"
  ],
  "cols": [
   "circuit_id",
   "circuit_name",
   "locality",
   "country",
   "latitude",
   "longitude",
   "alt",
   "wikipedia"
  ]
 }
}

_DEF_DIR = os.environ.get("F1_DATA_DIR") or os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "data")


def _mode():
    if os.environ.get("F1_SUPABASE") == "1":
        return ("supabase", None)
    lm = os.environ.get("F1_LOCAL_MIRROR")
    if lm:
        return ("local", lm)
    return ("csv", None)


def _client():
    from supabase import create_client
    url = os.environ["SUPABASE_URL"]
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ["SUPABASE_KEY"]
    return create_client(url, key)


def _fetch_supabase(cfg):
    sb = _client(); cols = cfg["cols"]; table = cfg["table"]
    sel = ",".join(cols); out = []; start = 0; page = 1000
    while True:
        r = sb.table(table).select(sel).order("row_num").range(start, start + page - 1).execute()
        b = r.data or []
        out.extend([[("" if row.get(c) is None else row.get(c)) for c in cols] for row in b])
        if len(b) < page: break
        start += page
    return out


def _replace_supabase(cfg, header_ordered_rows):
    sb = _client(); cols = cfg["cols"]; table = cfg["table"]
    sb.table(table).delete().gte("row_num", 0).execute()
    payload = []
    for i, row in enumerate(header_ordered_rows, start=1):
        rec = {"row_num": i}
        for c, v in zip(cols, row):
            rec[c] = v
        payload.append(rec)
    for j in range(0, len(payload), 500):
        sb.table(table).insert(payload[j:j + 500]).execute()
    return len(payload)


def _reorder(written_headers, rows, cfg_headers):
    if written_headers == cfg_headers:
        return rows
    idx = {h: k for k, h in enumerate(written_headers)}
    out = []
    for r in rows:
        out.append([r[idx[h]] if h in idx and idx[h] < len(r) else "" for h in cfg_headers])
    return out


def _raw(name, csv_dir=None):
    cfg = F1_TABLES[name]; headers = cfg["headers"]; mode, arg = _mode()
    if mode == "supabase":
        return headers, _fetch_supabase(cfg)
    if mode == "local":
        return headers, _json.load(open(arg, encoding="utf-8"))[name]
    d = csv_dir or _DEF_DIR
    with open(os.path.join(d, name + ".csv"), encoding="utf-8", newline="") as f:
        r = csv.reader(f); next(r); rows = [row for row in r]
    return headers, rows


def read_records(name, csv_dir=None):
    name = name[:-4] if name.endswith(".csv") else name
    headers, rows = _raw(name, csv_dir)
    w = len(headers)
    return [dict(zip(headers, (row + [""] * (w - len(row)))[:w])) for row in rows]


def read_df(name, csv_dir=None):
    name = name[:-4] if name.endswith(".csv") else name
    import pandas as pd
    headers, rows = _raw(name, csv_dir)
    buf = io.StringIO(); wr = csv.writer(buf); wr.writerow(headers); wr.writerows(rows); buf.seek(0)
    return pd.read_csv(buf)


def write_df(name, df, csv_dir=None):
    name = name[:-4] if name.endswith(".csv") else name
    cfg = F1_TABLES[name]; mode, arg = _mode()
    if mode == "csv":
        df.to_csv(os.path.join(csv_dir or _DEF_DIR, name + ".csv"), index=False); return len(df)
    buf = io.StringIO(); df.to_csv(buf, index=False); buf.seek(0)
    r = csv.reader(buf); wh = next(r); rows = [row for row in r]
    rows = _reorder(wh, rows, cfg["headers"])
    if mode == "supabase":
        return _replace_supabase(cfg, rows)
    d = _json.load(open(arg, encoding="utf-8")); d[name] = rows; _json.dump(d, open(arg, "w", encoding="utf-8"))
    return len(rows)


def seed_from_csvs(csv_dir=None):
    """One-time / re-seed: load every CSV verbatim into its Supabase table."""
    d = csv_dir or _DEF_DIR; total = 0
    for name, cfg in F1_TABLES.items():
        with open(os.path.join(d, name + ".csv"), encoding="utf-8", newline="") as f:
            rr = csv.reader(f); next(rr); rows = [row for row in rr]
        n = _replace_supabase(cfg, rows)
        print(f"  {cfg['table']:28s} {n:6d} rows"); total += n
    print(f"seeded {total} rows across {len(F1_TABLES)} tables")
