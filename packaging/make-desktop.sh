#!/bin/sh
# Build Lark Desktop — default installed edition (Setup wizard + buried app/jdk).
set -eu
cd "$(dirname "$0")/.."
if [ "${LARK_SKIP_PACKAGE:-}" != "1" ] || [ ! -f dist/lark.jar ]; then
  ./package.sh
fi
root=$(pwd)
version=$(sed -n 's/.*VERSION = "\([^"]*\)".*/\1/p' src/lark/Settings.java | head -n 1)
feed_base=${LARK_UPDATE_BASE:-}
cache=${LARK_JDK_CACHE:-"$root/release/.jdk-cache"}
mkdir -p "$cache" release packaging/desktop/bin
chmod +x packaging/fetch-portable-jdk.sh packaging/desktop/start-lark-desktop.sh

github_latest="https://github.com/TreyvoPrime/lark/releases/latest/download"
if [ -n "$feed_base" ]; then
  feed_base=$(printf '%s' "$feed_base" | sed 's:/*$::')
else
  feed_base="$github_latest"
fi

echo "Building Lark Desktop.exe (Windows, no console)..."
if ! command -v go >/dev/null 2>&1; then
  echo "Go is required to build the Desktop launcher." >&2
  exit 1
fi
(
  cd packaging/desktop/launcher
  GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build \
    -trimpath \
    -ldflags="-s -w -H windowsgui" \
    -o ../bin/LarkDesktop.exe \
    .
)
cp packaging/desktop/bin/LarkDesktop.exe "packaging/desktop/bin/Lark Desktop.exe"
ls -lh packaging/desktop/bin/LarkDesktop.exe

echo "Building Desktop icon (.ico)..."
python3 - <<'PY'
from pathlib import Path
try:
    from PIL import Image, ImageDraw
except ImportError:
    raise SystemExit("Pillow required to build lark-icon.ico")
src = Path("packaging/desktop/lark-icon.png")
out = Path("packaging/desktop/lark-icon.ico")
if src.is_file():
    im = Image.open(src).convert("RGBA")
else:
    im = Image.new("RGBA", (256, 256), (27, 25, 22, 255))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((16, 16, 240, 240), radius=48, fill=(27, 25, 22, 255))
    d.arc((40, 60, 216, 220), 200, 340, fill=(227, 164, 90, 255), width=18)
im.save(out, sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print("Wrote", out)
PY

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

stage_desktop() {
  stage=$1
  mkdir -p "$stage/app"
  cp "packaging/desktop/bin/Lark Desktop.exe" "$stage/Lark Desktop.exe"
  cp dist/lark.jar "$stage/app/lark.jar"
  cp packaging/desktop/README-DESKTOP.txt "$stage/README.txt"
  cp packaging/desktop/start-lark-desktop.sh "$stage/start-lark-desktop.sh"
  cp packaging/desktop/start-lark-desktop.sh "$stage/Launch Lark Desktop.command"
  cp packaging/desktop/lark-icon.ico "$stage/app/lark-icon.ico"
  if [ -f packaging/desktop/lark-icon.png ]; then
    cp packaging/desktop/lark-icon.png "$stage/app/lark-icon.png"
  fi
  if [ -f packaging/desktop/Stamp-LarkAumid.ps1 ]; then
    cp packaging/desktop/Stamp-LarkAumid.ps1 "$stage/app/Stamp-LarkAumid.ps1"
  fi
  if [ -f "packaging/desktop/Install Lark Desktop.ps1" ]; then
    cp "packaging/desktop/Install Lark Desktop.ps1" "$stage/app/Install Lark Desktop.ps1"
  fi
  printf 'desktop\n' > "$stage/app/desktop.marker"
  printf '%s\n' "$github_latest/update.json" > "$stage/app/update-feed.url"
  chmod 755 "$stage/start-lark-desktop.sh" "$stage/Launch Lark Desktop.command"
}

echo "Staging Lark Desktop Windows payload (buried app/ + jdk/)..."
fetch_cached windows x64
payload=$(mktemp -d)
stage_desktop "$payload"
cp -a "$cache/windows-x64/jdk" "$payload/jdk"

rm -f release/lark-desktop-windows.zip
(cd "$payload" && zip -X -r "$root/release/lark-desktop-windows.zip" .)
ls -lh release/lark-desktop-windows.zip

# NSIS Setup wizard — primary Desktop download.
if ! command -v makensis >/dev/null 2>&1; then
  echo "makensis not found — skipping LarkDesktopSetup.exe (install nsis)." >&2
else
  echo "Building LarkDesktopSetup.exe (NSIS wizard)..."
  nsi_dir="packaging/desktop"
  rm -rf "$nsi_dir/payload"
  mkdir -p "$nsi_dir/payload"
  cp -a "$payload"/. "$nsi_dir/payload/"
  makensis \
    -D"LARK_VERSION=$version" \
    -D"LARK_PAYLOAD=payload" \
    -D"LARK_OUT=$root/release/LarkDesktopSetup.exe" \
    "$nsi_dir/lark-desktop.nsi"
  ls -lh release/LarkDesktopSetup.exe
  rm -rf "$nsi_dir/payload"
fi

rm -rf "$payload"

# Slim desktop update (jar + marker + scripts; omit running exe).
stage_u=$(mktemp -d)
stage_desktop "$stage_u"
rm -f "$stage_u/Lark Desktop.exe"
rm -f release/lark-desktop-update.zip
(cd "$stage_u" && zip -X -r "$root/release/lark-desktop-update.zip" .)
rm -rf "$stage_u"
ls -lh release/lark-desktop-update.zip

# Portable aliases (same Desktop update payload).
cp -f release/lark-desktop-update.zip release/lark-update.zip
cp -f release/lark-desktop-update.zip release/lark.zip

# Mac/Linux Desktop payload zips (exe-less; shell launcher + buried app/jdk).
pack_unix() {
  name=$1
  os=$2
  arch=$3
  echo "Building $name (Desktop unix payload)..."
  fetch_cached "$os" "$arch"
  stage=$(mktemp -d)
  mkdir -p "$stage/app"
  cp dist/lark.jar "$stage/app/lark.jar"
  cp packaging/desktop/README-DESKTOP.txt "$stage/README.txt"
  cp packaging/desktop/start-lark-desktop.sh "$stage/start-lark-desktop.sh"
  cp packaging/desktop/start-lark-desktop.sh "$stage/Launch Lark Desktop.command"
  printf 'desktop\n' > "$stage/app/desktop.marker"
  printf '%s\n' "$github_latest/update.json" > "$stage/app/update-feed.url"
  chmod 755 "$stage/start-lark-desktop.sh" "$stage/Launch Lark Desktop.command"
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
pack_unix lark-desktop-mac.zip mac "$host_arch"
pack_unix lark-desktop-linux.zip linux "$host_arch"
cp -f release/lark-desktop-mac.zip release/lark-mac.zip
cp -f release/lark-desktop-linux.zip release/lark-linux.zip
cp -f release/lark-desktop-windows.zip release/lark-windows.zip

if [ -f release/update.json ]; then
  python3 - <<PY
import json, pathlib, hashlib
p = pathlib.Path("release/update.json")
data = json.loads(p.read_text())
base = "$feed_base"
data["version"] = "$version"
data.setdefault("downloads", {})
for k in ("desktop", "desktop-windows", "desktop-mac", "desktop-linux",
          "windows", "mac", "linux", "any"):
    data["downloads"][k] = f"{base}/lark-desktop-update.zip"
data["desktop"] = {
  "windows": f"{base}/LarkDesktopSetup.exe",
  "windows-zip": f"{base}/lark-desktop-windows.zip",
  "mac": f"{base}/lark-desktop-mac.zip",
  "linux": f"{base}/lark-desktop-linux.zip",
}
data.pop("enterprise", None)
data.pop("school", None)
for k in list(data.get("downloads", {})):
    if "enterprise" in k or "school" in k:
        data["downloads"].pop(k, None)
sha = data.setdefault("sha256", {})
def h(path):
    f = pathlib.Path(path)
    return hashlib.sha256(f.read_bytes()).hexdigest() if f.is_file() else ""
hu = h("release/lark-desktop-update.zip")
if hu:
    for k in ("desktop", "desktop-windows", "desktop-mac", "desktop-linux",
              "lark-desktop-update.zip", "lark-update.zip", "any", "windows", "mac", "linux"):
        sha[k] = hu
hs = h("release/LarkDesktopSetup.exe")
if hs:
    sha["LarkDesktopSetup.exe"] = hs
for k in list(sha):
    if "enterprise" in k or "school" in k:
        sha.pop(k, None)
p.write_text(json.dumps(data, indent=2) + "\n")
print("Updated release/update.json with desktop keys")
PY
fi

echo "Lark Desktop packages ready for $version"
echo "Primary: release/LarkDesktopSetup.exe"
echo "Also:    release/lark-desktop-windows.zip (payload)"
echo "Update:  release/lark-desktop-update.zip"
