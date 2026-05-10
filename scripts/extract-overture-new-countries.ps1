# Pull Overture division_area data for the next batch of countries to wire
# into the boundary builder.
#
# Countries: Ireland, China, Austria, Switzerland, Belgium, Brazil, Russia,
#            Australia, South Korea (nine total).
#
# Why this exists
#   Each country added to COUNTRY_PARQUET_MAP in build-metro-boundaries.py
#   needs its own per-country Overture parquet so the boundary build does
#   not re-scan the 5.8 GB global file. scripts/extract-overture-parquet.py
#   does the slicing; this wrapper hands it the right ISO codes.
#
# How to use
#   .\scripts\extract-overture-new-countries.ps1
#   .\scripts\extract-overture-new-countries.ps1 -OutDir 'somewhere\else'
#
# After running
#   1. Confirm the new files exist: overture-{IE,CN,AT,CH,BE,BR,RU,AU,KR}.parquet
#   2. Wire each into build-metro-boundaries.py:
#        - COUNTRY_PARQUET_MAP entry pointing at the new file
#        - COUNTRY_SHEET_MAP entry choosing 'counties' or 'municipality'
#        - COUNTRY_TO_ISO entry mapping the canonical country name to ISO
#   3. Populate the four Overture lookup columns (Subtype, Admin Level,
#      Region ISO, Primary Name) on each country's rows in the chosen sheet.
#      AU, KR, BR, AT, CH, and CN are already populated as of 2026-05-10.
#   4. Run the boundary build to render polygons.
#
# Cost / footprint
#   One full pass over the 5.8 GB global parquet, streaming. Typical runtime:
#   3-7 minutes. CN, BR, RU dominate the output. AU, KR are mid-sized; the
#   rest are under 50 MB each.

param(
    [string]$OutDir = ""
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$env:OVERTURE_EXTRACT_COUNTRIES = "IE,CN,AT,CH,BE,BR,RU,AU,KR"
if ($OutDir) {
    $env:OVERTURE_PER_COUNTRY_DIR = $OutDir
}

Write-Host "Extracting Overture parquets for: $($env:OVERTURE_EXTRACT_COUNTRIES)" -ForegroundColor Cyan
if ($env:OVERTURE_PER_COUNTRY_DIR) {
    Write-Host "Output dir: $($env:OVERTURE_PER_COUNTRY_DIR)" -ForegroundColor Cyan
}

python scripts/extract-overture-parquet.py

if ($LASTEXITCODE -ne 0) {
    Write-Host "`nExtraction failed (exit $LASTEXITCODE)" -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "`nDone. Next steps:" -ForegroundColor Green
Write-Host "  1. Add COUNTRY_PARQUET_MAP / COUNTRY_SHEET_MAP / COUNTRY_TO_ISO entries in scripts\build-metro-boundaries.py"
Write-Host "  2. Populate Counties or Municipality Overture lookup columns for these countries (AU, KR, BR, AT, CH, CN already done)"
Write-Host "  3. Run .\scripts\refresh-boundaries.ps1 to build the new polygons"
