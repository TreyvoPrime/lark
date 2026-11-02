#!/usr/bin/env bash
# Lark Desktop — Mac/Linux helper for the Setup-style payload layout.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
case "$ROOT" in
  */Temp/*|*/tmp/*|*.zip*|*/Temporary*\ Items/*)
    echo "Do not run Lark from a Temp or zip preview folder. Extract All first." >&2
    exit 1
    ;;
esac

JAR="$ROOT/app/lark.jar"
if [[ ! -f "$JAR" ]]; then
  JAR="$ROOT/lark.jar"
fi
if [[ ! -f "$JAR" ]]; then
  echo "lark.jar missing under app/. Re-download Lark Desktop." >&2
  exit 1
fi

JAVA="$ROOT/jdk/bin/java"
JAVAC="$ROOT/jdk/bin/javac"
JVMCFG="$ROOT/jdk/lib/jvm.cfg"
if [[ ! -x "$JAVA" || ! -x "$JAVAC" || ! -f "$JVMCFG" ]]; then
  echo "Bundled JDK missing. Re-download Lark Desktop." >&2
  exit 1
fi

# Refuse to follow a jar symlink out of the install tree.
# Pure shell (no python3): on a Mac without developer tools, python3 pops an install dialog.
if [[ -L "$JAR" ]]; then
  echo "lark.jar must stay inside the Lark folder." >&2
  exit 1
fi
REAL_JAR="$(cd "$(dirname "$JAR")" && pwd -P)/$(basename "$JAR")"
ROOT="$(cd "$ROOT" && pwd -P)"
case "$REAL_JAR" in
  "$ROOT"|"$ROOT"/*) ;;
  *)
    echo "lark.jar must stay inside the Lark folder." >&2
    exit 1
    ;;
esac

exec "$JAVA" \
  "-Dlark.install=$ROOT" \
  -Dlark.desktop=true \
  -Dlark.channel=desktop \
  -Dlark.ui=jar \
  -cp "$JAR" \
  lark.Desktop \
  "$@"
