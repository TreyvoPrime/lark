@echo off
rem ============================================================================
rem  Force-close Lark, then delete the locked run cache.
rem  Use this when Windows says you "can't delete" Lark files.
rem  Safe: does NOT delete your projects in %%USERPROFILE%%\.lark\projects
rem ============================================================================
setlocal EnableExtensions
title Stop Lark and Clean Cache

echo.
echo ========== Stop Lark / unlock files ==========
echo This will:
echo   1. Close Lark Java processes
echo   2. Close Start Lark console windows titled "Lark"
echo   3. Delete %%LOCALAPPDATA%%\Lark  ^(run cache^)
echo.
echo Your coding projects stay in:
echo   %USERPROFILE%\.lark\projects
echo.
pause

echo.
echo Closing Java / Lark processes...
rem Kill java that is running lark.jar (install or LocalAppData run copy)
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='SilentlyContinue';" ^
  "Get-CimInstance Win32_Process -Filter \"Name='java.exe' OR Name='javaw.exe'\" |" ^
  " Where-Object { $_.CommandLine -match 'lark\.jar' } |" ^
  " ForEach-Object { Write-Host ('Stopping PID ' + $_.ProcessId); Stop-Process -Id $_.ProcessId -Force }"

rem Also stop orphan consoles left from Start Lark
taskkill /FI "WINDOWTITLE eq Lark*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Lark update*" /F >nul 2>&1

echo Waiting for Windows to release file locks...
ping -n 4 127.0.0.1 >nul

set "CACHE=%LOCALAPPDATA%\Lark"
if not defined LOCALAPPDATA set "CACHE=%TEMP%\Lark"

echo.
echo Deleting run cache:
echo   %CACHE%
if exist "%CACHE%" (
  rmdir /s /q "%CACHE%" >nul 2>&1
  if exist "%CACHE%" (
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
      "Remove-Item -LiteralPath $env:LOCALAPPDATA\Lark -Recurse -Force -ErrorAction SilentlyContinue"
  )
)

if exist "%CACHE%" (
  echo.
  echo STILL LOCKED. Try this:
  echo   1. Open Task Manager -^> Details
  echo   2. End every java.exe and javaw.exe
  echo   3. Run this bat again
  echo.
  echo Or reboot, then delete:
  echo   %CACHE%
  echo   and your old unzip folder under Downloads
  pause
  exit /b 1
)

echo.
echo Cache cleared.
echo.
echo Next:
echo   1. Delete your old folder under Downloads\lark-windows  ^(if Windows blocks it, reboot once first^)
echo   2. Download fresh zip:
echo      https://github.com/TreyvoPrime/lark/releases/latest/download/lark-windows.zip
echo   3. Unzip to C:\Users\%USERNAME%\Lark
echo   4. Double-click Start Lark.bat
echo.
pause
exit /b 0
