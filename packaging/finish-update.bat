@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo Waiting for Lark to close so the update can finish...
ping -n 3 127.0.0.1 >nul
call "%~dp0Start Lark.bat"
exit /b %ERRORLEVEL%
