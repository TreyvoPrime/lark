#!/usr/bin/env bash
# Create (or reuse) the public GitHub repo and publish portable download zips.
# Requires: gh auth login, and network access.
set -euo pipefail
cd "$(dirname "$0")/.."

REPO_NAME="${LARK_GITHUB_REPO:-lark}"
VISIBILITY="${LARK_GITHUB_VISIBILITY:-public}"
VERSION=$(sed -n 's/.*VERSION = "\([^"]*\)".*/\1/p' src/lark/Settings.java | head -n 1)
TAG="v${VERSION}"
NOTES="${LARK_UPDATE_NOTES:-Lark ${VERSION}: Desktop (Setup install), Executable (Lark.exe zip), and Mobile. Hardened launchers, buried runtime, SHA-256 updates.}"

if ! gh auth status >/dev/null 2>&1; then
  echo "Sign in first: gh auth login"
  exit 1
fi

OWNER=$(gh api user --jq .login)
REPO="${OWNER}/${REPO_NAME}"
echo "Publishing ${REPO} @ ${TAG}"

if ! gh repo view "$REPO" >/dev/null 2>&1; then
  gh repo create "$REPO_NAME" --"$VISIBILITY" --description "Lark — a lightweight portable Java IDE" --source=. --remote=github --push
else
  if git remote get-url github >/dev/null 2>&1; then
    git remote set-url github "https://github.com/${REPO}.git"
  else
    git remote add github "https://github.com/${REPO}.git"
  fi
  git push -u github HEAD:main
fi

export LARK_UPDATE_BASE="https://github.com/${REPO}/releases/download/${TAG}"
export LARK_UPDATE_NOTES="$NOTES"
./packaging/make-release.sh

# Point the GitHub Pages download site at this release.
if [ -f docs/index.html ]; then
  BASE="https://github.com/${REPO}/releases/download/${TAG}"
  sed -i \
    -e "s|__WIN__|${BASE}/lark-windows.zip|g" \
    -e "s|__MAC__|${BASE}/lark-mac.zip|g" \
    -e "s|__LINUX__|${BASE}/lark-linux.zip|g" \
    -e "s|__ANY__|${BASE}/lark.zip|g" \
    -e "s|__RELEASES__|https://github.com/${REPO}/releases|g" \
    docs/index.html
fi

# Default update feed for portable zips shipped from this release.
printf '%s\n' "${LARK_UPDATE_BASE}/update.json" > packaging/default-update-feed.url

# Keep a copy of update.json that points at GitHub Releases asset URLs.
git add packaging/default-update-feed.url docs/index.html release/update.json 2>/dev/null || true
# Never stage local Android/APK trees (oversized caches).
git reset -q -- .android-sdk apk 2>/dev/null || true
if ! git diff --cached --quiet; then
  git commit -m "Prepare Lark ${VERSION} GitHub release assets metadata." || true
  git push github HEAD:main || true
fi

assets=(
  release/LarkDesktopSetup.exe
  release/lark-desktop-windows.zip
  release/lark-desktop-mac.zip
  release/lark-desktop-linux.zip
  release/lark-desktop-update.zip
  release/lark-executable-windows.zip
  release/lark-executable-update.zip
  release/lark-mobile.zip
  release/lark-mobile-update.zip
  release/lark-mobile-windows.zip
  release/lark-mobile-mac.zip
  release/lark-mobile-linux.zip
  release/lark-windows.zip
  release/lark-mac.zip
  release/lark-linux.zip
  release/lark.zip
  release/lark-update.zip
  release/update.json
)
# Optional Linux app-image zip from jpackage.
if [ -f release/lark-desktop-linux-appimage.zip ]; then
  assets+=(release/lark-desktop-linux-appimage.zip)
fi
# Optional .deb / .rpm from jpackage.
for pkg in release/*.deb release/*.rpm; do
  [ -f "$pkg" ] && assets+=("$pkg")
done
if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
  gh release upload "$TAG" "${assets[@]}" --repo "$REPO" --clobber
else
  gh release create "$TAG" "${assets[@]}" \
    --repo "$REPO" \
    --title "Lark ${VERSION}" \
    --notes "$NOTES"
fi

# Optional GitHub Pages download site from docs/
if [ -d docs ]; then
  gh api -X POST "repos/${REPO}/pages" -f build_type=workflow 2>/dev/null || true
fi

echo
echo "Repo:      https://github.com/${REPO}"
echo "Releases:  https://github.com/${REPO}/releases"
echo "Windows:   https://github.com/${REPO}/releases/download/${TAG}/lark-windows.zip"
echo "Mac:       https://github.com/${REPO}/releases/download/${TAG}/lark-mac.zip"
echo "Linux:     https://github.com/${REPO}/releases/download/${TAG}/lark-linux.zip"
echo "Feed:      https://github.com/${REPO}/releases/latest"
echo "Update JSON: ${LARK_UPDATE_BASE}/update.json"
