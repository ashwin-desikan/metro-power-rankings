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

# A FAILED BUILDER MUST NOT BE SILENT, AND MUST SAY WHICH ONE.
#
# Runs from an EXIT trap, not inline after the step, because guarded() calls
# fail() which `exit 1`s immediately: an inline block after the step is dead code
# on precisely the run that needs it. Found by fixing pipefail above and then
# re-running: the step correctly failed, and the only notification Ashwin got was
# alert()'s generic "step failed (rc=1): refresh policy rates (--write)", which
# names the step and not the cause. The trap fires on both paths.
#
# Why it matters that this names names: on 09-18 the three failing builders had to
# be inferred from output-file mtimes, because the mktemp is deleted and
# dispatcher.py keeps only 12 tail lines. With the log kept, the 09-19 re-run said
# it outright, and the reasons DISPROVED the standing theory that a re-run would
# fix the data:
#   bis-dk:     change on 2026-09-11 is after the build date 2026-09-08
#   build_fed:  change on 2026-09-17 is after the build date 2026-09-08
#   build_ecb:  change on 2026-09-16 is after the build date 2026-09-08
# That is common.py's guard refusing to publish a change newer than the builder's
# own BASE INPUT (still 09-08 from the container loss), not a crash in the write
# path. Re-running cannot clear it; the base inputs have to be rebuilt.
report_failed_builders() {
  [ -f "$REFRESH_LOG" ] || return 0
  grep -q "builder(s) FAILED" "$REFRESH_LOG" || return 0
  local which keep
  which="$(grep -E "builder .*: FAILED" "$REFRESH_LOG" | head -10)"
  [ -n "$which" ] || which="(no per-builder lines in the log; read the job output)"
  note "BUILDERS FAILED this run:"
  note "$which"
  # $MINI_DIR/logs, not a $LOGDIR: _common.sh defines no such variable, and under
  # its `set -u` an undefined one would abort the runner at exactly the moment a
  # builder failed, which is the worst possible time to add a second fault.
  mkdir -p "$MINI_DIR/logs" 2>/dev/null || true
  keep="$MINI_DIR/logs/economy-rates-refresh-$(date +%F).log"
  cp "$REFRESH_LOG" "$keep" 2>/dev/null && note "full refresh log kept at $keep"
  "$PY" "$MINI_DIR/notify.py" "Policy rates: builder(s) FAILED" \
    "$which
Published files may be stale. Full log: $keep" 1 || true
}
trap report_failed_builders EXIT
# 🔴 `set -o pipefail;` INSIDE the bash -c is load-bearing. _common.sh sets
# `set -uo pipefail` in the RUNNER's shell, but pipefail is a shell option and a
# new `bash -c` process does not inherit it, so guarded() received tee's status
# instead of python's. Measured on this box 2026-09-19: the idiom without it
# returns 0 with a failing python inside, and 1 the moment this is added.
#
# What that cost: on 2026-09-18 refresh.py printed "3 builder(s) FAILED" and
# sys.exit(1)'d exactly as designed, and the job still logged DONE ok 361s, went
# green on healthchecks and sent no ntfy. The ECB hike to 2.50 effective 09-16
# and Denmark's to 2.10 on 09-11 never reached the site (the live page still read
# 2.25% from 2026-06-17), and 37 bis-* files stayed stale from 09-11. The one
# mechanism meant to make a builder failure loud was disabled by the pipe that
# captures the log.
guarded "refresh policy rates (--write)" \
  bash -c "set -o pipefail; \"$PY\" scripts/macro/rates/refresh.py --write | tee \"$REFRESH_LOG\""

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
  # refresh.py (lines ~756-764) frames the block in THREE rules, not two:
  #   ====...  /  NEW RATE DECISIONS  /  ====...  /  rows  /  ====...
  # The original one-flag awk (`/^={10,}$/{if(f){f=0}}`) set its flag on the
  # heading and then cleared it on the rule IMMEDIATELY BELOW the heading,
  # before a single row could print -- so SUMMARY was ALWAYS empty and every
  # alert this block ever sent had a blank body. It is not a rare edge case:
  # because the grep gate only matches when refresh.py genuinely found
  # decisions, a fired alert ALWAYS meant real content existed and was
  # discarded. Observed live on the 2026-09-11 run ("New rate decisions
  # detected:" followed by nothing). Three states, so the opening rule is
  # consumed and only the CLOSING one stops the scan.
  SUMMARY="$(awk '/^NEW RATE DECISIONS$/{st=1;next}
                  st==1 && /^={10,}$/{st=2;next}
                  st==2 && /^={10,}$/{exit}
                  st==2' "$REFRESH_LOG" | sed 's/^  //' | head -8)"
  note "New rate decisions detected:"
  note "$SUMMARY"
  # Never push a blank body again: if the gate matched but parsing yielded
  # nothing, the PARSER is broken and that must itself be the alert, not
  # silence. Same rule as the skipped-bank block below.
  if [ -z "$SUMMARY" ]; then
    SUMMARY="refresh.py reported NEW RATE DECISIONS but the runner could not parse the block -- read the job log, the rate moves are in it."
    note "WARNING: decisions block found but parsed empty; alerting on the parse failure itself"
  fi
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
