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
# Desktop launchers — top-level Start + app\ helpers refreshed on update.
cp "packaging/desktop/Start Lark Desktop.bat" build/lark/launch/StartDesktop.bat
cp "packaging/desktop/Start Lark Desktop.vbs" build/lark/launch/StartDesktop.vbs
cp packaging/desktop/start-lark-desktop.sh build/lark/launch/start-lark-desktop.sh
cp "packaging/desktop/Install Lark Desktop.ps1" build/lark/launch/InstallDesktop.ps1
cp "packaging/desktop/Uninstall Lark Desktop.ps1" build/lark/launch/UninstallDesktop.ps1
cp "packaging/desktop/Stamp-LarkAumid.ps1" build/lark/launch/StampLarkAumid.ps1
# Also embed under LaunchDesktop.* so existing installs still refresh launchers.
cp "packaging/desktop/Start Lark Desktop.bat" build/lark/launch/LaunchDesktop.bat
cp "packaging/desktop/Start Lark Desktop.vbs" build/lark/launch/LaunchDesktop.vbs
# Mobile launchers (touch UI edition).
cp "packaging/mobile/Start Lark Mobile.bat" build/lark/launch/StartMobile.bat
cp "packaging/mobile/Start Lark Mobile.vbs" build/lark/launch/StartMobile.vbs
cp packaging/mobile/start-lark-mobile.sh build/lark/launch/start-lark-mobile.sh
# Ensure mobile UI can reuse desktop vendor/fonts if not duplicated.
mkdir -p web-mobile/vendor web-mobile/fonts
if [ ! -e web-mobile/vendor/codemirror ]; then
  cp -a web/vendor/codemirror web-mobile/vendor/codemirror
fi
if [ ! -e web-mobile/fonts/JetBrainsMono-Regular.woff2 ]; then
  cp -a web/fonts/. web-mobile/fonts/ 2>/dev/null || true
fi
jar --create --file dist/lark.jar --main-class lark.Lark -C build . -C . web -C . web-mobile
# Never leave edition markers beside dist/lark.jar — they make portable runs
# mis-detect as Mobile/Desktop (installDir is the jar's parent).
rm -f dist/mobile.marker dist/desktop.marker dist/executable.marker
echo "Wrote dist/lark.jar"
echo "Run portable:     java -jar dist/lark.jar"
echo "Run desktop:      java -cp dist/lark.jar lark.Desktop"
echo "Run executable:   java -cp dist/lark.jar lark.Executable"
echo "Run mobile:       java -cp dist/lark.jar lark.Mobile"
