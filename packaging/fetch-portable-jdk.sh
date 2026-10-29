#!/bin/sh
# Download a portable Temurin JDK for one OS/arch and normalize it to OUT/jdk.
# Usage: fetch-portable-jdk.sh <windows|mac|linux> <x64|aarch64> <out-dir>
set -eu
os=$1
arch=$2
out=$3
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

case "$os" in
  windows) ext=zip ;;
  mac|linux) ext=tar.gz ;;
  *) echo "Unsupported OS: $os" >&2; exit 1 ;;
esac

url="https://api.adoptium.net/v3/binary/latest/21/ga/${os}/${arch}/jdk/hotspot/normal/eclipse?project=jdk"
echo "Downloading Temurin 21 for ${os}/${arch}..."
archive="$tmp/jdk.${ext}"
if command -v curl >/dev/null 2>&1; then
  curl -fL --retry 5 --retry-delay 2 -o "$archive" "$url"
else
  wget -O "$archive" "$url"
fi
size=$(wc -c <"$archive" | tr -d ' ')
if [ "$size" -lt 40000000 ]; then
  echo "JDK download looks truncated ($size bytes)" >&2
  exit 1
fi

mkdir -p "$tmp/extract"
case "$ext" in
  zip) unzip -q "$archive" -d "$tmp/extract" ;;
  tar.gz) tar -xzf "$archive" -C "$tmp/extract" ;;
esac

# Find the JDK home (folder that contains bin/java or bin/java.exe).
java_bin=$(find "$tmp/extract" -type f \( -name java -o -name java.exe \) -path '*/bin/*' 2>/dev/null | head -n 1 || true)
if [ -z "$java_bin" ]; then
  echo "Could not locate bin/java inside the archive." >&2
  find "$tmp/extract" -maxdepth 4 -type d >&2 || true
  exit 1
fi
home=$(CDPATH= cd -- "$(dirname "$java_bin")/.." && pwd)
if [ ! -d "$home/bin" ]; then
  echo "Could not locate JDK home inside the archive." >&2
  exit 1
fi
echo "Found JDK home: $home"

rm -rf "$out/jdk"
mkdir -p "$out"
cp -a "$home" "$out/jdk"

# Drop bulk that java/javac do not need at runtime (keeps the zip smaller).
rm -rf "$out/jdk/jmods" "$out/jdk/demo" "$out/jdk/man" "$out/jdk/include" \
  "$out/jdk/lib/src.zip" "$out/jdk/lib/jfr" "$out/jdk/lib/*.diz" 2>/dev/null || true
rm -f "$out/jdk/lib/src.zip" 2>/dev/null || true
find "$out/jdk" -name '*.diz' -delete 2>/dev/null || true
find "$out/jdk" -name 'src.zip' -delete 2>/dev/null || true

# Only verify layout here — cross-built JDKs (e.g. mac on linux) cannot execute.
if [ ! -e "$out/jdk/bin/java" ] && [ ! -e "$out/jdk/bin/java.exe" ]; then
  echo "Staged JDK is missing bin/java" >&2
  exit 1
fi
if [ ! -e "$out/jdk/lib/jvm.cfg" ]; then
  echo "lib/jvm.cfg missing in staged JDK:" >&2
  ls "$out/jdk/lib" | head >&2 || true
  exit 1
fi
if [ ! -e "$out/jdk/bin/javac" ] && [ ! -e "$out/jdk/bin/javac.exe" ]; then
  echo "javac missing in staged JDK" >&2
  exit 1
fi
# Share generates ephemeral TLS identities with the bundled JDK's keytool.
if [ ! -e "$out/jdk/bin/keytool" ] && [ ! -e "$out/jdk/bin/keytool.exe" ]; then
  echo "keytool missing in staged JDK (required by Lark Share)" >&2
  exit 1
fi
# Run -version only when the binary matches this OS.
if [ -x "$out/jdk/bin/java" ] && file "$out/jdk/bin/java" 2>/dev/null | grep -qiE "ELF|Mach-O.*$(uname -m)|executable"; then
  case "$(uname -s)" in
    Linux)
      if file "$out/jdk/bin/java" | grep -q ELF; then
        "$out/jdk/bin/java" -version || true
      fi
      ;;
    Darwin)
      if file "$out/jdk/bin/java" | grep -q Mach-O; then
        "$out/jdk/bin/java" -version || true
      fi
      ;;
  esac
fi
echo "Portable JDK ready: $out/jdk ($(du -sh "$out/jdk" | cut -f1))"
