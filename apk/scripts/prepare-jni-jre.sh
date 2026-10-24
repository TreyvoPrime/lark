#!/usr/bin/env bash
# Download Android OpenJDK builds and stage them so the APK can exec Java on-device.
# - jniLibs/<abi>/liblarkjava.so  (+ all JRE .so)  → executable after install
# - assets/engine/jre-<abi>.tar.xz                 → JAVA_HOME files (extracted once)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="$ROOT/.jre-cache"
JNI="$ROOT/android/app/src/main/jniLibs"
ASSETS="$ROOT/android/app/src/main/assets/engine"
BASE="https://github.com/PojavLauncherTeam/android-openjdk-build-multiarch/releases/download/jre17-ec28559"

mkdir -p "$CACHE" "$ASSETS"

stage_abi() {
  local abi="$1"
  local archive="$2"
  local url="$BASE/$archive"
  local tarball="$CACHE/$archive"
  local extract="$CACHE/extract-$abi"
  local jni_abi="$JNI/$abi"

  echo "==> $abi ($archive)"
  if [[ ! -f "$tarball" ]]; then
    echo "    downloading…"
    curl -fL --retry 3 --retry-delay 2 -o "$tarball.partial" "$url"
    mv "$tarball.partial" "$tarball"
  else
    echo "    using cached $tarball"
  fi

  rm -rf "$extract"
  mkdir -p "$extract"
  tar -xJf "$tarball" -C "$extract"

  # Flatten single top-level folder if present.
  local jre="$extract"
  if [[ ! -x "$jre/bin/java" ]]; then
    local kids=("$extract"/*)
    if [[ ${#kids[@]} -eq 1 && -d "${kids[0]}" && -e "${kids[0]}/bin/java" ]]; then
      jre="${kids[0]}"
    fi
  fi
  if [[ ! -e "$jre/bin/java" ]]; then
    echo "ERROR: bin/java missing after extract for $abi" >&2
    find "$extract" -maxdepth 3 -type f | head -40 >&2
    exit 1
  fi

  rm -rf "$jni_abi"
  mkdir -p "$jni_abi"
  # Launcher must be named lib*.so so Android extracts it as an executable native lib.
  cp -f "$jre/bin/java" "$jni_abi/liblarkjava.so"
  # Ship every shared library the JVM needs into the same executable directory.
  while IFS= read -r -d '' so; do
    local base
    base="$(basename "$so")"
    # Keep first copy on name collision (server/libjvm.so wins if we prefer server).
    if [[ ! -f "$jni_abi/$base" ]]; then
      cp -f "$so" "$jni_abi/$base"
    fi
  done < <(find "$jre" -type f -name '*.so' -print0)

  # Prefer HotSpot server libjvm when both exist.
  if [[ -f "$jre/lib/server/libjvm.so" ]]; then
    cp -f "$jre/lib/server/libjvm.so" "$jni_abi/libjvm.so"
  fi

  # Keep a full archive in assets for JAVA_HOME (jars, conf, legal, release).
  cp -f "$tarball" "$ASSETS/jre-$abi.tar.xz"

  local count
  count="$(find "$jni_abi" -type f | wc -l | tr -d ' ')"
  echo "    staged $count native libs → $jni_abi"
  echo "    asset  → $ASSETS/jre-$abi.tar.xz"
}

# Modern phones (arm64). Rebuild with x86_64 uncommented for emulators.
stage_abi "arm64-v8a" "jre17-arm64-20210825-release.tar.xz"
# stage_abi "x86_64" "jre17-x86_64-20210825-release.tar.xz"

echo "Done. Native JRE ready for assembleDebug."
