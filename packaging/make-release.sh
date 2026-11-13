#!/bin/sh
# Build lark.jar and public Desktop and Executable release assets.
set -eu
cd "$(dirname "$0")/.."
for old in release/lark-mobile*; do
  if [ -e "$old" ]; then
    echo "Historical Mobile artifacts are present in release/. Move them elsewhere before building a new release: $old" >&2
    exit 1
  fi
done
for tool in go cargo zip python3 makensis; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Release build requires $tool. Install it or add it to PATH before building." >&2
    exit 1
  fi
done
./package.sh
root=$(pwd)
version=$(sed -n 's/.*VERSION = "\([^"]*\)".*/\1/p' src/lark/Settings.java | head -n 1)
notes=${LARK_UPDATE_NOTES:-"Lark ${version}: Desktop and Executable updates with Lark Share collaboration."}
feed_base=${LARK_UPDATE_BASE:-}
cache=${LARK_JDK_CACHE:-"$root/release/.jdk-cache"}
mkdir -p "$cache" release
chmod +x packaging/fetch-portable-jdk.sh

release_tag=${LARK_RELEASE_TAG:-"v$(printf '%s' "$version" | sed 's/\.0$//')"}
github_release="https://github.com/TreyvoPrime/lark/releases/download/$release_tag"
if [ -n "$feed_base" ]; then
  feed_base=$(printf '%s' "$feed_base" | sed 's:/*$::')
else
  feed_base="$github_release"
fi

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
    "executable": "$feed_base/lark-executable-update.zip",
    "executable-windows": "$feed_base/lark-executable-update.zip"
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
  "sha256": {}
}
EOF

chmod +x packaging/make-desktop.sh packaging/make-executable.sh

# Desktop = Setup wizard (default install).
LARK_UPDATE_BASE="$feed_base" LARK_UPDATE_NOTES="$notes" ./packaging/make-desktop.sh

# Executable = Lark.exe zip.
LARK_SKIP_PACKAGE=1 LARK_UPDATE_BASE="$feed_base" LARK_UPDATE_NOTES="$notes" ./packaging/make-executable.sh

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
h_setup=$(hash_file release/LarkDesktopSetup.exe)

python3 - <<PY
import hashlib, json, pathlib
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
    ("LarkDesktopSetup.exe", """$h_setup"""),
]
for k, v in pairs:
    v = (v or "").strip()
    if v:
        sha[k] = v
data["sha256"] = sha
p.write_text(json.dumps(data, indent=2) + "\n")
print("Wrote sha256 entries:", len(sha))
for name in ("lark-desktop-linux.zip", "lark-desktop-mac.zip", "lark-desktop-windows.zip", "lark-executable-windows.zip", "LarkDesktopSetup.exe"):
    artifact = pathlib.Path("release") / name
    digest = hashlib.sha256()
    with artifact.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    (artifact.parent / (name + ".sha256")).write_text(digest.hexdigest() + "  " + name + "\n", encoding="utf-8")
print("Wrote SHA-256 sidecars for release downloads")
PY

ls -lh release/*.zip release/*.exe release/update.json 2>/dev/null | head -50
echo "Version $version"
echo "Tracks: Desktop (Setup) · Executable (Lark.exe)"
