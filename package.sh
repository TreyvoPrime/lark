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
cp packaging/start-lark.sh build/lark/launch/start-lark.sh
jar --create --file dist/lark.jar --main-class lark.Lark -C build . -C . web
echo "Wrote dist/lark.jar"
echo "Run it with: java -jar dist/lark.jar"
