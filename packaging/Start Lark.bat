@echo off
rem ============================================================================
rem  Lark for Windows — official open-source launcher (https://github.com/TreyvoPrime/lark)
rem  This script ONLY starts the bundled jdk\bin\java.exe with lark.jar.
rem  It does not download programs from the internet.
rem  Path-safe boot + update-safe run (copy under %%LOCALAPPDATA%%\Lark\run).
rem ============================================================================
setlocal EnableExtensions
title Lark
cd /d "%~dp0"

rem Double-click: keep window open forever so errors are readable.
if /I "%~1"=="--inner" goto :boot
cmd /k call "%~f0" --inner
exit /b 0

:boot
set "ROOT=%CD%"
set "LOG=%ROOT%\lark-boot.log"
set "JAVA=%ROOT%\jdk\bin\java.exe"
set "JAVAC=%ROOT%\jdk\bin\javac.exe"
set "JVMCFG=%ROOT%\jdk\lib\jvm.cfg"
set "JAR=%ROOT%\lark.jar"
set "PENDING=%ROOT%\lark.jar.pending"
set "BAK=%ROOT%\lark.jar.bak"
set "RUNDIR=%LOCALAPPDATA%\Lark\run"
if not defined LOCALAPPDATA set "RUNDIR=%TEMP%\Lark\run"
set "RUNJAR=%RUNDIR%\lark.jar"
set "TRIES=0"

echo ========== Lark boot ==========
echo Folder: %ROOT%
echo Log:    %LOG%
echo ===============================
echo.

echo Lark boot %DATE% %TIME%> "%LOG%"
echo ROOT=%ROOT%>> "%LOG%"
echo RUNDIR=%RUNDIR%>> "%LOG%"

rem Refuse Windows "Open zip" / Temp preview folders — those never include lark.jar.
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
rem Put the live jar back if rename of pending failed mid-way.
if exist "%BAK%" if not exist "%JAR%" ren "%BAK%" "lark.jar" >nul 2>&1
if "%TRIES%"=="40" goto :update_locked
echo Waiting for lark.jar to unlock...
ping -n 2 127.0.0.1 >nul
goto :apply_pending

:update_locked
echo.
echo Install folder is still locked — launching the new jar from a run copy anyway.
echo Close other Lark windows later so the next Start Lark can finish the swap.
echo WARN: install jar locked; running pending via run copy>> "%LOG%"
if not exist "%RUNDIR%" mkdir "%RUNDIR%" >nul 2>&1
copy /y "%PENDING%" "%RUNJAR%" >nul
if not exist "%RUNJAR%" goto :fail_locked
if not exist "%JAVA%" goto :missing_java
if not exist "%JAVAC%" goto :missing_javac
if not exist "%JVMCFG%" goto :missing_cfg
goto :launch

:fail_locked
echo Could not replace or copy the update jar.
echo Close EVERY Lark window, wait a few seconds, then try Start Lark again.
echo FAIL: could not rename or stage pending>> "%LOG%"
goto :fail

:stage_run
if not exist "%JAR%" goto :missing_jar
if not exist "%JAVA%" goto :missing_java
if not exist "%JAVAC%" goto :missing_javac
if not exist "%JVMCFG%" goto :missing_cfg

if not exist "%RUNDIR%" mkdir "%RUNDIR%" >nul 2>&1
echo Staging fresh run copy...
echo Staging run copy to %RUNJAR%>> "%LOG%"
rem Always replace the run copy so an old LocalAppData jar cannot stick around.
if exist "%RUNJAR%" del /f /q "%RUNJAR%" >nul 2>&1
copy /y "%JAR%" "%RUNJAR%" >nul
if not exist "%RUNJAR%" goto :copy_fail

:launch

echo Checking Java...
"%JAVA%" -version
if errorlevel 1 goto :java_broken
echo.
echo Starting Lark with:
echo   %JAVA%
echo   install: %JAR%
echo   running: %RUNJAR%
echo.
echo Launching java -jar>> "%LOG%"
echo JAVA=%JAVA%>> "%LOG%"
echo JAR=%JAR%>> "%LOG%"
echo RUNJAR=%RUNJAR%>> "%LOG%"

rem Install folder stays unlocked. Updates write there; we always run the copy.
rem Force jar UI (ignore any leftover web\ folder in the install directory).
"%JAVA%" "-Dlark.install=%ROOT%" "-Dlark.ui=jar" -jar "%RUNJAR%"
set "ERR=%ERRORLEVEL%"
echo Java exit code %ERR%>> "%LOG%"

echo.
if not "%ERR%"=="0" goto :java_exit_fail
echo Lark has closed.
echo You can close this window.
exit /b 0

:copy_fail
echo ERROR: Could not copy lark.jar to:
echo   %RUNJAR%
echo FAIL: run copy>> "%LOG%"
goto :fail

:bad_temp
echo.
echo ERROR: You opened Lark from a TEMP / ZIP preview folder.
echo That is NOT a real install — Windows only extracts one file there,
echo so lark.jar is missing.
echo.
echo Folder:
echo   %ROOT%
echo.
echo Do this instead:
echo   1. Close this window
echo   2. Run "Wipe Lark From This PC.bat" if you have it
echo      ^(or download it from the latest GitHub release^)
echo   3. Download lark-windows.zip
echo   4. Right-click the zip -^> Extract All...
echo      to: C:\Users\%USERNAME%\Lark
echo   5. Open THAT folder and double-click Start Lark.bat
echo      ^(you must see Start Lark.bat, lark.jar, and jdk\ together^)
echo.
echo FAIL: temp/zip preview folder>> "%LOG%"
goto :fail

:missing_jar
echo ERROR: lark.jar is missing next to Start Lark.bat.
echo Expected: %JAR%
echo.
echo You are not in a complete Lark folder. Extract the FULL zip first.
echo Correct destination example: C:\Users\%USERNAME%\Lark
echo FAIL: missing jar>> "%LOG%"
goto :fail

:missing_java
echo ERROR: Bundled Java is missing.
echo Expected: %JAVA%
echo.
echo You must unzip the FULL lark-windows.zip so these sit together:
echo   Start Lark.bat
echo   lark.jar
echo   jdk\bin\java.exe
echo.
echo Tip: unzip into a simple folder, e.g. C:\Users\%USERNAME%\Lark
echo Download:
echo   https://github.com/TreyvoPrime/lark/releases/latest/download/lark-windows.zip
echo FAIL: missing bundled java>> "%LOG%"
goto :fail

:missing_javac
echo ERROR: Bundled javac is missing:
echo   %JAVAC%
echo FAIL: missing javac>> "%LOG%"
goto :fail

:missing_cfg
echo ERROR: Bundled JDK is incomplete ^(no lib\jvm.cfg^).
echo Re-download and unzip the FULL zip — do not copy files out of it.
echo FAIL: missing jvm.cfg>> "%LOG%"
goto :fail

:java_broken
echo ERROR: Bundled java.exe could not run.
echo FAIL: java -version>> "%LOG%"
goto :fail

:java_exit_fail
echo Lark stopped with error code %ERR%.
echo See log: %LOG%
echo.
echo If you saw "Incompatible magic value" / ClassFormatError:
echo   your bundled jdk\ folder is damaged ^(half-deleted or bad unzip^).
echo   Delete this whole Lark folder AND %%LOCALAPPDATA%%\Lark, then
echo   re-download lark-windows.zip and Extract All again.
echo.
goto :fail

:fail
echo.
echo ---------- lark-boot.log ----------
if exist "%LOG%" type "%LOG%"
echo -----------------------------------
echo.
echo If an update is stuck: close all Lark windows, delete lark.jar.bak if present,
echo then double-click Start Lark.bat again. Or re-download the full zip into
echo C:\Users\%USERNAME%\Lark ^(avoid unzipping zip-inside-zip folders^).
echo.
pause
exit /b 1
