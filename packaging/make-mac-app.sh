#!/usr/bin/env bash
# Build Lark.app for one Mac CPU and wrap it in a .dmg (on macOS) or a .zip (elsewhere, for checks).
# Usage: make-mac-app.sh <aarch64|x64> <lark-mac.zip> <out-dir>
set -euo pipefail
ARCH="$1"; PAYLOAD_ZIP="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"; OUT="$3"
HERE="$(cd "$(dirname "$0")" && pwd)"; REPO="$(cd "$HERE/.." && pwd)"
VERSION="${LARK_VERSION:-$(sed -n 's/.*VERSION = "\([^"]*\)".*/\1/p' "$REPO/src/lark/Settings.java" | head -1)}"
case "$ARCH" in aarch64) LABEL=apple-silicon ;; x64) LABEL=intel ;; *) echo "arch must be aarch64 or x64" >&2; exit 2 ;; esac
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
APP="$WORK/stage/Lark.app"; RES="$APP/Contents/Resources/lark"
mkdir -p "$APP/Contents/MacOS" "$RES" "$OUT"
unzip -q "$PAYLOAD_ZIP" -d "$RES"
rm -rf "$RES/jdk"
bash "$HERE/fetch-portable-jdk.sh" mac "$ARCH" "$WORK/jdk" >/dev/null
mv "$WORK/jdk/jdk" "$RES/jdk"
grep -q "OS_ARCH=\"$( [ "$ARCH" = x64 ] && echo x86_64 || echo aarch64 )\"" "$RES/jdk/release"
cp "$HERE/desktop/start-lark-desktop.sh" "$RES/start-lark-desktop.sh"
cp "$HERE/desktop/start-lark-desktop.sh" "$RES/Launch Lark Desktop.command"
chmod +x "$RES/start-lark-desktop.sh" "$RES/Launch Lark Desktop.command" "$RES/jdk/bin/"*
cp "$HERE/mac/Lark" "$APP/Contents/MacOS/Lark"; chmod +x "$APP/Contents/MacOS/Lark"
sed "s/@VERSION@/$VERSION/g" "$HERE/mac/Info.plist" > "$APP/Contents/Info.plist"
python3 - "$HERE/desktop/lark-icon.png" "$APP/Contents/Resources/lark.icns" <<'PY'
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert("RGBA")
side = max(im.size); canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
canvas.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
canvas.resize((1024, 1024), Image.LANCZOS).save(sys.argv[2], format="ICNS")
PY
test -f "$RES/app/lark.jar"
if command -v hdiutil >/dev/null; then
  # Ad-hoc signature so Apple-chip Macs accept the bundle; Gatekeeper still asks once (not notarized).
  codesign --force --sign - "$APP/Contents/MacOS/Lark" || true
  ln -s /Applications "$WORK/stage/Applications"
  hdiutil create -quiet -volname "Lark" -srcfolder "$WORK/stage" -ov -format UDZO "$OUT/Lark-mac-$LABEL.dmg"
  echo "$OUT/Lark-mac-$LABEL.dmg"
else
  (cd "$WORK/stage" && zip -qry "$OUT/Lark-mac-$LABEL-app.zip" Lark.app)
  echo "$OUT/Lark-mac-$LABEL-app.zip"
fi
