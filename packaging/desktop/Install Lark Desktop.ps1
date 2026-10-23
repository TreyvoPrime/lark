#Requires -Version 5.0
<#
.SYNOPSIS
  Installs Lark Desktop for the current user (no admin password).

.DESCRIPTION
  Copies this folder into %LOCALAPPDATA%\Programs\Lark, creates Start Menu
  and Desktop shortcuts, and launches Lark Desktop. Safe on school laptops.
#>
[CmdletBinding()]
param(
  [switch]$NoLaunch,
  [string]$InstallRoot = ""
)

$ErrorActionPreference = "Stop"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $InstallRoot) {
  $local = $env:LOCALAPPDATA
  if (-not $local) { $local = Join-Path $env:USERPROFILE "AppData\Local" }
  $InstallRoot = Join-Path $local "Programs\Lark"
}

Write-Host "Lark Desktop installer"
Write-Host "  From: $Here"
Write-Host "  To:   $InstallRoot"

$required = @("lark.jar", "jdk\bin\java.exe", "jdk\bin\javac.exe", "jdk\lib\jvm.cfg")
foreach ($rel in $required) {
  $path = Join-Path $Here $rel
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Missing $rel — unzip the FULL Lark Desktop package first."
  }
}

New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null

# Robocopy mirrors the package into the install folder (excl. this script's temp noise).
$robolog = Join-Path $env:TEMP "lark-desktop-install.log"
& robocopy $Here $InstallRoot /E /NFL /NDL /NJH /NJS /nc /ns /np /XF "*.log" | Out-Null
if ($LASTEXITCODE -ge 8) {
  throw "Copy failed (robocopy exit $LASTEXITCODE). See $robolog"
}

Set-Content -LiteralPath (Join-Path $InstallRoot "desktop.marker") -Value "desktop`n" -NoNewline
$feed = "https://github.com/TreyvoPrime/lark/releases/latest/download/update.json"
Set-Content -LiteralPath (Join-Path $InstallRoot "update-feed.url") -Value $feed

$launchVbs = Join-Path $InstallRoot "Launch Lark Desktop.vbs"
$launchBat = Join-Path $InstallRoot "Launch Lark Desktop.bat"
if (-not (Test-Path -LiteralPath $launchVbs) -and -not (Test-Path -LiteralPath $launchBat)) {
  throw "Desktop launcher missing after copy."
}
$target = if (Test-Path -LiteralPath $launchVbs) { $launchVbs } else { $launchBat }

function New-LarkShortcut([string]$Path, [string]$Target, [string]$WorkDir) {
  $w = New-Object -ComObject WScript.Shell
  $sc = $w.CreateShortcut($Path)
  $sc.TargetPath = $Target
  $sc.WorkingDirectory = $WorkDir
  $sc.WindowStyle = 7
  $sc.Description = "Lark Desktop — Java IDE"
  $icon = Join-Path $WorkDir "lark-icon.ico"
  if (-not (Test-Path -LiteralPath $icon)) { $icon = Join-Path $WorkDir "lark-icon.png" }
  if (Test-Path -LiteralPath $icon) { $sc.IconLocation = $icon }
  $sc.Save()
}

$programs = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
New-Item -ItemType Directory -Force -Path $programs | Out-Null
New-LarkShortcut (Join-Path $programs "Lark Desktop.lnk") $target $InstallRoot

$desktop = [Environment]::GetFolderPath("Desktop")
if ($desktop) {
  New-LarkShortcut (Join-Path $desktop "Lark Desktop.lnk") $target $InstallRoot
}

# Uninstall helper registration (per-user, no admin).
$uninst = Join-Path $InstallRoot "Uninstall Lark Desktop.ps1"
$regPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\LarkDesktop"
New-Item -Path $regPath -Force | Out-Null
Set-ItemProperty -Path $regPath -Name "DisplayName" -Value "Lark Desktop"
Set-ItemProperty -Path $regPath -Name "DisplayVersion" -Value "2.1.0"
Set-ItemProperty -Path $regPath -Name "Publisher" -Value "Lark"
Set-ItemProperty -Path $regPath -Name "InstallLocation" -Value $InstallRoot
Set-ItemProperty -Path $regPath -Name "NoModify" -Value 1 -Type DWord
Set-ItemProperty -Path $regPath -Name "NoRepair" -Value 1 -Type DWord
if (Test-Path -LiteralPath $uninst) {
  Set-ItemProperty -Path $regPath -Name "UninstallString" -Value ("powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$uninst`"")
}

Write-Host ""
Write-Host "Installed. Shortcuts are on your Desktop and Start Menu."
Write-Host "No administrator password was required."

if (-not $NoLaunch) {
  Start-Process -FilePath $target -WorkingDirectory $InstallRoot
}
