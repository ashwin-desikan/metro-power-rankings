"""Merge sources, diff against Supabase, write the weekly snapshot.

Replicates the Excel Merged Master: public + unicorns-not-IPOd + private@3x,
overrides applied, sorted by valuation, geo-joined. Dry-run by default;
pass --write to persist. Report always printed and written to out/report.md.
"""
import csv, datetime, json, os, sys
from common import rest, select, select_all, log, in_list

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
SWING_LIMIT = 0.05   # abort if any source count moves >5% week-over-week

# The metro curation queue is a STANDING BACKLOG, not a weekly delta. 6,805 of
# the 12,996 active companies have no metro, and 7,720 of those geo rows carry
# mapped_by='seed' -- they arrived unmapped in the 2026-07-23 workbook seed and
# were never mapped there either. Only ~53 were ever queued by this pipeline.
# Reporting all of them every Saturday is the same forty names forever, so the
# report separates what is actionable this week from the standing list.
NOTABLE_CAP_USD = 10e9   # 14 companies today; below this is a small-cap tail

# Terminal state for the queue. A company whose HQ is in no valid metro -- Dot
# Foods in Mount Sterling, Illinois, Arctic Slope Regional in Utqiagvik -- is
# never going to get one, and under "leave null and skip" it reappeared at the
# top of the queue every week, indistinguishable from one nobody had looked at.
# mapped_by='no-metro' with metro still null records that REVIEW, which is a
# decision and not a guess: the "pipeline NEVER guesses" rule is about the
# pipeline inventing a metro, not about a human recording that none applies.
NO_METRO = "no-metro"

# HELD, not resolved. The company's HQ is known and sits in a real city that is
# simply absent from mktcap_valid_metros -- Chaozhou (~2.5M), Chifeng, Tongling.
# The absence is patchy rather than principled (Huainan and Bengbu are listed,
# Tongling and Anqing are not; Shantou is, Chaozhou is not), so 'no-metro' would
# encode a gap in the metro list as a permanent fact about the company. Adding
# metro areas is its own decision with its own criteria and is not on the near
# horizon, so these sit out of the weekly alert but stay COUNTED and named in
# the report, ready to re-enter the queue the day their metro is added.
METRO_GAP = "metro-gap"

TODAY = datetime.date.today().isoformat()

def load_sources():
    pub = list(csv.DictReader(open(os.path.join(OUT, "source_public.csv"), encoding="utf-8")))
    uni = list(csv.DictReader(open(os.path.join(OUT, "source_unicorns.csv"), encoding="utf-8")))
    return pub, uni

def write_unicorns(uni):
    """Full weekly rewrite of mktcap_unicorns from this run's CB Insights fetch.

    No FK references mktcap_unicorns (verified 2026-08-29), so delete-all +
    reinsert is safe. id is GENERATED ALWAYS AS IDENTITY (confirmed 2026-08-29
    after a failed run: a first attempt passed explicit ids, Postgres rejected
    the insert since IDENTITY columns refuse client-supplied values without
    OVERRIDING SYSTEM VALUE, and the DELETE just before it had already
    committed -- leaving the table empty until this fix + a re-run). Omit id
    entirely and let the identity sequence assign it.
    """
    rest("DELETE", "/rest/v1/mktcap_unicorns?id=gte.0")
    rows = [dict(name=r["Company"], valuation_bn=float(r["ValuationBn"]),
                 date_joined=r["DateJoined"] or None, country=r["Country"],
                 city=r["City"], industry=r["Industry"], investors=r["Investors"])
            for r in uni]
    for i in range(0, len(rows), 500):
        rest("POST", "/rest/v1/mktcap_unicorns", rows[i:i+500])
    log(f"WROTE mktcap_unicorns: {len(rows)} rows (full rewrite)")

def merge(pub, uni, private_rows, changes, overrides):
    """Returns (merged, ipo_dedup, skipped_renames).

    merged: sorted rows, dicts with source,name,symbol,marketcap,price,country."""
    # Recycled-ticker guard (Shadow Saturday 2, 2026-08-08): if BOTH sides of a
    # symbol_changes rename appear in this week's feed (with live mcap), they are
    # two distinct companies sharing a ticker's history (PHNX.L->PHX.AE,
    # LIFE->ATYR class), NOT a rename. Applying it folds one company into the
    # other's id and deactivates a live company. Skip it and surface a warning.
    feed_syms = {r["Symbol"] for r in pub if r["Symbol"] and float(r["marketcap"] or 0) > 0}
    remap, skipped = {}, []
    for c in changes:
        if c["old_symbol"] in feed_syms and c["new_symbol"] in feed_syms:
            skipped.append((c["old_symbol"], c["new_symbol"]))
        else:
            remap[c["old_symbol"]] = c["new_symbol"]
    for old, new in skipped:
        log(f"WARNING: rename {old} -> {new} SKIPPED: both symbols live in this "
            f"week's feed (recycled-ticker signature). Fix mktcap_symbol_changes.")
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
    return merged, ipo_dedup, skipped

def main(write=False):
    pub, uni = load_sources()
    private_rows = select_all("/rest/v1/mktcap_private?select=name,revenue,country", "id")
    changes = select_all("/rest/v1/mktcap_symbol_changes?select=old_symbol,new_symbol", "old_symbol")
    overrides = select("/rest/v1/mktcap_overrides?select=symbol,field,value")
    current = select_all("/rest/v1/mktcap_companies?select=company_id,symbol,name,source,is_active", "company_id")
    geo = select_all("/rest/v1/mktcap_geo?select=symbol,metro,mapped_by", "symbol")
    metros = {m["metro"] for m in select_all("/rest/v1/mktcap_valid_metros?select=metro", "metro")}
    prev = {c["source"]: 0 for c in current}
    for c in current:
        if c["is_active"]: prev[c["source"]] = prev.get(c["source"], 0) + 1

    merged, ipo_dedup, skipped_renames = merge(pub, uni, private_rows, changes, overrides)
    counts = {}
    for m in merged: counts[m["source"]] = counts.get(m["source"], 0) + 1

    # sanity gates (assume our own code/fetch first: abort loudly, never write garbage)
    for src, n in counts.items():
        p = prev.get(src, 0)
        if p and abs(n - p) / p > SWING_LIMIT:
            sys.exit(f"FATAL: {src} count swung {p} -> {n} (>{SWING_LIMIT:.0%}); refusing to write. "
                     f"Inspect out/source_*.csv — likely a fetch/parse problem, not reality.")

    geo_map = {g["symbol"]: g["metro"] for g in geo}
    no_metro = {g["symbol"] for g in geo if (g.get("mapped_by") or "") == NO_METRO}
    metro_gap = {g["symbol"] for g in geo if (g.get("mapped_by") or "") == METRO_GAP}
    cur_ids = {c["company_id"] for c in current}
    active_ids = {c["company_id"] for c in current if c["is_active"]}
    new_ids = [m for m in merged if m["company_id"] not in cur_ids]
    this_ids = {m["company_id"] for m in merged}
    # Deactivation guard (belt to merge()'s rename guard): never deactivate a
    # primary company (company_id == symbol) whose symbol is still live in the
    # feed — its id vanishing from this week's merge means a rename/collision
    # rerouted it, not that it fell off. Collision shells (#N ids) are exempt:
    # their symbol staying in the feed is exactly how a shell legitimately dies.
    feed_syms = {r["Symbol"] for r in pub if r["Symbol"] and float(r["marketcap"] or 0) > 0}
    cur_sym = {c["company_id"]: c["symbol"] for c in current}
    removed_all = sorted(active_ids - this_ids)
    spared = [cid for cid in removed_all if cid == cur_sym.get(cid) and cid in feed_syms]
    removed = [cid for cid in removed_all if cid not in spared]
    for cid in spared:
        log(f"WARNING: NOT deactivating {cid}: symbol still live in feed but id "
            f"missing from merge (rename/collision suspect). Investigate before trusting this write.")
    unmapped_new = [m for m in new_ids if m["symbol"] not in geo_map]
    # Bug fixed 2026-08-29: this used to report only unmapped_new (symbols new
    # to mktcap_companies THIS run). Once a symbol gets auto-stubbed into
    # mktcap_geo (below), it has a geo row and drops out of that set even
    # though metro is still null -- so it silently vanished from every future
    # week's queue. still_unmapped instead checks metro truthiness across the
    # WHOLE merged set, so a stubbed-but-never-mapped company keeps showing up
    # until it actually gets a metro. Caught when two same-day re-runs (after
    # the first found 22 unmapped) both reported "none" although nothing had
    # been mapped in between.
    # Reviewed-and-no-metro drops out of the queue for good; everything else
    # without a metro stays in it, however long it has been there.
    still_unmapped = [m for m in merged
                      if not geo_map.get(m["symbol"])
                      and m["symbol"] not in no_metro and m["symbol"] not in metro_gap]
    held = [m for m in merged if m["symbol"] in metro_gap]
    new_id_set = {m["company_id"] for m in new_ids}
    queue_new = [m for m in still_unmapped if m["company_id"] in new_id_set]
    queue_notable = [m for m in still_unmapped
                     if float(m.get("marketcap") or 0) >= NOTABLE_CAP_USD]
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
           f"- rename guard: {len(skipped_renames)} recycled-ticker renames skipped: {skipped_renames[:8]}",
           f"- deactivation guard: {len(spared)} kept active (symbol live in feed): {spared[:8]}",
           # Machine-readable first: run-mktcap-refresh.sh builds the ntfy from
           # these counts rather than from the name list, so the phone alert can
           # say how big the backlog is instead of showing forty of it.
           f"- METRO QUEUE COUNTS: unmapped={len(still_unmapped)} new={len(queue_new)} "
           f"notable={len(queue_notable)} (>=${NOTABLE_CAP_USD/1e9:.0f}B) "
           f"resolved-no-metro={len(no_metro)} held-metro-gap={len(metro_gap)}",
           # Named, not just counted: a hold that nobody can see is a hold that
           # never gets lifted when the metro list finally moves.
           f"- METRO QUEUE (held, awaiting a metro area): " +
           (", ".join(f'{m["name"]} [{m["symbol"]}] {m["country"]}' for m in held[:40]) or "none"),
           f"- METRO QUEUE (new this run): " +
           (", ".join(f'{m["name"]} [{m["symbol"]}] ({m["country"]})' for m in queue_new[:40]) or "none"),
           f"- METRO QUEUE (notable, unmapped): " +
           (", ".join(f'{m["name"]} [{m["symbol"]}] ${float(m["marketcap"] or 0)/1e9:.1f}B ({m["country"]})'
                      for m in queue_notable[:40]) or "none"),
           # LAST on purpose: run-mktcap-refresh.sh greps `METRO QUEUE | tail -1`
           # into mktcap-review-queue.md, which is the only channel the
           # mktcap-weekly-metro-mapping-research cloud routine can read (its
           # sandbox cannot reach ntfy). Capped at 200, not 40, because that
           # file is a work queue for a machine, not a phone notification.
           f"- METRO QUEUE (unmapped — for Ashwin): " +
           (", ".join(f'{m["name"]} [{m["symbol"]}] ({m["country"]})' for m in still_unmapped[:200]) or "none")]
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
        rest("PATCH", f'/rest/v1/mktcap_companies?company_id=in.({in_list(existing[i:i+200])})',
             dict(last_seen=TODAY, is_active=True))
    for i in range(0, len(removed), 200):
        rest("PATCH", f'/rest/v1/mktcap_companies?company_id=in.({in_list(removed[i:i+200])})',
             dict(is_active=False))
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
    # 4) unicorns table: full weekly rewrite from this run's CB fetch (previously
    # read into the merge but never persisted — mktcap_unicorns sat stale since
    # 2026-06-29 until the 2026-08-25 sunset-plan fix).
    write_unicorns(uni)
    log(f"WRITE done: +{len(up)} companies, {len(snap)} snapshot rows, "
        f"{len(removed)} deactivated, {len(dedup)} geo stubs queued, "
        f"{len(uni)} unicorns rewritten")

if __name__ == "__main__":
    main(write="--write" in sys.argv)
