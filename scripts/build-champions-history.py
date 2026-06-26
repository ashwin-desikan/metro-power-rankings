"""Build public/data/champions-history.json from Champions_History.xlsx.

Source of truth: ~/OneDrive/Excel Files/Champions_History.xlsx (the all-time
champions ledger; sheet "Champions", 16 cols incl. era name, canonical team,
era-correct metro + metro slug, and Date in YYYY-MM-DD where known).

Emits one record per champion row (raw passthrough + a stable competition
slug). Link resolution (team page, league hub) happens at render time in
lib/championsHistory.ts, reusing lib/championsHub. Run on Windows; the workbook
is cloud-only and unreadable from the sandbox.

    python scripts/build-champions-history.py
"""
import json, os, re
from openpyxl import load_workbook

SRC = os.path.expanduser("~/OneDrive/Excel Files/Champions_History.xlsx")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "data", "champions-history.json")

def slugify(s: str) -> str:
    s = s.lower().replace("&", "and")
    s = re.sub(r"[‘’']", "", s)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s

def cell(v):
    return "" if v is None else (v if isinstance(v, (int, float)) else str(v).strip())

def main():
    wb = load_workbook(SRC, read_only=True, data_only=True)
    ws = wb["Champions"]
    rows = list(ws.iter_rows(values_only=True))
    hdr = [str(c).strip() if c is not None else "" for c in rows[0]]
    ix = {n: hdr.index(n) for n in [
        "Sport", "Competition", "Era Name", "Season", "Year", "Champion",
        "Champion (Canonical)", "Metro", "Metro Slug", "Date", "Scope Type"]}
    out = []
    for r in rows[1:]:
        comp = cell(r[ix["Competition"]])
        if not comp:
            continue
        try:
            yr = int(float(r[ix["Year"]]))
        except (TypeError, ValueError):
            yr = None
        d = r[ix["Date"]]
        date = d.strftime("%Y-%m-%d") if hasattr(d, "strftime") else (str(d).strip() if d else "")
        out.append({
            "sport": cell(r[ix["Sport"]]),
            "competition": comp,
            "compSlug": slugify(comp),
            "eraName": cell(r[ix["Era Name"]]),
            "season": cell(r[ix["Season"]]),
            "year": yr,
            "champion": cell(r[ix["Champion"]]),
            "canonical": cell(r[ix["Champion (Canonical)"]]),
            "metro": cell(r[ix["Metro"]]),
            "metroSlug": cell(r[ix["Metro Slug"]]),
            "date": date,
            "scopeType": cell(r[ix["Scope Type"]]),
        })
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    dated = sum(1 for x in out if x["date"])
    comps = len({x["competition"] for x in out})
    print(f"champions-history.json: {len(out)} rows, {comps} competitions, {dated} dated")

if __name__ == "__main__":
    main()
