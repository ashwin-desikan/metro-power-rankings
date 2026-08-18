#!/usr/bin/env python3
"""build_business_data.py - data feed for /business (Business of the Metros).

Reads the mktcap_* Supabase tables (the pipeline that replaces the Excel
ritual; see scripts/mktcap/) plus two curated inputs in scripts/business/data/
(global500.json - Fortune Global 500 extract; culture-owners.json - the public
companies behind Sound and Screen) and writes public/data/business/business.json.

Cadence: run right after `refresh.py --write` in the Saturday mktcap flow (and
at any time for a manual refresh - it is read-only against Supabase). Movers
activate automatically once mktcap_valuations carries two or more as_of
snapshots; until then the JSON ships movers: null and the page explains itself.

Numbers note: metro pages read the workbook-ETL metros.json, this hub reads the
Supabase snapshot; each carries its own as-of stamp, and the two converge at
the mktcap cutover. usage: build_business_data.py [--self-test]
"""
import csv, json, os, sys, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "scripts", "mktcap"))
import common  # noqa: E402  (shared Supabase REST helpers + key handling)

OUT_DIR = os.path.join(ROOT, "public", "data", "business")
METROS = os.path.join(ROOT, "public", "data", "metros.json")
GLOBAL500 = os.path.join(HERE, "data", "global500.json")
CULTURE = os.path.join(HERE, "data", "culture-owners.json")

RACE_TARGET = 5e12  # the race to five trillion


def aggregate(rows, metro_info):
    """Aggregate merged rows into metro / country / region boards."""
    metros, countries = {}, {}
    for r in rows:
        cap = r.get("marketcap") or 0
        if cap <= 0:
            continue
        c = r.get("country") or "Unknown"
        cc = countries.setdefault(c, {"name": c, "cap": 0.0, "count": 0, "top": None})
        cc["cap"] += cap
        cc["count"] += 1
        if cc["top"] is None or cap > cc["top"]["cap"]:
            cc["top"] = {"name": r["name"], "cap": cap}
        m = r.get("metro")
        if not m:
            continue
        mm = metros.setdefault(m, {"name": m, "cap": 0.0, "count": 0, "top": []})
        mm["cap"] += cap
        mm["count"] += 1
        mm["top"].append({"name": r["name"], "cap": cap})
    for mm in metros.values():
        mm["top"] = sorted(mm["top"], key=lambda x: -x["cap"])[:3]
        info = metro_info.get(mm["name"], {})
        mm["slug"] = info.get("slug", "")
        mm["country"] = info.get("country", "")
        mm["region"] = info.get("region", "")
    regions = {}
    for mm in metros.values():
        if not mm["region"]:
            continue
        rr = regions.setdefault(mm["region"], {"name": mm["region"], "cap": 0.0, "count": 0, "metros": 0})
        rr["cap"] += mm["cap"]
        rr["count"] += mm["count"]
        rr["metros"] += 1
    return (
        sorted(metros.values(), key=lambda x: -x["cap"]),
        sorted(countries.values(), key=lambda x: -x["cap"]),
        sorted(regions.values(), key=lambda x: -x["cap"]),
    )


def build_movers(snapshots, merged_by_id):
    """Company + metro movers between the two latest snapshots (None if <2)."""
    if len(snapshots) < 2:
        return None
    latest, prev = snapshots[-1], snapshots[-2]
    def snap(as_of):
        rows = common.select_all(
            f"/rest/v1/mktcap_valuations?select=company_id,marketcap&as_of=eq.{as_of}",
            order="company_id")
        return {r["company_id"]: r["marketcap"] or 0 for r in rows}
    now, before = snap(latest), snap(prev)
    comp, metro_delta = [], {}
    for cid, cap in now.items():
        old = before.get(cid)
        m = merged_by_id.get(cid) or {}
        if m.get("metro"):
            md = metro_delta.setdefault(m["metro"], {"metro": m["metro"], "cap": 0.0, "prev": 0.0})
            md["cap"] += cap
            md["prev"] += old or 0
        if old is None or old <= 0 or cap <= 0:
            continue
        comp.append({
            "name": m.get("name", cid), "symbol": m.get("symbol", ""),
            "metro": m.get("metro"), "cap": cap, "prev": old,
            "chg": cap - old, "pct": (cap - old) / old,
        })
    comp.sort(key=lambda x: -abs(x["chg"]))
    metros = [d for d in metro_delta.values() if d["prev"] > 0]
    for d in metros:
        d["chg"] = d["cap"] - d["prev"]
        d["pct"] = d["chg"] / d["prev"]
    metros.sort(key=lambda x: -abs(x["chg"]))
    return {"prev_as_of": prev, "as_of": latest,
            "companies": comp[:16], "metros": metros[:12]}


def main(argv):
    if "--self-test" in argv:
        return self_test()
    metros_master = json.load(open(METROS, encoding="utf-8"))
    metro_info = {m["name"]: m for m in metros_master}

    rows = common.select_all(
        "/rest/v1/mktcap_merged?select=rank,source,name,symbol,company_id,marketcap,country,metro,city,state,as_of",
        order="company_id")
    rows = [r for r in rows if (r.get("marketcap") or 0) > 0]
    common.log(f"merged rows: {len(rows)}")
    as_of = max((r.get("as_of") or "" for r in rows), default="")

    # Ordered on (company_id, as_of) because company_id alone repeats once per
    # snapshot, and identical projected rows are expected here: this is a set of
    # distinct dates, so duplicates are the point rather than a fault.
    snapshots = sorted({v["as_of"] for v in common.select_all(
        "/rest/v1/mktcap_valuations?select=as_of", order="company_id,as_of",
        allow_duplicate_rows=True)})
    merged_by_id = {r["company_id"]: r for r in rows}
    by_symbol = {r["symbol"]: r for r in rows if r.get("symbol")}
    by_name = {r["name"]: r for r in rows}

    metros_agg, countries_agg, regions_agg = aggregate(rows, metro_info)

    top = sorted(rows, key=lambda r: -(r["marketcap"] or 0))
    top_companies = [{
        "rank": i + 1, "name": r["name"], "symbol": r.get("symbol", ""),
        "cap": r["marketcap"], "country": r.get("country", ""),
        "metro": r.get("metro"), "metroSlug": metro_info.get(r.get("metro") or "", {}).get("slug", ""),
        "source": r.get("source", ""),
    } for i, r in enumerate(top[:100])]

    race = [{**c, "pctTo5T": round(c["cap"] / RACE_TARGET * 100, 1)}
            for c in top_companies[:8]]

    movers = build_movers(snapshots, merged_by_id)

    # Fortune Global 500: employees + revenue, joined to metros via the mktcap name
    g500 = json.load(open(GLOBAL500, encoding="utf-8"))
    employers, emp_by_metro = [], {}
    for row in g500["rows"]:
        m = by_name.get(row.get("mktcapName") or "")
        metro = m.get("metro") if m else None
        employers.append({
            "name": row["name"], "employees": row["employees"],
            "revenueUsd": row["revenueUsd"], "metro": metro,
            "metroSlug": metro_info.get(metro or "", {}).get("slug", ""),
            "country": (m or {}).get("country", ""),
        })
        if metro and row["employees"]:
            e = emp_by_metro.setdefault(metro, {"metro": metro, "employees": 0, "companies": 0})
            e["employees"] += row["employees"]
            e["companies"] += 1
    employers.sort(key=lambda x: -(x["employees"] or 0))
    emp_metros = sorted(emp_by_metro.values(), key=lambda x: -x["employees"])
    for e in emp_metros:
        e["slug"] = metro_info.get(e["metro"], {}).get("slug", "")

    # Culture owners: curated symbols enriched with live caps + metros
    culture_src = json.load(open(CULTURE, encoding="utf-8"))
    culture, unmatched = [], []
    for c in culture_src["companies"]:
        m = by_symbol.get(c["symbol"])
        if not m:
            for alt in c.get("altNames", []):
                m = by_name.get(alt)
                if m:
                    break
        if not m:
            unmatched.append(c["symbol"])
            continue
        culture.append({
            "name": c["label"], "symbol": m["symbol"], "kind": c["kind"],
            "owns": c["owns"], "screen": c["screen"], "sound": c["sound"],
            "cap": m["marketcap"], "metro": m.get("metro"),
            "metroSlug": metro_info.get(m.get("metro") or "", {}).get("slug", ""),
        })
    culture.sort(key=lambda x: -x["cap"])
    if unmatched:
        common.log(f"culture owners unmatched (fix data/culture-owners.json): {unmatched}")

    out = {
        "meta": {
            "as_of": as_of,
            "generated_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "snapshots": snapshots,
            "companies": len(rows),
            "totalCap": sum(r["marketcap"] for r in rows),
            "mappedCompanies": sum(1 for r in rows if r.get("metro")),
            "mappedCap": sum(r["marketcap"] for r in rows if r.get("metro")),
            "metros": len(metros_agg), "countries": len(countries_agg),
            "g500Source": g500.get("source", ""),
            "cultureUnmatched": unmatched,
        },
        "metros": metros_agg[:100],
        "countries": countries_agg[:60],
        "regions": regions_agg,
        "topCompanies": top_companies,
        "race5t": race,
        "movers": movers,
        "employers": employers[:30],
        "employeesByMetro": emp_metros[:20],
        "culture": culture,
    }
    os.makedirs(OUT_DIR, exist_ok=True)

    # Full company universe for the Companies tab (client drill-down; ~1.7MB,
    # lazy-fetched by the browser only when someone filters past the top 500)
    json.dump({
        "meta": {"as_of": as_of, "generated_at": out["meta"]["generated_at"], "count": len(top)},
        "companies": [{
            "rank": i + 1, "name": r["name"], "symbol": r.get("symbol", ""),
            "cap": r["marketcap"], "country": r.get("country", ""),
            "metro": r.get("metro"), "metroSlug": metro_info.get(r.get("metro") or "", {}).get("slug", ""),
            "source": r.get("source", ""),
        } for i, r in enumerate(top)],
    }, open(os.path.join(OUT_DIR, "companies.json"), "w", encoding="utf-8"), indent=0, ensure_ascii=False)

    # Unicorn + private detail for /business/private (industry/date/investors come
    # from the weekly CB Insights fetch CSV; graduations = unicorn names that now
    # exist as PUBLIC rows in the merged universe)
    uni_csv = os.path.join(ROOT, "scripts", "mktcap", "out", "source_unicorns.csv")
    unicorns, graduated = [], []
    public_names = {r["name"] for r in rows if r.get("source") == "Public"}
    if os.path.exists(uni_csv):
        for u in csv.DictReader(open(uni_csv, encoding="utf-8")):
            name = (u.get("Company") or "").strip()
            if not name:
                continue
            try:
                val = float(u.get("ValuationBn") or 0) * 1e9
            except ValueError:
                val = 0
            m = by_name.get(name) or {}
            entry = {
                "name": name, "valuation": val,
                "dateJoined": (u.get("DateJoined") or "")[:10],
                "country": (u.get("Country") or "").strip(),
                "city": (u.get("City") or "").strip(),
                "industry": (u.get("Industry") or "").strip(),
                "investors": (u.get("Investors") or "").strip(),
                "metro": m.get("metro"),
                "metroSlug": metro_info.get(m.get("metro") or "", {}).get("slug", ""),
            }
            if name in public_names:
                graduated.append({**entry, "publicCap": m.get("marketcap")})
            else:
                unicorns.append(entry)
    unicorns.sort(key=lambda x: -x["valuation"])
    graduated.sort(key=lambda x: -(x.get("publicCap") or 0))
    private = [{
        "name": r["name"], "cap": r["marketcap"], "country": r.get("country", ""),
        "metro": r.get("metro"), "metroSlug": metro_info.get(r.get("metro") or "", {}).get("slug", ""),
    } for r in top if r.get("source") == "Private"]
    json.dump({
        "meta": {"as_of": as_of, "generated_at": out["meta"]["generated_at"],
                 "unicorns": len(unicorns), "graduated": len(graduated), "private": len(private)},
        "unicorns": unicorns, "graduated": graduated, "private": private,
    }, open(os.path.join(OUT_DIR, "unicorns.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)

    dest = os.path.join(OUT_DIR, "business.json")
    json.dump(out, open(dest, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    common.log(f"wrote {dest}: {len(metros_agg)} metros, {len(countries_agg)} countries, "
               f"{len(snapshots)} snapshot(s), movers={'on' if movers else 'off'}, "
               f"culture={len(culture)}; companies.json {len(top)} rows, "
               f"unicorns {len(unicorns)}/grad {len(graduated)}/private {len(private)}")


def self_test():
    metro_info = {"Metroville": {"slug": "metroville", "country": "Freedonia", "region": "Europe"}}
    rows = [
        {"name": "BigCo", "marketcap": 100.0, "country": "Freedonia", "metro": "Metroville"},
        {"name": "SmallCo", "marketcap": 40.0, "country": "Freedonia", "metro": "Metroville"},
        {"name": "NoMetroCo", "marketcap": 60.0, "country": "Freedonia", "metro": None},
        {"name": "DeadCo", "marketcap": 0, "country": "Freedonia", "metro": "Metroville"},
    ]
    m, c, r = aggregate(rows, metro_info)
    assert len(m) == 1 and m[0]["cap"] == 140.0 and m[0]["count"] == 2, m
    assert m[0]["slug"] == "metroville" and m[0]["top"][0]["name"] == "BigCo", m
    assert c[0]["cap"] == 200.0 and c[0]["count"] == 3 and c[0]["top"]["name"] == "BigCo", c
    assert r[0]["name"] == "Europe" and r[0]["metros"] == 1, r
    assert build_movers(["2026-07-18"], {}) is None
    print("self-test: 5/5 PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]) or 0)
