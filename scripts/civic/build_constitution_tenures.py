#!/usr/bin/env python3
"""build_constitution_tenures.py -- how many executives has each constitution
seen, and which leaders outlasted the document that made them?

Writes public/data/constitution-tenures.json from two files already in the repo:
public/data/constitutions.json (the constitutional systems) and
public/data/leaders/<slug>.json (dated officeholder histories, 194 of the 196
live countries). No new data, no network.

THE MEASURE. For each constitutional system, count the executives whose term
BEGAN inside its span. Someone already in office at adoption is not a
transition, they are the inheritance, and they are recorded separately as the
holder at adoption. Both head-of-state and head-of-government counts ship: a
single global rule gets either the United States (president) or Italy (prime
minister) wrong.

🔴 THE TRAP THIS SCRIPT EXISTS TO AVOID. Switzerland's leaders file carries 180
rows of "President of the Swiss Confederation", an office that rotates ANNUALLY,
plus 11 Landammann rows. Counted naively, the calmest polity in Europe becomes
the most executive-churning country on earth, on a constitution standing since
1848. Malaysia's Yang di-Pertuan Agong rotates every five years and behaves the
same way. Rotating and ceremonial offices are therefore classified and EXCLUDED
from the churn count rather than silently included. The self-test asserts it.

CLASSES. Every role label that appears inside a constitutional span must be
classified or the build fails; an unknown label is a data change we want to see,
not something to skip.
  hos      - head of state, counted
  hog      - head of government, counted
  rotating - annually or fixed-term rotating / ceremonial, EXCLUDED
  acting   - acting, interim, caretaker, provisional, transitional, EXCLUDED
  party    - de facto or party offices that are not the formal executive,
             EXCLUDED. Deciding who "really ruled" is not this board's job.

MODES
  --self-test   Offline. Asserts the classifier, the span logic and Switzerland.
  --build       Writes public/data/constitution-tenures.json.
"""
import argparse, json, os, sys, re
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CONST = os.path.join(ROOT, "public", "data", "constitutions.json")
LEADERS = os.path.join(ROOT, "public", "data", "leaders")
OUT = os.path.join(ROOT, "public", "data", "constitution-tenures.json")

# Matched in order. First hit wins, so rotating and acting are tested before the
# generic president/prime-minister keywords they would otherwise fall into.
ROTATING = {
    "President of the Swiss Confederation",      # annual rotation since 1848
    "Landammann of Switzerland",
    "Landammann of the Helvetic Republic",
    "First Landammann of the Helvetic Republic",
    "Statthalter of the Helvetic Republic (acting head)",
    "Monarch (Yang di-Pertuan Agong)",           # Malaysia, rotates every 5 years
}
ACTING_RE = re.compile(r"acting|interim|caretaker|provisional|transitional|in exile", re.I)
PARTY = {
    "General Secretary", "First Secretary", "General Secretary (First Secretary, PCC)",
    "Paramount Leader (PRC)", "Generalissimo", "De facto leader (post-May Coup)",
    "President / De facto dictator", "Supreme Dictator",
}
HOG_EXACT = {
    "Prime Minister", "Federal Chancellor", "Taoiseach", "Premier",
    "Minister of State", "Chief Adviser", "President of Executive Council",
    "Grand Pensionary", "Chairman, Council of People's Commissars",
    "Prime Minister (Military Junta)", "Prime Minister (Military era)",
}
HOS_EXACT = {
    "President", "Monarch", "King", "Emperor", "Empress", "Queen", "Head of State",
    "Federal President", "State President", "Sovereign Prince", "Prince", "Shah",
    "Sultan", "Regent", "Regency", "Supreme Leader", "Chairman", "Sovereign",
    "Provisional President", "Supreme Director", "First Consul",
    "President of the Directory", "Chief Justice / Acting President",
    "President (PRC)", "President (GPRF)", "President (4th Republic)",
    "President (Presidency)", "President (Second Empire)", "Emperor (Second Empire)",
    "President / Prince-President", "President / CMLA", "President / Acting PM",
    "King of Italy", "King of Sardinia", "President (Regent, head of state)",
    "President (Leader of the Nation, head of state)",
    "Chairman of the Supreme Soviet (head of state)",
    "Chairman (Supreme Council for National Reconstruction)",
    "President (President of the Council of State)",
    "President (High Council of State Chairman)",
    "President (Supreme Council Chairman)",
    "President (Sovereignty Council Chairman)",
    "President (Transitional Military Council Chairman)",
    "State Elder",          # Estonia's Riigivanem, head of state and government
    "Head of Interim Government",
}


def classify(role: str) -> str:
    r = (role or "").strip()
    if r in ROTATING:
        return "rotating"
    if r in PARTY:
        return "party"
    if ACTING_RE.search(r):
        return "acting"
    if r in HOG_EXACT:
        return "hog"
    if r in HOS_EXACT:
        return "hos"
    # generic fallbacks, after the specific sets above
    if re.match(r"^prime minister\b", r, re.I):
        return "hog"
    if re.match(r"^(president|head of state)\b", r, re.I):
        return "hos"
    return "unknown"


def is_backbone(row) -> bool:
    """Some leaders files carry a coarse skeleton rather than a real succession:
    the rows say so themselves in `party` ("backbone; year-level dates"). Ecuador
    has Velasco Ibarra running 1968 to 2007, which would have him outlasting six
    constitutions; he left office in 1972. These rows are excluded from the
    outlasted-a-constitution board and flag their country's count as approximate.
    """
    return "backbone" in (row.get("party") or "").lower()


def effective_ends(rows, as_of):
    """End year per row, filling a missing end from the NEXT holder's start.

    A null end does not mean "still in office": most of these files run back
    centuries and an open-ended row from the Han dynasty would otherwise be read
    as running to the present and outlasting ten modern constitutions. Only a row
    with no successor is treated as ongoing. Same class of defect as the one that
    gave Poland's 1791 constitution a 128-year life.
    """
    idx = sorted(range(len(rows)), key=lambda i: (year_of(rows[i].get("start")) or -9999))
    out = {}
    for n, i in enumerate(idx):
        end = year_of(rows[i].get("end"))
        if end is None:
            nxt = next((year_of(rows[j].get("start")) for j in idx[n + 1:]
                        if year_of(rows[j].get("start")) is not None), None)
            end = nxt if nxt is not None else as_of
        out[i] = end
    return out


def year_of(v):
    try:
        return int(str(v)[:4])
    except Exception:
        return None


def build():
    data = json.load(open(CONST, encoding="utf-8"))
    names = {c["slug"]: c["name"] for c in data["countries"]}
    as_of = data["coverage"]["chronologyTo"]

    systems = defaultdict(list)
    for s in data["systems"]:
        if s["status"] == "live":
            systems[s["slug"]].append(s)
    for v in systems.values():
        v.sort(key=lambda s: s["start"])

    unknown = Counter()
    countries, spanners = [], []

    for slug, sys_list in systems.items():
        path = os.path.join(LEADERS, slug + ".json")
        if not os.path.exists(path):
            continue
        rows = json.load(open(path, encoding="utf-8"))

        # a leader whose single tenure covers two or more systems
        ends = effective_ends(rows, as_of)
        for i, r in enumerate(rows):
            s, e = year_of(r.get("start")), ends[i]
            if s is None or is_backbone(r) or classify(r.get("role")) not in ("hos", "hog"):
                continue
            covered = [x for x in sys_list if x["start"] > s and x["start"] <= e]
            if covered:
                spanners.append({
                    "slug": slug, "country": names.get(slug, slug),
                    "name": r.get("name"), "role": r.get("role"),
                    "start": s, "end": year_of(r.get("end")),
                    "constitutionsOutlasted": len(covered),
                    "adoptedDuring": [x["start"] for x in covered],
                })

        current = sys_list[-1]
        lo, hi = current["start"], current["end"] or as_of
        counts, at_adoption, approx = Counter(), [], 0
        for r in rows:
            s = year_of(r.get("start"))
            if s is None:
                continue
            e = ends[rows.index(r)]
            cls = classify(r.get("role"))
            in_span = lo <= s <= hi
            if cls == "unknown":
                # Only an in-span label matters. Shoguns, Electors of Brandenburg
                # and Khans sit centuries before any counted constitution.
                if in_span:
                    unknown[(r.get("role") or "").strip()] += 1
                continue
            if in_span:
                counts[cls] += 1
                if is_backbone(r) and cls in ("hos", "hog"):
                    approx += 1
            elif s < lo <= e and cls in ("hos", "hog"):
                at_adoption.append({"name": r.get("name"), "role": r.get("role")})

        hos, hog = counts["hos"], counts["hog"]
        office = "hos" if hos >= hog else "hog"
        headline = max(hos, hog)
        years = (current["end"] or as_of) - current["start"]
        countries.append({
            "slug": slug, "name": names.get(slug, slug),
            "adopted": current["start"], "years": years,
            "headsOfState": hos, "headsOfGovernment": hog,
            "office": office, "transitions": headline,
            "yearsPerTransition": round(years / headline, 1) if headline else None,
            "excluded": {k: counts[k] for k in ("rotating", "acting", "party") if counts[k]},
            "inOfficeAtAdoption": at_adoption[:2],
            "approximateRows": approx,
            "constitutionsSince1789": len(sys_list),
        })

    if unknown:
        print("ERROR: unclassified role labels inside a constitutional span:")
        for r, n in unknown.most_common():
            print(f"   {n:>4}  {r!r}")
        sys.exit(2)

    # Some files carry the same reign twice under different role labels
    # ("Hassan II" and "King Hassan II"). One person, one row.
    seen, deduped = set(), []
    for sp in sorted(spanners, key=lambda x: (-len(x["name"] or ""), x["name"] or "")):
        key = (sp["slug"], sp["start"], sp["end"], sp["constitutionsOutlasted"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(sp)
    spanners = deduped

    countries.sort(key=lambda c: -c["transitions"])
    spanners.sort(key=lambda s: (-s["constitutionsOutlasted"], s["start"]))
    payload = {
        "built": __import__("datetime").date.today().isoformat(),
        "asOf": as_of,
        "note": ("Executives whose term began while the current constitution stood. "
                 "Rotating, acting and party offices are excluded from the count and "
                 "listed separately; Switzerland's annually rotating presidency is the "
                 "reason that rule exists."),
        "countries": countries,
        "spanners": spanners,
    }
    json.dump(payload, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"wrote {OUT}")
    print(f"  countries: {len(countries)}")
    print(f"  leaders who outlasted a constitution: {len(spanners)}")
    approxn = sum(1 for c in countries if c["approximateRows"])
    print(f"  countries whose count includes coarse 'backbone' rows: {approxn}")
    top = countries[:5]
    for c in top:
        print(f"    {c['name']:<16} {c['transitions']:>3} under the {c['adopted']} constitution")
    ch = next((c for c in countries if c["slug"] == "switzerland"), None)
    if ch:
        rank = countries.index(ch) + 1
        print(f"  Switzerland: {ch['transitions']} counted, {ch['excluded']} excluded, rank {rank}")


def self_test():
    assert classify("President of the Swiss Confederation") == "rotating"
    assert classify("Monarch (Yang di-Pertuan Agong)") == "rotating"
    assert classify("Acting President") == "acting"
    assert classify("Caretaker Prime Minister") == "acting"
    assert classify("Prime Minister (in exile)") == "acting"
    assert classify("General Secretary") == "party"
    assert classify("Prime Minister") == "hog"
    assert classify("Taoiseach") == "hog"
    assert classify("President") == "hos"
    assert classify("Monarch") == "hos"
    assert classify("King of Sardinia") == "hos"
    assert classify("Nonsense Office") == "unknown"
    # ordering: a rotating office must not be caught by the president fallback
    assert classify("President of the Swiss Confederation") != "hos"
    assert is_backbone({"party": "backbone; year-level dates"})
    assert not is_backbone({"party": "Labour"}) and not is_backbone({})
    assert year_of("1958-10-04") == 1958 and year_of(None) is None

    # An open-ended ancient row must end at its successor, not at the present.
    rows = [{"start": "-0003-01-01", "end": None}, {"start": "0006-01-01", "end": None},
            {"start": "2020-01-01", "end": None}]
    ends = effective_ends(rows, 2025)
    assert ends[0] == 6, ends
    assert ends[2] == 2025, ends
    print("self-test OK")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--build", action="store_true")
    a = ap.parse_args()
    if a.self_test:
        self_test()
    elif a.build:
        build()
    else:
        ap.print_help()
