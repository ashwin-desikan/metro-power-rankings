<#
install_watcher_task.ps1

What this is:
  Registers (or removes) the Windows Task Scheduler task that runs
  watch_workbook.ps1 every -IntervalMinutes minutes for the current user,
  plus a trigger at logon so the watcher picks back up promptly after a
  reboot or sign-in. Requires no elevation and no stored password: the task
  runs "only when the user is logged on."

Usage:
  powershell -ExecutionPolicy Bypass -File install_watcher_task.ps1
  powershell -ExecutionPolicy Bypass -File install_watcher_task.ps1 -IntervalMinutes 15
  powershell -ExecutionPolicy Bypass -File install_watcher_task.ps1 -Uninstall
#>

[CmdletBinding()]
param(
    [string]$RepoDir = 'C:\Users\ashwi\Desktop\Projects\Metro Area Project',
    [int]$IntervalMinutes = 15,
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$TaskName = 'Metro workbook sync watcher'

if ($Uninstall) {
    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($null -eq $existing) {
        Write-Host "Task '$TaskName' is not registered. Nothing to do."
        exit 0
    }
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Task '$TaskName' removed."
    exit 0
}

$scriptPath = Join-Path -Path $RepoDir -ChildPath 'scripts\metro_sync\watch_workbook.ps1'
if (-not (Test-Path -LiteralPath $scriptPath)) {
    Write-Warning "Watcher script not found at $scriptPath. The task will still be registered, but it will fail until the script exists there."
}

$powershellExe = Join-Path -Path $env:WINDIR -ChildPath 'System32\WindowsPowerShell\v1.0\powershell.exe'
$argumentList = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $scriptPath + '"'

$action = New-ScheduledTaskAction -Execute $powershellExe -Argument $argumentList

$currentUser = "$env:USERDOMAIN\$env:USERNAME"

$repeatTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) `
    -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) `
    -RepetitionDuration (New-TimeSpan -Days 3650)

$logonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser

$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 20) `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($null -ne $existing) {
    Write-Host "Task '$TaskName' already exists; replacing it."
}

Register-ScheduledTask -TaskName $TaskName `
    -Action $action `
    -Trigger @($repeatTrigger, $logonTrigger) `
    -Principal $principal `
    -Settings $settings `
    -Force | Out-Null

$registered = Get-ScheduledTask -TaskName $TaskName
$info = Get-ScheduledTaskInfo -TaskName $TaskName

Write-Host "Registered task: $($registered.TaskName)"
Write-Host "State: $($registered.State)"
Write-Host "Next run time: $($info.NextRunTime)"
