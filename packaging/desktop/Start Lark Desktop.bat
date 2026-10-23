@echo off
rem ============================================================================
rem  Lark Desktop — official launcher (https://github.com/TreyvoPrime/lark)
rem  Top-level only: this script + jdk\. Runtime lives in app\.
rem  Uses the bundled JDK only (never PATH java). Runs a COPY of the jar
rem  so updates can replace app\lark.jar safely.
rem ============================================================================
setlocal EnableExtensions
title Lark Desktop
cd /d "%~dp0"

if /I "%~1"=="--inner" goto :boot
if /I "%~1"=="--console" goto :boot
if exist "%~dp0app\Start Lark Desktop.vbs" (
  start "" wscript.exe //nologo "%~dp0app\Start Lark Desktop.vbs"
  exit /b 0
)
goto :boot

:boot
set "ROOT=%CD%"
set "APP=%ROOT%\app"
set "LOG=%APP%\lark-desktop-boot.log"
if not exist "%APP%" mkdir "%APP%" >nul 2>&1

set "JAVA=%ROOT%\jdk\bin\javaw.exe"
set "JAVA_CONSOLE=%ROOT%\jdk\bin\java.exe"
set "JAVAC=%ROOT%\jdk\bin\javac.exe"
set "JVMCFG=%ROOT%\jdk\lib\jvm.cfg"

rem Prefer app\lark.jar; fall back to legacy root jar for older installs.
set "JAR=%APP%\lark.jar"
set "PENDING=%APP%\lark.jar.pending"
set "BAK=%APP%\lark.jar.bak"
if not exist "%JAR%" if exist "%ROOT%\lark.jar" (
  set "JAR=%ROOT%\lark.jar"
  set "PENDING=%ROOT%\lark.jar.pending"
  set "BAK=%ROOT%\lark.jar.bak"
)

set "RUNDIR=%LOCALAPPDATA%\Lark\run"
if not defined LOCALAPPDATA set "RUNDIR=%TEMP%\Lark\run"
set "RUNJAR=%RUNDIR%\lark.jar"
set "TRIES=0"

echo Lark Desktop boot %DATE% %TIME%> "%LOG%"
echo ROOT=%ROOT%>> "%LOG%"
echo JAR=%JAR%>> "%LOG%"

echo desktop> "%APP%\desktop.marker" 2>nul

echo %ROOT%| find /I "\Temp\" >nul && goto :bad_temp
echo %ROOT%| find /I "\AppData\Local\Temp\" >nul && goto :bad_temp
echo %ROOT%| find /I ".zip." >nul && goto :bad_temp

rem Refuse a jar that is not under this install folder (path escape / symlink tricks).
echo %JAR%| find /I "%ROOT%" >nul || goto :bad_jar_path

:apply_pending
if not exist "%PENDING%" goto :stage_run
set /a TRIES+=1
echo Applying update... try %TRIES%/40>> "%LOG%"
if exist "%BAK%" del /f /q "%BAK%" >nul 2>&1
if exist "%JAR%" ren "%JAR%" "lark.jar.bak" >nul 2>&1
if exist "%JAR%" goto :pending_wait
ren "%PENDING%" "lark.jar" >nul 2>&1
if not exist "%JAR%" goto :pending_wait
if exist "%BAK%" del /f /q "%BAK%" >nul 2>&1
echo Update applied>> "%LOG%"
goto :stage_run

:pending_wait
if exist "%BAK%" if not exist "%JAR%" ren "%BAK%" "lark.jar" >nul 2>&1
if "%TRIES%"=="40" goto :update_locked
ping -n 2 127.0.0.1 >nul
goto :apply_pending

:update_locked
echo WARN: install jar locked; running pending via run copy>> "%LOG%"
if not exist "%RUNDIR%" mkdir "%RUNDIR%" >nul 2>&1
copy /y "%PENDING%" "%RUNJAR%" >nul
if not exist "%RUNJAR%" goto :fail
goto :launch

:stage_run
if not exist "%JAR%" goto :missing_jar
if not exist "%JAVA_CONSOLE%" goto :missing_java
if not exist "%JAVAC%" goto :missing_javac
if not exist "%JVMCFG%" goto :missing_cfg
if not exist "%JAVA%" set "JAVA=%JAVA_CONSOLE%"

if not exist "%RUNDIR%" mkdir "%RUNDIR%" >nul 2>&1
if exist "%RUNJAR%" del /f /q "%RUNJAR%" >nul 2>&1
copy /y "%JAR%" "%RUNJAR%" >nul
if not exist "%RUNJAR%" goto :fail

:launch
echo Launching Lark Desktop>> "%LOG%"
"%JAVA%" "-Dlark.install=%ROOT%" "-Dlark.ui=jar" "-Dlark.desktop=true" "-Dlark.channel=desktop" -cp "%RUNJAR%" lark.Desktop
set "ERR=%ERRORLEVEL%"
echo Java exit code %ERR%>> "%LOG%"
if not "%ERR%"=="0" goto :fail
exit /b 0

:bad_temp
echo ERROR: Do not run from a Temp / zip preview folder.>> "%LOG%"
goto :fail

:bad_jar_path
echo ERROR: lark.jar path escapes the install folder.>> "%LOG%"
goto :fail

:missing_jar
echo ERROR: app\lark.jar missing>> "%LOG%"
goto :fail

:missing_java
echo ERROR: bundled jdk\bin\javaw.exe / java.exe missing — refuse PATH java.>> "%LOG%"
goto :fail

:missing_javac
echo ERROR: bundled javac missing>> "%LOG%"
goto :fail

:missing_cfg
echo ERROR: incomplete JDK>> "%LOG%"
goto :fail

:fail
echo See %LOG%
if /I "%~1"=="--console" pause
exit /b 1
