#!/bin/sh
# Build lark.jar and portable zips. Platform zips embed a JDK so first boot
# works offline on school networks (no Adoptium download required).
set -eu
cd "$(dirname "$0")/.."
./package.sh
root=$(pwd)
version=$(sed -n 's/.*VERSION = "\([^"]*\)".*/\1/p' src/lark/Settings.java | head -n 1)
notes=${LARK_UPDATE_NOTES:-"Lark ${version}: Desktop install (update prompts, Start Menu) plus portable zips with a bundled JDK."}
feed_base=${LARK_UPDATE_BASE:-}
cache=${LARK_JDK_CACHE:-"$root/release/.jdk-cache"}
mkdir -p "$cache" release
chmod +x packaging/fetch-portable-jdk.sh

github_latest="https://github.com/TreyvoPrime/lark/releases/latest/download"
if [ -n "$feed_base" ]; then
  feed_base=$(printf '%s' "$feed_base" | sed 's:/*$::')
else
  feed_base="$github_latest"
fi

# Slim update package (jar + launchers only). In-app updates download this.
stage_update=$(mktemp -d)
cp dist/lark.jar "$stage_update/lark.jar"
cp "packaging/Start Lark.bat" "$stage_update/Start Lark.bat"
cp "packaging/Start Lark.vbs" "$stage_update/Start Lark.vbs"
cp packaging/finish-update.bat "$stage_update/finish-update.bat"
cp "packaging/Stop Lark and Clean Cache.bat" "$stage_update/Stop Lark and Clean Cache.bat"
cp "packaging/Wipe Lark From This PC.bat" "$stage_update/Wipe Lark From This PC.bat"
cp packaging/start-lark.sh "$stage_update/start-lark.sh"
cp packaging/start-lark.sh "$stage_update/Start Lark.command"
cp packaging/README.txt "$stage_update/README.txt"
chmod 755 "$stage_update/start-lark.sh" "$stage_update/Start Lark.command"
printf '%s\n' "$github_latest/update.json" > "$stage_update/update-feed.url"
rm -f release/lark-update.zip release/lark.zip
(cd "$stage_update" && zip -X -r "$root/release/lark-update.zip" .)
cp release/lark-update.zip release/lark.zip
rm -rf "$stage_update"

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
    "desktop-linux": "$feed_base/lark-desktop-update.zip",
    "mobile": "$feed_base/lark-mobile-update.zip",
    "mobile-windows": "$feed_base/lark-mobile-update.zip",
    "mobile-mac": "$feed_base/lark-mobile-update.zip",
    "mobile-linux": "$feed_base/lark-mobile-update.zip"
  },
  "desktop": {
    "windows": "$feed_base/lark-desktop-windows.zip",
    "mac": "$feed_base/lark-desktop-mac.zip",
    "linux": "$feed_base/lark-desktop-linux.zip"
  },
  "mobile": {
    "windows": "$feed_base/lark-mobile-windows.zip",
    "mac": "$feed_base/lark-mobile-mac.zip",
    "linux": "$feed_base/lark-mobile-linux.zip",
    "any": "$feed_base/lark-mobile.zip"
  }
}
EOF

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

pack_platform() {
  name=$1
  os=$2
  arch=$3
  echo "Building $name (with bundled JDK)..."
  fetch_cached "$os" "$arch"
  stage=$(mktemp -d)
  cp dist/lark.jar "$stage/lark.jar"
  cp "packaging/Start Lark.bat" "$stage/Start Lark.bat"
  cp "packaging/Start Lark.vbs" "$stage/Start Lark.vbs"
  cp packaging/finish-update.bat "$stage/finish-update.bat"
  cp "packaging/Stop Lark and Clean Cache.bat" "$stage/Stop Lark and Clean Cache.bat"
  cp "packaging/Wipe Lark From This PC.bat" "$stage/Wipe Lark From This PC.bat"
  cp packaging/start-lark.sh "$stage/start-lark.sh"
  cp packaging/start-lark.sh "$stage/Start Lark.command"
  cp packaging/README.txt "$stage/README.txt"
  chmod 755 "$stage/start-lark.sh" "$stage/Start Lark.command"
  printf '%s\n' "$github_latest/update.json" > "$stage/update-feed.url"
  cp -a "$cache/${os}-${arch}/jdk" "$stage/jdk"
  rm -f "release/$name"
  (cd "$stage" && zip -X -r "$root/release/$name" .)
  rm -rf "$stage"
  ls -lh "release/$name"
}

# Detect host arch for linux/mac convenience zips when building on this machine.
host_arch=$(uname -m)
case "$host_arch" in
  arm64|aarch64) host_arch=aarch64 ;;
  *) host_arch=x64 ;;
esac

pack_platform lark-windows.zip windows x64
pack_platform lark-linux.zip linux "$host_arch"
pack_platform lark-mac.zip mac "$host_arch"

# Enterprise desktop packages (installers + desktop update channel).
chmod +x packaging/make-desktop.sh packaging/make-mobile.sh
LARK_UPDATE_BASE="$feed_base" LARK_UPDATE_NOTES="$notes" ./packaging/make-desktop.sh

# Separate Lark Mobile edition (touch UI + phone pair).
LARK_SKIP_PACKAGE=1 LARK_UPDATE_BASE="$feed_base" LARK_UPDATE_NOTES="$notes" ./packaging/make-mobile.sh

ls -lh release/*.zip release/update.json 2>/dev/null | head -40
echo "Version $version"
echo "Portable: unzip + Start Lark. Desktop: Install Lark Desktop. Mobile: Start Lark Mobile."
