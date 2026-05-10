# Run the Overture-to-workbook matcher for the seven new countries.
#
# Why this exists
#   Each new country (IE, CN, AT, CH, BE, BR, RU) has thousands of workbook
#   rows that need Subtype / Admin Level / Region (ISO 3166-2) / Primary Name
#   filled in before the boundary builder can render polygons.
#   scripts/match-overture-to-workbook.py proposes those values per row by
#   reading each country's per-country Overture parquet and mapping each row
#   to its parent county via locality-centroid containment lookup.
#
# Prerequisites
#   1. Run .\scripts\extract-overture-new-countries.ps1 first to produce
#      the seven per-country parquet files in MapData.
#   2. Python deps: openpyxl, pyarrow, shapely, pandas (already on the host).
#
# How to use
#   .\scripts\match-overture-new-countries.ps1                # all seven, parent mode
#   .\scripts\match-overture-new-countries.ps1 -Mode direct  # row's own admin row
#   .\scripts\match-overture-new-countries.ps1 -MetroOnly    # skip rows with no Metro Area
#   .\scripts\match-overture-new-countries.ps1 IE BR         # specific countries
#
# Output
#   Overture-Match-Suggestions/{IE,CN,AT,CH,BE,BR,RU}.xlsx
#   Each xlsx mirrors the source workbook columns plus Suggested Subtype /
#   Admin Level / Region (ISO 3166-2) / Primary Name, plus Confidence (HIGH /
#   MED / LOW / NONE), Match Method, Score, and two Alt suggestions.
#   Rows are color-coded by confidence; sort by Confidence descending in
#   Excel and accept HIGH in bulk.
#
# Cadence
#   Re-run when the workbook gains new rows for any of the seven countries,
#   or when you add additional countries to the routing in the matcher's
#   COUNTRY_ROUTE dict.

param(
    [ValidateSet("parent","direct")]
    [string]$Mode = "parent",
    [switch]$MetroOnly,
    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$Countries
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$pyArgs = @("scripts/match-overture-to-workbook.py", "--mode", $Mode)
if ($MetroOnly) { $pyArgs += "--metro-only" }
if ($Countries) { $pyArgs += $Countries }

Write-Host "Running matcher: python $($pyArgs -join ' ')" -ForegroundColor Cyan
python @pyArgs

if ($LASTEXITCODE -ne 0) {
    Write-Host "`nMatcher failed (exit $LASTEXITCODE)" -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "`nDone. Suggestions written to .\Overture-Match-Suggestions\" -ForegroundColor Green
Write-Host "Next: open each xlsx, sort by Confidence descending, paste verified rows into MetroAreas.xlsx." -ForegroundColor Green
