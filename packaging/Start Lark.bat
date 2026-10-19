@echo off
rem ============================================================================
rem  Lark for Windows — redesigned boot
rem  - Window never auto-closes (cmd /k)
rem  - Uses bundled jdk\bin\java.exe next to this file
rem  - Runs lark.jar in place (no LocalAppData copy)
rem  - Writes lark-boot.log beside this file
rem ============================================================================
setlocal EnableExtensions
title Lark
cd /d "%~dp0"

rem Double-click opens a window that STAYS OPEN so errors are visible.
if /I not "%~1"=="--inner" (
  cmd /k call "%~f0" --inner
  exit /b 0
)

set "ROOT=%CD%"
set "LOG=%ROOT%\lark-boot.log"
set "JAVA=%ROOT%\jdk\bin\java.exe"
set "JAVAC=%ROOT%\jdk\bin\javac.exe"
set "JVMCFG=%ROOT%\jdk\lib\jvm.cfg"
set "JAR=%ROOT%\lark.jar"

echo ========== Lark boot ==========
echo Folder: %ROOT%
echo Log:    %LOG%
echo ===============================
echo.

> "%LOG%" echo Lark boot %DATE% %TIME%
>>"%LOG%" echo ROOT=%ROOT%

rem Apply staged jar update if present
if exist "%ROOT%\lark.jar.pending" (
  echo Applying update...
  >>"%LOG%" echo Applying pending update
  if exist "%ROOT%\lark.jar.bak" del /f /q "%ROOT%\lark.jar.bak" >nul 2>&1
  if exist "%ROOT%\lark.jar" ren "%ROOT%\lark.jar" "lark.jar.bak" >nul 2>&1
  if exist "%ROOT%\lark.jar" (
    echo Could not replace lark.jar — close other Lark windows and try again.
    >>"%LOG%" echo FAIL: could not rename lark.jar
    goto :fail
  )
  ren "%ROOT%\lark.jar.pending" "lark.jar" >nul 2>&1
  if not exist "%ROOT%\lark.jar" (
    if exist "%ROOT%\lark.jar.bak" ren "%ROOT%\lark.jar.bak" "lark.jar" >nul 2>&1
    echo Update failed.
    >>"%LOG%" echo FAIL: pending rename
    goto :fail
  )
  if exist "%ROOT%\lark.jar.bak" del /f /q "%ROOT%\lark.jar.bak" >nul 2>&1
  echo Update applied.
  echo.
)

if not exist "%JAR%" (
  echo ERROR: lark.jar is missing.
  echo Expected: %JAR%
  >>"%LOG%" echo FAIL: missing jar
  goto :fail
)

if not exist "%JAVA%" (
  echo ERROR: Bundled Java is missing.
  echo Expected: %JAVA%
  echo.
  echo You must unzip the FULL lark-windows.zip so these sit together:
  echo   Start Lark.bat
  echo   lark.jar
  echo   jdk\bin\java.exe
  echo.
  echo Download:
  echo   https://github.com/TreyvoPrime/lark/releases/latest/download/lark-windows.zip
  >>"%LOG%" echo FAIL: missing bundled java
  goto :fail
)

if not exist "%JAVAC%" (
  echo ERROR: Bundled javac is missing: %JAVAC%
  >>"%LOG%" echo FAIL: missing javac
  goto :fail
)

if not exist "%JVMCFG%" (
  echo ERROR: Bundled JDK is incomplete ^(no lib\jvm.cfg^).
  echo Re-download and unzip the FULL zip — do not copy files out of it.
  >>"%LOG%" echo FAIL: missing jvm.cfg
  goto :fail
)

echo Checking Java...
"%JAVA%" -version
if errorlevel 1 (
  echo ERROR: Bundled java.exe could not run.
  >>"%LOG%" echo FAIL: java -version
  goto :fail
)
echo.
echo Starting Lark with:
echo   %JAVA%
echo   %JAR%
echo.
>>"%LOG%" echo Launching java -jar
>>"%LOG%" echo JAVA=%JAVA%
>>"%LOG%" echo JAR=%JAR%

rem %CD% has no trailing backslash — safe to quote for -D
"%JAVA%" "-Dlark.install=%ROOT%" -jar "%JAR%"
set "ERR=%ERRORLEVEL%"
>>"%LOG%" echo Java exit code %ERR%

echo.
if not "%ERR%"=="0" (
  echo Lark stopped with error code %ERR%.
  echo See log: %LOG%
  goto :fail
)

echo Lark has closed.
echo You can close this window.
exit /b 0

:fail
echo.
echo ---------- lark-boot.log ----------
type "%LOG%"
echo -----------------------------------
echo.
echo Fix: delete this folder, re-download the FULL Windows zip, unzip again,
echo and double-click Start Lark.bat.
echo.
pause
exit /b 1
