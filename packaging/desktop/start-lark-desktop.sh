#!/bin/sh
# Lark Desktop on macOS / Linux — top-level Start + jdk/; runtime in app/.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
cd "$ROOT"
APP="$ROOT/app"
mkdir -p "$APP"
printf 'desktop\n' > "$APP/desktop.marker"

JAR="$APP/lark.jar"
PENDING="$APP/lark.jar.pending"
if [ ! -f "$JAR" ] && [ -f "$ROOT/lark.jar" ]; then
  JAR="$ROOT/lark.jar"
  PENDING="$ROOT/lark.jar.pending"
fi

case "$JAR" in
  "$ROOT"/*) ;;
  *)
    echo "Refusing to launch: lark.jar is outside the install folder."
    exit 1
    ;;
esac

apply_update() {
  echo "Applying Lark Desktop update..."
  tries=0
  while [ -f "$PENDING" ]; do
    tries=$((tries + 1))
    if [ -f "$JAR" ]; then
      mv -f "$JAR" "${JAR}.bak" 2>/dev/null || true
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
      rm -f "${JAR}.bak"
      echo "Update applied."
      return 0
    fi
    if [ -f "${JAR}.bak" ]; then
      mv -f "${JAR}.bak" "$JAR" 2>/dev/null || true
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
  echo "app/lark.jar is missing. Keep the app/ folder next to this script."
  exit 1
fi

# Bundled JDK only — never fall back to PATH for Desktop (safer installs).
if [ ! -x "$ROOT/jdk/bin/java" ]; then
  echo "Bundled jdk/bin/java is missing. Re-extract the Lark Desktop zip."
  exit 1
fi
JAVA="$ROOT/jdk/bin/java"

export LARK_CHANNEL=desktop
exec "$JAVA" \
  "-Dlark.install=$ROOT" \
  "-Dlark.ui=jar" \
  "-Dlark.desktop=true" \
  "-Dlark.channel=desktop" \
  -cp "$JAR" lark.Desktop "$@"
