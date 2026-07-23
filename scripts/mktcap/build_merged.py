"""Merge sources, diff against Supabase, write the weekly snapshot.

Replicates the Excel Merged Master: public + unicorns-not-IPOd + private@3x,
overrides applied, sorted by valuation, geo-joined. Dry-run by default;
pass --write to persist. Report always printed and written to out/report.md.
"""
import csv, datetime, json, os, sys
from common import rest, select, select_all, log

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
SWING_LIMIT = 0.05   # abort if any source count moves >5% week-over-week
TODAY = datetime.date.today().isoformat()

def load_sources():
    pub = list(csv.DictReader(open(os.path.join(OUT, "source_public.csv"), encoding="utf-8")))
    uni = list(csv.DictReader(open(os.path.join(OUT, "source_unicorns.csv"), encoding="utf-8")))
    return pub, uni

def merge(pub, uni, private_rows, changes, overrides):
    """Returns sorted merged rows: dicts with source,name,symbol,marketcap,price,country."""
    remap = {c["old_symbol"]: c["new_symbol"] for c in changes}
    ov = {o["symbol"]: float(o["value"]) for o in overrides if o["field"] == "marketcap"}
    merged, public_names = [], set()
    for r in pub:
        mcap = float(r["marketcap"] or 0)
        if mcap <= 0 or not r["Symbol"]: continue
        sym = remap.get(r["Symbol"], r["Symbol"])
        public_names.add(r["Name"].strip().lower())
        merged.append(dict(source="Public", name=r["Name"], symbol=sym,
                           marketcap=ov.get(sym, mcap),
                           price=float(r["price"]) if r["price"] else None, country=r["country"]))
    ipo_dedup, unicorn_names = [], set()
    for r in uni:
        if r["Company"].strip().lower() in public_names:
            ipo_dedup.append(r["Company"]); continue
        unicorn_names.add(r["Company"].strip().lower())
        sym = f'{r["Company"]}(Uni)'
        merged.append(dict(source="Unicorn", name=r["Company"], symbol=sym,
                           marketcap=ov.get(sym, float(r["ValuationBn"]) * 1e9),
                           price=None, country=r["Country"]))
    for r in private_rows:
        if not r.get("revenue"): continue
        # Excel parity: private rows are excluded when the name exists as a public
        # company OR a unicorn (the CB valuation beats the 3x-revenue proxy).
        if r["name"].strip().lower() in public_names | unicorn_names: continue
        sym = r["name"]
        merged.append(dict(source="Private", name=r["name"], symbol=sym,
                           marketcap=ov.get(sym, float(r["revenue"]) * 3),
                           price=None, country=r.get("country")))
    merged.sort(key=lambda m: -m["marketcap"])
    seen = {}
    for i, m in enumerate(merged, 1):
        m["rank"] = i
        n = seen.get(m["symbol"], 0) + 1; seen[m["symbol"]] = n
        m["company_id"] = m["symbol"] if n == 1 else f'{m["symbol"]}#{n}'
    return merged, ipo_dedup

def main(write=False):
    pub, uni = load_sources()
    private_rows = select_all("/rest/v1/mktcap_private?select=name,revenue,country", "id")
    changes = select_all("/rest/v1/mktcap_symbol_changes?select=old_symbol,new_symbol", "old_symbol")
    overrides = select("/rest/v1/mktcap_overrides?select=symbol,field,value")
    current = select_all("/rest/v1/mktcap_companies?select=company_id,symbol,name,source,is_active", "company_id")
    geo = select_all("/rest/v1/mktcap_geo?select=symbol,metro", "symbol")
    metros = {m["metro"] for m in select_all("/rest/v1/mktcap_valid_metros?select=metro", "metro")}
    prev = {c["source"]: 0 for c in current}
    for c in current:
        if c["is_active"]: prev[c["source"]] = prev.get(c["source"], 0) + 1

    merged, ipo_dedup = merge(pub, uni, private_rows, changes, overrides)
    counts = {}
    for m in merged: counts[m["source"]] = counts.get(m["source"], 0) + 1

    # sanity gates (assume our own code/fetch first: abort loudly, never write garbage)
    for src, n in counts.items():
        p = prev.get(src, 0)
        if p and abs(n - p) / p > SWING_LIMIT:
            sys.exit(f"FATAL: {src} count swung {p} -> {n} (>{SWING_LIMIT:.0%}); refusing to write. "
                     f"Inspect out/source_*.csv — likely a fetch/parse problem, not reality.")

    geo_map = {g["symbol"]: g["metro"] for g in geo}
    cur_ids = {c["company_id"] for c in current}
    active_ids = {c["company_id"] for c in current if c["is_active"]}
    new_ids = [m for m in merged if m["company_id"] not in cur_ids]
    this_ids = {m["company_id"] for m in merged}
    removed = sorted(active_ids - this_ids)
    unmapped_new = [m for m in new_ids if m["symbol"] not in geo_map]
    invalid = sorted({v for v in (geo_map.get(m["symbol"]) for m in merged) if v and v not in metros})
    mapped = sum(1 for m in merged if geo_map.get(m["symbol"]))
    renames = [(m["symbol"], c["symbol"]) for m in new_ids for c in current
               if not c["is_active"] and c["name"].strip().lower() == m["name"].strip().lower()
               and c["symbol"] != m["symbol"]][:50]

    rep = [f"# mktcap refresh {TODAY} {'(WRITE)' if write else '(dry-run)'}",
           f"- merged: {len(merged)}  " + "  ".join(f"{k} {v}" for k, v in sorted(counts.items())),
           f"- top: {merged[0]['name']} ${merged[0]['marketcap']/1e12:.2f}T ({geo_map.get(merged[0]['symbol'],'?')})",
           f"- mapped metros: {mapped}  | invalid metro names: {len(invalid)} {invalid[:8]}",
           f"- new companies: {len(new_ids)}  | removed (fell off): {len(removed)} {removed[:8]}",
           f"- IPO dedup (unicorn suppressed, public wins): {len(ipo_dedup)} {ipo_dedup[:8]}",
           f"- possible ticker renames (REVIEW, not auto-applied): {renames[:8]}",
           f"- METRO QUEUE (new, unmapped — for Ashwin): " +
           (", ".join(f'{m["name"]} [{m["symbol"]}] ({m["country"]})' for m in unmapped_new[:40]) or "none")]
    report = "\n".join(rep)
    print(report)
    open(os.path.join(OUT, "report.md"), "w", encoding="utf-8").write(report + "\n")

    if not write:
        log("dry-run: nothing written. Re-run with --write to persist."); return

    # 1) upsert companies (new + refresh last_seen/is_active)
    up = [dict(company_id=m["company_id"], symbol=m["symbol"], name=m["name"], source=m["source"],
               country=m["country"], first_seen=TODAY, last_seen=TODAY, is_active=True) for m in new_ids]
    for i in range(0, len(up), 500):
        rest("POST", "/rest/v1/mktcap_companies", up[i:i+500])
    existing = [m["company_id"] for m in merged if m["company_id"] in cur_ids]
    for i in range(0, len(existing), 200):
        ids = ",".join('"' + e.replace('"', '') + '"' for e in existing[i:i+200])
        rest("PATCH", f'/rest/v1/mktcap_companies?company_id=in.({ids})',
             dict(last_seen=TODAY, is_active=True))
    for i in range(0, len(removed), 200):
        ids = ",".join('"' + e.replace('"', '') + '"' for e in removed[i:i+200])
        rest("PATCH", f'/rest/v1/mktcap_companies?company_id=in.({ids})', dict(is_active=False))
    # 2) snapshot
    snap = [dict(company_id=m["company_id"], as_of=TODAY, marketcap=m["marketcap"],
                 price=m["price"], rank=m["rank"]) for m in merged]
    for i in range(0, len(snap), 500):
        rest("POST", "/rest/v1/mktcap_valuations?on_conflict=company_id,as_of", snap[i:i+500],
             headers={"Prefer": "resolution=merge-duplicates,return=minimal"})
    # 3) geo stubs for new unmapped symbols (the curation queue lives in the table)
    stubs = [dict(symbol=m["symbol"], name=m["name"], country=m["country"], is_active=True,
                  source=m["source"], mapped_at=TODAY, mapped_by="auto-stub")
             for m in unmapped_new if m["symbol"] not in geo_map]
    dedup = list({s["symbol"]: s for s in stubs}.values())
    for i in range(0, len(dedup), 500):
        rest("POST", "/rest/v1/mktcap_geo?on_conflict=symbol", dedup[i:i+500],
             headers={"Prefer": "resolution=ignore-duplicates,return=minimal"})
    log(f"WRITE done: +{len(up)} companies, {len(snap)} snapshot rows, "
        f"{len(removed)} deactivated, {len(dedup)} geo stubs queued")

if __name__ == "__main__":
    main(write="--write" in sys.argv)
