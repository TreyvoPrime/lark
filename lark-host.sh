#!/usr/bin/env bash
# Build and run the Rust host. It launches the existing Java IDE backend during migration.
set -euo pipefail
cd "$(dirname "$0")"
cargo run --manifest-path rust/lark-host/Cargo.toml --release -- "$@"
