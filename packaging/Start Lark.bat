@echo off
rem ============================================================================
rem  Lark for Windows — path-safe boot
rem  Works even when the folder name has spaces or parentheses
rem  e.g. "lark-windows (6)"
rem  - No multi-line IF ( ) blocks with paths (those break on "(")
rem  - Window stays open via cmd /k
rem  - Bundled jdk\bin\java.exe + lark.jar in this folder
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

echo ========== Lark boot ==========
echo Folder: %ROOT%
echo Log:    %LOG%
echo ===============================
echo.

echo Lark boot %DATE% %TIME%> "%LOG%"
echo ROOT=%ROOT%>> "%LOG%"

if not exist "%PENDING%" goto :after_update
echo Applying update...
echo Applying pending update>> "%LOG%"
if exist "%BAK%" del /f /q "%BAK%" >nul 2>&1
if exist "%JAR%" ren "%JAR%" "lark.jar.bak" >nul 2>&1
if exist "%JAR%" goto :update_locked
ren "%PENDING%" "lark.jar" >nul 2>&1
if not exist "%JAR%" goto :update_failed
if exist "%BAK%" del /f /q "%BAK%" >nul 2>&1
echo Update applied.
echo.
goto :after_update

:update_locked
echo Could not replace lark.jar — close other Lark windows and try again.
echo FAIL: could not rename lark.jar>> "%LOG%"
goto :fail

:update_failed
if exist "%BAK%" ren "%BAK%" "lark.jar" >nul 2>&1
echo Update failed.
echo FAIL: pending rename>> "%LOG%"
goto :fail

:after_update
if not exist "%JAR%" goto :missing_jar
if not exist "%JAVA%" goto :missing_java
if not exist "%JAVAC%" goto :missing_javac
if not exist "%JVMCFG%" goto :missing_cfg

echo Checking Java...
"%JAVA%" -version
if errorlevel 1 goto :java_broken
echo.
echo Starting Lark with:
echo   %JAVA%
echo   %JAR%
echo.
echo Launching java -jar>> "%LOG%"
echo JAVA=%JAVA%>> "%LOG%"
echo JAR=%JAR%>> "%LOG%"

rem ROOT from %CD% has no trailing backslash — safe inside quotes.
"%JAVA%" "-Dlark.install=%ROOT%" -jar "%JAR%"
set "ERR=%ERRORLEVEL%"
echo Java exit code %ERR%>> "%LOG%"

echo.
if not "%ERR%"=="0" goto :java_exit_fail
echo Lark has closed.
echo You can close this window.
exit /b 0

:missing_jar
echo ERROR: lark.jar is missing.
echo Expected: %JAR%
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
echo Tip: rename the folder to remove parentheses, e.g. C:\Users\...\Lark
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
goto :fail

:fail
echo.
echo ---------- lark-boot.log ----------
if exist "%LOG%" type "%LOG%"
echo -----------------------------------
echo.
echo Fix: unzip into a simple folder name without parentheses, e.g.
echo   C:\Users\%USERNAME%\Lark
echo Then double-click Start Lark.bat again.
echo.
pause
exit /b 1
