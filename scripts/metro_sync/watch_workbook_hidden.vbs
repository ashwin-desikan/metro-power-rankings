' Launches watch_workbook.ps1 with no console window. Task Scheduler runs this via wscript.exe;
' powershell.exe started this way never creates a console, so nothing flashes on the desktop.
' (Interactive tasks flash a window even with -WindowStyle Hidden; S4U needs an elevated prompt.)
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & dir & "\watch_workbook.ps1"""
sh.Run cmd, 0, False
