#!/bin/sh
# Build Lark Desktop packages (enterprise installers) alongside portable zips.
# Linux host can produce: desktop windows/mac/linux zips + Linux app-image/deb via jpackage.
set -eu
cd "$(dirname "$0")/.."
./package.sh
root=$(pwd)
version=$(sed -n 's/.*VERSION = "\([^"]*\)".*/\1/p' src/lark/Settings.java | head -n 1)
notes=${LARK_UPDATE_NOTES:-"Lark Desktop ${version}: enterprise install with update prompts. Portable zips remain available."}
feed_base=${LARK_UPDATE_BASE:-}
cache=${LARK_JDK_CACHE:-"$root/release/.jdk-cache"}
mkdir -p "$cache" release
chmod +x packaging/fetch-portable-jdk.sh packaging/make-desktop.sh
chmod 755 packaging/desktop/start-lark-desktop.sh packaging/desktop/Install\ Lark\ Desktop.command 2>/dev/null || true

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
  cp dist/lark.jar "$stage/lark.jar"
  cp "packaging/desktop/Launch Lark Desktop.bat" "$stage/Launch Lark Desktop.bat"
  cp "packaging/desktop/Launch Lark Desktop.vbs" "$stage/Launch Lark Desktop.vbs"
  cp packaging/desktop/start-lark-desktop.sh "$stage/start-lark-desktop.sh"
  cp packaging/desktop/start-lark-desktop.sh "$stage/Launch Lark Desktop.command"
  cp "packaging/desktop/Install Lark Desktop.ps1" "$stage/Install Lark Desktop.ps1"
  cp "packaging/desktop/Uninstall Lark Desktop.ps1" "$stage/Uninstall Lark Desktop.ps1"
  cp "packaging/desktop/Install Lark Desktop.command" "$stage/Install Lark Desktop.command"
  cp packaging/desktop/README-DESKTOP.txt "$stage/README.txt"
  if [ -f packaging/desktop/lark-icon.png ]; then
    cp packaging/desktop/lark-icon.png "$stage/lark-icon.png"
  fi
  # Keep portable helpers for wipe/stop + update finish
  cp packaging/finish-update.bat "$stage/finish-update.bat" 2>/dev/null || true
  cp "packaging/Stop Lark and Clean Cache.bat" "$stage/Stop Lark and Clean Cache.bat" 2>/dev/null || true
  cp "packaging/Wipe Lark From This PC.bat" "$stage/Wipe Lark From This PC.bat" 2>/dev/null || true
  printf 'desktop\n' > "$stage/desktop.marker"
  printf '%s\n' "$github_latest/update.json" > "$stage/update-feed.url"
  chmod 755 "$stage/start-lark-desktop.sh" "$stage/Launch Lark Desktop.command" "$stage/Install Lark Desktop.command"
}

# Slim desktop update (jar + desktop launchers only) — in-app updates download this.
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
  echo "Building $name (Desktop + bundled JDK)..."
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

# Linux native packages via jpackage when available.
if command -v jpackage >/dev/null 2>&1; then
  echo "Building Linux app-image with jpackage..."
  jp_in=$(mktemp -d)
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
    --description "Lark Desktop — enterprise Java IDE" \
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
    # Stamp desktop marker + update feed into the app image resources if present
    if [ -d release/Lark/lib/app ]; then
      printf 'desktop\n' > release/Lark/lib/app/desktop.marker
      printf '%s\n' "$github_latest/update.json" > release/Lark/lib/app/update-feed.url
    fi
    rm -f release/lark-desktop-linux-appimage.zip
    (cd release && zip -X -r lark-desktop-linux-appimage.zip Lark)
    ls -lh release/lark-desktop-linux-appimage.zip
  fi
  rm -rf "$jp_in"

  if command -v dpkg-deb >/dev/null 2>&1 || command -v rpmbuild >/dev/null 2>&1; then
    echo "Attempting jpackage installer (deb/rpm)..."
    jp_in=$(mktemp -d)
    cp dist/lark.jar "$jp_in/lark.jar"
    # shellcheck disable=SC2086
    jpackage \
      --name Lark \
      --app-version "$version" \
      --description "Lark Desktop — enterprise Java IDE" \
      --vendor "Lark" \
      --input "$jp_in" \
      --main-jar lark.jar \
      --main-class lark.Desktop \
      --dest release \
      --java-options "-Dlark.desktop=true" \
      --java-options "-Dlark.channel=desktop" \
      --java-options "-Dlark.ui=jar" \
      $icon_args \
      || echo "jpackage package skipped/failed (non-fatal)"
    rm -rf "$jp_in"
  fi
else
  echo "jpackage not found — skipping native Linux app-image"
fi

# Merge desktop download keys into update.json (created by make-release or here).
if [ -f release/update.json ]; then
  python3 - <<PY
import json, pathlib
p = pathlib.Path("release/update.json")
data = json.loads(p.read_text())
base = "$feed_base"
data["version"] = "$version"
data["notes"] = """$notes"""
data.setdefault("downloads", {})
data["downloads"]["desktop"] = f"{base}/lark-desktop-update.zip"
data["downloads"]["desktop-windows"] = f"{base}/lark-desktop-update.zip"
data["downloads"]["desktop-mac"] = f"{base}/lark-desktop-update.zip"
data["downloads"]["desktop-linux"] = f"{base}/lark-desktop-update.zip"
data["desktop"] = {
  "windows": f"{base}/lark-desktop-windows.zip",
  "mac": f"{base}/lark-desktop-mac.zip",
  "linux": f"{base}/lark-desktop-linux.zip",
}
p.write_text(json.dumps(data, indent=2) + "\n")
print("Updated release/update.json with desktop keys")
PY
else
  cat > release/update.json <<EOF
{
  "version": "$version",
  "notes": "$notes",
  "page": "https://treyvoprime.github.io/lark-download/",
  "downloads": {
    "windows": "$feed_base/lark-update.zip",
    "mac": "$feed_base/lark-update.zip",
    "linux": "$feed_base/lark-update.zip",
    "any": "$feed_base/lark-update.zip",
    "desktop": "$feed_base/lark-desktop-update.zip",
    "desktop-windows": "$feed_base/lark-desktop-update.zip",
    "desktop-mac": "$feed_base/lark-desktop-update.zip",
    "desktop-linux": "$feed_base/lark-desktop-update.zip"
  },
  "desktop": {
    "windows": "$feed_base/lark-desktop-windows.zip",
    "mac": "$feed_base/lark-desktop-mac.zip",
    "linux": "$feed_base/lark-desktop-linux.zip"
  }
}
EOF
fi

ls -lh release/lark-desktop-*.zip release/update.json 2>/dev/null || true
echo "Desktop packages ready for Lark $version"
