#!/usr/bin/env python3
"""Build /teams/cricket portal JSONs from InternationalCricket.xlsx.

Source of truth: the OneDrive InternationalCricket.xlsx workbook (sheets:
Matches, Other Internationals, Number Ones, Test/ODI/T20I Rankings, Honours,
Series Trophies). Emits:

  public/data/cricket/teams.json          - one row per team (110 nations + XIs)
  public/data/cricket/hub.json            - hub payload (rankings, reigns, honours, trophies)
  public/data/cricket/team-detail/<slug>.json - recent matches, head-to-head, finals

Deterministic: as_of derives from the latest ranking month, so re-runs on
unchanged data produce byte-identical output.

Run:  python build_cricket_portal_data.py <workbook.xlsx> <out_dir>
"""
import json
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import date, datetime
from cricket_source import open_source

FORMATS = ["Test", "ODI", "T20I"]
COMPOSITES = {"ICC World XI", "Asia XI", "Africa XI", "East Africa"}

# The 12 ICC full members (Test nations). Editorial constant: the Honours grid
# only lists countries with a title or runner-up finish, so it can't be the
# source for membership.
FULL_MEMBERS = {
    "Afghanistan", "Australia", "Bangladesh", "England", "India", "Ireland",
    "New Zealand", "Pakistan", "South Africa", "Sri Lanka", "West Indies",
    "Zimbabwe",
}

# Major name -> Honours grid key, used to resolve Tie / No-result finals
# (2019 CWC boundary-count title, CT 2002 shared title) from the curated
# title-year lists instead of the blank Winner column.
HONOUR_KEY_BY_MAJOR = {
    "Cricket World Cup": "wc", "T20 World Cup": "t20wc",
    "Champions Trophy": "ct", "WTC Final": "wtc", "Asia Cup": "asia",
}

# Other Internationals sheet uses a few long-form names; canonicalize to Matches names.
NAME_CANON = {
    "United States of America": "United States",
    "Turks and Caicos Island": "Turks and Caicos Islands",
    "Ivory Coast": "Côte d'Ivoire",
    "Bosnia and Herzegovina": "Bosnia-Herzegovina",
}


def slugify(name: str) -> str:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s


def iso(d):
    if d is None:
        return None
    if isinstance(d, (datetime, date)):
        return d.strftime("%Y-%m-%d")
    return str(d)[:10]


def year_of(d):
    s = iso(d)
    return int(s[:4]) if s else None


def canon(name):
    if name is None:
        return None
    name = str(name).strip()
    return NAME_CANON.get(name, name)


def new_fmt_rec():
    return {"m": 0, "w": 0, "l": 0, "d": 0, "t": 0, "nr": 0, "first": None, "last": None}


def add_result(rec, team, winner, result, dstr):
    rec["m"] += 1
    r = (result or "").strip().lower()
    if r == "win":
        if winner == team:
            rec["w"] += 1
        else:
            rec["l"] += 1
    elif r == "draw":
        rec["d"] += 1
    elif r == "tie":
        rec["t"] += 1
    else:
        rec["nr"] += 1
    if dstr:
        if rec["first"] is None or dstr < rec["first"]:
            rec["first"] = dstr
        if rec["last"] is None or dstr > rec["last"]:
            rec["last"] = dstr


def years_in(text):
    """All four-digit years in an honours year-list, including '1990-91' endings."""
    ys = set()
    for m in re.finditer(r"(?:19|20)(\d{2})(?:-(\d{2}))?", text):
        y = int(m.group(0)[:4])
        ys.add(y)
        if m.group(2):
            ys.add((y // 100) * 100 + int(m.group(2)))
    return ys


def main(wb_path, out_dir):
    import os

    wb = open_source(wb_path)

    # ---------------- Matches (team-perspective rows) ----------------
    ws = wb["Matches"]
    rows = list(ws.iter_rows(values_only=True))[1:]
    fmt_rec = defaultdict(lambda: {f: new_fmt_rec() for f in FORMATS})
    h2h = defaultdict(lambda: defaultdict(lambda: {f: new_fmt_rec() for f in FORMATS}))
    matches_by_team = defaultdict(list)
    finals = defaultdict(list)

    for r in rows:
        fmt, sd, ed, _mn, team, _t1, opp, _t2, ts, os_, winner, result, detail, tour, major, rnd, venue, vcity, vcountry, host = r[:20]
        if not team or fmt not in FORMATS:
            continue
        team, opp, winner = canon(team), canon(opp), canon(winner)
        dstr = iso(sd)
        add_result(fmt_rec[team][fmt], team, winner, result, dstr)
        add_result(h2h[team][opp][fmt], team, winner, result, dstr)
        matches_by_team[team].append({
            "date": dstr, "format": fmt, "opp": opp,
            "result": "W" if winner == team else ("L" if (result or "").strip() == "Win" else ((result or "")[:1] or "-")),
            "detail": detail or "", "tournament": tour or "", "venue": venue or "",
            "city": vcity or "", "country": vcountry or "",
        })
        if (rnd or "").strip() == "Final" and major:
            finals[team].append({
                "year": year_of(sd), "date": dstr, "major": major, "format": fmt,
                "tournament": tour or "", "opp": opp, "won": winner == team,
                "result": (result or "").strip(),
                "detail": detail or "",
            })

    # ---------------- Other Internationals (no format column) ----------------
    ws = wb["Other Internationals"]
    oi_rec = defaultdict(lambda: new_fmt_rec())
    for r in list(ws.iter_rows(values_only=True))[1:]:
        d, _mn, t1, t2, _s1, _s2, winner, result, _detail, _tour = r[:10]
        t1, t2, winner = canon(t1), canon(t2), canon(winner)
        dstr = iso(d)
        for team in (t1, t2):
            if team:
                add_result(oi_rec[team], team, winner, result, dstr)

    # ---------------- Honours grid (full members) ----------------
    ws = wb["Honours"]
    hrows = list(ws.iter_rows(values_only=True))
    comps = [("wc", "Cricket World Cup"), ("t20wc", "T20 World Cup"),
             ("ct", "Champions Trophy"), ("wtc", "WTC Final"), ("asia", "Asia Cup")]
    honours = {}
    honours_note = ""
    for r in hrows[1:]:
        if not r[0]:
            continue
        team = canon(r[0])
        if team not in FULL_MEMBERS:
            # Footnote row at the bottom of the grid.
            honours_note = str(r[0])
            continue
        rec = {}
        for i, (key, _label) in enumerate(comps):
            base = 1 + i * 4
            rec[key] = {
                "titles": int(r[base] or 0), "title_years": str(r[base + 1] or ""),
                "ru": int(r[base + 2] or 0), "ru_years": str(r[base + 3] or ""),
            }
        honours[team] = rec
    full_members = FULL_MEMBERS

    # ---------------- Finals outcomes ----------------
    # Decided finals follow the Winner column. Tie / No-result finals defer to
    # the curated Honours title-year lists: sole holder -> Won (2019 CWC,
    # England on boundary count), multiple holders -> Shared (CT 2002).
    def title_holders(major, year):
        key = HONOUR_KEY_BY_MAJOR.get(major)
        if not key or year is None:
            return []
        return [t for t, rec in honours.items() if year in years_in(rec[key]["title_years"])]

    for team, fl in finals.items():
        for f in fl:
            res = f.pop("result")
            if res == "Win":
                f["outcome"] = "Won" if f["won"] else "Lost"
                continue
            holders = title_holders(f["major"], f["year"])
            if team in holders:
                f["outcome"] = "Shared" if len(holders) > 1 else "Won"
                f["won"] = len(holders) == 1
            else:
                f["outcome"] = "Lost" if holders else ("Tied" if res == "Tie" else "No result")

    # ---------------- Rankings ----------------
    rank_sheets = {"Test": "Test Rankings", "ODI": "ODI Rankings", "T20I": "T20I Rankings"}
    current_tables = {}
    peaks = defaultdict(dict)  # team -> fmt -> {...}
    for fmt, sheet in rank_sheets.items():
        ws = wb[sheet]
        rrows = [r for r in list(ws.iter_rows(values_only=True))[1:] if r[0]]
        # T20I sheet has a 6th col "Table"; keep main table only when present.
        rrows = [r for r in rrows if len(r) < 6 or r[5] in (None, "", "main")]
        latest = max(str(r[0]) for r in rrows)
        cur = [r for r in rrows if str(r[0]) == latest]
        cur.sort(key=lambda r: int(r[1]))
        current_tables[fmt] = {
            "month": latest,
            "rows": [{"rank": int(r[1]), "team": canon(r[2]), "rating": float(r[3])} for r in cur],
        }
        by_team = defaultdict(list)
        for r in rrows:
            by_team[canon(r[2])].append((str(r[0]), int(r[1]), float(r[3])))
        for team, hist in by_team.items():
            best_rank = min(h[1] for h in hist)
            first_best = min(h[0] for h in hist if h[1] == best_rank)
            peak_rating = max(h[2] for h in hist)
            cur_row = next((h for h in hist if h[0] == latest), None)
            peaks[team][fmt] = {
                "current_rank": cur_row[1] if cur_row else None,
                "current_rating": cur_row[2] if cur_row else None,
                "peak_rank": best_rank, "peak_rank_first": first_best,
                "peak_rating": peak_rating,
            }

    # ---------------- Number Ones -> months at #1 + longest reign ----------------
    ws = wb["Number Ones"]
    nrows = list(ws.iter_rows(values_only=True))[1:]
    months_at_1 = defaultdict(lambda: {f: 0 for f in FORMATS})
    reigns = {f: [] for f in FORMATS}  # list of {team, start, end, months}
    prev = {f: None for f in FORMATS}
    for r in nrows:
        month = str(r[0]) if r[0] else None
        if not month:
            continue
        for fmt, idx in (("Test", 1), ("ODI", 3), ("T20I", 5)):
            team = canon(r[idx])
            if not team:
                prev[fmt] = None
                continue
            months_at_1[team][fmt] += 1
            if prev[fmt] and prev[fmt]["team"] == team:
                prev[fmt]["end"] = month
                prev[fmt]["months"] += 1
            else:
                rec = {"team": team, "start": month, "end": month, "months": 1}
                reigns[fmt].append(rec)
                prev[fmt] = rec

    number_ones = {}
    for fmt in FORMATS:
        agg = defaultdict(lambda: {"months": 0, "reigns": 0, "longest": 0, "last": None})
        for rec in reigns[fmt]:
            a = agg[rec["team"]]
            a["months"] += rec["months"]
            a["reigns"] += 1
            a["longest"] = max(a["longest"], rec["months"])
            a["last"] = max(a["last"] or "", rec["end"])
        number_ones[fmt] = sorted(
            [{"team": t, **v} for t, v in agg.items()],
            key=lambda x: -x["months"])

    # ---------------- Series Trophies (summary block above FULL LEDGERS) ----------------
    ws = wb["Series Trophies"]
    trows = list(ws.iter_rows(values_only=True))
    trophies = []
    for r in trows[1:]:
        c0 = str(r[0]) if r[0] is not None else ""
        if c0.startswith("FULL LEDGERS"):
            break
        if not c0 or c0 == "None":
            continue
        trophies.append({
            "trophy": c0, "contested_by": str(r[1] or ""), "format": str(r[2] or ""),
            "first": str(r[3] or ""), "last": str(r[4] or ""),
            "holder": str(r[5] or ""), "series": int(r[6] or 0), "notes": str(r[7] or ""),
        })

    # ---------------- Assemble teams ----------------
    all_names = set(fmt_rec) | set(oi_rec)
    slugs = {}
    teams = []
    for name in sorted(all_names):
        slug = slugify(name)
        slugs[name] = slug
        formats = {f: fmt_rec[name][f] for f in FORMATS if name in fmt_rec and fmt_rec[name][f]["m"] > 0}
        overall = new_fmt_rec()
        for f, rec in formats.items():
            for k in ("m", "w", "l", "d", "t", "nr"):
                overall[k] += rec[k]
            for k, fn in (("first", min), ("last", max)):
                if rec[k]:
                    overall[k] = rec[k] if overall[k] is None else fn(overall[k], rec[k])
        oi = oi_rec.get(name)
        team_trophies = [t for t in trophies if name in t["contested_by"]]
        teams.append({
            "slug": slug, "name": name,
            "full_member": name in full_members,
            "composite": name in COMPOSITES,
            "formats": formats, "overall": overall,
            "other_internationals": oi if oi and oi["m"] > 0 else None,
            "honours": honours.get(name),
            "rankings": peaks.get(name) or {},
            "months_at_1": months_at_1.get(name, {f: 0 for f in FORMATS}),
            "trophies_held": [t["trophy"] for t in team_trophies if t["holder"] == name],
            "trophies_contested": [t["trophy"] for t in team_trophies],
        })

    n_matches = sum(1 for r in rows if r[4]) // 2
    years = [iso(r[1]) for r in rows if r[1]]
    hub = {
        "as_of": max(current_tables[f]["month"] for f in FORMATS),
        "totals": {"matches": n_matches, "teams": len(teams),
                   "first": min(years), "last": max(years),
                   "full_members": len(full_members)},
        "current_rankings": current_tables,
        "number_ones": number_ones,
        "honours": [{"team": t, **honours[t]} for t in honours],
        "honours_note": honours_note,
        "series_trophies": trophies,
    }

    os.makedirs(os.path.join(out_dir, "team-detail"), exist_ok=True)
    with open(os.path.join(out_dir, "teams.json"), "w") as f:
        json.dump(teams, f, separators=(",", ":"))
    with open(os.path.join(out_dir, "hub.json"), "w") as f:
        json.dump(hub, f, separators=(",", ":"))

    for name in all_names:
        ml = sorted(matches_by_team.get(name, []), key=lambda m: m["date"] or "")
        fl = sorted(finals.get(name, []), key=lambda x: x["date"] or "")
        # A replayed final (CT 2002 reserve day) appears as two Final rows;
        # keep only the decisive (latest) match per (major, year, opponent).
        dedup = {}
        for f in fl:
            dedup[(f["major"], f["year"], f["opp"])] = f
        fl = sorted(dedup.values(), key=lambda x: x["date"] or "")
        detail = {
            "slug": slugs[name], "name": name,
            "recent": ml[-12:][::-1],
            "finals": fl,
            "h2h": {
                opp: {f: rec[f] for f in FORMATS if rec[f]["m"] > 0}
                for opp, rec in sorted(h2h[name].items(), key=lambda kv: -sum(v["m"] for v in kv[1].values()))
                if opp
            },
        }
        with open(os.path.join(out_dir, "team-detail", slugs[name] + ".json"), "w") as f:
            json.dump(detail, f, separators=(",", ":"))

    print("teams:", len(teams), "full members:", len(full_members),
          "trophies:", len(trophies), "matches:", n_matches)
    print("rankings as-of:", {f: current_tables[f]["month"] for f in FORMATS})


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
