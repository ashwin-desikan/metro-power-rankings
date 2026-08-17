"""Extract the Municipality sheet from MetroAreas.xlsx into a fast city->metro map.

🔴 THIS IS THE DEFINITIVE SOURCE and it should have been the first thing consulted.
The workbook is ground truth on this project. An earlier version of the metro
assignment used `mktcap_geo` instead — a table derived from companies listed TODAY
— which knows about 1,111 cities and had never needed the mid-century corporate
suburbs this board is full of. It left 50 places unresolved and produced a sheet
of questions the workbook already answers.

The Municipality sheet carries 133,584 rows: Country, Municipality, County,
State/Region (ISO 3166-2), Population, Metro Area. Reading it once and caching the
result keeps the 35MB workbook out of every later run.

  python build_municipality_lookup.py          # -> out/municipality_lookup.json
  python build_municipality_lookup.py --all    # every country, not just the US
"""
import argparse, json, os, sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import OUT, log  # noqa: E402

XLSX = r"C:\Users\ashwi\OneDrive\Excel Files\MetroAreas.xlsx"
LOOKUP = os.path.join(OUT, "municipality_lookup.json")
SHEET = "Municipality"


def norm(s):
    return " ".join(str(s or "").lower().replace(".", "").replace("'", "").split())


# The sheet stores Census-style names: "Chicago city", "Quincy city", "Melrose
# township", "balance of Gilmer township". A lookup keyed on those never matches
# "Chicago", which is why the first attempt resolved 2 of 131 places. The Type
# column names the suffix to remove, so this strips precisely rather than guessing.
_TYPES = ("city", "town", "village", "township", "borough", "cdp", "municipality",
          "consolidated government", "metro government", "unified government",
          "county", "parish", "plantation", "gore", "grant", "location",
          "urban county", "charter township", "reservation")


def strip_type(name, type_hint=""):
    """'Chicago city' -> 'chicago'. Returns the bare municipality name."""
    n = norm(name)
    if n.startswith("balance of "):
        n = n[len("balance of "):]
    t = norm(type_hint)
    if t and n.endswith(" " + t):
        return n[: -(len(t) + 1)].strip()
    for t in sorted(_TYPES, key=len, reverse=True):
        if n.endswith(" " + t):
            return n[: -(len(t) + 1)].strip()
    return n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true")
    a = ap.parse_args()

    import openpyxl
    if not os.path.exists(XLSX):
        sys.exit(f"FATAL: {XLSX} not found")
    wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
    ws = wb[SHEET]

    rows = ws.iter_rows(values_only=True)
    header = [str(h or "").strip() for h in next(rows)]
    idx = {h: i for i, h in enumerate(header)}
    need = ["Country", "Municipality", "State/Region (ISO 3166-2)", "Metro Area"]
    for n in need:
        if n not in idx:
            sys.exit(f"FATAL: column {n!r} missing. Header is {header}")
    ci, mi, si, ai = (idx["Country"], idx["Municipality"],
                      idx["State/Region (ISO 3166-2)"], idx["Metro Area"])
    pi = idx.get("Population")

    # (municipality, state) -> metro, and municipality -> {metro: total population}.
    # Population breaks a same-name tie the honest way: Springfield, Massachusetts
    # beats Springfield, Ohio only where no state is supplied, and the ambiguity is
    # recorded either way so a caller can refuse rather than take the biggest.
    exact, by_city = {}, defaultdict(Counter)
    n = kept = 0
    for r in rows:
        n += 1
        country = str(r[ci] or "").strip()
        if not a.all and country != "United States":
            continue
        muni, state, metro = r[mi], r[si], r[ai]
        if not muni or not metro:
            continue
        m = str(metro).strip()
        if not m:
            continue
        ti = idx.get("Type")
        bare = strip_type(muni, r[ti] if ti is not None else "")
        try:
            pop = int(float(r[pi])) if pi is not None and r[pi] not in (None, "") else 0
        except (TypeError, ValueError):
            pop = 0
        # Index the bare name AND the raw one, so "Chicago" and "Chicago city"
        # both resolve. Where two entities share a bare name in one state
        # ("Peoria city" and "Peoria township"), the more populous wins, because
        # a company HQ is in the incorporated place, not the surrounding township.
        for k in {(bare, norm(state)), (norm(muni), norm(state))}:
            prev = exact.get(k)
            if prev is None or pop > prev[1]:
                exact[k] = (m, pop)
        by_city[bare][m] += max(pop, 1)
        kept += 1
    wb.close()

    out = {
        "source": XLSX, "sheet": SHEET, "scope": "all" if a.all else "United States",
        "rows_scanned": n, "rows_kept": kept,
        "exact": {f"{c}|{s}": v[0] for (c, s), v in exact.items()},
        "by_city": {c: [m for m, _ in cnt.most_common()] for c, cnt in by_city.items()},
    }
    os.makedirs(OUT, exist_ok=True)
    with open(LOOKUP, "w", encoding="utf-8") as f:
        json.dump(out, f)

    amb = sum(1 for v in out["by_city"].values() if len(v) > 1)
    log(f"scanned {n} rows, kept {kept} ({out['scope']})")
    log(f"{len(exact)} distinct (municipality, state) pairs")
    log(f"{len(by_city)} distinct municipality names, {amb} of them ambiguous "
        f"across metros")
    log(f"-> {LOOKUP}")


if __name__ == "__main__":
    main()
