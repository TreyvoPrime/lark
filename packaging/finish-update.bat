@echo off
rem Wait for the old Lark process to release files, then start again.
rem Start Lark.bat applies lark.jar.pending with retries and runs from a copy.
setlocal EnableExtensions
cd /d "%~dp0"
title Lark update
echo.
echo Finishing Lark update...
echo Waiting for the previous Lark window to close.
echo.

set "W=0"
:wait_loop
set /a W+=1
ping -n 2 127.0.0.1 >nul
if "%W%"=="6" goto :launch
goto :wait_loop

:launch
echo Starting Lark...
cmd /k call "%~dp0Start Lark.bat" --inner
exit /b %ERRORLEVEL%
