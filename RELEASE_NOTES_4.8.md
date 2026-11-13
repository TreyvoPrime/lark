# Lark 4.8 — draft

This draft builds on the Lark 4.7 development branch and adds the current Rust migration work.

- Rust Windows Desktop and Executable launchers, preserving separate run copies and startup logs.
- A Rust native helper for terminal sessions, Git status, project traversal, and file and folder operations.
- Rust/WebAssembly project search and indexing that includes unsaved editor text.
- Java fallbacks for installations without a matching native helper.

This is a draft, not a production release. Windows unit and integration checks passed, including terminal Git and cancellation, project file workflows, and Rust search. Full cross-platform release builds and interactive platform testing remain outstanding. Some project metadata, import/export, session orchestration, and compatibility paths still use Java or JavaScript. The Windows executable ZIP is a locally built preview, not the full set of official installers.
