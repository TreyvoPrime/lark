@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo Waiting for Lark to close so the update can finish...
ping -n 3 127.0.0.1 >nul
cmd /k call "%~dp0Start Lark.bat" --inner
exit /b %ERRORLEVEL%
