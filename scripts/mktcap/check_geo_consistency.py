#!/usr/bin/env python3
"""check_geo_consistency.py -- find mktcap_geo rows whose stored metro is
contradicted BY THE REST OF mktcap_geo. No model, no API key, no network beyond
the Supabase read, and no writes ever.

Why this exists: the 2026-09-22 Jev audit found 15 confident disagreements in
5,531 rows. Re-reading them, most did not need a model at all. Three (Unimicron,
Nanya, Chroma ATE) were Taoyuan filed under Kaohsiung while three OTHER Taoyuan
rows were filed under Taipei -- the dataset contradicted itself. Five more
(RGA, Ionis, TD Synnex, QXO, Somnigroup) carried a `state` that belongs to a
different metro than the one stored. Both are decidable from the table alone,
for free, on every row, every run. Jev's real contribution was the cases that
are NOT internally decidable, like HPE (Spring TX under Dallas, both Texas).

Modes: --self-test  --report [--strict]
--strict exits 1 when any CONTRADICTION is found; the default always exits 0 so
this can run in a pipeline without becoming a new way to block unrelated work.

Every finding is a QUESTION for a human. This script proposes nothing and
writes nothing; mktcap_geo is curated data.
"""
import argparse, os, sys
from collections import Counter, defaultdict

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Tuning. A metro needs at least MIN_ROWS rows before its majority means
# anything, and an outlier must be rarer than OUTLIER_SHARE of them. These
# exist because plenty of US metros genuinely straddle a state line -- New
# York is NY/NJ/CT, Kansas City is KS/MO, Cincinnati is OH/KY -- and a naive
# "not the majority state" rule would flag every legitimate row on the minor
# side. Measured against the real table 2026-09-22.
MIN_ROWS = 5
OUTLIER_SHARE = 0.10


def norm(s):
    if s is None:
        return ""
    return " ".join(str(s).split()).strip().lower()


def city_conflicts(rows):
    """CONTRADICTION: the same (city, state, country) is stored under more than
    one metro. This is the Taoyuan case and needs no outside knowledge to state
    -- the table cannot be right both ways.

    STATE IS IN THE KEY ON PURPOSE. Keying on (city, country) alone reported 36
    'contradictions' against the real table on 2026-09-22 and most were correct
    data: Birmingham AL and Birmingham MI, Arlington VA and Arlington TX,
    Burlington MA and Burlington NJ, Addison TX and Addison IL are genuinely
    different places that share a name. `state` is populated on 99.8% of US
    rows, which is precisely where same-name cities cluster, so it does almost
    all of the disambiguating for free. Rows with no state (most of the
    non-US table) fall back to (city, country), which is what makes Taoyuan
    still resolve.

    City is matched case- and whitespace-insensitively, but 'Taoyuan' and
    'Taoyuan City' do NOT merge -- deciding those are the same place is a
    judgment this script does not make. near_miss_cities() reports them instead.

    Returns (city, state, country, {metro: [symbols]}) sorted by country."""
    by_key = defaultdict(lambda: defaultdict(list))
    for r in rows:
        city = norm(r["city"])
        if not city:
            continue
        by_key[(city, norm(r.get("state")), norm(r["country"]))][r["metro"]].append(r["symbol"])
    out = []
    for (city, state, country), metros in by_key.items():
        if len(metros) > 1:
            out.append((city, state, country, dict(metros)))
    return sorted(out, key=lambda t: (t[2], t[0]))


def same_name_different_state(rows):
    """INFORMATIONAL: one city name under several states in one country. Not a
    fault -- it is the reason state belongs in the conflict key -- but it is the
    population where a mis-keyed row hides, so it is worth being able to see."""
    by_name = defaultdict(lambda: defaultdict(set))
    for r in rows:
        city, state = norm(r["city"]), norm(r.get("state"))
        if city and state:
            by_name[(city, norm(r["country"]))][state].add(r["metro"])
    return sorted((c, co, {s: sorted(m) for s, m in st.items()})
                  for (c, co), st in by_name.items() if len(st) > 1)


# US state adjacency. Hand-written, and the self-test asserts it is symmetric,
# which is the property a typo in it would break.
#
# It is here because the share-threshold rule alone was unusable: against the
# real table on 2026-09-22 it flagged 41 rows, and the large majority were
# CORRECT -- 20 Connecticut rows under New York (Stamford, Greenwich, Norwalk
# genuinely are the New York metro), New Hampshire under Boston, Wisconsin
# under Chicago, South Carolina under Charlotte, Delaware under Philadelphia.
# Every one of those is a real multi-state MSA, and every one is a BORDERING
# state. The errors were not: Missouri under Detroit, Kentucky under Atlanta,
# Florida under Minneapolis, California under Houston. Adjacency is the line
# between them.
_ADJ = {
    "Alabama": "Florida Georgia Mississippi Tennessee",
    "Alaska": "",
    "Arizona": "California Colorado Nevada New Mexico Utah",
    "Arkansas": "Louisiana Mississippi Missouri Oklahoma Tennessee Texas",
    "California": "Arizona Nevada Oregon",
    "Colorado": "Arizona Kansas Nebraska New Mexico Oklahoma Utah Wyoming",
    "Connecticut": "Massachusetts New York Rhode Island",
    "Delaware": "Maryland New Jersey Pennsylvania",
    "District of Columbia": "Maryland Virginia",
    "Florida": "Alabama Georgia",
    "Georgia": "Alabama Florida North Carolina South Carolina Tennessee",
    "Hawaii": "",
    "Idaho": "Montana Nevada Oregon Utah Washington Wyoming",
    "Illinois": "Indiana Iowa Kentucky Missouri Wisconsin",
    "Indiana": "Illinois Kentucky Michigan Ohio",
    "Iowa": "Illinois Minnesota Missouri Nebraska South Dakota Wisconsin",
    "Kansas": "Colorado Missouri Nebraska Oklahoma",
    "Kentucky": "Illinois Indiana Missouri Ohio Tennessee Virginia West Virginia",
    "Louisiana": "Arkansas Mississippi Texas",
    "Maine": "New Hampshire",
    "Maryland": "Delaware Pennsylvania Virginia West Virginia District of Columbia",
    "Massachusetts": "Connecticut New Hampshire New York Rhode Island Vermont",
    "Michigan": "Indiana Ohio Wisconsin",
    "Minnesota": "Iowa North Dakota South Dakota Wisconsin",
    "Mississippi": "Alabama Arkansas Louisiana Tennessee",
    "Missouri": "Arkansas Illinois Iowa Kansas Kentucky Nebraska Oklahoma Tennessee",
    "Montana": "Idaho North Dakota South Dakota Wyoming",
    "Nebraska": "Colorado Iowa Kansas Missouri South Dakota Wyoming",
    "Nevada": "Arizona California Idaho Oregon Utah",
    "New Hampshire": "Maine Massachusetts Vermont",
    "New Jersey": "Delaware New York Pennsylvania",
    "New Mexico": "Arizona Colorado Oklahoma Texas Utah",
    "New York": "Connecticut Massachusetts New Jersey Pennsylvania Vermont",
    "North Carolina": "Georgia South Carolina Tennessee Virginia",
    "North Dakota": "Minnesota Montana South Dakota",
    "Ohio": "Indiana Kentucky Michigan Pennsylvania West Virginia",
    "Oklahoma": "Arkansas Colorado Kansas Missouri New Mexico Texas",
    "Oregon": "California Idaho Nevada Washington",
    "Pennsylvania": "Delaware Maryland New Jersey New York Ohio West Virginia",
    "Rhode Island": "Connecticut Massachusetts",
    "South Carolina": "Georgia North Carolina",
    "South Dakota": "Iowa Minnesota Montana Nebraska North Dakota Wyoming",
    "Tennessee": "Alabama Arkansas Georgia Kentucky Mississippi Missouri North Carolina Virginia",
    "Texas": "Arkansas Louisiana New Mexico Oklahoma",
    "Utah": "Arizona Colorado Idaho Nevada New Mexico Wyoming",
    "Vermont": "Massachusetts New Hampshire New York",
    "Virginia": "Kentucky Maryland North Carolina Tennessee West Virginia District of Columbia",
    "Washington": "Idaho Oregon",
    "West Virginia": "Kentucky Maryland Ohio Pennsylvania Virginia",
    "Wisconsin": "Illinois Iowa Michigan Minnesota",
    "Wyoming": "Colorado Idaho Montana Nebraska South Dakota Utah",
}
_STATES = set(_ADJ)


def adjacency():
    """{state: set(bordering states)}. Built from _ADJ, which lists multi-word
    neighbours run together; split on the known state names rather than on
    whitespace so 'New Mexico' does not become 'New' and 'Mexico'."""
    out = {}
    for state, blob in _ADJ.items():
        got, rest = set(), blob
        for name in sorted(_STATES, key=len, reverse=True):
            if name in rest:
                got.add(name)
                rest = rest.replace(name, " ")
        out[state] = got
    return out


def majority_map(rows, field):
    """For each metro, the distribution of `field` across its rows."""
    dist = defaultdict(Counter)
    for r in rows:
        v = (r.get(field) or "").strip()
        if v:
            dist[r["metro"]][v] += 1
    return dist


def field_outliers(rows, field, min_rows=MIN_ROWS, outlier_share=OUTLIER_SHARE,
                   require_non_adjacent=False):
    """NEEDS REVIEW: the row's `field` is a rare outlier among the rows of its
    own metro. Catches RGA (Missouri under Detroit) without knowing any
    geography, while leaving genuine multi-state metros alone.

    require_non_adjacent drops any US row whose state BORDERS the metro's
    majority state, which is what separates a real multi-state MSA from a
    mis-keyed row. It only applies when both names are known US states; a row
    naming anything else (a Japanese prefecture, a null, a typo) is kept, so
    the filter can never silently swallow a case it does not understand.

    Returns (row, value, count, total, majority_value) tuples."""
    dist = majority_map(rows, field)
    adj = adjacency() if require_non_adjacent else {}
    out = []
    for r in rows:
        v = (r.get(field) or "").strip()
        if not v:
            continue
        c = dist[r["metro"]]
        total = sum(c.values())
        if total < min_rows:
            continue
        if c[v] / total >= outlier_share:
            continue
        majority = c.most_common(1)[0][0]
        if v == majority:
            continue
        if require_non_adjacent and v in _STATES and majority in _STATES \
                and v in adj.get(majority, set()):
            continue
        out.append((r, v, c[v], total, majority))
    return sorted(out, key=lambda t: (t[0]["country"], t[0]["metro"], t[0]["symbol"]))


def near_miss_cities(rows):
    """Cities in the same country whose names differ only by a trailing word
    such as 'City'. Reported, never merged: 'Taoyuan' vs 'Taoyuan City' is a
    real pair in this table and a reader should see it, but deciding they are
    the same place is a judgment the script does not make."""
    by_country = defaultdict(set)
    for r in rows:
        if r["city"]:
            by_country[norm(r["country"])].add(norm(r["city"]))
    pairs = []
    for country, cities in by_country.items():
        for c in cities:
            for suffix in (" city", " shi", " metropolitan city"):
                if c.endswith(suffix):
                    base = c[: -len(suffix)].strip()
                    if base and base in cities:
                        pairs.append((country, base, c))
    return sorted(set(pairs))


def state_format_anomalies(rows):
    """US rows whose `state` is not a canonical full state name.

    Two different faults share this shape, and the report separates them by
    count because the fix differs:

    - A one-off ABBREVIATION ('CA' among 2,476 rows saying 'California') is a
      typo. Seven of these existed on 2026-09-22.
    - A value used on MANY rows is not a typo, it is the column being used for
      something else. 'DC' appeared on 36 rows and is the clear case: Boeing
      and AvalonBay in Arlington and Booz Allen in McLean are VIRGINIA, and
      Constellation in Baltimore is MARYLAND, yet all carry state='DC'. The
      column is holding a metro shorthand there, not a state, so `state` is
      not trustworthy for the Washington-Baltimore metro and anything keyed
      on it will mis-handle those rows.

    Returns {value: [rows]} for US rows only, since _STATES is a US list."""
    out = defaultdict(list)
    for r in rows:
        if norm(r.get("country")) != "united states":
            continue
        v = (r.get("state") or "").strip()
        if v and v not in _STATES:
            out[v].append(r)
    return dict(out)


def fetch_rows():
    import common
    rows = common.select_all(
        "/rest/v1/mktcap_geo?select=symbol,name,metro,city,state,country,mapped_by",
        order="symbol")
    return [r for r in rows
            if r.get("metro") and (r.get("city") or "").strip()
            and (r.get("country") or "").strip()]


def cmd_report(args):
    rows = fetch_rows()
    print(f"mktcap_geo: {len(rows)} labelled rows\n")

    conflicts = city_conflicts(rows)
    print("=" * 72)
    print(f"CONTRADICTIONS: one (city, state, country) under several metros -- {len(conflicts)}")
    print("=" * 72)
    if not conflicts:
        print("  (none)")
    for city, state, country, metros in conflicts:
        total = sum(len(v) for v in metros.values())
        where = f"{city.title()}, {state.title()}, {country.title()}" if state \
            else f"{city.title()}, {country.title()}"
        print(f"\n  {where}  ({total} rows, {len(metros)} metros)")
        for metro, syms in sorted(metros.items(), key=lambda kv: -len(kv[1])):
            print(f"      {metro:28} {len(syms):3} row(s): {', '.join(sorted(syms)[:6])}"
                  + (" ..." if len(syms) > 6 else ""))

    for field, label in (("state", "STATE"), ("country", "COUNTRY")):
        out = field_outliers(rows, field, require_non_adjacent=(field == "state"))
        print()
        print("=" * 72)
        print(f"{label} OUTLIERS: row's {field} is rare within its own metro -- {len(out)}")
        if field == "state":
            print("US rows whose state BORDERS the metro's majority state are excluded:")
            print("those are real multi-state MSAs (Stamford CT is New York).")
        if field == "country":
            print("NOTE: country is the LEGAL DOMICILE, not the HQ country, so most of")
            print("these are legitimate (Seagate is Cupertino/Ireland). Expect noise here.")
        print("=" * 72)
        if not out:
            print("  (none)")
        for r, v, c, total, majority in out:
            print(f"  {r['symbol']:14} {(r.get('name') or '')[:26]:26} {r['city']}, {v}")
            print(f"      metro={r['metro']} -- only {c} of its {total} rows are {v}; "
                  f"most are {majority}")

    nm = near_miss_cities(rows)
    print()
    print("=" * 72)
    print(f"NEAR-MISS CITY NAMES (reported, never merged) -- {len(nm)}")
    print("=" * 72)
    if not nm:
        print("  (none)")
    for country, base, variant in nm:
        metros = sorted({r["metro"] for r in rows
                         if norm(r["country"]) == country and norm(r["city"]) in (base, variant)})
        flag = "  <-- and they disagree on the metro" if len(metros) > 1 else ""
        print(f"  {country.title()}: '{base}' and '{variant}' -> {', '.join(metros)}{flag}")

    fmt = state_format_anomalies(rows)
    print()
    print("=" * 72)
    print(f"NON-CANONICAL US STATE VALUES -- {len(fmt)} distinct, "
          f"{sum(len(v) for v in fmt.values())} rows")
    print("A value on ONE row is a typo. A value on MANY rows means the column")
    print("is being used for something other than the state.")
    print("=" * 72)
    if not fmt:
        print("  (none)")
    for v, rs in sorted(fmt.items(), key=lambda kv: -len(kv[1])):
        kind = "COLUMN MISUSE" if len(rs) >= 5 else "typo"
        print(f"\n  {v!r} on {len(rs)} row(s) -- {kind}")
        for r in sorted(rs, key=lambda r: r["symbol"])[:6]:
            print(f"      {r['symbol']:16} {r['city']}, metro={r['metro']}")
        if len(rs) > 6:
            print(f"      ... and {len(rs) - 6} more")

    same = same_name_different_state(rows)
    print()
    print("=" * 72)
    print(f"SAME CITY NAME, DIFFERENT STATES -- {len(same)} (informational, not faults)")
    print("These are why state is in the conflict key. Listed so a mis-keyed row")
    print("in one of them is findable by eye.")
    print("=" * 72)
    for city, country, states in same:
        parts = "; ".join(f"{s.title()} -> {', '.join(m)}" for s, m in sorted(states.items()))
        print(f"  {city.title()} ({country.title()}): {parts}")

    print(f"\nSummary: {len(conflicts)} contradictions, "
          f"{len(field_outliers(rows, 'state', require_non_adjacent=True))} state outliers, "
          f"{len(nm)} near-miss city names, {len(same)} shared city names across states.")
    print("Nothing was written. Every line above is a question, not a correction.")
    if args.strict and conflicts:
        sys.exit(1)


def cmd_self_test():
    fail = []
    def check(label, cond):
        print(("PASS " if cond else "FAIL ") + label)
        if not cond:
            fail.append(label)

    # --- city_conflicts: the real Taoyuan shape ---------------------------
    taoyuan = [
        {"symbol": "2618.TW", "city": "Taoyuan", "state": None, "country": "Taiwan", "metro": "Taipei"},
        {"symbol": "1519.TW", "city": "Taoyuan", "state": None, "country": "Taiwan", "metro": "Taipei"},
        {"symbol": "3037.TW", "city": "Taoyuan", "state": None, "country": "Taiwan", "metro": "Kaohsiung"},
    ]
    c = city_conflicts(taoyuan)
    check("conflict: Taoyuan under two metros is found", len(c) == 1)
    check("conflict: reports both metros with their symbols",
          c and set(c[0][3]) == {"Taipei", "Kaohsiung"} and c[0][3]["Kaohsiung"] == ["3037.TW"])

    agreed = [dict(r, metro="Taipei") for r in taoyuan]
    check("conflict: none when every row agrees", city_conflicts(agreed) == [])

    # case/whitespace insensitivity, but NOT 'City' suffix merging
    casey = [
        {"symbol": "A", "city": "  taoyuan ", "state": None, "country": "taiwan", "metro": "Taipei"},
        {"symbol": "B", "city": "Taoyuan", "state": None, "country": "Taiwan", "metro": "Kaohsiung"},
    ]
    check("conflict: case and whitespace do not hide a conflict",
          len(city_conflicts(casey)) == 1)
    suffixed = [
        {"symbol": "A", "city": "Taoyuan", "state": None, "country": "Taiwan", "metro": "Taipei"},
        {"symbol": "B", "city": "Taoyuan City", "state": None, "country": "Taiwan", "metro": "Kaohsiung"},
    ]
    check("conflict: 'Taoyuan City' is NOT silently merged with 'Taoyuan'",
          city_conflicts(suffixed) == [])
    check("near-miss: but it IS reported as a near miss",
          ("taiwan", "taoyuan", "taoyuan city") in near_miss_cities(suffixed))

    # same city name in DIFFERENT countries is not a conflict
    cross = [
        {"symbol": "A", "city": "Cambridge", "state": None, "country": "United Kingdom", "metro": "Cambridge"},
        {"symbol": "B", "city": "Cambridge", "state": "Massachusetts", "country": "United States", "metro": "Boston"},
    ]
    check("conflict: same city name in two countries is not a conflict",
          city_conflicts(cross) == [])

    # THE FALSE POSITIVE THAT PUT STATE IN THE KEY. Real rows, 2026-09-22:
    # keyed on (city, country) this reported a contradiction and both sides
    # were correct data.
    birmingham = [
        {"symbol": "EHC", "city": "Birmingham", "state": "Alabama",
         "country": "United States", "metro": "Birmingham (AL)"},
        {"symbol": "McWane", "city": "Birmingham", "state": "Alabama",
         "country": "United States", "metro": "Birmingham (AL)"},
        {"symbol": "OS", "city": "Birmingham", "state": "Michigan",
         "country": "United States", "metro": "Detroit"},
        {"symbol": "Belfor", "city": "Birmingham", "state": "Michigan",
         "country": "United States", "metro": "Detroit"},
    ]
    check("conflict: Birmingham AL and Birmingham MI are NOT a contradiction",
          city_conflicts(birmingham) == [])
    check("same-name: but the shared name IS reported informationally",
          len(same_name_different_state(birmingham)) == 1)

    # ...and the real Carlsbad case, which IS a contradiction because both
    # rows say California while the metros differ.
    carlsbad = [
        {"symbol": "MXL", "city": "Carlsbad", "state": "California",
         "country": "United States", "metro": "San Diego"},
        {"symbol": "VSAT", "city": "Carlsbad", "state": "California",
         "country": "United States", "metro": "San Diego"},
        {"symbol": "IONS", "city": "Carlsbad", "state": "California",
         "country": "United States", "metro": "Carlsbad (NM)"},
    ]
    cc = city_conflicts(carlsbad)
    check("conflict: Carlsbad CA under two metros IS a contradiction", len(cc) == 1)
    check("conflict: the lone IONS row is the minority side",
          cc and cc[0][3]["Carlsbad (NM)"] == ["IONS"])
    check("same-name: one state only, so nothing informational to report",
          same_name_different_state(carlsbad) == [])

    # --- field_outliers: the real RGA shape -------------------------------
    detroit = [{"symbol": f"D{i}", "city": "Detroit", "state": "Michigan",
                "country": "United States", "metro": "Detroit"} for i in range(19)]
    rga = {"symbol": "RGA", "name": "Reinsurance Group", "city": "Chesterfield",
           "state": "Missouri", "country": "United States", "metro": "Detroit"}
    out = field_outliers(detroit + [rga], "state")
    check("outlier: RGA's Missouri inside a Michigan metro is flagged",
          len(out) == 1 and out[0][0]["symbol"] == "RGA")
    check("outlier: reports the majority it disagrees with",
          out and out[0][4] == "Michigan")

    # a genuine two-state metro must NOT be flagged
    ny = ([{"symbol": f"N{i}", "city": "New York", "state": "New York",
            "country": "United States", "metro": "New York"} for i in range(12)]
          + [{"symbol": f"J{i}", "city": "Newark", "state": "New Jersey",
              "country": "United States", "metro": "New York"} for i in range(6)])
    check("outlier: a real two-state metro (NY/NJ) is NOT flagged",
          field_outliers(ny, "state") == [])

    # small metros are skipped rather than guessed at
    tiny = [{"symbol": "T1", "city": "A", "state": "Iowa", "country": "United States", "metro": "Tiny"},
            {"symbol": "T2", "city": "B", "state": "Ohio", "country": "United States", "metro": "Tiny"}]
    check("outlier: a metro under MIN_ROWS rows is skipped, not guessed",
          field_outliers(tiny, "state") == [])

    # empty state must never be treated as an outlier
    blanks = detroit + [dict(rga, state=None)]
    check("outlier: a null state is skipped, not flagged",
          field_outliers(blanks, "state") == [])
    blanks2 = detroit + [dict(rga, state="   ")]
    check("outlier: a whitespace-only state is skipped too",
          field_outliers(blanks2, "state") == [])

    # the threshold is a share, not a count: 2 of 40 flags, 6 of 40 does not
    base40 = [{"symbol": f"X{i}", "city": "C", "state": "Texas",
               "country": "United States", "metro": "M"} for i in range(38)]
    two = base40 + [{"symbol": f"Y{i}", "city": "D", "state": "Utah",
                     "country": "United States", "metro": "M"} for i in range(2)]
    check("outlier: 2 of 40 (5%) is flagged", len(field_outliers(two, "state")) == 2)
    six = base40 + [{"symbol": f"Y{i}", "city": "D", "state": "Utah",
                     "country": "United States", "metro": "M"} for i in range(6)]
    check("outlier: 6 of 44 (14%) is not flagged", field_outliers(six, "state") == [])

    # the majority value itself is never an outlier, whatever the share
    check("outlier: the majority value is never flagged",
          all(t[1] != t[4] for t in field_outliers(two, "state")))

    # --- state_format_anomalies -------------------------------------------
    fmt_rows = [
        {"symbol": "BLSM", "city": "San Diego", "state": "CA",
         "country": "United States", "metro": "San Diego"},
        {"symbol": "OK1", "city": "San Diego", "state": "California",
         "country": "United States", "metro": "San Diego"},
        {"symbol": "BA", "city": "Arlington", "state": "DC",
         "country": "United States", "metro": "Washington-Baltimore"},
        {"symbol": "COF", "city": "McLean", "state": "DC",
         "country": "United States", "metro": "Washington-Baltimore"},
        {"symbol": "BEPC", "city": "Toronto", "state": "Ontario",
         "country": "Canada", "metro": "Toronto"},
    ]
    f = state_format_anomalies(fmt_rows)
    check("format: 'CA' is caught as non-canonical", "CA" in f and len(f["CA"]) == 1)
    check("format: 'DC' is caught and carries both its rows",
          "DC" in f and len(f["DC"]) == 2)
    check("format: a canonical full name is not reported", "California" not in f)
    check("format: a non-US row is out of scope (Ontario is a real province)",
          "Ontario" not in f)
    check("format: 'District of Columbia' IS canonical and not reported",
          state_format_anomalies([{"symbol": "X", "city": "Washington",
                                   "state": "District of Columbia",
                                   "country": "United States", "metro": "W"}]) == {})

    # --- adjacency table --------------------------------------------------
    adj = adjacency()
    check("adjacency: covers 50 states plus DC", len(adj) == 51)
    asym = [(a, b) for a, ns in adj.items() for b in ns if a not in adj.get(b, set())]
    check(f"adjacency: symmetric (a borders b => b borders a) {asym[:2] if asym else ''}",
          not asym)
    unknown = [(a, b) for a, ns in adj.items() for b in ns if b not in _STATES]
    check("adjacency: every neighbour is a known state", not unknown)
    check("adjacency: multi-word names survive parsing ('New Mexico' is one)",
          "New Mexico" in adj["Arizona"] and "New" not in adj["Arizona"])
    check("adjacency: Alaska and Hawaii have no neighbours",
          adj["Alaska"] == set() and adj["Hawaii"] == set())
    check("adjacency: the real cases -- CT borders NY, MO does not border MI",
          "New York" in adj["Connecticut"] and "Michigan" not in adj["Missouri"])
    check("adjacency: no state borders itself", all(s not in n for s, n in adj.items()))

    # the adjacency filter must keep a real error and drop a real multi-state MSA
    ny_ct = ([{"symbol": f"N{i}", "city": "New York", "state": "New York",
               "country": "United States", "metro": "New York"} for i in range(40)]
             + [{"symbol": "CHTR", "city": "Stamford", "state": "Connecticut",
                 "country": "United States", "metro": "New York"}])
    check("adjacency filter: Stamford CT under New York is dropped (borders NY)",
          field_outliers(ny_ct, "state", require_non_adjacent=True) == [])
    check("adjacency filter: ...but the share rule alone would have flagged it",
          len(field_outliers(ny_ct, "state")) == 1)
    det_mo = ([{"symbol": f"D{i}", "city": "Detroit", "state": "Michigan",
                "country": "United States", "metro": "Detroit"} for i in range(26)]
              + [{"symbol": "RGA", "city": "Chesterfield", "state": "Missouri",
                  "country": "United States", "metro": "Detroit"}])
    check("adjacency filter: RGA's Missouri under Detroit survives (no border)",
          len(field_outliers(det_mo, "state", require_non_adjacent=True)) == 1)
    jp = ([{"symbol": f"J{i}", "city": "Tokyo", "state": "Tokyo",
            "country": "Japan", "metro": "Tokyo"} for i in range(20)]
          + [{"symbol": "6592.T", "city": "Matsudo", "state": "Chiba",
              "country": "Japan", "metro": "Tokyo"}])
    check("adjacency filter: a non-US state is never silently dropped",
          len(field_outliers(jp, "state", require_non_adjacent=True)) == 1)

    # --- norm ------------------------------------------------------------
    check("norm: collapses inner whitespace", norm("New   York") == "new york")
    check("norm: None is empty", norm(None) == "")
    check("norm: keeps accents", norm("Málaga") == "málaga")

    print(f"\n{len(fail)} failures" if fail else "\nALL SELF-TESTS PASS")
    sys.exit(1 if fail else 0)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--report", action="store_true")
    ap.add_argument("--strict", action="store_true",
                    help="exit 1 if any CONTRADICTION is found")
    args = ap.parse_args()
    if args.self_test:
        cmd_self_test(); return
    if args.report:
        cmd_report(args); return
    ap.print_help()


if __name__ == "__main__":
    main()
