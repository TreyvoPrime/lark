@echo off
rem ============================================================================
rem  NUCLEAR CLEANUP — removes Lark install leftovers from this Windows account.
rem  Closes running Lark/Java, then deletes caches, temp extracts, and %%USERPROFILE%%\.lark
rem ============================================================================
setlocal EnableExtensions
title Wipe Lark From This PC

echo.
echo ============================================================
echo   WIPE LARK FROM THIS PC
echo ============================================================
echo.
echo This will CLOSE Lark and DELETE:
echo   - %%LOCALAPPDATA%%\Lark          ^(run cache^)
echo   - %%TEMP%%\*lark*                ^(broken zip preview folders^)
echo   - %%USERPROFILE%%\.lark          ^(settings + local projects^)
echo   - Desktop / Downloads folders named Lark or lark-windows*
echo.
echo It will NOT uninstall Java from your computer.
echo.
echo Type YES in all caps to continue.
set /p "CONFIRM=Confirm: "
if /I not "%CONFIRM%"=="YES" (
  echo Cancelled.
  pause
  exit /b 1
)

echo.
echo [1/4] Stopping Lark / java processes...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='SilentlyContinue';" ^
  "Get-CimInstance Win32_Process -Filter \"Name='java.exe' OR Name='javaw.exe'\" |" ^
  " Where-Object { $_.CommandLine -match 'lark\.jar|lark\.install|Lark\\run' } |" ^
  " ForEach-Object { Write-Host ('  stop PID ' + $_.ProcessId); Stop-Process -Id $_.ProcessId -Force }"
taskkill /FI "WINDOWTITLE eq Lark*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Lark update*" /F >nul 2>&1
taskkill /IM "Start Lark.bat" /F >nul 2>&1

echo Waiting for file locks to clear...
ping -n 4 127.0.0.1 >nul

echo.
echo [2/4] Deleting LocalAppData run cache...
if exist "%LOCALAPPDATA%\Lark" (
  rmdir /s /q "%LOCALAPPDATA%\Lark" >nul 2>&1
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Remove-Item -LiteralPath ($env:LOCALAPPDATA + '\Lark') -Recurse -Force -ErrorAction SilentlyContinue"
)
if exist "%LOCALAPPDATA%\Lark" (echo   STILL THERE: %LOCALAPPDATA%\Lark) else (echo   OK)

echo.
echo [3/4] Deleting Temp zip-preview Lark folders...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='SilentlyContinue';" ^
  "$roots=@($env:TEMP, $env:TMP, ($env:LOCALAPPDATA + '\Temp'));" ^
  "foreach($root in $roots){" ^
  "  if(-not (Test-Path -LiteralPath $root)){continue}" ^
  "  Get-ChildItem -LiteralPath $root -Force -ErrorAction SilentlyContinue |" ^
  "    Where-Object { $_.Name -match 'lark' } |" ^
  "    ForEach-Object {" ^
  "      Write-Host ('  remove ' + $_.FullName);" ^
  "      Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue" ^
  "    }" ^
  "}"

echo.
echo [4/4] Deleting user Lark data and common unzip folders...
if exist "%USERPROFILE%\.lark" (
  rmdir /s /q "%USERPROFILE%\.lark" >nul 2>&1
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Remove-Item -LiteralPath ($env:USERPROFILE + '\.lark') -Recurse -Force -ErrorAction SilentlyContinue"
)
if exist "%USERPROFILE%\.lark" (echo   STILL THERE: %USERPROFILE%\.lark) else (echo   .lark removed)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='SilentlyContinue';" ^
  "$places=@(" ^
  "  (Join-Path $env:USERPROFILE 'Desktop')," ^
  "  (Join-Path $env:USERPROFILE 'Downloads')," ^
  "  (Join-Path $env:USERPROFILE 'Documents')," ^
  "  $env:USERPROFILE" ^
  ");" ^
  "foreach($place in $places){" ^
  "  if(-not (Test-Path -LiteralPath $place)){continue}" ^
  "  Get-ChildItem -LiteralPath $place -Force -ErrorAction SilentlyContinue |" ^
  "    Where-Object {" ^
  "      $_.PSIsContainer -and (" ^
  "        $_.Name -ieq 'Lark' -or" ^
  "        $_.Name -ieq 'lark' -or" ^
  "        $_.Name -like 'lark-windows*' -or" ^
  "        $_.Name -like 'lark-update*' -or" ^
  "        $_.Name -like '*lark-windows.zip*'" ^
  "      )" ^
  "    } |" ^
  "    ForEach-Object {" ^
  "      Write-Host ('  remove ' + $_.FullName);" ^
  "      Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue" ^
  "    }" ^
  "}"

echo.
echo ============================================================
echo   Wipe finished.
echo ============================================================
echo.
echo IMPORTANT: Do NOT open Start Lark from inside the zip / Temp.
echo.
echo Clean install:
echo   1. Download:
echo      https://github.com/TreyvoPrime/lark/releases/latest/download/lark-windows.zip
echo   2. Right-click the zip -^> Extract All...
echo      Destination: C:\Users\%USERNAME%\Lark
echo   3. Open that folder and double-click Start Lark.bat
echo      ^(you must see lark.jar AND jdk\ next to it^)
echo.
echo If anything above still shows STILL THERE: reboot once, then
echo run this Wipe bat again.
echo.
pause
exit /b 0
