# Lark Share: milestone 1 — secure source review

This is a working **read-only LAN source-snapshot milestone**, not the completed
real-time collaboration feature. It establishes the isolated transport and session
management needed before introducing collaborative document writes. Desktop,
Executable and portable desktop UIs expose it under **Share**. Mobile's existing
LAN API is unchanged; paired phones cannot control Share or retrieve invitations.

## Host and join

1. Save the project. Click **Share → Host Session**. Select the project, session
   name, your display name and a local LAN interface. `127.0.0.1` is only useful
   for testing two installations on the same computer. Port `0` selects a free
   port; specify a fixed port if managing firewall rules.
2. Click **Host read-only session**. Share snapshots existing Java source files.
   Later local changes do not update the snapshot. End and rehost to refresh it.
3. Send the private invitation to the intended person over a trusted channel.
   Verify the displayed SHA-256 fingerprint directly with the host. The invitation
   contains the numeric host address, port, session ID, certificate fingerprint
   and secret. Treat it as a credential, not a public discovery announcement.
   Reopen **Invitation** to copy it again. No browser certificate exception is needed.
4. On another Lark installation, select **Share → Join Session**, paste the
   invitation, enter a display name, and confirm that you verified the host.
5. The host opens **Participants**, then **Approve as Viewer** or **Reject**.
   Display names are self-chosen, not verified personal identities: confirm the
   request with the intended person before approval. Nothing is readable before
   approval. A display name alone never grants access.
6. The viewer opens **Shared Source** and selects a file. This is a separate,
   read-only source view; it cannot trigger the host's run, build, debugger or terminal.
7. The host can **Revoke access** immediately or **End Session** to invalidate all
   invitations and devices. A viewer can **Leave Session**. Already received text
   cannot be retracted from a device.

Allow the selected TCP port through the OS firewall only for the intended private
network if necessary. Share never modifies the firewall, uses plaintext fallback,
contacts a cloud service, or requires GitHub. Manual invitations work without
Internet access. The current UI lists IPv4 interfaces. Address changes require a
new session/invitation. Discovery is deliberately not advertised as available.

## Architecture and boundaries

- `Share.java`: each existing local `Server` owns an inactive-until-used Share
  bridge. `/api/share` requires POST, the existing `X-Lark: 1`/Origin/Host defenses,
  and a loopback peer even in Mobile LAN mode. It does not forward arbitrary URLs
  or API methods. Invitation decoding has bounded UTF-8/JSON parsing.
- `ShareTransport.java`: a **separate TLS 1.3 server** bound to exactly the selected
  local interface. Length-prefixed UTF-8 JSON protocol version 1 exposes only
  `join`, `poll`, `files`, `read`, `leave`. Unsupported actions fail closed.
  Java-to-Java connections pin the full SHA-256 leaf certificate before sending
  any invitation or device credential; there is no trust-all verifier. The
  fingerprint comes from the invitation independently verified by the user.
- `ShareSession.java`: 256-bit random session, invitation and device credentials.
  Every join requires host approval, with Viewer as the **only implemented role**.
  Rejected/revoked credentials cannot regain access. Reconnection uses the same
  approved credential and pinned identity; it never silently creates a new join.
  Unknown devices, sessions, versions and unauthorized source paths are denied.
- No peer path becomes a filesystem read: only exact catalog keys are served
  from the immutable in-memory snapshot. Hidden paths, symbolic links and
  build/dist/target/node_modules trees are excluded. Source catalog paths are
  limited to 240 UTF-8 bytes and exclude control characters and ambiguous separators. Snapshot capture uses
  `SecureDirectoryStream` against ancestor replacement on supporting systems;
  other providers check canonical containment and components and open leaves
  with `NOFOLLOW_LINKS`. Concurrent hostile changes by a process on the host are
  outside this milestone's local trust boundary, particularly on Windows.
- Limits: 1,000 source files, 96 KiB/file, 16 MiB/session, 32 device requests per
  session (including rejected/revoked requests), 16 KiB request frames, 768 KiB
  response frames, nesting depth 16, 120 connection attempts/IP/minute with a
  bounded 256-entry limiter, eight simultaneous TLS workers, five-second socket
  timeouts and eight-second absolute connection deadlines. Session expiration
  is 30 minutes without approved-peer activity or host approval activity, or eight
  hours maximum. Pending requests cannot prolong a session. End/rehost to reset
  the device-request limit. This bounds resources; it is not a guarantee against
  hostile LAN denial-of-service or a distributed connection flood.
- Socket, scheduler and snapshot state are released on session end, expiration,
  and normal application shutdown. Client deadline workers expire when idle.
  Guest credentials are held in the local Java process only. No identities or
  trusted devices survive process restart. Failed connections retain the pinned
  target for retry; **Leave Session** clears it. No unsaved edits exist in this mode.

## Dependencies and packaging

No third-party libraries or package manager changes. Uses JDK 17+ JSSE, standard
Java sockets and the existing JSON implementation. Session certificate/key pairs
are generated with the running JDK's `bin/keytool[.exe]`, loaded into memory, then
removed from the temporary directory. The directory has owner-only permissions
on POSIX and inherits the local account's permissions on Windows. Normal cleanup
removes it; abnormal process termination during generation can leave temporary
identity files under `~/.lark/share/identity-*`. They belong only to an expired
process/session and may be deleted when no Share session is starting.

Existing `package.sh` already includes all `src` classes and `web` assets in
`dist/lark.jar`, and installed editions and updates carry that jar. Portable JDK
fetching now explicitly checks for `keytool`, which the existing full-JDK payloads
retain. Cached old JDKs must also contain it. A missing/broken keytool fails hosting
closed; no fallback identity is accepted. No installer binaries were rebuilt here.

## Validation

From the repository root, with JDK 17+ and Node on PATH:

```sh
./package.sh
javac --release 17 -encoding UTF-8 -cp build -d build \
  test/ShareCheck.java test/Check.java test/FlowCheck.java test/GitHubAuthCheck.java
java -cp build lark.ShareCheck
java -cp build lark.Check
java -cp build lark.FlowCheck
java -cp build lark.GitHubAuthCheck
node --check web/js/share.js
node test/java-parse.test.js
node test/site-releases.test.cjs
node test/site-structure.test.cjs
```

Use a disposable `-Duser.home=/path/to/test-home` for Java checks. `ShareCheck`
requires permission to bind loopback sockets. It exercises real TLS with five
concurrent viewers, wrong pins, authentication and approval denial, rejection,
revocation, reconnect, source/path boundaries, immutable snapshots, expiry,
unsupported execution/write commands, flooding, frame/nesting limits, shutdown,
protocol mismatch and jar inclusion.

Optional browser integration (Playwright is a **test-only** dependency, not bundled):

```sh
JAVA_HOME=/path/to/jdk LARK_PLAYWRIGHT_PATH=/path/to/playwright \
  CHROMIUM_PATH=/path/to/chromium node test/share-browser.cjs
```

This launches two packaged jars in separate disposable homes and exercises the
actual host/join/approval/view/revoke/end UI, loopback bridge restrictions,
cross-origin and oversized request denial, responsive dialog and script errors.
It requires Chromium process and socket permissions. Temporary instances and
homes are cleaned up by the test. Windows installers and physical LAN discovery
cannot be inferred from these Linux/loopback results.

## Remaining milestones — not implemented

1. LAN discovery using mDNS/DNS-SD and selected-interface lifecycle, with public
   metadata only; nearby-session UI and physical-network validation.
2. Collaborative documents (Yjs/CodeMirror 5 binding or equivalent), Editor role
   enforced by Java, host editor and autosave integration, concurrent convergence,
   undo, stable selections, live cursors, avatars, Explorer and follow controls.
3. Authoritative disk persistence, recoverable offline operations, external-file
   change detection, crash recovery and review/confirmation before the host runs
   collaborator-modified code. Existing local recovery/saving is untouched here.
4. Trusted-device reentry, editable host security policy and expiration settings,
   connection-state polish, adversarial synchronization tests, and performance
   measurement for three to five simultaneous editors.
5. Two physical Windows installations, all editions, cross-platform installers,
   updater lifecycle and regression coverage of interactive debugging/JUnit/GitHub.

Do not market this milestone as real-time editing or full Lark Share completion.
