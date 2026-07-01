# ============================================================
# Metro Power Rankings - One-Click Site Update (PowerShell)
# ============================================================
# Usage:
#   .\update-site.ps1 [-XlsxPath path\to\MetroAreas.xlsx] [-SkipSync] [-Force]
#
# What this does:
#   0. Syncs the latest MetroAreas.xlsx from OneDrive into the project
#      root if the source is newer (skipped if -XlsxPath is passed or
#      -SkipSync is set). Pass -Force to copy source over the project
#      copy even when the project mtime is newer (e.g. after a manual
#      restore that bumped the local timestamp).
#   1. Reads MetroAreas.xlsx and extracts JSON data files
#   2. Commits the updated data to git
#   3. Pushes to GitHub (which triggers Vercel auto-deploy)
#
# The site will be live ~60 seconds after this script finishes.
# ============================================================

[CmdletBinding()]
param(
    [string]$XlsxPath,
    [switch]$SkipSync,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

# Resolve the Python launcher (prefer the py launcher on Windows, fall back
# to python or python3).
function Resolve-Python {
    foreach ($name in @('py', 'python', 'python3')) {
        $cmd = Get-Command $name -ErrorAction SilentlyContinue
        if ($cmd) { return $cmd.Source }
    }
    throw "Could not find a Python interpreter on PATH (looked for py, python, python3)."
}

$python = Resolve-Python
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

$explicitPath = $false
if ($XlsxPath) {
    $explicitPath = $true
} else {
    $XlsxPath = ".\MetroAreas.xlsx"
}

Write-Host ""
Write-Host "======================================"
Write-Host "  Metro Power Rankings - Site Update"
Write-Host "======================================"
Write-Host ""

# Step 0: Sync the master xlsx from OneDrive if newer.
if (-not $explicitPath -and -not $SkipSync) {
    Write-Host "Step 0/3: Syncing MetroAreas.xlsx from OneDrive..."
    $syncArgs = @("scripts\sync_source_xlsx.py")
    if ($Force) { $syncArgs += "--force" }
    & $python @syncArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "Sync did not complete cleanly (exit $LASTEXITCODE)." -ForegroundColor Yellow
        if ($LASTEXITCODE -eq 2) {
            Write-Host "Project copy is newer than source. If you trust the OneDrive file, re-run with -Force." -ForegroundColor Yellow
        } elseif ($LASTEXITCODE -eq 4) {
            Write-Host "Source xlsx failed integrity check. Close the workbook in Excel, wait for OneDrive to finish syncing, then retry." -ForegroundColor Yellow
        } else {
            Write-Host "Common causes: source not found, copy/backup failed." -ForegroundColor Yellow
        }
        Write-Host "Aborting before extract to avoid running on stale or partial data." -ForegroundColor Yellow
        exit $LASTEXITCODE
    }
    Write-Host ""
}

if (-not (Test-Path $XlsxPath)) {
    Write-Host "ERROR: Cannot find $XlsxPath" -ForegroundColor Red
    Write-Host "Usage: .\update-site.ps1 [-XlsxPath path\to\MetroAreas.xlsx]"
    exit 1
}

Write-Host "Source: $XlsxPath"
Write-Host ""

# Step 1: Extract data
Write-Host "Step 1/3: Extracting data from Excel..."
& $python "scripts\extract.py" $XlsxPath
if ($LASTEXITCODE -ne 0) {
    Write-Host "Extract failed (exit $LASTEXITCODE). Aborting." -ForegroundColor Red
    exit $LASTEXITCODE
}
Write-Host ""

Write-Host "Step 1b/3: Rebuilding corporate-power.json (market caps for World Power Rankings)..."
& $python "scripts\corporate\build-corporate-power.py" $XlsxPath
if ($LASTEXITCODE -ne 0) { Write-Host "corporate-power build skipped." -ForegroundColor Yellow }
Write-Host ""

# Step 2: Commit
Write-Host "Step 2/3: Committing updated data..."
git add public/data/
$today = Get-Date -Format "yyyy-MM-dd"
git commit -m "data: update metro rankings $today"
if ($LASTEXITCODE -ne 0) {
    Write-Host "No data changes to commit."
}
Write-Host ""

# Step 3: Push
Write-Host "Step 3/3: Pushing to GitHub (triggers Vercel deploy)..."
git push
if ($LASTEXITCODE -ne 0) {
    Write-Host "Push failed (exit $LASTEXITCODE)." -ForegroundColor Red
    exit $LASTEXITCODE
}
Write-Host ""

Write-Host "======================================"
Write-Host "  Done! Site will update in ~60 seconds."
Write-Host "======================================"
Write-Host ""
