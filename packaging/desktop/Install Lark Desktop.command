#!/bin/sh
# Install Lark Desktop for the current user (Mac / Linux) — no admin.
set -eu
HERE=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
DEST="${LARK_DESKTOP_HOME:-$HOME/Applications/Lark Desktop}"

echo "Lark Desktop installer"
echo "  From: $HERE"
echo "  To:   $DEST"

if [ ! -f "$HERE/lark.jar" ]; then
  echo "lark.jar missing — unzip the full Desktop package first."
  exit 1
fi

mkdir -p "$DEST"
# Copy package contents; keep existing user files like lark-boot.log out of the way.
cp -a "$HERE/." "$DEST/"
printf 'desktop\n' > "$DEST/desktop.marker"
printf '%s\n' "https://github.com/TreyvoPrime/lark/releases/latest/download/update.json" > "$DEST/update-feed.url"
chmod 755 "$DEST/start-lark-desktop.sh" "$DEST/Launch Lark Desktop.command" 2>/dev/null || true
chmod 755 "$DEST/Install Lark Desktop.command" 2>/dev/null || true

# Desktop / Applications shortcut where possible
if [ "$(uname -s)" = "Darwin" ]; then
  APP="$HOME/Applications/Lark Desktop.app"
  mkdir -p "$APP/Contents/MacOS"
  cat > "$APP/Contents/MacOS/Lark Desktop" <<EOF
#!/bin/sh
exec "$DEST/start-lark-desktop.sh"
EOF
  chmod 755 "$APP/Contents/MacOS/Lark Desktop"
  cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Lark Desktop</string>
  <key>CFBundleIdentifier</key><string>app.lark.desktop</string>
  <key>CFBundleExecutable</key><string>Lark Desktop</string>
  <key>CFBundlePackageType</key><string>APPL</string>
</dict></plist>
PLIST
  echo "Created $APP"
elif command -v xdg-desktop-menu >/dev/null 2>&1 || [ -d "$HOME/.local/share/applications" ]; then
  mkdir -p "$HOME/.local/share/applications"
  cat > "$HOME/.local/share/applications/lark-desktop.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Lark Desktop
Comment=Enterprise Java IDE
Exec="$DEST/start-lark-desktop.sh"
Path=$DEST
Icon=$DEST/lark-icon.png
Terminal=false
Categories=Development;IDE;
EOF
  echo "Created ~/.local/share/applications/lark-desktop.desktop"
fi

echo "Installed. Launching Lark Desktop…"
exec "$DEST/start-lark-desktop.sh"
