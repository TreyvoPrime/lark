#!/bin/sh
# Build lark.jar and portable zips. Platform zips embed a JDK so first boot
# works offline on school networks (no Adoptium download required).
set -eu
cd "$(dirname "$0")/.."
./package.sh
root=$(pwd)
version=$(sed -n 's/.*VERSION = "\([^"]*\)".*/\1/p' src/lark/Settings.java | head -n 1)
notes=${LARK_UPDATE_NOTES:-"Lark ${version}: Desktop is the main install (Start + jdk + app/). Same package as the former portable zip."}
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

# Placeholder feed — hashes filled after zips are built (see end of script).
cat > release/update.json <<EOF
{
  "version": "$version",
  "notes": "$notes",
  "page": "https://treyvoprime.github.io/lark-download/",
  "downloads": {
    "windows": "$feed_base/lark-desktop-update.zip",
    "mac": "$feed_base/lark-desktop-update.zip",
    "linux": "$feed_base/lark-desktop-update.zip",
    "any": "$feed_base/lark-desktop-update.zip",
    "desktop": "$feed_base/lark-desktop-update.zip",
    "desktop-windows": "$feed_base/lark-desktop-update.zip",
    "desktop-mac": "$feed_base/lark-desktop-update.zip",
    "desktop-linux": "$feed_base/lark-desktop-update.zip",
    "mobile": "$feed_base/lark-mobile-update.zip",
    "mobile-windows": "$feed_base/lark-mobile-update.zip",
    "mobile-mac": "$feed_base/lark-mobile-update.zip",
    "mobile-linux": "$feed_base/lark-mobile-update.zip",
    "school": "$feed_base/lark-school-update.zip",
    "school-windows": "$feed_base/lark-school-update.zip",
    "enterprise": "$feed_base/lark-enterprise-update.zip",
    "enterprise-windows": "$feed_base/lark-enterprise-update.zip"
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
  },
  "school": {
    "windows": "$feed_base/lark-school-windows.zip"
  },
  "enterprise": {
    "windows": "$feed_base/LarkEnterpriseSetup.exe",
    "windows-zip": "$feed_base/lark-enterprise-windows.zip"
  },
  "sha256": {}
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

# Desktop is the primary OS install (Start + jdk + app/). Portable zip names
# are produced as aliases inside make-desktop.sh — no separate portable tree.
chmod +x packaging/make-desktop.sh packaging/make-mobile.sh
LARK_UPDATE_BASE="$feed_base" LARK_UPDATE_NOTES="$notes" ./packaging/make-desktop.sh

# Separate Lark Mobile edition (touch UI + phone pair).
LARK_SKIP_PACKAGE=1 LARK_UPDATE_BASE="$feed_base" LARK_UPDATE_NOTES="$notes" ./packaging/make-mobile.sh

# School Windows zip — Lark.exe, no .bat required.
chmod +x packaging/make-school.sh
LARK_SKIP_PACKAGE=1 LARK_UPDATE_BASE="$feed_base" LARK_UPDATE_NOTES="$notes" ./packaging/make-school.sh

# Lark Enterprise — Setup wizard (separate from Desktop).
chmod +x packaging/make-enterprise.sh
LARK_SKIP_PACKAGE=1 LARK_UPDATE_BASE="$feed_base" LARK_UPDATE_NOTES="$notes" ./packaging/make-enterprise.sh

# Integrity hashes for in-app update verification.
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
h_update=$(hash_file release/lark-update.zip)
h_desktop=$(hash_file release/lark-desktop-update.zip)
h_mobile=$(hash_file release/lark-mobile-update.zip)
h_school=$(hash_file release/lark-school-update.zip)
h_enterprise=$(hash_file release/lark-enterprise-update.zip)
h_enterprise_setup=$(hash_file release/LarkEnterpriseSetup.exe)
# Rebuild feed with sha256 map (channel keys + filenames).
python3 - <<PY
import json, pathlib
p = pathlib.Path("release/update.json")
data = json.loads(p.read_text())
sha = {}
pairs = [
    ("any", """$h_update"""),
    ("windows", """$h_update"""),
    ("mac", """$h_update"""),
    ("linux", """$h_update"""),
    ("lark-update.zip", """$h_update"""),
    ("desktop", """$h_desktop"""),
    ("desktop-windows", """$h_desktop"""),
    ("desktop-mac", """$h_desktop"""),
    ("desktop-linux", """$h_desktop"""),
    ("lark-desktop-update.zip", """$h_desktop"""),
    ("mobile", """$h_mobile"""),
    ("mobile-windows", """$h_mobile"""),
    ("mobile-mac", """$h_mobile"""),
    ("mobile-linux", """$h_mobile"""),
    ("lark-mobile-update.zip", """$h_mobile"""),
    ("school", """$h_school"""),
    ("school-windows", """$h_school"""),
    ("lark-school-update.zip", """$h_school"""),
    ("enterprise", """$h_enterprise"""),
    ("enterprise-windows", """$h_enterprise"""),
    ("lark-enterprise-update.zip", """$h_enterprise"""),
    ("LarkEnterpriseSetup.exe", """$h_enterprise_setup"""),
]
for k, v in pairs:
    v = (v or "").strip()
    if v:
        sha[k] = v
data["sha256"] = sha
p.write_text(json.dumps(data, indent=2) + "\n")
print("Wrote sha256 entries:", len(sha))
PY

ls -lh release/*.zip release/update.json 2>/dev/null | head -40
echo "Version $version"
echo "Desktop: Start Lark Desktop + jdk + app/. Mobile / School / Enterprise remain separate."
