#!/usr/bin/env bash
# Pack Lark into one jar. Running it still needs a JDK.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p build dist
find src -name '*.java' > build/sources.list
javac --release 17 -encoding UTF-8 -d build @build/sources.list
# Embed portable launchers so an in-app update can refresh Start Lark.bat
# (Windows must not run from the install jar, or the next swap fails with Access denied).
mkdir -p build/lark/launch
cp "packaging/Start Lark.bat" build/lark/launch/StartLark.bat
cp "packaging/Start Lark.vbs" build/lark/launch/StartLark.vbs
cp packaging/finish-update.bat build/lark/launch/finish-update.bat
cp "packaging/Stop Lark and Clean Cache.bat" build/lark/launch/StopLarkClean.bat
cp "packaging/Wipe Lark From This PC.bat" build/lark/launch/WipeLark.bat
cp packaging/start-lark.sh build/lark/launch/start-lark.sh
# Desktop (enterprise) launchers — refreshed into desktop installs on update.
cp "packaging/desktop/Launch Lark Desktop.bat" build/lark/launch/LaunchDesktop.bat
cp "packaging/desktop/Launch Lark Desktop.vbs" build/lark/launch/LaunchDesktop.vbs
cp packaging/desktop/start-lark-desktop.sh build/lark/launch/start-lark-desktop.sh
cp "packaging/desktop/Install Lark Desktop.ps1" build/lark/launch/InstallDesktop.ps1
cp "packaging/desktop/Uninstall Lark Desktop.ps1" build/lark/launch/UninstallDesktop.ps1
jar --create --file dist/lark.jar --main-class lark.Lark -C build . -C . web
echo "Wrote dist/lark.jar"
echo "Run portable:  java -jar dist/lark.jar"
echo "Run desktop:   java -cp dist/lark.jar lark.Desktop"
