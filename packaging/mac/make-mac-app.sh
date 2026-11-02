#!/bin/bash
# Build Lark.app (and a .dmg when hdiutil exists, i.e. on macOS).
# Usage: make-mac-app.sh <lark.jar> <jdk-dir> <arm64|x86_64> <version> <out-dir> [icon.icns]
set -euo pipefail
jar=$1; jdk=$2; arch=$3; version=$4; out=$5; icon=${6:-}
here="$(cd "$(dirname "$0")" && pwd)"
case "$arch" in arm64) label=apple-silicon ;; x86_64) label=intel ;; *) echo "arch must be arm64 or x86_64" >&2; exit 1 ;; esac
stage=$(mktemp -d)
app="$stage/Lark.app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources/app"
sed -e "s/__VERSION__/$version/g" -e "s/__ARCH__/$arch/g" "$here/Info.plist" > "$app/Contents/Info.plist"
cp "$here/Lark" "$app/Contents/MacOS/Lark"; chmod 755 "$app/Contents/MacOS/Lark"
cp "$jar" "$app/Contents/Resources/app/lark.jar"
printf '%s\n' "https://github.com/TreyvoPrime/lark/releases/latest/download/update.json" > "$app/Contents/Resources/app/update-feed.url"
cp -a "$jdk" "$app/Contents/Resources/jdk"
[[ -n "$icon" && -f "$icon" ]] && cp "$icon" "$app/Contents/Resources/Lark.icns"
mkdir -p "$out"
if command -v codesign >/dev/null; then
  # Ad-hoc signature: required on Apple Silicon; users still approve it once (no paid Apple ID).
  codesign --force --deep --sign - "$app"
  codesign --verify --deep --strict "$app"
fi
if command -v hdiutil >/dev/null; then
  ln -s /Applications "$stage/Applications"
  rm -f "$out/Lark-mac-$label.dmg"
  hdiutil create -volname "Lark" -srcfolder "$stage" -ov -format UDZO "$out/Lark-mac-$label.dmg"
  ls -lh "$out/Lark-mac-$label.dmg"
else
  (cd "$stage" && zip -qry "$out/Lark-mac-$label-app.zip" Lark.app)
  ls -lh "$out/Lark-mac-$label-app.zip"
fi
rm -rf "$stage"
