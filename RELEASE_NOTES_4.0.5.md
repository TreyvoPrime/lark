# Lark 4.0.5 candidate

## Editor and Share
- Collaborative Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z use document-local operation history. Held shortcuts and empty history are consumed before native editing handlers.
- Stale network responses cannot mutate documents after leaving or changing sessions.
- Adapter selection lists real names, IPv4 prefixes, active state, loopback status and hosting suitability. Test Connection checks the pinned TLS host/protocol and reports connection failures without joining or disclosing source.
- Collaboration status includes pending operations, participant count and role.
- Java member suggestions cover common System, PrintStream, String, Scanner, list and Math members. Desktop/mobile can configure automatic pairing and suggestions. This remains lightweight assistance, not a complete Java language server.

## Mobile
- Fixed empty file lists, dirty-on-open behavior, generated class names, duplicate-file creation and saving races.
- Added per-file undo history, search, rename/delete, folders, symbol keys and autocomplete controls.
- Added host breakpoints, stepping, continue/stop, current execution location, variables and live stdin.
- Uses the desktop theme variables with compact touch controls and bounded editor rendering.
- LAN requires configured HTTPS; default startup is local-only. Pairing cookies authorize same-origin assets. Remote clients cannot access host GitHub, terminal, updater or recovery-control APIs.
- Java runs on the connected host. Android/iOS browsers do not gain a native JVM. Runs have a 256 MiB heap cap and 60-second timeout; these do not replace OS isolation.
- Added Android client source and reproducible APK/lint workflow. The APK built here is development-signed; physical installation remains unverified.

## Website and distribution
- Updated Flow/source status, mobile execution/platform explanations and the published installer fallback.
- Version set to 4.0.5; package verification derives the expected version from source.
- Rebuild workflow prepares artifacts and Windows smoke checks without automatically publishing.

## Verification limits
Java backend, DOM editor/UI, Java compilation/execution/input/stop/debugger, HTTPS host and website checks pass locally. Full Chrome startup is blocked by the environment's socket restrictions. Windows/macOS physical installation, Android emulator/device installation, iPhone/iPad interaction, production APK signing and public deployment are not verified here. Mobile Share integration and a complete semantic Java completion engine remain outside this candidate's implemented scope. Do not interpret this candidate as completion of every item in the original specification.
