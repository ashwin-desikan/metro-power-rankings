#!/usr/bin/env python3
"""build_constitutions.py -- (re)build public/data/constitutions.json from the
Comparative Constitutions Project releases.

Feeds /constitutions. NOT auto-committed and NOT scheduled: CCP ships roughly
once a year and the source files are hand-downloaded, because neither the cloud
container nor the Windows box has egress to comparativeconstitutionsproject.org
or utexas.box.com (verified 2026-09-01).

SOURCES (pass the folder holding both unzipped releases with --src)
  ccpcce_v6/ccpcce_v6/ccpcce/ccpcce_v6.csv        Chronology of Constitutional
      Events v6.0 (Elkins and Ginsburg 2026). Country-year panel, 1789-2025.
      This is the spine: every ranked number on the hub comes from here.
  ccpcnc_v5/ccpcnc_v5/ccpcnc/ccpcnc_v5_small.csv  Characteristics of National
      Constitutions v5.0 (Elkins and Ginsburg 2025). 1,194 variables; we keep
      the handful the boards actually show.

WHAT THIS DELIBERATELY DOES NOT DO
  No formal "rigidity index". One was built on 2026-09-01 and failed its
  hand-check: it ranked Uganda the most rigid constitution in the world and
  Germany near the bottom, because it measured how elaborately a procedure is
  written rather than how hard it is to use, and because the weights were ours.
  The headline measure is amendment EVENTS PER DECADE, which is observed rather
  than constructed. Formal characteristics ship as row attributes, never as a
  score. Do not reintroduce the index without a published construction and a
  validation pass against the amendment rate.

IDENTITY
  CCP keys on Correlates of War codes; the site keys on slugs. RULINGS below is
  the whole crosswalk, hand-ruled and validated on every run against
  countries.json, leaders/_defunct.json and leaders/_names.json. A ruling that
  points at something that does not exist FAILS the build rather than joining
  silently. Two silent wrong joins were caught this way on 2026-09-01: cowcode
  255 (Prussia) and 815 (pre-colonial Vietnam) both name-match a live country
  and would have given it a second "current constitution".

  status live     -> a countries.json slug. Feeds the boards.
         defunct  -> a leaders/_defunct.json key. Feeds history and the model.
         lineage  -> feeds a live country's history, never its current row.
                     The display name comes from leaders/_names.json by date.

COVERAGE: THE FILE CHANGES SHAPE IN 2020, and this governs the page copy
  Through 2019 the chronology is a complete country-year panel: one row per
  country per year, most of them coded `non-event`. From 2020 it records EVENTS
  ONLY - 209 rows across six years, and not a single `non-event` among them.
  Verified 2026-09-01: 196-197 rows per year through 2019, then 30-41 a year;
  99 countries have a post-2019 row and 88 of them amended.

  So the absence of a row after 2019 means NO CONSTITUTIONAL EVENT WAS
  RECORDED, not "no data". Reading it as missing coverage was a misreading, and
  an expensive one: it produced a page telling readers the record stopped in
  2019 for 145 countries when the source in fact carries 13 new constitutions,
  190 amendments, 3 suspensions and 3 interims from 2020 to 2025.

  PANEL_END therefore marks where continuous coverage ends and event-only
  recording begins. Systems still standing are censored at the last event year
  in the file, not at their own last row.

  STATEHOOD GAPS still matter, but only inside the panel. Poland has no rows
  between 1795 and 1918, Haiti none between 1915 and 1934. A system whose panel
  run ends at one of those was INTERRUPTED, not replaced. Before this was
  handled, Poland's 1791 constitution showed a 128-year life. Gaps AFTER
  PANEL_END are not gaps at all, they are quiet years.

MODES
  --self-test   Offline. Asserts the crosswalk validates, the rate maths, the
                dated name resolution and the coverage-cliff handling.
  --build       Reads --src, writes public/data/constitutions.json.
"""
import argparse, csv, json, os, sys
from collections import defaultdict, Counter

# The survival maths lives in one place. Importing it here means the numbers the
# page prints and the numbers the gate was run on cannot drift apart.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from model_constitution_endurance import km, surv_at, median_surv  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "public", "data", "constitutions.json")
COUNTRIES = os.path.join(ROOT, "public", "data", "countries.json")
LEADERS = os.path.join(ROOT, "public", "data", "leaders")

CITATION = {
    "chronology": "Elkins, Zachary and Tom Ginsburg. 2026. Chronology of Constitutional Events, Version 6.0. Comparative Constitutions Project.",
    "characteristics": "Elkins, Zachary and Tom Ginsburg. 2025. Characteristics of National Constitutions, Version 5.0. Comparative Constitutions Project.",
    "url": "https://comparativeconstitutionsproject.org/",
}

# cowcode -> (status, slug, note). See IDENTITY above.
RULINGS = {
    "2":   ("live", "united-states", None),
    "57":  ("live", "st-vincent-the-grenadines", None),
    "60":  ("live", "st-kitts-nevis", None),
    "115": ("live", "suriname", None),
    "437": ("live", "cote-divoire", None),
    "490": ("live", "congo-dr", "CCP name 'Congo, Democratic Republic of (Zaire)'."),
    "703": ("live", "kyrgyzstan", None),
    "987": ("live", "federated-states-of-micronesia", None),
    "572": ("live", "eswatini", "CCP name 'Swaziland'; renamed 2018."),
    "343": ("live", "north-macedonia", "CCP name 'Macedonia (FYR)'; renamed 2019."),
    "731": ("live", "north-korea", None),
    "732": ("live", "south-korea", None),
    "816": ("live", "vietnam", "DRV, then the unified state after 1976."),
    # one code carrying several states; the display name resolves by date
    "510": ("live", "tanzania", "Tanganyika then Tanzania. Zanzibar is code 511."),
    "640": ("live", "turkey", "Carries the Ottoman Empire before 1923."),
    "325": ("live", "italy", "Carries Sardinia-Piedmont before 1861."),
    "260": ("live", "germany", "German Federal Republic. Code 255 carries what came before."),
    "340": ("live", "serbia", "Successor to Yugoslavia and to Serbia and Montenegro (ruled 2026-09-01)."),
    "365": ("live", "russia", "Carries the Soviet Union."),
    # lineage: no defunct entry needed, the successor's name timeline covers it
    "255": ("lineage", "germany", "Germany (Prussia), 1789-1945."),
    "815": ("lineage", "vietnam", "Annam / Cochin China / Tonkin, 1816-1893."),
    "300": ("lineage", "austria", "Austria-Hungary, in _names[austria] 1867-1918."),
    "315": ("lineage", "czech-republic", "Czechoslovakia, in _names[czech-republic] 1918-1992."),
    "327": ("lineage", "vatican-city", "Papal States, in _names[vatican-city] to 1870."),
    # defunct, bound to the site's existing registry
    "89":  ("defunct", "central-america-federation", "United Provinces of Central America."),
    "99":  ("defunct", "gran-colombia", "CCP name 'Great Colombia'."),
    "240": ("defunct", "hanover", None),
    "245": ("defunct", "bavaria", None),
    "265": ("defunct", "east-germany", None),
    "267": ("defunct", "baden", None),
    "269": ("defunct", "saxony", None),
    "271": ("defunct", "wurttemberg", None),
    "273": ("defunct", "electorate-of-hesse", "CCP name 'Hesse-Kassel (Electoral)'."),
    "275": ("defunct", "grand-duchy-of-hesse", "CCP name 'Hesse-Darmstadt (Ducal)'."),
    "280": ("defunct", "mecklenburg-schwerin", None),
    "329": ("defunct", "two-sicilies", None),
    "332": ("defunct", "duchy-of-modena", None),
    "335": ("defunct", "duchy-of-parma", None),
    "337": ("defunct", "tuscany", None),
    "511": ("defunct", "zanzibar", None),
    "563": ("defunct", "transvaal", None),
    "564": ("defunct", "orange-free-state", None),
    "680": ("defunct", "south-yemen", None),
    "711": ("defunct", "tibet", "Already a defunct entity on /leaders, 1912-1951."),
    "730": ("defunct", "joseon-korea", "Korea before division."),
    "817": ("defunct", "south-vietnam", None),
}

# Characteristics codings we surface. Source: codebook v5.0, v79.
THRESHOLD = {"1": "absolute majority", "2": "three fifths", "3": "two thirds",
             "4": "three quarters", "5": "unspecified supermajority"}
# v76 approval actors.
APPROVER = {"1": "head of state", "2": "head of government", "3": "cabinet",
            "4": "first chamber", "5": "second chamber", "6": "both chambers",
            "7": "subsidiary units", "8": "public referendum"}

MIN_YEARS_FOR_RATE = 20   # below this a rate is noise, so we publish none
PANEL_END = 2019          # last year of the complete country-year panel


def norm(s):
    s = s.lower().replace("&", " and ")
    out = []
    depth = 0
    for ch in s:                      # drop parenthesised qualifiers
        if ch == "(": depth += 1
        elif ch == ")": depth = max(0, depth - 1)
        elif depth == 0: out.append(ch)
    s = "".join(c if c.isalpha() or c == " " else " " for c in out)
    drop = {"the", "of", "st", "saint"}
    return " ".join(w for w in s.split() if w not in drop)


def name_on(timeline, year):
    """Resolve a country's name as at `year` from a leaders/_names.json entry."""
    if not timeline:
        return None
    for period in timeline:
        start = period.get("start")
        end = period.get("end")
        s = int(str(start)[:4]) if start else None
        e = int(str(end)[:4]) if end else None
        if (s is None or year >= s) and (e is None or year < e):
            return period["name"]
    return None


def year_runs(years):
    """Contiguous runs of covered years, [[start, end], ...]."""
    ys = sorted(set(years))
    out = [[ys[0], ys[0]]]
    for y in ys[1:]:
        if y == out[-1][1] + 1:
            out[-1][1] = y
        else:
            out.append([y, y])
    return out


def run_containing(runs, year):
    for r in runs:
        if r[0] <= year <= r[1]:
            return r
    return runs[-1]


def amend_rate(events, years):
    """Amendment events per decade in force. None below MIN_YEARS_FOR_RATE,
    because a two-year-old constitution with one amendment is not a rate."""
    if years is None or years < MIN_YEARS_FOR_RATE:
        return None
    return round(events / years * 10, 2)


def load_reference():
    countries = json.load(open(COUNTRIES, encoding="utf-8"))
    slugs = {c["slug"]: c["name"] for c in countries}
    defunct = json.load(open(os.path.join(LEADERS, "_defunct.json"), encoding="utf-8"))
    names = json.load(open(os.path.join(LEADERS, "_names.json"), encoding="utf-8"))
    return slugs, defunct, names


def resolve(cow_names, slugs, defunct, names):
    """Return {cowcode: entry} or raise on any unresolved or invalid ruling."""
    by_norm = {}
    for slug, name in slugs.items():
        by_norm.setdefault(norm(name), slug)
        by_norm.setdefault(norm(slug.replace("-", " ")), slug)
    out, errors = {}, []
    for cow, cnames in cow_names.items():
        if cow in RULINGS:
            status, slug, note = RULINGS[cow]
            via = "ruling"
            if status == "live" and slug not in slugs:
                errors.append(f"{cow}: live ruling -> missing country slug '{slug}'")
            if status == "lineage" and slug not in slugs:
                errors.append(f"{cow}: lineage ruling -> missing country slug '{slug}'")
            if status == "lineage" and slug not in names:
                errors.append(f"{cow}: lineage ruling -> '{slug}' has no _names.json timeline, "
                              f"so the period would display under the modern name")
            if status == "defunct" and slug not in defunct:
                errors.append(f"{cow}: defunct ruling -> missing _defunct.json key '{slug}'")
        else:
            slug = next((by_norm[norm(n)] for n in sorted(cnames) if norm(n) in by_norm), None)
            if not slug:
                errors.append(f"{cow}: no name match and no ruling for {sorted(cnames)}")
                continue
            status, note, via = "live", None, "name"
        out[cow] = {"status": status, "slug": slug, "note": note, "via": via}
    if errors:
        raise SystemExit("crosswalk failed:\n  " + "\n  ".join(errors))
    return out


def build(src):
    cce = os.path.join(src, "ccpcce_v6", "ccpcce_v6", "ccpcce", "ccpcce_v6.csv")
    cnc = os.path.join(src, "ccpcnc_v5", "ccpcnc_v5", "ccpcnc", "ccpcnc_v5_small.csv")
    for p in (cce, cnc):
        if not os.path.exists(p):
            raise SystemExit(f"missing source file: {p}")

    rows = list(csv.DictReader(open(cce, encoding="utf-8-sig")))
    slugs, defunct, names = load_reference()
    cow_names = defaultdict(set)
    for r in rows:
        cow_names[r["cowcode"]].add(r["country"])
    xw = resolve(cow_names, slugs, defunct, names)

    by_cow = defaultdict(list)
    for r in rows:
        by_cow[r["cowcode"]].append(r)

    data_end = max(int(r["year"]) for r in rows)
    countries, systems = [], []
    for cow, rs in by_cow.items():
        meta = xw[cow]
        rs.sort(key=lambda r: int(r["year"]))
        last_event = max((int(r["year"]) for r in rs if r["evnttype"] != "non-event"),
                         default=int(rs[-1]["year"]))
        # Runs are computed on the PANEL only. After PANEL_END the file records
        # events alone, so a missing year is silence, not a hole.
        panel_years = [int(r["year"]) for r in rs if int(r["year"]) <= PANEL_END]
        runs = year_runs(panel_years) if panel_years else [[int(rs[0]["year"]), PANEL_END]]
        starts = [int(r["year"]) for r in rs if r["evnttype"] == "new"]
        counts = Counter(r["evnttype"] for r in rs)
        amd_by_year = Counter(int(r["year"]) for r in rs
                              if r["evnttype"] in ("amendment", "samendment"))

        for i, y in enumerate(starts):
            run = run_containing(runs, y)
            panel_last = runs[-1][1]
            nxt = starts[i + 1] if i + 1 < len(starts) else None
            if nxt is not None and (nxt <= run[1] or run[1] >= PANEL_END):
                # replaced by the next constitution, with no statehood gap in
                # between (a run reaching PANEL_END continues into the
                # event-only years, so a later `new` there is a replacement).
                end, outcome = nxt, "replaced"
            elif nxt is not None:
                # a statehood gap sits between this constitution and the next:
                # the country stopped existing, the document did not fail.
                end, outcome = run[1], "interrupted"
            elif panel_last < PANEL_END:
                # the country leaves the panel and never returns: the polity
                # ended, and its last constitution ended with it.
                end, outcome = panel_last, "interrupted"
            else:
                end, outcome = None, "in force"
            systems.append({
                "cow": cow, "slug": meta["slug"], "status": meta["status"],
                "nameAtTime": name_on(names.get(meta["slug"]), y) or rs[-1]["country"],
                "start": y, "end": end, "outcome": outcome,
                "ended": outcome == "replaced",
                "years": (end - y) if end is not None else (data_end - y),
                "amd10": sum(v for k, v in amd_by_year.items() if y < k <= y + 10),
            })

        if meta["status"] != "live":
            continue
        adopted = starts[-1] if starts else None
        age = (data_end - adopted) if adopted is not None else None
        amend_events = sum(1 for r in rs
                           if adopted is not None and int(r["year"]) >= adopted
                           and r["evnttype"] in ("amendment", "samendment"))
        countries.append({
            "slug": meta["slug"], "name": slugs[meta["slug"]], "cow": cow,
            "ccpName": rs[-1]["country"],
            "adopted": adopted, "asOf": data_end, "lastEvent": last_event,
            "ageYears": age,
            "amendEvents": amend_events, "amendPerDecade": amend_rate(amend_events, age),
            "systemsSince1789": len(starts),
            "suspensions": counts.get("suspension", 0),
            "reinstatements": counts.get("reinstated", 0),
            "interims": counts.get("interim", 0),
            "note": meta["note"],
        })

    # Characteristics: latest CODED record per cowcode, for the live countries.
    char = {}
    with open(cnc, encoding="utf-8-sig", newline="") as f:
        rd = csv.DictReader(f)
        for r in rd:
            if r.get("coding_available") != "1":
                continue
            cow = r["cowcode"]
            if xw.get(cow, {}).get("status") != "live":
                continue
            if cow not in char or int(r["year"]) > int(char[cow]["year"]):
                char[cow] = r
    for c in countries:
        r = char.get(c["cow"])
        if not r:
            c["chars"] = None
            continue
        approvers = [APPROVER[k.split("_")[1]] for k, v in r.items()
                     if k.startswith("amndappr_") and v == "1" and k.split("_")[1] in APPROVER]
        c["chars"] = {
            "year": int(r["year"]),
            "words": int(r["length"]) if r["length"].isdigit() else None,
            "documents": int(r["docs"]) if r["docs"].isdigit() else None,
            "uncodified": r["amend"] == "2",
            "entrenchedClauses": r["unamend"] == "1",
            "approvers": approvers or None,
            "threshold": THRESHOLD.get(r["amndapct"]),
            # CCP v83-style coding: this is whether the text carries an EXPLICIT
            # independence declaration, not whether the judiciary is independent.
            # The US codes "no". Label it as a clause, never as a judgement.
            "judicialIndependenceClause": r["judind"] == "1",
        }

    # Endurance summary, computed here so the page never hardcodes a statistic.
    # WP4 ruled that the per-country FORECAST does not ship; these descriptive
    # figures are what passed. See the WP4 note before adding anything to this.
    surv = [(x["years"], x["outcome"] == "replaced") for x in systems]
    ts, S = km(surv)
    def era(a, b):
        it = [(x["years"], x["outcome"] == "replaced") for x in systems if a <= x["start"] <= b]
        t2, S2 = km(it)
        return {"label": f"{a}-{b}", "n": len(it), "median": median_surv(t2, S2),
                "p20": round(surv_at(t2, S2, 20), 3)}
    def flex(flag):
        g = [(x["years"] - 10, x["outcome"] == "replaced") for x in systems
             if x["years"] >= 10 and (x["amd10"] > 0) == flag]
        t2, S2 = km(g)
        return {"n": len(g), "medianFurther": median_surv(t2, S2),
                "p25": round(surv_at(t2, S2, 25), 3)}
    endurance = {
        "medianYears": median_surv(ts, S),
        "survival": {str(t): round(surv_at(ts, S, t), 3) for t in (5, 10, 25, 50, 100)},
        "another20GivenAge": {str(a): round(surv_at(ts, S, a + 20) / max(surv_at(ts, S, a), 1e-9), 3)
                              for a in (0, 10, 25, 50, 100)},
        "eras": [era(1789, 1899), era(1900, 1945), era(1946, 1989), era(1990, 2025)],
        "flexibility": {"amendedEarly": flex(True), "notAmendedEarly": flex(False)},
        "forecast": ("Not published. A per-country expected-remaining-life model failed its "
                     "walk-forward backtest at the most recent cut, under-predicting survival "
                     "by roughly a third, because constitutions written since 1990 outlive the "
                     "historical base rate."),
    }

    countries.sort(key=lambda c: c["name"])
    systems.sort(key=lambda s: (s["start"], s["slug"]))
    payload = {
        "built": __import__("datetime").date.today().isoformat(),
        "citation": CITATION,
        "coverage": {
            "chronologyFrom": min(int(r["year"]) for r in rows),
            "chronologyTo": max(int(r["year"]) for r in rows),
            "liveCountries": len(countries),
            "panelEnd": PANEL_END,
            "countriesWithAnEventSince2020": sum(1 for c in countries if c["lastEvent"] > PANEL_END),
            "note": ("Complete country-year panel through 2019; from 2020 the source records "
                     "constitutional events only. A country with no row after 2019 had no "
                     "recorded constitutional event, which is not the same as missing data."),
        },
        "endurance": endurance,
        "countries": countries,
        "systems": systems,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
    print(f"wrote {OUT}")
    print(f"  live countries: {len(countries)}")
    print(f"  constitutional systems: {len(systems)}")
    print(f"  with characteristics: {sum(1 for c in countries if c['chars'])}")
    print(f"  countries with an event since 2020: {payload['coverage']['countriesWithAnEventSince2020']}")
    oc = Counter(s["outcome"] for s in systems)
    print(f"  system outcomes: {dict(oc)}")


def self_test():
    slugs, defunct, names = load_reference()

    # 1. Every ruling points at something that exists.
    fake = {cow: {"x"} for cow in RULINGS}
    resolve(fake, slugs, defunct, names)

    # 2. Dated name resolution: the whole reason lineage codes need no defunct entry.
    assert name_on(names.get("austria"), 1900) == "Austria-Hungary", name_on(names.get("austria"), 1900)
    assert name_on(names.get("austria"), 2020) == "Austria"
    assert name_on(names.get("czech-republic"), 1950) == "Czechoslovakia"
    assert name_on(names.get("vatican-city"), 1850) == "Papal States"
    assert name_on(names.get("serbia"), 1950) == "Yugoslavia"
    assert name_on(names.get("turkey"), 1900) == "Ottoman Empire"
    assert name_on(None, 1900) is None

    # 3. Year runs and the statehood-gap rule (Poland 1791 must not live 128 years).
    assert year_runs([1791, 1792, 1795, 1918, 1919]) == [[1791, 1792], [1795, 1795], [1918, 1919]]
    assert run_containing([[1791, 1795], [1918, 2019]], 1997) == [1918, 2019]
    assert run_containing([[1791, 1795], [1918, 2019]], 1791) == [1791, 1795]

    # 4. Rate maths, including the floor that suppresses noise.
    assert amend_rate(10, 100) == 1.0
    assert amend_rate(0, 73) == 0.0
    assert amend_rate(1, 5) is None, "a five-year-old constitution has no meaningful rate"
    assert amend_rate(3, None) is None

    # 5. Name normalisation must not collapse a real country to nothing.
    assert norm("United States of America") == "united states america"
    assert norm("Macedonia (Former Yugoslav Republic of)") == "macedonia"
    assert norm("Cote d'Ivoire") == "cote d ivoire"

    # 6. The two silent wrong joins stay ruled, not name-matched.
    assert RULINGS["255"][0] == "lineage", "Prussia must not become a live German record"
    assert RULINGS["815"][0] == "lineage", "pre-colonial Vietnam must not become a live record"

    print("self-test OK")
    print(f"  rulings validated: {len(RULINGS)}")
    print(f"  reference: {len(slugs)} country slugs, {len(defunct)} defunct entities, "
          f"{len(names)} name timelines")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--build", action="store_true")
    ap.add_argument("--src", help="folder holding the unzipped ccpcce_v6/ and ccpcnc_v5/ releases")
    a = ap.parse_args()
    if a.self_test:
        self_test()
    elif a.build:
        if not a.src:
            raise SystemExit("--build needs --src (the folder holding both unzipped CCP releases)")
        build(a.src)
    else:
        ap.print_help()
        sys.exit(0)
