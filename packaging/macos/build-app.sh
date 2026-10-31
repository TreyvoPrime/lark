#!/usr/bin/env bash
# Build on a native Mac. Keep the entire JDK for javac, jdb and keytool.
set -euo pipefail
cd "$(dirname "$0")/../.."
[[ $(uname -s) == Darwin ]] || { echo 'A macOS build host is required.' >&2; exit 1; }
: "${JAVA_HOME:?Set JAVA_HOME to a complete JDK 21+}"
for tool in java javac jdb keytool jpackage; do [[ -x "$JAVA_HOME/bin/$tool" ]] || { echo "Missing JDK tool: $tool" >&2; exit 1; }; done
version=$(sed -n 's/.*VERSION = "\([^"]*\)".*/\1/p' src/lark/Settings.java | head -1)
export PATH="$JAVA_HOME/bin:$PATH"
bash package.sh
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/input" "$stage/output"
cp dist/lark.jar "$stage/input/"
args=(--type app-image --name Lark --app-version "$version" --vendor Lark
  --input "$stage/input" --main-jar lark.jar --main-class lark.Desktop
  --runtime-image "$JAVA_HOME" --dest "$stage/output"
  --mac-package-identifier rocks.lark.ide
  --java-options '-Dlark.macos.signedBundle=true'
  --java-options '-Dlark.desktop=true' --java-options '-Dlark.ui=jar')
if [[ ${LARK_MAC_SIGN:-0} == 1 ]]; then
  : "${LARK_MAC_SIGNING_NAME:?Developer ID team/user name is required}"
  args+=(--mac-sign --mac-signing-key-user-name "$LARK_MAC_SIGNING_NAME")
  if [[ -n ${LARK_MAC_KEYCHAIN:-} ]]; then args+=(--mac-signing-keychain "$LARK_MAC_KEYCHAIN"); fi
fi
"$JAVA_HOME/bin/jpackage" "${args[@]}"
# No modification is permitted after jpackage signs the application.
mkdir -p release/macos
[[ ! -e release/macos/Lark.app ]] || { echo 'Move the existing release/macos/Lark.app aside before rebuilding.' >&2; exit 1; }
ditto "$stage/output/Lark.app" release/macos/Lark.app
if [[ ${LARK_MAC_SIGN:-0} == 1 ]]; then codesign --verify --deep --strict --verbose=2 release/macos/Lark.app; fi
echo 'Built release/macos/Lark.app. Unsigned builds are for local testing only.'
