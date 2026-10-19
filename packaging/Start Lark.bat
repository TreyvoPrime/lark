@echo off
setlocal EnableExtensions
cd /d "%~dp0"
if exist "%~dp0lark.jar.pending" (
  echo Applying Lark update...
  if exist "%~dp0lark.jar.bak" del /f /q "%~dp0lark.jar.bak" >nul 2>&1
  if exist "%~dp0lark.jar" move /y "%~dp0lark.jar" "%~dp0lark.jar.bak" >nul
  move /y "%~dp0lark.jar.pending" "%~dp0lark.jar" >nul
  if errorlevel 1 (
    echo Could not apply the update. Restoring the previous jar.
    if exist "%~dp0lark.jar.bak" move /y "%~dp0lark.jar.bak" "%~dp0lark.jar" >nul
    pause
    exit /b 1
  )
  del /f /q "%~dp0lark.jar.bak" >nul 2>&1
)
if not exist "%~dp0lark.jar" (
  echo lark.jar is missing next to this file.
  pause
  exit /b 1
)

set "JAVAEXE="
where java >nul 2>&1
if not errorlevel 1 call :picksystem
if defined JAVAEXE goto :launch

set "LARK_HOME=%USERPROFILE%\.lark\jdk"
if not exist "%LARK_HOME%" mkdir "%LARK_HOME%"
call :findprivate
if defined JAVAEXE goto :launch

echo.
echo Lark is downloading a private copy of Java into your user folder.
echo It does not ask for an administrator password.
echo.

set "ARCH=x64"
if /I "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "ARCH=aarch64"
if /I "%PROCESSOR_ARCHITEW6432%"=="ARM64" set "ARCH=aarch64"
set "URL=https://api.adoptium.net/v3/binary/latest/21/ga/windows/%ARCH%/jdk/hotspot/normal/eclipse?project=jdk"
curl.exe -fL --retry 3 -o "%TEMP%\lark-jdk.zip" "%URL%"
if errorlevel 1 (
  echo Could not download Java. Check your connection and run Start Lark again.
  pause
  exit /b 1
)
tar.exe -xf "%TEMP%\lark-jdk.zip" -C "%LARK_HOME%"
if errorlevel 1 (
  echo Could not unpack Java.
  pause
  exit /b 1
)
del /f /q "%TEMP%\lark-jdk.zip" >nul 2>&1
call :findprivate
if not defined JAVAEXE (
  echo Java unpacked, but java.exe was not found in %LARK_HOME%.
  pause
  exit /b 1
)

:launch
"%JAVAEXE%" -jar "%~dp0lark.jar"
if errorlevel 1 pause
exit /b %ERRORLEVEL%

:picksystem
set "JVER="
set "MAJOR="
for /f "tokens=3" %%V in ('java -version 2^>^&1') do (
  set "JVER=%%~V"
  goto :parsed
)
:parsed
if not defined JVER exit /b 0
for /f "tokens=1 delims=." %%M in ("%JVER%") do set "MAJOR=%%M"
if not defined MAJOR exit /b 0
if "%MAJOR%"=="1" exit /b 0
if %MAJOR% LSS 17 exit /b 0
set "JAVAEXE=java"
exit /b 0

:findprivate
for /f "delims=" %%J in ('dir /s /b "%LARK_HOME%\java.exe" 2^>nul') do (
  set "JAVAEXE=%%J"
  goto :foundone
)
:foundone
exit /b 0
