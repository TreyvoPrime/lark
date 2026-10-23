@echo off
rem ============================================================================
rem  Lark Mobile for Windows — touch UI + phone pair on the same Wi‑Fi
rem  Runs a COPY of lark.jar so updates can replace the install jar.
rem ============================================================================
setlocal EnableExtensions
title Lark Mobile
cd /d "%~dp0"

if /I "%~1"=="--inner" goto :boot
cmd /k call "%~f0" --inner
exit /b 0

:boot
set "ROOT=%CD%"
set "LOG=%ROOT%\lark-mobile-boot.log"
set "JAVA=%ROOT%\jdk\bin\java.exe"
set "JAVAC=%ROOT%\jdk\bin\javac.exe"
set "JVMCFG=%ROOT%\jdk\lib\jvm.cfg"
set "JAR=%ROOT%\lark.jar"
set "PENDING=%ROOT%\lark.jar.pending"
set "BAK=%ROOT%\lark.jar.bak"
set "RUNDIR=%LOCALAPPDATA%\Lark\mobile-run"
if not defined LOCALAPPDATA set "RUNDIR=%TEMP%\Lark\mobile-run"
set "RUNJAR=%RUNDIR%\lark.jar"
set "TRIES=0"

echo ========== Lark Mobile boot ==========
echo Folder: %ROOT%
echo Log:    %LOG%
echo =====================================
echo.

echo Lark Mobile boot %DATE% %TIME%> "%LOG%"
echo ROOT=%ROOT%>> "%LOG%"
echo mobile> "%ROOT%\mobile.marker" 2>nul

echo %ROOT%| find /I "\Temp\" >nul && goto :bad_temp
echo %ROOT%| find /I "\AppData\Local\Temp\" >nul && goto :bad_temp
echo %ROOT%| find /I ".zip." >nul && goto :bad_temp

:apply_pending
if not exist "%PENDING%" goto :stage_run
set /a TRIES+=1
echo Applying update... try %TRIES%/40
echo Applying pending update try %TRIES%>> "%LOG%"
if exist "%BAK%" del /f /q "%BAK%" >nul 2>&1
if exist "%JAR%" ren "%JAR%" "lark.jar.bak" >nul 2>&1
if exist "%JAR%" goto :pending_wait
ren "%PENDING%" "lark.jar" >nul 2>&1
if not exist "%JAR%" goto :pending_wait
if exist "%BAK%" del /f /q "%BAK%" >nul 2>&1
echo Update applied.
echo Update applied>> "%LOG%"
echo.
goto :stage_run

:pending_wait
if exist "%BAK%" if not exist "%JAR%" ren "%BAK%" "lark.jar" >nul 2>&1
if "%TRIES%"=="40" goto :update_locked
echo Waiting for lark.jar to unlock...
ping -n 2 127.0.0.1 >nul
goto :apply_pending

:update_locked
echo Install folder is still locked — launching from a run copy.
echo WARN: install jar locked; running pending via run copy>> "%LOG%"
if not exist "%RUNDIR%" mkdir "%RUNDIR%" >nul 2>&1
copy /y "%PENDING%" "%RUNJAR%" >nul
if not exist "%RUNJAR%" goto :fail
goto :launch

:stage_run
if not exist "%JAR%" goto :missing_jar
if not exist "%JAVA%" goto :missing_java
if not exist "%JAVAC%" goto :missing_javac
if not exist "%JVMCFG%" goto :missing_cfg

if not exist "%RUNDIR%" mkdir "%RUNDIR%" >nul 2>&1
if exist "%RUNJAR%" del /f /q "%RUNJAR%" >nul 2>&1
copy /y "%JAR%" "%RUNJAR%" >nul
if not exist "%RUNJAR%" goto :fail

:launch
echo Launching Lark Mobile...
echo Launching Lark Mobile>> "%LOG%"
echo.
echo Keep this window open. On your phone, open the Phone URL printed below.
echo.
"%JAVA%" "-Dlark.install=%ROOT%" "-Dlark.ui=jar" "-Dlark.mobile=true" "-Dlark.channel=mobile" -cp "%RUNJAR%" lark.Mobile
set "ERR=%ERRORLEVEL%"
echo Java exit code %ERR%>> "%LOG%"
if not "%ERR%"=="0" goto :java_exit_fail
exit /b 0

:bad_temp
echo ERROR: Do not run from a Temp / zip preview folder.
echo FAIL: temp folder>> "%LOG%"
goto :fail

:missing_jar
echo ERROR: lark.jar is missing next to Start Lark Mobile.bat.
echo FAIL: missing jar>> "%LOG%"
goto :fail

:missing_java
echo ERROR: Bundled java is missing. Re-download the FULL Lark Mobile zip.
echo FAIL: missing java>> "%LOG%"
goto :fail

:missing_javac
echo ERROR: Bundled javac is missing.
echo FAIL: missing javac>> "%LOG%"
goto :fail

:missing_cfg
echo ERROR: Bundled JDK is incomplete.
echo FAIL: missing jvm.cfg>> "%LOG%"
goto :fail

:java_exit_fail
echo Lark Mobile stopped with error code %ERR%.
echo See log: %LOG%
goto :fail

:fail
echo.
echo ---------- lark-mobile-boot.log ----------
if exist "%LOG%" type "%LOG%"
echo ------------------------------------------
echo.
echo Download:
echo   https://github.com/TreyvoPrime/lark/releases/latest/download/lark-mobile-windows.zip
echo.
pause
exit /b 1
