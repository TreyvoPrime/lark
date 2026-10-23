#!/usr/bin/env bash
# Lark Enterprise launcher for Mac / Linux installs.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if [[ -f "lark.jar.pending" ]]; then
  mv -f lark.jar lark.jar.bak 2>/dev/null || true
  mv -f lark.jar.pending lark.jar
  rm -f lark.jar.bak
fi

JAVA=""
if [[ -x "$ROOT/jdk/bin/java" ]]; then
  JAVA="$ROOT/jdk/bin/java"
elif command -v java >/dev/null 2>&1; then
  JAVA="$(command -v java)"
else
  echo "Lark Enterprise needs a JDK. Re-install the Enterprise package." >&2
  exit 1
fi

exec "$JAVA" \
  "-Dlark.install=$ROOT" \
  -Dlark.enterprise=true \
  -Dlark.channel=enterprise \
  -Dlark.ui=jar \
  -cp "$ROOT/lark.jar" \
  lark.Enterprise \
  "$@"
