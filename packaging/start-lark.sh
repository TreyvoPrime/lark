#!/bin/sh
# Start Lark on macOS or Linux. Nothing is installed for the whole computer,
# and this script never asks for an administrator password.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
cd "$ROOT"
JAR="$ROOT/lark.jar"
PENDING="$ROOT/lark.jar.pending"

apply_update() {
  echo "Applying Lark update..."
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

java_major() {
  line=$("$1" -version 2>&1 | head -n 1 || true)
  printf '%s\n' "$line" | sed -n 's/.* version "\([0-9][0-9]*\).*/\1/p'
}

system_java() {
  command -v java >/dev/null 2>&1 || return 1
  major=$(java_major java)
  [ -n "${major:-}" ] || return 1
  [ "$major" -ge 17 ] || return 1
  printf '%s\n' java
}

private_java() {
  home="$HOME/.lark/jdk"
  found=$(find "$home" -type f -path '*/bin/java' 2>/dev/null | head -n 1 || true)
  if [ -n "$found" ]; then
    major=$(java_major "$found")
    if [ -n "${major:-}" ] && [ "$major" -ge 17 ]; then
      printf '%s\n' "$found"
      return 0
    fi
  fi
  return 1
}

fetch_java() {
  os=$(uname -s)
  arch=$(uname -m)
  case "$os" in
    Darwin) osname=mac ;;
    Linux) osname=linux ;;
    *)
      echo "This script supports macOS and Linux. On Windows, double-click Start Lark.bat."
      exit 1
      ;;
  esac
  case "$arch" in
    x86_64|amd64) archname=x64 ;;
    arm64|aarch64) archname=aarch64 ;;
    *)
      echo "This processor is not supported yet: $arch"
      exit 1
      ;;
  esac
  home="$HOME/.lark/jdk"
  mkdir -p "$home"
  url="https://api.adoptium.net/v3/binary/latest/21/ga/${osname}/${archname}/jdk/hotspot/normal/eclipse?project=jdk"
  echo "Lark is downloading a private copy of Java into your home folder."
  echo "This does not ask for an administrator password."
  tmp=$(mktemp)
  curl -fL --retry 3 --retry-delay 2 -o "$tmp" "$url"
  tar -xzf "$tmp" -C "$home"
  rm -f "$tmp"
  private_java
}

JAVA_BIN=$(system_java || true)
if [ -z "$JAVA_BIN" ]; then
  JAVA_BIN=$(private_java || true)
fi
if [ -z "$JAVA_BIN" ]; then
  JAVA_BIN=$(fetch_java || true)
fi
if [ -z "$JAVA_BIN" ]; then
  echo "Lark could not find Java 17 or newer."
  exit 1
fi

if [ "${LARK_SKIP_LAUNCH:-}" = "1" ]; then
  echo "would run: $JAVA_BIN -jar $JAR"
  exit 0
fi

# Run from a home copy so the install folder jar can be replaced on update.
RUNDIR="${XDG_CACHE_HOME:-$HOME/.cache}/lark/run"
mkdir -p "$RUNDIR"
cp -f "$JAR" "$RUNDIR/lark.jar"
exec "$JAVA_BIN" -Dlark.install="$ROOT" -jar "$RUNDIR/lark.jar" "$@"
