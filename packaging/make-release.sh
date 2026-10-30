#!/bin/sh
# Build lark.jar and all public release assets (Desktop · Executable · Mobile).
set -eu
cd "$(dirname "$0")/.."
./package.sh
root=$(pwd)
version=$(sed -n 's/.*VERSION = "\([^"]*\)".*/\1/p' src/lark/Settings.java | head -n 1)
notes=${LARK_UPDATE_NOTES:-"Lark ${version}: Lark Share encrypted LAN collaboration, concurrent Java editing, live cursors, host approval and recovery. Desktop, Executable and Mobile packages; verified portable JDKs."}
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

cat > release/update.json <<EOF
{
  "version": "$version",
  "notes": "$notes",
  "page": "https://lark.rocks/",
  "downloads": {
    "windows": "$feed_base/lark-desktop-update.zip",
    "mac": "$feed_base/lark-desktop-update.zip",
    "linux": "$feed_base/lark-desktop-update.zip",
    "any": "$feed_base/lark-desktop-update.zip",
    "desktop": "$feed_base/lark-desktop-update.zip",
    "desktop-windows": "$feed_base/lark-desktop-update.zip",
    "desktop-mac": "$feed_base/lark-desktop-update.zip",
    "desktop-linux": "$feed_base/lark-desktop-update.zip",
    "executable": "$feed_base/lark-executable-update.zip",
    "executable-windows": "$feed_base/lark-executable-update.zip",
    "mobile": "$feed_base/lark-mobile-update.zip",
    "mobile-windows": "$feed_base/lark-mobile-update.zip",
    "mobile-mac": "$feed_base/lark-mobile-update.zip",
    "mobile-linux": "$feed_base/lark-mobile-update.zip"
  },
  "desktop": {
    "windows": "$feed_base/LarkDesktopSetup.exe",
    "windows-zip": "$feed_base/lark-desktop-windows.zip",
    "mac": "$feed_base/lark-desktop-mac.zip",
    "linux": "$feed_base/lark-desktop-linux.zip"
  },
  "executable": {
    "windows": "$feed_base/lark-executable-windows.zip"
  },
  "mobile": {
    "windows": "$feed_base/lark-mobile-windows.zip",
    "mac": "$feed_base/lark-mobile-mac.zip",
    "linux": "$feed_base/lark-mobile-linux.zip",
    "any": "$feed_base/lark-mobile.zip"
  },
  "sha256": {}
}
EOF

chmod +x packaging/make-desktop.sh packaging/make-executable.sh packaging/make-mobile.sh

# Desktop = Setup wizard (default install).
LARK_UPDATE_BASE="$feed_base" LARK_UPDATE_NOTES="$notes" ./packaging/make-desktop.sh

# Executable = Lark.exe zip.
LARK_SKIP_PACKAGE=1 LARK_UPDATE_BASE="$feed_base" LARK_UPDATE_NOTES="$notes" ./packaging/make-executable.sh

# Mobile stays its own edition.
LARK_SKIP_PACKAGE=1 LARK_UPDATE_BASE="$feed_base" LARK_UPDATE_NOTES="$notes" ./packaging/make-mobile.sh

hash_file() {
  f=$1
  if [ -f "$f" ]; then
    if command -v sha256sum >/dev/null 2>&1; then
      sha256sum "$f" | awk '{print $1}'
    else
      shasum -a 256 "$f" | awk '{print $1}'
    fi
  fi
}
h_desktop=$(hash_file release/lark-desktop-update.zip)
h_executable=$(hash_file release/lark-executable-update.zip)
h_mobile=$(hash_file release/lark-mobile-update.zip)
h_setup=$(hash_file release/LarkDesktopSetup.exe)

python3 - <<PY
import json, pathlib
p = pathlib.Path("release/update.json")
data = json.loads(p.read_text())
sha = {}
pairs = [
    ("any", """$h_desktop"""),
    ("windows", """$h_desktop"""),
    ("mac", """$h_desktop"""),
    ("linux", """$h_desktop"""),
    ("desktop", """$h_desktop"""),
    ("desktop-windows", """$h_desktop"""),
    ("desktop-mac", """$h_desktop"""),
    ("desktop-linux", """$h_desktop"""),
    ("lark-desktop-update.zip", """$h_desktop"""),
    ("lark-update.zip", """$h_desktop"""),
    ("executable", """$h_executable"""),
    ("executable-windows", """$h_executable"""),
    ("lark-executable-update.zip", """$h_executable"""),
    ("mobile", """$h_mobile"""),
    ("mobile-windows", """$h_mobile"""),
    ("mobile-mac", """$h_mobile"""),
    ("mobile-linux", """$h_mobile"""),
    ("lark-mobile-update.zip", """$h_mobile"""),
    ("LarkDesktopSetup.exe", """$h_setup"""),
]
for k, v in pairs:
    v = (v or "").strip()
    if v:
        sha[k] = v
data["sha256"] = sha
p.write_text(json.dumps(data, indent=2) + "\n")
print("Wrote sha256 entries:", len(sha))
PY

ls -lh release/*.zip release/*.exe release/update.json 2>/dev/null | head -50
echo "Version $version"
echo "Tracks: Desktop (Setup) · Executable (Lark.exe) · Mobile"
