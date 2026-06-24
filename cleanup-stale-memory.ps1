# cleanup-stale-memory.ps1
# Deletes de-indexed / superseded memory files from the Metro Area Project memory folder.
# CONSERVATIVE: only (a) the commit-protocol feedback originals explicitly superseded by
# feedback_commit_and_windows_protocol.md, (b) all May 2026 session-handoff one-offs, and
# (c) one resolved note. It does NOT touch any feature/reference file or any June handoff.
# Review the printed list, then confirm. Nothing here is referenced by the current MEMORY.md.

$mem = "C:\Users\ashwi\AppData\Roaming\Claude\local-agent-mode-sessions\72950ca8-25bf-4efa-a072-cf242b751532\9b1b1944-7c0a-44be-bca1-0e7e1e7656a6\spaces\eaf4b8ee-8d3f-480a-8fd5-0ec6a547e9f2\memory"

# (a) Superseded commit-protocol feedback originals (de-indexed; consolidated into feedback_commit_and_windows_protocol.md)
$superseded = @(
  "feedback_ask_before_commit.md",
  "feedback_commit_frugally.md",
  "feedback_powershell_commit_commands.md",
  "feedback_commit_message_brevity.md",
  "feedback_repeat_all_commands.md",
  "feedback_updates_with_every_commit.md",
  "feedback_no_master_branch.md",
  "feedback_qa_before_deploy.md",
  "feedback_windows_specific_caveats.md",
  "feedback_no_edit_write_tools.md",
  "feedback_bindfs_recovery.md",
  "feedback_sandbox_truncates_existing_files.md"
)

# (c) resolved one-off
$resolved = @("project_github_pat_workflow_scope.md")

# Build the deletion list (only files that actually exist)
$targets = New-Object System.Collections.Generic.List[string]
foreach ($f in ($superseded + $resolved)) {
  $p = Join-Path $mem $f
  if (Test-Path $p) { $targets.Add($p) }
}
# (b) all May 2026 session handoffs
Get-ChildItem -Path $mem -Filter "project_session_handoff_2026_05_*.md" -ErrorAction SilentlyContinue |
  ForEach-Object { $targets.Add($_.FullName) }

if ($targets.Count -eq 0) { Write-Host "Nothing to delete (already clean)."; return }

Write-Host "The following $($targets.Count) files will be DELETED:`n" -ForegroundColor Yellow
$targets | ForEach-Object { Write-Host "  $(Split-Path $_ -Leaf)" }
$ans = Read-Host "`nProceed? (y/N)"
if ($ans -eq "y" -or $ans -eq "Y") {
  $targets | ForEach-Object { Remove-Item -Force $_ }
  Write-Host "`nDeleted $($targets.Count) files." -ForegroundColor Green
} else {
  Write-Host "Aborted. No files deleted."
}

# NOTE: June handoffs that were de-indexed (e.g. 06-01/02/03/04/08/10/15, _afl_nrl, _ghost_franchises,
# _cbb) are intentionally LEFT IN PLACE because several June "handoff" entries are actually feature
# files (project_majors_hub, project_domestic_football_hub, project_zone_zero_cup, project_wcbb_hockey_portals).
# Prune those by hand if you want, after confirming each is not a live feature/reference file.
