#!/usr/bin/env bash
# Build Lark from source and open it. Needs a JDK 17 or newer, and nothing else.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p build
find src -name '*.java' > build/sources.list
javac --release 17 -encoding UTF-8 -d build @build/sources.list
exec java -cp build lark.Lark "$@"
