# =====================================================================
# apply-offside-game.ps1
# Lands the "Offside or Onside?" kids' game into the Metro Area Project.
#   1. Copies the game into public/play/games/
#   2. Adds the GAMES entry in app/play/page.tsx (after "Odd One Out")
#   3. Bumps the game count Eight -> Nine in the /play metadata
#   4. Amends the 2026-06-24 release block in lib/releases.ts
#   5. Runs a typecheck
# Anchor-asserted and idempotent. Does NOT commit. Review, then commit.
# =====================================================================

$ErrorActionPreference = "Stop"

# --- paths (edit if your layout differs) ---
$repo = "C:\Users\ashwi\Desktop\Projects\Metro Area Project"
$src  = "C:\Users\ashwi\OneDrive\Documents\Claude\Projects\Metro Area Project\offside-or-onside.html"

# --- non-ASCII chars built by code point so the script stays pure ASCII ---
$ndash = [char]0x2013   # en dash, used in "7-10" age ranges

function Read-Text($p){ [System.IO.File]::ReadAllText($p) }
function Write-Text($p,$c){ [System.IO.File]::WriteAllText($p, $c, (New-Object System.Text.UTF8Encoding($false))) }
function Assert-Contains($text,$anchor,$label){
  if(-not $text.Contains($anchor)){ throw "ANCHOR NOT FOUND ($label). Aborting with no changes written." }
}

# --- sanity: are we in the right repo? ---
$pagePath = Join-Path $repo "app\play\page.tsx"
$relPath  = Join-Path $repo "lib\releases.ts"
$gamesDir = Join-Path $repo "public\play\games"
foreach($p in @($pagePath,$relPath,$gamesDir)){
  if(-not (Test-Path $p)){ throw "Expected path missing: $p  -- is `$repo correct?" }
}
if(-not (Test-Path $src)){ throw "Game source not found: $src" }

Write-Host "Repo OK. Applying patch..." -ForegroundColor Cyan

# ---------------------------------------------------------------------
# 1. Copy the game file
# ---------------------------------------------------------------------
$dest = Join-Path $gamesDir "offside-or-onside.html"
Copy-Item -LiteralPath $src -Destination $dest -Force
Write-Host "  [1/4] Copied game -> public/play/games/offside-or-onside.html" -ForegroundColor Green

# ---------------------------------------------------------------------
# 2 + 3. app/play/page.tsx : add GAMES entry, bump count
# ---------------------------------------------------------------------
$page = Read-Text $pagePath
$eol  = if($page -match "`r`n"){ "`r`n" } else { "`n" }

$oddAnchor = '  { title: "Odd One Out", emoji: "\u{1F914}", file: "odd-one-out.html", ages: "6' + $ndash + '10", blurb: "Spot the team that does not belong." },'
$newGame   = '  { title: "Offside or Onside?", emoji: "\u{1F6A9}", file: "offside-or-onside.html", ages: "7' + $ndash + '10", blurb: "Spot the offside, and see how the offside rule changed over time." },'

if($page.Contains("offside-or-onside.html")){
  Write-Host "  [2/4] page.tsx already has the game entry, skipping." -ForegroundColor Yellow
} else {
  Assert-Contains $page $oddAnchor "page.tsx GAMES Odd One Out row"
  $page = $page.Replace($oddAnchor, $oddAnchor + $eol + $newGame)
}

$countAnchor = "Eight free learning games"
if($page.Contains($countAnchor)){
  $page = $page.Replace($countAnchor, "Nine free learning games")
} elseif(-not $page.Contains("Nine free learning games")){
  Write-Warning "  Could not find game-count phrase in page.tsx metadata; left as-is."
}
Write-Text $pagePath $page
Write-Host "  [2/4] Updated app/play/page.tsx" -ForegroundColor Green

# ---------------------------------------------------------------------
# 4. lib/releases.ts : amend the 2026-06-24 block
# ---------------------------------------------------------------------
$rel = Read-Text $relPath
$eol2 = if($rel -match "`r`n"){ "`r`n" } else { "`n" }

# 4a. bump the count word inside the existing bullet (ASCII-only substring)
$relCount = "New /play section: eight free"
if($rel.Contains($relCount)){
  $rel = $rel.Replace($relCount, "New /play section: nine free")
}

# 4b. add a new bullet after the last item of the 2026-06-24 block
$relAnchor = '      "Each blends UK (KS1/KS2) and US Grade 2 curricula, and every reveal links back to the team or metro page on the site.",'
$newBullet = '      "New game Offside or Onside?: learn football' + "'" + 's offside rule from real on-pitch positions, including the Tevez 2010 and 2022 World Cup calls, with each round linking back to the site.",'

if($rel.Contains("Offside or Onside?")){
  Write-Host "  [3/4] releases.ts already has the offside note, skipping." -ForegroundColor Yellow
} else {
  Assert-Contains $rel $relAnchor "releases.ts 2026-06-24 last bullet"
  $rel = $rel.Replace($relAnchor, $relAnchor + $eol2 + $newBullet)
  # brevity guard: <=220 chars
  $bulletLen = ($newBullet.Trim().Trim(',').Trim('"')).Length
  if($bulletLen -gt 220){ throw "Release bullet is $bulletLen chars (>220). Aborting." }
}
Write-Text $relPath $rel
Write-Host "  [3/4] Updated lib/releases.ts (bullet OK)" -ForegroundColor Green

# ---------------------------------------------------------------------
# 5. typecheck (best effort, non-fatal)
# ---------------------------------------------------------------------
Write-Host "  [4/4] Typechecking..." -ForegroundColor Cyan
Push-Location $repo
try {
  $ran = $false
  if(Test-Path "package.json"){
    $pkg = Get-Content "package.json" -Raw | ConvertFrom-Json
    if($pkg.scripts.PSObject.Properties.Name -contains "typecheck"){ npm run -s typecheck; $ran = $true }
    elseif($pkg.scripts.PSObject.Properties.Name -contains "check"){ npm run -s check; $ran = $true }
  }
  if(-not $ran){ npx --no-install tsc --noEmit }
  Write-Host "  Typecheck passed." -ForegroundColor Green
} catch {
  Write-Warning "  Typecheck step failed or unavailable: $_"
  Write-Warning "  Run your normal type check before pushing."
} finally { Pop-Location }

Write-Host ""
Write-Host "DONE. Files changed (NOT committed):" -ForegroundColor Cyan
Write-Host "  + public/play/games/offside-or-onside.html"
Write-Host "  ~ app/play/page.tsx"
Write-Host "  ~ lib/releases.ts"
Write-Host ""
Write-Host "Next: open /play locally to test, then when happy:" -ForegroundColor Cyan
Write-Host '  git add "public/play/games/offside-or-onside.html" app/play/page.tsx lib/releases.ts'
Write-Host '  git commit -m "Add Offside or Onside? kids game to /play"'
