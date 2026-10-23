#!/bin/sh
# Build Lark Desktop packages — unified primary install (replaces separate "portable" UX).
# Layout after extract: Start Lark Desktop.* + jdk/ + app/ (runtime).
set -eu
cd "$(dirname "$0")/.."
./package.sh
root=$(pwd)
version=$(sed -n 's/.*VERSION = "\([^"]*\)".*/\1/p' src/lark/Settings.java | head -n 1)
notes=${LARK_UPDATE_NOTES:-"Lark Desktop ${version}: one clean install — Start + jdk + app runtime."}
feed_base=${LARK_UPDATE_BASE:-}
cache=${LARK_JDK_CACHE:-"$root/release/.jdk-cache"}
mkdir -p "$cache" release
chmod +x packaging/fetch-portable-jdk.sh packaging/make-desktop.sh
chmod 755 packaging/desktop/start-lark-desktop.sh packaging/desktop/Install\ Lark\ Desktop.command 2>/dev/null || true
chmod 755 "packaging/desktop/Start Lark Desktop.bat" 2>/dev/null || true

github_latest="https://github.com/TreyvoPrime/lark/releases/latest/download"
if [ -n "$feed_base" ]; then
  feed_base=$(printf '%s' "$feed_base" | sed 's:/*$::')
else
  feed_base="$github_latest"
fi

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

stage_desktop_common() {
  stage=$1
  mkdir -p "$stage/app"
  cp dist/lark.jar "$stage/app/lark.jar"
  # Top-level only: launcher scripts users actually click.
  cp "packaging/desktop/Start Lark Desktop.bat" "$stage/Start Lark Desktop.bat"
  cp packaging/desktop/start-lark-desktop.sh "$stage/start-lark-desktop.sh"
  cp packaging/desktop/start-lark-desktop.sh "$stage/Start Lark Desktop.command"
  cp packaging/desktop/README-DESKTOP.txt "$stage/README.txt"
  # Runtime + helpers tucked in app/
  cp "packaging/desktop/Start Lark Desktop.vbs" "$stage/app/Start Lark Desktop.vbs"
  cp "packaging/desktop/Install Lark Desktop.ps1" "$stage/app/Install Lark Desktop.ps1"
  cp "packaging/desktop/Uninstall Lark Desktop.ps1" "$stage/app/Uninstall Lark Desktop.ps1"
  cp "packaging/desktop/Install Lark Desktop.command" "$stage/app/Install Lark Desktop.command" 2>/dev/null || true
  cp packaging/finish-update.bat "$stage/app/finish-update.bat" 2>/dev/null || true
  cp "packaging/Stop Lark and Clean Cache.bat" "$stage/app/Stop Lark and Clean Cache.bat" 2>/dev/null || true
  cp "packaging/Wipe Lark From This PC.bat" "$stage/app/Wipe Lark From This PC.bat" 2>/dev/null || true
  if [ -f packaging/desktop/lark-icon.png ]; then
    cp packaging/desktop/lark-icon.png "$stage/app/lark-icon.png"
  fi
  printf 'desktop\n' > "$stage/app/desktop.marker"
  printf '%s\n' "$github_latest/update.json" > "$stage/app/update-feed.url"
  chmod 755 "$stage/start-lark-desktop.sh" "$stage/Start Lark Desktop.command"
  chmod 755 "$stage/app/Install Lark Desktop.command" 2>/dev/null || true
}

# Slim desktop update (jar + top-level launchers + app helpers) — in-app updates.
stage_update=$(mktemp -d)
stage_desktop_common "$stage_update"
rm -f release/lark-desktop-update.zip
(cd "$stage_update" && zip -X -r "$root/release/lark-desktop-update.zip" .)
rm -rf "$stage_update"
ls -lh release/lark-desktop-update.zip

pack_desktop() {
  name=$1
  os=$2
  arch=$3
  echo "Building $name (Desktop + bundled JDK, slim top-level)..."
  fetch_cached "$os" "$arch"
  stage=$(mktemp -d)
  stage_desktop_common "$stage"
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

pack_desktop lark-desktop-windows.zip windows x64
pack_desktop lark-desktop-linux.zip linux "$host_arch"
pack_desktop lark-desktop-mac.zip mac "$host_arch"

# Unified product: portable zip names are aliases of Desktop packages.
cp -f release/lark-desktop-windows.zip release/lark-windows.zip
cp -f release/lark-desktop-mac.zip release/lark-mac.zip
cp -f release/lark-desktop-linux.zip release/lark-linux.zip
cp -f release/lark-desktop-update.zip release/lark-update.zip
cp -f release/lark-desktop-update.zip release/lark.zip
ls -lh release/lark-windows.zip release/lark-update.zip

# Linux native packages via jpackage when available.
if command -v jpackage >/dev/null 2>&1; then
  echo "Building Linux app-image with jpackage..."
  jp_in=$(mktemp -d)
  mkdir -p "$jp_in"
  cp dist/lark.jar "$jp_in/lark.jar"
  icon_args=
  if [ -f packaging/desktop/lark-icon.png ]; then
    icon_args="--icon packaging/desktop/lark-icon.png"
  fi
  rm -rf release/Lark release/lark-desktop-linux-appimage
  # shellcheck disable=SC2086
  jpackage \
    --type app-image \
    --name Lark \
    --app-version "$version" \
    --description "Lark Desktop — focused Java IDE" \
    --vendor "Lark" \
    --input "$jp_in" \
    --main-jar lark.jar \
    --main-class lark.Desktop \
    --dest release \
    --java-options "-Dlark.desktop=true" \
    --java-options "-Dlark.channel=desktop" \
    --java-options "-Dlark.ui=jar" \
    $icon_args \
    || echo "jpackage app-image skipped/failed (non-fatal)"
  if [ -d release/Lark ]; then
    if [ -d release/Lark/lib/app ]; then
      printf 'desktop\n' > release/Lark/lib/app/desktop.marker
      printf '%s\n' "$github_latest/update.json" > release/Lark/lib/app/update-feed.url
    fi
    rm -f release/lark-desktop-linux-appimage.zip
    (cd release && zip -X -r lark-desktop-linux-appimage.zip Lark)
    ls -lh release/lark-desktop-linux-appimage.zip
  fi
  rm -rf "$jp_in"
else
  echo "jpackage not found — skipping native Linux app-image"
fi

if [ -f release/update.json ]; then
  python3 - <<PY
import json, pathlib
p = pathlib.Path("release/update.json")
data = json.loads(p.read_text())
base = "$feed_base"
data["version"] = "$version"
data["notes"] = """$notes"""
data.setdefault("downloads", {})
# Desktop is the primary channel; portable keys alias the same artifacts.
for key in ("desktop", "desktop-windows", "desktop-mac", "desktop-linux",
            "windows", "mac", "linux", "any"):
    data["downloads"][key] = f"{base}/lark-desktop-update.zip"
data["desktop"] = {
  "windows": f"{base}/lark-desktop-windows.zip",
  "mac": f"{base}/lark-desktop-mac.zip",
  "linux": f"{base}/lark-desktop-linux.zip",
}
p.write_text(json.dumps(data, indent=2) + "\n")
print("Updated release/update.json with unified desktop keys")
PY
fi

ls -lh release/lark-desktop-*.zip release/update.json 2>/dev/null || true
echo "Desktop packages ready for Lark $version (portable aliases included)"
