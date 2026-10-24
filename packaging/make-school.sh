#!/bin/sh
# Compatibility wrapper — School is now Lark Executable.
set -eu
cd "$(dirname "$0")/.."
chmod +x packaging/make-executable.sh
exec ./packaging/make-executable.sh "$@"
