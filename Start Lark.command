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

# Complete JDK: bin/java + bin/javac + lib/jvm.cfg + runnable 17+.
jdk_ok() {
  bin=$1
  [ -n "$bin" ] && [ -x "$bin" ] || return 1
  root=$(CDPATH= cd -- "$(dirname "$bin")/.." && pwd)
  [ -f "$root/lib/jvm.cfg" ] || return 1
  [ -x "$root/bin/java" ] || return 1
  [ -x "$root/bin/javac" ] || return 1
  major=$(java_major "$bin")
  [ -n "${major:-}" ] || return 1
  [ "$major" -ge 17 ] || return 1
  return 0
}

usable_java() {
  bin=$1
  jdk_ok "$bin" || return 1
  printf '%s\n' "$bin"
}

system_java() {
  command -v java >/dev/null 2>&1 || return 1
  bin=$(command -v java)
  # System installs may be symlinks; require a working 17+ binary.
  major=$(java_major "$bin")
  [ -n "${major:-}" ] || return 1
  [ "$major" -ge 17 ] || return 1
  printf '%s\n' "$bin"
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
  [ -d "$LARK_HOME" ] || return 1
  found=$(find "$LARK_HOME" -type f -path '*/bin/java' 2>/dev/null | head -n 20 || true)
  for bin in $found; do
    if usable_java "$bin" >/dev/null; then
      printf '%s\n' "$bin"
      return 0
    fi
  done
  return 1
}

try_java_bins() {
  for bin in "$@"; do
    [ -n "$bin" ] && [ -x "$bin" ] || continue
    if usable_java "$bin" >/dev/null; then
      echo "Using Java from IntelliJ / JetBrains: $bin" >&2
      printf '%s\n' "$bin"
      return 0
    fi
  done
  return 1
}

# Reuse IntelliJ-downloaded JDKs (~/.jdks) or the IDE's bundled JetBrains Runtime.
intellij_java() {
  if [ -d "$HOME/.jdks" ]; then
    # shellcheck disable=SC2046
    try_java_bins $(find "$HOME/.jdks" -type f -path '*/bin/java' 2>/dev/null | head -n 20) && return 0
  fi

  case "$(uname -s)" in
    Darwin)
      try_java_bins \
        "/Applications/IntelliJ IDEA.app/Contents/jbr/Contents/Home/bin/java" \
        "/Applications/IntelliJ IDEA CE.app/Contents/jbr/Contents/Home/bin/java" \
        "/Applications/IntelliJ IDEA Ultimate.app/Contents/jbr/Contents/Home/bin/java" \
        "/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/java" \
        && return 0
      toolbox="$HOME/Library/Application Support/JetBrains/Toolbox/apps"
      if [ -d "$toolbox" ]; then
        # shellcheck disable=SC2046
        try_java_bins $(find "$toolbox" -type f -path '*/jbr/Contents/Home/bin/java' 2>/dev/null | head -n 20) && return 0
      fi
      ;;
    Linux)
      try_java_bins \
        /snap/intellij-idea-community/current/jbr/bin/java \
        /snap/intellij-idea-ultimate/current/jbr/bin/java \
        /usr/share/idea/jbr/bin/java \
        /usr/lib/intellij-idea/jbr/bin/java \
        && return 0
      for root in "$HOME/.local/share/JetBrains/Toolbox/apps" /opt; do
        [ -d "$root" ] || continue
        # shellcheck disable=SC2046
        try_java_bins $(find "$root" -type f -path '*/jbr/bin/java' 2>/dev/null | head -n 20) && return 0
      done
      ;;
  esac
  return 1
}

purge_broken_private() {
  [ -d "$LARK_HOME" ] || return 0
  find "$LARK_HOME" -type f -path '*/bin/java' 2>/dev/null | while read -r bin; do
    if ! jdk_ok "$bin"; then
      root=$(CDPATH= cd -- "$(dirname "$bin")/.." && pwd)
      echo "Removing broken Java folder: $root"
      rm -rf "$root"
    fi
  done
  rm -rf "$LARK_HOME/_staging" 2>/dev/null || true
}

zip_ok() {
  zip=$1
  [ -f "$zip" ] || return 1
  size=$(wc -c <"$zip" | tr -d ' ')
  # Real Temurin JDK archives are large; reject truncated/HTML responses.
  [ "$size" -ge 40000000 ] || {
    echo "Archive looks incomplete ($size bytes). Ignoring it."
    return 1
  }
  return 0
}

unpack_zip_to_home() {
  zip=$1
  zip_ok "$zip" || return 1
  stage="$LARK_HOME/_staging"
  rm -rf "$stage"
  mkdir -p "$stage"
  echo "Unpacking Java..."
  if ! tar -xzf "$zip" -C "$stage" 2>/dev/null; then
    tar -xf "$zip" -C "$stage" || {
      rm -rf "$stage"
      return 1
    }
  fi
  found=$(find "$stage" -type f -path '*/bin/java' 2>/dev/null | head -n 1 || true)
  if [ -z "$found" ] || ! jdk_ok "$found"; then
    echo "Unpacked Java is incomplete (missing lib/jvm.cfg)."
    rm -rf "$stage"
    return 1
  fi
  root=$(CDPATH= cd -- "$(dirname "$found")/.." && pwd)
  dest="$LARK_HOME/$(basename "$root")"
  rm -rf "$dest"
  mv "$root" "$dest"
  rm -rf "$stage"
  jdk_ok "$dest/bin/java"
}

unpack_local_zip() {
  for zip in "$ROOT/jdk.zip" "$ROOT/java.zip" "$ROOT"/OpenJDK*.zip "$ROOT"/*jdk*.zip; do
    [ -f "$zip" ] || continue
    echo "Found $(basename "$zip") — checking and unpacking..."
    unpack_zip_to_home "$zip" && private_java && return 0
  done
  return 1
}

jdk_help() {
  cat <<EOF

==============================
Locked-PC / JDK help
==============================
Lark needs a complete Java 17+ JDK. Partial downloads leave errors like
"could not open .../lib/jvm.cfg".

Fix it without an admin password — pick one:
  1. Install IntelliJ IDEA (or download a JDK inside IntelliJ). Lark will
     reuse that same Java automatically.
  2. Delete the folder  $HOME/.lark/jdk  then run Start Lark again.
  3. Or put a full JDK zip next to this script as jdk.zip
     (from https://adoptium.net/).
  4. Or unzip a JDK into a folder named "jdk" next to this script
     so that jdk/bin/java and jdk/lib/jvm.cfg both exist.
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
  # HTTPS only — never disable certificate checks (avoids MITM JDK installs).
  # Prefer zips that already ship jdk/ so this download is rarely needed.
  if ! curl -fL --retry 3 --retry-delay 2 -o "$tmp" "$url"; then
    rm -f "$tmp"
    echo "Could not download Java over HTTPS. Use a Lark zip that includes jdk/, or fix the network proxy."
    jdk_help
    return 1
  fi
  if ! zip_ok "$tmp"; then
    rm -f "$tmp"
    jdk_help
    return 1
  fi
  unpack_zip_to_home "$tmp"
  status=$?
  rm -f "$tmp"
  [ "$status" -eq 0 ] || {
    jdk_help
    return 1
  }
  private_java
}

purge_broken_private

LOG="$ROOT/lark-boot.log"
{
  echo "Lark boot $(date)"
  echo "ROOT=$ROOT"
} >"$LOG"

# Prefer the JDK shipped inside the Lark zip so offline PCs just work.
JAVA_BIN=$(beside_java || true)
if [ -n "$JAVA_BIN" ]; then
  echo "Using the Java that came with Lark: $JAVA_BIN"
  echo "JAVA=$JAVA_BIN (bundled)" >>"$LOG"
fi
if [ -z "$JAVA_BIN" ]; then
  JAVA_BIN=$(env_java || true)
fi
if [ -z "$JAVA_BIN" ]; then
  JAVA_BIN=$(system_java || true)
fi
if [ -z "$JAVA_BIN" ]; then
  JAVA_BIN=$(intellij_java || true)
fi
if [ -z "$JAVA_BIN" ]; then
  JAVA_BIN=$(private_java || true)
fi
if [ -z "$JAVA_BIN" ]; then
  JAVA_BIN=$(unpack_local_zip || true)
fi
if [ -z "$JAVA_BIN" ]; then
  echo "No bundled Java found. Trying to download one..."
  JAVA_BIN=$(fetch_java || true)
fi
if [ -z "$JAVA_BIN" ]; then
  echo "Lark could not find a complete Java 17 or newer." | tee -a "$LOG"
  jdk_help
  exit 1
fi

if [ "${LARK_SKIP_LAUNCH:-}" = "1" ]; then
  echo "would run: $JAVA_BIN -jar $JAR"
  exit 0
fi

echo "Starting Lark..."
echo "Leave this terminal open while you use Lark. Your browser should open next."
echo "Launch $JAVA_BIN -jar $JAR" >>"$LOG"
# Run the jar in place (same folder as this script).
exec "$JAVA_BIN" -Dlark.install="$ROOT" -jar "$JAR" "$@"
