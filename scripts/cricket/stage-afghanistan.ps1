# Stage Afghanistan men's internationals for the InternationalCricket.xlsx
# Matches sheet, harvested from Wikipedia. Cricsheet permanently withholds
# Afghanistan fixtures, so the Cricsheet stager can never see them; run this
# each month alongside stage-cricsheet.ps1.
#
#   powershell -File scripts\cricket\stage-afghanistan.ps1
#   powershell -File scripts\cricket\stage-afghanistan.ps1 -Since 2026-05-01
#
# It NEVER edits the workbook. Review the printed summary, paste the rows into
# the Matches sheet (resolve any REVIEW flags first, e.g. a Wikipedia venue
# spelling that differs from the workbook), then re-run the ICC rankings engine
# (build_icc_rankings.py) and refresh-portal.ps1. Requires python + openpyxl.

param([string]$Since = "")

$ErrorActionPreference = "Stop"

$repo  = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$wb    = "C:\Users\ashwi\OneDrive\Excel Files\InternationalCricket.xlsx"
$tmpwb = Join-Path $env:TEMP "InternationalCricket-afg-stage.xlsx"
$stage = Join-Path $repo "scripts\cricket\afghanistan_stage.py"
$out   = Join-Path $repo ("data\cricket\afghanistan-delta-" + (Get-Date -Format "yyyy-MM") + ".csv")

if (-not (Test-Path -LiteralPath $wb)) { throw "Workbook not found: $wb" }

# Copy the workbook first so an open Excel session / OneDrive lock never breaks the read.
Copy-Item -LiteralPath $wb -Destination $tmpwb -Force
Write-Host "Copied workbook to $tmpwb"

$pyArgs = @($stage, "--workbook", $tmpwb, "--out", $out)
if ($Since -ne "") { $pyArgs += @("--since", $Since) }
python @pyArgs
if ($LASTEXITCODE -ne 0) { throw "Afghanistan stager failed (exit $LASTEXITCODE)" }

Write-Host ""
Write-Host "Next: review the rows above, resolve any REVIEW flags, paste into the"
Write-Host "Matches sheet in $wb, then re-run:"
Write-Host "  python scripts\cricket\build_icc_rankings.py --write"
Write-Host "  powershell -File scripts\cricket\refresh-portal.ps1"
