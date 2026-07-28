Set-Location "C:\Users\ashwi\Desktop\Projects\Metro Area Project"
$msg = @"
Extend completed-season club football hubs back to 2016-17 and add a cross-season Trends section. Six new season hubs (2016-17 through 2021-22) join the existing four; each carries the club power ranking, five-year UEFA country coefficients, European competitions, final domestic tables and cup winners including the old Club World Cup, with the 2016-17 pedigree using UEFA's era-faithful team-coefficient method since it predates the 2018 club-points switch. Coupe de la Ligue and the FIFA Club World Cup are wired for the older years, and empty Conference League and Copa Libertadores cards are suppressed before 2021. The Seasons page gains a Trends section built from a new auto-scaling football-trends.json: the country coefficient race, a club power-ranking bump chart in club colours, and a form-versus-pedigree scatter, filterable by year range, country and top-N. The season browser is regrouped into decade rows to scale back to the 1950s, and season labels standardise on the 25/26 form.
"@
git commit -m $msg
$env:GIT_EDITOR = "true"
$stashed = $false
$o = git stash push -m wip-before-push 2>&1; Write-Host $o
if ($o -notmatch 'No local changes') { $stashed = $true }
$pushed = $false
for ($i = 1; $i -le 30 -and -not $pushed; $i++) {
    git pull --rebase origin main
    while ((Test-Path ".git\rebase-merge") -or (Test-Path ".git\rebase-apply")) {
        $bad = git diff --name-only --diff-filter=U | Where-Object { $_ -and $_ -ne "HANDOFF.md" }
        if ($bad) { Write-Host ">>> UNEXPECTED CONFLICT: $bad"; git rebase --abort; if ($stashed) { git stash pop }; $env:GIT_EDITOR=""; exit 1 }
        git checkout --theirs HANDOFF.md
        git add HANDOFF.md
        git rebase --continue
    }
    git push origin main
    if ($LASTEXITCODE -eq 0) { $pushed = $true; Write-Host ">>> PUSHED on attempt $i" }
    else { Write-Host ">>> mini beat me, retry $i"; Start-Sleep -Seconds 1 }
}
if (-not $pushed) { Write-Host ">>> NOT PUSHED after 30 tries" }
if ($stashed) { Write-Host ">>> restoring local changes"; git stash pop }
$env:GIT_EDITOR = ""
git log --oneline -3
