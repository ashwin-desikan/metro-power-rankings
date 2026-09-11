#!/usr/bin/env bash
# Weekly refresh for the /business/economy policy-rate layer
# (scripts/macro/RATES-CONTRACT.md). BIS publishes WS_CBPOL weekly on
# Thursday, so this runs Fridays 07:30 UTC -- see jobs.toml, id
# "economy-rates". Same runner idiom as business-daily.sh: self-test gate,
# guarded steps, commit_paths with "[vercel skip]", revalidate_ping.
#
# scripts/macro/rates/refresh.py is the whole pipeline in one entry point:
# incremental fetch (BIS SDMX API + FRED/ECB/Riksbank/BoC/Norges direct,
# last 90 days), merge onto the stored daily levels, rerun every builder and
# build_index.py, append public/data/business/economy/rates/changelog.json
# on any new decision. It is dry-run by default; --write is what actually
# fetches live and commits, so it is what this runner calls.
#
# Needs SUPABASE_SERVICE_KEY (fail-open, same as business-daily.sh's series
# writes -- a missing key logs loudly and the JSON build still ships) and
# REVALIDATE_SECRET in config.env. ONE runner.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

mini_sync

# Self-tests before any network call: refresh.py's own pure decision logic
# (dedup, overlap-safety, the unreachable-source path) plus the Supabase
# loader's row-shaping. Both run fully offline against
# scripts/macro/rates/fixtures/, never touching a real bank file.
guarded "self-test refresh"           "$PY" scripts/macro/rates/refresh.py --self-test
guarded "self-test load_policy_rates" "$PY" scripts/macro/rates/load_policy_rates.py --self-test

# One-time bootstrap of the BIS bulk file. Every builder streams
# _scratch/macro/bis/WS_CBPOL_csv_flat.csv (470 MB, untracked) and merges the
# incremental cache on top; without it all twelve builders fail on the first
# run of a fresh clone (measured on the Windows box 2026-09-09). The zip is
# 4 MB at BIS's static bulk URL (verified 200, content-length 4102141, the
# same bytes as the copy on the Windows box). Downloaded once, never refreshed
# here: the weekly SDMX fetch is what keeps the levels current.
BIS_FLAT="_scratch/macro/bis/WS_CBPOL_csv_flat.csv"
bootstrap_bis_bulk() {
  [ -s "$BIS_FLAT" ] && return 0
  mkdir -p _scratch/macro/bis || return 1
  curl -fsSL -m 300 -o _scratch/macro/bis_cbpol.zip \
    "https://data.bis.org/static/bulk/WS_CBPOL_csv_flat.zip" || return 1
  unzip -o -q _scratch/macro/bis_cbpol.zip -d _scratch/macro/bis || return 1
  [ -s "$BIS_FLAT" ]
}
guarded "bootstrap BIS bulk CBPOL (first run only)" bootstrap_bis_bulk

# Every OWN-SOURCE builder's full-history base input, restored if absent.
#
# These are not the incremental fetch. refresh.py deliberately REFUSES to seed a
# base from its own 90-day window ("run the full builder download on this machine
# first"), because doing so would silently truncate a century of history to a
# quarter. Without the base on disk the source is marked unreachable, its builder
# is SKIPPED, and -- this is the part that bites -- the job still exits 0 and its
# healthcheck still goes green.
#
# That is exactly what happened. The 09-08 container loss took these files with
# it, and from then until 2026-09-11 the fed, ECB, Riksbank and BoE builders never
# ran at all. Nothing was visibly wrong, because none of those four banks happened
# to move in that window, so a full rebuild produced byte-identical files. The
# cost was entirely prospective: the ECB hike announced 09-10 takes effect
# 09-16, and would have been silently missed on the 09-18 run.
#
# BoC is in this list for a different reason worth keeping: its INCREMENTAL source
# (V39079) is reachable, so refresh.py never flagged it unreachable, yet its
# builder needs a second file (V122530, the monthly 1935-on series) that was also
# lost. It failed outright rather than being skipped. Reachability of the
# incremental feed says nothing about whether the base is present.
base_input() {   # base_input <file> <url>
  [ -s "_scratch/macro/$1" ] && return 0
  echo "  base input missing, downloading: $1"
  curl -fsSL -m 180 -o "_scratch/macro/$1" "$2" || return 1
  [ -s "_scratch/macro/$1" ]
}
bootstrap_base_inputs() {
  mkdir -p _scratch/macro || return 1
  local today; today="$(date +%F)"
  local fred="https://fred.stlouisfed.org/graph/fredgraph.csv?id"
  local ecb="https://data-api.ecb.europa.eu/service/data/FM/D.U2.EUR.4F.KR"
  local swea="https://api.riksbank.se/swea/v1/Observations"
  base_input dfedtar.csv        "$fred=DFEDTAR"                                   || return 1
  base_input dfedtaru.csv       "$fred=DFEDTARU"                                  || return 1
  base_input dfedtarl.csv       "$fred=DFEDTARL"                                  || return 1
  base_input ecb_dfr.csv        "$ecb.DFR.LEV?format=csvdata&startPeriod=1999-01-01"    || return 1
  base_input ecb_mrr.csv        "$ecb.MRR_FR.LEV?format=csvdata&startPeriod=1999-01-01" || return 1
  base_input riksbank_disc.json "$swea/SECBDISCEFF/1907-11-11/$today"             || return 1
  base_input riksbank_marg.json "$swea/SECBMARGEFF/1987-01-30/$today"             || return 1
  base_input riksbank_repo.json "$swea/SECBREPOEFF/1994-06-01/$today"             || return 1
  base_input boe.csv            "https://datahub.io/core/interest-rates-gb/r/data.csv"  || return 1
  base_input boc_v122530.csv    "https://www.bankofcanada.ca/valet/observations/V122530/csv?start_date=1935-01-01" || return 1
  # DELIBERATELY NOT HERE: boc_bankrate.csv and norges_kpra_daily.json. Both were
  # already on disk on 2026-09-11 (the incremental fetch maintains them), so
  # neither was downloaded or self-tested as part of this restore. Adding a URL
  # for a file whose on-disk format has not been verified risks writing CSV into
  # a .json the builder parses -- trading a skipped builder for a corrupted one,
  # which is strictly worse. Every entry above was fetched by hand and put
  # through its builder's own --self-test before being written down here. If
  # either of those two ever goes missing, verify the format first, then add it.
  return 0
}
guarded "bootstrap own-source base inputs (restores any that are missing)" bootstrap_base_inputs

# The real run: fetch, merge, rerun every builder + build_index.py, write.
# Captured to a temp file so the runner can grep it for a "NEW RATE
# DECISIONS" block afterward without refresh.py needing to know anything
# about how this mini alerts.
REFRESH_LOG="$(mktemp)"
guarded "refresh policy rates (--write)" \
  bash -c "\"$PY\" scripts/macro/rates/refresh.py --write | tee \"$REFRESH_LOG\""

commit_paths "Auto: policy rates refresh [vercel skip]" \
  public/data/business/economy/rates

# Runs even on a no-change week; a redundant flush is harmless. The tag
# ("economy-rates") is registered in ALLOWED_TAGS, app/api/revalidate/route.ts.
revalidate_ping "economy-rates" "/business/economy" "/business/economy/compare"

# The watcher: a genuine push notification naming the bank and the move,
# distinct from _common.sh's alert() (which only fires on job failure).
# Fail-open: a notify.py hiccup here must never fail an otherwise-successful
# refresh, so it is deliberately NOT wrapped in guarded/fail.
if grep -q "NEW RATE DECISIONS" "$REFRESH_LOG"; then
  SUMMARY="$(awk '/^NEW RATE DECISIONS$/{f=1;next} /^={10,}$/{if(f){f=0}} f' "$REFRESH_LOG" | sed 's/^  //' | head -8)"
  note "New rate decisions detected:"
  note "$SUMMARY"
  "$PY" "$MINI_DIR/notify.py" "Policy rate decisions" "$SUMMARY" 0 || true
fi

# A SKIPPED BANK MUST NOT BE SILENT. refresh.py degrades gracefully when a
# source is unreachable: it reports it, leaves that bank's file untouched, and
# exits 0 so one dead endpoint never takes down the other twelve. That is the
# right behaviour and is not being changed. What was missing is that the report
# went nowhere -- the job went green, the healthcheck went green, and between
# the 09-08 container loss and 2026-09-11 the fed, ECB, Riksbank and BoE
# builders did not run once, with nothing anywhere saying so. The bootstrap
# above should make this rare; this makes it audible when it happens anyway.
if grep -q "source(s) unreachable this run" "$REFRESH_LOG"; then
  UNREACH="$(awk '/source\(s\) unreachable this run/{f=1} f' "$REFRESH_LOG" | sed 's/^ *//' | head -10)"
  note "UNREACHABLE sources this run -- those banks were NOT rebuilt:"
  note "$UNREACH"
  "$PY" "$MINI_DIR/notify.py" "Policy rates: source(s) unreachable, banks not rebuilt" \
    "$UNREACH

The job still exited 0 by design -- one dead endpoint must not take down the other twelve. But those banks' files are untouched, and a rate move there will be MISSED until this clears." 1 || true
fi
rm -f "$REFRESH_LOG"

note "done"
