# -*- coding: utf-8 -*-
"""Weekly refresh of the US number-one films dataset (Screen of the Metros).

Repo-resident fork of the Windows pipeline's number_ones.py + export_number_ones.py
(_screen_of_metros_pipeline/, OneDrive, outside git — that folder stays MASTER for
full rebuilds). This script exists so the Mac mini's weekly job can keep the
current year fresh from the repo checkout alone:

  1. drops the current year from scripts/screen/data/number_ones.json,
  2. re-scrapes any missing year pages from Wikipedia
     ('List of YYYY box office number-one films in the United States'),
  3. re-resolves wikilink targets -> QID (cached) -> IMDb tt via Wikidata P345,
  4. rewrites public/data/screen/screen_number_ones.json with per-year weeks,
     all-time leaderboards, longest reigns, and canon/top-grosser/Best Picture
     badges via the shared tt spine.

Inputs under scripts/screen/data/ (film_ids.json, film_honours.json,
canon_ids.json are snapshots of the Windows pipeline's raw/ outputs — refresh
them after each post-Oscars full rebuild). stdlib only; run: python3
scripts/screen/refresh_number_ones.py
"""
import datetime
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
OUTDIR = os.path.normpath(os.path.join(HERE, "..", "..", "public", "data", "screen"))
CUR_YEAR = datetime.date.today().year
UA = {"User-Agent": "MetroAreaProject/1.0 (metro rankings pipeline; ashwind@gmail.com)"}

LINK = re.compile(r"\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]")
MONEY = re.compile(r"\$\s*([\d,]+)")


def get_json(url, data=None):
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, data=data, headers=UA)
            return json.loads(urllib.request.urlopen(req, timeout=180).read().decode("utf-8"))
        except Exception:
            if attempt == 3:
                raise
            time.sleep(3 * (attempt + 1) ** 2)


def wikitext(title):
    q = urllib.parse.urlencode({"action": "parse", "page": title, "prop": "wikitext",
                                "format": "json", "formatversion": 2})
    return get_json("https://en.wikipedia.org/w/api.php?" + q)["parse"]["wikitext"]


def get_page(title):
    last = None
    for attempt in range(4):
        try:
            wt = wikitext(title)
            m = re.match(r"\s*#REDIRECT\s*\[\[([^\]|#]+)", wt, re.I)
            if m:
                wt = wikitext(m.group(1).strip())
            return wt
        except Exception as e:
            last = e
            time.sleep(2 * (attempt + 1) ** 2)
    raise last


def sparql(query):
    data = urllib.parse.urlencode({"query": query, "format": "json"}).encode()
    return get_json("https://query.wikidata.org/sparql", data=data)


# ---------------- Wikipedia year-page parser (verbatim from the pipeline) ----

def cells_of(tbl):
    rows, current = [], []
    for ln in tbl.split("\n")[1:]:
        ln = ln.rstrip()
        if ln.startswith("|-"):
            if current:
                rows.append(current); current = []
        elif ln.startswith("|}"):
            break
        elif ln.startswith("!"):
            continue
        elif ln.startswith("|"):
            for c in re.split(r"\|\|", ln[1:]):
                if "|" in c and "[[" not in c.split("|", 1)[0] and "{{" not in c.split("|", 1)[0]:
                    c = c.split("|", 1)[1]
                current.append(c.strip())
        elif current:
            current[-1] = current[-1] + " " + ln.strip()
    if current:
        rows.append(current)
    return rows


MONTHS = {m: i + 1 for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july",
     "august", "september", "october", "november", "december"])}


def parse_date(s, year):
    # {{dts|2026|January|4|...}} template form (named args may precede the year)
    m = re.search(r"\{\{dts\|(?:[^|{}]*=[^|{}]*\|)*(\d{4})\|([A-Za-z]+)\|(\d{1,2})", s, re.I)
    if m and m.group(2).lower() in MONTHS:
        return "%04d-%02d-%02d" % (int(m.group(1)), MONTHS[m.group(2).lower()], int(m.group(3)))
    m = re.search(r"([A-Za-z]+)\s+(\d{1,2})", s)
    if not m or m.group(1).lower() not in MONTHS:
        return None
    return "%04d-%02d-%02d" % (year, MONTHS[m.group(1).lower()], int(m.group(2)))


NOT_FILMS = {"Variety (magazine)", "Archive.org", "Internet Archive", "Media History Digital Library",
             "Box Office Mojo", "IMDb", "The Numbers (website)"}

# note rows where no film topped the chart (theatres closed) — drop the week entirely
NO_CHART = {"COVID-19 pandemic", "COVID-19 pandemic in the United States",
            "Impact of the COVID-19 pandemic on cinema"}


def parse_table(year, tbl, seen):
    out, prev = [], None
    for raw_cells in cells_of(tbl):
        # citation links ([[Variety (magazine)]] etc.) live inside <ref> tags —
        # strip them before any link search
        cells = [re.sub(r"<ref[^>]*/>|<ref[^>]*>.*?</ref>|<ref[^>]*>.*$", "", c, flags=re.S)
                 for c in raw_cells]
        date, date_i = None, None
        for ci, c in enumerate(cells[:3]):
            date = parse_date(c, year)
            if date:
                date_i = ci
                break
        if not date:
            continue
        # the film may ONLY come from the cell immediately after the date (the
        # Film column). Wikilinked on first appearance; PLAIN ITALIC TEXT on
        # later chart-toppings ("''Star Wars'' †") — resolved via `seen`.
        cell = cells[date_i + 1] if date_i + 1 < len(cells) else ""
        mm = LINK.search(cell)
        if mm and mm.group(1).strip() in NO_CHART:
            prev = None      # theatres closed: no №1 this week, and nothing to carry forward
            continue
        if mm and not re.match(r"(File|Image):", mm.group(1)) and mm.group(1).strip() not in NOT_FILMS:
            prev = {"target": mm.group(1).strip(), "display": (mm.group(2) or mm.group(1)).strip()}
            seen[prev["display"].lower()] = (prev["target"], prev["display"])
        elif "$" not in cell:
            tt = re.search(r"''([^']+)''", cell)
            if tt:
                title = tt.group(1).replace("†", "").strip()
                hit = seen.get(title.lower())
                prev = {"target": hit[0], "display": hit[1]} if hit else {"target": title, "display": title}
        gross_i = next((ci for ci, c in enumerate(cells) if ci > date_i and MONEY.search(c)), None)
        gross = MONEY.search(cells[gross_i]) if gross_i is not None else None
        if not prev:
            continue
        out.append({"date": date, "target": prev["target"], "display": prev["display"],
                    "gross": int(gross.group(1).replace(",", "")) if gross else None})
    return out


def parse_year(year, wt, seen):
    """Older pages put a one-row legend table before the real one — parse every
    table in the section and keep the best yield."""
    m = re.search(r"(?m)^=+\s*Number-one films\s*=+\s*$", wt)
    sec = wt[m.end():] if m else wt
    stop = re.search(r"(?m)^==[^=]", sec)
    if stop:
        sec = sec[:stop.start()]
    best = []
    for t in re.finditer(r"\{\|.*?\n\|\}", sec, flags=re.S):
        rows = parse_table(year, t.group(0), seen)
        if len(rows) > len(best):
            best = rows
    return best


# ---------------- step 1+2: drop current year, re-scrape missing years -------

def refresh_weeks():
    path = os.path.join(DATA, "number_ones.json")
    data = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
    data.pop(str(CUR_YEAR), None)
    # films are wikilinked only on their FIRST chart-topping, sometimes years
    # earlier — rebuild the cross-year title memory from the cached rows so a
    # re-released classic re-topping this year still resolves to its wikilink.
    seen = {}
    for y in sorted(data, key=int):
        for r in data[y]:
            seen.setdefault(r["display"].lower(), (r["target"], r["display"]))
    for year in range(1946, CUR_YEAR + 1):
        if str(year) in data:
            continue
        try:
            wt = get_page(f"List of {year} box office number-one films in the United States")
        except Exception as e:
            print(year, "MISS", type(e).__name__)
            data[str(year)] = []
            continue
        data[str(year)] = parse_year(year, wt, seen)
        print(year, len(data[str(year)]), "weeks", flush=True)
        time.sleep(0.3)
    json.dump(data, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    total = sum(len(v) for v in data.values())
    empty = [y for y, v in data.items() if not v]
    print("weeks:", total, "| films:", len({r['target'] for v in data.values() for r in v}),
          "| empty years:", empty)
    return data


# ---------------- step 3+4: resolve ids, badges, export ----------------------

def export(data):
    targets = sorted({r["target"] for v in data.values() for r in v})
    cache_path = os.path.join(DATA, "n1_qids.json")
    t2q = json.load(open(cache_path, encoding="utf-8")) if os.path.exists(cache_path) else {}
    todo = [t for t in targets if t not in t2q]
    for i in range(0, len(todo), 50):
        chunk = todo[i:i + 50]
        q = urllib.parse.urlencode({"action": "query", "prop": "pageprops", "ppprop": "wikibase_item",
                                    "redirects": 1, "format": "json", "titles": "|".join(chunk)})
        j = get_json("https://en.wikipedia.org/w/api.php?" + q)
        rd = {r["from"]: r["to"] for r in j.get("query", {}).get("redirects", [])}
        norm = {r["from"]: r["to"] for r in j.get("query", {}).get("normalized", [])}
        byname = {p["title"]: p.get("pageprops", {}).get("wikibase_item")
                  for p in j.get("query", {}).get("pages", {}).values()}
        for t in chunk:
            r = rd.get(norm.get(t, t), norm.get(t, t))
            t2q[t] = byname.get(r)
        time.sleep(0.3)
    json.dump(t2q, open(cache_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    qids = sorted({q for q in t2q.values() if q})
    print("QIDs:", len(qids), "/", len(targets))

    q2tt = {}
    for i in range(0, len(qids), 300):
        chunk = qids[i:i + 300]
        vals = " ".join(f"wd:{q}" for q in chunk)
        j = sparql(f'SELECT ?f ?tt WHERE {{ VALUES ?f {{ {vals} }} ?f wdt:P345 ?tt . }}')
        for b in j["results"]["bindings"]:
            tt = b["tt"]["value"]
            if tt.startswith("tt"):
                q2tt.setdefault(b["f"]["value"].rsplit("/", 1)[-1], tt)
        time.sleep(1.0)
    t2tt = {t: q2tt[q] for t, q in t2q.items() if q and q in q2tt}
    print("with tt:", len(t2tt))

    # cross-link badge sets via the shared tt spine (snapshots of pipeline raw/)
    def load(name, fallback):
        p = os.path.join(DATA, name)
        return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else fallback

    fid = load("film_ids.json", {"title_to_tt": {}})["title_to_tt"]
    our_tts = set(fid.values())
    canon_ids = load("canon_ids.json", {})
    canon = json.load(open(os.path.join(OUTDIR, "screen_canon.json"), encoding="utf-8"))
    canon_rank_by_tt = {}
    for f in canon["films"]:
        tt = canon_ids.get(f'{f["title"]}|{f["year"]}', {}).get("tt")
        if tt:
            canon_rank_by_tt[tt] = f["rank"]
    hon = load("film_honours.json", {"badges": {}})
    bp_tts = {fid[t] for t, b in hon["badges"].items() if "Best Picture" in b and t in fid}

    all_weeks = sorted((r for v in data.values() for r in v), key=lambda r: r["date"])
    weeks_by_film = Counter(r["target"] for r in all_weeks)
    reigns, cur, cnt, start = [], None, 0, None
    for r in all_weeks + [{"target": None, "date": None}]:
        if r["target"] == cur:
            cnt += 1
        else:
            if cur is not None and cnt >= 1:
                reigns.append({"target": cur, "weeks": cnt, "start": start})
            cur, cnt, start = r["target"], 1, r["date"]
    reigns.sort(key=lambda x: (-x["weeks"], x["start"]))

    def film_obj(t):
        tt = t2tt.get(t)
        return {"title": next(r["display"] for v in data.values() for r in v if r["target"] == t),
                "tt": tt,
                "canonRank": canon_rank_by_tt.get(tt),
                "topGrosser": tt in our_tts if tt else False,
                "bestPicture": tt in bp_tts if tt else False}

    films_out = {t: film_obj(t) for t in targets}
    years_out = []
    for y in sorted(int(k) for k in data):
        rows = data[str(y)]
        if not rows:
            continue
        years_out.append({"year": y,
                          "weeks": [{"date": r["date"], "target": r["target"], "gross": r["gross"]}
                                    for r in sorted(rows, key=lambda r: r["date"])]})

    out = {
        "source": "Wikipedia: 'List of YYYY box office number-one films in the United States' series, 1946-present (CC BY-SA 4.0; recent years cite Box Office Mojo, early years Variety's National Boxoffice Survey)",
        "films": films_out,
        "years": years_out,
        "mostWeeks": [{"target": t, "weeks": w} for t, w in weeks_by_film.most_common(25)],
        "longestReigns": [{"target": r["target"], "weeks": r["weeks"], "start": r["start"]}
                          for r in reigns[:25]],
        "totals": {"weeks": len(all_weeks), "films": len(targets),
                   "withTt": len(t2tt), "years": len(years_out)},
    }
    path = os.path.join(OUTDIR, "screen_number_ones.json")
    json.dump(out, open(path, "w", encoding="utf-8"), ensure_ascii=False)
    print("wrote", path, os.path.getsize(path), "bytes")
    print("badges: canon-ranked", sum(1 for f in films_out.values() if f["canonRank"]),
          "| top-grossers", sum(1 for f in films_out.values() if f["topGrosser"]),
          "| BP winners", sum(1 for f in films_out.values() if f["bestPicture"]))


if __name__ == "__main__":
    export(refresh_weeks())
