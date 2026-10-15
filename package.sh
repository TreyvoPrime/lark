#!/usr/bin/env bash
# Pack Lark into one jar. Running it still needs a JDK.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p build dist
find src -name '*.java' > build/sources.list
javac --release 17 -encoding UTF-8 -d build @build/sources.list
jar --create --file dist/lark.jar --main-class lark.Lark -C build . -C . web
echo "Wrote dist/lark.jar"
echo "Run it with: java -jar dist/lark.jar"
