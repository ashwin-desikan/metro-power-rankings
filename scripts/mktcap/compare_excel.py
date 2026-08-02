"""compare_excel.py - the Shadow Saturday parity diff.

Compares out/mktcap_export.csv (pipeline, from Supabase) against the MktCap_Data
sheet of MetroAreas.xlsx (the Excel ritual's import target): row counts by
source, totals, names on one side only, metro mismatches, per-metro count/sum
deltas, and median value drift on common names. Expected acceptable deltas:
~13 symbol-collision rows exported under the plain symbol, and fetch-vs-paste
timing drift on fast movers (larger when the two sides are days apart).

usage: python compare_excel.py [path-to-MetroAreas.xlsx]
"""
import csv, os, statistics, sys
import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
CSV = os.path.join(HERE, "out", "mktcap_export.csv")
WB = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "MetroAreas.xlsx")


def load_csv():
    rows = []
    with open(CSV, encoding="utf-8") as f:
        r = csv.reader(f)
        next(r)
        for metro, val, name, source in r:
            try:
                v = float(val)
            except ValueError:
                continue
            rows.append((metro or "", v, name, source or ""))
    return rows


def load_excel():
    wb = openpyxl.load_workbook(WB, read_only=True, data_only=True)
    ws = wb["MktCap_Data"]
    rows = []
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0 or row is None or len(row) < 3:
            continue
        metro, val, name = row[0], row[1], row[2]
        source = row[3] if len(row) > 3 and row[3] else ""
        try:
            v = float(val)
        except (TypeError, ValueError):
            continue
        if not name:
            continue
        rows.append((str(metro or ""), v, str(name), str(source)))
    wb.close()
    return rows


def by_name(rows):
    d = {}
    for metro, v, name, source in rows:
        d[name] = (metro, v, source)
    return d


def per_metro(rows):
    d = {}
    for metro, v, name, _ in rows:
        if not metro:
            continue
        c, s = d.get(metro, (0, 0.0))
        d[metro] = (c + 1, s + v)
    return d


def main():
    pipe, xl = load_csv(), load_excel()
    print(f"rows: pipeline {len(pipe):,} | excel {len(xl):,}")
    for label, rows in (("pipeline", pipe), ("excel", xl)):
        srcs = {}
        for _, _, _, s in rows:
            srcs[s] = srcs.get(s, 0) + 1
        tot = sum(v for _, v, _, _ in rows)
        print(f"  {label}: total ${tot/1e12:.3f}T | by source {srcs}")

    p, x = by_name(pipe), by_name(xl)
    only_p = sorted(set(p) - set(x))
    only_x = sorted(set(x) - set(p))
    common = set(p) & set(x)
    print(f"\nnames only in pipeline: {len(only_p)}")
    print("  " + ", ".join(only_p[:15]) + (" ..." if len(only_p) > 15 else ""))
    print(f"names only in excel: {len(only_x)}")
    print("  " + ", ".join(only_x[:15]) + (" ..." if len(only_x) > 15 else ""))

    metro_mismatch = [(n, x[n][0], p[n][0]) for n in common if (x[n][0] or "") != (p[n][0] or "")]
    print(f"\nmetro mismatches on common names: {len(metro_mismatch)}")
    for n, xm, pm in metro_mismatch[:10]:
        print(f"  {n}: excel='{xm}' pipeline='{pm}'")

    drifts = [abs(p[n][1] - x[n][1]) / x[n][1] for n in common if x[n][1]]
    if drifts:
        print(f"\nvalue drift on {len(drifts):,} common names: median "
              f"{statistics.median(drifts)*100:.2f}% | >5%: {sum(1 for d in drifts if d > 0.05):,}")

    pm, xm = per_metro(pipe), per_metro(xl)
    deltas = []
    for m in set(pm) | set(xm):
        pc, ps = pm.get(m, (0, 0.0))
        xc, xs = xm.get(m, (0, 0.0))
        deltas.append((abs(ps - xs), m, xc, pc, xs, ps))
    deltas.sort(reverse=True)
    print(f"\nmapped metros: pipeline {len(pm)} | excel {len(xm)}; top sum deltas:")
    for d, m, xc, pc, xs, ps in deltas[:10]:
        pct = (d / xs * 100) if xs else float("inf")
        print(f"  {m}: excel {xc} rows ${xs/1e9:,.0f}B -> pipeline {pc} rows ${ps/1e9:,.0f}B ({pct:.1f}% delta)")


if __name__ == "__main__":
    main()
