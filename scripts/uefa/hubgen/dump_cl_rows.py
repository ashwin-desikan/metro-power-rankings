"""Dump Supabase public.cl_league_history rows for the 2010-13 hub seasons into cl_rows.json
(the input rebuild_tables.build_groups + champ_final expect). Runs natively (box has Supabase egress)."""
import os, sys, json, urllib.request, urllib.parse
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
SUPA = "https://nmprqkmymrdknffwnuur.supabase.co"
def key():
    for ln in open(os.path.join(ROOT, ".env.local"), encoding="utf-8"):
        if ln.startswith("SUPABASE_SERVICE_KEY="): return ln.split("=", 1)[1].strip()
    sys.exit("no key")
k = key()
COLS = "season,country,league,division,level,grp,place,w,d,l,points,gs,ga,g_diff,matches,cur_name,team,champions,first_division,end_year,cup_major,cup_major_final,cup_minor,cup_minor_final"
rows = []; off = 0
while True:
    q = urllib.parse.urlencode({"select": COLS, "season": 'in.("1959-60","1960-61","1961-62","1962-63","1963-64","1964-65","1965-66","1966-67","1967-68","1968-69","1969-70","1970-71","1971-72","1972-73","1973-74","1974-75","1975-76","1976-77","1977-78","1978-79","1979-80","1980-81","1981-82","1982-83","1983-84","1984-85","1985-86","1986-87","1987-88","1988-89","1989-90","1990-91","1991-92","1992-93","1993-94","1994-95","1995-96","1996-97","1997-98","1998-99","1999-00","2000-01","2001-02","2002-03","2003-04","2004-05","2005-06","2006-07","2007-08","2008-09","2009-10","2010-11","2011-12","2012-13","2013-14","2014-15","2015-16","2016-17","2017-18","2018-19","2019-20","2020-21","2021-22","2022-23","2023-24","2024-25","2025-26")', "order": "id", "limit": 1000, "offset": off})
    req = urllib.request.Request(f"{SUPA}/rest/v1/cl_league_history?{q}",
                                 headers={"apikey": k, "Authorization": "Bearer " + k})
    with urllib.request.urlopen(req, timeout=90) as r: b = json.load(r)
    rows += b
    if len(b) < 1000: break
    off += 1000
json.dump(rows, open(os.path.join(HERE, "cl_rows.json"), "w", encoding="utf-8"), ensure_ascii=False)
from collections import Counter
sc = Counter(r.get("season") for r in rows)
print("rows", len(rows), "seasons", dict(sc))
