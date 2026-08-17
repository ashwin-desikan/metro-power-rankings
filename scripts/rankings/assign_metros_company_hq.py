"""Assign metros to company_hq, the single-value HQ layer, from the same authority.

company_hq_spans covers the 213 companies that reach a top 100 and carries dated
eras. Every OTHER company — the ones Fortune gave an HQ for directly — sits in
company_hq with one address and no metro. The rollup needs both or it reports the
biggest companies and no one else.

Same authority (MetroAreas.xlsx Municipality sheet), same refusal: an ambiguous or
absent municipality stays NULL and is reported, never guessed.

  python assign_metros_company_hq.py            # report only
  python assign_metros_company_hq.py --write
"""
import argparse, csv, json, os, sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import OUT, log, rest, select_all  # noqa: E402
from assign_metros import (ALIAS, ALIAS_STATE, NO_METRO, norm,  # noqa: E402
                           norm_state)

HERE = os.path.dirname(os.path.abspath(__file__))
REPORT = os.path.join(HERE, "curation", "company_hq_metro_assignment.csv")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()

    L = json.load(open(os.path.join(OUT, "municipality_lookup.json"), encoding="utf-8"))
    exact = {tuple(k.split("|", 1)): v for k, v in L["exact"].items()}
    by_city = L["by_city"]
    log(f"authority: {L['rows_kept']} US rows, {len(exact)} (municipality, state) pairs")

    rows = select_all("/rest/v1/company_hq?select=company_key,company,hq_city,"
                      "hq_state,hq_country,metro", "company_key")
    todo = [r for r in rows if (r.get("hq_city") or "").strip()]
    log(f"{len(rows)} companies, {len(todo)} carrying an HQ city")

    places = defaultdict(list)
    for r in todo:
        places[(r["hq_city"].strip(), (r.get("hq_state") or "").strip())].append(r)

    resolved, unresolved, out = {}, [], []
    for (city, state), rs in sorted(places.items(), key=lambda kv: -len(kv[1])):
        c, st = norm(city), norm_state(state)
        if (c, st) in NO_METRO:
            out.append({"city": city, "state": state, "companies": len(rs),
                        "metro": "", "how": "RULED: no metro area"})
            continue
        c = ALIAS_STATE.get((c, st), ALIAS.get(c, c))
        metro = how = None
        if (c, st) in exact:
            metro, how = exact[(c, st)], "municipality + state"
        elif not st and c in by_city and len(by_city[c]) == 1:
            # No state at all: only accept a municipality name unique nationwide.
            metro, how = by_city[c][0], "municipality only, unique nationwide"
        elif c in by_city and len(by_city[c]) == 1:
            metro, how = by_city[c][0], "municipality only, unambiguous"
        elif c in by_city:
            how = f"AMBIGUOUS across {len(by_city[c])} metros"
        else:
            how = "not in the Municipality sheet"
        out.append({"city": city, "state": state, "companies": len(rs),
                    "metro": metro or "", "how": how})
        if metro:
            resolved[(city, state)] = metro
        else:
            unresolved.append((city, state, len(rs), how))

    with open(REPORT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["city", "state", "companies", "metro", "how"])
        w.writeheader(); w.writerows(out)

    hit = sum(len(places[p]) for p in resolved)
    log(f"resolved {len(resolved)}/{len(places)} places, {hit}/{len(todo)} companies "
        f"({hit/len(todo)*100:.1f}%)")
    log(f"unresolved places: {len(unresolved)}")
    for c, s, n, why in sorted(unresolved, key=lambda u: -u[2])[:12]:
        log(f"   {c}, {s} ({n} companies) — {why[:55]}")
    log(f"-> {REPORT}")

    if not a.write:
        log("dry run (no --write); nothing sent to Supabase")
        return

    from urllib.parse import quote
    hdr = {"Prefer": "return=minimal"}
    n = 0
    for (city, state), metro in sorted(resolved.items()):
        q = f"hq_city=eq.{quote(city, safe='')}"
        if state:
            q += f"&hq_state=eq.{quote(state, safe='')}"
        else:
            q += "&hq_state=is.null"
        rest("PATCH", f"/rest/v1/company_hq?{q}", body={"metro": metro}, headers=hdr)
        n += len(places[(city, state)])
    log(f"metro set on {n} companies across {len(resolved)} places")


if __name__ == "__main__":
    main()
