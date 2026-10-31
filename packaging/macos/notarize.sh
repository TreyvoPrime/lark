#!/usr/bin/env bash
# Sign first with build-app.sh, then notarize both app and final DMG.
set -euo pipefail
cd "$(dirname "$0")/../.."
[[ $(uname -s) == Darwin ]] || { echo 'macOS and Xcode command-line tools are required.' >&2; exit 1; }
: "${LARK_MAC_SIGNING_NAME:?Missing Developer ID name}"
: "${APPLE_API_KEY_PATH:?Missing private .p8 path}"
: "${APPLE_API_KEY_ID:?Missing App Store Connect key ID}"
: "${APPLE_API_ISSUER:?Missing App Store Connect issuer ID}"
app=release/macos/Lark.app
codesign --verify --deep --strict --verbose=2 "$app"
# Reject ad-hoc/local signing before submitting or producing release assets.
codesign -dv --verbose=4 "$app" 2>&1 | grep -q 'Authority=Developer ID Application:'
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
notarize() {
  local file=$1 report=$2
  xcrun notarytool submit "$file" --key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY_ID" --issuer "$APPLE_API_ISSUER" --wait --timeout 30m --output-format json > "$report"
  python3 - "$report" <<'PY'
import json,sys
r=json.load(open(sys.argv[1]))
if r.get('status')!='Accepted':raise SystemExit('Notarization was not accepted. Inspect the Apple submission log before release.')
PY
}
ditto -c -k --keepParent "$app" "$work/app.zip"
notarize "$work/app.zip" release/macos/app-notarization.json
xcrun stapler staple "$app"
xcrun stapler validate "$app"
codesign --verify --deep --strict "$app"
spctl --assess --type execute --verbose=2 "$app"
version=$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$app/Contents/Info.plist")
arch=$(uname -m)
name="Lark-$version-macOS-$arch"
mkdir "$work/image"
ditto "$app" "$work/image/Lark.app"
ln -s /Applications "$work/image/Applications"
hdiutil create -volname Lark -srcfolder "$work/image" -format UDZO "release/macos/$name.dmg"
codesign --force --timestamp --sign "Developer ID Application: $LARK_MAC_SIGNING_NAME" "release/macos/$name.dmg"
notarize "release/macos/$name.dmg" release/macos/dmg-notarization.json
xcrun stapler staple "release/macos/$name.dmg"
xcrun stapler validate "release/macos/$name.dmg"
spctl --assess --type open --context context:primary-signature --verbose=2 "release/macos/$name.dmg"
ditto -c -k --keepParent "$app" "release/macos/$name.zip"
(cd release/macos && shasum -a 256 "$name.dmg" "$name.zip" > SHA256SUMS.txt)
echo 'Notarized application ZIP and signed, stapled DMG are ready.'
