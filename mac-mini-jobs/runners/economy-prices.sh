#!/usr/bin/env bash
# Weekly refresh for the /business/economy/prices layer. Same runner idiom
# as economy-housing.sh: self-test gate, guarded steps, commit_paths with
# "[vercel skip]", revalidate_ping. See jobs.toml id "economy-prices".
#
# scripts/macro/prices/build_prices.py reads a fresh copy of BLS's CPI-U via
# datahub.io (curl'd here, changes every month), the ONS CPIH series (cached,
# refreshed with --fetch-ons) and the World Bank's annual CPI index for every
# country (cached, refreshed with --fetch-wb), and writes index.json plus
# the two full monthly histories. Monthly data, so a weekly cadence catches
# each print within days rather than waiting a month. Dry-run by default;
# --write is what this runner calls. No Supabase, no key needed.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

mini_sync

guarded "self-test build_prices" "$PY" scripts/macro/prices/build_prices.py --self-test

mkdir -p _scratch/macro/prices
guarded "download US CPI-U (datahub.io)" \
  curl -fsSL -m 120 -o _scratch/macro/prices/cpiai.csv "https://raw.githubusercontent.com/datasets/cpi-us/main/data/cpiai.csv"
guarded "fetch UK CPIH (ONS)"       "$PY" scripts/macro/prices/build_prices.py --fetch-ons
guarded "fetch World Bank CPI (all countries)" "$PY" scripts/macro/prices/build_prices.py --fetch-wb
guarded "build prices (--write)"    "$PY" scripts/macro/prices/build_prices.py --write

commit_paths "Auto: consumer prices refresh [vercel skip]" \
  public/data/business/economy/prices

# Tag registered in ALLOWED_TAGS, app/api/revalidate/route.ts.
revalidate_ping "economy-prices" "/business/economy/prices"

note "done"
