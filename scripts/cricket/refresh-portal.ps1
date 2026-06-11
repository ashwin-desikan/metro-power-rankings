# One-command refresh of the /teams/cricket portal data.
#
# Monthly cadence: after you update InternationalCricket.xlsx in OneDrive
# (new matches entered, ICC rankings recomputed by the engine), run this from
# the repo root and the portal JSONs regenerate from the master workbook:
#
#   powershell -File scripts\cricket\refresh-portal.ps1
#
# Then review and commit:  git status public/data/cricket
#
# The workbook is copied to %TEMP% first so an open Excel session or OneDrive
# sync lock never corrupts the read. Requires: python with openpyxl
# (python -m pip install openpyxl).

$ErrorActionPreference = "Stop"

$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$src = "C:\Users\ashwi\OneDrive\Excel Files\InternationalCricket.xlsx"
$tmp = Join-Path $env:TEMP "InternationalCricket-refresh.xlsx"
$etl = Join-Path $repo "scripts\cricket\build_cricket_portal_data.py"
$out = Join-Path $repo "public\data\cricket"

if (-not (Test-Path -LiteralPath $src)) {
    throw "Workbook not found: $src"
}

Copy-Item -LiteralPath $src -Destination $tmp -Force
Write-Host "Copied workbook to $tmp"

python $etl $tmp $out
if ($LASTEXITCODE -ne 0) { throw "ETL failed (exit $LASTEXITCODE)" }

Write-Host ""
Write-Host "Portal data refreshed. Review changes with:"
Write-Host "  git status public/data/cricket"
