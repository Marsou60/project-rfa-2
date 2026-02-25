$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [Environment]::GetFolderPath('Desktop')
$ShortcutPath = Join-Path $DesktopPath "RFA Application.lnk"
$ScriptPath = (Resolve-Path "lancer-tauri.bat").Path
$WorkingDir = (Get-Location).Path

$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $ScriptPath
$Shortcut.WorkingDirectory = $WorkingDir
$Shortcut.Description = "Lancer l'application RFA (Tauri Desktop)"
$Shortcut.IconLocation = "C:\Windows\System32\shell32.dll,137"
$Shortcut.Save()

Write-Host "Raccourci cree sur le bureau: RFA Application.lnk" -ForegroundColor Green
