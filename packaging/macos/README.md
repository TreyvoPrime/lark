# Mac distribution

The existing shell-launcher ZIP is unsigned. This pipeline creates a native
Lark.app using jpackage and retains the complete JDK for javac/jdb/keytool.
It does not remove quarantine or disable Gatekeeper.

On a Mac with Xcode command-line tools and JDK 21+, run:

    bash packaging/macos/build-app.sh
    python3 test/mac-app-smoke.py

Without signing credentials this produces only an unsigned development app.
Build separately on Intel and Apple Silicon to obtain native packages for each;
macos-latest builds only the hosted runner's architecture. Do not label it universal.

## Apple setup (required before public signed distribution)

Enroll in the Apple Developer Program and create a Developer ID Application
certificate with its private key. Export it as a password-protected .p12.
Create a notarization-capable App Store Connect team API key (.p8, key ID, issuer).
Add these repository/environment **secrets**, never commit or paste private keys:

- APPLE_DEVELOPER_ID_P12_BASE64
- APPLE_DEVELOPER_ID_P12_PASSWORD
- APPLE_DEVELOPER_ID_NAME — exact user/team portion after `Developer ID Application: `
- APPLE_NOTARY_P8_BASE64
- APPLE_NOTARY_KEY_ID
- APPLE_NOTARY_ISSUER_ID

Run `macOS app and notarization` manually with `notarize=true`. The workflow
imports a temporary signing keychain, signs with jpackage, runs the native app
and an actual Java compilation/run, checks the bundle stayed unchanged,
requires Apple's Accepted status, staples/validates the app, builds/signs a DMG,
notarizes and staples that DMG, and checks Gatekeeper assessment. It also exports
a ZIP of the stapled app and SHA-256 checksums. Missing credentials or rejected
notarization fails the job. Unsigned PR builds are explicitly development-only.

Review artifacts and install from a fresh download on a Gatekeeper-enabled Mac
before replacing public downloads. The workflow does not publish assets or alter
existing 4.0.5 downloads automatically. The existing release remains unsigned
until a signed/notarized replacement has actually passed these checks.

## Updates

The native app uses `lark.macos.signedBundle=true`. Startup launcher refresh and
in-place JAR updates are disabled for this distribution because modifying files
inside Lark.app invalidates the Apple signature. Checking releases still works;
install a new signed DMG by quitting Lark and replacing Lark.app. Workspace data
continues to live outside the application in the existing Lark home directory.

This pipeline must be executed and validated on macOS. Linux shell syntax checks
and Java tests do not establish successful code signing, notarization or launch.
