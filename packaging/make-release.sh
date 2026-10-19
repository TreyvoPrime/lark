#!/bin/sh
# Build lark.jar and the portable zips. Each zip runs on Windows, Mac, and Linux.
set -eu
cd "$(dirname "$0")/.."
./package.sh
root=$(pwd)
version=$(sed -n 's/.*VERSION = "\([^"]*\)".*/\1/p' src/lark/Settings.java | head -n 1)
notes=${LARK_UPDATE_NOTES:-"Interactive console input, JetBrains Mono, themes, and startup update checks."}
feed_base=${LARK_UPDATE_BASE:-}
stage=$(mktemp -d)
cp dist/lark.jar "$stage/lark.jar"
cp "packaging/Start Lark.bat" "$stage/Start Lark.bat"
cp packaging/start-lark.sh "$stage/start-lark.sh"
cp packaging/start-lark.sh "$stage/Start Lark.command"
cp packaging/README.txt "$stage/README.txt"
chmod 755 "$stage/start-lark.sh" "$stage/Start Lark.command"

mkdir -p release
# Prefer an explicit feed base; otherwise point portable builds at the permanent
# GitHub Releases "latest" URLs so downloads and updates never depend on a tunnel.
github_latest="https://github.com/TreyvoPrime/lark/releases/latest/download"
if [ -n "$feed_base" ]; then
  feed_base=$(printf '%s' "$feed_base" | sed 's:/*$::')
else
  feed_base="$github_latest"
fi
printf '%s\n' "$github_latest/update.json" > "$stage/update-feed.url"
cat > release/update.json <<EOF
{
  "version": "$version",
  "notes": "$notes",
  "page": "https://treyvoprime.github.io/lark-download/",
  "downloads": {
    "windows": "$feed_base/lark-windows.zip",
    "mac": "$feed_base/lark-mac.zip",
    "linux": "$feed_base/lark-linux.zip",
    "any": "$feed_base/lark.zip"
  }
}
EOF

for name in lark.zip lark-windows.zip lark-mac.zip lark-linux.zip; do
  rm -f "release/$name"
  (cd "$stage" && zip -X -r "$root/release/$name" .)
done
rm -rf "$stage"
ls -lh release/*.zip release/update.json
echo "Version $version"
