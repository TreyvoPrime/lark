@echo off
setlocal
cd /d "%~dp0"
cargo run --manifest-path rust\lark-host\Cargo.toml --release -- %*
