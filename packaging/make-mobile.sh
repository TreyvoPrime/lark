#!/bin/sh
# Build Lark Mobile portable zips (separate download from Desktop / portable).
set -eu
cd "$(dirname "$0")/.."
if [ "${LARK_SKIP_PACKAGE:-}" != "1" ] || [ ! -f dist/lark.jar ]; then
  ./package.sh
fi
root=$(pwd)
version=$(sed -n 's/.*VERSION = "\([^"]*\)".*/\1/p' src/lark/Settings.java | head -n 1)
notes=${LARK_UPDATE_NOTES:-"Lark Mobile ${version}: touch-first UI and phone Wi‑Fi pairing."}
feed_base=${LARK_UPDATE_BASE:-}
cache=${LARK_JDK_CACHE:-"$root/release/.jdk-cache"}
mkdir -p "$cache" release
chmod +x packaging/fetch-portable-jdk.sh packaging/mobile/start-lark-mobile.sh

github_latest="https://github.com/TreyvoPrime/lark/releases/latest/download"
if [ -n "$feed_base" ]; then
  feed_base=$(printf '%s' "$feed_base" | sed 's:/*$::')
else
  feed_base="$github_latest"
fi

stage_update=$(mktemp -d)
cp dist/lark.jar "$stage_update/lark.jar"
cp "packaging/mobile/Start Lark Mobile.bat" "$stage_update/Start Lark Mobile.bat"
cp "packaging/mobile/Start Lark Mobile.vbs" "$stage_update/Start Lark Mobile.vbs"
cp packaging/mobile/start-lark-mobile.sh "$stage_update/start-lark-mobile.sh"
cp packaging/mobile/start-lark-mobile.sh "$stage_update/Start Lark Mobile.command"
cp packaging/mobile/README.txt "$stage_update/README.txt"
cp packaging/finish-update.bat "$stage_update/finish-update.bat"
printf 'mobile\n' > "$stage_update/mobile.marker"
printf '%s\n' "$github_latest/update.json" > "$stage_update/update-feed.url"
chmod 755 "$stage_update/start-lark-mobile.sh" "$stage_update/Start Lark Mobile.command"
rm -f release/lark-mobile-update.zip release/lark-mobile.zip
(cd "$stage_update" && zip -X -r "$root/release/lark-mobile-update.zip" .)
cp release/lark-mobile-update.zip release/lark-mobile.zip
rm -rf "$stage_update"

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

pack_mobile() {
  name=$1
  os=$2
  arch=$3
  echo "Building $name (Lark Mobile + bundled JDK)..."
  fetch_cached "$os" "$arch"
  stage=$(mktemp -d)
  cp dist/lark.jar "$stage/lark.jar"
  cp "packaging/mobile/Start Lark Mobile.bat" "$stage/Start Lark Mobile.bat"
  cp "packaging/mobile/Start Lark Mobile.vbs" "$stage/Start Lark Mobile.vbs"
  cp packaging/mobile/start-lark-mobile.sh "$stage/start-lark-mobile.sh"
  cp packaging/mobile/start-lark-mobile.sh "$stage/Start Lark Mobile.command"
  cp packaging/mobile/README.txt "$stage/README.txt"
  cp packaging/finish-update.bat "$stage/finish-update.bat"
  printf 'mobile\n' > "$stage/mobile.marker"
  printf '%s\n' "$github_latest/update.json" > "$stage/update-feed.url"
  chmod 755 "$stage/start-lark-mobile.sh" "$stage/Start Lark Mobile.command"
  cp -a "$cache/${os}-${arch}/jdk" "$stage/jdk"
  rm -f "release/$name"
  (cd "$stage" && zip -X -r "$root/release/$name" .)
  rm -rf "$stage"
  ls -lh "release/$name"
}

host_arch=$(uname -m)
case "$host_arch" in
  arm64|aarch64) host_arch=aarch64 ;;
  *) host_arch=x64 ;;
esac

pack_mobile lark-mobile-windows.zip windows x64
pack_mobile lark-mobile-linux.zip linux "$host_arch"
pack_mobile lark-mobile-mac.zip mac "$host_arch"

# Merge mobile keys into update.json when present.
if [ -f release/update.json ]; then
  python3 - <<PY
import json, pathlib
p = pathlib.Path("release/update.json")
data = json.loads(p.read_text())
base = "$feed_base"
data["version"] = "$version"
data.setdefault("downloads", {})
data["downloads"]["mobile"] = f"{base}/lark-mobile-update.zip"
data["downloads"]["mobile-windows"] = f"{base}/lark-mobile-update.zip"
data["downloads"]["mobile-mac"] = f"{base}/lark-mobile-update.zip"
data["downloads"]["mobile-linux"] = f"{base}/lark-mobile-update.zip"
data["mobile"] = {
  "windows": f"{base}/lark-mobile-windows.zip",
  "mac": f"{base}/lark-mobile-mac.zip",
  "linux": f"{base}/lark-mobile-linux.zip",
  "any": f"{base}/lark-mobile.zip",
}
p.write_text(json.dumps(data, indent=2) + "\n")
print("Updated release/update.json with mobile keys")
PY
fi

ls -lh release/lark-mobile*.zip 2>/dev/null | head -20
echo "Lark Mobile packages ready for $version"
