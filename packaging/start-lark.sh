#!/bin/sh
# Start Lark on macOS or Linux. Nothing is installed for the whole computer,
# and this script never asks for an administrator password.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
cd "$ROOT"
JAR="$ROOT/lark.jar"
PENDING="$ROOT/lark.jar.pending"
LARK_HOME="${LARK_HOME:-$HOME/.lark/jdk}"

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

usable_java() {
  bin=$1
  [ -n "$bin" ] && [ -x "$bin" ] || return 1
  major=$(java_major "$bin")
  [ -n "${major:-}" ] || return 1
  [ "$major" -ge 17 ] || return 1
  printf '%s\n' "$bin"
}

system_java() {
  command -v java >/dev/null 2>&1 || return 1
  usable_java "$(command -v java)"
}

env_java() {
  if [ -n "${LARK_JDK:-}" ]; then
    if [ -x "$LARK_JDK/bin/java" ]; then
      usable_java "$LARK_JDK/bin/java" && return 0
    fi
    if [ -x "$LARK_JDK" ]; then
      usable_java "$LARK_JDK" && return 0
    fi
  fi
  return 1
}

beside_java() {
  if [ -x "$ROOT/jdk/bin/java" ]; then
    usable_java "$ROOT/jdk/bin/java" && return 0
  fi
  found=$(find "$ROOT/jdk" -type f -path '*/bin/java' 2>/dev/null | head -n 1 || true)
  if [ -n "$found" ]; then
    usable_java "$found" && return 0
  fi
  return 1
}

private_java() {
  found=$(find "$LARK_HOME" -type f -path '*/bin/java' 2>/dev/null | head -n 1 || true)
  if [ -n "$found" ]; then
    usable_java "$found" && return 0
  fi
  return 1
}

unpack_local_zip() {
  for zip in "$ROOT/jdk.zip" "$ROOT/java.zip" "$ROOT"/OpenJDK*.zip "$ROOT"/*jdk*.zip; do
    [ -f "$zip" ] || continue
    echo "Found $(basename "$zip") — unpacking into your home folder..."
    mkdir -p "$LARK_HOME"
    tar -xzf "$zip" -C "$LARK_HOME" 2>/dev/null || tar -xf "$zip" -C "$LARK_HOME"
    private_java && return 0
  done
  return 1
}

school_help() {
  cat <<'EOF'

==============================
School / locked-PC help
==============================
Lark needs Java 17 or newer. On locked school networks the automatic
download can fail (firewall, proxy, or certificate checks).

Fix it without an admin password — pick one:
  1. Put a portable JDK zip next to start-lark.sh as jdk.zip, then run again.
  2. Or unzip a JDK into a folder named "jdk" next to this script
     so that jdk/bin/java exists.
  3. Or set LARK_JDK to a JDK folder that already has bin/java.

Download a JDK at home on another network if needed:
  https://adoptium.net/
==============================

EOF
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
  mkdir -p "$LARK_HOME"
  url="https://api.adoptium.net/v3/binary/latest/21/ga/${osname}/${archname}/jdk/hotspot/normal/eclipse?project=jdk"
  echo "Lark is downloading a private copy of Java into your home folder."
  echo "This does not ask for an administrator password."
  tmp=$(mktemp)
  # Prefer a normal TLS download; fall back to insecure only if the school
  # proxy breaks certificate checks (same class of failure as Windows 0x80092012).
  if ! curl -fL --retry 3 --retry-delay 2 -o "$tmp" "$url"; then
    echo "Retrying download with relaxed certificate checks..."
    if ! curl -fLk --retry 3 --retry-delay 2 -o "$tmp" "$url"; then
      rm -f "$tmp"
      echo "Could not download Java. School firewalls and proxies often block this step."
      school_help
      return 1
    fi
  fi
  tar -xzf "$tmp" -C "$LARK_HOME" 2>/dev/null || tar -xf "$tmp" -C "$LARK_HOME"
  rm -f "$tmp"
  private_java
}

JAVA_BIN=$(env_java || true)
if [ -z "$JAVA_BIN" ]; then
  JAVA_BIN=$(beside_java || true)
fi
if [ -z "$JAVA_BIN" ]; then
  JAVA_BIN=$(system_java || true)
fi
if [ -z "$JAVA_BIN" ]; then
  JAVA_BIN=$(private_java || true)
fi
if [ -z "$JAVA_BIN" ]; then
  JAVA_BIN=$(unpack_local_zip || true)
fi
if [ -z "$JAVA_BIN" ]; then
  JAVA_BIN=$(fetch_java || true)
fi
if [ -z "$JAVA_BIN" ]; then
  echo "Lark could not find Java 17 or newer."
  school_help
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
