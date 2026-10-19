@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

rem Apply a staged update before Java starts. Lark itself runs from a copy under
rem %%LOCALAPPDATA%%\Lark\run so this folder's lark.jar is not locked on Windows.
if exist "%~dp0lark.jar.pending" (
  echo Applying Lark update...
  call :apply_update
  if errorlevel 1 (
    echo.
    echo Close every Lark window, wait a second, then open Start Lark again.
    pause
    exit /b 1
  )
  echo Update applied.
  echo.
)

if not exist "%~dp0lark.jar" (
  echo lark.jar is missing next to this file.
  pause
  exit /b 1
)

set "JAVAEXE="
set "LARK_HOME=%USERPROFILE%\.lark\jdk"
set "JAVA_IS_SYSTEM="

rem Remove incomplete private JDKs left by interrupted school-network downloads.
call :purge_broken_private

rem 1) Explicit override (teacher / IT can set this)
if defined LARK_JDK (
  if exist "%LARK_JDK%\bin\java.exe" set "JAVAEXE=%LARK_JDK%\bin\java.exe"
  if not defined JAVAEXE if exist "%LARK_JDK%" set "JAVAEXE=%LARK_JDK%"
  if defined JAVAEXE (
    call :jdk_ok "!JAVAEXE!"
    if not errorlevel 1 goto :launch
    echo LARK_JDK points to a broken Java install. Ignoring it.
    set "JAVAEXE="
  )
)

rem 2) JDK dropped next to this launcher (USB / offline school install)
call :findbeside
if defined JAVAEXE goto :launch

rem 3) System Java 17+
where java >nul 2>&1
if not errorlevel 1 call :picksystem
if defined JAVAEXE (
  set "JAVA_IS_SYSTEM=1"
  goto :launch
)

rem 4) IntelliJ / JetBrains JDKs already on this PC (share with IntelliJ)
call :find_intellij
if defined JAVAEXE goto :launch

rem 5) Private copy already downloaded and complete
if not exist "%LARK_HOME%" mkdir "%LARK_HOME%"
call :findprivate
if defined JAVAEXE goto :launch

rem 6) Unpack a JDK zip placed next to Start Lark.bat
call :unpack_local_zip
if defined JAVAEXE goto :launch

rem 7) Download Temurin into the user folder (school-network hardened)
echo.
echo Lark is downloading a private copy of Java into your user folder.
echo It does not ask for an administrator password.
echo.
call :download_jdk
if errorlevel 1 (
  call :school_help
  pause
  exit /b 1
)
call :findprivate
if not defined JAVAEXE (
  echo Java unpacked, but a complete JDK was not found in %LARK_HOME%.
  call :school_help
  pause
  exit /b 1
)

:launch
if not defined JAVA_IS_SYSTEM (
  call :jdk_ok "!JAVAEXE!"
  if errorlevel 1 (
    echo.
    echo The Java install Lark found is incomplete ^(missing lib\jvm.cfg^).
    echo Clearing the broken copy and trying again...
    call :purge_broken_private
    set "JAVAEXE="
    if not exist "%LARK_HOME%" mkdir "%LARK_HOME%"
    call :download_jdk
    if errorlevel 1 (
      call :school_help
      pause
      exit /b 1
    )
    call :findprivate
    if not defined JAVAEXE (
      echo Still could not get a working Java.
      call :school_help
      pause
      exit /b 1
    )
  )
)

set "RUNDIR=%LOCALAPPDATA%\Lark\run"
if not exist "%RUNDIR%" mkdir "%RUNDIR%"
copy /y "%~dp0lark.jar" "%RUNDIR%\lark.jar" >nul
if errorlevel 1 (
  echo Could not copy lark.jar into the run folder.
  pause
  exit /b 1
)
"%JAVAEXE%" -Dlark.install="%~dp0" -jar "%RUNDIR%\lark.jar"
if errorlevel 1 pause
exit /b %ERRORLEVEL%

:download_jdk
set "ARCH=x64"
if /I "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "ARCH=aarch64"
if /I "%PROCESSOR_ARCHITEW6432%"=="ARM64" set "ARCH=aarch64"
set "URL=https://api.adoptium.net/v3/binary/latest/21/ga/windows/%ARCH%/jdk/hotspot/normal/eclipse?project=jdk"
set "ZIP=%TEMP%\lark-jdk.zip"
del /f /q "%ZIP%" >nul 2>&1

rem School/corporate networks often block certificate revocation checks.
rem --ssl-no-revoke fixes CRYPT_E_NO_REVOCATION_CHECK (0x80092012).
echo Trying download ^(curl, school-network mode^)...
curl.exe -fL --ssl-no-revoke --retry 3 --retry-delay 2 -o "%ZIP%" "%URL%" >nul 2>&1
if not errorlevel 1 (
  call :zip_ok "%ZIP%"
  if not errorlevel 1 goto :unpack_downloaded
)

echo Trying download ^(curl, default SSL^)...
curl.exe -fL --retry 3 --retry-delay 2 -o "%ZIP%" "%URL%" >nul 2>&1
if not errorlevel 1 (
  call :zip_ok "%ZIP%"
  if not errorlevel 1 goto :unpack_downloaded
)

echo Trying download ^(PowerShell^)...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ProgressPreference='SilentlyContinue';" ^
  "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;" ^
  "try { [Net.ServicePointManager]::CheckCertificateRevocationList=$false } catch {};" ^
  "Invoke-WebRequest -Uri '%URL%' -OutFile '%ZIP%' -UseBasicParsing"
if not errorlevel 1 (
  call :zip_ok "%ZIP%"
  if not errorlevel 1 goto :unpack_downloaded
)

echo Trying download ^(BITS^)...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { Start-BitsTransfer -Source '%URL%' -Destination '%ZIP%' } catch { exit 1 }"
if not errorlevel 1 (
  call :zip_ok "%ZIP%"
  if not errorlevel 1 goto :unpack_downloaded
)

echo.
echo Could not download a complete Java zip. School firewalls often truncate this.
exit /b 1

:zip_ok
rem Reject tiny/HTML error pages. A real Windows Temurin JDK zip is ~100MB+.
if not exist "%~1" exit /b 1
for %%A in ("%~1") do set "ZIPSIZE=%%~zA"
if not defined ZIPSIZE exit /b 1
if !ZIPSIZE! LSS 40000000 (
  echo Download looks incomplete ^(!ZIPSIZE! bytes^). Ignoring it.
  echo %~1 | find /I "%TEMP%" >nul
  if not errorlevel 1 del /f /q "%~1" >nul 2>&1
  exit /b 1
)
exit /b 0

:unpack_downloaded
echo Unpacking Java...
if not exist "%LARK_HOME%" mkdir "%LARK_HOME%"
rem Unpack into a fresh staging folder, then keep only a validated JDK.
set "STAGE=%LARK_HOME%\_staging"
if exist "%STAGE%" rd /s /q "%STAGE%" >nul 2>&1
mkdir "%STAGE%"
tar.exe -xf "%ZIP%" -C "%STAGE%"
if errorlevel 1 (
  echo Could not unpack Java.
  rd /s /q "%STAGE%" >nul 2>&1
  echo %ZIP% | find /I "%TEMP%" >nul
  if not errorlevel 1 del /f /q "%ZIP%" >nul 2>&1
  exit /b 1
)
rem Only delete temp downloads — keep a user-supplied jdk.zip beside Start Lark.
echo %ZIP% | find /I "%TEMP%" >nul
if not errorlevel 1 del /f /q "%ZIP%" >nul 2>&1

set "JAVAEXE="
set "STAGED_HOME="
for /f "delims=" %%J in ('dir /s /b "%STAGE%\java.exe" 2^>nul') do (
  call :jdk_ok "%%J"
  if not errorlevel 1 (
    set "JAVAEXE=%%J"
    for %%I in ("%%J") do set "STAGED_HOME=%%~dpI.."
    goto :staging_found
  )
)
:staging_found
if not defined JAVAEXE (
  echo Unpacked Java is incomplete ^(missing lib\jvm.cfg^).
  rd /s /q "%STAGE%" >nul 2>&1
  exit /b 1
)

rem Move the validated JDK root into LARK_HOME.
for %%H in ("!STAGED_HOME!") do set "STAGED_HOME=%%~fH"
for %%H in ("!STAGED_HOME!") do set "DEST=%LARK_HOME%\%%~nxH"
if exist "!DEST!" rd /s /q "!DEST!" >nul 2>&1
move /y "!STAGED_HOME!" "!DEST!" >nul
rd /s /q "%STAGE%" >nul 2>&1
if exist "!DEST!\bin\java.exe" (
  set "JAVAEXE=!DEST!\bin\java.exe"
  call :jdk_ok "!JAVAEXE!"
  if not errorlevel 1 exit /b 0
)
echo Unpacked Java failed validation after move.
call :purge_broken_private
exit /b 1

:unpack_local_zip
for %%Z in ("%~dp0jdk.zip" "%~dp0java.zip" "%~dp0OpenJDK*.zip" "%~dp0*jdk*.zip") do (
  if exist %%~Z (
    echo Found %%~nxZ — checking and unpacking...
    call :zip_ok "%%~Z"
    if not errorlevel 1 (
      set "ZIP=%%~Z"
      call :unpack_downloaded
      if not errorlevel 1 (
        call :findprivate
        if defined JAVAEXE exit /b 0
      )
    )
  )
)
exit /b 0

:jdk_ok
rem Requires a real JDK: java + javac + lib\jvm.cfg + major >= 17.
set "CAND=%~1"
if not defined CAND exit /b 1
if /I "%CAND%"=="java" exit /b 0
if not exist "%CAND%" exit /b 1
for %%J in ("%CAND%") do (
  if not exist "%%~dpJ..\lib\jvm.cfg" exit /b 1
  if not exist "%%~dpJ..\bin\java.exe" exit /b 1
  if not exist "%%~dpJ..\bin\javac.exe" exit /b 1
)
set "JVER="
set "MAJOR="
for /f "tokens=3" %%V in ('"%CAND%" -version 2^>^&1') do (
  set "JVER=%%~V"
  goto :jdk_ok_parsed
)
:jdk_ok_parsed
if not defined JVER exit /b 1
for /f "tokens=1 delims=." %%M in ("!JVER!") do set "MAJOR=%%M"
if not defined MAJOR exit /b 1
if "!MAJOR!"=="1" exit /b 1
if !MAJOR! LSS 17 exit /b 1
exit /b 0

:find_intellij
rem Prefer JDKs IntelliJ downloaded for projects (~/.jdks), then the IDE's own JBR.
set "JAVAEXE="
if exist "%USERPROFILE%\.jdks" (
  for /f "delims=" %%J in ('dir /s /b "%USERPROFILE%\.jdks\java.exe" 2^>nul') do (
    call :jdk_ok "%%J"
    if not errorlevel 1 (
      set "JAVAEXE=%%J"
      echo Using Java from IntelliJ JDKs: %%J
      exit /b 0
    )
  )
)
call :try_jbr_dir "%LOCALAPPDATA%\Programs"
if defined JAVAEXE exit /b 0
call :try_jbr_dir "%ProgramFiles%\JetBrains"
if defined JAVAEXE exit /b 0
if exist "%ProgramFiles(x86)%\JetBrains" call :try_jbr_dir "%ProgramFiles(x86)%\JetBrains"
if defined JAVAEXE exit /b 0
call :try_jbr_dir "%ProgramFiles%\Android"
if defined JAVAEXE exit /b 0
rem JetBrains Toolbox installs (IntelliJ / Android Studio channels)
if exist "%LOCALAPPDATA%\JetBrains\Toolbox\apps" (
  for /f "delims=" %%J in ('dir /s /b "%LOCALAPPDATA%\JetBrains\Toolbox\apps\jbr\bin\java.exe" 2^>nul') do (
    call :jdk_ok "%%J"
    if not errorlevel 1 (
      set "JAVAEXE=%%J"
      echo Using Java from JetBrains Toolbox: %%J
      exit /b 0
    )
  )
)
exit /b 0

:try_jbr_dir
if not exist "%~1" exit /b 0
for /d %%D in ("%~1\IntelliJ IDEA*") do (
  if exist "%%D\jbr\bin\java.exe" (
    call :jdk_ok "%%D\jbr\bin\java.exe"
    if not errorlevel 1 (
      set "JAVAEXE=%%D\jbr\bin\java.exe"
      echo Using Java from IntelliJ: !JAVAEXE!
      exit /b 0
    )
  )
)
for /d %%D in ("%~1\Android Studio*") do (
  if exist "%%D\jbr\bin\java.exe" (
    call :jdk_ok "%%D\jbr\bin\java.exe"
    if not errorlevel 1 (
      set "JAVAEXE=%%D\jbr\bin\java.exe"
      echo Using Java from Android Studio: !JAVAEXE!
      exit /b 0
    )
  )
)
exit /b 0

:purge_broken_private
if not exist "%LARK_HOME%" exit /b 0
for /f "delims=" %%J in ('dir /s /b "%LARK_HOME%\java.exe" 2^>nul') do (
  call :jdk_ok "%%J"
  if errorlevel 1 (
    for %%I in ("%%J") do set "BAD=%%~dpI.."
    for %%B in ("!BAD!") do set "BAD=%%~fB"
    echo Removing broken Java folder: !BAD!
    rd /s /q "!BAD!" >nul 2>&1
  )
)
rem Also drop empty staging leftovers
if exist "%LARK_HOME%\_staging" rd /s /q "%LARK_HOME%\_staging" >nul 2>&1
exit /b 0

:school_help
echo.
echo ==============================
echo School / locked-PC help
echo ==============================
echo Lark needs a complete Java 17+ JDK. Partial downloads leave errors like
echo "could not open ...\lib\jvm.cfg".
echo.
echo Fix it without an admin password — pick one:
echo   1. Install IntelliJ IDEA ^(or download a JDK inside IntelliJ^). Lark will
echo      reuse that same Java automatically.
echo   2. Delete the folder  %USERPROFILE%\.lark\jdk  then open Start Lark again.
echo   3. Or put a full JDK zip next to Start Lark.bat as jdk.zip
echo      ^(from https://adoptium.net/ — Windows x64 JDK .zip^).
echo   4. Or unzip a JDK into a folder named "jdk" next to Start Lark.bat
echo      so that jdk\bin\java.exe and jdk\lib\jvm.cfg both exist.
echo ==============================
echo.
exit /b 0

:apply_update
set "TRIES=0"
:apply_retry
set /a TRIES+=1
if exist "%~dp0lark.jar.bak" del /f /q "%~dp0lark.jar.bak" >nul 2>&1
if exist "%~dp0lark.jar" (
  ren "%~dp0lark.jar" "lark.jar.bak" >nul 2>&1
  if exist "%~dp0lark.jar" (
    if !TRIES! LSS 20 (
      ping -n 2 127.0.0.1 >nul
      goto apply_retry
    )
    echo The process cannot access lark.jar because it is still open.
    exit /b 1
  )
)
ren "%~dp0lark.jar.pending" "lark.jar" >nul 2>&1
if not exist "%~dp0lark.jar" (
  if exist "%~dp0lark.jar.bak" ren "%~dp0lark.jar.bak" "lark.jar" >nul 2>&1
  echo Could not replace lark.jar with the downloaded update.
  exit /b 1
)
if exist "%~dp0lark.jar.bak" del /f /q "%~dp0lark.jar.bak" >nul 2>&1
exit /b 0

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
set "JAVAEXE="
for /f "delims=" %%J in ('dir /s /b "%LARK_HOME%\java.exe" 2^>nul') do (
  call :jdk_ok "%%J"
  if not errorlevel 1 (
    set "JAVAEXE=%%J"
    exit /b 0
  )
)
exit /b 0

:findbeside
set "JAVAEXE="
if exist "%~dp0jdk\bin\java.exe" (
  call :jdk_ok "%~dp0jdk\bin\java.exe"
  if not errorlevel 1 (
    set "JAVAEXE=%~dp0jdk\bin\java.exe"
    exit /b 0
  )
)
for /f "delims=" %%J in ('dir /s /b "%~dp0jdk\java.exe" 2^>nul') do (
  call :jdk_ok "%%J"
  if not errorlevel 1 (
    set "JAVAEXE=%%J"
    exit /b 0
  )
)
exit /b 0
