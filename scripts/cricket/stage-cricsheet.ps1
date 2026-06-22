# Stage newly-added Cricsheet internationals for the InternationalCricket.xlsx
# Matches sheet. Downloads Cricsheet's "recently added" bundle, diffs it against
# the workbook, and writes a paste-ready delta CSV. It NEVER edits the workbook.
#
#   powershell -File scripts\cricket\stage-cricsheet.ps1            # last 30 days, men
#   powershell -File scripts\cricket\stage-cricsheet.ps1 -Days 7
#
# Review the printed summary, paste the CSV rows into the Matches sheet, re-run
# the ICC rankings engine, then refresh-portal.ps1. Requires python + openpyxl.

param(
    [ValidateSet(2, 7, 30)] [int]$Days = 30,
    [ValidateSet("male", "female")] [string]$Gender = "male"
)

$ErrorActionPreference = "Stop"

$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$wb   = "C:\Users\ashwi\OneDrive\Excel Files\InternationalCricket.xlsx"
$tmpwb = Join-Path $env:TEMP "InternationalCricket-stage.xlsx"
$zipUrl = "https://cricsheet.org/downloads/recently_added_${Days}_${Gender}_json.zip"
$zip = Join-Path $env:TEMP "cricsheet_recent_${Days}_${Gender}.zip"
$stage = Join-Path $repo "scripts\cricket\cricsheet_stage.py"
$out = Join-Path $repo ("data\cricket\cricsheet-delta-" + (Get-Date -Format "yyyy-MM") + ".csv")

if (-not (Test-Path -LiteralPath $wb)) { throw "Workbook not found: $wb" }

# Copy the workbook first so an open Excel session / OneDrive lock never breaks the read.
Copy-Item -LiteralPath $wb -Destination $tmpwb -Force
Write-Host "Copied workbook to $tmpwb"

Write-Host "Downloading $zipUrl"
Invoke-WebRequest -Uri $zipUrl -OutFile $zip -UseBasicParsing
Write-Host ("Downloaded {0:N0} KB" -f ((Get-Item $zip).Length / 1KB))

python $stage --zip $zip --workbook $tmpwb --out $out
if ($LASTEXITCODE -ne 0) { throw "Stager failed (exit $LASTEXITCODE)" }

Write-Host ""
Write-Host "Next: review the rows above, paste them into the Matches sheet in"
Write-Host "$wb, re-run the ICC rankings engine, then:"
Write-Host "  powershell -File scripts\cricket\refresh-portal.ps1"
