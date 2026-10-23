#Requires -Version 5.0
<#
.SYNOPSIS
  Removes the per-user Lark Desktop install (no admin).
#>
[CmdletBinding()]
param()

$ErrorActionPreference = "Continue"
$local = $env:LOCALAPPDATA
if (-not $local) { $local = Join-Path $env:USERPROFILE "AppData\Local" }
$InstallRoot = Join-Path $local "Programs\Lark"

Write-Host "Removing Lark Desktop from $InstallRoot"

# Stop running copies gently.
Get-Process -Name "java","javaw" -ErrorAction SilentlyContinue | Where-Object {
  $_.Path -like "*\Lark\*" -or $_.Path -like "*\Programs\Lark\*"
} | Stop-Process -Force -ErrorAction SilentlyContinue

$desktop = [Environment]::GetFolderPath("Desktop")
@(
  (Join-Path $desktop "Lark Desktop.lnk"),
  (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Lark Desktop.lnk")
) | ForEach-Object {
  if ($_ -and (Test-Path -LiteralPath $_)) { Remove-Item -LiteralPath $_ -Force }
}

Remove-Item -LiteralPath "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\LarkDesktop" -Recurse -Force -ErrorAction SilentlyContinue

if (Test-Path -LiteralPath $InstallRoot) {
  Remove-Item -LiteralPath $InstallRoot -Recurse -Force
}

$run = Join-Path $local "Lark\run"
if (Test-Path -LiteralPath $run) {
  Remove-Item -LiteralPath $run -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Lark Desktop removed. Your projects in .lark\projects were kept."
