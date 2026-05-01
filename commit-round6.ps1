$ErrorActionPreference = "Stop"
Set-Location "C:\Users\ashwi\Desktop\Projects\Metro Area Project"

Write-Host "==> Refreshing git index (clears stat drift)" -ForegroundColor Cyan
git update-index --refresh | Out-Null

Write-Host "==> Resetting staging area to HEAD" -ForegroundColor Cyan
git reset HEAD | Out-Null

Write-Host "==> Staging Round 6 files" -ForegroundColor Cyan
git add MetroAreas.xlsx
git add scripts/extract.py
git add "app/rankings/[slug]/page.tsx"
git add public/data/meta.json
git add public/data/metros.json
git add public/data/regions.json
git add public/data/details/

Write-Host "==> Staged file count:" -ForegroundColor Cyan
(git diff --cached --name-only | Measure-Object -Line).Lines

Write-Host "==> Running TypeScript check (final QA)" -ForegroundColor Cyan
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) {
  Write-Host "TypeScript errors - aborting commit." -ForegroundColor Red
  exit 1
}

Write-Host "==> Committing" -ForegroundColor Cyan
git commit -F .commit-msg-round6.txt
if ($LASTEXITCODE -ne 0) {
  Write-Host "Commit failed." -ForegroundColor Red
  exit 1
}

Write-Host "==> Pushing to origin/main" -ForegroundColor Cyan
git push origin main
if ($LASTEXITCODE -ne 0) {
  Write-Host "Push failed." -ForegroundColor Red
  exit 1
}

Write-Host "==> Done. Vercel will pick up the push automatically." -ForegroundColor Green
git log --oneline -3
