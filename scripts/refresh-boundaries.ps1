# Refreshment protocol for metro boundary polygons.
#
# Why this exists
#   The boundary build cache only invalidates a metro when its (region,
#   subtype, primary) member set or anchor changes. If the build script's
#   logic itself drifts (e.g. the 2026-05-06 Tokyo build that excluded the
#   23 special wards), polygons can stay stale on disk indefinitely because
#   their input hash never changes. The age-based refresh in
#   scripts/build-metro-boundaries.py rebuilds any cached polygon older
#   than --max-age-days, catching that drift.
#
# How to use
#   Default (weekly): .\scripts\refresh-boundaries.ps1
#   Custom age:      .\scripts\refresh-boundaries.ps1 -MaxAgeDays 30
#   Full force:      .\scripts\refresh-boundaries.ps1 -Force
#
# Recommended cadence
#   Run weekly. Quarterly run with -MaxAgeDays 1 if you want a near-total
#   refresh after a substantive script change. The build cache file is
#   gitignored, so the rebuild only writes new geojson files where outputs
#   actually changed.

param(
    [int]$MaxAgeDays = 7,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

if ($Force) {
    Write-Host "Running boundary build with --force (rebuilds all)..." -ForegroundColor Cyan
    python scripts/build-metro-boundaries.py --force
} else {
    Write-Host "Running boundary build with --max-age-days $MaxAgeDays..." -ForegroundColor Cyan
    python scripts/build-metro-boundaries.py --max-age-days $MaxAgeDays
}

Write-Host "`nDone. Review changes:" -ForegroundColor Green
Write-Host "  git status --short public/data/metro-boundaries"
