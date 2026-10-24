#!/bin/sh
# Compatibility wrapper — Enterprise is now Lark Desktop (Setup).
set -eu
cd "$(dirname "$0")/.."
chmod +x packaging/make-desktop.sh
LARK_SKIP_PACKAGE="${LARK_SKIP_PACKAGE:-0}" exec ./packaging/make-desktop.sh "$@"
