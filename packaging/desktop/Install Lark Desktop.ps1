#Requires -Version 5.0
<#
.SYNOPSIS
  Installs Lark Desktop for the current user (no admin password).

.DESCRIPTION
  Copies this folder into %LOCALAPPDATA%\Programs\Lark, creates Start Menu
  and Desktop shortcuts to Start Lark Desktop.bat. Runtime stays in app\.
#>
[CmdletBinding()]
param(
  [switch]$NoLaunch,
  [string]$InstallRoot = ""
)

$ErrorActionPreference = "Stop"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
# Installer may live in app\ — package root is parent when present.
$PackageRoot = $Here
if ((Split-Path -Leaf $Here) -eq "app") {
  $PackageRoot = Split-Path -Parent $Here
}

if (-not $InstallRoot) {
  $local = $env:LOCALAPPDATA
  if (-not $local) { $local = Join-Path $env:USERPROFILE "AppData\Local" }
  $InstallRoot = Join-Path $local "Programs\Lark"
}

Write-Host "Lark Desktop installer"
Write-Host "  From: $PackageRoot"
Write-Host "  To:   $InstallRoot"

$jarApp = Join-Path $PackageRoot "app\lark.jar"
$jarRoot = Join-Path $PackageRoot "lark.jar"
$jarOk = (Test-Path -LiteralPath $jarApp) -or (Test-Path -LiteralPath $jarRoot)
$required = @(
  @{ Path = (Join-Path $PackageRoot "jdk\bin\java.exe"); Name = "jdk\bin\java.exe" },
  @{ Path = (Join-Path $PackageRoot "jdk\bin\javac.exe"); Name = "jdk\bin\javac.exe" },
  @{ Path = (Join-Path $PackageRoot "jdk\lib\jvm.cfg"); Name = "jdk\lib\jvm.cfg" }
)
if (-not $jarOk) { throw "Missing app\lark.jar — unzip the FULL Lark Desktop package first." }
foreach ($item in $required) {
  if (-not (Test-Path -LiteralPath $item.Path)) {
    throw "Missing $($item.Name) — unzip the FULL Lark Desktop package first."
  }
}

New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null

$robolog = Join-Path $env:TEMP "lark-desktop-install.log"
& robocopy $PackageRoot $InstallRoot /E /NFL /NDL /NJH /NJS /nc /ns /np /XF "*.log" | Out-Null
if ($LASTEXITCODE -ge 8) {
  throw "Copy failed (robocopy exit $LASTEXITCODE). See $robolog"
}

$appDir = Join-Path $InstallRoot "app"
New-Item -ItemType Directory -Force -Path $appDir | Out-Null
Set-Content -LiteralPath (Join-Path $appDir "desktop.marker") -Value "desktop`n" -NoNewline
$feed = "https://github.com/TreyvoPrime/lark/releases/latest/download/update.json"
Set-Content -LiteralPath (Join-Path $appDir "update-feed.url") -Value $feed

# Soft-hide the app runtime folder on Windows (still accessible).
try { attrib +H "$appDir" 2>$null } catch { }

$launchBat = Join-Path $InstallRoot "Start Lark Desktop.bat"
if (-not (Test-Path -LiteralPath $launchBat)) {
  $launchBat = Join-Path $InstallRoot "Launch Lark Desktop.bat"
}
if (-not (Test-Path -LiteralPath $launchBat)) {
  throw "Start Lark Desktop.bat missing after copy."
}
$launchVbs = Join-Path $appDir "Start Lark Desktop.vbs"
$target = if (Test-Path -LiteralPath $launchVbs) { $launchVbs } else { $launchBat }

function New-LarkShortcut([string]$Path, [string]$Target, [string]$WorkDir) {
  $w = New-Object -ComObject WScript.Shell
  $sc = $w.CreateShortcut($Path)
  $sc.TargetPath = $Target
  $sc.WorkingDirectory = $WorkDir
  $sc.WindowStyle = 7
  $sc.Description = "Lark Desktop — Java IDE"
  $icon = Join-Path $WorkDir "app\lark-icon.ico"
  if (-not (Test-Path -LiteralPath $icon)) { $icon = Join-Path $WorkDir "app\lark-icon.png" }
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

$uninst = Join-Path $appDir "Uninstall Lark Desktop.ps1"
if (-not (Test-Path -LiteralPath $uninst)) {
  $uninst = Join-Path $InstallRoot "Uninstall Lark Desktop.ps1"
}
$regPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\LarkDesktop"
New-Item -Path $regPath -Force | Out-Null
Set-ItemProperty -Path $regPath -Name "DisplayName" -Value "Lark Desktop"
Set-ItemProperty -Path $regPath -Name "InstallLocation" -Value $InstallRoot
Set-ItemProperty -Path $regPath -Name "Publisher" -Value "Lark"
if (Test-Path -LiteralPath $uninst) {
  Set-ItemProperty -Path $regPath -Name "UninstallString" -Value "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$uninst`""
}

Write-Host "Installed."
if (-not $NoLaunch) {
  Start-Process -FilePath $target -WorkingDirectory $InstallRoot
}
