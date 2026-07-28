#!/usr/bin/env python3
"""Parse 2013/14-2025/26 European club matches from the api-football uefahub bundles
into eur_competition_matches rows (source='api-football'). Per-fixture (leg1 only).
Writes _api_eur_rows.json.gz next to this script. Team->canonical via football_team crosswalk.
"""
import os, json, gzip, re

SC = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "apifootball", "_scratch"))
COMP = {2: "CL", 3: "EL", 848: "ECL"}

# api team_id -> canonical
ft = json.load(open(os.path.join(SC, "football_team.json"), encoding="utf-8"))
CANON = {r["team_id"]: (r.get("canonical_name") or r.get("lookup_name")) for r in ft}

def round_num(rd):
    r = (rd or "").lower()
    if r == "final": return 1
    if "semi" in r: return 2
    if "quarter" in r: return 3
    if "round of 16" in r: return 4
    if "group stage" in r or "league stage" in r or "league phase" in r: return 5
    if "qualif" in r or "preliminary" in r or ("play" in r and "off" in r and "knockout" not in r): return 6
    return None

def emit(rows, season_year, lid, fixtures):
    se = season_year + 1
    season = f"{season_year}-{str(se)[2:]}"
    comp = COMP[lid]
    kept = 0
    for f in fixtures:
        g = f.get("goals") or {}
        gh, ga = g.get("home"), g.get("away")
        if gh is None or ga is None:
            continue  # not played
        st = (((f.get("fixture") or {}).get("status") or {}).get("short")) or ""
        if st not in ("FT", "AET", "PEN"):
            continue
        th = (f.get("teams") or {}).get("home") or {}
        ta = (f.get("teams") or {}).get("away") or {}
        lg = f.get("league") or {}
        pen = (f.get("score") or {}).get("penalty") or {}
        ph, pa = pen.get("home"), pen.get("away")
        date = ((f.get("fixture") or {}).get("date") or "")[:10] or None
        rows.append({
            "season": season, "season_end": se,
            "competition": comp, "competition_raw": lg.get("name"),
            "round": lg.get("round"), "round_num": round_num(lg.get("round")),
            "home_raw": th.get("name"), "home_cc": None,
            "home_canon": CANON.get(th.get("id")),
            "away_raw": ta.get("name"), "away_cc": None,
            "away_canon": CANON.get(ta.get("id")),
            "leg1": f"{gh}-{ga}", "leg1_home": gh, "leg1_away": ga,
            "leg2": None, "leg2_home": None, "leg2_away": None,
            "pens": (f"{ph}-{pa}" if ph is not None and pa is not None else None),
            "pens_home": ph, "pens_away": pa, "note": None,
            "source": "api-football",
            "match_date": date, "home_id": th.get("id"), "away_id": ta.get("id"),
        })
        kept += 1
    return kept

def main():
    rows = []
    for Y in range(2013, 2025):  # 2013/14 .. 2024/25
        b = json.load(open(os.path.join(SC, f"uefahub{Y}.json"), encoding="utf-8"))
        for k, v in b.get("europe", {}).items():
            lid = int(k)
            if lid not in COMP: continue
            n = emit(rows, Y, lid, v.get("fixtures") or [])
            print(f"{Y} {COMP[lid]}: {n}")
    # 2025/26 from uefa2025 dir
    for lid in (2, 3, 848):
        p = os.path.join(SC, "uefa2025", f"fixtures_{lid}.json")
        if os.path.exists(p):
            resp = json.load(open(p, encoding="utf-8")).get("response") or []
            n = emit(rows, 2025, lid, resp)
            print(f"2025 {COMP[lid]}: {n}")
    unc = sum(1 for r in rows if r["home_canon"] is None or r["away_canon"] is None)
    print(f"TOTAL api rows={len(rows)} rows_with_unmatched_slot={unc}")
    out = os.path.join(os.path.dirname(__file__), "_api_eur_rows.json.gz")
    with gzip.open(out, "wt", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False)
    print("wrote", out)

if __name__ == "__main__":
    main()
