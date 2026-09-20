<#
watch_workbook.ps1

What this is:
  One "tick" of the MetroAreas workbook watcher. Task Scheduler calls this
  script every 15 minutes (see install_watcher_task.ps1). Each tick checks
  whether MetroAreas.xlsx has changed since it was last handled and, if so,
  runs scripts\metro_sync\sync_workbook.py in dry-run mode first, then with
  --write when there are real changes to push to Supabase.

State and log locations (per-user, under LOCALAPPDATA by default):
  $StateDir\watch.log          - one line per tick that actually did anything
                                  (quiet ticks where nothing changed since the
                                  last handled save are NOT logged, since that
                                  is ~95 of 96 ticks a day)
  $StateDir\watch.log.1        - previous log, rotated when watch.log exceeds 1 MB
  $StateDir\watch_state.json   - { handled_mtime_utc, handled_size, last_status,
                                    last_alert_key }
  $StateDir\config.env         - optional. A line "NTFY_TOPIC=<topic>" turns on
                                  ntfy.sh push alerts in addition to Windows toasts.

Decision: edits synced by this watcher go live with the Saturday run, not
immediately. (Ruled by Ashwin, 2026-09-20.) The "synced" toast/ntfy alert
says this explicitly so nobody is surprised the change is not live yet.

How to test without touching real state or sending real writes/alerts:
  powershell -ExecutionPolicy Bypass -File watch_workbook.ps1 -DryOnly -Force -NoToast
  -Force makes it re-check the workbook even if the stamp was already handled.
  -DryOnly means it will only ever run the dry-run path (never passes --write).
  -NoToast suppresses the Windows toast (ntfy still fires if config.env is set
  up, so remove config.env too if you want a fully silent test run).
#>

[CmdletBinding()]
param(
    [string]$RepoDir = 'C:\Users\ashwi\Desktop\Projects\Metro Area Project',
    [string]$Workbook = 'C:\Users\ashwi\OneDrive\Excel Files\MetroAreas.xlsx',
    [string]$StateDir = "$env:LOCALAPPDATA\metro_sync",
    [string]$Python = 'python',
    [switch]$DryOnly,
    [switch]$Force,
    [switch]$NoToast
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function Write-Log {
    param(
        [Parameter(Mandatory = $true)][string]$Message,
        [Parameter(Mandatory = $true)][string]$LogPath
    )
    try {
        $ts = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
        $line = "$ts $Message"
        if (Test-Path -LiteralPath $LogPath) {
            $existing = Get-Item -LiteralPath $LogPath
            if ($existing.Length -gt 1MB) {
                $rotated = "$LogPath.1"
                Move-Item -LiteralPath $LogPath -Destination $rotated -Force
            }
        }
        # AppendAllText with retries, not Add-Content: under Task Scheduler the
        # Add-Content call wrote nothing and threw nothing we could see, while
        # the state file beside it was written normally (2026-09-20).
        $enc = New-Object System.Text.UTF8Encoding($false)
        $done = $false
        for ($i = 0; $i -lt 3 -and -not $done; $i++) {
            try {
                [System.IO.File]::AppendAllText($LogPath, $line + "`r`n", $enc)
                $done = $true
            } catch {
                Start-Sleep -Milliseconds 300
                if ($i -eq 2) {
                    try { [System.IO.File]::AppendAllText("$LogPath.err", "$ts log write failed: " + $_.Exception.Message + "`r`n", $enc) } catch { }
                }
            }
        }
    } catch {
        # Logging must never fail the tick.
    }
}

function Escape-XmlText {
    param([string]$Text)
    if ($null -eq $Text) { return '' }
    $t = $Text
    $t = $t.Replace('&', '&amp;')
    $t = $t.Replace('<', '&lt;')
    $t = $t.Replace('>', '&gt;')
    $t = $t.Replace('"', '&quot;')
    $t = $t.Replace("'", '&apos;')
    return $t
}

function Send-Alert {
    param(
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][string]$Body,
        [Parameter(Mandatory = $true)][string]$StateDir,
        [switch]$NoToast,
        [Parameter(Mandatory = $true)][string]$LogPath
    )

    if (-not $NoToast) {
        try {
            [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
            [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

            $escTitle = Escape-XmlText $Title
            $escBody = Escape-XmlText $Body
            $toastXml = "<toast><visual><binding template=`"ToastText02`"><text id=`"1`">$escTitle</text><text id=`"2`">$escBody</text></binding></visual></toast>"

            $xmlDoc = New-Object -TypeName Windows.Data.Xml.Dom.XmlDocument
            $xmlDoc.LoadXml($toastXml)

            $toast = New-Object -TypeName Windows.UI.Notifications.ToastNotification -ArgumentList $xmlDoc
            $appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
            $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId)
            $notifier.Show($toast)
        } catch {
            Write-Log -Message ("toast-failed: " + $_.Exception.Message) -LogPath $LogPath
        }
    }

    $configPath = Join-Path -Path $StateDir -ChildPath 'config.env'
    if (Test-Path -LiteralPath $configPath) {
        try {
            $topic = $null
            $configLines = Get-Content -LiteralPath $configPath -ErrorAction Stop
            foreach ($cl in $configLines) {
                if ($cl -match '^\s*NTFY_TOPIC=(.+?)\s*$') {
                    $topic = $matches[1]
                }
            }
            if ($topic) {
                $uri = "https://ntfy.sh/$topic"
                Invoke-RestMethod -Uri $uri -Method Post -Body $Body -Headers @{ Title = $Title } -TimeoutSec 15 | Out-Null
            }
        } catch {
            Write-Log -Message ("ntfy-failed: " + $_.Exception.Message) -LogPath $LogPath
        }
    }

    Write-Log -Message ("ALERT [$Title] $Body") -LogPath $LogPath
}

function Send-AlertOnce {
    param(
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][string]$Body,
        [Parameter(Mandatory = $true)][string]$AlertKey,
        [Parameter(Mandatory = $true)]$State,
        [Parameter(Mandatory = $true)][string]$StateDir,
        [switch]$NoToast,
        [Parameter(Mandatory = $true)][string]$LogPath
    )
    if ($State.last_alert_key -eq $AlertKey) {
        Write-Log -Message ("alert-suppressed (already alerted for this key): $Title") -LogPath $LogPath
        return $State
    }
    Send-Alert -Title $Title -Body $Body -StateDir $StateDir -NoToast:$NoToast -LogPath $LogPath
    $State.last_alert_key = $AlertKey
    return $State
}

function Get-WatchState {
    param([Parameter(Mandatory = $true)][string]$Path)
    $default = [PSCustomObject]@{
        handled_mtime_utc = $null
        handled_size      = $null
        last_status       = $null
        last_alert_key    = $null
    }
    if (Test-Path -LiteralPath $Path) {
        try {
            $raw = Get-Content -LiteralPath $Path -Raw -ErrorAction Stop
            if ($raw -and $raw.Trim().Length -gt 0) {
                $obj = $raw | ConvertFrom-Json -ErrorAction Stop
                if (-not (Get-Member -InputObject $obj -Name handled_mtime_utc -ErrorAction SilentlyContinue)) {
                    $obj | Add-Member -NotePropertyName handled_mtime_utc -NotePropertyValue $null
                }
                if (-not (Get-Member -InputObject $obj -Name handled_size -ErrorAction SilentlyContinue)) {
                    $obj | Add-Member -NotePropertyName handled_size -NotePropertyValue $null
                }
                if (-not (Get-Member -InputObject $obj -Name last_status -ErrorAction SilentlyContinue)) {
                    $obj | Add-Member -NotePropertyName last_status -NotePropertyValue $null
                }
                if (-not (Get-Member -InputObject $obj -Name last_alert_key -ErrorAction SilentlyContinue)) {
                    $obj | Add-Member -NotePropertyName last_alert_key -NotePropertyValue $null
                }
                return $obj
            }
        } catch {
            # Corrupt state file: fall through to a fresh default.
        }
    }
    return $default
}

function Save-WatchState {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)]$State
    )
    try {
        $json = $State | ConvertTo-Json -Depth 5
        Set-Content -LiteralPath $Path -Value $json -Encoding UTF8
    } catch {
        # Best effort; a failed state save should not fail the tick.
    }
}

function Format-ProcArg {
    param([string]$Value)
    if ($Value -match '\s') {
        $escaped = $Value -replace '"', '\"'
        return '"' + $escaped + '"'
    }
    return $Value
}

function Invoke-SyncProcess {
    param(
        [Parameter(Mandatory = $true)][string]$Python,
        [Parameter(Mandatory = $true)][string]$RepoDir,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    $argLine = (($Arguments | ForEach-Object { Format-ProcArg $_ })) -join ' '

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $Python
    $psi.Arguments = $argLine
    $psi.WorkingDirectory = $RepoDir
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.EnvironmentVariables['PYTHONIOENCODING'] = 'utf-8'

    $result = [PSCustomObject]@{
        ExitCode = -1
        StdOut   = ''
        StdErr   = ''
        TimedOut = $false
    }

    $proc = New-Object System.Diagnostics.Process
    $proc.StartInfo = $psi

    try {
        $proc.Start() | Out-Null
        $stdoutTask = $proc.StandardOutput.ReadToEndAsync()
        $stderrTask = $proc.StandardError.ReadToEndAsync()

        $exited = $proc.WaitForExit(900000)
        if (-not $exited) {
            $result.TimedOut = $true
            try { $proc.Kill() } catch { }
            try { $proc.WaitForExit(5000) } catch { }
        } else {
            $proc.WaitForExit()
        }

        try { $result.StdOut = $stdoutTask.Result } catch { $result.StdOut = '' }
        try { $result.StdErr = $stderrTask.Result } catch { $result.StdErr = '' }

        if (-not $result.TimedOut) {
            $result.ExitCode = $proc.ExitCode
        }
    } catch {
        $result.StdErr = ($result.StdErr + "`nInvoke-SyncProcess exception: " + $_.Exception.Message)
    } finally {
        try { $proc.Dispose() } catch { }
    }

    return $result
}

function Get-LastJsonLine {
    param([string]$StdOut)
    if ([string]::IsNullOrEmpty($StdOut)) { return $null }
    # @() matters: one line of output makes the pipeline return a STRING, and
    # indexing a string returns a character ("{"), not the line.
    $lines = @($StdOut -split "`r?`n" | Where-Object { $_.Trim().Length -gt 0 })
    if ($lines.Count -eq 0) { return $null }
    $lastLine = $lines[$lines.Count - 1]
    try {
        return ($lastLine | ConvertFrom-Json -ErrorAction Stop)
    } catch {
        return $null
    }
}

function Get-LastLines {
    param([string]$Text, [int]$Count)
    if ([string]::IsNullOrEmpty($Text)) { return @() }
    $lines = @($Text -split "`r?`n" | Where-Object { $_.Length -gt 0 })
    if ($lines.Count -le $Count) { return $lines }
    return $lines[($lines.Count - $Count)..($lines.Count - 1)]
}

# Extracts { Status, Reasons, Sheets } from a parsed --json payload, handling
# both the normal shape {"summary": {...}, "log": [...]} and the early
# HoldError shape {"status": "held", "reasons": [...]}.
function Read-SyncResult {
    param($Parsed, [int]$ExitCode, [bool]$TimedOut)

    $r = [PSCustomObject]@{
        Status  = $null
        Reasons = @()
        Sheets  = $null
        Ok      = $false
    }

    if ($TimedOut) {
        return $r
    }
    if ($null -eq $Parsed) {
        if ($ExitCode -eq 20) {
            $r.Status = 'held'
            $r.Reasons = @('sync_workbook.py exited 20 (held) but stdout was not parseable JSON')
        }
        return $r
    }

    $props = $Parsed.PSObject.Properties.Name
    if ($props -contains 'summary') {
        $r.Status = $Parsed.summary.status
        if ($Parsed.summary.PSObject.Properties.Name -contains 'reasons') {
            $r.Reasons = @($Parsed.summary.reasons)
        }
        if ($Parsed.summary.PSObject.Properties.Name -contains 'sheets') {
            $r.Sheets = $Parsed.summary.sheets
        }
        $r.Ok = $true
    } elseif ($props -contains 'status') {
        $r.Status = $Parsed.status
        if ($props -contains 'reasons') {
            $r.Reasons = @($Parsed.reasons)
        }
        $r.Ok = $true
    }

    return $r
}

# ---------------------------------------------------------------------------
# Main tick
# ---------------------------------------------------------------------------

function Invoke-Tick {
    param(
        [string]$RepoDir,
        [string]$Workbook,
        [string]$StateDir,
        [string]$Python,
        [switch]$DryOnly,
        [switch]$Force,
        [switch]$NoToast
    )

    $ErrorActionPreference = 'Stop'

    if (-not (Test-Path -LiteralPath $StateDir)) {
        New-Item -ItemType Directory -Path $StateDir -Force | Out-Null
    }
    $logPath = Join-Path -Path $StateDir -ChildPath 'watch.log'
    $statePath = Join-Path -Path $StateDir -ChildPath 'watch_state.json'

    $state = Get-WatchState -Path $statePath

    if (-not (Test-Path -LiteralPath $Workbook)) {
        Write-Log -Message 'workbook-missing' -LogPath $logPath
        $alertKey = 'MetroAreas sync ERROR|workbook-missing'
        $state = Send-AlertOnce -Title 'MetroAreas sync ERROR' -Body "Workbook not found at $Workbook." `
            -AlertKey $alertKey -State $state -StateDir $StateDir -NoToast:$NoToast -LogPath $logPath
        $state.last_status = 'workbook-missing'
        Save-WatchState -Path $statePath -State $state
        return 0
    }

    $fileInfo = Get-Item -LiteralPath $Workbook
    $mtimeUtc = $fileInfo.LastWriteTimeUtc.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
    $size = $fileInfo.Length

    if (-not $Force -and $state.handled_mtime_utc -eq $mtimeUtc -and $state.handled_size -eq $size) {
        # Nothing changed since we last handled it. Quiet exit, no log line.
        return 0
    }

    $wbDir = Split-Path -Path $Workbook -Parent
    $wbName = Split-Path -Path $Workbook -Leaf
    $lockPath = Join-Path -Path $wbDir -ChildPath ('~$' + $wbName)
    # Same rule as sync_workbook.py: a lock file only means "Excel has it open"
    # when it is at least as new as the workbook. Excel leaves stale lock files
    # behind after a crash; the one in this folder on 2026-09-20 was dated
    # July 2025 and would have blocked every tick for ever.
    if (Test-Path -LiteralPath $lockPath) {
        $lockInfo = Get-Item -LiteralPath $lockPath -Force
        if ($lockInfo.LastWriteTimeUtc -ge $fileInfo.LastWriteTimeUtc) {
            Write-Log -Message 'excel-open, will retry' -LogPath $logPath
            return 0
        }
    }

    $ageSeconds = ((Get-Date).ToUniversalTime() - $fileInfo.LastWriteTimeUtc).TotalSeconds
    if ($ageSeconds -lt 180) {
        Write-Log -Message 'settling' -LogPath $logPath
        return 0
    }

    $scriptRelPath = 'scripts\metro_sync\sync_workbook.py'
    $dryArgs = @($scriptRelPath, '--json', '--workbook', $Workbook)
    $dryProc = Invoke-SyncProcess -Python $Python -RepoDir $RepoDir -Arguments $dryArgs
    $dryParsed = Get-LastJsonLine -StdOut $dryProc.StdOut
    $dry = Read-SyncResult -Parsed $dryParsed -ExitCode $dryProc.ExitCode -TimedOut $dryProc.TimedOut

    if ($dryProc.TimedOut -or -not $dry.Ok) {
        $reasonText = 'dry-run failed'
        if ($dryProc.TimedOut) { $reasonText = 'dry-run timed out after 900s' }
        elseif ($null -eq $dryParsed) { $reasonText = 'dry-run stdout was not parseable JSON' }
        Write-Log -Message ("error: $reasonText (exit $($dryProc.ExitCode))") -LogPath $logPath
        foreach ($ln in (Get-LastLines -Text $dryProc.StdErr -Count 5)) {
            Write-Log -Message ("  stderr: $ln") -LogPath $logPath
        }
        $alertKey = "MetroAreas sync ERROR|$mtimeUtc"
        $body = "$reasonText. Exit code $($dryProc.ExitCode)."
        $lastErr = @(Get-LastLines -Text $dryProc.StdErr -Count 1)
        if ($lastErr.Count -gt 0) { $body = "$body Last stderr: $($lastErr[0])" }
        $state = Send-AlertOnce -Title 'MetroAreas sync ERROR' -Body $body -AlertKey $alertKey `
            -State $state -StateDir $StateDir -NoToast:$NoToast -LogPath $logPath
        $state.last_status = 'error'
        Save-WatchState -Path $statePath -State $state
        return 0
    }

    if ($dry.Status -eq 'no_change') {
        $state.handled_mtime_utc = $mtimeUtc
        $state.handled_size = $size
        $state.last_status = 'no_change'
        Write-Log -Message 'no_change' -LogPath $logPath
        Save-WatchState -Path $statePath -State $state
        return 0
    }

    if ($dry.Status -eq 'held') {
        $state.handled_mtime_utc = $mtimeUtc
        $state.handled_size = $size
        $state.last_status = 'held'
        $reasonsText = ($dry.Reasons -join ' | ')
        Write-Log -Message "held: $reasonsText" -LogPath $logPath

        $firstTwo = @($dry.Reasons | Select-Object -First 2)
        $body = $firstTwo -join "`n"
        $alertKey = "MetroAreas sync HELD|$mtimeUtc"
        $state = Send-AlertOnce -Title 'MetroAreas sync HELD' -Body $body -AlertKey $alertKey `
            -State $state -StateDir $StateDir -NoToast:$NoToast -LogPath $logPath

        Save-WatchState -Path $statePath -State $state
        return 0
    }

    if ($dry.Status -eq 'dry_run') {
        $anyChanges = $false
        $changedSheetLines = @()
        if ($null -ne $dry.Sheets) {
            foreach ($p in $dry.Sheets.PSObject.Properties) {
                $s = $p.Value
                if ($s.chunks_changed -gt 0 -or $s.chunks_removed -gt 0) {
                    $anyChanges = $true
                    $before = $s.rows_before
                    if ($null -eq $before) { $before = '(new)' }
                    $changedSheetLines += "$($p.Name): $before -> $($s.rows_after), $($s.chunks_changed) chunks"
                }
            }
        }

        if (-not $anyChanges) {
            $state.handled_mtime_utc = $mtimeUtc
            $state.handled_size = $size
            $state.last_status = 'no_change'
            Write-Log -Message 'no_change (dry run found no diffs)' -LogPath $logPath
            Save-WatchState -Path $statePath -State $state
            return 0
        }

        if ($DryOnly) {
            Write-Log -Message ('would-write: ' + ($changedSheetLines -join '; ')) -LogPath $logPath
            $state.last_status = 'dry_only_changes_pending'
            Save-WatchState -Path $statePath -State $state
            return 0
        }

        $writeArgs = $dryArgs + @('--write')
        $writeProc = Invoke-SyncProcess -Python $Python -RepoDir $RepoDir -Arguments $writeArgs
        $writeParsed = Get-LastJsonLine -StdOut $writeProc.StdOut
        $write = Read-SyncResult -Parsed $writeParsed -ExitCode $writeProc.ExitCode -TimedOut $writeProc.TimedOut

        if ($writeProc.TimedOut -or -not $write.Ok -or $write.Status -ne 'written') {
            $reasonText = 'write failed'
            if ($writeProc.TimedOut) { $reasonText = 'write timed out after 900s' }
            elseif ($null -eq $writeParsed) { $reasonText = 'write stdout was not parseable JSON' }
            elseif ($write.Status -eq 'held') { $reasonText = 'write held: ' + ($write.Reasons -join ' | ') }
            elseif ($null -ne $write.Status) { $reasonText = "write returned unexpected status '$($write.Status)'" }

            Write-Log -Message ("error: $reasonText (exit $($writeProc.ExitCode))") -LogPath $logPath
            foreach ($ln in (Get-LastLines -Text $writeProc.StdErr -Count 5)) {
                Write-Log -Message ("  stderr: $ln") -LogPath $logPath
            }
            $alertKey = "MetroAreas sync ERROR|$mtimeUtc"
            $body = "$reasonText. Exit code $($writeProc.ExitCode)."
            $lastErr = @(Get-LastLines -Text $writeProc.StdErr -Count 1)
            if ($lastErr.Count -gt 0) { $body = "$body Last stderr: $($lastErr[0])" }
            $state = Send-AlertOnce -Title 'MetroAreas sync ERROR' -Body $body -AlertKey $alertKey `
                -State $state -StateDir $StateDir -NoToast:$NoToast -LogPath $logPath
            $state.last_status = 'error'
            Save-WatchState -Path $statePath -State $state
            return 0
        }

        # Written successfully.
        $writtenLines = @()
        if ($null -ne $write.Sheets) {
            foreach ($p in $write.Sheets.PSObject.Properties) {
                $s = $p.Value
                if ($s.chunks_changed -gt 0 -or $s.chunks_removed -gt 0) {
                    $before = $s.rows_before
                    if ($null -eq $before) { $before = '(new)' }
                    $writtenLines += "$($p.Name): $before -> $($s.rows_after), $($s.chunks_changed) chunks"
                }
            }
        }
        if ($writtenLines.Count -eq 0) { $writtenLines = $changedSheetLines }

        $state.handled_mtime_utc = $mtimeUtc
        $state.handled_size = $size
        $state.last_status = 'written'
        Write-Log -Message ('written: ' + ($writtenLines -join '; ')) -LogPath $logPath

        $bodyLines = @($writtenLines | Select-Object -First 6)
        $body = ($bodyLines -join "`n") + "`nGoes live with the Saturday run."
        $alertKey = "MetroAreas synced to Supabase|$mtimeUtc"
        $state = Send-AlertOnce -Title 'MetroAreas synced to Supabase' -Body $body -AlertKey $alertKey `
            -State $state -StateDir $StateDir -NoToast:$NoToast -LogPath $logPath

        Save-WatchState -Path $statePath -State $state
        return 0
    }

    # Unrecognized status string: treat as an error, do not record the stamp.
    Write-Log -Message "error: unrecognized status '$($dry.Status)' from dry run" -LogPath $logPath
    $alertKey = "MetroAreas sync ERROR|$mtimeUtc"
    $state = Send-AlertOnce -Title 'MetroAreas sync ERROR' -Body "Unrecognized status '$($dry.Status)' from sync_workbook.py." `
        -AlertKey $alertKey -State $state -StateDir $StateDir -NoToast:$NoToast -LogPath $logPath
    $state.last_status = 'error'
    Save-WatchState -Path $statePath -State $state
    return 0
}

# ---------------------------------------------------------------------------
# Entry point: never throw to the scheduler.
# ---------------------------------------------------------------------------

try {
    $exitCode = Invoke-Tick -RepoDir $RepoDir -Workbook $Workbook -StateDir $StateDir -Python $Python `
        -DryOnly:$DryOnly -Force:$Force -NoToast:$NoToast
    exit $exitCode
} catch {
    try {
        if (-not (Test-Path -LiteralPath $StateDir)) {
            New-Item -ItemType Directory -Path $StateDir -Force | Out-Null
        }
        $logPath = Join-Path -Path $StateDir -ChildPath 'watch.log'
        Write-Log -Message ("FATAL: " + $_.Exception.Message) -LogPath $logPath
    } catch {
        # Even logging the fatal error failed; nothing more we can do.
    }
    exit 1
}
