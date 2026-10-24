@echo off
rem ============================================================================
rem  Safe wipe — removes Lark install leftovers from this Windows account.
rem  Only deletes folders that clearly contain Lark (lark.jar / Start Lark).
rem  Does NOT blank the desktop or kill Windows Explorer.
rem ============================================================================
setlocal EnableExtensions
title Wipe Lark From This PC

echo.
echo ============================================================
echo   WIPE LARK FROM THIS PC
echo ============================================================
echo.
echo This will CLOSE Lark and DELETE only Lark data:
echo   - %%LOCALAPPDATA%%\Lark                 ^(run cache^)
echo   - %%LOCALAPPDATA%%\Programs\Lark        ^(Desktop install^)
echo   - %%USERPROFILE%%\.lark                 ^(settings + projects^)
echo   - Desktop / Downloads / Documents folders that contain lark.jar
echo   - Temp extract folders that contain lark.jar
echo.
echo It will NOT:
echo   - Uninstall Java
echo   - Delete random folders that merely mention "lark"
echo   - Kill Windows Explorer or blank your desktop
echo.
echo Type YES in all caps to continue.
set /p "CONFIRM=Confirm: "
if /I not "%CONFIRM%"=="YES" (
  echo Cancelled.
  pause
  exit /b 1
)

echo.
echo [1/5] Stopping Lark Java processes only...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='SilentlyContinue';" ^
  "Get-CimInstance Win32_Process -Filter \"Name='java.exe' OR Name='javaw.exe'\" |" ^
  " Where-Object {" ^
  "   $cl = $_.CommandLine;" ^
  "   if ([string]::IsNullOrEmpty($cl)) { return $false }" ^
  "   return ($cl -match 'lark\.jar') -or ($cl -match '[\\/]Lark[\\/]run[\\/]') -or ($cl -match '[\\/]Programs[\\/]Lark[\\/]')" ^
  " } |" ^
  " ForEach-Object { Write-Host ('  stop PID ' + $_.ProcessId); Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

echo Waiting for file locks to clear...
ping -n 3 127.0.0.1 >nul

echo.
echo [2/5] Deleting LocalAppData Lark cache / Desktop install...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='SilentlyContinue';" ^
  "$paths=@(" ^
  "  (Join-Path $env:LOCALAPPDATA 'Lark')," ^
  "  (Join-Path $env:LOCALAPPDATA 'Programs\Lark')" ^
  ");" ^
  "foreach($p in $paths){" ^
  "  if(Test-Path -LiteralPath $p){" ^
  "    Write-Host ('  remove ' + $p);" ^
  "    Remove-Item -LiteralPath $p -Recurse -Force -ErrorAction SilentlyContinue" ^
  "  }" ^
  "}"
if exist "%LOCALAPPDATA%\Lark" (echo   STILL THERE: %LOCALAPPDATA%\Lark) else (echo   LocalAppData\Lark OK)
if exist "%LOCALAPPDATA%\Programs\Lark" (echo   STILL THERE: %LOCALAPPDATA%\Programs\Lark) else (echo   Programs\Lark OK)

echo.
echo [3/5] Deleting confirmed Lark folders in Temp...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='SilentlyContinue';" ^
  "function Test-LarkFolder([string]$path){" ^
  "  if(-not (Test-Path -LiteralPath $path -PathType Container)){ return $false }" ^
  "  $markers=@('lark.jar','Start Lark.bat','Start Lark.command','Launch Lark Desktop.bat','Launch Lark Desktop.ps1','Install Lark Desktop.ps1');" ^
  "  foreach($m in $markers){ if(Test-Path -LiteralPath (Join-Path $path $m)){ return $true } }" ^
  "  if(Test-Path -LiteralPath (Join-Path $path 'lib\app\lark.jar')){ return $true }" ^
  "  return $false" ^
  "}" ^
  "$roots=@($env:TEMP, $env:TMP);" ^
  "if($env:LOCALAPPDATA){ $roots += (Join-Path $env:LOCALAPPDATA 'Temp') }" ^
  "foreach($root in ($roots | Select-Object -Unique)){" ^
  "  if(-not (Test-Path -LiteralPath $root)){ continue }" ^
  "  Get-ChildItem -LiteralPath $root -Force -Directory -ErrorAction SilentlyContinue |" ^
  "    Where-Object {" ^
  "      $_.Name -ieq 'Lark' -or" ^
  "      $_.Name -like 'lark-windows*' -or" ^
  "      $_.Name -like 'lark-mac*' -or" ^
  "      $_.Name -like 'lark-linux*' -or" ^
  "      $_.Name -like 'lark-desktop*' -or" ^
  "      $_.Name -like 'lark-update*' -or" ^
  "      $_.Name -like 'lark.zip*'" ^
  "    } |" ^
  "    ForEach-Object {" ^
  "      if(Test-LarkFolder $_.FullName){" ^
  "        Write-Host ('  remove ' + $_.FullName);" ^
  "        Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue" ^
  "      } else {" ^
  "        Write-Host ('  skip (not a Lark install): ' + $_.FullName)" ^
  "      }" ^
  "    }" ^
  "}"

echo.
echo [4/5] Deleting user Lark data...
if exist "%USERPROFILE%\.lark" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Remove-Item -LiteralPath ($env:USERPROFILE + '\.lark') -Recurse -Force -ErrorAction SilentlyContinue"
)
if exist "%USERPROFILE%\.lark" (echo   STILL THERE: %USERPROFILE%\.lark) else (echo   .lark removed)

echo.
echo [5/5] Removing Lark install folders on Desktop / Downloads / Documents...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='SilentlyContinue';" ^
  "function Test-LarkFolder([string]$path){" ^
  "  if(-not (Test-Path -LiteralPath $path -PathType Container)){ return $false }" ^
  "  $markers=@('lark.jar','Start Lark.bat','Start Lark.command','Launch Lark Desktop.bat','Install Lark Desktop.ps1','Uninstall Lark Desktop.ps1');" ^
  "  foreach($m in $markers){ if(Test-Path -LiteralPath (Join-Path $path $m)){ return $true } }" ^
  "  if(Test-Path -LiteralPath (Join-Path $path 'lib\app\lark.jar')){ return $true }" ^
  "  return $false" ^
  "}" ^
  "$places=@(" ^
  "  [Environment]::GetFolderPath('Desktop')," ^
  "  (Join-Path $env:USERPROFILE 'Downloads')," ^
  "  (Join-Path $env:USERPROFILE 'Documents')," ^
  "  $env:USERPROFILE" ^
  ") | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique;" ^
  "foreach($place in $places){" ^
  "  Get-ChildItem -LiteralPath $place -Force -Directory -ErrorAction SilentlyContinue |" ^
  "    Where-Object {" ^
  "      $_.Name -ieq 'Lark' -or" ^
  "      $_.Name -ieq 'Lark Desktop' -or" ^
  "      $_.Name -like 'lark-windows*' -or" ^
  "      $_.Name -like 'lark-mac*' -or" ^
  "      $_.Name -like 'lark-linux*' -or" ^
  "      $_.Name -like 'lark-desktop*' -or" ^
  "      $_.Name -like 'lark-update*'" ^
  "    } |" ^
  "    ForEach-Object {" ^
  "      if(-not (Test-LarkFolder $_.FullName)){" ^
  "        Write-Host ('  skip (not a Lark install): ' + $_.FullName);" ^
  "        return" ^
  "      }" ^
  "      Write-Host ('  remove ' + $_.FullName);" ^
  "      Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue" ^
  "    }" ^
  "}"

rem Shortcuts only (files, never whole folders)
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='SilentlyContinue';" ^
  "$links=@(" ^
  "  (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Lark Desktop.lnk')," ^
  "  (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Lark Desktop.lnk')" ^
  ");" ^
  "foreach($l in $links){ if(Test-Path -LiteralPath $l){ Remove-Item -LiteralPath $l -Force; Write-Host ('  remove ' + $l) } }" ^
  "Remove-Item -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\LarkDesktop' -Recurse -Force -ErrorAction SilentlyContinue"

rem If the shell flickered, bring Explorer back without a reboot.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='SilentlyContinue';" ^
  "if(-not (Get-Process -Name explorer -ErrorAction SilentlyContinue)){" ^
  "  Write-Host '  Restarting Windows Explorer...';" ^
  "  Start-Process explorer.exe" ^
  "}"

echo.
echo ============================================================
echo   Wipe finished.
echo ============================================================
echo.
echo Your desktop icons should still be visible. If not:
echo   press Ctrl+Shift+Esc -^> File -^> Run new task -^> explorer.exe
echo ^(no reboot needed^)
echo.
echo Clean install:
echo   1. Download:
echo      https://github.com/TreyvoPrime/lark/releases/latest/download/lark-windows.zip
echo   2. Right-click the zip -^> Extract All...
echo      Destination: C:\Users\%USERNAME%\Lark
echo   3. Open that folder and double-click Start Lark.bat
echo.
pause
exit /b 0
