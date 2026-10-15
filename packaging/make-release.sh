#!/bin/sh
# Build lark.jar and the portable zips. Each zip runs on Windows, Mac, and Linux.
set -eu
cd "$(dirname "$0")/.."
./package.sh
root=$(pwd)
stage=$(mktemp -d)
cp dist/lark.jar "$stage/lark.jar"
cp "packaging/Start Lark.bat" "$stage/Start Lark.bat"
cp packaging/start-lark.sh "$stage/start-lark.sh"
cp packaging/start-lark.sh "$stage/Start Lark.command"
cp packaging/README.txt "$stage/README.txt"
chmod 755 "$stage/start-lark.sh" "$stage/Start Lark.command"
mkdir -p release
for name in lark.zip lark-windows.zip lark-mac.zip lark-linux.zip; do
  rm -f "release/$name"
  (cd "$stage" && zip -X -r "$root/release/$name" .)
done
rm -rf "$stage"
ls -lh release/*.zip
