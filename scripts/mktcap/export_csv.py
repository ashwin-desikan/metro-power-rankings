"""Write mktcap_export.csv (MktCap_Data A:D shape) from the mktcap_merged view.

Full universe, blanks for unmapped metros — never a filtered subset
(Session 83 lesson from the Excel era).
"""
import csv, os
from common import select_all, log

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out"); os.makedirs(OUT, exist_ok=True)

def main():
    rows = select_all("/rest/v1/mktcap_merged?select=metro,marketcap,name,source,rank", "rank")
    path = os.path.join(OUT, "mktcap_export.csv")
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["Metro Area", "Valuation", "Company Name", "Source"])
        for r in rows:
            w.writerow([r["metro"] or "", r["marketcap"], r["name"], r["source"]])
    log(f"export: {len(rows)} rows -> {path}")

if __name__ == "__main__":
    main()
