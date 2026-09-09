#!/usr/bin/env bash
# Weekly refresh for the /business/economy/housing layer. Same runner idiom
# as economy-rates.sh: self-test gate, guarded steps, commit_paths with
# "[vercel skip]", revalidate_ping. See jobs.toml id "economy-housing".
#
# scripts/macro/housing/build_housing.py reads FHFA's all-series master file
# (17 MB, downloaded fresh each run: FHFA revises back quarters) and the US
# CPI (World Bank, cached; --fetch-cpi refreshes it), joins the 410 MSAs to
# the site's metros, and writes index.json plus one file per MSA. Dry-run by
# default; --write is what this runner calls. No Supabase, no key needed.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

mini_sync

guarded "self-test build_housing" "$PY" scripts/macro/housing/build_housing.py --self-test

mkdir -p _scratch/macro/housing
guarded "download FHFA hpi_master.csv" \
  curl -fsSL -m 300 -o _scratch/macro/housing/HPI_master.csv "https://www.fhfa.gov/hpi/download/monthly/hpi_master.csv"
guarded "fetch US CPI (World Bank)" "$PY" scripts/macro/housing/build_housing.py --fetch-cpi
guarded "build housing (--write)"   "$PY" scripts/macro/housing/build_housing.py --write

commit_paths "Auto: house prices refresh [vercel skip]" \
  public/data/business/economy/housing

# Tag registered in ALLOWED_TAGS, app/api/revalidate/route.ts.
revalidate_ping "economy-housing" "/business/economy/housing"

note "done"
