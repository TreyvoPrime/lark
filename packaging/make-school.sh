#!/bin/sh
# Build Lark School for Windows — portable zip with Lark.exe (no .bat required).
set -eu
cd "$(dirname "$0")/.."
if [ "${LARK_SKIP_PACKAGE:-}" != "1" ] || [ ! -f dist/lark.jar ]; then
  ./package.sh
fi
root=$(pwd)
version=$(sed -n 's/.*VERSION = "\([^"]*\)".*/\1/p' src/lark/Settings.java | head -n 1)
feed_base=${LARK_UPDATE_BASE:-}
cache=${LARK_JDK_CACHE:-"$root/release/.jdk-cache"}
mkdir -p "$cache" release packaging/school
chmod +x packaging/fetch-portable-jdk.sh

github_latest="https://github.com/TreyvoPrime/lark/releases/latest/download"
if [ -n "$feed_base" ]; then
  feed_base=$(printf '%s' "$feed_base" | sed 's:/*$::')
else
  feed_base="$github_latest"
fi

echo "Building Lark.exe (Windows, no console)..."
if ! command -v go >/dev/null 2>&1; then
  echo "Go is required to build the school launcher." >&2
  exit 1
fi
mkdir -p packaging/school/bin
(
  cd packaging/school/launcher
  GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build \
    -trimpath \
    -ldflags="-s -w -H windowsgui" \
    -o ../bin/Lark.exe \
    .
)
ls -lh packaging/school/bin/Lark.exe

fetch_cached() {
  os=$1
  arch=$2
  dest="$cache/${os}-${arch}"
  if [ -e "$dest/jdk/bin/java" ] || [ -e "$dest/jdk/bin/java.exe" ]; then
    if [ -e "$dest/jdk/lib/jvm.cfg" ]; then
      echo "Using cached JDK: $dest/jdk"
      return 0
    fi
  fi
  rm -rf "$dest"
  mkdir -p "$dest"
  packaging/fetch-portable-jdk.sh "$os" "$arch" "$dest"
}

echo "Building lark-school-windows.zip..."
fetch_cached windows x64
stage=$(mktemp -d)
cp packaging/school/bin/Lark.exe "$stage/Lark.exe"
cp dist/lark.jar "$stage/lark.jar"
cp packaging/school/README.txt "$stage/README.txt"
printf '%s\n' "$github_latest/update.json" > "$stage/update-feed.url"
printf 'school\n' > "$stage/school.marker"
cp -a "$cache/windows-x64/jdk" "$stage/jdk"
# Intentionally no .bat / .cmd / .ps1 — school PCs that block scripts use Lark.exe only.
rm -f release/lark-school-windows.zip
(cd "$stage" && zip -X -r "$root/release/lark-school-windows.zip" .)
rm -rf "$stage"
ls -lh release/lark-school-windows.zip

# Slim school update: jar + exe (for in-app update channel key "school").
stage_u=$(mktemp -d)
cp packaging/school/bin/Lark.exe "$stage_u/Lark.exe"
cp dist/lark.jar "$stage_u/lark.jar"
cp packaging/school/README.txt "$stage_u/README.txt"
printf 'school\n' > "$stage_u/school.marker"
printf '%s\n' "$github_latest/update.json" > "$stage_u/update-feed.url"
rm -f release/lark-school-update.zip
(cd "$stage_u" && zip -X -r "$root/release/lark-school-update.zip" .)
rm -rf "$stage_u"
ls -lh release/lark-school-update.zip

if [ -f release/update.json ]; then
  python3 - <<PY
import json, pathlib
p = pathlib.Path("release/update.json")
data = json.loads(p.read_text())
base = "$feed_base"
data["version"] = "$version"
data.setdefault("downloads", {})
data["downloads"]["school"] = f"{base}/lark-school-update.zip"
data["downloads"]["school-windows"] = f"{base}/lark-school-update.zip"
data["school"] = {
  "windows": f"{base}/lark-school-windows.zip",
}
p.write_text(json.dumps(data, indent=2) + "\n")
print("Updated release/update.json with school keys")
PY
fi

echo "Lark School packages ready for $version"
echo "Students: Extract All → double-click Lark.exe (no .bat)."
