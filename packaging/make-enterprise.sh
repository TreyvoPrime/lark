#!/bin/sh
# Build Lark Enterprise — Windows Setup wizard + payload zip + slim update.
set -eu
cd "$(dirname "$0")/.."
if [ "${LARK_SKIP_PACKAGE:-}" != "1" ] || [ ! -f dist/lark.jar ]; then
  ./package.sh
fi
root=$(pwd)
version=$(sed -n 's/.*VERSION = "\([^"]*\)".*/\1/p' src/lark/Settings.java | head -n 1)
feed_base=${LARK_UPDATE_BASE:-}
cache=${LARK_JDK_CACHE:-"$root/release/.jdk-cache"}
mkdir -p "$cache" release packaging/enterprise/bin
chmod +x packaging/fetch-portable-jdk.sh packaging/enterprise/start-lark-enterprise.sh

github_latest="https://github.com/TreyvoPrime/lark/releases/latest/download"
if [ -n "$feed_base" ]; then
  feed_base=$(printf '%s' "$feed_base" | sed 's:/*$::')
else
  feed_base="$github_latest"
fi

echo "Building Lark Enterprise.exe (Windows, no console)..."
if ! command -v go >/dev/null 2>&1; then
  echo "Go is required to build the Enterprise launcher." >&2
  exit 1
fi
(
  cd packaging/enterprise/launcher
  GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build \
    -trimpath \
    -ldflags="-s -w -H windowsgui" \
    -o ../bin/LarkEnterprise.exe \
    .
)
# Keep a space-friendly copy name for the install tree.
cp packaging/enterprise/bin/LarkEnterprise.exe "packaging/enterprise/bin/Lark Enterprise.exe"
ls -lh packaging/enterprise/bin/LarkEnterprise.exe

echo "Building Enterprise icon (.ico)..."
python3 - <<'PY'
from pathlib import Path
try:
    from PIL import Image, ImageDraw
except ImportError:
    raise SystemExit("Pillow required to build lark-icon.ico")
src = Path("packaging/desktop/lark-icon.png")
out = Path("packaging/enterprise/lark-icon.ico")
out_png = Path("packaging/enterprise/lark-icon.png")
if src.is_file():
    im = Image.open(src).convert("RGBA")
else:
    # Fallback: draw a simple wing mark on slate.
    im = Image.new("RGBA", (256, 256), (20, 26, 34, 255))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((16, 16, 240, 240), radius=48, fill=(20, 26, 34, 255))
    d.arc((40, 60, 216, 220), 200, 340, fill=(91, 159, 212, 255), width=18)
    d.ellipse((190, 48, 222, 80), fill=(212, 163, 92, 255))
im.save(out_png)
sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
im.save(out, sizes=sizes)
print("Wrote", out, "and", out_png)
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

stage_enterprise() {
  stage=$1
  mkdir -p "$stage"
  cp "packaging/enterprise/bin/Lark Enterprise.exe" "$stage/Lark Enterprise.exe"
  cp dist/lark.jar "$stage/lark.jar"
  cp packaging/enterprise/README-ENTERPRISE.txt "$stage/README.txt"
  cp packaging/enterprise/start-lark-enterprise.sh "$stage/start-lark-enterprise.sh"
  cp packaging/enterprise/start-lark-enterprise.sh "$stage/Launch Lark Enterprise.command"
  cp packaging/enterprise/lark-icon.ico "$stage/lark-icon.ico"
  cp packaging/enterprise/lark-icon.png "$stage/lark-icon.png"
  printf 'enterprise\n' > "$stage/enterprise.marker"
  printf '%s\n' "$github_latest/update.json" > "$stage/update-feed.url"
  chmod 755 "$stage/start-lark-enterprise.sh" "$stage/Launch Lark Enterprise.command"
}

echo "Staging Lark Enterprise Windows payload (with bundled JDK)..."
fetch_cached windows x64
payload=$(mktemp -d)
stage_enterprise "$payload"
cp -a "$cache/windows-x64/jdk" "$payload/jdk"

# Payload zip (extract-and-run alternative; Setup.exe is the primary path).
rm -f release/lark-enterprise-windows.zip
(cd "$payload" && zip -X -r "$root/release/lark-enterprise-windows.zip" .)
ls -lh release/lark-enterprise-windows.zip

# NSIS Setup wizard
if ! command -v makensis >/dev/null 2>&1; then
  echo "makensis not found — skipping LarkEnterpriseSetup.exe (install nsis)." >&2
else
  echo "Building LarkEnterpriseSetup.exe (NSIS wizard)..."
  nsi_dir="packaging/enterprise"
  rm -rf "$nsi_dir/payload"
  mkdir -p "$nsi_dir/payload"
  cp -a "$payload"/. "$nsi_dir/payload/"
  makensis \
    -D"LARK_VERSION=$version" \
    -D"LARK_PAYLOAD=payload" \
    -D"LARK_OUT=$root/release/LarkEnterpriseSetup.exe" \
    "$nsi_dir/lark-enterprise.nsi"
  ls -lh release/LarkEnterpriseSetup.exe
  rm -rf "$nsi_dir/payload"
fi

rm -rf "$payload"

# Slim enterprise update (jar + exe + marker; JDK stays on disk).
stage_u=$(mktemp -d)
stage_enterprise "$stage_u"
rm -f release/lark-enterprise-update.zip
(cd "$stage_u" && zip -X -r "$root/release/lark-enterprise-update.zip" .)
rm -rf "$stage_u"
ls -lh release/lark-enterprise-update.zip

if [ -f release/update.json ]; then
  python3 - <<PY
import json, pathlib, hashlib
p = pathlib.Path("release/update.json")
data = json.loads(p.read_text())
base = "$feed_base"
data["version"] = "$version"
data.setdefault("downloads", {})
data["downloads"]["enterprise"] = f"{base}/lark-enterprise-update.zip"
data["downloads"]["enterprise-windows"] = f"{base}/lark-enterprise-update.zip"
data["enterprise"] = {
  "windows": f"{base}/LarkEnterpriseSetup.exe",
  "windows-zip": f"{base}/lark-enterprise-windows.zip",
}
sha = data.setdefault("sha256", {})
def h(path):
    f = pathlib.Path(path)
    if not f.is_file():
        return ""
    return hashlib.sha256(f.read_bytes()).hexdigest()
hu = h("release/lark-enterprise-update.zip")
if hu:
    for k in ("enterprise", "enterprise-windows", "lark-enterprise-update.zip"):
        sha[k] = hu
hs = h("release/LarkEnterpriseSetup.exe")
if hs:
    sha["LarkEnterpriseSetup.exe"] = hs
p.write_text(json.dumps(data, indent=2) + "\n")
print("Updated release/update.json with enterprise keys")
PY
fi

echo "Lark Enterprise packages ready for $version"
echo "Primary: release/LarkEnterpriseSetup.exe  (wizard install)"
echo "Also:    release/lark-enterprise-windows.zip"
echo "Update:  release/lark-enterprise-update.zip"
