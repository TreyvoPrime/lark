#!/bin/sh
# Build Lark Executable — unzip, double-click Lark.exe (buried app/ + jdk/).
set -eu
cd "$(dirname "$0")/.."
if [ "${LARK_SKIP_PACKAGE:-}" != "1" ] || [ ! -f dist/lark.jar ]; then
  ./package.sh
fi
root=$(pwd)
version=$(sed -n 's/.*VERSION = "\([^"]*\)".*/\1/p' src/lark/Settings.java | head -n 1)
feed_base=${LARK_UPDATE_BASE:-}
cache=${LARK_JDK_CACHE:-"$root/release/.jdk-cache"}
mkdir -p "$cache" release packaging/executable/bin
chmod +x packaging/fetch-portable-jdk.sh

github_latest="https://github.com/TreyvoPrime/lark/releases/latest/download"
if [ -n "$feed_base" ]; then
  feed_base=$(printf '%s' "$feed_base" | sed 's:/*$::')
else
  feed_base="$github_latest"
fi

echo "Building Lark.exe (Executable, Windows, no console)..."
if ! command -v go >/dev/null 2>&1; then
  echo "Go is required to build the Executable launcher." >&2
  exit 1
fi
(
  cd packaging/executable/launcher
  GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build \
    -trimpath \
    -ldflags="-s -w -H windowsgui" \
    -o ../bin/Lark.exe \
    .
)
ls -lh packaging/executable/bin/Lark.exe

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

stage_executable() {
  stage=$1
  mkdir -p "$stage/app"
  cp packaging/executable/bin/Lark.exe "$stage/Lark.exe"
  cp dist/lark.jar "$stage/app/lark.jar"
  cp packaging/executable/README.txt "$stage/README.txt"
  printf 'executable\n' > "$stage/app/executable.marker"
  printf '%s\n' "$github_latest/update.json" > "$stage/app/update-feed.url"
}

echo "Building lark-executable-windows.zip (Lark.exe + buried app/jdk)..."
fetch_cached windows x64
stage=$(mktemp -d)
stage_executable "$stage"
cp -a "$cache/windows-x64/jdk" "$stage/jdk"
rm -f release/lark-executable-windows.zip
(cd "$stage" && zip -X -r "$root/release/lark-executable-windows.zip" .)
rm -rf "$stage"
ls -lh release/lark-executable-windows.zip

# Slim executable update: jar + exe + marker (no jdk).
stage_u=$(mktemp -d)
stage_executable "$stage_u"
rm -f release/lark-executable-update.zip
(cd "$stage_u" && zip -X -r "$root/release/lark-executable-update.zip" .)
rm -rf "$stage_u"
ls -lh release/lark-executable-update.zip

if [ -f release/update.json ]; then
  python3 - <<PY
import json, pathlib, hashlib
p = pathlib.Path("release/update.json")
data = json.loads(p.read_text())
base = "$feed_base"
data["version"] = "$version"
data.setdefault("downloads", {})
data["downloads"]["executable"] = f"{base}/lark-executable-update.zip"
data["downloads"]["executable-windows"] = f"{base}/lark-executable-update.zip"
data["executable"] = {"windows": f"{base}/lark-executable-windows.zip"}
data.pop("school", None)
sha = data.setdefault("sha256", {})
def h(path):
    f = pathlib.Path(path)
    return hashlib.sha256(f.read_bytes()).hexdigest() if f.is_file() else ""
hu = h("release/lark-executable-update.zip")
if hu:
    for k in ("executable", "executable-windows", "lark-executable-update.zip"):
        sha[k] = hu
# Drop retired School keys from sha map if present.
for k in list(sha):
    if "school" in k:
        sha.pop(k, None)
p.write_text(json.dumps(data, indent=2) + "\n")
print("Updated release/update.json with executable keys")
PY
fi

echo "Lark Executable packages ready for $version"
echo "Extract All → double-click Lark.exe (no .bat)."
