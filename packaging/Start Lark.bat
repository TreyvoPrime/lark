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

rem 1) Explicit override (teacher / IT can set this)
if defined LARK_JDK (
  if exist "%LARK_JDK%\bin\java.exe" (
    set "JAVAEXE=%LARK_JDK%\bin\java.exe"
    goto :launch
  )
  if exist "%LARK_JDK%" (
    set "JAVAEXE=%LARK_JDK%"
    goto :launch
  )
)

rem 2) JDK dropped next to this launcher (USB / offline school install)
if exist "%~dp0jdk\bin\java.exe" (
  set "JAVAEXE=%~dp0jdk\bin\java.exe"
  goto :launch
)
call :findbeside
if defined JAVAEXE goto :launch

rem 3) System Java 17+
where java >nul 2>&1
if not errorlevel 1 call :picksystem
if defined JAVAEXE goto :launch

rem 4) Private copy already downloaded
if not exist "%LARK_HOME%" mkdir "%LARK_HOME%"
call :findprivate
if defined JAVAEXE goto :launch

rem 5) Unpack a JDK zip placed next to Start Lark.bat
call :unpack_local_zip
if defined JAVAEXE goto :launch

rem 6) Download Temurin into the user folder (school-network hardened)
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
  echo Java unpacked, but java.exe was not found in %LARK_HOME%.
  call :school_help
  pause
  exit /b 1
)

:launch
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
if not errorlevel 1 if exist "%ZIP%" goto :unpack_downloaded

echo Trying download ^(curl, default SSL^)...
curl.exe -fL --retry 3 --retry-delay 2 -o "%ZIP%" "%URL%" >nul 2>&1
if not errorlevel 1 if exist "%ZIP%" goto :unpack_downloaded

echo Trying download ^(PowerShell^)...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ProgressPreference='SilentlyContinue';" ^
  "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;" ^
  "try { [Net.ServicePointManager]::CheckCertificateRevocationList=$false } catch {};" ^
  "Invoke-WebRequest -Uri '%URL%' -OutFile '%ZIP%' -UseBasicParsing"
if not errorlevel 1 if exist "%ZIP%" goto :unpack_downloaded

echo Trying download ^(BITS^)...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { Start-BitsTransfer -Source '%URL%' -Destination '%ZIP%' } catch { exit 1 }"
if not errorlevel 1 if exist "%ZIP%" goto :unpack_downloaded

echo.
echo Could not download Java. School firewalls and proxies often block this step.
exit /b 1

:unpack_downloaded
echo Unpacking Java...
tar.exe -xf "%ZIP%" -C "%LARK_HOME%"
if errorlevel 1 (
  echo Could not unpack Java.
  del /f /q "%ZIP%" >nul 2>&1
  exit /b 1
)
del /f /q "%ZIP%" >nul 2>&1
exit /b 0

:unpack_local_zip
rem Accept a Temurin/OpenJDK zip dropped beside Start Lark.bat
for %%Z in ("%~dp0jdk.zip" "%~dp0java.zip" "%~dp0OpenJDK*.zip" "%~dp0*jdk*.zip") do (
  if exist %%~Z (
    echo Found %%~nxZ — unpacking into your user folder...
    if not exist "%LARK_HOME%" mkdir "%LARK_HOME%"
    tar.exe -xf "%%~Z" -C "%LARK_HOME%"
    if not errorlevel 1 (
      call :findprivate
      if defined JAVAEXE exit /b 0
    )
  )
)
exit /b 0

:school_help
echo.
echo ==============================
echo School / locked-PC help
echo ==============================
echo Lark needs Java 17 or newer. On locked school networks the automatic
echo download can fail ^(firewall, proxy, or certificate checks^).
echo.
echo Fix it without an admin password — pick one:
echo   1. Ask a teacher for a portable JDK zip. Put it next to Start Lark.bat
echo      as jdk.zip ^(or OpenJDK....zip^), then open Start Lark again.
echo   2. Or unzip a JDK into a folder named "jdk" next to Start Lark.bat
echo      so that jdk\bin\java.exe exists.
echo   3. Or set LARK_JDK to a JDK folder that already has bin\java.exe.
echo.
echo Download a JDK at home on another network if needed:
echo   https://adoptium.net/
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
for /f "delims=" %%J in ('dir /s /b "%LARK_HOME%\java.exe" 2^>nul') do (
  set "JAVAEXE=%%J"
  goto :foundone
)
:foundone
exit /b 0

:findbeside
for /f "delims=" %%J in ('dir /s /b "%~dp0jdk\java.exe" 2^>nul') do (
  set "JAVAEXE=%%J"
  goto :foundbeside
)
:foundbeside
exit /b 0
