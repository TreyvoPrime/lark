#!/bin/sh
# Lark Mobile on macOS / Linux — touch UI + phone pair on the same Wi‑Fi.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
cd "$ROOT"
JAR="$ROOT/lark.jar"
PENDING="$ROOT/lark.jar.pending"
printf 'mobile\n' > "$ROOT/mobile.marker"

apply_update() {
  echo "Applying Lark Mobile update..."
  tries=0
  while [ -f "$PENDING" ]; do
    tries=$((tries + 1))
    if [ -f "$JAR" ]; then
      mv -f "$JAR" "$ROOT/lark.jar.bak" 2>/dev/null || true
    fi
    if [ -f "$JAR" ]; then
      if [ "$tries" -ge 20 ]; then
        echo "Could not replace lark.jar. Close every Lark window and try again."
        return 1
      fi
      sleep 1
      continue
    fi
    if mv -f "$PENDING" "$JAR"; then
      rm -f "$ROOT/lark.jar.bak"
      echo "Update applied."
      return 0
    fi
    if [ -f "$ROOT/lark.jar.bak" ]; then
      mv -f "$ROOT/lark.jar.bak" "$JAR" 2>/dev/null || true
    fi
    if [ "$tries" -ge 20 ]; then
      echo "Could not apply the update."
      return 1
    fi
    sleep 1
  done
}

if [ -f "$PENDING" ]; then
  apply_update
fi

if [ ! -f "$JAR" ]; then
  echo "lark.jar is missing next to this script."
  exit 1
fi

pick_java() {
  if [ -x "$ROOT/jdk/bin/java" ]; then
    printf '%s\n' "$ROOT/jdk/bin/java"
    return 0
  fi
  if command -v java >/dev/null 2>&1; then
    command -v java
    return 0
  fi
  return 1
}

JAVA=$(pick_java) || {
  echo "No Java found. Keep the bundled jdk/ folder next to this script."
  exit 1
}

export LARK_CHANNEL=mobile
exec "$JAVA" \
  "-Dlark.install=$ROOT" \
  "-Dlark.ui=jar" \
  "-Dlark.mobile=true" \
  "-Dlark.channel=mobile" \
  -cp "$JAR" lark.Mobile "$@"
