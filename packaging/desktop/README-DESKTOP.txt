Lark Desktop 2.1.0 — enterprise install

This is the installed app track (Start Menu / Applications shortcut), not the
portable zip. Portable zips are still available from the same release page.

Windows (no admin password)
  1. Unzip lark-desktop-windows.zip to a temporary folder
  2. Right-click "Install Lark Desktop.ps1" → Run with PowerShell
     (or: powershell -ExecutionPolicy Bypass -File "Install Lark Desktop.ps1")
  3. Lark installs under %LOCALAPPDATA%\Programs\Lark and opens itself
  4. Use the Desktop / Start Menu shortcut next time

Mac / Linux
  1. Unzip the desktop package for your OS
  2. Double-click "Install Lark Desktop.command" (Mac) or run it from a terminal
  3. Lark lives in ~/Applications/Lark Desktop

Updates
  When a new release is published, Lark Desktop prompts you to update on launch.
  Click Update now, then Restart Lark. Your projects stay in ~/.lark/projects.

Uninstall
  Windows: run "Uninstall Lark Desktop.ps1" in the install folder
  Mac/Linux: delete ~/Applications/Lark Desktop (and the .desktop / .app shortcut)

Portable zip users: keep using Start Lark.bat / start-lark.sh — nothing changes.
