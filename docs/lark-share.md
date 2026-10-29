# Lark Share — Lark 4.1.0

Lark Share connects desktop Lark installations on a local network using a dedicated,
restricted TLS server. It supports simultaneous editing of existing Java source,
Editor and Viewer permissions, host approval and revocation, live presence, follow,
and host-coordinated saving. No cloud service, subscription or GitHub login is used.

## Host and join

1. Save your project. Choose **Share → Host Session**, select the Java project,
   session name, display name and LAN interface. Port `0` chooses a free port.
   `127.0.0.1` is useful only for two installations on the same computer.
2. Leave LAN discovery enabled to advertise `_larkshare._tcp.local.` on that
   interface. If multicast is unavailable, the UI reports it and private
   invitations still work. Share never changes the OS firewall automatically.
3. Send the **private invitation** to the intended collaborator over a trusted
   channel. Verify its displayed SHA-256 host fingerprint directly. The invitation
   contains the address, port, session ID, certificate fingerprint and secret.
   Reopen **Invitation** to copy it again; do not publish it.
4. On the other Lark installation choose **Nearby Sessions** or **Join Session**.
   Discovery is only a hint: obtain the private invitation from the intended host,
   paste it, inspect the displayed address and fingerprint, enter your display
   name and confirm verification. No browser certificate exception is needed.
5. The host opens **Participants** and chooses **Approve as Editor**, **Approve as
   Viewer**, or **Reject**. Names are self-chosen, not verified personal identities;
   confirm requests with the intended person before approval.
6. After approval, **Shared Project** opens the normal project Explorer and
   CodeMirror editor. Participants navigate independently. Existing Java files can
   be edited concurrently; Viewers receive updates but cannot modify source.
7. Colored avatars, Explorer participants and file tooltips show who is working
   where. Open participant details to inspect role, file and cursor position, or
   choose **Follow**. **Stop following** restores independent navigation.
8. The host may change roles, revoke devices or **End Session**. Guests may
   **Leave Session**. Previously received source cannot be retracted from a device.

Allow the selected TCP port on the intended private network if prompted by the OS.
IPv4 LAN interfaces are listed. Discovery uses UDP multicast port 5353, which some
networks, VPNs and firewalls block. A changed host address requires a fresh session
and invitation. No plaintext fallback exists.

## Editing, saving and recovery

One shared sequence CRDT exists per opened authorized file. Concurrent inserts
use deterministic Lamport/actor ordering; deletions reference stable character
identities. Local undo removes only the local insertion's IDs and reinserts
locally deleted text without undoing another participant's changes. Redo uses new
identities. File switching retains documents and operation queues.

Only the host writes the canonical project. Changes are debounced at 750 ms;
pre-change backups and recovery text are retained under
`~/.lark/share/recovery/<session-id>/`. In this cloud environment that home is
usually `/workspace/lark-runtime`. The normal full-file API cannot overwrite an
actively shared file. File deletion, movement and project deletion are locked
until Share ends. Split editor view is temporarily unavailable while sharing.

External changes are checked before replacement and periodically for opened
documents. A conflict stops replacement, preserves recovery text, and blocks host
execution. Export recovery, end Share, compare the disk file and the `.before` /
`.recovery` versions, and merge deliberately before hosting again. Share does not
silently import external changes into the CRDT. Non-cooperating local filesystem
writers cannot participate in an atomic cross-process transaction with Share.

A temporary connection outage retains local operations and retries them with the
same pinned identity and device credential. Updates are idempotent and reconcile
against the host's operation history. Pending local edits are saved to browser
storage with a short debounce, and closing a tab with pending operations prompts
for confirmation. **Recovery** can export the active text and show saved drafts.
After a browser/process restart, compare a draft with the current shared file and
use **Apply reviewed merge** explicitly; old drafts are never blindly uploaded.
Local storage limits are reported. Export recovery before ending a disconnected
session or closing a browser when storage is unavailable. Debounced persistence
can lose the most recent fraction of a second in an abrupt process/power failure;
this is not a transactional database or a guarantee against simultaneous host and
client hardware loss.

The host must use **Share → Review Changes** and acknowledge the displayed source
before running, debugging, testing or opening a terminal after collaborator edits.
New collaborator changes invalidate the acknowledgment. This is a review gate,
not a sandbox for Java programs. Review and trust code before executing it locally.

## Security and implementation

- `Share.java` is the loopback-only control bridge. `/api/share` requires POST,
  the existing Host/Origin/`X-Lark: 1` defenses and a loopback peer, even in Mobile
  LAN mode. Paired phones cannot control Share or retrieve invitations.
- `ShareTransport.java` binds a **separate TLS 1.3 server** to the chosen interface.
  Java-to-Java clients pin the SHA-256 leaf certificate before sending credentials.
  Host certificates are ephemeral per session and checked for validity. There is
  no trust-all verifier or plaintext transport.
- Protocol version **2** exposes only `join`, `poll`, `files`, `read`, `open`,
  `sync`, `presence`, `leave`. It does not dispatch desktop HTTP APIs. Peers cannot
  run commands, compile, debug, open terminals, change settings, install packages
  or browse other projects. The protocol rejects unknown operations.
- `ShareSession.java` uses 256-bit random invitation and device credentials.
  Every new device requires approval; there is deliberately no anonymous access
  or automatic trusted-device reentry. Editor/Viewer roles are checked on the
  backend for every operation; role changes and revocation take effect immediately
  for subsequent requests. Reconnection reuses the approved device credential.
- `ShareDocument.java` and `web/js/share-document.js` implement the same RGA CRDT
  over UTF-16 units, matching CodeMirror offsets. Inserts use stable Lamport/actor
  IDs and tombstones preserve deletion intent. The Java host validates ownership,
  dependencies, counters and size limits before changing state. Retry identities
  must match the original operation. Operation history pages carry revisions.
- `ShareStore.java` coordinates backup, atomic replacement where supported,
  recovery and conflict detection. Secure directory streams prevent ancestor-link
  replacement on supporting systems. Other providers check canonical containment,
  components and leaf links; malicious processes running as the host's own account
  are outside the local trust boundary, particularly on Windows.
- Remote paths are exact keys in an authorized Java-source catalog, not arbitrary
  filesystem reads. Hidden files, symlinks, build/dist/target/node_modules trees,
  control characters and ambiguous separators are excluded. No secrets, source,
  credentials or pairing tokens are advertised by discovery.
- `ShareDiscovery.java` provides DNS-SD PTR/SRV/TXT/A records with bounded DNS
  compression parsing and selected-interface lifecycle. Advertisements contain
  public session name, host label, availability, count and approval requirement.
  Discovery data is untrusted and never substitutes for invitation verification.
- Resource limits: 1,000 catalog files, 96 KiB initial UTF-8 per file, 16 MiB
  initial source, 240-byte catalog paths, 32 opened shared documents and 500,000
  CRDT nodes/session. A document permits 96K visible UTF-16 units, 250,000 nodes
  and 10,000 operations. Save, export pending drafts, end and rehost when reaching
  history limits. At most 32 device requests and 16 writer windows/device are
  retained per session; rejected requests count until rehosting.
- Wire limits: 16 KiB requests, 768 KiB responses, JSON depth 16, eight simultaneous
  TLS workers, five-second socket timeouts and eight-second absolute deadlines.
  The bounded 256-entry limiter permits 1,200 connection attempts/IP/minute to
  accommodate active document polling. It bounds resources but does not guarantee
  availability against a hostile LAN or distributed flood.
- Sessions expire after eight hours maximum or the configured 5–120 minute
  inactivity interval (default 30). New pending devices cannot extend inactivity.
  Sockets, snapshot/CRDT state, save workers and discovery are closed on session
  end, expiry or application shutdown. Client deadline threads expire when idle.

## Dependencies and release builds

No third-party **runtime** libraries. Uses JDK 17+ JSSE, sockets and `keytool`, the
existing JSON implementation and bundled CodeMirror 5. The synchronization code is
bundled in the jar, not downloaded from a CDN. The backend generates a temporary
PKCS12 identity using the running JDK, loads it into memory, then removes the
identity/password files. POSIX temporary directories are owner-only; Windows
inherits the local account's permissions. An abrupt crash during generation can
leave stale `~/.lark/share/identity-*` directories, removable when no session is
starting. Credentials are not saved for automatic reentry after an IDE restart.

`package.sh` includes all new classes and web assets. Installed Desktop,
Executable and update payloads use that jar. Mobile release bundles are also
built, but the touch-first Mobile UI does not expose the desktop Share controls;
its existing pairing and API behavior remain separate. The portable-JDK fetcher
pins Temurin **21.0.13+9**, verifies the official SHA-256 sidecar before extraction,
and checks `keytool` inclusion. Release tooling needs Go 1.22+, NSIS, Python/Pillow,
zip and network access to cache the three portable JDKs once. Cached JDKs must be
trusted; delete an unverified cache and fetch it again rather than skipping checks.

Build everything from the repository root:

```sh
./packaging/make-release.sh
```

Outputs under `release/` include `LarkDesktopSetup.exe`, Desktop Windows/macOS/Linux
archives, Executable Windows archive, Mobile Windows/macOS/Linux archives, update
zips, portable aliases and `update.json` with SHA-256 metadata. No build command
publishes or uploads a release.

## Changed files

Backend: `Share.java`, `ShareSession.java`, `ShareTransport.java`, new
`ShareDocument.java`, `ShareStore.java` and `ShareDiscovery.java`; integration in
`Server.java`, UTF-16-safe JSON writing in `Json.java`, version in `Settings.java`.
Frontend: `web/js/share.js`, new `share-document.js` and `share-editor.js`, editor
hooks in `web/js/app.js`, `web/css/share.css` and `web/index.html`.
Build/documentation: `packaging/fetch-portable-jdk.sh`, `packaging/make-release.sh`,
`release/update.json`, this guide and `README.md`.
Tests: `ShareCheck.java`, `ShareEditingCheck.java`, `share-document.test.cjs`,
`share-browser.cjs` and `release-artifacts.py`.

## Tests

```sh
./package.sh
javac --release 17 -encoding UTF-8 -cp build -d build \
  test/ShareCheck.java test/ShareEditingCheck.java \
  test/Check.java test/FlowCheck.java test/GitHubAuthCheck.java
java -cp build lark.ShareCheck
java -cp build lark.ShareEditingCheck
java -cp build lark.Check
java -cp build lark.FlowCheck
java -cp build lark.GitHubAuthCheck
node test/share-document.test.cjs
node test/java-parse.test.js
node test/site-releases.test.cjs
node test/site-structure.test.cjs
# After a complete release build (7-Zip inspects the NSIS payload):
SEVENZIP=/path/to/7z python3 test/release-artifacts.py
```

Use a disposable `-Duser.home=/path/to/test-home`. Network tests need loopback/
multicast socket permissions. `ShareCheck` exercises real TLS, wrong pins,
authentication, approval/rejection/revocation, resource limits and forbidden
operations. `ShareEditingCheck` exercises CRDT convergence, five simultaneous TLS
editors, UTF-16, server permissions, independent files, persistence, recovery,
external conflicts and DNS-SD parsing; a real interface discovery check explicitly
reports a skip when multicast is unavailable. JavaScript tests exercise varied
operation orders, idempotence, Unicode, anchors and large iterative traversal.

Optional Playwright/Chromium integration (test-only dependency):

```sh
JAVA_HOME=/path/to/jdk LARK_PLAYWRIGHT_PATH=/path/to/playwright \
  CHROMIUM_PATH=/path/to/chromium node test/share-browser.cjs
```

This launches two packaged jars in disposable homes and exercises real main-editor
concurrent editing, undo/redo, offline reentry, presence, multiple files, follow,
roles, host disk persistence, stale-save and execution guards, revocation, shutdown,
responsive dialogs and browser errors. No source changes are simulated by a UI mock.

## Validation limits

Linux/loopback integration and a real local-interface multicast roundtrip do not
prove communication between two physical Windows installations. Windows/macOS
installers and launchers are cross-built, not executed on those operating systems.
Real multi-machine firewall behavior, Wi-Fi isolation, VPN routing, long-running
LAN performance and accessibility across all OS/browser combinations still need
platform acceptance testing. Interactive debugger/JUnit/GitHub workflows have
existing regression checks where available but were not all exercised manually.
