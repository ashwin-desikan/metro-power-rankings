#!/usr/bin/env python3
"""
Build public/data/champions.json from ZoneZero_Champions.xlsx (project root).

SOURCE OF TRUTH for "current champions" badges + the /sports/champions board.
One row per reigning champion. Columns (2026-06 schema):
  Sport, Competiton[sic], Team, Date Awarded, International, Continental,
  Domestic, Next Awarded Date, My Tier Rank
Exactly one of International/Continental/Domestic holds the scope label.
Date Awarded / Next Awarded Date are real dates; we emit both an ISO string and
the year (year keeps the ChampionBadge + older consumers working).

Run after editing the sheet:  python scripts/build-champions-data.py
"""
import os, json, datetime, openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "ZoneZero_Champions.xlsx")
OUT = os.path.join(ROOT, "public", "data", "champions.json")

def to_iso(v):
    if isinstance(v, (datetime.datetime, datetime.date)):
        return (v.date() if isinstance(v, datetime.datetime) else v).isoformat()
    if isinstance(v, str) and v.strip():
        for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y"):
            try: return datetime.datetime.strptime(v.strip(), fmt).date().isoformat()
            except ValueError: pass
    return None

def to_year(v):
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.year
    iso = to_iso(v)
    if iso: return int(iso[:4])
    try: return int(v)
    except (TypeError, ValueError): return None

def main():
    wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
    ws = wb["Sheet1"]
    rows = list(ws.iter_rows(values_only=True))
    hdr = [str(c).strip() if c is not None else "" for c in rows[0]]
    idx = {h.lower(): i for i, h in enumerate(hdr)}
    def col(*names):
        for n in names:
            if n in idx: return idx[n]
        return None
    iSport = col("sport"); iComp = col("competiton", "competition"); iTeam = col("team")
    iDate = col("date awarded", "date", "year")
    iIntl = col("international"); iCont = col("continental"); iDom = col("domestic")
    iNext = col("next awarded date", "next awarded", "nextawarded", "next")
    iTier = col("my tier rank", "tier", "my tier", "rank")
    out = []
    for r in rows[1:]:
        def g(i): return r[i] if i is not None and i < len(r) else None
        team, comp = g(iTeam), g(iComp)
        if not team or not comp:  # badge system is team-keyed; teamless rows (e.g. individual golf majors) are skipped
            continue
        intl, cont, dom = g(iIntl), g(iCont), g(iDom)
        scope_type = "International" if intl else "Continental" if cont else "Domestic" if dom else None
        out.append({
            "sport": str(g(iSport) or "").strip(),
            "competition": str(comp).strip(),
            "team": str(team).strip(),
            "year": to_year(g(iDate)),
            "dateAwarded": to_iso(g(iDate)),
            "scope": str(intl or cont or dom or "").strip(),
            "scopeType": scope_type,
            "nextAwarded": to_year(g(iNext)),
            "nextAwardedDate": to_iso(g(iNext)),
            "tier": int(g(iTier)) if g(iTier) is not None else None,
        })
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    import collections
    bysport = collections.Counter(x["sport"] for x in out)
    tiers = collections.Counter(x["tier"] for x in out)
    print(f"champions:{len(out)} tiers:{dict(sorted(tiers.items(), key=lambda x:(x[0] is None,x[0])))}")
    print(f"with dateAwarded:{sum(1 for x in out if x['dateAwarded'])} with nextDate:{sum(1 for x in out if x['nextAwardedDate'])}")

if __name__ == "__main__": main()
