@echo off
rem Lark launcher for Windows. Keep this simple: delayed expansion and nested
rem IF blocks have caused empty "" Java paths (exit 9009) on real PCs.
setlocal EnableExtensions
cd /d "%~dp0"

set "INSTALL=%~dp0"
if "%INSTALL:~-1%"=="\" set "INSTALL=%INSTALL:~0,-1%"
set "JAR=%INSTALL%\lark.jar"
set "BUNDLED=%INSTALL%\jdk\bin\java.exe"
set "BUNDLED_JAVAC=%INSTALL%\jdk\bin\javac.exe"
set "BUNDLED_CFG=%INSTALL%\jdk\lib\jvm.cfg"
set "LARK_HOME=%USERPROFILE%\.lark\jdk"
set "RUNDIR=%LOCALAPPDATA%\Lark\run"
set "JAVAEXE="

rem Apply a staged update before Java starts.
if exist "%INSTALL%\lark.jar.pending" (
  echo Applying Lark update...
  call :apply_update
  if errorlevel 1 (
    echo Close every Lark window, wait a second, then open Start Lark again.
    pause
    exit /b 1
  )
  echo Update applied.
  echo.
)

if not exist "%JAR%" (
  echo lark.jar is missing next to this file:
  echo   %JAR%
  pause
  exit /b 1
)

rem ---------- find Java ----------

rem 1) Bundled JDK from the Lark zip (preferred — works offline)
rem Set OUTSIDE multi-line () blocks — those can leave JAVAEXE empty on Windows.
if exist "%BUNDLED%" if exist "%BUNDLED_JAVAC%" if exist "%BUNDLED_CFG%" set "JAVAEXE=%BUNDLED%"
if not "%JAVAEXE%"=="" (
  echo Using the Java that came with Lark:
  echo   %JAVAEXE%
  goto :prepare
)

rem 2) LARK_JDK override
if "%JAVAEXE%"=="" if defined LARK_JDK if exist "%LARK_JDK%\bin\java.exe" if exist "%LARK_JDK%\bin\javac.exe" set "JAVAEXE=%LARK_JDK%\bin\java.exe"
if "%JAVAEXE%"=="" if defined LARK_JDK if exist "%LARK_JDK%" if /I "%LARK_JDK:~-8%"=="java.exe" set "JAVAEXE=%LARK_JDK%"
if not "%JAVAEXE%"=="" (
  echo Using LARK_JDK: %JAVAEXE%
  goto :prepare
)

rem 3) System Java on PATH (full path, never bare "java")
for /f "delims=" %%J in ('where java 2^>nul') do (
  call :check_java "%%J"
  if not errorlevel 1 (
    set "JAVAEXE=%%J"
    goto :got_system
  )
)
goto :after_system
:got_system
echo Using system Java: %JAVAEXE%
goto :prepare
:after_system

rem 4) IntelliJ project JDKs
if exist "%USERPROFILE%\.jdks" for /f "delims=" %%J in ('dir /s /b "%USERPROFILE%\.jdks\java.exe" 2^>nul') do (
  call :check_java "%%J"
  if not errorlevel 1 (
    set "JAVAEXE=%%J"
    goto :got_idea_jdk
  )
)
goto :after_idea_jdk
:got_idea_jdk
echo Using IntelliJ JDK: %JAVAEXE%
goto :prepare
:after_idea_jdk

rem 5) IntelliJ / Toolbox JBR
for /f "delims=" %%J in ('dir /s /b "%LOCALAPPDATA%\Programs\IntelliJ IDEA*\jbr\bin\java.exe" 2^>nul') do (
  call :check_java "%%J"
  if not errorlevel 1 (
    set "JAVAEXE=%%J"
    goto :got_jbr
  )
)
for /f "delims=" %%J in ('dir /s /b "%ProgramFiles%\JetBrains\IntelliJ IDEA*\jbr\bin\java.exe" 2^>nul') do (
  call :check_java "%%J"
  if not errorlevel 1 (
    set "JAVAEXE=%%J"
    goto :got_jbr
  )
)
if exist "%LOCALAPPDATA%\JetBrains\Toolbox\apps" for /f "delims=" %%J in ('dir /s /b "%LOCALAPPDATA%\JetBrains\Toolbox\apps\jbr\bin\java.exe" 2^>nul') do (
  call :check_java "%%J"
  if not errorlevel 1 (
    set "JAVAEXE=%%J"
    goto :got_jbr
  )
)
goto :after_jbr
:got_jbr
echo Using JetBrains Java: %JAVAEXE%
goto :prepare
:after_jbr

rem 6) Previously downloaded private JDK
if exist "%LARK_HOME%" for /f "delims=" %%J in ('dir /s /b "%LARK_HOME%\java.exe" 2^>nul') do (
  call :check_java "%%J"
  if not errorlevel 1 (
    set "JAVAEXE=%%J"
    goto :got_private
  )
)
goto :after_private
:got_private
echo Using private Java: %JAVAEXE%
goto :prepare
:after_private

echo.
echo Could not find a working Java 17+.
echo.
echo The Lark zip must contain a "jdk" folder next to Start Lark.bat.
echo Re-download the FULL Windows zip ^(about 70MB^), not only lark.jar:
echo   https://github.com/TreyvoPrime/lark/releases/latest/download/lark-windows.zip
echo.
echo After unzipping you should see:
echo   Start Lark.bat
echo   lark.jar
echo   jdk\bin\java.exe
echo.
pause
exit /b 1

:prepare
rem Last-chance: if a block failed to keep JAVAEXE, use the bundled path directly.
if "%JAVAEXE%"=="" if exist "%BUNDLED%" set "JAVAEXE=%BUNDLED%"
if "%JAVAEXE%"=="" (
  echo Internal error: Java path is empty.
  echo Bundled expected at: %BUNDLED%
  if exist "%INSTALL%\jdk" ^(echo jdk folder exists.^) else ^(echo jdk folder is MISSING — unzip the full lark-windows.zip.^)
  pause
  exit /b 1
)
if not exist "%JAVAEXE%" (
  echo Java not found at:
  echo   %JAVAEXE%
  pause
  exit /b 1
)

if not exist "%RUNDIR%" mkdir "%RUNDIR%"
copy /y "%JAR%" "%RUNDIR%\lark.jar" >nul
if errorlevel 1 (
  echo Could not copy lark.jar into:
  echo   %RUNDIR%
  pause
  exit /b 1
)
if not exist "%RUNDIR%\lark.jar" (
  echo Copy failed: %RUNDIR%\lark.jar is missing.
  pause
  exit /b 1
)

echo.
echo Starting Lark...
echo Leave this window open while you use Lark. Your browser should open next.
echo.
echo Java: %JAVAEXE%
echo Jar:  %RUNDIR%\lark.jar
echo.

rem Quote each argument separately. Never use -Dlark.install="path\" — the
rem trailing backslash escapes the quote and drops -jar (Java Usage only).
"%JAVAEXE%" "-Dlark.install=%INSTALL%" -jar "%RUNDIR%\lark.jar"
set "ERR=%ERRORLEVEL%"
if not "%ERR%"=="0" (
  echo.
  echo Lark exited with code %ERR%.
  echo Java: %JAVAEXE%
  echo Jar:  %RUNDIR%\lark.jar
  echo Install: %INSTALL%
  if not exist "%INSTALL%\jdk\bin\java.exe" (
    echo.
    echo Missing bundled JDK. Unzip the FULL lark-windows.zip so the jdk folder
    echo sits next to Start Lark.bat.
  )
  pause
)
exit /b %ERR%

rem ---------- helpers ----------

:check_java
rem %1 = path to java.exe. Require sibling javac.exe + lib\jvm.cfg + runs.
set "CAND=%~1"
if not exist "%CAND%" exit /b 1
for %%I in ("%CAND%") do (
  if not exist "%%~dpIjavac.exe" exit /b 1
  if not exist "%%~dpI..\lib\jvm.cfg" exit /b 1
)
"%CAND%" -version >nul 2>&1
if errorlevel 1 exit /b 1
exit /b 0

:apply_update
setlocal EnableDelayedExpansion
set "TRIES=0"
:apply_retry
set /a TRIES+=1
if exist "%INSTALL%\lark.jar.bak" del /f /q "%INSTALL%\lark.jar.bak" >nul 2>&1
if exist "%INSTALL%\lark.jar" (
  ren "%INSTALL%\lark.jar" "lark.jar.bak" >nul 2>&1
  if exist "%INSTALL%\lark.jar" (
    if !TRIES! LSS 20 (
      ping -n 2 127.0.0.1 >nul
      goto apply_retry
    )
    echo The process cannot access lark.jar because it is still open.
    endlocal
    exit /b 1
  )
)
ren "%INSTALL%\lark.jar.pending" "lark.jar" >nul 2>&1
if not exist "%INSTALL%\lark.jar" (
  if exist "%INSTALL%\lark.jar.bak" ren "%INSTALL%\lark.jar.bak" "lark.jar" >nul 2>&1
  echo Could not replace lark.jar with the downloaded update.
  endlocal
  exit /b 1
)
if exist "%INSTALL%\lark.jar.bak" del /f /q "%INSTALL%\lark.jar.bak" >nul 2>&1
endlocal
exit /b 0
